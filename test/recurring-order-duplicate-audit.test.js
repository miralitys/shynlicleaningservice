"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { auditDuplicates, normalizeAuditOrder } = require("../scripts/audit-recurring-order-duplicates");

function order(id, overrides = {}) {
  return { id, customerName: "Test Client", customerPhone: "+1 (630) 555-0100", selectedDate: "2026-10-18",
    selectedTime: "10:00", status: "scheduled", fullAddress: "123 Test Street", requestId: "test-next-20261018", ...overrides };
}

test("duplicate audit matches one client and actual date/time despite different teams", () => {
  const rows = [order("original", { team: "Cleaner A" }), order("duplicate", { customerPhone: "6305550100", team: "Cleaner A, Cleaner B", status: "new" })];
  const before = JSON.stringify(rows);
  const report = auditDuplicates(rows);
  assert.equal(report.groupsWithNew, 1);
  assert.equal(report.activeDuplicateGroups, 1);
  assert.equal(report.groups[0].sameRequestId, true);
  assert.equal(report.deleted, 0);
  assert.equal(JSON.stringify(rows), before);
});

test("orders with another time, client or date are not duplicates", () => {
  assert.equal(auditDuplicates([order("a"), order("b", { selectedTime: "11:00" }), order("c", { customerPhone: "3125550100" }), order("d", { selectedDate: "2026-10-19" })]).groups.length, 0);
});

test("client ID also matches, while different addresses and canceled history are review-only", () => {
  const report = auditDuplicates([order("a", { contactId: "client-1" }), order("b", { contactId: "client-1", customerPhone: "3125550100", fullAddress: "456 Other Street" })]);
  assert.equal(report.groups.length, 1);
  assert.equal(report.groups[0].reviewOnly, true);
  assert.equal(auditDuplicates([order("a"), order("b", { status: "canceled" })]).groups[0].reviewOnly, true);
});

test("CSV display dates use appointment time, not request IDs or duration", () => {
  const row = normalizeAuditOrder({ id: "csv", order: "TC Test Client manual-test-next-20261020 • Standard", contacts: "+1(630)555-0100 • client@example.com",
    when: "10/18/2026 (Вс), 10:00 AM Длительность: 4 ч", status: "Новый Unpaid", team: "Cleaner A", address: "123 Test Street" });
  assert.equal(row.customerName, "Test Client");
  assert.equal(row.requestId, "manual-test-next-20261020");
  assert.equal(row.date, "2026-10-18");
  assert.equal(row.time, "10:00");
  assert.equal(row.status, "new");
});

test("live dialog data overrides a stale snapshot of the same order without double-counting", () => {
  const report = auditDuplicates([order("a"), order("b", { selectedTime: "11:00" }), { ...order("b"), fields: [
    { name: "selectedTime", value: "10:00 AM" }, { name: "selectedDate", value: "10/18/2026" },
    { name: "orderStatus", value: "new" }, { name: "assignedStaff", value: "Cleaner B", checked: true },
  ] }]);
  assert.equal(report.ordersRead, 2);
  assert.equal(report.groupsWithNew, 1);
});
