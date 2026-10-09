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

test("declined stage cancels automatic tasks, preserves manual tasks and ignores stale contact time", () => {
  const domain = createLeadDomain();
  const entry = { kind: "quote_submission", payloadForRetry: { adminLead: {
    status: "discussion", discussionNextContactAt: "2099-10-20T10:00",
    tasks: [{ id: "auto", kind: "discussion-followup", status: "open" },
      { id: "manual", kind: "manual", status: "open" }],
  } } };
  domain.applyLeadEntryUpdates(entry, { status: "declined" });
  assert.equal(domain.getEntryLeadTasks(entry).find((task) => task.id === "auto").status, "canceled");
  assert.equal(domain.getEntryLeadTasks(entry).find((task) => task.id === "manual").status, "open");
  assert.equal(domain.getEntryLeadTasks(entry).filter((task) => task.kind !== "manual" && task.status === "open").length, 0);
});

test("resaving a stage reuses the same automatic task and updates its chosen deadline", () => {
  const domain = createLeadDomain();
  const entry = { kind: "quote_submission", payloadForRetry: { adminLead: { status: "discussion", tasks: [] } } };
  domain.applyLeadEntryUpdates(entry, { status: "discussion", nextContactAt: "2099-10-20T10:00" });
  const id = domain.getEntryOpenLeadTask(entry).id;
  domain.applyLeadEntryUpdates(entry, { status: "discussion", nextContactAt: "2099-10-22T11:00" });
  assert.equal(domain.getEntryLeadTasks(entry).length, 1);
  assert.equal(domain.getEntryOpenLeadTask(entry).id, id);
  assert.equal(domain.getEntryOpenLeadTask(entry).dueAt, "2099-10-22T16:00:00.000Z");
});

test("explicit task closure or cancellation changes only the selected task", () => {
  for (const [taskAction, status] of [["complete", "completed"], ["cancel", "canceled"]]) {
    const domain = createLeadDomain();
    const entry = { kind: "quote_submission", payloadForRetry: {
      adminOrder: { frequency: "weekly", selectedDate: "2099-11-20", assignedStaff: "Original team" },
      adminLead: { status: "discussion", notes: "Original notes", tasks: [
        { id: "selected", kind: "discussion-followup", status: "open" },
        { id: "other", kind: "manual", status: "open" },
      ] },
    } };
    const order = structuredClone(entry.payloadForRetry.adminOrder);
    domain.applyLeadEntryUpdates(entry, { taskId: "selected", taskAction });
    assert.equal(domain.getEntryLeadTasks(entry).find((task) => task.id === "selected").status, status);
    assert.equal(domain.getEntryLeadTasks(entry).find((task) => task.id === "other").status, "open");
    assert.equal(entry.payloadForRetry.adminLead.status, "discussion");
    assert.equal(entry.payloadForRetry.adminLead.notes, "Original notes");
    assert.deepEqual(entry.payloadForRetry.adminOrder, order);
  }
});

test("notes or SMS sync never reopens a completed contact task", () => {
  const domain = createLeadDomain();
  const entry = { kind: "quote_submission", payloadForRetry: { adminLead: { status: "new", tasks: [
    { id: "done", kind: "contact-client", status: "completed" },
  ] } } };
  domain.applyLeadEntryUpdates(entry, { notes: "Updated notes" });
  domain.applyLeadEntryUpdates(entry, { smsHistory: [] });
  assert.equal(domain.getEntryLeadTasks(entry).length, 1);
  assert.equal(domain.getEntryOpenLeadTask(entry), null);
});

test("replaying a completed task action does not replace its existing followup", () => {
  const domain = createLeadDomain();
  const entry = { kind: "quote_submission", payloadForRetry: { adminLead: { status: "new", tasks: [
    { id: "contact", kind: "contact-client", status: "open" },
  ] } } };
  const updates = { taskId: "contact", taskAction: "contacted", nextStatus: "discussion", nextContactAt: "2099-10-20T10:00" };
  domain.applyLeadEntryUpdates(entry, updates);
  const snapshot = structuredClone(entry);
  domain.applyLeadEntryUpdates(entry, updates);
  assert.deepEqual(entry, snapshot);
});

test("confirmed leads still allow an explicitly scheduled contact, declined leads do not", () => {
  const domain = createLeadDomain();
  const entry = { kind: "quote_submission", payloadForRetry: { adminLead: { status: "discussion", tasks: [] } } };
  domain.applyLeadEntryUpdates(entry, { status: "confirmed", nextContactAt: "2099-10-20T10:00" });
  assert.equal(domain.getEntryOpenLeadTask(entry).kind, "discussion-followup");
  domain.applyLeadEntryUpdates(entry, { status: "declined", nextContactAt: "2099-10-20T10:00" });
  assert.equal(domain.getEntryOpenLeadTask(entry), null);
});

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

test("hides a legacy generated task that was saved to the entry", () => {
  const domain = createLeadDomain();
  const entry = {
    id: "legacy-lead-456",
    createdAt: "2026-04-12T21:59:00.000Z",
    payloadForRetry: {
      adminLead: {
        status: "new",
        tasks: [
          {
            id: "default-legacy-lead-456",
            kind: "contact-client",
            status: "open",
          },
        ],
      },
    },
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
