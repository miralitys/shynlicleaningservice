"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyReviewBadges } = require("../lib/site/review-badges");
const { inspect } = require("../scripts/audit-review-badges");
const { startServer, stopServer } = require("./server-test-helpers");

test("review badge variants change only their count/label, never schema or cleaning counts", () => {
  const fixtures = [
    '<div class="services-stats__reviews"><i>icons</i><p><strong>300+</strong><br>Customer Reviews</p></div>',
    '<div class="dc-hero__reviews"><i>icons</i><div><strong>300+</strong><span>Customer Reviews</span></div></div>',
    '<div class="hero-stat hero-stat--reviews"><i>icons</i><div><span>300+</span><span>Customer Reviews</span></div></div>',
    '<div class="review-cluster"><i>icons</i><p><span aria-label="300+"><svg><text>300+</text></svg></span><span>Customer Reviews</span></p></div>',
    ...["data-clean-id", "data-elem-id"].map(attribute => `<div><div ${attribute}="1768045586274000010"><div>Customer Reviews</div></div><div ${attribute}="1768045586274000011"><div><svg><text>300+</text></svg></div></div></div>`),
    '<div><div class="clean-elem clean-elem--1768045586274000010"><div>Customer Reviews</div></div><div class="clean-elem clean-elem--1768045586274000011"><div><svg><text>300+</text></svg></div></div></div>',
  ];
  for (const fixture of fixtures) {
    const html = `<html><head><title>Original title</title><meta name="description" content="Original description"><script type="application/ld+json">{"aggregateRating":{"ratingValue":5,"reviewCount":300}}</script></head><body>${fixture}<p>300+ cleanings completed</p><p>5/5 average from 300+ cleanings</p><p>5/5</p><form action="/quote"><input name="bedrooms"></form></body></html>`;
    const output = applyReviewBadges(html);
    assert.equal(inspect(output).legacy.length, 0);
    assert.equal((output.match(/class="sg-review-stack shynli-review-badge"/g) || []).length, 1);
    assert.deepEqual(inspect(output).ld, inspect(html).ld);
    assert.deepEqual(inspect(output).completed, inspect(html).completed);
    assert.match(output, /5\/5 average from 300\+ cleanings/);
    assert.match(output, /<p>5\/5<\/p><form action="\/quote"><input name="bedrooms"><\/form>/);
    assert.match(output, /<title>Original title<\/title><meta name="description" content="Original description">/);
    assert.equal(applyReviewBadges(output), output);
  }
});

test("unrelated claims and the existing city badge remain byte-identical", () => {
  for (const html of [
    '<p>300+ cleanings completed</p>',
    '<p>Customer Reviews</p><p>300+ cleanings completed</p>',
    '<div class="sg-review-stack" aria-label="58 Google reviews"><div>58</div><div>Google reviews</div></div>',
    '<script>const label="Customer Reviews", count="300+";</script>',
  ]) assert.equal(applyReviewBadges(html), html);
});

test("all affected public routes serve one coherent badge while preserving 5/5", async () => {
  const app = await startServer();
  try {
    for (const route of ["/", "/about-us", "/ads", "/home-simple", "/pricing", "/pricing-v2", "/services/airbnb-cleaning", "/services/commercial-cleaning", ...["deep-cleaning", "regular-cleaning", "move-in-move-out-cleaning"].flatMap(service => ["", "/ads", "/ads-v2"].map(suffix => `/services/${service}${suffix}`))]) {
      const response = await fetch(app.baseUrl + route);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      assert.equal(inspect(html).legacy.length, 0, route);
      assert.equal((html.match(/class="sg-review-stack shynli-review-badge"/g) || []).length, 1, route);
      assert.match(html, /5\/5/);
      assert.doesNotMatch(html, /aria-label=["']300\+/);
    }
    const city = await (await fetch(app.baseUrl + "/naperville")).text();
    assert.doesNotMatch(city, /shynli-review-badge-style/);
    assert.match(city, /aria-label="58 Google reviews"/);
  } finally { await stopServer(app.child); }
});
