"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pages } = require("../lib/site/service-city-data");
const { addServiceCityLinks, renderServiceCity, serviceCityLastmod, serviceCityRoutes } = require("../lib/site/service-city");
const { similarity } = require("../scripts/audit-service-city");
const { markup, mainText } = require("../scripts/audit-naperville-pilot");
const { inspectHtml } = require("../lib/site/structured-data");
const { inspectProfiles } = require("../scripts/audit-footer-profiles");
const { startServer, stopServer } = require("./server-test-helpers");
const attr = (node, key) => node.attrs?.find(value => value.name === key)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);

test("service-city allowlists and dates never rewrite unrelated routes", () => {
  for (const route of ["/", "/pricing", "/woodridge", "/naperville/ads", "/constructor", "/aurora/deep-cleaning/other"]) {
    assert.equal(addServiceCityLinks("<main>Unrelated</main>", route), "<main>Unrelated</main>");
    assert.equal(renderServiceCity("<main>Unrelated</main>", route), "<main>Unrelated</main>");
  }
  assert.equal(serviceCityRoutes(require("../routes.json")).length, 8);
  for (const deployedAt of [null, "", "bad", "2026-02-30"]) assert.deepEqual(serviceCityLastmod({ deployedAt }), []);
  assert.equal(serviceCityLastmod({ deployedAt: "2026-10-22" }).length, 8);
});

test("eight service-city pages preserve forms and reviews, are indexable and unique", async () => {
  const app = await startServer();
  try {
    const html = {};
    for (const route of new Set([...Object.keys(pages), ...Object.values(pages).flatMap(page => [`/${page.citySlug}`, page.service.parent])])) {
      const response = await fetch(app.baseUrl + route);
      assert.equal(response.status, 200, route);
      html[route] = await response.text();
    }
    const xml = await (await fetch(app.baseUrl + "/sitemap.xml")).text();
    for (const [route, page] of Object.entries(pages)) {
      const current = html[route], parent = html[`/${page.citySlug}`];
      const facts = inspectHtml(current);
      const text = mainText(current);
      const words = text.split(/\s+/).length;
      assert.ok(words >= 900 && words <= 1100, `${route}: ${words}`);
      assert.equal(markup(current, node => node.tagName === "h1").length, 1);
      assert.equal(markup(current, node => node.tagName === "base").length, 1);
      assert.equal(markup(current, node => node.tagName === "link" && attr(node, "rel") === "canonical")[0], `<link rel="canonical" href="https://shynlicleaningservice.com${route}">`);
      assert.doesNotMatch(markup(current, node => node.tagName === "meta" && attr(node, "name") === "robots").join(""), /noindex|nofollow/i);
      const schemas = facts.scripts.map(node => JSON.parse(node.childNodes.map(child => child.value || "").join("")));
      assert.deepEqual(schemas.map(node => node["@type"]), ["Service", "BreadcrumbList", "FAQPage"]);
      assert.deepEqual(schemas[2].mainEntity, facts.faq);
      assert.equal(facts.faq.length, 5);
      assert.deepEqual(schemas[1].itemListElement.map(item => item.item), ["https://shynlicleaningservice.com/", `https://shynlicleaningservice.com/${page.citySlug}`, `https://shynlicleaningservice.com${route}`]);
      assert.deepEqual(schemas[0].provider, { "@id": "https://shynlicleaningservice.com/#localbusiness" });
      const related = markup(current, node => node.tagName === "nav" && attr(node, "aria-label") === "Related cleaning pages")[0];
      assert.equal(markup(related, node => node.tagName === "a" && cls(node, "sg-button")).length, 2);
      assert.match(related, /class="sg-button sg-button--outline"/);
      assert.match(related, new RegExp(`href="/${page.citySlug}"`));
      assert.ok(related.includes(`href="${page.service.parent}"`));
      assert.match(current, /main\[data-service-city\] \.service-city-section\{padding:32px 0;\}/);
      assert.match(current, /main\[data-service-city\] \.service-city-section\{padding:22px 0;\}/);
      assert.equal(inspectProfiles(current).links[0].href, page.citySlug === "aurora" ? "https://www.google.com/maps?cid=5408416184318024401" : "https://www.google.com/maps?cid=9307087877612204108");
      const forms = value => markup(value, node => node.tagName === "form" && attr(node, "data-quote-form") !== undefined);
      assert.deepEqual(forms(current), forms(parent));
      const reviews = value => markup(value, node => attr(node, "data-city-review") !== undefined || attr(node, "data-naperville-review") !== undefined);
      assert.deepEqual(reviews(current), reviews(parent));
      for (const zip of page.city.zips) assert.ok(text.includes(zip));
      assert.doesNotMatch(text, /300\+|Fox Valley|typical home|\$\d/i);
      if (page.serviceSlug === "move-out-cleaning") assert.doesNotMatch(text, /\bwater\b/i);
      assert.ok(xml.includes(`<loc>https://shynlicleaningservice.com${route}</loc>`));
      assert.equal(addServiceCityLinks(parent, `/${page.citySlug}`), parent);
      assert.equal(addServiceCityLinks(html[page.service.parent], page.service.parent), html[page.service.parent]);
      for (const other of [...Object.keys(pages).filter(other => other !== route), `/${page.citySlug}`, page.service.parent]) assert.ok(similarity(current, html[other]) < 40, `${route}/${other}`);
      const localLinks = markup(parent, node => node.tagName === "a" && attr(node, "href") === route);
      assert.equal(localLinks.length, 1);
      const card = markup(parent, node => cls(node, "sg-service-card") && attr(node, "data-service-city-card") === page.serviceSlug)[0];
      assert.equal(markup(card, node => node.tagName === "a").length, 2);
      assert.equal(markup(card, node => node.tagName === "a" && node.parentNode.tagName === "a").length, 0);
    }
  } finally { await stopServer(app.child); }
});
