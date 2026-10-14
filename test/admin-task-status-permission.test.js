"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { canUpdateTaskStatus, TASK_STATUS_PERMISSION } = require("../lib/admin/task-permissions");
const { createAdminLeadDomain } = require("../lib/admin/domain-leads");

test("tasks.update_status belongs only to the authenticated Eva viewer", () => {
  assert.equal(TASK_STATUS_PERMISSION, "tasks.update_status");
  for (const role of ["viewer", "manager", "admin", "cleaner"]) {
    for (const email of ["eva@shynli.local", "other@shynli.local"]) {
      assert.equal(canUpdateTaskStatus({ authorized: true, role, user: { email } }), role === "viewer" && email === "eva@shynli.local");
    }
  }
  assert.equal(canUpdateTaskStatus({ role: "viewer", user: { email: "eva@shynli.local" } }), false);
});

test("closing persists an audit and comment without changing any other task, lead or order field", () => {
  const domain = createAdminLeadDomain({
    normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
    getEntryPayload: entry => entry.payloadForRetry,
    getEntryAdminLeadData: entry => entry.payloadForRetry.adminLead,
  });
  const entry = { id: "entry", updatedAt: "unchanged", selectedDate: "2099-01-01", totalPrice: 250,
    payloadForRetry: { adminOrder: { status: "scheduled", paymentStatus: "unpaid" },
      adminLead: { status: "discussion", notes: "Preserve lead comment", managerId: "manager", tasks: [
        { id: "one", status: "open", dueAt: "2099-01-01", title: "One" },
        { id: "two", status: "open", title: "Two" },
      ] } } };
  const before = structuredClone(entry);
  for (const [taskId, status] of [["one", "completed"], ["two", "canceled"]]) {
    domain.applyLeadEntryUpdates(entry, { now: "2026-10-14T15:00:00.000Z",
      taskStatusOnly: { taskId, status, actorId: "eva-id", actorEmail: "eva@shynli.local", comment: "Checked" },
      status: "declined", totalPrice: 1, notes: "Injected" });
  }
  const lead = entry.payloadForRetry.adminLead;
  assert.deepEqual(entry.payloadForRetry.adminOrder, before.payloadForRetry.adminOrder);
  assert.equal(lead.status, "discussion");
  assert.equal(lead.notes, "Preserve lead comment");
  assert.equal(entry.totalPrice, 250);
  assert.equal(entry.updatedAt, "unchanged");
  assert.equal(lead.taskStatusAudit.length, 2);
  assert.deepEqual(lead.taskStatusAudit[0], { permission: "tasks.update_status", actorId: "eva-id",
    actorEmail: "eva@shynli.local", at: "2026-10-14T15:00:00.000Z", taskId: "one",
    oldStatus: "open", newStatus: "completed", comment: "Checked" });
  assert.equal(domain.getEntryLeadTasks(entry)[0].comment, "Checked");
  assert.throws(() => domain.applyLeadEntryUpdates(entry, { taskStatusOnly: { taskId: "one", status: "completed" } }));
  assert.equal(lead.taskStatusAudit.length, 2);
});

test("deadline-only updates log the Chicago time conversion and preserve every other field", () => {
  const domain = createAdminLeadDomain({
    normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
    getEntryPayload: entry => entry.payloadForRetry,
    getEntryAdminLeadData: entry => entry.payloadForRetry.adminLead,
  });
  const entry = { id: "entry", selectedDate: "2099-01-01", totalPrice: 250,
    payloadForRetry: { adminOrder: { status: "scheduled" }, adminLead: {
      status: "discussion", notes: "Unchanged", discussionNextContactAt: "2026-10-15T16:00:00.000Z",
      tasks: [{ id: "one", status: "open", dueAt: "2026-10-15T16:00:00.000Z", title: "Keep title", assigneeId: "manager" },
        { id: "two", status: "open", dueAt: "2026-10-16T16:00:00.000Z" }],
    } } };
  const before = structuredClone(entry);
  const updates = { now: "2026-10-14T15:00:00.000Z", taskDeadlineOnly: {
    taskId: "one", dueAt: "2026-10-20T12:30", actorId: "eva-id", actorEmail: "eva@shynli.local", comment: "Rescheduled",
  }, status: "declined", manualTaskTitle: "Injected", assigneeId: "Injected" };
  domain.applyLeadEntryUpdates(entry, updates);
  const lead = entry.payloadForRetry.adminLead;
  assert.deepEqual(lead.taskDeadlineAudit[0], { permission: "tasks.update_status", actorId: "eva-id",
    actorEmail: "eva@shynli.local", at: updates.now, taskId: "one", oldDeadline: "2026-10-15T16:00:00.000Z",
    newDeadline: "2026-10-20T17:30:00.000Z", comment: "Rescheduled" });
  assert.equal(lead.tasks[0].title, "Keep title");
  assert.equal(lead.tasks[0].assigneeId, "manager");
  assert.equal(lead.tasks[0].status, "open");
  assert.equal(lead.notes, "Unchanged");
  assert.equal(lead.discussionNextContactAt, before.payloadForRetry.adminLead.discussionNextContactAt);
  assert.deepEqual(lead.tasks[1], before.payloadForRetry.adminLead.tasks[1]);
  assert.deepEqual(entry.payloadForRetry.adminOrder, before.payloadForRetry.adminOrder);
  for (const dueAt of ["2026-02-30T10:00", "2026-03-08T02:30", "invalid"]) {
    assert.throws(() => domain.applyLeadEntryUpdates(entry, { ...updates,
      taskDeadlineOnly: { ...updates.taskDeadlineOnly, dueAt } }), { code: "TASK_DEADLINE_INVALID" });
  }
  domain.applyLeadEntryUpdates(entry, { ...updates, taskDeadlineOnly: {
    ...updates.taskDeadlineOnly, dueAt: "2026-12-20T12:30", comment: "",
  } });
  assert.equal(entry.payloadForRetry.adminLead.tasks[0].dueAt, "2026-12-20T18:30:00.000Z");
  assert.equal(entry.payloadForRetry.adminLead.tasks[0].comment, "Rescheduled");
});

test("Eva creation uses the current request manager and fixed title, audits it and changes no request fields", () => {
  const domain = createAdminLeadDomain({ normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
    getEntryPayload: entry => entry.payloadForRetry, getEntryAdminLeadData: entry => entry.payloadForRetry.adminLead });
  const entry = { id: "request", kind: "quote_submission", totalPrice: 220, selectedDate: "2099-01-01",
    payloadForRetry: { adminOrder: { status: "scheduled" }, adminLead: { status: "discussion", notes: "Keep notes",
      managerId: "ramina", managerName: "Ramina", managerEmail: "ramina@example.com", tasks: [{ id: "closed", status: "completed" }] } } };
  const original = structuredClone(entry);
  const updates = { now: "2026-10-14T16:00:00.000Z", taskCreateOnly: {
    dueAt: "2026-10-20T12:30", comment: "Call then", actorId: "eva", actorEmail: "eva@shynli.local",
    assigneeId: "attacker", title: "Other title" }, status: "declined", notes: "Injected", totalPrice: 0 };
  domain.applyLeadEntryUpdates(entry, updates);
  const lead = entry.payloadForRetry.adminLead;
  const task = lead.tasks[1];
  assert.equal(task.title, "Связаться с клиентом в назначенное время");
  assert.equal(task.kind, "discussion-followup");
  assert.equal(task.status, "open");
  assert.equal(task.assigneeId, "ramina");
  assert.equal(task.assigneeName, "Ramina");
  assert.equal(task.dueAt, "2026-10-20T17:30:00.000Z");
  assert.equal(task.comment, "Call then");
  assert.deepEqual(lead.taskCreationAudit[0], { permission: "tasks.update_status", actorId: "eva", actorEmail: "eva@shynli.local",
    at: updates.now, requestId: entry.id, taskId: task.id, deadline: task.dueAt, comment: "Call then", assigneeId: "ramina" });
  assert.deepEqual(lead.tasks[0], original.payloadForRetry.adminLead.tasks[0]);
  assert.deepEqual(entry.payloadForRetry.adminOrder, original.payloadForRetry.adminOrder);
  assert.equal(entry.totalPrice, 220);
  assert.equal(lead.status, "discussion");
  assert.equal(lead.notes, "Keep notes");
  domain.applyLeadEntryUpdates(entry, updates);
  assert.equal(entry.payloadForRetry.adminLead.tasks.length, 2);
  assert.equal(entry.payloadForRetry.adminLead.taskCreationAudit.length, 1);
  delete lead.managerId;
  assert.throws(() => domain.applyLeadEntryUpdates(entry, updates), { code: "TASK_MANAGER_REQUIRED" });
});
