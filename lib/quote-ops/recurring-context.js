"use strict";

const RECURRING_CONTEXT_RPC = "read_recurring_order_context";
const RECURRING_CONTEXT_FIELDS = [
  "isCreated", "status", "frequency", "selectedDate", "selectedTime", "serviceType",
  "managerConfirmationRequired", "managerConfirmedAt", "recurringSeriesId", "recurringAnchorDate",
  "recurringOccurrenceDate", "recurringOccurrenceIndex", "recurringSourceEntryId", "recurringSourceRequestId",
  "recurringNextEntryId", "recurringGeneratedAt", "recurringSeriesCanceledFromDate",
  "recurringPendingResetFromDate", "recurringSchedule",
];
const ENTRY_FIELDS = ["id", "kind", "createdAt", "updatedAt", "requestId", "sourceRoute", "serviceType", "selectedDate", "selectedTime"];
const ROW_FIELDS = ["id", "kind", "created_at", "updated_at", "request_id", "source_route", "service_type", "selected_date", "selected_time"];
const FIELD_LIMITS = [120, 64, 64, 64, 120, 120, 40, 32, 32];
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function projectRecurringContextState(state) {
  if (!isObject(state)) return null;
  const result = {};
  for (const key of RECURRING_CONTEXT_FIELDS) {
    if (Object.hasOwn(state, key)) result[key] = structuredClone(state[key]);
  }
  // Preserve empty-order tombstones and unknown legacy orders without their private payloads.
  if (!Object.keys(result).length && Object.keys(state).length) result.recurringContextHasOrderState = true;
  return result;
}

function projectRecurringContextEntry(entry) {
  const result = { isRecurringContextSummary: true };
  for (const key of ENTRY_FIELDS) if (Object.hasOwn(entry, key)) result[key] = entry[key];
  const payload = isObject(entry.payloadForRetry) ? entry.payloadForRetry : {};
  result.payloadForRetry = {
    orderState: projectRecurringContextState(payload.orderState),
    adminOrder: projectRecurringContextState(payload.adminOrder),
  };
  return result;
}

function decodeRecurringContextRow(row) {
  if (!isObject(row) || ROW_FIELDS.some(key => !Object.hasOwn(row, key)) ||
      !isObject(row.payload_for_retry) || ["orderState", "adminOrder"].some(key =>
        !Object.hasOwn(row.payload_for_retry, key) ||
        (row.payload_for_retry[key] !== null && !isObject(row.payload_for_retry[key])))) {
    throw new Error("Invalid recurring context row");
  }
  const entry = { payloadForRetry: row.payload_for_retry };
  ROW_FIELDS.forEach((key, index) => { entry[ENTRY_FIELDS[index]] = String(row[key] || "").trim().slice(0, FIELD_LIMITS[index]); });
  return projectRecurringContextEntry(entry);
}

function recurringSeriesReadFilter(seriesId, entryIds = []) {
  // Other identities may be transformed/truncated in generated request IDs. Keep their full read.
  if (typeof seriesId !== "string" || seriesId.length > 90 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seriesId)) return "";
  if (!Array.isArray(entryIds) || entryIds.length > 75 ||
    entryIds.some(id => typeof id !== "string" || id.length > 120 || !/^[a-zA-Z0-9-]+$/.test(id))) return "";
  const knownEntries = entryIds.length ? `id.in.(${entryIds.join(",")}),` : "";
  return `(${knownEntries}payload_for_retry->orderState->>recurringSeriesId.eq.${seriesId},` +
    `payload_for_retry->adminOrder->>recurringSeriesId.eq.${seriesId},` +
    `request_id.eq.${seriesId},request_id.like.${seriesId}-next-*)`;
}

module.exports = { recurringSeriesReadFilter, RECURRING_CONTEXT_RPC, RECURRING_CONTEXT_FIELDS,
  projectRecurringContextState, projectRecurringContextEntry, decodeRecurringContextRow };
