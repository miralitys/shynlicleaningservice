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

test("keeps the generated default task id stable", () => {
  const domain = createLeadDomain();
  const entry = {
    id: "lead-123",
    createdAt: "2026-06-01T15:00:00.000Z",
    payloadForRetry: { adminLead: { status: "new" } },
  };

  const firstTask = domain.getEntryLeadTasks(entry)[0];
  const secondTask = domain.getEntryLeadTasks(entry)[0];

  assert.equal(firstTask.id, "default-lead-123");
  assert.equal(secondTask.id, firstTask.id);
});

test("deletes a generated default task permanently on the first attempt", () => {
  const domain = createLeadDomain();
  const entry = {
    id: "lead-456",
    createdAt: "2026-06-01T15:00:00.000Z",
    payloadForRetry: { adminLead: { status: "new" } },
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
