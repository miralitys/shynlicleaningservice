"use strict";

const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFetchStub, startServer, stopServer } = require("./server-test-helpers");

const ENDPOINT = "/api/cleaner-application/submit";

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

test("rejects non-POST cleaner application requests", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}${ENDPOINT}`, {
      method: "GET",
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  } finally {
    await stopServer(started.child);
  }
});

test("rejects malformed cleaner application JSON", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}${ENDPOINT}`, {
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

test("returns a graceful 503 when cleaner applications cannot reach CRM", async () => {
  const started = await startServer();

  try {
    const response = await fetch(`${started.baseUrl}${ENDPOINT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        application: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "jane@example.com",
          zipCode: "60446",
          experience: "Yes, professional experience",
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

test("rejects invalid cleaner application data with a 400", async () => {
  const fetchStub = createFetchStub([]);
  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}${ENDPOINT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        application: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "not-an-email",
          zipCode: "6044",
          experience: "",
        },
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /valid email|required/i);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("accepts valid cleaner applications through the backend CRM helper", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "cleaner-contact-123",
        },
      },
    },
    {
      method: "POST",
      match: "/notes",
      status: 200,
      body: {
        id: "cleaner-note-123",
      },
    },
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
      GHL_CREATE_OPPORTUNITY: "0",
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-cleaner-1",
      },
      body: JSON.stringify({
        application: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "jane@example.com",
          zipCode: "60446",
          experience: "Yes, professional experience",
          details: "Can work weekends.",
        },
        source: "Website Careers Form",
        pageUrl: "https://shynlicleaningservice.com/",
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.contactId, "cleaner-contact-123");
    assert.equal(payload.noteCreated, true);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const contactCall = calls.find((call) => /\/contacts\/$/.test(call.url));
    const noteCall = calls.find((call) => /\/notes$/.test(call.url));

    assert.ok(contactCall);
    assert.match(contactCall.body, /"firstName":"Jane"/);
    assert.match(contactCall.body, /"email":"jane@example.com"/);
    assert.match(contactCall.body, /"postalCode":"60446"/);
    assert.ok(noteCall);
    assert.match(noteCall.body, /WEBSITE CLEANER APPLICATION/);
    assert.match(noteCall.body, /Can work weekends/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("writes successful cleaner applications to Web Leads as applications", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "cleaner-web-leads-123",
        },
      },
    },
    {
      method: "POST",
      match: "/notes",
      status: 200,
      body: {
        id: "cleaner-note-web-leads",
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
  ]);

  const started = await startServer({
    env: {
      GHL_API_KEY: "ghl_test_key",
      GHL_LOCATION_ID: "location-123",
      SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
      GHL_CREATE_OPPORTUNITY: "0",
      WEB_LEADS_SHEET_ID: "sheet-test-123",
      WEB_LEADS_GOOGLE_ACCESS_TOKEN: "ya29.test-token",
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie:
          "shynli_attribution=" +
          encodeURIComponent(
            JSON.stringify({
              gclid: "test_application_gclid",
              utm_source: "google",
              utm_medium: "cpc",
              utm_campaign: "application_campaign",
              utm_term: "cleaner jobs",
            })
          ),
      },
      body: JSON.stringify({
        application: {
          fullName: "Applicant Test",
          phone: "555.123.4567",
          email: "applicant@example.com",
          zipCode: "60446",
          experience: "2 years",
          details: "Available weekdays.",
        },
        source: "Website Careers Form",
        pageUrl: "https://shynlicleaningservice.com/careers?gclid=test_application_gclid",
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);

    const calls = await waitFor(async () => {
      const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8").catch(() => "");
      const parsedCalls = captureRaw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return parsedCalls.some((call) => call.url.includes("sheets.googleapis.com")) ? parsedCalls : null;
    });
    const sheetsCall = calls.find((call) => call.url.includes("sheets.googleapis.com"));
    assert.ok(sheetsCall);
    const row = JSON.parse(sheetsCall.body).values[0];
    assert.equal(row[1], "website_application");
    assert.equal(row[2], "Applicant Test");
    assert.equal(row[3], "+15551234567");
    assert.equal(row[4], "applicant@example.com");
    assert.equal(row[6], "Application");
    assert.equal(row[7], "2 years");
    assert.equal(row[8], "Available weekdays.");
    assert.equal(row[9], "test_application_gclid");
    assert.equal(row[14], "New");
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});
