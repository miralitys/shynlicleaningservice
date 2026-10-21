"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStructuredDataHelpers, CITY_PAGES, SERVICE_PAGES, inspectHtml } = require("../lib/site/structured-data");
const { startServer, stopServer } = require("./server-test-helpers");

const ORIGIN = "https://shynlicleaningservice.com";
const BUSINESS_ID = `${ORIGIN}/#localbusiness`;
const helpers = createStructuredDataHelpers({ siteOrigin: ORIGIN, getRouteLabel: (route) => route.split("/").pop() });
const scripts = (html) => inspectHtml(html).scripts.map((script) => JSON.parse(script.childNodes.map((node) => node.value || "").join("")));
const stripSchemas = (html) => html.replace(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, "");
function walk(value, callback) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) callback(value);
  Object.values(value).forEach((child) => walk(child, callback));
}

test("home business keeps its ID, uses only supported types and omits unconfirmed hours, profiles and street address", () => {
  const graph = helpers.buildHomeSchemas()["@graph"];
  const business = graph[0];
  assert.equal(business["@id"], BUSINESS_ID);
  assert.equal(business["@type"], "LocalBusiness");
  assert.equal(business.name, "Shynli Cleaning Service");
  assert.equal(business.telephone, "+1-630-812-7077");
  assert.equal(business.areaServed.length, CITY_PAGES.length);
  assert.deepEqual(business.areaServed.map((city) => city.name), CITY_PAGES.map(([, city]) => `${city}, IL`));
  assert.deepEqual(business.hasOfferCatalog.itemListElement.map((offer) => offer.itemOffered.url), SERVICE_PAGES.map((route) => ORIGIN + route));
  assert.deepEqual(business.address, { "@type": "PostalAddress", addressLocality: "Naperville", addressRegion: "IL", addressCountry: "US" });
  for (const key of ["streetAddress", "openingHours", "openingHoursSpecification", "sameAs", "aggregateRating", "review"]) assert.equal(business[key], undefined, key);
  assert.deepEqual(graph[1].publisher, { "@id": BUSINESS_ID });
});

test("FAQ matches visible wording, decoded entities, lists and accordion answers without decorative icons or menu details", () => {
  const html = `<html><head></head><body><main>
    <details><summary>Services</summary><a>Deep Cleaning</a></details>
    <section class="faq"><details><summary><span class="sg-faq__question">Can I book &amp; pay?</span> +</summary><p>Yes &mdash; it&#39;s easy.</p><ul><li>Call us.</li><li>Book online.</li></ul></details>
    <button class="faq-question" aria-controls="answer"><span>Who cleans?</span><i class="faq-icon">+</i></button><div class="faq-answer" id="answer"><p>Our <strong>local team</strong>.</p></div></section>
    </main></body></html>`;
  const facts = inspectHtml(html);
  assert.deepEqual(facts.faq.map((question) => [question.name, question.acceptedAnswer.text]), [
    ["Can I book & pay?", "Yes — it's easy. Call us. Book online."],
    ["Who cleans?", "Our local team."],
  ]);
  const output = helpers.finalizeStructuredData(html, "/faq", {});
  assert.equal(stripSchemas(output), html);
  assert.equal(scripts(output).filter((value) => value["@type"] === "FAQPage").length, 1);
});

test("service offers use visible prices only, not add-on prices, insurance values or obsolete ranges", () => {
  const page = (content) => `<html><head></head><body><main>${content}</main></body></html>`;
  const schema = (html, route) => scripts(helpers.finalizeStructuredData(html, route, { description: "Cleaning services." })).find((value) => value["@type"] === "Service");
  assert.equal(schema(page("<h1>Deep Cleaning</h1><p>Inside oven $45. Insured for $1M.</p>"), "/services/deep-cleaning").offers, undefined);
  const regular = schema(page("<h1>Regular Cleaning</h1><p>Weekly Cleaning $135</p><p>Bi-Weekly Cleaning $145</p><p>Monthly Cleaning $155</p>"), "/services/regular-cleaning");
  assert.deepEqual(regular.offers.map((offer) => offer.price), ["135", "145", "155"]);
  const ad = schema(page('<section class="dc-hero"><h1>Deep cleaning</h1><p>From $195</p></section>'), "/services/deep-cleaning/ads");
  assert.equal(ad.offers[0].price, "195");
  assert.deepEqual(ad.provider, { "@id": BUSINESS_ID });
  assert.equal(ad.areaServed.length, CITY_PAGES.length);
});

test("normalization removes old duplicate businesses and FAQs and safely escapes JSON-LD text", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@graph": [
    { "@type": "HouseCleaningBusiness", name: "Shynli Cleaning", openingHours: "Mo-Su 08:00-20:00" },
    { "@type": "Service", serviceType: "Cleaning", provider: { "@type": "LocalBusiness", name: "Shynli Cleaning" } },
    { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Stale question" }] },
  ] })}</script></head><body><p>Cleaning.</p></body></html>`;
  const output = helpers.finalizeStructuredData(html, "/ads-v2", {});
  assert.doesNotMatch(output, /HouseCleaningBusiness|openingHours|Stale question/);
  assert.deepEqual(scripts(output)[0]["@graph"][0].provider, { "@id": BUSINESS_ID });
  const unsafe = helpers.finalizeStructuredData('<html><head></head><body></body></html>', "/services/deep-cleaning", { description: "</script><p>Not markup</p>" });
  assert.equal(inspectHtml(unsafe).scripts.length, 1);
  assert.match(unsafe, /\\u003c\/script/);
  assert.equal(scripts(unsafe)[0].description, "</script><p>Not markup</p>");
});

test("all served city and service pages have canonical company references and visible FAQ data in server HTML", async () => {
  const app = await startServer();
  try {
    let businessCount = 0;
    for (const route of ["/", "/faq", "/contacts", "/cleaners-near-me", "/ads-v2", "/pricing-v2", ...SERVICE_PAGES, ...CITY_PAGES.map(([path]) => path)]) {
      const response = await fetch(`${app.baseUrl}${route}`);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      const pageSchemas = scripts(html);
      const facts = inspectHtml(html);
      const faqSchemas = pageSchemas.filter((value) => value["@type"] === "FAQPage");
      assert.equal(faqSchemas.length, facts.faq.length ? 1 : 0, route);
      if (facts.faq.length) assert.deepEqual(faqSchemas[0].mainEntity, facts.faq, route);
      pageSchemas.forEach((value) => walk(value, (node) => {
        if (node["@type"] === "LocalBusiness") {
          businessCount += 1;
          assert.equal(route, "/");
          assert.equal(node["@id"], BUSINESS_ID);
        }
        assert.ok(!["HouseCleaningBusiness", "HouseCleaningService"].includes(node["@type"]), route);
        if (node["@type"] === "Service" && node.provider) assert.deepEqual(node.provider, { "@id": BUSINESS_ID }, route);
      }));
      if (SERVICE_PAGES.includes(route) || CITY_PAGES.some(([path]) => path === route)) {
        const service = pageSchemas.find((value) => value["@type"] === "Service");
        assert.ok(service, route);
        assert.equal(service.url, ORIGIN + route);
        const city = CITY_PAGES.find(([path]) => path === route)?.[1];
        if (city) {
          assert.equal(service.name, `House Cleaning in ${city}, IL`);
          assert.deepEqual(service.areaServed, { "@type": "City", name: `${city}, IL` });
          assert.ok(service.hasOfferCatalog.itemListElement.length >= 3, route);
        } else assert.equal(service.areaServed.length, CITY_PAGES.length, route);
      }
    }
    assert.equal(businessCount, 1);
  } finally {
    await stopServer(app.child);
  }
});
