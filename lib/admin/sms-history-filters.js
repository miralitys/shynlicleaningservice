"use strict";

const INTERNAL_RECIPIENT_ROLES = new Set(["admin", "manager", "staff"]);
const INTERNAL_TARGET_TYPES = new Set([
  "admin",
  "manager",
  "staff",
  "staff-assignment",
  "manager-cleaning-complete",
]);
const CUSTOMER_TARGET_TYPES = new Set([
  "",
  "client",
  "client-en-route",
  "invoice-payment-link",
  "order",
  "quote",
  "review-request",
  "visit-reminder",
]);

function normalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function normalizeSmsPhoneDigits(value) {
  const digits = normalizeString(value, 80).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

function isInternalLeadAlertMessage(message) {
  const normalized = normalizeString(message, 1000).toLowerCase();
  return (
    normalized.includes("a new shynli lead was submitted") ||
    normalized.includes("/admin/quote-ops")
  );
}

function isInternalSmsHistoryEntry(entry = {}) {
  const recipientRole = normalizeString(entry.recipientRole, 40).toLowerCase();
  const targetType = normalizeString(entry.targetType, 40).toLowerCase();
  return (
    INTERNAL_RECIPIENT_ROLES.has(recipientRole) ||
    INTERNAL_TARGET_TYPES.has(targetType) ||
    isInternalLeadAlertMessage(entry.message)
  );
}

function getOwnerReferenceValues(owner = {}) {
  return [
    normalizeString(owner.id, 160),
    normalizeString(owner.key, 160),
    normalizeString(owner.clientKey, 160),
    normalizeString(owner.targetRef, 160),
  ].filter(Boolean);
}

function doesSmsTargetMatchOwner(owner = {}, entry = {}) {
  const targetRef = normalizeString(entry.targetRef, 160);
  if (!targetRef) return false;
  return getOwnerReferenceValues(owner).some((ref) => (
    targetRef === ref || targetRef.startsWith(`${ref}:`)
  ));
}

function isCustomerSmsHistoryEntry(owner = {}, entry = {}) {
  if (!entry || typeof entry !== "object") return false;
  if (!normalizeString(entry.message, 1000)) return false;
  if (isInternalSmsHistoryEntry(entry)) return false;

  const targetType = normalizeString(entry.targetType, 40).toLowerCase();
  if (!CUSTOMER_TARGET_TYPES.has(targetType)) return false;

  const ownerContactId = normalizeString(owner.contactId, 120);
  const entryContactId = normalizeString(entry.contactId, 120);
  if (ownerContactId && entryContactId && ownerContactId === entryContactId) {
    return true;
  }

  const ownerPhone = normalizeSmsPhoneDigits(owner.customerPhone || owner.phone);
  const entryPhone = normalizeSmsPhoneDigits(entry.phone);
  if (ownerPhone && entryPhone && ownerPhone === entryPhone) {
    return true;
  }

  if (doesSmsTargetMatchOwner(owner, entry)) {
    return true;
  }

  return !ownerContactId && !ownerPhone;
}

function filterCustomerSmsHistoryEntries(owner = {}, entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => isCustomerSmsHistoryEntry(owner, entry));
}

module.exports = {
  filterCustomerSmsHistoryEntries,
  isCustomerSmsHistoryEntry,
  isInternalSmsHistoryEntry,
  normalizeSmsPhoneDigits,
};
