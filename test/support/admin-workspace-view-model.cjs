"use strict";

// Independent wire model; the actual PostgreSQL view is also checked against the reader.
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const pick = (value, fields) => object(value)
  ? Object.fromEntries(Object.entries(value).filter(([key]) => fields.includes(key))) : value ?? null;
function state(value) {
  if (!object(value)) return value ?? null;
  const result = pick(value, ["isCreated", "createdAt", "status", "assignedStaff", "assignee", "selectedDate", "selectedTime",
    "frequency", "paymentMethod", "managerConfirmationRequired", "managerConfirmedAt", "recurringSeriesId", "recurringSourceEntryId"]);
  if (object(value.completion)) {
    result.completion = pick(value.completion, ["cleanerComment"]);
    if ([value.completion.beforePhotos, value.completion.afterPhotos].some(items => Array.isArray(items) && items.length)) result.isCreated = true;
  }
  if (Object.keys(value).length && !Object.keys(result).length) result.workspaceHasOrderState = true;
  return result;
}
function projectWorkspaceViewPayload(p) {
  const lead = p?.adminLead;
  const client = p?.adminClient;
  const compactLead = pick(lead, ["status", "updatedAt", "managerId", "managerName", "managerEmail", "notes", "tasks"]);
  if (object(lead) && Array.isArray(lead.tasks)) compactLead.tasks = lead.tasks.map(task => pick(task,
    ["id", "kind", "title", "stage", "dueAt", "status", "createdAt", "updatedAt", "completedAt", "resolution",
      "comment", "attempt", "assigneeId", "assigneeName", "assigneeEmail", "assigneeRole"]));
  const compactClient = object(client) ? {} : client ?? null;
  if (object(client) && Object.hasOwn(client, "addressBook")) compactClient.addressBook = Array.isArray(client.addressBook)
    ? client.addressBook.map(address => pick(address, ["address", "value", "notes", "specialInstructions"])) : client.addressBook;
  return { orderState: state(p?.orderState), adminOrder: state(p?.adminOrder), adminLead: compactLead,
    calculatorData: pick(p?.calculatorData, ["additionalDetails", "fullAddress", "address"]), adminClient: compactClient };
}
module.exports = { projectWorkspaceViewPayload };
