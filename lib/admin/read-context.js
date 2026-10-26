"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
const { randomUUID } = require("node:crypto");

const contexts = new AsyncLocalStorage();
const readMetrics = new Set(["workspace_requests", "workspace_pages", "workspace_rows", "workspace_bytes",
  "workspace_count_requests", "workspace_fallbacks"]);
const responses = new WeakMap();
const labels = new Set(["auth", "menu", "page", "ledger", "staff", "users", "clone", "decode",
  "orders_fetch", "orders_decode", "orders_hydrate", "orders_clients", "orders_sources",
  "orders_projection", "orders_staff_context", "orders_planning", "orders_filter", "orders_counts",
  "orders_html", "orders_funnel", "orders_table", "orders_dialog", "orders_create_form",
  "workspace_headers", "workspace_body", "workspace_decode", "workspace_prepare", "workspace_sort",
  "workspace_fallback", "workspace_filter", "workspace_tasks"]);

function recordAdminReadMetric(name, value = 1) {
  const context = contexts.getStore();
  if (!context || context.closed || !readMetrics.has(name) || !Number.isFinite(value) || value < 0) return;
  if (!context.metrics) context.metrics = new Map();
  context.metrics.set(name, (context.metrics.get(name) || 0) + value);
}

function measureAdminRead(name, work) {
  const context = contexts.getStore();
  if (!context || context.closed || !labels.has(name)) return work();
  const started = performance.now();
  const finish = () => context.phases.set(name, (context.phases.get(name) || 0) + performance.now() - started);
  try {
    const result = work();
    if (result && typeof result.then === "function") return result.then(value => {
      finish(); return value;
    }, error => { finish(); throw error; });
    finish();
    return result;
  } catch (error) { finish(); throw error; }
}

function setAdminLedgerReadLimit(limit) {
  const context = contexts.getStore();
  if (context && !context.closed) context.ledgerLimit = Math.max(0, Math.min(Number(limit) || 0, 1000));
}

function getAdminLedgerReadLimit(limit) {
  const context = contexts.getStore();
  return Math.max(limit, context && !context.closed ? context.ledgerLimit : 0);
}

function invalidateAdminReads() {
  const context = contexts.getStore();
  if (!context || context.closed) return;
  // Some legacy GET screens synchronize external data. Never reuse a pre-write snapshot.
  context.invalidated = true;
  context.cache = new WeakMap();
}

function reuseAdminRead(owner, name, key, work, consume, uncached = consume) {
  const context = contexts.getStore();
  if (!context || context.closed || context.invalidated) return Promise.resolve(measureAdminRead(name, work)).then(uncached);
  let reads = context.cache.get(owner);
  if (!reads) { reads = new Map(); context.cache.set(owner, reads); }
  const cacheKey = `${name}:${key}`;
  let pending = reads.get(cacheKey);
  if (pending) context.hits++;
  else {
    context.reads++;
    pending = Promise.resolve().then(() => measureAdminRead(name, work));
    reads.set(cacheKey, pending);
    pending.catch(() => { if (reads.get(cacheKey) === pending) reads.delete(cacheKey); });
  }
  return pending.then(consume).catch(error => {
    if (reads.get(cacheKey) === pending) reads.delete(cacheKey);
    throw error;
  });
}

function memoAdminRead(owner, name, key, work, select = value => value) {
  // Consumers historically received independent objects, including secrets-bearing snapshots.
  return reuseAdminRead(owner, name, key, work,
    value => measureAdminRead("clone", () => structuredClone(select(value))), select);
}

function memoAdminJsonRead(owner, name, key, work, select = value => value) {
  // Cache only immutable response text; JSON.parse gives each reader its own object graph.
  return reuseAdminRead(owner, name, `json:${key}`, work,
    text => measureAdminRead("decode", () => select(text ? JSON.parse(text) : null)));
}

function runAdminReadContext({ res, logger, route }, work) {
  const started = performance.now();
  const context = { id: randomUUID(), route, cache: new WeakMap(), phases: new Map(), ledgerLimit: 0,
    reads: 0, hits: 0, invalidated: false, closed: false };
  const close = () => { context.closed = true; context.cache = new WeakMap(); };
  const snapshot = () => ({ request_id: context.id, route,
    phases_ms: Object.fromEntries(Array.from(context.phases, ([name, ms]) => [name, Number(ms.toFixed(2))])),
    reads: context.reads, read_hits: context.hits, invalidated: context.invalidated,
    ...(context.metrics?.size ? { read_metrics: Object.fromEntries(context.metrics) } : {}) });
  responses.set(res, snapshot);
  if (typeof res.once === "function") res.once("finish", () => {
    try { logger?.log?.({ type: "admin_request_timing", ...snapshot(), status: res.statusCode,
      elapsed_ms: Number((performance.now() - started).toFixed(2)) }); }
    catch { /* Diagnostics must not affect a response. */ }
    finally { close(); }
  });
  try { return Promise.resolve(contexts.run(context, work)).finally(close); }
  catch (error) { close(); throw error; }
}

function getAdminReadHeaders(res) {
  const data = responses.get(res)?.();
  return data ? {
    "X-Shynli-Admin-Request-Id": data.request_id,
    "Server-Timing": Object.entries(data.phases_ms).map(([name, ms]) => `admin_${name};dur=${ms.toFixed(2)}`)
      .concat(`admin_reads;desc="${data.reads}"`, `admin_read_hits;desc="${data.read_hits}"`,
        Object.entries(data.read_metrics || {}).map(([name, value]) => `admin_${name};desc="${value}"`)).flat().join(", "),
  } : {};
}

module.exports = { runAdminReadContext, memoAdminRead, memoAdminJsonRead, measureAdminRead, recordAdminReadMetric, getAdminReadHeaders,
  setAdminLedgerReadLimit, getAdminLedgerReadLimit, invalidateAdminReads };
