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

test("redirects /quote2 into the main quote flow", async () => {
  const response = await fetch(`${BASE_URL}/quote2`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/quote");
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
