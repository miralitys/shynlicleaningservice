"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSupabaseQuoteOpsClient,
  isOpaqueSupabaseApiKey,
} = require("../lib/supabase-quote-ops");

test("detects new opaque Supabase API keys", () => {
  assert.equal(isOpaqueSupabaseApiKey("sb_secret_example123"), true);
  assert.equal(isOpaqueSupabaseApiKey("sb_publishable_example123"), true);
  assert.equal(isOpaqueSupabaseApiKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example"), false);
});

test("uses apikey-only auth for opaque Supabase secret keys", async () => {
  const calls = [];
  const client = createSupabaseQuoteOpsClient({
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

  await client.fetchEntries(1);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.apikey, "sb_secret_example123");
  assert.equal("Authorization" in calls[0].options.headers, false);
});

test("keeps bearer auth for legacy service_role JWT keys", async () => {
  const calls = [];
  const client = createSupabaseQuoteOpsClient({
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

  await client.fetchEntries(1);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.apikey, "legacy.jwt.token");
  assert.equal(calls[0].options.headers.Authorization, "Bearer legacy.jwt.token");
});
