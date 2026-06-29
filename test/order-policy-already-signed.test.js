"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminSmsHelpers } = require("../lib/admin/handlers-sms-helpers");
const { createAdminOrdersCreateHandlers } = require("../lib/admin/handlers-orders-create");
const { createOrdersUiPolicyPanel } = require("../lib/admin/pages/orders-ui-policy-panel");
const { getEntryOrderPolicyAcceptanceData } = require("../lib/admin-order-state");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
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
    certificateFileId: "certificate-policy-1",
    certificateFile: {
      id: "certificate-policy-1",
      fileName: "policy-certificate-1.pdf",
      relativePath: "policy-certificates/policy-certificate-1.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      generatedAt: "2026-05-01T15:10:05.000Z",
      generatorVersion: "test-v1",
    },
    auditTrailJson: {
      acceptanceId: "accepted-policy-1",
      documents: [{ title: "Terms of Service" }],
    },
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
  assert.equal(reusedPolicy.certificateFileId, previousAcceptedPolicy.certificateFileId);
  assert.deepEqual(reusedPolicy.certificateFile, previousAcceptedPolicy.certificateFile);
  assert.deepEqual(reusedPolicy.auditTrailJson, previousAcceptedPolicy.auditTrailJson);
  assert.notEqual(reusedPolicy.acceptanceId, previousAcceptedPolicy.acceptanceId);
});

test("repairs an already accepted policy record when the reused certificate is missing", async () => {
  const previousAcceptedPolicy = {
    acceptanceId: "accepted-policy-with-certificate",
    bookingId: "previous-order-with-certificate",
    requestId: "previous-request-with-certificate",
    status: "accepted",
    signedAt: "2026-05-03T17:30:00.000Z",
    customerFullName: "Policy Customer",
    customerEmail: "policy.customer@example.com",
    customerPhone: "312-555-3311",
    acceptedTerms: true,
    acceptedPaymentCancellation: true,
    typedSignature: "Policy Customer",
    policyAccepted: true,
    certificateFileId: "certificate-policy-repair",
    certificateFile: {
      id: "certificate-policy-repair",
      fileName: "policy-certificate-repair.pdf",
      relativePath: "policy-certificates/policy-certificate-repair.pdf",
      contentType: "application/pdf",
      sizeBytes: 3072,
      generatedAt: "2026-05-03T17:30:05.000Z",
      generatorVersion: "test-v1",
    },
    auditTrailJson: {
      acceptanceId: "accepted-policy-with-certificate",
      events: [{ type: "POLICY_ACCEPTED" }],
    },
  };
  const currentAcceptedWithoutCertificate = {
    acceptanceId: "accepted-policy-without-certificate",
    bookingId: "next-order",
    requestId: "next-request",
    status: "accepted",
    signedAt: "2026-05-03T17:30:00.000Z",
    customerFullName: "Policy Customer",
    customerEmail: "policy.customer@example.com",
    customerPhone: "312-555-3311",
    acceptedTerms: true,
    acceptedPaymentCancellation: true,
    typedSignature: "Policy Customer",
    policyAccepted: true,
    certificateFileId: "",
    certificateFile: null,
    auditTrailJson: null,
  };
  const previousEntry = createOrderEntry("previous-order-with-certificate", {
    policyAcceptance: previousAcceptedPolicy,
  });
  const nextEntry = createOrderEntry("next-order", {
    requestId: "next-request",
    policyAcceptance: currentAcceptedWithoutCertificate,
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
    normalizeString,
    orderPolicyAcceptance: {
      async buildPendingAcceptance() {
        throw new Error("A new policy link should not be generated.");
      },
    },
  });

  const result = await helpers.applyAlreadyAcceptedPolicyForClient(
    ledger,
    nextEntry.id,
    nextEntry
  );

  assert.equal(result.applied, true);
  assert.equal(result.current, false);
  const repairedPolicy = nextEntry.payloadForRetry.orderState.policyAcceptance;
  assert.equal(repairedPolicy.policyAccepted, true);
  assert.equal(repairedPolicy.bookingId, "next-order");
  assert.equal(repairedPolicy.requestId, "next-request");
  assert.equal(repairedPolicy.certificateFileId, previousAcceptedPolicy.certificateFileId);
  assert.deepEqual(repairedPolicy.certificateFile, previousAcceptedPolicy.certificateFile);
  assert.deepEqual(repairedPolicy.auditTrailJson, previousAcceptedPolicy.auditTrailJson);
  assert.notEqual(repairedPolicy.acceptanceId, currentAcceptedWithoutCertificate.acceptanceId);
  assert.notEqual(repairedPolicy.acceptanceId, previousAcceptedPolicy.acceptanceId);
});

test("renders certificate link for accepted policy records even before certificate metadata is repaired", () => {
  const { renderOrderPolicyAcceptancePanel } = createOrdersUiPolicyPanel({
    ADMIN_ORDERS_PATH: "/admin/orders",
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH: "/api/admin/policy-acceptance",
    escapeHtml,
    escapeHtmlAttribute: escapeHtml,
    formatAdminDateTime(value) {
      return value;
    },
    normalizeString,
    renderAdminBadge(label, tone) {
      return `<span class="badge-${tone}">${escapeHtml(label)}</span>`;
    },
    renderOrderBriefFact(label, value) {
      return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    },
  });

  const html = renderOrderPolicyAcceptancePanel(
    {
      id: "accepted-without-certificate",
      orderStatus: "scheduled",
      policyAcceptance: {
        acceptanceId: "accepted-without-certificate-policy",
        status: "accepted",
        policyAccepted: true,
        sentAt: "2026-05-30T18:45:00.000Z",
        firstViewedAt: "2026-05-30T19:09:00.000Z",
        signedAt: "2026-05-30T19:22:00.000Z",
        certificateFileId: "",
        certificateFile: null,
      },
    },
    { canEdit: true, returnTo: "/admin/orders?order=accepted-without-certificate" }
  );

  assert.match(html, /Подписано/);
  assert.match(html, /Открыть сертификат PDF/);
  assert.match(
    html,
    /href="\/api\/admin\/policy-acceptance\/accepted-without-certificate\/certificate"/
  );
});

test("manual order creation marks policy accepted when existing client already signed", async () => {
  const previousAcceptedPolicy = {
    acceptanceId: "accepted-policy-mona",
    bookingId: "previous-mona-order",
    requestId: "previous-mona-request",
    status: "accepted",
    signedAt: "2026-06-23T14:10:00.000Z",
    createdAt: "2026-06-23T14:00:00.000Z",
    updatedAt: "2026-06-23T14:10:00.000Z",
    customerFullName: "Mona",
    customerEmail: "mona@example.com",
    customerPhone: "+17080858185",
    acceptedTerms: true,
    acceptedPaymentCancellation: true,
    typedSignature: "Mona",
    policyAccepted: true,
    certificateFileId: "certificate-mona",
    certificateFile: {
      id: "certificate-mona",
      fileName: "policy-certificate-mona.pdf",
      relativePath: "policy-certificates/policy-certificate-mona.pdf",
      contentType: "application/pdf",
      sizeBytes: 4096,
      generatedAt: "2026-06-23T14:10:05.000Z",
      generatorVersion: "test-v1",
    },
    auditTrailJson: {
      acceptanceId: "accepted-policy-mona",
      documents: [{ title: "Payment and Cancellation Policy" }],
    },
  };
  const previousEntry = createOrderEntry("previous-mona-order", {
    customerName: "Mona",
    customerEmail: "mona@example.com",
    customerPhone: "+17080858185",
    contactId: "contact-mona",
    policyAcceptance: previousAcceptedPolicy,
  });
  const entries = [previousEntry];
  const ledger = {
    async recordSubmission(payload = {}) {
      const entry = {
        id: "manual-mona-order",
        requestId: payload.requestId,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        fullAddress: payload.fullAddress,
        contactId: payload.contactId,
        payloadForRetry: {
          ...(payload.payloadForRetry || {}),
          orderState: {},
          adminOrder: {},
        },
      };
      entries.unshift(entry);
      return entry;
    },
    async updateOrderEntry(entryId, updates = {}) {
      const entry = entries.find((item) => item.id === entryId) || null;
      if (!entry) return null;
      entry.payloadForRetry = entry.payloadForRetry || {};
      entry.payloadForRetry.orderState = {
        ...(entry.payloadForRetry.orderState || {}),
      };
      entry.payloadForRetry.adminOrder = {
        ...(entry.payloadForRetry.adminOrder || {}),
      };
      if (Object.prototype.hasOwnProperty.call(updates, "policyAcceptance")) {
        return writePolicyAcceptance(entry, updates.policyAcceptance);
      }
      if (updates.createOrder) {
        entry.payloadForRetry.orderState = {
          ...entry.payloadForRetry.orderState,
          isCreated: true,
          status: updates.orderStatus || "new",
          selectedDate: updates.selectedDate || "",
          selectedTime: updates.selectedTime || "",
          serviceDurationMinutes: updates.serviceDurationMinutes || 0,
          frequency: updates.frequency || "",
          totalPrice: updates.totalPrice || "",
          paymentStatus: updates.paymentStatus || "",
        };
        entry.payloadForRetry.adminOrder = {
          ...entry.payloadForRetry.adminOrder,
          ...entry.payloadForRetry.orderState,
        };
      }
      return entry;
    },
    async listEntries() {
      return entries;
    },
  };

  const helpers = createAdminSmsHelpers({
    normalizeString,
    orderPolicyAcceptance: {
      async buildPendingAcceptance() {
        throw new Error("A new policy link should not be generated.");
      },
    },
  });
  const redirects = [];
  const { handleCreateManualOrder } = createAdminOrdersCreateHandlers({
    applyAlreadyAcceptedPolicyForClient: helpers.applyAlreadyAcceptedPolicyForClient,
    buildManualOrderRequestId() {
      return "manual-mona-order-request";
    },
    formatManualOrderServiceLabel(value) {
      return value === "standard" ? "Standard" : "Deep";
    },
    buildOrdersRedirect(basePath, notice, params = {}) {
      const searchParams = new URLSearchParams({ notice, ...params });
      return `${basePath}?${searchParams.toString()}`;
    },
    normalizeManualOrderFrequency(value) {
      return normalizeString(value, 40);
    },
    normalizeManualOrderServiceType(value) {
      return normalizeString(value, 40) || "standard";
    },
    getFormValue(body, name, maxLength = 500) {
      return normalizeString(body && body[name], maxLength);
    },
    redirectWithTiming(res, statusCode, location) {
      res.statusCode = statusCode;
      res.location = location;
      redirects.push({ statusCode, location });
    },
    ADMIN_ORDERS_PATH: "/admin/orders",
  });

  const res = {};
  await handleCreateManualOrder({
    res,
    requestStartNs: process.hrtime.bigint(),
    requestContext: { cacheHit: false },
    quoteOpsLedger: ledger,
    formBody: {
      customerName: "Mona",
      customerPhone: "+17080858185",
      customerEmail: "mona@example.com",
      fullAddress: "13800 S Autumn Wy, Plainfield, IL 60544, USA",
      selectedClientContactId: "contact-mona",
      serviceType: "standard",
      selectedDate: "2026-07-01",
      selectedTime: "9:00 AM",
      serviceDurationHours: "2",
      serviceDurationMinutes: "30",
      frequency: "",
      totalPrice: "155.00",
    },
    returnTo: "/admin/orders",
  });

  const manualEntry = entries.find((entry) => entry.id === "manual-mona-order");
  const reusedPolicy = getEntryOrderPolicyAcceptanceData(manualEntry);
  assert.equal(redirects.length, 1);
  assert.equal(res.statusCode, 303);
  assert.match(res.location, /notice=manual-order-created/);
  assert.equal(reusedPolicy.policyAccepted, true);
  assert.equal(reusedPolicy.status, "accepted");
  assert.equal(reusedPolicy.bookingId, "manual-mona-order");
  assert.equal(reusedPolicy.requestId, "manual-mona-order-request");
  assert.equal(reusedPolicy.customerEmail, "mona@example.com");
  assert.equal(reusedPolicy.customerPhone, "+17080858185");
  assert.equal(reusedPolicy.serviceAddress, "13800 S Autumn Wy, Plainfield, IL 60544, USA");
  assert.equal(reusedPolicy.certificateFileId, previousAcceptedPolicy.certificateFileId);
  assert.deepEqual(reusedPolicy.certificateFile, previousAcceptedPolicy.certificateFile);
  assert.deepEqual(reusedPolicy.auditTrailJson, previousAcceptedPolicy.auditTrailJson);
  assert.notEqual(reusedPolicy.acceptanceId, previousAcceptedPolicy.acceptanceId);
});
