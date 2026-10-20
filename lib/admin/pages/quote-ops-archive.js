"use strict";

const { getEntryOrderState } = require("../../admin-order-state");

function getLegacyQuoteHistory(entries = []) {
  const modernIds = new Set();
  const modernSeries = new Set();
  const rows = entries.map(entry => ({ entry, order: getEntryOrderState(entry) }));
  function markModern({ entry, order }) {
    modernIds.add(entry.id);
    for (const identity of [entry.requestId, order.recurringSeriesId]) {
      if (identity) modernSeries.add(identity);
    }
  }
  for (const row of rows) {
    if (row.order.managerConfirmationRequired === true) markModern(row);
  }
  // Follow explicit series links only; matching a phone must not hide older requests.
  let changed;
  do {
    changed = false;
    for (const row of rows) {
      if (!modernIds.has(row.entry.id) &&
          (modernIds.has(row.order.recurringSourceEntryId) || modernSeries.has(row.order.recurringSeriesId))) {
        markModern(row);
        changed = true;
      }
    }
  } while (changed);
  return entries.filter(entry => !modernIds.has(entry.id));
}

module.exports = { getLegacyQuoteHistory };
