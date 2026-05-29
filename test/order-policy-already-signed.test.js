"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminSmsHelpers } = require("../lib/admin/handlers-sms-helpers");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function createOrderEntry(id, input = {}) {
  const policyAcceptance = input.policyAcceptance || null;
  const orderState = {
    isCreated: true,
    status: "scheduled",
    ...(policyAcceptance ? { policyAcceptance } : {}),
  };
  return {
    id,
    requestId: input.requestId || id,
    customerName: input.customerName || "Policy Customer",
    customerPhone: input.customerPhone || "312-555-3311",
    customerEmail: input.customerEmail || "policy.customer@example.com",
    fullAddress: input.fullAddress || "742 Cedar Avenue, Aurora, IL 60506",
    contactId: input.contactId || "",
    payloadForRetry: {
      orderState: { ...orderState },
      adminOrder: { ...orderState },
      ...(input.secondaryPhone
        ? {
            adminClient: {
              secondaryPhone: input.secondaryPhone,
            },
          }
        : {}),
    },
  };
}

function writePolicyAcceptance(entry, policyAcceptance) {
  entry.payloadForRetry = entry.payloadForRetry || {};
  entry.payloadForRetry.orderState = {
    ...(entry.payloadForRetry.orderState || {}),
    policyAcceptance,
  };
  entry.payloadForRetry.adminOrder = {
    ...(entry.payloadForRetry.adminOrder || {}),
    policyAcceptance,
  };
  return entry;
}

test("skips policy delivery when the same client already signed once", async () => {
  let buildPendingCalls = 0;
  let emailSendCalls = 0;
  let smsSendCalls = 0;
  const previousAcceptedPolicy = {
    acceptanceId: "accepted-policy-1",
    bookingId: "previous-order",
    requestId: "previous-request",
    status: "accepted",
    sentAt: "2026-05-01T15:00:00.000Z",
    signedAt: "2026-05-01T15:10:00.000Z",
    createdAt: "2026-05-01T15:00:00.000Z",
    updatedAt: "2026-05-01T15:10:00.000Z",
    customerFullName: "Policy Customer",
    customerEmail: "policy.customer@example.com",
    customerPhone: "312-555-3311",
    acceptedTerms: true,
    acceptedPaymentCancellation: true,
    typedSignature: "Policy Customer",
    policyAccepted: true,
  };
  const previousEntry = createOrderEntry("previous-order", {
    policyAcceptance: previousAcceptedPolicy,
  });
  const nextEntry = createOrderEntry("next-order", {
    requestId: "next-request",
    customerPhone: "424-419-9102",
    customerEmail: "policy.customer@example.com",
    fullAddress: "100 New Home Rd, Naperville, IL 60540",
  });
  const entries = [nextEntry, previousEntry];
  const ledger = {
    async listEntries() {
      return entries;
    },
    async updateOrderEntry(entryId, updates = {}) {
      const entry = entries.find((item) => item.id === entryId) || null;
      if (!entry) return null;
      if (Object.prototype.hasOwnProperty.call(updates, "policyAcceptance")) {
        return writePolicyAcceptance(entry, updates.policyAcceptance);
      }
      return entry;
    },
  };

  const helpers = createAdminSmsHelpers({
    accountInviteEmail: {
      async getStatus() {
        return { configured: true };
      },
      async sendOrderPolicyConfirmation() {
        emailSendCalls += 1;
      },
    },
    normalizeString,
    orderPolicyAcceptance: {
      async buildPendingAcceptance() {
        buildPendingCalls += 1;
        throw new Error("A new policy link should not be generated.");
      },
      buildFailedSendRecord(record) {
        return record;
      },
      buildSentAcceptanceRecord(record) {
        return record;
      },
    },
  });

  const result = await helpers.sendOrderPolicyAcceptanceInvite(
    ledger,
    nextEntry.id,
    nextEntry,
    {},
    {
      isConfigured() {
        return true;
      },
      async sendSmsMessage() {
        smsSendCalls += 1;
        return { ok: true };
      },
    }
  );

  assert.equal(result.emailState, "already-signed");
  assert.equal(result.smsState, "skipped");
  assert.equal(buildPendingCalls, 0);
  assert.equal(emailSendCalls, 0);
  assert.equal(smsSendCalls, 0);
  const reusedPolicy = nextEntry.payloadForRetry.orderState.policyAcceptance;
  assert.equal(reusedPolicy.policyAccepted, true);
  assert.equal(reusedPolicy.status, "accepted");
  assert.equal(reusedPolicy.signedAt, previousAcceptedPolicy.signedAt);
  assert.equal(reusedPolicy.confirmationUrl, "");
  assert.equal(reusedPolicy.customerPhone, "424-419-9102");
  assert.equal(reusedPolicy.serviceAddress, "100 New Home Rd, Naperville, IL 60540");
  assert.notEqual(reusedPolicy.acceptanceId, previousAcceptedPolicy.acceptanceId);
});
