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
  totalPrice = 180,
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
    totalPrice,
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

function createStaffStore(status = "planned") {
  const assignments = [
    {
      entryId: "cheryl-moved",
      staffIds: ["cleaner-1"],
      scheduleDate: "",
      scheduleTime: "",
      status,
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

test("website recurring orders wait for manager confirmation, including after policy signing", async () => {
  for (const frequency of ["weekly", "biweekly", "monthly"]) {
    for (const status of ["new", "scheduled"]) {
      const domain = createDomain();
      const root = createEntry({ id: "website", date: "2026-11-01", frequency, status, seriesId: "" });
      root.sourceRoute = "/quote";
      delete root.payloadForRetry.orderState.recurringSeriesId;
      delete root.payloadForRetry.adminOrder.recurringSeriesId;
      const ledger = createLedger(domain, [root]);
      const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });

      assert.deepEqual(await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }), []);
      assert.deepEqual(await helpers.ensureAllRecurringOrderSeries({ quoteOpsLedger: ledger, today: "2026-10-16" }), []);
      assert.equal((await ledger.listEntries()).length, 1);
      assert.equal(getEntryOrderState(root).recurringSeriesId, undefined);
      assert.equal(getEntryOrderState(root).frequency, frequency);

      await ledger.updateOrderEntry(root.id, { orderStatus: "scheduled", managerConfirmedAt: "2026-10-16T15:00:00.000Z" });
      assert.ok((await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root })).length > 0);
      const count = (await ledger.listEntries()).length;
      assert.deepEqual(await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }), []);
      assert.equal((await ledger.listEntries()).length, count);
    }
  }
});

test("maintenance cannot extend or stop a series while a rescheduled cadence change awaits confirmation", async () => {
  for (const frequency of ["monthly", ""]) {
    const domain = createDomain();
    const root = createEntry({ id: "pending-root", date: "2026-11-01", frequency: "weekly" });
    const ledger = createLedger(domain, [root]);
    const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
    const generated = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
    assert.ok(generated.length > 0);
    await ledger.updateOrderEntry(root.id, {
      orderStatus: "rescheduled", selectedDate: "2026-11-03", frequency,
      recurringPendingResetFromDate: "2026-11-01",
    });
    const before = JSON.stringify(await ledger.listEntries());
    for (const method of ["updateOrderEntry", "recordSubmission", "deleteEntry"]) {
      ledger[method] = async () => assert.fail(`maintenance must not call ${method} while confirmation is pending`);
    }
    assert.deepEqual(await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: generated[0] }), []);
    assert.deepEqual(await helpers.ensureAllRecurringOrderSeries({ quoteOpsLedger: ledger, today: "2026-10-21" }), []);
    assert.equal(JSON.stringify(await ledger.listEntries()), before, "all existing visits, prices and teams remain untouched");
  }
});

test("series generation uses the complete ledger, not the latest 1000 records", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "kylie", date: "2026-10-11", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const completeEntries = await ledger.listEntries();
  const before = JSON.stringify(completeEntries);
  ledger.listAllEntries = async () => completeEntries;
  ledger.listEntries = async () => [root];

  const created = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });

  assert.equal(created.length, 0);
  assert.equal(completeEntries.length, JSON.parse(before).length);
});

test("a failed complete read creates nothing and releases the series generation lock", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "kylie", date: "2026-10-11", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  ledger.listAllEntries = async () => { throw new Error("incomplete ledger"); };
  await assert.rejects(helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }), /incomplete ledger/);
  assert.equal((await ledger.listEntries()).length, 1);
  ledger.listAllEntries = ledger.listEntries;
  assert.ok((await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root })).length > 0);
});

test("a failed guarded source update aborts generation instead of using the stale source", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  ledger.updateOrderEntry = async () => null;
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  await assert.rejects(helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }), /source changed/);
  assert.equal((await ledger.listEntries()).length, 1);
});

test("overlapping series generators from separate handlers cannot insert duplicate visits", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "kylie", date: "2026-10-11", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const deps = { ...domain, getEntryOrderState, normalizeString };
  const first = createAdminOrdersRecurringHelpers(deps);
  const second = createAdminOrdersRecurringHelpers(deps);
  const created = await Promise.all([
    first.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }),
    second.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }),
  ]);
  const entries = await ledger.listEntries();

  assert.equal(new Set(entries.map((entry) => entry.requestId)).size, entries.length);
  assert.equal(created.filter((items) => items.length > 0).length, 1);
});

test("legacy flattened parent links preserve distinct occurrence dates rather than assigning every child index one", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly", seriesId: "legacy-series" });
  const first = createEntry({ id: "first", date: "2026-11-08", frequency: "weekly", sourceEntryId: root.id, seriesId: "legacy-series" });
  const second = createEntry({ id: "second", date: "2026-11-15", frequency: "weekly", sourceEntryId: root.id, seriesId: "legacy-series" });
  const ledger = createLedger(domain, [root, first, second]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  assert.equal(getEntryOrderState(first).recurringOccurrenceIndex, 1);
  assert.equal(getEntryOrderState(second).recurringOccurrenceIndex, 2);
  assert.equal(getEntryOrderState(second).recurringOccurrenceDate, "2026-11-15");
  assert.equal((await ledger.listEntries()).filter(entry => entry.selectedDate === "2026-11-15").length, 1);
});

test("a legacy visit with inconsistent canonical metadata still blocks another order in its actual date/time slot", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly" });
  const existing = createEntry({ id: "existing", date: "2026-11-15", frequency: "weekly", sourceEntryId: root.id });
  for (const entry of [root, existing]) {
    await domain.applyOrderEntryUpdates(entry, {
      recurringAnchorDate: "2026-11-01", recurringOccurrenceDate: entry === root ? "2026-11-01" : "2026-11-08",
      recurringOccurrenceIndex: entry === root ? 0 : 1,
    });
  }
  const ledger = createLedger(domain, [root, existing]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  assert.equal((await ledger.listEntries()).filter(entry => entry.selectedDate === "2026-11-15").length, 1);
  assert.equal(existing.selectedDate, "2026-11-15");
  assert.equal(existing.selectedTime, "11:00");
});

test("a canceled moved occurrence reserves its own canonical date, not another legitimate visit's actual slot", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly" });
  const canceled = createEntry({ id: "canceled", date: "2026-11-15", frequency: "weekly", status: "canceled", sourceEntryId: root.id });
  domain.applyOrderEntryUpdates(canceled, {
    recurringAnchorDate: "2026-11-01", recurringOccurrenceDate: "2026-11-08", recurringOccurrenceIndex: 1,
  });
  const ledger = createLedger(domain, [root, canceled]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  const created = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  assert.equal(created.filter(entry => entry.selectedDate === "2026-11-15").length, 1);
  assert.equal(created.filter(entry => entry.selectedDate === "2026-11-08").length, 0);
  assert.equal(getEntryOrderState(canceled).status, "canceled");
});

test("legacy nested request IDs and missing series metadata join one canonical series before generation", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly", seriesId: "" });
  root.requestId = "legacy-root";
  const first = createEntry({ id: "first", date: "2026-11-08", frequency: "weekly", sourceEntryId: root.id, seriesId: "" });
  first.requestId = "legacy-root-next-20261108";
  const second = createEntry({ id: "second", date: "2026-11-15", frequency: "weekly", sourceEntryId: first.id, seriesId: "" });
  second.requestId = "legacy-root-next-20261108-next-20261115";
  const ledger = createLedger(domain, [root, first, second]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: second });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const entries = await ledger.listEntries();
  assert.ok(entries.every(entry => getEntryOrderState(entry).recurringSeriesId === "legacy-root"));
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-15").length, 1);
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-22").length, 1);
});

test("generator request lookup does not suppress another raw series whose display request IDs collide", async () => {
  const domain = createDomain();
  const first = createEntry({ id: "first", date: "2026-11-01", frequency: "weekly", seriesId: "Series_A" });
  const second = createEntry({ id: "second", date: "2026-11-01", frequency: "weekly", seriesId: "series-a" });
  const ledger = createLedger(domain, [first, second]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  const a = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: first });
  const b = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: second });
  assert.ok(a.length > 0);
  assert.equal(a.length, b.length);
  assert.ok(a.every(entry => getEntryOrderState(entry).recurringSeriesId === "Series_A"));
  assert.ok(b.every(entry => getEntryOrderState(entry).recurringSeriesId === "series-a"));
});

test("a future-series reset waits for an in-flight generation and removes the old cadence", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  let started;
  let release;
  const pendingInsert = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const insert = ledger.recordSubmission;
  let first = true;
  ledger.recordSubmission = async input => {
    if (first) { first = false; started(); await gate; }
    return insert(input);
  };
  const generation = helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  await pendingInsert;
  await ledger.updateOrderEntry(root.id, { selectedDate: "2026-11-02" });
  const reset = helpers.resetRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root, resetFromDate: "2026-11-01" });
  release();
  await generation;
  await reset;
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const entries = await ledger.listEntries();
  assert.equal(getEntryOrderState(root).recurringAnchorDate, "2026-11-02");
  assert.ok(entries.every(entry => new Date(`${entry.selectedDate}T12:00:00Z`).getUTCDay() === 1));
  assert.equal(new Set(entries.map(entry => entry.selectedDate)).size, entries.length);
});

test("a reset using a stale legacy-child snapshot shares the root generator's canonical lock", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly", seriesId: "canonical-id" });
  const child = createEntry({ id: "child", date: "2026-11-08", frequency: "weekly", seriesId: "", sourceEntryId: root.id });
  const staleChild = structuredClone(child);
  const ledger = createLedger(domain, [root, child]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  let started;
  let release;
  const pending = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const insert = ledger.recordSubmission;
  let first = true;
  ledger.recordSubmission = async input => {
    if (first) { first = false; started(); await gate; }
    return insert(input);
  };
  const generation = helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  await pending;
  await ledger.updateOrderEntry(child.id, { selectedDate: "2026-11-15" });
  let resetFinished = false;
  const reset = helpers.resetRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: staleChild }).then(() => { resetFinished = true; });
  await new Promise(resolve => setImmediate(resolve));
  const raced = resetFinished;
  release();
  await generation;
  await reset;
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: child });
  assert.equal(raced, false);
  assert.equal((await ledger.listEntries()).filter(entry => entry.selectedDate === "2026-11-15").length, 1);
});

test("missing root metadata reuses an established sibling anchor instead of the root's one-off moved date", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-02", frequency: "weekly" });
  const sibling = createEntry({ id: "sibling", date: "2026-11-09", frequency: "weekly", sourceEntryId: root.id });
  domain.applyOrderEntryUpdates(sibling, {
    recurringAnchorDate: "2026-11-01", recurringOccurrenceDate: "2026-11-08", recurringOccurrenceIndex: 1,
  });
  const ledger = createLedger(domain, [root, sibling]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const entries = await ledger.listEntries();
  assert.equal(getEntryOrderState(root).recurringAnchorDate, "2026-11-01");
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-09").length, 1);
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-15").length, 1);
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-16").length, 0);
});

test("resetting a previously moved visit uses its canonical occurrence boundary, not its temporary actual date", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  const created = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const moved = created.find(entry => entry.selectedDate === "2026-11-08");
  await ledger.updateOrderEntry(moved.id, { selectedDate: "2026-11-27" });
  await helpers.resetRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: moved, resetFromDate: "2026-11-27" });
  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: moved });
  const entries = await ledger.listEntries();
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-15").length, 0);
  assert.equal(entries.filter(entry => entry.selectedDate === "2026-11-22").length, 0);
  for (const entry of entries) {
    const next = entries.find(candidate => candidate.id === getEntryOrderState(entry).recurringNextEntryId);
    if (next) assert.ok(entry.selectedDate < next.selectedDate, "next pointers must not go backwards");
  }
});

test("a sweep cannot revive a visit deleted while its stale series list is being processed", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "kylie", date: "2026-10-11", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  const generated = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const victim = generated[0];
  const update = ledger.updateOrderEntry.bind(ledger);
  let deleted = false;
  const assignedIds = [];
  const staffStore = {
    async getSnapshot() { return { assignments: [{ entryId: root.id, staffIds: ["zilola"], status: "planned" }] }; },
    async setAssignment(id) { assignedIds.push(id); },
  };
  ledger.updateOrderEntry = async (id, updates) => {
    if (id === victim.id && Object.hasOwn(updates, "recurringNextEntryId")) {
      domain.applyOrderEntryUpdates(victim, { removeOrder: true });
      deleted = true;
    }
    return update(id, updates);
  };

  await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root, staffStore });

  assert.equal(deleted, true);
  assert.deepEqual(getEntryOrderState(victim), {});
  assert.equal(assignedIds.includes(victim.id), false);
  assert.equal((await ledger.listEntries()).filter((entry) => entry.requestId === victim.requestId).length, 1);
});

test("removed shells reserve their occurrence but are never linked as the next real visit", async () => {
  const domain = createDomain();
  const root = createEntry({ id: "root", date: "2026-11-01", frequency: "weekly" });
  const ledger = createLedger(domain, [root]);
  const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
  const created = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root });
  const removed = created[0];
  domain.applyOrderEntryUpdates(removed, { removeOrder: true });
  assert.deepEqual(await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: root }), []);
  assert.deepEqual(getEntryOrderState(removed), {});
  assert.ok((await ledger.listEntries()).filter(entry => Object.keys(getEntryOrderState(entry)).length)
    .every(entry => getEntryOrderState(entry).recurringNextEntryId !== removed.id));
});

test("keeps confirmed staff assignments on generated recurring visits", async () => {
  const domain = createDomain();
  const source = createEntry({
    id: "cheryl-moved",
    date: "2026-07-29",
  });
  const ledger = createLedger(domain, [source]);
  const staffStore = createStaffStore("confirmed");
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  const created = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: source,
    staffStore,
  });

  assert.ok(created.length > 0);
  assert.ok(
    created.every(
      (entry) =>
        staffStore.assignments.find((record) => record.entryId === entry.id).status === "confirmed"
    )
  );
});

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

test("updates the selected recurring price and future visits without changing history", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "kylie-root",
    date: "2026-08-01",
    status: "completed",
    frequency: "weekly",
    seriesId: "kylie-series",
    customerName: "Kylie Beckstrom",
    totalPrice: 220,
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
  const august8 = generated.find((entry) => entry.selectedDate === "2026-08-08");
  assert.ok(august8);

  const updatedAugust8 = await ledger.updateOrderEntry(august8.id, { totalPrice: 280 });
  const updatedFuture = await helpers.updateRecurringOrderSeriesFuturePrice({
    quoteOpsLedger: ledger,
    sourceEntry: updatedAugust8,
    totalPrice: 280,
  });

  assert.equal(root.totalPrice, 220);
  assert.equal(updatedAugust8.totalPrice, 280);
  assert.ok(updatedFuture.length > 1);
  assert.ok(updatedFuture.every((entry) => entry.totalPrice === 280));
});

test("updates staff assignments for all future recurring visits without changing history", async () => {
  const domain = createDomain();
  const completed = createEntry({
    id: "mona-completed",
    date: "2026-09-07",
    status: "completed",
    seriesId: "mona-series",
    customerName: "Mona",
  });
  const current = createEntry({
    id: "mona-current",
    date: "2026-09-21",
    sourceEntryId: "mona-completed",
    seriesId: "mona-series",
    customerName: "Mona",
  });
  const future = createEntry({
    id: "mona-future",
    date: "2026-10-05",
    sourceEntryId: "mona-current",
    seriesId: "mona-series",
    customerName: "Mona",
  });
  const ledger = createLedger(domain, [completed, current, future]);
  const assignments = [completed, current, future].map((entry) => ({
    entryId: entry.id,
    staffIds: ["anastasiia", "tolkun"],
    scheduleDate: "",
    scheduleTime: "",
    status: entry.id === "mona-completed" ? "completed" : "confirmed",
    notes: "",
  }));
  const staffStore = {
    async getSnapshot() {
      return { assignments };
    },
    async setAssignment(entryId, input) {
      const assignment = assignments.find((record) => record.entryId === entryId);
      Object.assign(assignment, input);
      return assignment;
    },
  };
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  await helpers.updateRecurringOrderSeriesFutureAssignment({
    quoteOpsLedger: ledger,
    sourceEntry: current,
    staffStore,
    assignedStaff: "Zilola Furkatovna",
    staffIds: ["zilola"],
  });

  assert.deepEqual(assignments.find((record) => record.entryId === completed.id).staffIds, [
    "anastasiia",
    "tolkun",
  ]);
  assert.deepEqual(assignments.find((record) => record.entryId === current.id).staffIds, [
    "anastasiia",
    "tolkun",
  ]);
  assert.deepEqual(assignments.find((record) => record.entryId === future.id).staffIds, ["zilola"]);
  assert.equal(getEntryOrderState(completed).assignedStaff || "", "");
  assert.equal(getEntryOrderState(current).assignedStaff || "", "");
  assert.equal(getEntryOrderState(future).assignedStaff, "Zilola Furkatovna");
});

test("joins a manual visit to the client's recurring series when a series comment is saved", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "ina-root",
    date: "2026-08-29",
    status: "completed",
    frequency: "every3weeks",
    seriesId: "ina-series",
    customerName: "Ina Salgado",
    totalPrice: 240,
  });
  root.customerPhone = "2244096681";
  root.fullAddress = "1336 Foxglove Dr, Batavia, IL 60510, USA";
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
  const october10 = generated.find((entry) => entry.selectedDate === "2026-10-10");
  assert.ok(october10);

  const manualVisit = createEntry({
    id: "ina-manual-september-19",
    date: "2026-09-19",
    frequency: "",
    seriesId: "",
    customerName: "Ina Salgado",
    totalPrice: 240,
  });
  manualVisit.customerPhone = "2244096681";
  manualVisit.fullAddress = root.fullAddress;
  delete manualVisit.payloadForRetry.adminOrder.recurringSeriesId;
  delete manualVisit.payloadForRetry.orderState.recurringSeriesId;
  ledger.entries?.push?.(manualVisit);
  // The in-memory ledger intentionally exposes entries only through listEntries.
  (await ledger.listEntries()).push(manualVisit);

  const updated = await helpers.updateRecurringOrderSeriesFutureComment({
    quoteOpsLedger: ledger,
    sourceEntry: manualVisit,
    additionalDetails: "Use the side entrance for every visit.",
  });

  assert.ok(updated.some((entry) => entry.id === manualVisit.id));
  assert.equal(getEntryOrderState(manualVisit).frequency, "every3weeks");
  assert.equal(getEntryOrderState(manualVisit).recurringSeriesId, "ina-series");
  assert.equal(
    getEntryPayload(october10).calculatorData.additionalDetails,
    "Use the side entrance for every visit."
  );
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

test("repairs a modern recurring series when future visits are missing", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-modern-root",
    date: "2026-08-12",
    seriesId: "cheryl-modern-series",
  });
  const ledger = createLedger(domain, [root]);
  const staffStore = createStaffStore("confirmed");
  staffStore.assignments[0].entryId = root.id;
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  const generated = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: root,
    staffStore,
  });
  assert.ok(generated.some((entry) => entry.selectedDate === "2026-08-26"));

  for (const entry of generated) {
    await ledger.deleteEntry(entry.id);
    const assignmentIndex = staffStore.assignments.findIndex((record) => record.entryId === entry.id);
    if (assignmentIndex >= 0) staffStore.assignments.splice(assignmentIndex, 1);
  }

  const repaired = await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    staffStore,
    today: "2026-08-25",
  });

  assert.equal(repaired[0].selectedDate, "2026-08-26");
  assert.ok(repaired.length >= 12);
  assert.ok(
    repaired.every(
      (entry) =>
        staffStore.assignments.find((record) => record.entryId === entry.id).status === "confirmed"
    )
  );
});

test("restores a missing team assignment from another visit in the same series", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-assignment-root",
    date: "2026-08-12",
    seriesId: "cheryl-assignment-series",
  });
  const ledger = createLedger(domain, [root]);
  const staffStore = createStaffStore("confirmed");
  staffStore.assignments[0].entryId = root.id;
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  const generated = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: root,
    staffStore,
  });
  const nextVisit = generated.find((entry) => entry.selectedDate === "2026-08-26");
  assert.ok(nextVisit);
  const missingAssignmentIndex = staffStore.assignments.findIndex(
    (record) => record.entryId === nextVisit.id
  );
  assert.ok(missingAssignmentIndex >= 0);
  staffStore.assignments.splice(missingAssignmentIndex, 1);

  await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    staffStore,
    today: "2026-08-25",
  });

  const restoredAssignment = staffStore.assignments.find(
    (record) => record.entryId === nextVisit.id
  );
  assert.ok(restoredAssignment);
  assert.deepEqual(restoredAssignment.staffIds, ["cleaner-1"]);
  assert.equal(restoredAssignment.status, "confirmed");
});

test("restores a canceled calendar assignment for an active recurring visit", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "kylie-root",
    date: "2026-09-05",
    frequency: "weekly",
    seriesId: "kylie-series",
  });
  const ledger = createLedger(domain, [root]);
  const staffStore = createStaffStore("confirmed");
  staffStore.assignments[0].entryId = root.id;
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  const generated = await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: root,
    staffStore,
  });
  const september12 = generated.find((entry) => entry.selectedDate === "2026-09-12");
  const september19 = generated.find((entry) => entry.selectedDate === "2026-09-19");
  assert.ok(september12);
  assert.ok(september19);

  await staffStore.setAssignment(september12.id, { status: "canceled" });
  await helpers.ensureAllRecurringOrderSeries({
    quoteOpsLedger: ledger,
    staffStore,
    today: "2026-09-09",
  });

  const restoredAssignment = staffStore.assignments.find(
    (record) => record.entryId === september12.id
  );
  assert.deepEqual(restoredAssignment.staffIds, ["cleaner-1"]);
  assert.equal(restoredAssignment.status, "confirmed");
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

test("adopts existing generated visits when recurrence is assigned later", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "yaw-root",
    date: "2026-09-30",
    frequency: "monthly",
    seriesId: "",
    customerName: "Yaw Enin",
  });
  const october = createEntry({
    id: "yaw-october",
    date: "2026-10-30",
    frequency: "",
    seriesId: "",
    customerName: "Yaw Enin",
  });
  october.requestId = `${root.requestId}-next-20261030`;
  const ledger = createLedger(domain, [root, october]);
  const originalRecordSubmission = ledger.recordSubmission;
  ledger.recordSubmission = async (submission) => {
    assert.notEqual(submission.requestId, october.requestId, "adopt the existing visit without inserting it again");
    return originalRecordSubmission(submission);
  };
  const helpers = createAdminOrdersRecurringHelpers({
    ...domain,
    getEntryOrderState,
    normalizeString,
  });

  await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: root,
  });

  assert.equal(getEntryOrderState(october).frequency, "monthly");
  assert.equal(
    getEntryOrderState(october).recurringSeriesId,
    getEntryOrderState(root).recurringSeriesId
  );
  assert.equal(getEntryOrderState(october).recurringOccurrenceDate, "2026-10-30");
});

test("replaces future visits from the original date when a visit moves forward", async () => {
  const domain = createDomain();
  const root = createEntry({
    id: "cheryl-moved-forward",
    date: "2026-09-09",
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

  const movedRoot = await ledger.updateOrderEntry(root.id, {
    selectedDate: "2026-10-01",
    selectedTime: "13:00",
  });
  await helpers.resetRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: movedRoot,
    resetFromDate: "2026-09-09",
  });
  const remainingBeforeRegeneration = await ledger.listEntries();

  assert.deepEqual(
    remainingBeforeRegeneration.map((entry) => entry.id),
    [root.id]
  );
  await helpers.ensureRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: await ledger.getEntry(root.id),
  });
  const regenerated = await ledger.listEntries();
  assert.equal(regenerated[1].selectedDate, "2026-10-15");
  assert.equal(regenerated[1].selectedTime, "13:00");
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

  const restored = await helpers.restoreRecurringOrderSeries({
    quoteOpsLedger: ledger,
    sourceEntry: await ledger.getEntry(aug11.id),
    staffStore,
  });

  assert.equal(restored.length, canceled.length);
  assert.ok(restored.every((entry) => getEntryOrderState(entry).status === "scheduled"));
  assert.ok(
    restored.every(
      (entry) =>
        staffStore.assignments.find((record) => record.entryId === entry.id).status === "planned"
    )
  );
  assert.ok(
    (await ledger.listEntries()).every(
      (entry) => !getEntryOrderState(entry).recurringSeriesCanceledFromDate
    )
  );
});
