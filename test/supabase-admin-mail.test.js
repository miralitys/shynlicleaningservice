"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QUOTE_OPS_MAIL_KIND,
  createSupabaseAdminMailClient,
  isIncompatibleSupabaseMailTableError,
  isOpaqueSupabaseApiKey,
} = require("../lib/supabase-admin-mail");

function createConnection() {
  return {
    id: "invite-email",
    provider: "google-mail",
    status: "connected",
    accountEmail: "relay@shynli.com",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    tokenCipher: {
      version: 1,
      salt: "aa",
      iv: "bb",
      tag: "cc",
      data: "dGVzdA==",
    },
    tokenExpiresAt: "2026-04-12T00:00:00.000Z",
    connectedAt: "2026-04-11T20:00:00.000Z",
    updatedAt: "2026-04-11T20:05:00.000Z",
    lastError: "",
  };
}

test("detects new opaque Supabase API keys for admin mail persistence", () => {
  assert.equal(isOpaqueSupabaseApiKey("sb_secret_example123"), true);
  assert.equal(isOpaqueSupabaseApiKey("sb_publishable_example123"), true);
  assert.equal(isOpaqueSupabaseApiKey("legacy.jwt.token"), false);
});

test("treats uuid mismatch errors as a dedicated mail table incompatibility", () => {
  assert.equal(
    isIncompatibleSupabaseMailTableError(
      new Error('invalid input syntax for type uuid: "invite-email"')
    ),
    true
  );
});

test("falls back to quote_ops_entries rows when the dedicated mail table is missing", async () => {
  const calls = [];
  const connection = createConnection();
  const client = createSupabaseAdminMailClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_mail_integrations")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.admin_mail_integrations' in the schema cache",
            });
          },
        };
      }
      if (url.includes(`kind=eq.${QUOTE_OPS_MAIL_KIND}`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify([
              {
                id: "9f5d5c2e-d9d4-4c65-b0ea-381cf96b6c55",
                kind: QUOTE_OPS_MAIL_KIND,
                status: "success",
                request_id: "invite-email",
                customer_name: "relay@shynli.com",
                customer_email: "relay@shynli.com",
                service_name: "google-mail",
                code: "connected",
                error_message: "",
                created_at: connection.connectedAt,
                updated_at: connection.updatedAt,
                payload_for_retry: {
                  connection,
                },
              },
            ]);
          },
        };
      }
      throw new Error(`Unexpected request URL: ${url}`);
    },
  });

  const snapshot = await client.fetchSnapshot();

  assert.equal(snapshot.connection.accountEmail, "relay@shynli.com");
  assert.equal(snapshot.connection.provider, "google-mail");
  assert.ok(calls.some((call) => call.url.includes("/rest/v1/quote_ops_entries")));
});

test("writes admin mail rows into quote_ops_entries when the dedicated table is missing", async () => {
  const calls = [];
  const client = createSupabaseAdminMailClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_mail_integrations")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.admin_mail_integrations' in the schema cache",
            });
          },
        };
      }
      if (url.includes("/rest/v1/quote_ops_entries")) {
        return {
          ok: true,
          status: 201,
          async text() {
            return "";
          },
        };
      }
      throw new Error(`Unexpected request URL: ${url}`);
    },
  });

  await client.upsertConnection(createConnection());

  const fallbackWrite = calls.find(
    (call) =>
      call.url.includes("/rest/v1/quote_ops_entries") &&
      String(call.options && call.options.method || "").toUpperCase() === "POST"
  );
  assert.ok(fallbackWrite);
  const payload = JSON.parse(fallbackWrite.options.body);
  assert.equal(payload.kind, QUOTE_OPS_MAIL_KIND);
  assert.match(payload.id, /^[0-9a-f-]{36}$/i);
  assert.equal(payload.request_id, "invite-email");
  assert.equal(payload.customer_email, "relay@shynli.com");
  assert.equal(payload.payload_for_retry.connection.provider, "google-mail");
});

test("falls back to quote_ops_entries when the dedicated mail table uses an incompatible id type", async () => {
  const calls = [];
  const client = createSupabaseAdminMailClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_mail_integrations")) {
        return {
          ok: false,
          status: 400,
          async text() {
            return JSON.stringify({
              message: 'invalid input syntax for type uuid: "invite-email"',
            });
          },
        };
      }
      if (url.includes("/rest/v1/quote_ops_entries")) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify([]);
          },
        };
      }
      throw new Error(`Unexpected request URL: ${url}`);
    },
  });

  const snapshot = await client.fetchSnapshot();
  assert.deepEqual(snapshot, { connection: null });
  assert.ok(calls.some((call) => call.url.includes("/rest/v1/quote_ops_entries")));
});
