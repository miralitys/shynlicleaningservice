"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cities, order } = require("../lib/site/city-batch-two-data");
const { applyCityBatchTwo, cityBatchTwoLastmod } = require("../lib/site/city-batch-two");
const { sharedFaq, cities: mainCities } = require("../lib/site/city-editorial-data");
const { cities: batchOneCities } = require("../lib/site/city-batch-one-data");
const { markup, mainText, similarity } = require("../scripts/audit-naperville-pilot");
const { counts } = require("../scripts/audit-city-editorial");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { parse } = require("parse5");
const { startServer, stopServer } = require("./server-test-helpers");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);

test("batch-two routes and dates leave all eighteen existing city editions alone", () => {
  const source = fs.readFileSync(path.join(__dirname, "../page123500105.html"), "utf8");
  for (const route of ["/naperville", ...Object.keys(mainCities).map(slug => `/${slug}`), ...Object.keys(batchOneCities).map(slug => `/${slug}`), "/", "/pricing", "/bristol", "/joliet/ads", "/constructor"])
    assert.equal(applyCityBatchTwo(source, route), source, route);
  assert.equal(applyCityBatchTwo("<main>Different template</main>", "/joliet"), "<main>Different template</main>");
  assert.equal(Object.keys(cities).length, 10);
  for (const deployedAt of [null, "", "bad", "2026-02-30"]) assert.deepEqual(cityBatchTwoLastmod({ deployedAt }), []);
  assert.deepEqual(cityBatchTwoLastmod({ deployedAt: "2026-10-22" }), Object.keys(cities).map(slug => [`/${slug}`, "2026-10-22"]));
});

test("ten batch-two pages preserve facts, reviews, forms, schema and 28-page uniqueness", async () => {
  const app = await startServer();
  try {
    const pages = {};
    for (const slug of ["naperville", ...Object.keys(mainCities), ...Object.keys(batchOneCities), ...Object.keys(cities)]) {
      const response = await fetch(app.baseUrl + `/${slug}`);
      assert.equal(response.status, 200, slug);
      pages[slug] = await response.text();
    }
    const reviews = html => markup(html, node => cls(node, "clients-say-home__text") || cls(node, "clients-say-home__name")).map(source => visibleText(parse(source)));
    for (const [slug, city] of Object.entries(cities)) {
      const html = pages[slug], text = mainText(html);
      assert.equal(applyCityBatchTwo(html, `/${slug}`), html);
      assert.doesNotMatch(html, /300\+|300 plus|Fox Valley|typical home|most booked|booked most|same-day|less than 60 seconds/i);
      const withoutReviews = html.replace(markup(html, node => attr(node, "id") === "city-editorial-reviews")[0], "");
      assert.doesNotMatch(mainText(withoutReviews), /look no further|nestled|top-notch|[\u2013\u2014]|in this brief/i);
      const words = text.split(/\s+/).length;
      assert.ok(words >= 1300 && words <= 1400, `${slug}: ${words}`);
      assert.deepEqual(reviews(html), reviews(pages.naperville), slug);
      assert.equal(markup(html, node => attr(node, "data-city-review") !== undefined).length, 23);
      assert.deepEqual(markup(html, node => cls(node, "sg-rating")), markup(pages.naperville, node => cls(node, "sg-rating")));
      const repetitions = counts(html, city).outsideFaq;
      assert.deepEqual(repetitions, { bookingPreference: 0, countyStatement: 1, supplies: 1, parking: 1, typicalHome: 0 }, slug);
      for (const zip of city.zips) assert.ok(text.includes(zip));
      assert.deepEqual(markup(html, node => cls(node, "sg-service-card")).map(card => card.match(/href="([^"]+)"/)[1]), order.map(service => `/services/${service}`));
      const facts = inspectHtml(html);
      assert.deepEqual(facts.faq.map(item => [item.name, item.acceptedAnswer.text]), [...city.faq, ...sharedFaq]);
      const schemas = facts.scripts.map(node => JSON.parse((node.childNodes || []).map(child => child.value || "").join("")));
      assert.deepEqual(schemas.find(schema => schema["@type"] === "FAQPage").mainEntity, facts.faq);
      assert.doesNotMatch(text, /hard water|soft water|hardness|grains per gallon|softened|softening/i);
      if (slug === "plano") { assert.doesNotMatch(text, /\bwater\b/i); assert.equal(facts.faq.length, 6); }
      else assert.equal(facts.faq.length, 7);
      if (slug === "joliet") assert.match(text, /mostly in Will County/);
      if (slug === "westchicago") { assert.match(text, /own wells/); assert.match(text, /own plant/); assert.doesNotMatch(text, /Lake Michigan/); }
      if (["shorewood", "joliet"].includes(slug)) assert.match(text, /planned for 2030/);
      if (slug === "willowsprings") assert.match(text, /Justice-Willow Springs Water Commission/);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-quote-form") !== undefined).length, 1);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-zip-form") !== undefined).length, 1);
      assert.match(html, /action="\/quote" method="get"/);
      assert.equal(text.split("we check the schedule and confirm the soonest date").length - 1, 1);
    }
    for (const [left, html] of Object.entries(pages)) for (const [right, other] of Object.entries(pages)) if (left < right)
      assert.ok(similarity(html, other) < 40, `${left}/${right}: ${similarity(html, other).toFixed(2)}%`);
  } finally { await stopServer(app.child); }
});
