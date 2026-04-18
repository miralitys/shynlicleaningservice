"use strict";

const path = require("node:path");

function normalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function getEntryPayload(entry = {}) {
  return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
}

function getPayloadOrderState(payload = {}) {
  if (payload && payload.orderState && typeof payload.orderState === "object") {
    return payload.orderState;
  }
  if (payload && payload.adminOrder && typeof payload.adminOrder === "object") {
    return payload.adminOrder;
  }
  return {};
}

function getEntryOrderState(entry = {}) {
  return getPayloadOrderState(getEntryPayload(entry));
}

function hasEntryOrderState(entry = {}) {
  return Object.keys(getEntryOrderState(entry)).length > 0;
}

function normalizeOrderCompletionAssets(value = [], fallbackKind = "before") {
  const items = Array.isArray(value) ? value : [];
  const normalizedAssets = [];
  const seen = new Set();

  for (const asset of items) {
    if (!asset || typeof asset !== "object") continue;
    const pathValue = normalizeString(asset.path, 500);
    if (!pathValue || seen.has(pathValue)) continue;
    seen.add(pathValue);
    normalizedAssets.push({
      id: normalizeString(asset.id || path.basename(pathValue), 160) || path.basename(pathValue),
      kind: normalizeString(asset.kind, 32).toLowerCase() === "after" ? "after" : fallbackKind,
      path: pathValue,
      fileName:
        normalizeString(asset.fileName || path.basename(pathValue), 180) || path.basename(pathValue),
      contentType: normalizeString(asset.contentType, 160) || "image/jpeg",
      sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
      uploadedAt: normalizeString(asset.uploadedAt, 80),
    });
    if (normalizedAssets.length >= 40) break;
  }

  return normalizedAssets;
}

function getEntryOrderCompletionData(entry = {}) {
  const adminOrder = getEntryOrderState(entry);
  const completion =
    adminOrder && adminOrder.completion && typeof adminOrder.completion === "object"
      ? adminOrder.completion
      : {};
  return {
    cleanerComment: normalizeString(completion.cleanerComment, 4000),
    beforePhotos: normalizeOrderCompletionAssets(completion.beforePhotos, "before"),
    afterPhotos: normalizeOrderCompletionAssets(completion.afterPhotos, "after"),
    updatedAt: normalizeString(completion.updatedAt, 80),
  };
}

module.exports = {
  getEntryOrderCompletionData,
  getEntryOrderState,
  getPayloadOrderState,
  hasEntryOrderState,
};
