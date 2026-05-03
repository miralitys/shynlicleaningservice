"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminOrderMutationDomain } = require("../lib/admin/domain-order-mutations");
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
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function createMutationDomain() {
  return createAdminOrderMutationDomain({
    ADMIN_ORDERS_PATH: "/admin/orders",
    cloneSerializable,
    formatAdminScheduleLabel(dateValue, timeValue) {
      return [dateValue, timeValue].filter(Boolean).join(" ");
    },
    getEntryAdminOrderData: getEntryOrderState,
    getEntryAdminSmsData(entry = {}) {
      const payload = getEntryPayload(entry);
      return payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
    },
    getEntryCalculatorData(entry = {}) {
      const payload = getEntryPayload(entry);
      return payload.calculatorData && typeof payload.calculatorData === "object"
        ? cloneSerializable(payload.calculatorData, {})
        : {};
    },
    getEntryPayload,
    getEntryPaymentData: getEntryPaymentState,
    getEntrySmsHistory(entry = {}) {
      const payload = getEntryPayload(entry);
      const adminSms = payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
      return Array.isArray(adminSms.history) ? adminSms.history : [];
    },
    getOrderFrequency(entry = {}) {
      return normalizeString(getEntryOrderState(entry).frequency, 40);
    },
    getOrderSelectedDate(entry = {}) {
      return normalizeString(getEntryOrderState(entry).selectedDate || entry.selectedDate, 32);
    },
    getOrderSelectedTime(entry = {}) {
      return normalizeString(getEntryOrderState(entry).selectedTime || entry.selectedTime, 32);
    },
    getOrderServiceType(entry = {}) {
      return normalizeString(entry.serviceType, 40);
    },
    getOrderServiceDurationMinutes(entry = {}) {
      return Number(getEntryOrderState(entry).serviceDurationMinutes || entry.serviceDurationMinutes || 0);
    },
    getOrderStatus(entry = {}) {
      return normalizeString(getEntryOrderState(entry).status, 40) || "new";
    },
    getPersistedOrderCompletionData() {
      return {};
    },
    isOrderCreatedEntry(entry = {}) {
      return Object.keys(getEntryOrderState(entry)).length > 0;
    },
    normalizeAdminOrderDateInput(value) {
      return normalizeString(value, 32);
    },
    normalizeAdminOrderPriceInput(value, fallback = 0) {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : fallback;
    },
    normalizeAdminOrderTimeInput(value) {
      return normalizeString(value, 32);
    },
    normalizeAdminSmsHistoryEntries(entries = []) {
      return Array.isArray(entries) ? entries : [];
    },
    normalizeOrderFrequency(value) {
      return normalizeString(value, 40);
    },
    normalizeOrderPaymentMethod(value) {
      return normalizeString(value, 40);
    },
    normalizeOrderPaymentStatus(value, fallback = "unpaid") {
      return normalizeString(value, 40).toLowerCase() || fallback;
    },
    normalizeOrderStatus(value, fallback = "new") {
      return normalizeString(value, 40).toLowerCase() || fallback;
    },
    normalizeString,
    setEntryOrderState,
    setEntryPaymentState,
  });
}

test("persists automatic notification state on order updates", () => {
  const { applyOrderEntryUpdates } = createMutationDomain();
  const entry = {
    id: "order-notifications-1",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
    totalPrice: 240,
    totalPriceCents: 24000,
    payloadForRetry: {
      calculatorData: {
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        totalPrice: 240,
      },
      orderState: {
        isCreated: true,
        status: "scheduled",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        paymentStatus: "unpaid",
        totalPrice: 240,
      },
      adminOrder: {
        isCreated: true,
        status: "scheduled",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        paymentStatus: "unpaid",
        totalPrice: 240,
      },
    },
  };

  applyOrderEntryUpdates(entry, {
    notifications: {
      reminderSms: {
        signature: "2026-04-20|10:00",
        sent24hAt: "2026-04-19T10:00:00.000Z",
      },
    },
  });

  assert.deepEqual(getEntryOrderState(entry).notifications, {
    reminderSms: {
      signature: "2026-04-20|10:00",
      sent24hAt: "2026-04-19T10:00:00.000Z",
    },
  });

  applyOrderEntryUpdates(entry, {
    paymentStatus: "paid",
  });

  assert.equal(getEntryOrderState(entry).paymentStatus, "paid");
  assert.deepEqual(getEntryOrderState(entry).notifications, {
    reminderSms: {
      signature: "2026-04-20|10:00",
      sent24hAt: "2026-04-19T10:00:00.000Z",
    },
  });
});

test("persists service duration and carries it into recurring orders", () => {
  const { applyOrderEntryUpdates, buildRecurringOrderSubmission } = createMutationDomain();
  const entry = {
    id: "order-duration-1",
    requestId: "duration-order-1",
    customerName: "Duration Customer",
    customerPhone: "3125550101",
    customerEmail: "duration@example.com",
    serviceType: "standard",
    serviceName: "Standard",
    fullAddress: "1289 Rickert Dr, Naperville, IL 60563",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
    totalPrice: 240,
    totalPriceCents: 24000,
    payloadForRetry: {
      calculatorData: {
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        frequency: "weekly",
        totalPrice: 240,
      },
      orderState: {
        isCreated: true,
        status: "scheduled",
        frequency: "weekly",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        paymentStatus: "unpaid",
        totalPrice: 240,
      },
      adminOrder: {
        isCreated: true,
        status: "scheduled",
        frequency: "weekly",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        paymentStatus: "unpaid",
        totalPrice: 240,
      },
    },
  };

  applyOrderEntryUpdates(entry, {
    serviceDurationMinutes: 150,
  });

  assert.equal(entry.serviceDurationMinutes, 150);
  assert.equal(getEntryOrderState(entry).serviceDurationMinutes, 150);
  assert.equal(getEntryPayload(entry).calculatorData.serviceDurationMinutes, 150);

  const recurringSubmission = buildRecurringOrderSubmission(entry);
  assert.ok(recurringSubmission);
  assert.equal(recurringSubmission.payloadForRetry.calculatorData.serviceDurationMinutes, 150);
  assert.equal(recurringSubmission.payloadForRetry.orderState.serviceDurationMinutes, 150);
  assert.equal(recurringSubmission.payloadForRetry.adminOrder.serviceDurationMinutes, 150);
});
