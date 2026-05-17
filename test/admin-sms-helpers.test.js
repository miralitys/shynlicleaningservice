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
