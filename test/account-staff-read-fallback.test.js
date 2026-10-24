"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseAdminStaffClient, QUOTE_OPS_ASSIGNMENT_KIND } = require("../lib/supabase-admin-staff");
const { createSectionFixture, createSectionFetch } = require("./support/account-section-fixture.cjs");
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const missing = { status: 404, body: { code: "PGRST205", message: "Could not find the table admin_staff_assignments" } };
function harness(count = 1107) {
  const fixture = createSectionFixture(count, 107);
  const calls = [];
  const state = { primaryError: missing, cap: 23 };
  const fetch = createSectionFetch(fixture, calls, () => state);
  const client = createSupabaseAdminStaffClient({ env, fetch });
  return { fixture, calls, state, fetch, client };
}
const probes = calls => calls.filter(row => row.table.startsWith("admin_staff"));

test("remembered read fallback retains all 1107 assignments, both team members and fresh history", async () => {
  const h = harness();
  const before = JSON.stringify(h.fixture);
  const first = await h.client.fetchAccountSnapshot("a");
  const initialProbes = probes(h.calls).length;
  assert.equal(first.assignments.length, 1107);
  assert.ok(first.assignments.some(row => row.entryId === "order-01106"));
  assert.ok(first.assignments.every(row => row.staffIds.join(",") === "a,b"));
  assert.deepEqual(await h.client.fetchAccountSnapshot("a"), first);
  assert.equal((await h.client.fetchAccountSnapshot("b")).assignments.length, 1108);
  assert.equal((await h.client.fetchSnapshot()).staff.length, 2);
  assert.equal(probes(h.calls).length, initialProbes);
  assert.equal(JSON.stringify(h.fixture), before, "schema detection does not mutate any record");
  const row = h.fixture.rows.find(row => row.kind === QUOTE_OPS_ASSIGNMENT_KIND && row.request_id === "order-01106");
  row.payload_for_retry.assignment.staffIds = ["b"];
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 1106);
  assert.equal((await h.client.fetchAccountSnapshot("b")).assignments.length, 1108);
  assert.equal(probes(h.calls).length, initialProbes, "fresh data does not require another schema probe");
  assert.ok(h.calls.every(row => row.method === "GET"));
});

test("simultaneous first reads discover the backend once without sharing employee snapshots", async () => {
  const h = harness(50);
  h.state.cap = 100;
  h.state.delayMs = 2;
  const [a, b, all, again] = await Promise.all([h.client.fetchAccountSnapshot("a"),
    h.client.fetchAccountSnapshot("b"), h.client.fetchSnapshot(), h.client.fetchAccountSnapshot("a")]);
  assert.equal(probes(h.calls).filter(row => row.status === 404).length, 1);
  assert.equal(a.assignments.length, 50);
  assert.equal(b.assignments.length, 51);
  assert.equal(all.assignments.length, 51);
  assert.deepEqual(again, a);
});

for (const error of [
  { status: 403, body: { code: "42501", message: "Permission denied" } },
  { status: 503, body: { message: "Database temporarily unavailable" } },
]) test(`HTTP ${error.status} is not mistaken for a missing table or cached as a fallback`, async () => {
  const h = harness(10);
  h.state.primaryError = error;
  await assert.rejects(h.client.fetchAccountSnapshot("a"));
  assert.ok(!h.calls.some(row => row.table === "quote_ops_entries"));
  const tried = probes(h.calls).length;
  h.state.primaryError = null;
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 10);
  assert.ok(probes(h.calls).length > tried);
  h.state.primaryError = missing;
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 10);
  const detected = probes(h.calls).length;
  await h.client.fetchAccountSnapshot("a");
  assert.equal(probes(h.calls).length, detected);
});

test("fallback outages fail visibly and are never served as stale snapshots", async () => {
  const h = harness(10);
  const first = await h.client.fetchAccountSnapshot("a");
  const tried = probes(h.calls).length;
  h.state.fallbackError = true;
  await assert.rejects(h.client.fetchAccountSnapshot("a"), /unavailable/);
  await assert.rejects(h.client.fetchSnapshot(), /unavailable/);
  assert.equal(probes(h.calls).length, tried);
  h.state.fallbackError = false;
  assert.deepEqual(await h.client.fetchAccountSnapshot("a"), first);
});

test("failed first fallback releases discovery waiters and retries only fresh fallback reads", async () => {
  const h = harness(10);
  h.state.fallbackError = true;
  const failures = await Promise.allSettled([h.client.fetchAccountSnapshot("a"), h.client.fetchAccountSnapshot("b")]);
  assert.ok(failures.every(row => row.status === "rejected"));
  assert.equal(probes(h.calls).filter(row => row.status === 404).length, 1);
  h.state.fallbackError = false;
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 10);
});

test("network errors release discovery and do not select another backend", async () => {
  const h = harness(10);
  let fail = true;
  const client = createSupabaseAdminStaffClient({ env, fetch: (url, options) => {
    if (fail && new URL(url).pathname.endsWith("/admin_staff_assignments")) {
      throw new Error("Network disconnected");
    }
    return h.fetch(url, options);
  } });
  await assert.rejects(client.fetchAccountSnapshot("a"), /disconnected/);
  assert.ok(!h.calls.some(row => row.table === "quote_ops_entries"));
  fail = false;
  assert.equal((await client.fetchAccountSnapshot("a")).assignments.length, 10);
});

test("a successful dedicated backend is read fresh and never hides a permission error", async () => {
  const h = harness(10);
  h.state.primaryError = null;
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 10);
  h.fixture.assignments[0].staff_ids = ["b"];
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 9);
  h.state.primaryError = { status: 403, body: { code: "42501", message: "Permission denied" } };
  await assert.rejects(h.client.fetchAccountSnapshot("a"), /Permission denied/);
  assert.ok(!h.calls.some(row => row.table === "quote_ops_entries"));
});

test("incompatible schemas use the same known fallback while a new client detects installed tables again", async () => {
  const h = harness(10);
  h.state.primaryError = { status: 400, body: { message: "column staff_ids does not exist" } };
  await h.client.fetchAccountSnapshot("a");
  const tried = probes(h.calls).length;
  await h.client.fetchSnapshot();
  assert.equal(probes(h.calls).length, tried);
  h.state.primaryError = null;
  const fresh = createSupabaseAdminStaffClient({ env, fetch: h.fetch });
  assert.equal((await fresh.fetchAccountSnapshot("a")).assignments.length, 10);
  assert.ok(probes(h.calls).length > tried);
});

test("remembering a read backend does not reroute assignment writes", async () => {
  const h = harness(10);
  const writes = [];
  const client = createSupabaseAdminStaffClient({ env, fetch: async (url, options) => {
    if (options.method === "GET") return h.fetch(url, options);
    writes.push({ url, method: options.method });
    return { ok: true, status: 200, text: async () => "[]" };
  } });
  await client.fetchAccountSnapshot("a");
  await client.upsertAssignment({ entryId: "synthetic", staffIds: ["a"], status: "confirmed" });
  assert.equal(writes.length, 1);
  assert.match(writes[0].url, /\/admin_staff_assignments\?/);
  assert.equal(writes[0].method, "POST");
});
