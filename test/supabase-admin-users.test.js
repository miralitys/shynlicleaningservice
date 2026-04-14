"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QUOTE_OPS_USER_KIND,
  createSupabaseAdminUsersClient,
  isOpaqueSupabaseApiKey,
} = require("../lib/supabase-admin-users");

test("detects new opaque Supabase API keys for admin users persistence", () => {
  assert.equal(isOpaqueSupabaseApiKey("sb_secret_example123"), true);
  assert.equal(isOpaqueSupabaseApiKey("sb_publishable_example123"), true);
  assert.equal(
    isOpaqueSupabaseApiKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example"),
    false
  );
});

test("uses apikey-only auth for opaque Supabase secret keys in the admin users client", async () => {
  const calls = [];
  const client = createSupabaseAdminUsersClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return "[]";
        },
      };
    },
  });

  await client.fetchSnapshot();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.apikey, "sb_secret_example123");
  assert.equal("Authorization" in calls[0].options.headers, false);
});

test("keeps bearer auth for legacy service_role JWT keys in the admin users client", async () => {
  const calls = [];
  const client = createSupabaseAdminUsersClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "legacy.jwt.token",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return "[]";
        },
      };
    },
  });

  await client.fetchSnapshot();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.apikey, "legacy.jwt.token");
  assert.equal(calls[0].options.headers.Authorization, "Bearer legacy.jwt.token");
});

test("falls back to quote_ops_entries rows when the dedicated users table is missing", async () => {
  const userId = "32168b50-36ef-489b-ac24-df04b8d7fa3d";
  const calls = [];
  const client = createSupabaseAdminUsersClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_users")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.admin_users' in the schema cache",
            });
          },
        };
      }
      if (url.includes(`kind=eq.${QUOTE_OPS_USER_KIND}`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify([
              {
                id: userId,
                kind: QUOTE_OPS_USER_KIND,
                status: "success",
                request_id: userId,
                customer_name: "anna@example.com",
                customer_phone: "+1(312)555-0101",
                customer_email: "anna@example.com",
                contact_id: "staff-anna",
                service_name: "manager",
                code: "active",
                error_message: "",
                warnings: ["email_verification_required"],
                created_at: "2026-04-11T18:01:11.000Z",
                updated_at: "2026-04-11T18:05:00.000Z",
                payload_for_retry: {
                  user: {
                    id: userId,
                    staffId: "staff-anna",
                    email: "anna@example.com",
                    phone: "+1(312)555-0101",
                    passwordHash: "scrypt$example",
                    status: "active",
                    role: "manager",
                    isEmployee: true,
                    createdAt: "2026-04-11T18:01:11.000Z",
                    updatedAt: "2026-04-11T18:05:00.000Z",
                    lastLoginAt: "2026-04-11T18:06:00.000Z",
                    emailVerificationRequired: true,
                    emailVerifiedAt: "",
                    inviteEmailSentAt: "2026-04-11T18:02:00.000Z",
                    inviteEmailLastError: "",
                  },
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

  assert.equal(snapshot.users.length, 1);
  assert.equal(snapshot.users[0].staffId, "staff-anna");
  assert.equal(snapshot.users[0].email, "anna@example.com");
  assert.equal(snapshot.users[0].role, "manager");
  assert.equal(snapshot.users[0].isEmployee, true);
  assert.equal(snapshot.users[0].emailVerificationRequired, true);
  assert.equal(snapshot.users[0].lastLoginAt, "2026-04-11T18:06:00.000Z");
  assert.ok(calls.some((call) => call.url.includes("/rest/v1/quote_ops_entries")));
});

test("writes admin user rows into quote_ops_entries when the dedicated table is missing", async () => {
  const calls = [];
  const client = createSupabaseAdminUsersClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_users")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.admin_users' in the schema cache",
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

  await client.upsertUser({
    id: "fc2dbb82-17c8-469e-bd4f-0f84ea2d9035",
    staffId: "staff-olga",
    email: "olga@example.com",
    phone: "+1(331)555-0199",
    passwordHash: "scrypt$example",
    status: "inactive",
    role: "cleaner",
    isEmployee: true,
    createdAt: "2026-04-11T18:10:00.000Z",
    updatedAt: "2026-04-11T18:12:00.000Z",
    lastLoginAt: "",
    emailVerificationRequired: true,
    emailVerifiedAt: "",
    inviteEmailSentAt: "2026-04-11T18:11:00.000Z",
    inviteEmailLastError: "SMTP rejected the credentials.",
  });

  const fallbackWrite = calls.find((call) => call.url.includes("/rest/v1/quote_ops_entries"));
  assert.ok(fallbackWrite);
  const payload = JSON.parse(fallbackWrite.options.body);
  assert.equal(payload.kind, QUOTE_OPS_USER_KIND);
  assert.equal(payload.customer_email, "olga@example.com");
  assert.equal(payload.contact_id, "staff-olga");
  assert.equal(payload.service_name, "cleaner");
  assert.equal(payload.code, "inactive");
  assert.equal(payload.payload_for_retry.user.isEmployee, true);
  assert.equal(payload.payload_for_retry.user.passwordHash, "scrypt$example");
  assert.equal(payload.payload_for_retry.user.inviteEmailLastError, "SMTP rejected the credentials.");
});
