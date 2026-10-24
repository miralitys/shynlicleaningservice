"use strict";

const { projectAccountListEntry } = require("./order-list");

const ACCOUNT_CALENDAR_VIEW = "account_calendar_entries";
const ACCOUNT_CALENDAR_RPC = "read_account_calendar_entries";
const ACCOUNT_CALENDAR_SELECT = ["id", "selected_date",
  ...["orderState", "adminOrder", "calculatorData"].map(key => `list_${key}:payload_for_retry->${key}`)].join(",");
const STATE_FIELDS = ["isCreated", "createdAt", "status", "assignedStaff", "assignee", "selectedDate", "selectedTime",
  "frequency", "paymentMethod", "listHasOrderState"];

function pick(value, fields, preserveRoot = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  if (preserveRoot && Object.keys(value).length && !Object.keys(result).length) result.listHasOrderState = true;
  return result;
}

function projectAccountCalendarEntry(entry) {
  // Reuse legacy order recognition, including completion-only orders. Preserve
  // both roots: order recognition and calendar cancellation use different precedence.
  const summary = projectAccountListEntry(entry);
  const payload = summary.payloadForRetry;
  return { id: summary.id, selectedDate: summary.selectedDate, isAccountCalendarSummary: true,
    payloadForRetry: Object.fromEntries(["orderState", "adminOrder", "calculatorData"]
      .filter(key => Object.hasOwn(payload, key))
      .map(key => [key, pick(payload[key], key === "calculatorData" ? ["selectedDate"] : STATE_FIELDS, key !== "calculatorData")])) };
}

module.exports = { ACCOUNT_CALENDAR_VIEW, ACCOUNT_CALENDAR_RPC, ACCOUNT_CALENDAR_SELECT, projectAccountCalendarEntry };
