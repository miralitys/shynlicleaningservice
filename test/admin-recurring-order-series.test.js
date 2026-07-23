"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminOrderMutationDomain } = require("../lib/admin/domain-order-mutations");
const { createAdminOrdersRecurringHelpers } = require("../lib/admin/handlers-orders-recurring");
const {
  getEntryOrderState,
  getEntryPayload,
  getEntryPaymentState,
  setEntryOrderState,
  setEntryPaymentState,
} = require("../lib/admin-order-state");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cloneSerializable(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function createDomain() {
  return createAdminOrderMutationDomain({
    ADMIN_ORDERS_PATH: "/admin/orders",
    cloneSerializable,
    formatAdminScheduleLabel: (dateValue, timeValue) => [dateValue, timeValue].filter(Boolean).join(" "),
    getEntryAdminOrderData: getEntryOrderState,
    getEntryAdminSmsData: () => ({}),
    getEntryCalculatorData(entry = {}) {
      return cloneSerializable(getEntryPayload(entry).calculatorData || {}, {});
    },
    getEntryPayload,
    getEntryPaymentData: getEntryPaymentState,
    getEntrySmsHistory: () => [],
    getOrderFrequency: (entry = {}) => normalizeString(getEntryOrderState(entry).frequency, 40),
    getOrderSelectedDate: (entry = {}) =>
      normalizeString(getEntryOrderState(entry).selectedDate || entry.selectedDate, 32),
    getOrderSelectedTime: (entry = {}) =>
      normalizeString(getEntryOrderState(entry).selectedTime || entry.selectedTime, 32),
    getOrderServiceType: (entry = {}) => normalizeString(entry.serviceType, 40),
    getOrderServiceDurationMinutes: (entry = {}) =>
      Number(getEntryOrderState(entry).serviceDurationMinutes || entry.serviceDurationMinutes || 0),
    getOrderStatus: (entry = {}) => normalizeString(getEntryOrderState(entry).status, 40) || "new",
    getPersistedOrderCompletionData: () => ({}),
    isOrderCreatedEntry: (entry = {}) => Object.keys(getEntryOrderState(entry)).length > 0,
    normalizeAdminOrderDateInput: (value) => normalizeString(value, 32),
    normalizeAdminOrderPriceInput(value, fallback = 0) {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : fallback;
    },
    normalizeAdminOrderTimeInput: (value) => normalizeString(value, 32),
    normalizeAdminSmsHistoryEntries: (entries = []) => entries,
    normalizeOrderFrequency: (value) => normalizeString(value, 40),
    normalizeOrderPaymentMethod: (value) => normalizeString(value, 40),
    normalizeOrderPaymentStatus: (value, fallback = "unpaid") =>
      normalizeString(value, 40).toLowerCase() || fallback,
    normalizeOrderStatus: (value, fallback = "new") =>
      normalizeString(value, 40).toLowerCase() || fallback,
    normalizeString,
    setEntryOrderState,
    setEntryPaymentState,
  });
}

function createEntry({
  id,
  date,
  sourceEntryId = "",
  nextEntryId = "",
  status = "scheduled",
  frequency = "biweekly",
  seriesId = "cheryl-series",
  customerName = "Cheryl Gilsdorf",
} = {}) {
  const state = {
    isCreated: true,
    status,
    frequency,
    selectedDate: date,
    selectedTime: "11:00",
    serviceDurationMinutes: 180,
    recurringSeriesId: seriesId,
    ...(sourceEntryId ? { recurringSourceEntryId: sourceEntryId } : {}),
    ...(nextEntryId ? { recurringNextEntryId: nextEntryId } : {}),
  };
  return {
    id,
    requestId: `${id}-request`,
    customerName,
    customerPhone: "3125550101",
    serviceType: "standard",
    serviceName: "Standard",
    selectedDate: date,
    selectedTime: "11:00",
    serviceDurationMinutes: 180,
    totalPrice: 180,
    createdAt: "2026-07-01T12:00:00.000Z",
    payloadForRetry: {
      calculatorData: {
        serviceType: "standard",
        frequency,
        selectedDate: date,
        selectedTime: "11:00",
      },
      orderState: cloneSerializable(state, {}),
      adminOrder: cloneSerializable(state, {}),
    },
  };
}

function createLedger(domain, initialEntries = []) {
  const entries = initialEntries;
  let nextId = 1;
  return {
    async listEntries() {
      return entries;
    },
    async getEntry(entryId) {
      return entries.find((entry) => entry.id === entryId) || null;
    },
    async deleteEntry(entryId) {
      const index = entries.findIndex((entry) => entry.id === entryId);
      if (index === -1) return false;
      entries.splice(index, 1);
      return true;
    },
    async updateOrderEntry(entryId, updates) {
      const entry = entries.find((candidate) => candidate.id === entryId);
      return entry ? domain.applyOrderEntryUpdates(entry, updates) : null;
    },
    async recordSubmission(submission) {
      const entry = {
        ...cloneSerializable(submission, {}),
        id: `generated-${nextId++}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      entries.push(entry);
      return entry;
    },
  };
}

function createStaffStore() {
  const assignments = [
    {
      entryId: "cheryl-moved",
      staffIds: ["cleaner-1"],
      scheduleDate: "",
      scheduleTime: "",
      status: "planned",
      notes: "",
    },
  ];
  return {
    assignments,
    async getSnapshot() {
      return { assignments };
    },
    async setAssignment(entryId, input) {
      const existing = assignments.find((record) => record.entryId === entryId);
      if (existing) {
        Object.assign(existing, input);
        return existing;
      }
      const record = { entryId, ...input };
      assignments.push(record);
      return record;
    },
  };
}

test("keeps Cheryl's Aug 11 cadence after the Jul 28 visit moves to Jul 29", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-root",
    date: "2026-07-14",
    nextEntryId: "cheryl-moved",
    status: "completed",
  });
  const moved = createEntry({
    id: "cheryl-moved",
    date: "2026-07-29",
    sourceEntryId: "cheryl-root",
  });
  const ledger = createLedger(domain, [root, moved]);
  const staffStore = createStaffStore();
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  const created = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: moved,
    staffStore,
  });

  assert.equal(created[0].selectedDate, "2026-08-11");
  assert.equal(getEntryOrderState(moved).recurringOccurrenceDate, "2026-07-28");
  assert.ok(created.length >= 12);
  assert.equal(
    staffStore.assignments.find((record) => record.entryId === created[0].id).staffIds[0],
    "cleaner-1"
  );

  const secondPass = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: moved,
    staffStore,
  });
  assert.equal(secondPass.length, 0);
});

test("backfills an existing recurring series once when the calendar opens", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-root",
    date: "2026-07-14",
    nextEntryId: "cheryl-moved",
    status: "completed",
  });
  const moved = createEntry({
    id: "cheryl-moved",
    date: "2026-07-29",
    sourceEntryId: "cheryl-root",
  });
  const ledger = createLedger(domain, [root, moved]);
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  const firstPass = await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    today: "2026-07-23",
  });
  const secondPass = await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    today: "2026-07-23",
  });

  assert.equal(firstPass[0].selectedDate, "2026-08-11");
  assert.ok(firstPass.length >= 12);
  assert.equal(secondPass.length, 0);
});

test("replaces future visits when the recurring frequency changes", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-root",
    date: "2026-07-28",
  });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });
  await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: root,
  });
  assert.ok((await ledger.listEntries()).length > 10);

  const monthlyRoot = await ledger.updateOrderEntry(root.id, { frequency: "monthly" });
  await helpers.resetRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: monthlyRoot,
  });
  const monthlyEntries = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: await ledger.getEntry(root.id),
  });

  assert.deepEqual(
    monthlyEntries.map((entry) => entry.selectedDate),
    [
      "2026-08-28",
      "2026-09-28",
      "2026-10-28",
      "2026-11-28",
      "2026-12-28",
      "2027-01-28",
    ]
  );
  assert.equal((await ledger.listEntries()).length, 7);
});

test("stops Marcus monthly series after an occurrence is changed to Not set", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "marcus-root",
    date: "2026-07-14",
    frequency: "monthly",
    seriesId: "marcus-series",
    customerName: "Marcus Cyrus",
  });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });
  const generated = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: root,
  });
  const augustVisit = generated.find((entry) => entry.selectedDate === "2026-08-14");
  assert.ok(augustVisit);

  await ledger.updateOrderEntry(augustVisit.id, { frequency: "" });
  const createdAfterRepair = await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    today: "2026-07-23",
  });
  const remainingEntries = await ledger.listEntries();

  assert.equal(createdAfterRepair.length, 0);
  assert.deepEqual(
    remainingEntries.map((entry) => entry.selectedDate),
    ["2026-07-14", "2026-08-14"]
  );
  assert.ok(remainingEntries.every((entry) => !getEntryOrderState(entry).frequency));
  assert.ok(remainingEntries.every((entry) => !getEntryOrderState(entry).recurringSeriesId));

  const secondPass = await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    today: "2026-07-23",
  });
  assert.equal(secondPass.length, 0);
  assert.equal((await ledger.listEntries()).length, 2);
});

test("cancels the selected recurring visit and every later visit while keeping earlier history", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-root",
    date: "2026-07-14",
    nextEntryId: "cheryl-moved",
    status: "completed",
  });
  const moved = createEntry({
    id: "cheryl-moved",
    date: "2026-07-29",
    sourceEntryId: "cheryl-root",
  });
  const ledger = createLedger(domain, [root, moved]);
  const staffStore = createStaffStore();
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });
  const created = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: moved,
    staffStore,
  });

  const aug11 = created.find((entry) => entry.selectedDate === "2026-08-11");
  const canceled = await helpers.cancelRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: aug11,
    staffStore,
  });

  assert.ok(canceled.length > 1);
  assert.equal(getEntryOrderState(root).status, "completed");
  assert.equal(getEntryOrderState(moved).status, "scheduled");
  assert.ok(canceled.every((entry) => getEntryOrderState(entry).status === "canceled"));
  assert.ok(
    canceled.every(
      (entry) =>
        staffStore.assignments.find((record) => record.entryId === entry.id).status === "canceled"
    )
  );
});
