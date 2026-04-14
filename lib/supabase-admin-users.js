"use strict";

const DEFAULT_USERS_TABLE_NAME = "admin_users";
const DEFAULT_QUOTE_OPS_TABLE_NAME = "quote_ops_entries";
const QUOTE_OPS_USER_KIND = "admin_user_account";
const USER_STATUS_VALUES = new Set(["active", "inactive"]);
const USER_ROLE_VALUES = new Set(["admin", "manager", "cleaner"]);

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

function isMissingSupabaseTableError(error) {
  return Boolean(
    error &&
      (
        normalizeString(error.code, 32).toUpperCase() === "PGRST205" ||
        /could not find the table/i.test(normalizeString(error.message, 400))
      )
  );
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizePhone(value) {
  return normalizeString(value, 80);
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = normalizeString(value, 20).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getSafeUserStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return USER_STATUS_VALUES.has(normalized) ? normalized : "active";
}

function getSafeUserRole(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return USER_ROLE_VALUES.has(normalized) ? normalized : "cleaner";
}

function getDefaultEmployeeFlag(role) {
  return getSafeUserRole(role) !== "admin";
}

function loadSupabaseAdminUsersConfig(env = process.env) {
  const url = normalizeUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY, 2048);
  const usersTableName =
    normalizeString(env.SUPABASE_ADMIN_USERS_TABLE || DEFAULT_USERS_TABLE_NAME, 120) ||
    DEFAULT_USERS_TABLE_NAME;
  const quoteOpsTableName =
    normalizeString(env.SUPABASE_QUOTE_OPS_TABLE || DEFAULT_QUOTE_OPS_TABLE_NAME, 120) ||
    DEFAULT_QUOTE_OPS_TABLE_NAME;

  return {
    configured: Boolean(url && serviceRoleKey),
    url,
    serviceRoleKey,
    usersTableName,
    quoteOpsTableName,
  };
}

function getSerializablePayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapUserRecordToRow(record = {}) {
  const role = getSafeUserRole(record.role);
  return {
    id: normalizeString(record.id, 120),
    staff_id: normalizeString(record.staffId, 120),
    email: normalizeEmail(record.email),
    phone: normalizePhone(record.phone),
    password_hash: normalizeString(record.passwordHash, 4096),
    status: getSafeUserStatus(record.status),
    role,
    is_employee:
      Object.prototype.hasOwnProperty.call(record, "isEmployee")
        ? normalizeBoolean(record.isEmployee)
        : getDefaultEmployeeFlag(role),
    created_at: normalizeString(record.createdAt, 80),
    updated_at: normalizeString(record.updatedAt, 80),
    last_login_at: normalizeString(record.lastLoginAt, 80),
    email_verification_required: normalizeBoolean(record.emailVerificationRequired),
    email_verified_at: normalizeString(record.emailVerifiedAt, 80),
    invite_email_sent_at: normalizeString(record.inviteEmailSentAt, 80),
    invite_email_last_error: normalizeString(record.inviteEmailLastError, 240),
  };
}

function mapRowToUserRecord(row = {}) {
  const role = getSafeUserRole(row.role);
  return {
    id: normalizeString(row.id, 120),
    staffId: normalizeString(row.staff_id || row.staffId, 120),
    email: normalizeEmail(row.email),
    phone: normalizePhone(row.phone),
    passwordHash: normalizeString(row.password_hash || row.passwordHash, 4096),
    status: getSafeUserStatus(row.status),
    role,
    isEmployee:
      row.is_employee ?? row.isEmployee ?? getDefaultEmployeeFlag(role),
    createdAt: normalizeString(row.created_at || row.createdAt, 80),
    updatedAt: normalizeString(row.updated_at || row.updatedAt, 80),
    lastLoginAt: normalizeString(row.last_login_at || row.lastLoginAt, 80),
    emailVerificationRequired: normalizeBoolean(
      row.email_verification_required ?? row.emailVerificationRequired
    ),
    emailVerifiedAt: normalizeString(row.email_verified_at || row.emailVerifiedAt, 80),
    inviteEmailSentAt: normalizeString(row.invite_email_sent_at || row.inviteEmailSentAt, 80),
    inviteEmailLastError: normalizeString(
      row.invite_email_last_error || row.inviteEmailLastError,
      240
    ),
  };
}

function mapUserRecordToQuoteOpsRow(record = {}) {
  const normalized = mapRowToUserRecord(mapUserRecordToRow(record));
  return {
    id: normalized.id,
    kind: QUOTE_OPS_USER_KIND,
    status: "success",
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
    request_id: normalized.id,
    source_route: "/admin/settings",
    source: "admin-users",
    customer_name: normalized.email,
    customer_phone: normalized.phone,
    customer_email: normalized.email,
    contact_id: normalized.staffId,
    service_name: normalized.role,
    code: normalized.status,
    retryable: false,
    warnings: normalized.emailVerificationRequired ? ["email_verification_required"] : [],
    error_message: normalized.inviteEmailLastError,
    payload_for_retry: {
      type: QUOTE_OPS_USER_KIND,
      user: normalized,
    },
  };
}

function mapQuoteOpsRowToUserRecord(row = {}) {
  const payload = getSerializablePayload(row.payload_for_retry);
  const payloadUser = getSerializablePayload(payload.user);
  const role = getSafeUserRole(payloadUser.role || row.service_name);
  return {
    id: normalizeString(payloadUser.id || row.id, 120),
    staffId: normalizeString(payloadUser.staffId || row.contact_id, 120),
    email: normalizeEmail(payloadUser.email || row.customer_email || row.customer_name),
    phone: normalizePhone(payloadUser.phone || row.customer_phone),
    passwordHash: normalizeString(payloadUser.passwordHash, 4096),
    status: getSafeUserStatus(payloadUser.status || row.code),
    role,
    isEmployee:
      payloadUser.isEmployee ?? row.is_employee ?? getDefaultEmployeeFlag(role),
    createdAt: normalizeString(payloadUser.createdAt || row.created_at, 80),
    updatedAt: normalizeString(payloadUser.updatedAt || row.updated_at, 80),
    lastLoginAt: normalizeString(payloadUser.lastLoginAt, 80),
    emailVerificationRequired: normalizeBoolean(
      payloadUser.emailVerificationRequired || (Array.isArray(row.warnings) && row.warnings.includes("email_verification_required"))
    ),
    emailVerifiedAt: normalizeString(payloadUser.emailVerifiedAt, 80),
    inviteEmailSentAt: normalizeString(payloadUser.inviteEmailSentAt, 80),
    inviteEmailLastError: normalizeString(
      payloadUser.inviteEmailLastError || row.error_message,
      240
    ),
  };
}

function createSupabaseAdminUsersClient(options = {}) {
  const config = options.config || loadSupabaseAdminUsersConfig(options.env || process.env);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Supabase admin users.");
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
          : `Supabase admin users request failed with status ${response.status}`;
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
    const rows = await requestQuoteOps(
      `?select=*&kind=eq.${encodeURIComponent(QUOTE_OPS_USER_KIND)}&order=updated_at.desc`,
      { method: "GET" }
    );

    return {
      users: Array.isArray(rows) ? rows.map(mapQuoteOpsRowToUserRecord) : [],
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
        const rows = await request(config.usersTableName, "?select=*&order=updated_at.desc", {
          method: "GET",
        });

        return {
          users: Array.isArray(rows) ? rows.map(mapRowToUserRecord) : [],
        };
      }, fetchQuoteOpsSnapshot);
    },
    async upsertUser(record) {
      return withQuoteOpsFallback(async () => {
        const row = mapUserRecordToRow(record);
        await request(config.usersTableName, "?on_conflict=id", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        });
        return row;
      }, async () => {
        const row = mapUserRecordToQuoteOpsRow(record);
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
    async deleteUser(userId) {
      const id = normalizeString(userId, 120);
      if (!id) return false;
      await withQuoteOpsFallback(async () => {
        await request(config.usersTableName, `?id=eq.${encodeURIComponent(id)}`, {
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
  };
}

module.exports = {
  QUOTE_OPS_USER_KIND,
  createSupabaseAdminUsersClient,
  isMissingSupabaseTableError,
  isOpaqueSupabaseApiKey,
  loadSupabaseAdminUsersConfig,
  mapQuoteOpsRowToUserRecord,
  mapRowToUserRecord,
  mapUserRecordToQuoteOpsRow,
  mapUserRecordToRow,
};
