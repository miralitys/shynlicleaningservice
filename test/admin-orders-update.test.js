"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getScheduleSyncedAssignmentStatus,
  shouldAutoScheduleAssignedNewOrder,
  shouldResetRecurringFutureVisits,
} = require("../lib/admin/handlers-orders-update");

test("confirms assignments for scheduled orders", () => {
  assert.equal(getScheduleSyncedAssignmentStatus("scheduled", "planned"), "confirmed");
  assert.equal(getScheduleSyncedAssignmentStatus("scheduled", "canceled"), "confirmed");
  assert.equal(getScheduleSyncedAssignmentStatus("scheduled", "confirmed"), "confirmed");
});

test("restores a canceled assignment when an active unscheduled order is moved", () => {
  assert.equal(getScheduleSyncedAssignmentStatus("new", "cancelled"), "planned");
});

test("keeps canceled assignments hidden for inactive orders", () => {
  assert.equal(getScheduleSyncedAssignmentStatus("canceled", "canceled"), "canceled");
  assert.equal(getScheduleSyncedAssignmentStatus("rescheduled", "canceled"), "canceled");
});

test("automatically schedules a new order once date, time, and team are assigned", () => {
  assert.equal(
    shouldAutoScheduleAssignedNewOrder({
      previousOrderStatus: "new",
      requestedOrderStatus: "new",
      assignedStaff: "Anastasiia Iaparova, Tolkun Muratbekkyzy",
      selectedDate: "2026-09-03",
      selectedTime: "09:00",
    }),
    true
  );
  assert.equal(
    shouldAutoScheduleAssignedNewOrder({
      previousOrderStatus: "new",
      requestedOrderStatus: "new",
      assignedStaff: "",
      selectedDate: "2026-09-03",
      selectedTime: "09:00",
    }),
    false
  );
});

test("resets future recurring visits only when the manager selects the future scope", () => {
  assert.equal(
    shouldResetRecurringFutureVisits({
      editScope: "current",
      scheduleChanged: true,
    }),
    false
  );
  assert.equal(
    shouldResetRecurringFutureVisits({
      editScope: "future",
      serviceTypeChanged: true,
    }),
    true
  );
  assert.equal(
    shouldResetRecurringFutureVisits({
      editScope: "future",
      serviceDurationChanged: true,
    }),
    true
  );
});
