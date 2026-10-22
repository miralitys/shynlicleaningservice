"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cities, sharedFaq } = require("../lib/site/city-editorial-data");
const { applyCityEditorial, cityEditorialLastmod, cityReviews } = require("../lib/site/city-editorial");
const { startServer, stopServer } = require("./server-test-helpers");
const { markup, mainText, similarity } = require("../scripts/audit-naperville-pilot");
const { counts } = require("../scripts/audit-city-editorial");
const { inspectHtml } = require("../lib/site/structured-data");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

test("seven-city rewrite is opt-in, with explicit release dates and no stars-only reviews", () => {
  const source = fs.readFileSync(path.join(__dirname, "../page123500105.html"), "utf8");
  for (const route of ["/naperville", "/", "/pricing", "/joliet", "/blog", "/plainfield/ads", "/services/regular-cleaning", "/constructor", "/__proto__"]) assert.equal(applyCityEditorial(source, route), source);
  assert.equal(applyCityEditorial("<main>Unrelated layout</main>", "/aurora"), "<main>Unrelated layout</main>");
  for (const deployedAt of [null, "bad", "2026-02-30"]) assert.deepEqual(cityEditorialLastmod({ deployedAt }), []);
  assert.deepEqual(cityEditorialLastmod({ deployedAt: "2026-10-22" }), Object.keys(cities).map(slug => [`/${slug}`, "2026-10-22"]));
  for (const city of Object.values(cities)) {
    const reviews = cityReviews(city);
    assert.equal(reviews.length, 25);
    assert.equal(new Set(reviews.map(review => review.name)).size, 25);
    for (const review of reviews) {
      assert.ok(review.quote.trim());
      assert.match(review.name, /^[A-Za-z]+ [A-Z]\.$/);
      assert.doesNotMatch(review.name, /Olga|Amir|^N G$|Jim K|ilya|Media Trichy|Mobile Legends|Ina S\.|MaryLouise/);
    }
    assert.deepEqual(reviews.slice(0, city.reviewsFirst.length).map(review => review.name), city.reviewsFirst);
  }
});

test("seven city pages keep the Naperville structure, factual limits, FAQ schemas and working GET forms", async () => {
  const app = await startServer();
  try {
    const pages = {};
    pages.naperville = await fetch(app.baseUrl + "/naperville").then(r => r.text());
    for (const [slug, city] of Object.entries(cities)) {
      const response = await fetch(app.baseUrl + `/${slug}`);
      assert.equal(response.status, 200);
      const html = pages[slug] = await response.text();
      assert.ok(html.includes('data-city-editorial="true"'));
      assert.equal(applyCityEditorial(html, `/${slug}`), html);
      assert.doesNotMatch(html, /300\+|300 plus|Fox Valley|same-day|less than 60 seconds/i);
      const words = mainText(html).split(/\s+/).length;
      assert.ok(words >= 1300 && words <= 1400, `${slug}: ${words} words`);
      const withoutReviews = html.replace(markup(html, node => attr(node, "id") === "city-editorial-reviews")[0], "");
      assert.doesNotMatch(mainText(withoutReviews), /in this brief|our \w+ brief|look no further|nestled|top-notch|[\u2013\u2014]/i);
      assert.deepEqual(markup(html, node => attr(node, "class") === "sg-rating"), markup(pages.naperville, node => attr(node, "class") === "sg-rating"));
      assert.ok(Object.values(counts(html, city).outsideFaq).every(value => value <= 1), slug);
      for (const zip of city.zips) assert.ok(mainText(html).includes(zip));
      assert.ok(html.includes(`href="https://shynlicleaningservice.com/${slug}"`));
      assert.match(html, /<div class="sg-rating__score">5\/5<\/div>/);
      assert.match(html, /aria-label="58 Google reviews"/);
      const facts = inspectHtml(html);
      assert.deepEqual(facts.faq.map(item => [item.name, item.acceptedAnswer.text]), [...city.faq, ...sharedFaq]);
      const schemas = facts.scripts.map(node => JSON.parse((node.childNodes || []).map(child => child.value || "").join("")));
      assert.deepEqual(schemas.find(schema => schema["@type"] === "FAQPage").mainEntity, facts.faq);
      if (slug === "aurora") {
        const service = schemas.find(schema => schema["@type"] === "Service");
        assert.deepEqual(service.sameAs, ["https://www.google.com/maps?cid=5408416184318024401"]);
        assert.equal(service.provider["@id"], "https://shynlicleaningservice.com/#localbusiness");
      }
      const form = markup(html, node => node.tagName === "form" && attr(node, "data-quote-form") !== undefined);
      assert.equal(form.length, 1);
      assert.match(form[0], /action="\/quote" method="get"/);
      assert.match(form[0], /name="name"/);
      assert.match(form[0], /name="phone"/);
      assert.match(html, /sessionStorage\.setItem\("homeWidgetName", name\)/);
      assert.equal(markup(html, node => node.tagName === "form" && attr(node, "data-zip-form") !== undefined).length, 1);
      assert.equal(markup(html, node => attr(node, "data-city-review") !== undefined).length, 25);
      if (["bolingbrook", "batavia"].includes(slug)) assert.doesNotMatch(city.preparation, /water|wells|hardness|Lake Michigan/i);
      if (slug === "batavia") assert.doesNotMatch(city.homes, /typical|\d+ bedrooms/i);
    }
    for (const [left, html] of Object.entries(pages)) for (const [right, other] of Object.entries(pages)) if (left !== right) assert.ok(similarity(html, other) < 40, `${left}/${right}`);
    const quote = await fetch(app.baseUrl + "/quote?name=Preview+Test&phone=%2B1+%28630%29+555-0100");
    assert.equal(quote.status, 200);
    assert.match(await quote.text(), /src="\/js\/quote2-app\.js\?/);
    const calculator = await fetch(app.baseUrl + "/js/quote2-app.js");
    assert.equal(calculator.status, 200);
    assert.match(await calculator.text(), /\/api\/quote\/submit/);
  } finally { await stopServer(app.child); }
});
