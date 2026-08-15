"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getScheduleSyncedAssignmentStatus,
  shouldAutoScheduleAssignedNewOrder,
} = require("../lib/admin/handlers-orders-update");

test("restores a canceled assignment when an active order is moved", () => {
  assert.equal(getScheduleSyncedAssignmentStatus("scheduled", "canceled"), "planned");
  assert.equal(getScheduleSyncedAssignmentStatus("new", "cancelled"), "planned");
});

test("keeps canceled assignments hidden for inactive orders", () => {
  assert.equal(getScheduleSyncedAssignmentStatus("canceled", "canceled"), "canceled");
  assert.equal(getScheduleSyncedAssignmentStatus("rescheduled", "canceled"), "canceled");
  assert.equal(getScheduleSyncedAssignmentStatus("scheduled", "confirmed"), "confirmed");
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
