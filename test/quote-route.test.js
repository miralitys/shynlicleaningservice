"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateQuotePricing } = require("../lib/quote-pricing");
const { createFetchStub, createStripeStub, readJsonFile, startServer, stopServer } = require("./server-test-helpers");

async function waitFor(predicate, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 3000;
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 50;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return predicate();
}

function buildSupportedQuote(overrides = {}) {
  return {
    serviceType: "regular",
    totalPrice: 120,
    selectedDate: "2026-03-22",
    selectedTime: "09:00",
    fullAddress: "123 Main St, Romeoville, IL 60446",
    zipCode: "60446",
    consent: true,
    ...overrides,
  };
}

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

test("rejects quote submissions outside the service area ZIP coverage", async () => {
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
          fullAddress: "123 Main St, Chicago, IL 60601",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, "UNSUPPORTED_SERVICE_AREA_ZIP");
    assert.match(payload.error, /do not currently service ZIP code 60601/i);
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
      method: "GET",
      match: "/contacts/",
      status: 200,
      body: {
        contacts: [],
      },
    },
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
    const contactCalls = calls.filter((call) => /\/contacts\/$/.test(call.url));

    assert.equal(contactCalls.length, 1);
    assert.equal(contactCalls[0].method, "POST");
    assert.match(contactCalls[0].url, /\/contacts\/$/);
    assert.match(contactCalls[0].body, /"firstName":"Jane"/);
    assert.match(contactCalls[0].body, /"lastName":"Doe"/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("sends new lead SMS alerts to active managers and admins after quote submission", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-quote-alerts-"));
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-quote-alert-123",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        conversationId: "conversation-quote-alert",
        messageId: "message-quote-alert",
      },
    },
  ]);

  await fs.writeFile(
    usersStorePath,
    `${JSON.stringify({
      users: [
        {
          id: "manager-user-1",
          staffId: "staff-manager-1",
          email: "manager.one@example.com",
          phone: "3125550199",
          status: "active",
          role: "manager",
        },
        {
          id: "admin-user-1",
          staffId: "staff-admin-1",
          email: "admin.one@example.com",
          phone: "3125550177",
          status: "active",
          role: "cleaner",
        },
      ],
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    staffStorePath,
    `${JSON.stringify({
      staff: [
        {
          id: "staff-manager-1",
          name: "Mila Rivers",
          phone: "3125550199",
          status: "active",
        },
        {
          id: "staff-admin-1",
          name: "Anastasiia Iaparova",
          phone: "3125550177",
          status: "active",
          role: "Админ",
        },
        {
          id: "staff-admin-2",
          name: "Staff Only Admin",
          phone: "3125550166",
          status: "active",
          role: "Админ",
        },
      ],
      assignments: [],
    }, null, 2)}\n`,
    "utf8"
  );

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
      ADMIN_USERS_STORE_PATH: usersStorePath,
      ADMIN_STAFF_STORE_PATH: staffStorePath,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-quote-alert-1",
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

    const captureRaw = await waitFor(async () => {
      const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
      return captureRaw.includes("3125550177") && captureRaw.includes("3125550166")
        ? captureRaw
        : null;
    }, { timeoutMs: 10000, intervalMs: 100 });

    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsCalls = calls
      .filter((call) => /\/conversations\/messages$/.test(call.url))
      .map((call) => JSON.parse(call.body));

    assert.ok(smsCalls.length >= 1);
    assert.ok(
      smsCalls.some((call) => call.toNumber === "+13125550100"),
      "customer confirmation SMS should still be sent"
    );
    assert.match(captureRaw, /query=3125550199/);
    assert.match(captureRaw, /query=3125550177/);
    assert.match(captureRaw, /query=3125550166/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
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
        quote: buildSupportedQuote(),
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

test("keeps quote requests local when optional CRM side effects are disabled", async () => {
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
        quote: buildSupportedQuote(),
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.customFieldsUpdated, false);
    assert.equal(payload.customFieldSyncReason, "quote_custom_fields_local_only");
    assert.equal(payload.noteCreated, false);
    assert.equal(payload.opportunityCreated, false);
    assert.equal(payload.opportunitySyncReason, "quote_opportunity_local_only");
    assert.deepEqual(payload.warnings, []);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(calls.some((call) => call.url.endsWith("/notes")), false);
    assert.equal(calls.some((call) => call.url.includes("/opportunities")), false);
    assert.equal(calls.some((call) => call.method === "PUT" && call.url.includes("/contacts/")), false);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("does not create Go High Level opportunities for quote requests", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-opp-warn-1",
        },
      },
    },
    {
      method: "PUT",
      match: "/contacts/contact-opp-warn-1",
      status: 200,
      body: {
        contact: {
          id: "contact-opp-warn-1",
        },
      },
    },
    {
      method: "GET",
      match: "/opportunities/pipelines",
      status: 200,
      body: {
        pipelines: [
          {
            id: "pipe-1",
            name: "Main",
            stages: [{ id: "stage-1", name: "New Lead" }],
          },
        ],
      },
    },
    {
      method: "POST",
      match: "/opportunities/",
      status: 403,
      body: {
        message: "Missing permission: opportunities.write",
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "1",
      GHL_AUTO_DISCOVER_OPPORTUNITY_PIPELINE: "1",
      GHL_PIPELINE_NAME: "Main",
      GHL_PIPELINE_STAGE_NAME: "New Lead",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-quote-opportunity-warning",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
        },
        quote: buildSupportedQuote(),
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.opportunityCreated, false);
    assert.equal(payload.opportunitySyncReason, "quote_opportunity_local_only");
    assert.equal(payload.warningMessage, "");
    assert.deepEqual(payload.warnings, []);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(calls.some((call) => call.url.includes("/opportunities")), false);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("returns canonical repriced values while keeping quote history local", async () => {
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
        quote: buildSupportedQuote({
          frequency: "biweekly",
          rooms: 0,
          bathrooms: 0,
          squareMeters: 1,
          totalPrice: 1,
        }),
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
    assert.equal(calls.some((call) => call.url.endsWith("/notes")), false);
    assert.equal(calls.some((call) => call.url.includes("/opportunities")), false);
    assert.equal(calls.some((call) => call.method === "PUT" && call.url.includes("/contacts/")), false);
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
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
        quote: buildSupportedQuote(),
      }),
    });
    assert.equal(secondSpoofedChainResponse.status, 429);
  } finally {
    await stopServer(startedTrusted.child);
  }
});
