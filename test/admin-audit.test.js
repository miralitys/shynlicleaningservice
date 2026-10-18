"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createAdminAuditStore } = require("../lib/admin-audit-store");
const { createAuditedQuoteOpsLedger, runAuditContext, setAuditActor, snapshot } = require("../lib/admin-audit");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { chicagoMidnight, auditFilters, renderAuditPage } = require("../lib/admin/pages/audit-page");

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-audit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl") };
  const store = createAdminAuditStore({ env });
  const normalizeString = value => String(value || "").trim();
  const domain = createAdminDomainHelpers({ normalizeString });
  const raw = createQuoteOpsStore({ ...domain, normalizeString, QUOTE_OPS_LEDGER_LIMIT: 1000, env: {} });
  const warnings = [];
  return { env, store, raw, ledger: createAuditedQuoteOpsLedger(raw, store, event => warnings.push(event),
    { previewOrderUpdate: domain.applyOrderEntryUpdates }), warnings };
}

const submission = (name = "Audit QA", phone = "6305550101") => ({ customerName: name, customerPhone: phone,
  customerEmail: "audit@example.com", fullAddress: "123 Test St", totalPrice: 250,
  kind: "manual_order", requestId: `test-${name}`, serviceType: "deep", selectedDate: "2099-10-18", selectedTime: "10:00",
  payloadForRetry: { calculatorData: { rooms: 2, bathrooms: 1, squareMeters: 1300 } } });

function asManager(callback, name = "Ramina") {
  return runAuditContext({ method: "POST", route: "/admin/orders" }, () => {
    setAuditActor({ authorized: true, role: "manager", user: { id: `id-${name}`, email: `${name.toLowerCase()}@example.com`, name } });
    return callback();
  });
}

test("audit records client/order creation, price before/after, payment, and survives deleting the client", async t => {
  const { ledger, store, env } = await setup(t);
  const entry = await asManager(async () => {
    const entry = await ledger.recordSubmission(submission());
    await ledger.updateOrderEntry(entry.id, { createOrder: true, orderStatus: "scheduled" });
    await ledger.updateOrderEntry(entry.id, { totalPrice: 534 });
    await ledger.recordPaymentEvent(entry.requestId, { status: "paid", method: "invoice" });
    await ledger.updateClientEntry(entry.id, { name: "Audit Renamed", addressBook: [{ address: "123 Test St", roomCount: "4" }] });
    return entry;
  });
  let events = await store.list();
  assert.ok(events.every(event => event.status === "succeeded"));
  assert.equal(events.filter(event => event.action === "create" && event.entity_type === "client").length, 1);
  assert.equal(events.filter(event => event.action === "create" && event.entity_type === "order").length, 1);
  const price = events.find(event => event.action === "update" && event.changes.some(change => change.field === "totalPrice"));
  assert.deepEqual(price.changes.find(change => change.field === "totalPrice"), { field: "totalPrice", old: 250, new: 534 });
  assert.equal(price.actor.email, "ramina@example.com");
  assert.equal(price.entity_id, entry.id);
  assert.equal(price.route, "/admin/orders");
  assert.ok(events.some(event => event.changes.some(change => change.field === "paymentStatus" && change.new === "paid")));
  await asManager(() => ledger.deleteEntry(entry.id));
  assert.equal(await ledger.getEntry(entry.id), null);
  events = await createAdminAuditStore({ env }).list();
  assert.equal(events.filter(event => event.action === "delete" && event.entity_type === "client").length, 1);
  assert.equal(events.filter(event => event.action === "delete" && event.entity_type === "order").length, 1);
  assert.ok(events.some(event => event.id === price.id));
  assert.equal((await fs.stat(env.ADMIN_AUDIT_STORE_PATH)).mode & 0o777, 0o600);
});

test("client updates across linked orders are individually audited; service records stay out", async t => {
  const { ledger, store } = await setup(t);
  await asManager(async () => {
    const a = await ledger.recordSubmission(submission());
    const b = await ledger.recordSubmission({ ...submission(), requestId: "second" });
    await ledger.updateClientEntry(a.id, { name: "Updated name" });
    await ledger.updateClientEntry(b.id, { name: "Updated name" });
    await ledger.recordSubmission({ ...submission("System"), kind: "admin_user_account" });
  });
  const events = await store.list();
  assert.equal(events.length, 3);
  assert.equal(events.filter(event => event.action === "update").length, 2);
  assert.equal(new Set(events.filter(event => event.action === "update").map(event => event.entry_id)).size, 2);
});

test("conversion of a request creates an order audit, and removing just its order preserves the client", async t => {
  const { ledger, store } = await setup(t);
  await asManager(async () => {
    const entry = await ledger.recordSubmission(submission());
    await ledger.updateLeadEntry(entry.id, { status: "confirmed" });
    await ledger.updateOrderEntry(entry.id, { removeOrder: true });
    assert.ok(await ledger.getEntry(entry.id));
  });
  const events = await store.list();
  assert.equal(events.filter(event => event.entity_type === "order" && event.action === "create").length, 1);
  assert.equal(events.filter(event => event.entity_type === "order" && event.action === "delete").length, 1);
  assert.equal(events.filter(event => event.entity_type === "client" && event.action === "delete").length, 0);
});

test("deleting one of several request records does not falsely report deletion of the customer", async t => {
  const { ledger, store } = await setup(t);
  await asManager(async () => {
    const a = await ledger.recordSubmission(submission());
    const b = await ledger.recordSubmission({ ...submission(), requestId: "another-request" });
    await ledger.deleteEntry(a.id);
    assert.equal((await store.list({ action: "delete" })).length, 0);
    await ledger.deleteEntry(b.id);
  });
  const events = await store.list({ action: "delete" });
  assert.equal(events.length, 1);
  assert.equal(events[0].entity_type, "client");
});

test("a submission already containing an order records creation of both the new customer and order", async t => {
  const { ledger, store } = await setup(t);
  const input = submission();
  input.payloadForRetry.orderState = { isCreated: true, status: "scheduled" };
  const entry = await asManager(() => ledger.recordSubmission(input));
  const events = await store.list();
  assert.deepEqual(events.map(event => event.entity_type).sort(), ["client", "order"]);
  assert.ok(events.every(event => event.action === "create" && event.status === "succeeded" && event.entry_id === entry.id));
});

test("concurrent requests retain their own personal actors; GET background changes are system, not the visiting manager", async t => {
  const { ledger, store } = await setup(t);
  const a = await ledger.recordSubmission(submission("A", "6305550101"));
  const b = await ledger.recordSubmission(submission("B", "6305550102"));
  await Promise.all([
    asManager(async () => { await new Promise(resolve => setTimeout(resolve, 20)); await ledger.updateOrderEntry(a.id, { totalPrice: 300 }); }, "Alice"),
    asManager(() => ledger.updateOrderEntry(b.id, { totalPrice: 400 }), "Bob"),
  ]);
  await runAuditContext({ method: "GET", route: "/admin/orders" }, async () => {
    setAuditActor({ authorized: true, role: "manager", user: { id: "visitor", name: "Visitor" } });
    await ledger.updateOrderEntry(a.id, { totalPrice: 350 });
  });
  await runAuditContext({ method: "POST", route: "/admin/orders" }, async () => {
    setAuditActor({ authorized: true, role: "admin", source: "admin-session" }, "shared@example.com");
    await ledger.updateOrderEntry(b.id, { totalPrice: 450 });
  });
  const events = await store.list();
  assert.equal(events.find(event => event.after_data?.totalPrice === 300).actor.name, "Alice");
  assert.equal(events.find(event => event.after_data?.totalPrice === 400).actor.name, "Bob");
  assert.equal(events.find(event => event.after_data?.totalPrice === 350).actor.id, "system");
  assert.equal(events.find(event => event.after_data?.totalPrice === 450).actor.name, "Общий администратор");
});

test("unavailable journal blocks mutation before it starts; failed writes never appear as success", async t => {
  const { raw, store } = await setup(t);
  const entry = await raw.recordSubmission(submission());
  const ledger = createAuditedQuoteOpsLedger(raw, { begin: async () => { throw new Error("Audit offline"); } });
  await assert.rejects(ledger.updateOrderEntry(entry.id, { totalPrice: 999 }), /Audit offline/);
  assert.equal((await raw.getEntry(entry.id)).totalPrice, 250);
  const failing = createAuditedQuoteOpsLedger({ ...raw, updateOrderEntry: async () => { throw new Error("Write failed"); } }, store);
  await assert.rejects(failing.updateOrderEntry(entry.id, { totalPrice: 999 }), /Write failed/);
  assert.equal((await store.list())[0].status, "failed");
});

test("concurrent saves of one order log a continuous price history, not two stale old prices", async t => {
  const { raw, ledger, store } = await setup(t);
  const entry = await raw.recordSubmission(submission());
  await raw.updateOrderEntry(entry.id, { createOrder: true });
  await Promise.all([
    asManager(() => ledger.updateOrderEntry(entry.id, { totalPrice: 300 }), "Alice"),
    asManager(() => ledger.updateOrderEntry(entry.id, { totalPrice: 400 }), "Bob"),
  ]);
  const events = await store.list();
  const alice = events.find(event => event.actor.name === "Alice");
  const bob = events.find(event => event.actor.name === "Bob");
  assert.deepEqual(alice.changes.find(change => change.field === "totalPrice"), { field: "totalPrice", old: 250, new: 300 });
  assert.deepEqual(bob.changes.find(change => change.field === "totalPrice"), { field: "totalPrice", old: 300, new: 400 });
});

test("no-op saves stay out of the visible journal, and route tokens are never stored", async t => {
  const { raw, ledger, store } = await setup(t);
  const entry = await raw.recordSubmission(submission());
  await raw.updateOrderEntry(entry.id, { createOrder: true, totalPrice: 250 });
  await runAuditContext({ method: "POST", route: "/api/admin/policy-acceptance/private-token?secret=private" }, async () => {
    await ledger.updateOrderEntry(entry.id, { totalPrice: 250 });
    await ledger.updateOrderEntry(entry.id, { totalPrice: 300 });
  });
  const events = await store.list();
  assert.equal(events.length, 1);
  assert.equal(events[0].route, "/api/admin/policy-acceptance");
  assert.doesNotMatch(JSON.stringify(events), /private-token|secret=/);
  assert.equal((await store.list({ status: "noop" })).length, 1);
});

test("bookkeeping is skipped only if a pure preview confirms no business changes; unexpected repricing is audited", async t => {
  const { raw, ledger, store } = await setup(t);
  const entry = await raw.recordSubmission(submission());
  await raw.updateOrderEntry(entry.id, { createOrder: true });
  await ledger.updateOrderEntry(entry.id, { notifications: { test: true } });
  assert.equal((await store.list({ status: "noop" })).length, 0);
  assert.equal((await store.list()).length, 0);
  // Simulate old inconsistent stored data, without changing the production pricing logic.
  entry.payloadForRetry.calculatorData.totalPrice = 345;
  await ledger.updateOrderEntry(entry.id, { notifications: { test: true } });
  const [event] = await store.list();
  assert.deepEqual(event.changes.find(change => change.field === "totalPrice"), { field: "totalPrice", old: 250, new: 345 });
});

test("completion outage leaves persistent pending intent, without retrying the successful order write", async t => {
  const { raw, store, warnings } = await setup(t);
  const entry = await raw.recordSubmission(submission());
  const ledger = createAuditedQuoteOpsLedger(raw, { begin: store.begin, finish: async () => { throw new Error("Offline"); } }, event => warnings.push(event));
  assert.ok(await ledger.updateOrderEntry(entry.id, { totalPrice: 534 }));
  assert.equal((await raw.getEntry(entry.id)).totalPrice, 534);
  assert.equal((await store.list())[0].status, "pending");
  assert.equal(warnings[0].type, "admin_audit_completion_failed");
});

test("snapshots whitelist business data and do not include passwords, policy tokens, SMS bodies or file paths", () => {
  const entry = submission();
  entry.payloadForRetry.adminOrder = { status: "scheduled", policyAcceptance: { token: "secret-policy" },
    completion: { beforePhotos: [{ path: "/private/file" }] } };
  entry.payloadForRetry.adminSms = { history: [{ text: "private SMS" }] };
  entry.payloadForRetry.adminClient = { addressBook: [{ address: "123", token: "secret" }] };
  entry.payloadForRetry.password = "password-secret";
  const serialized = JSON.stringify(snapshot(entry, "order"));
  assert.doesNotMatch(serialized, /secret|private|token|password|policyAcceptance|history|\/file/);
  assert.match(serialized, /beforePhotosCount/);
});

test("audit dates use complete Chicago calendar days, including DST, and UI escapes values", async () => {
  assert.equal(chicagoMidnight("2026-10-17"), "2026-10-17T05:00:00.000Z");
  assert.equal(chicagoMidnight("2026-11-02"), "2026-11-02T06:00:00.000Z");
  assert.equal(chicagoMidnight("2026-02-30"), "");
  const filters = auditFilters(new URLSearchParams("from=2026-11-01&to=2026-11-01&offset=-5&status=invalid"));
  assert.equal(filters.start, "2026-11-01T05:00:00.000Z");
  assert.equal(filters.end, "2026-11-02T06:00:00.000Z");
  assert.equal(filters.offset, 0);
  assert.equal(filters.status, "");
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const html = await renderAuditPage({ list: async () => [{ id: "1", occurred_at: "2026-10-17T10:00:00Z",
    actor: { name: "<script>" }, entity_id: "1", entity_label: "<b>Client</b>", entity_type: "order", action: "update",
    status: "succeeded", changes: [{ field: "totalPrice", old: 250, new: 534 }] }] }, new URL("http://localhost/admin/audit"),
  { renderAdminLayout: (_, content) => content, renderAdminAppSidebar: () => "" }, escape, { role: "admin" });
  assert.match(html, /Сумма: \$250.00 → \$534.00/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<b>Client<\/b>/);
});

test("remote audit uses a separate table, retries transient errors, filters server-side and never deletes events", async () => {
  const requests = [];
  let failOnce = true;
  const store = createAdminAuditStore({ env: { SUPABASE_URL: "https://audit.example", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (failOnce) { failOnce = false; return new Response("", { status: 503 }); }
      return new Response(options.method === "GET" ? "[]" : "", { status: 200 });
    } });
  const event = await store.begin({ entity_type: "order", entity_id: "order-id" });
  await store.finish(event, { status: "succeeded", changes: [] });
  await store.list({ entityType: "order", actor: "ramina@example.com", start: "2026-10-17T05:00:00Z", end: "2026-10-18T05:00:00Z", q: "Harvey" });
  assert.equal(requests.length, 4);
  assert.ok(requests.every(req => new URL(req.url).pathname === "/rest/v1/admin_audit_events"));
  assert.ok(requests.every(req => req.options.headers.apikey === "sb_secret_test" && !req.options.headers.Authorization));
  assert.ok(requests.every(req => req.options.method !== "DELETE"));
  const query = new URL(requests.at(-1).url).searchParams;
  assert.deepEqual(query.getAll("occurred_at"), ["gte.2026-10-17T05:00:00Z", "lt.2026-10-18T05:00:00Z"]);
  assert.equal(query.get("actor->>email"), "eq.ramina@example.com");
  assert.equal(query.get("entity_label"), "ilike.*Harvey*");
});

test("missing remote schema never silently falls back to an ephemeral file or exposes server response secrets", async () => {
  let calls = 0;
  const store = createAdminAuditStore({ env: { SUPABASE_URL: "https://audit.example", SUPABASE_SERVICE_ROLE_KEY: "test-jwt" },
    fetch: async () => { calls += 1; return new Response("private response secret", { status: 404 }); } });
  await assert.rejects(store.begin({}), error => /schema migration/.test(error.message) && !/private response secret/.test(error.message));
  assert.equal(calls, 1);
});
