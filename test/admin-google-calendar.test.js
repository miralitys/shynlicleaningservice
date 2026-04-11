"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAssignmentScheduleWindow,
  sanitizeGoogleCalendarConnection,
  sanitizeGoogleCalendarSync,
  setGoogleCalendarEventLink,
  getGoogleCalendarEventLink,
} = require("../lib/admin-google-calendar");

test("builds timed and all-day schedule windows for Google Calendar sync", () => {
  const timed = buildAssignmentScheduleWindow(
    { selectedDate: "2026-04-15", selectedTime: "09:30" },
    {},
    "America/Chicago",
    180
  );
  assert.equal(timed.hasWindow, true);
  assert.equal(timed.allDay, false);
  assert.match(timed.startDateTime, /^2026-04-15T09:30:00[+-]\d{2}:\d{2}$/);
  assert.match(timed.endDateTime, /^2026-04-15T12:30:00[+-]\d{2}:\d{2}$/);

  const allDay = buildAssignmentScheduleWindow(
    { selectedDate: "2026-04-16", selectedTime: "" },
    {},
    "America/Chicago",
    180
  );
  assert.equal(allDay.hasWindow, true);
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.startDate, "2026-04-16");
  assert.equal(allDay.endDate, "2026-04-17");
});

test("sanitizes calendar connection data and keeps per-staff event links", () => {
  const connection = sanitizeGoogleCalendarConnection({
    provider: "google",
    status: "connected",
    accountEmail: "Cleaner@example.com",
    workCalendarId: "work-cal-1",
    unavailableCalendarId: "dayoff-cal-1",
    tokenCipher: {
      version: 1,
      salt: "aa",
      iv: "bb",
      tag: "cc",
      data: "dGVzdA==",
    },
  });

  assert.equal(connection.accountEmail, "cleaner@example.com");

  let syncState = sanitizeGoogleCalendarSync(null);
  syncState = setGoogleCalendarEventLink(syncState, "staff-1", {
    eventId: "evt-1",
    calendarId: "work-cal-1",
  });
  syncState = setGoogleCalendarEventLink(syncState, "staff-2", {
    eventId: "evt-2",
    calendarId: "work-cal-2",
  });
  syncState = setGoogleCalendarEventLink(syncState, "staff-1", null);

  assert.equal(getGoogleCalendarEventLink(syncState, "staff-1"), null);
  assert.equal(getGoogleCalendarEventLink(syncState, "staff-2").eventId, "evt-2");
});
