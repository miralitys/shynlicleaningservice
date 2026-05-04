"use strict";

const crypto = require("crypto");

const PAYMENT_SHORT_LINK_PATH_PREFIX = "/pay/";
const PAYMENT_SHORT_CODE_LENGTH = 10;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePaymentShortCode(value) {
  return normalizeString(value, 80).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

function normalizeSiteOrigin(value) {
  const raw = normalizeString(value, 500).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

function getEntryPayload(entry = {}) {
  return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
}

function getEntryOrderState(entry = {}) {
  const payload = getEntryPayload(entry);
  if (payload.adminOrder && typeof payload.adminOrder === "object") {
    return payload.adminOrder;
  }
  if (payload.orderState && typeof payload.orderState === "object") {
    return payload.orderState;
  }
  return {};
}

function getInvoicePaymentLinkState(entry = {}) {
  const orderState = getEntryOrderState(entry);
  const notifications =
    orderState && orderState.notifications && typeof orderState.notifications === "object"
      ? orderState.notifications
      : {};
  return notifications.invoiceSms && typeof notifications.invoiceSms === "object"
    ? notifications.invoiceSms
    : {};
}

function buildPaymentShortCode(input = {}) {
  const parts = [
    normalizeString(input.entryId, 120),
    normalizeString(input.requestId, 120),
    normalizeString(input.checkoutSessionId || input.sessionId, 160),
    normalizeString(input.checkoutUrl || input.url, 4000),
  ];
  if (!parts.some(Boolean)) return "";
  return crypto.createHash("sha256").update(parts.join("\n")).digest("base64url").slice(0, PAYMENT_SHORT_CODE_LENGTH);
}

function buildPaymentShortLinkUrl(siteOrigin, code) {
  const origin = normalizeSiteOrigin(siteOrigin);
  const normalizedCode = normalizePaymentShortCode(code);
  if (!origin || !normalizedCode) return "";
  return `${origin}${PAYMENT_SHORT_LINK_PATH_PREFIX}${normalizedCode}`;
}

function buildPaymentShortLink(input = {}) {
  const code = buildPaymentShortCode(input);
  return {
    code,
    url: buildPaymentShortLinkUrl(input.siteOrigin, code),
  };
}

function isAllowedStripeCheckoutUrl(value) {
  const raw = normalizeString(value, 4000);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && (parsed.hostname === "checkout.stripe.com" || parsed.hostname === "stripe.example");
  } catch {
    return false;
  }
}

function resolvePaymentShortLink(entries = [], code = "") {
  const expectedCode = normalizePaymentShortCode(code);
  if (!expectedCode || !Array.isArray(entries)) return null;

  for (const entry of entries) {
    const invoiceSms = getInvoicePaymentLinkState(entry);
    const checkoutUrl = normalizeString(invoiceSms.checkoutUrl, 4000);
    if (!isAllowedStripeCheckoutUrl(checkoutUrl)) continue;

    const storedCode = normalizePaymentShortCode(invoiceSms.shortCode);
    const computedCode = buildPaymentShortCode({
      entryId: entry && entry.id,
      requestId: entry && entry.requestId,
      checkoutSessionId: invoiceSms.checkoutSessionId,
      checkoutUrl,
    });
    if (expectedCode !== storedCode && expectedCode !== computedCode) continue;

    return {
      code: expectedCode,
      checkoutUrl,
      entryId: normalizeString(entry && entry.id, 120),
      requestId: normalizeString(entry && entry.requestId, 120),
      checkoutSessionId: normalizeString(invoiceSms.checkoutSessionId, 160),
    };
  }

  return null;
}

module.exports = {
  PAYMENT_SHORT_LINK_PATH_PREFIX,
  buildPaymentShortCode,
  buildPaymentShortLink,
  buildPaymentShortLinkUrl,
  isAllowedStripeCheckoutUrl,
  normalizePaymentShortCode,
  resolvePaymentShortLink,
};
