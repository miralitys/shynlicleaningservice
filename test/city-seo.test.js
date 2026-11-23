"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CITY_PAGES, inspectHtml } = require("../lib/site/structured-data");
const { citySeoLastmod } = require("../lib/site/city-seo");
const { startServer, stopServer } = require("./server-test-helpers");

const origin = "https://shynlicleaningservice.com";
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.childNodes.map(child => child.value || "").join("");
const targets = {
  "/addison": ["Addison, IL House Cleaning | Insured Cleaners | Shynli", "Addison house cleaning: regular, deep and move-in/move-out. Insured, carefully selected cleaners bring all supplies. Get a free quote online."],
  "/aurora": ["Aurora, IL House Cleaning & Move-Out Cleaning | Shynli", "Aurora house cleaning for apartments, townhomes and houses: regular, deep and move-out cleaning. Insured cleaners bring all supplies. Free quote online."],
  "/naperville": ["Naperville, IL House Cleaning & Deep Cleaning | Shynli", "Naperville house cleaning for condos, apartments and houses: deep, regular and move-in/move-out. Insured cleaners bring all supplies. Free quote."],
  "/sugargrove": ["Sugar Grove, IL Residential Cleaning Services | Shynli", "Residential cleaning in Sugar Grove: regular, deep and move-in/move-out. Insured, carefully selected cleaners bring all supplies. Free quote online."],
  "/geneva": ["House Cleaning Services in Geneva, IL | Shynli Cleaning", "Professional house cleaning services in Geneva, IL. Regular, deep, move-in and move-out cleaning for local homes. Get a fast free quote from Shynli Cleaning."],
};

test("city metadata release dates apply to exactly 50 city routes and reject invalid dates", () => {
  for (const deployedAt of [null, "", "2026-02-30", "2026-11-23T12:00:00Z"]) {
    assert.deepEqual(citySeoLastmod({ deployedAt }), []);
  }
  const deployedAt = "2031-05-17";
  const result = citySeoLastmod({ deployedAt });
  const routes = CITY_PAGES.map(([route]) => route).filter(route => route !== "/geneva").sort();
  assert.equal(result.length, 50);
  assert.deepEqual(result.slice().sort(([a],[b])=>a<b?-1:a>b?1:0), routes.map(route=>[route,deployedAt]));
});

test("city pages serve local metadata and matching Service descriptions without replacing canonical URLs", async () => {
  const app = await startServer({ env: { HTML_CACHE_WARM_MODE: "off" } });
  try {
    assert.equal(CITY_PAGES.length, 51);
    const titles = new Set();
    for (const [route, city] of CITY_PAGES) {
      const response = await fetch(app.baseUrl + route);
      assert.equal(response.status, 200, route);
      const { nodes, scripts } = inspectHtml(await response.text());
      const one = predicate => {
        const matches = nodes.filter(node => node.parentNode?.tagName === "head" && predicate(node));
        assert.equal(matches.length, 1, route);
        return matches[0];
      };
      const meta = (key, name) => attr(one(node => node.tagName === "meta" && attr(node, key) === name), "content");
      const title = text(one(node => node.tagName === "title"));
      const description = meta("name", "description");
      if (targets[route]) assert.deepEqual([title, description], targets[route], route);
      if (route !== "/geneva") {
        assert.ok(title.startsWith(`${city}, IL `), route);
        assert.ok(title.length <= 60 && description.length <= 155, route);
        assert.doesNotMatch(title + description, /[\u2013\u2014]|300\+/, route);
      }
      assert.equal(meta("property", "og:title"), title, route);
      assert.equal(meta("property", "og:description"), description, route);
      assert.equal(attr(one(node => node.tagName === "link" && attr(node, "rel") === "canonical"), "href"), origin + route);
      const service = scripts.filter(node => attr(node, "id") === "schema-service").map(node => JSON.parse(text(node)));
      assert.equal(service.length, 1, route);
      assert.equal(service[0].description, description, route);
      assert.equal(service[0].url, origin + route, route);
      titles.add(title);
    }
    assert.equal(titles.size, 51);
  } finally { await stopServer(app.child); }
});
