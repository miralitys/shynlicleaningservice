"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminDomainFormatters } = require("../lib/admin/domain-formatters");
const { createAdminOrderDomain } = require("../lib/admin/domain-orders");
const state = require("../lib/admin-order-state");
const { runAdminReadContext, getAdminReadHeaders, measureAdminRead } = require("../lib/admin/read-context");

const normalizeString = (value, length = 0) => {
  const text = String(value ?? "").trim();
  return length ? text.slice(0, length) : text;
};
const formatters = () => createAdminDomainFormatters({ normalizeString });

test("reused formatters preserve currencies, invalid values, dates and Chicago DST output", () => {
  const f = formatters();
  for (const value of [0, -0, null, undefined, "", 534, 466.5, 0.01, -1.25, 1234567.89, "500.00", NaN, Infinity]) {
    const expected = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      .format(Number(value || 0));
    assert.equal(f.formatCurrencyAmount(value), expected);
  }
  for (const value of ["2026-03-08T07:59:00Z", "2026-03-08T08:01:00Z", "2026-11-01T06:59:00Z",
    "2026-11-01T07:01:00Z", "2026-01-01T05:00:00Z", "bad", "", null]) {
    const date = new Date(value);
    const expected = !value || Number.isNaN(date.getTime()) ? "Не указано" : date.toLocaleString("en-US", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: "America/Chicago",
    });
    assert.equal(f.formatAdminDateTime(value), expected);
  }
  for (const value of ["2026-03-08", "2026-11-01", "2026-02-30", "2000-02-29", "bad", ""]) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const expected = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], 12)).toLocaleDateString("en-US", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC",
    }) : value || "Не указано";
    assert.equal(f.formatAdminCalendarDate(value), expected);
  }
  for (let hour = 0; hour < 24; hour++) for (const minute of [0, 5, 30, 59]) {
    const expected = new Date(Date.UTC(2000, 0, 1, hour, minute)).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC",
    });
    assert.equal(f.formatAdminClockTime(`${hour}:${String(minute).padStart(2, "0")}`), expected);
    assert.equal(f.formatAdminClockTime(`${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`), expected);
  }
  for (const value of ["24:00", "13:00 PM", "bad", ""]) {
    assert.equal(f.formatAdminClockTime(value), value || "Не указано");
  }
});

test("formatter instances are reused without retaining formatted customer values", () => {
  const OriginalDate = Intl.DateTimeFormat;
  const OriginalNumber = Intl.NumberFormat;
  let dates = 0, numbers = 0;
  Intl.DateTimeFormat = function (...args) { dates++; return new OriginalDate(...args); };
  Intl.NumberFormat = function (...args) { numbers++; return new OriginalNumber(...args); };
  try {
    const f = formatters();
    for (let i = 0; i < 100; i++) {
      f.formatCurrencyAmount(i);
      f.formatAdminDateTime("2026-10-25T12:00:00Z");
      f.formatAdminCalendarDate("2026-10-25");
      f.formatAdminClockTime("09:00");
    }
    assert.equal(dates, 3);
    assert.equal(numbers, 1);
  } finally { Intl.DateTimeFormat = OriginalDate; Intl.NumberFormat = OriginalNumber; }
});

function fixture() {
  const statuses = ["new", "scheduled", "en-route", "rescheduled", "cleaning-started", "checklist", "photos",
    "cleaning-complete", "invoice-sent", "paid", "awaiting-review", "completed", "canceled"];
  const entries = statuses.map((status, i) => ({
    id: `order-${i}`, createdAt: "2026-08-01T12:00:00Z", customerName: `Client ${i}`, customerPhone: `63055500${i}`,
    serviceType: i % 2 ? "deep" : "standard", selectedDate: i % 2 ? "2026-01-10" : "2099-01-10", selectedTime: "09:00",
    totalPrice: 534 + i / 2, fullAddress: "Test address",
    payloadForRetry: { orderState: { isCreated: true, status, assignedStaff: "Legacy Cleaner", frequency: "bi-weekly",
      serviceDurationMinutes: 180, paymentStatus: i % 2 ? "paid" : "partial", paymentMethod: "zelle",
      policyAcceptance: { policyAccepted: true, signature: { retained: true } },
      payrollOverrides: { cleaner: "500" }, payroll: { items: [{ amountCents: 50000 }] },
      completion: { cleanerComment: "Retained", beforePhotos: [{ path: "before.jpg" }], afterPhotos: [{ path: "after.jpg" }] } },
      adminSms: { history: [{ message: "Retained history" }] } },
  }));
  entries.push({ id: "legacy", totalPrice: 417, payloadForRetry: { adminOrder: { completion: { cleanerComment: "Legacy order" } } } });
  entries.push({ id: "not-order", payloadForRetry: {} });
  return entries;
}

function domain(counters = { order: 0, payment: 0 }) {
  return createAdminOrderDomain({ ...formatters(), normalizeString,
    getEntryAdminOrderData: entry => { counters.order++; return state.getEntryOrderState(entry); },
    getEntryPaymentData: entry => { counters.payment++; return state.getEntryPaymentState(entry); },
    getEntryOrderPolicyAcceptanceData: state.getEntryOrderPolicyAcceptanceData,
    getEntryCalculatorData: entry => entry.payloadForRetry?.calculatorData || {},
    ORDER_ASSIGNMENT_VALUES: ["all", "assigned", "unassigned"],
  });
}

test("order projection reads shared fields once and preserves unary reader callbacks and every original record", () => {
  const entries = fixture();
  const before = structuredClone(entries);
  const counts = { order: 0, payment: 0 };
  const d = domain(counts);
  const expected = entries.filter(d.isOrderCreatedEntry).map(entry => ({ id: entry.id,
    status: d.getOrderStatus(entry), frequency: d.getOrderFrequency(entry), duration: d.getOrderServiceDurationMinutes(entry),
    assignedStaff: d.getOrderAssignedStaff(entry), paymentStatus: d.getOrderPaymentStatus(entry), paymentMethod: d.getOrderPaymentMethod(entry) }));
  counts.order = counts.payment = 0;
  const records = d.collectAdminOrderRecords(entries);
  assert.equal(counts.order, entries.length);
  assert.equal(counts.payment, records.length);
  assert.deepEqual(records.map(order => ({ id: order.id, status: order.orderStatus, frequency: order.frequency,
    duration: order.serviceDurationMinutes, assignedStaff: order.assignedStaff, paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod })), expected);
  assert.deepEqual(entries.map(d.getOrderStatus), entries.map(entry => d.getOrderStatus(entry)));
  assert.deepEqual(entries.map(d.getOrderPaymentMethod), entries.map(entry => d.getOrderPaymentMethod(entry)));
  assert.deepEqual(entries, before);
  records[0].policyAcceptance.signature.retained = false;
  assert.deepEqual(entries, before, "Read projections cannot mutate original policy data");
  entries[0].payloadForRetry.orderState.assignedStaff = "Updated Cleaner";
  assert.equal(d.collectAdminOrderRecords(entries)[0].assignedStaff, "Updated Cleaner", "No cache survives another preparation");
});

test("planning reuses exact projections without losing legacy orders or overriding assignment date/team precedence", () => {
  const entries = fixture();
  const staff = { staff: [{ id: "cleaner", name: "Assigned Cleaner" }], assignments: [
    { entryId: entries[0].id, staffIds: ["cleaner"], scheduleDate: "2099-02-01", scheduleTime: "14:30", status: "confirmed" },
    { entryId: entries[1].id, staffIds: ["cleaner", "missing"], status: "planned" },
  ] };
  const before = structuredClone({ entries, staff });
  const counts = { order: 0, payment: 0 };
  const d = domain(counts);
  const expected = d.buildStaffPlanningContext(entries, staff);
  const projections = d.collectAdminOrderRecords(entries);
  counts.order = 0;
  const actual = d.buildStaffPlanningContext(entries, staff, projections);
  assert.deepEqual(actual, expected);
  assert.equal(counts.order, 1, "Only the non-order needs identification again");
  const reloaded = structuredClone(entries);
  reloaded[0].selectedDate = "2099-03-01";
  reloaded[1].payloadForRetry.orderState.serviceDurationMinutes = 250;
  assert.deepEqual(d.buildStaffPlanningContext(reloaded, staff, projections), d.buildStaffPlanningContext(reloaded, staff),
    "Projections of a different record instance cannot hide fresh values");
  assert.deepEqual({ entries, staff }, before);
});

test("orders phase timing is allowlisted, accumulated, safe on failure and free of business fields", async () => {
  const res = {};
  await runAdminReadContext({ res, route: "/admin/orders" }, async () => {
    measureAdminRead("orders_projection", () => 1);
    measureAdminRead("orders_projection", () => 2);
    await assert.rejects(measureAdminRead("orders_fetch", async () => { throw new Error("private data"); }), /private data/);
    for (const phase of ["orders_decode", "orders_hydrate", "orders_clients", "orders_sources", "orders_staff_context",
      "orders_planning", "orders_filter", "orders_counts", "orders_html", "orders_funnel", "orders_table",
      "orders_dialog", "orders_create_form"]) measureAdminRead(phase, () => "private data");
    measureAdminRead("order-id-or-customer", () => "private data");
  });
  const header = getAdminReadHeaders(res)["Server-Timing"];
  assert.equal((header.match(/admin_orders_projection;/g) || []).length, 1);
  assert.match(header, /admin_orders_fetch;dur=/);
  assert.match(header, /admin_orders_create_form;dur=/);
  assert.doesNotMatch(header, /private|customer|order-id/);
});
