"use strict";

const crypto = require("node:crypto");

const DEFAULT_STAFF_TABLE_NAME = "admin_staff";
const DEFAULT_ASSIGNMENTS_TABLE_NAME = "admin_staff_assignments";
const DEFAULT_QUOTE_OPS_TABLE_NAME = "quote_ops_entries";
const QUOTE_OPS_STAFF_KIND = "admin_staff_member";
const QUOTE_OPS_ASSIGNMENT_KIND = "admin_staff_assignment";
const STAFF_STATUS_VALUES = new Set(["active", "inactive", "on_leave"]);
const ASSIGNMENT_STATUS_VALUES = new Set(["planned", "confirmed", "completed", "issue"]);

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

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizeArray(values, maxItems = 8, maxLength = 120) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeString(item, maxLength);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }

  return output;
}

function getSafeStaffStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return STAFF_STATUS_VALUES.has(normalized) ? normalized : "active";
}

function getSafeAssignmentStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return ASSIGNMENT_STATUS_VALUES.has(normalized) ? normalized : "planned";
}

function loadSupabaseAdminStaffConfig(env = process.env) {
  const url = normalizeUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY, 2048);
  const staffTableName =
    normalizeString(env.SUPABASE_ADMIN_STAFF_TABLE || DEFAULT_STAFF_TABLE_NAME, 120) ||
    DEFAULT_STAFF_TABLE_NAME;
  const assignmentsTableName =
    normalizeString(
      env.SUPABASE_ADMIN_STAFF_ASSIGNMENTS_TABLE || DEFAULT_ASSIGNMENTS_TABLE_NAME,
      120
    ) || DEFAULT_ASSIGNMENTS_TABLE_NAME;
  const quoteOpsTableName =
    normalizeString(env.SUPABASE_QUOTE_OPS_TABLE || DEFAULT_QUOTE_OPS_TABLE_NAME, 120) ||
    DEFAULT_QUOTE_OPS_TABLE_NAME;

  return {
    configured: Boolean(url && serviceRoleKey),
    url,
    serviceRoleKey,
    staffTableName,
    assignmentsTableName,
    quoteOpsTableName,
  };
}

function getSerializablePayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapStaffRecordToRow(record = {}) {
  return {
    id: normalizeString(record.id, 120),
    name: normalizeString(record.name || record.fullName, 120),
    role: normalizeString(record.role, 80),
    phone: normalizeString(record.phone, 80),
    email: normalizeEmail(record.email),
    status: getSafeStaffStatus(record.status),
    notes: normalizeString(record.notes, 800),
    created_at: normalizeString(record.createdAt, 80),
    updated_at: normalizeString(record.updatedAt, 80),
  };
}

function mapRowToStaffRecord(row = {}) {
  return {
    id: normalizeString(row.id, 120),
    name: normalizeString(row.name || row.full_name, 120),
    role: normalizeString(row.role, 80),
    phone: normalizeString(row.phone, 80),
    email: normalizeEmail(row.email),
    status: getSafeStaffStatus(row.status),
    notes: normalizeString(row.notes, 800),
    createdAt: normalizeString(row.created_at, 80),
    updatedAt: normalizeString(row.updated_at, 80),
  };
}

function mapAssignmentRecordToRow(record = {}) {
  return {
    entry_id: normalizeString(record.entryId, 120),
    staff_ids: normalizeArray(record.staffIds, 6, 120),
    schedule_date: normalizeString(record.scheduleDate, 32),
    schedule_time: normalizeString(record.scheduleTime, 32),
    status: getSafeAssignmentStatus(record.status),
    notes: normalizeString(record.notes, 800),
    created_at: normalizeString(record.createdAt, 80),
    updated_at: normalizeString(record.updatedAt, 80),
  };
}

function mapRowToAssignmentRecord(row = {}) {
  return {
    entryId: normalizeString(row.entry_id || row.entryId, 120),
    staffIds: normalizeArray(row.staff_ids || row.staffIds, 6, 120),
    scheduleDate: normalizeString(row.schedule_date || row.scheduleDate, 32),
    scheduleTime: normalizeString(row.schedule_time || row.scheduleTime, 32),
    status: getSafeAssignmentStatus(row.status),
    notes: normalizeString(row.notes, 800),
    createdAt: normalizeString(row.created_at || row.createdAt, 80),
    updatedAt: normalizeString(row.updated_at || row.updatedAt, 80),
  };
}

function buildDeterministicUuid(value) {
  const hash = crypto.createHash("sha256").update(normalizeString(value, 500)).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20, 32)}`;
}

function buildQuoteOpsAssignmentRowId(entryId) {
  return buildDeterministicUuid(`admin-staff-assignment:${normalizeString(entryId, 120)}`);
}

function mapStaffRecordToQuoteOpsRow(record = {}) {
  const normalized = mapRowToStaffRecord(mapStaffRecordToRow(record));
  return {
    id: normalized.id,
    kind: QUOTE_OPS_STAFF_KIND,
    status: "success",
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
    request_id: normalized.id,
    source_route: "/admin/staff",
    source: "admin-staff",
    customer_name: normalized.name,
    customer_phone: normalized.phone,
    customer_email: normalized.email,
    service_name: normalized.role,
    code: normalized.status,
    retryable: false,
    warnings: [],
    error_message: normalized.notes,
    payload_for_retry: {
      type: QUOTE_OPS_STAFF_KIND,
      staff: normalized,
    },
  };
}

function mapQuoteOpsRowToStaffRecord(row = {}) {
  const payload = getSerializablePayload(row.payload_for_retry);
  const payloadStaff = getSerializablePayload(payload.staff);
  return {
    id: normalizeString(payloadStaff.id || row.id, 120),
    name: normalizeString(payloadStaff.name || row.customer_name, 120),
    role: normalizeString(payloadStaff.role || row.service_name, 80),
    phone: normalizeString(payloadStaff.phone || row.customer_phone, 80),
    email: normalizeEmail(payloadStaff.email || row.customer_email),
    status: getSafeStaffStatus(payloadStaff.status || row.code),
    notes: normalizeString(payloadStaff.notes || row.error_message, 800),
    createdAt: normalizeString(payloadStaff.createdAt || row.created_at, 80),
    updatedAt: normalizeString(payloadStaff.updatedAt || row.updated_at, 80),
  };
}

function mapAssignmentRecordToQuoteOpsRow(record = {}) {
  const normalized = mapRowToAssignmentRecord(mapAssignmentRecordToRow(record));
  return {
    id: buildQuoteOpsAssignmentRowId(normalized.entryId),
    kind: QUOTE_OPS_ASSIGNMENT_KIND,
    status: "success",
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
    request_id: normalized.entryId,
    source_route: "/admin/staff",
    source: "admin-staff",
    selected_date: normalized.scheduleDate,
    selected_time: normalized.scheduleTime,
    code: normalized.status,
    retryable: false,
    warnings: normalized.staffIds,
    error_message: normalized.notes,
    payload_for_retry: {
      type: QUOTE_OPS_ASSIGNMENT_KIND,
      assignment: normalized,
    },
  };
}

function mapQuoteOpsRowToAssignmentRecord(row = {}) {
  const payload = getSerializablePayload(row.payload_for_retry);
  const payloadAssignment = getSerializablePayload(payload.assignment);
  return {
    entryId: normalizeString(payloadAssignment.entryId || row.request_id, 120),
    staffIds: normalizeArray(payloadAssignment.staffIds || row.warnings, 6, 120),
    scheduleDate: normalizeString(payloadAssignment.scheduleDate || row.selected_date, 32),
    scheduleTime: normalizeString(payloadAssignment.scheduleTime || row.selected_time, 32),
    status: getSafeAssignmentStatus(payloadAssignment.status || row.code),
    notes: normalizeString(payloadAssignment.notes || row.error_message, 800),
    createdAt: normalizeString(payloadAssignment.createdAt || row.created_at, 80),
    updatedAt: normalizeString(payloadAssignment.updatedAt || row.updated_at, 80),
  };
}

function isMissingSupabaseTableError(error) {
  return Boolean(
    error &&
      (
        normalizeString(error.code, 32).toUpperCase() === "PGRST205" ||
        /could not find the table/i.test(normalizeString(error.message, 400))
      )
  );
}

function createSupabaseAdminStaffClient(options = {}) {
  const config = options.config || loadSupabaseAdminStaffConfig(options.env || process.env);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Supabase admin staff.");
  }

  if (!config.configured) {
    return {
      config,
      isConfigured() {
        return false;
      },
    };
  }

  async function request(tableName, pathname, requestOptions = {}) {
    const url = new URL(`/rest/v1/${tableName}${pathname || ""}`, `${config.url}/`);
    const normalizedKey = normalizeString(config.serviceRoleKey, 4096);
    const headers = {
      apikey: normalizedKey,
      "Content-Type": "application/json",
      ...(requestOptions.headers || {}),
    };

    if (!isOpaqueSupabaseApiKey(normalizedKey)) {
      headers.Authorization = `Bearer ${normalizedKey}`;
    }

    const response = await fetchImpl(url.toString(), {
      ...requestOptions,
      headers,
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        body && typeof body === "object" && body.message
          ? body.message
          : `Supabase admin staff request failed with status ${response.status}`;
      const error = new Error(message);
      error.code =
        body && typeof body === "object" ? normalizeString(body.code, 32).toUpperCase() : "";
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function requestQuoteOps(pathname, requestOptions = {}) {
    return request(config.quoteOpsTableName, pathname, requestOptions);
  }

  async function fetchQuoteOpsSnapshot() {
    const [staffRows, assignmentRows] = await Promise.all([
      requestQuoteOps(
        `?select=*&kind=eq.${encodeURIComponent(QUOTE_OPS_STAFF_KIND)}&order=customer_name.asc`,
        { method: "GET" }
      ),
      requestQuoteOps(
        `?select=*&kind=eq.${encodeURIComponent(QUOTE_OPS_ASSIGNMENT_KIND)}&order=updated_at.desc`,
        { method: "GET" }
      ),
    ]);

    return {
      staff: Array.isArray(staffRows) ? staffRows.map(mapQuoteOpsRowToStaffRecord) : [],
      assignments: Array.isArray(assignmentRows)
        ? assignmentRows.map(mapQuoteOpsRowToAssignmentRecord)
        : [],
    };
  }

  async function withQuoteOpsFallback(primaryOperation, fallbackOperation) {
    try {
      return await primaryOperation();
    } catch (error) {
      if (!isMissingSupabaseTableError(error)) {
        throw error;
      }
      return fallbackOperation();
    }
  }

  return {
    config,
    isConfigured() {
      return true;
    },
    async fetchSnapshot() {
      return withQuoteOpsFallback(async () => {
        const [staffRows, assignmentRows] = await Promise.all([
          request(config.staffTableName, "?select=*&order=name.asc", { method: "GET" }),
          request(config.assignmentsTableName, "?select=*&order=updated_at.desc", {
            method: "GET",
          }),
        ]);

        return {
          staff: Array.isArray(staffRows) ? staffRows.map(mapRowToStaffRecord) : [],
          assignments: Array.isArray(assignmentRows)
            ? assignmentRows.map(mapRowToAssignmentRecord)
            : [],
        };
      }, fetchQuoteOpsSnapshot);
    },
    async upsertStaff(record) {
      return withQuoteOpsFallback(async () => {
        const row = mapStaffRecordToRow(record);
        await request(config.staffTableName, "?on_conflict=id", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        });
        return row;
      }, async () => {
        const row = mapStaffRecordToQuoteOpsRow(record);
        await requestQuoteOps("?on_conflict=id", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        });
        return row;
      });
    },
    async deleteStaff(staffId) {
      const id = normalizeString(staffId, 120);
      if (!id) return false;
      await withQuoteOpsFallback(async () => {
        await request(config.staffTableName, `?id=eq.${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: {
            Prefer: "return=minimal",
          },
        });
      }, async () => {
        await requestQuoteOps(`?id=eq.${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: {
            Prefer: "return=minimal",
          },
        });
      });
      return true;
    },
    async upsertAssignment(record) {
      return withQuoteOpsFallback(async () => {
        const row = mapAssignmentRecordToRow(record);
        await request(config.assignmentsTableName, "?on_conflict=entry_id", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        });
        return row;
      }, async () => {
        const row = mapAssignmentRecordToQuoteOpsRow(record);
        await requestQuoteOps("?on_conflict=id", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        });
        return row;
      });
    },
    async deleteAssignment(entryId) {
      const id = normalizeString(entryId, 120);
      if (!id) return false;
      await withQuoteOpsFallback(async () => {
        await request(config.assignmentsTableName, `?entry_id=eq.${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: {
            Prefer: "return=minimal",
          },
        });
      }, async () => {
        await requestQuoteOps(
          `?id=eq.${encodeURIComponent(buildQuoteOpsAssignmentRowId(id))}`,
          {
            method: "DELETE",
            headers: {
              Prefer: "return=minimal",
            },
          }
        );
      });
      return true;
    },
  };
}

module.exports = {
  QUOTE_OPS_ASSIGNMENT_KIND,
  QUOTE_OPS_STAFF_KIND,
  buildQuoteOpsAssignmentRowId,
  createSupabaseAdminStaffClient,
  isOpaqueSupabaseApiKey,
  isMissingSupabaseTableError,
  loadSupabaseAdminStaffConfig,
  mapAssignmentRecordToQuoteOpsRow,
  mapQuoteOpsRowToAssignmentRecord,
  mapQuoteOpsRowToStaffRecord,
  mapAssignmentRecordToRow,
  mapRowToAssignmentRecord,
  mapRowToStaffRecord,
  mapStaffRecordToRow,
  mapStaffRecordToQuoteOpsRow,
};
