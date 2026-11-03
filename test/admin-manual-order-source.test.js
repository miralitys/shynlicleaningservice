"use strict";

const vm = require("node:vm");
const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { firstKnownOrderSource, resolveManualOrderClientSource } = require("../lib/admin/manual-order-source");
const { createOrdersUiPrimitives } = require("../lib/admin/pages/orders-ui-primitives");

function order(id, source, createdAt, phone = "6305550141") {
  return { id, kind: "quote_submission", customerName: "Local Source Test", customerPhone: phone, createdAt,
    fullAddress: "100 Test Street", totalPrice: 417, payloadForRetry: {
      orderState: { isCreated: true, status: "completed", selectedDate: "2026-01-01", assignedStaff: "Test Cleaner", payrollOverrides: { cleaner: 200 } },
      calculatorData: { acquisitionSource: source },
    } };
}

test("manual source uses the earliest known order, skips empty history, and never changes saved entries", () => {
  const entries = [order("latest", "google", "2026-10-01"), order("first-known", "referral", "2026-02-01"), order("old-unknown", "", "2026-01-01")];
  const original = JSON.stringify(entries);
  assert.equal(firstKnownOrderSource(entries), "referral");
  assert.equal(firstKnownOrderSource(entries, new Map([["first-known", "thumbtack"]])), "thumbtack");
  assert.equal(firstKnownOrderSource([order("bad", "invalid", "2025-01-01"), ...entries]), "referral");
  assert.equal(firstKnownOrderSource([order("empty", "", "2026-01-01")]), "");
  assert.equal(JSON.stringify(entries), original);
});

test("existing clients are verified from the ledger, including standalone clients and secondary phones", async () => {
  const entries = [order("old", "", "2026-01-01"), order("known", "referral", "2026-02-01"),
    { id: "standalone", kind: "client_record", customerName: "Standalone", customerPhone: "6305550142", payloadForRetry: { adminClient: { secondaryPhone: "6305550143" } } }];
  let ledgerReads = 0, financeReads = 0;
  const ledger = { listOrderListEntries: async () => { ledgerReads++; return entries; } };
  const finances = { listSources: async () => { financeReads++; return [{ id: "known", source: "nextdoor" }]; } };
  assert.deepEqual(await resolveManualOrderClientSource({ customerPhone: "+1 (630) 555-0141" }, ledger, finances), { existingClient: true, source: "nextdoor" });
  assert.equal(ledgerReads, 1);
  assert.equal(financeReads, 1, "one narrow source read, not one full finance read per historical order");
  for (const customerPhone of ["6305550142", "6305550143"]) {
    assert.deepEqual(await resolveManualOrderClientSource({ customerPhone }, ledger, finances), { existingClient: true, source: "" });
  }
  assert.equal(financeReads, 1, "a client without orders needs no financial read");
  assert.deepEqual(await resolveManualOrderClientSource({ customerPhone: "6305550199", selectedClientKey: "6305550142" }, ledger, finances), { existingClient: false, source: "" });
  assert.deepEqual(await resolveManualOrderClientSource({ customerPhone: "6305550141" }, ledger, { listSources: async () => { throw new Error("offline"); } }), { existingClient: true, source: "referral" });
  await assert.rejects(resolveManualOrderClientSource({}, { listOrderListEntries: async () => { throw new Error("incomplete read"); } }), /incomplete read/);
});

function clientLookupHarness(clients) {
  const events = new Map();
  const field = (value = "") => ({ value, addEventListener(name, handler) { events.set(this, { ...(events.get(this) || {}), [name]: handler }); } });
  const source = { value: "", required: true, options: [{ textContent: "Выберите источник" }] };
  const phone = field(), email = field(), key = field();
  const form = { elements: { customerPhone: phone, customerEmail: email, acquisitionSource: source } };
  const lookup = { closest: () => form, querySelector(selector) {
    if (selector === "[data-admin-manual-client-search]") return { addEventListener() {} };
    if (selector === "[data-admin-manual-client-suggestions]" || selector === "[data-admin-manual-client-selected]") return {};
    if (selector === "[data-admin-manual-client-data]") return { textContent: JSON.stringify(clients) };
    return selector === "[data-admin-manual-client-key]" ? key : null;
  } };
  const script = createOrdersUiPrimitives({ ADMIN_MANUAL_ORDER_DIALOG_ID: "manual-order-test" }).renderManualOrderRuntimeScript();
  const lookupScript = [...script.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(text => text.includes("__adminBindManualOrderClientLookup"));
  const document = { querySelector: () => lookup, addEventListener() {} };
  vm.runInNewContext(lookupScript, { window: {}, document });
  return { source, typePhone(value) { phone.value = value; events.get(phone).input(); } };
}

test("source control becomes optional only for an existing client and never carries another client's source", () => {
  const app = clientLookupHarness([{ key: "known", phone: "6305550141", acquisitionSource: "referral" }, { key: "old", phone: "6305550142", acquisitionSource: "" }]);
  assert.equal(app.source.required, true);
  app.typePhone("6305550141");
  assert.equal(app.source.value, "referral");
  assert.equal(app.source.required, false);
  app.typePhone("6305550142");
  assert.equal(app.source.value, "");
  assert.equal(app.source.required, false);
  assert.equal(app.source.options[0].textContent, "Неизвестен (старый клиент)");
  app.source.value = "nextdoor";
  app.typePhone("+1 (630) 555-0142");
  assert.equal(app.source.value, "nextdoor", "keep a choice for the same client");
  app.typePhone("6305550199");
  assert.equal(app.source.value, "");
  assert.equal(app.source.required, true);
});

test("manual creation permits an unknown source for saved clients, remembers the next known source, and preserves old orders", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-manual-source-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-manual-source-test", PROFITABILITY_ENABLED: "1", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_STORE_PATH: path.join(root, "finance.json"), ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl") };
  const app = await startServer({ env });
  const post = (route, cookie, values) => fetch(app.baseUrl + route, { method: "POST", redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
  const get = async (route, cookie) => { const response = await fetch(app.baseUrl + route, { headers: { cookie } }); assert.equal(response.status, 200); return response.text(); };
  const payload = html => JSON.parse(html.match(/<script type="application\/json" data-admin-manual-client-data>([\s\S]*?)<\/script>/)[1]);
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const input = { action: "create-manual-order", customerName: "Local Source Test", customerPhone: "6305550141", fullAddress: "100 Test Street", totalPrice: "417", selectedDate: "2099-01-01", selectedTime: "09:00" };
    for (const extra of [{}, { selectedClientKey: "forged" }, { acquisitionSource: "invalid" }]) {
      const result = await post("/admin/orders", cookie, { ...input, ...extra });
      assert.match(result.headers.get("location"), /source-required/);
    }
    await post("/admin/clients", cookie, { action: "create-client", name: input.customerName, phone: input.customerPhone, address: input.fullAddress });
    const prefilled = await get("/admin/orders?fragment=create-order-dialog&createClientKey=6305550141", cookie);
    const sourceTag = prefilled.match(/<select\b[^>]*name="acquisitionSource"[^>]*>/)[0];
    assert.doesNotMatch(sourceTag, /required/);
    assert.match(prefilled, /Неизвестен \(старый клиент\)/);
    const created = await post("/admin/orders", cookie, input);
    assert.match(created.headers.get("location"), /manual-order-created/);
    const firstId = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order");
    const detailPath = `/admin/orders?fragment=order-dialog&order=${firstId}`;
    const before = await get(detailPath, cookie);
    const chosen = await post("/admin/orders", cookie, { ...input, acquisitionSource: "referral", selectedDate: "2099-01-02" });
    assert.match(chosen.headers.get("location"), /manual-order-created/);
    const dialog = await get("/admin/orders?fragment=create-order-dialog", cookie);
    assert.equal(payload(dialog).find(client => client.phone === input.customerPhone).acquisitionSource, "referral");
    const repeated = await post("/admin/orders", cookie, { ...input, selectedDate: "2099-01-03" });
    assert.match(repeated.headers.get("location"), /manual-order-created/);
    assert.equal(await get(detailPath, cookie), before, "unknown historical orders are not rewritten when a source becomes known");
    const auditBefore = await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8");
    await get("/admin/orders?fragment=create-order-dialog", cookie);
    assert.equal(await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8"), auditBefore, "opening the form must not write history or orders");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
