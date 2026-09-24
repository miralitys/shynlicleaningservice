"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  entriesShareClientIdentity,
  getClientAutomaticNotificationsPreference,
  getClientPaymentNotificationsPreference,
  resolveClientAutomaticNotificationsEnabled,
  resolveClientPaymentNotificationsEnabled,
} = require("../lib/client-automatic-notifications");

test("resolves a disabled client preference from another order with the same phone", () => {
  const currentEntry = {
    customerPhone: "+1 (630) 555-0100",
    customerEmail: "client@example.com",
    payloadForRetry: {},
  };
  const savedEntry = {
    customerPhone: "6305550100",
    payloadForRetry: {
      adminClient: { automaticNotificationsEnabled: false },
    },
  };

  assert.equal(entriesShareClientIdentity(currentEntry, savedEntry), true);
  assert.equal(getClientAutomaticNotificationsPreference(currentEntry), null);
  assert.equal(resolveClientAutomaticNotificationsEnabled(currentEntry, [savedEntry]), false);
});

test("automatic client notifications stay enabled when no preference was saved", () => {
  assert.equal(
    resolveClientAutomaticNotificationsEnabled(
      { customerEmail: "new@example.com", payloadForRetry: {} },
      []
    ),
    true
  );
});

test("resolves disabled payment notifications without disabling other messages", () => {
  const currentEntry = {
    customerPhone: "+1 (630) 555-0100",
    payloadForRetry: {},
  };
  const savedEntry = {
    customerPhone: "6305550100",
    payloadForRetry: {
      adminClient: {
        automaticNotificationsEnabled: true,
        paymentNotificationsEnabled: false,
      },
    },
  };

  assert.equal(getClientPaymentNotificationsPreference(currentEntry), null);
  assert.equal(resolveClientPaymentNotificationsEnabled(currentEntry, [savedEntry]), false);
  assert.equal(resolveClientAutomaticNotificationsEnabled(currentEntry, [savedEntry]), true);
});
