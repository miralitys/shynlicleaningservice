"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startServer, stopServer } = require("./server-test-helpers");

let serverProcess = null;
let BASE_URL = null;

const CALLRAIL_SWAP_SCRIPT_PATTERN =
  /<script id="shynli-callrail-loader">(?=[\s\S]*?\/js\/vendor\/callrail-swap\.20260523\.js[\s\S]*?<\/script>)(?=[\s\S]*?setTimeout\(idleLoad,9000\)[\s\S]*?<\/script>)[\s\S]*?<\/script>/;

test.before(async () => {
  const started = await startServer();
  serverProcess = started.child;
  BASE_URL = started.baseUrl;
});

test.after(async () => {
  await stopServer(serverProcess);
});

test("serves GTM on public site routes", async () => {
  for (const route of ["/", "/quote", "/blog"]) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, /<head><script id="shynli-tracking-bootstrap">/, route);
    assert.match(body, /\/js\/shynli-tracking\.js/, route);
    assert.doesNotMatch(body, /<script[^>]+src="\/js\/shynli-tracking\.js"/, route);
    assert.match(body, /<!-- Google Tag Manager -->/, route);
    assert.match(body, /GTM-5P88N7LD/, route);
    assert.match(body, /requestIdleCallback/, route);
    assert.match(body, /setTimeout\(idleLoad,12000\)/, route);
    assert.match(body, /setTimeout\(idleLoad,4500\)/, route);
    assert.match(body, /\['pointerdown','keydown','touchstart'\]/, route);
    assert.doesNotMatch(body, /googletagmanager\.com\/gtag\/js\?id=/, route);
    if (route === "/") {
      assert.match(body, /<link rel="preload" href="\/fonts\/playfair-display-latin-400-900\.woff2" as="font"/, route);
      assert.match(body, /<link rel="preload" href="\/fonts\/montserrat-latin-300-800\.woff2" as="font"/, route);
      assert.match(body, /<link rel="stylesheet" href="\/css\/shynli-fonts\.css\?v=20260522-local2">/, route);
      assert.doesNotMatch(body, /fonts\.googleapis\.com|fonts\.gstatic\.com/, route);
      assert.match(body, /<link rel="preload" as="image" href="\/images\/home-copy-team-480\.webp"[^>]+fetchpriority="high">/, route);
      assert.match(body, /<img class="hero__team"[^>]+fetchpriority="high"/, route);
      assert.doesNotMatch(body, /<img class="hero__team"[^>]+loading="lazy"/, route);
    }
    assert.match(body, /<!-- Google Tag Manager \(noscript\) -->/, route);
    assert.match(body, /googletagmanager\.com\/ns\.html\?id=GTM-5P88N7LD/, route);
    assert.match(body, CALLRAIL_SWAP_SCRIPT_PATTERN, route);
    assert.doesNotMatch(
      body,
      /<script type="text\/javascript" src="\/js\/vendor\/callrail-swap\.20260523\.js" defer><\/script>/,
      route
    );
  }
});

test("serves GTM on account pages but not on admin pages", async () => {
  const accountResponse = await fetch(`${BASE_URL}/account/login`);
  const accountBody = await accountResponse.text();
  assert.ok([200, 503].includes(accountResponse.status));
  assert.match(accountResponse.headers.get("content-type") || "", /text\/html/);
  assert.match(accountBody, /id="shynli-tracking-bootstrap"/);
  assert.doesNotMatch(accountBody, /<script[^>]+src="\/js\/shynli-tracking\.js"/);
  assert.match(accountBody, /<!-- Google Tag Manager -->/);
  assert.match(accountBody, /<!-- Google Tag Manager \(noscript\) -->/);
  assert.doesNotMatch(accountBody, /callrail-swap|cdn\.callrail\.com/);

  const adminResponse = await fetch(`${BASE_URL}/admin/login`);
  const adminBody = await adminResponse.text();
  assert.ok([200, 503].includes(adminResponse.status));
  assert.match(adminResponse.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(adminBody, /id="shynli-tracking-bootstrap"|id="shynli-tracking-script"/);
  assert.doesNotMatch(adminBody, /<!-- Google Tag Manager -->/);
  assert.doesNotMatch(adminBody, /<!-- Google Tag Manager \(noscript\) -->/);
  assert.doesNotMatch(adminBody, /GTM-5P88N7LD/);
  assert.doesNotMatch(adminBody, /callrail-swap|cdn\.callrail\.com/);
});

test("serves the shared tracking library asset", async () => {
  const response = await fetch(`${BASE_URL}/js/shynli-tracking.js`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /(javascript|text\/plain|application\/octet-stream)/);
  assert.match(body, /window\.shynliTracking/);
  assert.match(body, /lead_call_click_website/);
  assert.match(body, /captureAttribution/);
  assert.match(body, /ATTRIBUTION_TTL_DAYS = 365/);
});

test("serves trimmed CallRail swap asset without external forms runtime", async () => {
  const response = await fetch(`${BASE_URL}/js/vendor/callrail-swap.20260523.js`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /(javascript|text\/plain|application\/octet-stream)/);
  assert.match(body, /CallTrkSwap/);
  assert.match(body, /swap_session/);
  assert.doesNotMatch(body, /external_forms|external_forms\.js/);
});
