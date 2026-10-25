"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { runAdminReadContext, memoAdminRead, memoAdminJsonRead, measureAdminRead, getAdminReadHeaders,
  setAdminLedgerReadLimit, invalidateAdminReads } = require("../lib/admin/read-context");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createSupabaseAdminStaffClient } = require("../lib/supabase-admin-staff");
const { createSupabaseAdminUsersClient } = require("../lib/supabase-admin-users");
const { filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (value, length) => String(value || "").trim().slice(0, length);
const context = work => runAdminReadContext({ res: {}, route: "/admin/orders" }, work);

test("admin reads coalesce concurrent work and return independent records", async () => {
  const owner = {};
  let reads = 0;
  const read = () => memoAdminRead(owner, "staff", "snapshot", async () => {
    reads++; return { staff: [{ id: "a", pay: 500 }] };
  });
  await context(async () => {
    const [a, b] = await Promise.all([read(), read()]);
    assert.equal(reads, 1);
    a.staff[0].pay = 1;
    assert.equal(b.staff[0].pay, 500);
    assert.equal((await read()).staff[0].pay, 500);
  });
  await context(read);
  assert.equal(reads, 2, "No employee data survives into another request");
  await read(); await read();
  assert.equal(reads, 4, "No caching outside an admin GET context");
});

test("concurrent requests and different store instances never share snapshots", async () => {
  const owner = {};
  let reads = 0;
  const read = () => memoAdminRead(owner, "users", "snapshot", async () => ++reads);
  const result = await Promise.all([context(async () => [await read(), await read()]),
    context(async () => [await read(), await read()])]);
  assert.equal(reads, 2);
  assert.equal(result[0][0], result[0][1]);
  assert.equal(result[1][0], result[1][1]);
  assert.notEqual(result[0][0], result[1][0]);
  await context(async () => {
    assert.notEqual(await read(), await memoAdminRead({}, "users", "snapshot", async () => ++reads));
  });
});

test("detached work cannot retain a snapshot after the response handler completes", async () => {
  const owner = {};
  let reads = 0;
  let detached;
  const read = () => memoAdminRead(owner, "users", "snapshot", async () => ++reads);
  await context(async () => {
    assert.equal(await read(), 1);
    detached = new Promise((resolve, reject) => setTimeout(() => read().then(resolve, reject), 0));
  });
  assert.equal(await detached, 2);
});

test("failed reads are evicted and a write disables reuse for the rest of the request", async () => {
  const owner = {};
  let reads = 0;
  const read = () => memoAdminRead(owner, "ledger", "1000", async () => {
    if (++reads === 1) throw new Error("Database unavailable");
    return reads;
  });
  await context(async () => {
    await assert.rejects(read(), /Database unavailable/);
    assert.equal(await read(), 2);
    assert.equal(await read(), 2);
    invalidateAdminReads();
    assert.equal(await read(), 3);
    assert.equal(await read(), 4);
  });
});

test("broader ledger read preserves raw limits before visibility filters and every order value", async () => {
  const fixture = createFixture(1107, 107);
  fixture.rows[0].kind = "admin_staff_member";
  fixture.rows[1].kind = "admin_standalone_task";
  const before = JSON.stringify(fixture);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls) });
  const original = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const limits = [250, 1000, 120, 220];
  const expected = await Promise.all(limits.map(limit => original.fetchEntries(limit)));
  await context(async () => {
    setAdminLedgerReadLimit(1000);
    for (const [index, limit] of limits.entries()) {
      const actual = await client.fetchEntries(limit);
      assert.deepEqual(actual, expected[index]);
      for (const includeHidden of [false, true]) {
        const filters = { limit, includeHidden };
        assert.deepEqual(filterQuoteOpsEntries(actual, filters, normalizeString),
          filterQuoteOpsEntries(expected[index], filters, normalizeString));
      }
    }
    assert.equal(calls.length, 1);
    const all = await client.fetchOrderListEntries({ includePayroll: true });
    assert.equal(all.length, fixture.rows.length, "Complete order list must not inherit a recent-ledger limit");
    assert.equal(all.find(entry => entry.id === "order-01106").totalPriceCents, fixture.rows[1106].total_price_cents);
    assert.deepEqual(await client.fetchEntryById("order-01106"), await original.fetchEntryById("order-01106"));
  });
  assert.equal(JSON.stringify(fixture), before, "Amounts, teams, history and saved payouts stay untouched");
});

test("staff and users reuse one fresh snapshot per request, with no changes outside it", async () => {
  const fixture = createFixture(8, 3);
  const before = JSON.stringify(fixture);
  const calls = [];
  const fetch = createReadFetch(fixture, calls);
  const staff = createSupabaseAdminStaffClient({ env, fetch });
  const users = createSupabaseAdminUsersClient({ env, fetch });
  await context(async () => {
    const [a, b, c, d] = await Promise.all([staff.fetchSnapshot(), staff.fetchSnapshot(), users.fetchSnapshot(), users.fetchSnapshot()]);
    assert.deepEqual(a, b);
    assert.deepEqual(c, d);
    c.users[0].role = "viewer";
    assert.equal((await users.fetchSnapshot()).users[0].role, "cleaner");
  });
  assert.equal(calls.length, 3);
  fixture.users[0].role = "manager";
  await context(async () => assert.equal((await users.fetchSnapshot()).users[0].role, "manager"));
  fixture.users[0].role = "cleaner";
  assert.equal(JSON.stringify(fixture), before);
});

test("ledger readers hydrate independent JSON objects without a deep clone", async () => {
  const fixture = createFixture(2, 1);
  const text = JSON.stringify(fixture.rows);
  let reads = 0;
  const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
    reads++;
    return { ok: true, status: 200, text: async () => text };
  } });
  const clone = global.structuredClone;
  global.structuredClone = () => assert.fail("Ledger response must not be deep-cloned");
  try {
    await context(async () => {
      setAdminLedgerReadLimit(1000);
      const [a, b] = await Promise.all([client.fetchEntries(1), client.fetchEntries(1000)]);
      assert.equal(reads, 1);
      assert.equal(a.length, 1);
      assert.equal(b.length, fixture.rows.length);
      a[0].totalPrice = 1;
      a[0].payloadForRetry.orderState.payrollOverrides.a = "1";
      a[0].payloadForRetry.orderState.payroll.items[0].amountCents = 1;
      a[0].payloadForRetry.adminSms.history.push("Changed locally");
      assert.deepEqual(b, fixture.rows.map(require("../lib/supabase-quote-ops").mapRowToEntry));
      assert.deepEqual(await client.fetchEntries(1000), b);
    });
    await context(() => client.fetchEntries());
    assert.equal(reads, 2);
    await client.fetchEntries(); await client.fetchEntries();
    assert.equal(reads, 4, "No ledger response text survives the request");
  } finally { global.structuredClone = clone; }
  assert.equal(JSON.stringify(fixture.rows), text);
});

test("malformed JSON and database failures are retried, never cached as empty history", async () => {
  let reads = 0;
  const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
    reads++;
    if (reads === 1) return { ok: false, status: 503, text: async () => '{"message":"Database unavailable"}' };
    return { ok: true, status: 200, text: async () => reads === 2 ? "[{" : '[{"id":"retained-order","total_price":534}]' };
  } });
  await context(async () => {
    await assert.rejects(client.fetchEntries(), /Database unavailable/);
    await assert.rejects(client.fetchEntries(), SyntaxError);
    assert.equal((await client.fetchEntries())[0].totalPrice, 534);
    assert.equal((await client.fetchEntries())[0].id, "retained-order");
    assert.equal(reads, 3);
    invalidateAdminReads();
    await client.fetchEntries(); await client.fetchEntries();
    assert.equal(reads, 5);
  });
});

test("JSON response caching preserves nulls, arrays, keys and numeric values", async () => {
  const res = {};
  const owner = {};
  const text = '{"__proto__":{"keep":true},"empty":null,"items":[false,0,-1,534,466.5,"\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435"]}';
  await runAdminReadContext({ res, route: "/admin/clients" }, async () => {
    const first = await memoAdminJsonRead(owner, "ledger", "rows", async () => text);
    assert.deepEqual(first, JSON.parse(text));
    first.items[3] = 1;
    const second = await memoAdminJsonRead(owner, "ledger", "rows", () => assert.fail("Duplicate JSON read"));
    assert.equal(second.items[3], 534);
    assert.equal(Object.getPrototypeOf(second), Object.prototype);
    assert.equal(Object.hasOwn(second, "__proto__"), true);
  });
  assert.match(getAdminReadHeaders(res)["Server-Timing"], /admin_decode;dur=/);
  assert.doesNotMatch(getAdminReadHeaders(res)["Server-Timing"], /admin_clone;/);
});

test("admin timing contains only allowlisted phases, counts and a random correlation ID", async () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  const events = [];
  await runAdminReadContext({ res, route: "/admin/clients", logger: { log: event => events.push(event) } }, async () => {
    await measureAdminRead("auth", async () => {});
    await measureAdminRead("private-email@example.test", async () => {});
    const owner = {};
    await memoAdminRead(owner, "users", "password=synthetic-secret", async () => ({ email: "private@example.test" }));
    await memoAdminRead(owner, "users", "password=synthetic-secret", async () => assert.fail("Duplicate read"));
  });
  const headers = getAdminReadHeaders(res);
  assert.match(headers["Server-Timing"], /admin_auth;dur=/);
  assert.match(headers["Server-Timing"], /admin_reads;desc="1"/);
  assert.match(headers["Server-Timing"], /admin_read_hits;desc="1"/);
  res.emit("finish");
  assert.equal(events.length, 1);
  assert.equal(events[0].read_hits, 1);
  assert.doesNotMatch(JSON.stringify([headers, events]), /private|password|secret|example/);
});
