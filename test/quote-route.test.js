"use strict";

const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateQuotePricing } = require("../lib/quote-pricing");
const { createFetchStub, createStripeStub, readJsonFile, startServer, stopServer } = require("./server-test-helpers");

test("rejects non-POST quote submission requests", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "GET",
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  } finally {
    await stopServer(started.child);
  }
});

test("rejects malformed quote submission JSON", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /invalid request body/i);
  } finally {
    await stopServer(started.child);
  }
});

test("returns a graceful 503 when LeadConnector is not configured", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.match(payload.error, /temporarily unavailable/i);
  } finally {
    await stopServer(started.child);
  }
});

test("keeps the legacy /api/quote/request alias wired to the same backend flow", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.match(payload.error, /temporarily unavailable/i);
  } finally {
    await stopServer(started.child);
  }
});

test("keeps the legacy /api/quote/request alias wired to the same handler", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.match(payload.error, /temporarily unavailable/i);
  } finally {
    await stopServer(started.child);
  }
});

test("accepts valid quote submissions through the backend CRM helper", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-123",
        },
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-quote-1",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "jane@example.com",
        },
        quote: {
          serviceType: "deep",
          totalPrice: 199.99,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          fullAddress: "123 Main St, Romeoville, IL 60446",
          rooms: 4,
          bathrooms: 2,
          consent: true,
        },
        source: "Website Quote",
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.contactId, "contact-123");
    assert.equal(payload.noteCreated, false);
    assert.equal(payload.opportunityCreated, false);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /\/contacts\/$/);
    assert.match(calls[0].body, /"firstName":"Jane"/);
    assert.match(calls[0].body, /"lastName":"Doe"/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("issues a quoteToken that the checkout endpoint accepts for the canonical server price", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-quote-token",
        },
      },
    },
  ]);
  const stripeStub = createStripeStub();
  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
      QUOTE_SIGNING_SECRET: "quote_secret_test",
      STRIPE_SECRET_KEY: "sk_test_stub",
      STRIPE_CAPTURE_FILE: stripeStub.captureFile,
      STRIPE_STUB_ENTRY: stripeStub.stubEntry,
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const quoteResponse = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "jane@example.com",
        },
        quote: {
          serviceType: "deep",
          frequency: "one-time",
          rooms: 4,
          bathrooms: 2,
          squareFeet: 2250,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          fullAddress: "123 Main St, Romeoville, IL 60446",
          addOns: ["insideFridge"],
          extras: ["insideOven"],
          consent: true,
        },
      }),
    });

    assert.equal(quoteResponse.status, 201);
    const quotePayload = await quoteResponse.json();
    assert.equal(quotePayload.success, true);
    assert.ok(quotePayload.quoteToken);
    assert.ok(quotePayload.pricing);
    assert.ok(Number.isInteger(quotePayload.pricing.totalPriceCents));
    assert.ok(quotePayload.pricing.totalPriceCents > 0);

    const checkoutResponse = await fetch(`${started.baseUrl}/api/stripe/checkout-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteToken: quotePayload.quoteToken,
        customerEmail: "jane@example.com",
      }),
    });

    assert.equal(checkoutResponse.status, 200);
    const checkoutPayload = await checkoutResponse.json();
    assert.equal(checkoutPayload.id, "cs_test_stub");
    assert.equal(checkoutPayload.url, "https://stripe.example/session");

    const captured = await readJsonFile(stripeStub.captureFile);
    assert.equal(captured.options.line_items[0].price_data.unit_amount, quotePayload.pricing.totalPriceCents);
  } finally {
    await stopServer(started.child);
    stripeStub.cleanup();
    fetchStub.cleanup();
  }
});

test("surfaces a sanitized 502 when the CRM upstream fails", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 502,
      body: {
        message: "upstream unavailable",
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.match(payload.error, /temporarily unavailable/i);
    assert.equal(payload.code, "CONTACT_CREATE_FAILED");
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("surfaces CRM partial-warning states without failing the quote submission", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/notes",
      status: 500,
      body: {
        error: "note failed",
      },
    },
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-456",
        },
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "1",
      GHL_CREATE_OPPORTUNITY: "0",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-quote-warn",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.customFieldsUpdated, false);
    assert.equal(payload.customFieldSyncReason, "no_custom_field_map");
    assert.equal(payload.noteCreated, false);
    assert.deepEqual(payload.warnings, ["custom_fields_skipped", "note_failed"]);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("persists canonical repriced values to CRM side effects instead of raw client totals", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/notes",
      status: 200,
      body: {
        note: {
          id: "note-123",
        },
      },
    },
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-789",
        },
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "1",
      GHL_CREATE_OPPORTUNITY: "0",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          frequency: "biweekly",
          rooms: 0,
          bathrooms: 0,
          squareMeters: 1,
          totalPrice: 1,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    const expectedPricing = calculateQuotePricing({
      serviceType: "regular",
      frequency: "biweekly",
      rooms: 0,
      bathrooms: 0,
      squareMeters: 1,
      totalPrice: 1,
    });

    assert.equal(payload.pricing.totalPrice, expectedPricing.totalPrice);
    assert.equal(payload.pricing.totalPriceCents, expectedPricing.totalPriceCents);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const noteCall = calls.find((call) => call.url.endsWith("/notes"));

    assert.ok(noteCall, "expected note call to be captured");
    assert.match(noteCall.body, /Page: https:\/\/shynlicleaningservice\.com\/quote/);
    assert.doesNotMatch(noteCall.body, /Page: https:\/\/shynlicleaningservice\.com\/api\/quote\/submit/);
    assert.match(noteCall.body, new RegExp(`Rooms: ${expectedPricing.rooms}`));
    assert.match(noteCall.body, new RegExp(`Bathrooms: ${expectedPricing.bathrooms}`));
    assert.match(noteCall.body, new RegExp(`Square meters: ${expectedPricing.squareMeters}`));
    assert.match(noteCall.body, new RegExp(`Total price: \\$${expectedPricing.totalPrice}`));
    assert.doesNotMatch(noteCall.body, /Total price: \$1(?:\.0+)?(?:\\n|")/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("rate limits repeated quote submissions", async () => {
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
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    };

    const firstResponse = await fetch(`${started.baseUrl}/api/quote/submit`, requestOptions);
    assert.equal(firstResponse.status, 503);

    const secondResponse = await fetch(`${started.baseUrl}/api/quote/submit`, requestOptions);
    assert.equal(secondResponse.status, 429);
    assert.match(secondResponse.headers.get("retry-after") || "", /\d+/);
  } finally {
    await stopServer(started.child);
  }
});

test("ignores X-Forwarded-For unless proxy trust is enabled and the proxy IP is allowlisted", async () => {
  const baseEnv = {
    POST_RATE_LIMIT_MAX_REQUESTS: "1",
    POST_RATE_LIMIT_WINDOW_MS: "60000",
  };

  const startedDefault = await startServer({ env: baseEnv });

  try {
    const firstResponse = await fetch(`${startedDefault.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(firstResponse.status, 503);

    const secondResponse = await fetch(`${startedDefault.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.99",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(secondResponse.status, 429);
  } finally {
    await stopServer(startedDefault.child);
  }

  const startedFlagOnly = await startServer({
    env: {
      ...baseEnv,
      TRUST_PROXY_HEADERS: "1",
    },
  });

  try {
    const firstFlagOnlyResponse = await fetch(`${startedFlagOnly.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(firstFlagOnlyResponse.status, 503);

    const secondFlagOnlyResponse = await fetch(`${startedFlagOnly.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.99",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(secondFlagOnlyResponse.status, 429);
  } finally {
    await stopServer(startedFlagOnly.child);
  }

  const startedTrusted = await startServer({
    env: {
      ...baseEnv,
      TRUST_PROXY_HEADERS: "1",
      TRUSTED_PROXY_IPS: "127.0.0.1,::1",
    },
  });

  try {
    const firstTrustedResponse = await fetch(`${startedTrusted.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(firstTrustedResponse.status, 503);

    const secondTrustedResponse = await fetch(`${startedTrusted.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.99",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(secondTrustedResponse.status, 503);

    const firstSpoofedChainResponse = await fetch(`${startedTrusted.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10, 198.51.100.50",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(firstSpoofedChainResponse.status, 503);

    const secondSpoofedChainResponse = await fetch(`${startedTrusted.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.44, 198.51.100.50",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: {
          serviceType: "regular",
          totalPrice: 120,
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          consent: true,
        },
      }),
    });
    assert.equal(secondSpoofedChainResponse.status, 429);
  } finally {
    await stopServer(startedTrusted.child);
  }
});
