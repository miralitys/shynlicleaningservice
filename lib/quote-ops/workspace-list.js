"use strict";

const WORKSPACE_LIST_VIEW = "admin_workspace_list_entries";
const WORKSPACE_PAGE_RPC = "read_admin_workspace_page";
const WORKSPACE_STATE_FIELDS = ["isCreated", "createdAt", "status", "assignedStaff", "assignee", "selectedDate",
  "selectedTime", "frequency", "paymentMethod", "managerConfirmationRequired", "managerConfirmedAt",
  "recurringSeriesId", "recurringSourceEntryId"];
const WORKSPACE_LEAD_FIELDS = ["status", "updatedAt", "managerId", "managerName", "managerEmail", "notes", "tasks"];
const WORKSPACE_TASK_FIELDS = ["id", "kind", "title", "stage", "dueAt", "status", "createdAt", "updatedAt",
  "completedAt", "resolution", "comment", "attempt", "assigneeId", "assigneeName", "assigneeEmail", "assigneeRole"];
const WORKSPACE_PAYLOAD_KEYS = ["orderState", "adminOrder", "adminLead", "calculatorData", "adminClient"];
const WORKSPACE_SCALARS = ["id", "kind", "status", "created_at", "updated_at", "request_id", "source_route", "source",
  "customer_name", "customer_phone", "customer_email", "service_type", "service_name", "total_price", "total_price_cents",
  "selected_date", "selected_time", "full_address", "code", "error_message", "contact_id", "retry_count"];
const WORKSPACE_LIST_SELECT = [...WORKSPACE_SCALARS,
  ...WORKSPACE_PAYLOAD_KEYS.map(key => `workspace_${key}:payload_for_retry->${key}`)].join(",");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const pick = (value, keys) => object(value)
  ? Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : value;

function projectWorkspaceState(value) {
  if (!object(value)) return value;
  const result = pick(value, WORKSPACE_STATE_FIELDS);
  if (object(value.completion)) {
    result.completion = pick(value.completion, ["cleanerComment"]);
    if ([value.completion.beforePhotos, value.completion.afterPhotos].some(items => Array.isArray(items) && items.length)) {
      result.isCreated = true;
    }
  }
  // Preserve nonempty legacy roots without turning unknown fields into a created order.
  if (Object.keys(value).length && !Object.keys(result).length) result.workspaceHasOrderState = true;
  return result;
}

function projectWorkspaceLead(value) {
  if (!object(value)) return value;
  const result = pick(value, WORKSPACE_LEAD_FIELDS);
  if (Array.isArray(value.tasks)) result.tasks = value.tasks.map(task => pick(task, WORKSPACE_TASK_FIELDS));
  return result;
}

function projectWorkspaceClient(value) {
  if (!object(value)) return value;
  const result = {};
  if (Object.hasOwn(value, "addressBook")) result.addressBook = Array.isArray(value.addressBook)
    ? value.addressBook.map(address => pick(address, ["address", "value", "notes", "specialInstructions"])) : value.addressBook;
  return result;
}

function projectWorkspaceListEntry(entry) {
  const source = object(entry.payloadForRetry) ? entry.payloadForRetry : {};
  const payload = {};
  for (const key of WORKSPACE_PAYLOAD_KEYS) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    payload[key] = key === "orderState" || key === "adminOrder" ? projectWorkspaceState(value)
      : key === "adminLead" ? projectWorkspaceLead(value)
      : key === "adminClient" ? projectWorkspaceClient(value)
      : pick(value, ["additionalDetails", "fullAddress", "address"]);
  }
  const { retryHistory, payloadForRetry, ...scalars } = entry;
  return { ...scalars, payloadForRetry: payload, isWorkspaceListSummary: true };
}

function hydrateWorkspaceListRow(row) {
  return { ...row, payload_for_retry: Object.fromEntries(WORKSPACE_PAYLOAD_KEYS.map(key => [key, row[`workspace_${key}`]])) };
}

module.exports = { WORKSPACE_LIST_VIEW, WORKSPACE_PAGE_RPC, WORKSPACE_LIST_SELECT, WORKSPACE_PAYLOAD_KEYS, WORKSPACE_STATE_FIELDS,
  WORKSPACE_LEAD_FIELDS, WORKSPACE_TASK_FIELDS, projectWorkspaceState, projectWorkspaceLead,
  projectWorkspaceListEntry, hydrateWorkspaceListRow };
