"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminOrdersRecurringHelpers } = require("../lib/admin/handlers-orders-recurring");
const { createAdminOrderMutationDomain } = require("../lib/admin/domain-order-mutations");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { scheduleGuard, scheduledOccurrence } = require("../lib/quote-ops/recurring-schedule");

const normalizeString = (value, limit = 500) => String(value ?? "").trim().slice(0, limit);
const { addRecurringScheduleDate } = createAdminOrderMutationDomain({ normalizeAdminOrderDateInput: normalizeString });
const helpers = createAdminOrdersRecurringHelpers({ normalizeString, getEntryOrderState, addRecurringScheduleDate });

async function fixture() {
  const ledger = createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 5000, normalizeString, env: {},
    createSupabaseQuoteOpsClient: () => null });
  const entries = [];
  for (let index = 0; index < 6; index++) {
    const date = index ? addRecurringScheduleDate("2026-10-18", "biweekly", index) : "2026-10-18";
    const state = { isCreated: true, status: index ? "scheduled" : "completed", paymentStatus: index ? "unpaid" : "paid",
      frequency: "biweekly", selectedDate: date, selectedTime: "10:00", recurringSeriesId: "isolated-series",
      recurringAnchorDate: "2026-10-18", recurringOccurrenceDate: date, recurringOccurrenceIndex: index,
      assignedStaff: index === 3 ? "Cleaner B" : "Cleaner A, Cleaner B", serviceDurationMinutes: 150,
      payrollOverrides: { a: index === 3 ? "101.00" : "95.00" },
      payroll: { items: [{ staffId: "a", amountCents: 9500, status: index ? "owed" : "paid", paidAt: index ? "" : "2026-10-20" }] },
      completion: { cleanerComments: [{ text: `Notes ${index}` }], beforePhotos: [{ id: "photo" }] } };
    entries.push(await ledger.recordSubmission({ ok: true, requestId: `isolated-series-next-${date.replaceAll("-", "")}`,
      sourceRoute: "/admin/orders", customerName: "ISOLATED QA, not Lissette", totalPrice: index === 3 ? 395 : 380,
      selectedDate: date, selectedTime: "10:00", payloadForRetry: { orderState: state, adminOrder: structuredClone(state),
        calculatorData: { selectedDate: date, selectedTime: "10:00", totalPrice: index === 3 ? 395 : 380 },
        paymentState: { status: index ? "unpaid" : "paid" }, smsHistory: [{ text: "Keep history" }] } }));
  }
  const assignments = entries.map(entry => ({ entryId: entry.id, staffIds: ["a", "b"], status: "planned", scheduleDate: "", scheduleTime: "" }));
  const staffStore = { async getSnapshot() { return { staff: [], assignments }; } };
  return { ledger, entries, staffStore, assignments };
}

function financialSnapshot(entry) {
  const result = structuredClone(entry);
  delete result.selectedDate; delete result.selectedTime; delete result.updatedAt;
  for (const key of ["adminOrder", "orderState", "calculatorData"]) {
    delete result.payloadForRetry[key].selectedDate; delete result.payloadForRetry[key].selectedTime;
    delete result.payloadForRetry[key].updatedAt; delete result.payloadForRetry[key].recurringSchedule;
  }
  return result;
}

test("whole-series move retains every ID, individual price, team, fixed payout, attachments and history", async () => {
  const f = await fixture();
  const before = structuredClone(f.entries);
  const teamBefore = structuredClone(f.assignments);
  const moved = await helpers.rescheduleRecurringOrderSeries({ quoteOpsLedger: f.ledger, staffStore: f.staffStore,
    sourceEntry: f.entries[1], selectedDate: "2026-11-08", selectedTime: "10:00", expectedDate: "2026-11-01" });
  assert.equal(moved.length, 5);
  assert.deepEqual(await f.ledger.getEntry(before[0].id), before[0], "completed history is byte-for-byte unchanged");
  for (let index = 1; index < before.length; index++) {
    const entry = await f.ledger.getEntry(before[index].id);
    assert.equal(entry.selectedDate, index === 1 ? "2026-11-08" : addRecurringScheduleDate("2026-11-08", "biweekly", index - 1));
    assert.deepEqual(financialSnapshot(entry), financialSnapshot(before[index]));
  }
  assert.deepEqual(f.assignments, teamBefore);
  assert.equal((await f.ledger.listAllEntries()).length, before.length);
  const repeat = await helpers.rescheduleRecurringOrderSeries({ quoteOpsLedger: f.ledger, sourceEntry: before[1],
    selectedDate: "2026-11-08", selectedTime: "10:00", expectedDate: "2026-11-01" });
  assert.deepEqual(repeat, [], "a double click is a no-op");
  await assert.rejects(helpers.rescheduleRecurringOrderSeries({ quoteOpsLedger: f.ledger, sourceEntry: before[1],
    selectedDate: "2026-11-09", selectedTime: "10:00", expectedDate: "2026-11-01" }), /другим сотрудником/);
  const guard = scheduleGuard(await f.ledger.listAllEntries(), "isolated-series");
  assert.deepEqual(scheduledOccurrence(guard, 6, addRecurringScheduleDate), { date: "2027-01-17", time: "10:00" });
  await assert.rejects(f.ledger.recordSubmission({ ok: true, code: "RECURRING_ORDER_CREATED", requestId: "isolated-series-next-20270110",
    payloadForRetry: { orderState: { recurringSeriesId: "isolated-series", recurringOccurrenceDate: "2027-01-10" } },
    recurringSourceGuard: { schedule: [] } }), /Устаревшая генерация/);
});

test("unsafe future states, paid payouts, collisions and stale versions fail before any order is written", async () => {
  for (const kind of ["paid", "payroll", "started", "override", "collision", "stale"]) {
    const f = await fixture();
    const source = f.entries[1];
    if (["paid", "payroll", "started"].includes(kind)) {
      const entry = f.entries[3];
      for (const key of ["orderState", "adminOrder"]) {
        if (kind === "paid") entry.payloadForRetry[key].paymentStatus = "paid";
        if (kind === "payroll") entry.payloadForRetry[key].payroll.items[0].status = "paid";
        if (kind === "started") entry.payloadForRetry[key].status = "cleaning-started";
      }
    }
    if (kind === "override") f.assignments[3].scheduleTime = "11:00";
    const before = structuredClone(await f.ledger.listAllEntries());
    if (kind === "stale") {
      await assert.rejects(f.ledger.rescheduleRecurringEntries({ seriesId: "isolated-series", sourceId: source.id,
        members: before.map(entry => ({ id: entry.id, updatedAt: "stale" })), changes: [{ id: source.id, date: "2026-11-08", time: "10:00" }] }));
    } else await assert.rejects(helpers.rescheduleRecurringOrderSeries({ quoteOpsLedger: f.ledger, sourceEntry: source,
      staffStore: f.staffStore, selectedDate: kind === "collision" ? "2026-10-18" : "2026-11-08", selectedTime: "10:00" }));
    assert.deepEqual(await f.ledger.listAllEntries(), before, kind);
  }
});

test("canceled occurrences stay canceled and a later series edit supersedes only its continuation", async () => {
  const f = await fixture();
  for (const key of ["adminOrder", "orderState"]) f.entries[3].payloadForRetry[key].status = "canceled";
  const canceled = structuredClone(f.entries[3]);
  await helpers.rescheduleRecurringOrderSeries({ quoteOpsLedger: f.ledger, sourceEntry: f.entries[1], selectedDate: "2026-11-08", selectedTime: "10:00" });
  assert.deepEqual(await f.ledger.getEntry(canceled.id), canceled);
  await helpers.rescheduleRecurringOrderSeries({ quoteOpsLedger: f.ledger, sourceEntry: await f.ledger.getEntry(f.entries[4].id),
    selectedDate: "2026-12-21", selectedTime: "11:00" });
  const guard = scheduleGuard(await f.ledger.listAllEntries(), "isolated-series");
  assert.deepEqual(scheduledOccurrence(guard, 2, addRecurringScheduleDate), { date: "2026-11-22", time: "10:00" });
  assert.deepEqual(scheduledOccurrence(guard, 6, addRecurringScheduleDate), { date: "2027-01-18", time: "11:00" });
});

test("calendar arithmetic remains local-date based across DST, year boundaries and month ends", () => {
  const guard = [{ entryId: "a", schedule: { index: 0, date: "2026-11-08", time: "10:00", frequency: "biweekly", version: 1 } }];
  assert.equal(scheduledOccurrence(guard, 4, addRecurringScheduleDate).date, "2027-01-03");
  guard[0].schedule = { index: 0, date: "2027-01-31", time: "10:00", frequency: "monthly", version: 1 };
  assert.equal(scheduledOccurrence(guard, 1, addRecurringScheduleDate).date, "2027-02-28");
  assert.equal(scheduledOccurrence(guard, 2, addRecurringScheduleDate).date, "2027-03-31");
});
