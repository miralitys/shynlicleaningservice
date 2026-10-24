"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { mapRowToEntry } = require("../lib/supabase-quote-ops");
const { createSupabaseAdminStaffClient } = require("../lib/supabase-admin-staff");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { createAccountRequestHandler } = require("../lib/account/handlers");
const { createAccountRenderers } = require("../lib/account/render");
const { collectPayrollRecords } = require("../lib/payroll");
const { getAccountCalendarOrderDate, isAccountCalendarOrderVisible } = require("../lib/account/calendar-data");

const normalizeString = (value, max = 500) => String(value == null ? "" : value).trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const escapeHtml = value => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const renderers = createAccountRenderers({
  ACCOUNT_ROOT_PATH: "/account", ACCOUNT_LOGOUT_PATH: "/account/logout", GOOGLE_TAG_MANAGER_CONTAINER_ID: "",
  normalizeString, escapeHtml, escapeHtmlAttribute: escapeHtml, escapeHtmlText: escapeHtml,
  formatAdminDateTime: value => value || "", formatAdminServiceLabel: value => value || "Regular",
  formatCurrencyAmount: value => `$${Number(value || 0).toFixed(2)}`, formatOrderCountLabel: value => `${value} orders`,
  renderStaffStatusBadge: status => `<span>${escapeHtml(status)}</span>`,
  shared: {
    renderAdminLayout: (title, body, options = {}) => `${options.sidebar || ""}${body}${options.bodyScripts || ""}`,
    renderAdminCard: (title, description, body) => `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${body}</section>`,
    renderAdminBadge: label => `<span>${escapeHtml(label)}</span>`,
    renderAdminPropertyList: rows => `<dl>${rows.map(row => `<dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd>`).join("")}</dl>`,
  },
});

async function createHarness() {
  const fixture = createFixture();
  // Assignment dates, not order dates, determine the calendar period.
  fixture.assignments[0].schedule_date = "2103-01-01";
  fixture.assignments[1].status = "cancelled";
  fixture.rows[2].payload_for_retry.adminOrder.status = "canceled";
  fixture.rows[3].selected_date = "";
  fixture.assignments[3].schedule_date = "";
  fixture.rows[3].payload_for_retry.calculatorData.selectedDate = "2103-02-01";
  fixture.rows[4].payload_for_retry.adminOrder = { status: "scheduled" };
  fixture.rows[4].payload_for_retry.orderState.status = "canceled";
  fixture.rows[5].payload_for_retry.adminOrder = {};
  fixture.rows[5].payload_for_retry.orderState = {};
  const entries = fixture.rows.map(mapRowToEntry);
  const staff = await createSupabaseAdminStaffClient({ env: {
    SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake",
  }, fetch: createReadFetch(fixture) }).fetchAccountSnapshot("a");
  const metrics = { planning: [], settingsReads: 0, calendarMetaReads: 0, ledgerReads: [] };
  const user = { id: "user-a", staffId: "a", email: "a@example.test", role: "cleaner", status: "active" };
  const settings = { templates: [{ serviceType: "deep", items: [{ id: "clean", label: "Clean room", completed: false }] }] };
  const control = { failSettings: false, failOrders: false };
  const settingsStore = { async getSnapshot() {
    metrics.settingsReads++;
    if (control.failSettings) throw new Error("Settings unavailable");
    return settings;
  } };
  const ledger = {
    async listAccountEntriesByIds(ids) {
      metrics.ledgerReads.push(ids.slice());
      if (control.failOrders) throw new Error("Orders unavailable");
      return entries.filter(entry => ids.includes(entry.id));
    },
    async getEntry(id) { return entries.find(entry => entry.id === id) || null; },
  };
  const staffStore = { async getAccountSnapshot() { return staff; } };
  const usersStore = { async getAccountContext() { return { user, usersSnapshot: { users: [user] } }; } };
  const handler = createAccountRequestHandler({
    ACCOUNT_ROOT_PATH: "/account", USER_SESSION_COOKIE: "session", normalizeString,
    accountAuth: { loadUserAuthConfig: () => ({ configured: true }), verifyUserSessionToken: () => ({ userId: user.id }) },
    parseCookies: () => ({ session: "synthetic-session" }), getRequestUrl: req => new URL(req.url, "http://localhost"),
    getOrderSelectedDate: domain.getOrderSelectedDate, isOrderCreatedEntry: domain.isOrderCreatedEntry,
    buildStaffPlanningContext(entries, snapshot) {
      metrics.planning.push(entries.map(entry => entry.id));
      return domain.buildStaffPlanningContext(entries, snapshot);
    },
    accountRenderers: Object.fromEntries(["DashboardPage", "CalendarPage", "PayrollPage", "OrderDetailFragment"]
      .map(name => [`render${name}`, (context, options) => ({ context, options, page: name })])),
    writeHtmlWithTiming(res, status, body) { res.status = status; res.body = body; },
  });
  const get = async query => {
    const res = {};
    await handler({ method: "GET", url: "/account" + query, headers: {} }, res, 0, { route: "/account" }, null,
      { settingsStore, googleCalendarIntegration: { buildCalendarMeta() { metrics.calendarMetaReads++; return {}; } } },
      ledger, staffStore, usersStore);
    return res;
  };
  const snapshot = () => JSON.stringify({ fixture, entries, staff, settings });
  return { get, entries, staff, metrics, control, snapshot };
}

test("calendar prepares only the selected month with identical HTML, counts, teams, earnings and history", async () => {
  const h = await createHarness();
  const before = h.snapshot();
  const baseline = (await h.get("")).body.context;
  const allVisible = baseline.assignedOrders.filter(isAccountCalendarOrderVisible);
  const months = [...new Set(allVisible.map(getAccountCalendarOrderDate).filter(Boolean).map(date => date.slice(0, 7)))];
  const seen = new Set();
  for (const month of months) {
    const date = `${month}-01`;
    const response = await h.get(`?section=calendar&view=month&date=${date}`);
    assert.equal(response.status, 200);
    const { context, options } = response.body;
    const expected = allVisible.filter(item => getAccountCalendarOrderDate(item).startsWith(month));
    assert.deepEqual(context.assignedOrders, expected);
    assert.equal(context.assignmentCount, allVisible.length);
    assert.deepEqual(h.metrics.planning.at(-1).slice().sort(), expected.map(item => item.entry.id).sort());
    assert.equal(renderers.renderCalendarPage(context, options), renderers.renderCalendarPage(baseline, options));
    for (const item of context.assignedOrders) seen.add(item.entry.id);
  }
  assert.equal(seen.size, allVisible.length);
  assert.ok(seen.has("order-01106"), "orders beyond the former 1000 limit remain accessible");
  assert.ok(seen.has("order-00000"), "the rescheduled order appears in 2103, not its old month");
  for (const query of ["?section=calendar&date=2099-01-10", "?section=calendar&view=month&date=2099-01-10&showDay=1",
    "?section=calendar&view=month&date=2050-01-01", "?section=calendar&date=invalid"]) {
    const response = await h.get(query);
    assert.equal(response.status, 200);
    assert.equal(renderers.renderCalendarPage(response.body.context, response.body.options),
      renderers.renderCalendarPage(baseline, response.body.options));
  }
  assert.equal(h.snapshot(), before, "read preparation never mutates orders, assignments or payroll");
});

test("payroll skips planning, checklists, settings and calendar metadata without losing any saved payout", async () => {
  const h = await createHarness();
  const before = h.snapshot();
  h.control.failSettings = true;
  const response = await h.get("?section=payroll");
  assert.equal(response.status, 200);
  const { context, options } = response.body;
  assert.equal(h.metrics.settingsReads, 0);
  assert.equal(h.metrics.calendarMetaReads, 0);
  assert.deepEqual(h.metrics.planning, []);
  const assigned = new Set(h.staff.assignments.map(assignment => assignment.entryId));
  const expected = collectPayrollRecords({ entries: h.entries.filter(entry => assigned.has(entry.id)), staffId: "a" });
  assert.deepEqual(context.payrollSummary, expected);
  assert.equal(expected.rows.length, 104);
  h.control.failSettings = false;
  const baseline = (await h.get("")).body.context;
  assert.equal(context.assignmentCount, baseline.assignedOrders.length);
  assert.equal(renderers.renderPayrollPage(context, options),
    renderers.renderPayrollPage({ ...baseline, payrollSummary: expected }, options));
  assert.equal(h.snapshot(), before);
});

test("lean payroll cache cannot strip checklists or orders from later calendar, dashboard or full-card reads", async () => {
  const h = await createHarness();
  const before = h.snapshot();
  const payroll = await h.get("?section=payroll&tab=1");
  assert.equal(payroll.status, 200);
  const calendar = await h.get("?section=calendar&tab=1&date=2099-01-10");
  assert.equal(calendar.status, 200);
  assert.equal(h.metrics.settingsReads, 1, "a lean snapshot must not be reused where templates are needed");
  const dashboard = await h.get("?tab=1");
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.context.assignedOrders.length, 1106);
  assert.ok(dashboard.body.context.assignedOrders.every(item => item.completion.checklistItems[0]?.label === "Clean room"));
  const detail = await h.get("?fragment=order-detail&order=order-01106");
  assert.equal(detail.status, 200);
  assert.equal(detail.body.context.assignedOrders.length, 1);
  assert.equal(detail.body.context.assignedOrders[0].checklistTemplate.items[0].label, "Clean room");
  assert.equal((await h.get("?fragment=order-detail&order=other-order")).status, 404);
  assert.deepEqual((await h.get("?section=payroll&tab=1")).body.context.payrollSummary, payroll.body.context.payrollSummary);
  assert.equal(h.snapshot(), before);
});

test("calendar read errors do not fall back to a partial or stale list", async () => {
  const h = await createHarness();
  assert.equal((await h.get("?section=calendar&date=2099-01-01")).status, 200);
  h.control.failOrders = true;
  assert.equal((await h.get("?section=calendar&date=2099-01-01")).status, 503);
  assert.equal((await h.get("?section=payroll")).status, 503);
});
