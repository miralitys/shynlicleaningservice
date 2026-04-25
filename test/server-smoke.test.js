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
  assert.doesNotMatch(body, /js\/tilda-menu-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-menu-burger-1\.0\.min\.js/);
  assert.match(body, /id="shynli-menu-shell-runtime"/);
  assert.doesNotMatch(body, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-blocks-page108488156\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(body, /data-original=/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.match(body, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.doesNotMatch(body, /js\/tilda-forms-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-forms-1\.0\.min\.js/);
  assert.match(body, /class="t-form t-form_inputs-total_6 js-form-proccess"/);
  assert.match(body, /data-shynli-form-kind="cleaner-application"/);
  assert.match(body, /id="shynli-cleaner-application-form-runtime"/);
  assert.match(body, /Shynli Cleaning/i);
});

test("serves home-like routes without zero/lazyload runtimes", async () => {
  const homeLikeRoutes = [
    ["/home-calculator", /Instant House Cleaning Cost Calculator/i],
    ["/home-simple", /House Cleaning Services in Chicago Suburbs/i],
  ];

  for (const [route, expectedTitle] of homeLikeRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    assert.match(body, /id="shynli-home-page-runtime"/, route);
    assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    assert.match(body, /href="#city"/, route);
    assert.match(body, /href="#clean"/, route);
  }
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
  assert.doesNotMatch(linkHeader, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(linkHeader, /tilda-blocks-page108872586/);
  assert.doesNotMatch(linkHeader, /tilda-feed-1\.1\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /tilda-slds-1\.4\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /hammer\.min\.js/);
  assert.doesNotMatch(linkHeader, /quote2\.css/);
  assert.doesNotMatch(body, /data-tilda-project-id=/);
  assert.doesNotMatch(body, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(body, /tilda-blocks-page108872586/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-burger-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.match(body, /class="shynli-blog-shell"/);
  assert.match(body, /Shynli Cleaning <span>Blog<\/span>/i);
  assert.match(body, /href="\/blog\/checklists"/);
  assert.match(body, /href="\/quote"/);
});

test("serves blog category pages without legacy feed assets", async () => {
  const response = await fetch(`${BASE_URL}/blog/checklists`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(linkHeader, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(linkHeader, /tilda-blocks-page108872586/);
  assert.doesNotMatch(linkHeader, /tilda-feed-1\.1\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /tilda-slds-1\.4\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /hammer\.min\.js/);
  assert.doesNotMatch(body, /data-tilda-project-id=/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-popup-1\.0\.min\.js/);
  assert.match(body, /class="shynli-blog-shell"/);
  assert.match(body, /Cleaning <span>Checklists<\/span>/);
  assert.match(body, /Featured articles|Featured article/);
  assert.match(body, /href="\/blog\/checklists\//);
});

test("serves blog article pages without unused widgeticon assets", async () => {
  const response = await fetch(`${BASE_URL}/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(body, /data-tilda-project-id=/);
  assert.doesNotMatch(body, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(body, /tilda-blocks-page108872586/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-popup-1\.0\.min\.js/);
  assert.match(body, /class="shynli-blog-shell"/);
  assert.match(body, /Airbnb Turnover Cleaning Checklist/i);
  assert.match(body, /data-blog-print/);
});

test("serves city landing pages with the shared menu shell runtime", async () => {
  const response = await fetch(`${BASE_URL}/romeoville`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /Romeoville/i);
  assert.doesNotMatch(body, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-blocks-page111640886\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(body, /data-original=/);
  assert.doesNotMatch(body, /js\/tilda-menu-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-menu-burger-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.match(body, /id="shynli-menu-shell-runtime"/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.match(body, /id="shynli-menusub-runtime"/);
  assert.match(body, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(body, /js\/tilda-events-1\.0\.min\.js/);
  assert.match(body, /href="\/quote"/);
  assert.match(body, /href="#city"/);
  assert.match(body, /href="#clean"/);
});

test("serves all city pilot pages without zero/lazyload runtimes", async () => {
  const cityRoutes = [
    ["/addison", /Addison/i],
    ["/aurora", /Aurora/i],
    ["/bartlett", /Bartlett/i],
    ["/batavia", /Batavia/i],
    ["/bolingbrook", /Bolingbrook/i],
    ["/burrridge", /Burr Ridge/i],
    ["/carolstream", /Carol Stream/i],
    ["/clarendonhills", /Clarendon Hills/i],
    ["/darien", /Darien/i],
    ["/downersgrove", /Downers Grove/i],
    ["/elmhurst", /Elmhurst/i],
    ["/geneva", /Geneva/i],
    ["/glenellyn", /Glen Ellyn/i],
    ["/hinsdale", /Hinsdale/i],
    ["/homerglen", /Homer Glen/i],
    ["/itasca", /Itasca/i],
    ["/lemont", /Lemont/i],
    ["/lisle", /Lisle/i],
    ["/lockport", /Lockport/i],
    ["/lombard", /Lombard/i],
    ["/montgomery", /Montgomery/i],
    ["/naperville", /Naperville/i],
    ["/oakbrook", /Oak Brook/i],
    ["/oswego", /Oswego/i],
    ["/plainfield", /Plainfield/i],
    ["/romeoville", /Romeoville/i],
    ["/stcharles", /St\.? Charles/i],
    ["/streamwood", /Streamwood/i],
    ["/villapark", /Villa Park/i],
    ["/warrenville", /Warrenville/i],
    ["/wayne", /Wayne/i],
    ["/westchicago", /West Chicago/i],
    ["/westmont", /Westmont/i],
    ["/wheaton", /Wheaton/i],
    ["/willowbrook", /Willowbrook/i],
    ["/winfield", /Winfield/i],
    ["/wooddale", /Wood Dale/i],
    ["/woodridge", /Woodridge/i],
  ];

  for (const [route, expectedTitle] of cityRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    assert.match(body, /id="shynli-home-page-runtime"/, route);
    assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    assert.match(body, /href="#city"/, route);
    assert.match(body, /href="#clean"/, route);
  }
});

test("serves static marketing pilots without zero/lazyload runtimes", async () => {
  const staticRoutes = [
    ["/about-us", /About/i],
    ["/contacts", /Contact/i],
    ["/faq", /FAQ|pricing calculated/i],
    ["/pricing", /Pricing|Instant Quote/i],
    ["/service-areas", /Service Areas/i],
  ];

  for (const [route, expectedTitle] of staticRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    assert.match(body, /id="shynli-home-page-runtime"/, route);
    assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    assert.match(body, /href="#city"/, route);
    assert.match(body, /href="#clean"/, route);
  }
});

test("serves service pages with the shared popup and menu runtime", async () => {
  const response = await fetch(`${BASE_URL}/services/regular-cleaning`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /Recurring House Cleaning Services/i);
  assert.doesNotMatch(body, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-blocks-page109653016\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(body, /data-original=/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.match(body, /id="shynli-zero-runtime-stub"/);
  assert.match(body, /src="images\/tild3232-3034-4639-b536-663862613932__btn-2\.png"/);
  assert.match(body, /href="#city"/);
  assert.match(body, /href="#clean"/);
});

test("serves all service page pilots without zero/lazyload runtimes", async () => {
  const serviceRoutes = [
    ["/services/regular-cleaning", /Recurring House Cleaning Services/i],
    ["/services/deep-cleaning", /Deep Cleaning/i],
    ["/services/move-in-move-out-cleaning", /Move In|Move Out/i],
    ["/services/airbnb-cleaning", /Airbnb Cleaning/i],
    ["/services/commercial-cleaning", /Commercial Cleaning/i],
    ["/services/post-construction-cleaning", /Post-Construction Cleaning|Post Construction Cleaning/i],
  ];

  for (const [route, expectedTitle] of serviceRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    assert.match(body, /id="shynli-home-page-runtime"/, route);
    assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    assert.match(body, /href="#city"/, route);
    assert.match(body, /href="#clean"/, route);
  }
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

test("redirects mixed-case city URLs to lowercase canonicals", async () => {
  const response = await fetch(`${BASE_URL}/Naperville?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/naperville?utm_source=test");
});

test("redirects legacy flat post-construction URLs to the service canonical", async () => {
  const response = await fetch(`${BASE_URL}/post-construction-cleaning?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/services/post-construction-cleaning?utm_source=test");
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

test("serves the 404 page without uppercase city links", async () => {
  const response = await fetch(`${BASE_URL}/definitely-missing-page`);
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.doesNotMatch(body, /href="\/Naperville"/);
  assert.doesNotMatch(body, /href="\/Addison"/);
  assert.match(body, /href="\/naperville"/);
  assert.match(body, /href="\/addison"/);
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
    /<meta name="description" content="Request a flat-rate cleaning quote from Shynli Cleaning in Chicagoland\." \/>/
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
