"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { ADMIN_CLIENT_DIRECTORY_VIEW } = require("../lib/quote-ops/admin-directory");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const missing = code => ({ ok: false, status: 404, text: async () => JSON.stringify({ code,
  message: `Missing ${ADMIN_CLIENT_DIRECTORY_VIEW}` }) });

test("client view falls back only when the first-page migration is absent, without repeated 404s", async () => {
  for (const code of ["PGRST205", "42P01"]) {
    const fixture = createFixture(1107, 107);
    const calls = [], paths = [];
    const read = createReadFetch(fixture, calls, () => ({ cap: 123 }));
    const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
      const p = new URL(url); paths.push(p.pathname);
      return p.pathname.endsWith(ADMIN_CLIENT_DIRECTORY_VIEW) ? missing(code) : read(url, options);
    } });
    const first = await client.fetchAdminDirectoryEntries({ includeClients: true });
    const second = await client.fetchAdminDirectoryEntries({ includeClients: true });
    assert.equal(first.length, fixture.rows.length);
    assert.deepEqual(first, second);
    assert.equal(paths.filter(p => p.endsWith(ADMIN_CLIENT_DIRECTORY_VIEW)).length, 1);
    assert(calls.every(call => call.table === "quote_ops_entries" && call.method === "GET"));
    const narrow = await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) })
      .fetchAdminDirectoryEntries({ includeClients: true });
    assert.deepEqual(narrow, first);
  }
});

test("client view errors, empty and malformed responses cannot masquerade as a successful fallback", async () => {
  for (const response of [
    { ok: false, status: 403, text: async () => '{"code":"42501","message":"Denied"}' },
    { ok: false, status: 503, text: async () => '{"message":"Offline"}' },
    { ok: true, status: 200, text: async () => "{}" },
    { ok: true, status: 200, text: async () => '[{"id":"one"}]' },
    { ok: true, status: 200, text: async () => "[{" },
  ]) {
    const paths = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: async url => {
      paths.push(new URL(url).pathname); return response;
    } });
    await assert.rejects(client.fetchAdminDirectoryEntries({ includeClients: true }));
    assert.deepEqual(paths, [`/rest/v1/${ADMIN_CLIENT_DIRECTORY_VIEW}`]);
  }
  const calls = [];
  const empty = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch({ rows: [] }, calls) });
  assert.deepEqual(await empty.fetchAdminDirectoryEntries({ includeClients: true }), []);
  assert(calls.every(call => call.table === ADMIN_CLIENT_DIRECTORY_VIEW));
});

test("second-page failure never returns a partial directory or falls back to another snapshot", async () => {
  for (const code of ["PGRST205", "42501"]) {
    const fixture = createFixture(12, 2), paths = [];
    const read = createReadFetch(fixture, [], () => ({ cap: 5 }));
    const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
      paths.push(new URL(url).pathname);
      return paths.length === 2 ? missing(code) : read(url, options);
    } });
    await assert.rejects(client.fetchAdminDirectoryEntries({ includeClients: true }), /Missing/);
    assert.deepEqual(paths, Array(2).fill(`/rest/v1/${ADMIN_CLIENT_DIRECTORY_VIEW}`));
  }
});

test("client directory remains fresh between requests; menu and custom tables keep the established reader", async () => {
  const fixture = createFixture(12, 2), calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls) });
  await client.fetchAdminDirectoryEntries({ includeClients: true });
  fixture.rows[0].full_address = "Updated synthetic address";
  const updated = await client.fetchAdminDirectoryEntries({ includeClients: true });
  assert.equal(updated.find(row => row.id === fixture.rows[0].id).fullAddress, fixture.rows[0].full_address);
  calls.length = 0;
  await client.fetchAdminDirectoryEntries({ limit: 10 });
  assert(calls.every(call => call.table === "quote_ops_entries"));
  const paths = [];
  const read = createReadFetch(fixture);
  const custom = createSupabaseQuoteOpsClient({ env: { ...env, SUPABASE_QUOTE_OPS_TABLE: "custom_ledger" },
    fetch: (url, options) => {
      const p = new URL(url); paths.push(p.pathname);
      p.pathname = "/rest/v1/quote_ops_entries"; return read(p, options);
    } });
  assert.equal((await custom.fetchAdminDirectoryEntries({ includeClients: true })).length, fixture.rows.length);
  assert(paths.every(p => p === "/rest/v1/custom_ledger"));
});
