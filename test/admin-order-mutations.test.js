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

test("copies client address and quote details into recurring orders", () => {
  const { buildRecurringOrderSubmission } = createMutationDomain();
  const entry = {
    id: "order-recurring-client-details-1",
    requestId: "recurring-client-details-1",
    customerName: "Recurring Details Customer",
    customerPhone: "3125550102",
    customerEmail: "details@example.com",
    serviceType: "standard",
    serviceName: "Standard",
    fullAddress: "13800 S Autumn Wy, Plainfield, IL 60544, USA",
    selectedDate: "2026-06-09",
    selectedTime: "09:00",
    totalPrice: 175,
    totalPriceCents: 17500,
    payloadForRetry: {
      calculatorData: {
        selectedDate: "2026-06-09",
        selectedTime: "09:00",
        frequency: "biweekly",
        totalPrice: 175,
      },
      quoteData: {
        services: ["insideCabinets", "refrigeratorCleaning"],
        quantityServices: {
          interiorWindowsCleaning: 4,
        },
      },
      adminClient: {
        addressBook: [
          {
            address: "13800 S Autumn Wy, Plainfield, IL 60544, USA",
            roomCount: "2",
            bathroomCount: "2",
            squareFootage: "1500 sq ft",
            pets: "dog",
            notes: "Gate code 2040. Please use side entrance.",
          },
        ],
      },
      orderState: {
        isCreated: true,
        status: "completed",
        frequency: "biweekly",
        selectedDate: "2026-06-09",
        selectedTime: "09:00",
        paymentStatus: "unpaid",
        totalPrice: 175,
      },
      adminOrder: {
        isCreated: true,
        status: "completed",
        frequency: "biweekly",
        selectedDate: "2026-06-09",
        selectedTime: "09:00",
        paymentStatus: "unpaid",
        totalPrice: 175,
      },
    },
  };

  const recurringSubmission = buildRecurringOrderSubmission(entry);
  assert.ok(recurringSubmission);
  const calculatorData = recurringSubmission.payloadForRetry.calculatorData;
  assert.equal(calculatorData.selectedDate, "2026-06-23");
  assert.equal(calculatorData.rooms, "2");
  assert.equal(calculatorData.bathrooms, "2");
  assert.equal(calculatorData.squareMeters, "1500 sq ft");
  assert.equal(calculatorData.hasPets, "dog");
  assert.equal(calculatorData.additionalDetails, "Gate code 2040. Please use side entrance.");
  assert.deepEqual(calculatorData.services, ["insideCabinets", "refrigeratorCleaning"]);
  assert.deepEqual(calculatorData.quantityServices, {
    interiorWindowsCleaning: 4,
  });
});

test("persists editable client form fields into quote calculator data", () => {
  const { applyOrderEntryUpdates } = createMutationDomain();
  const entry = {
    id: "order-quote-fields-1",
    requestId: "quote-fields-1",
    customerName: "Quote Fields Customer",
    customerPhone: "3125550101",
    serviceType: "standard",
    serviceName: "Standard",
    fullAddress: "100 Old St, Chicago, IL 60601",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
    totalPrice: 240,
    payloadForRetry: {
      calculatorData: {
        serviceType: "standard",
        frequency: "weekly",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        fullAddress: "100 Old St, Chicago, IL 60601",
        services: ["ovenCleaning"],
        addOns: ["insideCabinets"],
        quantityServices: {
          interiorWindowsCleaning: 1,
        },
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
    serviceType: "deep",
    serviceName: "Deep",
    selectedDate: "2026-05-02",
    selectedTime: "14:30",
    frequency: "biweekly",
    fullAddress: "200 New Ave, Naperville, IL 60540",
    quoteCalculatorData: {
      serviceType: "deep",
      frequency: "biweekly",
      selectedDate: "2026-05-02",
      selectedTime: "14:30",
      formattedDateTime: "",
      rooms: "4",
      bathrooms: "3",
      squareMeters: "2250",
      hasPets: "dog",
      basementCleaning: "yes",
      consent: "no",
      services: ["insideCabinets", "refrigeratorCleaning"],
      quantityServices: {
        interiorWindowsCleaning: "5",
        blindsCleaning: "2",
        bedLinenChange: "1",
      },
      fullAddress: "200 New Ave, Naperville, IL 60540",
      address: "200 New Ave",
      addressLine2: "Suite 8",
      city: "Naperville",
      state: "IL",
      zipCode: "60540",
    },
  });

  const payload = getEntryPayload(entry);
  assert.equal(entry.serviceType, "deep");
  assert.equal(entry.serviceName, "Deep");
  assert.equal(entry.fullAddress, "200 New Ave, Naperville, IL 60540");
  assert.equal(entry.selectedDate, "2026-05-02");
  assert.equal(entry.selectedTime, "14:30");
  assert.equal(getEntryOrderState(entry).frequency, "");
  assert.equal(payload.calculatorData.serviceType, "deep");
  assert.equal(payload.calculatorData.frequency, undefined);
  assert.equal(payload.calculatorData.rooms, "4");
  assert.equal(payload.calculatorData.bathrooms, "3");
  assert.equal(payload.calculatorData.hasPets, "dog");
  assert.equal(payload.calculatorData.basementCleaning, "yes");
  assert.equal(payload.calculatorData.consent, "no");
  assert.deepEqual(payload.calculatorData.services, ["insideCabinets", "refrigeratorCleaning"]);
  assert.equal(payload.calculatorData.addOns, undefined);
  assert.deepEqual(payload.calculatorData.quantityServices, {
    interiorWindowsCleaning: 5,
    blindsCleaning: 2,
    bedLinenChange: 1,
  });
  assert.equal(payload.calculatorData.addressLine2, "Suite 8");
});

test("clears recurring frequency for deep cleaning orders", () => {
  const { applyOrderEntryUpdates, buildRecurringOrderSubmission } = createMutationDomain();
  const entry = {
    id: "deep-order-1",
    requestId: "deep-order-1",
    customerName: "Deep Customer",
    customerPhone: "3125550101",
    serviceType: "deep",
    serviceName: "Deep",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
    totalPrice: 240,
    payloadForRetry: {
      calculatorData: {
        serviceType: "deep",
        frequency: "biweekly",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
        totalPrice: 240,
      },
      adminOrder: {
        isCreated: true,
        status: "new",
        frequency: "biweekly",
        selectedDate: "2026-04-20",
        selectedTime: "10:00",
      },
    },
  };

  applyOrderEntryUpdates(entry, {
    createOrder: true,
    frequency: "biweekly",
  });

  assert.equal(getEntryOrderState(entry).frequency, "");
  assert.equal(getEntryPayload(entry).calculatorData.frequency, undefined);
  assert.equal(buildRecurringOrderSubmission(entry), null);
});
