"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startServer, stopServer } = require("./server-test-helpers");

const content = fs.readFileSync(path.join(__dirname, "..", "llms.txt"), "utf8");
const links = [...content.matchAll(/^- \[[^\]]+\]\((https:\/\/[^)]+)\): .+$/gm)].map(match => new URL(match[1]));
let server;

test.before(async () => {
  server = await startServer({ env: { HTML_CACHE_WARM_MODE: "off" } });
});
test.after(async () => {
  await stopServer(server?.child);
});

test("llms.txt is a concise Markdown navigator with canonical public links", () => {
  assert.match(content, /^# Shynli Cleaning Service\n\n> /);
  assert.equal((content.match(/^# /gm) || []).length, 1);
  assert.ok(Buffer.byteLength(content) < 8192);
  assert.equal(links.length, 19);
  for (const url of links) {
    assert.equal(url.origin, "https://shynlicleaningservice.com");
    assert.equal(url.search, "");
    assert.doesNotMatch(url.pathname, /^\/(?:admin|account|api)(?:\/|$)|ads|cleaners-near-me/);
  }
  assert.match(content, /does not replace access controls, grant a content license/);
});

test("GET and HEAD serve llms.txt as UTF-8 text with short caching and conditional requests", async () => {
  const response = await fetch(`${server.baseUrl}/llms.txt`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/plain; charset=utf-8$/);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.match(response.headers.get("cdn-cache-control"), /s-maxage=600/);
  assert.equal(await response.text(), content);
  const head = await fetch(`${server.baseUrl}/llms.txt`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("etag"), response.headers.get("etag"));
  const cached = await fetch(`${server.baseUrl}/llms.txt`, { headers: { "If-None-Match": response.headers.get("etag") } });
  assert.equal(cached.status, 304);
});

test("navigator destinations exist without redirects, and llms.txt is not a sitemap page", async () => {
  for (const url of links) {
    const response = await fetch(`${server.baseUrl}${url.pathname}`, { redirect: "manual" });
    assert.equal(response.status, 200, url.pathname);
    await response.arrayBuffer();
  }
  const sitemap = await (await fetch(`${server.baseUrl}/sitemap.xml`)).text();
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/llms\.txt<\/loc>/);
  for (const privateFile of ["/package.json", "/server.js", "/lib/site/assets.js"]) {
    const response = await fetch(`${server.baseUrl}${privateFile}`);
    assert.equal(response.status, 404, privateFile);
    await response.arrayBuffer();
  }
});
