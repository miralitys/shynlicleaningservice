"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startServer, stopServer } = require("./server-test-helpers");

let serverProcess = null;
let BASE_URL = null;

const LANDING_ROUTES = [
  {
    route: "/cleaners-near-me/ads-lp",
    title: "House Cleaners Near You in Chicago Suburbs - From $135 | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/cleaners-near-me/ads-lp",
    bodyClass: "adlp-page--near",
    service: "Regular Cleaning",
    content: /Cities We Serve Near You/,
  },
  {
    route: "/services/regular-cleaning/ads-lp",
    title: "House Cleaning Service in Chicagoland - From $135/Visit | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/services/regular-cleaning/ads-lp",
    bodyClass: "adlp-page--regular",
    service: "Regular Cleaning",
    content: /Recurring House Cleaning/,
  },
  {
    route: "/services/deep-cleaning/ads-lp",
    title: "Deep House Cleaning Service in Chicagoland - From $195 | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/services/deep-cleaning/ads-lp",
    bodyClass: "adlp-page--deep",
    service: "Deep Cleaning",
    content: /Full home reset/,
  },
  {
    route: "/services/move-in-move-out-cleaning/ads-lp",
    title: "Move-In and Move-Out Cleaning - Deposit-Back Ready From $241 | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/services/move-in-move-out-cleaning/ads-lp",
    bodyClass: "adlp-page--move",
    service: "Move In / Move Out Cleaning",
    content: /Inspection-ready move cleaning/,
  },
];

test.before(async () => {
  const started = await startServer();
  serverProcess = started.child;
  BASE_URL = started.baseUrl;
});

test.after(async () => {
  await stopServer(serverProcess);
});

test("serves ad-only v3 landing pages", async () => {
  for (const landing of LANDING_ROUTES) {
    const response = await fetch(`${BASE_URL}${landing.route}`);
    const body = await response.text();

    assert.equal(response.status, 200, landing.route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, landing.route);
    assert.match(body, new RegExp(`<title>${landing.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/title>`), landing.route);
    assert.match(body, new RegExp(`<link rel="canonical" href="${landing.canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`), landing.route);
    assert.match(body, /<meta name="robots" content="noindex,follow"\s*\/?>/, landing.route);
    assert.match(body, new RegExp(`class="[^"]*\\b${landing.bodyClass}\\b`), landing.route);
    assert.match(body, landing.content, landing.route);
    assert.match(body, /\/css\/ads-lp-v3\.css\?v=20260603-9/, landing.route);
    assert.match(body, /\/js\/ads-lp-v3\.js\?v=20260603-1/, landing.route);
    assert.match(body, /data-adlp-quote-form/, landing.route);
    assert.match(body, new RegExp(`value="${landing.service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), landing.route);
    assert.match(body, /id="mobile-sticky-cta"/, landing.route);
    assert.match(body, /<!-- Google Tag Manager -->/, landing.route);
    assert.match(body, /GTM-5P88N7LD/, landing.route);
    assert.doesNotMatch(body, /id="shynli-site-header"/, landing.route);
    assert.doesNotMatch(body, /id="shynli-site-footer"/, landing.route);
    assert.doesNotMatch(body, /tilda-blocks-page|tilda-scripts|fonts\.googleapis\.com|fonts\.gstatic\.com/, landing.route);
    assert.doesNotMatch(body, /alert\(/, landing.route);
    assert.match(body, /adlp-review-marquee/, landing.route);
    assert.doesNotMatch(body, /adlp-hero__media|home-copy-team|Local team, local routes/, landing.route);
    assert.doesNotMatch(body, /\/services\/(?:regular-cleaning|deep-cleaning|move-in-move-out-cleaning)\/ads-v2/, landing.route);
  }
});

test("excludes ad-only v3 landing pages from sitemap", async () => {
  const response = await fetch(`${BASE_URL}/sitemap.xml`);
  const body = await response.text();

  assert.equal(response.status, 200);
  for (const landing of LANDING_ROUTES) {
    assert.doesNotMatch(body, new RegExp(landing.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), landing.route);
  }
});
