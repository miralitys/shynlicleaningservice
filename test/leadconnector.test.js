"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createLeadConnectorClient,
  loadLeadConnectorConfig,
  normalizeQuoteSubmission,
} = require("../lib/leadconnector");

function createResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
      },
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test("normalizes the existing quote payload into a safe CRM submission", () => {
  const submission = normalizeQuoteSubmission({
    contactData: {
      fullName: "  Jane   Doe ",
      phone: "(312) 555-0100",
      email: "JANE@example.com",
    },
    calculatorData: {
      serviceType: "deep",
      frequency: "biweekly",
      rooms: "4",
      bathrooms: "2.5",
      squareMeters: "1800",
      services: ["ovenCleaning", "ovenCleaning", "insideCabinets"],
      quantityServices: {
        interiorWindowsCleaning: "2",
        blindsCleaning: "1",
      },
      additionalDetails: "Please use hypoallergenic products.\nThanks.",
      selectedDate: "2026-03-22",
      selectedTime: "09:00",
      formattedDateTime: "Sunday, March 22, 2026 9:00 AM",
      address: "123 Main St",
      city: "Romeoville",
      state: "IL",
      zipCode: "60446",
      totalPrice: "149.99",
      consent: true,
    },
    source: "Website Quote",
  });

  assert.equal(submission.contact.fullName, "Jane Doe");
  assert.equal(submission.contact.phone, "3125550100");
  assert.equal(submission.contact.phoneE164, "+13125550100");
  assert.equal(submission.contact.email, "jane@example.com");
  assert.equal(submission.quote.serviceType, "deep");
  assert.equal(submission.quote.frequency, "biweekly");
  assert.deepEqual(submission.quote.services, ["ovenCleaning", "insideCabinets"]);
  assert.equal(submission.quote.totalPrice, 150);
  assert.equal(submission.quote.consent, true);
  assert.equal(submission.meta.source, "Website Quote");
});

test("loads LeadConnector config and rejects unsafe base URLs", () => {
  const config = loadLeadConnectorConfig({
    GHL_API_KEY: "key",
    GHL_LOCATION_ID: "loc",
    GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
  });

  assert.equal(config.configured, true);
  assert.equal(config.apiBaseUrl, "https://services.leadconnectorhq.com");

  assert.throws(
    () =>
      loadLeadConnectorConfig({
        GHL_API_KEY: "key",
        GHL_LOCATION_ID: "loc",
        GHL_API_BASE_URL: "http://example.com",
      }),
    /https/
  );
});

test("submits a quote, creates the contact, and writes a note", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      redirect: options.redirect,
    });

    if (String(url).includes("/contacts/") && options.method === "POST") {
      return createResponse(200, { contact: { id: "contact-1" } });
    }

    if (String(url).includes("/contacts/contact-1") && options.method === "PUT") {
      return createResponse(200, { id: "contact-1" });
    }

    if (String(url).includes("/notes")) {
      return createResponse(200, { id: "note-1" });
    }

    if (String(url).includes("/opportunities")) {
      return createResponse(200, { id: "opp-1" });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
      GHL_CUSTOM_FIELDS_JSON: JSON.stringify({ rooms: "cf-rooms" }),
      GHL_CREATE_OPPORTUNITY: "0",
    },
    fetch,
  });

  const result = await client.submitQuoteSubmission({
    contactData: {
      fullName: "Jane Doe",
      phone: "312-555-0100",
    },
    calculatorData: {
      serviceType: "regular",
      rooms: 3,
      totalPrice: 120,
      selectedDate: "2026-03-22",
      selectedTime: "09:00",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-1");
  assert.equal(result.customFieldsUpdated, true);
  assert.equal(result.noteCreated, true);
  assert.equal(result.opportunityCreated, false);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].redirect, "error");
  assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].headers.Version, "2021-07-28");
  assert.equal(calls[1].method, "PUT");
  assert.match(calls[1].body, /cf-rooms/);
  assert.equal(calls[2].method, "POST");
  assert.match(calls[2].body, /WEBSITE QUOTE SUBMISSION/);
});

test("falls back to updating an existing contact after a duplicate response", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      body: options.body,
    });

    if (String(url).endsWith("/contacts/") && options.method === "POST") {
      return createResponse(400, { message: "duplicate contact" });
    }

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=3125550100") && options.method === "GET") {
      return createResponse(200, { contacts: [{ id: "contact-2", phone: "+1 (312) 555-0100" }] });
    }

    if (String(url).includes("/contacts/contact-2") && options.method === "PUT") {
      return createResponse(200, { id: "contact-2" });
    }

    if (String(url).includes("/notes")) {
      return createResponse(200, { id: "note-2" });
    }

    if (String(url).includes("/opportunities")) {
      return createResponse(200, { id: "opp-2" });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
      GHL_CUSTOM_FIELDS_JSON: JSON.stringify({ rooms: "cf-rooms" }),
      GHL_CREATE_OPPORTUNITY: "0",
    },
    fetch,
  });

  const result = await client.submitQuoteSubmission({
    contactData: {
      fullName: "Jane Doe",
      phone: "3125550100",
    },
    calculatorData: {
      rooms: 2,
      totalPrice: 95,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.usedExistingContact, true);
  assert.equal(result.contactId, "contact-2");
  assert.equal(result.customFieldsUpdated, true);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[2].method, "PUT");
  assert.equal(calls[3].method, "PUT");
});

test("falls back to updating an existing contact after any client-side create failure", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      body: options.body,
    });

    if (String(url).endsWith("/contacts/") && options.method === "POST") {
      return createResponse(400, { message: "contact validation failed" });
    }

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=3125550101") && options.method === "GET") {
      return createResponse(200, { contacts: [{ id: "contact-2b", phone: "+1 (312) 555-0101" }] });
    }

    if (String(url).includes("/contacts/contact-2b") && options.method === "PUT") {
      return createResponse(200, { id: "contact-2b" });
    }

    if (String(url).includes("/notes")) {
      return createResponse(200, { id: "note-2b" });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
      GHL_CUSTOM_FIELDS_JSON: JSON.stringify({ rooms: "cf-rooms" }),
      GHL_CREATE_OPPORTUNITY: "0",
    },
    fetch,
  });

  const result = await client.submitQuoteSubmission({
    contactData: {
      fullName: "Jane Doe",
      phone: "3125550101",
    },
    calculatorData: {
      rooms: 2,
      totalPrice: 95,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.usedExistingContact, true);
  assert.equal(result.contactId, "contact-2b");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[2].method, "PUT");
  assert.equal(calls[3].method, "PUT");
});

test("auto-discovers custom fields when env mapping is not configured", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      body: options.body,
    });

    if (String(url).includes("/contacts/") && options.method === "POST") {
      return createResponse(200, { contact: { id: "contact-3" } });
    }

    if (String(url).includes("/locations/loc-1/customFields") && options.method === "GET") {
      return createResponse(200, {
        customFields: [
          { id: "cf-service-type", name: "contact.service_type", objectType: "contact" },
          { id: "cf-rooms", name: "Bedrooms", objectType: "contact" },
          { id: "cf-windows", name: "contact.interior_windows_cleaning", objectType: "contact" },
        ],
      });
    }

    if (String(url).includes("/contacts/contact-3") && options.method === "PUT") {
      return createResponse(200, { id: "contact-3" });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "0",
    },
    fetch,
  });

  const result = await client.submitQuoteSubmission({
    contactData: {
      fullName: "Jane Doe",
      phone: "3125550100",
    },
    calculatorData: {
      serviceType: "regular",
      rooms: 3,
      quantityServices: {
        interiorWindowsCleaning: 2,
      },
      totalPrice: 120,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-3");
  assert.equal(result.customFieldsUpdated, true);
  assert.equal(result.skipped.notes, true);
  assert.match(calls[2].body, /cf-service-type/);
  assert.match(calls[2].body, /cf-rooms/);
  assert.match(calls[2].body, /cf-windows/);
});

test("auto-discovers opportunity pipeline and stage by configured names", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      body: options.body,
    });

    if (String(url).includes("/contacts/") && options.method === "POST") {
      return createResponse(200, { contact: { id: "contact-4" } });
    }

    if (String(url).includes("/contacts/contact-4") && options.method === "PUT") {
      return createResponse(200, { id: "contact-4" });
    }

    if (String(url).includes("/opportunities/pipelines") && options.method === "GET") {
      return createResponse(200, {
        pipelines: [
          {
            id: "pipe-1",
            name: "Main",
            stages: [
              { id: "stage-1", name: "New Lead" },
              { id: "stage-2", name: "Won" },
            ],
          },
        ],
      });
    }

    if (String(url).includes("/opportunities/") && options.method === "POST") {
      return createResponse(200, { id: "opp-4" });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
      GHL_CUSTOM_FIELDS_JSON: JSON.stringify({ rooms: "cf-rooms" }),
      GHL_ENABLE_NOTES: "0",
      GHL_CREATE_OPPORTUNITY: "1",
      GHL_PIPELINE_NAME: "Pipelines Main",
      GHL_PIPELINE_STAGE_NAME: "New Lead",
    },
    fetch,
  });

  const result = await client.submitQuoteSubmission({
    contactData: {
      fullName: "Jane Doe",
      phone: "3125550100",
    },
    calculatorData: {
      rooms: 2,
      totalPrice: 95,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-4");
  assert.equal(result.opportunityCreated, true);
  assert.equal(result.opportunitySyncReason, "");
  assert.equal(result.skipped.opportunity, false);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "PUT");
  assert.equal(calls[2].method, "GET");
  assert.match(calls[2].url, /\/opportunities\/pipelines/);
  assert.equal(calls[3].method, "POST");
  assert.match(calls[3].body, /"pipelineId":"pipe-1"/);
  assert.match(calls[3].body, /"pipelineStageId":"stage-1"/);
});

test("sends an SMS through conversations API when contactId is provided", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/conversations/messages") && options.method === "POST") {
      return createResponse(200, {
        id: "message-123",
        conversationId: "conversation-123",
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.sendSmsMessage({
    contactId: "contact-123",
    phone: "312-555-0100",
    message: "Your cleaner is on the way.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-123");
  assert.equal(result.phoneE164, "+13125550100");
  assert.equal(result.conversationId, "conversation-123");
  assert.equal(result.messageId, "message-123");
  assert.equal(result.message, "Your cleaner is on the way.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].headers.Version, "2021-04-15");

  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload, {
    type: "SMS",
    contactId: "contact-123",
    message: "Your cleaner is on the way.",
    status: "pending",
    toNumber: "+13125550100",
  });
});

test("looks up the contact by phone before sending an SMS", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=3125550101") && options.method === "GET") {
      return createResponse(200, {
        contacts: [{ id: "contact-lookup-123", phone: "+1 (312) 555-0101" }],
      });
    }

    if (String(url).includes("/conversations/messages") && options.method === "POST") {
      return createResponse(200, {
        message: { id: "message-lookup-123" },
        conversation: { id: "conversation-lookup-123" },
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.sendSmsMessage({
    phone: "312-555-0101",
    message: "Please confirm tomorrow's appointment.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-lookup-123");
  assert.equal(result.phoneE164, "+13125550101");
  assert.equal(result.conversationId, "conversation-lookup-123");
  assert.equal(result.messageId, "message-lookup-123");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].headers.Version, "2021-04-15");

  const payload = JSON.parse(calls[1].body);
  assert.equal(payload.contactId, "contact-lookup-123");
  assert.equal(payload.toNumber, "+13125550101");
  assert.equal(payload.message, "Please confirm tomorrow's appointment.");
});

test("creates a contact on the fly when lookup fails before sending an SMS", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=3125550199") && options.method === "GET") {
      return createResponse(500, { message: "temporary lookup outage" });
    }

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100") && !String(url).includes("query=") && options.method === "GET") {
      return createResponse(200, { contacts: [] });
    }

    if (String(url).endsWith("/contacts/") && options.method === "POST") {
      return createResponse(200, {
        contact: { id: "contact-created-199" },
      });
    }

    if (String(url).includes("/conversations/messages") && options.method === "POST") {
      return createResponse(200, {
        message: { id: "message-created-199" },
        conversation: { id: "conversation-created-199" },
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.sendSmsMessage({
    phone: "312-555-0199",
    customerName: "SMS Fallback Client",
    customerEmail: "sms.fallback@example.com",
    message: "We found your order and are texting from SHYNLI.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-created-199");
  assert.equal(result.createdContact, true);
  assert.equal(result.usedExistingContact, false);
  assert.equal(result.updatedExistingContact, false);
  assert.equal(result.phoneE164, "+13125550199");
  assert.equal(calls.length, 4);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[2].method, "POST");
  assert.equal(calls[3].method, "POST");

  const createPayload = JSON.parse(calls[2].body);
  assert.equal(createPayload.firstName, "SMS");
  assert.equal(createPayload.lastName, "Fallback Client");
  assert.equal(createPayload.phone, "13125550199");
  assert.equal(createPayload.email, "sms.fallback@example.com");

  const smsPayload = JSON.parse(calls[3].body);
  assert.equal(smsPayload.contactId, "contact-created-199");
  assert.equal(smsPayload.toNumber, "+13125550199");
});

test("falls back to scanning contacts by phone digits when query search misses the existing contact", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=4244199102") && options.method === "GET") {
      return createResponse(200, { contacts: [] });
    }

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100") && !String(url).includes("query=") && options.method === "GET") {
      return createResponse(200, {
        contacts: [
          { id: "contact-phone-scan-9102", phone: "(424) 419-9102" },
        ],
      });
    }

    if (String(url).includes("/conversations/messages") && options.method === "POST") {
      return createResponse(200, {
        message: { id: "message-phone-scan-9102" },
        conversation: { id: "conversation-phone-scan-9102" },
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.sendSmsMessage({
    phone: "424-419-9102",
    customerName: "Ignored Name",
    customerEmail: "ignored@example.com",
    message: "Phone-only contact lookup should win.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-phone-scan-9102");
  assert.equal(result.createdContact, false);
  assert.equal(result.usedExistingContact, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "GET");

  const smsPayload = JSON.parse(calls[2].body);
  assert.equal(smsPayload.contactId, "contact-phone-scan-9102");
  assert.equal(smsPayload.toNumber, "+14244199102");
});

test("loads inbound and outbound SMS history from a conversation", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/conversations/conversation-555/messages") && options.method === "GET") {
      return createResponse(200, {
        messages: [
          {
            id: "message-outbound-1",
            type: "TYPE_SMS",
            direction: "outbound",
            body: "Your booking is confirmed.",
            dateAdded: "2026-04-18T14:00:00.000Z",
            conversationId: "conversation-555",
            phone: "+13125550100",
          },
          {
            id: "message-inbound-1",
            type: "TYPE_SMS",
            direction: "inbound",
            body: "Thank you!",
            dateAdded: "2026-04-18T14:05:00.000Z",
            conversationId: "conversation-555",
            phone: "+13125550100",
          },
        ],
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.getSmsHistory({
    contactId: "contact-555",
    phone: "312-555-0100",
    conversationId: "conversation-555",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-555");
  assert.equal(result.phoneE164, "+13125550100");
  assert.equal(result.history.length, 2);
  assert.equal(result.history[0].direction, "inbound");
  assert.equal(result.history[0].source, "client");
  assert.equal(result.history[0].message, "Thank you!");
  assert.equal(result.history[1].direction, "outbound");
  assert.equal(result.history[1].source, "manual");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.Version, "2021-04-15");
});

test("loads SMS history by resolving the contact from phone when contactId is missing", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=4244199102") && options.method === "GET") {
      return createResponse(200, {
        contacts: [
          {
            id: "contact-424-old",
            phone: "(424) 419-9102",
          },
          {
            id: "contact-424",
            phone: "(424) 419-9102",
          },
        ],
      });
    }

    if (
      String(url).includes("/contacts/?locationId=loc-1&limit=100") &&
      !String(url).includes("query=") &&
      options.method === "GET"
    ) {
      return createResponse(200, {
        contacts: [
          {
            id: "contact-424",
            phone: "(424) 419-9102",
          },
        ],
      });
    }

    if (String(url).includes("/conversations/search?locationId=loc-1&contactId=contact-424-old") && options.method === "GET") {
      return createResponse(200, {
        conversations: [],
      });
    }

    if (String(url).includes("/conversations/search?locationId=loc-1&contactId=contact-424") && options.method === "GET") {
      return createResponse(200, {
        conversations: [
          {
            id: "conversation-424",
          },
        ],
      });
    }

    if (String(url).includes("/conversations/conversation-424/messages") && options.method === "GET") {
      return createResponse(200, {
        messages: [
          {
            id: "message-inbound-424",
            type: "TYPE_SMS",
            direction: "inbound",
            body: "Привет!",
            dateAdded: "2026-04-18T15:10:00.000Z",
            conversationId: "conversation-424",
            phone: "+14244199102",
          },
        ],
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.getSmsHistory({
    phone: "4244199102",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-424");
  assert.equal(result.phoneE164, "+14244199102");
  assert.equal(result.conversationIds.length, 1);
  assert.equal(result.conversationIds[0], "conversation-424");
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].direction, "inbound");
  assert.equal(result.history[0].source, "client");
  assert.equal(result.history[0].message, "Привет!");
});

test("loads SMS history by scanning additional contact pages when the phone match is not on the first page", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    if (String(url).includes("/contacts/?locationId=loc-1&limit=100&query=") && options.method === "GET") {
      return createResponse(200, {
        contacts: [],
      });
    }

    if (
      String(url).includes("/contacts/?locationId=loc-1&limit=100") &&
      !String(url).includes("page=2") &&
      !String(url).includes("query=") &&
      options.method === "GET"
    ) {
      return createResponse(200, {
        contacts: [
          {
            id: "contact-page-1",
            phone: "(630) 555-0101",
          },
        ],
        meta: {
          nextPage: 2,
        },
      });
    }

    if (
      String(url).includes("/contacts/?locationId=loc-1&limit=100&page=2") &&
      !String(url).includes("query=") &&
      options.method === "GET"
    ) {
      return createResponse(200, {
        contacts: [
          {
            id: "contact-424-paged",
            phone: "(424) 419-9102",
          },
        ],
      });
    }

    if (
      String(url).includes("/conversations/search?locationId=loc-1&contactId=contact-424-paged") &&
      options.method === "GET"
    ) {
      return createResponse(200, {
        conversations: [
          {
            id: "conversation-424-paged",
          },
        ],
      });
    }

    if (String(url).includes("/conversations/conversation-424-paged/messages") && options.method === "GET") {
      return createResponse(200, {
        messages: [
          {
            id: "message-inbound-424-paged",
            type: "TYPE_SMS",
            direction: "inbound",
            body: "Ответ со второй страницы",
            dateAdded: "2026-04-18T16:10:00.000Z",
            conversationId: "conversation-424-paged",
            phone: "+14244199102",
          },
        ],
      });
    }

    throw new Error(`Unexpected call: ${url}`);
  };

  const client = createLeadConnectorClient({
    env: {
      GHL_API_KEY: "test-key",
      GHL_LOCATION_ID: "loc-1",
      GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
    },
    fetch,
  });

  const result = await client.getSmsHistory({
    phone: "4244199102",
  });

  assert.equal(result.ok, true);
  assert.equal(result.contactId, "contact-424-paged");
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].direction, "inbound");
  assert.equal(result.history[0].message, "Ответ со второй страницы");
});
