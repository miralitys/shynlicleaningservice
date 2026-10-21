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

test("Eva viewer can read both reports and audit only the five allowed UI/API fields; other writes stay forbidden", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-eva-payouts-"));
  const users = [
    { id: "eva", email: "eva@shynli.local", role: "viewer" },
    { id: "observer", email: "other@shynli.local", role: "viewer" },
    { id: "ramina", email: "ramina@example.test", role: "manager" },
    { id: "cleaner", email: "cleaner@example.test", role: "cleaner" },
  ].map(user => ({ ...user, staffId: `staff-${user.id}`, status: "active", passwordHash: hashPassword("LocalTest123!"), emailVerificationRequired: false }));
  const env = { ADMIN_MASTER_SECRET: "eva-payout-test", PROFITABILITY_ENABLED: "1", ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS: "100",
    ADMIN_USERS_STORE_PATH: path.join(root, "users.json"), ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json"),
    PROFITABILITY_STORE_PATH: path.join(root, "finances.json"), SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GHL_API_KEY: "", GHL_LOCATION_ID: "" };
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH, JSON.stringify({ version: 1, users }));
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: [{ id: "a", name: "Cleaner A", status: "active", role: "cleaner" },
    { id: "b", name: "Cleaner B", status: "active", role: "cleaner" }], assignments: [] }));
  const app = await startServer({ env });
  const post = (route, cookie, body) => fetch(app.baseUrl + route, { method: "POST", redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const get = (route, cookie) => fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie } });
  const login = async user => {
    const response = await post("/admin/login", "", { email: user.email, password: "LocalTest123!" });
    assert.equal(response.status, 303);
    return `shynli_user_session=${getCookieValue(getSetCookies(response), "shynli_user_session")}`;
  };
  try {
    const owner = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const created = await post("/admin/orders", owner, { action: "create-manual-order", customerName: "Payout QA", customerPhone: "6305550198",
      fullAddress: "100 Test Street", totalPrice: "534", acquisitionSource: "referral", selectedDate: "2099-11-20", selectedTime: "09:00", assignedStaff: "Cleaner A, Cleaner B" });
    assert.equal(created.status, 303);
    const id = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order");
    assert.ok(id);
    const assign = await post("/admin/orders", owner, [["action", "update-order"], ["entryId", id], ["assignedStaff", "Cleaner A"], ["assignedStaff", "Cleaner B"]]);
    assert.equal(assign.status, 303);
    const seed = await post("/admin/profitability", owner, { action: "update", entryId: id, version: "0", paidAmount: "500", source: "google",
      orderUpdatedAt: (await (await get(`/admin/profitability/api?entryId=${id}`, owner)).json()).orderUpdatedAt,
      "payout:a": "100", "payout:b": "90", comment: "Keep financial comment" });
    assert.equal(seed.status, 303, await seed.text());
    const eva = await login(users[0]);
    const orderUrl = `/admin/orders?fragment=order-dialog&order=${id}`;
    const before = await (await get(orderUrl, owner)).text();
    const html = await (await get("/admin/profitability", eva)).text();
    assert.match(html, /name="payout:a"/);
    assert.match(html, /name="payout:b"/);
    assert.match(html, /Сохранить/);
    assert.match(html, /История/);
    assert.doesNotMatch(html, /name="(?:paidAmount|leadCost|addons|discount|tips|actualHours|tipsPassed)"/);
    for (const name of ["paymentMethod", "paidAt", "comment"]) assert.ok(html.includes(`name="${name}"`), name);
    assert.doesNotMatch(html, /value="(?:settings|preview-import|apply-import)"/);
    assert.match(html, /<select[^>]*form="profit-[^"]+" name="source"/);
    assert.match(await (await get("/admin/orders", eva)).text(), /href="\/admin\/profitability"/);
    assert.equal((await get("/admin/profitability?view=summary", eva)).status, 200);
    const patch = async (patch, version, extra = {}) => fetch(app.baseUrl + "/admin/profitability/api", { method: "PATCH",
      headers: { cookie: eva, "content-type": "application/json" }, body: JSON.stringify({ entryId: id, version, patch,
        orderUpdatedAt: (await (await get(`/admin/profitability/api?entryId=${id}`, eva)).json()).orderUpdatedAt, ...extra }) });
    const updated = await patch({ payouts: [{ staffId: "a", cents: 12500 }] }, 1);
    assert.equal(updated.status, 200, await updated.clone().text());
    assert.equal((await updated.json()).version, 2);
    const uiUpdate = await post("/admin/profitability", eva, { action: "update", entryId: id, version: "2", "payout:b": "95.50",
      orderUpdatedAt: (await (await get(`/admin/profitability/api?entryId=${id}`, eva)).json()).orderUpdatedAt });
    assert.equal(uiUpdate.status, 303, await uiUpdate.text());
    assert.equal((await patch({ payouts: [{ staffId: "a", cents: 1 }] }, 1)).status, 409);
    for (const field of ["paidCents", "basePriceCents", "addonsCents", "discountCents", "leadCostCents", "tipsCents", "tipsPassed",
      "actualMinutes", "totalPrice", "orderStatus", "assignedStaff", "selectedDate"]) {
      assert.equal((await patch({ payouts: [{ staffId: "a", cents: 1 }], [field]: "injected" }, 3)).status, 403, field);
    }
    assert.equal((await patch({ payouts: [] }, 3, { totalPrice: 1 })).status, 403);
    for (const body of [{ action: "settings", supplies: "1" }, { action: "apply-import", csv: "id,source" },
      { action: "preview-import", csv: "id,source" }, { action: "delete" },
      { action: "update", entryId: id, version: "3", "payout:a": "1", paidAmount: "1" },
      { action: "update", entryId: id, version: "3", "payout:attacker": "1" }]) {
      assert.equal((await post("/admin/profitability", eva, body)).status, 403);
    }
    for (const method of ["DELETE", "PUT"]) assert.equal((await fetch(app.baseUrl + "/admin/profitability/api", { method, headers: { cookie: eva } })).status, 403);
    for (const route of ["/admin/orders", "/admin/clients", "/admin/settings", "/admin/staff", "/admin/staff?section=calendar", "/admin/payroll"]) {
      for (const action of ["update-order", "delete-order"]) assert.equal((await post(route, eva, { action, entryId: id, totalPrice: "1", orderStatus: "canceled" })).status, 403, route);
    }
    const sourceUpdate = await patch({ source: "nextdoor", paymentMethod: "cash", paidAt: "2026-10-21", comment: "API comment" }, 3);
    assert.equal(sourceUpdate.status, 200);
    const sourceForm = await post("/admin/profitability", eva, { action: "update", entryId: id, version: "4", source: "thumbtack", paymentMethod: "check", paidAt: "2026-10-22", comment: "Form comment" });
    assert.equal(sourceForm.status, 303);
    const after = await (await get(orderUrl, owner)).text();
    const withoutPayoutValues = html => html.replace(/value="(?:100\.00|90\.00|125\.00|95\.50)"/g, 'value="PAYOUT"');
    assert.equal(withoutPayoutValues(after), withoutPayoutValues(before), "only authorized per-cleaner payout values change; client price, team, date and status are untouched");
    const state = JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH, "utf8"));
    assert.deepEqual(state.records[id].data, { paidCents: 50000, source: "thumbtack", comment: "Form comment", paymentMethod: "check", paidAt: "2026-10-22",
      payouts: [{ staffId: "a", cents: 12500 }, { staffId: "b", cents: 9550 }] });
    assert.equal(state.events.length, 5, "forbidden and stale writes do not create history");
    for (const event of state.events.slice(1)) {
      assert.equal(event.actor.id, "eva");
      assert.equal(event.actor.email, "eva@shynli.local");
      assert.equal(event.actor.permission, "profitability.update_assistant_fields");
      assert.ok(Number.isFinite(Date.parse(event.occurred_at)));
      assert.equal(event.record_id, id);
    }
    assert.equal(state.events[1].before.payouts[0].cents, 10000);
    assert.equal(state.events[1].after.payouts[0].cents, 12500);
    assert.equal(state.events[2].before.payouts[1].cents, 9000);
    assert.equal(state.events[2].after.payouts[1].cents, 9550);
    assert.equal(state.events[3].before.source, "google");
    assert.equal(state.events[3].after.source, "nextdoor");
    assert.equal(state.events[4].before.source, "nextdoor");
    assert.equal(state.events[4].after.source, "thumbtack");
    assert.equal(state.events[3].before.comment, "Keep financial comment");
    assert.equal(state.events[3].after.comment, "API comment");
    assert.equal(state.events[4].before.paymentMethod, "cash");
    assert.equal(state.events[4].after.paymentMethod, "check");
    assert.equal(state.events[4].before.paidAt, "2026-10-21");
    assert.equal(state.events[4].after.paidAt, "2026-10-22");
    const readApi = await (await get(`/admin/profitability/api?entryId=${id}`, eva)).json();
    assert.equal(readApi.fields.comment, "Form comment");
    const history = await (await get(`/admin/profitability?history=${id}`, eva)).text();
    assert.match(history, /eva@shynli.local/);
    assert.match(history, /\$125\.00/);
    assert.match(history, /\$95\.50/);
    for (const user of users.slice(1)) {
      const cookie = await login(user);
      for (const route of ["/admin/profitability", "/admin/profitability?view=summary", `/admin/profitability/api?entryId=${id}`, `/admin/profitability?history=${id}`])
        assert.equal((await get(route, cookie)).status, 403, `${user.id} ${route}`);
      if (user.role !== "cleaner") assert.doesNotMatch(await (await get("/admin/orders", cookie)).text(), /href="\/admin\/profitability"/);
    }
    const persistedUsers = JSON.parse(await fs.readFile(env.ADMIN_USERS_STORE_PATH, "utf8")).users;
    for (const user of users) {
      const persisted = persistedUsers.find(item => item.id === user.id);
      for (const key of ["role", "email", "passwordHash", "status"]) assert.equal(persisted[key], user[key], key);
    }
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
