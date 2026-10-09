"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSupabaseQuoteOpsClient,
  isOpaqueSupabaseApiKey,
} = require("../lib/supabase-quote-ops");

test("complete ledger reads paginate past 1000 rows without a creation-date cutoff", async () => {
  const calls = [];
  const client = createSupabaseQuoteOpsClient({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async (url) => {
      const query = new URL(url).searchParams;
      calls.push(query);
      const offset = Number(query.get("offset"));
      const rows = Array.from({ length: offset < 1000 ? 500 : 3 }, (_, index) => ({ id: `entry-${offset + index}` }));
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    },
  });
  const entries = await client.fetchAllEntries();
  assert.equal(entries.length, 1003);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 1003);
  assert.deepEqual(calls.map((query) => query.get("offset")), ["0", "500", "1000"]);
  assert.ok(calls.every((query) => query.get("order") === "id.asc" && query.get("limit") === "500"));
});

test("complete ledger read fails instead of returning a partial list after a page error", async () => {
  for (const invalidResponse of [{ error: "bad response" }, null]) {
    let page = 0;
    const client = createSupabaseQuoteOpsClient({
      env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(
        page++ === 0 ? Array.from({ length: 500 }, (_, i) => ({ id: `entry-${i}` })) : invalidResponse
      ) }),
    });
    await assert.rejects(client.fetchAllEntries(), /Invalid complete ledger response/);
  }
});

test("task automation context is paginated beyond 1000 rows and includes tasks or future appointments", async () => {
  const calls = [];
  const client = createSupabaseQuoteOpsClient({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async (url) => {
      calls.push(new URL(url));
      const offset = Number(new URL(url).searchParams.get("offset"));
      const count = offset < 1000 ? 500 : 2;
      return { ok: true, status: 200, text: async () => JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: `entry-${offset + i}` }))) };
    },
  });
  assert.equal((await client.fetchTaskAutomationEntries("2026-10-08")).length, 1002);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].searchParams.get("or"), "(payload_for_retry->adminLead->tasks.not.is.null,selected_date.gte.2026-10-08)");
  assert.equal(calls[2].searchParams.get("offset"), "1000");
});

test("task writes use a compare-and-swap payload patch, not an order upsert", async () => {
  let called;
  const client = createSupabaseQuoteOpsClient({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async (url, options) => {
      called = { url: new URL(url), options };
      return { ok: true, status: 200, text: async () => "[]" };
    },
  });
  assert.equal(await client.updateTaskPayload({ id: "lead", payloadForRetry: { adminLead: { tasks: [] } }, updatedAt: "new" }, "old"), false);
  assert.equal(called.options.method, "PATCH");
  assert.equal(called.url.searchParams.get("updated_at"), "eq.old");
  assert.deepEqual(Object.keys(JSON.parse(called.options.body)).sort(), ["payload_for_retry", "updated_at"]);
});

test("routine task automation queries only that client's IDs and formatted phone variants", async () => {
  let requestUrl;
  const client = createSupabaseQuoteOpsClient({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async (url) => { requestUrl = new URL(url); return { ok: true, status: 200, text: async () => "[]" }; },
  });
  await client.fetchTaskAutomationEntries("2026-10-08", { ids: ["contact-1"], phones: ["6305550100"] });
  const filter = requestUrl.searchParams.get("and");
  assert.match(filter, /contact_id.eq."contact-1"/);
  assert.match(filter, /customer_phone.ilike.\*6\*3\*0\*5\*5\*5\*0\*1\*0\*0\*/);
  assert.match(filter, /secondaryPhone.ilike/);
  assert.match(filter, /selected_date.gte.2026-10-08/);
});

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
