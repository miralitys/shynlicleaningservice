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

test("serves GTM on public site routes", async () => {
  for (const route of ["/", "/quote", "/blog"]) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, /<head><script id="shynli-tracking-script" src="\/js\/shynli-tracking\.js"><\/script><!-- Google Tag Manager -->/, route);
    assert.match(body, /<!-- Google Tag Manager -->/, route);
    assert.match(body, /GTM-5P88N7LD/, route);
    assert.match(body, /<!-- Google Tag Manager \(noscript\) -->/, route);
    assert.match(body, /googletagmanager\.com\/ns\.html\?id=GTM-5P88N7LD/, route);
  }
});

test("serves GTM on account pages but not on admin pages", async () => {
  const accountResponse = await fetch(`${BASE_URL}/account/login`);
  const accountBody = await accountResponse.text();
  assert.ok([200, 503].includes(accountResponse.status));
  assert.match(accountResponse.headers.get("content-type") || "", /text\/html/);
  assert.match(accountBody, /id="shynli-tracking-script"/);
  assert.match(accountBody, /<!-- Google Tag Manager -->/);
  assert.match(accountBody, /<!-- Google Tag Manager \(noscript\) -->/);

  const adminResponse = await fetch(`${BASE_URL}/admin/login`);
  const adminBody = await adminResponse.text();
  assert.ok([200, 503].includes(adminResponse.status));
  assert.match(adminResponse.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(adminBody, /id="shynli-tracking-script"/);
  assert.doesNotMatch(adminBody, /<!-- Google Tag Manager -->/);
  assert.doesNotMatch(adminBody, /<!-- Google Tag Manager \(noscript\) -->/);
  assert.doesNotMatch(adminBody, /GTM-5P88N7LD/);
});

test("serves the shared tracking library asset", async () => {
  const response = await fetch(`${BASE_URL}/js/shynli-tracking.js`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /(javascript|text\/plain|application\/octet-stream)/);
  assert.match(body, /window\.shynliTracking/);
  assert.match(body, /lead_call_click_website/);
  assert.match(body, /captureAttribution/);
});
