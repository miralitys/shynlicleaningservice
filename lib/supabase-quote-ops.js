"use strict";
const { memoAdminJsonRead, measureAdminRead, getAdminLedgerReadLimit, invalidateAdminReads } = require("./admin/read-context");

const { normalizeEnglishAddressLabel } = require("./address-format");
const { hasEntryOrderState } = require("./admin-order-state");
const { matchesRecurringIdentity } = require("./quote-ops/recurring-identity");
const { ORDER_LIST_SELECT, hydrateOrderListRow, projectOrderListEntry } = require("./quote-ops/order-list");
const { getAuditMetadata } = require("./admin-audit");
const { ACCOUNT_LIST_VIEW, ACCOUNT_LIST_SELECT, projectAccountListEntry } = require("./account/order-list");
const { ACCOUNT_CALENDAR_VIEW, ACCOUNT_CALENDAR_RPC, ACCOUNT_CALENDAR_SELECT, projectAccountCalendarEntry } = require("./account/calendar-list");

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

function isOpaqueSupabaseApiKey(value) {
  return /^sb_(publishable|secret)_[A-Za-z0-9_-]+$/.test(normalizeString(value, 4096));
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
    full_address: normalizeEnglishAddressLabel(entry.fullAddress, 500),
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
    fullAddress: normalizeEnglishAddressLabel(row.full_address, 500),
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

  let accountListViewAvailable = config.tableName === DEFAULT_TABLE_NAME;
  let accountCalendarViewAvailable = config.tableName === DEFAULT_TABLE_NAME;
  let accountCalendarBatchAvailable = config.tableName === DEFAULT_TABLE_NAME;
  const adminReadOwner = {};

  async function request(pathname, requestOptions = {}, resource = config.tableName, metadata = null, rawJson = false) {
    if (!["GET", "HEAD"].includes(requestOptions.method || "GET")) invalidateAdminReads();
    const url = new URL(`/rest/v1/${resource}${pathname || ""}`, `${config.url}/`);
    const normalizedKey = normalizeString(config.serviceRoleKey, 4096);
    const headers = {
      apikey: normalizedKey,
      "Content-Type": "application/json",
      ...(requestOptions.headers || {}),
    };

    // New Supabase secret/publishable keys are opaque API gateway keys, not JWTs,
    // so they should not be forwarded in Authorization. Legacy service_role JWTs
    // still work as Bearer tokens.
    if (!isOpaqueSupabaseApiKey(normalizedKey)) {
      headers.Authorization = `Bearer ${normalizedKey}`;
    }

    const response = await fetchImpl(url.toString(), {
      ...requestOptions,
      headers,
    });

    const text = await response.text();
    const body = rawJson && response.ok ? null : text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        body && typeof body === "object" && body.message
          ? body.message
          : `Supabase quote ops request failed with status ${response.status}`;
      const error = new Error(message);
      if (body && typeof body === "object") error.code = normalizeString(body.code, 80);
      throw error;
    }
    if (metadata) {
      const range = response.headers?.get?.("content-range") || "";
      const match = range.match(/\/(\d+)$/);
      metadata.total = match ? Number(match[1]) : null;
    }
    return rawJson ? text : body;
  }

  async function storageWrite(resource, body) {
    if (config.tableName !== DEFAULT_TABLE_NAME) throw new Error("Durable writes require the default quote ledger table");
    return request("", { method: "POST", body: JSON.stringify(body) }, resource);
  }

  async function readAccountEntriesByIds(entryIds, select, readRows, project) {
    const ids = Array.from(new Set(entryIds.map(id => normalizeString(id, 120)).filter(Boolean)));
    const entries = [];
    async function readChunk(chunk) {
      const result = [];
      const allowed = new Set(chunk);
      let cursor = "";
      for (;;) {
        const query = new URLSearchParams({ select, id: `in.(${chunk.join(",")})`, order: "id.asc", limit: "75" });
        if (cursor) query.set("and", `(id.gt.${cursor})`);
        const metadata = {};
        const rows = await readRows(query, metadata);
        if (!Array.isArray(rows)) throw new Error("Invalid account order list response");
        for (const row of rows) {
          if (!allowed.has(row.id) || row.id <= cursor) throw new Error("Invalid account order list cursor");
          cursor = row.id;
          result.push(project(mapRowToEntry(hydrateOrderListRow(row))));
        }
        if (metadata.total !== null && rows.length > metadata.total) throw new Error("Invalid account order list count");
        if (metadata.total !== null && rows.length === metadata.total) break;
        if (!rows.length) {
          if (metadata.total !== null) throw new Error("Incomplete account order list");
          break;
        }
      }
      return result;
    }
    // Retain the existing cursor/count checks, unlimited history and four-read bound.
    for (let index = 0; index < ids.length; index += 300) {
      const chunks = [];
      for (let offset = index; offset < Math.min(index + 300, ids.length); offset += 75) chunks.push(ids.slice(offset, offset + 75));
      entries.push(...(await Promise.all(chunks.map(readChunk))).flat());
    }
    return entries;
  }

  async function fetchAccountEntriesByIds(entryIds = []) {
    return readAccountEntriesByIds(entryIds, ACCOUNT_LIST_SELECT, async (query, metadata) => {
      const resource = accountListViewAvailable ? ACCOUNT_LIST_VIEW : config.tableName;
      const read = table => request(`?${query}`, { method: "GET", headers: { Prefer: "count=exact" } }, table, metadata);
      try {
        return await read(resource);
      } catch (error) {
        if (resource !== ACCOUNT_LIST_VIEW || !["PGRST205", "42P01"].includes(error.code)) throw error;
        accountListViewAvailable = false;
        return read(config.tableName);
      }
    }, projectAccountListEntry);
  }

  return {
    config,
    isConfigured() {
      return true;
    },
    async upsertEntry(entry) {
      const row = mapEntryToRow(entry);
      const saved = await storageWrite("rpc/save_quote_ops_entry", {
        p_entry: row, p_mode: "insert", p_expected_updated_at: null, p_audit_context: getAuditMetadata() });
      if (!saved || saved.id !== row.id) throw new Error("Entry was not confirmed by the database");
      return saved;
    },
    async insertRecurringEntry(entry, sourceGuard) {
      if (config.tableName !== DEFAULT_TABLE_NAME) throw new Error("Guarded recurring inserts require the default quote ledger table.");
      const body = await request("", {
        method: "POST",
        body: JSON.stringify({ p_entry: mapEntryToRow(entry), p_source_guard: sourceGuard }),
      }, "rpc/insert_recurring_quote_order");
      if (!body || typeof body.inserted !== "boolean" || (!body.entry && body.skipped !== true)) {
        throw new Error("Invalid recurring insert response");
      }
      return { entry: body.entry ? mapRowToEntry(body.entry) : null, inserted: body.inserted };
    },
    async fetchEntryByRequestId(requestId, identity = null) {
      const normalizedRequestId = normalizeString(requestId, 120);
      if (!normalizedRequestId) return null;
      const entries = [];
      for (let offset = 0; ; offset += 500) {
        const body = await request(`?select=*&request_id=eq.${encodeURIComponent(normalizedRequestId)}&order=id.asc&limit=500&offset=${offset}`, {
          method: "GET",
        });
        if (!Array.isArray(body)) throw new Error("Invalid occurrence lookup response");
        entries.push(...body.map(mapRowToEntry).filter(entry => matchesRecurringIdentity(entry, identity)));
        if (body.length < 500) break;
      }
      if (identity && entries.filter(hasEntryOrderState).length > 1) {
        throw new Error("Multiple existing orders match this recurring occurrence.");
      }
      return entries.sort((left, right) =>
        Number(hasEntryOrderState(right)) - Number(hasEntryOrderState(left)) ||
        String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)) ||
        right.id.localeCompare(left.id)
      )[0] || null;
    },
    async updateEntryIfUnchanged(entry, expectedUpdatedAt) {
      const body = await storageWrite("rpc/save_quote_ops_entry", { p_entry: mapEntryToRow(entry), p_mode: "update",
        p_expected_updated_at: expectedUpdatedAt, p_audit_context: getAuditMetadata() });
      return Boolean(body && body.id === entry.id);
    },
    async fetchEntries(limit = 250) {
      const requestedLimit = Math.max(1, Math.min(limit, 1000));
      const readLimit = getAdminLedgerReadLimit(requestedLimit);
      const body = await memoAdminJsonRead(adminReadOwner, "ledger", String(readLimit),
        () => request(`?select=*&order=created_at.desc&limit=${readLimit}`, { method: "GET" }, config.tableName, null, true),
        rows => Array.isArray(rows) ? rows.slice(0, requestedLimit) : []);
      return Array.isArray(body) ? body.map(mapRowToEntry) : [];
    },
    async fetchOrderListEntries(options = {}) {
      return measureAdminRead("ledger", async () => {
        const entries = [];
        let cursor = "";
        for (;;) {
          const query = new URLSearchParams({ select: ORDER_LIST_SELECT, order: "id.asc", limit: "500" });
          if (cursor) query.set("id", `gt.${cursor}`);
          const metadata = {};
          const body = await request(`?${query}`, { method: "GET", headers: { Prefer: "count=exact" } }, config.tableName, metadata);
          if (!Array.isArray(body)) throw new Error("Invalid order list response");
          let nextCursor = cursor;
          for (const row of body) {
            const id = normalizeString(row && row.id, 120);
            if (!id || id <= nextCursor) throw new Error("Invalid order list cursor");
            nextCursor = id;
          }
          if (metadata.total !== null && body.length > metadata.total) throw new Error("Invalid order list count");
          entries.push(...body.map(row => projectOrderListEntry(mapRowToEntry(hydrateOrderListRow(row)), options)));
          // Count belongs to THIS cursor-filtered query, not the first-page total:
          // inserts between pages must not push a pre-existing tail out of the list.
          if (metadata.total !== null && body.length === metadata.total) break;
          if (body.length === 0) {
            if (metadata.total !== null) throw new Error("Incomplete order list response");
            break;
          }
          cursor = nextCursor;
        }
        return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      });
    },
    async fetchAllEntries() {
      return measureAdminRead("ledger", async () => {
        const entries = [];
        for (let offset = 0; ; offset += 500) {
          const body = await request(`?select=*&order=id.asc&limit=500&offset=${offset}`, { method: "GET" });
          if (!Array.isArray(body)) throw new Error("Invalid complete ledger response");
          entries.push(...body.map(mapRowToEntry));
          if (body.length < 500) return entries;
        }
      });
    },
    async fetchAccountEntriesByIds(entryIds = []) {
      return fetchAccountEntriesByIds(entryIds);
    },
    async fetchAccountCalendarEntriesByIds(entryIds = []) {
      const ids = Array.from(new Set(entryIds.map(id => normalizeString(id, 120)).filter(Boolean)));
      if (!ids.length) return [];
      if (accountCalendarBatchAvailable) {
        let batch;
        let missingBatch = false;
        try {
          // POST invokes a STABLE SELECT-only function, never a ledger mutation.
          batch = await request("", { method: "POST", body: JSON.stringify({ p_entry_ids: ids }) }, `rpc/${ACCOUNT_CALENDAR_RPC}`);
        } catch (error) {
          if (error.code !== "PGRST202" && !(error.code === "42883" && error.message.includes(ACCOUNT_CALENDAR_RPC))) throw error;
          accountCalendarBatchAvailable = false;
          missingBatch = true;
        }
        if (!missingBatch) {
          if (!batch || batch.version !== 1 || batch.requested_count !== ids.length ||
              !Array.isArray(batch.rows) || batch.matched_count !== batch.rows.length || !Array.isArray(batch.missing_ids)) {
            throw new Error("Invalid calendar batch response");
          }
          const pending = new Set(ids);
          const rows = new Map();
          for (const row of batch.rows) {
            if (!row || !pending.delete(row.id) || !Object.hasOwn(row, "selected_date") ||
                (row.selected_date !== null && typeof row.selected_date !== "string") ||
                !row.payload_for_retry || typeof row.payload_for_retry !== "object" || Array.isArray(row.payload_for_retry) ||
                !["orderState", "adminOrder", "calculatorData"].every(key => Object.hasOwn(row.payload_for_retry, key))) {
              throw new Error("Invalid calendar batch row");
            }
            rows.set(row.id, row);
          }
          for (const id of batch.missing_ids) if (!pending.delete(id)) throw new Error("Invalid calendar batch missing ID");
          if (pending.size) throw new Error("Incomplete calendar batch response");
          // Preserve the established per-75-ID ordering, without making 75-ID requests.
          const entries = [];
          for (let i = 0; i < ids.length; i += 75) for (const id of ids.slice(i, i + 75).sort()) {
            if (rows.has(id)) entries.push(projectAccountCalendarEntry(mapRowToEntry(rows.get(id))));
          }
          return entries;
        }
      }
      if (accountCalendarViewAvailable) {
        try {
          return await readAccountEntriesByIds(entryIds, ACCOUNT_CALENDAR_SELECT,
            (query, metadata) => request(`?${query}`, { method: "GET", headers: { Prefer: "count=exact" } }, ACCOUNT_CALENDAR_VIEW, metadata),
            projectAccountCalendarEntry);
        } catch (error) {
          // A pending migration may use the complete established read. Never
          // turn outages, permission errors or incomplete pages into empty grids.
          if (!["PGRST205", "42P01"].includes(error.code)) throw error;
          accountCalendarViewAvailable = false;
        }
      }
      return (await fetchAccountEntriesByIds(entryIds)).map(projectAccountCalendarEntry);
    },
    async fetchEntriesByIds(entryIds = []) {
      const ids = Array.from(new Set(
        (Array.isArray(entryIds) ? entryIds : [])
          .map((entryId) => normalizeString(entryId, 120))
          .filter(Boolean)
      )).slice(0, 1000);
      if (!ids.length) return [];

      const chunks = [];
      for (let index = 0; index < ids.length; index += 75) {
        chunks.push(ids.slice(index, index + 75));
      }
      const responses = await Promise.all(
        chunks.map((chunk) => {
          const idFilter = chunk.map((entryId) => encodeURIComponent(entryId)).join(",");
          return request(`?select=*&id=in.(${idFilter})&order=created_at.desc`, {
            method: "GET",
          });
        })
      );
      return responses
        .flatMap((body) => (Array.isArray(body) ? body : []))
        .map(mapRowToEntry);
    },
    async fetchTaskAutomationEntries(today, client = null) {
      const entries = [];
      const contextFilter = `payload_for_retry->adminLead->tasks.not.is.null,selected_date.gte.${today}`;
      const identities = client ? [
        ...(client.ids || []).flatMap((id) => [
          `contact_id.eq.${JSON.stringify(String(id))}`,
          `payload_for_retry->adminClient->>id.eq.${JSON.stringify(String(id))}`,
        ]),
        ...(client.phones || []).flatMap((phone) => {
          const digits = String(phone).replace(/\D/g, "");
          if (digits.length < 7) return [];
          const pattern = `*${digits.split("").join("*")}*`;
          return [`customer_phone.ilike.${pattern}`, `payload_for_retry->adminClient->>secondaryPhone.ilike.${pattern}`];
        }),
      ] : [];
      if (client && !identities.length) return [];
      const filter = client
        ? `and=${encodeURIComponent(`(or.(${contextFilter}),or.(${identities.join(",")}))`)}`
        : `or=${encodeURIComponent(`(${contextFilter})`)}`;
      for (let offset = 0; ; offset += 500) {
        const query = ["select=*", "order=id.asc", "limit=500", `offset=${offset}`,
          filter].join("&");
        const body = await request(`?${query}`, { method: "GET" });
        if (!Array.isArray(body)) throw new Error("Invalid task context response");
        entries.push(...body.map(mapRowToEntry));
        if (body.length < 500) return entries;
      }
    },
    async updateTaskPayload(entry, expectedUpdatedAt) {
      const body = await request(`?id=eq.${encodeURIComponent(entry.id)}&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payload_for_retry: entry.payloadForRetry, updated_at: entry.updatedAt }),
      });
      return Array.isArray(body) && body.length === 1;
    },
    async fetchEntriesBySelectedDateRange(startDate, endDate, limit = 1000) {
      const start = normalizeString(startDate, 32);
      const end = normalizeString(endDate, 32);
      if (!start || !end) return [];
      const query = [
        "select=*",
        `selected_date=gte.${encodeURIComponent(start)}`,
        `selected_date=lte.${encodeURIComponent(end)}`,
        "order=selected_date.asc,selected_time.asc",
        `limit=${Math.max(1, Math.min(limit, 1000))}`,
      ].join("&");
      const body = await request(`?${query}`, { method: "GET" });
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
    async deleteEntry(entryId, options = {}) {
      const id = normalizeString(entryId, 120);
      if (!id) return false;
      const result = await storageWrite("rpc/archive_quote_ops_entry", { p_entry_id: id,
        p_expected_updated_at: options.expectedUpdatedAt || null, p_require_no_order: options.requireNoOrder === true,
        p_audit_context: getAuditMetadata() });
      return result === true;
    },
    async fetchTrash() {
      const entries = [];
      for (let offset = 0; ; offset += 100) {
        const rows = await request(`?select=*&restored_at=is.null&order=deleted_at.desc,id.desc&limit=100&offset=${offset}`, { method: "GET" }, "quote_ops_trash");
        if (!Array.isArray(rows)) throw new Error("Invalid trash response");
        entries.push(...rows);
        if (rows.length < 100) return entries;
      }
    },
    async restoreTrash(trashId) {
      const result = await storageWrite("rpc/restore_quote_ops_entry", { p_trash_id: trashId,
        p_audit_context: getAuditMetadata() });
      return result ? mapRowToEntry(result) : null;
    },
  };
}

module.exports = {
  createSupabaseQuoteOpsClient,
  isOpaqueSupabaseApiKey,
  loadSupabaseQuoteOpsConfig,
  mapEntryToRow,
  mapRowToEntry,
};
