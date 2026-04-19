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
  "mobile-contact-details-fix",
  "mobile-sticky-cta",
  "pricing-calculator-scroll",
  "safari-home-layout-fix",
  "shynli-cleaner-application-form-runtime",
  "shynli-zero-form-runtime-stub",
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

test("keeps injected runtime scripts syntactically valid on home and quote routes", () => {
  const fixtures = [
    { route: "/", html: readFixture("page108488156.html") },
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

test("keeps menu widgeticon runtime JS while pruning unused widgeticon CSS", () => {
  const homeHtml = sanitizeHtml(readFixture("page108488156.html"), "/");
  const blogHtml = sanitizeHtml(readFixture("page108872586.html"), "/blog");

  for (const html of [homeHtml, blogHtml]) {
    assert.match(html, /tilda-menu-widgeticons-1\.0\.min\.js/);
    assert.doesNotMatch(html, /tilda-menu-widgeticons-1\.0\.min\.css/);
    assert.doesNotMatch(html, /class="[^"]*\bt-menuwidgeticons(?:__|\b)[^"]*"/i);
  }
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
