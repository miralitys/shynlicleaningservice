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

test("accepts call-me quote requests without address or ZIP", async () => {
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
          id: "contact-call-me-123",
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestType: "call_me",
        source: "Website Callback Request",
        contact: {
          fullName: "Callback Client",
          phone: "+1(312)555-0198",
        },
        quote: {
          requestType: "call_me",
          serviceType: "regular",
          totalPrice: 0,
          additionalDetails: "Customer asked for a phone call to confirm details and receive the final quote.",
          consent: true,
        },
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.contactId, "contact-call-me-123");
    assert.equal(payload.pricing.serviceName, "Callback Request");
    assert.equal(payload.pricing.totalPrice, 0);
    assert.equal(payload.pricing.totalPriceCents, 0);
    assert.equal(payload.quoteToken, "");

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const contactCalls = calls.filter((call) => /\/contacts\/$/.test(call.url));

    assert.equal(contactCalls.length, 1);
    assert.match(contactCalls[0].body, /"firstName":"Callback"/);
    assert.match(contactCalls[0].body, /"lastName":"Client"/);
    assert.match(contactCalls[0].body, /"phone":"13125550198"/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("writes successful quote leads to Google Sheets and Telegram without blocking CRM", async () => {
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
          id: "contact-web-leads-123",
        },
      },
    },
    {
      method: "POST",
      match: "sheets.googleapis.com",
      status: 200,
      body: {
        updates: {
          updatedRows: 1,
        },
      },
    },
    {
      method: "POST",
      match: "api.telegram.org",
      status: 200,
      body: {
        ok: true,
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
      WEB_LEADS_SHEET_ID: "sheet-test-123",
      WEB_LEADS_GOOGLE_ACCESS_TOKEN: "ya29.test-token",
      WEB_LEADS_TELEGRAM_BOT_TOKEN: "telegram-test-token",
      WEB_LEADS_TELEGRAM_CHAT_ID: "123456",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: [
          "shynli_attribution=" +
            encodeURIComponent(
              JSON.stringify({
                gclid: "test_e2e_shynli_001",
                utm_source: "google",
                utm_medium: "cpc",
                utm_campaign: "23708521174",
                utm_term: "cleaning company",
              })
            ),
          "shynli_landing_page=" + encodeURIComponent("https://shynlicleaningservice.com/services/regular-cleaning/ads"),
        ].join("; "),
      },
      body: JSON.stringify({
        contact: {
          fullName: "Test Run",
          phone: "(555) 123-4567",
        },
        quote: buildSupportedQuote({
          serviceType: "deep",
          rooms: "3",
          bathrooms: "2",
          squareMeters: "1800",
          additionalDetails: "Please call before arrival.",
        }),
        type: "shynli.com_website_contact",
        sourceWebsite: "https://shynli.com/",
        source: "quote",
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.contactId, "contact-web-leads-123");

    const calls = await waitFor(async () => {
      const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8").catch(() => "");
      const parsedCalls = captureRaw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return parsedCalls.some((call) => call.url.includes("sheets.googleapis.com")) &&
        parsedCalls.some((call) => call.url.includes("api.telegram.org"))
        ? parsedCalls
        : null;
    });

    const sheetsCall = calls.find((call) => call.url.includes("sheets.googleapis.com"));
    const telegramCall = calls.find((call) => call.url.includes("api.telegram.org"));
    assert.ok(sheetsCall);
    assert.ok(telegramCall);

    const sheetsPayload = JSON.parse(sheetsCall.body);
    const row = sheetsPayload.values[0];
    assert.equal(row.length, 20);
    assert.equal(row[1], "shynli.com_website_contact");
    assert.equal(row[2], "Test Run");
    assert.equal(row[3], "+15551234567");
    assert.equal(row[6], "Deep Cleaning");
    assert.match(row[7], /Bedrooms: 3/);
    assert.equal(row[9], "test_e2e_shynli_001");
    assert.equal(row[10], "google / cpc");
    assert.equal(row[11], "23708521174");
    assert.equal(row[12], "cleaning company");
    assert.equal(row[13], "https://shynlicleaningservice.com/services/regular-cleaning/ads");
    assert.equal(row[14], "New");
    assert.match(row[15], /^\$\d+\.\d{2}$/);
    assert.deepEqual(row.slice(16), ["", "", "", ""]);

    const telegramPayload = JSON.parse(telegramCall.body);
    assert.match(telegramPayload.text, /New Shynli lead/);
    assert.match(telegramPayload.text, /Type: shynli\.com_website_contact/);
    assert.match(telegramPayload.text, /Test Run/);
    assert.match(telegramPayload.text, /Deep Cleaning/);
    assert.match(telegramPayload.text, /Price: \$\d+\.\d{2}/);
    assert.match(telegramPayload.text, /CRM: https:\/\/shynlicleaningservice\.com\/admin\/quote-ops\?entry=/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("preserves explicit Facebook lead source in web lead delivery", async () => {
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
          id: "contact-facebook-lead-123",
        },
      },
    },
    {
      method: "POST",
      match: "sheets.googleapis.com",
      status: 200,
      body: {
        updates: {
          updatedRows: 1,
        },
      },
    },
    {
      method: "POST",
      match: "api.telegram.org",
      status: 200,
      body: {
        ok: true,
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
      WEB_LEADS_SHEET_ID: "sheet-test-123",
      WEB_LEADS_GOOGLE_ACCESS_TOKEN: "ya29.test-token",
      WEB_LEADS_TELEGRAM_BOT_TOKEN: "telegram-test-token",
      WEB_LEADS_TELEGRAM_CHAT_ID: "123456",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadSource: "facebook_lead_form",
        requestType: "call_me",
        source: "Facebook Lead Form",
        contact: {
          fullName: "Facebook Test Lead",
          phone: "(630) 555-0197",
        },
        quote: {
          requestType: "call_me",
          serviceType: "deep",
          totalPrice: 0,
          additionalDetails: "Meta Instant Form lead - New customers.",
          consent: true,
        },
        landingPage: "https://facebook.com/shynli-cleaning-lead-form",
        utm_source: "facebook",
        utm_medium: "paid_social",
        utm_campaign: "new-customers",
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.contactId, "contact-facebook-lead-123");

    const calls = await waitFor(async () => {
      const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8").catch(() => "");
      const parsedCalls = captureRaw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return parsedCalls.some((call) => call.url.includes("sheets.googleapis.com")) &&
        parsedCalls.some((call) => call.url.includes("api.telegram.org"))
        ? parsedCalls
        : null;
    });

    const sheetsCall = calls.find((call) => call.url.includes("sheets.googleapis.com"));
    const telegramCall = calls.find((call) => call.url.includes("api.telegram.org"));
    assert.ok(sheetsCall);
    assert.ok(telegramCall);

    const sheetsPayload = JSON.parse(sheetsCall.body);
    const row = sheetsPayload.values[0];
    assert.equal(row[1], "facebook_lead_form");
    assert.equal(row[2], "Facebook Test Lead");
    assert.equal(row[3], "+16305550197");
    assert.equal(row[6], "Deep Cleaning");
    assert.equal(row[10], "facebook / paid_social");
    assert.equal(row[11], "new-customers");
    assert.equal(row[13], "https://facebook.com/shynli-cleaning-lead-form");

    const telegramPayload = JSON.parse(telegramCall.body);
    assert.match(telegramPayload.text, /Type: facebook_lead_form/);
    assert.match(telegramPayload.text, /Facebook Test Lead/);
    assert.match(telegramPayload.text, /Deep Cleaning/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("writes successful quote leads through Apps Script webhook when configured", async () => {
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
          id: "contact-apps-script-123",
        },
      },
    },
    {
      method: "POST",
      match: "script.google.com",
      status: 200,
      body: {
        ok: true,
        appended: 1,
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
      WEB_LEADS_SHEET_ID: "sheet-test-123",
      WEB_LEADS_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test-web-leads/exec",
      WEB_LEADS_APPS_SCRIPT_SECRET: "script-secret-test",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: [
          "shynli_attribution=" +
            encodeURIComponent(
              JSON.stringify({
                gclid: "test_apps_script_001",
                utm_source: "google",
                utm_medium: "cpc",
                utm_campaign: "apps-script-campaign",
                utm_term: "house cleaning",
              })
            ),
          "shynli_landing_page=" + encodeURIComponent("https://shynlicleaningservice.com/ads-v2"),
        ].join("; "),
      },
      body: JSON.stringify({
        contact: {
          fullName: "Apps Script Test",
          phone: "555-555-0199",
        },
        quote: buildSupportedQuote({
          serviceType: "regular",
          additionalDetails: "Apps Script webhook path.",
        }),
        source: "quote",
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.contactId, "contact-apps-script-123");

    const calls = await waitFor(async () => {
      const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8").catch(() => "");
      const parsedCalls = captureRaw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return parsedCalls.some((call) => call.url.includes("script.google.com")) ? parsedCalls : null;
    });

    const appsScriptCall = calls.find((call) => call.url.includes("script.google.com"));
    assert.ok(appsScriptCall);

    const appsScriptPayload = JSON.parse(appsScriptCall.body);
    assert.equal(appsScriptPayload.sheetId, "sheet-test-123");
    assert.equal(appsScriptPayload.tabName, "Web Leads");
    assert.equal(appsScriptPayload.secret, "script-secret-test");
    assert.equal(appsScriptPayload.source, "shynli-web-leads");
    assert.match(appsScriptPayload.idempotencyKey, /^[a-f0-9]{64}$/);
    assert.equal(appsScriptPayload.values.length, 1);

    const row = appsScriptPayload.values[0];
    assert.equal(row.length, 20);
    assert.equal(row[1], "website_quiz");
    assert.equal(row[2], "Apps Script Test");
    assert.equal(row[3], "+15555550199");
    assert.equal(row[6], "Regular Cleaning");
    assert.equal(row[9], "test_apps_script_001");
    assert.equal(row[13], "https://shynlicleaningservice.com/ads-v2");
    assert.equal(row[14], "New");
    assert.match(row[15], /^\$\d+\.\d{2}$/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
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
          frequency: "biweekly",
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
    assert.equal(payload.pricing.serviceName, "Deep Cleaning");

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
    assert.doesNotMatch(contactCalls[0].body, /biweekly/i);
    assert.doesNotMatch(contactCalls[0].body, /frequency/i);
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
    assert.ok(
      smsCalls.some((call) => call.toNumber === "+13125550199"),
      "active manager should receive a lead alert SMS"
    );
    assert.ok(
      smsCalls.some((call) => call.toNumber === "+13125550177"),
      "active admin user should receive a lead alert SMS"
    );
    assert.ok(
      smsCalls.some((call) => call.toNumber === "+13125550166"),
      "active admin staff fallback should receive a lead alert SMS"
    );
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
    assert.equal(captured.options.payment_method_types, undefined);
    assert.deepEqual(captured.paymentMethodDomainCreates, [
      { domain_name: "shynlicleaningservice.com", enabled: true },
    ]);
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
