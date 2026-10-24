"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry } = require("../lib/supabase-quote-ops");
const { projectAccountCalendarEntry, ACCOUNT_CALENDAR_VIEW } = require("../lib/account/calendar-list");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

test("calendar reads paginate every ID beyond 1000, preserve dates and keep financial/detail fields out of the DTO", async () => {
  const fixture = createFixture();
  const before = JSON.stringify(fixture);
  const ids = fixture.rows.slice(0, fixture.count).map(row => row.id);
  for (const noCount of [false, true]) {
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 23, noCount })) });
    const result = await client.fetchAccountCalendarEntriesByIds(ids.concat(ids[0]));
    assert.equal(result.length, 1107);
    assert.equal(result.at(-1).id, "order-01106");
    assert.deepEqual(result, fixture.rows.slice(0, fixture.count).map(mapRowToEntry).map(projectAccountCalendarEntry));
    assert.ok(calls.every(call => call.table === ACCOUNT_CALENDAR_VIEW && call.method === "GET"));
    assert.doesNotMatch(JSON.stringify(result), /payroll|totalPrice|customerName|squareFeet|checklist|Visit note/);
    const ordinary = await client.fetchAccountEntriesByIds(ids);
    assert.equal(ordinary.at(-1).totalPrice, fixture.rows[1106].total_price);
    assert.deepEqual(ordinary[0].payloadForRetry.orderState.payrollOverrides, { a: "125.50", b: "60" });
  }
  assert.equal(JSON.stringify(fixture), before);
});

test("calendar fallback only handles a missing migration and never hides denied, failed or incomplete reads", async () => {
  const fixture = createFixture(4, 2);
  const ids = fixture.rows.map(row => row.id);
  const paths = [];
  const fetch = createReadFetch(fixture, [], () => ({ missingCalendarView: true }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => { paths.push(new URL(url).pathname); return fetch(url, options); } });
  for (let i = 0; i < 2; i++) assert.deepEqual(await client.fetchAccountCalendarEntriesByIds(ids), fixture.rows.map(mapRowToEntry)
    .map(projectAccountCalendarEntry).sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(paths.filter(path => path.endsWith(ACCOUNT_CALENDAR_VIEW)).length, 1);
  for (const state of [{ calendarViewError: true }, { failOrders: true }]) {
    const paths = [];
    const read = createReadFetch(fixture, [], () => state);
    await assert.rejects(createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
      paths.push(new URL(url).pathname); return read(url, options);
    } }).fetchAccountCalendarEntriesByIds(ids), /denied|failure/);
    assert.ok(paths.every(path => path.endsWith(ACCOUNT_CALENDAR_VIEW)));
  }
  const emptyCalls = [];
  const emptyClient = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch({ ...fixture, calendarRows: [] }, emptyCalls) });
  assert.deepEqual(await emptyClient.fetchAccountCalendarEntriesByIds(ids), []);
  assert.ok(emptyCalls.every(call => call.table === ACCOUNT_CALENDAR_VIEW));
  assert.deepEqual(await emptyClient.fetchAccountCalendarEntriesByIds([]), []);
  const bad = rows => createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true, status: 200,
    headers: { get: () => "0-0/5" }, text: async () => JSON.stringify(rows) }) });
  await assert.rejects(bad([]).fetchAccountCalendarEntriesByIds(ids), /Incomplete/);
  await assert.rejects(bad([{ id: "foreign" }]).fetchAccountCalendarEntriesByIds(ids), /cursor/);
  await assert.rejects(bad({}).fetchAccountCalendarEntriesByIds(ids), /Invalid/);
});

test("pending calendar and old list migrations safely fall back to the original complete ledger without writes", async () => {
  const fixture = createFixture(7, 2);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls,
    () => ({ missingCalendarView: true, missingAccountView: true, cap: 2 })) });
  const result = await client.fetchAccountCalendarEntriesByIds(fixture.rows.map(row => row.id));
  assert.deepEqual(result, fixture.rows.map(mapRowToEntry).map(projectAccountCalendarEntry).sort((a, b) => a.id.localeCompare(b.id)));
  assert.ok(calls.every(call => call.method === "GET" && call.table === "quote_ops_entries"));
});
