"use strict";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function getEntryPayload(entry = {}) {
  return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
}

function getEntryAdminClient(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminClient && typeof payload.adminClient === "object"
    ? payload.adminClient
    : {};
}

function parseNotificationPreference(value) {
  if (value === true || value === false) return value;
  const normalized = normalizeString(value, 20).toLowerCase();
  if (["1", "true", "yes", "enabled", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "disabled", "off"].includes(normalized)) return false;
  return null;
}

function getClientAutomaticNotificationsPreference(entry = {}) {
  const adminClient = getEntryAdminClient(entry);
  for (const key of [
    "automaticNotificationsEnabled",
    "autoNotificationsEnabled",
    "notificationsEnabled",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(adminClient, key)) continue;
    const preference = parseNotificationPreference(adminClient[key]);
    if (preference !== null) return preference;
  }
  return null;
}

function normalizePhone(value) {
  let digits = normalizeString(value, 80).replace(/\D+/g, "");
  while (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

function getEntryIdentity(entry = {}) {
  const adminClient = getEntryAdminClient(entry);
  return {
    contactId: normalizeString(entry.contactId, 120).toLowerCase(),
    phones: new Set(
      [
        entry.customerPhone,
        adminClient.secondaryPhone,
        adminClient.secondary_phone,
        adminClient.alternatePhone,
        adminClient.alternate_phone,
        adminClient.phone2,
      ]
        .map(normalizePhone)
        .filter(Boolean)
    ),
    email: normalizeString(entry.customerEmail, 250).toLowerCase(),
  };
}

function entriesShareClientIdentity(left = {}, right = {}) {
  if (left === right) return true;
  const leftIdentity = getEntryIdentity(left);
  const rightIdentity = getEntryIdentity(right);
  if (
    leftIdentity.contactId &&
    rightIdentity.contactId &&
    leftIdentity.contactId === rightIdentity.contactId
  ) {
    return true;
  }
  for (const phone of leftIdentity.phones) {
    if (rightIdentity.phones.has(phone)) return true;
  }
  return Boolean(
    leftIdentity.email &&
      rightIdentity.email &&
      leftIdentity.email === rightIdentity.email
  );
}

function resolveClientAutomaticNotificationsEnabled(entry = {}, entries = []) {
  const directPreference = getClientAutomaticNotificationsPreference(entry);
  if (directPreference !== null) return directPreference;

  let relatedPreference = null;
  for (const candidate of Array.isArray(entries) ? entries : []) {
    if (!candidate || !entriesShareClientIdentity(entry, candidate)) continue;
    const preference = getClientAutomaticNotificationsPreference(candidate);
    if (preference === false) return false;
    if (preference === true) relatedPreference = true;
  }
  return relatedPreference !== null ? relatedPreference : true;
}

module.exports = {
  entriesShareClientIdentity,
  getClientAutomaticNotificationsPreference,
  resolveClientAutomaticNotificationsEnabled,
};
