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

test("home business keeps its ID and includes the confirmed hours and profiles without publishing a street address", () => {
  const graph = helpers.buildHomeSchemas()["@graph"];
  const business = graph[0];
  assert.equal(business["@id"], BUSINESS_ID);
  assert.deepEqual(business["@type"], ["HouseCleaningService", "LocalBusiness"]);
  assert.equal(business.name, "Shynli Cleaning Service");
  assert.equal(business.telephone, "+1-630-812-7077");
  assert.equal(business.areaServed.length, CITY_PAGES.length);
  assert.deepEqual(business.areaServed.map((city) => city.name), CITY_PAGES.map(([, city]) => `${city}, IL`));
  assert.deepEqual(business.hasOfferCatalog.itemListElement.map((offer) => offer.itemOffered.url), SERVICE_PAGES.map((route) => ORIGIN + route));
  assert.deepEqual(business.address, { "@type": "PostalAddress", addressLocality: "Naperville", addressRegion: "IL", addressCountry: "US" });
  assert.deepEqual(business.openingHoursSpecification, [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: "09:00", closes: "18:00",
  }]);
  assert.deepEqual(business.sameAs, [
    "https://www.google.com/maps?cid=9307087877612204108",
    "https://www.bbb.org/us/il/naperville/profile/cleaning-services/shynli-cleaning-service-0654-1000144666",
    "https://www.thumbtack.com/il/naperville/house-cleaning/shynli-cleaning-service/service/572036872380112901",
    "https://www.yelp.com/biz/shiny-naperville-house-cleaning-service-naperville",
    "https://nextdoor.com/pages/shynli-cleaning/",
  ]);
  assert.ok(!business.sameAs.some((url) => url.includes("5408416184318024401")));
  for (const key of ["streetAddress", "openingHours", "aggregateRating", "review"]) assert.equal(business[key], undefined, key);
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
  assert.equal(ad.offers[0].price, undefined);
  assert.deepEqual(ad.offers[0].priceSpecification, { "@type": "PriceSpecification", minPrice: 195, priceCurrency: "USD" });
  assert.deepEqual(ad.provider, { "@id": BUSINESS_ID });
  assert.equal(ad.areaServed.length, CITY_PAGES.length);
});

test("starting prices use numeric minPrice per plan while exact prices remain exact and other plans do not leak", () => {
  const html = `<html><head></head><body><main>
    <article><h3>Weekly Cleaning</h3><p>From $135.50 / visit</p></article>
    <article><h3>Bi-Weekly Cleaning</h3><p>$145 / visit</p></article>
    <article><h3>Monthly Cleaning</h3><p>$155 / visit</p><p>Final price depends on home size and condition.</p></article>
  </main></body></html>`;
  const output = helpers.finalizeStructuredData(html, "/services/regular-cleaning", {});
  assert.equal(stripSchemas(output), html);
  const offers = scripts(output).find((value) => value["@type"] === "Service").offers;
  assert.deepEqual(offers.map((offer) => offer.name), ["Weekly Cleaning", "Bi-Weekly Cleaning", "Monthly Cleaning"]);
  assert.deepEqual(offers[0].priceSpecification, { "@type": "PriceSpecification", minPrice: 135.5, priceCurrency: "USD" });
  assert.equal(offers[0].price, undefined);
  assert.equal(offers[1].price, "145");
  assert.equal(offers[1].priceSpecification, undefined);
  assert.equal(offers[2].priceSpecification.minPrice, 155);
  assert.equal(offers[2].price, undefined);
});

test("legacy offers preserve only evidenced prices and normalize starting prices without reviving obsolete ranges", () => {
  const legacy = { "@type": "OfferCatalog", itemListElement: [
    { "@type": "Offer", name: "Weekly Recurring Cleaning", price: "135", priceCurrency: "USD" },
    { "@type": "Offer", name: "Bi-Weekly Recurring Cleaning", price: "145", priceCurrency: "USD" },
    { "@type": "Offer", name: "Regular Cleaning", priceSpecification: { "@type": "PriceSpecification", minPrice: 120, maxPrice: 200 } },
  ] };
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(legacy)}</script></head><body><main>
    <p>Weekly Cleaning starting at $135</p><p>Bi-Weekly Cleaning $145</p><p>Regular Cleaning $120 - $200</p>
    </main></body></html>`;
  const output = helpers.finalizeStructuredData(html, "/pricing-v2", {});
  const offers = scripts(output)[0].itemListElement;
  assert.equal(offers[0].price, undefined);
  assert.equal(offers[0].priceSpecification.minPrice, 135);
  assert.equal(offers[1].price, "145");
  assert.equal(offers[2].price, undefined);
  assert.equal(offers[2].priceSpecification, undefined);
  assert.equal(stripSchemas(output), stripSchemas(html));
});

test("landing page starting prices use the relevant service or plan, not a cross-sell service price", () => {
  const page = (content) => `<html><head></head><body><main>${content}</main></body></html>`;
  const service = (html, route) => scripts(helpers.finalizeStructuredData(html, route, {})).find((value) => value["@type"] === "Service");
  const move = service(page('<h1>Move-In and Move-Out Cleaning from $241</h1><p>Regular Cleaning from $135</p>'), "/services/move-in-move-out-cleaning/ads-lp");
  assert.equal(move.offers[0].priceSpecification.minPrice, 241);
  assert.equal(move.offers[0].price, undefined);
  const regular = service(page('<h1>Recurring House Cleaning from $135/Visit</h1><p>Weekly from $135 · Bi-weekly from $145 · Monthly from $155</p><p>Deep Cleaning from $195</p>'), "/services/regular-cleaning/ads-lp");
  assert.deepEqual(regular.offers.map((offer) => [offer.name, offer.priceSpecification.minPrice]), [["Weekly Cleaning", 135], ["Bi-Weekly Cleaning", 145], ["Monthly Cleaning", 155]]);
});

test("Aurora's own profile is attached only to its Service and never replaces the common provider", () => {
  const html = '<html><head></head><body><main><h1>House Cleaning</h1></main></body></html>';
  for (const route of ["/aurora", "/naperville", "/services/regular-cleaning"]) {
    const output = helpers.finalizeStructuredData(html, route, {});
    const service = scripts(output).find((value) => value["@type"] === "Service");
    assert.deepEqual(service.provider, { "@id": BUSINESS_ID });
    assert.deepEqual(service.sameAs, route === "/aurora" ? ["https://www.google.com/maps?cid=5408416184318024401"] : undefined);
    assert.equal(stripSchemas(output), html);
  }
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
        const types = [].concat(node["@type"] || []);
        if (types.includes("LocalBusiness")) {
          businessCount += 1;
          assert.equal(route, "/");
          assert.equal(node["@id"], BUSINESS_ID);
        }
        assert.ok(!types.includes("HouseCleaningBusiness"), route);
        if (types.includes("HouseCleaningService")) assert.equal(route, "/");
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
          assert.deepEqual(service.sameAs, route === "/aurora" ? ["https://www.google.com/maps?cid=5408416184318024401"] : undefined);
        } else assert.equal(service.areaServed.length, CITY_PAGES.length, route);
      }
    }
    assert.equal(businessCount, 1);
  } finally {
    await stopServer(app.child);
  }
});
