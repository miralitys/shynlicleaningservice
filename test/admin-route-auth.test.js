"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateTotpCode, loadAdminConfig } = require("../lib/admin-auth");
const { startServer, stopServer } = require("./server-test-helpers");

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

function getInlineScripts(html) {
  return Array.from(html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g), (match) => match[1]).filter(Boolean);
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
    for (const script of getInlineScripts(body)) {
      assert.doesNotThrow(() => new Function(script));
    }
  } finally {
    await stopServer(started.child);
  }
});

test("completes the admin login flow without a second factor", async () => {
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

    const legacyTwoFactorPath = await fetch(`${started.baseUrl}/admin/2fa`, {
      redirect: "manual",
    });
    assert.equal(legacyTwoFactorPath.status, 303);
    assert.equal(legacyTwoFactorPath.headers.get("location"), "/admin/login");

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
    assert.equal(loginResponse.headers.get("location"), "/admin");

    const sessionCookieValue = getCookieValue(getSetCookies(loginResponse), "shynli_admin_session");
    assert.ok(sessionCookieValue);

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    const refreshedSessionCookie =
      getSetCookies(dashboardResponse).find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
    assert.match(refreshedSessionCookie, /Path=\//);
    assert.match(dashboardBody, /Обзор/i);
    assert.match(dashboardBody, /Выйти/i);
    assert.match(dashboardBody, /admin-sidebar-workspace-card/);
    assert.match(dashboardBody, /admin-sidebar-logout-button/);
    assert.match(dashboardBody, /data-admin-logout-form="true"/);
    assert.match(dashboardBody, /data-admin-logout-trigger="true"/);
    assert.doesNotMatch(dashboardBody, /admin-topbar/i);
    assert.doesNotMatch(dashboardBody, /Вы вошли как/i);

    const adminPages = [
      { path: "/admin/clients", pattern: /Клиенты/i },
      { path: "/admin/orders", pattern: /Заказы/i },
      { path: "/admin/staff", pattern: /Сотрудники/i },
      { path: "/admin/settings", pattern: /Пользователи/i },
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
      assert.doesNotMatch(body, /Вы вошли как/i);
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

test("requires a second factor when ADMIN_TOTP_SECRET is configured", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const loginPageResponse = await fetch(`${started.baseUrl}/admin/login`);
    const loginPageBody = await loginPageResponse.text();
    assert.equal(loginPageResponse.status, 200);
    assert.match(loginPageBody, /код из приложения/i);

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
    const challengeCookieValue = getCookieValue(getSetCookies(loginResponse), "shynli_admin_challenge");
    assert.ok(challengeCookieValue);
    assert.equal(getCookieValue(getSetCookies(loginResponse), "shynli_admin_session"), "");

    const twoFactorPageResponse = await fetch(`${started.baseUrl}/admin/2fa`, {
      headers: {
        cookie: `shynli_admin_challenge=${challengeCookieValue}`,
      },
    });
    const twoFactorPageBody = await twoFactorPageResponse.text();
    assert.equal(twoFactorPageResponse.status, 200);
    assert.match(twoFactorPageBody, /Подтверждение входа/i);
    assert.match(twoFactorPageBody, /Шаг 2 из 2/i);

    const twoFactorResponse = await fetch(`${started.baseUrl}/admin/2fa`, {
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
    const sessionCookieValue = getCookieValue(getSetCookies(twoFactorResponse), "shynli_admin_session");
    assert.ok(sessionCookieValue);

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    assert.equal(dashboardResponse.status, 200);
  } finally {
    await stopServer(started.child);
  }
});

test("sets admin auth cookies with SameSite=Lax for OAuth return flows", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
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

    const loginCookies = getSetCookies(loginResponse);
    const sessionCookie = loginCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
    assert.match(sessionCookie, /SameSite=Lax/i);
  } finally {
    await stopServer(started.child);
  }
});
