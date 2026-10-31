"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseQuoteOpsClient, mapEntryToRow } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { runAdminReadContext, memoAdminRead } = require("../lib/admin/read-context");
const { projectRecurringContextState, projectRecurringContextEntry, decodeRecurringContextRow,
  RECURRING_CONTEXT_RPC } = require("../lib/quote-ops/recurring-context");

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" };
const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 403, headers: { get: () => null }, text: async () => JSON.stringify(body) });
const entry = id => ({ id, kind: "quote_submission", requestId: "test-series", sourceRoute: "/admin/orders",
  createdAt: "2026-10-01", updatedAt: "2026-10-30", selectedDate: "2026-11-01", selectedTime: "10:00", serviceType: "standard",
  totalPrice: 417, customerPhone: "PRIVATE", payloadForRetry: {
    orderState: { isCreated: true, frequency: "biweekly", status: "scheduled", recurringSeriesId: "test-series",
      recurringSchedule: { index: 1, version: 3, futureUnknownKey: { preserve: true } },
      payroll: { items: [{ amountCents: 10000, status: "paid" }] }, assignedStaff: "PRIVATE" },
    adminSms: { history: [{ text: "PRIVATE" }] }, policies: { signature: "PRIVATE" }, calculatorData: { totalPrice: 417 },
  } });
const narrowRow = value => {
  const full = mapEntryToRow(value);
  const payload = projectRecurringContextEntry(value).payloadForRetry;
  return Object.fromEntries([...Object.entries(full).filter(([key]) =>
    ["id", "kind", "created_at", "updated_at", "request_id", "source_route", "service_type", "selected_date", "selected_time"].includes(key)),
  ["payload_for_retry", payload]]);
};

test("recurring projection excludes private/financial/SMS fields, keeps the entire schedule guard and is independent", () => {
  const source = entry("source");
  const before = structuredClone(source);
  const projected = projectRecurringContextEntry(source);
  assert.equal(projected.isRecurringContextSummary, true);
  assert.equal(JSON.stringify(projected).includes("PRIVATE"), false);
  assert.equal(Object.hasOwn(projected, "totalPrice"), false);
  assert.equal(Object.hasOwn(projected.payloadForRetry, "calculatorData"), false);
  assert.deepEqual(projected.payloadForRetry.orderState.recurringSchedule, source.payloadForRetry.orderState.recurringSchedule);
  projected.payloadForRetry.orderState.recurringSchedule.futureUnknownKey.preserve = false;
  assert.deepEqual(source, before);
  assert.deepEqual(decodeRecurringContextRow(narrowRow(source)), projectRecurringContextEntry(source));
});

test("empty order tombstones, legacy fallback and unknown nonempty states keep their original meaning", () => {
  const fallback = { frequency: "weekly", recurringSeriesId: "legacy" };
  for (const state of [{}, { privateOnly: "HIDDEN" }, null, [], "invalid", undefined]) {
    const source = { payloadForRetry: { orderState: state, adminOrder: fallback } };
    const before = getEntryOrderState(source);
    const after = getEntryOrderState(projectRecurringContextEntry(source));
    assert.equal(Boolean(Object.keys(before).length), Boolean(Object.keys(after).length));
    assert.equal(before.frequency, after.frequency);
    assert.equal(before.recurringSeriesId, after.recurringSeriesId);
    assert.equal(JSON.stringify(after).includes("HIDDEN"), false);
  }
  assert.deepEqual(projectRecurringContextState({}), {});
  assert.deepEqual(projectRecurringContextState({ custom: 42 }), { recurringContextHasOrderState: true });
  for (const bad of [{}, { ...narrowRow(entry("id")), payload_for_retry: {} },
    { ...narrowRow(entry("id")), payload_for_retry: { orderState: [], adminOrder: null } }]) {
    assert.throws(() => decodeRecurringContextRow(bad), /Invalid recurring context row/);
  }
});

test("narrow RPC cursor reads all 1003 records, including old, canceled and empty orders, without full payloads", async () => {
  const all = Array.from({ length: 1003 }, (_, i) => {
    const value = entry(String(i).padStart(5, "0"));
    if (i === 0) value.payloadForRetry.orderState = {};
    if (i === 1) value.payloadForRetry.orderState.status = "canceled";
    if (i === 2) value.selectedDate = "2020-01-01";
    return narrowRow(value);
  });
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
    assert.equal(new URL(url).pathname, `/rest/v1/rpc/${RECURRING_CONTEXT_RPC}`);
    assert.equal(options.method, "POST");
    const params = JSON.parse(options.body);
    calls.push(params);
    const remaining = all.filter(row => row.id > (params.p_after || ""));
    return reply({ version: 1, after: params.p_after, total: remaining.length, rows: remaining.slice(0, 500) });
  } });
  const result = await client.fetchRecurringContextEntries({ recurringSeriesId: "test-series", recurringSeriesEntryIds: ["known-id"] });
  assert.equal(result.length, 1003);
  assert.equal(new Set(result.map(row => row.id)).size, 1003);
  assert.deepEqual(calls.map(call => call.p_after), [null, "00499", "00999"]);
  assert.ok(calls.every(call => call.p_limit === 500 && call.p_series_id === "test-series" && call.p_known_entry_ids[0] === "known-id"));
  assert.deepEqual(getEntryOrderState(result[0]), {});
  assert.equal(getEntryOrderState(result[1]).status, "canceled");
  assert.equal(result[2].selectedDate, "2020-01-01");
  assert.ok(result.every(row => row.isRecurringContextSummary && !Object.hasOwn(row, "totalPrice")));
});

test("invalid or interrupted narrow pages fail closed, never return partial data or silently fall back", async () => {
  for (const failure of ["version", "count", "short", "cursor", "row", "http", "missing-after-first"]) {
    let calls = 0;
    const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
      assert.match(url, new RegExp(`/rpc/${RECURRING_CONTEXT_RPC}$`));
      const { p_after: after } = JSON.parse(options.body);
      if (++calls === 1) return reply({ version: 1, after, total: 501,
        rows: Array.from({ length: 500 }, (_, i) => narrowRow(entry(String(i).padStart(5, "0")))) });
      const page = { version: 1, after, total: 1, rows: [narrowRow(entry("00500"))] };
      if (failure === "version") page.version = 2;
      if (failure === "count") page.total = -1;
      if (failure === "short") page.rows = [];
      if (failure === "cursor") page.rows[0].id = "00000";
      if (failure === "row") delete page.rows[0].payload_for_retry;
      if (failure === "http") return reply({ code: "42501", message: "permission denied" }, false);
      if (failure === "missing-after-first") return reply({ code: "PGRST202", message: RECURRING_CONTEXT_RPC }, false);
      return reply(page);
    } });
    await assert.rejects(client.fetchRecurringContextEntries());
    assert.equal(calls, 2, failure);
  }
});

test("only a missing optional RPC allows complete legacy fallback; custom tables never use the default RPC", async () => {
  let rpcCalls = 0, fullCalls = 0;
  const client = createSupabaseQuoteOpsClient({ env, fetch: async url => {
    if (url.includes("/rpc/")) { rpcCalls++; return reply({ code: "PGRST202", message: RECURRING_CONTEXT_RPC }, false); }
    fullCalls++;
    assert.equal(new URL(url).searchParams.get("select"), "*");
    return reply([]);
  } });
  assert.deepEqual(await client.fetchRecurringContextEntries(), []);
  assert.deepEqual(await client.fetchRecurringContextEntries(), []);
  assert.equal(rpcCalls, 1);
  assert.equal(fullCalls, 2);
  const custom = createSupabaseQuoteOpsClient({ env: { ...env, SUPABASE_QUOTE_OPS_TABLE: "custom_ledger" }, fetch: async url => {
    assert.equal(new URL(url).pathname, "/rest/v1/custom_ledger");
    return reply(new URL(url).searchParams.has("id") ? [] : [mapEntryToRow(entry("id"))]);
  } });
  const rows = await custom.fetchRecurringContextEntries();
  assert.equal(rows[0].isRecurringContextSummary, true);
  assert.equal(Object.hasOwn(rows[0], "totalPrice"), false);
  const denied = createSupabaseQuoteOpsClient({ env, fetch: async () => reply({ code: "42501", message: "permission denied" }, false) });
  await assert.rejects(denied.fetchRecurringContextEntries(), /permission denied/);
  const invalid = createSupabaseQuoteOpsClient({ env, fetch: async () => assert.fail("no request") });
  await assert.rejects(invalid.fetchRecurringContextEntries({ recurringSeriesId: "a,b" }), /Invalid recurring/);
});

test("narrow reads neither invalidate request-local full reads nor populate the full-order cache", async () => {
  await runAdminReadContext({ res: {}, route: "/test" }, async () => {
    const client = createSupabaseQuoteOpsClient({ env, fetch: async () => reply({ version: 1, after: null, total: 0, rows: [] }) });
    const owner = {};
    let reads = 0;
    const read = () => memoAdminRead(owner, "ledger", "probe", () => ++reads);
    assert.equal(await read(), 1);
    await client.fetchRecurringContextEntries();
    assert.equal(await read(), 1, "SELECT-only RPC must retain same-request reuse");
  });
  const full = entry("id");
  let narrowCalls = 0, fullCalls = 0;
  const store = createQuoteOpsStore({ env, normalizeString: value => String(value || ""), createSupabaseQuoteOpsClient: () => ({
    isConfigured: () => true,
    async fetchRecurringContextEntries() { narrowCalls++; return [projectRecurringContextEntry(full)]; },
    async fetchEntryById() { fullCalls++; return structuredClone(full); },
  }) });
  assert.equal((await store.listRecurringContextEntries())[0].isRecurringContextSummary, true);
  assert.deepEqual(await store.getEntry("id", { allowMemoryFallback: false }), full);
  assert.equal(narrowCalls, 1);
  assert.equal(fullCalls, 1);
  const failed = createQuoteOpsStore({ env, normalizeString: value => String(value || ""), createSupabaseQuoteOpsClient: () => ({
    isConfigured: () => true, async fetchRecurringContextEntries() { throw new Error("read failed"); },
  }) });
  await assert.rejects(failed.listRecurringContextEntries(), /read failed/);
});
