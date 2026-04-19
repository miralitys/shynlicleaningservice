"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer } = require("./server-test-helpers");

let serverProcess = null;
let BASE_URL = null;

test.before(async () => {
  const started = await startServer();
  serverProcess = started.child;
  BASE_URL = started.baseUrl;
});

test.after(async () => {
  await stopServer(serverProcess);
});

test("serves the home page through the custom route layer", async () => {
  const response = await fetch(`${BASE_URL}/`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(linkHeader, /<https:\/\/fonts\.googleapis\.com>; rel=preconnect/);
  assert.match(linkHeader, /<https:\/\/fonts\.gstatic\.com>; rel=preconnect; crossorigin/);
  assert.match(linkHeader, /<\/css\/tilda-grid-3\.0\.min\.css>; rel=preload; as=style/);
  assert.match(
    linkHeader,
    /<\/css\/tilda-blocks-page108488156\.min\.css\?t=\d+>; rel=preload; as=style/
  );
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.css/);
  assert.match(body, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.match(body, /id="shynli-menusub-runtime"/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.doesNotMatch(body, /js\/tilda-forms-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-forms-1\.0\.min\.js/);
  assert.match(body, /class="t-form t-form_inputs-total_6 js-form-proccess"/);
  assert.match(body, /data-shynli-form-kind="cleaner-application"/);
  assert.match(body, /id="shynli-cleaner-application-form-runtime"/);
  assert.match(body, /Shynli Cleaning/i);
});

test("serves the quote page through the static route layer", async () => {
  const response = await fetch(`${BASE_URL}/quote`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(linkHeader, /<\/css\/quote2\.css\?v=[^>]+>; rel=preload; as=style/);
  assert.match(linkHeader, /<\/js\/quote2-app\.js\?v=[^>]+>; rel=preload; as=script/);
  assert.doesNotMatch(linkHeader, /tilda-grid-3\.0\.min\.css/);
  assert.match(body, /Request a Quote/i);
  assert.match(body, /Enter your full name and phone number to calculate the service cost/i);
  assert.match(body, /Name/i);
});

test("serves the blog page without legacy feed asset hints", async () => {
  const response = await fetch(`${BASE_URL}/blog`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(linkHeader, /<\/css\/tilda-grid-3\.0\.min\.css>; rel=preload; as=style/);
  assert.match(
    linkHeader,
    /<\/css\/tilda-blocks-page108872586\.min\.css\?t=\d+>; rel=preload; as=style/
  );
  assert.doesNotMatch(linkHeader, /tilda-feed-1\.1\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /tilda-slds-1\.4\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /hammer\.min\.js/);
  assert.doesNotMatch(linkHeader, /quote2\.css/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.css/);
  assert.match(body, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.match(body, /id="shynli-menusub-runtime"/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.doesNotMatch(body, /js\/tilda-forms-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-forms-1\.0\.min\.js/);
  assert.doesNotMatch(body, /t_feed_init\(/);
  assert.doesNotMatch(body, /feeduid:/);
  assert.doesNotMatch(body, /data-feed-recid=/);
  assert.match(body, /Shynli Cleaning <span style="color: rgb\(158, 68, 90\);">Blog<\/span>/i);
  assert.match(body, /href="\/blog\/checklists"/);
});

test("serves blog category pages without legacy feed assets", async () => {
  const response = await fetch(`${BASE_URL}/blog/checklists`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(linkHeader, /tilda-feed-1\.1\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /tilda-slds-1\.4\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /hammer\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.css/);
  assert.match(body, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.match(body, /id="shynli-menusub-runtime"/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.doesNotMatch(body, /t_feed_init\(/);
  assert.doesNotMatch(body, /feeduid:/);
  assert.match(body, /Featured articles|Featured article/);
  assert.match(body, /href="\/blog\/checklists\//);
});

test("serves blog article pages without unused widgeticon assets", async () => {
  const response = await fetch(`${BASE_URL}/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.css/);
  assert.match(body, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.match(body, /id="shynli-menusub-runtime"/);
  assert.match(body, /Airbnb Turnover Cleaning Checklist/i);
});

test("serves a minimal oauth callback shell", async () => {
  const response = await fetch(`${BASE_URL}/oauth/callback?code=abc123`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(linkHeader, "");
  assert.match(body, /<title>Connecting to Shynli Cleaner<\/title>/);
  assert.match(body, /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.match(body, /shynlicleaning:\/\/oauth\/callback\?code=/);
  assert.doesNotMatch(body, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /Clean Home\. Clear Mind\./);
});

test("redirects /quote2 into the main quote flow", async () => {
  const response = await fetch(`${BASE_URL}/quote2`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/quote");
});

test("redirects trailing-slash public routes to the canonical URL", async () => {
  const response = await fetch(`${BASE_URL}/services/deep-cleaning/?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/services/deep-cleaning?utm_source=test");
});

test("redirects legacy flat blog article URLs to category-prefixed canonicals", async () => {
  const response = await fetch(`${BASE_URL}/blog/how-to-remove-hard-water-stains-from-shower-glass?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "/blog/bathroom/how-to-remove-hard-water-stains-from-shower-glass?utm_source=test"
  );
});

test("redirects the /%D0%B4%D0%B5%D0%B9%D1%81%D1%82%D0%B2%D1%83%D0%B9 smoke path into the quote flow", async () => {
  const response = await fetch(`${BASE_URL}/%D0%B4%D0%B5%D0%B9%D1%81%D1%82%D0%B2%D1%83%D0%B9`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/quote");
});

test("keeps runtime diagnostics private at /__perf", async () => {
  const response = await fetch(`${BASE_URL}/__perf`);
  const body = await response.text();

  assert.ok([403, 404].includes(response.status));
  assert.notEqual(response.headers.get("content-type") || "", "application/json; charset=utf-8");
  assert.doesNotMatch(body, /"request"\s*:/);
  assert.doesNotMatch(body, /"event_loop"\s*:/);
});

test("requires an explicit token when /__perf is enabled", async () => {
  const started = await startServer({
    env: {
      ENABLE_PERF_ENDPOINT: "1",
      PERF_ENDPOINT_TOKEN: "perf-secret",
    },
  });

  try {
    const blockedResponse = await fetch(`${started.baseUrl}/__perf`);
    assert.ok([403, 404].includes(blockedResponse.status));

    const allowedResponse = await fetch(`${started.baseUrl}/__perf`, {
      headers: { "x-perf-token": "perf-secret" },
    });
    assert.equal(allowedResponse.status, 200);

    const payload = await allowedResponse.json();
    assert.ok(payload.request);
    assert.ok(payload.event_loop);
  } finally {
    await stopServer(started.child);
  }
});

test("exposes startup readiness status", async () => {
  const response = await fetch(`${BASE_URL}/__ready`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "warn");
  assert.equal("issueCodes" in payload, false);
  assert.equal("blockingIssueCodes" in payload, false);
  assert.equal("warningIssueCodes" in payload, false);
});

test("gates readiness when blocking startup integrity issues are present", async () => {
  const started = await startServer({
    env: {
      STARTUP_ENV_MODE: "gate",
      QUOTE_SIGNING_SECRET: "quote-secret",
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/__ready`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.mode, "gate");
    assert.equal("issueCodes" in payload, false);
    assert.equal("blockingIssueCodes" in payload, false);
    assert.equal("warningIssueCodes" in payload, false);
  } finally {
    await stopServer(started.child);
  }
});

test("fails startup when fail mode sees blocking integrity issues", async () => {
  await assert.rejects(
    () =>
      startServer({
        env: {
          STARTUP_ENV_MODE: "fail",
          QUOTE_SIGNING_SECRET: "quote-secret",
        },
      }),
    /Server (wrote to stderr before ready|exited before ready)/
  );
});

test("returns a graceful 503 when Stripe is not configured", async () => {
  const response = await fetch(`${BASE_URL}/api/stripe/checkout-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 10 }),
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.error, /Stripe is not configured/i);
});

test("serves the configured 404 page for an unknown route", async () => {
  const response = await fetch(`${BASE_URL}/definitely-missing-route`);
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /text\/html|text\/plain/);
  assert.ok(body.length > 0);
});

test("injects quote metadata, shared icons, and GA4 snippet into the quote page", async () => {
  const response = await fetch(`${BASE_URL}/quote`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(
    body,
    /<meta name="description" content="Get an instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning\." \/>/
  );
  assert.match(body, /<link rel="icon" href="\/images\/tild3636-3965-4134-a432-323337623835__insta_32\.png" type="image\/png" \/>/);
  assert.match(body, /<link rel="apple-touch-icon" href="\/images\/tild3636-3965-4134-a432-323337623835__insta_32\.png" \/>/);
  assert.match(body, /<link rel="manifest" href="\/site\.webmanifest" \/>/);
  assert.match(body, /googletagmanager\.com\/gtag\/js\?id=G-0MXV4JBP67/);
  assert.doesNotMatch(body, /google-analytics\.com\/analytics\.js/);
});

test("serves root fallback icon assets", async () => {
  const [faviconResponse, appleTouchResponse] = await Promise.all([
    fetch(`${BASE_URL}/favicon.ico`),
    fetch(`${BASE_URL}/apple-touch-icon.png`),
  ]);

  assert.equal(faviconResponse.status, 200);
  assert.match(faviconResponse.headers.get("content-type") || "", /image\/x-icon|image\/png/);
  assert.equal(appleTouchResponse.status, 200);
  assert.match(appleTouchResponse.headers.get("content-type") || "", /image\/png/);
});

test("serves the shared web manifest", async () => {
  const response = await fetch(`${BASE_URL}/site.webmanifest`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/manifest\+json/);
  assert.equal(body.name, "Shynli Cleaning");
  assert.equal(body.icons[0].src, "/images/tild3636-3965-4134-a432-323337623835__insta_32.png");
});

test("serves the Tilda phone mask asset for public form pages", async () => {
  const response = await fetch(`${BASE_URL}/js/tilda-phone-mask-1.1.min.js`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript|text\/plain/);
  assert.match(body, /t_form_phonemask_load/);
});

test("emits FAQ and Service structured data on matching page types", async () => {
  const faqResponse = await fetch(`${BASE_URL}/faq`);
  const faqBody = await faqResponse.text();
  assert.equal(faqResponse.status, 200);
  assert.match(faqBody, /"@type":"FAQPage"/);
  assert.match(faqBody, /"How is pricing calculated\?"/);

  const serviceResponse = await fetch(`${BASE_URL}/services/deep-cleaning`);
  const serviceBody = await serviceResponse.text();
  assert.equal(serviceResponse.status, 200);
  assert.match(serviceBody, /"@type":"Service"/);
  assert.match(serviceBody, /"name":"Deep Cleaning"/);
});
