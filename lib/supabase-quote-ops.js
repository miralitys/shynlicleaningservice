"use strict";

const DEFAULT_TABLE_NAME = "quote_ops_entries";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeUrl(value) {
  const raw = normalizeString(value, 500);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function loadSupabaseQuoteOpsConfig(env = process.env) {
  const url = normalizeUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY, 2048);
  const tableName = normalizeString(env.SUPABASE_QUOTE_OPS_TABLE || DEFAULT_TABLE_NAME, 120) || DEFAULT_TABLE_NAME;

  return {
    configured: Boolean(url && serviceRoleKey),
    url,
    serviceRoleKey,
    tableName,
  };
}

function mapEntryToRow(entry = {}) {
  return {
    id: normalizeString(entry.id, 120),
    kind: normalizeString(entry.kind, 64) || "quote_submission",
    status: normalizeString(entry.status, 32) || "error",
    created_at: normalizeString(entry.createdAt, 64),
    updated_at: normalizeString(entry.updatedAt, 64),
    request_id: normalizeString(entry.requestId, 120),
    source_route: normalizeString(entry.sourceRoute, 120),
    source: normalizeString(entry.source, 120),
    customer_name: normalizeString(entry.customerName, 250),
    customer_phone: normalizeString(entry.customerPhone, 80),
    customer_email: normalizeString(entry.customerEmail, 250),
    service_type: normalizeString(entry.serviceType, 40),
    service_name: normalizeString(entry.serviceName, 120),
    total_price: Number.isFinite(entry.totalPrice) ? Number(entry.totalPrice) : 0,
    total_price_cents: Number.isFinite(entry.totalPriceCents) ? Number(entry.totalPriceCents) : 0,
    selected_date: normalizeString(entry.selectedDate, 32),
    selected_time: normalizeString(entry.selectedTime, 32),
    full_address: normalizeString(entry.fullAddress, 500),
    http_status: Number.isFinite(entry.httpStatus) ? Number(entry.httpStatus) : 0,
    code: normalizeString(entry.code, 80),
    retryable: Boolean(entry.retryable),
    warnings: Array.isArray(entry.warnings) ? entry.warnings : [],
    error_message: normalizeString(entry.errorMessage, 300),
    contact_id: normalizeString(entry.contactId, 120),
    note_created: Boolean(entry.noteCreated),
    opportunity_created: Boolean(entry.opportunityCreated),
    custom_fields_updated: Boolean(entry.customFieldsUpdated),
    used_existing_contact: Boolean(entry.usedExistingContact),
    retry_count: Number.isFinite(entry.retryCount) ? Number(entry.retryCount) : 0,
    last_retry_at: normalizeString(entry.lastRetryAt, 64) || null,
    last_retry_status: normalizeString(entry.lastRetryStatus, 32) || null,
    last_retry_message: normalizeString(entry.lastRetryMessage, 300) || null,
    retry_history: Array.isArray(entry.retryHistory) ? entry.retryHistory : [],
    payload_for_retry: entry.payloadForRetry || null,
  };
}

function mapRowToEntry(row = {}) {
  return {
    id: normalizeString(row.id, 120),
    kind: normalizeString(row.kind, 64),
    status: normalizeString(row.status, 32),
    createdAt: normalizeString(row.created_at, 64),
    updatedAt: normalizeString(row.updated_at, 64),
    requestId: normalizeString(row.request_id, 120),
    sourceRoute: normalizeString(row.source_route, 120),
    source: normalizeString(row.source, 120),
    customerName: normalizeString(row.customer_name, 250),
    customerPhone: normalizeString(row.customer_phone, 80),
    customerEmail: normalizeString(row.customer_email, 250),
    serviceType: normalizeString(row.service_type, 40),
    serviceName: normalizeString(row.service_name, 120),
    totalPrice: Number.isFinite(Number(row.total_price)) ? Number(row.total_price) : 0,
    totalPriceCents: Number.isFinite(Number(row.total_price_cents)) ? Number(row.total_price_cents) : 0,
    selectedDate: normalizeString(row.selected_date, 32),
    selectedTime: normalizeString(row.selected_time, 32),
    fullAddress: normalizeString(row.full_address, 500),
    httpStatus: Number.isFinite(Number(row.http_status)) ? Number(row.http_status) : 0,
    code: normalizeString(row.code, 80),
    retryable: Boolean(row.retryable),
    warnings: Array.isArray(row.warnings) ? row.warnings.map((item) => normalizeString(item, 120)).filter(Boolean) : [],
    errorMessage: normalizeString(row.error_message, 300),
    contactId: normalizeString(row.contact_id, 120),
    noteCreated: Boolean(row.note_created),
    opportunityCreated: Boolean(row.opportunity_created),
    customFieldsUpdated: Boolean(row.custom_fields_updated),
    usedExistingContact: Boolean(row.used_existing_contact),
    retryCount: Number.isFinite(Number(row.retry_count)) ? Number(row.retry_count) : 0,
    lastRetryAt: normalizeString(row.last_retry_at, 64),
    lastRetryStatus: normalizeString(row.last_retry_status, 32),
    lastRetryMessage: normalizeString(row.last_retry_message, 300),
    retryHistory: Array.isArray(row.retry_history) ? row.retry_history : [],
    payloadForRetry: row.payload_for_retry || null,
  };
}

function createSupabaseQuoteOpsClient(options = {}) {
  const config = options.config || loadSupabaseQuoteOpsConfig(options.env || process.env);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Supabase quote ops.");
  }

  if (!config.configured) {
    return {
      config,
      isConfigured() {
        return false;
      },
    };
  }

  async function request(pathname, requestOptions = {}) {
    const url = new URL(`/rest/v1/${config.tableName}${pathname || ""}`, `${config.url}/`);
    const response = await fetchImpl(url.toString(), {
      ...requestOptions,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(requestOptions.headers || {}),
      },
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        body && typeof body === "object" && body.message
          ? body.message
          : `Supabase quote ops request failed with status ${response.status}`;
      throw new Error(message);
    }
    return body;
  }

  return {
    config,
    isConfigured() {
      return true;
    },
    async upsertEntry(entry) {
      const row = mapEntryToRow(entry);
      await request("?on_conflict=id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
      });
      return row;
    },
    async fetchEntries(limit = 250) {
      const body = await request(`?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 1000))}`, {
        method: "GET",
      });
      return Array.isArray(body) ? body.map(mapRowToEntry) : [];
    },
    async fetchEntryById(entryId) {
      const id = normalizeString(entryId, 120);
      if (!id) return null;
      const body = await request(`?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
        method: "GET",
        headers: {
          Prefer: "count=exact",
        },
      });
      if (!Array.isArray(body) || body.length === 0) return null;
      return mapRowToEntry(body[0]);
    },
  };
}

module.exports = {
  createSupabaseQuoteOpsClient,
  loadSupabaseQuoteOpsConfig,
  mapEntryToRow,
  mapRowToEntry,
};
