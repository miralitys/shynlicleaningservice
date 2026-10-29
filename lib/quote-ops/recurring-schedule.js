"use strict";

const { getEntryOrderState, setEntryOrderState, hasEntryOrderState } = require("../admin-order-state");

function seriesId(entry) {
  const order = getEntryOrderState(entry);
  return String(order.recurringSeriesId || order.recurringSourceRequestId || entry.requestId || entry.id || "")
    .trim().replace(/(?:-next-\d{8})+$/, "");
}

function scheduleError(message) {
  return Object.assign(new Error(message), { code: "40001", status: 409 });
}

function scheduleGuard(entries, id) {
  return entries.filter(entry => hasEntryOrderState(entry) && seriesId(entry) === id)
    .filter(entry => getEntryOrderState(entry).recurringSchedule)
    .map(entry => ({ entryId: entry.id, schedule: getEntryOrderState(entry).recurringSchedule }))
    .sort((a, b) => a.entryId.localeCompare(b.entryId, "en"));
}

function scheduledOccurrence(guard, index, addDate) {
  const marker = guard.map(item => item.schedule).filter(item => item.index <= index)
    .sort((a, b) => b.version - a.version)[0];
  if (!marker) return null;
  return { date: index === marker.index ? marker.date : addDate(marker.date, marker.frequency, index - marker.index),
    time: marker.time };
}

function isMovable(entry) {
  const order = getEntryOrderState(entry);
  return ["new", "scheduled", "rescheduled"].includes(order.status) &&
    !["paid", "partial", "partially-paid"].includes(order.paymentStatus) &&
    !order.payroll?.paidAt && !(order.payroll?.items || []).some(item => item.status === "paid" || item.paidAt) &&
    !entry.payloadForRetry?.orderTrash;
}

// This patch deliberately bypasses price/payroll normalization. Only schedule fields may change.
function applyScheduleChange(entry, change, timestamp) {
  const next = structuredClone(entry);
  next.selectedDate = change.date;
  next.selectedTime = change.time;
  next.updatedAt = timestamp;
  for (const key of ["orderState", "adminOrder", "calculatorData"]) {
    const state = next.payloadForRetry[key];
    if (state && typeof state === "object") {
      state.selectedDate = change.date;
      state.selectedTime = change.time;
      if (key !== "calculatorData") {
        state.updatedAt = timestamp;
        if (change.marker) {
          state.recurringSchedule = structuredClone(change.marker);
          delete state.recurringPendingScheduleMove;
          delete state.recurringPendingResetFromDate;
        }
      }
    }
  }
  if (!next.payloadForRetry.orderState || !next.payloadForRetry.adminOrder) {
    const order = getEntryOrderState(next);
    if (change.marker) order.recurringSchedule = structuredClone(change.marker);
    setEntryOrderState(next, order);
  }
  return next;
}

function validateSchedulePlan(entries, plan) {
  const members = entries.filter(entry => hasEntryOrderState(entry) && seriesId(entry) === plan.seriesId);
  const expected = new Map(plan.members.map(member => [member.id, member.updatedAt]));
  if (members.length !== expected.size || members.some(entry => !expected.has(entry.id) || expected.get(entry.id) !== entry.updatedAt)) {
    throw scheduleError("Серия изменилась. Обновите страницу и повторите перенос.");
  }
  const changes = new Map(plan.changes.map(change => [change.id, change]));
  if (!changes.size || changes.size !== plan.changes.length || [...changes.keys()].some(id => !expected.has(id))) {
    throw scheduleError("Некорректный состав переносимой серии.");
  }
  const slots = new Set();
  for (const entry of members) {
    const order = getEntryOrderState(entry);
    const change = changes.get(entry.id);
    const markerOnly = change?.markerOnly && change.id === plan.sourceId && order.recurringPendingScheduleMove === true &&
      change.date === entry.selectedDate && change.time === entry.selectedTime;
    if (change && !isMovable(entry) && !markerOnly) throw scheduleError("В серии есть начатая или оплаченная уборка. Нужна отдельная проверка.");
    if (["canceled", "cancelled", "rescheduled"].includes(order.status) && !change) continue;
    const slot = `${change?.date || order.selectedDate || entry.selectedDate}T${change?.time || order.selectedTime || entry.selectedTime}`;
    if (slots.has(slot)) throw scheduleError("Перенос создаёт совпадающие уборки. Изменения не сохранены.");
    slots.add(slot);
  }
}

module.exports = { seriesId, scheduleError, scheduleGuard, scheduledOccurrence, isMovable, applyScheduleChange, validateSchedulePlan };
