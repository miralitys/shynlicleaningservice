"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("./admin-route-helpers");
const { planAutomaticTaskCleanup, applyTaskChanges, isFutureOrder, nextCleaningTaskReason } = require("../lib/quote-ops/task-policy");
const now = "2026-10-08T17:00:00.000Z";
const task = (id, kind = "post-completion-followup", status = "open") => ({
  id, kind, status, title: id, dueAt: now, createdAt: now, updatedAt: now,
});
const entry = (id, phone = "6305550100", tasks = []) => ({
  id, kind: "quote_submission", customerPhone: phone, serviceType: "regular", updatedAt: now,
  payloadForRetry: { adminLead: { status: "completed", tasks } },
});
const order = (id, phone, status = "scheduled", date = "2099-10-20") => ({
  ...entry(id, phone), selectedDate: date, selectedTime: "09:00",
  payloadForRetry: { adminOrder: { status } },
});

test("future orders match normalized phone OR client id without requiring a team or name", () => {
  const past = entry("past", "+1 (630) 555-0100");
  assert.equal(nextCleaningTaskReason(past, [order("next", "6305550100")], now), "future-order-exists");
  past.contactId = "same-id";
  const future = { ...order("next", "3125550199"), contactId: "same-id" };
  assert.equal(nextCleaningTaskReason(past, [future], now), "future-order-exists");
  assert.equal(nextCleaningTaskReason(past, [order("other", "3125550199")], now), "");
});

test("canceled, completed, past orders and mere quotes do not block a next-cleaning task", () => {
  const past = entry("past");
  const candidates = [order("cancel", past.customerPhone, "canceled"), order("done", past.customerPhone, "completed"),
    order("old", past.customerPhone, "scheduled", "2026-10-07"), { ...entry("quote"), selectedDate: "2099-10-20" }];
  assert.equal(nextCleaningTaskReason(past, candidates, now), "");
  assert.equal(isFutureOrder({ ...order("today", "6305550100", "scheduled", "2026-10-08"), selectedTime: "11:30" }, now), false);
  assert.equal(isFutureOrder({ ...order("today", "6305550100", "scheduled", "2026-10-08"), selectedTime: "12:30 PM" }, now), true);
});

for (const serviceType of ["moving", "move-in", "move-out", "move-in/out", "Move In / Move Out"]) {
  test(`does not request a next cleaning for ${serviceType}`, () => {
    assert.equal(nextCleaningTaskReason({ ...entry("move"), serviceType }, [], now), "one-off-move-service");
  });
}

test("cleanup is read-only, preserves manual/closed tasks, and reports Lisa/Sandy without changing them", () => {
  const booked = entry("booked", "6305550100", [task("followup"), task("manual", "manual"), task("done", "post-completion-followup", "completed")]);
  const refused = entry("refused", "6305550101", [task("contact", "contact-client"), task("manual-refused", "manual")]);
  refused.payloadForRetry.adminLead.status = "declined";
  const duplicate = entry("dup", "6305550102", [task("first", "discussion-followup"), task("second", "discussion-followup")]);
  const lisa = entry("lisa", "6304361009", [task("lisa1"), task("lisa2")]);
  const sandy = entry("sandy", "6303649912", [task("sandy1")]);
  const entries = [booked, order("next", "6305550100"), refused, duplicate, lisa, sandy];
  const original = structuredClone(entries);
  const plan = planAutomaticTaskCleanup(entries, { now, overrides: [
    { phone: "+16304361009", review: true, reason: "manager-selects-duplicate" },
    { phone: "+16303649912", review: true, reason: "manager-decision-required" },
  ] });
  assert.deepEqual(entries, original);
  assert.deepEqual(plan.changes.map((change) => [change.taskId, change.status]), [
    ["followup", "completed"], ["contact", "canceled"], ["second", "canceled"],
  ]);
  assert.equal(plan.review.length, 3);
  const manual = structuredClone(booked.payloadForRetry.adminLead.tasks[1]);
  const done = structuredClone(booked.payloadForRetry.adminLead.tasks[2]);
  assert.equal(applyTaskChanges(booked, plan.changes, now), 1);
  assert.equal(applyTaskChanges(booked, plan.changes, now), 0);
  assert.deepEqual(booked.payloadForRetry.adminLead.tasks[1], manual);
  assert.deepEqual(booked.payloadForRetry.adminLead.tasks[2], done);
});

test("explicit phone overrides include Rita/Vandana, refusal stage and preserve excluded clients", () => {
  const rita = entry("rita", "(630) 405-8045", [task("agreed", "discussion-followup")]);
  const melissa = entry("melissa", "7732099005", [task("call", "contact-client")]);
  const plan = planAutomaticTaskCleanup([rita, melissa], { now, overrides: [
    { phone: "+16304058045", completeKind: "discussion-followup", reason: "booking-confirmed-by-manager" },
    { phone: "+17732099005", cancel: true, decline: true },
  ] });
  assert.equal(plan.changes[0].status, "completed");
  assert.equal(plan.changes[1].status, "canceled");
  assert.deepEqual(plan.stageChanges.map((change) => change.entryId), ["melissa"]);
});

function createStore(extra = {}) {
  const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
  const domain = createAdminDomainHelpers({ normalizeString, ORDER_ASSIGNMENT_VALUES: [],
    getRequestUrl: () => new URL("https://example.com/admin/quote-ops") });
  return createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 1000,
    normalizeString,
    applyOrderEntryUpdates: domain.applyOrderEntryUpdates, applyLeadEntryUpdates: domain.applyLeadEntryUpdates,
    ...extra,
  });
}

test("completion suppresses followup when booked; creating a future order completes existing automatic followups", async () => {
  const store = createStore();
  const past = await store.recordSubmission(entry("past", "6305550100", [task("followup"), task("manual", "manual")]));
  const beforeOrder = structuredClone(past.payloadForRetry.adminOrder);
  await store.recordSubmission(order("future", "+1 (630) 555-0100"));
  assert.equal(past.payloadForRetry.adminLead.tasks[0].status, "completed");
  assert.equal(past.payloadForRetry.adminLead.tasks[1].status, "open");
  assert.deepEqual(past.payloadForRetry.adminOrder, beforeOrder);
  await store.updateLeadEntry(past.id, { createPostCompletionFollowupTask: true });
  assert.equal(past.payloadForRetry.adminLead.tasks.filter((item) => item.kind === "post-completion-followup" && item.status === "open").length, 0);
});

test("scheduling an existing quote completes followups on other orders of that client", async () => {
  const store = createStore();
  const past = await store.recordSubmission(entry("past", "6305550100", [task("followup")]));
  const next = await store.recordSubmission({ ...entry("next"), selectedDate: "2099-10-20", selectedTime: "10:00" });
  await store.updateOrderEntry(next.id, { createOrder: true, orderStatus: "scheduled" });
  assert.equal(past.payloadForRetry.adminLead.tasks[0].status, "completed");
});

test("concurrent completion calls keep one automatic task", async () => {
  const store = createStore();
  const past = await store.recordSubmission(entry("past"));
  await Promise.all(Array.from({ length: 5 }, () => store.updateLeadEntry(past.id, { createPostCompletionFollowupTask: true })));
  assert.equal(past.payloadForRetry.adminLead.tasks.filter((item) => item.kind === "post-completion-followup" && item.status === "open").length, 1);
});

test("an unavailable remote context never creates an unverified followup", async () => {
  const original = entry("past");
  const store = createStore({ createSupabaseQuoteOpsClient: () => ({
    isConfigured: () => true, fetchEntryById: async () => structuredClone(original),
    fetchTaskAutomationEntries: async () => { throw new Error("remote read failed"); },
    upsertEntry: async () => {},
  }) });
  const updated = await store.updateLeadEntry("past", { createPostCompletionFollowupTask: true });
  assert.equal((updated.payloadForRetry.adminLead.tasks || []).length, 0);
});

test("concurrent remote edits are re-read before closing tasks, preserving notes and order fields", async () => {
  const past = entry("past", "6305550100", [task("followup")]);
  const remote = new Map([[past.id, past]]);
  let attempts = 0;
  const store = createStore({ createSupabaseQuoteOpsClient: () => ({
    isConfigured: () => true,
    fetchEntryById: async (id) => structuredClone(remote.get(id)),
    fetchTaskAutomationEntries: async () => [...remote.values()].map((item) => structuredClone(item)),
    upsertEntry: async (value) => remote.set(value.id, structuredClone(value)),
    updateTaskPayload: async (value, expected) => {
      attempts += 1;
      if (attempts === 1) {
        const concurrent = remote.get(value.id);
        concurrent.updatedAt = "2026-10-08T18:00:00.000Z";
        concurrent.payloadForRetry.adminLead.notes = "Concurrent manager note";
        concurrent.payloadForRetry.adminOrder = { status: "completed", assignedStaff: "Original team" };
        return false;
      }
      assert.equal(expected, "2026-10-08T18:00:00.000Z");
      remote.set(value.id, value);
      return true;
    },
  }) });
  await store.recordSubmission(order("future", "6305550100"));
  assert.equal(attempts, 2);
  assert.equal(remote.get("past").payloadForRetry.adminLead.tasks[0].status, "completed");
  assert.equal(remote.get("past").payloadForRetry.adminLead.notes, "Concurrent manager note");
  assert.deepEqual(remote.get("past").payloadForRetry.adminOrder, { status: "completed", assignedStaff: "Original team" });
});

test("a failed future-order write does not complete existing tasks", async () => {
  let patches = 0;
  const store = createStore({ createSupabaseQuoteOpsClient: () => ({
    isConfigured: () => true, upsertEntry: async () => { throw new Error("write failed"); },
    fetchTaskAutomationEntries: async () => [entry("past", "6305550100", [task("followup")])],
    updateTaskPayload: async () => { patches += 1; return true; },
  }) });
  await store.recordSubmission(order("future", "6305550100"));
  assert.equal(patches, 0);
});
