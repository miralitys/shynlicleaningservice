"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startServer, stopServer } = require("./server-test-helpers");

let serverProcess = null;
let BASE_URL = null;

const LANDING_ROUTES = [
  {
    route: "/cleaners-near-me/ads-lp",
    title: "House Cleaners Near You in Chicago Suburbs - $135 | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/cleaners-near-me/ads-lp",
    bodyClass: "adlp-page--near",
    service: "Regular Cleaning",
    content: /Cities We Serve Near You/,
  },
  {
    route: "/services/regular-cleaning/ads-lp",
    title: "House Cleaning Service in Chicagoland - $135/Visit | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/services/regular-cleaning/ads-lp",
    bodyClass: "adlp-page--regular",
    service: "Regular Cleaning",
    content: /Recurring House Cleaning/,
  },
  {
    route: "/services/deep-cleaning/ads-lp",
    title: "Deep House Cleaning Service in Chicagoland - $195 | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/services/deep-cleaning/ads-lp",
    bodyClass: "adlp-page--deep",
    service: "Deep Cleaning",
    content: /Full home reset/,
  },
  {
    route: "/services/move-in-move-out-cleaning/ads-lp",
    title: "Move-In and Move-Out Cleaning - Deposit-Back Ready $241 | Shynli Cleaning",
    canonical: "https://shynlicleaningservice.com/services/move-in-move-out-cleaning/ads-lp",
    bodyClass: "adlp-page--move",
    service: "Move In / Move Out Cleaning",
    content: /Inspection-ready move cleaning/,
  },
];

function getPhoneInputTags(body) {
  return body.match(/<input\b(?=[^>]*\bname="phone")[^>]*>/g) || [];
}

function getNameInputTags(body) {
  return body.match(/<input\b(?=[^>]*\bname="name")[^>]*>/g) || [];
}

function assertPhoneInputMobileReady(tag, context) {
  assert.match(tag, /\btype="tel"/, context);
  assert.match(tag, /\bautocomplete="tel"/, context);
  assert.match(tag, /\binputmode="tel"/, context);
  assert.match(tag, /\benterkeyhint="done"/, context);
  assert.match(tag, /\bautocapitalize="off"/, context);
  assert.match(tag, /\bautocorrect="off"/, context);
  assert.match(tag, /\bspellcheck="false"/, context);
  assert.match(tag, /\brequired\b/, context);
}

function assertNameInputOptional(tag, context) {
  assert.match(tag, /\bautocomplete="name"/, context);
  assert.match(tag, /\bplaceholder="Full Name"/, context);
  assert.doesNotMatch(tag, /\brequired\b/, context);
}

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
    assert.match(body, /\/css\/ads-lp-v3\.css\?v=20260603-14/, landing.route);
    assert.match(body, /\/js\/ads-lp-v3\.js\?v=20260603-7/, landing.route);
    assert.match(body, /data-adlp-quote-form/, landing.route);
    assert.match(body, new RegExp(`value="${landing.service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), landing.route);
    assert.doesNotMatch(body, /<a\b[^>]*class="[^"]*\badlp-logo\b/i, landing.route);
    assert.match(body, /Price depends on home size and condition\./, landing.route);
    assert.match(body, /Carefully chosen supplies/i, landing.route);
    assert.doesNotMatch(body, /\beco[- ]?friendly\b|\bnon-toxic\b|\bpet[- ]safe\b/i, landing.route);
    assert.doesNotMatch(body, /bed making|linens are left out|make beds|make the bed/i, landing.route);
    assert.doesNotMatch(body, /from\s+\$/i, landing.route);
    assert.doesNotMatch(body, /\$(?:120-\$200|180-\$350|250-\$500)/, landing.route);
    assert.doesNotMatch(body, /\$(?:135|195|241)\+/, landing.route);
    const nameInputTags = getNameInputTags(body);
    assert.ok(nameInputTags.length > 0, `${landing.route} should include optional name inputs`);
    nameInputTags.forEach((tag) => assertNameInputOptional(tag, landing.route));
    const phoneInputTags = getPhoneInputTags(body);
    assert.ok(phoneInputTags.length > 0, `${landing.route} should include phone inputs`);
    phoneInputTags.forEach((tag) => assertPhoneInputMobileReady(tag, landing.route));
    assert.match(body, /id="mobile-sticky-cta"/, landing.route);
    assert.match(body, /<!-- Google Tag Manager -->/, landing.route);
    assert.match(body, /GTM-5P88N7LD/, landing.route);
    assert.doesNotMatch(body, /id="shynli-site-header"/, landing.route);
    assert.doesNotMatch(body, /id="shynli-site-footer"/, landing.route);
    assert.doesNotMatch(body, /tilda-blocks-page|tilda-scripts|fonts\.googleapis\.com|fonts\.gstatic\.com/, landing.route);
    assert.doesNotMatch(body, /alert\(/, landing.route);
    assert.match(body, /adlp-review-marquee/, landing.route);
    assert.match(body, /Request a Call/, landing.route);
    assert.doesNotMatch(body, /adlp-hero__media|home-copy-team|Local team, local routes/, landing.route);
    assert.doesNotMatch(body, /\/services\/(?:regular-cleaning|deep-cleaning|move-in-move-out-cleaning)\/ads-v2/, landing.route);

    if (landing.route === "/cleaners-near-me/ads-lp") {
      const cityGridMatch = body.match(/<div class="adlp-city-grid">([\s\S]*?)<\/div>/);
      const cityGrid = cityGridMatch ? cityGridMatch[1] : "";
      assert.match(cityGrid, /<span>Naperville<\/span>/, landing.route);
      assert.doesNotMatch(cityGrid, /<a\b|href=/i, landing.route);
    }
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

test("submits ad-only landing forms directly without quote-page redirects", async () => {
  const response = await fetch(`${BASE_URL}/js/ads-lp-v3.js?v=20260603-7`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /\/api\/quote\/submit/);
  assert.match(body, /Thank you\. Our manager will call you shortly\./);
  assert.match(body, /<span>Full Name<\/span><input type="text" name="name" autocomplete="name" placeholder="Full Name">/);
  assert.match(body, /Website Lead /);
  assert.match(body, /data-adlp-success-modal/);
  assert.match(body, /aria-live", "polite"/);
  assert.match(body, /Request received/);
  assert.match(body, /Thank you, we received your request\./);
  assert.match(body, /Our manager will contact you shortly\./);
  assert.match(body, /openLeadSuccessModal\(\);/);
  assert.match(body, /enhancePhoneInput/);
  assert.match(body, /enterkeyhint="done"/);
  assert.doesNotMatch(body, /Last name|First name|name="lastName"|name="firstName"/);
  assert.doesNotMatch(body, /Please enter your first and last name/);
  assert.doesNotMatch(body, /\/quote-no-price/);
  assert.doesNotMatch(body, /window\.location\.href\s*=/);
  assert.doesNotMatch(body, /Opening your quote/);
});

test("keeps dark CTA callback buttons readable", async () => {
  const response = await fetch(`${BASE_URL}/css/ads-lp-v3.css?v=20260603-14`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /body\.adlp-page \.adlp-mid-cta button\.adlp-button\s*{\s*color: var\(--adlp-rose\);/);
  assert.match(body, /\.adlp-mid-cta \.adlp-button:hover/);
});
