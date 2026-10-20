"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createFetchStub, createAdminSession, loadAdminConfig, getSetCookies, getCookieValue } = require("./admin-route-helpers");
const { hashPassword } = require("../lib/admin-auth");
const crypto = require("node:crypto");

test("profitability is private by account, has narrow audited writes, and does not mutate the underlying order", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-profit-http-"));
  const key = "test-only-assistant-finance-key-1234567890";
  const users = [
    { id: "tonya", role: "admin" }, { id: "nastya", role: "admin" }, { id: "other-admin", role: "admin" },
    { id: "ramina", role: "manager" }, { id: "eva", role: "viewer" }, { id: "cleaner", role: "cleaner" },
  ].map(user => ({ ...user, status: "active", email: `${user.id}@example.test`, staffId: `staff-${user.id}`, passwordHash: hashPassword("LocalTest123!"), emailVerificationRequired: false }));
  const env = { ADMIN_MASTER_SECRET: "profit-test-secret", PROFITABILITY_ENABLED: "1", PROFITABILITY_ALLOWED_USER_IDS: "tonya,nastya",
    PROFITABILITY_ASSISTANT_KEY_SHA256: crypto.createHash("sha256").update(key).digest("hex"),
    ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS: "100", ADMIN_USERS_STORE_PATH: path.join(root, "users.json"),
    ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json"), PROFITABILITY_STORE_PATH: path.join(root, "private-finances.json"),
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GHL_API_KEY: "", GHL_LOCATION_ID: "" };
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH, JSON.stringify({ version: 1, users }));
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: users.map(user => ({ id: user.staffId, name: user.id, status: "active", role: user.role })), assignments: [] }));
  const app = await startServer({ env });
  const post = (route, cookie, body) => fetch(app.baseUrl + route, { method: "POST", redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const get = (route, cookie) => fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie } });
  try {
    const owner = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const login = async user => {
      const result = await post("/admin/login", "", { email: user.email, password: "LocalTest123!" });
      assert.equal(result.status, 303);
      const value = getCookieValue(getSetCookies(result), "shynli_user_session");
      assert.ok(value);
      return `shynli_user_session=${value}`;
    };
    for (const user of users) {
      const cookie = await login(user);
      const allowed = ["tonya", "nastya"].includes(user.id);
      for (const route of ["/admin/profitability", "/admin/profitability?view=summary", "/admin/profitability?format=csv", "/admin/profitability?history=anything", "/admin/profitability/api"]) {
        const result = await get(route, cookie);
        assert.equal(result.status, allowed ? route.includes("history=") || route.endsWith("/api") ? 404 : 200 : 403, `${user.id} ${route}`);
      }
      if (["admin", "manager", "viewer"].includes(user.role)) {
        const html = await (await get("/admin/orders", cookie)).text();
        if (allowed) assert.match(html, /href="\/admin\/profitability"/);
        else assert.doesNotMatch(html, /href="\/admin\/profitability"/);
        assert.doesNotMatch(html, /paidCents|payoutTotalCents|data-profit-row/);
      }
      if (!allowed) assert.equal((await post("/admin/profitability", cookie, { action: "settings", version: "0", supplies: "0", fuel: "0", cardFee: "0" })).status, 403);
    }
    const missingSource = await post("/admin/orders", owner, { action: "create-manual-order", customerName: "Profit QA", customerPhone: "6305550101", fullAddress: "100 Test Street", totalPrice: "250" });
    assert.match(missingSource.headers.get("location") || "", /source-required/);
    const created = await post("/admin/orders", owner, { action: "create-manual-order", customerName: "Profit QA", customerPhone: "6305550101", fullAddress: "100 Test Street", totalPrice: "250", acquisitionSource: "referral", selectedDate: "2099-11-20", selectedTime: "09:00" });
    assert.equal(created.status, 303);
    const id = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order");
    assert.ok(id, await created.text());
    const orderUrl = `/admin/orders?fragment=order-dialog&order=${id}`;
    const before = await (await get(orderUrl, owner)).text();
    assert.match(before, /\$250\.00/);
    const patch = (value, version) => fetch(app.baseUrl + "/admin/profitability/api", { method: "PATCH",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ entryId: id, version, patch: value }) });
    const result = await patch({ paidCents: 20000, source: "thumbtack", payouts: [] }, 0);
    assert.equal(result.status, 200, await result.clone().text());
    const json = await result.json();
    assert.equal(json.version, 1);
    assert.equal(json.metrics, undefined, "assistant cannot read company profit");
    const allowedRead = await fetch(app.baseUrl + `/admin/profitability/api?entryId=${id}`, { headers: { authorization: `Bearer ${key}` } });
    assert.equal(allowedRead.status, 200);
    const allowedFields = await allowedRead.json();
    assert.deepEqual(Object.keys(allowedFields.fields).sort(), ["paidAt", "paidCents", "paymentMethod", "payouts", "source"]);
    assert.equal(allowedFields.fields.paidCents, 20000);
    assert.equal((await patch({ paidCents: 10000 }, 0)).status, 409);
    assert.equal((await patch({ totalPrice: 10000 }, 1)).status, 400);
    assert.equal((await get("/admin/profitability/api", "")).status, 403);
    for (const route of ["/admin/orders", "/admin/clients", "/admin/settings", "/admin/staff", "/admin/payroll", "/admin/quote-ops"]) {
      const forbidden = await fetch(app.baseUrl + route, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: "{}", redirect: "manual" });
      assert.equal(forbidden.status, 403, route);
    }
    const after = await (await get(orderUrl, owner)).text();
    assert.equal(after, before, "financial edits do not change order price, team, calendar, payment state, or reminders");
    const finances = JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH, "utf8"));
    assert.equal(finances.events.length, 1);
    assert.equal(finances.events[0].actor.id, "assistant:eva");
    const fullUpdate = await post("/admin/profitability", owner, { action: "update", entryId: id, version: "1",
      source: "thumbtack", paidAmount: "200", leadCost: "10", addons: "20", discount: "5", paidAt: "2026-10-20",
      paymentMethod: "invoice", tips: "30", tipsPassed: "yes", actualHours: "2.5", comment: "Финансовый комментарий" });
    assert.equal(fullUpdate.status, 303);
    assert.equal(await (await get(orderUrl, owner)).text(), before, "all new financial fields remain isolated from the actual order");
    const fullFinance = JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH, "utf8"));
    assert.equal(fullFinance.events.length, 2);
    assert.deepEqual(fullFinance.records[id].data, { paidCents: 20000, source: "thumbtack", payouts: [], leadCostCents: 1000,
      addonsCents: 2000, discountCents: 500, paidAt: "2026-10-20", paymentMethod: "invoice", tipsCents: 3000,
      tipsPassed: true, actualMinutes: 150, comment: "Финансовый комментарий" });
    assert.equal(fullFinance.events[1].actor.id, "legacy-admin");
    const history = await (await get(`/admin/profitability?history=${id}`, owner)).text();
    for (const label of ["Финансовый комментарий", "Стоимость лида", "Допы", "Скидка", "Чаевые", "Invoice (карта)"]) assert.ok(history.includes(label));
    const manager = await login(users.find(user => user.id === "ramina"));
    assert.doesNotMatch(await (await get(orderUrl, manager)).text(), /paidCents|thumbtack|payoutTotal|profitCents/);
    const importPreview = await post("/admin/profitability", owner, { action: "preview-import", csv: `ID заказа,источник\n${id},Google LSA` });
    assert.equal(importPreview.status, 200);
    assert.match(await importPreview.text(), /Проверка импорта/);
    assert.equal(JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH, "utf8")).events.length, 2);
    const repeat = await post("/admin/orders", owner, { action: "create-manual-order", customerName: "Profit QA", customerPhone: "6305550101", fullAddress: "100 Test Street", totalPrice: "280", selectedDate: "2099-12-20", selectedTime: "09:00" });
    assert.equal(repeat.status, 303);
    assert.doesNotMatch(repeat.headers.get("location") || "", /source-required|failed|invalid/);
    const repeatId = new URL(repeat.headers.get("location"), app.baseUrl).searchParams.get("order");
    assert.ok(repeatId);
    const repeatPage = await (await get("/admin/orders", owner)).text();
    assert.match(repeatPage, /"acquisitionSource":"thumbtack"/);
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});

test("finance storage failures do not hide or disable the ordinary Orders page", async () => {
  const row = { id: "10000000-0000-4000-8000-000000000001", kind: "quote_submission", status: "success", customer_name: "Still Visible Order",
    customer_phone: "6305550199", request_id: "still-visible", total_price: 534, created_at: "2026-10-01T12:00:00Z",
    payload_for_retry: { orderState: { isCreated: true, status: "new", assignedStaff: "Cleaner A" }, calculatorData: { acquisitionSource: "website" } } };
  const stub = createFetchStub([
    { method: "GET", match: "/rest/v1/profitability_records", status: 503, body: { message: "Finance offline" } },
    { method: "GET", match: "/rest/v1/quote_ops_entries", body: [row] },
    { method: "GET", match: "/rest/v1/", body: [] },
  ]);
  const env = { ADMIN_MASTER_SECRET: "isolated-finance-failure", PROFITABILITY_ENABLED: "1", SUPABASE_URL: "https://finance-offline-test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const app = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const response = await fetch(app.baseUrl + "/admin/orders", { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Still Visible Order/);
    assert.match(html, /\$534\.00/);
    assert.match(html, /Cleaner A/);
    assert.equal((await fetch(app.baseUrl + "/admin/profitability", { headers: { cookie } })).status, 503);
    const calls = (await fs.readFile(stub.captureFile, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.ok(calls.every(call => call.method === "GET"));
  } finally { await stopServer(app.child); stub.cleanup(); }
});
