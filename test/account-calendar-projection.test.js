"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry } = require("../lib/supabase-quote-ops");
const { projectAccountCalendarEntry, ACCOUNT_CALENDAR_VIEW, ACCOUNT_CALENDAR_RPC } = require("../lib/account/calendar-list");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

test("calendar batch returns all history in one read-only RPC, including more than 1000 IDs and missing references", async () => {
  const fixture = createFixture();
  const before = JSON.stringify(fixture);
  const ids = fixture.rows.slice(0, fixture.count).map(row => row.id);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ calendarBatch: true, cap: 23 })) });
  const result = await client.fetchAccountCalendarEntriesByIds(ids.concat(ids[0], "deleted-reference"));
  assert.equal(result.length, 1107);
  assert.deepEqual(result, fixture.rows.slice(0, fixture.count).map(mapRowToEntry).map(projectAccountCalendarEntry));
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].method, calls[0].table], ["POST", ACCOUNT_CALENDAR_RPC]);
  assert.doesNotMatch(JSON.stringify(result), /payroll|totalPrice|customerName|squareFeet|checklist|Visit note/);
  const reverseIds = ids.slice().reverse();
  const backwards = await client.fetchAccountCalendarEntriesByIds(reverseIds);
  const expectedIds = [];
  for (let i = 0; i < reverseIds.length; i += 75) expectedIds.push(...reverseIds.slice(i, i + 75).sort());
  assert.deepEqual(backwards.map(row => row.id), expectedIds);
  assert.deepEqual(await client.fetchAccountCalendarEntriesByIds([]), []);
  assert.equal(calls.length, 2);
  const ordinary = await client.fetchAccountEntriesByIds(ids);
  assert.equal(ordinary.length, 1107);
  assert.deepEqual(ordinary[0].payloadForRetry.orderState.payrollOverrides, { a: "125.50", b: "60" });
  assert.equal(JSON.stringify(fixture), before);
});

test("calendar batch fails closed on denied, truncated, duplicate, foreign or invalid envelopes", async () => {
  const fixture = createFixture(3, 1);
  const ids = fixture.rows.map(row => row.id);
  const baseRead = createReadFetch(fixture, [], () => ({ calendarBatch: true }));
  const response = await baseRead(`${env.SUPABASE_URL}/rest/v1/rpc/${ACCOUNT_CALENDAR_RPC}`, {
    method: "POST", body: JSON.stringify({ p_entry_ids: ids }) });
  const good = JSON.parse(await response.text());
  const corruptions = [
    b => { b.version = 2; }, b => { b.requested_count++; }, b => { b.matched_count++; },
    b => { b.rows.pop(); b.matched_count--; }, b => { b.rows[1] = b.rows[0]; },
    b => { b.rows[0].id = "foreign"; }, b => { delete b.rows[0].payload_for_retry; },
    b => { delete b.rows[0].payload_for_retry.adminOrder; }, b => { delete b.rows[0].selected_date; },
    b => { b.missing_ids.push(ids[0]); }, b => { b.missing_ids = null; }, b => { b.rows = {}; },
  ];
  for (const corrupt of corruptions) {
    const body = structuredClone(good); corrupt(body);
    let calls = 0;
    const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
      calls++; return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    } });
    await assert.rejects(client.fetchAccountCalendarEntriesByIds(ids), /Invalid|Incomplete/);
    assert.equal(calls, 1, "invalid replies never fall back to partial or old data");
  }
  for (const control of [{ calendarBatchError: true }, { failOrders: true }]) {
    const read = createReadFetch(fixture, [], () => ({ calendarBatch: true, ...control }));
    const paths = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => { paths.push(new URL(url).pathname); return read(url, options); } });
    await assert.rejects(client.fetchAccountCalendarEntriesByIds(ids), /denied|failure/);
    assert.deepEqual(paths, [`/rest/v1/rpc/${ACCOUNT_CALENDAR_RPC}`]);
  }
});

test("only a missing batch migration uses the existing fully paginated calendar read and remembers availability, not data", async () => {
  const fixture = createFixture(6, 1);
  const ids = fixture.rows.map(row => row.id);
  const read = createReadFetch(fixture, [], () => ({ cap: 2 }));
  const paths = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => { paths.push(new URL(url).pathname); return read(url, options); } });
  assert.equal((await client.fetchAccountCalendarEntriesByIds(ids)).length, ids.length);
  fixture.rows[0].selected_date = "2100-01-01";
  assert.equal((await client.fetchAccountCalendarEntriesByIds(ids))[0].selectedDate, "2100-01-01");
  assert.equal(paths.filter(path => path.endsWith(ACCOUNT_CALENDAR_RPC)).length, 1);
  assert.ok(paths.filter(path => !path.endsWith(ACCOUNT_CALENDAR_RPC)).every(path => path.endsWith(ACCOUNT_CALENDAR_VIEW)));
  for (const message of ["function public.account_calendar_batch_state(jsonb) does not exist", "Connection lost"]) {
    let calls = 0;
    const failed = createSupabaseQuoteOpsClient({ env, fetch: async () => {
      calls++;
      return { ok: false, status: 500, text: async () => JSON.stringify({ code: "42883", message }) };
    } });
    await assert.rejects(failed.fetchAccountCalendarEntriesByIds(ids), new RegExp(message.replace(/[()]/g, "\\$&")));
    assert.equal(calls, 1, "an installed RPC's SQL errors do not select a fallback backend");
  }
});

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
  assert.equal(paths.filter(path => path.endsWith(`/${ACCOUNT_CALENDAR_VIEW}`)).length, 1);
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
  const bad = rows => createSupabaseQuoteOpsClient({ env, fetch: async url => new URL(url).pathname.endsWith(`/${ACCOUNT_CALENDAR_RPC}`)
    ? { ok: false, status: 404, text: async () => JSON.stringify({ code: "PGRST202" }) }
    : { ok: true, status: 200, headers: { get: () => "0-0/5" }, text: async () => JSON.stringify(rows) } });
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
