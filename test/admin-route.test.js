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
    assert.match(body, /Admin Login/i);
    assert.match(body, /Continue to 2FA/i);
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
    assert.match(dashboardBody, /Admin Dashboard/i);
    assert.match(dashboardBody, /Signed in as/i);

    const adminPages = [
      { path: "/admin/quote-ops", pattern: /Quote Operations/i },
      { path: "/admin/integrations", pattern: /Integrations/i },
      { path: "/admin/runtime", pattern: /Runtime/i },
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
          serviceType: "deep",
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

    const quoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const quoteOpsBody = await quoteOpsResponse.text();
    assert.equal(quoteOpsResponse.status, 200);
    assert.match(quoteOpsBody, /Jane Doe/);
    assert.match(quoteOpsBody, /ops-request-1/);

    const entryIdMatch = quoteOpsBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

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
