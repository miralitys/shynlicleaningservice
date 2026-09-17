"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createOrderPolicyAcceptancePublicService,
} = require("../lib/order-policy/public-service");

function createEntry(overrides = {}) {
  const orderState = {
    status: "new",
    selectedDate: "2026-09-19",
    selectedTime: "09:00",
    assignedStaff: "Zilola Furkatovna",
  };
  return {
    id: "najiyyah-order",
    serviceType: "standard",
    selectedDate: orderState.selectedDate,
    selectedTime: orderState.selectedTime,
    assignedStaff: orderState.assignedStaff,
    payloadForRetry: {
      orderState: { ...orderState },
      adminOrder: { ...orderState },
    },
    ...overrides,
  };
}

function createService(entry, updates) {
  return createOrderPolicyAcceptancePublicService({
    normalizeString: (value, maxLength = 500) => String(value || "").trim().slice(0, maxLength),
    normalizeBoolean: (value) => value === true,
    appendPolicyEvent: (record) => ({ ...record }),
    resolveTokenContext: async () => ({
      entry,
      record: { bookingId: entry.id },
    }),
    updateEntryPolicyAcceptance: async (ledger, entryId, policyAcceptance) => {
      updates.push({ policyAcceptance });
      entry.payloadForRetry.orderState.policyAcceptance = policyAcceptance;
      entry.payloadForRetry.adminOrder.policyAcceptance = policyAcceptance;
      return entry;
    },
    generatePolicyAcceptanceCertificate: async () => Buffer.from("certificate"),
    storeCertificateFile: async () => ({
      id: "certificate-1",
      fileName: "policy.pdf",
      relativePath: "policy.pdf",
      contentType: "application/pdf",
      sizeBytes: 11,
    }),
    buildAuditTrailJson: () => ({}),
  });
}

test("moves a fully assigned new order to scheduled when the policy is signed", async () => {
  const entry = createEntry();
  const updates = [];
  const ledger = {
    async updateOrderEntry(entryId, patch) {
      updates.push(patch);
      if (patch.orderStatus) {
        entry.payloadForRetry.orderState.status = patch.orderStatus;
        entry.payloadForRetry.adminOrder.status = patch.orderStatus;
      }
      return entry;
    },
  };
  const service = createService(entry, updates);

  const result = await service.submitAcceptance(
    ledger,
    "token",
    {
      acceptedTerms: true,
      acceptedPaymentCancellation: true,
      typedSignature: "Najiyyah Williams",
    },
    { headers: {} }
  );

  assert.equal(result.record.policyAccepted, true);
  assert.equal(entry.payloadForRetry.orderState.status, "scheduled");
  assert.ok(updates.some((patch) => patch.orderStatus === "scheduled"));
});

test("does not schedule a signed order until a team is assigned", async () => {
  const entry = createEntry({ assignedStaff: "" });
  entry.payloadForRetry.orderState.assignedStaff = "";
  entry.payloadForRetry.adminOrder.assignedStaff = "";
  const updates = [];
  const ledger = {
    async updateOrderEntry(entryId, patch) {
      updates.push(patch);
      return entry;
    },
  };
  const service = createService(entry, updates);

  await service.submitAcceptance(
    ledger,
    "token",
    {
      acceptedTerms: true,
      acceptedPaymentCancellation: true,
      typedSignature: "Najiyyah Williams",
    },
    { headers: {} }
  );

  assert.equal(updates.some((patch) => patch.orderStatus === "scheduled"), false);
});
