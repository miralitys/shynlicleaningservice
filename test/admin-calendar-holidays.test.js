"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { getAdminYearHolidays, buildAdminCalendarHolidayMap } = require("../lib/admin/calendar-holidays");
const { createStaffScheduleUiHelpers } = require("../lib/admin/pages/staff-schedule-ui-renderers");
const { createStaffRuntimeScripts } = require("../lib/admin/pages/staff-runtime-script-clusters");

test("US federal holidays match the published OPM observed dates for 2026", () => {
  const holidays = getAdminYearHolidays(2026);
  for (const date of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03",
    "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"])
    assert(holidays.some(h => h.date === date && (h.type === "public" || h.type === "bank")), date);
  assert(holidays.some(h => h.date === "2026-07-04" && !h.observed && h.name === "Independence Day"));
  assert(holidays.some(h => h.date === "2026-07-03" && h.observed && !h.preholiday));
  assert.equal(holidays.filter(h => !h.observed).length, 20);
  assert.equal(new Set(holidays.map(h => h.id)).size, holidays.length);
});

test("movable dates and actual/observed dates remain separate across years", () => {
  for (const [year, dates] of [[2026, ["2026-04-05", "2026-05-10", "2026-11-26", "2026-11-27"]],
    [2027, ["2027-03-28", "2027-05-09", "2027-11-25", "2027-11-26"]]]) {
    const holidays = getAdminYearHolidays(year);
    for (const date of dates) assert(holidays.some(h => h.date === date), date);
  }
  assert(getAdminYearHolidays(2027).some(h => h.date === "2027-12-31" && h.name === "New Year's Day" && h.observed));
  assert(getAdminYearHolidays(2028).some(h => h.date === "2028-11-10" && h.name === "Veterans Day" && h.observed));
  assert(!getAdminYearHolidays(2020).some(h => h.name === "Juneteenth"));
  assert(Object.isFrozen(getAdminYearHolidays(2026)));
  assert(Object.isFrozen(getAdminYearHolidays(2026)[0]));
});

test("preholiday reminders cover exactly seven previous dates, including year boundaries", () => {
  const days = ["2026-11-18", "2026-11-19", "2026-11-25", "2026-11-26", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
  const map = buildAdminCalendarHolidayMap(days.map(dateValue => ({ dateValue })));
  const isBefore = (date, name) => map.get(date).upcoming.some(h => h.name === name);
  assert.equal(isBefore("2026-11-18", "Thanksgiving Day"), false);
  assert.equal(isBefore("2026-11-19", "Thanksgiving Day"), true);
  assert.equal(isBefore("2026-11-25", "Thanksgiving Day"), true);
  assert.equal(isBefore("2026-11-26", "Thanksgiving Day"), false);
  assert.equal(isBefore("2026-12-24", "New Year's Day"), false);
  assert.equal(isBefore("2026-12-25", "New Year's Day"), true);
  assert.equal(isBefore("2026-12-31", "New Year's Day"), true);
  assert.equal(isBefore("2027-01-01", "New Year's Day"), false);
  assert.equal(map.size, days.length);
  assert.equal(buildAdminCalendarHolidayMap([null, undefined, "bad", "2026-02-30"]).size, 0);
  assert.deepEqual(getAdminYearHolidays(2200), []);
});

function calendarHelpers() {
  const escape = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return createStaffScheduleUiHelpers({ ADMIN_STAFF_PATH: "/admin/staff", STAFF_TEAM_CALENDAR_TIME_ZONE: "America/Chicago",
    escapeHtml: escape, escapeHtmlAttribute: escape, normalizeString: (v, max = 500) => String(v || "").trim().slice(0, max),
    formatAdminClockTime: v => v, formatAdminServiceLabel: v => v || "Cleaning", formatAssignmentStatusLabel: v => v,
    formatOrderCountLabel: n => `${n} заказов`, buildAdminRedirectPath: (path, params) => `${path}?${new URLSearchParams(params)}` });
}

test("holiday labels are separate from appointments in day, two-week and month calendars", () => {
  const helpers = calendarHelpers();
  for (const view of ["day", "week", "month"]) for (const canEdit of [true, false]) {
    const staff = [{ id: "cleaner-1", name: "Test Cleaner", assignedOrders: [{
      entry: { id: "order-1", customerName: "Test Client", serviceName: "Deep", totalPrice: 417 },
      scheduleDate: "2026-11-26", scheduleTime: "09:00", assignmentStatus: "confirmed", payrollOverrides: { "cleaner-1": 200 },
    }], calendarAvailabilityBlocks: [] }];
    const original = JSON.stringify(staff);
    const html = helpers.renderStaffTeamCalendarTable(staff, "2026-11-26", { view, canEdit });
    assert.match(html, /Показывать праздники/);
    assert.match(html, /data-admin-calendar-holiday-layer="true"/);
    assert.match(html, /День благодарения/);
    assert.match(html, /Test Client/);
    assert.equal(JSON.stringify(staff), original);
    assert.doesNotMatch(html, /data-admin-dialog-open="[^"\n]*Thanksgiving/);
    assert.equal((html.match(/data-admin-calendar-holiday="Thanksgiving Day\/2026-11-26\/actual"/g) || []).length, 1);
    if (!canEdit) assert.doesNotMatch(html, /<form\b|data-admin-dialog-open=/);
  }
});

function runtimeHarness(storageBlocked = false) {
  const handlers = {}, values = new Map(), classes = new Set();
  const toggle = { checked: true }, lowLoad = { checked: false };
  const shell = { dataset: {}, addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: selector => selector.includes("holidays-toggle") ? toggle : selector.includes("low-load-toggle") ? lowLoad : null,
    querySelectorAll: () => [], classList: { contains: name => classes.has(name), add: name => classes.add(name),
      remove: name => classes.delete(name), toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); } } };
  Object.defineProperty(shell, "innerHTML", { set: () => { toggle.checked = true; } });
  let reads = 0;
  const window = { addEventListener() {}, history: { pushState() {} }, location: { href: "/admin/staff" },
    localStorage: { getItem: key => { if (storageBlocked) throw new Error("blocked"); return values.get(key); },
      setItem: (key, value) => { if (storageBlocked) throw new Error("blocked"); values.set(key, value); } } };
  const document = { querySelectorAll: () => [shell], addEventListener() {}, body: { classList: shell.classList } };
  const script = createStaffRuntimeScripts().renderStaffTeamCalendarDragScript().replace(/^<script>|<\/script>$/g, "");
  vm.runInNewContext(script, { window, document, fetch: async () => { reads++; return { ok: true, text: async () => "calendar" }; },
    DOMParser: class { parseFromString() { return { querySelector: () => ({ innerHTML: "calendar" }) }; } } });
  return { handlers, toggle, classes, values, reads: () => reads };
}

test("holiday toggle changes only the layer, persists preference and survives AJAX navigation", async () => {
  for (const blocked of [false, true]) {
    const app = runtimeHarness(blocked);
    app.toggle.checked = false;
    app.toggle.matches = selector => selector.includes("holidays-toggle");
    app.handlers.change({ target: app.toggle });
    assert(app.classes.has("admin-team-calendar-hide-holidays"));
    assert.equal(app.reads(), 0);
    if (!blocked) assert.equal(app.values.get("shynli.adminCalendar.showHolidays"), "0");
    const link = { href: "/admin/staff?section=calendar&calendarStart=2026-12-01" };
    await app.handlers.click({ target: { closest: selector => selector.includes("calendar-nav") ? link : null }, preventDefault() {} });
    assert.equal(app.reads(), 1);
    assert.equal(app.toggle.checked, false);
    assert(app.classes.has("admin-team-calendar-hide-holidays"));
    app.toggle.checked = true;
    app.handlers.change({ target: app.toggle });
    assert(!app.classes.has("admin-team-calendar-hide-holidays"));
    assert.equal(app.reads(), 1);
  }
});
