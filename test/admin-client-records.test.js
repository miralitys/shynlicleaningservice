"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminClientDomain } = require("../lib/admin/domain-clients");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function getEntryPayload(entry = {}) {
  return entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
}

function createClientDomain() {
  return createAdminClientDomain({
    getEntryAdminSmsData() {
      return {};
    },
    getEntryCalculatorData(entry = {}) {
      const calculatorData = getEntryPayload(entry).calculatorData;
      return calculatorData && typeof calculatorData === "object" ? calculatorData : {};
    },
    getEntryPayload,
    getEntrySmsHistory() {
      return [];
    },
    getRequestUrl() {
      return new URL("https://shynlicleaningservice.com/admin/clients");
    },
    normalizeAdminSmsHistoryEntries(entries = []) {
      return Array.isArray(entries) ? entries : [];
    },
    normalizeString,
  });
}

function createClientOrder(policyAcceptance) {
  return {
    id: "client-address-order-1",
    customerName: "Address Client",
    customerPhone: "3125550101",
    customerEmail: "address@example.com",
    fullAddress: "100 Wrong Street, Naperville, IL 60540",
    payloadForRetry: {
      calculatorData: {
        fullAddress: "100 Wrong Street, Naperville, IL 60540",
        address: "100 Wrong Street, Naperville, IL 60540",
      },
      quoteData: {
        fullAddress: "100 Wrong Street, Naperville, IL 60540",
      },
      adminClient: {
        addressBook: [{ address: "100 Wrong Street, Naperville, IL 60540" }],
      },
      adminOrder: {
        isCreated: true,
        status: "scheduled",
        policyAccepted: Boolean(policyAcceptance && policyAcceptance.policyAccepted),
        policyAcceptance,
      },
    },
  };
}

test("syncs a corrected client address into its order and pending policy", () => {
  const { applyClientEntryUpdates } = createClientDomain();
  const entry = createClientOrder({
    status: "sent",
    policyAccepted: false,
    serviceAddress: "100 Wrong Street, Naperville, IL 60540",
  });

  applyClientEntryUpdates(entry, {
    addressBook: [{ address: "100 Correct Street, Naperville, IL 60540" }],
    addressReplacements: [
      {
        from: "100 Wrong Street, Naperville, IL 60540",
        to: "100 Correct Street, Naperville, IL 60540",
      },
    ],
  });

  const payload = getEntryPayload(entry);
  assert.equal(entry.fullAddress, "100 Correct Street, Naperville, IL 60540");
  assert.equal(payload.calculatorData.fullAddress, "100 Correct Street, Naperville, IL 60540");
  assert.equal(payload.calculatorData.address, "100 Correct Street, Naperville, IL 60540");
  assert.equal(payload.quoteData.fullAddress, "100 Correct Street, Naperville, IL 60540");
  assert.equal(
    payload.adminOrder.policyAcceptance.serviceAddress,
    "100 Correct Street, Naperville, IL 60540"
  );
});

test("keeps a signed policy snapshot unchanged when the client address changes", () => {
  const { applyClientEntryUpdates } = createClientDomain();
  const entry = createClientOrder({
    status: "accepted",
    policyAccepted: true,
    signedAt: "2026-08-01T16:00:00.000Z",
    serviceAddress: "100 Wrong Street, Naperville, IL 60540",
  });

  applyClientEntryUpdates(entry, {
    addressBook: [{ address: "100 Correct Street, Naperville, IL 60540" }],
    addressReplacements: [
      {
        from: "100 Wrong Street, Naperville, IL 60540",
        to: "100 Correct Street, Naperville, IL 60540",
      },
    ],
  });

  assert.equal(entry.fullAddress, "100 Correct Street, Naperville, IL 60540");
  assert.equal(
    getEntryPayload(entry).adminOrder.policyAcceptance.serviceAddress,
    "100 Wrong Street, Naperville, IL 60540"
  );
});
