"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { runAdminReadContext, memoAdminRead, measureAdminRead, getAdminReadHeaders,
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
