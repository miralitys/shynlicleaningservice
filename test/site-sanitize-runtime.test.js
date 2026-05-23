"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSiteSanitizer } = require("../lib/site/sanitize");

const LEGACY_SAFETY_INTRO_PATTERN = /For your safety and ours, we don't provide:/;

function normalizeRoute(rawPath) {
  let value = rawPath || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

const siteSeoHelpers = {
  deriveRouteSeo(html, routePath) {
    if (routePath === "/quote") {
      return {
        title: "Request a Quote | Shynli Cleaning",
        description:
          "Get an instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning.",
        robots: "noindex,nofollow",
        ogUrl: "https://shynlicleaningservice.com/quote",
        ogTitle: "Request a Quote | Shynli Cleaning",
        ogDescription:
          "Instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning.",
        canonical: "https://shynlicleaningservice.com/quote",
      };
    }

    return {
      title: "",
      description: "",
      robots: "index,follow",
      ogUrl: "",
      ogTitle: "",
      ogDescription: "",
      canonical: "",
    };
  },
  setTitleTag(html) {
    return html;
  },
  setMetaContent(html, key, value) {
    if (!value) return html;
    if (key === "description" && !/<meta[^>]+name="description"/i.test(html)) {
      return html.replace(/<\/head>/i, `<meta name="description" content="${value}" /></head>`);
    }
    return html;
  },
  setCanonicalLink(html, url) {
    if (!url) return html;
    if (/<link[^>]+rel="canonical"/i.test(html)) {
      return html.replace(/<link[^>]+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${url}">`);
    }
    return html;
  },
  upsertJsonLd(html) {
    return html;
  },
  buildHomeSchemas() {
    return "";
  },
  buildBreadcrumbSchema() {
    return null;
  },
  buildContactSchema() {
    return null;
  },
  buildFaqSchema() {
    return null;
  },
  buildServiceSchema() {
    return null;
  },
};

const runtimeScriptIds = new Set([
  "deep-cleaning-addons-rebuild",
  "full-card-click-handler",
  "shynli-blog-topic-hub-script",
  "shynli-menu-shell-runtime",
  "mobile-contact-details-fix",
  "mobile-sticky-cta",
  "pricing-calculator-scroll",
  "safari-home-layout-fix",
  "shynli-form-attribution-runtime",
  "shynli-menu-widgeticons-runtime-stub",
  "shynli-menusub-runtime",
  "shynli-cleaner-application-form-runtime",
  "shynli-quote-start-widget-runtime",
  "shynli-zero-form-runtime-stub",
  "shynli-zero-runtime-stub",
  "shynli-zero-form-phone-sync",
]);

const sanitizeHtml = createSiteSanitizer({
  GOOGLE_TAG_MANAGER_CONTAINER_ID: "GTM-5P88N7LD",
  GOOGLE_PLACES_API_KEY: "",
  normalizeRoute,
  siteSeoHelpers,
}).sanitizeHtml;

const CALLRAIL_SWAP_SCRIPT_PATTERN =
  /<script id="shynli-callrail-loader">(?=[\s\S]*?\/js\/vendor\/callrail-swap\.20260523\.js[\s\S]*?<\/script>)(?=[\s\S]*?setTimeout\(idleLoad,9000\)[\s\S]*?<\/script>)[\s\S]*?<\/script>/;
const CALLRAIL_SWAP_SCRIPT_URL_PATTERN =
  /\/js\/vendor\/callrail-swap\.20260523\.js/g;
const BENEFIT_HIDDEN_FEES_COPY_PATTERN =
  /What you see is what you pay\.(?:\s*<br\s*\/?>\s*|\s+)No hidden fees\./g;
const BENEFIT_STANDARDS_COPY_PATTERN =
  /Same quality, same standards,(?:\s*<br\s*\/?>\s*|\s+)every single visit\./g;

function readFixture(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
}

function countMatches(html, pattern) {
  return (String(html || "").match(pattern) || []).length;
}

function extractRuntimeScripts(html) {
  const scripts = [];
  const pattern = /<script[^>]+id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const [, scriptId, source] = match;
    if (!runtimeScriptIds.has(scriptId)) continue;
    scripts.push({ scriptId, source });
  }

  return scripts;
}

test("keeps injected runtime scripts syntactically valid on home, blog, city, and quote routes", () => {
  const fixtures = [
    { route: "/", html: readFixture("page108488156.html") },
    { route: "/blog", html: readFixture("page108872586.html") },
    { route: "/romeoville", html: readFixture("page111640886.html") },
    { route: "/quote", html: readFixture("quote2.html") },
  ];

  for (const fixture of fixtures) {
    const sanitized = sanitizeHtml(fixture.html, fixture.route);
    const scripts = extractRuntimeScripts(sanitized);
    assert.ok(scripts.length > 0, `expected runtime scripts on ${fixture.route}`);

    for (const { scriptId, source } of scripts) {
      assert.doesNotThrow(
        () => new Function(source),
        `expected ${scriptId} to compile without syntax errors on ${fixture.route}`
      );
    }
  }
});

test("removes legacy analytics and keeps only shared head assets", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const quoteHtml = sanitizeHtml(readFixture("quote2.html"), "/quote");

  for (const html of [homeHtml, quoteHtml]) {
    assert.doesNotMatch(html, /google-analytics\.com\/analytics\.js/);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js\?id=/);
    assert.doesNotMatch(html, /id="shynli-analytics"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  }
});

test("injects Google Tag Manager at the top of public page head and body", () => {
  const fixtures = [
    { route: "/", html: readFixture("page108488156.html") },
    { route: "/blog", html: readFixture("page108872586.html") },
    { route: "/quote", html: readFixture("quote2.html") },
  ];

  for (const fixture of fixtures) {
    const sanitized = sanitizeHtml(fixture.html, fixture.route);
    assert.match(
      sanitized,
      /<head><script id="shynli-tracking-bootstrap">/
    );
    assert.match(sanitized, /\/js\/shynli-tracking\.js/);
    assert.doesNotMatch(sanitized, /<script[^>]+src="\/js\/shynli-tracking\.js"/);
    assert.match(sanitized, /googletagmanager\.com\/gtm\.js\?id='\+i\+dl|googletagmanager\.com\/gtm\.js\?id=/);
    assert.match(sanitized, /requestIdleCallback/);
    assert.match(sanitized, /setTimeout\(idleLoad,12000\)/);
    assert.match(sanitized, /setTimeout\(idleLoad,4500\)/);
    assert.match(sanitized, /\['pointerdown','keydown','touchstart'\]/);
    assert.doesNotMatch(sanitized, /googletagmanager\.com\/gtag\/js\?id=/);
    assert.match(sanitized, /<body[^>]*><!-- Google Tag Manager \(noscript\) -->/);
    assert.match(sanitized, /googletagmanager\.com\/ns\.html\?id=GTM-5P88N7LD/);
  }
});

test("loads home fonts locally without adding Google Fonts to the critical chain", () => {
  const sanitized = sanitizeHtml(readFixture("page108488156.html"), "/");

  assert.match(sanitized, /<link rel="preload" href="\/fonts\/playfair-display-latin-400-900\.woff2" as="font"/);
  assert.match(sanitized, /<link rel="preload" href="\/fonts\/montserrat-latin-300-800\.woff2" as="font"/);
  assert.match(sanitized, /<link rel="stylesheet" href="\/css\/shynli-fonts\.css\?v=20260522-local2">/);
  assert.doesNotMatch(sanitized, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("loads managed page fonts locally without adding Google Fonts to the critical chain", () => {
  const fixtures = [
    { route: "/blog", html: readFixture("page108872586.html") },
    { route: "/quote", html: readFixture("quote2.html") },
  ];

  for (const fixture of fixtures) {
    const sanitized = sanitizeHtml(fixture.html, fixture.route);
    assert.match(sanitized, /<link rel="preload" href="\/fonts\/playfair-display-latin-400-900\.woff2" as="font"/, fixture.route);
    assert.match(sanitized, /<link rel="preload" href="\/fonts\/montserrat-latin-300-800\.woff2" as="font"/, fixture.route);
    assert.match(sanitized, /<link rel="stylesheet" href="\/css\/shynli-fonts\.css\?v=20260522-local2">/, fixture.route);
    assert.doesNotMatch(
      sanitized,
      /fonts\.googleapis\.com|fonts\.gstatic\.com|data-shynli-font-async/,
      fixture.route
    );
  }
});

test("removes Google Fonts even when legacy blocks inject them outside the head", () => {
  const source = `<!doctype html>
<html>
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600&display=swap">
</head>
<body>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
  <style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&amp;display=swap');</style>
  <main style="font-family: Montserrat, sans-serif;">Hello</main>
</body>
</html>`;
  const sanitized = sanitizeHtml(source, "/about-us");

  assert.match(sanitized, /<link rel="preload" href="\/fonts\/playfair-display-latin-400-900\.woff2" as="font"/);
  assert.match(sanitized, /<link rel="preload" href="\/fonts\/montserrat-latin-300-800\.woff2" as="font"/);
  assert.match(sanitized, /<link rel="stylesheet" href="\/css\/shynli-fonts\.css\?v=20260522-local2">/);
  assert.equal(countMatches(sanitized, /\/css\/shynli-fonts\.css\?v=20260522-local2/g), 1);
  assert.doesNotMatch(sanitized, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("injects CallRail swap script before closing body on public site pages", () => {
  const fixtures = [
    { route: "/", html: readFixture("page108488156.html") },
    { route: "/blog", html: readFixture("page108872586.html") },
    { route: "/quote", html: readFixture("quote2.html") },
  ];

  for (const fixture of fixtures) {
    const sanitized = sanitizeHtml(fixture.html, fixture.route);

    assert.match(sanitized, CALLRAIL_SWAP_SCRIPT_PATTERN, fixture.route);
    assert.match(sanitized, new RegExp(`${CALLRAIL_SWAP_SCRIPT_PATTERN.source}<\\/body>`, "i"), fixture.route);
    assert.equal((sanitized.match(CALLRAIL_SWAP_SCRIPT_URL_PATTERN) || []).length, 1, fixture.route);
    assert.doesNotMatch(
      sanitized,
      /<script type="text\/javascript" src="\/js\/vendor\/callrail-swap\.20260523\.js" defer><\/script>/,
      fixture.route
    );
  }
});

test("injects quote runtime config with supported service ZIP codes", () => {
  const quoteHtml = sanitizeHtml(readFixture("quote2.html"), "/quote");

  assert.match(quoteHtml, /id="runtime-config"/);
  assert.match(quoteHtml, /serviceAreaZipCodes/);
  assert.match(quoteHtml, /"60563"/);
  assert.match(quoteHtml, /"60512"/);
  assert.match(quoteHtml, /googlePlacesApiKey:\s*""/);
});

test("injects quote-start widget runtime wherever quick quote widgets exist", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const cityHtml = sanitizeHtml(readFixture("page111640886.html"), "/romeoville");
  const blogArticleHtml = sanitizeHtml(
    readFixture("page108872586.html"),
    "/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos"
  );
  const quoteHtml = sanitizeHtml(readFixture("quote2.html"), "/quote");

  for (const html of [homeHtml, cityHtml]) {
    assert.match(html, /id="shynli-quote-start-widget-runtime"/);
    assert.match(html, /quote_start_widget/);
    assert.match(html, /window\.setTimeout\(function\(\) \{\s*window\.location\.href = redirectTarget;\s*\}, 200\)/);
  }

  assert.match(blogArticleHtml, /id="shynli-blog-topic-hub-script"/);
  assert.match(blogArticleHtml, /quote_start_widget/);
  assert.match(blogArticleHtml, /form_name: 'Blog Quote Widget'/);
  assert.match(blogArticleHtml, /window\.setTimeout\(function\(\)\{\s*window\.location\.href = redirectTarget;\s*\}, 200\)/);
  assert.doesNotMatch(quoteHtml, /id="shynli-quote-start-widget-runtime"/);
});

test("injects page version and gclid attribution runtime on public forms", () => {
  const pricingHtml = sanitizeHtml(readFixture("page110278596.html"), "/pricing-v2");
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/ads-v2");

  for (const html of [pricingHtml, homeHtml]) {
    assert.match(html, /id="shynli-form-attribution-runtime"/);
    assert.match(html, /name", "page_version", "page_version"|ensureHidden\(form, "page_version", "page_version"\)/);
    assert.match(html, /ensureHidden\(form, "gclid", "gclid"\)/);
    assert.match(html, /event: "form_submit"/);
    assert.match(html, /page_version:/);
  }
});

test("tracks the short quote callback form as a lead conversion", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "quote2-app.js"), "utf8");

  assert.match(source, /function trackCallbackLeadSubmission/);
  assert.match(source, /event: "lead_quote_submit"/);
  assert.match(source, /form_id: "quote2Form"/);
  assert.match(source, /form_type: "callback"/);
  assert.match(source, /event_id: generateTrackingEventId\(\)/);
  assert.match(source, /value: CALLBACK_CONVERSION_VALUE/);
  assert.match(source, /trackCallbackLeadSubmission\(\);/);
  assert.match(source, /function generateTrackingEventId/);
  assert.match(source, /event_id: generateTrackingEventId\(\),\n\s+value: Number\(totalValue\) \|\| 50/);
});

test("builds no-calculator v2 pages with static anchor pricing", () => {
  const pricingHtml = sanitizeHtml(readFixture("page110278596.html"), "/pricing-v2");
  const regularAdsHtml = sanitizeHtml(readFixture("page109653016.html"), "/services/regular-cleaning/ads-v2");
  const deepAdsHtml = sanitizeHtml(readFixture("page109721366.html"), "/services/deep-cleaning/ads-v2");
  const moveAdsHtml = sanitizeHtml(readFixture("page109993436.html"), "/services/move-in-move-out-cleaning/ads-v2");
  const homeAdsHtml = sanitizeHtml(readFixture("page108488156.html"), "/ads-v2");
  const serviceAreasHtml = sanitizeHtml(readFixture("page108912616.html"), "/service-areas-v2");

  for (const html of [pricingHtml, regularAdsHtml, deepAdsHtml, moveAdsHtml, homeAdsHtml, serviceAreasHtml]) {
    assert.match(html, /class="shynli-anchor-pricing"/);
    assert.match(html, /Regular Cleaning<\/span><span class="shynli-anchor-pricing__range">\$120 &ndash; \$200/);
    assert.match(html, /Deep Cleaning<\/span><span class="shynli-anchor-pricing__range">\$180 &ndash; \$350/);
    assert.match(html, /Move In\/Out<\/span><span class="shynli-anchor-pricing__range">\$250 &ndash; \$500/);
    assert.match(html, /Free quote in 60 seconds &mdash; no obligation/);
    assert.doesNotMatch(html, /id="cleaningCalculator"/);
  }

  assert.match(pricingHtml, /Get Your Free Quote/);
  assert.match(pricingHtml, /Want to estimate your price online\? Use our calculator/);
  assert.doesNotMatch(pricingHtml, /Calculate <span style="color: rgb\(158, 68, 90\);">Your Cleaning Price<\/span>/);
});

test("injects cleaner application tracking without enhanced conversion data", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");

  assert.match(html, /id="shynli-cleaner-application-form-runtime"/);
  assert.match(html, /cleaner_application_submit/);
  assert.match(html, /form_name: "Cleaner Job Application"/);
  assert.doesNotMatch(html, /sha256_email_address|sha256_phone_number|user_data/);
});

test("strips unused menu widgeticon assets when no widgeticon nodes remain", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const blogHtml = sanitizeHtml(readFixture("page108872586.html"), "/blog");

  for (const html of [homeHtml, blogHtml]) {
    assert.doesNotMatch(html, /tilda-menu-widgeticons-1\.0\.min\.js/);
    assert.doesNotMatch(html, /tilda-menu-widgeticons-1\.0\.min\.css/);
    assert.doesNotMatch(html, /class="[^"]*\bt-menuwidgeticons(?:__|\b)[^"]*"/i);
  }

  assert.match(homeHtml, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(blogHtml, /id="shynli-menu-widgeticons-runtime-stub"/);
});

test("replaces the legacy menusub runtime on remaining Tilda pages", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const cityHtml = sanitizeHtml(readFixture("page111640886.html"), "/romeoville");
  const blogHtml = sanitizeHtml(readFixture("page108872586.html"), "/blog");

  for (const html of [homeHtml, cityHtml]) {
    assert.doesNotMatch(html, /js\/tilda-menusub-1\.0\.min\.js/);
    assert.match(html, /id="shynli-menusub-runtime"/);
    assert.match(html, /class="t-menusub"/);
    assert.match(html, /data-menu-submenu-hook="/);
  }

  assert.doesNotMatch(blogHtml, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.doesNotMatch(blogHtml, /id="shynli-menusub-runtime"/);
  assert.doesNotMatch(blogHtml, /class="t-menusub"/);
});

test("replaces legacy tilda menu runtimes with the shared menu shell runtime", () => {
  const fixtures = [
    { route: "/", file: "page108488156.html" },
    { route: "/romeoville", file: "page111640886.html" },
  ];

  for (const fixture of fixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);
    assert.doesNotMatch(html, /js\/tilda-menu-1\.1\.min\.js/);
    assert.doesNotMatch(html, /js\/tilda-menu-burger-1\.0\.min\.js/);
    assert.match(html, /id="shynli-menu-shell-runtime"/);
    assert.match(html, /class="t-menu-burger\b/);
    assert.match(html, /class="t-menu-base\b/);
  }
});

test("renders managed blog routes through the standalone blog shell", () => {
  const fixtures = [
    { route: "/blog", expected: /Shynli Cleaning <span>Blog<\/span>/ },
    { route: "/blog-copy", expected: /Shynli Cleaning <span>Blog<\/span>/ },
    { route: "/blog/checklists", expected: /Cleaning <span>Checklists<\/span>/ },
    {
      route: "/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos",
      expected: /Airbnb Turnover Cleaning Checklist/i,
    },
  ];

  for (const fixture of fixtures) {
    const html = sanitizeHtml(readFixture("page108872586.html"), fixture.route);
    assert.doesNotMatch(html, /data-tilda-project-id=/);
    assert.doesNotMatch(html, /tilda-grid-3\.0\.min\.css/);
    assert.doesNotMatch(html, /tilda-blocks-page108872586/);
    assert.doesNotMatch(html, /tilda-zero-1\.1\.min\.js/);
    assert.doesNotMatch(html, /tilda-scripts-3\.0\.min\.js/);
    assert.doesNotMatch(html, /tilda-events-1\.0\.min\.js/);
    assert.doesNotMatch(html, /tilda-popup-1\.0\.min\.js/);
    assert.doesNotMatch(html, /tilda-menu-1\.1\.min\.js/);
    assert.doesNotMatch(html, /tilda-menu-burger-1\.0\.min\.js/);
    assert.match(html, /class="shynli-blog-shell"/);
    assert.match(html, /id="shynli-blog-topic-hub-script"/);
    assert.match(html, fixture.expected);
  }
});

test("keeps separate desktop behaviors for blog Services hover and City modal", () => {
  const html = sanitizeHtml(readFixture("page108872586.html"), "/blog");

  assert.match(html, /shynli-blog-shell__details shynli-blog-shell__details--hoverable/);
  assert.match(html, /data-city-modal-open/);
  assert.match(html, /data-city-modal/);
  assert.match(html, /Service areas by city/);
  assert.match(html, /A-D:/);
  assert.match(html, /V-Y:/);
  assert.match(html, /Addison/);
  assert.match(html, /Naperville/);
  assert.match(html, /Bristol/);
  assert.match(html, /North Aurora/);
  assert.match(html, /Sugar Grove/);
  assert.match(html, /Yorkville/);
  assert.match(html, /Downers Grove/);
  assert.match(html, /Woodridge/);
});

test("rebuilds shared marketing city popups and removes the temporary extra city promo", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const serviceAreasHtml = sanitizeHtml(readFixture("page108912616.html"), "/service-areas");

  assert.match(homeHtml, /data-tooltip-hook="#city"/);
  assert.match(homeHtml, /shynli-city-popup-list__grid/);
  assert.match(homeHtml, /\.t396__carrier\{background-position:center center;background-attachment:scroll;background-size:cover;background-repeat:no-repeat;pointer-events:none;\}/);
  assert.match(homeHtml, /\.t396__filter\{pointer-events:none;\}/);
  assert.match(homeHtml, /shynli-city-popup-list,\#rec\d+ \.shynli-city-popup-list \*\{pointer-events:auto;\}/);
  assert.match(homeHtml, /t396__artboard t396__artboard_pointer-events-auto/);
  assert.match(homeHtml, /A-D:/);
  assert.match(homeHtml, /V-Y:/);
  assert.match(homeHtml, /Bristol/);
  assert.match(homeHtml, /North Aurora/);
  assert.match(homeHtml, /Sugar Grove/);
  assert.match(homeHtml, /Yorkville/);

  assert.doesNotMatch(serviceAreasHtml, /shynli-extra-service-areas/);
  assert.doesNotMatch(serviceAreasHtml, /Now serving these cities too/);
  assert.doesNotMatch(serviceAreasHtml, /New service areas/i);
  assert.match(serviceAreasHtml, /shynli-city-popup-list__grid/);
  assert.match(serviceAreasHtml, /shynli-service-areas-overview__grid/);
  assert.match(serviceAreasHtml, /V-Y:/);
});

test("preserves menu CTA wiring and submenu content after the menu shell replacement", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");

  assert.doesNotMatch(html, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-blocks-page108488156\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(html, /data-original=/);
  assert.match(html, /id="shynli-home-page-runtime"/);
  assert.match(html, /id="shynli-zero-runtime-stub"/);
  assert.match(html, /href="\/quote"/);
  assert.match(html, /href="#city"/);
  assert.match(html, /href="#clean"/);
  assert.match(html, /data-tooltip-hook="#city"/);
  assert.match(html, /data-tooltip-hook="#clean"/);
  assert.match(html, /href="\/service-areas"/);
  assert.match(html, /href="\/about-us"/);
  assert.match(html, /href="\/faq"/);
  assert.match(html, /href="\/services\/regular-cleaning"/);
  assert.match(html, /href="\/services\/deep-cleaning"/);
  assert.match(html, /href="\/services\/move-in-move-out-cleaning"/);
  assert.match(html, /href="\/services\/airbnb-cleaning"/);
  assert.match(html, /href="\/services\/commercial-cleaning"/);
  assert.match(html, /aria-expanded="false"/);
});

test("replaces heavy zero runtimes across home-like routes", () => {
  const fixtures = [
    { route: "/", file: "page108488156.html" },
    { route: "/home-calculator", file: "page110230356.html" },
    { route: "/home-simple", file: "page108488156.html" },
  ];

  for (const fixture of fixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/tilda-blocks-page[^"]+\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/, fixture.route);
    assert.doesNotMatch(html, /data-original=/, fixture.route);
    assert.match(html, /id="shynli-home-page-runtime"/, fixture.route);
    assert.match(html, /id="shynli-zero-runtime-stub"/, fixture.route);
    assert.match(html, /href="#city"/, fixture.route);
    assert.match(html, /href="#clean"/, fixture.route);
    assert.match(html, /Shynli Cleaning/i, fixture.route);
    assert.doesNotMatch(html, LEGACY_SAFETY_INTRO_PATTERN, fixture.route);
  }
});

test("keeps the home copy hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page108488156-copy.html"), "/home-copy");
  const tildaMarkers =
    /(?:tild|tilda|data-tilda|id="allrecords"|\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-body\b|\bt-menu\b|\bt-btn\b)/i;

  assert.match(html, /<main>/);
  assert.match(html, /<section class="hero"/);
  assert.match(html, /House Cleaning[\s\S]*Services in Naperville[\s\S]*&amp; Chicago Suburbs/i);
  assert.match(html, /href="\/css\/home-copy-clean\.css\?v=20260523-dom1"/);
  assert.match(html, /src="\/js\/home-copy-clean\.js\?v=20260522-match67"/);
  assert.match(html, /src="\/images\/home-copy-team\.png"|srcset="\/images\/home-copy-team-480\.webp/);
  assert.match(html, /class="hero__team"[^>]*loading="eager"[^>]*decoding="sync"[^>]*fetchpriority="high"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/">/);
  assert.doesNotMatch(html, tildaMarkers);
  assert.doesNotMatch(html, /(?:css|js)\/tilda/i);
  assert.doesNotMatch(html, /data-original=/);
  assert.doesNotMatch(html, /id="shynli-homepage-copy-fit-style"/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(html, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(html, LEGACY_SAFETY_INTRO_PATTERN);
});

test("serves Romeoville from the clean shared city template", () => {
  const html = sanitizeHtml(readFixture("page123500105.html"), "/romeoville");

  assert.doesNotMatch(html, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-blocks-page111640886\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(html, /data-original=/);
  assert.match(html, /id="shynli-home-page-runtime"/);
  assert.match(html, /id="shynli-zero-runtime-stub"/);
  assert.match(html, /src="images\/shynli-logo-primary\.png"/);
  assert.match(html, /href="\/images\/shynli-icon-32\.png"/);
  assert.match(html, /href="#city"/);
  assert.match(html, /href="#clean"/);
  assert.match(html, /House Cleaning Services in <span class="sg-accent">Romeoville<\/span>, IL/);
  assert.match(
    html,
    /<a class="sg-button sg-button--outline sg-city-button"[^>]*>Romeoville<\/a>/
  );
  assert.doesNotMatch(html, /tild|tilda|t-rec|t396|tn-atom|data-tilda|t-menu|t-btn|allrecords|t-body/i);
});

test("replaces heavy zero runtimes across all city page pilots", () => {
  const cityFixtures = [
    { route: "/addison", file: "page123500105.html", city: "Addison" },
    { route: "/aurora", file: "page123500105.html", city: "Aurora" },
    { route: "/bartlett", file: "page123500105.html", city: "Bartlett" },
    { route: "/batavia", file: "page123500105.html", city: "Batavia" },
    { route: "/bolingbrook", file: "page123500105.html", city: "Bolingbrook" },
    { route: "/bristol", file: "page123500105.html", city: "Bristol" },
    { route: "/burrridge", file: "page123500105.html", city: "Burr Ridge" },
    { route: "/carolstream", file: "page123500105.html", city: "Carol Stream" },
    { route: "/clarendonhills", file: "page123500105.html", city: "Clarendon Hills" },
    { route: "/darien", file: "page123500105.html", city: "Darien" },
    { route: "/downersgrove", file: "page123500105.html", city: "Downers Grove" },
    { route: "/elmhurst", file: "page123500105.html", city: "Elmhurst" },
    { route: "/geneva", file: "page123500105.html", city: "Geneva" },
    { route: "/glenellyn", file: "page123500105.html", city: "Glen Ellyn" },
    { route: "/hinsdale", file: "page123500105.html", city: "Hinsdale" },
    { route: "/homerglen", file: "page123500105.html", city: "Homer Glen" },
    { route: "/itasca", file: "page123500105.html", city: "Itasca" },
    { route: "/lemont", file: "page123500105.html", city: "Lemont" },
    { route: "/lisle", file: "page123500105.html", city: "Lisle" },
    { route: "/lockport", file: "page123500105.html", city: "Lockport" },
    { route: "/lombard", file: "page123500105.html", city: "Lombard" },
    { route: "/montgomery", file: "page123500105.html", city: "Montgomery" },
    { route: "/naperville", file: "page123500105.html", city: "Naperville" },
    { route: "/northaurora", file: "page123500105.html", city: "North Aurora" },
    { route: "/oakbrook", file: "page123500105.html", city: "Oak Brook" },
    { route: "/oswego", file: "page123500105.html", city: "Oswego" },
    { route: "/plainfield", file: "page123500105.html", city: "Plainfield" },
    { route: "/romeoville", file: "page123500105.html", city: "Romeoville" },
    { route: "/stcharles", file: "page123500105.html", city: "St. Charles" },
    { route: "/streamwood", file: "page123500105.html", city: "Streamwood" },
    { route: "/sugargrove", file: "page123500105.html", city: "Sugar Grove" },
    { route: "/villapark", file: "page123500105.html", city: "Villa Park" },
    { route: "/warrenville", file: "page123500105.html", city: "Warrenville" },
    { route: "/wayne", file: "page123500105.html", city: "Wayne" },
    { route: "/westchicago", file: "page123500105.html", city: "West Chicago" },
    { route: "/westmont", file: "page123500105.html", city: "Westmont" },
    { route: "/wheaton", file: "page123500105.html", city: "Wheaton" },
    { route: "/willowbrook", file: "page123500105.html", city: "Willowbrook" },
    { route: "/winfield", file: "page123500105.html", city: "Winfield" },
    { route: "/wooddale", file: "page123500105.html", city: "Wood Dale" },
    { route: "/woodridge", file: "page123500105.html", city: "Woodridge" },
    { route: "/yorkville", file: "page123500105.html", city: "Yorkville" },
  ];

  for (const fixture of cityFixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);
    const cityPattern = fixture.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/, fixture.route);
    assert.doesNotMatch(html, /data-original=/, fixture.route);
    assert.doesNotMatch(html, /tild|tilda|t-rec|t396|tn-atom|data-tilda|t-menu|t-btn|allrecords|t-body/i, fixture.route);
    assert.match(html, /id="shynli-home-page-runtime"/, fixture.route);
    assert.match(html, /id="shynli-zero-runtime-stub"/, fixture.route);
    assert.match(html, /src="images\/shynli-logo-primary\.png"/, fixture.route);
    assert.match(html, /href="#city"/, fixture.route);
    assert.match(html, /href="#clean"/, fixture.route);
    assert.match(
      html,
      new RegExp(`<a class="sg-button sg-button--outline sg-city-button"[^>]*>${cityPattern}<\\/a>`),
      fixture.route
    );
  }
});

test("replaces heavy zero runtimes across static marketing page pilots", () => {
  const staticFixtures = [
    { route: "/about-us", file: "page109184776.html", expected: /About/i },
    { route: "/faq", file: "page109088646.html", expected: /FAQ|pricing calculated/i },
    { route: "/pricing", file: "page110278596.html", expected: /Pricing|Instant Quote/i },
    { route: "/service-areas", file: "page108912616.html", expected: /Service Areas/i },
  ];

  for (const fixture of staticFixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/, fixture.route);
    assert.doesNotMatch(html, /data-original=/, fixture.route);
    assert.match(html, /id="shynli-home-page-runtime"/, fixture.route);
    assert.match(html, /id="shynli-zero-runtime-stub"/, fixture.route);
    assert.match(html, /href="#city"/, fixture.route);
    assert.match(html, /href="#clean"/, fixture.route);
    assert.match(html, fixture.expected, fixture.route);
    assert.doesNotMatch(html, LEGACY_SAFETY_INTRO_PATTERN, fixture.route);
  }
});

test("keeps the contacts main route hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page109085526-copy.html"), "/contacts");

  assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/contacts"\s*\/?>/);
  assert.match(html, /Get in Touch With Shynli Cleaning/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(html, /(?:css|js)\/tilda/i);
  assert.doesNotMatch(html, /(?:class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-)/i);
});

test("strips the legacy safety intro copy from marketing pages", () => {
  const source = `${readFixture("page108488156.html")}For your safety and ours, we don't provide:`;
  const html = sanitizeHtml(source, "/");

  assert.match(html, /Why <span[^>]*>Shynli Cleaning<\/span> Is Different/);
  assert.doesNotMatch(html, LEGACY_SAFETY_INTRO_PATTERN);
});

test("adds the homepage fast quote CTA before the service areas map", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");

  const ctaIndex = html.indexOf('id="shynli-home-fast-quote-cta"');
  const serviceAreasIndex = html.indexOf('id="rec1822455943"');

  assert.notEqual(ctaIndex, -1);
  assert.notEqual(serviceAreasIndex, -1);
  assert.ok(ctaIndex < serviceAreasIndex);
  assert.match(html, /class="shynli-home-fast-quote-cta__button" href="\/quote">Fast free quote/);
});

test("adds local-service FAQ questions to the homepage FAQ grid", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");
  const firstNewQuestionIndex = html.indexOf("Do you offer house cleaning in Naperville and Aurora?");
  const originalFirstQuestionIndex = html.indexOf("Do you offer one-time cleaning?");

  assert.notEqual(firstNewQuestionIndex, -1);
  assert.notEqual(originalFirstQuestionIndex, -1);
  assert.ok(firstNewQuestionIndex < originalFirstQuestionIndex);
  assert.match(html, /Do you bring cleaning supplies\?/);
  assert.match(html, /Can I book recurring cleaning\?/);
  assert.match(html, /Do you offer move-out cleaning\?/);
  assert.match(html, /Our cleaners bring professional cleaning supplies and products\./);
});

test("removes the duplicate offscreen homepage simple steps copy", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");
  const simpleStepsMatches =
    html.match(/4 simple steps to a perfectly clean, cozy, and comfortable space/g) || [];

  assert.equal(simpleStepsMatches.length, 1);
  assert.doesNotMatch(html, /data-elem-id=['"]1767790203594000001['"]/);
  assert.match(html, /data-elem-id=['"]1767788361435['"]/);
});

test("keeps city-specific copy aligned on every city page", () => {
  const fixtures = [
    { route: "/addison", file: "page123500105.html", city: "Addison" },
    { route: "/aurora", file: "page123500105.html", city: "Aurora" },
    { route: "/bartlett", file: "page123500105.html", city: "Bartlett" },
    { route: "/batavia", file: "page123500105.html", city: "Batavia" },
    { route: "/bolingbrook", file: "page123500105.html", city: "Bolingbrook" },
    { route: "/bristol", file: "page123500105.html", city: "Bristol" },
    { route: "/burrridge", file: "page123500105.html", city: "Burr Ridge" },
    { route: "/carolstream", file: "page123500105.html", city: "Carol Stream" },
    { route: "/clarendonhills", file: "page123500105.html", city: "Clarendon Hills" },
    { route: "/darien", file: "page123500105.html", city: "Darien" },
    { route: "/downersgrove", file: "page123500105.html", city: "Downers Grove" },
    { route: "/elmhurst", file: "page123500105.html", city: "Elmhurst" },
    { route: "/geneva", file: "page123500105.html", city: "Geneva" },
    { route: "/glenellyn", file: "page123500105.html", city: "Glen Ellyn" },
    { route: "/hinsdale", file: "page123500105.html", city: "Hinsdale" },
    { route: "/homerglen", file: "page123500105.html", city: "Homer Glen" },
    { route: "/itasca", file: "page123500105.html", city: "Itasca" },
    { route: "/lemont", file: "page123500105.html", city: "Lemont" },
    { route: "/lisle", file: "page123500105.html", city: "Lisle" },
    { route: "/lockport", file: "page123500105.html", city: "Lockport" },
    { route: "/lombard", file: "page123500105.html", city: "Lombard" },
    { route: "/montgomery", file: "page123500105.html", city: "Montgomery" },
    { route: "/naperville", file: "page123500105.html", city: "Naperville" },
    { route: "/northaurora", file: "page123500105.html", city: "North Aurora" },
    { route: "/oakbrook", file: "page123500105.html", city: "Oak Brook" },
    { route: "/oswego", file: "page123500105.html", city: "Oswego" },
    { route: "/plainfield", file: "page123500105.html", city: "Plainfield" },
    { route: "/romeoville", file: "page123500105.html", city: "Romeoville" },
    { route: "/stcharles", file: "page123500105.html", city: "St. Charles" },
    { route: "/streamwood", file: "page123500105.html", city: "Streamwood" },
    { route: "/sugargrove", file: "page123500105.html", city: "Sugar Grove" },
    { route: "/villapark", file: "page123500105.html", city: "Villa Park" },
    { route: "/warrenville", file: "page123500105.html", city: "Warrenville" },
    { route: "/wayne", file: "page123500105.html", city: "Wayne" },
    { route: "/westchicago", file: "page123500105.html", city: "West Chicago" },
    { route: "/westmont", file: "page123500105.html", city: "Westmont" },
    { route: "/wheaton", file: "page123500105.html", city: "Wheaton" },
    { route: "/willowbrook", file: "page123500105.html", city: "Willowbrook" },
    { route: "/winfield", file: "page123500105.html", city: "Winfield" },
    { route: "/wooddale", file: "page123500105.html", city: "Wood Dale" },
    { route: "/woodridge", file: "page123500105.html", city: "Woodridge" },
    { route: "/yorkville", file: "page123500105.html", city: "Yorkville" },
  ];
  const toText = (html) =>
    String(html || "")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const captureAll = (text, pattern) =>
    [...text.matchAll(pattern)].map((match) => match[1].trim().replace(/\s+/g, " "));
  const assertOnlyCity = (values, city, label, route) => {
    assert.ok(values.length >= 1, `${route} should include ${label}`);
    assert.equal(new Set(values).size, 1, `${route} should not mix cities in ${label}`);
    assert.equal(values[0], city, `${route} ${label}`);
  };
  const expectedNearbyCities = {
    Addison: ["Villa Park", "Elmhurst", "Lombard", "Wood Dale", "Itasca", "Carol Stream", "Glen Ellyn"],
    Aurora: ["North Aurora", "Montgomery", "Sugar Grove", "Oswego", "Naperville", "Batavia", "Warrenville"],
    Bartlett: ["Streamwood", "Carol Stream", "Wayne", "West Chicago", "Winfield", "Glen Ellyn", "Wheaton"],
    Batavia: ["Geneva", "North Aurora", "Aurora", "St. Charles", "Sugar Grove", "West Chicago", "Warrenville"],
    Bolingbrook: ["Woodridge", "Romeoville", "Plainfield", "Naperville", "Darien", "Lemont", "Lisle"],
    Bristol: ["Yorkville", "Montgomery", "Oswego", "Sugar Grove", "Aurora", "North Aurora", "Plainfield"],
    "Burr Ridge": ["Willowbrook", "Hinsdale", "Clarendon Hills", "Darien", "Westmont", "Downers Grove", "Oak Brook"],
    "Carol Stream": ["Wheaton", "Winfield", "Glen Ellyn", "Bartlett", "West Chicago", "Lombard", "Wayne"],
    "Clarendon Hills": ["Hinsdale", "Westmont", "Downers Grove", "Burr Ridge", "Oak Brook", "Darien", "Willowbrook"],
    Darien: ["Willowbrook", "Woodridge", "Downers Grove", "Burr Ridge", "Westmont", "Lemont", "Bolingbrook"],
    "Downers Grove": ["Westmont", "Woodridge", "Lisle", "Darien", "Clarendon Hills", "Oak Brook", "Lombard"],
    Elmhurst: ["Villa Park", "Addison", "Lombard", "Oak Brook", "Wood Dale", "Itasca", "Glen Ellyn"],
    Geneva: ["Batavia", "St. Charles", "West Chicago", "North Aurora", "Aurora", "Winfield", "Warrenville"],
    "Glen Ellyn": ["Wheaton", "Lombard", "Carol Stream", "Winfield", "Villa Park", "Downers Grove", "Lisle"],
    Hinsdale: ["Clarendon Hills", "Burr Ridge", "Oak Brook", "Westmont", "Willowbrook", "Downers Grove", "Darien"],
    "Homer Glen": ["Lemont", "Lockport", "Romeoville", "Bolingbrook", "Woodridge", "Darien", "Plainfield"],
    Itasca: ["Wood Dale", "Addison", "Elmhurst", "Villa Park", "Lombard", "Carol Stream", "Bartlett"],
    Lemont: ["Homer Glen", "Lockport", "Darien", "Woodridge", "Bolingbrook", "Romeoville", "Willowbrook"],
    Lisle: ["Naperville", "Downers Grove", "Woodridge", "Glen Ellyn", "Wheaton", "Lombard", "Westmont"],
    Lockport: ["Homer Glen", "Romeoville", "Lemont", "Plainfield", "Bolingbrook", "Woodridge", "Naperville"],
    Lombard: ["Glen Ellyn", "Villa Park", "Addison", "Elmhurst", "Downers Grove", "Oak Brook", "Lisle"],
    Montgomery: ["Aurora", "Oswego", "North Aurora", "Sugar Grove", "Yorkville", "Bristol", "Naperville"],
    Naperville: ["Lisle", "Warrenville", "Aurora", "Woodridge", "Plainfield", "Bolingbrook", "Montgomery"],
    "North Aurora": ["Aurora", "Batavia", "Sugar Grove", "Geneva", "Montgomery", "Warrenville", "West Chicago"],
    "Oak Brook": ["Hinsdale", "Elmhurst", "Lombard", "Westmont", "Clarendon Hills", "Burr Ridge", "Villa Park"],
    Oswego: ["Montgomery", "Aurora", "Yorkville", "Plainfield", "Bristol", "Sugar Grove", "North Aurora"],
    Plainfield: ["Romeoville", "Bolingbrook", "Naperville", "Oswego", "Yorkville", "Montgomery", "Lockport"],
    Romeoville: ["Bolingbrook", "Lockport", "Plainfield", "Woodridge", "Lemont", "Homer Glen", "Naperville"],
    "St. Charles": ["Geneva", "Batavia", "Wayne", "West Chicago", "North Aurora", "Bartlett", "Winfield"],
    Streamwood: ["Bartlett", "Wayne", "Carol Stream", "West Chicago", "Winfield", "Wood Dale", "Itasca"],
    "Sugar Grove": ["Aurora", "North Aurora", "Montgomery", "Oswego", "Batavia", "Yorkville", "Naperville"],
    "Villa Park": ["Lombard", "Elmhurst", "Addison", "Oak Brook", "Glen Ellyn", "Wood Dale", "Itasca"],
    Warrenville: ["Naperville", "Winfield", "Wheaton", "West Chicago", "North Aurora", "Aurora", "Lisle"],
    Wayne: ["Bartlett", "St. Charles", "West Chicago", "Carol Stream", "Geneva", "Streamwood", "Winfield"],
    "West Chicago": ["Winfield", "Warrenville", "Wheaton", "Geneva", "Batavia", "Wayne", "Carol Stream"],
    Westmont: ["Downers Grove", "Clarendon Hills", "Hinsdale", "Oak Brook", "Darien", "Willowbrook", "Woodridge"],
    Wheaton: ["Glen Ellyn", "Winfield", "Carol Stream", "Warrenville", "West Chicago", "Lisle", "Lombard"],
    Willowbrook: ["Burr Ridge", "Darien", "Hinsdale", "Clarendon Hills", "Westmont", "Downers Grove", "Woodridge"],
    Winfield: ["Wheaton", "Warrenville", "West Chicago", "Carol Stream", "Glen Ellyn", "Wayne", "Geneva"],
    "Wood Dale": ["Itasca", "Addison", "Elmhurst", "Villa Park", "Lombard", "Carol Stream", "Bartlett"],
    Woodridge: ["Bolingbrook", "Downers Grove", "Darien", "Lisle", "Naperville", "Westmont", "Romeoville"],
    Yorkville: ["Bristol", "Oswego", "Montgomery", "Sugar Grove", "Aurora", "Plainfield", "North Aurora"],
  };
  const teamRegionByCity = new Map(
    [
      [["Addison", "Carol Stream", "Downers Grove", "Elmhurst", "Glen Ellyn", "Lisle", "Lombard", "Naperville", "Villa Park", "Warrenville", "West Chicago", "Wheaton", "Winfield"], "DuPage County communities"],
      [["Aurora", "Batavia", "Bristol", "Geneva", "Montgomery", "North Aurora", "Oswego", "St. Charles", "Sugar Grove", "Yorkville"], "Fox Valley communities"],
      [["Bartlett", "Itasca", "Streamwood", "Wayne", "Wood Dale"], "northwest suburban communities"],
      [["Bolingbrook", "Darien", "Homer Glen", "Lemont", "Lockport", "Plainfield", "Romeoville", "Woodridge"], "southwest suburban communities"],
      [["Burr Ridge", "Clarendon Hills", "Hinsdale", "Oak Brook", "Westmont", "Willowbrook"], "western suburbs"],
    ].flatMap(([cities, region]) => cities.map((city) => [city, region]))
  );
  const routeByCity = new Map(fixtures.map((fixture) => [fixture.city, fixture.route]));
  const extractAreaLinks = (html, route) => {
    const match = html.match(
      /<div class="sg-area-links" aria-label="Nearby city links">([\s\S]*?)<\/div>\s*<div class="sg-zip/
    );
    assert.ok(match, `${route} should include nearby area links`);
    return [...match[1].matchAll(/<a class="sg-area-pill([^"]*)" href="([^"]+)">([^<]+)<\/a>/g)].map(
      (linkMatch) => ({
        primary: linkMatch[1].includes("sg-area-pill--primary"),
        href: linkMatch[2],
        city: linkMatch[3],
      })
    );
  };
  const extractAreaSummaryCities = (html, route) => {
    const match = html.match(
      /<div class="sg-area-summary sg-reveal" aria-label="Service area city summary">([\s\S]*?)<\/div>/
    );
    assert.ok(match, `${route} should include the service area summary`);
    return [...match[1].matchAll(/<a class="sg-area-summary__city" href="([^"]+)">([^<]+)<\/a>/g)].map(
      (linkMatch) => ({
        href: linkMatch[1],
        city: linkMatch[2],
      })
    );
  };
  const normalizeInlineText = (value) =>
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&rsquo;|&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const extractCityFaqItems = (html, route) => {
    const match = html.match(/<section class="sg-section sg-faq" id="faq"[\s\S]*?<\/section>/);
    assert.ok(match, `${route} should include city FAQ`);
    return [
      ...match[0].matchAll(
        /<details class="sg-faq__item">[\s\S]*?<span class="sg-faq__question">([^<]+)<\/span>[\s\S]*?<p class="sg-faq__answer">([\s\S]*?)<\/p>/g
      ),
    ].map((itemMatch) => ({
      question: normalizeInlineText(itemMatch[1]),
      answer: normalizeInlineText(itemMatch[2]),
    }));
  };

  for (const fixture of fixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);
    const text = toText(html);
    const cityPattern = fixture.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    assertOnlyCity(
      captureAll(text, /(?:Home|House) Cleaning Services in\s+([^,]+?)\s*,\s*IL/g),
      fixture.city,
      "hero heading",
      fixture.route
    );
    assertOnlyCity(
      captureAll(text, /Pricing for home cleaning in\s*(?:<strong>)?([^<:]+)(?:<\/strong>)?\s*depends on:/g),
      fixture.city,
      "pricing intro",
      fixture.route
    );
    const nearbyAreaValues = captureAll(text, /Serving\s+([A-Za-z.\s]+?)\s+and nearby communities/g);
    assertOnlyCity(
      nearbyAreaValues,
      fixture.city,
      "nearby areas section",
      fixture.route
    );
    assertOnlyCity(
      [
        ...captureAll(text, /We serve select areas in and around\s+([A-Za-z.\s]+?)\s+to ensure/g),
        ...captureAll(text, /We serve\s+([A-Za-z.\s]+?)\s+and nearby/g),
        ...captureAll(text, /Shynli Cleaning serves\s+([A-Za-z.\s]+?)\s+and nearby communities/g),
      ],
      fixture.city,
      "service-area sentence",
      fixture.route
    );
    assertOnlyCity(
      [
        ...captureAll(text, /Get a Free Quote for (?:Home|House) Cleaning in\s+([A-Za-z.\s]+?)(?:\s+Get Your Home|\s+\+1\(630\)|\s+Ready to get started\?|\s+We'll confirm)/g),
        ...captureAll(text, /Get a Free Quote for (?:Home|House) Cleaning in\s+([A-Za-z.\s]+?)\s+Your name/g),
        ...captureAll(text, /Get a\s+([A-Za-z.\s]+?)\s+Cleaning Quote/g),
      ],
      fixture.city,
      "quote heading",
      fixture.route
    );
    assert.match(text, new RegExp(`Shynli Cleaning helps(?: busy)?\\s+${cityPattern}`), fixture.route);
    assert.match(
      text,
      new RegExp(`Why Choose Recurring Cleaning in\\s+${cityPattern}\\?\\s+(?:Most|Many|Recurring cleaning)[^.]*${cityPattern}`),
      fixture.route
    );
    assert.match(
      text,
      new RegExp(`We serve\\s+${cityPattern}\\s+and nearby ${teamRegionByCity.get(fixture.city)} with clear, reliable scheduling\\.`),
      fixture.route
    );
    const expectedAreas = expectedNearbyCities[fixture.city];
    assert.ok(expectedAreas, `${fixture.route} should have expected nearby cities`);
    const nearbyLinks = extractAreaLinks(html, fixture.route);
    assert.deepEqual(
      nearbyLinks.map((link) => link.city),
      expectedAreas,
      `${fixture.route} nearby area buttons`
    );
    assert.equal(nearbyLinks.length, 7, `${fixture.route} should have 7 nearby buttons`);
    assert.ok(!nearbyLinks.some((link) => link.city === fixture.city), `${fixture.route} should not list itself up top`);
    nearbyLinks.forEach((link, index) => {
      assert.equal(link.href, routeByCity.get(link.city), `${fixture.route} ${link.city} button href`);
      assert.equal(link.primary, index === nearbyLinks.length - 1, `${fixture.route} primary nearby button`);
    });
    const summaryLinks = extractAreaSummaryCities(html, fixture.route);
    assert.deepEqual(
      summaryLinks.map((link) => link.city),
      [fixture.city, ...expectedAreas],
      `${fixture.route} service area summary`
    );
    summaryLinks.forEach((link) => {
      assert.equal(link.href, routeByCity.get(link.city), `${fixture.route} ${link.city} summary href`);
    });
    const faqItems = extractCityFaqItems(html, fixture.route);
    assert.deepEqual(
      faqItems.map((item) => item.question),
      [
        `How much does house cleaning cost in ${fixture.city}?`,
        `Do you offer recurring cleaning in ${fixture.city}?`,
        `Do you provide deep cleaning in ${fixture.city}?`,
        `Do you offer move-in and move-out cleaning in ${fixture.city}?`,
        `Can I get a free quote for house cleaning in ${fixture.city}?`,
      ],
      `${fixture.route} city FAQ questions`
    );
    assert.deepEqual(
      faqItems.map((item) => item.answer),
      [
        `House cleaning pricing in ${fixture.city} depends on your home's size, number of bedrooms and bathrooms, cleaning frequency, service type, and current condition.`,
        `Yes. Shynli Cleaning offers weekly, bi-weekly, and monthly recurring house cleaning in ${fixture.city}.`,
        `Yes. We provide deep cleaning services in ${fixture.city} for seasonal refreshes, first visits, and homes that need extra attention.`,
        `Yes. We offer move-in and move-out cleaning in ${fixture.city} for houses, apartments, condos, and townhomes.`,
        `Yes. You can request a free quote for house cleaning in ${fixture.city}, and we'll confirm the details before service.`,
      ],
      `${fixture.route} city FAQ answers`
    );
    assert.equal(faqItems.length, 5, `${fixture.route} should have five city FAQ items`);
    assert.doesNotMatch(
      text,
      /We provide regular house cleaning, deep cleaning, move-in\/move-out cleaning, and one-time cleaning based on your home(?:'|’|&#39;|&rsquo;)s size, condition, and schedule/i,
      fixture.route
    );
    assert.doesNotMatch(
      text,
      new RegExp(`Most of our ${cityPattern} clients choose bi-weekly cleaning`),
      fixture.route
    );
    assert.doesNotMatch(html, /data-elem-id=['"]1767790203594000001['"]/, fixture.route);
  }
});

test("removes duplicate copy from the shared benefits block", () => {
  const sharedBenefitFixtures = [
    { route: "/", file: "page108488156.html" },
    { route: "/about-us", file: "page109184776.html" },
    { route: "/home-calculator", file: "page110230356.html" },
    { route: "/services/regular-cleaning", file: "page109653016.html" },
    { route: "/services/deep-cleaning", file: "page109721366.html" },
    { route: "/services/move-in-move-out-cleaning/ads", file: "page109993436.html" },
  ];

  for (const fixture of sharedBenefitFixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);

    assert.equal(countMatches(html, BENEFIT_HIDDEN_FEES_COPY_PATTERN), 1, fixture.route);
    assert.equal(countMatches(html, BENEFIT_STANDARDS_COPY_PATTERN), 1, fixture.route);
    assert.doesNotMatch(html, /data-elem-id=['"]1767791730605['"]/, fixture.route);
    assert.doesNotMatch(html, /data-elem-id=['"]1767881559686000001['"]/, fixture.route);
    assert.match(html, /data-elem-id=['"]1767800990870000002['"]/, fixture.route);
    assert.match(html, /data-elem-id=['"]1767881579154000002['"]/, fixture.route);
    assert.match(html, /id="shynli-benefit-copy-single-instance-style"/, fixture.route);
  }
});

test("rebuilds the homepage review block with unique current reviews", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");
  const sectionMatch = html.match(/<section class="clients-say-home"[\s\S]*?<\/section>/);

  assert.ok(sectionMatch, "homepage review section should be present");

  const section = sectionMatch[0];
  const names = [
    ...section.matchAll(/data-shynli-review-card="primary"[\s\S]*?clients-say-home__name">([^<]+)</g),
  ].map((match) => match[1]);

  assert.equal(names.length, 24);
  assert.equal(new Set(names).size, names.length);
  [
    "Suganya Swamy",
    "D B",
    "Mobile Legends Jek",
    "Yevgeniy Magomedov",
    "Aleksei Krenitsyn",
    "Max Krasavin",
    "Vlad B",
    "Anur",
    "Igor Bych",
    "Lina Gonzales",
  ].forEach((name) => assert.ok(names.includes(name), name));
  assert.equal((section.match(/clients-say-home__group--primary/g) || []).length, 2);
  assert.doesNotMatch(section, /clients-say-home__group--clone/);
  assert.doesNotMatch(section, /clients-say-home__group[^"]*" aria-hidden="true"/);
  assert.doesNotMatch(section, /clients-say-home__group--ghost/);
  assert.doesNotMatch(section, /initClientsSayMarquee/);

  const css = fs.readFileSync(path.join(__dirname, "..", "css", "home-copy-clean.css"), "utf8");
  assert.match(css, /animation-name:\s*clientsSayDriftRight/);
  assert.match(css, /animation-name:\s*clientsSayDriftLeft/);
  assert.match(css, /animation-play-state:\s*paused/);
  assert.doesNotMatch(css, /clientsSayMove/);
});

test("keeps the regular-cleaning main route hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page109653016-copy.html"), "/services/regular-cleaning");

  assert.match(html, /<main class="clean-service-page">/);
  assert.match(html, /Regular House Cleaning/);
  assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/regular-cleaning"\s*\/?>/);
  assert.doesNotMatch(html, /<meta name="robots"[^>]+noindex/i);
  assert.doesNotMatch(html, /regular-cleaning-copy/i);
  assert.doesNotMatch(html, /(?:css|js)\/tilda/i);
  assert.doesNotMatch(html, /(?:class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-)/i);
  assert.doesNotMatch(html, /data-original=/);
  assert.doesNotMatch(html, /__resize__20x__/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.match(html, /href="\/services\/regular-cleaning"/);
  assert.match(html, /href="#clean"/);
  assert.match(html, /href="\/services\/regular-cleaning#city"/);
});

test("keeps the pricing copy hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page110278596-copy.html"), "/pricing-copy");

  assert.match(html, /<main class="clean-service-page clean-pricing-page">/);
  assert.match(html, /Home Cleaning Prices in Chicagoland/);
  assert.match(html, /Calculate <span style="color: rgb\(158, 68, 90\);">Your Cleaning Price<\/span>/);
  assert.match(html, /<meta name="robots" content="noindex,follow"\s*\/?>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/pricing"\s*\/?>/);
  assert.doesNotMatch(html, /(?:css|js)\/tilda/i);
  assert.doesNotMatch(html, /(?:class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-)/i);
  assert.doesNotMatch(html, /data-original=/);
  assert.doesNotMatch(html, /__resize__20x__/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.match(html, /href="#clean"/);
  assert.match(html, /href="#city"/);
});

test("keeps the move-in move-out main route hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page109993436-copy.html"), "/services/move-in-move-out-cleaning");
  const tildaMarkers = /(?:tild|tilda|data-tilda|allrecords|\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-body\b|\bt-menu\b|\bt-btn\b)/i;

  assert.match(html, /class="[^"]*\bmove-page\b[^"]*"/);
  assert.match(html, /Cleaning for Moving In or Moving Out/i);
  assert.match(html, /<meta name="robots" content="index,follow"\s*\/?>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/move-in-move-out-cleaning"\s*\/?>/);
  assert.match(html, /\/images\/shynli-move-cleaning-hero\.png/);
  assert.match(html, /\/images\/shynli-icon-32\.png/);
  assert.doesNotMatch(html, tildaMarkers);
  assert.doesNotMatch(html, /callrail|calltrk|swap\.js|shynli-tracking|googletagmanager|Google Tag Manager/i);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(html, /id="shynli-menu-widgeticons-runtime-stub"/);
});

test("keeps the commercial-cleaning main route hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page110512356.html"), "/services/commercial-cleaning");

  assert.match(html, /class="commercial-clean-page"/);
  assert.match(html, /data-city-open/);
  assert.match(html, /data-city-modal/);
  assert.match(html, /A-D:/);
  assert.match(html, /Addison/);
  assert.match(html, /Yorkville/);
  assert.match(html, /Commercial Cleaning Services/i);
  assert.match(html, /<meta name="robots" content="index,follow"\s*\/?>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/commercial-cleaning"\s*\/?>/);
  assert.match(html, /\/css\/commercial-cleaning-copy\.css/);
  assert.match(html, /\/css\/commercial-cleaning-city-modal\.css/);
  assert.match(html, /\/js\/commercial-cleaning-copy\.js/);
  assert.match(html, /\/js\/commercial-cleaning-city-modal\.js/);
  assert.doesNotMatch(html, /js\/tilda-[^"]+/);
  assert.doesNotMatch(html, /css\/tilda-[^"]+/);
  assert.doesNotMatch(html, /data-original=/);
  assert.doesNotMatch(html, /data-tilda/i);
  assert.doesNotMatch(html, /(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b)/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(html, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(html, /t_menuWidgets/);
});

test("replaces heavy zero runtimes across all service page pilots", () => {
  const serviceFixtures = [
    { route: "/services/regular-cleaning", file: "page109653016-copy.html", cleanHandCoded: true },
    { route: "/services/deep-cleaning", file: "page109721366.html" },
    { route: "/services/move-in-move-out-cleaning", file: "page109993436-copy.html", cleanHandCoded: true },
    {
      route: "/services/airbnb-cleaning",
      file: "page110326416-copy.html",
      cleanHandCoded: true,
      handCodedPattern: /<main>/,
      cityHrefPattern: /class="city-trigger"/,
      cleanerHrefPattern: /href="\/become-a-cleaner"/,
    },
    {
      route: "/services/commercial-cleaning",
      file: "page110512356.html",
      cleanHandCoded: true,
      handCodedPattern: /class="commercial-clean-page"/,
      cityHrefPattern: /data-city-open/,
      cleanerHrefPattern: /href="\/become-a-cleaner"/,
    },
    { route: "/services/post-construction-cleaning", file: "page113041806.html" },
  ];

  for (const fixture of serviceFixtures) {
    const html = sanitizeHtml(readFixture(fixture.file), fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/, fixture.route);
    assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/, fixture.route);
    assert.doesNotMatch(html, /data-original=/, fixture.route);
    assert.doesNotMatch(html, /__resize__20x__/, fixture.route);
    if (fixture.cleanHandCoded) {
      assert.match(html, fixture.handCodedPattern || /<main class="clean-service-page">/, fixture.route);
      assert.doesNotMatch(html, /id="shynli-home-page-runtime"/, fixture.route);
      assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/, fixture.route);
      assert.doesNotMatch(
        html,
        /(?:css|js)\/tilda|class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-/i,
        fixture.route
      );
    } else {
      assert.match(html, /id="shynli-home-page-runtime"/, fixture.route);
      assert.match(html, /id="shynli-zero-runtime-stub"/, fixture.route);
    }
    assert.match(html, /src="\/?images\/[^"]+"/, fixture.route);
    assert.match(html, fixture.cityHrefPattern || /href="(?:#city|\/services\/regular-cleaning#city)"/, fixture.route);
    assert.match(html, fixture.cleanerHrefPattern || /href="#clean"/, fixture.route);
    assert.doesNotMatch(html, LEGACY_SAFETY_INTRO_PATTERN, fixture.route);
  }
});

test("keeps the regular-cleaning copy hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page109653016-copy.html"), "/services/regular-cleaning-copy");

  assert.match(html, /<main class="clean-service-page">/);
  assert.match(html, /Regular House Cleaning/);
  assert.match(html, /href="\/services\/regular-cleaning#city"/);
  assert.match(html, /href="#clean"/);
  assert.doesNotMatch(html, /(?:css|js)\/tilda/i);
  assert.doesNotMatch(html, /(?:class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-)/i);
  assert.doesNotMatch(html, /data-original=/);
  assert.doesNotMatch(html, /__resize__20x__/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
});

test("keeps the commercial-cleaning copy hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page110512356-copy.html"), "/services/commercial-cleaning-copy");

  assert.match(html, /class="commercial-clean-page"/);
  assert.match(html, /\/css\/commercial-cleaning-copy\.css/);
  assert.match(html, /\/css\/commercial-cleaning-city-modal\.css/);
  assert.match(html, /\/js\/commercial-cleaning-copy\.js/);
  assert.match(html, /\/js\/commercial-cleaning-city-modal\.js/);
  assert.doesNotMatch(html, /js\/tilda-[^"]+/);
  assert.doesNotMatch(html, /css\/tilda-[^"]+/);
  assert.doesNotMatch(html, /data-original=/);
  assert.doesNotMatch(html, /data-tilda/i);
  assert.doesNotMatch(html, /(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b)/);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(html, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(html, /t_menuWidgets/);
});

test("keeps the move-in move-out copy hand-coded without Tilda runtime", () => {
  const html = sanitizeHtml(readFixture("page109993436-copy.html"), "/services/move-in-move-out-cleaning-copy");
  const tildaMarkers = /(?:tild|tilda|data-tilda|allrecords|\bt-rec\b|\bt396\b|\btn-atom\b|\bt-body\b|\bt-menu\b|\bt-btn\b)/i;

  assert.match(html, /class="[^"]*\bmove-page\b[^"]*"/);
  assert.match(html, /Cleaning for Moving In or Moving Out/i);
  assert.match(html, /\/images\/shynli-move-cleaning-hero\.png/);
  assert.match(html, /\/images\/shynli-icon-32\.png/);
  assert.doesNotMatch(html, tildaMarkers);
  assert.doesNotMatch(html, /callrail|calltrk|swap\.js|shynli-tracking|googletagmanager|Google Tag Manager/i);
  assert.doesNotMatch(html, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(html, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(html, /id="shynli-menu-widgeticons-runtime-stub"/);
});

test("server-renders cleaner popup forms and strips the heavy Tilda form runtimes", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");

  assert.doesNotMatch(homeHtml, /js\/tilda-forms-1\.0\.min\.js/);
  assert.doesNotMatch(homeHtml, /js\/tilda-zero-forms-1\.0\.min\.js/);
  assert.doesNotMatch(homeHtml, /tn-atom__form/);
  assert.doesNotMatch(homeHtml, /tn-atom__inputs-textarea/);
  assert.match(homeHtml, /class="t-form t-form_inputs-total_6 js-form-proccess"/);
  assert.match(homeHtml, /data-shynli-form-kind="cleaner-application"/);
  assert.match(homeHtml, /data-shynli-field="fullName"/);
  assert.match(homeHtml, /data-shynli-field="phone"/);
  assert.match(homeHtml, /class="t-input shynli-zero-phone-display"/);
  assert.match(homeHtml, /id="shynli-cleaner-application-form-runtime"/);
  assert.match(homeHtml, /id="shynli-zero-form-runtime-stub"/);
  assert.match(homeHtml, /id="shynli-zero-form-phone-sync"/);
});
