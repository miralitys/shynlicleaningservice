"use strict";

const {
  test,
  assert,
  loadAdminConfig,
  startServer,
  stopServer,
  createAdminSession,
} = require("./admin-route-helpers");

test("renders messages rows as clickable popup triggers without an action column", async () => {
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
        customerName: "Order Message Customer",
        customerPhone: "4244199102",
        customerEmail: "order.messages@example.com",
        serviceType: "regular",
        selectedDate: "2026-05-11",
        selectedTime: "10:30",
        serviceDurationHours: "2",
        serviceDurationMinutes: "0",
        totalPrice: "155.00",
        fullAddress: "901 Follow Up Drive, Bolingbrook, IL 60440",
      }),
    });
    assert.equal(createOrderResponse.status, 303);
    const orderEntryId = new URL(createOrderResponse.headers.get("location") || "", started.baseUrl).searchParams.get("order");
    assert.ok(orderEntryId);

    const orderWebhookResponse = await fetch(`${started.baseUrl}/api/ghl/inbound-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventType: "InboundMessage",
        messageType: "SMS",
        direction: "inbound",
        from: "+1 (424) 419-9102",
        body: "Reply from order workflow.",
        dateAdded: "2026-05-03T15:05:00.000Z",
        conversationId: "conversation-messages-order-1",
        messageId: "message-messages-order-1",
        contactId: "contact-messages-order-1",
        locationId: "location-123",
      }),
    });
    assert.equal(orderWebhookResponse.status, 200);

    const messagesResponse = await fetch(`${started.baseUrl}/admin/messages`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const messagesBody = await messagesResponse.text();

    assert.equal(messagesResponse.status, 200);
    assert.match(messagesBody, /Новые сообщения/);
    assert.match(messagesBody, /Все сообщения/);
    assert.doesNotMatch(messagesBody, />Открыть карточку</);
    assert.doesNotMatch(messagesBody, /<th>\s*Действие\s*<\/th>/);
    assert.match(messagesBody, /class="admin-message-row-new admin-table-row-clickable"/);
    assert.match(messagesBody, /data-admin-dialog-row="true"/);
    assert.match(messagesBody, /data-admin-dialog-focus="\.admin-ghl-sms-card"/);
    assert.match(messagesBody, new RegExp(`data-admin-message-entry-id="${orderEntryId}"`));
    assert.match(messagesBody, /data-admin-message-status="new"/);
    assert.match(messagesBody, /data-admin-message-list-kind="unread"/);
    assert.match(messagesBody, /data-admin-message-status-cell="true"/);
    assert.match(messagesBody, /data-admin-message-summary-unread="true">1</);
    assert.match(messagesBody, new RegExp(`data-admin-dialog-open="admin-order-detail-dialog-${orderEntryId}"`));
    assert.match(messagesBody, new RegExp(`id="admin-order-detail-dialog-${orderEntryId}"`));
    assert.match(messagesBody, /Reply from order workflow\./);
  } finally {
    await stopServer(started.child);
  }
});

test("marks a message as read via ajax when requested from the messages route", async () => {
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
        customerName: "Ajax Read Customer",
        customerPhone: "4244199102",
        customerEmail: "ajax.messages@example.com",
        serviceType: "regular",
        selectedDate: "2026-05-11",
        selectedTime: "10:30",
        serviceDurationHours: "2",
        serviceDurationMinutes: "0",
        totalPrice: "155.00",
        fullAddress: "901 Follow Up Drive, Bolingbrook, IL 60440",
      }),
    });
    assert.equal(createOrderResponse.status, 303);
    const orderEntryId = new URL(createOrderResponse.headers.get("location") || "", started.baseUrl).searchParams.get("order");
    assert.ok(orderEntryId);

    const orderWebhookResponse = await fetch(`${started.baseUrl}/api/ghl/inbound-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventType: "InboundMessage",
        messageType: "SMS",
        direction: "inbound",
        from: "+1 (424) 419-9102",
        body: "Unread message to mark as read.",
        dateAdded: "2026-05-03T15:05:00.000Z",
        conversationId: "conversation-messages-order-ajax",
        messageId: "message-messages-order-ajax",
        contactId: "contact-messages-order-ajax",
        locationId: "location-123",
      }),
    });
    assert.equal(orderWebhookResponse.status, 200);

    const markReadResponse = await fetch(`${started.baseUrl}/admin/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "mark-message-read",
        entryId: orderEntryId,
        messageKey: `${orderEntryId}:message:message-messages-order-ajax`,
      }),
    });
    assert.equal(markReadResponse.status, 200);
    const payload = await markReadResponse.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.changed, true);
    assert.equal(payload.status, "read");

    const messagesResponse = await fetch(`${started.baseUrl}/admin/messages`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const messagesBody = await messagesResponse.text();
    assert.equal(messagesResponse.status, 200);
    assert.doesNotMatch(messagesBody, new RegExp(`data-admin-message-entry-id="${orderEntryId}"[^>]*data-admin-message-key="${orderEntryId}:message:message-messages-order-ajax"[^>]*data-admin-message-status="new"`));
    assert.match(messagesBody, new RegExp(`data-admin-message-entry-id="${orderEntryId}"[^>]*data-admin-message-key="${orderEntryId}:message:message-messages-order-ajax"[^>]*data-admin-message-status="read"`));
    assert.match(messagesBody, /data-admin-message-summary-unread="true">0</);
    assert.match(messagesBody, /Прочитано/);
  } finally {
    await stopServer(started.child);
  }
});
