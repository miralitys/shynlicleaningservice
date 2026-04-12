"use strict";

const DEFAULT_MAIL_TABLE_NAME = "admin_mail_integrations";
const DEFAULT_QUOTE_OPS_TABLE_NAME = "quote_ops_entries";
const DEFAULT_INTEGRATION_ID = "invite-email";
const QUOTE_OPS_MAIL_KIND = "admin_mail_integration";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOpaqueSupabaseApiKey(value) {
  return /^sb_(publishable|secret)_[A-Za-z0-9_-]+$/.test(normalizeString(value, 4096));
}

function isMissingSupabaseTableError(error) {
  return Boolean(
    error &&
      (normalizeString(error.code, 32).toUpperCase() === "PGRST205" ||
        /could not find the table/i.test(normalizeString(error.message, 400)))
  );
}

function sanitizeEncryptedTokenPayload(payload) {
  const version = Number(payload && payload.version);
  const salt = normalizeString(payload && payload.salt, 128);
  const iv = normalizeString(payload && payload.iv, 128);
  const tag = normalizeString(payload && payload.tag, 128);
  const data = normalizeString(payload && payload.data, 12000);
  if (version !== 1 || !salt || !iv || !tag || !data) return null;
  return { version: 1, salt, iv, tag, data };
}

function mapConnectionToRow(record = {}) {
  return {
    id: normalizeString(record.id, 120) || DEFAULT_INTEGRATION_ID,
    provider: normalizeString(record.provider, 32).toLowerCase(),
    status: normalizeString(record.status, 32).toLowerCase() || "connected",
    account_email: normalizeEmail(record.accountEmail),
    scope: normalizeString(record.scope, 500),
    token_cipher: sanitizeEncryptedTokenPayload(record.tokenCipher),
    token_expires_at: normalizeString(record.tokenExpiresAt, 80),
    connected_at: normalizeString(record.connectedAt, 80),
    updated_at: normalizeString(record.updatedAt, 80),
    last_error: normalizeString(record.lastError, 400),
  };
}

function mapRowToConnection(row = {}) {
  return {
    id: normalizeString(row.id, 120) || DEFAULT_INTEGRATION_ID,
    provider: normalizeString(row.provider, 32).toLowerCase(),
    status: normalizeString(row.status, 32).toLowerCase() || "connected",
    accountEmail: normalizeEmail(row.account_email || row.accountEmail),
    scope: normalizeString(row.scope, 500),
    tokenCipher: sanitizeEncryptedTokenPayload(row.token_cipher || row.tokenCipher),
    tokenExpiresAt: normalizeString(row.token_expires_at || row.tokenExpiresAt, 80),
    connectedAt: normalizeString(row.connected_at || row.connectedAt, 80),
    updatedAt: normalizeString(row.updated_at || row.updatedAt, 80),
    lastError: normalizeString(row.last_error || row.lastError, 400),
  };
}

function mapConnectionToQuoteOpsRow(record = {}) {
  const normalized = mapRowToConnection(mapConnectionToRow(record));
  return {
    id: normalized.id,
    kind: QUOTE_OPS_MAIL_KIND,
    status: "success",
    created_at: normalized.connectedAt || normalized.updatedAt || new Date().toISOString(),
    updated_at: normalized.updatedAt || normalized.connectedAt || new Date().toISOString(),
    request_id: normalized.id,
    source_route: "/admin/settings",
    source: "admin-mail",
    customer_name: normalized.accountEmail,
    customer_email: normalized.accountEmail,
    service_name: normalized.provider,
    code: normalized.status,
    retryable: false,
    warnings: [],
    error_message: normalized.lastError,
    payload_for_retry: {
      type: QUOTE_OPS_MAIL_KIND,
      connection: normalized,
    },
  };
}

function mapQuoteOpsRowToConnection(row = {}) {
  const payload = isObject(row.payload_for_retry) ? row.payload_for_retry : {};
  const payloadConnection = isObject(payload.connection) ? payload.connection : {};
  return {
    id: normalizeString(payloadConnection.id || row.id, 120) || DEFAULT_INTEGRATION_ID,
    provider: normalizeString(payloadConnection.provider || row.service_name, 32).toLowerCase(),
    status: normalizeString(payloadConnection.status || row.code, 32).toLowerCase() || "connected",
    accountEmail: normalizeEmail(payloadConnection.accountEmail || row.customer_email || row.customer_name),
    scope: normalizeString(payloadConnection.scope, 500),
    tokenCipher: sanitizeEncryptedTokenPayload(payloadConnection.tokenCipher),
    tokenExpiresAt: normalizeString(payloadConnection.tokenExpiresAt, 80),
    connectedAt: normalizeString(payloadConnection.connectedAt || row.created_at, 80),
    updatedAt: normalizeString(payloadConnection.updatedAt || row.updated_at, 80),
    lastError: normalizeString(payloadConnection.lastError || row.error_message, 400),
  };
}

function loadSupabaseAdminMailConfig(env = process.env) {
  const url = normalizeUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY, 2048);
  const mailTableName =
    normalizeString(env.SUPABASE_ADMIN_MAIL_TABLE || DEFAULT_MAIL_TABLE_NAME, 120) ||
    DEFAULT_MAIL_TABLE_NAME;
  const quoteOpsTableName =
    normalizeString(env.SUPABASE_QUOTE_OPS_TABLE || DEFAULT_QUOTE_OPS_TABLE_NAME, 120) ||
    DEFAULT_QUOTE_OPS_TABLE_NAME;

  return {
    configured: Boolean(url && serviceRoleKey),
    url,
    serviceRoleKey,
    mailTableName,
    quoteOpsTableName,
  };
}

function createSupabaseAdminMailClient(options = {}) {
  const config = options.config || loadSupabaseAdminMailConfig(options.env || process.env);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Supabase admin mail.");
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
          : `Supabase admin mail request failed with status ${response.status}`;
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

  async function fetchQuoteOpsSnapshot() {
    const rows = await requestQuoteOps(
      `?select=*&kind=eq.${encodeURIComponent(QUOTE_OPS_MAIL_KIND)}&id=eq.${encodeURIComponent(DEFAULT_INTEGRATION_ID)}&limit=1`,
      { method: "GET" }
    );

    return {
      connection: Array.isArray(rows) && rows.length > 0 ? mapQuoteOpsRowToConnection(rows[0]) : null,
    };
  }

  return {
    config,
    isConfigured() {
      return true;
    },
    async fetchSnapshot() {
      return withQuoteOpsFallback(
        async () => {
          const rows = await request(
            config.mailTableName,
            `?select=*&id=eq.${encodeURIComponent(DEFAULT_INTEGRATION_ID)}&limit=1`,
            { method: "GET" }
          );
          return {
            connection: Array.isArray(rows) && rows.length > 0 ? mapRowToConnection(rows[0]) : null,
          };
        },
        fetchQuoteOpsSnapshot
      );
    },
    async upsertConnection(record = {}) {
      const row = mapConnectionToRow(record);
      return withQuoteOpsFallback(
        async () => {
          const rows = await request(config.mailTableName, "", {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(row),
          });
          return Array.isArray(rows) && rows.length > 0 ? mapRowToConnection(rows[0]) : mapRowToConnection(row);
        },
        async () => {
          await requestQuoteOps("", {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(mapConnectionToQuoteOpsRow(record)),
          });
          return mapRowToConnection(row);
        }
      );
    },
    async deleteConnection(connectionId = DEFAULT_INTEGRATION_ID) {
      const normalizedId = normalizeString(connectionId, 120) || DEFAULT_INTEGRATION_ID;
      return withQuoteOpsFallback(
        async () => {
          await request(config.mailTableName, `?id=eq.${encodeURIComponent(normalizedId)}`, {
            method: "DELETE",
            headers: {
              Prefer: "return=minimal",
            },
          });
          return true;
        },
        async () => {
          await requestQuoteOps(
            `?id=eq.${encodeURIComponent(normalizedId)}&kind=eq.${encodeURIComponent(QUOTE_OPS_MAIL_KIND)}`,
            {
              method: "DELETE",
              headers: {
                Prefer: "return=minimal",
              },
            }
          );
          return true;
        }
      );
    },
  };
}

module.exports = {
  DEFAULT_INTEGRATION_ID,
  QUOTE_OPS_MAIL_KIND,
  createSupabaseAdminMailClient,
  isOpaqueSupabaseApiKey,
  loadSupabaseAdminMailConfig,
};
