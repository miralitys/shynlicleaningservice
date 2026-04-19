"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSiteSanitizer } = require("../lib/site/sanitize");

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
  "shynli-menu-widgeticons-runtime-stub",
  "shynli-menusub-runtime",
  "shynli-cleaner-application-form-runtime",
  "shynli-zero-form-runtime-stub",
  "shynli-zero-runtime-stub",
  "shynli-zero-form-phone-sync",
]);

const sanitizeHtml = createSiteSanitizer({
  GOOGLE_ANALYTICS_MEASUREMENT_ID: "G-0MXV4JBP67",
  GOOGLE_PLACES_API_KEY: "",
  normalizeRoute,
  siteSeoHelpers,
}).sanitizeHtml;

function readFixture(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
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

test("replaces legacy analytics with a shared GA4 snippet and shared head assets", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const quoteHtml = sanitizeHtml(readFixture("quote2.html"), "/quote");

  for (const html of [homeHtml, quoteHtml]) {
    assert.doesNotMatch(html, /google-analytics\.com\/analytics\.js/);
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-0MXV4JBP67/);
    assert.match(html, /id="shynli-analytics"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  }
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
  assert.match(html, /V-W:/);
  assert.match(html, /Addison/);
  assert.match(html, /Naperville/);
  assert.match(html, /Downers Grove/);
  assert.match(html, /Woodridge/);
});

test("preserves menu CTA wiring and submenu content after the menu shell replacement", () => {
  const html = sanitizeHtml(readFixture("page108488156.html"), "/");

  assert.doesNotMatch(html, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-blocks-page108488156\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-popup-1\.0\.min\.js/);
  assert.match(html, /id="shynli-home-page-runtime"/);
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

test("replaces the romeoville page runtime with the shared popup and menu runtime", () => {
  const html = sanitizeHtml(readFixture("page111640886.html"), "/romeoville");

  assert.doesNotMatch(html, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-blocks-page111640886\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-events-1\.0\.min\.js/);
  assert.match(html, /id="shynli-home-page-runtime"/);
  assert.match(html, /href="#city"/);
  assert.match(html, /href="#clean"/);
  assert.match(html, /data-tooltip-hook="#city"/);
  assert.match(html, /data-tooltip-hook="#clean"/);
  assert.match(html, /Romeoville ▾/);
});

test("replaces the regular-cleaning page runtime with the shared popup and menu runtime", () => {
  const html = sanitizeHtml(readFixture("page109653016.html"), "/services/regular-cleaning");

  assert.doesNotMatch(html, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-blocks-page109653016\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(html, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(html, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(html, /data-original=/);
  assert.match(html, /id="shynli-home-page-runtime"/);
  assert.match(html, /id="shynli-zero-runtime-stub"/);
  assert.match(html, /src="images\/tild3232-3034-4639-b536-663862613932__btn-2\.png"/);
  assert.match(html, /style="background-image:url\('images\/tild6230-3835-4239-a234-306264643530__shynli_cleaning_1_2_\.png'\);"/);
  assert.match(html, /href="\/services\/regular-cleaning"/);
  assert.match(html, /href="#clean"/);
  assert.match(html, /href="#city"/);
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
