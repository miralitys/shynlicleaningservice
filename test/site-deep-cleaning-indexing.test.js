"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer } = require("./server-test-helpers");

test("the primary Deep Cleaning page is indexable for visitors and Googlebot without opening private or ad-only routes", async () => {
  const app = await startServer();
  try {
    for (const agent of ["Mozilla/5.0", "Googlebot"]) {
      const response = await fetch(`${app.baseUrl}/services/deep-cleaning`, { headers: { "user-agent": agent } });
      assert.equal(response.status, 200);
      assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex|nofollow/i);
      const html = await response.text();
      const robots = html.match(/<meta\b[^>]*\bname=["'](?:robots|googlebot)["'][^>]*>/gi) || [];
      assert.equal(robots.length, 1, "No conflicting robots tags survive from the legacy HTML");
      assert.match(robots[0], /content="index,follow"/);
      assert.doesNotMatch(robots[0], /noindex|nofollow/i);
      assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/deep-cleaning"\s*\/?>/);
    }
    const trailingSlash = await fetch(`${app.baseUrl}/services/deep-cleaning/?utm_source=qa`, { redirect: "manual" });
    assert.equal(trailingSlash.status, 301);
    assert.equal(trailingSlash.headers.get("location"), "/services/deep-cleaning?utm_source=qa");
    const sitemap = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    assert.match(sitemap, /<loc>https:\/\/shynlicleaningservice\.com\/services\/deep-cleaning<\/loc>/);
    const robotsTxt = await (await fetch(`${app.baseUrl}/robots.txt`)).text();
    assert.doesNotMatch(robotsTxt, /^Disallow:\s*\/services\/deep-cleaning(?:\s|$)/im);
    for (const route of ["/quote", "/services/deep-cleaning/ads-lp", "/admin/login"]) {
      const html = await (await fetch(`${app.baseUrl}${route}`)).text();
      assert.match(html, /<meta\b[^>]*\bname="robots"[^>]*content="noindex[,\s]/i, route);
    }
  } finally {
    await stopServer(app.child);
  }
});
