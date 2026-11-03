"use strict";

const vm = require("node:vm");
const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig, getSetCookies, getCookieValue } = require("./admin-route-helpers");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { hashPassword } = require("../lib/admin-auth");
const engine = require("../js/cleaning-pricing");
const domain = createAdminDomainHelpers({ normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max) });

function visit(duration = 210) {
  const state = { isCreated: true, status: "scheduled", selectedDate: "2099-03-04", selectedTime: "13:00",
    serviceDurationMinutes: duration, assignedStaff: "", payrollOverrides: { a: "140.00" },
    payroll: { status: "paid", paidAmount: 140, paidAt: "2026-10-29" },
    recurringSeriesId: "retained-series", recurringAnchorDate: "2099-03-04", frequency: "biweekly" };
  return { id: "local-duration-only", kind: "quote_submission", customerName: "Duration Test", serviceType: "standard",
    totalPrice: 180, totalPriceCents: 18000, selectedDate: state.selectedDate, selectedTime: state.selectedTime,
    payloadForRetry: { orderState: state, calculatorData: { fullPriceBeforeDiscount: 180, serviceDurationMinutes: duration,
      selectedDate: state.selectedDate, selectedTime: state.selectedTime, additionalDetails: "Keep instructions" },
    adminSms: { history: [{ id: "old-message", message: "Keep history", sentAt: "2026-10-29T12:00:00.000Z", phone: "", contactId: "", channel: "ghl",
      direction: "outbound", source: "manual", targetType: "", targetRef: "", conversationId: "", messageId: "", status: "sent", errorCode: "", errorMessage: "", recipientName: "", recipientRole: "", readAt: "" }] } } };
}

test("existing durations survive team assignment, replacement, reordering, clearing and quote price recalculation", () => {
  for (const updates of [{ assignedStaff: "Cleaner A" }, { assignedStaff: "Cleaner B" },
    { assignedStaff: "Cleaner A, Cleaner B" }, { assignedStaff: "Cleaner B, Cleaner A" }, { assignedStaff: "" },
    { fullPriceBeforeDiscount: 540 }, { quoteCalculatorData: { rooms: "5" }, fullPriceBeforeDiscount: 540 }]) {
    const entry = visit();
    const before = structuredClone(entry);
    domain.applyOrderEntryUpdates(entry, updates);
    const state = getEntryOrderState(entry);
    assert.equal(state.serviceDurationMinutes, 210, JSON.stringify(updates));
    assert.equal(entry.payloadForRetry.calculatorData.serviceDurationMinutes, 210);
    for (const field of ["totalPrice", "totalPriceCents", "selectedDate", "selectedTime"]) assert.equal(entry[field], before[field], field);
    for (const field of ["payrollOverrides", "payroll", "recurringSeriesId", "recurringAnchorDate", "frequency"]) assert.deepEqual(state[field], before.payloadForRetry.orderState[field], field);
    assert.deepEqual(entry.payloadForRetry.adminSms.history, before.payloadForRetry.adminSms.history);
  }
  const missing = visit(0);
  domain.applyOrderEntryUpdates(missing, { assignedStaff: "Cleaner A" });
  assert.equal(getEntryOrderState(missing).serviceDurationMinutes, 0, "an existing unestimated visit must not change silently");
  const explicit = visit();
  domain.applyOrderEntryUpdates(explicit, { assignedStaff: "Cleaner A", serviceDurationMinutes: 270 });
  assert.equal(getEntryOrderState(explicit).serviceDurationMinutes, 270);
});

test("initial order estimates remain available without recalculating an established planned time", () => {
  const entry = { id: "new-only", kind: "quote_submission", serviceType: "standard", totalPrice: 180, payloadForRetry: {} };
  domain.applyOrderEntryUpdates(entry, { createOrder: true, assignedStaff: "Cleaner A" });
  assert.equal(getEntryOrderState(entry).serviceDurationMinutes, engine.calculateCleaningDuration(180, 1).serviceDurationMinutes);
});

test("admin quote script has no duration recalculation command or duration field writes", async () => {
  const script = await fs.readFile(path.join(__dirname, "../js/admin-quote-pricing.js"), "utf8");
  assert.doesNotMatch(script, /calculateCleaningDuration|serviceDurationHours|serviceDurationMinutes|data-admin-recalculate-order-duration/);
  const handlers = {};
  vm.runInNewContext(script, { window: { ShynliPricing: engine }, document: { addEventListener: (name, handler) => { handlers[name] = handler; } } });
  assert.deepEqual(Object.keys(handlers).sort(), ["change", "input"]);
  for (const handler of Object.values(handlers)) handler({ target: { name: "assignedStaff", closest: () => null } });
});

test("card and calendar assignment preserve duration, while explicit manager saves are audited and other roles cannot write", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-duration-guard-"));
  const password = "DurationLocalTest123!";
  const env = { ADMIN_MASTER_SECRET: "local-duration-guard", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json"), ADMIN_USERS_STORE_PATH: path.join(root, "users.json"),
    ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl"), ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS: "50" };
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: ["a", "b"].map(id => ({ id, name: `Cleaner ${id.toUpperCase()}`, role: "cleaner", status: "active", compensationType: "percent", compensationValue: "50" })), assignments: [] }));
  const users = [{ id: "manager", role: "manager" }, { id: "viewer", role: "viewer" }, { id: "cleaner", role: "cleaner", staffId: "a" }]
    .map(user => ({ ...user, staffId: user.staffId || `staff-${user.id}`, email: `${user.id}@example.test`, name: user.id, status: "active", passwordHash: hashPassword(password), emailVerificationRequired: false }));
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH, JSON.stringify({ version: 1, users }));
  const app = await startServer({ env });
  const post = (route, cookie, fields) => fetch(app.baseUrl + route, { method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
  const get = async (route, cookie) => { const response = await fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie } }); assert.equal(response.status, 200, route); return response.text(); };
  const inputValue = (html, name) => html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*value="([^"]*)"`))?.[1];
  try {
    const owner = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const cookies = {};
    for (const user of users) {
      const login = await post(user.role === "cleaner" ? "/account/login" : "/admin/login", "", { email: user.email, password });
      assert.equal(login.status, 303, `Login ${user.id}`);
      cookies[user.id] = `shynli_user_session=${getCookieValue(getSetCookies(login), "shynli_user_session")}`;
    }
    const created = await post("/admin/orders", owner, { action: "create-manual-order", customerName: "Duration Guard TEST", customerPhone: "6305550174",
      fullAddress: "100 Test Street", serviceType: "standard", totalPrice: "180", selectedDate: "2099-03-04", selectedTime: "13:00",
      serviceDurationHours: "3", serviceDurationMinutes: "30" });
    const id = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order"); assert.ok(id);
    const route = `/admin/orders?fragment=order-dialog&order=${id}`;
    const assertVisit = async (hours = "3", minutes = "30") => {
      const html = await get(route, owner);
      assert.equal(inputValue(html, "serviceDurationHours"), hours);
      assert.equal(inputValue(html, "serviceDurationMinutes"), minutes);
      assert.equal(inputValue(html, "totalPrice"), "180.00");
      assert.match(html, /2099-03-04/); assert.match(html, /value="13:00"/);
      return html;
    };
    for (const team of [["Cleaner A"], ["Cleaner A", "Cleaner B"], ["Cleaner B"], ["Cleaner B"], []]) {
      const fields = [["entryId", id], ["action", "update-order"], ["orderStatus", "scheduled"], ...team.map(name => ["assignedStaff", name])];
      if (!team.length) fields.push(["assignedStaff", ""]);
      assert.equal((await post("/admin/orders", cookies.manager, fields)).status, 303);
      await assertVisit();
    }
    for (const staffId of ["a", "b", "b"]) {
      const assigned = await post("/admin/staff", owner, { action: "save-assignment", entryId: id, staffIds: staffId, scheduleDate: "2099-03-04", scheduleTime: "13:00", status: "confirmed" });
      assert.equal(assigned.status, 303); assert.doesNotMatch(assigned.headers.get("location"), /failed|conflict/);
      await assertVisit();
    }
    const html = await assertVisit();
    assert.doesNotMatch(html, /data-admin-recalculate-order-duration|Пересчитать длительность/);
    const beforeRead = await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8");
    await get(route, owner);
    assert.equal(await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8"), beforeRead);
    const saved = await post("/admin/orders", cookies.manager, { entryId: id, action: "update-order", serviceDurationHours: "4", serviceDurationMinutes: "30" });
    assert.equal(saved.status, 303); await assertVisit("4", "30");
    const audit = (await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8")).trim().split("\n").map(JSON.parse);
    const durationChanges = audit.flatMap(event => (event.changes || []).filter(change => change.field === "serviceDurationMinutes").map(change => ({ ...change, actor: event.actor })));
    assert.equal(durationChanges.filter(change => change.old === 210 && change.new === 270).length, 1);
    assert.equal(durationChanges.find(change => change.old === 210 && change.new === 270).actor.id, "manager");
    assert.doesNotMatch(await get(route, cookies.viewer), /data-admin-recalculate-order-duration/);
    assert.equal((await post("/admin/orders", cookies.viewer, { entryId: id, serviceDurationHours: "1" })).status, 403);
    const cleanerWrite = await post("/admin/orders", cookies.cleaner, { entryId: id, serviceDurationHours: "1" });
    assert.equal(cleanerWrite.status, 303);
    assert.match(cleanerWrite.headers.get("location"), /^\/account/);
    await assertVisit("4", "30");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
