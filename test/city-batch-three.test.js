"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cities, order } = require("../lib/site/city-batch-three-data");
const { applyCityBatchThree, cityBatchThreeLastmod } = require("../lib/site/city-batch-three");
const { sharedFaq, cities: mainCities } = require("../lib/site/city-editorial-data");
const { cities: batchOneCities } = require("../lib/site/city-batch-one-data");
const { cities: batchTwoCities } = require("../lib/site/city-batch-two-data");
const { markup, mainText, similarity } = require("../scripts/audit-naperville-pilot");
const { counts } = require("../scripts/audit-city-editorial");
const { validateWater } = require("../scripts/audit-city-batch-three");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { parse } = require("parse5");
const { startServer, stopServer } = require("./server-test-helpers");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const oldSlugs = ["naperville", ...Object.keys(mainCities), ...Object.keys(batchOneCities), ...Object.keys(batchTwoCities)];

test("batch-three route and date allowlists leave all twenty-eight prior editions alone", () => {
  const source = fs.readFileSync(path.join(__dirname, "../page123500105.html"), "utf8");
  for (const route of [...oldSlugs.map(slug => `/${slug}`), "/", "/pricing", "/quote", "/elmhurst", "/bristol/ads", "/constructor"])
    assert.equal(applyCityBatchThree(source, route), source, route);
  assert.equal(applyCityBatchThree("<main>Other template</main>", "/bristol"), "<main>Other template</main>");
  assert.equal(Object.keys(cities).length, 12);
  for (const deployedAt of [null, "", "bad", "2026-02-30"]) assert.deepEqual(cityBatchThreeLastmod({ deployedAt }), []);
  assert.deepEqual(cityBatchThreeLastmod({ deployedAt: "2026-10-22" }), Object.keys(cities).map(slug => [`/${slug}`, "2026-10-22"]));
});

test("batch-three water validation rejects unsupported adjectives and numerical claims", () => {
  assert.equal(validateWater("bigrock", "Well water with hardness of 16 grains per gallon."), false);
  assert.equal(validateWater("northaurora", "hard water, 16 grains per gallon, 16 grains per gallon"), false);
  assert.equal(validateWater("northaurora", "hardness 18 grains per gallon and 18 grains per gallon"), false);
  assert.equal(validateWater("northaurora", "hardness 16 grains per gallon and 16 grains per gallon"), true);
  assert.equal(validateWater("channahon", "hardness 18-20 grains per gallon and 18-20 grains per gallon"), true);
  assert.equal(validateWater("homerglen", "Every home uses Lake Michigan water."), false);
});

test("twelve batch-three pages preserve facts, forms, reviews, schema and 40-page uniqueness", async () => {
  const app = await startServer();
  try {
    const pages = {};
    for (const slug of [...oldSlugs, ...Object.keys(cities)]) {
      const response = await fetch(app.baseUrl + `/${slug}`);
      assert.equal(response.status, 200, slug);
      pages[slug] = await response.text();
    }
    const reviews = html => markup(html, node => cls(node, "clients-say-home__text") || cls(node, "clients-say-home__name")).map(source => visibleText(parse(source)));
    for (const [slug, city] of Object.entries(cities)) {
      const html = pages[slug], text = mainText(html);
      assert.equal(applyCityBatchThree(html, `/${slug}`), html);
      assert.doesNotMatch(html, /300\+|300 plus|Fox Valley|typical home|most booked|booked most|same-day|less than 60 seconds/i);
      const withoutReviews = html.replace(markup(html, node => attr(node, "id") === "city-editorial-reviews")[0], "");
      assert.doesNotMatch(mainText(withoutReviews), /look no further|nestled|top-notch|[\u2013\u2014]|in this brief/i);
      const words = text.split(/\s+/).length;
      assert.ok(words >= 1300 && words <= 1400, `${slug}: ${words}`);
      assert.deepEqual(reviews(html), reviews(pages.naperville), slug);
      assert.equal(markup(html, node => attr(node, "data-city-review") !== undefined).length, 23);
      assert.deepEqual(markup(html, node => cls(node, "sg-rating")), markup(pages.naperville, node => cls(node, "sg-rating")));
      assert.deepEqual(counts(html, city).outsideFaq, { bookingPreference: 0, countyStatement: 1, supplies: 1, parking: 1, typicalHome: 0 }, slug);
      for (const zip of city.zips) assert.ok(text.includes(zip));
      assert.deepEqual(markup(html, node => cls(node, "sg-service-card")).map(card => card.match(/href="([^"]+)"/)[1]), order.map(service => `/services/${service}`));
      const facts = inspectHtml(html);
      assert.deepEqual(facts.faq.map(item => [item.name, item.acceptedAnswer.text]), [...city.faq, ...sharedFaq]);
      const schemas = facts.scripts.map(node => JSON.parse((node.childNodes || []).map(child => child.value || "").join("")));
      assert.deepEqual(schemas.find(schema => schema["@type"] === "FAQPage").mainEntity, facts.faq);
      assert.equal(validateWater(slug, text), true, slug);
      if (["bigrock", "montgomery", "bristol"].includes(slug)) { assert.doesNotMatch(text, /\bwater\b/i); assert.equal(facts.faq.length, 6); }
      else assert.equal(facts.faq.length, 7);
      if (slug === "bristol") {
        assert.match(text, /Bristol is an unincorporated community/);
        assert.doesNotMatch(text, /\b(?:village|town|city) of Bristol\b|Bristol (?:village|town|city)|Bristol is (?:a|the) (?:village|town|city)/i);
      }
      if (slug === "minooka") assert.match(text, /where Grundy, Kendall and Will counties meet/);
      if (["minooka", "channahon"].includes(slug)) assert.match(text, /planned for 2030/);
      if (slug === "darien") assert.match(text, /purchased from the City of Chicago/);
      if (slug === "burrridge") assert.match(text, /through the Village of Bedford Park/);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-quote-form") !== undefined).length, 1);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-zip-form") !== undefined).length, 1);
      assert.match(html, /action="\/quote" method="get"/);
      assert.equal(text.split("we check the schedule and confirm the soonest date").length - 1, 1);
    }
    for (const [left, html] of Object.entries(pages)) for (const [right, other] of Object.entries(pages)) if (left < right)
      assert.ok(similarity(html, other) < 40, `${left}/${right}: ${similarity(html, other).toFixed(2)}%`);
  } finally { await stopServer(app.child); }
});
