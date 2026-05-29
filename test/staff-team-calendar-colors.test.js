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
  const days = helpers.buildStaffTeamCalendarWindow("2026-05-28", "month");
  const requestedDayWindow = helpers.buildStaffTeamCalendarWindow("2026-05-29", "month");
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "ramis",
        name: "Ramis Iaparov",
        role: "Клинер",
        assignedOrders: [],
      },
    ],
    "2026-05-28",
    { view: "month" }
  );

  assert.equal(helpers.normalizeStaffTeamCalendarView("month"), "month");
  assert.equal(helpers.getStaffTeamCalendarViewDayCount("month"), 63);
  assert.equal(days.length, 62);
  assert.equal(days[0].dateValue, "2026-04-28");
  assert.equal(days[30].dateValue, "2026-05-28");
  assert.equal(days[61].dateValue, "2026-06-28");
  assert.equal(requestedDayWindow[0].dateValue, "2026-04-29");
  assert.equal(requestedDayWindow[requestedDayWindow.length - 1].dateValue, "2026-06-29");
  assert.match(html, /1 месяц/);
  assert.match(html, /calendarView=month/);
  assert.match(html, /calendarStart=2026-04-28&amp;calendarView=month/);
  assert.match(html, /calendarStart=2026-06-28&amp;calendarView=month/);
  assert.match(html, /admin-team-calendar-view-link-active[^>]*>1 месяц/);
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
