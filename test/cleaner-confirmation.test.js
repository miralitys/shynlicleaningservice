"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const {
  buildCleanerConfirmationUpdate,
  getCleanerConfirmationDisplay,
  getStaffCleanerConfirmationState,
  localDateTimeToInstant,
} = require("../lib/cleaner-confirmation");
const { getEnRouteActionWindowState } = require("../lib/account/assignment-action-window");

function loadWithCountingFormatters() {
  let count = 0;
  const intl = Object.create(Intl);
  intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
    construct(target, args) {
      count++;
      return new target(...args);
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/cleaner-confirmation"), "utf8"), {
    module, exports: module.exports, Intl: intl, Date,
  });
  return { api: module.exports, count: () => count };
}

function createScheduledEntry(dateValue, timeValue) {
  return {
    id: "entry-1",
    selectedDate: dateValue,
    selectedTime: timeValue,
    fullAddress: "1289 E Higgins Rd, Schaumburg, IL 60173",
    serviceName: "Deep Cleaning",
    payloadForRetry: {
      adminOrder: {},
    },
  };
}

function createAssignment(dateValue, timeValue, staffIds = ["staff-1"]) {
  return {
    entryId: "entry-1",
    scheduleDate: dateValue,
    scheduleTime: timeValue,
    staffIds,
  };
}

test("keeps cleaner confirmation pending before the 24 hour threshold", () => {
  const now = new Date("2026-04-25T14:00:00.000Z");
  const entry = createScheduledEntry("2026-04-27", "10:00");
  const assignment = createAssignment("2026-04-27", "10:00");

  const confirmationState = getStaffCleanerConfirmationState(entry, assignment, "staff-1", { now });
  const confirmationDisplay = getCleanerConfirmationDisplay(entry, assignment, { now });

  assert.equal(confirmationState.status, "pending");
  assert.equal(confirmationState.automatic, false);
  assert.equal(confirmationDisplay.label, "Ждёт подтверждения");
  assert.equal(confirmationDisplay.tone, "outline");
});

test("auto-confirms cleaner confirmation inside the 24 hour threshold", () => {
  const now = new Date("2026-04-26T16:00:00.000Z");
  const entry = createScheduledEntry("2026-04-27", "10:00");
  const assignment = createAssignment("2026-04-27", "10:00");

  const confirmationState = getStaffCleanerConfirmationState(entry, assignment, "staff-1", { now });
  const confirmationDisplay = getCleanerConfirmationDisplay(entry, assignment, { now });

  assert.equal(confirmationState.status, "confirmed");
  assert.equal(confirmationState.automatic, true);
  assert.equal(confirmationDisplay.label, "Подтверждено");
  assert.equal(confirmationDisplay.tone, "warning");
});

test("keeps declined cleaner confirmation red even inside the 24 hour threshold", () => {
  const now = new Date("2026-04-26T16:00:00.000Z");
  const entry = createScheduledEntry("2026-04-27", "10:00");
  const assignment = createAssignment("2026-04-27", "10:00");
  const cleanerConfirmation = buildCleanerConfirmationUpdate(entry, assignment, "staff-1", "declined");
  entry.payloadForRetry.adminOrder.cleanerConfirmation = cleanerConfirmation;

  const confirmationState = getStaffCleanerConfirmationState(entry, assignment, "staff-1", { now });
  const confirmationDisplay = getCleanerConfirmationDisplay(entry, assignment, { now });

  assert.equal(confirmationState.status, "declined");
  assert.equal(confirmationState.automatic, false);
  assert.equal(confirmationDisplay.label, "Не подтвердил");
  assert.equal(confirmationDisplay.tone, "danger");
});

test("reuses the same time-zone formatter without caching converted dates", () => {
  const { api, count } = loadWithCountingFormatters();
  for (let day = 1; day <= 28; day++) {
    const date = `2026-06-${String(day).padStart(2, "0")}`;
    assert.equal(api.localDateTimeToInstant(date, "09:00").date.toISOString(), `${date}T14:00:00.000Z`);
  }
  assert.equal(count(), 1);
  assert.equal(api.localDateTimeToInstant("2026-12-01", "09:00").date.toISOString(), "2026-12-01T15:00:00.000Z");
  assert.equal(count(), 1);
  assert.equal(api.localDateTimeToInstant("2026-12-01", "09:00", "UTC").date.toISOString(), "2026-12-01T09:00:00.000Z");
  assert.equal(count(), 2);
});

test("bounds the formatter cache and does not swallow invalid time-zone errors", () => {
  const { api, count } = loadWithCountingFormatters();
  const zones = Intl.supportedValuesOf("timeZone").slice(0, 17);
  zones.forEach(zone => api.localDateTimeToInstant("2026-06-01", "09:00", zone));
  assert.equal(count(), 17);
  api.localDateTimeToInstant("2026-06-01", "09:00", zones[0]);
  assert.equal(count(), 18, "the oldest formatter was evicted, not retained indefinitely");
  for (let i = 0; i < 2; i++) {
    assert.throws(() => api.localDateTimeToInstant("2026-06-01", "09:00", "Invalid/Zone"), RangeError);
  }
  assert.equal(count(), 20);
});

test("does not cache a mutable non-string time-zone argument", () => {
  const { api } = loadWithCountingFormatters();
  let zone = "America/Chicago";
  const value = { toString: () => zone };
  assert.equal(api.localDateTimeToInstant("2026-06-01", "09:00", value).date.toISOString(), "2026-06-01T14:00:00.000Z");
  zone = "America/Los_Angeles";
  assert.equal(api.localDateTimeToInstant("2026-06-01", "09:00", value).date.toISOString(), "2026-06-01T16:00:00.000Z");
});

test("keeps Chicago daylight-saving conversion and exact action boundaries", () => {
  for (const [day, time, iso] of [
    ["2026-03-08", "01:30", "2026-03-08T07:30:00.000Z"],
    ["2026-03-08", "03:30", "2026-03-08T08:30:00.000Z"],
    ["2026-11-01", "01:30", "2026-11-01T06:30:00.000Z"],
    ["2026-11-01", "02:30", "2026-11-01T08:30:00.000Z"],
  ]) {
    assert.equal(localDateTimeToInstant(day, time).date.toISOString(), iso);
    const entry = createScheduledEntry(day, time);
    const assignment = createAssignment(day, time);
    const start = Date.parse(iso);
    for (const delta of [-1, 0, 1]) {
      const now = new Date(start - 24 * 60 * 60 * 1000 + delta);
      assert.equal(getStaffCleanerConfirmationState(entry, assignment, "staff-1", { now }).automatic, delta >= 0);
      const enRouteNow = new Date(start - 2 * 60 * 60 * 1000 + delta);
      assert.equal(getEnRouteActionWindowState({ entry, assignment }, { now: enRouteNow }).allowed, delta >= 0);
    }
  }
});
