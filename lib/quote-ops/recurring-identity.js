"use strict";

const crypto = require("node:crypto");
const { getEntryOrderState } = require("../admin-order-state");

function getRecurringIdentity(entry) {
  const order = getEntryOrderState(entry);
  return {
    seriesId: String(order.recurringSeriesId || "").trim(),
    occurrenceDate: String(order.recurringOccurrenceDate || "").trim(),
  };
}

function getRecurringSourceGuard(entry) {
  const order = getEntryOrderState(entry);
  const text = value => String(value || "").trim();
  return {
    entryId: text(entry.id),
    state: {
      seriesId: text(order.recurringSeriesId),
      anchorDate: text(order.recurringAnchorDate),
      occurrenceDate: text(order.recurringOccurrenceDate),
      frequency: text(order.frequency).toLowerCase(),
      status: text(order.status).toLowerCase(),
      canceledFromDate: text(order.recurringSeriesCanceledFromDate),
      selectedDate: text(order.selectedDate || entry.selectedDate),
      selectedTime: text(order.selectedTime || entry.selectedTime),
    },
  };
}

function matchesRecurringIdentity(entry, expected) {
  if (!expected) return true;
  const actual = getRecurringIdentity(entry);
  return !(actual.seriesId && expected.seriesId && actual.seriesId !== expected.seriesId) &&
    !(actual.occurrenceDate && expected.occurrenceDate && actual.occurrenceDate !== expected.occurrenceDate);
}

function buildRecurringEntryId(input) {
  const identity = getRecurringIdentity(input);
  const key = identity.seriesId && identity.occurrenceDate
    ? [identity.seriesId, identity.occurrenceDate]
    : [String(input.requestId || "").trim()];
  const bytes = crypto.createHash("sha256").update(`shynli:recurring-order:${JSON.stringify(key)}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = { buildRecurringEntryId, getRecurringIdentity, getRecurringSourceGuard, matchesRecurringIdentity };
