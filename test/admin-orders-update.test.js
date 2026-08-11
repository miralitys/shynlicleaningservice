"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getScheduleSyncedAssignmentStatus,
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
