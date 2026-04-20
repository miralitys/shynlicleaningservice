"use strict";

const {
  crypto,
  fs,
  os,
  path,
  test,
  assert,
  createAdminDomainHelpers,
  generateTotpCode,
  hashPassword,
  loadAdminConfig,
  createFetchStub,
  createSmtpTestServer,
  startServer,
  stopServer,
  SIGNATURE_DATA_URL,
  getSetCookies,
  getCookieValue,
  escapeRegex,
  getOrderFunnelLaneSlice,
  normalizeEmailSource,
  decodeQuotedPrintable,
  getChicagoDateValue,
  getChicagoDateTimeLocalValue,
  getStaffAssignmentEntryIdByCustomerName,
  getLeadTaskIdByEntryId,
  createAdminSession,
  createStripeWebhookSignature,
  submitQuote,
  createOrderFromQuoteRequest,
  getQuoteOpsEntryId,
} = require("./admin-route-helpers");

test("allows admins to add a manual order from the orders page", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Добавить заказ/);
    assert.match(ordersBody, /Добавить заказ вручную/);
    assert.match(ordersBody, /create-manual-order/);

    const createOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-manual-order",
        returnTo: "/admin/orders",
        customerName: "Manual Customer",
        customerPhone: "3125557711",
        customerEmail: "manual.customer@example.com",
        serviceType: "deep",
        selectedDate: "2026-04-22",
        selectedTime: "13:30",
        frequency: "biweekly",
        totalPrice: "240.00",
        fullAddress: "215 North Elm Street, Naperville, IL 60563",
      }),
    });

    assert.equal(createOrderResponse.status, 303);
    const redirectLocation = createOrderResponse.headers.get("location") || "";
    assert.match(redirectLocation, /notice=manual-order-created/);
    const createdOrderId = new URL(redirectLocation, started.baseUrl).searchParams.get("order");
    assert.ok(createdOrderId);

    const createdOrderResponse = await fetch(`${started.baseUrl}${redirectLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const createdOrderBody = await createdOrderResponse.text();
    assert.equal(createdOrderResponse.status, 200);
    assert.match(createdOrderBody, /Заказ добавлен вручную/);
    assert.match(createdOrderBody, /Manual Customer/);
    assert.match(createdOrderBody, /Deep/);
    assert.match(createdOrderBody, /Bi-weekly/);
    assert.match(createdOrderBody, /215 North Elm Street, Naperville, IL 60563/);
    assert.match(createdOrderBody, /\$240\.00/);
    assert.match(createdOrderBody, new RegExp(`name="entryId" value="${escapeRegex(createdOrderId)}"`));
  } finally {
    await stopServer(started.child);
  }
});

test("reconciles Stripe checkout completion into order payment state without touching site UI", async () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId = `stripe-webhook-order-${uniqueSuffix}`;
  const customerName = `Webhook Customer ${uniqueSuffix}`;
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-stripe-webhook-order",
        },
      },
    },
  ]);
  const webhookSecret = "whsec_test_order_payment";
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId,
      fullName: customerName,
      phone: "3125550911",
      email: "paid.customer@example.com",
      fullAddress: "400 Payment Ave, Naperville, IL 60540",
      serviceType: "deep",
      selectedDate: "2026-04-24",
      selectedTime: "10:30",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      customerName
    );

    const webhookPayload = {
      id: "evt_checkout_completed_test",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_paid_order",
          client_reference_id: requestId,
          metadata: {
            request_id: requestId,
          },
          payment_intent: "pi_test_paid_order",
          amount_total: 20500,
          currency: "usd",
          payment_status: "paid",
          customer_details: {
            email: "paid.customer@example.com",
          },
        },
      },
    };
    const webhookBody = JSON.stringify(webhookPayload);
    const webhookResponse = await fetch(`${started.baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": createStripeWebhookSignature(webhookBody, webhookSecret),
      },
      body: webhookBody,
    });
    assert.equal(webhookResponse.status, 200);

    const focusedOrderResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const focusedOrderBody = await focusedOrderResponse.text();
    assert.equal(focusedOrderResponse.status, 200);
    assert.match(focusedOrderBody, /<option value="paid" selected>Paid/);
    assert.match(focusedOrderBody, /<option value="card" selected>Card/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("creates the next recurring order when a recurring order is completed", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-recurring-orders-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-recurring-123",
        },
      },
    },
    {
      method: "PUT",
      match: "/contacts/contact-recurring-123",
      status: 200,
      body: {
        contact: {
          id: "contact-recurring-123",
        },
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_CUSTOM_FIELDS_JSON: JSON.stringify({
      fullAddress: "cf_full_address",
    }),
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const recurringCases = [
      {
        requestId: "recurring-weekly-order",
        fullName: "Recurring Weekly Client",
        email: "recurring-weekly@example.com",
        phone: "312-555-2101",
        frequency: "weekly",
        selectedDate: "2026-04-14",
        selectedTime: "09:00",
        fullAddress: "101 Weekly Lane, Aurora, IL",
        expectedNextSchedule: "04/21/2026, 09:00 AM",
      },
      {
        requestId: "recurring-biweekly-order",
        fullName: "Recurring Biweekly Client",
        email: "recurring-biweekly@example.com",
        phone: "312-555-2102",
        frequency: "biweekly",
        selectedDate: "2026-04-14",
        selectedTime: "11:30",
        fullAddress: "202 Biweekly Drive, Naperville, IL",
        expectedNextSchedule: "04/28/2026, 11:30 AM",
      },
      {
        requestId: "recurring-monthly-order",
        fullName: "Recurring Monthly Client",
        email: "recurring-monthly@example.com",
        phone: "312-555-2103",
        frequency: "monthly",
        selectedDate: "2026-04-14",
        selectedTime: "15:15",
        fullAddress: "303 Monthly Court, Elgin, IL",
        expectedNextSchedule: "06/14/2026, 03:15 PM",
      },
    ];

    for (const recurringCase of recurringCases) {
      const quoteResponse = await submitQuote(started.baseUrl, recurringCase);
      assert.equal(quoteResponse.status, 201);

      recurringCase.entryId = await createOrderFromQuoteRequest(
        started.baseUrl,
        sessionCookieValue,
        recurringCase.requestId
      );

      const completeResponse = await fetch(`${started.baseUrl}/admin/orders`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
        body: new URLSearchParams({
          entryId: recurringCase.entryId,
          returnTo: "/admin/orders",
          orderStatus: "completed",
        }),
      });

      assert.equal(completeResponse.status, 303);
      assert.match(completeResponse.headers.get("location") || "", /notice=order-saved/);
    }

    for (const recurringCase of recurringCases) {
      const ordersResponse = await fetch(
        `${started.baseUrl}/admin/orders?q=${encodeURIComponent(recurringCase.fullName)}`,
        {
          headers: {
            cookie: `shynli_admin_session=${sessionCookieValue}`,
          },
        }
      );
      const ordersBody = await ordersResponse.text();

      assert.equal(ordersResponse.status, 200);
      assert.match(ordersBody, /Найдено 2 из \d+ заказов\./);
      assert.match(ordersBody, new RegExp(escapeRegex(recurringCase.expectedNextSchedule)));
      assert.match(ordersBody, /Завершено/);
      assert.match(ordersBody, /Новые/);
    }

    const repeatCompleteResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId: recurringCases[0].entryId,
        returnTo: "/admin/orders",
        orderStatus: "completed",
      }),
    });
    assert.equal(repeatCompleteResponse.status, 303);

    const weeklyOrdersAfterRepeatResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=${encodeURIComponent(recurringCases[0].fullName)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const weeklyOrdersAfterRepeatBody = await weeklyOrdersAfterRepeatResponse.text();
    assert.equal(weeklyOrdersAfterRepeatResponse.status, 200);
    assert.match(weeklyOrdersAfterRepeatBody, /Найдено 2 из \d+ заказов\./);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("sends order SMS over ajax and keeps SMS history in the order dialog", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-sms-order-123",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-sms-order-123",
        conversationId: "conversation-sms-order-123",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "sms-order-request-1",
      fullName: "Order SMS Lead",
      phone: "(424) 419-9102",
      email: "sms.order@example.com",
      serviceType: "regular",
      selectedDate: "2026-04-20",
      selectedTime: "10:30",
      fullAddress: "901 Follow Up Drive, Bolingbrook, IL 60440",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "sms-order-request-1");
    const returnTo = `/admin/orders?order=${encodeURIComponent(entryId)}`;

    const beforeResponse = await fetch(`${started.baseUrl}${returnTo}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const beforeBody = await beforeResponse.text();
    assert.equal(beforeResponse.status, 200);
    assert.match(beforeBody, /data-admin-ghl-sms="true"/);
    assert.match(beforeBody, /История SMS/);

    const sendSmsResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-order-sms",
        entryId,
        message: "Order SMS history test",
        returnTo,
      }),
    });

    assert.equal(sendSmsResponse.status, 200);
    const sendSmsPayload = await sendSmsResponse.json();
    assert.equal(sendSmsPayload.ok, true);
    assert.equal(sendSmsPayload.notice, "order-sms-sent");
    assert.equal(sendSmsPayload.sms.feedbackState, "success");
    assert.equal(sendSmsPayload.sms.feedbackMessage, "SMS отправлена через Go High Level.");
    assert.equal(sendSmsPayload.sms.draft, "");
    assert.equal(sendSmsPayload.sms.historyCountLabel, "2 SMS");
    assert.equal(sendSmsPayload.sms.history.length, 2);
    assert.equal(sendSmsPayload.sms.history[0].message, "Order SMS history test");
    assert.equal(sendSmsPayload.sms.history[0].source, "manual");
    assert.equal(sendSmsPayload.sms.history[0].channel, "ghl");

    const secondSmsResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-order-sms",
        entryId,
        message: "Second order SMS history test",
        returnTo,
      }),
    });
    assert.equal(secondSmsResponse.status, 200);

    const thirdSmsResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-order-sms",
        entryId,
        message: "Third order SMS history test",
        returnTo,
      }),
    });
    assert.equal(thirdSmsResponse.status, 200);
    const thirdSmsPayload = await thirdSmsResponse.json();
    assert.equal(thirdSmsPayload.ok, true);
    assert.equal(thirdSmsPayload.sms.historyCountLabel, "4 SMS");
    assert.equal(thirdSmsPayload.sms.history.length, 4);
    assert.ok(
      thirdSmsPayload.sms.history.some((entry) => entry.message === "Third order SMS history test")
    );

    const afterResponse = await fetch(`${started.baseUrl}${returnTo}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const afterBody = await afterResponse.text();
    assert.equal(afterResponse.status, 200);
    assert.match(afterBody, /История SMS/);
    assert.match(afterBody, /Order SMS history test/);
    assert.match(afterBody, /admin-ghl-sms-history-list is-scrollable/);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequest = captureLines.find((record) => {
      if (!String(record.url).includes("/conversations/messages")) return false;
      try {
        return JSON.parse(record.body).message === "Order SMS history test";
      } catch {
        return false;
      }
    });
    assert.ok(smsRequest);
    assert.equal(smsRequest.method, "POST");

    const smsPayload = JSON.parse(smsRequest.body);
    assert.deepEqual(smsPayload, {
      type: "SMS",
      contactId: "contact-sms-order-123",
      message: "Order SMS history test",
      status: "pending",
      toNumber: "+14244199102",
    });
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("loads inbound SMS replies into the order dialog history", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-sms-order-321",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-sms-order-321",
        conversationId: "conversation-sms-order-321",
      },
    },
    {
      method: "GET",
      match: "/conversations/search",
      status: 200,
      body: {
        conversations: [
          {
            id: "conversation-sms-order-321",
          },
        ],
      },
    },
    {
      method: "GET",
      match: "/conversations/conversation-sms-order-321/messages",
      status: 200,
      body: {
        messages: [
          {
            id: "message-sms-order-321",
            type: "TYPE_SMS",
            direction: "outbound",
            body: "Please confirm your order.",
            dateAdded: "2026-04-18T14:00:00.000Z",
            conversationId: "conversation-sms-order-321",
            phone: "+14244199102",
          },
          {
            id: "message-sms-order-reply-321",
            type: "TYPE_SMS",
            direction: "inbound",
            body: "Yes, confirmed.",
            dateAdded: "2026-04-18T14:05:00.000Z",
            conversationId: "conversation-sms-order-321",
            phone: "+14244199102",
          },
        ],
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "sms-order-reply-request-1",
      fullName: "Order SMS Reply Lead",
      phone: "(424) 419-9102",
      email: "sms.reply@example.com",
      serviceType: "regular",
      selectedDate: "2026-04-20",
      selectedTime: "10:30",
      fullAddress: "901 Follow Up Drive, Bolingbrook, IL 60440",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "sms-order-reply-request-1"
    );
    const returnTo = `/admin/orders?order=${encodeURIComponent(entryId)}`;

    const sendSmsResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-order-sms",
        entryId,
        message: "Please confirm your order.",
        returnTo,
      }),
    });

    assert.equal(sendSmsResponse.status, 200);

    const historyResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "load-order-sms-history",
        entryId,
        returnTo,
      }),
    });

    assert.equal(historyResponse.status, 200);
    const historyPayload = await historyResponse.json();
    assert.equal(historyPayload.ok, true);
    assert.equal(historyPayload.sms.historyCountLabel, "2 SMS");
    assert.equal(historyPayload.sms.history.length, 2);
    assert.equal(historyPayload.sms.history[0].direction, "inbound");
    assert.equal(historyPayload.sms.history[0].directionLabel, "Входящее");
    assert.equal(historyPayload.sms.history[0].sourceLabel, "Клиент");
    assert.equal(historyPayload.sms.history[0].message, "Yes, confirmed.");
    assert.equal(historyPayload.sms.history[1].message, "Please confirm your order.");
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("records inbound SMS replies from the GHL webhook into the order dialog history", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_LOCATION_ID: "location-123",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const createOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-manual-order",
        returnTo: "/admin/orders",
        customerName: "Webhook SMS Lead",
        customerPhone: "4244199102",
        customerEmail: "sms.webhook@example.com",
        serviceType: "regular",
        selectedDate: "2026-04-20",
        selectedTime: "10:30",
        totalPrice: "155.00",
        fullAddress: "901 Follow Up Drive, Bolingbrook, IL 60440",
      }),
    });

    assert.equal(createOrderResponse.status, 303);
    const entryId = new URL(createOrderResponse.headers.get("location") || "", started.baseUrl).searchParams.get("order");
    assert.ok(entryId);
    const returnTo = `/admin/orders?order=${encodeURIComponent(entryId)}`;

    const webhookResponse = await fetch(`${started.baseUrl}/api/ghl/inbound-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventType: "InboundMessage",
        messageType: "SMS",
        direction: "inbound",
        from: "+1 (424) 419-9102",
        body: "Webhook says hello.",
        dateAdded: "2026-04-18T15:05:00.000Z",
        conversationId: "conversation-webhook-order-1",
        messageId: "message-webhook-order-1",
        contactId: "contact-webhook-order-1",
        locationId: "location-123",
      }),
    });

    assert.equal(webhookResponse.status, 200);
    const webhookPayload = await webhookResponse.json();
    assert.equal(webhookPayload.received, true);
    assert.equal(webhookPayload.matched, true);
    assert.equal(webhookPayload.target, "entry");
    assert.equal(webhookPayload.targetId, entryId);

    const historyResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "load-order-sms-history",
        entryId,
        returnTo,
      }),
    });

    assert.equal(historyResponse.status, 200);
    const historyPayload = await historyResponse.json();
    assert.equal(historyPayload.ok, true);
    assert.equal(historyPayload.sms.historyCountLabel, "1 SMS");
    assert.equal(historyPayload.sms.history.length, 1);
    assert.equal(historyPayload.sms.history[0].direction, "inbound");
    assert.equal(historyPayload.sms.history[0].directionLabel, "Входящее");
    assert.equal(historyPayload.sms.history[0].source, "client");
    assert.equal(historyPayload.sms.history[0].sourceLabel, "Клиент");
    assert.equal(historyPayload.sms.history[0].message, "Webhook says hello.");
  } finally {
    await stopServer(started.child);
  }
});

test("keeps storage diagnostics hidden on admin orders when Supabase falls back to memory", async () => {
  const fetchStub = createFetchStub([
    {
      method: "GET",
      match: "/rest/v1/admin_staff_assignments",
      status: 200,
      body: [],
    },
    {
      method: "GET",
      match: "/rest/v1/admin_staff",
      status: 200,
      body: [],
    },
    {
      method: "GET",
      match: "/rest/v1/quote_ops_entries",
      status: 500,
      body: {
        message: "relation public.quote_ops_entries does not exist",
      },
    },
    {
      method: "POST",
      match: "/rest/v1/quote_ops_entries",
      status: 500,
      body: {
        message: "relation public.quote_ops_entries does not exist",
      },
    },
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-storage-warning-123",
        },
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
    SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "storage-warning-request-1",
      fullName: "Storage Warning",
      phone: "312-555-0199",
      email: "storage-warning@example.com",
      serviceType: "regular",
      selectedDate: "2026-03-25",
      selectedTime: "15:00",
      fullAddress: "910 Warning St, Aurora, IL 60505",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "storage-warning-request-1");

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Storage Warning/);
    assert.doesNotMatch(ordersBody, /Persistent storage active/i);
    assert.doesNotMatch(ordersBody, /локальный fallback/i);
    assert.doesNotMatch(ordersBody, /quote_ops_entries/i);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("allows managers to create manual orders from the orders page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-manager-manual-order-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Marta Greene",
        role: "manager",
        status: "active",
        staffStatus: "active",
        email: "marta.manager@example.com",
        phone: "3125550198",
        address: "500 Executive Dr, Naperville, IL 60563",
        notes: "Can coordinate the full team",
        password: "ManagerPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    assert.match(createUserResponse.headers.get("location") || "", /notice=user-created/);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "marta.manager@example.com",
        password: "ManagerPass123!",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/admin");

    const userSessionCookieValue = getCookieValue(getSetCookies(accountLoginResponse), "shynli_user_session");
    assert.ok(userSessionCookieValue);

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Добавить заказ/);
    assert.match(ordersBody, /Добавить заказ вручную/);
    assert.match(ordersBody, /create-manual-order/);

    const createOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-manual-order",
        returnTo: "/admin/orders",
        customerName: "Manager Created Customer",
        customerPhone: "3125556611",
        customerEmail: "manager.created@example.com",
        serviceType: "standard",
        selectedDate: "2026-04-24",
        selectedTime: "09:30",
        frequency: "",
        totalPrice: "180.00",
        fullAddress: "901 Aurora Avenue, Naperville, IL 60540",
      }),
    });

    assert.equal(createOrderResponse.status, 303);
    const redirectLocation = createOrderResponse.headers.get("location") || "";
    assert.match(redirectLocation, /notice=manual-order-created/);
    const createdOrderId = new URL(redirectLocation, started.baseUrl).searchParams.get("order");
    assert.ok(createdOrderId);

    const createdOrderResponse = await fetch(`${started.baseUrl}${redirectLocation}`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const createdOrderBody = await createdOrderResponse.text();
    assert.equal(createdOrderResponse.status, 200);
    assert.match(createdOrderBody, /Заказ добавлен вручную/);
    assert.match(createdOrderBody, /Manager Created Customer/);
    assert.match(createdOrderBody, /901 Aurora Avenue, Naperville, IL 60540/);
    assert.match(createdOrderBody, /\$180\.00/);
    assert.match(createdOrderBody, new RegExp(`name="entryId" value="${escapeRegex(createdOrderId)}"`));
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("sends a review request email and SMS when an order moves to awaiting-review", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-review-request-"));
  const smtpServer = await createSmtpTestServer();
  const fetchStub = await createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "review-contact-1",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 201,
      body: {
        conversationId: "review-conversation-1",
        messageId: "review-message-1",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "review-order-1",
      fullName: "Review Customer",
      phone: "312-555-4455",
      email: "review.customer@example.com",
      serviceType: "regular",
      selectedDate: "2026-04-22",
      selectedTime: "11:00",
      fullAddress: "415 Review Avenue, Aurora, IL 60504",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "review-order-1"
    );

    const moveToAwaitingReviewResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: `/admin/orders?order=${encodeURIComponent(entryId)}`,
        orderStatus: "awaiting-review",
        paymentStatus: "paid",
        paymentMethod: "card",
        selectedDate: "2026-04-22",
        selectedTime: "11:00",
        frequency: "",
      }),
    });
    assert.equal(moveToAwaitingReviewResponse.status, 303);
    assert.match(moveToAwaitingReviewResponse.headers.get("location") || "", /notice=order-saved/);

    const deliveredEmails = smtpServer.messages.map((message) =>
      decodeQuotedPrintable(message.raw)
    );
    const reviewRequestEmails = deliveredEmails.filter((rawEmail) =>
      /Leave us a quick review/i.test(rawEmail) &&
      /https:\/\/maps\.app\.goo\.gl\/4u9s7onykNrJEEn99/.test(rawEmail)
    );
    assert.equal(reviewRequestEmails.length, 1);
    assert.match(reviewRequestEmails[0], /review.customer@example.com/i);
    assert.match(reviewRequestEmails[0], /https:\/\/maps\.app\.goo\.gl\/4u9s7onykNrJEEn99/);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const reviewSmsRequests = captureLines.filter((record) => {
      if (!String(record.url).includes("/conversations/messages")) return false;
      try {
        return /quick review/i.test(JSON.parse(record.body).message || "");
      } catch {
        return false;
      }
    });
    assert.equal(reviewSmsRequests.length, 1);
    const reviewSmsPayload = JSON.parse(reviewSmsRequests[0].body);
    assert.equal(reviewSmsPayload.contactId, "review-contact-1");
    assert.equal(reviewSmsPayload.toNumber, "+13125554455");
    assert.match(reviewSmsPayload.message, /maps\.app\.goo\.gl\/4u9s7onykNrJEEn99/);

    const repeatSaveResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: `/admin/orders?order=${encodeURIComponent(entryId)}`,
        orderStatus: "awaiting-review",
        paymentStatus: "paid",
        paymentMethod: "card",
        selectedDate: "2026-04-22",
        selectedTime: "11:00",
        frequency: "",
      }),
    });
    assert.equal(repeatSaveResponse.status, 303);

    const deliveredEmailsAfterRepeat = smtpServer.messages.map((message) =>
      decodeQuotedPrintable(message.raw)
    );
    const reviewRequestEmailsAfterRepeat = deliveredEmailsAfterRepeat.filter((rawEmail) =>
      /Leave us a quick review/i.test(rawEmail) &&
      /https:\/\/maps\.app\.goo\.gl\/4u9s7onykNrJEEn99/.test(rawEmail)
    );
    assert.equal(reviewRequestEmailsAfterRepeat.length, 1);

    const captureLinesAfterRepeat = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const reviewSmsRequestsAfterRepeat = captureLinesAfterRepeat.filter((record) => {
      if (!String(record.url).includes("/conversations/messages")) return false;
      try {
        return /quick review/i.test(JSON.parse(record.body).message || "");
      } catch {
        return false;
      }
    });
    assert.equal(reviewSmsRequestsAfterRepeat.length, 1);
  } finally {
    await stopServer(started.child);
    smtpServer.close();
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
