"use strict";

const path = require("node:path");

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSerializable(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function getEntryPayload(entry = {}) {
  return isObject(entry && entry.payloadForRetry) ? entry.payloadForRetry : {};
}

function getPayloadOrderState(payload = {}) {
  if (isObject(payload.orderState)) {
    return cloneSerializable(payload.orderState, {});
  }
  if (isObject(payload.adminOrder)) {
    return cloneSerializable(payload.adminOrder, {});
  }
  return {};
}

function getPayloadPaymentState(payload = {}) {
  if (isObject(payload.paymentState)) {
    return cloneSerializable(payload.paymentState, {});
  }
  if (isObject(payload.payment)) {
    return cloneSerializable(payload.payment, {});
  }
  return {};
}

function hasPayloadOrderState(payload = {}) {
  return Object.keys(getPayloadOrderState(payload)).length > 0;
}

function hasEntryOrderState(entry = {}) {
  return hasPayloadOrderState(getEntryPayload(entry));
}

function getEntryOrderState(entry = {}) {
  return getPayloadOrderState(getEntryPayload(entry));
}

function getEntryPaymentState(entry = {}) {
  return getPayloadPaymentState(getEntryPayload(entry));
}

function normalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function normalizeOrderCompletionAssets(value = [], fallbackKind = "before") {
  const items = Array.isArray(value) ? value : [];
  const normalizedAssets = [];
  const seen = new Set();

  for (const asset of items) {
    if (!isObject(asset)) continue;
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

function normalizeOrderChecklistItems(value = []) {
  const items = Array.isArray(value) ? value : [];
  const normalizedItems = [];
  const seen = new Set();

  for (const item of items) {
    if (!isObject(item)) continue;
    const id = normalizeString(item.id, 120);
    const label = normalizeString(item.label, 240);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    normalizedItems.push({
      id,
      label,
      hint: normalizeString(item.hint, 240),
      completed: Boolean(item.completed),
      updatedAt: normalizeString(item.updatedAt, 80),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : normalizedItems.length,
    });
    if (normalizedItems.length >= 80) break;
  }

  return normalizedItems.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id.localeCompare(right.id);
  });
}

function getEntryOrderCompletionData(entry = {}) {
  const orderState = getEntryOrderState(entry);
  const completion = isObject(orderState.completion) ? cloneSerializable(orderState.completion, {}) : {};
  return {
    cleanerComment: normalizeString(completion.cleanerComment, 4000),
    checklistItems: normalizeOrderChecklistItems(completion.checklistItems),
    beforePhotos: normalizeOrderCompletionAssets(completion.beforePhotos, "before"),
    afterPhotos: normalizeOrderCompletionAssets(completion.afterPhotos, "after"),
    updatedAt: normalizeString(completion.updatedAt, 80),
  };
}

function getEntryOrderPolicyAcceptanceData(entry = {}) {
  const orderState = getEntryOrderState(entry);
  return isObject(orderState.policyAcceptance)
    ? cloneSerializable(orderState.policyAcceptance, {})
    : {};
}

function setEntryOrderState(entry, orderState) {
  if (!isObject(entry)) return null;
  const payload = {
    ...getEntryPayload(entry),
  };
  if (isObject(orderState) && Object.keys(orderState).length > 0) {
    payload.orderState = cloneSerializable(orderState, {});
    payload.adminOrder = cloneSerializable(orderState, {});
  } else {
    delete payload.orderState;
    delete payload.adminOrder;
  }
  entry.payloadForRetry = payload;
  return entry;
}

function setEntryPaymentState(entry, paymentState) {
  if (!isObject(entry)) return null;
  const payload = {
    ...getEntryPayload(entry),
  };
  if (isObject(paymentState) && Object.keys(paymentState).length > 0) {
    payload.paymentState = cloneSerializable(paymentState, {});
    payload.payment = cloneSerializable(paymentState, {});
  } else {
    delete payload.paymentState;
    delete payload.payment;
  }
  entry.payloadForRetry = payload;
  return entry;
}

module.exports = {
  getEntryOrderCompletionData,
  getEntryOrderPolicyAcceptanceData,
  getEntryOrderState,
  getEntryPayload,
  getEntryPaymentState,
  getPayloadOrderState,
  getPayloadPaymentState,
  hasEntryOrderState,
  hasPayloadOrderState,
  setEntryOrderState,
  setEntryPaymentState,
};
