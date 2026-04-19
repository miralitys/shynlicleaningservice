"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { generateTotpCode, hashPassword, loadAdminConfig } = require("../lib/admin-auth");
const { createFetchStub, createSmtpTestServer, startServer, stopServer } = require("./server-test-helpers");

const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=";

function getSetCookies(response) {
  const header = response.headers.get("set-cookie") || "";
  return header
    .split(/,(?=[A-Za-z0-9_]+=)/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCookieValue(setCookies, name) {
  const target = setCookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!target) return "";
  return target.split(";")[0].slice(name.length + 1);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOrderFunnelLaneSlice(html, laneStatus, nextLaneStatus = "") {
  const source = String(html || "");
  const laneMarker = `admin-order-funnel-column-${laneStatus}`;
  const startIndex = source.indexOf(laneMarker);
  if (startIndex === -1) return "";
  const endIndex = nextLaneStatus ? source.indexOf(`admin-order-funnel-column-${nextLaneStatus}`, startIndex) : -1;
  return source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function normalizeEmailSource(value) {
  return String(value || "").replace(/=\r?\n/g, "");
}

function decodeQuotedPrintable(value) {
  return normalizeEmailSource(value).replace(/=([A-F0-9]{2})/gi, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
}

function getChicagoDateValue(offsetDays = 0) {
  const baseDate = new Date(Date.now() + Number(offsetDays || 0) * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(baseDate);
  const values = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
}

function getChicagoDateTimeLocalValue(offsetDays = 0, hour = 9, minute = 15) {
  return `${getChicagoDateValue(offsetDays)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getStaffAssignmentEntryIdByCustomerName(html, customerName) {
  const match = String(html || "").match(
    new RegExp(
      `<dialog class="admin-dialog admin-dialog-wide" id="admin-staff-assignment-dialog-[^"]+"[\\s\\S]*?<h2 class="admin-dialog-title"[^>]*>${escapeRegex(customerName)}<\\/h2>[\\s\\S]*?<input type="hidden" name="entryId" value="([^"]+)"`,
      "i"
    )
  );
  return match ? match[1] : "";
}

function getLeadTaskIdByEntryId(html, entryId) {
  const match = String(html || "").match(
    new RegExp(
      `name="entryId" value="${escapeRegex(entryId)}"[\\s\\S]*?name="taskId" value="([^"]+)"`,
      "i"
    )
  );
  return match ? match[1] : "";
}

test("formats admin timestamps in America/Chicago", () => {
  const domain = createAdminDomainHelpers();
  assert.equal(domain.formatAdminDateTime("2026-04-13T02:30:00.000Z"), "04/12/2026, 09:30 PM");
});

async function createAdminSession(baseUrl, config) {
  const loginResponse = await fetch(`${baseUrl}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: config.email,
      password: "1HKLOR1!",
    }),
  });

  assert.equal(loginResponse.status, 303);
  const loginCookies = getSetCookies(loginResponse);
  if ((loginResponse.headers.get("location") || "") === "/admin/2fa") {
    const challengeCookieValue = getCookieValue(loginCookies, "shynli_admin_challenge");
    assert.ok(challengeCookieValue);

    const twoFactorResponse = await fetch(`${baseUrl}/admin/2fa`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_challenge=${challengeCookieValue}`,
      },
      body: new URLSearchParams({
        code: generateTotpCode(config),
      }),
    });

    assert.equal(twoFactorResponse.status, 303);
    assert.equal(twoFactorResponse.headers.get("location"), "/admin");
    const twoFactorCookies = getSetCookies(twoFactorResponse);
    const sessionCookie = twoFactorCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
    assert.match(sessionCookie, /Path=\//);
    const sessionCookieValue = getCookieValue(twoFactorCookies, "shynli_admin_session");
    assert.ok(sessionCookieValue);
    return sessionCookieValue;
  }

  assert.equal(loginResponse.headers.get("location"), "/admin");
  const sessionCookie = loginCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
  assert.match(sessionCookie, /Path=\//);
  const sessionCookieValue = getCookieValue(loginCookies, "shynli_admin_session");
  assert.ok(sessionCookieValue);
  return sessionCookieValue;
}

function createStripeWebhookSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function submitQuote(baseUrl, options) {
  return fetch(`${baseUrl}/api/quote/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": options.requestId,
    },
    body: JSON.stringify({
      contact: {
        fullName: options.fullName,
        phone: options.phone,
        email: options.email,
      },
      quote: {
        serviceType: options.serviceType || "deep",
        rooms: options.rooms || 4,
        bathrooms: options.bathrooms || 2,
        squareMeters: options.squareMeters || 1600,
        frequency: options.frequency || "",
        selectedDate: options.selectedDate || "2026-03-22",
        selectedTime: options.selectedTime || "09:00",
        fullAddress: options.fullAddress,
        consent: true,
      },
    }),
  });
}

async function createOrderFromQuoteRequest(baseUrl, sessionCookieValue, query) {
  const entryId = await getQuoteOpsEntryId(baseUrl, sessionCookieValue, query);

  const createOrderResponse = await fetch(`${baseUrl}/admin/quote-ops`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `shynli_admin_session=${sessionCookieValue}`,
    },
    body: new URLSearchParams({
      action: "create-order-from-request",
      entryId,
      returnTo: "/admin/quote-ops",
    }),
  });

  assert.equal(createOrderResponse.status, 303);
  assert.match(createOrderResponse.headers.get("location") || "", /notice=order-created/);

  return entryId;
}

async function getQuoteOpsEntryId(baseUrl, sessionCookieValue, query) {
  const quoteOpsResponse = await fetch(`${baseUrl}/admin/quote-ops?q=${encodeURIComponent(query)}`, {
    headers: {
      cookie: `shynli_admin_session=${sessionCookieValue}`,
    },
  });
  const quoteOpsBody = await quoteOpsResponse.text();
  assert.equal(quoteOpsResponse.status, 200);

  const entryIdMatch = quoteOpsBody.match(/name="entryId" value="([^"]+)"/);
  assert.ok(entryIdMatch, `Expected quote ops entry for ${query}`);
  return entryIdMatch[1];
}

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

test("renders overview tables for unassigned clients and today's orders", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-overview-dashboard-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-overview-123",
        },
      },
    },
  ]);
  const todayDate = getChicagoDateValue();
  const futureDate = getChicagoDateValue(3);
  const overdueTaskAt = getChicagoDateTimeLocalValue(-1, 9, 15);
  const futureTaskAt = getChicagoDateTimeLocalValue(1, 10, 30);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    ADMIN_STAFF_STORE_PATH: path.join(tempDir, "admin-staff-store.json"),
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const todayQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-today-1",
      fullName: "Today Assigned",
      phone: "312-555-0201",
      email: "today.assigned@example.com",
      serviceType: "deep",
      selectedDate: todayDate,
      selectedTime: "09:00",
      fullAddress: "123 Today St, Naperville, IL 60540",
    });
    assert.equal(todayQuoteResponse.status, 201);

    const futureQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-future-1",
      fullName: "Future No Team",
      phone: "312-555-0202",
      email: "future.noteam@example.com",
      serviceType: "regular",
      selectedDate: futureDate,
      selectedTime: "11:30",
      fullAddress: "456 Future Ave, Aurora, IL 60506",
    });
    assert.equal(futureQuoteResponse.status, 201);

    const freshLeadResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-new-1",
      fullName: "Fresh Lead",
      phone: "312-555-0203",
      email: "fresh.lead@example.com",
      serviceType: "regular",
      selectedDate: futureDate,
      selectedTime: "14:00",
      fullAddress: "789 Fresh Blvd, Bolingbrook, IL 60440",
    });
    assert.equal(freshLeadResponse.status, 201);

    const overdueLeadResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-overdue-1",
      fullName: "Overdue Task Lead",
      phone: "312-555-0204",
      email: "overdue.task@example.com",
      serviceType: "deep",
      selectedDate: futureDate,
      selectedTime: "15:00",
      fullAddress: "160 Overdue Ct, Naperville, IL 60563",
    });
    assert.equal(overdueLeadResponse.status, 201);

    const futureLeadResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-future-task-1",
      fullName: "Future Task Lead",
      phone: "312-555-0205",
      email: "future.task@example.com",
      serviceType: "regular",
      selectedDate: futureDate,
      selectedTime: "16:30",
      fullAddress: "220 Future Task Ln, Plainfield, IL 60544",
    });
    assert.equal(futureLeadResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const overdueLeadEntryId = await getQuoteOpsEntryId(started.baseUrl, sessionCookieValue, "overview-overdue-1");
    const futureLeadEntryId = await getQuoteOpsEntryId(started.baseUrl, sessionCookieValue, "overview-future-task-1");

    const overdueTaskStatusResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-lead-status",
        entryId: overdueLeadEntryId,
        leadStatus: "discussion",
        discussionNextContactAt: overdueTaskAt,
        returnTo: "/admin/quote-ops?section=tasks",
      }),
    });
    assert.equal(overdueTaskStatusResponse.status, 200);

    const futureTaskStatusResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-lead-status",
        entryId: futureLeadEntryId,
        leadStatus: "discussion",
        discussionNextContactAt: futureTaskAt,
        returnTo: "/admin/quote-ops?section=tasks",
      }),
    });
    assert.equal(futureTaskStatusResponse.status, 200);

    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "overview-today-1");
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "overview-future-1");

    const todayOrdersResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=${encodeURIComponent("Today Assigned")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const todayOrdersBody = await todayOrdersResponse.text();
    assert.equal(todayOrdersResponse.status, 200);

    const entryIdMatch = todayOrdersBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);

    const saveOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId: entryIdMatch[1],
        returnTo: `/admin/orders?q=${encodeURIComponent("Today Assigned")}`,
        orderStatus: "scheduled",
        assignedStaff: "Anna Petrova",
        paymentStatus: "unpaid",
        paymentMethod: "cash",
        selectedDate: todayDate,
        selectedTime: "09:00",
        frequency: "",
      }),
    });
    assert.equal(saveOrderResponse.status, 303);
    assert.match(saveOrderResponse.headers.get("location") || "", /notice=order-saved/);

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardBody, /Новые заявки/i);
    assert.match(dashboardBody, /Таски на контроле/i);
    assert.match(dashboardBody, /Заказы без команды/i);
    assert.match(dashboardBody, /Заказы на сегодня/i);
    assert.ok(dashboardBody.indexOf("Назначена дата") < dashboardBody.indexOf("Новые заявки"));
    assert.ok(dashboardBody.indexOf("Новые заявки") < dashboardBody.indexOf("Таски на контроле"));
    assert.ok(dashboardBody.indexOf("Таски на контроле") < dashboardBody.indexOf("Заказы без команды"));
    assert.ok(dashboardBody.indexOf("Заказы без команды") < dashboardBody.indexOf("Заказы на сегодня"));

    const newRequestsSection = dashboardBody.match(
      /data-admin-dashboard-new-requests="true"[\s\S]*?<\/table>/
    )?.[0];
    const unassignedSection = dashboardBody.match(
      /data-admin-dashboard-unassigned-orders="true"[\s\S]*?<\/table>/
    )?.[0];
    const todaySection = dashboardBody.match(
      /data-admin-dashboard-today-orders="true"[\s\S]*?<\/table>/
    )?.[0];

    assert.ok(newRequestsSection);
    assert.match(dashboardBody, /data-admin-dashboard-tasks="true"/);
    assert.ok(unassignedSection);
    assert.ok(todaySection);
    assert.match(newRequestsSection, /Fresh Lead/);
    assert.match(newRequestsSection, /data-admin-dialog-row="true"/);
    assert.match(newRequestsSection, /<span class="admin-table-link">Fresh Lead<\/span>/);
    assert.doesNotMatch(newRequestsSection, /<a class="admin-table-link"/);
    assert.match(newRequestsSection, /overview-new-1/);
    assert.doesNotMatch(newRequestsSection, /Today Assigned/);
    assert.doesNotMatch(newRequestsSection, /Future No Team/);
    assert.match(dashboardBody, /Overdue Task Lead/);
    assert.match(dashboardBody, /Fresh Lead/);
    assert.doesNotMatch(dashboardBody, /Просроченные/);
    assert.doesNotMatch(dashboardBody, /На сегодня/);
    assert.doesNotMatch(dashboardBody, /Просрочено/);
    assert.match(dashboardBody, /admin-dialog admin-dialog-wide admin-dialog-orders" id="admin-quote-task-result-dialog-/);
    assert.doesNotMatch(dashboardBody, /data-admin-dashboard-tasks="true"[\s\S]*Future Task Lead/);
    assert.match(unassignedSection, /data-admin-dialog-row="true"/);
    assert.match(unassignedSection, /<span class="admin-table-link">Future No Team<\/span>/);
    assert.match(dashboardBody, /id="admin-order-detail-dialog-/);
    assert.match(dashboardBody, /\.admin-quote-entry-detail-grid\s*\{/);
    assert.match(dashboardBody, /\.admin-quote-task-dialog-head\s*\{/);
    assert.match(unassignedSection, /Future No Team/);
    assert.doesNotMatch(unassignedSection, /Today Assigned/);
    assert.match(unassignedSection, /Команда не назначена/);
    assert.match(todaySection, /data-admin-dialog-row="true"/);
    assert.match(todaySection, /<span class="admin-table-link">Today Assigned<\/span>/);
    assert.match(dashboardBody, /id="admin-order-detail-dialog-/);
    assert.match(todaySection, /Today Assigned/);
    assert.match(todaySection, /Anna Petrova/);
    assert.doesNotMatch(todaySection, /Future No Team/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("renders checklist templates in settings and persists checklist updates", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-settings-route-"));
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_SETTINGS_STORE_PATH: path.join(tempDir, "admin-settings-store.json"),
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=checklists`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Чек-листы/i);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, /Шаблоны чек-листов/i);
    assert.match(settingsBody, /admin-settings-checklists-table/);
    assert.match(settingsBody, /admin-settings-section-stack/);
    assert.match(settingsBody, /data-admin-dialog-row="true"/);
    assert.match(settingsBody, /Редактировать/i);
    assert.match(settingsBody, /aria-label="Редактировать чек-лист"/i);
    assert.match(settingsBody, /class="admin-icon-button admin-edit-button"/);
    assert.match(settingsBody, /Регулярная уборка/i);
    assert.match(settingsBody, /Генеральная уборка/i);
    assert.match(settingsBody, /Уборка перед переездом/i);
    assert.doesNotMatch(settingsBody, /Сохранить отметки/i);
    assert.doesNotMatch(settingsBody, /<th>Открыть<\/th>/i);
    assert.doesNotMatch(settingsBody, /Все типы уборки в одном месте\./i);
    assert.doesNotMatch(settingsBody, /Уже выполненные пункты\./i);

    const itemIdMatches = Array.from(settingsBody.matchAll(/name="itemId" value="([^"]*)"/g));
    assert.ok(itemIdMatches.length >= 2);
    const firstItemId = itemIdMatches[0][1];
    const secondItemId = itemIdMatches[1][1];
    assert.ok(firstItemId);
    assert.ok(secondItemId);

    const renamedLabel = "Проверить выключатели и зеркала";
    const customLabel = "Осмотреть входную дверь";
    const removedLabel = "Пропылесосить полы и ковры";

    const saveParams = new URLSearchParams();
    saveParams.append("action", "save_checklist_template");
    saveParams.append("serviceType", "regular");
    saveParams.append("itemId", firstItemId);
    saveParams.append("itemLabel", renamedLabel);
    saveParams.append("itemId", "");
    saveParams.append("itemLabel", customLabel);

    const saveResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveParams,
    });
    assert.equal(saveResponse.status, 303);
    const saveLocation = saveResponse.headers.get("location") || "";
    assert.match(saveLocation, /notice=checklist-updated/);

    const savedResponse = await fetch(`${started.baseUrl}${saveLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const savedBody = await savedResponse.text();
    assert.equal(savedResponse.status, 200);
    assert.match(savedBody, /Шаблон чек-листа обновлён/i);
    assert.match(savedBody, new RegExp(renamedLabel, "i"));
    assert.match(savedBody, new RegExp(customLabel, "i"));
    assert.doesNotMatch(savedBody, new RegExp(removedLabel, "i"));
    assert.doesNotMatch(savedBody, new RegExp(secondItemId, "i"));
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("shows recent quote submissions in admin quote ops and retries CRM sync", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-order-media-admin-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-ops-123",
        },
      },
    },
    {
      method: "PUT",
      match: "/contacts/contact-ops-123",
      status: 200,
      body: {
        contact: {
          id: "contact-ops-123",
        },
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_ORDER_MEDIA_STORAGE_DIR: path.join(tempDir, "order-media"),
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
    const quoteResponse = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "ops-request-1",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "jane@example.com",
        },
        quote: {
          serviceType: "regular",
          frequency: "weekly",
          rooms: 4,
          bathrooms: 2,
          squareMeters: 1600,
          hasPets: "cat",
          basementCleaning: "yes",
          services: ["ovenCleaning", "insideCabinets"],
          quantityServices: {
            interiorWindowsCleaning: 3,
            blindsCleaning: 2,
            bedLinenChange: 1,
          },
          additionalDetails: "Please call on arrival\nGate code 2040",
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          formattedDateTime: "March 22, 2026 at 09:00",
          address: "123 Main St",
          addressLine2: "Apt 4B",
          city: "Romeoville",
          state: "IL",
          zipCode: "60446",
          fullAddress: "123 Main St, Romeoville, IL 60446",
          consent: true,
        },
      }),
    });

    assert.equal(quoteResponse.status, 201);

    const loginResponse = await fetch(`${started.baseUrl}/admin/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: config.email,
        password: "1HKLOR1!",
      }),
    });

    const sessionCookieValue = getCookieValue(getSetCookies(loginResponse), "shynli_admin_session");
    assert.ok(sessionCookieValue);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "ops-request-1");

    for (const [index, name] of ["Olga Martinez", "Anna Petrova", "Diana Brooks"].entries()) {
      const createStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
        body: new URLSearchParams({
          action: "create-staff",
          name,
          role: "cleaner",
          phone: `31255501${String(10 + index).padStart(2, "0")}`,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          address: `${100 + index} Main St, Naperville, IL 60540`,
          compensationValue: "180",
          compensationType: "fixed",
          status: "active",
          notes: "Orders team test",
        }),
      });
      assert.equal(createStaffResponse.status, 303);
      assert.match(createStaffResponse.headers.get("location") || "", /notice=staff-created/);
    }

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Jane Doe/);
    assert.match(ordersBody, /Weekly/);
    assert.match(ordersBody, /Запланировано/);
    assert.match(ordersBody, /Инвойс отправлен/);
    assert.match(ordersBody, /Оплачено/);
    assert.match(ordersBody, /Ждем отзыв/);
    assert.match(ordersBody, /admin-compact-summary-strip/);
    assert.match(ordersBody, /Воронка заказов/);
    assert.match(ordersBody, /class="admin-order-funnel-board"/);
    assert.match(ordersBody, /\.admin-order-funnel-board\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;/);
    assert.match(ordersBody, /admin-order-funnel-column-policy/);
    assert.match(ordersBody, /admin-order-funnel-column-scheduled/);
    assert.match(ordersBody, /admin-order-funnel-column-invoice-sent/);
    assert.match(ordersBody, /admin-order-funnel-column-paid/);
    assert.match(ordersBody, /admin-order-funnel-column-awaiting-review/);
    assert.match(ordersBody, /data-order-funnel-card="true"/);
    assert.match(ordersBody, /data-order-funnel-status="/);
    assert.match(ordersBody, /data-order-dropzone="policy"/);
    assert.match(ordersBody, /data-order-dropzone="scheduled"/);
    assert.match(ordersBody, /data-order-funnel-stage-form="true"/);
    assert.match(ordersBody, /X-SHYNLI-ADMIN-AJAX/);
    assert.match(ordersBody, /Ближайшие выезды/);
    assert.match(ordersBody, /admin-orders-filter-inline-panel/);
    assert.match(ordersBody, /data-admin-auto-submit="true"/);
    assert.match(ordersBody, /data-admin-auto-submit-delay="600"/);
    assert.match(ordersBody, /data-admin-auto-submit-min-length="2"/);
    assert.match(ordersBody, /data-admin-auto-submit-restore-focus="true"/);
    assert.match(ordersBody, /data-admin-auto-submit-scroll-target="#admin-orders-workspace"/);
    assert.match(ordersBody, /data-admin-dialog-row="true"/);
    assert.match(ordersBody, /class="admin-table-row-clickable"/);
    assert.match(ordersBody, /\.admin-table-wrap\s*\{[\s\S]*overflow-x: auto;[\s\S]*overflow-y: hidden;/);
    assert.match(ordersBody, /\.admin-table\s*\{[\s\S]*width: max-content;[\s\S]*table-layout: auto;/);
    assert.match(ordersBody, /\.admin-table:not\(\.admin-team-calendar-table\) th,\s*\.admin-table:not\(\.admin-team-calendar-table\) td\s*\{[\s\S]*white-space: nowrap;/);
    assert.match(ordersBody, /\.admin-orders-table-wrap-capped\s*\{[\s\S]*max-height:\s*[^;]+;[\s\S]*overflow-y:\s*auto;/);
    assert.doesNotMatch(ordersBody, /admin-kicker">Заказы</);
    assert.doesNotMatch(ordersBody, /Найдено \d+ из \d+ заказов/);
    assert.doesNotMatch(ordersBody, /Показан общий рабочий список/);
    assert.match(ordersBody, /Поля из формы клиента/);
    assert.match(ordersBody, /admin-delete-button/);
    assert.match(ordersBody, /Inside Cabinets Cleaning/);
    assert.match(ordersBody, /Interior Windows Cleaning/);
    assert.match(ordersBody, /Apt 4B/);
    assert.match(ordersBody, /Romeoville/);
    assert.match(ordersBody, /Питомцы[\s\S]*Кошка/);
    assert.match(ordersBody, /03\/22\/2026, 09:00 AM/);
    assert.match(ordersBody, /Please call on arrival/);
    assert.match(ordersBody, /Gate code 2040/);
    assert.match(ordersBody, /Команда не назначена/);
    assert.match(ordersBody, /Отчёт клинера/);
    assert.match(ordersBody, /Фото до/);
    assert.match(ordersBody, /Фото после/);
    assert.match(ordersBody, /Комментарий клинера/);
    assert.match(ordersBody, /name="paymentStatus"/);
    assert.match(ordersBody, /name="paymentMethod"/);
    assert.doesNotMatch(ordersBody, /Команда назначена/);
    assert.doesNotMatch(ordersBody, /CRM без ошибок/);
    assert.doesNotMatch(ordersBody, /Успешно/);
    assert.doesNotMatch(ordersBody, /Удаление убирает запись из рабочих разделов админки/);

    const entryIdMatch = ordersBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const findStaffIdByName = (name) =>
      ((staffStorePayload.staff || []).find((record) => record && record.name === name) || {}).id || "";
    const olgaId = findStaffIdByName("Olga Martinez");
    const annaId = findStaffIdByName("Anna Petrova");
    const dianaId = findStaffIdByName("Diana Brooks");
    assert.ok(olgaId);
    assert.ok(annaId);
    assert.ok(dianaId);

    const assignInitialTeamResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", entryId],
        ["staffIds", olgaId],
        ["status", "confirmed"],
      ]),
    });
    assert.equal(assignInitialTeamResponse.status, 303);
    assert.match(assignInitialTeamResponse.headers.get("location") || "", /notice=assignment-saved/);

    const focusedOrderResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=ops-request-1&order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const focusedOrderBody = await focusedOrderResponse.text();
    assert.equal(focusedOrderResponse.status, 200);
    assert.match(focusedOrderBody, /data-admin-dialog-autopen="true"/);
    assert.match(focusedOrderBody, /data-admin-dialog-return-url="\/admin\/orders\?q=ops-request-1"/);
    assert.match(focusedOrderBody, /class="admin-dialog-head admin-dialog-hero"/);
    assert.match(focusedOrderBody, /class="admin-dialog-hero-title-row"/);
    assert.match(focusedOrderBody, /class="admin-client-summary-panel admin-order-summary-panel"/);
    assert.match(focusedOrderBody, /class="admin-inline-badge-row admin-order-summary-strip"/);
    assert.match(focusedOrderBody, /data-admin-picker-trigger="date"/);
    assert.match(focusedOrderBody, /data-admin-picker-trigger="time"/);
    assert.match(focusedOrderBody, /data-admin-time-panel/);
    assert.match(focusedOrderBody, /<option value="AM">AM<\/option>/);
    assert.match(focusedOrderBody, /<option value="PM">PM<\/option>/);
    assert.match(
      focusedOrderBody,
      /<label class="admin-label admin-order-control-field">\s*Повторяемость[\s\S]*?<select class="admin-input" name="frequency">/
    );
    assert.match(focusedOrderBody, /type="date"/);
    assert.match(focusedOrderBody, /type="time"/);
    assert.match(focusedOrderBody, /name="paymentStatus"/);
    assert.match(focusedOrderBody, /<option value="unpaid" selected>Unpaid/);
    assert.match(focusedOrderBody, /name="paymentMethod"/);
    assert.match(focusedOrderBody, /<option value="" selected>Not set/);
    assert.match(focusedOrderBody, /data-admin-order-amount-open="admin-order-detail-dialog-[^"]+-amount-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-amount-cancel="admin-order-detail-dialog-[^"]+-amount-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-amount-cancel="admin-order-detail-dialog-[^"]+-amount-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-amount-action-for="admin-order-detail-dialog-[^"]+-amount-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /\[data-admin-order-amount-editor\]\[hidden\],[\s\S]*\[data-admin-order-amount-action-for\]\[hidden\]/);
    assert.match(focusedOrderBody, /data-admin-order-payment-open="admin-order-detail-dialog-[^"]+-payment-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-payment-cancel="admin-order-detail-dialog-[^"]+-payment-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-payment-cancel="admin-order-detail-dialog-[^"]+-payment-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-payment-action-for="admin-order-detail-dialog-[^"]+-payment-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-team-open="admin-order-detail-dialog-[^"]+-team-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-team-cancel="admin-order-detail-dialog-[^"]+-team-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-team-cancel="admin-order-detail-dialog-[^"]+-team-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-team-action-for="admin-order-detail-dialog-[^"]+-team-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /name="totalPrice"/);
    assert.match(focusedOrderBody, /name="totalPrice"[\s\S]*value="[0-9]+\.[0-9]{2}"/);
    assert.match(
      focusedOrderBody,
      new RegExp(
        `name="returnTo" value="/admin/orders\\?q=ops-request-1&amp;order=${escapeRegex(entryId)}"`
      )
    );
    assert.match(focusedOrderBody, /data-admin-order-multiselect="true"/);
    assert.match(focusedOrderBody, /\.admin-order-multiselect-panel\s*\{[\s\S]*position: absolute;[\s\S]*z-index: 49;[\s\S]*overflow-y: auto;/);
    assert.doesNotMatch(
      focusedOrderBody,
      /class="admin-inline-badge-row admin-order-summary-flags"/
    );
    assert.doesNotMatch(focusedOrderBody, /Заказ выглядит готовым к работе/);
    assert.doesNotMatch(focusedOrderBody, /admin-order-brief-fact-label">Дата</);
    assert.doesNotMatch(focusedOrderBody, /admin-order-brief-fact-label">Время</);
    assert.doesNotMatch(focusedOrderBody, /Сумма из quote/);
    assert.doesNotMatch(focusedOrderBody, /Текущая сумма заказа/);
    assert.match(focusedOrderBody, /Olga Martinez/);
    assert.match(focusedOrderBody, /type="checkbox" name="assignedStaff" value="Olga Martinez" checked/);
    assert.match(focusedOrderBody, /data-admin-order-completion-panel="true"/);
    assert.match(focusedOrderBody, /data-admin-order-cleaner-comment-panel="true"/);
    assert.match(focusedOrderBody, /data-admin-order-cleaner-comment-submit/);

    const saveTeamForm = new URLSearchParams();
    saveTeamForm.set("entryId", entryId);
    saveTeamForm.set("returnTo", `/admin/orders?q=ops-request-1&order=${entryId}`);
    saveTeamForm.append("assignedStaff", "Anna Petrova");
    saveTeamForm.append("assignedStaff", "Diana Brooks");

    const saveTeamResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveTeamForm,
    });
    assert.equal(saveTeamResponse.status, 303);
    assert.match(
      saveTeamResponse.headers.get("location") || "",
      new RegExp(`(?=.*notice=order-saved)(?=.*order=${escapeRegex(entryId)})`)
    );

    const teamLocation = saveTeamResponse.headers.get("location");
    assert.ok(teamLocation);
    const teamUpdatedResponse = await fetch(`${started.baseUrl}${teamLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const teamUpdatedBody = await teamUpdatedResponse.text();
    assert.equal(teamUpdatedResponse.status, 200);
    assert.match(teamUpdatedBody, /data-admin-dialog-autopen="true"/);
    assert.match(teamUpdatedBody, /2 сотрудника/);
    assert.match(teamUpdatedBody, /type="checkbox" name="assignedStaff" value="Anna Petrova" checked/);
    assert.match(teamUpdatedBody, /type="checkbox" name="assignedStaff" value="Diana Brooks" checked/);
    assert.match(
      teamUpdatedBody,
      /<button[^>]*data-admin-order-team-edit-trigger="admin-order-detail-dialog-[^"]+-team-edit-panel"[^>]*>/
    );
    assert.match(
      teamUpdatedBody,
      /<form[^>]*data-admin-order-team-editor="admin-order-detail-dialog-[^"]+-team-edit-panel"[^>]*hidden/
    );
    assert.match(
      teamUpdatedBody,
      /<button[^>]*aria-label="Сохранить команду"[^>]*hidden/
    );
    assert.match(
      teamUpdatedBody,
      /<button[^>]*aria-label="Отменить редактирование команды"[^>]*hidden/
    );

    const updatedStaffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const savedAssignment = (updatedStaffStorePayload.assignments || []).find(
      (record) => record && record.entryId === entryId
    );
    assert.ok(savedAssignment);
    assert.deepEqual(savedAssignment.staffIds, [annaId, dianaId]);

    const saveAmountForm = new URLSearchParams();
    saveAmountForm.set("entryId", entryId);
    saveAmountForm.set("returnTo", `/admin/orders?q=ops-request-1&order=${entryId}`);
    saveAmountForm.set("totalPrice", "200.00");

    const saveAmountResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveAmountForm,
    });
    assert.equal(saveAmountResponse.status, 303);
    assert.match(
      saveAmountResponse.headers.get("location") || "",
      new RegExp(`(?=.*notice=order-saved)(?=.*order=${escapeRegex(entryId)})`)
    );
    assert.doesNotMatch(saveAmountResponse.headers.get("location") || "", /amountEditor=1/);

    const amountEditorLocation = saveAmountResponse.headers.get("location");
    assert.ok(amountEditorLocation);
    const amountEditorResponse = await fetch(`${started.baseUrl}${amountEditorLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const amountEditorBody = await amountEditorResponse.text();
    assert.equal(amountEditorResponse.status, 200);
    assert.match(amountEditorBody, /data-admin-dialog-autopen="true"/);
    assert.match(amountEditorBody, /\$200\.00/);
    assert.match(amountEditorBody, /value="200\.00"/);
    assert.match(
      amountEditorBody,
      /<button[^>]*data-admin-order-amount-edit-trigger="admin-order-detail-dialog-[^"]+-amount-edit-panel"[^>]*>/
    );
    assert.match(
      amountEditorBody,
      /<form[^>]*data-admin-order-amount-editor="admin-order-detail-dialog-[^"]+-amount-edit-panel"[^>]*hidden/
    );
    assert.match(
      amountEditorBody,
      /<button[^>]*aria-label="Сохранить сумму"[^>]*hidden/
    );
    assert.match(
      amountEditorBody,
      /<button[^>]*aria-label="Отменить редактирование суммы"[^>]*hidden/
    );

    const savePaymentForm = new URLSearchParams();
    savePaymentForm.set("entryId", entryId);
    savePaymentForm.set("returnTo", `/admin/orders?q=ops-request-1&order=${entryId}`);
    savePaymentForm.set("paymentStatus", "paid");
    savePaymentForm.set("paymentMethod", "zelle");

    const savePaymentResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: savePaymentForm,
    });
    assert.equal(savePaymentResponse.status, 303);
    assert.match(
      savePaymentResponse.headers.get("location") || "",
      new RegExp(`(?=.*notice=order-saved)(?=.*order=${escapeRegex(entryId)})`)
    );

    const paymentEditorLocation = savePaymentResponse.headers.get("location");
    assert.ok(paymentEditorLocation);
    const paymentEditorResponse = await fetch(`${started.baseUrl}${paymentEditorLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const paymentEditorBody = await paymentEditorResponse.text();
    assert.equal(paymentEditorResponse.status, 200);
    assert.match(paymentEditorBody, /data-admin-dialog-autopen="true"/);
    assert.match(paymentEditorBody, /<option value="paid" selected>Paid/);
    assert.match(paymentEditorBody, /<option value="zelle" selected>Zelle/);
    assert.match(
      paymentEditorBody,
      /<button[^>]*data-admin-order-payment-edit-trigger="admin-order-detail-dialog-[^"]+-payment-edit-panel"[^>]*>/
    );
    assert.match(
      paymentEditorBody,
      /<form[^>]*data-admin-order-payment-editor="admin-order-detail-dialog-[^"]+-payment-edit-panel"[^>]*hidden/
    );
    assert.match(
      paymentEditorBody,
      /<button[^>]*aria-label="Сохранить оплату"[^>]*hidden/
    );
    assert.match(
      paymentEditorBody,
      /<button[^>]*aria-label="Отменить редактирование оплаты"[^>]*hidden/
    );

    const completionFormData = new FormData();
    completionFormData.set("action", "save-order-completion");
    completionFormData.set("entryId", entryId);
    completionFormData.set("returnTo", "/admin/orders");
    completionFormData.append("beforePhotos", new File([Buffer.from("before-image-1")], "before-one.jpg", { type: "image/jpeg" }));
    completionFormData.append("beforePhotos", new File([Buffer.from("before-image-2")], "before-two.jpg", { type: "image/jpeg" }));
    completionFormData.append("afterPhotos", new File([Buffer.from("after-image-1")], "after-one.jpg", { type: "image/jpeg" }));

    const saveCompletionResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: completionFormData,
    });
    assert.equal(saveCompletionResponse.status, 303);
    assert.match(saveCompletionResponse.headers.get("location") || "", /notice=completion-saved/);

    const ajaxCleanerCommentRequestPayload = {
      action: "save-order-cleaner-comment",
      entryId,
      returnTo: `/admin/orders?order=${entryId}`,
      cleanerComment: "Cleaner finished successfully.\nKitchen cabinets needed extra attention.\nTeam double-checked the bathroom.",
    };

    const ajaxCompletionResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        "content-type": "application/json;charset=UTF-8",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: JSON.stringify(ajaxCleanerCommentRequestPayload),
    });
    assert.equal(ajaxCompletionResponse.status, 200);
    const ajaxCompletionPayload = await ajaxCompletionResponse.json();
    assert.equal(ajaxCompletionPayload.ok, true);
    assert.equal(ajaxCompletionPayload.notice, "completion-saved");
    assert.equal(
      ajaxCompletionPayload.completion.cleanerComment,
      "Cleaner finished successfully.\nKitchen cabinets needed extra attention.\nTeam double-checked the bathroom."
    );
    assert.equal(ajaxCompletionPayload.completion.beforePhotos.length, 2);
    assert.equal(ajaxCompletionPayload.completion.afterPhotos.length, 1);
    assert.match(ajaxCompletionPayload.message, /Комментарий клинера сохранён/);
    assert.ok(ajaxCompletionPayload.completion.updatedAtLabel);

    const ajaxCompletionFallbackRequestPayload = {
      action: "save-order-cleaner-comment",
      entryId,
      returnTo: `/admin/orders?order=${entryId}`,
      cleanerComment: "Comment saved through ajax query fallback.",
    };

    const ajaxCompletionFallbackResponse = await fetch(`${started.baseUrl}/admin/orders?ajax=1`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        "content-type": "application/json;charset=UTF-8",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: JSON.stringify(ajaxCompletionFallbackRequestPayload),
    });
    assert.equal(ajaxCompletionFallbackResponse.status, 200);
    const ajaxCompletionFallbackPayload = await ajaxCompletionFallbackResponse.json();
    assert.equal(ajaxCompletionFallbackPayload.ok, true);
    assert.equal(ajaxCompletionFallbackPayload.notice, "completion-saved");
    assert.equal(
      ajaxCompletionFallbackPayload.completion.cleanerComment,
      "Comment saved through ajax query fallback."
    );

    const saveOrderForm = new URLSearchParams();
    saveOrderForm.set("entryId", entryId);
    saveOrderForm.set("returnTo", "/admin/orders");
    saveOrderForm.set("orderStatus", "rescheduled");
    saveOrderForm.append("assignedStaff", "Anna Petrova");
    saveOrderForm.append("assignedStaff", "Diana Brooks");
    saveOrderForm.set("paymentStatus", "partial");
    saveOrderForm.set("paymentMethod", "card");
    saveOrderForm.set("totalPrice", "245.50");
    saveOrderForm.set("selectedDate", "2026-03-24");
    saveOrderForm.set("selectedTime", "11:30");
    saveOrderForm.set("frequency", "monthly");

    const saveOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveOrderForm,
    });
    assert.equal(saveOrderResponse.status, 303);
    assert.match(saveOrderResponse.headers.get("location") || "", /notice=order-saved/);

    const ajaxOrderSaveResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/orders",
        orderStatus: "completed",
      }),
    });
    assert.equal(ajaxOrderSaveResponse.status, 200);
    const ajaxOrderSavePayload = await ajaxOrderSaveResponse.json();
    assert.equal(ajaxOrderSavePayload.ok, true);
    assert.equal(ajaxOrderSavePayload.notice, "order-saved");
    assert.equal(ajaxOrderSavePayload.order.orderStatus, "completed");

    const updatedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedOrdersBody = await updatedOrdersResponse.text();
    assert.equal(updatedOrdersResponse.status, 200);
    assert.match(updatedOrdersBody, /Завершено/);
    assert.match(updatedOrdersBody, /2 сотрудника/);
    assert.match(updatedOrdersBody, /Monthly/);
    assert.match(updatedOrdersBody, /<option value="partial" selected>Partial/);
    assert.match(updatedOrdersBody, /type="checkbox" name="assignedStaff" value="Anna Petrova" checked/);
    assert.match(updatedOrdersBody, /type="checkbox" name="assignedStaff" value="Diana Brooks" checked/);
    assert.match(updatedOrdersBody, /<option value="card" selected>Card/);
    assert.match(updatedOrdersBody, /\$245\.50/);
    assert.match(updatedOrdersBody, /name="totalPrice"/);
    assert.match(updatedOrdersBody, /value="245\.50"/);
    assert.match(updatedOrdersBody, /value="03\/24\/2026"/);
    assert.match(updatedOrdersBody, /value="11:30 AM"/);
    assert.match(updatedOrdersBody, /Comment saved through ajax query fallback\./);

    const filteredOrdersResponse = await fetch(`${started.baseUrl}/admin/orders?q=ops-request-1`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const filteredOrdersBody = await filteredOrdersResponse.text();
    assert.equal(filteredOrdersResponse.status, 200);
    assert.match(filteredOrdersBody, /Найдено 2 из 2 заказов\./);
    assert.match(filteredOrdersBody, /С учётом поиска и фильтров\./);
    const mediaMatches = Array.from(
      updatedOrdersBody.matchAll(new RegExp(`/admin/orders\\?media=1&amp;entryId=${escapeRegex(entryId)}&amp;asset=([^"&]+)`, "g"))
    );
    assert.equal(mediaMatches.length, 6);

    const mediaResponse = await fetch(
      `${started.baseUrl}/admin/orders?media=1&entryId=${encodeURIComponent(entryId)}&asset=${encodeURIComponent(mediaMatches[0][1])}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(await mediaResponse.text(), "before-image-1");

    const quoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const quoteOpsBody = await quoteOpsResponse.text();
    assert.equal(quoteOpsResponse.status, 200);
    assert.match(quoteOpsBody, /Jane Doe/);
    assert.match(quoteOpsBody, /ops-request-1/);
    assert.match(quoteOpsBody, /Лента заявок/);
    assert.match(quoteOpsBody, /Быстро найти нужную заявку/);
    assert.match(quoteOpsBody, /Все заявки/);
    assert.match(quoteOpsBody, /admin-table admin-quote-success-table/);
    assert.match(quoteOpsBody, /\.admin-quote-success-table\s*\{[\s\S]*min-width: 1380px;/);
    assert.match(quoteOpsBody, /\.admin-quote-lane\s*\{[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/);
    assert.match(quoteOpsBody, /\.admin-quote-table-wrap\s*\{[\s\S]*width: 100%;[\s\S]*max-width: 100%;/);
    assert.match(quoteOpsBody, /data-admin-auto-submit="true"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-delay="600"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-min-length="2"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-restore-focus="true"/);
    assert.match(quoteOpsBody, /id="admin-quote-ops-filters"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-scroll-target="#admin-quote-ops-filters"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-scroll-offset="18"/);
    assert.match(quoteOpsBody, /const autoSubmitScrollStorageKey = "adminAutoSubmitScroll"/);
    const adminScriptMatch = quoteOpsBody.match(/<script>\s*\(\(\) => \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
    assert.ok(adminScriptMatch);
    assert.doesNotThrow(() => new Function(`(() => {${adminScriptMatch[1]}})();`));
    assert.match(quoteOpsBody, /123 Main St, Romeoville, IL 60446/);
    assert.match(quoteOpsBody, /\+1\(312\)555-0100/);
    assert.match(quoteOpsBody, /data-admin-dialog-open="admin-quote-entry-detail-dialog-/);
    assert.match(quoteOpsBody, /class="admin-table-row-clickable"/);
    assert.match(quoteOpsBody, /data-admin-dialog-row="true"/);
    assert.match(quoteOpsBody, /Удалить заявку/);
    assert.match(quoteOpsBody, /data-admin-confirm-message="Удалить эту заявку из системы без возможности восстановления\?"/);
    assert.match(quoteOpsBody, /Телефон: \+1\(312\)555-0100/);
    assert.match(quoteOpsBody, /E-mail: jane@example\.com/);
    assert.match(quoteOpsBody, /admin-client-metric-card-wide/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Сумма<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Дата и время<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Телефон<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Услуга<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Адрес<\/span>/);
    assert.match(quoteOpsBody, /admin-client-info-grid admin-client-info-grid-three/);
    assert.match(quoteOpsBody, /<span class="admin-client-info-label">Создана<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-info-label">Менеджер<\/span>/);
    assert.match(quoteOpsBody, /Не назначен/);
    assert.match(quoteOpsBody, /Что заказал клиент/);
    assert.match(quoteOpsBody, /Поля из формы клиента/);
    assert.match(quoteOpsBody, /Комментарий клиента/);
    assert.match(quoteOpsBody, /\$245\.50/);
    assert.match(quoteOpsBody, /Gate code 2040/);
    assert.doesNotMatch(quoteOpsBody, /Главные детали собраны в компактные блоки/);
    assert.doesNotMatch(quoteOpsBody, /admin-quote-ops-filter-disclosure" open/);
    assert.doesNotMatch(quoteOpsBody, /Persistent storage active/i);
    assert.doesNotMatch(quoteOpsBody, /Подключено к Supabase/i);
    assert.doesNotMatch(quoteOpsBody, /quote_ops_entries/i);
    assert.doesNotMatch(quoteOpsBody, /CRM OK/);
    assert.doesNotMatch(quoteOpsBody, /CRM и отправка/);
    assert.doesNotMatch(quoteOpsBody, /<th>Действие<\/th>/);
    assert.doesNotMatch(quoteOpsBody, /<th>CRM<\/th>/);
    assert.doesNotMatch(quoteOpsBody, /<colgroup>/);
    assert.doesNotMatch(quoteOpsBody, /Скачать CSV/);
    assert.doesNotMatch(quoteOpsBody, /в текущей выборке/);
    assert.doesNotMatch(quoteOpsBody, /Критичных заявок нет/);
    assert.doesNotMatch(quoteOpsBody, /Последняя:/);
    assert.doesNotMatch(quoteOpsBody, /Запрос:\s*Standard Cleaning/i);
    assert.doesNotMatch(quoteOpsBody, /Клиент выбрал слот/i);
    assert.doesNotMatch(quoteOpsBody, /Заявка ушла в CRM без ошибок/i);
    assert.doesNotMatch(quoteOpsBody, /Адрес и комментарий/);
    assert.doesNotMatch(quoteOpsBody, /Полный адрес/);
    assert.doesNotMatch(quoteOpsBody, /Короткий адрес/);
    assert.doesNotMatch(quoteOpsBody, /admin-dialog-actions-row[\s\S]*Повторить отправку[\s\S]*Закрыть/);

    const quoteOpsAddressSearchResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("123 Main St, Romeoville, IL 60446")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const quoteOpsAddressSearchBody = await quoteOpsAddressSearchResponse.text();
    assert.equal(quoteOpsAddressSearchResponse.status, 200);
    assert.match(quoteOpsAddressSearchBody, /Jane Doe/);
    assert.match(quoteOpsAddressSearchBody, /Показано 2 из 2 заявок\./);
    assert.doesNotMatch(quoteOpsAddressSearchBody, /По текущему фильтру заявок нет/);

    const removedExportResponse = await fetch(`${started.baseUrl}/admin/quote-ops/export.csv`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    assert.equal(removedExportResponse.status, 404);

    const retryResponse = await fetch(`${started.baseUrl}/admin/quote-ops/retry`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/quote-ops",
      }),
    });
    assert.equal(retryResponse.status, 303);
    assert.match(retryResponse.headers.get("location") || "", /notice=retry-success/);

    const deleteOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-order",
        entryId,
        returnTo: "/admin/orders",
      }),
    });
    assert.equal(deleteOrderResponse.status, 303);
    assert.match(deleteOrderResponse.headers.get("location") || "", /notice=order-deleted/);

    const deletedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedOrdersBody = await deletedOrdersResponse.text();
    assert.equal(deletedOrdersResponse.status, 200);
    assert.match(deletedOrdersBody, /Jane Doe/);
    assert.doesNotMatch(deletedOrdersBody, /(?<![a-z0-9-])ops-request-1(?!-[a-z0-9])/i);

    const deletedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedQuoteOpsBody = await deletedQuoteOpsResponse.text();
    assert.equal(deletedQuoteOpsResponse.status, 200);
    assert.match(deletedQuoteOpsBody, /Jane Doe/);
    assert.match(deletedQuoteOpsBody, /ops-request-1/);

    const deleteLeadResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-lead-entry",
        entryId,
        returnTo: `/admin/quote-ops?entry=${encodeURIComponent(entryId)}`,
      }),
    });
    assert.equal(deleteLeadResponse.status, 303);
    assert.match(deleteLeadResponse.headers.get("location") || "", /notice=lead-deleted/);
    assert.doesNotMatch(deleteLeadResponse.headers.get("location") || "", /(?:\?|&)entry=/);

    const removedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const removedQuoteOpsBody = await removedQuoteOpsResponse.text();
    assert.equal(removedQuoteOpsResponse.status, 200);
    assert.doesNotMatch(
      removedQuoteOpsBody,
      /(?<![a-z0-9-])ops-request-1(?!-[a-z0-9])/i
    );
    assert.doesNotMatch(
      removedQuoteOpsBody,
      new RegExp(`admin-quote-entry-detail-dialog-${escapeRegex(entryId)}`)
    );

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const crmSyncCalls = calls.filter((record) =>
      String(record.url).includes("/contacts/")
    );
    const autoSmsCalls = calls.filter((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.equal(crmSyncCalls.length, 4);
    assert.equal(autoSmsCalls.length, 1);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
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

test("sends staff SMS over ajax and keeps SMS history in the staff dialog", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-staff-sms-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "GET",
      match: "/contacts/",
      status: 200,
      body: {
        contacts: [
          {
            id: "contact-staff-sms-123",
            phone: "(630) 555-0101",
          },
        ],
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-staff-sms-123",
        conversationId: "conversation-staff-sms-123",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify(
        {
          version: 1,
          staff: [
            {
              id: "staff-sms-anna",
              name: "Anna Petrova",
              role: "Менеджер",
              phone: "+1(630)555-0101",
              email: "anna.petrova@example.com",
              address: "720 Plainfield Rd, Willowbrook, IL 60527",
              status: "active",
            },
          ],
          assignments: [],
        },
        null,
        2
      )}\n`
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const pageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const pageBody = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(pageBody, /SMS сотруднику/i);
    assert.match(pageBody, /data-admin-ghl-sms="true"/i);

    const sendSmsResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-staff-sms",
        staffId: "staff-sms-anna",
        message: "Staff SMS history test",
        returnTo: "/admin/staff",
      }),
    });

    assert.equal(sendSmsResponse.status, 200);
    const sendSmsPayload = await sendSmsResponse.json();
    assert.equal(sendSmsPayload.ok, true);
    assert.equal(sendSmsPayload.notice, "staff-sms-sent");
    assert.equal(sendSmsPayload.sms.feedbackState, "success");
    assert.equal(sendSmsPayload.sms.feedbackMessage, "SMS отправлена через Go High Level.");
    assert.equal(sendSmsPayload.sms.historyCountLabel, "1 SMS");
    assert.equal(sendSmsPayload.sms.history.length, 1);
    assert.equal(sendSmsPayload.sms.history[0].message, "Staff SMS history test");
    assert.equal(sendSmsPayload.sms.history[0].source, "manual");

    const afterResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const afterBody = await afterResponse.text();
    assert.equal(afterResponse.status, 200);
    assert.match(afterBody, /История SMS/);
    assert.match(afterBody, /Staff SMS history test/);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequest = captureLines.find((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.ok(smsRequest);
    const smsPayload = JSON.parse(smsRequest.body);
    assert.deepEqual(smsPayload, {
      type: "SMS",
      contactId: "contact-staff-sms-123",
      message: "Staff SMS history test",
      status: "pending",
      toNumber: "+16305550101",
    });
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
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

test("creates employee users in settings and serves a personal cabinet with assigned jobs only", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-route-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-account-123",
        },
      },
    },
  ]);
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const staffW9DocumentsDir = path.join(tempDir, "staff-documents");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    STAFF_W9_DOCUMENTS_DIR: staffW9DocumentsDir,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const assignedQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "account-request-1",
      fullName: "Maria Assigned",
      phone: "312-555-0101",
      email: "maria.customer@example.com",
      serviceType: "deep",
      selectedDate: "2026-03-27",
      selectedTime: "10:00",
      fullAddress: "123 Main St, Romeoville, IL 60446",
    });
    assert.equal(assignedQuoteResponse.status, 201);

    const unassignedQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "account-request-2",
      fullName: "Nina Hidden",
      phone: "312-555-0102",
      email: "nina.customer@example.com",
      serviceType: "move",
      selectedDate: "2026-03-28",
      selectedTime: "01:00 PM",
      fullAddress: "456 Oak Ave, Plainfield, IL 60544",
    });
    assert.equal(unassignedQuoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "account-request-1");

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, /class="admin-settings-nav-row"/);
    assert.match(settingsBody, /class="admin-settings-nav-actions"/);
    const settingsNav = settingsBody.match(/<div class="admin-subnav-strip admin-settings-nav">[\s\S]*?<\/div>/)?.[0] || "";
    assert.ok(settingsNav);
    assert.ok(settingsNav.indexOf("Пользователи") < settingsNav.indexOf("Чек-листы"));
    assert.match(settingsBody, />Добавить сотрудника</);
    assert.match(settingsBody, /data-admin-dialog-open="admin-user-create-dialog"/);
    assert.match(settingsBody, /id="admin-user-create-dialog"/);
    assert.match(settingsBody, /admin-settings-users-table/);
    assert.match(settingsBody, /admin-settings-section-stack/);
    assert.match(settingsBody, /name="phone"[^>]*required/i);
    assert.match(settingsBody, /name="address"[^>]*required/i);
    assert.match(settingsBody, /name="compensationValue"/i);
    assert.match(settingsBody, /name="compensationType"/i);
    assert.match(settingsBody, /Почта приглашений/i);
    assert.ok(settingsBody.indexOf("admin-settings-users-table") < settingsBody.indexOf("Почта приглашений"));
    assert.doesNotMatch(settingsBody, /<th>Открыть<\/th>/i);
    assert.doesNotMatch(settingsBody, /Шаблоны чек-листов/i);

    const invalidCreateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Incomplete User",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "incomplete@example.com",
        phone: "",
        address: "",
        notes: "",
        password: "StrongPass123!",
      }),
    });
    assert.equal(invalidCreateUserResponse.status, 303);
    assert.match(invalidCreateUserResponse.headers.get("location") || "", /notice=user-error/);

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Alina Carter",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "alina.staff@example.com",
        phone: "3125550101",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        compensationValue: "28",
        compensationType: "percent",
        notes: "Assigned from settings test",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    const createdUserLocation = createUserResponse.headers.get("location") || "";
    assert.match(createdUserLocation, /notice=user-created-email-skipped/);

    const updatedSettingsResponse = await fetch(`${started.baseUrl}${createdUserLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedSettingsBody = await updatedSettingsResponse.text();
    assert.equal(updatedSettingsResponse.status, 200);
    assert.match(updatedSettingsBody, /Автоматическая отправка письма сейчас не настроена/i);
    assert.match(updatedSettingsBody, /alina\.staff@example\.com/i);
    assert.match(updatedSettingsBody, /Alina Carter/);
    assert.match(updatedSettingsBody, /aria-label="Открыть пользователя Alina Carter"/i);

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffStorePayload.staff.length, 1);
    const staffId = staffStorePayload.staff[0].id;
    assert.ok(staffId);
    assert.equal(staffStorePayload.staff[0].name, "Alina Carter");
    assert.equal(staffStorePayload.staff[0].role, "Клинер");
    assert.equal(staffStorePayload.staff[0].address, "742 Cedar Avenue, Aurora, IL 60506");
    assert.equal(staffStorePayload.staff[0].compensationValue, "28");
    assert.equal(staffStorePayload.staff[0].compensationType, "percent");

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersStorePayload.users.length, 1);
    assert.equal(usersStorePayload.users[0].staffId, staffId);
    assert.equal(usersStorePayload.users[0].email, "alina.staff@example.com");
    assert.equal(usersStorePayload.users[0].role, "cleaner");
    assert.equal(usersStorePayload.users[0].isEmployee, true);
    assert.equal(usersStorePayload.users[0].emailVerificationRequired, false);
    assert.ok(usersStorePayload.users[0].emailVerifiedAt);
    assert.match(usersStorePayload.users[0].passwordHash, /^scrypt\$/);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Alina Carter/);

    const assignedEntryId = getStaffAssignmentEntryIdByCustomerName(staffPageBody, "Maria Assigned");
    assert.ok(assignedEntryId);

    const assignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", assignedEntryId],
        ["staffIds", staffId],
        ["status", "confirmed"],
        ["notes", "Bring supplies"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const anonymousAccountResponse = await fetch(`${started.baseUrl}/account`, {
      redirect: "manual",
    });
    assert.equal(anonymousAccountResponse.status, 303);
    assert.equal(anonymousAccountResponse.headers.get("location"), "/account/login");

    const accountLoginPageResponse = await fetch(`${started.baseUrl}/account/login`);
    const accountLoginPageBody = await accountLoginPageResponse.text();
    assert.equal(accountLoginPageResponse.status, 200);
    assert.match(accountLoginPageBody, /Вход сотрудника/i);
    assert.match(accountLoginPageBody, /Назначенные на вас заявки/i);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.staff@example.com",
        password: "StrongPass123!",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/account");

    const userSessionCookieValue = getCookieValue(getSetCookies(accountLoginResponse), "shynli_user_session");
    assert.ok(userSessionCookieValue);

    const cleanerAdminResponse = await fetch(`${started.baseUrl}/admin`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(cleanerAdminResponse.status, 303);
    assert.equal(cleanerAdminResponse.headers.get("location"), "/account");

    const accountDashboardResponse = await fetch(`${started.baseUrl}/account`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const accountDashboardBody = await accountDashboardResponse.text();
    assert.equal(accountDashboardResponse.status, 200);
    assert.match(accountDashboardBody, /Мой кабинет/i);
    assert.match(accountDashboardBody, /Maria Assigned/);
    assert.match(accountDashboardBody, /Bring supplies/);
    assert.doesNotMatch(accountDashboardBody, /Nina Hidden/);
    assert.match(accountDashboardBody, /alina\.staff@example\.com/i);
    assert.match(accountDashboardBody, /<details class="admin-details" data-account-profile-details>/i);
    assert.match(accountDashboardBody, /<summary>Изменить контакты<\/summary>/i);
    assert.doesNotMatch(accountDashboardBody, /<details class="admin-details" data-account-profile-details" open>/i);
    assert.match(accountDashboardBody, /<details class="admin-details" data-account-password-details>/i);
    assert.match(accountDashboardBody, /<summary>Обновить пароль<\/summary>/i);
    assert.doesNotMatch(accountDashboardBody, /<details class="admin-details" data-account-password-details" open>/i);
    assert.match(accountDashboardBody, /Заполните документы сотрудника/i);
    assert.match(accountDashboardBody, /Подпишите форму мышкой, пальцем или стилусом/i);
    assert.match(accountDashboardBody, /data-account-w9-form/i);
    assert.match(accountDashboardBody, /data-account-w9-submit[^>]*disabled/i);
    assert.match(accountDashboardBody, /data-account-w9-field="legalName"/i);
    assert.match(accountDashboardBody, /data-account-w9-field="signature"/i);

    const adminStaffBeforeW9Response = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const adminStaffBeforeW9Body = await adminStaffBeforeW9Response.text();
    assert.equal(adminStaffBeforeW9Response.status, 200);
    assert.match(adminStaffBeforeW9Body, /Сотрудник ещё не завершил onboarding-документы/i);
    assert.match(adminStaffBeforeW9Body, /Отправить повторно/i);

    const invalidSaveW9Response = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-w9",
        w9LegalName: "Alina Draft",
        w9BusinessName: "Alina Draft LLC",
        w9FederalTaxClassification: "individual",
        w9LlcTaxClassification: "",
        w9OtherClassification: "",
        w9ExemptPayeeCode: "1",
        w9FatcaCode: "A",
        w9AddressLine1: "987 Draft Street",
        w9CityStateZip: "Naperville, IL 60540",
        w9AccountNumbers: "Draft-Account",
        w9TinType: "ssn",
        w9TinValue: "987-65-4321",
        w9Line3bApplies: "1",
        w9SignatureDataUrl: SIGNATURE_DATA_URL,
      }),
    });
    const invalidSaveW9Body = await invalidSaveW9Response.text();
    assert.equal(invalidSaveW9Response.status, 422);
    assert.match(invalidSaveW9Body, /Не удалось собрать документы сотрудника/i);
    assert.match(invalidSaveW9Body, /name="w9LegalName"[^>]*value="Alina Draft"/i);
    assert.match(invalidSaveW9Body, /name="w9BusinessName"[^>]*value="Alina Draft LLC"/i);
    assert.match(invalidSaveW9Body, /name="w9AddressLine1"[^>]*value="987 Draft Street"/i);
    assert.match(invalidSaveW9Body, /name="w9CityStateZip"[^>]*value="Naperville, IL 60540"/i);
    assert.match(invalidSaveW9Body, /name="w9AccountNumbers"[^>]*value="Draft-Account"/i);
    assert.match(invalidSaveW9Body, /name="w9TinValue"[^>]*value="987-65-4321"/i);
    assert.match(invalidSaveW9Body, /name="w9Line3bApplies"[^>]*checked/i);
    assert.match(invalidSaveW9Body, /name="w9SignatureDataUrl"[^>]*value="data:image\/png;base64,[^"]+"/i);
    assert.match(invalidSaveW9Body, /Подпись сохранена в форме\. Можно исправить остальные поля и отправить снова\./i);
    assert.match(invalidSaveW9Body, /data-account-w9-submit[^>]*disabled/i);

    const saveW9Response = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-w9",
        w9LegalName: "Alina Carter",
        w9BusinessName: "",
        w9FederalTaxClassification: "individual",
        w9LlcTaxClassification: "",
        w9OtherClassification: "",
        w9ExemptPayeeCode: "",
        w9FatcaCode: "",
        w9AddressLine1: "742 Cedar Avenue",
        w9CityStateZip: "Aurora, IL 60506",
        w9AccountNumbers: "Employee-7",
        w9TinType: "ssn",
        w9TinValue: "123-45-6789",
        w9SignatureDataUrl: SIGNATURE_DATA_URL,
        w9CertificationConfirmed: "1",
      }),
    });
    assert.equal(saveW9Response.status, 303);
    assert.match(saveW9Response.headers.get("location") || "", /notice=w9-saved/);

    const staffAfterW9Save = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffAfterW9Save.staff[0].contract.contractorName, "Alina Carter");
    assert.equal(
      staffAfterW9Save.staff[0].contract.document.relativePath,
      path.join(staffId, "contract.pdf")
    );
    assert.equal(staffAfterW9Save.staff[0].w9.legalName, "Alina Carter");
    assert.equal(staffAfterW9Save.staff[0].w9.maskedTin, "***-**-6789");
    assert.equal(staffAfterW9Save.staff[0].w9.document.relativePath, path.join(staffId, "w9.pdf"));

    const accountW9PageResponse = await fetch(
      `${started.baseUrl}${(saveW9Response.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      }
    );
    const accountW9PageBody = await accountW9PageResponse.text();
    assert.equal(accountW9PageResponse.status, 200);
    assert.match(accountW9PageBody, /Документы сотрудника сохранены/i);
    assert.match(accountW9PageBody, /Скачать Contract/i);
    assert.match(accountW9PageBody, /Скачать W-9/i);
    assert.match(accountW9PageBody, /Tax classification/i);
    assert.match(accountW9PageBody, /\*\*\*-\*\*-6789/);
    assert.match(accountW9PageBody, /<details class="admin-details" data-account-w9-details>/i);
    assert.match(accountW9PageBody, /<summary>Обновить документы<\/summary>/i);
    assert.doesNotMatch(accountW9PageBody, /<details class="admin-details" data-account-w9-details" open>/i);

    const accountContractDownloadResponse = await fetch(`${started.baseUrl}/account/contract`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountContractDownloadResponse.status, 200);
    assert.equal(accountContractDownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(
      accountContractDownloadResponse.headers.get("content-disposition") || "",
      /(attachment|inline);\s*filename=/i
    );
    assert.ok(Number(accountContractDownloadResponse.headers.get("content-length") || 0) > 0);

    const accountW9DownloadResponse = await fetch(`${started.baseUrl}/account/w9`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountW9DownloadResponse.status, 200);
    assert.equal(accountW9DownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(
      accountW9DownloadResponse.headers.get("content-disposition") || "",
      /(attachment|inline);\s*filename=/i
    );
    assert.ok(Number(accountW9DownloadResponse.headers.get("content-length") || 0) > 0);

    const adminStaffAfterW9Response = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const adminStaffAfterW9Body = await adminStaffAfterW9Response.text();
    assert.equal(adminStaffAfterW9Response.status, 200);
    assert.match(adminStaffAfterW9Body, /Документы сотрудника/i);
    assert.match(adminStaffAfterW9Body, /Скачать Contract/i);
    assert.match(adminStaffAfterW9Body, /Скачать W-9/i);
    assert.doesNotMatch(adminStaffAfterW9Body, /<iframe[^>]*admin-w9-preview-frame/i);
    assert.doesNotMatch(adminStaffAfterW9Body, /Отправить повторно/i);

    const adminContractDownloadResponse = await fetch(
      `${started.baseUrl}/admin/staff/contract?staffId=${encodeURIComponent(staffId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(adminContractDownloadResponse.status, 200);
    assert.equal(adminContractDownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(
      adminContractDownloadResponse.headers.get("content-disposition") || "",
      /attachment;\s*filename=/i
    );
    assert.equal(adminContractDownloadResponse.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(
      adminContractDownloadResponse.headers.get("content-security-policy") || "",
      /frame-ancestors 'self'/
    );
    assert.ok(Number(adminContractDownloadResponse.headers.get("content-length") || 0) > 0);

    const adminW9DownloadResponse = await fetch(
      `${started.baseUrl}/admin/staff/w9?staffId=${encodeURIComponent(staffId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(adminW9DownloadResponse.status, 200);
    assert.equal(adminW9DownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(adminW9DownloadResponse.headers.get("content-disposition") || "", /attachment;\s*filename=/i);
    assert.equal(adminW9DownloadResponse.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(
      adminW9DownloadResponse.headers.get("content-security-policy") || "",
      /frame-ancestors 'self'/
    );
    assert.ok(Number(adminW9DownloadResponse.headers.get("content-length") || 0) > 0);

    const saveProfileResponse = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-profile",
        email: "alina.updated@example.com",
        phone: "3315550110",
      }),
    });
    assert.equal(saveProfileResponse.status, 303);
    assert.match(saveProfileResponse.headers.get("location") || "", /notice=profile-saved/);

    const profilePageResponse = await fetch(`${started.baseUrl}${(saveProfileResponse.headers.get("location") || "").replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const profilePageBody = await profilePageResponse.text();
    assert.equal(profilePageResponse.status, 200);
    assert.match(profilePageBody, /Профиль обновлён/i);
    assert.match(profilePageBody, /alina\.updated@example\.com/i);
    assert.match(profilePageBody, /\+1\(331\)555-0110/i);
    assert.match(profilePageBody, /<details class="admin-details" data-account-profile-details>/i);
    assert.match(profilePageBody, /<summary>Изменить контакты<\/summary>/i);
    assert.doesNotMatch(profilePageBody, /<details class="admin-details" data-account-profile-details" open>/i);
    assert.match(profilePageBody, /name="phone" value="3315550110"/i);

    const usersAfterProfileSave = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersAfterProfileSave.users[0].email, "alina.updated@example.com");
    assert.equal(usersAfterProfileSave.users[0].phone, "+1(331)555-0110");

    const staffAfterProfileSave = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffAfterProfileSave.staff[0].email, "alina.updated@example.com");
    assert.equal(staffAfterProfileSave.staff[0].phone, "+1(331)555-0110");

    const changePasswordResponse = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "change-password",
        currentPassword: "StrongPass123!",
        newPassword: "EvenStronger456!",
        confirmPassword: "EvenStronger456!",
      }),
    });
    assert.equal(changePasswordResponse.status, 303);
    assert.match(changePasswordResponse.headers.get("location") || "", /notice=password-saved/);

    const passwordPageResponse = await fetch(
      `${started.baseUrl}${(changePasswordResponse.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      }
    );
    const passwordPageBody = await passwordPageResponse.text();
    assert.equal(passwordPageResponse.status, 200);
    assert.match(passwordPageBody, /Пароль обновлён/i);
    assert.match(passwordPageBody, /<details class="admin-details" data-account-password-details>/i);
    assert.match(passwordPageBody, /<summary>Обновить пароль<\/summary>/i);
    assert.doesNotMatch(passwordPageBody, /<details class="admin-details" data-account-password-details" open>/i);

    const logoutResponse = await fetch(`${started.baseUrl}/account/logout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(logoutResponse.status, 303);
    assert.equal(logoutResponse.headers.get("location"), "/account/login");

    const oldPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.updated@example.com",
        password: "StrongPass123!",
      }),
    });
    const oldPasswordBody = await oldPasswordResponse.text();
    assert.equal(oldPasswordResponse.status, 401);
    assert.match(oldPasswordBody, /Неверная почта или пароль/i);

    const newPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.updated@example.com",
        password: "EvenStronger456!",
      }),
    });
    assert.equal(newPasswordResponse.status, 303);
    assert.equal(newPasswordResponse.headers.get("location"), "/account");
    assert.ok(getCookieValue(getSetCookies(newPasswordResponse), "shynli_user_session"));
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
    fetchStub.cleanup();
  }
});
test("resends a W-9 reminder from the staff card when the form is still missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-w9-reminder-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const smtpServer = await createSmtpTestServer();
  const fetchStub = createFetchStub([
    {
      method: "GET",
      match: "/contacts/",
      status: 200,
      body: {
        contacts: [
          {
            id: "contact-w9-rina-123",
            phone: "(312) 555-0142",
          },
        ],
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-w9-rina-123",
        conversationId: "conversation-w9-rina-123",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const expectedW9Path = "/account?focus=w9#account-w9";

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Rina Powell",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "rina.powell@example.com",
        phone: "3125550142",
        address: "900 Main St, Joliet, IL 60435",
        notes: "Needs W-9 reminder",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    const initialMessageCount = smtpServer.messages.length;

    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffId = staffPayload.staff[0].id;
    const userId = usersPayload.users[0].id;
    assert.ok(staffId);
    assert.ok(userId);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Сотрудник ещё не завершил onboarding-документы\./i);
    assert.match(staffPageBody, /Contract \+ W-9/i);
    assert.match(staffPageBody, /Отправить повторно/i);

    const resendResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "resend-staff-w9-reminder",
        staffId,
        userId,
        staffName: "Rina Powell",
      }),
    });
    assert.equal(resendResponse.status, 303);
    assert.match(resendResponse.headers.get("location") || "", /notice=w9-reminder-sent/);

    const noticePageResponse = await fetch(
      `${started.baseUrl}${(resendResponse.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const noticePageBody = await noticePageResponse.text();
    assert.equal(noticePageResponse.status, 200);
    assert.match(noticePageBody, /Напоминание о Contract и W-9 отправлено сотруднику повторно\./i);

    assert.equal(smtpServer.messages.length, initialMessageCount + 1);
    const rawEmail = decodeQuotedPrintable(
      smtpServer.messages[smtpServer.messages.length - 1].raw
    );
    assert.match(rawEmail, /Subject: Complete your SHYNLI onboarding documents/);
    assert.match(rawEmail, /rina\.powell@example\.com/);
    assert.match(rawEmail, /account\/login/);
    assert.match(rawEmail, /Open documents/);
    assert.match(rawEmail, /next=3D%2Faccount%3Ffocus%3Dw9%23account-w9|next=%2Faccount%3Ffocus%3Dw9%23account-w9/);
    assert.doesNotMatch(rawEmail, /Confirm your SHYNLI employee email/);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequest = captureLines.find((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.ok(smsRequest);
    const smsPayload = JSON.parse(smsRequest.body);
    assert.equal(smsPayload.type, "SMS");
    assert.equal(smsPayload.contactId, "contact-w9-rina-123");
    assert.equal(smsPayload.status, "pending");
    assert.equal(smsPayload.toNumber, "+13125550142");
    assert.match(
      smsPayload.message,
      /Please complete and sign your Contract and W-9 here:/i
    );

    const staffPageAfterReminderResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageAfterReminderBody = await staffPageAfterReminderResponse.text();
    assert.equal(staffPageAfterReminderResponse.status, 200);
    assert.match(staffPageAfterReminderBody, /История SMS/);
    assert.match(staffPageAfterReminderBody, /Автоматически/);
    assert.match(
      staffPageAfterReminderBody,
      /Please complete and sign your Contract and W-9 here:/i
    );

    const verifyUrlMatch = rawEmail.match(/https?:\/\/[^\s"]+\/account\/verify-email\?token=[^\s"]+/);
    assert.ok(verifyUrlMatch);
    const verifyUrl = new URL(
      verifyUrlMatch[0].replace(/=3D/g, "=").replace(/&amp;/g, "&")
    );
    assert.equal(verifyUrl.searchParams.get("next"), expectedW9Path);

    const verifyResponse = await fetch(
      `${started.baseUrl}${verifyUrl.pathname}${verifyUrl.search}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(verifyResponse.status, 303);
    assert.match(verifyResponse.headers.get("location") || "", /notice=email-verified/);
    assert.match(verifyResponse.headers.get("location") || "", /next=%2Faccount%3Ffocus%3Dw9%23account-w9/);

    const reminderLoginPageResponse = await fetch(
      `${started.baseUrl}${(verifyResponse.headers.get("location") || "").replace(/#.*$/, "")}`
    );
    const reminderLoginPageBody = await reminderLoginPageResponse.text();
    assert.equal(reminderLoginPageResponse.status, 200);
    assert.match(reminderLoginPageBody, /После входа откроется раздел документов сотрудника/i);
    assert.match(reminderLoginPageBody, /name="next" value="\/account\?focus=w9#account-w9"/i);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "rina.powell@example.com",
        password: "StrongPass123!",
        next: expectedW9Path,
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), expectedW9Path);
    const userSessionCookieValue = getCookieValue(
      getSetCookies(accountLoginResponse),
      "shynli_user_session"
    );
    assert.ok(userSessionCookieValue);

    const w9DashboardResponse = await fetch(
      `${started.baseUrl}${expectedW9Path.replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      }
    );
    const w9DashboardBody = await w9DashboardResponse.text();
    assert.equal(w9DashboardResponse.status, 200);
    assert.match(w9DashboardBody, /Открылся раздел документов сотрудника/i);
    assert.match(w9DashboardBody, /id="account-w9"/i);
    assert.match(w9DashboardBody, /Сформировать документы/i);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("keeps W-9 reminder on the employee flow even for manager-linked users", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-w9-reminder-manager-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const smtpServer = await createSmtpTestServer();
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const expectedW9Path = "/account?focus=w9#account-w9";

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Ramis Manager",
        role: "manager",
        status: "active",
        staffStatus: "active",
        email: "ramis.manager@example.com",
        phone: "3125550188",
        address: "1200 Frontage Rd, Bolingbrook, IL 60440",
        notes: "Manager W-9 redirect test",
        password: "ManagerPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    const initialMessageCount = smtpServer.messages.length;

    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffId = staffPayload.staff[0].id;
    const userId = usersPayload.users[0].id;

    const resendResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "resend-staff-w9-reminder",
        staffId,
        userId,
        staffName: "Ramis Manager",
      }),
    });
    assert.equal(resendResponse.status, 303);
    assert.match(resendResponse.headers.get("location") || "", /notice=w9-reminder-sent/);

    assert.equal(smtpServer.messages.length, initialMessageCount + 1);
    const rawEmail = decodeQuotedPrintable(
      smtpServer.messages[smtpServer.messages.length - 1].raw
    );
    const verifyUrlMatch = rawEmail.match(/https?:\/\/[^\s"]+\/account\/verify-email\?token=[^\s"]+/);
    assert.ok(verifyUrlMatch);
    const verifyUrl = new URL(
      verifyUrlMatch[0].replace(/=3D/g, "=").replace(/&amp;/g, "&")
    );
    assert.equal(verifyUrl.searchParams.get("next"), expectedW9Path);

    const verifyResponse = await fetch(
      `${started.baseUrl}${verifyUrl.pathname}${verifyUrl.search}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(verifyResponse.status, 303);
    assert.match(verifyResponse.headers.get("location") || "", /notice=email-verified/);
    assert.match(
      verifyResponse.headers.get("location") || "",
      /next=%2Faccount%3Ffocus%3Dw9%23account-w9/
    );

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "ramis.manager@example.com",
        password: "ManagerPass123!",
        next: expectedW9Path,
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), expectedW9Path);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("keeps admin users out of the staff workspace and skips W-9 flow", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-admin-no-w9-"));
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
    const requestedW9Path = "/account?focus=w9#account-w9";

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Mila Admin",
        role: "admin",
        status: "active",
        staffStatus: "active",
        email: "mila.admin@example.com",
        phone: "3125550190",
        address: "12 Lake St, Aurora, IL 60504",
        notes: "Admin should stay out of staff and W-9",
        password: "AdminPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(staffPayload.staff.length, 1);
    assert.equal(staffPayload.staff[0].role, "Админ");
    const staffId = staffPayload.staff[0].id;
    const userId = usersPayload.users[0].id;
    assert.equal(usersPayload.users[0].isEmployee, false);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Пока сотрудников нет/i);
    assert.doesNotMatch(staffPageBody, /Mila Admin/i);
    assert.doesNotMatch(staffPageBody, /mila\.admin@example\.com/i);

    const resendResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "resend-staff-w9-reminder",
        staffId,
        userId,
        staffName: "Mila Admin",
      }),
    });
    assert.equal(resendResponse.status, 303);
    assert.match(resendResponse.headers.get("location") || "", /notice=w9-reminder-admin/);

    const resendNoticeResponse = await fetch(
      `${started.baseUrl}${(resendResponse.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const resendNoticeBody = await resendNoticeResponse.text();
    assert.equal(resendNoticeResponse.status, 200);
    assert.match(resendNoticeBody, /Для админов onboarding-документы не отправляются/i);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "mila.admin@example.com",
        password: "AdminPass123!",
        next: requestedW9Path,
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/admin");
    const userSessionCookieValue = getCookieValue(
      getSetCookies(accountLoginResponse),
      "shynli_user_session"
    );
    assert.ok(userSessionCookieValue);

    const accountDashboardResponse = await fetch(`${started.baseUrl}/account?focus=w9`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountDashboardResponse.status, 303);
    assert.equal(accountDashboardResponse.headers.get("location"), "/admin");

    const adminWorkspaceResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const adminWorkspaceBody = await adminWorkspaceResponse.text();
    assert.equal(adminWorkspaceResponse.status, 200);
    assert.match(adminWorkspaceBody, /Обзор/i);
    assert.doesNotMatch(adminWorkspaceBody, /id="account-w9"/i);

    const saveW9Response = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-w9",
        w9LegalName: "Mila Admin",
      }),
    });
    assert.equal(saveW9Response.status, 303);
    assert.equal(saveW9Response.headers.get("location"), "/admin");
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("allows admin users marked as employees into staff scheduling and onboarding documents", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-admin-employee-"));
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
        name: "Ramis Admin",
        role: "admin",
        isEmployee: "1",
        status: "active",
        staffStatus: "active",
        email: "ramis.admin.employee@example.com",
        phone: "3125550191",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        notes: "Admin can also take jobs",
        password: "AdminPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(staffPayload.staff[0].role, "Админ");
    assert.equal(usersPayload.users[0].isEmployee, true);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Ramis Admin/i);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "ramis.admin.employee@example.com",
        password: "AdminPass123!",
        next: "/account?focus=w9#account-w9",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/account?focus=w9#account-w9");
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("persists an unchecked assignable-orders flag for non-admin users", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-user-assignable-"));
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

    const initialUsersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const managerUser = initialUsersPayload.users[0];
    assert.equal(managerUser.isEmployee, true);

    const updateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "update_user",
        userId: managerUser.id,
        staffId: managerUser.staffId,
        name: "Marta Greene",
        role: "manager",
        isEmployee: "0",
        status: "active",
        staffStatus: "active",
        email: "marta.manager@example.com",
        phone: "3125550198",
        address: "500 Executive Dr, Naperville, IL 60563",
        notes: "No longer assignable",
        password: "",
      }),
    });
    assert.equal(updateUserResponse.status, 303);
    assert.match(updateUserResponse.headers.get("location") || "", /notice=user-updated/);

    const updatedUsersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(updatedUsersPayload.users[0].isEmployee, false);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);

    const dialogMatch = settingsBody.match(
      new RegExp(
        `id="admin-settings-user-dialog-${escapeRegex(managerUser.id)}"[\\s\\S]*?<\\/dialog>`
      )
    );
    assert.ok(dialogMatch);
    assert.doesNotMatch(dialogMatch[0], /name="isEmployee" value="1" checked/);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("keeps non-assignable users out of the calendar and order assignment flows", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-user-assignable-enforcement-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-assignable-123",
        },
      },
    },
  ]);
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
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
        name: "Nina Hidden",
        role: "cleaner",
        isEmployee: "0",
        status: "active",
        staffStatus: "active",
        email: "nina.hidden@example.com",
        phone: "3125550177",
        address: "177 Hidden Ln, Aurora, IL 60504",
        notes: "Should stay out of assignments",
        password: "CleanerPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const blockedUser = usersPayload.users[0];
    const blockedStaff = staffPayload.staff[0];
    assert.equal(blockedUser.isEmployee, false);
    assert.equal(blockedStaff.name, "Nina Hidden");

    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "assignable-hidden-request-1",
      fullName: "Calendar Hidden Customer",
      phone: "312-555-0189",
      email: "calendar.hidden@example.com",
      selectedDate: "2026-04-21",
      selectedTime: "09:00",
      fullAddress: "215 North Elm Street, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "assignable-hidden-request-1"
    );

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.doesNotMatch(
      ordersBody,
      /name="assignedStaff" value="Nina Hidden"/
    );

    const calendarResponse = await fetch(
      `${started.baseUrl}/admin/staff?section=calendar&calendarStart=2026-04-21`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const calendarBody = await calendarResponse.text();
    assert.equal(calendarResponse.status, 200);
    assert.doesNotMatch(calendarBody, /Nina Hidden/);

    const assignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", entryId],
        ["staffIds", blockedStaff.id],
        ["status", "confirmed"],
        ["notes", "Manual tamper attempt"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const updatedStaffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const savedAssignment = updatedStaffPayload.assignments.find((record) => record.entryId === entryId);
    assert.ok(savedAssignment);
    assert.deepEqual(savedAssignment.staffIds, []);

    const refreshedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const refreshedOrdersBody = await refreshedOrdersResponse.text();
    assert.equal(refreshedOrdersResponse.status, 200);
    assert.doesNotMatch(refreshedOrdersBody, /Nina Hidden/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("gives managers the same admin workspace access as admins", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-manager-role-route-"));
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

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersStorePayload.users.length, 1);
    const managerUser = usersStorePayload.users[0];
    assert.equal(managerUser.role, "manager");

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffStorePayload.staff.length, 1);
    const managerStaff = staffStorePayload.staff[0];

    const accountLoginResponse = await fetch(`${started.baseUrl}/admin/login`, {
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
    assert.ok(!getCookieValue(getSetCookies(accountLoginResponse), "shynli_admin_challenge"));

    const userSessionCookieValue = getCookieValue(getSetCookies(accountLoginResponse), "shynli_user_session");
    assert.ok(userSessionCookieValue);

    const accountDashboardResponse = await fetch(`${started.baseUrl}/account?focus=w9`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountDashboardResponse.status, 303);
    assert.equal(accountDashboardResponse.headers.get("location"), "/admin");

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardBody, /Обзор/i);
    assert.match(dashboardBody, /Менеджер/i);

    const managerWorkspacePages = [
      { path: "/admin/orders", pattern: /Заказы/i },
      { path: "/admin/clients", pattern: /Клиенты/i },
      { path: "/admin/staff", pattern: /Сотрудники/i },
      { path: "/admin/quote-ops", pattern: /Заявки/i },
    ];

    for (const page of managerWorkspacePages) {
      const response = await fetch(`${started.baseUrl}${page.path}`, {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      });
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, page.pattern);
    }

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, /aria-label="Удалить пользователя"/i);
    assert.match(settingsBody, /Почта приглашений/i);

    const updateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "update_user",
        userId: managerUser.id,
        staffId: managerStaff.id,
        name: "Marta Greene",
        role: "manager",
        status: "active",
        staffStatus: "active",
        email: "marta.manager@example.com",
        phone: "3315550198",
        address: "500 Executive Dr, Naperville, IL 60563",
        notes: "Updated by manager session",
        password: "",
      }),
    });
    assert.equal(updateUserResponse.status, 303);
    assert.match(updateUserResponse.headers.get("location") || "", /notice=user-updated/);

    const ajaxUpdateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update_user",
        userId: managerUser.id,
        staffId: managerStaff.id,
        name: "Marta Greene",
        role: "manager",
        status: "active",
        staffStatus: "active",
        email: "marta.manager@example.com",
        phone: "3315550198",
        address: "500 Executive Dr, Naperville, IL 60563",
        notes: "Updated by manager session via ajax",
        password: "",
      }),
    });
    assert.equal(ajaxUpdateUserResponse.status, 200);
    const ajaxUpdateUserPayload = await ajaxUpdateUserResponse.json();
    assert.equal(ajaxUpdateUserPayload.ok, true);
    assert.equal(ajaxUpdateUserPayload.notice, "user-updated");

    const updatedUsersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(updatedUsersStorePayload.users[0].phone, "+1(331)555-0198");

    const connectMailResponse = await fetch(`${started.baseUrl}/admin/google-mail/connect`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(connectMailResponse.status, 303);
    assert.match(connectMailResponse.headers.get("location") || "", /notice=mail-unavailable/);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
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

test("shows a readable SMTP invite error in the users settings page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-invite-error-route-"));
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
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify({
        staff: [
          {
            id: "staff-relay-1",
            name: "Relay Tester",
            role: "Cleaner",
            status: "active",
            email: "relay.tester@example.com",
          },
        ],
        assignments: [],
      }, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      usersStorePath,
      `${JSON.stringify({
        users: [
          {
            id: "user-relay-1",
            staffId: "staff-relay-1",
            email: "relay.tester@example.com",
            phone: "+1(312)555-0111",
            passwordHash: hashPassword("StrongPass123!"),
            status: "active",
            role: "cleaner",
            emailVerificationRequired: true,
            emailVerifiedAt: "",
            inviteEmailLastError:
              "ACCOUNT_INVITE_EMAIL_SEND_FAILED:535-5.7.8 Username and Password not accepted.",
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();

    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Ждёт подтверждения email/i);
    assert.match(settingsBody, /SMTP не принял логин или app password/i);
    assert.doesNotMatch(settingsBody, /Отправить письмо ещё раз/i);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("shows Gmail connect controls in the users settings page when Google Mail OAuth is configured", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GOOGLE_MAIL_CLIENT_ID: "gmail-client-id",
    GOOGLE_MAIL_CLIENT_SECRET: "gmail-client-secret",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();

    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Почта приглашений/i);
    assert.match(settingsBody, /<details class="admin-details admin-settings-disclosure">/);
    assert.doesNotMatch(settingsBody, /<details class="admin-details admin-settings-disclosure" open>/);
    assert.match(settingsBody, /Открыть детали/);
    assert.match(settingsBody, />Подключить Gmail</);
    assert.doesNotMatch(settingsBody, /Добавьте GOOGLE_MAIL_CLIENT_ID/i);

    const connectResponse = await fetch(`${started.baseUrl}/admin/google-mail/connect`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });

    assert.equal(connectResponse.status, 303);
    assert.match(connectResponse.headers.get("location") || "", /^https:\/\/accounts\.google\.com\//i);
  } finally {
    await stopServer(started.child);
  }
});

test("deleting a user from settings also deletes the linked staff record", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-delete-user-cascade-"));
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
        name: "Delete Me",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "delete.me@example.com",
        phone: "3125550188",
        address: "101 Main St, Naperville, IL 60540",
        notes: "Cascade delete test",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(usersStorePayload.users.length, 1);
    assert.equal(staffStorePayload.staff.length, 1);

    const deleteUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete_user",
        userId: usersStorePayload.users[0].id,
      }),
    });
    assert.equal(deleteUserResponse.status, 303);
    assert.match(deleteUserResponse.headers.get("location") || "", /notice=user-deleted/);

    const usersAfterDelete = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffAfterDelete = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(usersAfterDelete.users.length, 0);
    assert.equal(staffAfterDelete.staff.length, 0);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("updates linked user access role from the staff edit dialog", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-staff-role-edit-route-"));
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
        name: "Emily Stone",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "emily.cleaner@example.com",
        phone: "3125550144",
        address: "215 North Elm Street, Naperville, IL 60540",
        notes: "Can be promoted from staff dialog",
        password: "CleanerPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const user = usersStorePayload.users[0];
    const staff = staffStorePayload.staff[0];
    assert.equal(user.role, "cleaner");
    assert.equal(staff.role, "Клинер");

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /name="role"/i);
    assert.match(staffPageBody, /<option value="cleaner" selected>Клинер<\/option>/i);
    assert.doesNotMatch(staffPageBody, /Должность/i);

    const updateStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "update-staff",
        staffId: staff.id,
        userId: user.id,
        name: "Emily Stone",
        role: "manager",
        phone: "3125550144",
        email: "emily.cleaner@example.com",
        address: "215 North Elm Street, Naperville, IL 60540",
        compensationValue: "32.5",
        compensationType: "percent",
        status: "active",
        notes: "Promoted from staff dialog",
      }),
    });
    assert.equal(updateStaffResponse.status, 303);
    assert.match(updateStaffResponse.headers.get("location") || "", /notice=staff-updated/);

    const ajaxUpdateStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-staff",
        staffId: staff.id,
        userId: user.id,
        name: "Emily Stone",
        role: "manager",
        phone: "3125550144",
        email: "emily.cleaner@example.com",
        address: "215 North Elm Street, Naperville, IL 60540",
        compensationValue: "32.5",
        compensationType: "percent",
        status: "active",
        notes: "Promoted from staff dialog via ajax",
      }),
    });
    assert.equal(ajaxUpdateStaffResponse.status, 200);
    const ajaxUpdateStaffPayload = await ajaxUpdateStaffResponse.json();
    assert.equal(ajaxUpdateStaffPayload.ok, true);
    assert.equal(ajaxUpdateStaffPayload.notice, "staff-updated");

    const updatedUsersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const updatedStaffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(updatedUsersStorePayload.users[0].role, "manager");
    assert.equal(updatedUsersStorePayload.users[0].phone, "+1(312)555-0144");
    assert.equal(updatedStaffStorePayload.staff[0].role, "Менеджер");
    assert.equal(updatedStaffStorePayload.staff[0].phone, "+1(312)555-0144");
    assert.equal(updatedStaffStorePayload.staff[0].compensationValue, "32.5");
    assert.equal(updatedStaffStorePayload.staff[0].compensationType, "percent");

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "emily.cleaner@example.com",
        password: "CleanerPass123!",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/admin");
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("normalizes malformed stored staff phone values in the edit dialog", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-staff-phone-render-route-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify({
        staff: [
          {
            id: "staff-phone-1",
            name: "Sophia Reed",
            role: "Cleaner",
            status: "active",
            phone: "+1(+1()630-)5550199",
            email: "sophia.reed@example.com",
            address: "1289 Pine St, Aurora, IL 60505",
          },
        ],
        assignments: [],
      }, null, 2)}\n`,
      "utf8"
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const staffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffBody = await staffResponse.text();

    assert.equal(staffResponse.status, 200);
    assert.match(staffBody, /name="phone" value="6305550199"/);
    assert.match(staffBody, /\+1\(630\)555-0199 • sophia\.reed@example\.com/);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("normalizes malformed stored user phone values in settings edit forms", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-settings-user-phone-render-route-"));
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
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify({
        staff: [
          {
            id: "staff-user-phone-1",
            name: "Sophia Reed",
            role: "Cleaner",
            status: "active",
            phone: "+1(+1()630-)5550199",
            email: "sophia.reed@example.com",
            address: "1289 Pine St, Aurora, IL 60505",
          },
        ],
        assignments: [],
      }, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      usersStorePath,
      `${JSON.stringify({
        users: [
          {
            id: "user-phone-1",
            staffId: "staff-user-phone-1",
            email: "sophia.reed@example.com",
            phone: "+1(+1()630-)5550199",
            passwordHash: hashPassword("StrongPass123!"),
            status: "active",
            role: "cleaner",
            emailVerificationRequired: false,
            emailVerifiedAt: new Date().toISOString(),
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();

    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /name="phone" value="6305550199"/);
    assert.match(settingsBody, /\+1\(630\)555-0199/);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("sends an invite email and lets the employee set a first password after email confirmation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-invite-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const smtpServer = await createSmtpTestServer();
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
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
        name: "Invite Cleaner",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "invite.cleaner@example.com",
        phone: "3125550101",
        address: "1289 Rhodes Ln, Naperville, IL 60540",
        notes: "Invite email test",
        password: "",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    assert.match(createUserResponse.headers.get("location") || "", /notice=user-created-email-sent/);

    const usersAfterCreate = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersAfterCreate.users.length, 1);
    assert.equal(usersAfterCreate.users[0].passwordHash, "");
    assert.equal(usersAfterCreate.users[0].emailVerificationRequired, true);
    assert.equal(usersAfterCreate.users[0].emailVerifiedAt, "");
    assert.ok(usersAfterCreate.users[0].inviteEmailSentAt);

    assert.equal(smtpServer.messages.length, 1);
    assert.equal(smtpServer.messages[0].from, "<hello@shynli.com>");
    assert.deepEqual(smtpServer.messages[0].to, ["<invite.cleaner@example.com>"]);
    const rawEmail = decodeQuotedPrintable(smtpServer.messages[0].raw);
    assert.match(rawEmail, /Reply-To: info@shynli\.com/);
    assert.match(rawEmail, /Subject: Confirm your SHYNLI employee email/);
    const verifyUrlMatch = rawEmail.match(/https?:\/\/[^\s]+\/account\/verify-email\?token=[^\s=]+/);
    assert.ok(verifyUrlMatch);
    const verifyUrl = new URL(verifyUrlMatch[0]);
    const verificationToken = verifyUrl.searchParams.get("token");
    assert.ok(verificationToken);

    const blockedLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "invite.cleaner@example.com",
        password: "",
      }),
    });
    const blockedLoginBody = await blockedLoginResponse.text();
    assert.equal(blockedLoginResponse.status, 401);
    assert.match(blockedLoginBody, /Подтвердите email по ссылке из письма/i);

    const verifyResponse = await fetch(
      `${started.baseUrl}/account/verify-email?token=${encodeURIComponent(verificationToken)}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(verifyResponse.status, 303);
    assert.equal(
      verifyResponse.headers.get("location"),
      "/account/login?notice=email-verified-password-setup&email=invite.cleaner%40example.com"
    );
    const passwordSetupCookieValue = getCookieValue(
      getSetCookies(verifyResponse),
      "shynli_user_password_setup"
    );
    assert.ok(passwordSetupCookieValue);

    const verifiedLoginPageResponse = await fetch(
      `${started.baseUrl}/account/login?notice=email-verified-password-setup&email=invite.cleaner%40example.com`
    );
    const verifiedLoginPageBody = await verifiedLoginPageResponse.text();
    assert.equal(verifiedLoginPageResponse.status, 200);
    assert.match(verifiedLoginPageBody, /Email подтверждён/i);
    assert.match(verifiedLoginPageBody, /оставьте пароль пустым и нажмите «Войти»/i);

    const firstLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_password_setup=${passwordSetupCookieValue}`,
      },
      body: new URLSearchParams({
        email: "invite.cleaner@example.com",
        password: "",
      }),
    });
    const firstLoginBody = await firstLoginResponse.text();
    assert.equal(firstLoginResponse.status, 200);
    assert.match(firstLoginBody, /Задайте пароль/i);
    assert.match(firstLoginBody, /Сохранить и войти/i);

    const setupPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_password_setup=${passwordSetupCookieValue}`,
      },
      body: new URLSearchParams({
        action: "setup-first-password",
        email: "invite.cleaner@example.com",
        newPassword: "StrongPass123!",
        confirmPassword: "StrongPass123!",
      }),
    });
    assert.equal(setupPasswordResponse.status, 303);
    assert.equal(setupPasswordResponse.headers.get("location"), "/account");
    assert.ok(getCookieValue(getSetCookies(setupPasswordResponse), "shynli_user_session"));

    const usersAfterVerify = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.ok(usersAfterVerify.users[0].emailVerifiedAt);
    assert.match(usersAfterVerify.users[0].passwordHash, /^scrypt\$/);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
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
