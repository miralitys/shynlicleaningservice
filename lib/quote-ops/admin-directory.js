"use strict";

const { ORDER_LIST_SELECT } = require("./order-list");

const MENU_PAYLOAD_KEYS = ["orderState", "adminOrder", "adminLead"];
const CLIENT_PAYLOAD_KEYS = [...MENU_PAYLOAD_KEYS, "calculatorData", "adminClient"];
const SCALAR_COLUMNS = ORDER_LIST_SELECT.split(",").filter(field => !field.includes(":"));

function adminDirectoryPayloadKeys(includeClients = false) {
  return includeClients ? CLIENT_PAYLOAD_KEYS : MENU_PAYLOAD_KEYS;
}

function adminDirectorySelect(includeClients = false) {
  const keys = adminDirectoryPayloadKeys(includeClients);
  return [...SCALAR_COLUMNS, ...keys.map(key => `directory_${key}:payload_for_retry->${key}`)].join(",");
}

function hydrateAdminDirectoryRow(row, includeClients = false) {
  const keys = adminDirectoryPayloadKeys(includeClients);
  return { ...row, payload_for_retry: Object.fromEntries(keys.map(key => [key, row[`directory_${key}`]])) };
}

function projectAdminDirectoryEntry(entry, includeClients = false) {
  const source = entry.payloadForRetry || {};
  const payload = {};
  for (const key of adminDirectoryPayloadKeys(includeClients)) {
    const value = source[key];
    if (value == null) continue;
    if ((key === "orderState" || key === "adminOrder") && typeof value === "object" && !Array.isArray(value)) {
      const order = { ...value };
      delete order.completion;
      delete order.policyAcceptance;
      delete order.payroll;
      const completion = value.completion;
      if (completion && typeof completion === "object" &&
          (String(completion.cleanerComment || "").trim() ||
            (Array.isArray(completion.beforePhotos) && completion.beforePhotos.length) ||
            (Array.isArray(completion.afterPhotos) && completion.afterPhotos.length))) order.isCreated = true;
      // Legacy records can consist solely of a completion or a policy object.
      if (Object.keys(value).length && !Object.keys(order).length) order.directoryHasOrderState = true;
      payload[key] = order;
    } else if (key === "adminClient" && typeof value === "object" && !Array.isArray(value)) {
      const { photos, ...client } = value;
      payload[key] = client;
    } else payload[key] = value;
  }
  const { retryHistory, payloadForRetry, ...scalars } = entry;
  return { ...scalars, payloadForRetry: payload, isAdminDirectorySummary: true };
}

module.exports = { adminDirectorySelect, hydrateAdminDirectoryRow, projectAdminDirectoryEntry, adminDirectoryPayloadKeys };
