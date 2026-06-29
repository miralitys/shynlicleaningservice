"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStaffScheduleUiHelpers } = require("../lib/admin/pages/staff-schedule-ui-renderers");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createCalendarHelpers() {
  return createStaffScheduleUiHelpers({
    ADMIN_STAFF_PATH: "/admin/staff",
    STAFF_TEAM_CALENDAR_TIME_ZONE: "America/Chicago",
    escapeHtml,
    escapeHtmlAttribute: escapeHtml,
    formatAdminClockTime: (value) => value,
    formatAdminServiceLabel: (value) => value || "Cleaning",
    formatAssignmentStatusLabel: (value) => value || "planned",
    formatOrderCountLabel: (count) => `${count} заказов`,
    renderAdminDialogCloseButton: (dialogId) => `<button data-admin-dialog-close="${escapeHtml(dialogId)}">x</button>`,
    buildAdminRedirectPath: (path, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return query ? `${path}?${query}` : path;
    },
    normalizeString,
  });
}

test("assigns unique team calendar colors to each cleaner", () => {
  const helpers = createCalendarHelpers();
  const staffSummaries = Array.from({ length: 12 }, (_, index) => ({
    id: `staff-${index}`,
    name: `Cleaner ${index}`,
    calendarColor: index < 2 ? "#2563eb" : "",
  }));

  const colorMap = helpers.buildStaffTeamCalendarColorMap(staffSummaries);
  const colors = Array.from(colorMap.values()).map((color) => color.color);

  assert.equal(colors.length, staffSummaries.length);
  assert.equal(new Set(colors).size, staffSummaries.length);
});

test("renders a one month team calendar view toggle", () => {
  const helpers = createCalendarHelpers();
  const days = helpers.buildStaffTeamCalendarWindow("2026-05-29", "month");
  const monthWindows = helpers.buildStaffTeamCalendarMonthScrollWindows("2026-05-29");
  const requestedDayWindow = helpers.buildStaffTeamCalendarWindow("2026-05-29", "month");
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "ramis",
        name: "Ramis Iaparov",
        role: "Клинер",
        assignedOrders: [
          {
            scheduleDate: "2026-05-29",
            scheduleTime: "10:00",
            scheduleTimestamp: Date.UTC(2026, 4, 29, 15, 0, 0),
            assignmentStatus: "confirmed",
            entry: {
              id: "order-month",
              customerName: "Month Customer",
              serviceName: "Standard",
            },
          },
        ],
      },
    ],
    "2026-05-29",
    { view: "month" }
  );

  assert.equal(helpers.normalizeStaffTeamCalendarView("month"), "month");
  assert.equal(helpers.getStaffTeamCalendarViewDayCount("month"), 42);
  assert.equal(days.length, 35);
  assert.equal(days[0].dateValue, "2026-04-27");
  assert.equal(days[4].dateValue, "2026-05-01");
  assert.equal(days[32].dateValue, "2026-05-29");
  assert.equal(days[34].dateValue, "2026-05-31");
  assert.equal(monthWindows.length, 3);
  assert.equal(monthWindows[0].monthStartDate, "2026-04-01");
  assert.equal(monthWindows[1].monthStartDate, "2026-05-01");
  assert.equal(monthWindows[2].monthStartDate, "2026-06-01");
  assert.equal(monthWindows[1].isAnchorMonth, true);
  assert.equal(requestedDayWindow[0].dateValue, "2026-04-27");
  assert.equal(requestedDayWindow[requestedDayWindow.length - 1].dateValue, "2026-05-31");
  assert.match(html, /Май 2026/);
  assert.match(html, /Апрель 2026/);
  assert.match(html, /Июнь 2026/);
  assert.match(html, /1 месяц/);
  assert.match(html, /calendarView=month/);
  assert.match(html, /calendarStart=2026-04-29&amp;calendarView=month/);
  assert.match(html, /calendarStart=2026-06-29&amp;calendarView=month/);
  assert.match(html, /admin-team-calendar-view-link-active[^>]*>1 месяц/);
  assert.match(html, /admin-team-calendar-month-scroll/);
  assert.match(html, /data-admin-team-calendar-month-section="current"/);
  assert.match(html, /admin-team-calendar-month-grid/);
  assert.match(html, /admin-team-calendar-month-day-outside/);
  assert.match(html, /admin-team-calendar-month-day-anchor/);
  assert.match(html, /admin-team-calendar-month-event/);
  assert.match(html, /Month Customer/);
  assert.doesNotMatch(html, /class="admin-table admin-team-calendar-table"/);
});

test("marks today in the team calendar date column", () => {
  const helpers = createCalendarHelpers();
  const todayDate = helpers.getStaffCalendarTodayDateValue();
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "ramis",
        name: "Ramis Iaparov",
        role: "Клинер",
        assignedOrders: [],
      },
    ],
    todayDate,
    { view: "day" }
  );

  assert.match(html, /class="admin-team-calendar-today-row"/);
  assert.match(html, /data-admin-team-calendar-today="true"/);
  assert.match(html, /class="admin-team-calendar-today-label">сегодня<\/span>/);
});

test("renders empty cleaner day cells as double-click unavailable targets", () => {
  const helpers = createCalendarHelpers();
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "ramis",
        name: "Ramis Iaparov",
        role: "Клинер",
        assignedOrders: [],
      },
    ],
    "2026-07-06",
    { view: "day" }
  );

  assert.match(html, /data-admin-team-calendar-empty="true"/);
  assert.match(html, /data-admin-team-calendar-cleaner-id="ramis"/);
  assert.match(html, /data-admin-team-calendar-cleaner-name="Ramis Iaparov"/);
  assert.match(html, /data-admin-team-calendar-date="2026-07-06"/);
  assert.match(html, /role="button"/);
  assert.match(html, /data-admin-team-calendar-unavailable-dialog="true"/);
  assert.match(html, /name="action" value="save-staff-unavailable-day"/);
  assert.match(html, /name="calendarStart" value="2026-07-06"/);
  assert.match(html, /name="calendarView" value="day"/);
});

test("renders manual unavailable blocks with a clear action", () => {
  const helpers = createCalendarHelpers();
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "ramis",
        name: "Ramis Iaparov",
        role: "Клинер",
        assignedOrders: [],
        calendarAvailabilityBlocks: [
          {
            source: "manual",
            date: "2026-07-06",
            startDate: "2026-07-06",
            endDate: "2026-07-07",
            allDay: true,
            summary: "Vacation",
          },
        ],
      },
    ],
    "2026-07-06",
    { view: "day" }
  );

  assert.match(html, /admin-team-calendar-entry-unavailable/);
  assert.match(html, />Vacation<\/strong>/);
  assert.match(html, /name="action" value="clear-staff-unavailable-day"/);
  assert.match(html, /name="availabilityDate" value="2026-07-06"/);
  assert.doesNotMatch(html, /data-admin-team-calendar-empty="true"/);
});

test("renders an assigned order only under the assigned cleaner with that cleaner color", () => {
  const helpers = createCalendarHelpers();
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "ramis",
        name: "Ramis Iaparov",
        role: "Клинер",
        assignedOrders: [
          {
            scheduleDate: "2026-05-04",
            scheduleTime: "09:00",
            assignmentStatus: "confirmed",
            entry: {
              id: "order-ramis",
              customerName: "Ramis Order",
              serviceName: "Standard",
            },
          },
        ],
      },
      {
        id: "anastasia",
        name: "Anastasiia Iaparova",
        role: "Админ",
        assignedOrders: [],
      },
    ],
    "2026-05-04",
    { view: "day" }
  );

  assert.match(html, /Ramis Iaparov/);
  assert.match(html, /Anastasiia Iaparova/);
  assert.match(
    html,
    /<td[\s\S]*?--admin-staff-color:#2563eb[\s\S]*?Ramis Order[\s\S]*?<\/td>\s*<td[\s\S]*?--admin-staff-color:#0f766e[\s\S]*?admin-team-calendar-empty/
  );
});
