"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { HIDDEN_ENTRY_KINDS, VISIBLE_ENTRY_KIND_FILTER } = require("../lib/quote-ops/entry-kinds");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { collectPayrollRecords } = require("../lib/payroll");
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const createStore = client => createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 250, normalizeString,
  createSupabaseQuoteOpsClient: () => client });
const visible = entries => filterQuoteOpsEntries(entries, {}, normalizeString);

function addTechnical(fixture, count) {
  for (let i = 0; i < count; i++) fixture.rows.push({ ...fixture.rows[0],
    id: `technical-${String(i).padStart(5, "0")}`, kind: HIDDEN_ENTRY_KINDS[i % HIDDEN_ENTRY_KINDS.length] });
}

test("technical-kind exclusion preserves every visible field, all logical orders, client addresses and history", async () => {
  const fixture = createFixture(1107, 157);
  addTechnical(fixture, 1200);
  for (const [i, kind] of [null, undefined, "", "external_legacy", "admin_staff_member ", "ADMIN_USER_ACCOUNT"].entries()) {
    fixture.rows.push({ ...structuredClone(fixture.rows[i]), id: `legacy-${i}`, kind });
  }
  fixture.rows[0].payload_for_retry.adminClient.addressBook = [{ address: "Second retained house", bedrooms: "4", bathrooms: "3" }];
  const before = structuredClone(fixture);
  const domain = createAdminDomainHelpers({ normalizeString });
  for (const noCount of [false, true]) {
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 73, noCount })) });
    const expected = visible(await client.fetchOrderListEntries());
    calls.length = 0;
    const actual = await createStore(client).listOrderListEntries();
    assert.deepEqual(actual, expected);
    assert.deepEqual(domain.collectAdminOrderRecords(actual), domain.collectAdminOrderRecords(expected));
    assert.deepEqual(domain.collectAdminClientRecords(actual), domain.collectAdminClientRecords(expected));
    assert.equal(new Set(actual.map(x => x.id)).size, actual.length);
    for (const kind of HIDDEN_ENTRY_KINDS) assert.ok(actual.every(x => x.kind !== kind));
    for (const id of ["legacy-0", "legacy-1", "legacy-2", "legacy-3", "legacy-5", "order-01106"]) assert.ok(actual.some(x => x.id === id), id);
    assert.ok(calls.length > 10, "Read every cursor page, including histories beyond 1000 rows");
    assert.ok(calls.every(x => new URLSearchParams(x.query).get("or") === VISIBLE_ENTRY_KIND_FILTER));
    for (const filter of [{}, { status: "completed" }, { status: "canceled" }, { frequency: "monthly" },
      { q: "Second retained house" }, { assignment: "unassigned" }]) {
      assert.deepEqual(domain.filterAdminOrderRecords(domain.collectAdminOrderRecords(actual), filter),
        domain.filterAdminOrderRecords(domain.collectAdminOrderRecords(expected), filter));
    }
    const detail = await client.fetchEntryById("order-00000");
    assert.ok(detail.payloadForRetry.adminSms.history.length);
    assert.equal(detail.payloadForRetry.adminClient.addressBook[0].address, "Second retained house");
    assert.deepEqual(fixture, before);
  }
});

test("production-shaped 426 visible and 500 technical rows need one list response instead of two", async () => {
  const fixture = createFixture(425, 157);
  addTechnical(fixture, 500);
  const calls = [];
  const trace = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls) });
  const expected = visible(await client.fetchOrderListEntries());
  assert.equal(calls.length, 2);
  assert.equal(calls.reduce((n, x) => n + x.rows, 0), 926);
  calls.length = 0;
  assert.deepEqual(await createStore(client).listOrderListEntries({ onOrderListRead: x => trace.push(x) }), expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rows, 426);
  assert.equal(trace.length, 1);
  assert.equal(trace[0].rows, 426);
  assert.equal(trace[0].succeeded, true);
});

test("financial reads retain the established query and saved payout snapshots", async () => {
  const fixture = createFixture(23, 9);
  addTechnical(fixture, 17);
  const before = structuredClone(fixture);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls) });
  const expected = visible(await client.fetchOrderListEntries({ includePayroll: true }));
  calls.length = 0;
  const actual = await createStore(client).listOrderListEntries({ includePayroll: true });
  assert.deepEqual(actual, expected);
  assert.ok(calls.every(x => x.table === "quote_ops_entries" && !new URLSearchParams(x.query).has("or")));
  for (const staffId of ["a", "b"]) assert.deepEqual(collectPayrollRecords({ entries: actual, staffId }), collectPayrollRecords({ entries: expected, staffId }));
  assert.deepEqual(fixture, before);
});

test("the same exclusion works on a missing view and never masks a later read failure", async () => {
  const fixture = createFixture(1107, 157);
  addTechnical(fixture, 19);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls,
    () => ({ missingAdminOrderView: true, cap: 500 })) });
  const actual = await createStore(client).listOrderListEntries();
  assert.equal(actual.length, 1108);
  assert.ok(calls.every(x => new URLSearchParams(x.query).get("or") === VISIBLE_ENTRY_KIND_FILTER));
  let count = 0;
  const read = createReadFetch(fixture, [], () => ({ cap: 50 }));
  const trace = [];
  const failed = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => ++count === 2
    ? Promise.resolve({ ok: false, status: 503, text: async () => '{"message":"Second page unavailable"}' }) : read(url, options) });
  await assert.rejects(createStore(failed).listOrderListEntries({ onOrderListRead: x => trace.push(x) }), /Second page unavailable/);
  assert.equal(trace.length, 2);
  assert.equal(trace[1].succeeded, false);
  assert.equal(trace[1].status, 503);
  assert.equal(count, 2);
});

test("per-query timing separates header wait, body text, JSON and hydration without leaking data or changing results", async () => {
  const fixture = createFixture(2, 1);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const read = createReadFetch(fixture);
  const trace = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
    await delay(15);
    const response = await read(url, options);
    return { ...response, text: async () => { await delay(20); return response.text(); } };
  } });
  const actual = await createStore(client).listOrderListEntries({ onOrderListRead: x => trace.push(x) });
  assert.equal(trace.length, 1);
  assert.ok(trace[0].headersMs >= 10);
  assert.ok(trace[0].bodyTextMs >= 15);
  assert.ok(trace[0].decodeMs >= 0 && trace[0].hydrateMs >= 0);
  assert.ok(trace[0].totalMs >= trace[0].headersMs + trace[0].bodyTextMs);
  assert.equal(trace[0].page, 1);
  assert.equal(trace[0].attempt, 1);
  assert.equal(trace[0].status, 200);
  assert.equal(trace[0].rows, fixture.rows.length);
  assert.ok(trace[0].bytes > 0);
  assert.doesNotMatch(JSON.stringify(trace), /202555|Test Client|sb_secret|payload|query|https:|Bearer/);
  const untraced = await createStore(client).listOrderListEntries();
  assert.deepEqual(actual, untraced);
  assert.deepEqual(await createStore(client).listOrderListEntries({ onOrderListRead: () => { throw Error("Diagnostic failed"); } }), untraced);
  assert.deepEqual(await createStore(client).listOrderListEntries({ onOrderListRead: async () => { throw Error("Async diagnostic failed"); } }), untraced);
});

test("concurrent inserts cannot displace a pre-existing tail and later reads see changed amounts immediately", async () => {
  const fixture = createFixture(999, 157);
  addTechnical(fixture, 50);
  const original = fixture.rows.filter(row => !HIDDEN_ENTRY_KINDS.includes(row.kind)).map(row => row.id);
  const read = createReadFetch(fixture);
  let requests = 0;
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
    if (++requests === 2) {
      fixture.rows.push({ ...structuredClone(fixture.rows[0]), id: "000-concurrent-before-cursor" });
      fixture.rows.push({ ...structuredClone(fixture.rows[0]), id: "zz-concurrent-after-cursor" });
    }
    return read(url, options);
  } });
  const store = createStore(client);
  const actual = await store.listOrderListEntries();
  assert.ok(original.every(id => actual.some(row => row.id === id)), "No pre-existing order is displaced by insertion");
  assert.ok(actual.some(row => row.id === "zz-concurrent-after-cursor"));
  fixture.rows[0].total_price = 534;
  fixture.rows[0].total_price_cents = 53400;
  const latest = await store.listOrderListEntries();
  assert.equal(latest.find(row => row.id === fixture.rows[0].id).totalPriceCents, 53400);
  assert.ok(latest.some(row => row.id === "000-concurrent-before-cursor"));
});
