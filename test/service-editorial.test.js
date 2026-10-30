"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { pages } = require("../lib/site/service-editorial-data");
const { applyServiceEditorial, serviceEditorialLastmod } = require("../lib/site/service-editorial");
const evidence = require("../lib/site/naperville-reviews.json");
const { mainText, similarity, wordCount } = require("../scripts/audit-service-editorial");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { startServer, stopServer } = require("./server-test-helpers");
const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;

test("service editorial is isolated, idempotent and does not invent publication dates", () => {
  const html = '<html><head></head><body><main>Original content</main></body></html>';
  for (const route of ["/", "/naperville", "/pricing", "/services/deep-cleaning", "/services/regular-cleaning", "/services/move-in-move-out-cleaning", "/services/deep-cleaning/ads-v2"]) assert.equal(applyServiceEditorial(html, route, ""), html);
  assert.deepEqual(serviceEditorialLastmod({ deployedAt: null }), []);
  const release = require("../lib/site/service-editorial-release.json");
  assert.deepEqual(serviceEditorialLastmod(), release.deployedAt ? Object.keys(pages).map(route => [route, release.deployedAt]) : []);
  assert.deepEqual(serviceEditorialLastmod({ deployedAt: "2026-02-30" }), []);
  assert.deepEqual(serviceEditorialLastmod({ deployedAt: "2026-10-22" }), Object.keys(pages).map(route => [route, "2026-10-22"]));
});

test("three rewritten services have evidenced content, quote forms and matching structured data", async () => {
  const app = await startServer();
  try {
    const rendered = {};
    for (const route of [...Object.keys(pages), "/services/deep-cleaning", "/services/regular-cleaning", "/services/move-in-move-out-cleaning"]) {
      const response = await fetch(app.baseUrl + route);
      assert.equal(response.status, 200, route);
      rendered[route] = await response.text();
    }
    for (const [route, page] of Object.entries(pages)) {
      const html = rendered[route], facts = inspectHtml(html), text = mainText(html);
      assert.ok(wordCount(text) >= 800 && wordCount(text) <= 1000, `${route}: ${wordCount(text)} words`);
      assert.equal(facts.nodes.filter(node => node.tagName === "main").length, 1);
      assert.equal(attr(facts.nodes.find(node => node.tagName === "link" && attr(node, "rel") === "canonical"), "href"), "https://shynlicleaningservice.com" + route);
      assert.match(html, /58 Google reviews/);
      assert.doesNotMatch(text, /Page Under Development|300\+|hundreds|\bCOI\b|insurance certificates|[\u2013\u2014]|nestled|look no further|top-notch/i);
      assert.match(text, /not contractors/);
      assert.match(text, /9 AM to 7 PM Central/);
      assert.match(text, /48 hours, 24 hours and 1 hour/);
      assert.match(text, /\$50 for 24-48 hours, 50% for 12-24 hours, and 100%/);
      const schemas = facts.scripts.map(node => JSON.parse(node.childNodes.map(child => child.value || "").join("")));
      assert.deepEqual(schemas.map(value => value["@type"]), ["Service", "BreadcrumbList", "FAQPage"]);
      assert.deepEqual(schemas[0].provider, { "@id": "https://shynlicleaningservice.com/#localbusiness" });
      assert.deepEqual(schemas[1].itemListElement.map(item => item.name), ["Home", "Services", page.name]);
      assert.deepEqual(schemas[2].mainEntity, facts.faq);
      assert.equal(facts.faq.length, 5);
      for (const className of ["benefits-grid", "faq-wrapper", "faq-grid", "lead__panel", "lead-form", "lead__house"]) {
        assert.ok(facts.nodes.some(node => (attr(node, "class") || "").split(/\s+/).includes(className)), `${route}: homepage component ${className}`);
      }
      assert.equal(facts.nodes.filter(node => node.attrs?.some(item => item.name === "data-service-faq-button")).length, 5);
      assert.match(html, /\/css\/service-editorial-home\.css/);
      assert.match(html, /\/js\/service-editorial\.js/);
      assert.doesNotMatch(html, /class="se-(?:form|faq|contact)"/);
      assert.doesNotMatch(JSON.stringify(schemas), /aggregateRating|reviewCount|"offers"/);
      for (const href of ["/pricing", "/quote", "/service-areas", ...page.related.map(([, href]) => href)]) assert.ok(facts.serviceLinks.has(href), route + href);
      const forms = facts.nodes.filter(node => node.tagName === "form" && attr(node, "action") === "/quote");
      assert.equal(forms.length, 1);
      assert.equal(attr(forms[0], "method"), "get");
      assert.ok(forms[0].attrs.some(item => item.name === "data-lead-form"));
      for (const name of ["name", "phone"]) assert.equal(facts.nodes.filter(node => node.tagName === "input" && attr(node, "name") === name).length, 1);
      const runtime = facts.nodes.find(node => node.tagName === "script" && attr(node, "id") === "shynli-quote-start-widget-runtime");
      const code = runtime.childNodes.map(child => child.value || "").join("");
      assert.match(code, /normalizePhoneDigits/);
      new vm.Script(code);
      let submit;
      const inputs = { name: { value: "Local Preview Test" }, phone: { value: "2025550142" } };
      const stored = new Map(), alerts = [];
      const browser = { location: { pathname: route, href: "" }, setTimeout: callback => callback(), alert: value => alerts.push(value) };
      vm.runInNewContext(code, {
        window: browser, URLSearchParams,
        sessionStorage: { setItem: (key, value) => stored.set(key, value) },
        document: { addEventListener: (event, listener) => { if (event === "submit") submit = listener; } },
      });
      const form = { tagName: "FORM", hasAttribute: key => key === "data-lead-form", querySelector: selector => inputs[selector.includes('"name"') ? "name" : "phone"] };
      const event = { target: form, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
      submit(event);
      const redirect = new URL(browser.location.href, app.baseUrl);
      assert.equal(redirect.pathname, "/quote");
      assert.equal(redirect.search, "", "contact details stay out of the URL");
      assert.equal(stored.get("homeWidgetName"), "Local Preview Test");
      assert.equal(stored.get("homeWidgetPhone"), "+1 (202) 555-0142");
      inputs.phone.value = "123";
      browser.location.href = "";
      submit(event);
      assert.equal(browser.location.href, "");
      assert.equal(alerts.length, 1);
      const reviews = facts.nodes.filter(node => attr(node, "data-service-review"));
      assert.equal(reviews.length, 6);
      for (const review of reviews) {
        const source = evidence.reviews.find(item => item.reviewId === attr(review, "data-service-review"));
        assert.ok(source?.quote.trim());
        assert.ok(visibleText(review).includes(source.quote));
      }
      assert.equal(applyServiceEditorial(html, route, ""), html);
      for (const [other, otherHtml] of Object.entries(rendered)) if (other !== route) assert.ok(similarity(html, otherHtml) < 40, `${route} vs ${other}`);
    }
    assert.match(mainText(rendered["/services/airbnb-cleaning"]), /Mirrors and glass surfaces cleaned, fingerprints on window glass spot-cleaned/);
    assert.match(mainText(rendered["/services/airbnb-cleaning"]), /smart-lock door code|smart-lock code/);
    assert.match(mainText(rendered["/services/commercial-cleaning"]), /Ready for a cleaner workspace/);
    assert.match(mainText(rendered["/services/post-construction-cleaning"]), /fine construction dust inside cabinets and drawers and in air vents/);
    assert.match(mainText(rendered["/services/post-construction-cleaning"]), /paint and sticker residue/);
  } finally { await stopServer(app.child); }
});
