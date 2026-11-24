"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig,
  hashPassword, getCookieValue, getSetCookies } = require("./admin-route-helpers");

test("Eva can change an existing visit's work stage and team and record full Cash payment, with strict field and role isolation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-eva-operations-"));
  const users = [{ id: "eva", email: "eva@shynli.local", role: "viewer" },
    { id: "observer", email: "other@example.test", role: "viewer" },
    { id: "cleaner", email: "cleaner@example.test", role: "cleaner" }]
    .map(user => ({ ...user, name: user.id, status: "active", staffId: `staff-${user.id}`,
      passwordHash: hashPassword("LocalOperations123!"), emailVerificationRequired: false }));
  const env = { ADMIN_MASTER_SECRET: "local-eva-operations", PROFITABILITY_ENABLED: "1",
    ADMIN_USERS_STORE_PATH: path.join(root, "users.json"), ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json"),
    ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl"), PROFITABILITY_STORE_PATH: path.join(root, "finances.json"),
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", RECURRING_ORDER_MAINTENANCE_ENABLED: "0" };
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH, JSON.stringify({ version: 1, users }));
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: [
    { id: "a", name: "Cleaner A", role: "cleaner", status: "active" },
    { id: "b", name: "Cleaner B", role: "cleaner", status: "active" },
    { id: "inactive", name: "Retired Cleaner", role: "cleaner", status: "inactive" }], assignments: [] }));
  const app = await startServer({ env });
  const post = (cookie, body, route = "/admin/orders", json = true) => fetch(app.baseUrl + route, {
    method: "POST", redirect: "manual", headers: { cookie, "content-type": json ? "application/json" : "application/x-www-form-urlencoded",
      accept: "application/json" }, body: json ? JSON.stringify(body) : new URLSearchParams(body) });
  const get = (cookie, route) => fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie } });
  try {
    const owner = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const cookies = {};
    for (const user of users) {
      const result = await post("", { email: user.email, password: "LocalOperations123!" }, user.role === "cleaner" ? "/account/login" : "/admin/login", false);
      assert.equal(result.status, 303);
      cookies[user.id] = `shynli_user_session=${getCookieValue(getSetCookies(result), "shynli_user_session")}`;
    }
    const created = await post(owner, { action: "create-manual-order", customerName: "TEST Operational Rights", customerPhone: "2025550142",
      fullAddress: "100 TEST ONLY St", acquisitionSource: "referral", serviceType: "deep", totalPrice: "374", selectedDate: "2099-12-21",
      selectedTime: "09:00", serviceDurationHours: "4", serviceDurationMinutes: "45" }, "/admin/orders", false);
    const id = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order"); assert(id);
    const card = async cookie => (await get(cookie, `/admin/orders?fragment=order-dialog&order=${id}`)).text();
    const version = async () => (await (await get(owner, `/admin/profitability/api?entryId=${id}`)).json()).orderUpdatedAt;
    const original = await card(owner);
    const change = async (body, cookie = cookies.eva) => post(cookie, { entryId: id, expectedUpdatedAt: await version(), ...body });
    const stage = await change({ action: "update-order-operations", orderStatus: "cleaning-complete" });
    assert.equal(stage.status, 200, await stage.text());
    assert.match(await card(owner), /Уборка завершена/);
    const staleVersion = await version();
    const team = await change({ action: "update-order-operations", assignedStaff: ["Cleaner A", "Cleaner B"] });
    assert.equal(team.status, 200, await team.text());
    const assigned = await card(owner); assert.match(assigned, /Cleaner A/); assert.match(assigned, /Cleaner B/);
    assert.match(assigned, /value="374\.00"/); assert.match(assigned, /2099-12-21/);
    assert.match(assigned, /name="serviceDurationHours"[^>]*value="4"/);
    assert.match(assigned, /name="serviceDurationMinutes"[^>]*value="45"/);
    assert.equal((await post(cookies.eva, { action: "update-order-operations", entryId: id, expectedUpdatedAt: staleVersion, orderStatus: "scheduled" })).status, 409);
    for (const [field, value] of Object.entries({ totalPrice: "1", selectedDate: "2099-01-01", selectedTime: "23:00", frequency: "weekly",
      payrollOverrideAmount: "1", policyAutoSendDisabled: "1", customerName: "Injected", paidCents: 1, recurringEditScope: "future",
      actor: { id: "owner" }, paymentStatus: "unpaid", paymentMethod: "check" })) {
      assert.equal((await change({ action: "update-order-operations", orderStatus: "scheduled", [field]: value })).status, 403, field);
      assert.equal((await change({ action: "mark-order-paid-cash", [field]: value })).status, 403, `cash ${field}`);
    }
    for (const status of ["canceled", "rescheduled", "invoice-sent", "paid", "unknown"]) {
      assert.equal((await change({ action: "update-order-operations", orderStatus: status })).status, 403, status);
    }
    for (const name of ["No Such Cleaner", "Retired Cleaner"]) assert.equal((await change({ action: "update-order-operations", assignedStaff: [name] })).status, 400);
    for (const action of ["update-order", "create-manual-order", "delete-order", "reset-order-policy", "resend-order-policy", "schedule-next-order", "restore-recurring-series"]) {
      assert.equal((await change({ action })).status, 403, action);
    }
    const paid = await change({ action: "mark-order-paid-cash" }); assert.equal(paid.status, 200, await paid.clone().text());
    const receipt = await paid.json(); assert.equal(receipt.paidCents, 37400); assert.equal(receipt.paymentMethod, "cash");
    const finance = await (await get(cookies.eva, `/admin/profitability/api?entryId=${id}`)).json();
    assert.equal(finance.fields.paidCents, 37400); assert.equal(finance.fields.paymentMethod, "cash");
    const after = await card(owner); assert.match(after, /Paid/); assert.match(after, /Cash/); assert.match(after, /Уборка завершена/);
    for (const unchanged of [/value="374\.00"/, /2099-12-21/, /Cleaner A/, /Cleaner B/]) assert.match(after, unchanged);
    const report = await (await get(cookies.eva, "/admin/profitability?status=all")).text(); assert.match(report, /\$374\.00/);
    const evaCard = await card(cookies.eva);
    assert.match(evaCard, /value="update-order-operations"/); assert.match(evaCard, /value="mark-order-paid"/);
    assert.doesNotMatch(evaCard, /name="(?:totalPrice|selectedDate|selectedTime|serviceDurationHours|frequency|policyAutoSendDisabled|payrollOverrideAmount)"/);
    assert.doesNotMatch(evaCard, /value="(?:delete-order|create-manual-order|reset-order-policy|schedule-next-order)"/);
    assert.doesNotMatch(await card(cookies.observer), /value="(?:update-order-operations|mark-order-paid-cash|mark-order-paid)"/);
    for (const cookie of [cookies.observer, cookies.cleaner, ""]) {
      const response = await change({ action: "update-order-operations", orderStatus: "scheduled" }, cookie);
      assert([303, 403].includes(response.status)); assert.notEqual(response.status, 200);
    }
    for (const route of ["/admin/clients", "/admin/staff", "/admin/settings", "/admin/payroll"]) {
      assert.equal((await post(cookies.eva, { action: "update-order-operations", entryId: id, orderStatus: "scheduled" }, route)).status, 403, route);
    }
    const review = await change({ action: "update-order-operations", orderStatus: "awaiting-review" }); assert.equal(review.status, 200);
    assert.match(await card(owner), /Ждем отзыв/);
    assert.equal((await change({ action: "update-order-operations", orderStatus: "completed" })).status, 200);
    assert.equal((await change({ action: "update-order-operations", orderStatus: "scheduled" })).status, 403);
    assert.equal((await change({ action: "mark-order-paid-cash" })).status, 403);
    assert.doesNotMatch(await card(cookies.eva), /data-eva-order-operation/);
    const events = (await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8")).split("\n").filter(Boolean).map(JSON.parse);
    const changes = events.filter(event => event.actor?.id === "eva" && event.status === "succeeded").flatMap(event => event.changes || []);
    for (const field of ["status", "assignedStaff", "paymentStatus", "paymentMethod"]) assert(changes.some(change => change.field === field), field);
    const state = JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH, "utf8"));
    const paymentEvent = state.events.find(event => event.actor?.id === "eva" && event.after?.paidCents === 37400);
    assert(paymentEvent); assert.equal(paymentEvent.after.paymentMethod, "cash"); assert(paymentEvent.occurred_at);
    assert(original.includes("TEST Operational Rights"));
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
