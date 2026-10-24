"use strict";

const { ORDER_LIST_SELECT, projectOrderListEntry } = require("../quote-ops/order-list");

const ACCOUNT_LIST_VIEW = "account_order_list_entries";

// The read-only view preserves both root objects, including empty/null roots.
// The same selection also supports the old ledger when the view is not installed.
const ACCOUNT_LIST_SELECT = ORDER_LIST_SELECT.split(",")
  .filter(field => !/^list_(adminClient|adminLead):/.test(field)).join(",");

function projectAccountListEntry(entry) {
  const result = projectOrderListEntry(entry, { includePayroll: true });
  delete result.payloadForRetry.adminClient;
  delete result.payloadForRetry.adminLead;
  for (const key of ["orderState", "adminOrder"]) {
    if (entry.payloadForRetry?.[key] && Object.hasOwn(entry.payloadForRetry[key], "updatedAt")) {
      result.payloadForRetry[key].updatedAt = entry.payloadForRetry[key].updatedAt;
    }
    const completion = entry.payloadForRetry?.[key]?.completion;
    if (completion && Array.isArray(completion.checklistItems) && result.payloadForRetry[key]) {
      result.payloadForRetry[key].completion = { checklistItems: completion.checklistItems };
    }
  }
  return result;
}

module.exports = { ACCOUNT_LIST_VIEW, ACCOUNT_LIST_SELECT, projectAccountListEntry };
