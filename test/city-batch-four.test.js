"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cities, order } = require("../lib/site/city-batch-four-data");
const { applyCityBatchFour, cityBatchFourLastmod } = require("../lib/site/city-batch-four");
const { sharedFaq, cities: mainCities } = require("../lib/site/city-editorial-data");
const { cities: batchOneCities } = require("../lib/site/city-batch-one-data");
const { cities: batchTwoCities } = require("../lib/site/city-batch-two-data");
const { cities: batchThreeCities } = require("../lib/site/city-batch-three-data");
const { markup, mainText, similarity } = require("../scripts/audit-naperville-pilot");
const { counts } = require("../scripts/audit-city-editorial");
const { validateWater } = require("../scripts/audit-city-batch-four");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { parse } = require("parse5");
const { startServer, stopServer } = require("./server-test-helpers");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const oldSlugs = ["naperville", ...[mainCities, batchOneCities, batchTwoCities, batchThreeCities].flatMap(batch => Object.keys(batch))];

test("batch-four route and date allowlists leave all forty prior editions alone", () => {
  const source = fs.readFileSync(path.join(__dirname, "../page123500105.html"), "utf8");
  for (const route of [...oldSlugs.map(slug => `/${slug}`), "/", "/pricing", "/quote", "/wayne/ads", "/constructor"])
    assert.equal(applyCityBatchFour(source, route), source, route);
  assert.equal(applyCityBatchFour("<main>Other template</main>", "/wayne"), "<main>Other template</main>");
  assert.equal(Object.keys(cities).length, 11);
  assert.deepEqual(Object.keys(cities), ["bartlett", "clarendonhills", "elmhurst", "hinsdale", "itasca", "streamwood", "villapark", "wayne", "willowbrook", "winfield", "wooddale"]);
  for (const deployedAt of [null, "", "bad", "2026-02-30"]) assert.deepEqual(cityBatchFourLastmod({ deployedAt }), []);
  assert.deepEqual(cityBatchFourLastmod({ deployedAt: "2026-10-22" }), Object.keys(cities).map(slug => [`/${slug}`, "2026-10-22"]));
  assert.deepEqual(cityBatchFourLastmod(), cityBatchFourLastmod(require("../lib/site/city-batch-four-release.json")));
});

test("batch-four water validation keeps the Elmhurst qualifier and Wayne private wells", () => {
  assert.equal(validateWater("winfield", "hard water"), false);
  assert.equal(validateWater("itasca", "hardness of about 8 grains per gallon"), false);
  assert.equal(validateWater("elmhurst", "hardness of 8 grains per gallon; hardness of 8 grains per gallon"), false);
  assert.equal(validateWater("elmhurst", "hardness of about 8 grains per gallon; hardness of about 8 grains per gallon"), true);
  assert.equal(validateWater("wayne", "Most homes in Wayne are on private wells. Most homes in Wayne are on private wells."), true);
  for (const unsupported of ["Lake Michigan", "water report", "city water", "hardness of 8 grains per gallon"])
    assert.equal(validateWater("wayne", `Most homes in Wayne are on private wells. Most homes in Wayne are on private wells. ${unsupported}`), false);
});

test("eleven batch-four pages preserve facts, forms, reviews, schema and 51-page uniqueness", async () => {
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
      assert.equal(applyCityBatchFour(html, `/${slug}`), html);
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
      if (slug === "hinsdale") { assert.doesNotMatch(text, /\bwater\b/i); assert.equal(facts.faq.length, 6); }
      else assert.equal(facts.faq.length, 7);
      if (slug === "wayne") assert.doesNotMatch(text, /Lake Michigan|water report|city water/i);
      if (slug === "streamwood") assert.match(text, /purchases its Lake Michigan water from the City of Chicago/);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-quote-form") !== undefined).length, 1);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-zip-form") !== undefined).length, 1);
      assert.match(html, /action="\/quote" method="get"/);
      assert.equal(text.split("we check the schedule and confirm the soonest date").length - 1, 1);
    }
    for (const [left, html] of Object.entries(pages)) for (const [right, other] of Object.entries(pages)) if (left < right)
      assert.ok(similarity(html, other) < 40, `${left}/${right}: ${similarity(html, other).toFixed(2)}%`);
  } finally { await stopServer(app.child); }
});
