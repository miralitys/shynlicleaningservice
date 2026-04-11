"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteToken } = require("../lib/quote-token");
const { startServer, stopServer, createStripeStub, readJsonFile } = require("./server-test-helpers");

const PRIVATE_PATHS = [
  "/server.js",
  "/test/",
  "/test/server-smoke.test.js",
  "/docs/",
  "/docs/system/",
  "/docs/system/data_flows.md",
  "/docs/system/project_structure.md",
  "/../server.js",
];

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

test("denies public access to non-public files and directories", async (t) => {
  for (const route of PRIVATE_PATHS) {
    await t.test(route, async () => {
      const response = await fetch(`${BASE_URL}${route}`);
      const body = await response.text();

      assert.ok(
        [403, 404].includes(response.status),
        `expected ${route} to be hidden, got ${response.status}`
      );
      assert.doesNotMatch(body, /"use strict"|"startup_ready"|node:test|module\.exports/i);
    });
  }
});

test("does not publicly expose /__perf by default", async () => {
  const response = await fetch(`${BASE_URL}/__perf`);
  const body = await response.text();

  assert.ok([403, 404].includes(response.status));
  assert.notEqual(response.headers.get("content-type") || "", "application/json; charset=utf-8");
  assert.doesNotMatch(body, /"request"\s*:/);
});

test("does not ship a hardcoded live Google Places key in the quote page", async () => {
  const response = await fetch(`${BASE_URL}/quote`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /AIza[0-9A-Za-z_-]{20,}/);
});

test("only reflects the Google Places browser key on /quote when explicitly configured", async () => {
  const browserKey = "AIzaFakeBrowserKey1234567890";
  const started = await startServer({
    env: {
      GOOGLE_PLACES_API_KEY: browserKey,
    },
  });

  try {
    const homeResponse = await fetch(`${started.baseUrl}/`);
    const homeBody = await homeResponse.text();
    assert.equal(homeResponse.status, 200);
    assert.doesNotMatch(homeBody, new RegExp(browserKey));

    const quoteResponse = await fetch(`${started.baseUrl}/quote`);
    const quoteBody = await quoteResponse.text();
    assert.equal(quoteResponse.status, 200);
    assert.match(quoteBody, new RegExp(browserKey));
    assert.match(quoteBody, /window\.__shynliRuntimeConfig/);
  } finally {
    await stopServer(started.child);
  }
});

test("rejects malformed Stripe checkout requests", async (t) => {
  const stripeStub = createStripeStub();
  const started = await startServer({
    env: {
      STRIPE_SECRET_KEY: "sk_test_stub",
      STRIPE_CAPTURE_FILE: stripeStub.captureFile,
      STRIPE_STUB_ENTRY: stripeStub.stubEntry,
    },
  });

  try {
    await t.test("rejects methods other than POST", async () => {
      const methodResponse = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, {
        method: "GET",
      });
      assert.equal(methodResponse.status, 405);
      assert.equal(methodResponse.headers.get("allow"), "POST");
    });

    await t.test("rejects invalid JSON bodies", async () => {
      const invalidJsonResponse = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      assert.equal(invalidJsonResponse.status, 400);
    });

    await t.test("rejects oversized JSON bodies", async () => {
      const tooLargeResponse = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 10, padding: "x".repeat(70_000) }),
      });
      assert.equal(tooLargeResponse.status, 413);
    });

    for (const payload of [{}, { quoteToken: "tampered.token" }, { amount: 125 }, { totalPrice: 125 }]) {
      await t.test(`rejects invalid amount payload ${JSON.stringify(payload)}`, async () => {
        const response = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        assert.equal(response.status, 400);
      });
    }

    assert.equal(fsExists(stripeStub.captureFile), false);
  } finally {
    await stopServer(started.child);
    stripeStub.cleanup();
  }
});

test("uses the canonical configured origin for Stripe URLs", async () => {
  const stripeStub = createStripeStub();
  const quoteSecret = "quote_secret_test";
  const started = await startServer({
    env: {
      QUOTE_SIGNING_SECRET: quoteSecret,
      STRIPE_SECRET_KEY: "sk_test_stub",
      STRIPE_CAPTURE_FILE: stripeStub.captureFile,
      STRIPE_STUB_ENTRY: stripeStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
      body: JSON.stringify({
        quoteToken: createQuoteToken(
          {
            totalPrice: 125,
            totalPriceCents: 12500,
            serviceType: "deep",
            serviceName: "Deep Cleaning",
            selectedDate: "2026-03-22",
            selectedTime: "09:00",
            fullAddress: "123 Main St, Romeoville, IL 60446",
            customerName: "Jane Doe",
            customerPhone: "3125550100",
          },
          { env: { QUOTE_SIGNING_SECRET: quoteSecret } }
        ),
        customerEmail: "customer@example.com",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");

    const body = await response.json();
    assert.equal(body.id, "cs_test_stub");
    assert.equal(body.url, "https://stripe.example/session");

    const captured = await readJsonFile(stripeStub.captureFile);
    assert.equal(captured.secretKey, "sk_test_stub");
    assert.equal(captured.options.line_items[0].price_data.unit_amount, 12500);
    assert.equal(captured.options.success_url, "https://shynlicleaningservice.com/quote?payment=success");
    assert.equal(captured.options.cancel_url, "https://shynlicleaningservice.com/quote?payment=cancelled");
    assert.doesNotMatch(captured.options.success_url, /attacker\.example/);
    assert.doesNotMatch(captured.options.cancel_url, /attacker\.example/);
  } finally {
    await stopServer(started.child);
    stripeStub.cleanup();
  }
});

test("rate limits repeated Stripe checkout attempts", async () => {
  const started = await startServer({
    env: {
      POST_RATE_LIMIT_MAX_REQUESTS: "1",
      POST_RATE_LIMIT_WINDOW_MS: "60000",
    },
  });

  try {
    const requestOptions = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteToken: "missing" }),
    };

    const firstResponse = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, requestOptions);
    assert.equal(firstResponse.status, 503);

    const secondResponse = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, requestOptions);
    assert.equal(secondResponse.status, 429);
    assert.match(secondResponse.headers.get("retry-after") || "", /\d+/);
  } finally {
    await stopServer(started.child);
  }
});

function fsExists(filePath) {
  try {
    require("node:fs").accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
