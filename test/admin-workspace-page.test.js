"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { runAdminReadContext, memoAdminRead } = require("../lib/admin/read-context");
const { WORKSPACE_PAYLOAD_KEYS } = require("../lib/quote-ops/workspace-list");
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (value, max = 500) => String(value ?? "").trim().slice(0, max);

test("workspace RPC retains every row, task state, assignee and address beyond 1000 without caching data", async () => {
  const fixture = createFixture(1107, 157);
  fixture.rows.forEach((row, i) => {
    row.payload_for_retry.adminLead = { notes: "Keep history", tasks: [{
      id: "repeated-id", status: ["open", "completed", "canceled"][i % 3], assigneeId: i % 2 ? "eva" : "manager",
      assigneeName: i % 2 ? "Eva" : "Manager", title: "Follow up", comment: "Historical task comment",
    }] };
    row.payload_for_retry.adminClient.addressBook = [{ address: row.full_address, notes: "Selected home" },
      { address: "Another address", notes: "Other home" }];
  });
  const before = structuredClone(fixture);
  const old = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ workspacePage: true })) });
  const actual = await client.fetchWorkspaceListEntries();
  assert.deepEqual(actual, await old.fetchWorkspaceListEntries());
  assert.equal(actual.length, 1108);
  assert.deepEqual(calls.map(c => c.rows), [500, 500, 108]);
  assert(calls.every(c => c.method === "POST" && c.table === "read_admin_workspace_page" && c.body.p_limit === 500));
  assert.deepEqual(fixture, before);
  const store = createQuoteOpsStore({ normalizeString, QUOTE_OPS_LEDGER_LIMIT: 250, createSupabaseQuoteOpsClient: () => client });
  await store.listWorkspaceListEntries();
  assert.deepEqual(await store.getEntry(fixture.rows[0].id), mapRowToEntry(fixture.rows[0]));
  fixture.rows[0].payload_for_retry.adminLead.tasks[0].assigneeId = "new-assignee";
  const fresh = await client.fetchWorkspaceListEntries();
  assert.equal(fresh[0].payloadForRetry.adminLead.tasks[0].assigneeId, "new-assignee");
  assert.equal(fresh[0].totalPrice, actual[0].totalPrice);
});

test("workspace RPC is an allowlisted read, so it does not invalidate unrelated request-local snapshots", async () => {
  const fixture = createFixture(2, 1);
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, [], () => ({ workspacePage: true })) });
  const owner = {};
  let reads = 0;
  await runAdminReadContext({ res: {}, route: "/admin/quote-ops" }, async () => {
    await memoAdminRead(owner, "users", "snapshot", () => { reads++; return {}; });
    await client.fetchWorkspaceListEntries();
    await memoAdminRead(owner, "users", "snapshot", () => { reads++; return {}; });
  });
  assert.equal(reads, 1);
});

test("only an initially missing RPC falls back once to the unchanged complete view reader", async () => {
  const fixture = createFixture(17, 3);
  const calls = [];
  const read = createReadFetch(fixture, [], () => ({ cap: 5 }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method });
    return read(url, options);
  } });
  for (let i = 0; i < 2; i++) assert.equal((await client.fetchWorkspaceListEntries()).length, 18);
  assert.equal(calls.filter(c => c.path.endsWith("read_admin_workspace_page")).length, 1);
  assert(calls.filter(c => !c.path.endsWith("read_admin_workspace_page"))
    .every(c => c.method === "GET" && c.path.endsWith("admin_workspace_list_entries")));
  for (const code of ["42501", "503", "PGRST205", "42883"]) {
    const paths = [];
    const denied = createSupabaseQuoteOpsClient({ env, fetch: async url => {
      paths.push(new URL(url).pathname);
      return { ok: false, status: 403, text: async () => JSON.stringify({ code, message: "Not a missing RPC" }) };
    } });
    await assert.rejects(denied.fetchWorkspaceListEntries(), /Not a missing/);
    assert.equal(paths.length, 1);
  }
});

test("invalid or partial workspace pages fail closed, without a fallback or a successful partial list", async () => {
  const row = id => ({ id, ...Object.fromEntries(WORKSPACE_PAYLOAD_KEYS.map(key => ["workspace_" + key, null])) });
  const valid = { version: 1, after: null, total: 1, rows: [row("a")] };
  const cases = [null, [], { ...valid, version: 2 }, { ...valid, after: "wrong" }, { ...valid, total: -1 },
    { ...valid, total: 1.5 }, { ...valid, total: 2 }, { ...valid, rows: [] },
    { ...valid, rows: [{ id: "a" }] }, { ...valid, total: 2, rows: [row("a"), row("a")] },
    { ...valid, total: 2, rows: [row("b"), row("a")] }, { ...valid, total: 501, rows: Array(501).fill(row("a")) }];
  for (const page of cases) {
    let requests = 0;
    const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
      requests++;
      return { ok: true, status: 200, text: async () => JSON.stringify(page) };
    } });
    await assert.rejects(client.fetchWorkspaceListEntries(), /Invalid workspace list/);
    assert.equal(requests, 1);
  }
  for (const code of ["PGRST202", "42501", "503"]) {
    const fixture = createFixture(501, 2);
    const normal = createReadFetch(fixture, [], () => ({ workspacePage: true }));
    const paths = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
      paths.push(new URL(url).pathname);
      return paths.length === 2 ? Promise.resolve({ ok: false, status: 503,
        text: async () => JSON.stringify({ code, message: "Second RPC page failed" }) }) : normal(url, options);
    } });
    await assert.rejects(client.fetchWorkspaceListEntries(), /Second RPC page failed/);
    assert.equal(paths.length, 2);
    assert(paths.every(p => p.endsWith("read_admin_workspace_page")));
  }
});

