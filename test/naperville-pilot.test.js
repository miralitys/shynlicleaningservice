"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { applyNapervillePilot, napervilleLastmod, FAQ } = require("../lib/site/naperville-pilot");
const reviews = require("../lib/site/naperville-reviews.json");
const { markup, mainText, similarity, COMPARISONS } = require("../scripts/audit-naperville-pilot");
const { inspectHtml } = require("../lib/site/structured-data");
const { startServer, stopServer } = require("./server-test-helpers");
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasClass = (node, name) => attribute(node, "class")?.split(/\s+/).includes(name);

test("Naperville rewrite is route-scoped, preserves protected markup, and is idempotent", () => {
  const source = fs.readFileSync(path.join(__dirname, "../page123500105.html"), "utf8");
  for (const route of ["/", "/aurora", "/plainfield", "/pricing", "/naperville/ads", "/blog"]) assert.equal(applyNapervillePilot(source, route), source);
  assert.equal(applyNapervillePilot("<main>Another template</main>", "/naperville"), "<main>Another template</main>");
  const output = applyNapervillePilot(source, "/naperville");
  assert.equal(applyNapervillePilot(output, "/naperville"), output);
  for (const predicate of [
    node => node.tagName === "header" || node.tagName === "footer" || node.tagName === "style" && attribute(node, "id") !== "naperville-copy-fit" || node.tagName === "script" || node.tagName === "form" && attribute(node, "data-zip-form") === undefined || node.tagName === "img",
    node => hasClass(node, "sg-quote") || hasClass(node, "sg-area-links"),
  ]) assert.deepEqual(markup(output, predicate), markup(source, predicate));
  for (const name of ["sg-hero__people", "sg-review-stack__icons", "sg-hero-panel__tiles", "sg-services__header", "sg-services__secondary", "sg-benefits", "sg-team__list"]) {
    assert.equal(markup(output, node => hasClass(node, name)).length, markup(source, node => hasClass(node, name)).length, name);
  }
  assert.equal(markup(output, node => hasClass(node, "sg-service-card__cta")).length, 3);
});

test("Naperville dates are explicit release metadata, never a runtime freshness date", () => {
  const release = require("../lib/site/naperville-release.json");
  assert.deepEqual(napervilleLastmod(), release.deployedAt ? [["/naperville", release.deployedAt]] : []);
  for (const deployedAt of [null, "", "bad-date", "2026-02-30", "2026-13-01"]) assert.deepEqual(napervilleLastmod({ deployedAt }), []);
  assert.deepEqual(napervilleLastmod({ deployedAt: "2026-10-21" }), [["/naperville", "2026-10-21"]]);
});

test("unchanged published sitemap dates survive hosting asset timestamp changes", () => {
  const preserved = require("../lib/site/sitemap-preserved-lastmod.json");
  const { buildSitemapXml } = require("../lib/site/request-handler");
  assert.ok(Object.keys(preserved).length > 0);
  for (const [route, date] of Object.entries(preserved)) {
    assert.notEqual(route, "/naperville");
    assert.ok(!route.startsWith("/blog"));
    assert.equal(new Date(date).toISOString(), date);
  }
  const routeFileByPath = new Map(Object.keys(preserved).map(route => [route, route]));
  const fileMetaByPath = new Map(Object.keys(preserved).map(route => [route, { mtimeMs: Date.UTC(2030, 0, 1) }]));
  const xml = buildSitemapXml({ siteOrigin: "https://shynlicleaningservice.com", routeFileByPath, fileMetaByPath, lastmodOverrides: preserved });
  for (const date of Object.values(preserved)) assert.ok(xml.includes(`<lastmod>${date}</lastmod>`));
  assert.doesNotMatch(xml, /2030-01-01/);
});

test("Naperville review data uses the four named local clients first and no banned reviewers or private details", () => {
  assert.equal(reviews.reviewCount, 58);
  assert.equal(reviews.rating, 5);
  assert.deepEqual(reviews.reviews.slice(0, 4).map(item => item.name), ["Amy K.", "Erika B.", "Eric J.", "MaryLouise O."]);
  assert.equal(reviews.reviews.length, 24);
  assert.equal(new Set(reviews.reviews.map(item => item.reviewId)).size, 24);
  for (const item of reviews.reviews) {
    assert.match(item.name, /^[A-Za-z]+ [A-Z]\.$/);
    assert.ok(item.quote.split(/\s+/).length <= 25);
    assert.ok(Object.keys(item).every(key => ["name", "quote", "local", "reviewId"].includes(key)));
  }
  assert.equal(reviews.reviews[3].quote, "");
  assert.doesNotMatch(JSON.stringify(reviews), /Olga|Amir|N G|Jim K|ilya\.dominicana|Media Trichy|Mobile Legends Jek|@|\d{3}[ -]\d{3}[ -]\d{4}/);
});

test("rendered Naperville meets the pilot brief and every city comparison stays below 40 percent", async () => {
  const app = await startServer();
  try {
    const response = await fetch(app.baseUrl + "/naperville");
    assert.equal(response.status, 200);
    const html = await response.text();
    const facts = inspectHtml(html);
    const text = mainText(html);
    const editorialWords = mainText(html, { excludeReviews: true }).split(/\s+/).length;
    assert.ok(text.split(/\s+/).length >= 1150, `body words: ${text.split(/\s+/).length}`);
    assert.ok(editorialWords >= 850, `editorial words: ${editorialWords}`);
    assert.doesNotMatch(html, /300\+|300 plus|Fox Valley|same-day|less than 60 seconds/i);
    assert.equal(markup(html, node => hasClass(node, "sg-price-card")).length, 0);
    const rating = markup(html, node => hasClass(node, "sg-rating"))[0];
    assert.match(rating, />5\/5<\/div>/);
    assert.match(rating, /5 out of 5 on Google/);
    assert.doesNotMatch(rating, /5\.0\/5/);
    const benefits = markup(html, node => hasClass(node, "sg-benefits"))[0];
    assert.match(benefits, /Put fragile items aside/);
    assert.doesNotMatch(benefits, /60540/);
    assert.equal(markup(html, node => attribute(node, "data-naperville-review") === reviews.reviews[3].reviewId).length, 0);
    assert.doesNotMatch(text, /No written comment|Google rating only/);
    for (const tile of markup(html, node => node.tagName === "p" && hasClass(node.parentNode, "sg-info-tile"))) assert.ok(tile.split(/\s+/).length >= 12);
    assert.match(text, /DuPage and Will counties/);
    assert.match(text, /three bedrooms and 2\.5 bathrooms/);
    assert.doesNotMatch(text, /Lake Michigan|DuPage Water Commission/);
    assert.match(text, /2 to 4 hours for regular cleaning or 4 to 6 for a deep clean/);
    for (const zip of [60540, 60563, 60564, 60565]) assert.ok(text.includes(String(zip)));
    assert.ok((text.match(/house cleaning in naperville|cleaning service in naperville/gi) || []).length <= 3);
    assert.deepEqual(facts.faq.map(item => [item.name, item.acceptedAnswer.text]), FAQ);
    assert.equal(facts.faq.length, 7);
    for (const question of ["Do you offer one-time cleaning?", "Can I book recurring cleaning?"]) assert.ok(facts.faq.some(item => item.name === question));
    const faqSchema = facts.scripts.map(script => JSON.parse(script.childNodes.map(node => node.value || "").join(""))).find(item => item["@type"] === "FAQPage");
    assert.deepEqual(faqSchema.mainEntity, facts.faq);
    assert.ok(facts.scripts.every(script => !JSON.stringify(JSON.parse(script.childNodes.map(node => node.value || "").join(""))).includes("aggregateRating")));
    const services = markup(html, node => hasClass(node, "sg-service-card"));
    assert.equal(services.length, 3);
    assert.ok(services[0].includes('/naperville/deep-cleaning"'));
    assert.ok(services[1].includes('/services/regular-cleaning"'));
    assert.ok(services[2].includes('/naperville/move-out-cleaning"'));
    assert.equal(markup(html, node => Boolean(attribute(node, "data-naperville-review"))).length, 23);
    const renderedReviews = markup(html, node => Boolean(attribute(node, "data-naperville-review")));
    for (const [index, review] of reviews.reviews.filter(item => item.quote.trim()).entries()) {
      assert.ok(renderedReviews[index].includes(review.reviewId));
      assert.equal(inspectHtml(`<main>${renderedReviews[index]}</main>`).main.childNodes[0].childNodes.find(node => hasClass(node, "clients-say-home__text")).childNodes.map(node => node.value || "").join(""), review.quote);
    }
    const { phraseCounts } = require("../scripts/audit-naperville-second-pass");
    assert.ok(Object.values(phraseCounts(html).outsideFaq).every(count => count === 1));
    assert.equal(markup(html, node => node.tagName === "h2" && node.childNodes?.some(child => child.value === "Choose your city")).length, 1);
    assert.equal(markup(html, node => node.tagName === "label" && attribute(node, "for") === "sgZip").length, 0);
    assert.match(markup(html, node => node.tagName === "input" && attribute(node, "id") === "sgZip")[0], /aria-label="ZIP code"/);
    assert.equal(markup(html, node => node.tagName === "form" && hasClass(node, "sg-quote-form")).length, 1);
    assert.equal(markup(html, node => node.tagName === "form" && attribute(node, "data-zip-form") !== undefined).length, 1);
    for (const route of COMPARISONS) {
      const other = await fetch(app.baseUrl + route).then(result => result.text());
      assert.ok(similarity(html, other) < 40, route);
      assert.ok(similarity(html, other, { excludeReviews: true }) < 40, `${route} without reviews`);
    }
  } finally { await stopServer(app.child); }
});
