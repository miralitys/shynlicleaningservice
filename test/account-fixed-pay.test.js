"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig,
  getSetCookies, getCookieValue } = require("./admin-route-helpers");
const { hashPassword } = require("../lib/admin-auth");

test("cleaner order cards and calendars honor the saved fixed pay, isolate team members and keep order data unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-fixed-pay-"));
  const env = { ADMIN_MASTER_SECRET: "local-fixed-pay-regression", ADMIN_USERS_STORE_PATH: path.join(root, "users.json"),
    ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json"), GHL_API_KEY: "", GHL_LOCATION_ID: "",
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", PROFITABILITY_ENABLED: "0" };
  const staff = [{ id: "a", name: "Cleaner A", compensationType: "percent", compensationValue: "50", status: "active", role: "cleaner" },
    { id: "b", name: "Cleaner B", compensationType: "percent", compensationValue: "50", status: "active", role: "cleaner" }];
  const users = staff.map(person => ({ id: `user-${person.id}`, staffId: person.id, email: `${person.id}@example.test`,
    passwordHash: hashPassword("LocalFixedPay123!"), role: "cleaner", status: "active", emailVerificationRequired: false }));
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff, assignments: [] }));
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH, JSON.stringify({ version: 1, users }));
  const app = await startServer({ env });
  const post = (route, cookie, values) => fetch(app.baseUrl + route, { method: "POST", redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
  const get = (route, cookie) => fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie } });
  try {
    const owner = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const created = await post("/admin/orders", owner, { action: "create-manual-order", customerName: "Fixed Pay Client",
      customerPhone: "6305550195", fullAddress: "100 Local Test Street", totalPrice: "534", selectedDate: "2099-10-23", selectedTime: "09:00" });
    assert.equal(created.status, 303);
    const id = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order");
    assert.ok(id);
    const savePay = async (value, team = ["Cleaner A"]) => {
      const response = await post("/admin/orders", owner, [["action", "update-order"], ["entryId", id],
        ...team.map(name => ["assignedStaff", name]), ["payrollOverrideStaffId", "a"], ["payrollOverrideAmount", value]]);
      assert.equal(response.status, 303);
    };
    const login = async email => {
      const response = await post("/account/login", "", { email, password: "LocalFixedPay123!" });
      assert.equal(response.status, 303);
      const token = getCookieValue(getSetCookies(response), "shynli_user_session");
      assert.ok(token);
      return `shynli_user_session=${token}`;
    };
    const cleanerA = await login(users[0].email);
    const cleanerB = await login(users[1].email);
    const detail = `/admin/orders?fragment=order-dialog&order=${id}`;
    const readEarning = async (cookie, section = "") => {
      const response = await get(`/account?order=${id}&date=2099-10-23${section}`, cookie);
      assert.equal(response.status, 200);
      return response.text();
    };
    await savePay("500");
    const before = await (await get(detail, owner)).text();
    assert.match(before, /value="500.00"/);
    for (const section of ["", "&section=calendar&view=month", "&section=calendar&view=day"]) {
      const html = await readEarning(cleanerA, section);
      assert.match(html, /\$500\.00/);
      assert.doesNotMatch(html, /\$267\.00|\$534\.00/, "no percentage estimate or client price leaks into the cleaner view");
    }
    assert.equal(await (await get(detail, owner)).text(), before, "GET does not rewrite the order or payroll");
    await savePay("450.50");
    assert.match(await readEarning(cleanerA), /\$450\.50/);
    await savePay("");
    const ordinary = await readEarning(cleanerA);
    assert.match(ordinary, /\$267\.00/, "clearing the override restores the normal rate");
    assert.doesNotMatch(ordinary, /\$450\.50|\$500\.00/);
    await savePay("500", ["Cleaner A", "Cleaner B"]);
    assert.match(await readEarning(cleanerA), /\$500\.00/, "fixed pay is not divided by team size");
    const other = await readEarning(cleanerB);
    assert.match(other, /\$133\.50/, "the other cleaner retains their percentage rate");
    assert.doesNotMatch(other, /\$500\.00/);
    const complete = await post("/admin/orders", owner, { action: "update-order", entryId: id, orderStatus: "cleaning-complete" });
    assert.equal(complete.status, 303);
    const payroll = await readEarning(cleanerA, "&section=payroll");
    assert.match(payroll, /Фикс: \$500\.00/);
    assert.doesNotMatch(payroll, /50% база/);
    const paid = await post("/admin/payroll", owner, { action: "mark-payroll-paid", entryId: id, staffId: "a" });
    assert.equal(paid.status, 303);
    await savePay("600", ["Cleaner A", "Cleaner B"]);
    const paidHistory = await readEarning(cleanerA, "&section=payroll");
    assert.match(paidHistory, /Фикс: \$500\.00/);
    assert.doesNotMatch(paidHistory, /\$600\.00/, "already paid payroll is not recalculated");
    const after = await (await get(detail, owner)).text();
    assert.match(after, /\$534\.00/, "fixed pay edits never change the client's agreed price");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
