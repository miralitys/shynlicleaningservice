"use strict";

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

module.exports = { recurringSeriesReadFilter };
