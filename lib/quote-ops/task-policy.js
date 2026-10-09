"use strict";

const { getEntryPayload, getEntryOrderState, hasEntryOrderState } = require("../admin-order-state");

const TASK_KIND_ALIASES = new Map([
  ["initial-contact", "contact-client"], ["call-back-3h", "retry-3h"],
  ["call-next-morning", "retry-next-morning"], ["follow-up", "discussion-followup"],
  ["next-cleaning-followup", "post-completion-followup"], ["manual-task", "manual"],
]);
const AUTOMATIC_TASK_KINDS = new Set([
  "contact-client", "retry-3h", "retry-next-morning", "discussion-followup", "post-completion-followup",
]);

function taskKind(task = {}) {
  const kind = String(task.kind || "").trim().toLowerCase();
  return TASK_KIND_ALIASES.get(kind) || kind;
}

function isAutomaticTask(task) {
  return AUTOMATIC_TASK_KINDS.has(taskKind(task));
}

function phoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function clientKeys(entry = {}) {
  const client = getEntryPayload(entry).adminClient || {};
  return [
    ...[entry.customerPhone, client.secondaryPhone].map(phoneKey).filter((key) => key.length >= 7).map((key) => `phone:${key}`),
    ...[entry.contactId, entry.clientId, client.id].filter(Boolean).map((key) => `id:${key}`),
  ];
}

function sameClient(left, right) {
  const keys = new Set(clientKeys(left));
  return clientKeys(right).some((key) => keys.has(key));
}

function chicagoDateTime(now = new Date()) {
  return new Date(now).toLocaleString("sv-SE", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function isFutureOrder(entry, now = new Date()) {
  if (!hasEntryOrderState(entry)) return false;
  const order = getEntryOrderState(entry);
  if (["canceled", "cancelled", "completed"].includes(String(order.status || order.orderStatus || "").toLowerCase())) return false;
  const date = String(entry.selectedDate || order.selectedDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = String(entry.selectedTime || order.selectedTime || "");
  const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  let hour = match ? Number(match[1]) : 23;
  if (match && match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  const clock = `${String(hour).padStart(2, "0")}:${match ? match[2] : "59"}:00`;
  return `${date} ${clock}` > chicagoDateTime(now);
}

function isMoveService(entry) {
  return [entry.serviceType, entry.serviceName].some((value) =>
    /^(moving|movein|moveout|moveinout|moveinmoveout)(cleaning)?$/.test(String(value || "").toLowerCase().replace(/[^a-z]/g, ""))
  );
}

function nextCleaningTaskReason(entry, entries, now = new Date()) {
  if (String((getEntryPayload(entry).adminLead || {}).status || "").toLowerCase() === "declined") return "lead-declined";
  if (isMoveService(entry)) return "one-off-move-service";
  if (entries.some((candidate) => sameClient(entry, candidate) && isFutureOrder(candidate, now))) return "future-order-exists";
  return "";
}

function getRawTasks(entry) {
  const tasks = (getEntryPayload(entry).adminLead || {}).tasks;
  return Array.isArray(tasks) ? tasks : [];
}

// A plan is data only. Reading a workspace or preparing a report never applies it.
function planAutomaticTaskCleanup(entries, { now = new Date(), overrides = [] } = {}) {
  const changes = [];
  const review = [];
  const stageChanges = [];
  for (const entry of entries) {
    const override = overrides.find((item) => clientKeys(entry).includes(`phone:${phoneKey(item.phone)}`));
    const declined = (getEntryPayload(entry).adminLead || {}).status === "declined";
    const seen = new Set();
    const openTasks = getRawTasks(entry).filter((task) => task.status === "open");
    if (override && override.decline && !declined && openTasks.length) stageChanges.push({ entryId: entry.id, customerName: entry.customerName, status: "declined" });
    for (const task of openTasks) {
      const record = { entryId: entry.id, taskId: task.id, customerName: entry.customerName, phone: entry.customerPhone,
        requestId: entry.requestId, title: task.title, kind: taskKind(task), dueAt: task.dueAt,
        currentStatus: task.status, updatedAt: task.updatedAt || "", entryUpdatedAt: entry.updatedAt || "" };
      if (override && override.review) {
        review.push({ ...record, reason: override.reason });
        continue;
      }
      if (!isAutomaticTask(task)) {
        if (override && (override.cancel || override.completeKind)) review.push({ ...record, reason: "manual-task-protected" });
        continue;
      }
      let reason = declined || (override && override.cancel) ? "lead-declined" : "";
      if (!reason && taskKind(task) === "post-completion-followup") reason = nextCleaningTaskReason(entry, entries, now);
      if (!reason && override && override.completeKind === taskKind(task)) reason = override.reason;
      if (!reason && seen.has(taskKind(task))) reason = "duplicate-open-task";
      seen.add(taskKind(task));
      if (reason) changes.push({ ...record, status: ["lead-declined", "duplicate-open-task"].includes(reason) ? "canceled" : "completed", reason });
    }
  }
  return { generatedAt: new Date(now).toISOString(), changes, stageChanges, review };
}

function applyTaskChanges(entry, changes, now = new Date()) {
  const payload = getEntryPayload(entry);
  const lead = payload.adminLead || {};
  const timestamp = new Date(now).toISOString();
  let count = 0;
  const tasks = getRawTasks(entry).map((task) => {
    const change = changes.find((item) => item.entryId === entry.id && item.taskId === task.id);
    if (!change || task.status !== "open" || !isAutomaticTask(task)) return task;
    count += 1;
    return { ...task, status: change.status, resolution: change.reason, updatedAt: timestamp, completedAt: timestamp };
  });
  if (count) {
    entry.payloadForRetry = { ...payload, adminLead: { ...lead, tasks, updatedAt: timestamp } };
    entry.updatedAt = timestamp;
  }
  return count;
}

module.exports = { taskKind, isAutomaticTask, phoneKey, clientKeys, sameClient, chicagoDateTime,
  isFutureOrder, isMoveService, nextCleaningTaskReason, getRawTasks, planAutomaticTaskCleanup, applyTaskChanges };
