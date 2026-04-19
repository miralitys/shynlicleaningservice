"use strict";

const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFetchStub, startServer, stopServer } = require("./server-test-helpers");

const ENDPOINT = "/api/cleaner-application/submit";

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
