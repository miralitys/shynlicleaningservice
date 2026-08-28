"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminSmsHelpers } = require("../lib/admin/handlers-sms-helpers");

function normalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function createPolicySmsTestFixture(sendResults = []) {
  const waits = [];
  const sentMessages = [];
  const entry = {
    id: "order-kevin-1",
    requestId: "manual-kevin-1",
    customerName: "Kevin Fournier",
    customerPhone: "+1 (630) 555-0100",
    customerEmail: "",
    contactId: "contact-kevin-1",
    payloadForRetry: {
      orderState: {},
      adminOrder: {},
      adminSms: { history: [] },
    },
  };
  const ledger = {
    async listEntries() {
      return [entry];
    },
    async updateOrderEntry(entryId, patch = {}) {
      assert.equal(entryId, entry.id);
      if (patch.policyAcceptance) {
        entry.payloadForRetry.orderState.policyAcceptance = patch.policyAcceptance;
        entry.payloadForRetry.adminOrder.policyAcceptance = patch.policyAcceptance;
      }
      if (Array.isArray(patch.smsHistory)) {
        entry.payloadForRetry.adminSms.history = patch.smsHistory;
      }
      if (patch.contactId) entry.contactId = patch.contactId;
      return entry;
    },
  };
  const helpers = createAdminSmsHelpers({
    normalizeString,
    policySmsRetryDelays: [10, 20],
    async wait(delayMs) {
      waits.push(delayMs);
    },
    accountInviteEmail: {
      async getStatus() {
        return { configured: false };
      },
    },
    orderPolicyAcceptance: {
      async buildPendingAcceptance() {
        return {
          record: { status: "pending", policyAccepted: false },
          emailPayload: {
            confirmUrl: "https://shynlicleaningservice.com/booking/confirm?token=test",
          },
        };
      },
      buildSentAcceptanceRecord(record) {
        return { ...record, status: "sent", sentAt: "2026-08-03T18:00:00.000Z" };
      },
      buildFailedSendRecord(record, error) {
        return { ...record, status: "failed", lastError: error.message };
      },
    },
  });
  const leadConnectorClient = {
    isConfigured() {
      return true;
    },
    async sendSmsMessage(input) {
      sentMessages.push(input.message);
      return sendResults.shift() || {
        ok: true,
        status: 201,
        code: "OK",
        contactId: entry.contactId,
        messageId: `message-${sentMessages.length}`,
      };
    },
  };

  return { entry, helpers, leadConnectorClient, ledger, sentMessages, waits };
}

test("preserves local SMS read state when remote history returns the same message", () => {
  const { mergeAdminSmsHistoryEntries } = createAdminSmsHelpers({ normalizeString });
  const readAt = "2026-05-16T19:30:00.000Z";

  const merged = mergeAdminSmsHistoryEntries(
    [
      {
        id: "local-sms-1",
        sentAt: "2026-05-16T19:00:00.000Z",
        message: "Client reply",
        phone: "+1 (424) 419-9102",
        direction: "inbound",
        source: "client",
        conversationId: "conversation-local",
        messageId: "message-same-1",
        readAt,
      },
    ],
    [
      {
        id: "remote-sms-1",
        sentAt: "2026-05-16T19:00:00.000Z",
        message: "Client reply",
        phone: "+1 (424) 419-9102",
        direction: "inbound",
        source: "client",
        conversationId: "conversation-remote",
        messageId: "message-same-1",
      },
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].readAt, readAt);
  assert.equal(merged[0].messageId, "message-same-1");
  assert.equal(merged[0].conversationId, "conversation-remote");
});

test("keeps new remote SMS entries while preserving read local duplicates", () => {
  const { mergeAdminSmsHistoryEntries } = createAdminSmsHelpers({ normalizeString });

  const merged = mergeAdminSmsHistoryEntries(
    [
      {
        sentAt: "2026-05-16T19:00:00.000Z",
        message: "Already read",
        phone: "+1 (424) 419-9102",
        direction: "inbound",
        source: "client",
        messageId: "message-read-1",
        readAt: "2026-05-16T19:05:00.000Z",
      },
    ],
    [
      {
        sentAt: "2026-05-16T19:00:00.000Z",
        message: "Already read",
        phone: "+1 (424) 419-9102",
        direction: "inbound",
        source: "client",
        messageId: "message-read-1",
      },
      {
        sentAt: "2026-05-16T19:10:00.000Z",
        message: "New incoming message",
        phone: "+1 (424) 419-9102",
        direction: "inbound",
        source: "client",
        messageId: "message-new-1",
      },
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].messageId, "message-new-1");
  assert.equal(merged[1].messageId, "message-read-1");
  assert.ok(merged[1].readAt);
});

test("retries the first policy explanation SMS after a temporary GHL failure", async () => {
  const fixture = createPolicySmsTestFixture([
    {
      ok: true,
      status: 201,
      code: "OK",
      contactId: "contact-kevin-1",
      messageId: "policy-link-1",
    },
    {
      ok: false,
      status: 429,
      code: "SMS_SEND_FAILED",
      message: "Rate limit exceeded",
      retryable: true,
    },
    {
      ok: true,
      status: 201,
      code: "OK",
      contactId: "contact-kevin-1",
      messageId: "policy-explanation-1",
    },
  ]);

  const result = await fixture.helpers.sendOrderPolicyAcceptanceInvite(
    fixture.ledger,
    fixture.entry.id,
    fixture.entry,
    {},
    fixture.leadConnectorClient,
    { sendFollowUpSms: true }
  );

  assert.equal(result.smsState, "sent");
  assert.equal(result.followUpSmsState, "sent");
  assert.deepEqual(fixture.waits, [10]);
  assert.equal(fixture.sentMessages.length, 3);
  assert.match(fixture.sentMessages[0], /review and accept our service policies/i);
  assert.match(fixture.sentMessages[1], /^Kevin, You should have received/i);
  assert.equal(fixture.sentMessages[1], fixture.sentMessages[2]);
  const history = fixture.helpers.getEntrySmsHistoryEntries(fixture.entry);
  assert.equal(history.length, 2);
  assert.equal(history.filter((item) => item.status === "failed").length, 0);
});

test("does not send the policy explanation when an expired link is resent", async () => {
  const fixture = createPolicySmsTestFixture([
    {
      ok: true,
      status: 201,
      code: "OK",
      contactId: "contact-kevin-1",
      messageId: "resent-policy-link-1",
    },
  ]);

  const result = await fixture.helpers.sendOrderPolicyAcceptanceInvite(
    fixture.ledger,
    fixture.entry.id,
    fixture.entry,
    {},
    fixture.leadConnectorClient,
    { sendFollowUpSms: false }
  );

  assert.equal(result.smsState, "sent");
  assert.equal(result.followUpSmsState, "skipped");
  assert.equal(fixture.sentMessages.length, 1);
  assert.match(fixture.sentMessages[0], /review and accept our service policies/i);
});

test("skips an automatic policy invite when client automatic messages are disabled", async () => {
  const fixture = createPolicySmsTestFixture();
  fixture.entry.payloadForRetry.adminClient = {
    automaticNotificationsEnabled: false,
  };

  const result = await fixture.helpers.sendOrderPolicyAcceptanceInvite(
    fixture.ledger,
    fixture.entry.id,
    fixture.entry,
    {},
    fixture.leadConnectorClient,
    {
      sendFollowUpSms: true,
      respectClientAutomaticNotifications: true,
    }
  );

  assert.equal(result.emailState, "notifications-disabled");
  assert.equal(result.smsState, "skipped");
  assert.equal(fixture.sentMessages.length, 0);
  assert.equal(fixture.entry.payloadForRetry.adminOrder.policyAcceptance, undefined);
});

test("manual policy resend remains available for a client with automatic messages disabled", async () => {
  const fixture = createPolicySmsTestFixture();
  fixture.entry.payloadForRetry.adminClient = {
    automaticNotificationsEnabled: false,
  };

  const result = await fixture.helpers.sendOrderPolicyAcceptanceInvite(
    fixture.ledger,
    fixture.entry.id,
    fixture.entry,
    {},
    fixture.leadConnectorClient,
    { sendFollowUpSms: false }
  );

  assert.equal(result.smsState, "sent");
  assert.equal(fixture.sentMessages.length, 1);
});

test("records a failed policy explanation after all GHL retries are exhausted", async () => {
  const temporaryFailure = {
    ok: false,
    status: 503,
    code: "SMS_SEND_FAILED",
    message: "Go High Level is temporarily unavailable",
    retryable: true,
  };
  const fixture = createPolicySmsTestFixture([
    {
      ok: true,
      status: 201,
      code: "OK",
      contactId: "contact-kevin-1",
      messageId: "policy-link-2",
    },
    temporaryFailure,
    temporaryFailure,
    temporaryFailure,
  ]);

  const result = await fixture.helpers.sendOrderPolicyAcceptanceInvite(
    fixture.ledger,
    fixture.entry.id,
    fixture.entry,
    {},
    fixture.leadConnectorClient,
    { sendFollowUpSms: true }
  );

  assert.equal(result.smsState, "sent");
  assert.equal(result.followUpSmsState, "failed");
  assert.deepEqual(fixture.waits, [10, 20]);
  assert.equal(fixture.sentMessages.length, 4);
  const failedExplanation = fixture.helpers
    .getEntrySmsHistoryEntries(fixture.entry)
    .find((item) => /received an automatic message with our service policy/i.test(item.message));
  assert.ok(failedExplanation);
  assert.equal(failedExplanation.status, "failed");
  assert.equal(failedExplanation.errorCode, "SMS_SEND_FAILED");
  assert.match(failedExplanation.errorMessage, /temporarily unavailable/i);
});
