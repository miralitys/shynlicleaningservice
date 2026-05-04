"use strict";

const {
  test,
  assert,
  loadAdminConfig,
  startServer,
  stopServer,
  createAdminSession,
} = require("./admin-route-helpers");

test("renders messages as dialog rows with unread counts", async () => {
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

    const secondCreateOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
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
        customerPhone: "7808858185",
        customerEmail: "",
        serviceType: "regular",
        selectedDate: "2026-05-12",
        selectedTime: "11:30",
        serviceDurationHours: "2",
        serviceDurationMinutes: "0",
        totalPrice: "165.00",
        fullAddress: "902 Follow Up Drive, Bolingbrook, IL 60440",
      }),
    });
    assert.equal(secondCreateOrderResponse.status, 303);
    const secondOrderEntryId = new URL(secondCreateOrderResponse.headers.get("location") || "", started.baseUrl).searchParams.get("order");
    assert.ok(secondOrderEntryId);

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

    const secondOrderWebhookResponse = await fetch(`${started.baseUrl}/api/ghl/inbound-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventType: "InboundMessage",
        messageType: "SMS",
        direction: "inbound",
        from: "+1 (424) 419-9102",
        body: "Second reply from the same client.",
        dateAdded: "2026-05-03T15:08:00.000Z",
        conversationId: "conversation-messages-order-1",
        messageId: "message-messages-order-2",
        contactId: "contact-messages-order-1",
        locationId: "location-123",
      }),
    });
    assert.equal(secondOrderWebhookResponse.status, 200);

    const sameNameDifferentPhoneWebhookResponse = await fetch(`${started.baseUrl}/api/ghl/inbound-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventType: "InboundMessage",
        messageType: "SMS",
        direction: "inbound",
        from: "+1 (780) 885-8185",
        body: "Message from another phone, same client name.",
        dateAdded: "2026-05-03T15:11:00.000Z",
        conversationId: "conversation-messages-order-different-phone",
        messageId: "message-messages-order-3",
        contactId: "",
        locationId: "location-123",
      }),
    });
    assert.equal(sameNameDifferentPhoneWebhookResponse.status, 200);

    const messagesResponse = await fetch(`${started.baseUrl}/admin/messages`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const messagesBody = await messagesResponse.text();

    assert.equal(messagesResponse.status, 200);
    assert.match(messagesBody, /Диалоги с новыми сообщениями/);
    assert.match(messagesBody, /Все диалоги/);
    assert.doesNotMatch(messagesBody, />Открыть карточку</);
    assert.doesNotMatch(messagesBody, /<th>\s*Действие\s*<\/th>/);
    assert.match(messagesBody, /class="admin-message-row-new admin-table-row-clickable"/);
    assert.match(messagesBody, /data-admin-dialog-row="true"/);
    assert.match(messagesBody, /data-admin-dialog-focus="\.admin-ghl-sms-card"/);
    assert.match(messagesBody, /data-admin-message-dialog-key="name:order message customer"/);
    assert.match(messagesBody, new RegExp(`data-admin-message-entry-id="(${orderEntryId}|${secondOrderEntryId})"`));
    assert.match(messagesBody, /data-admin-message-unread-count="3"/);
    assert.match(messagesBody, /data-admin-message-refs="[^"]*message-messages-order-1/);
    assert.match(messagesBody, /data-admin-message-refs="[^"]*message-messages-order-2/);
    assert.match(messagesBody, /data-admin-message-refs="[^"]*message-messages-order-3/);
    assert.match(messagesBody, /data-admin-message-status="new"/);
    assert.match(messagesBody, /data-admin-message-list-kind="unread"/);
    assert.match(messagesBody, /data-admin-message-status-cell="true"/);
    assert.match(messagesBody, /data-admin-message-summary-unread="true">3</);
    assert.match(messagesBody, />3 новых</);
    assert.match(messagesBody, /data-admin-dialog-open="admin-order-detail-dialog-/);
    assert.match(messagesBody, /id="admin-order-detail-dialog-/);
    assert.match(messagesBody, /Message from another phone, same client name\./);
    assert.equal((messagesBody.match(/data-admin-message-dialog-key="name:order message customer"/g) || []).length, 2);
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

    const secondOrderWebhookResponse = await fetch(`${started.baseUrl}/api/ghl/inbound-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventType: "InboundMessage",
        messageType: "SMS",
        direction: "inbound",
        from: "+1 (424) 419-9102",
        body: "Second unread message to mark as read.",
        dateAdded: "2026-05-03T15:06:00.000Z",
        conversationId: "conversation-messages-order-ajax",
        messageId: "message-messages-order-ajax-2",
        contactId: "contact-messages-order-ajax",
        locationId: "location-123",
      }),
    });
    assert.equal(secondOrderWebhookResponse.status, 200);

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
        messageRefs: JSON.stringify([
          {
            entryId: orderEntryId,
            messageKey: `${orderEntryId}:message:message-messages-order-ajax`,
          },
          {
            entryId: orderEntryId,
            messageKey: `${orderEntryId}:message:message-messages-order-ajax-2`,
          },
        ]),
      }),
    });
    assert.equal(markReadResponse.status, 200);
    const payload = await markReadResponse.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.changed, true);
    assert.equal(payload.changedCount, 2);
    assert.equal(payload.status, "read");

    const messagesResponse = await fetch(`${started.baseUrl}/admin/messages`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const messagesBody = await messagesResponse.text();
    assert.equal(messagesResponse.status, 200);
    assert.doesNotMatch(messagesBody, new RegExp(`data-admin-message-entry-id="${orderEntryId}"[^>]*data-admin-message-status="new"`));
    assert.match(messagesBody, new RegExp(`data-admin-message-entry-id="${orderEntryId}"[^>]*data-admin-message-status="read"`));
    assert.match(messagesBody, /data-admin-message-unread-count="0"/);
    assert.match(messagesBody, /data-admin-message-summary-unread="true">0</);
    assert.doesNotMatch(messagesBody, />0 новых</);
  } finally {
    await stopServer(started.child);
  }
});
