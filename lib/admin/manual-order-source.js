"use strict";

const { SOURCES, defaultSource } = require("../profitability");

function getClientSourcePreference(entries = []) {
  return entries.filter(entry => entry.kind === "client_record").map(entry => {
    const profile = entry.payloadForRetry?.adminClient;
    if (!profile || typeof profile.acquisitionSource !== "string" ||
        (profile.acquisitionSource !== "" && !Object.hasOwn(SOURCES, profile.acquisitionSource))) return null;
    return { source: profile.acquisitionSource, entryId: entry.id,
      updatedAt: profile.acquisitionSourceUpdatedAt || entry.updatedAt || entry.createdAt || "" };
  }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) ||
    String(b.entryId).localeCompare(String(a.entryId)))[0] || null;
}

function firstKnownOrderSource(entries, sources = new Map()) {
  const ordered = [...entries].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  for (const entry of ordered) {
    for (const source of [sources.get(entry.id), defaultSource(entry)]) {
      if (Object.hasOwn(SOURCES, source)) return source;
    }
  }
  return "";
}

function findSourceClient(customer, entries) {
  const { collectAdminClientRecords } = require("./domain").createAdminDomainHelpers({
    normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
  });
  const phone = value => String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const email = value => String(value || "").trim().toLowerCase();
  const customerPhone = phone(customer.customerPhone), customerEmail = email(customer.customerEmail);
  return collectAdminClientRecords(entries).find(record =>
    (customerPhone && [record.phone, record.secondaryPhone, ...(record.phoneKeys || [])].some(value => phone(value) === customerPhone)) ||
    (customerEmail && email(record.email) === customerEmail) ||
    (customer.contactId && record.entries.some(entry => entry.contactId === customer.contactId)) ||
    (!record.phone && !record.email && record.key === customer.selectedClientKey &&
      record.name === customer.customerName)
  );
}

async function resolveManualOrderClientSource(customer, ledger, financeStore) {
  const entries = await ledger.listOrderListEntries();
  const { isOrderCreatedEntry } = require("./domain").createAdminDomainHelpers({
    normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
  });
  const client = findSourceClient(customer, entries);
  if (!client) return { existingClient: false, source: "" };
  const preference = getClientSourcePreference(client.entries);
  if (preference) return { existingClient: true, source: preference.source };
  const orders = client.entries.filter(isOrderCreatedEntry);
  let sources = new Map();
  if (orders.length && financeStore) {
    try { sources = new Map((await financeStore.listSources()).map(item => [item.id, item.source])); }
    catch { /* Saved order sources remain usable when private financial storage is unavailable. */ }
  }
  return { existingClient: true, source: firstKnownOrderSource(orders, sources) };
}

module.exports = { firstKnownOrderSource, getClientSourcePreference, findSourceClient, resolveManualOrderClientSource };
