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

test("renders empty cleaner day cells with a busy menu checkbox", () => {
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
  assert.match(html, /data-admin-team-calendar-menu="true"/);
  assert.match(html, /data-admin-team-calendar-menu-summary="true"/);
  assert.match(html, /data-admin-team-calendar-busy-checkbox="true"/);
  assert.match(html, />Занят<\/span>/);
  assert.match(html, /name="action" value="save-staff-unavailable-day"/);
  assert.match(html, /data-admin-team-calendar-busy-settings="true"[\s\S]*hidden/);
  assert.match(html, /name="availabilityMode"/);
  assert.match(html, /<option value="all-day" selected>Весь день<\/option>/);
  assert.match(html, /<option value="time-range">С … до …<\/option>/);
  assert.match(html, /name="availabilityStartTime"[\s\S]*?value="09:00"/);
  assert.match(html, /name="availabilityEndTime"[\s\S]*?value="13:00"/);
  assert.match(html, />Сохранить<\/button>/);
  assert.match(html, /name="calendarStart" value="2026-07-06"/);
  assert.match(html, /name="calendarView" value="day"/);
  assert.doesNotMatch(html, /Дважды нажмите/);
  assert.doesNotMatch(html, /data-admin-team-calendar-unavailable-dialog="true"/);
});

test("renders manual unavailable blocks with editable busy controls", () => {
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
  assert.match(html, /admin-team-calendar-entry-unavailable-all-day/);
  assert.match(html, /--admin-team-calendar-entry-top:0\.000%;--admin-team-calendar-entry-height:100\.000%/);
  assert.match(html, />Vacation<\/strong>/);
  assert.match(html, /name="action" value="save-staff-unavailable-day"/);
  assert.match(html, /name="availabilityDate" value="2026-07-06"/);
  assert.match(html, /data-admin-team-calendar-busy-checkbox="true"[\s\S]*checked/);
  assert.match(html, /data-admin-team-calendar-busy-settings="true"/);
  assert.doesNotMatch(html, /data-admin-team-calendar-empty="true"/);
});

test("renders a timed unavailable interval in the cleaner calendar", () => {
  const helpers = createCalendarHelpers();
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "anastasiia",
        name: "Anastasiia Iaparova",
        role: "Клинер",
        assignedOrders: [],
        calendarAvailabilityBlocks: [
          {
            source: "manual",
            date: "2026-07-06",
            startDate: "2026-07-06",
            endDate: "2026-07-07",
            allDay: false,
            startTime: "08:00",
            endTime: "13:00",
            startMs: Date.UTC(2026, 6, 6, 8, 0, 0),
            endMs: Date.UTC(2026, 6, 6, 13, 0, 0),
            summary: "Занята до обеда",
          },
        ],
      },
    ],
    "2026-07-06",
    { view: "day" }
  );

  assert.match(html, />08:00 – 13:00<\/span>/);
  assert.match(html, /--admin-team-calendar-entry-top:0\.000px;--admin-team-calendar-entry-height:79\.167px/);
  assert.match(html, /<option value="time-range" selected>С … до …<\/option>/);
  assert.match(html, /name="availabilityStartTime"[\s\S]*?value="08:00"/);
  assert.match(html, /name="availabilityEndTime"[\s\S]*?value="13:00"/);
});

test("aligns matching appointment times across cleaner columns", () => {
  const helpers = createCalendarHelpers();
  const sharedOrder = (id) => ({
    scheduleDate: "2026-08-07",
    scheduleTime: "12:00",
    scheduleTimestamp: Date.UTC(2026, 7, 7, 17, 0, 0),
    assignmentStatus: "planned",
    entry: {
      id,
      customerName: "Mankawalpreet Wazir",
      serviceName: "General cleaning",
    },
  });
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "anastasiia",
        name: "Anastasiia Iaparova",
        assignedOrders: [sharedOrder("order-anastasiia")],
        calendarAvailabilityBlocks: [],
      },
      {
        id: "tolkun",
        name: "Tolkun Muratbekkyzy",
        assignedOrders: [sharedOrder("order-tolkun")],
        calendarAvailabilityBlocks: [
          {
            source: "manual",
            startDate: "2026-08-07",
            endDate: "2026-08-08",
            allDay: false,
            startTime: "09:00",
            endTime: "11:00",
            startMs: Date.UTC(2026, 7, 7, 14, 0, 0),
            endMs: Date.UTC(2026, 7, 7, 16, 0, 0),
            summary: "Не может выйти на работу",
          },
        ],
      },
    ],
    "2026-08-07",
    { view: "day" }
  );

  const anastasiiaCell =
    html.match(/<td[\s\S]*?data-admin-team-calendar-cleaner-name="Anastasiia Iaparova"[\s\S]*?<\/td>/)?.[0] || "";
  const tolkunCell =
    html.match(/<td[\s\S]*?data-admin-team-calendar-cleaner-name="Tolkun Muratbekkyzy"[\s\S]*?<\/td>/)?.[0] || "";

  const anastasiiaOrderTop = anastasiiaCell.match(/Mankawalpreet Wazir[\s\S]*?/) &&
    anastasiiaCell.match(/style="[^"]*--admin-team-calendar-entry-top:([\d.]+)px[^"]*"[\s\S]*?Mankawalpreet Wazir/)?.[1];
  const tolkunOrderTop = tolkunCell.match(/style="[^"]*--admin-team-calendar-entry-top:([\d.]+)px[^"]*"[\s\S]*?Mankawalpreet Wazir/)?.[1];
  assert.ok(anastasiiaOrderTop);
  assert.equal(tolkunOrderTop, anastasiiaOrderTop);
  assert.match(tolkunCell, /--admin-team-calendar-entry-top:15\.833px[\s\S]*?Не может выйти на работу/);
});

test("keeps closely spaced short appointments from overlapping", () => {
  const helpers = createCalendarHelpers();
  const appointment = (id, customerName, scheduleTime) => ({
    scheduleDate: "2026-08-27",
    scheduleTime,
    assignmentStatus: "planned",
    serviceDurationMinutes: 30,
    entry: {
      id,
      customerName,
      serviceName: "Free in-home estimate",
    },
  });
  const html = helpers.renderStaffTeamCalendarTable(
    [
      {
        id: "tolkun",
        name: "Tolkun Muratbekkyzy",
        assignedOrders: [
          appointment("estimate-1", "Rebecca Payette", "13:00"),
          appointment("estimate-2", "Second Estimate", "13:30"),
          appointment("estimate-3", "Lissa Mares", "14:30"),
        ],
        calendarAvailabilityBlocks: [],
      },
    ],
    "2026-08-27",
    { view: "day" }
  );

  const positions = Array.from(
    html.matchAll(
      /--admin-team-calendar-entry-top:([\d.]+)px;--admin-team-calendar-entry-height:([\d.]+)px/g
    ),
    (match) => ({ top: Number(match[1]), height: Number(match[2]) })
  );

  assert.equal(positions.length, 3);
  assert.ok(positions[1].top >= positions[0].top + positions[0].height + 5.9);
  assert.ok(positions[2].top >= positions[1].top + positions[1].height + 5.9);
  assert.match(html, /--admin-team-calendar-timeline-height:253\.167px/);
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
  const ramisCell = html.match(/<td[\s\S]*?data-admin-team-calendar-cleaner-name="Ramis Iaparov"[\s\S]*?<\/td>/)?.[0] || "";
  const anastasiaCell =
    html.match(/<td[\s\S]*?data-admin-team-calendar-cleaner-name="Anastasiia Iaparova"[\s\S]*?<\/td>/)?.[0] || "";
  assert.match(ramisCell, /data-admin-team-calendar-menu="true"/);
  assert.match(ramisCell, /data-admin-team-calendar-busy-checkbox="true"/);
  assert.match(ramisCell, /name="availabilityDate" value="2026-05-04"/);
  assert.match(ramisCell, /<option value="time-range">С … до …<\/option>/);
  assert.match(ramisCell, /Ramis Order/);
  assert.match(anastasiaCell, /data-admin-team-calendar-menu="true"/);
});
