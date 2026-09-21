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

test("loads reminder candidates by appointment date instead of creation date", async () => {
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

  await client.fetchEntriesBySelectedDateRange("2026-09-17", "2026-09-20", 1000);

  const requestUrl = new URL(calls[0].url);
  assert.deepEqual(requestUrl.searchParams.getAll("selected_date"), [
    "gte.2026-09-17",
    "lte.2026-09-20",
  ]);
  assert.equal(requestUrl.searchParams.get("order"), "selected_date.asc,selected_time.asc");
});

test("loads assigned cleaner entries by id in bounded batches", async () => {
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

  const entryIds = Array.from({ length: 76 }, (_, index) => `manual-order-${index + 1}`);
  await client.fetchEntriesByIds([...entryIds, entryIds[0]]);

  assert.equal(calls.length, 2);
  const firstUrl = new URL(calls[0].url);
  const secondUrl = new URL(calls[1].url);
  assert.equal(
    firstUrl.searchParams.get("id"),
    `in.(${entryIds.slice(0, 75).join(",")})`
  );
  assert.equal(secondUrl.searchParams.get("id"), `in.(${entryIds[75]})`);
  assert.equal(firstUrl.searchParams.get("order"), "created_at.desc");
});
