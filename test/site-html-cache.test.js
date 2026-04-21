"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createSiteStaticHelpers } = require("../lib/site/assets");

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    end(chunk = "") {
      this.body = String(chunk || "");
    },
  };
}

function writeHeadWithTiming(res, statusCode, headers) {
  res.statusCode = statusCode;
  res.headers = headers;
}

async function createFixtureSite(files) {
  const siteDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-html-cache-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(siteDir, relativePath);
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, content, "utf8");
  }
  return siteDir;
}

test("html cache keeps most recently used entries under the entry limit", async (t) => {
  const siteDir = await createFixtureSite({
    "404.html": "<html><body>missing</body></html>",
    "one.html": "<html><body>one</body></html>",
    "two.html": "<html><body>two</body></html>",
    "three.html": "<html><body>three</body></html>",
  });
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

  const helpers = createSiteStaticHelpers({
    CONTENT_TYPES: { ".html": "text/html; charset=utf-8" },
    HTML_CACHE_WARM_MODE: "off",
    HTML_CACHE_MAX_ENTRIES: 2,
    HTML_CACHE_MAX_TOTAL_BYTES: 1024 * 1024,
    IMAGE_EXTENSIONS: new Set(),
    NEGOTIATED_IMAGE_VARY: "Accept",
    NOINDEX_ROUTES: new Set(),
    NOT_FOUND_PAGE: "404.html",
    SITE_DIR: siteDir,
    fs,
    fsp,
    path,
    sanitizeHtml: (html) => html,
    writeHeadWithTiming,
  });

  const routes = {
    "/one": "one.html",
    "/two": "two.html",
    "/three": "three.html",
  };
  const runtimeIndex = await helpers.buildRuntimeIndex(routes);
  const { htmlCache } = await helpers.warmHtmlCache(runtimeIndex);

  async function requestRoute(routePath) {
    const absolutePath = runtimeIndex.routeFileByPath.get(routePath);
    const req = { headers: {} };
    const res = createMockResponse();
    const requestContext = { route: routePath, cacheHit: false };
    await helpers.sendFile(req, res, absolutePath, htmlCache, runtimeIndex, requestContext, 0n);
    return { res, requestContext };
  }

  let result = await requestRoute("/one");
  assert.equal(result.requestContext.cacheHit, false);

  result = await requestRoute("/two");
  assert.equal(result.requestContext.cacheHit, false);

  result = await requestRoute("/one");
  assert.equal(result.requestContext.cacheHit, true);

  result = await requestRoute("/three");
  assert.equal(result.requestContext.cacheHit, false);

  const cachedKeys = Array.from(htmlCache.entries.keys());
  assert.equal(cachedKeys.length, 2);
  assert.ok(cachedKeys.some((key) => key.endsWith("one.html::/one")));
  assert.ok(cachedKeys.some((key) => key.endsWith("three.html::/three")));
  assert.ok(cachedKeys.every((key) => !key.endsWith("two.html::/two")));
});

test("html cache evicts entries that would exceed the byte budget", async (t) => {
  const siteDir = await createFixtureSite({
    "404.html": "<html><body>missing</body></html>",
    "alpha.html": `<html><body>${"a".repeat(180)}</body></html>`,
    "beta.html": `<html><body>${"b".repeat(180)}</body></html>`,
  });
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

  const helpers = createSiteStaticHelpers({
    CONTENT_TYPES: { ".html": "text/html; charset=utf-8" },
    HTML_CACHE_WARM_MODE: "off",
    HTML_CACHE_MAX_ENTRIES: 10,
    HTML_CACHE_MAX_TOTAL_BYTES: 1100,
    IMAGE_EXTENSIONS: new Set(),
    NEGOTIATED_IMAGE_VARY: "Accept",
    NOINDEX_ROUTES: new Set(),
    NOT_FOUND_PAGE: "404.html",
    SITE_DIR: siteDir,
    fs,
    fsp,
    path,
    sanitizeHtml: (html) => html,
    writeHeadWithTiming,
  });

  const routes = {
    "/alpha": "alpha.html",
    "/beta": "beta.html",
  };
  const runtimeIndex = await helpers.buildRuntimeIndex(routes);
  const { htmlCache } = await helpers.warmHtmlCache(runtimeIndex);

  async function requestRoute(routePath) {
    const absolutePath = runtimeIndex.routeFileByPath.get(routePath);
    const req = { headers: {} };
    const res = createMockResponse();
    const requestContext = { route: routePath, cacheHit: false };
    await helpers.sendFile(req, res, absolutePath, htmlCache, runtimeIndex, requestContext, 0n);
    return requestContext;
  }

  await requestRoute("/alpha");
  assert.equal(htmlCache.entries.size, 1);
  assert.ok(htmlCache.totalBytes <= htmlCache.maxTotalBytes);

  await requestRoute("/beta");
  assert.equal(htmlCache.entries.size, 1);
  assert.ok(htmlCache.totalBytes <= htmlCache.maxTotalBytes);
  const cachedKeys = Array.from(htmlCache.entries.keys());
  assert.ok(cachedKeys.some((key) => key.endsWith("beta.html::/beta")));
  assert.ok(cachedKeys.every((key) => !key.endsWith("alpha.html::/alpha")));
});
