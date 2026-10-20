"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createSupabaseQuoteOpsClient, mapEntryToRow } = require("../lib/supabase-quote-ops");

const normalizeString = (value, limit = 500) => String(value || "").trim().slice(0, limit);

function submission(overrides = {}) {
  return {
    ok: true, code: "RECURRING_ORDER_CREATED", requestId: "test-series-next-20991101",
    source: "Recurring order automation", sourceRoute: "/admin/orders",
    recurringSourceGuard: { entryId: "00000000-0000-4000-8000-000000000001", state: {} },
    customerName: "Test Recurring Client", customerPhone: "6305550100",
    selectedDate: "2099-11-01", selectedTime: "10:00", totalPrice: 280,
    payloadForRetry: { orderState: { isCreated: true, status: "scheduled", frequency: "weekly",
      recurringSeriesId: "test-series", recurringOccurrenceDate: "2099-11-01", assignedStaff: "Cleaner A" } },
    ...overrides,
  };
}

function database(initial = [], race = false) {
  const rows = new Map(initial.map(entry => [entry.id, mapEntryToRow(entry)]));
  const writes = [];
  let reads = 0;
  let release;
  const bothRead = new Promise(resolve => { release = resolve; });
  const fetch = async (url, options = {}) => {
    const query = new URL(url).searchParams;
    const reply = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (options.method === "POST") {
      const rpc = new URL(url).pathname.endsWith("/rpc/insert_recurring_quote_order");
      const row = rpc ? JSON.parse(options.body).p_entry : JSON.parse(options.body);
      writes.push({ row: structuredClone(row), prefer: options.headers.Prefer });
      if (rpc) {
        const existing = rows.get(row.id);
        if (existing) return reply({ entry: existing, inserted: false });
        rows.set(row.id, row);
        return reply({ entry: row, inserted: true });
      }
      if (rows.has(row.id) && /ignore-duplicates/.test(options.headers.Prefer)) return reply([]);
      rows.set(row.id, row);
      return reply(/return=representation/.test(options.headers.Prefer) ? [row] : null);
    }
    if (query.has("request_id")) {
      const requestId = query.get("request_id").slice(3);
      const found = [...rows.values()].filter(row => row.request_id === requestId);
      if (race && reads++ < 2) {
        if (reads === 2) release();
        await bothRead;
      }
      return reply(found);
    }
    if (query.has("id") && query.get("id").startsWith("eq.")) {
      const row = rows.get(query.get("id").slice(3));
      return reply(row ? [row] : []);
    }
    return reply([]);
  };
  let syncs = 0;
  const store = () => createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 100, normalizeString,
    createSupabaseQuoteOpsClient, fetch,
    env: { SUPABASE_URL: "https://recurring-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    orderStore: { async upsertEntry() { syncs++; } },
  });
  return { rows, writes, store, get syncs() { return syncs; } };
}

test("independent app instances racing to create the same occurrence persist one visit without overwriting it", async () => {
  const db = database([], true);
  const first = db.store();
  const second = db.store();
  const [a, b] = await Promise.all([
    first.recordSubmission(submission()),
    second.recordSubmission(submission({ totalPrice: 534, payloadForRetry: { orderState: {
      ...submission().payloadForRetry.orderState,
      isCreated: true, status: "new", assignedStaff: "Cleaner A, Cleaner B",
    } } })),
  ]);
  assert.equal(db.rows.size, 1);
  assert.equal(a.id, b.id);
  assert.equal(a.totalPrice, b.totalPrice);
  assert.deepEqual(a.payloadForRetry, b.payloadForRetry);
  assert.equal(db.syncs, 1);
  const persisted = structuredClone([...db.rows.values()][0]);
  const replay = await db.store().recordSubmission(submission({ totalPrice: 999 }));
  assert.equal(replay.id, a.id);
  assert.deepEqual([...db.rows.values()][0], persisted);
});

test("existing legacy random-id visits are reused after a restart, even after a one-off reschedule", async () => {
  const original = { ...submission(), id: "legacy-random-id", selectedDate: "2099-10-31", selectedTime: "09:00",
    createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-02T12:00:00Z" };
  const db = database([original]);
  const result = await db.store().recordSubmission(submission());
  assert.equal(result.id, original.id);
  assert.equal(result.selectedDate, "2099-10-31");
  assert.equal(db.rows.size, 1);
  assert.equal(db.writes.length, 0);
  assert.equal(db.syncs, 0);
});

test("a removed occurrence shell blocks automatic resurrection without modifying it", async () => {
  const removed = { ...submission(), id: "removed-id", payloadForRetry: { calculatorData: {} } };
  const db = database([removed]);
  const before = structuredClone([...db.rows.values()]);
  const result = await db.store().recordSubmission(submission());
  assert.equal(result.id, removed.id);
  assert.deepEqual(result.payloadForRetry, removed.payloadForRetry);
  assert.deepEqual([...db.rows.values()], before);
  assert.equal(db.writes.length, 0);
});

test("the source visit cannot be reused as its own next occurrence", async () => {
  const input = submission();
  const db = database([{ ...input, id: input.recurringSourceGuard.entryId }]);
  assert.equal(await db.store().recordSubmission(input), null);
  assert.equal(db.writes.length, 0);
});

test("pre-existing duplicate real orders are reported as ambiguous, not overwritten or joined to another generated visit", async () => {
  const db = database([{ ...submission(), id: "legacy-one" }, { ...submission(), id: "legacy-two" }]);
  const before = structuredClone([...db.rows.values()]);
  await assert.rejects(db.store().recordSubmission(submission()), /Multiple existing orders/);
  assert.deepEqual([...db.rows.values()], before);
  assert.equal(db.writes.length, 0);
});

test("an unavailable recurring lookup or insert fails closed without persisting a memory-only order", async () => {
  for (const failOn of ["GET", "POST"]) {
    let posts = 0;
    const store = createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 100, normalizeString,
      createSupabaseQuoteOpsClient,
      env: { SUPABASE_URL: "https://recurring-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      fetch: async (_url, options) => {
        if (options.method === "POST") posts++;
        if (options.method === failOn) throw new Error("Unavailable");
        return { ok: true, status: 200, text: async () => "[]" };
      },
    });
    await assert.rejects(store.recordSubmission(submission()), /Unavailable/);
    assert.equal(posts, failOn === "GET" ? 0 : 1);
    assert.equal((await store.listEntries({ includeHidden: true })).length, 0);
  }
});

test("memory mode deduplicates recurring occurrences but retains separate ordinary website submissions", async () => {
  const store = createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 100, normalizeString, env: {} });
  const a = await store.recordSubmission(submission());
  const b = await store.recordSubmission(submission({ totalPrice: 534 }));
  assert.equal(a.id, b.id);
  assert.equal(b.totalPrice, 280);
  const c = await store.recordSubmission(submission({ code: "QUOTE_CREATED", sourceRoute: "/quote" }));
  const d = await store.recordSubmission(submission({ code: "QUOTE_CREATED", sourceRoute: "/quote" }));
  assert.notEqual(c.id, d.id);
  assert.equal((await store.listEntries()).length, 3);
});

test("different raw series identities do not collide when their human-readable request IDs match", async () => {
  const db = database();
  const first = submission();
  const second = submission();
  first.payloadForRetry.orderState.recurringSeriesId = "Series_A";
  second.payloadForRetry.orderState.recurringSeriesId = "series-a";
  const a = await db.store().recordSubmission(first);
  const b = await db.store().recordSubmission(second);
  assert.notEqual(a.id, b.id);
  assert.equal(db.rows.size, 2);
  assert.equal(a.payloadForRetry.orderState.recurringSeriesId, "Series_A");
  assert.equal(b.payloadForRetry.orderState.recurringSeriesId, "series-a");
});
