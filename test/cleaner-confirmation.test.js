"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCleanerConfirmationUpdate,
  getCleanerConfirmationDisplay,
  getStaffCleanerConfirmationState,
} = require("../lib/cleaner-confirmation");

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
  assert.equal(confirmationDisplay.tone, "success");
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
