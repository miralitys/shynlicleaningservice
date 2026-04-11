"use strict";

const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAdminConfig, generateTotpCode } = require("../lib/admin-auth");
const { createFetchStub, startServer, stopServer } = require("./server-test-helpers");

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
  assert.equal(loginResponse.headers.get("location"), "/admin/2fa");

  const challengeCookieValue = getCookieValue(getSetCookies(loginResponse), "shynli_admin_challenge");
  assert.ok(challengeCookieValue);

  const code = generateTotpCode(config);
  const twoFactorResponse = await fetch(`${baseUrl}/admin/2fa`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `shynli_admin_challenge=${challengeCookieValue}`,
    },
    body: new URLSearchParams({ code }),
  });

  assert.equal(twoFactorResponse.status, 303);
  assert.equal(twoFactorResponse.headers.get("location"), "/admin");

  const sessionCookieValue = getCookieValue(getSetCookies(twoFactorResponse), "shynli_admin_session");
  assert.ok(sessionCookieValue);
  return sessionCookieValue;
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
        selectedDate: options.selectedDate || "2026-03-22",
        selectedTime: options.selectedTime || "09:00",
        fullAddress: options.fullAddress,
        consent: true,
      },
    }),
  });
}

test("serves the admin login page when admin secrets are configured", async () => {
  const started = await startServer({
    env: {
      ADMIN_MASTER_SECRET: "admin_secret_test",
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/admin/login`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Вход в админку/i);
    assert.match(body, /Продолжить/i);
  } finally {
    await stopServer(started.child);
  }
});

test("completes the admin login and TOTP verification flow", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const unauthenticated = await fetch(`${started.baseUrl}/admin`, {
      redirect: "manual",
    });
    assert.equal(unauthenticated.status, 303);
    assert.equal(unauthenticated.headers.get("location"), "/admin/login");

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

    assert.equal(loginResponse.status, 303);
    assert.equal(loginResponse.headers.get("location"), "/admin/2fa");

    const loginCookies = getSetCookies(loginResponse);
    const challengeCookieValue = getCookieValue(loginCookies, "shynli_admin_challenge");
    assert.ok(challengeCookieValue);

    const code = generateTotpCode(config);
    const twoFactorResponse = await fetch(`${started.baseUrl}/admin/2fa`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_challenge=${challengeCookieValue}`,
      },
      body: new URLSearchParams({ code }),
    });

    assert.equal(twoFactorResponse.status, 303);
    assert.equal(twoFactorResponse.headers.get("location"), "/admin");

    const sessionCookieValue = getCookieValue(getSetCookies(twoFactorResponse), "shynli_admin_session");
    assert.ok(sessionCookieValue);

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardBody, /Обзор/i);
    assert.match(dashboardBody, /Вы вошли как/i);

    const adminPages = [
      { path: "/admin/clients", pattern: /Клиенты/i },
      { path: "/admin/orders", pattern: /Заказы/i },
      { path: "/admin/staff", pattern: /Сотрудники/i },
      { path: "/admin/quote-ops", pattern: /Заявки/i },
    ];

    for (const page of adminPages) {
      const response = await fetch(`${started.baseUrl}${page.path}`, {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      });
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, page.pattern);
    }

    for (const path of ["/admin/integrations", "/admin/runtime"]) {
      const response = await fetch(`${started.baseUrl}${path}`, {
        redirect: "manual",
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"), "/admin");
    }

    const logoutResponse = await fetch(`${started.baseUrl}/admin/logout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    assert.equal(logoutResponse.status, 303);
    assert.equal(logoutResponse.headers.get("location"), "/admin/login");
  } finally {
    await stopServer(started.child);
  }
});

test("shows recent quote submissions in admin quote ops, exports CSV, and retries CRM sync", async () => {
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
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
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

    const challengeCookieValue = getCookieValue(getSetCookies(loginResponse), "shynli_admin_challenge");
    const code = generateTotpCode(config);
    const twoFactorResponse = await fetch(`${started.baseUrl}/admin/2fa`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_challenge=${challengeCookieValue}`,
      },
      body: new URLSearchParams({ code }),
    });

    const sessionCookieValue = getCookieValue(getSetCookies(twoFactorResponse), "shynli_admin_session");
    assert.ok(sessionCookieValue);

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Jane Doe/);
    assert.match(ordersBody, /Weekly/);
    assert.match(ordersBody, /Scheduled/);

    const entryIdMatch = ordersBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

    const saveOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/orders",
        orderStatus: "rescheduled",
        assignedStaff: "Maria",
        selectedDate: "2026-03-24",
        selectedTime: "11:30",
        frequency: "monthly",
      }),
    });
    assert.equal(saveOrderResponse.status, 303);
    assert.match(saveOrderResponse.headers.get("location") || "", /notice=order-saved/);

    const updatedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedOrdersBody = await updatedOrdersResponse.text();
    assert.equal(updatedOrdersResponse.status, 200);
    assert.match(updatedOrdersBody, /Rescheduled/);
    assert.match(updatedOrdersBody, /Maria/);
    assert.match(updatedOrdersBody, /Monthly/);
    assert.match(updatedOrdersBody, /value="2026-03-24"/);
    assert.match(updatedOrdersBody, /value="11:30"/);

    const quoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const quoteOpsBody = await quoteOpsResponse.text();
    assert.equal(quoteOpsResponse.status, 200);
    assert.match(quoteOpsBody, /Jane Doe/);
    assert.match(quoteOpsBody, /ops-request-1/);

    const exportResponse = await fetch(`${started.baseUrl}/admin/quote-ops/export.csv`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const exportBody = await exportResponse.text();
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") || "", /text\/csv/i);
    assert.match(exportBody, /Jane Doe/);
    assert.match(exportBody, /ops-request-1/);

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

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 2);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("renders the clients table with filters and request history", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-clients-123",
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
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteSubmissions = [
      {
        requestId: "client-request-1",
        fullName: "John Smith",
        phone: "312-555-0109",
        email: "john@example.com",
        serviceType: "regular",
        selectedDate: "2026-03-20",
        selectedTime: "10:30",
        fullAddress: "456 Oak Ave, Naperville, IL 60540",
      },
      {
        requestId: "client-request-2",
        fullName: "Jane Doe",
        phone: "312-555-0100",
        email: "jane@example.com",
        serviceType: "deep",
        selectedDate: "2026-03-22",
        selectedTime: "09:00",
        fullAddress: "123 Main St, Romeoville, IL 60446",
      },
      {
        requestId: "client-request-3",
        fullName: "Jane Doe",
        phone: "312-555-0100",
        email: "jane@example.com",
        serviceType: "moving",
        rooms: 5,
        bathrooms: 3,
        squareMeters: 2200,
        selectedDate: "2026-03-29",
        selectedTime: "13:00",
        fullAddress: "789 Cedar Ln, Plainfield, IL 60544",
      },
    ];

    for (const quote of quoteSubmissions) {
      const quoteResponse = await submitQuote(started.baseUrl, quote);
      assert.equal(quoteResponse.status, 201);
    }

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const clientsResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const clientsBody = await clientsResponse.text();

    assert.equal(clientsResponse.status, 200);
    assert.match(clientsBody, /База клиентов/i);
    assert.match(clientsBody, /Последняя заявка/i);
    assert.match(clientsBody, /Сумма заказов/i);
    assert.match(clientsBody, /Jane Doe/);
    assert.match(clientsBody, /John Smith/);
    assert.match(clientsBody, /client-request-2/);
    assert.match(clientsBody, /client-request-3/);

    const nameFilterResponse = await fetch(`${started.baseUrl}/admin/clients?name=John`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const nameFilterBody = await nameFilterResponse.text();
    assert.equal(nameFilterResponse.status, 200);
    assert.match(nameFilterBody, /John Smith/);
    assert.doesNotMatch(nameFilterBody, /Jane Doe/);

    const emailFilterResponse = await fetch(`${started.baseUrl}/admin/clients?email=jane@example.com`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const emailFilterBody = await emailFilterResponse.text();
    assert.equal(emailFilterResponse.status, 200);
    assert.match(emailFilterBody, /Jane Doe/);
    assert.match(emailFilterBody, /client-request-2/);
    assert.match(emailFilterBody, /client-request-3/);
    assert.doesNotMatch(emailFilterBody, /John Smith/);

    const phoneFilterResponse = await fetch(`${started.baseUrl}/admin/clients?phone=3125550109`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const phoneFilterBody = await phoneFilterResponse.text();
    assert.equal(phoneFilterResponse.status, 200);
    assert.match(phoneFilterBody, /John Smith/);
    assert.doesNotMatch(phoneFilterBody, /Jane Doe/);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});
