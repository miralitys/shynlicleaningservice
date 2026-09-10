"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createAdminLeadDomain } = require("../lib/admin/domain-leads");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function createLeadDomain() {
  return createAdminLeadDomain({
    applyOrderEntryUpdates() {},
    getEntryAdminLeadData(entry) {
      return (entry.payloadForRetry && entry.payloadForRetry.adminLead) || {};
    },
    getEntryAdminSmsData() {
      return {};
    },
    getEntryPayload(entry) {
      return entry.payloadForRetry || {};
    },
    getEntrySmsHistory() {
      return [];
    },
    getRequestUrl() {
      return new URL("https://example.com/admin/quote-ops");
    },
    isOrderCreatedEntry() {
      return false;
    },
    normalizeAdminSmsHistoryEntries() {
      return [];
    },
    normalizeString,
  });
}

function createOrderAwareLeadDomain() {
  return createAdminLeadDomain({
    applyOrderEntryUpdates() {},
    getEntryAdminLeadData(entry) {
      return (entry.payloadForRetry && entry.payloadForRetry.adminLead) || {};
    },
    getEntryAdminSmsData() {
      return {};
    },
    getEntryPayload(entry) {
      return entry.payloadForRetry || {};
    },
    getEntrySmsHistory() {
      return [];
    },
    getRequestUrl() {
      return new URL("https://example.com/admin/quote-ops");
    },
    isOrderCreatedEntry(entry) {
      return Boolean(entry && entry.payloadForRetry && entry.payloadForRetry.adminOrder);
    },
    normalizeAdminSmsHistoryEntries() {
      return [];
    },
    normalizeString,
  });
}

test("keeps a saved task id stable", () => {
  const domain = createLeadDomain();
  const entry = {
    id: "lead-123",
    createdAt: "2026-06-01T15:00:00.000Z",
    payloadForRetry: {
      adminLead: {
        status: "new",
        tasks: [{ id: "saved-lead-task", kind: "contact-client", status: "open" }],
      },
    },
  };

  const firstTask = domain.getEntryLeadTasks(entry)[0];
  const secondTask = domain.getEntryLeadTasks(entry)[0];

  assert.equal(firstTask.id, "saved-lead-task");
  assert.equal(secondTask.id, firstTask.id);
});

test("does not generate a default lead task for an order", () => {
  const domain = createOrderAwareLeadDomain();
  const entry = {
    id: "legacy-order-123",
    createdAt: "2026-06-01T15:00:00.000Z",
    payloadForRetry: { adminOrder: { status: "scheduled" } },
  };

  assert.deepEqual(domain.getEntryLeadTasks(entry), []);
});

test("does not generate a task for a legacy new lead without saved tasks", () => {
  const domain = createLeadDomain();
  const entry = {
    id: "legacy-lead-123",
    createdAt: "2026-04-12T21:59:00.000Z",
    payloadForRetry: {},
  };

  assert.deepEqual(domain.getEntryLeadTasks(entry), []);
});

test("deletes a saved task permanently on the first attempt", () => {
  const domain = createLeadDomain();
  const entry = {
    id: "lead-456",
    createdAt: "2026-06-01T15:00:00.000Z",
    payloadForRetry: {
      adminLead: {
        status: "new",
        tasks: [{ id: "saved-task", kind: "contact-client", status: "open" }],
      },
    },
  };
  const taskId = domain.getEntryLeadTasks(entry)[0].id;

  domain.applyLeadEntryUpdates(entry, {
    deleteTaskId: taskId,
    now: "2026-08-11T20:00:00.000Z",
  });

  assert.deepEqual(domain.getEntryLeadTasks(entry), []);
  assert.equal(
    entry.payloadForRetry.adminLead.defaultTaskDismissedAt,
    "2026-08-11T20:00:00.000Z"
  );
});
