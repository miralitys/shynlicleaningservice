"use strict";

const { SOURCES, defaultSource } = require("../profitability");

function firstKnownOrderSource(entries, sources = new Map()) {
  const ordered = [...entries].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  for (const entry of ordered) {
    for (const source of [sources.get(entry.id), defaultSource(entry)]) {
      if (Object.hasOwn(SOURCES, source)) return source;
    }
  }
  return "";
}

async function resolveManualOrderClientSource(customer, ledger, financeStore) {
  const entries = await ledger.listOrderListEntries();
  const { collectAdminClientRecords, isOrderCreatedEntry } = require("./domain").createAdminDomainHelpers({
    normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
  });
  const phone = value => String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const email = value => String(value || "").trim().toLowerCase();
  const customerPhone = phone(customer.customerPhone), customerEmail = email(customer.customerEmail);
  const client = collectAdminClientRecords(entries).find(record =>
    (customerPhone && [record.phone, record.secondaryPhone].some(value => phone(value) === customerPhone)) ||
    (customerEmail && email(record.email) === customerEmail) ||
    (customer.contactId && record.entries.some(entry => entry.contactId === customer.contactId)) ||
    (!record.phone && !record.email && record.key === customer.selectedClientKey &&
      record.name === customer.customerName)
  );
  if (!client) return { existingClient: false, source: "" };
  const orders = client.entries.filter(isOrderCreatedEntry);
  let sources = new Map();
  if (orders.length && financeStore) {
    try { sources = new Map((await financeStore.listSources()).map(item => [item.id, item.source])); }
    catch { /* Saved order sources remain usable when private financial storage is unavailable. */ }
  }
  return { existingClient: true, source: firstKnownOrderSource(orders, sources) };
}

module.exports = { firstKnownOrderSource, resolveManualOrderClientSource };
