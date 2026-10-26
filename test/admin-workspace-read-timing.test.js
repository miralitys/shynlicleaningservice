"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { runAdminReadContext, getAdminReadHeaders, recordAdminReadMetric } = require("../lib/admin/read-context");
const { loadQuoteOpsWorkspaceEntries } = require("../lib/admin/pages/quote-ops-workspace-entries");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

async function capture(work) {
  const res = new EventEmitter();
  res.statusCode = 200;
  const logs = [];
  const result = await runAdminReadContext({ res, route: "/admin/quote-ops",
    logger: { log: value => logs.push(value) } }, work);
  const headers = getAdminReadHeaders(res);
  res.emit("finish");
  return { result, headers, log: logs[0] };
}

test("workspace diagnostics split HTTP, body, JSON and preparation without changing reads or complete results", async () => {
  const fixture = createFixture(1107, 157);
  const before = structuredClone(fixture);
  const calls = [];
  const normal = createReadFetch(fixture, calls, () => ({ workspacePage: true }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: async (...args) => {
    await delay(2);
    const response = await normal(...args);
    return { ...response, text: async () => { await delay(2); return response.text(); } };
  } });
  const expected = await loadQuoteOpsWorkspaceEntries({ listWorkspaceListEntries: () => client.fetchWorkspaceListEntries() });
  const expectedCalls = structuredClone(calls);
  calls.length = 0;
  const actual = await capture(() => loadQuoteOpsWorkspaceEntries({
    listWorkspaceListEntries: () => client.fetchWorkspaceListEntries(),
  }));
  assert.deepEqual(actual.result, expected);
  assert.deepEqual(calls, expectedCalls);
  assert.equal(actual.result.length, 1108);
  assert.deepEqual(fixture, before);
  const metrics = actual.log.read_metrics;
  assert.equal(metrics.workspace_requests, calls.length);
  assert.equal(metrics.workspace_count_requests, calls.length);
  assert.equal(metrics.workspace_pages, calls.length);
  assert.equal(metrics.workspace_rows, actual.result.length);
  assert.equal(metrics.workspace_bytes, calls.reduce((sum, call) => sum + call.bytes, 0));
  for (const phase of ["workspace_headers", "workspace_body", "workspace_decode", "workspace_prepare", "workspace_sort"]) {
    assert(Number.isFinite(actual.log.phases_ms[phase]), phase);
    assert.match(actual.headers["Server-Timing"], new RegExp("admin_" + phase + ";dur="));
  }
  assert(actual.log.phases_ms.workspace_headers >= 5);
  assert(actual.log.phases_ms.workspace_body >= 5);
  assert.match(actual.headers["Server-Timing"], /admin_workspace_rows;desc="1108"/);
  assert.doesNotMatch(JSON.stringify(actual.log) + JSON.stringify(actual.headers),
    /sb_secret|Test Client|2025550142|Test Street|payload_for_retry|https:|select=|order-000/);
});

test("diagnostic counters are allowlisted, numeric, request-local and absent on unrelated requests", async () => {
  recordAdminReadMetric("workspace_rows", 999);
  const plain = await capture(() => "ok");
  assert.equal(plain.result, "ok");
  assert.equal(plain.log.read_metrics, undefined);
  assert.doesNotMatch(plain.headers["Server-Timing"], /workspace/);
  const first = await capture(async () => {
    recordAdminReadMetric("workspace_rows", 7);
    for (const value of [NaN, Infinity, -1, "secret"]) recordAdminReadMetric("workspace_rows", value);
    recordAdminReadMetric("customer_phone", 123);
  });
  assert.deepEqual(first.log.read_metrics, { workspace_rows: 7 });
  const second = await capture(() => recordAdminReadMetric("workspace_rows", 2));
  assert.deepEqual(second.log.read_metrics, { workspace_rows: 2 });
});

test("failed HTTP/body/JSON reads stay failures and retain timing without partial success", async () => {
  for (const stage of ["headers", "body", "decode"]) {
    const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
      if (stage === "headers") throw new Error("read failed");
      return { ok: true, status: 200, text: async () => {
        if (stage === "body") throw new Error("body failed");
        return "{broken";
      } };
    } });
    const res = new EventEmitter();
    const logs = [];
    await assert.rejects(runAdminReadContext({ res, route: "/admin/quote-ops",
      logger: { log: value => logs.push(value) } }, () => client.fetchWorkspaceListEntries()));
    res.emit("finish");
    assert.equal(logs[0].read_metrics.workspace_requests, 1);
    assert.equal(logs[0].read_metrics.workspace_pages, undefined);
    assert(Number.isFinite(logs[0].phases_ms["workspace_" + stage]));
  }
});

