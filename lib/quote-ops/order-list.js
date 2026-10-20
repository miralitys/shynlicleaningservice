"use strict";

const PAYLOAD_KEYS = ["orderState", "adminOrder", "paymentState", "payment", "calculatorData", "adminClient", "adminLead"];
const ORDER_FIELDS = ["isCreated", "createdAt", "status", "assignedStaff", "assignee", "selectedDate", "selectedTime",
  "frequency", "paymentStatus", "paymentMethod", "serviceDurationMinutes", "recurringNextEntryId", "recurringGeneratedAt",
  "recurringSeriesId", "recurringAnchorDate", "recurringSourceEntryId", "cleanerConfirmation"];
const POLICY_FIELDS = ["policyAccepted", "sentAt", "firstViewedAt", "lastViewedAt", "signedAt"];
const ORDER_LIST_SELECT = ["id", "kind", "status", "created_at", "updated_at", "request_id", "source_route", "source",
  "customer_name", "customer_phone", "customer_email", "service_type", "service_name", "total_price", "total_price_cents",
  "selected_date", "selected_time", "full_address", "code", "error_message", "contact_id",
  ...PAYLOAD_KEYS.map(key => `list_${key}:payload_for_retry->${key}`)].join(",");

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pick(source, fields) {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
}

function projectOrderState(order) {
  if (!isObject(order)) return order;
  const result = pick(order, ORDER_FIELDS);
  if (isObject(order.policyAcceptance)) result.policyAcceptance = pick(order.policyAcceptance, POLICY_FIELDS);
  // Old records can be identifiable as orders only by completion data. Preserve
  // that fact without copying checklists/photos into a read-only list summary.
  const completion = order.completion;
  if (isObject(completion) && (String(completion.cleanerComment || "").trim() ||
      (Array.isArray(completion.beforePhotos) && completion.beforePhotos.length) ||
      (Array.isArray(completion.afterPhotos) && completion.afterPhotos.length))) result.isCreated = true;
  if (Object.keys(order).length && !Object.keys(result).length) result.listHasOrderState = true;
  return result;
}

function projectOrderListEntry(entry) {
  const payload = isObject(entry.payloadForRetry) ? entry.payloadForRetry : {};
  const slim = {};
  for (const key of PAYLOAD_KEYS) {
    if (!Object.hasOwn(payload, key)) continue;
    if (key === "orderState" || key === "adminOrder") slim[key] = projectOrderState(payload[key]);
    else if (key === "paymentState" || key === "payment") slim[key] = isObject(payload[key]) ? pick(payload[key], ["status", "method"]) : payload[key];
    else if (key === "adminClient" && isObject(payload[key])) {
      const { photos, ...client } = payload[key];
      slim[key] = client;
    } else slim[key] = payload[key];
  }
  const { retryHistory, payloadForRetry, ...base } = entry;
  return { ...base, payloadForRetry: slim, isOrderListSummary: true };
}

function hydrateOrderListRow(row) {
  if (!PAYLOAD_KEYS.some(key => Object.hasOwn(row, `list_${key}`))) return row;
  return { ...row, payload_for_retry: Object.fromEntries(PAYLOAD_KEYS.map(key => [key, row[`list_${key}`]])) };
}

module.exports = { ORDER_LIST_SELECT, hydrateOrderListRow, projectOrderListEntry };
