"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOrdersUpdateHandlers } = require("../lib/admin/handlers-orders-update");

async function updateOrder(formBody, status = "scheduled", missingAssignment = false) {
  let entry = {
    id: "old-order",
    selectedDate: "2026-08-23",
    selectedTime: "07:00",
    payloadForRetry: { orderState: { status, assignedStaff: "Anastasiia, Tolkun" } },
  };
  let assignment = {
    entryId: entry.id, staffIds: ["nastia", "tolkun"], status: "confirmed",
    scheduleDate: "", scheduleTime: "", notes: "Original assignment",
  };
  if (missingAssignment) assignment = null;
  const originalAssignment = structuredClone(assignment);
  const staff = [
    { id: "nastia", name: "Anastasiia" },
    { id: "tolkun", name: "Tolkun" },
    { id: "zilola", name: "Zilola" },
  ];
  const calls = { assignments: 0, notifications: 0 };
  const staffStore = {
    async getSnapshot() { return { staff, assignments: assignment ? [assignment] : [] }; },
    async setAssignment(entryId, updates) {
      calls.assignments += 1;
      assignment = { entryId, ...updates };
      return assignment;
    },
  };
  const getState = (record) => record.payloadForRetry.orderState;
  const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
  const handlers = createAdminOrdersUpdateHandlers({
    getEntryOrderState: getState,
    getOrderStatusFromEntry: (record) => getState(record).status,
    getFormValue: (body, key, max) => normalizeString(body[key], max),
    getFormValues: (body, key) => [].concat(body[key] || []).filter(Boolean),
    normalizeString,
    normalizeOrderStatus: (value, fallback) => value || fallback,
    normalizeManualOrderFrequency: (value) => value || "",
    resolveAssignableStaffIdsByNames: async (_, __, names) => ({
      snapshot: await staffStore.getSnapshot(),
      staffIds: staff.filter((record) => names.includes(record.name)).map((record) => record.id),
      staffNames: names,
    }),
    buildOrdersRedirect: () => "/admin/orders",
    redirectWithTiming() {},
  });
  await handlers.handleOrderUpdateAction({
    entryId: entry.id,
    currentEntry: entry,
    formBody,
    requestContext: {},
    staffStore,
    quoteOpsLedger: {
      async updateOrderEntry(_, updates) {
        const state = { ...getState(entry), ...updates };
        if (updates.orderStatus) state.status = updates.orderStatus;
        entry = { ...entry, ...updates, payloadForRetry: { orderState: state } };
        return entry;
      },
    },
    autoNotificationService: {
      async notifyScheduledAssignment() { calls.notifications += 1; return { entry }; },
    },
  });
  return { entry, assignment, originalAssignment, calls };
}

test("payment edits preserve team and do not announce an assignment", async () => {
  for (const status of ["scheduled", "cleaning-complete", "completed"]) {
    const result = await updateOrder({ paymentStatus: "paid" }, status);
    assert.equal(result.entry.paymentStatus, "paid");
    assert.deepEqual(result.assignment, result.originalAssignment);
    assert.deepEqual(result.calls, { assignments: 0, notifications: 0 });
  }
});

test("unchanged schedule and team fields in a payment save do not trigger assignment writes or SMS", async () => {
  const result = await updateOrder({
    paymentStatus: "paid", selectedDate: "2026-08-23", selectedTime: "07:00",
    assignedStaff: ["Anastasiia", "Tolkun"],
  });
  assert.deepEqual(result.assignment, result.originalAssignment);
  assert.deepEqual(result.calls, { assignments: 0, notifications: 0 });
});

test("a completion status change does not announce an assignment", async () => {
  const result = await updateOrder({
    orderStatus: "cleaning-complete", selectedDate: "2026-08-23", selectedTime: "07:00",
  });
  assert.deepEqual(result.calls, { assignments: 0, notifications: 0 });
});

test("saving payment on a completed visit cannot recreate a missing team assignment", async () => {
  const result = await updateOrder({
    paymentStatus: "paid", selectedDate: "2026-08-23", selectedTime: "07:00",
  }, "completed", true);
  assert.equal(result.assignment, null);
  assert.deepEqual(result.calls, { assignments: 0, notifications: 0 });
});

test("actual schedule and team changes still reach the notification service", async () => {
  for (const formBody of [{ selectedTime: "08:00" }, { assignedStaff: ["Zilola"] }]) {
    const result = await updateOrder(formBody);
    assert.deepEqual(result.calls, { assignments: 1, notifications: 1 });
  }
});

test("moving a new order to scheduled still announces its existing assignment", async () => {
  const result = await updateOrder({ orderStatus: "scheduled" }, "new");
  assert.deepEqual(result.calls, { assignments: 1, notifications: 1 });
});

test("editing a completed visit updates that visit, not the next visit", async () => {
  const result = await updateOrder({
    orderStatus: "scheduled", selectedDate: "2026-10-18", selectedTime: "10:00",
    paymentStatus: "unpaid", paymentMethod: "",
  }, "completed");
  assert.equal(result.entry.id, "old-order");
  assert.equal(result.entry.selectedDate, "2026-10-18");
  assert.equal(result.entry.selectedTime, "10:00");
  assert.equal(result.entry.payloadForRetry.orderState.status, "scheduled");
});
