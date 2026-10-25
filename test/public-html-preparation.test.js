"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPublicHtmlPreparer } = require("../lib/site/html-preparation");
const { createSiteSanitizer } = require("../lib/site/sanitize");
const { createSiteSeoHelpers } = require("../lib/site/seo");

const options = {
  seoOptions: { BREADCRUMB_LABELS: new Map([["/", "Home"]]), NOINDEX_ROUTES: new Set(["/quote"]),
    ROUTE_META_OVERRIDES: {}, SITE_ORIGIN: "https://shynlicleaningservice.com" },
  sanitizerOptions: { GOOGLE_TAG_MANAGER_CONTAINER_ID: "GTM-5P88N7LD", GOOGLE_PLACES_API_KEY: "" },
};
const normalizeRoute = value => {
  value = value || "/";
  if (!value.startsWith("/")) value = "/" + value;
  return value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
};
const escapeHtmlAttribute = value => String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("worker output is byte-identical to the original public sanitizer", async t => {
  const preparer = createPublicHtmlPreparer(options);
  t.after(() => preparer.close());
  const siteSeoHelpers = createSiteSeoHelpers({ ...options.seoOptions, normalizeRoute, escapeHtmlAttribute });
  const { sanitizeHtml } = createSiteSanitizer({ ...options.sanitizerOptions, normalizeRoute, siteSeoHelpers });
  const routes = require("../routes.json");
  const paths = ["/", "/naperville", "/aurora", "/westmont", "/wayne", "/pricing", "/quote",
    "/services/deep-cleaning", "/services/airbnb-cleaning", "/blog", "/ads-v2"];
  for (const route of paths) {
    const raw = fs.readFileSync(path.resolve(__dirname, "..", routes[route]), "utf8");
    const expected = sanitizeHtml(raw, route);
    const first = await preparer.prepare(raw, route, { cacheable: true });
    const cached = await preparer.prepare(raw, route, { cacheable: true });
    assert.equal(first.html, expected, route);
    assert.equal(cached.html, expected, route);
    assert.equal(first.cacheHit, false);
    assert.equal(cached.cacheHit, true);
  }
  assert.equal((await preparer.inspect()).preparations, paths.length);
});

test("prepared pages survive first-level eviction, distinguish aliases and refresh changed source", async t => {
  const preparer = createPublicHtmlPreparer(options);
  t.after(() => preparer.close());
  const raw = "<html><head></head><body>source-one</body></html>";
  const expected = new Map();
  for (let i = 0; i < 20; i++) {
    const result = await preparer.prepare(raw, `/page-${i}`, { cacheable: true });
    expected.set(i, result.html);
  }
  for (let i = 0; i < 20; i++) {
    const result = await preparer.prepare(raw, `/page-${i}`, { cacheable: true });
    assert.equal(result.cacheHit, true);
    assert.equal(result.html, expected.get(i));
  }
  assert.notEqual(expected.get(0), expected.get(1));
  const changed = await preparer.prepare(raw.replace("source-one", "source-two"), "/page-0", { cacheable: true });
  assert.equal(changed.cacheHit, false);
  assert.notEqual(changed.html, expected.get(0));
  assert.equal((await preparer.inspect()).preparations, 21);
});

test("unknown paths are not retained and the compressed byte budget is bounded", async t => {
  const preparer = createPublicHtmlPreparer({ ...options, maxCacheBytes: 100 });
  t.after(() => preparer.close());
  const raw = "<html><body>not retained</body></html>";
  for (let i = 0; i < 4; i++) await preparer.prepare(raw, `/unknown-${i}`);
  for (let i = 0; i < 4; i++) await preparer.prepare(raw, `/known-${i}`, { cacheable: true });
  const stats = await preparer.inspect();
  assert.equal(stats.entries, 0);
  assert.equal(stats.bytes, 0);
  assert.equal(stats.preparations, 8);
});

test("preparation is asynchronous and overload never falls back to synchronous/raw HTML", async t => {
  const preparer = createPublicHtmlPreparer({ ...options, maxPending: 1 });
  t.after(() => preparer.close());
  const job = preparer.prepare("<html><body>pending</body></html>", "/one");
  await assert.rejects(preparer.prepare("<html><body>other</body></html>", "/two"), { code: "PUBLIC_HTML_UNAVAILABLE" });
  let settled = false;
  job.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, "worker startup must not block the main event loop");
  await job;
});

test("compressed LRU evicts within its budget and invalid jobs do not poison the worker", async t => {
  const sample = createPublicHtmlPreparer(options);
  t.after(() => sample.close());
  const raw = "<html><head></head><body>budget sample</body></html>";
  await sample.prepare(raw, "/budget-one", { cacheable: true });
  const budget = Math.floor((await sample.inspect()).bytes * 1.5);
  const limited = createPublicHtmlPreparer({ ...options, maxCacheBytes: budget });
  t.after(() => limited.close());
  await assert.rejects(limited.prepare(null, "/invalid"), { code: "PUBLIC_HTML_UNAVAILABLE" });
  await limited.prepare(raw, "/budget-one", { cacheable: true });
  await limited.prepare(raw, "/budget-two", { cacheable: true });
  const stats = await limited.inspect();
  assert.equal(stats.entries, 1);
  assert.ok(stats.bytes <= budget);
  assert.equal((await limited.prepare(raw, "/budget-one", { cacheable: true })).cacheHit, false);
});

test("timeout and shutdown settle pending jobs and reject further work", async () => {
  const timed = createPublicHtmlPreparer({ ...options, timeoutMs: 1 });
  await assert.rejects(timed.prepare("<html></html>", "/one"), { code: "PUBLIC_HTML_UNAVAILABLE" });
  await timed.close();
  const closing = createPublicHtmlPreparer(options);
  const rejected = assert.rejects(closing.prepare("<html></html>", "/one"), { code: "PUBLIC_HTML_UNAVAILABLE" });
  await closing.close();
  await rejected;
  await assert.rejects(closing.inspect(), { code: "PUBLIC_HTML_UNAVAILABLE" });
});
