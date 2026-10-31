"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recurringSeriesReadFilter } = require("../lib/quote-ops/recurring-context");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" };
const reply = (body, count = null) => ({ ok: true, status: 200,
  headers: { get: name => name.toLowerCase() === "content-range" && count !== null ? `0-499/${count}` : null },
  text: async () => JSON.stringify(body) });

test("series read filter includes both order formats and canonical removed shells without wildcard ambiguity", () => {
  assert.equal(recurringSeriesReadFilter("test-series"),
    "(payload_for_retry->orderState->>recurringSeriesId.eq.test-series," +
    "payload_for_retry->adminOrder->>recurringSeriesId.eq.test-series," +
    "request_id.eq.test-series,request_id.like.test-series-next-*)");
  for (const id of ["", null, "RAW-SERIES", "series_id", "a--b", "-series", "series-", "series,next", "series*", "a".repeat(91)]) {
    assert.equal(recurringSeriesReadFilter(id), "", String(id));
  }
  assert.ok(recurringSeriesReadFilter("a".repeat(90)));
  assert.match(recurringSeriesReadFilter("test-series", ["known-visit"]), /^\(id\.in\.\(known-visit\),/);
  assert.equal(recurringSeriesReadFilter("test-series", Array(76).fill("id")), "", "large contexts must not be truncated");
  assert.equal(recurringSeriesReadFilter("test-series", ["id),or(status.eq.active)"]), "");
});

test("series context cursor reads all 1003 rows, retaining full financial/history payload and no status/date cutoff", async () => {
  const calls = [];
  const all = Array.from({ length: 1003 }, (_, i) => ({ id: String(i).padStart(5, "0"),
    total_price: 417, selected_date: i ? "2099-11-01" : "2020-01-01",
    payload_for_retry: { orderState: { recurringSeriesId: "test-series", status: i % 2 ? "canceled" : "completed",
      payroll: { items: [{ amountCents: 12345, status: "paid" }] } }, adminSms: { history: [{ text: "Keep history" }] } } }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
    const query = new URL(url).searchParams;
    calls.push({ query, options });
    const cursor = query.get("id")?.slice(3) || "";
    const remaining = all.filter(row => row.id > cursor);
    return reply(remaining.slice(0, 500), remaining.length);
  } });
  const entries = await client.fetchAllEntries({ recurringSeriesId: "test-series", recurringSeriesEntryIds: ["known-visit"] });
  assert.equal(entries.length, 1003);
  assert.equal(new Set(entries.map(entry => entry.id)).size, 1003);
  assert.deepEqual(calls.map(({ query }) => query.get("id")), [null, "gt.00499", "gt.00999"]);
  for (const { query, options } of calls) {
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Prefer, "count=exact");
    assert.equal(query.get("or"), recurringSeriesReadFilter("test-series", ["known-visit"]));
    assert.deepEqual([...query.keys()].sort(), query.has("id") ? ["id", "limit", "or", "order", "select"] : ["limit", "or", "order", "select"]);
    assert.equal(query.get("select"), "*");
  }
  assert.deepEqual(entries[0].payloadForRetry, all[0].payload_for_retry);
  assert.equal(entries[0].totalPrice, 417);
});

test("series reads fail closed on invalid pages, HTTP errors and invalid cursors", async () => {
  for (const failure of ["shape", "http", "cursor", "count"]) {
    let calls = 0;
    const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
      calls++;
      if (calls === 1) return reply(Array.from({ length: 500 }, (_, i) => ({ id: String(i).padStart(5, "0") })), 501);
      if (failure === "http") return { ok: false, status: 503, text: async () => "unavailable" };
      if (failure === "shape") return reply(null);
      if (failure === "cursor") return reply([{ id: "00000" }], 1);
      return reply([], 1);
    } });
    await assert.rejects(client.fetchAllEntries({ recurringSeriesId: "test-series" }));
    assert.equal(calls, 2);
  }
});

test("invalid series identity is rejected before sending a request, not turned into a broad or truncated query", async () => {
  const client = createSupabaseQuoteOpsClient({ env, fetch: async () => assert.fail("must not issue a request") });
  await assert.rejects(client.fetchAllEntries({ recurringSeriesId: "a,b" }), /Invalid recurring series context identity/);
});

test("store forwards scoped complete reads unchanged and never falls back to a partial cached ledger", async () => {
  const calls = [];
  const store = createQuoteOpsStore({ env, normalizeString: value => String(value || ""),
    createSupabaseQuoteOpsClient: () => ({ isConfigured: () => true,
      async fetchAllEntries(options) { calls.push(options); throw new Error("series unavailable"); },
      async fetchEntries() { return [{ id: "cached-only" }]; } }) });
  await assert.rejects(store.listAllEntries({ recurringSeriesId: "test-series" }), /series unavailable/);
  assert.deepEqual(calls, [{ recurringSeriesId: "test-series" }]);
});
