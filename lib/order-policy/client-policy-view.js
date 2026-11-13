"use strict";

const { getEntryOrderPolicyAcceptanceData, getEntryOrderState } = require("../admin-order-state");
const string = value => String(value || "").trim();
const phone = value => {
  const digits = string(value).replace(/\D/g, "").replace(/^1+(?=\d{10}$)/, "");
  return digits.length >= 10 ? digits : "";
};
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(value)) ? string(value).toLowerCase() : "";
const secondaryKeys = ["secondaryPhone", "secondary_phone", "alternatePhone", "alternate_phone", "phone2"];

// Only identities cross the network here, never certificates, signatures or SMS history.
const CLIENT_POLICY_SELECT = ["id", "customer_email", "customer_phone", "contact_id",
  ...secondaryKeys.map(key => `${key}:payload_for_retry->adminClient->>${key}`),
  ...["orderState", "adminOrder"].flatMap(key => [
    `${key}Email:payload_for_retry->${key}->policyAcceptance->>customerEmail`,
    `${key}Phone:payload_for_retry->${key}->policyAcceptance->>customerPhone`,
  ])].join(",");
const CLIENT_POLICY_FILTER = "(payload_for_retry->orderState->policyAcceptance->>policyAccepted.eq.true,payload_for_retry->adminOrder->policyAcceptance->>policyAccepted.eq.true)";

function identity(entry = {}) {
  const policy = getEntryOrderPolicyAcceptanceData(entry);
  const client = entry.payloadForRetry?.adminClient || {};
  return {
    emails: new Set([entry.customerEmail, policy.customerEmail, ...(entry.policyEmails || [])].map(email).filter(Boolean)),
    phones: new Set([entry.customerPhone, entry.secondaryPhone, policy.customerPhone,
      ...secondaryKeys.map(key => client[key]), ...(entry.policyPhones || [])].map(phone).filter(Boolean)),
    contactId: string(entry.contactId),
  };
}

function samePolicyClient(left, right) {
  const a = identity(left), b = identity(right);
  return Boolean(a.contactId && a.contactId === b.contactId) ||
    [...a.emails].some(value => b.emails.has(value)) || [...a.phones].some(value => b.phones.has(value));
}

function decodeClientPolicyCandidate(row) {
  if (!row || typeof row.id !== "string" || !row.id) throw new Error("Invalid policy candidate response");
  return { id: row.id, customerPhone: row.customer_phone, customerEmail: row.customer_email, contactId: row.contact_id,
    policyEmails: [row.orderStateEmail, row.adminOrderEmail],
    policyPhones: [row.orderStatePhone, row.adminOrderPhone, ...secondaryKeys.map(key => row[key])] };
}

function hasPolicyCertificate(record = {}) {
  const file = record.certificateFile;
  return Boolean(file && (string(file.id) || string(file.fileName) || string(file.relativePath)));
}

async function resolveClientPolicyView(order, ledger, { entries = [] } = {}) {
  if (!order || order.policyAccepted || order.serviceType === "free-in-home-estimate" || !ledger) return order;
  const target = order.entry;
  if (!target || getEntryOrderPolicyAcceptanceData(target).revokedAt) return order;
  const targetIdentity = identity(target);
  if (!targetIdentity.contactId && !targetIdentity.phones.size && !targetIdentity.emails.size) return order;
  const checked = new Set([order.id]);
  let acceptedWithoutCertificate = null;
  const find = async candidates => {
    for (const candidate of candidates) {
      if (checked.has(candidate.id) || !samePolicyClient(target, candidate)) continue;
      checked.add(candidate.id);
      // Re-read the actual source before claiming acceptance. List DTOs are not proof.
      const source = await ledger.getEntry(candidate.id, { allowMemoryFallback: false });
      if (!source || source.id !== candidate.id || !samePolicyClient(target, source)) continue;
      const record = getEntryOrderPolicyAcceptanceData(source);
      if (record.policyAccepted !== true || record.revokedAt || record.status === "revoked") continue;
      const view = { ...order, policyAccepted: true, policyAcceptance: structuredClone(record),
        policyInherited: true, policySourceEntryId: source.id, policyHasCertificate: hasPolicyCertificate(record) };
      if (view.policyHasCertificate) return view;
      acceptedWithoutCertificate ||= view;
    }
    return null;
  };
  try {
    const available = entries.filter(entry => getEntryOrderState(entry).policyAcceptance?.policyAccepted === true);
    const existing = await find(available);
    if (existing) return existing;
    if (typeof ledger.listClientPolicyCandidates !== "function") return acceptedWithoutCertificate || order;
    const candidates = await ledger.listClientPolicyCandidates();
    if (!Array.isArray(candidates)) throw new Error("Invalid policy candidate response");
    return await find(candidates) || acceptedWithoutCertificate || order;
  } catch {
    // A failed lookup must not become a false "unsigned" warning or an invitation to resend.
    return acceptedWithoutCertificate || { ...order, policyLookupUnavailable: true };
  }
}

module.exports = { CLIENT_POLICY_SELECT, CLIENT_POLICY_FILTER, decodeClientPolicyCandidate, resolveClientPolicyView, samePolicyClient };
