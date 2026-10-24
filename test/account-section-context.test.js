"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, serializeOuter } = require("parse5");
const vm = require("node:vm");
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

async function createHarness({ calendarProjection = false } = {}) {
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
  const metrics = { planning: [], settingsReads: 0, calendarMetaReads: 0, ledgerReads: [], calendarReads: [] };
  const user = { id: "user-a", staffId: "a", email: "a@example.test", role: "cleaner", status: "active" };
  const settings = { templates: [{ serviceType: "deep", items: [{ id: "clean", label: "Clean room", completed: false }] }] };
  const control = { failSettings: false, failOrders: false, failCalendar: false };
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
  if (calendarProjection) ledger.listAccountCalendarEntriesByIds = async ids => {
    metrics.calendarReads.push(ids.slice());
    if (control.failCalendar) throw new Error("Calendar unavailable");
    return entries.filter(entry => ids.includes(entry.id)).map(require("../lib/account/calendar-list").projectAccountCalendarEntry);
  };
  const staffStore = { async getAccountSnapshot() { return structuredClone(staff); } };
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
    accountRenderers: Object.fromEntries(["DashboardPage", "CalendarPage", "PayrollPage", "OrderDetailFragment", "CalendarOrdersFragment"]
      .map(name => [`render${name}`, (context, options) => ({ context, options, page: name })])),
    writeHtmlWithTiming(res, status, body) { res.status = status; res.body = body; },
  });
  const get = async (query, headers = {}) => {
    const res = {};
    await handler({ method: "GET", url: "/account" + query, headers }, res, 0, { route: "/account" }, null,
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
    const response = await h.get(query + "&calendarFull=1");
    assert.equal(response.status, 200);
    assert.equal(renderers.renderCalendarPage(response.body.context, response.body.options),
      renderers.renderCalendarPage(baseline, response.body.options));
  }
  assert.equal(h.snapshot(), before, "read preparation never mutates orders, assignments or payroll");
});

test("narrow month reads keep identical dates, cancellations, availability and counts across all historical months", async () => {
  const h = await createHarness({ calendarProjection: true });
  const before = h.snapshot();
  const baseline = (await h.get("")).body.context;
  const visible = baseline.assignedOrders.filter(isAccountCalendarOrderVisible);
  const months = [...new Set(visible.map(getAccountCalendarOrderDate).filter(Boolean).map(date => date.slice(0, 7)))];
  const ordinaryReads = h.metrics.ledgerReads.length;
  for (const month of [...months, "2050-01"]) {
    const response = await h.get(`?section=calendar&view=month&date=${month}-01&calendarCompact=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.context.assignedOrders, []);
    assert.equal(sectionHtml(renderers.renderCalendarPage(response.body.context, response.body.options), "data-account-mobile-calendar"),
      sectionHtml(renderers.renderCalendarPage(baseline, response.body.options), "data-account-mobile-calendar"));
  }
  assert.equal(h.metrics.ledgerReads.length, ordinaryReads);
  assert.equal(h.metrics.calendarReads.length, months.length + 1);
  assert.ok(h.metrics.calendarReads.every(ids => ids.includes("order-01106")));
  assert.equal(h.snapshot(), before);
});

test("grid cache cannot satisfy full cards, history, day, desktop or earnings and can reuse a complete snapshot safely", async () => {
  const h = await createHarness({ calendarProjection: true });
  const before = h.snapshot();
  const grid = "?section=calendar&view=month&date=2099-01-10&calendarCompact=1";
  await h.get(grid);
  await h.get(grid + "&tab=1");
  assert.equal(h.metrics.calendarReads.length, 1);
  assert.equal(h.metrics.ledgerReads.length, 0);
  const payroll = (await h.get("?section=payroll&tab=1")).body.context;
  assert.equal(h.metrics.ledgerReads.length, 1, "grid-only rows must not stand in for financial data");
  assert.equal(payroll.payrollSummary.rows.length, 104);
  await h.get(grid + "&tab=1");
  assert.equal(h.metrics.calendarReads.length, 1, "a complete snapshot may satisfy a grid read");
  const day = await h.get(grid + "&showDay=1&tab=1");
  assert.ok(day.body.context.assignedOrders.length);
  assert.ok(day.body.context.assignedOrders.every(item => item.completion.checklistItems[0]?.label === "Clean room"));
  const history = await h.get("?history=all&tab=1");
  assert.equal(history.body.context.assignedOrders.length, 1106);
  assert.ok(history.body.context.assignedOrders.some(item => item.entry.id === "order-01106"));
  const full = await h.get("?fragment=order-detail&order=order-01106");
  assert.equal(full.status, 200);
  assert.equal(full.body.context.assignedOrders[0].entry.totalPrice, h.entries.find(row => row.id === "order-01106").totalPrice);
  assert.equal((await h.get("?fragment=order-detail&order=other-order")).status, 404);
  for (const suffix of ["&calendarFull=1", "&fragment=calendar-orders", "&order=order-00009"]) {
    const response = await h.get(grid + suffix);
    assert.equal(response.status, 200);
    assert.equal(response.body.context.calendarSummary, undefined);
    assert.ok(response.body.context.assignedOrders.length);
  }
  assert.deepEqual((await h.get("?section=payroll&tab=1")).body.context.payrollSummary, payroll.payrollSummary);
  assert.equal(h.snapshot(), before);
});

test("failed narrow reads expose a retryable error, not a stale month or partial calendar", async () => {
  const h = await createHarness({ calendarProjection: true });
  const query = "?section=calendar&view=month&date=2099-01-10&calendarCompact=1";
  assert.equal((await h.get(query)).status, 200);
  h.control.failCalendar = true;
  assert.equal((await h.get(query)).status, 503);
  assert.equal((await h.get(query + "&tab=1")).status, 503);
  h.control.failCalendar = false;
  assert.equal((await h.get(query)).status, 200);
});

test("fresh grid and full snapshots supersede each other without resurrecting an old rescheduled date", async () => {
  const h = await createHarness({ calendarProjection: true });
  const entriesBefore = JSON.stringify(h.entries);
  await h.get("?history=all&tab=1");
  h.staff.assignments.find(row => row.entryId === "order-00009").scheduleDate = "2110-07-15";
  const query = "?section=calendar&view=month&date=2110-07-15&calendarCompact=1";
  const fresh = (await h.get(query)).body.context;
  assert.equal(fresh.calendarSummary.orderCountByDate["2110-07-15"], 1);
  const cached = (await h.get(query + "&tab=1")).body.context;
  assert.deepEqual(cached.calendarSummary, fresh.calendarSummary, "an older full cache cannot override a fresh grid");
  const complete = (await h.get("?history=all&tab=1")).body.context;
  assert.equal(complete.assignedOrders.find(item => item.entry.id === "order-00009").scheduleDate, "2110-07-15");
  h.staff.assignments.find(row => row.entryId === "order-00009").scheduleDate = "2111-08-16";
  await h.get("?section=calendar&view=month&date=2111-08-16&calendarFull=1");
  const latest = (await h.get("?section=calendar&view=month&date=2111-08-16&calendarCompact=1&tab=1")).body.context;
  assert.equal(latest.calendarSummary.orderCountByDate["2111-08-16"], 1);
  assert.equal(latest.calendarSummary.orderCountByDate["2110-07-15"], undefined);
  assert.equal(JSON.stringify(h.entries), entriesBefore, "only synthetic assignment dates changed, never entry amounts or payroll");
});

function sectionHtml(html, attribute) {
  function find(node) {
    if (node.attrs?.some(attr => attr.name === attribute)) return node;
    return (node.childNodes || []).map(find).find(Boolean);
  }
  const node = find(parse(html));
  assert.ok(node, attribute);
  return serializeOuter(node);
}

test("compact calendar is opt-in from mobile controls; desktop, full and focused URLs keep complete preparation", async () => {
  const h = await createHarness();
  const before = h.snapshot();
  const query = "?section=calendar&view=month&date=2099-01-10";
  const full = (await h.get(query)).body;
  assert.equal(full.context.calendarSummary, undefined);
  assert.ok(full.context.assignedOrders.length > 1);
  const html = renderers.renderCalendarPage(full.context, full.options);
  assert.match(html, /<table\b/);
  assert.doesNotMatch(html, /data-account-calendar-orders-source/);
  const mobile = parse(sectionHtml(html, "data-account-mobile-calendar"));
  const monthLinks = [];
  function visit(node) {
    const href = node.tagName === "a" && node.attrs?.find(attr => attr.name === "href")?.value;
    if (href && href.includes("view=month")) monthLinks.push(new URL(href, "http://localhost"));
    (node.childNodes || []).forEach(visit);
  }
  visit(mobile);
  assert.equal(monthLinks.length, 34, "month toggle, previous/next month and all 31 day links");
  assert.ok(monthLinks.every(url => url.searchParams.get("calendarCompact") === "1"));
  for (const suffix of ["&calendarCompact=0", "&calendarCompact=1&calendarFull=1"]) {
    const result = (await h.get(query + suffix)).body;
    assert.equal(result.context.calendarSummary, undefined);
    assert.deepEqual(result.context.assignedOrders, full.context.assignedOrders);
    assert.equal(renderers.renderCalendarPage(result.context, result.options), html);
  }
  const focused = (await h.get(query + "&calendarCompact=1&order=order-00009")).body;
  assert.equal(focused.context.calendarSummary, undefined, "full-order links never become a counts-only grid");
  const day = (await h.get("?section=calendar&date=2099-01-10&calendarCompact=1")).body;
  assert.equal(day.context.calendarSummary, undefined, "the compact parameter cannot change day-view preparation");
  assert.equal(h.snapshot(), before);
});

test("compact month preserves every date, count and availability without preparing any order details", async () => {
  const h = await createHarness();
  h.staff.staff.find(person => person.id === "a").availabilityBlocks = [{ id: "busy", date: "2099-01-10", startTime: "09:00", endTime: "13:00", source: "manual" }];
  const before = h.snapshot();
  const baseline = (await h.get("")).body.context;
  const allVisible = baseline.assignedOrders.filter(isAccountCalendarOrderVisible);
  const months = [...new Set(allVisible.map(getAccountCalendarOrderDate).filter(Boolean).map(date => date.slice(0, 7)))];
  const planningReads = h.metrics.planning.length;
  const settingsReads = h.metrics.settingsReads;
  const metaReads = h.metrics.calendarMetaReads;
  h.control.failSettings = true;
  for (const month of [...months, "2050-01"]) {
    const response = await h.get(`?section=calendar&view=month&date=${month}-01&calendarCompact=1`);
    assert.equal(response.status, 200);
    const { context, options } = response.body;
    assert.deepEqual(context.assignedOrders, []);
    assert.equal(context.assignmentCount, allVisible.length);
    const expectedCounts = {};
    for (const item of allVisible) {
      const date = getAccountCalendarOrderDate(item);
      if (date.startsWith(month)) expectedCounts[date] = (expectedCounts[date] || 0) + 1;
    }
    assert.deepEqual(context.calendarSummary.orderCountByDate, expectedCounts);
    const html = renderers.renderCalendarPage(context, options);
    const old = renderers.renderCalendarPage(baseline, options);
    assert.equal(sectionHtml(html, "data-account-mobile-calendar"), sectionHtml(old, "data-account-mobile-calendar"));
    assert.doesNotMatch(html, /<table\b|Test Client|<form\b[^>]*data-account-checklist-editor/);
    assert.match(html, /fragment=calendar-orders/);
    assert.match(html, /calendarFull=1/);
    if (month === "2099-01") assert.match(html, /account-mobile-calendar-busy-dot/);
  }
  assert.equal(h.metrics.planning.length, planningReads);
  assert.equal(h.metrics.settingsReads, settingsReads);
  assert.equal(h.metrics.calendarMetaReads, metaReads);
  assert.equal(h.snapshot(), before);
});

test("selected month days retain the original cards, teams and earnings while planning only that day", async () => {
  const h = await createHarness();
  const before = h.snapshot();
  const baseline = (await h.get("")).body.context;
  const allVisible = baseline.assignedOrders.filter(isAccountCalendarOrderVisible);
  const dates = [...new Set(allVisible.map(getAccountCalendarOrderDate).filter(Boolean))];
  for (const date of [dates[0], "2099-01-10", "2099-01-01", "2103-01-01", "2103-02-01", dates.at(-1), "2050-01-01"]) {
    const response = await h.get(`?section=calendar&view=month&date=${date}&showDay=1&calendarCompact=1`);
    const { context, options } = response.body;
    assert.equal(response.status, 200);
    const expected = allVisible.filter(item => getAccountCalendarOrderDate(item) === date);
    assert.deepEqual(context.assignedOrders, expected);
    assert.deepEqual(h.metrics.planning.at(-1).slice().sort(), expected.map(item => item.entry.id).sort());
    assert.equal(sectionHtml(renderers.renderCalendarPage(context, options), "data-account-mobile-calendar"),
      sectionHtml(renderers.renderCalendarPage(baseline, options), "data-account-mobile-calendar"));
  }
  assert.equal(h.snapshot(), before);
});

test("desktop calendar fragment retains the exact full month and all historical order HTML", async () => {
  const h = await createHarness();
  const before = h.snapshot();
  const baseline = (await h.get("")).body.context;
  const allVisible = baseline.assignedOrders.filter(isAccountCalendarOrderVisible);
  const months = [...new Set(allVisible.map(getAccountCalendarOrderDate).filter(Boolean).map(date => date.slice(0, 7)))];
  const seen = new Set();
  for (const month of [...months, "2050-01"]) {
    const response = await h.get(`?section=calendar&view=month&date=${month}-01&fragment=calendar-orders`);
    assert.equal(response.status, 200);
    assert.equal(response.body.page, "CalendarOrdersFragment");
    const { context, options } = response.body;
    const expected = allVisible.filter(item => getAccountCalendarOrderDate(item).startsWith(month));
    assert.deepEqual(context.assignedOrders, expected);
    assert.equal(context.calendarSummary, undefined);
    assert.equal(renderers.renderCalendarOrdersFragment(context, options), renderers.renderCalendarOrdersFragment(baseline, options));
    for (const item of expected) seen.add(item.entry.id);
  }
  assert.equal(seen.size, allVisible.length);
  assert.ok(seen.has("order-01106"));
  assert.equal(h.snapshot(), before);
  assert.equal((await h.get("?fragment=calendar-orders")).status, 400);
  assert.equal((await h.get("?section=calendar&fragment=calendar-orders")).status, 400);
  assert.equal((await h.get("?section=calendar&view=month&fragment=calendar-orders&order=other-order")).status, 404);
  h.control.failOrders = true;
  assert.equal((await h.get("?section=calendar&view=month&fragment=calendar-orders&tab=1")).status, 503);
  assert.equal((await h.get("?section=calendar&view=month")).status, 503);
});

function calendarLoaderHarness({ wide = false, ok = true, valid = true } = {}) {
  const state = { wide, ok, valid, reads: 0, replaced: 0, bound: 0 };
  const status = { textContent: "Loading", setAttribute(name, value) { this[name] = value; } };
  const target = { isConnected: true, getAttribute: () => "/account?section=calendar&view=month&fragment=calendar-orders",
    setAttribute() {}, removeAttribute() {}, querySelector: () => status,
    replaceWith() { state.replaced++; this.isConnected = false; } };
  let listener;
  const media = { get matches() { return state.wide; }, addEventListener(name, fn) { assert.equal(name, "change"); listener = fn; } };
  const html = renderers.renderCalendarPage({ user: { staffId: "a" }, staffRecord: { id: "a" }, assignedOrders: [],
    calendarSummary: { orderCountByDate: {} } }, { calendarView: "month", calendarDate: "2099-01-01" });
  function find(node) {
    if (node.tagName === "script" && node.childNodes.some(child => child.value?.includes("const target = document.querySelector('[data-account-calendar-orders-source]')"))) return node;
    return (node.childNodes || []).map(find).find(Boolean);
  }
  const script = find(parse(html)).childNodes.map(node => node.value || "").join("");
  vm.runInNewContext(script, {
    window: { matchMedia: query => { assert.equal(query, "(min-width: 721px)"); return media; },
      bindAccountInteractions() { state.bound++; } },
    document: { querySelector: () => target, importNode: node => node },
    fetch: async (url, options) => { assert.match(url, /fragment=calendar-orders/); assert.equal(options.credentials, "same-origin"); state.reads++; return { ok: state.ok, text: async () => "response" }; },
    DOMParser: class { parseFromString() { return { querySelector: () => state.valid ? { childNodes: [{}] } : null }; } },
  });
  return { state, status, resize(value) { state.wide = value; listener(); },
    flush: () => new Promise(resolve => setImmediate(resolve)) };
}

test("desktop loader does not fetch on mobile and loads once after resizing, rebinding existing actions", async () => {
  const h = calendarLoaderHarness();
  await h.flush();
  assert.equal(h.state.reads, 0);
  h.resize(true);
  h.resize(true);
  await h.flush();
  assert.equal(h.state.reads, 1);
  assert.equal(h.state.replaced, 1);
  assert.equal(h.state.bound, 1);
  h.resize(false);
  h.resize(true);
  await h.flush();
  assert.equal(h.state.reads, 1);
});

test("desktop loader keeps the ordinary full-calendar link on failures or redirected login HTML", async () => {
  for (const options of [{ wide: true, ok: false }, { wide: true, valid: false }]) {
    const h = calendarLoaderHarness(options);
    await h.flush();
    assert.equal(h.state.replaced, 0);
    assert.equal(h.status.role, "alert");
    assert.equal(h.status.textContent, "Не удалось загрузить заказы.");
    h.state.ok = true;
    h.state.valid = true;
    h.resize(true);
    await h.flush();
    assert.equal(h.state.replaced, 1);
  }
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
