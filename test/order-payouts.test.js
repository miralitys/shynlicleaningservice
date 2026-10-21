"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { orderPayouts, prepareOrderPayouts } = require("../lib/order-payouts");
const { buildOrderPayrollSnapshot, collectPayrollRecords, getEntryPayrollData } = require("../lib/payroll");
const { projectOrderListEntry } = require("../lib/quote-ops/order-list");

const team = [{ id: "a", name: "Cleaner A", compensationType: "percent", compensationValue: "50" },
  { id: "b", name: "Cleaner B", compensationType: "percent", compensationValue: "50" }];
const order = state => ({ id: "test-order", updatedAt: "2026-10-21T12:00:00Z", totalPriceCents: 53400,
  payloadForRetry: { orderState: { isCreated: true, status: "scheduled", ...state } } });

test("canonical fixed payouts are per-person, include zero and do not expose payroll in ordinary order projections", () => {
  const entry = order({ payrollOverrides: { a: "500.00", b: "0.00" } });
  const before = structuredClone(entry);
  assert.deepEqual(orderPayouts(entry, team), [{ staffId: "a", cents: 50000 }, { staffId: "b", cents: 0 }]);
  assert.deepEqual(entry, before);
  assert.equal(projectOrderListEntry(entry).payloadForRetry.orderState.payrollOverrides, undefined);
  assert.deepEqual(projectOrderListEntry(entry, { includePayroll: true }).payloadForRetry.orderState.payrollOverrides, { a: "500.00", b: "0.00" });
  const edited = prepareOrderPayouts(entry, [{ staffId: "b", cents: 12550 }], team, team);
  assert.deepEqual(edited.overrides, { a: "500.00", b: "125.50" });
  assert.equal(edited.payroll, null, "upcoming orders are not accrued early");
  assert.deepEqual(entry, before, "preparation never mutates an order");
});

test("settled payroll, including zero and removed staff, stays immutable when another cleaner's payout changes", () => {
  const paid = { staffId: "retired", status: "paid", amountCents: 42000, compensationType: "fixed", compensationValue: "420", paidAt: "2026-10-20T12:00:00Z" };
  const zero = { staffId: "a", status: "paid", amountCents: 0, compensationType: "fixed", compensationValue: "0" };
  const entry = order({ status: "completed", payrollOverrides: { a: "600" }, payroll: { items: [paid, zero] } });
  assert.deepEqual(orderPayouts(entry, team), [{ staffId: "a", cents: 0 }, { staffId: "b", cents: null }, { staffId: "retired", cents: 42000 }]);
  for (const staffId of ["a", "retired"]) assert.throws(() => prepareOrderPayouts(entry, [{ staffId, cents: 100 }], team, team), { status: 409 });
  const edit = prepareOrderPayouts(entry, [{ staffId: "b", cents: 10000 }], team, team);
  assert.deepEqual(edit.payroll.items.find(item => item.staffId === "retired"), paid);
  assert.deepEqual(edit.payroll.items.find(item => item.staffId === "a"), zero);
  assert.equal(edit.after.find(item => item.staffId === "b").cents, 10000);
  const snapshot = buildOrderPayrollSnapshot({ entry, assignment: { staffIds: ["a"] }, staffRecords: team, existingPayroll: { items: [zero] } });
  assert.equal(snapshot.items[0].amountCents, 0);
});

test("blank clears an upcoming fixed override, unchanged values do not convert percentages or write payroll", () => {
  const entry = order({ payrollOverrides: { a: "500" } });
  assert.deepEqual(prepareOrderPayouts(entry, [{ staffId: "a", cents: null }], team, team).overrides, {});
  assert.equal(prepareOrderPayouts(entry, [{ staffId: "a", cents: 50000 }], team, team).changed, false);
  assert.throws(() => prepareOrderPayouts(entry, [{ staffId: "outside", cents: 1 }], team, team), { status: 403 });
});

test("an unpaid stale percentage snapshot reads the current fixed pay in all three views without rewriting history", () => {
  const entry = order({ status: "completed", payrollOverrides: { a: "500.00" },
    payroll: { items: [{ staffId: "a", staffName: "Cleaner A", amountCents: 26700, status: "owed", compensationType: "percent", compensationValue: "50" }] } });
  const before = structuredClone(entry);
  assert.equal(getEntryPayrollData(entry).items[0].amountCents, 50000, "cleaner earnings");
  assert.equal(collectPayrollRecords({ entries: [entry] }).rows[0].amountCents, 50000, "admin payroll");
  assert.equal(orderPayouts(entry, team)[0].cents, 50000, "profitability");
  assert.deepEqual(entry, before);
});
