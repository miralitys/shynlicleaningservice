"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseAdminUsersClient, mapUserRecordToQuoteOpsRow } = require("../lib/supabase-admin-users");
const env = { SUPABASE_URL: "https://users-read.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const missing = { status: 404, body: { code: "PGRST205", message: "Could not find the table admin_users" } };

function harness() {
  const calls = [];
  const state = { primary: missing, failFallback: false, failNetwork: false, delay: 0 };
  const rows = [mapUserRecordToQuoteOpsRow({ id: "u", staffId: "a", email: "a@example.test", passwordHash: "existing-hash",
    role: "cleaner", status: "active", isEmployee: true, emailVerificationRequired: true, emailVerifiedAt: "2026-10-01" })];
  const fetch = async (url, options = {}) => {
    const table = new URL(url).pathname.split("/").pop();
    calls.push({ table, method: options.method });
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (table === "admin_users" && state.failNetwork) throw new Error("Network unavailable");
    const error = table === "admin_users" ? state.primary : state.failFallback ? { status: 503, body: { message: "Fallback unavailable" } } : null;
    const body = error ? error.body : table === "admin_users" ? [] : rows;
    return { ok: !error, status: error?.status || 200, text: async () => JSON.stringify(body) };
  };
  const client = createSupabaseAdminUsersClient({ env, fetch });
  return { client, calls, state, rows, fetch };
}

test("user schema discovery remembers only the backend; status, role, credentials and deletion remain fresh", async () => {
  const h = harness();
  const before = JSON.stringify(h.rows);
  const first = await h.client.fetchSnapshot();
  assert.equal(first.users[0].passwordHash, "existing-hash");
  assert.equal(first.users[0].emailVerifiedAt, "2026-10-01");
  assert.deepEqual(await h.client.fetchSnapshot(), first);
  assert.equal(JSON.stringify(h.rows), before);
  h.rows[0].payload_for_retry.user.status = "inactive";
  h.rows[0].payload_for_retry.user.role = "viewer";
  h.rows[0].payload_for_retry.user.passwordHash = "changed-elsewhere";
  const fresh = await h.client.fetchSnapshot();
  assert.equal(fresh.users[0].status, "inactive");
  assert.equal(fresh.users[0].role, "viewer");
  assert.equal(fresh.users[0].passwordHash, "changed-elsewhere");
  h.rows.length = 0;
  assert.deepEqual((await h.client.fetchSnapshot()).users, []);
  assert.equal(h.calls.filter(row => row.table === "admin_users").length, 1);
  assert.equal(h.calls.filter(row => row.table === "quote_ops_entries").length, 4);
  assert.ok(h.calls.every(row => row.method === "GET"));
});

test("parallel user reads discover missing schema once but each reads fresh users", async () => {
  const h = harness();
  h.state.delay = 2;
  await Promise.all(Array.from({ length: 4 }, () => h.client.fetchSnapshot()));
  assert.equal(h.calls.filter(row => row.table === "admin_users").length, 1);
  assert.equal(h.calls.filter(row => row.table === "quote_ops_entries").length, 4);
});

for (const status of [403, 503]) test(`user HTTP ${status} does not select fallback or hide behind a stale snapshot`, async () => {
  const h = harness();
  h.state.primary = { status, body: { message: "Read denied or unavailable" } };
  await assert.rejects(h.client.fetchSnapshot());
  assert.equal(h.calls.filter(row => row.table === "quote_ops_entries").length, 0);
  h.state.primary = null;
  assert.deepEqual((await h.client.fetchSnapshot()).users, []);
  h.state.primary = { status, body: { message: "Read denied or unavailable" } };
  await assert.rejects(h.client.fetchSnapshot());
  assert.equal(h.calls.filter(row => row.table === "quote_ops_entries").length, 0);
});

test("failed first user fallback releases waiters, never caches users, and recovers with fresh reads", async () => {
  const h = harness();
  h.state.failFallback = true;
  const failed = await Promise.allSettled([h.client.fetchSnapshot(), h.client.fetchSnapshot()]);
  assert.ok(failed.every(result => result.status === "rejected"));
  h.state.failFallback = false;
  assert.equal((await h.client.fetchSnapshot()).users.length, 1);
  h.state.failFallback = true;
  await assert.rejects(h.client.fetchSnapshot());
  assert.equal(h.calls.filter(row => row.table === "admin_users").length, 1);
});

test("network failure does not remember a missing user table; a new client re-discovers installed schema", async () => {
  const h = harness();
  h.state.failNetwork = true;
  await assert.rejects(h.client.fetchSnapshot());
  h.state.failNetwork = false;
  await h.client.fetchSnapshot();
  h.state.primary = null;
  const fresh = createSupabaseAdminUsersClient({ env, fetch: h.fetch });
  assert.deepEqual((await fresh.fetchSnapshot()).users, []);
  assert.equal(h.calls.filter(row => row.table === "admin_users").length, 3);
});

test("remembering a missing users read backend never changes user write routing", async () => {
  const h = harness();
  const writes = [];
  const client = createSupabaseAdminUsersClient({ env, fetch: async (url, options) => {
    if (options.method === "GET") return h.fetch(url, options);
    writes.push({ table: new URL(url).pathname.split("/").pop(), method: options.method });
    return { ok: true, status: 200, text: async () => "[]" };
  } });
  await client.fetchSnapshot();
  await client.upsertUser({ id: "u" });
  await client.deleteUser("u");
  assert.deepEqual(writes, [{ table: "admin_users", method: "POST" }, { table: "admin_users", method: "DELETE" }]);
});
