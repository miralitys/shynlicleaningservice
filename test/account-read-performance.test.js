"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry } = require("../lib/supabase-quote-ops");
const { createSupabaseAdminStaffClient } = require("../lib/supabase-admin-staff");
const { projectAccountListEntry } = require("../lib/account/order-list");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { collectPayrollRecords, calculateStaffPayrollItem } = require("../lib/payroll");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");
const { startServer, stopServer } = require("./server-test-helpers");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

test("account summary reads preserve every ID, amount, team and payroll beyond 1000 and small database page caps", async () => {
  const fixture = createFixture();
  const calls = [];
  const before = JSON.stringify(fixture);
  for (const noCount of [false, true]) {
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 23, noCount })) });
    const ids = fixture.rows.slice(0, fixture.count).map(row => row.id);
    const summaries = await client.fetchAccountEntriesByIds(ids);
    const full = fixture.rows.slice(0, fixture.count).map(mapRowToEntry);
    assert.equal(summaries.length, 1107);
    assert.deepEqual(new Set(summaries.map(row => row.id)), new Set(ids));
    const byId = new Map(summaries.map(row => [row.id, row]));
    for (const original of full) {
      const summary = byId.get(original.id);
      for (const key of ["totalPrice", "totalPriceCents", "selectedDate", "selectedTime", "fullAddress"]) assert.deepEqual(summary[key], original[key]);
      for (const key of ["assignedStaff", "status", "payrollOverrides", "payroll", "updatedAt"]) assert.deepEqual(getEntryOrderState(summary)[key], getEntryOrderState(original)[key]);
      assert.equal(summary.payloadForRetry.adminClient, undefined);
      assert.equal(summary.payloadForRetry.adminSms, undefined);
      const calculated = [summary, original].map(entry => calculateStaffPayrollItem(entry,
        { id: "a", compensationType: "percent", compensationValue: "50" }, { teamSize: 2 }));
      for (const item of calculated) { delete item.createdAt; delete item.updatedAt; }
      assert.deepEqual(calculated[0], calculated[1]);
    }
    assert.deepEqual(collectPayrollRecords({ entries: summaries, staffId: "a" }), collectPayrollRecords({ entries: full, staffId: "a" }));
  }
  assert.equal(JSON.stringify(fixture), before);
  assert.ok(calls.every(call => call.method === "GET" && !call.query.includes("select=*")));
  const legacy = { id: "legacy", payloadForRetry: { orderState: {}, adminOrder: { status: "completed", payrollOverrides: { a: "500" } } } };
  assert.deepEqual(getEntryOrderState(projectAccountListEntry(legacy)), {});
});

test("staff-scoped reads paginate all assignments, preserve both team members, and omit other employee documents", async () => {
  const fixture = createFixture();
  const calls = [];
  const client = createSupabaseAdminStaffClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 100 })) });
  const snapshot = await client.fetchAccountSnapshot("a");
  assert.equal(snapshot.assignments.length, fixture.count);
  assert.ok(snapshot.assignments.every(assignment => assignment.staffIds.join(",") === "a,b"));
  assert.deepEqual(snapshot.staff.map(person => person.id).sort(), ["a", "b"]);
  assert.ok(calls.filter(call => call.table === "admin_staff_assignments").every(call => new URLSearchParams(call.query).has("staff_ids")));
  assert.equal(calls.filter(call => call.table === "admin_staff" && new URLSearchParams(call.query).get("select") === "*").length, 1);
});

test("account HTTP lists and lazy details keep all history accessible, enforce assignment access and never write", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-read-"));
  const control = path.join(root, "control.json");
  const capture = path.join(root, "calls.ndjson");
  await fs.writeFile(control, "{}");
  await fs.writeFile(capture, "");
  const appEnv = { ...env, ADMIN_MASTER_SECRET: "isolated-account-read", SHYNLI_FETCH_STUB_ENTRY: path.join(__dirname, "support/account-read-fixture.cjs"),
    ACCOUNT_BENCH_CONTROL: control, ACCOUNT_BENCH_CAPTURE: capture, CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", GHL_API_KEY: "", GHL_LOCATION_ID: "" };
  const app = await startServer({ env: appEnv });
  const token = createUserSessionToken(loadUserAuthConfig(appEnv), { userId: "user-a", staffId: "a", email: "a@example.test" });
  const cookie = `shynli_user_session=${token}`;
  let authenticatedRequests = 0;
  const get = (query, authenticated = true) => {
    if (authenticated) authenticatedRequests++;
    return fetch(app.baseUrl + "/account" + query, { redirect: "manual", headers: authenticated ? { cookie } : {} });
  };
  try {
    const ids = new Set();
    let firstHtml;
    const initial = await (await get("")).text();
    assert.doesNotMatch(initial, /<article\b[^>]*data-account-mobile-order-card/);
    assert.match(initial, /Все заказы и история/);
    for (let page = 1; page <= 20; page++) {
      const response = await get(`?history=all&page=${page}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      if (page === 1) firstHtml = html;
      assert.doesNotMatch(html, /<section\b[^>]*data-account-mobile-detail-view/);
      assert.doesNotMatch(html, /Other cleaner only/);
      for (const match of html.matchAll(/<article\b[^>]*data-account-mobile-order-card[^>]*data-account-entry-id="([^"]+)"/g)) {
        if (Number(match[1].split("-")[1]) >= 107) ids.add(match[1]);
      }
    }
    assert.equal(ids.size, 1000);
    assert.ok(ids.has("order-01106"), "the tail beyond the former 1000-ID cap is accessible");
    const history = await (await get("?history=all")).text();
    for (let i = 0; i < 107; i++) assert.ok(history.includes(`data-account-entry-id="order-${String(i).padStart(5, "0")}"`));
    const payroll = await get("?section=payroll&tab=1");
    assert.equal(payroll.status, 200);
    const payrollHtml = await payroll.text();
    assert.equal((payrollHtml.match(/class="account-payroll-order-cell"/g) || []).length, 107);
    assert.match(payrollHtml, /Test Client 0</);
    assert.match(payrollHtml, /Test Client 106</);
    assert.match(payrollHtml, /\$91\.06/);
    assert.doesNotMatch(payrollHtml, /Other cleaner only/);
    const monthQuery = "?section=calendar&view=month&date=2099-01-01";
    const compact = await get(monthQuery + "&calendarCompact=1");
    assert.equal(compact.status, 200);
    const compactHtml = await compact.text();
    assert.doesNotMatch(compactHtml, /Test Client|<table\b/);
    assert.match(compactHtml, /data-account-calendar-orders-source/);
    assert.match(compactHtml, /calendarFull=1/);
    const desktop = await get(monthQuery + "&fragment=calendar-orders");
    assert.equal(desktop.status, 200);
    assert.match(desktop.headers.get("cache-control"), /no-store/);
    const desktopHtml = await desktop.text();
    assert.match(desktopHtml, /data-account-calendar-orders-content/);
    assert.match(desktopHtml, /Test Client 0</);
    assert.match(desktopHtml, /Test Client 30</);
    assert.doesNotMatch(desktopHtml, /Test Client 31<|Other cleaner only|<html/);
    const fullCalendar = await (await get(monthQuery + "&calendarFull=1")).text();
    assert.match(fullCalendar, /Test Client 0</);
    assert.doesNotMatch(fullCalendar, /data-account-calendar-orders-source/);
    const defaultCalendar = await (await get(monthQuery)).text();
    assert.equal(defaultCalendar, fullCalendar, "desktop receives the complete table in its initial response");
    assert.equal(await (await get(monthQuery + "&calendarCompact=1&calendarFull=1")).text(), fullCalendar);
    assert.equal((await get(monthQuery + "&fragment=calendar-orders", false)).status, 303);
    assert.equal((await get("?fragment=calendar-orders")).status, 400);
    const lastDate = createFixture().rows[1106].selected_date;
    for (const date of ["2099-01-01", lastDate, "2050-01-01"]) {
      const calendar = await get(`?section=calendar&view=month&date=${date}&showDay=1&calendarCompact=1&tab=1`);
      assert.equal(calendar.status, 200);
      const calendarHtml = await calendar.text();
      assert.doesNotMatch(calendarHtml, /Other cleaner only/);
      if (date === lastDate) assert.match(calendarHtml, /data-account-entry-id="order-01106"/);
      if (date === "2099-01-01") assert.match(calendarHtml, /data-account-entry-id="order-00000"/);
      if (date === "2050-01-01") assert.doesNotMatch(calendarHtml, /data-account-entry-id=/);
    }
    const detail = await get("?fragment=order-detail&order=order-01106");
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /data-account-mobile-detail-view/);
    assert.match(detailHtml, /Test Client 1106/);
    assert.match(detailHtml, /Inside Cabinets Cleaning/);
    assert.match(detailHtml, /Детали объекта/);
    assert.doesNotMatch(detailHtml, /Test Client 1105|<html|admin-quote-pricing/);
    assert.ok(Buffer.byteLength(detailHtml) < Buffer.byteLength(firstHtml) / 4);
    const focused = await (await get("?order=order-00000")).text();
    assert.equal((focused.match(/<section\b[^>]*data-account-mobile-detail-view/g) || []).length, 1);
    assert.equal((await get("?fragment=order-detail&order=other-order")).status, 404);
    assert.equal((await get("?fragment=order-detail&order=missing")).status, 404);
    assert.equal((await get("?fragment=order-detail&order=order-01106", false)).status, 303);
    await fs.writeFile(control, JSON.stringify({ reassigned: "order-01106" }));
    assert.equal((await get("?fragment=order-detail&order=order-01106")).status, 404, "fresh assignment check revokes cached access");
    const freshMonth = await (await get(`?section=calendar&view=month&date=${lastDate}&fragment=calendar-orders&tab=1`)).text();
    assert.doesNotMatch(freshMonth, /Test Client 1106</);
    await fs.writeFile(control, JSON.stringify({ failDetail: true }));
    assert.equal((await get("?fragment=order-detail&order=order-00001")).status, 503, "no stale full-record fallback");
    await fs.writeFile(control, JSON.stringify({ failOrders: true }));
    const failure = await get("");
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /Test Client/);
    assert.equal((await get(monthQuery + "&fragment=calendar-orders&tab=1")).status, 503);
    const calls = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.ok(calls.every(call => call.method === "GET"));
    assert.ok(calls.filter(call => call.table === "admin_users").length <= authenticatedRequests + 1, "one users snapshot per request, plus startup");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
