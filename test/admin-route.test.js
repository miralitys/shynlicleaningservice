"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { hashPassword, loadAdminConfig, generateTotpCode } = require("../lib/admin-auth");
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

function getInlineScripts(html) {
  return Array.from(html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g), (match) => match[1]).filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function getStaffAssignmentEntryIdByCustomerName(html, customerName) {
  const match = String(html || "").match(
    new RegExp(
      `<dialog class="admin-dialog admin-dialog-wide" id="admin-staff-assignment-dialog-[^"]+"[\\s\\S]*?<h2 class="admin-dialog-title"[^>]*>${escapeRegex(customerName)}<\\/h2>[\\s\\S]*?<input type="hidden" name="entryId" value="([^"]+)"`,
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
    for (const script of getInlineScripts(body)) {
      assert.doesNotThrow(() => new Function(script));
    }
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
    assert.match(dashboardBody, /Выйти/i);
    assert.match(dashboardBody, /admin-sidebar-workspace-card/);
    assert.match(dashboardBody, /admin-sidebar-logout-button/);
    assert.doesNotMatch(dashboardBody, /admin-topbar/i);
    assert.doesNotMatch(dashboardBody, /Вы вошли как/i);

    const adminPages = [
      { path: "/admin/clients", pattern: /Клиенты/i },
      { path: "/admin/orders", pattern: /Заказы/i },
      { path: "/admin/staff", pattern: /Сотрудники/i },
      { path: "/admin/settings", pattern: /Шаблоны чек-листов/i },
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

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

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
    assert.match(dashboardBody, /Клиенты без команды/i);
    assert.match(dashboardBody, /Заказы на сегодня/i);
    assert.ok(dashboardBody.indexOf("Назначена дата") < dashboardBody.indexOf("Новые заявки"));
    assert.ok(dashboardBody.indexOf("Новые заявки") < dashboardBody.indexOf("Клиенты без команды"));
    assert.ok(dashboardBody.indexOf("Клиенты без команды") < dashboardBody.indexOf("Заказы на сегодня"));

    const newRequestsSection = dashboardBody.match(
      /data-admin-dashboard-new-requests="true"[\s\S]*?<\/table>/
    )?.[0];
    const unassignedSection = dashboardBody.match(
      /data-admin-dashboard-unassigned-clients="true"[\s\S]*?<\/table>/
    )?.[0];
    const todaySection = dashboardBody.match(
      /data-admin-dashboard-today-orders="true"[\s\S]*?<\/table>/
    )?.[0];

    assert.ok(newRequestsSection);
    assert.ok(unassignedSection);
    assert.ok(todaySection);
    assert.match(newRequestsSection, /Today Assigned/);
    assert.match(newRequestsSection, /Future No Team/);
    assert.match(newRequestsSection, /overview-future-1/);
    assert.match(unassignedSection, /Future No Team/);
    assert.doesNotMatch(unassignedSection, /Today Assigned/);
    assert.match(todaySection, /Today Assigned/);
    assert.match(todaySection, /Anna Petrova/);
    assert.doesNotMatch(todaySection, /Future No Team/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
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
    const challengeCookie = loginCookies.find((cookie) => cookie.startsWith("shynli_admin_challenge=")) || "";
    assert.match(challengeCookie, /SameSite=Lax/i);

    const challengeCookieValue = getCookieValue(loginCookies, "shynli_admin_challenge");
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

    const twoFactorCookies = getSetCookies(twoFactorResponse);
    const sessionCookie = twoFactorCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
    assert.match(sessionCookie, /SameSite=Lax/i);
  } finally {
    await stopServer(started.child);
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

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings`, {
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

test("creates staff members and assigns them to orders through the staff workspace", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-staff-route-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-staff-123",
        },
      },
    },
  ]);
  const storePath = path.join(tempDir, "admin-staff-store.json");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: storePath,
    GOOGLE_PLACES_API_KEY: "places_test_key",
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
      requestId: "staff-request-1",
      fullName: "Jane Doe",
      phone: "312-555-0100",
      email: "jane@example.com",
      serviceType: "deep",
      selectedDate: "2026-03-25",
      selectedTime: "12:00",
      fullAddress: "123 Main St, Romeoville, IL 60446",
    });
    assert.equal(quoteResponse.status, 201);

    const secondQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "staff-request-2",
      fullName: "Mary Pending",
      phone: "312-555-0108",
      email: "mary@example.com",
      serviceType: "standard",
      selectedDate: "2026-03-26",
      selectedTime: "09:00",
      fullAddress: "456 Oak Ave, Plainfield, IL 60544",
    });
    assert.equal(secondQuoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const createStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-staff",
        name: "Olga Stone",
        role: "manager",
        phone: "13125550199123456789",
        email: "olga@example.com",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        compensationValue: "180",
        compensationType: "fixed",
        status: "active",
        notes: "Prefers morning jobs",
      }),
    });
    assert.equal(createStaffResponse.status, 303);
    assert.match(createStaffResponse.headers.get("location") || "", /notice=staff-created/);

    const staffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffBody = await staffResponse.text();
    assert.equal(staffResponse.status, 200);
    assert.match(staffBody, /class="admin-compact-summary-strip"/);
    assert.doesNotMatch(staffBody, /class="admin-stats-grid"/);
    assert.match(staffBody, /class="admin-nav-sublinks"/);
    assert.match(staffBody, /class="admin-nav-sublink" href="\/admin\/staff\?section=calendar">Календарь<\/a>/);
    assert.match(staffBody, /class="admin-nav-sublink" href="\/admin\/staff\?section=assignments">График<\/a>/);
    assert.match(staffBody, /href="\/admin\/staff\?section=team"/);
    assert.match(staffBody, /href="\/admin\/staff\?section=calendar&calendarStart=/);
    assert.match(staffBody, /href="\/admin\/staff\?section=assignments"/);
    assert.doesNotMatch(staffBody, /href="\/admin\/settings\?section=users"/);
    assert.match(staffBody, /Оплата/i);
    assert.match(staffBody, /\$180\.00/);
    assert.doesNotMatch(staffBody, />Добавить сотрудника</);
    assert.doesNotMatch(staffBody, /data-admin-dialog-open="admin-staff-create-dialog"/);
    assert.doesNotMatch(staffBody, /<dialog class="admin-dialog" id="admin-staff-create-dialog"/);
    assert.match(staffBody, /<dialog class="admin-dialog admin-confirm-dialog" id="admin-confirm-dialog"/);
    assert.match(staffBody, /Точно удалить\?/);
    assert.match(staffBody, /class="admin-table admin-staff-table"/);
    assert.doesNotMatch(staffBody, /class="admin-table admin-team-calendar-table"/);
    assert.doesNotMatch(staffBody, /class="admin-table admin-staff-schedule-table"/);
    assert.match(staffBody, /class="admin-table-row-clickable"/);
    assert.match(staffBody, /data-admin-dialog-row="true"/);
    assert.match(staffBody, /data-admin-dialog-open="admin-staff-edit-dialog-/);
    assert.match(staffBody, /aria-label="Открыть карточку сотрудника /);
    assert.match(staffBody, /class="admin-table-link">Olga Stone<\/span>/);
    assert.match(staffBody, /Olga Stone <span class="admin-staff-dialog-title-role">\(Менеджер\)<\/span>/);
    assert.match(staffBody, /\+1\(312\)555-0199 • olga@example.com/);
    assert.doesNotMatch(staffBody, /<th>Действие<\/th>/);
    assert.doesNotMatch(staffBody, /<p class="admin-kicker">Сотрудники<\/p>/);
    assert.doesNotMatch(staffBody, /Ближайшая загрузка/);
    assert.doesNotMatch(staffBody, /Контакты и локация/);
    assert.doesNotMatch(staffBody, /Редактирование карточки/);
    assert.match(staffBody, /data-admin-toggle-target="admin-staff-edit-dialog-.*-edit-panel"/);
    assert.match(staffBody, /class="admin-icon-button admin-edit-button"/);
    assert.match(staffBody, /data-admin-toggle-icon="true"/);
    assert.match(staffBody, /aria-label="Редактировать сотрудника"/);
    assert.match(staffBody, /data-admin-toggle-panel hidden/);
    assert.match(staffBody, /name="address"/);
    assert.match(staffBody, /data-admin-address-autocomplete="true"/);
    assert.match(staffBody, /data-admin-address-suggestions/);
    assert.match(staffBody, /places_test_key/);
    assert.match(staffBody, /__adminGooglePlacesReady/);
    assert.doesNotMatch(staffBody, /data-admin-phone-input="true"/);
    assert.match(staffBody, /maxlength="10"/);
    assert.match(staffBody, /placeholder="6305550101"/);
    assert.match(staffBody, /oninput="this\.value=this\.value\.replace/);
    assert.match(staffBody, /slice\(0,10\)"/);
    assert.match(staffBody, /aria-label="Удалить сотрудника"/);
    assert.doesNotMatch(staffBody, /Удаление очистит его назначения в графике/);
    assert.match(staffBody, /Olga Stone/);
    assert.match(staffBody, /Менеджер/);
    assert.match(staffBody, /742 Cedar Avenue, Aurora, IL 60506/);
    assert.match(staffBody, /Jane Doe/);

    const staffIdMatch = staffBody.match(/name="staffId" value="([^"]+)"/);
    assert.ok(staffIdMatch);
    const staffId = staffIdMatch[1];

    const entryId = getStaffAssignmentEntryIdByCustomerName(staffBody, "Jane Doe");
    assert.ok(entryId);

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
        ["staffIds", staffId],
        ["status", "confirmed"],
        ["notes", "Bring ladder"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const updatedStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedStaffBody = await updatedStaffResponse.text();
    assert.equal(updatedStaffResponse.status, 200);
    assert.match(updatedStaffBody, /Подтверждено/);
    assert.match(updatedStaffBody, /Bring ladder/);
    assert.match(updatedStaffBody, /Olga Stone/);

    const calendarSectionResponse = await fetch(`${started.baseUrl}/admin/staff?section=calendar&calendarStart=2026-03-25`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const calendarSectionBody = await calendarSectionResponse.text();
    assert.equal(calendarSectionResponse.status, 200);
    assert.match(calendarSectionBody, /class="admin-table admin-team-calendar-table"/);
    assert.match(calendarSectionBody, /data-admin-team-calendar="true"/);
    assert.match(calendarSectionBody, /data-admin-team-calendar-scroll="true"/);
    assert.match(calendarSectionBody, /admin-team-calendar-wrap-dragging/);
    assert.match(calendarSectionBody, /class="admin-team-calendar-entry admin-team-calendar-entry-button admin-team-calendar-entry-order/);
    assert.match(calendarSectionBody, /data-admin-dialog-open="admin-staff-assignment-dialog-/);
    assert.match(calendarSectionBody, /aria-label="Открыть заказ Jane Doe"/);
    assert.match(calendarSectionBody, /class="admin-dialog admin-dialog-wide" id="admin-staff-assignment-dialog-/);
    assert.match(calendarSectionBody, /class="admin-nav-link admin-nav-link-parent-active" href="\/admin\/staff">Сотрудники<\/a>/);
    assert.match(calendarSectionBody, /class="admin-nav-sublink admin-nav-sublink-active" href="\/admin\/staff\?section=calendar">Календарь<\/a>/);

    const assignmentsSectionResponse = await fetch(`${started.baseUrl}/admin/staff?section=assignments`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const assignmentsSectionBody = await assignmentsSectionResponse.text();
    assert.equal(assignmentsSectionResponse.status, 200);
    assert.match(assignmentsSectionBody, /class="admin-table admin-staff-schedule-table"/);
    assert.doesNotMatch(assignmentsSectionBody, /class="admin-table admin-staff-table"/);
    assert.match(assignmentsSectionBody, /<th>Дорога<\/th>/);
    assert.match(assignmentsSectionBody, /data-admin-travel-estimate="true"/);
    assert.match(assignmentsSectionBody, /Из дома: считаем маршрут/i);
    assert.match(assignmentsSectionBody, /importLibrary\("routes"\)/);
    assert.match(assignmentsSectionBody, /RouteMatrix\.computeRouteMatrix/);
    assert.doesNotMatch(assignmentsSectionBody, /DistanceMatrixService/);
    assert.match(assignmentsSectionBody, /Маршрут считается от дома сотрудника или от предыдущего заказа в этот день\./);
    const assignmentsTable = assignmentsSectionBody.match(
      /<table class="admin-table admin-staff-schedule-table">[\s\S]*?<\/table>/
    )?.[0];
    assert.ok(assignmentsTable);
    assert.match(assignmentsTable, /Mary Pending/);
    assert.match(assignmentsTable, /Jane Doe/);
    assert.ok(assignmentsTable.indexOf("Mary Pending") < assignmentsTable.indexOf("Jane Doe"));
    assert.match(assignmentsTable, /Mary Pending[\s\S]*Команда не назначена/i);
    assert.match(assignmentsSectionBody, /class="admin-nav-sublink admin-nav-sublink-active" href="\/admin\/staff\?section=assignments">График<\/a>/);

    const storePayload = JSON.parse(await fs.readFile(storePath, "utf8"));
    assert.equal(storePayload.staff.length, 1);
    assert.equal(storePayload.assignments.length, 1);
    assert.equal(storePayload.staff[0].phone, "+1(312)555-0199");
    assert.equal(storePayload.staff[0].address, "742 Cedar Avenue, Aurora, IL 60506");
    assert.equal(storePayload.assignments[0].entryId, entryId);
    assert.deepEqual(storePayload.assignments[0].staffIds, [staffId]);

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Olga Stone/);
    assert.doesNotMatch(ordersBody, /Сотрудники и график/);
    assert.match(ordersBody, /class="admin-order-multiselect"/);
    assert.match(ordersBody, /type="checkbox" name="assignedStaff" value="Olga Stone" checked/);

    const clearResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "clear-assignment",
        entryId,
      }),
    });
    assert.equal(clearResponse.status, 303);
    assert.match(clearResponse.headers.get("location") || "", /notice=assignment-cleared/);

    const clearedStorePayload = JSON.parse(await fs.readFile(storePath, "utf8"));
    assert.equal(clearedStorePayload.assignments.length, 0);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("connects a cleaner to Google Calendar and syncs confirmed assignments into SHYNLI Work", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-google-calendar-route-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-google-123",
        },
      },
    },
    {
      method: "POST",
      match: "oauth2.googleapis.com/token",
      status: 200,
      body: {
        access_token: "google-access-1",
        refresh_token: "google-refresh-1",
        expires_in: 3600,
        token_type: "Bearer",
      },
    },
    {
      method: "GET",
      match: "/users/me/calendarList",
      status: 200,
      body: {
        items: [
          {
            id: "cleaner.one@gmail.com",
            primary: true,
            summary: "cleaner.one@gmail.com",
          },
          {
            id: "work-cal-1",
            summary: "SHYNLI Work",
          },
          {
            id: "dayoff-cal-1",
            summary: "SHYNLI Unavailable",
          },
        ],
      },
    },
    {
      method: "GET",
      match: "/calendars/dayoff-cal-1/events",
      status: 200,
      body: {
        items: [],
      },
    },
    {
      method: "POST",
      match: "/calendars/work-cal-1/events",
      status: 200,
      body: {
        id: "work-event-1",
        htmlLink: "https://calendar.google.com/event?eid=work-event-1",
      },
    },
  ]);
  const storePath = path.join(tempDir, "admin-staff-store.json");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: storePath,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    GOOGLE_CALENDAR_CLIENT_ID: "google-client-id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "google-client-secret",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "google-calendar-request-1",
      fullName: "Emily Johnson",
      phone: "312-555-0198",
      email: "emily@example.com",
      serviceType: "deep",
      selectedDate: "2026-04-18",
      selectedTime: "09:00",
      fullAddress: "215 North Elm Street, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const createStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-staff",
        name: "Anna Petrova",
        role: "Cleaner",
        phone: "13125550199",
        email: "cleaner.one@gmail.com",
        status: "active",
      }),
    });
    assert.equal(createStaffResponse.status, 303);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Подключить Google Calendar/);

    const staffIdMatch = staffPageBody.match(/name="staffId" value="([^"]+)"/);
    assert.ok(staffIdMatch);
    const staffId = staffIdMatch[1];

    const entryIdMatch = staffPageBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

    const connectResponse = await fetch(
      `${started.baseUrl}/admin/staff/google/connect?staffId=${encodeURIComponent(staffId)}`,
      {
        redirect: "manual",
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(connectResponse.status, 303);
    const googleLocation = connectResponse.headers.get("location") || "";
    assert.match(googleLocation, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    const googleUrl = new URL(googleLocation);
    const state = googleUrl.searchParams.get("state") || "";
    assert.ok(state);

    const callbackResponse = await fetch(
      `${started.baseUrl}/admin/google-calendar/callback?code=test-code&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(callbackResponse.status, 303);
    assert.match(callbackResponse.headers.get("location") || "", /notice=calendar-connected/);

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
        ["staffIds", staffId],
        ["status", "confirmed"],
        ["notes", "Bring green kit"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const calendarPageResponse = await fetch(`${started.baseUrl}/admin/staff?section=calendar&calendarStart=2026-04-18`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const calendarPageBody = await calendarPageResponse.text();
    assert.equal(calendarPageResponse.status, 200);
    assert.match(calendarPageBody, /class="admin-table admin-team-calendar-table"/);
    assert.match(calendarPageBody, /class="admin-team-calendar-entry-title">Emily Johnson<\/strong>/);

    const storePayload = JSON.parse(await fs.readFile(storePath, "utf8"));
    assert.equal(storePayload.staff[0].calendar.accountEmail, "cleaner.one@gmail.com");
    assert.equal(storePayload.staff[0].calendar.workCalendarId, "work-cal-1");
    assert.equal(storePayload.assignments[0].calendarSync.google.byStaffId[staffId].eventId, "work-event-1");

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(
      captureLines.some(
        (record) =>
          record.method === "POST" &&
          record.url.includes("/calendars/work-cal-1/events") &&
          /SHYNLI: Emily Johnson/i.test(record.body)
      )
    );
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("blocks assignment when a connected cleaner marked day off in SHYNLI Unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-google-calendar-conflict-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-google-456",
        },
      },
    },
    {
      method: "POST",
      match: "oauth2.googleapis.com/token",
      status: 200,
      body: {
        access_token: "google-access-2",
        refresh_token: "google-refresh-2",
        expires_in: 3600,
        token_type: "Bearer",
      },
    },
    {
      method: "GET",
      match: "/users/me/calendarList",
      status: 200,
      body: {
        items: [
          {
            id: "cleaner.two@gmail.com",
            primary: true,
            summary: "cleaner.two@gmail.com",
          },
          {
            id: "work-cal-2",
            summary: "SHYNLI Work",
          },
          {
            id: "dayoff-cal-2",
            summary: "SHYNLI Unavailable",
          },
        ],
      },
    },
    {
      method: "GET",
      match: "/calendars/dayoff-cal-2/events",
      status: 200,
      body: {
        items: [
          {
            id: "dayoff-1",
            summary: "Day off",
            start: { date: "2026-04-18" },
            end: { date: "2026-04-19" },
          },
        ],
      },
    },
  ]);
  const storePath = path.join(tempDir, "admin-staff-store.json");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: storePath,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    GOOGLE_CALENDAR_CLIENT_ID: "google-client-id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "google-client-secret",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "google-calendar-request-2",
      fullName: "Sophia Lee",
      phone: "312-555-0112",
      email: "sophia@example.com",
      serviceType: "deep",
      selectedDate: "2026-04-18",
      selectedTime: "10:00",
      fullAddress: "742 Cedar Avenue, Aurora, IL 60506",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-staff",
        name: "Diana Brooks",
        role: "Cleaner",
        phone: "13125550177",
        email: "cleaner.two@gmail.com",
        status: "active",
      }),
    });

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    const staffId = (staffPageBody.match(/name="staffId" value="([^"]+)"/) || [])[1];
    const entryId = (staffPageBody.match(/name="entryId" value="([^"]+)"/) || [])[1];
    assert.ok(staffId);
    assert.ok(entryId);

    const connectResponse = await fetch(
      `${started.baseUrl}/admin/staff/google/connect?staffId=${encodeURIComponent(staffId)}`,
      {
        redirect: "manual",
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const googleUrl = new URL(connectResponse.headers.get("location"));
    const state = googleUrl.searchParams.get("state") || "";
    assert.ok(state);

    const callbackResponse = await fetch(
      `${started.baseUrl}/admin/google-calendar/callback?code=test-code-2&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(callbackResponse.status, 303);

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
        ["staffIds", staffId],
        ["status", "confirmed"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-conflict/);
    assert.match(assignResponse.headers.get("location") || "", /staff=Diana/);

    const calendarPageResponse = await fetch(`${started.baseUrl}/admin/staff?section=calendar&calendarStart=2026-04-18`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const calendarPageBody = await calendarPageResponse.text();
    assert.equal(calendarPageResponse.status, 200);
    assert.match(calendarPageBody, /admin-team-calendar-entry-unavailable/);
    assert.match(calendarPageBody, /class="admin-team-calendar-entry-time">All day<\/span>/);
    assert.match(calendarPageBody, /class="admin-team-calendar-entry-title">Day off<\/strong>/);

    const storePayload = JSON.parse(await fs.readFile(storePath, "utf8"));
    assert.equal(storePayload.assignments.length, 0);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
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
          hasPets: "yes",
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
    assert.match(ordersBody, /Scheduled/);
    assert.match(ordersBody, /admin-compact-summary-strip/);
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
    assert.doesNotMatch(ordersBody, /admin-kicker">Заказы</);
    assert.doesNotMatch(ordersBody, /admin-card-eyebrow">Заказы</);
    assert.match(ordersBody, /Поля из формы клиента/);
    assert.match(ordersBody, /admin-delete-button/);
    assert.match(ordersBody, /Inside Cabinets Cleaning/);
    assert.match(ordersBody, /Interior Windows Cleaning/);
    assert.match(ordersBody, /Apt 4B/);
    assert.match(ordersBody, /Romeoville/);
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
    assert.match(focusedOrderBody, /data-admin-picker-trigger="date"/);
    assert.match(focusedOrderBody, /data-admin-picker-trigger="time"/);
    assert.match(focusedOrderBody, /data-admin-time-panel/);
    assert.match(focusedOrderBody, /<option value="AM">AM<\/option>/);
    assert.match(focusedOrderBody, /<option value="PM">PM<\/option>/);
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
    assert.doesNotMatch(focusedOrderBody, /Заказ выглядит готовым к работе/);
    assert.doesNotMatch(focusedOrderBody, /admin-order-brief-fact-label">Дата</);
    assert.doesNotMatch(focusedOrderBody, /admin-order-brief-fact-label">Время</);
    assert.match(focusedOrderBody, /Olga Martinez/);
    assert.match(focusedOrderBody, /type="checkbox" name="assignedStaff" value="Olga Martinez" checked/);

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
    assert.match(teamUpdatedBody, /Anna Petrova, Diana Brooks/);
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
    completionFormData.set("cleanerComment", "Cleaner finished successfully.\nKitchen cabinets needed extra attention.");
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

    const updatedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedOrdersBody = await updatedOrdersResponse.text();
    assert.equal(updatedOrdersResponse.status, 200);
    assert.match(updatedOrdersBody, /Rescheduled/);
    assert.match(updatedOrdersBody, /Anna Petrova, Diana Brooks/);
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
    assert.match(updatedOrdersBody, /Cleaner finished successfully/);
    assert.match(updatedOrdersBody, /Kitchen cabinets needed extra attention/);
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
    assert.match(quoteOpsBody, /Телефон: \+1\(312\)555-0100/);
    assert.match(quoteOpsBody, /E-mail: jane@example\.com/);
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
    assert.doesNotMatch(quoteOpsBody, />Применить<\/button>/);
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
    assert.match(quoteOpsAddressSearchBody, /Показано 1 из 1 заявок\./);
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
    assert.doesNotMatch(deletedOrdersBody, /Jane Doe/);
    assert.doesNotMatch(deletedOrdersBody, /ops-request-1/);

    const deletedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedQuoteOpsBody = await deletedQuoteOpsResponse.text();
    assert.equal(deletedQuoteOpsResponse.status, 200);
    assert.doesNotMatch(deletedQuoteOpsBody, /Jane Doe/);
    assert.doesNotMatch(deletedQuoteOpsBody, /ops-request-1/);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 4);
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

test("renders the clients table with filters and request history", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-clients-route-"));
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
    ADMIN_STAFF_STORE_PATH: path.join(tempDir, "admin-staff-store.json"),
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

    const createStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-staff",
        name: "Olga Stone",
        role: "Team Lead",
        phone: "312-555-0199",
        email: "olga@example.com",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        status: "active",
      }),
    });
    assert.equal(createStaffResponse.status, 303);

    const staffTeamPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffTeamPageBody = await staffTeamPageResponse.text();
    const staffIdMatch = staffTeamPageBody.match(/name="staffId" value="([^"]+)"/);

    const staffAssignmentsPageResponse = await fetch(`${started.baseUrl}/admin/staff?section=assignments`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffAssignmentsPageResponse.text();
    const janeRowDialogIdMatch = staffPageBody.match(
      /<tr\b(?:(?!<\/tr>).)*?data-admin-dialog-open="([^"]+)"(?:(?!<\/tr>).)*?client-request-2(?:(?!<\/tr>).)*?<\/tr>/s
    );
    const janeAssignmentDialogPattern = janeRowDialogIdMatch
      ? new RegExp(`<dialog\\b(?:(?!<\\/dialog>).)*?id="${escapeRegex(janeRowDialogIdMatch[1])}"(?:(?!<\\/dialog>).)*?<\\/dialog>`, "s")
      : null;
    const janeAssignmentDialog = janeAssignmentDialogPattern ? staffPageBody.match(janeAssignmentDialogPattern)?.[0] : null;
    const janeEntryIdMatch = janeAssignmentDialog ? janeAssignmentDialog.match(/name="entryId" value="([^"]+)"/) : null;
    assert.ok(staffIdMatch);
    assert.ok(janeRowDialogIdMatch);
    assert.ok(janeEntryIdMatch);

    const assignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", janeEntryIdMatch[1]],
        ["staffIds", staffIdMatch[1]],
        ["status", "completed"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const clientsResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const clientsBody = await clientsResponse.text();
    let currentJaneClientKey = "3125550100";
    const romeovilleAddressKey = "123 main st, romeoville, il 60446";
    const plainfieldAddressKey = "789 cedar ln, plainfield, il 60544";
    const napervilleAddressKey = "500 river rd, naperville, il 60540";
    const bolingbrookAddress = "901 Harbor Way, Bolingbrook, IL 60440";

    assert.equal(clientsResponse.status, 200);
    assert.match(clientsBody, /<h1 class="admin-title">Клиенты<\/h1>/);
    assert.doesNotMatch(clientsBody, /База клиентов/i);
    assert.match(clientsBody, /Jane Doe/);
    assert.match(clientsBody, /John Smith/);
    assert.match(clientsBody, /\+1\(312\)555-0100/);
    assert.match(clientsBody, /\+1\(312\)555-0109/);
    assert.doesNotMatch(clientsBody, /Фильтры/i);
    assert.doesNotMatch(clientsBody, /Диагностика/i);
    assert.doesNotMatch(clientsBody, /<th>Email<\/th>/);
    assert.doesNotMatch(clientsBody, /<th>Создан<\/th>/);
    assert.match(clientsBody, /Поиск по имени, email или телефону/i);
    assert.match(clientsBody, /data-admin-auto-submit="true"/);
    assert.match(clientsBody, /data-admin-auto-submit-delay="600"/);
    assert.match(clientsBody, /data-admin-auto-submit-min-length="2"/);
    assert.match(clientsBody, /data-admin-auto-submit-restore-focus="true"/);
    assert.match(clientsBody, /data-admin-auto-submit-scroll-target="#admin-clients-workspace"/);
    assert.match(clientsBody, /Клик по строке открывает профиль/i);
    assert.match(clientsBody, /data-admin-row-href="\/admin\/clients\?client=/);
    assert.doesNotMatch(clientsBody, /Карточка клиента/i);
    assert.equal((clientsBody.match(/>Jane Doe<\/a>/g) || []).length, 1);
    assert.match(clientsBody, /123 Main St, Romeoville, IL 60446/i);
    assert.match(clientsBody, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.doesNotMatch(clientsBody, /<span class="admin-client-address-preview-more"/i);

    const selectedClientResponse = await fetch(
      `${started.baseUrl}/admin/clients?client=${encodeURIComponent(currentJaneClientKey)}&addressKey=${encodeURIComponent(romeovilleAddressKey)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const selectedClientBody = await selectedClientResponse.text();
    const selectedClientDialog = selectedClientBody.match(
      /<dialog[\s\S]*?id="admin-client-detail-dialog"[\s\S]*?<\/dialog>/
    )?.[0];
    assert.equal(selectedClientResponse.status, 200);
    assert.ok(selectedClientDialog);
    assert.match(selectedClientBody, /class="admin-dialog admin-dialog-wide"/);
    assert.match(selectedClientBody, /id="admin-client-detail-dialog"/);
    assert.match(selectedClientBody, /data-admin-dialog-return-url="\/admin\/clients"/);
    assert.match(selectedClientDialog, /Сводка по активной заявке/i);
    assert.match(selectedClientDialog, /Сумма текущей заявки/i);
    assert.match(selectedClientDialog, /Сумма по адресу/i);
    assert.match(selectedClientDialog, /Адреса клиента/i);
    assert.match(selectedClientDialog, /client-request-2/);
    assert.match(selectedClientDialog, /Команда: Olga Stone/);
    assert.match(selectedClientDialog, /aria-label="Редактировать клиента"/i);
    assert.match(selectedClientDialog, /name="action" value="update-client"/i);
    assert.match(selectedClientDialog, /name="clientKey" value="3125550100"/i);
    assert.match(selectedClientDialog, /name="addresses"/i);
    assert.match(selectedClientDialog, /name="addressPropertyTypes"/i);
    assert.match(selectedClientDialog, /name="addressSquareFootages"/i);
    assert.match(selectedClientDialog, /name="addressRoomCounts"/i);
    assert.match(selectedClientDialog, /name="addressPets"/i);
    assert.match(selectedClientDialog, /name="addressNotes"/i);
    assert.match(selectedClientDialog, /data-admin-client-address-remove="true"/i);
    assert.match(selectedClientDialog, /Добавить адрес/i);
    assert.match(selectedClientDialog, /Параметры адреса/i);
    assert.match(selectedClientDialog, /Редактирование клиента/i);
    assert.match(selectedClientDialog, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.doesNotMatch(selectedClientDialog, /Открыть заявки клиента/i);
    assert.doesNotMatch(selectedClientDialog, /delete-client/i);
    assert.doesNotMatch(selectedClientDialog, /admin-client-delete-form/i);
    assert.doesNotMatch(selectedClientDialog, /admin\/orders\?q=client-request-2&amp;order=/i);
    assert.doesNotMatch(selectedClientDialog, /<h3 class="admin-subsection-title">Контакты<\/h3>/);
    assert.match(selectedClientDialog, /\+1\(312\)555-0100/);
    assert.match(selectedClientDialog, /\+1\(312\)555-0100[\s\S]*jane@example\.com[\s\S]*123 Main St, Romeoville, IL 60446/i);
    assert.doesNotMatch(selectedClientDialog, /client-request-3/);
    assert.match(selectedClientDialog, /123 Main St, Romeoville, IL 60446/);
    assert.doesNotMatch(selectedClientBody, /Карточка клиента/i);
    assert.doesNotMatch(selectedClientBody, /id="client-card"/);

    const plainfieldClientResponse = await fetch(
      `${started.baseUrl}/admin/clients?client=${encodeURIComponent(currentJaneClientKey)}&addressKey=${encodeURIComponent(plainfieldAddressKey)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const plainfieldClientBody = await plainfieldClientResponse.text();
    const plainfieldClientDialog = plainfieldClientBody.match(
      /<dialog[\s\S]*?id="admin-client-detail-dialog"[\s\S]*?<\/dialog>/
    )?.[0];
    assert.equal(plainfieldClientResponse.status, 200);
    assert.ok(plainfieldClientDialog);
    assert.match(plainfieldClientDialog, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.match(plainfieldClientDialog, /client-request-3/);
    assert.doesNotMatch(plainfieldClientDialog, /client-request-2/);

    const nameFilterResponse = await fetch(`${started.baseUrl}/admin/clients?name=John`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const nameFilterBody = await nameFilterResponse.text();
    assert.equal(nameFilterResponse.status, 200);
    assert.match(nameFilterBody, /John Smith/);
    assert.doesNotMatch(nameFilterBody, /Jane Doe/);

    const qSearchResponse = await fetch(`${started.baseUrl}/admin/clients?q=3125550109`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const qSearchBody = await qSearchResponse.text();
    assert.equal(qSearchResponse.status, 200);
    assert.match(qSearchBody, /John Smith/);
    assert.doesNotMatch(qSearchBody, /Jane Doe/);
    assert.doesNotMatch(qSearchBody, /Карточка клиента/i);

    const emailFilterResponse = await fetch(`${started.baseUrl}/admin/clients?email=jane@example.com`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const emailFilterBody = await emailFilterResponse.text();
    assert.equal(emailFilterResponse.status, 200);
    assert.match(emailFilterBody, /Jane Doe/);
    assert.equal((emailFilterBody.match(/>Jane Doe<\/a>/g) || []).length, 1);
    assert.doesNotMatch(emailFilterBody, /Карточка клиента/i);
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

    const updateClientForm = new URLSearchParams({
      action: "update-client",
      clientKey: currentJaneClientKey,
      returnTo: `/admin/clients?client=${encodeURIComponent(currentJaneClientKey)}&addressKey=${encodeURIComponent(romeovilleAddressKey)}`,
      name: "Jane Cooper",
      phone: "+1(312)555-0111",
      email: "jane.cooper@example.com",
    });
    [
      {
        address: "123 Main St, Romeoville, IL 60446",
        propertyType: "house",
        squareFootage: "2400 sq ft",
        roomCount: "4 комнаты",
        pets: "dog",
        notes: "Gate code 1942. Use hypoallergenic products.",
      },
      {
        address: "789 Cedar Ln, Plainfield, IL 60544",
        propertyType: "apartment",
        squareFootage: "2 bedrooms",
        roomCount: "1 bath",
        pets: "cat",
        notes: "Do not touch nursery shelves.",
      },
      {
        address: "500 River Rd, Naperville, IL 60540",
        propertyType: "office",
        squareFootage: "1200 sq ft",
        roomCount: "5 rooms",
        pets: "none",
        notes: "Key at front desk. Alarm code 4455.",
      },
      {
        address: bolingbrookAddress,
        propertyType: "airbnb",
        squareFootage: "1800 sq ft",
        roomCount: "3 bedrooms",
        pets: "none",
        notes: "Lockbox on left rail.",
      },
    ].forEach((addressRecord) => {
      updateClientForm.append("addresses", addressRecord.address);
      updateClientForm.append("addressPropertyTypes", addressRecord.propertyType);
      updateClientForm.append("addressSquareFootages", addressRecord.squareFootage);
      updateClientForm.append("addressRoomCounts", addressRecord.roomCount);
      updateClientForm.append("addressPets", addressRecord.pets);
      updateClientForm.append("addressNotes", addressRecord.notes);
    });

    const updateClientResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: updateClientForm,
    });
    assert.equal(updateClientResponse.status, 303);
    const updateClientLocation = updateClientResponse.headers.get("location") || "";
    assert.match(updateClientLocation, /notice=client-saved/);
    const updatedClientUrl = new URL(updateClientLocation, started.baseUrl);
    currentJaneClientKey = updatedClientUrl.searchParams.get("client") || "";
    assert.equal(currentJaneClientKey, "3125550111");

    const updatedClientResponse = await fetch(`${started.baseUrl}${updateClientLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedClientBody = await updatedClientResponse.text();
    const updatedClientDialog = updatedClientBody.match(
      /<dialog[\s\S]*?id="admin-client-detail-dialog"[\s\S]*?<\/dialog>/
    )?.[0];
    assert.equal(updatedClientResponse.status, 200);
    assert.ok(updatedClientDialog);
    assert.match(updatedClientBody, /Карточка клиента обновлена/i);
    assert.match(updatedClientDialog, /Jane Cooper/);
    assert.match(updatedClientDialog, /\+1\(312\)555-0111/);
    assert.match(updatedClientDialog, /jane\.cooper@example\.com/i);
    assert.match(updatedClientDialog, /123 Main St, Romeoville, IL 60446/);
    assert.match(updatedClientDialog, /500 River Rd, Naperville, IL 60540/);
    assert.match(updatedClientDialog, /901 Harbor Way, Bolingbrook, IL 60440/);
    assert.match(updatedClientDialog, /<span class="admin-client-address-fact-label">Тип объекта<\/span>[\s\S]*?<p class="admin-client-address-fact-value">Дом<\/p>/i);
    assert.match(updatedClientDialog, /<span class="admin-client-address-fact-label">Метраж<\/span>[\s\S]*?<p class="admin-client-address-fact-value">2400 sq ft<\/p>/i);
    assert.match(updatedClientDialog, /<span class="admin-client-address-fact-label">Комнаты<\/span>[\s\S]*?<p class="admin-client-address-fact-value">4 комнаты<\/p>/i);
    assert.match(updatedClientDialog, /<span class="admin-client-address-fact-label">Домашние животные<\/span>[\s\S]*?<p class="admin-client-address-fact-value">Собака<\/p>/i);
    assert.match(updatedClientDialog, /Gate code 1942\. Use hypoallergenic products\./i);
    assert.doesNotMatch(updatedClientDialog, /admin\/orders\?q=client-request-2&amp;order=/i);

    const updatedClientsTableResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedClientsTableBody = await updatedClientsTableResponse.text();
    assert.equal(updatedClientsTableResponse.status, 200);
    assert.match(updatedClientsTableBody, /123 Main St, Romeoville, IL 60446/i);
    assert.match(updatedClientsTableBody, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.match(updatedClientsTableBody, /500 River Rd, Naperville, IL 60540/i);
    assert.match(updatedClientsTableBody, /class="admin-client-address-preview-more"[^>]*>\+1<\/span>/i);

    const napervilleClientResponse = await fetch(
      `${started.baseUrl}/admin/clients?client=${encodeURIComponent(currentJaneClientKey)}&addressKey=${encodeURIComponent(napervilleAddressKey)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const napervilleClientBody = await napervilleClientResponse.text();
    const napervilleClientDialog = napervilleClientBody.match(
      /<dialog[\s\S]*?id="admin-client-detail-dialog"[\s\S]*?<\/dialog>/
    )?.[0];
    assert.equal(napervilleClientResponse.status, 200);
    assert.ok(napervilleClientDialog);
    assert.match(napervilleClientDialog, /500 River Rd, Naperville, IL 60540/);
    assert.match(napervilleClientDialog, /<span class="admin-client-address-fact-label">Тип объекта<\/span>[\s\S]*?<p class="admin-client-address-fact-value">Офис<\/p>/i);
    assert.match(napervilleClientDialog, /<span class="admin-client-address-fact-label">Метраж<\/span>[\s\S]*?<p class="admin-client-address-fact-value">1200 sq ft<\/p>/i);
    assert.match(napervilleClientDialog, /<span class="admin-client-address-fact-label">Комнаты<\/span>[\s\S]*?<p class="admin-client-address-fact-value">5 rooms<\/p>/i);
    assert.match(napervilleClientDialog, /<span class="admin-client-address-fact-label">Домашние животные<\/span>[\s\S]*?<p class="admin-client-address-fact-value">Нет<\/p>/i);
    assert.match(napervilleClientDialog, /Key at front desk\. Alarm code 4455\./i);
    assert.match(napervilleClientDialog, /По этому адресу пока нет заявок/i);
    assert.doesNotMatch(napervilleClientDialog, /Сводка по активной заявке/i);

    const removeAddressForm = new URLSearchParams({
      action: "update-client",
      clientKey: currentJaneClientKey,
      returnTo: `/admin/clients?client=${encodeURIComponent(currentJaneClientKey)}&addressKey=${encodeURIComponent(romeovilleAddressKey)}`,
      name: "Jane Cooper",
      phone: "+1(312)555-0111",
      email: "jane.cooper@example.com",
    });
    [
      {
        address: "123 Main St, Romeoville, IL 60446",
        propertyType: "house",
        squareFootage: "2400 sq ft",
        roomCount: "4 комнаты",
        pets: "dog",
        notes: "Gate code 1942. Use hypoallergenic products.",
      },
      {
        address: "500 River Rd, Naperville, IL 60540",
        propertyType: "office",
        squareFootage: "1200 sq ft",
        roomCount: "5 rooms",
        pets: "none",
        notes: "Key at front desk. Alarm code 4455.",
      },
      {
        address: bolingbrookAddress,
        propertyType: "airbnb",
        squareFootage: "1800 sq ft",
        roomCount: "3 bedrooms",
        pets: "none",
        notes: "Lockbox on left rail.",
      },
    ].forEach((addressRecord) => {
      removeAddressForm.append("addresses", addressRecord.address);
      removeAddressForm.append("addressPropertyTypes", addressRecord.propertyType);
      removeAddressForm.append("addressSquareFootages", addressRecord.squareFootage);
      removeAddressForm.append("addressRoomCounts", addressRecord.roomCount);
      removeAddressForm.append("addressPets", addressRecord.pets);
      removeAddressForm.append("addressNotes", addressRecord.notes);
    });

    const removeAddressResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: removeAddressForm,
    });
    assert.equal(removeAddressResponse.status, 303);
    assert.match(removeAddressResponse.headers.get("location") || "", /notice=client-saved/);

    const removedAddressPageResponse = await fetch(`${started.baseUrl}${removeAddressResponse.headers.get("location") || ""}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const removedAddressPageBody = await removedAddressPageResponse.text();
    const removedAddressDialog = removedAddressPageBody.match(
      /<dialog[\s\S]*?id="admin-client-detail-dialog"[\s\S]*?<\/dialog>/
    )?.[0];
    assert.equal(removedAddressPageResponse.status, 200);
    assert.ok(removedAddressDialog);
    assert.doesNotMatch(removedAddressDialog, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.match(removedAddressDialog, /123 Main St, Romeoville, IL 60446/i);
    assert.match(removedAddressDialog, /500 River Rd, Naperville, IL 60540/i);

    const removedAddressTableResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const removedAddressTableBody = await removedAddressTableResponse.text();
    assert.equal(removedAddressTableResponse.status, 200);
    assert.doesNotMatch(removedAddressTableBody, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.match(removedAddressTableBody, /500 River Rd, Naperville, IL 60540/i);

    const deleteClientResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-client",
        clientKey: currentJaneClientKey,
        returnTo: `/admin/clients?client=${encodeURIComponent(currentJaneClientKey)}`,
      }),
    });
    assert.equal(deleteClientResponse.status, 303);
    assert.match(deleteClientResponse.headers.get("location") || "", /notice=client-deleted/);

    const deletedClientsResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedClientsBody = await deletedClientsResponse.text();
    assert.equal(deletedClientsResponse.status, 200);
    assert.match(deletedClientsBody, /John Smith/);
    assert.doesNotMatch(deletedClientsBody, /Jane Cooper/);
    assert.doesNotMatch(deletedClientsBody, /Jane Doe/);
    assert.doesNotMatch(deletedClientsBody, /789 Cedar Ln, Plainfield, IL 60544/);
    assert.doesNotMatch(deletedClientsBody, /123 Main St, Romeoville, IL 60446/);

    const deletedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedOrdersBody = await deletedOrdersResponse.text();
    assert.equal(deletedOrdersResponse.status, 200);
    assert.match(deletedOrdersBody, /John Smith/);
    assert.doesNotMatch(deletedOrdersBody, /Jane Cooper/);
    assert.doesNotMatch(deletedOrdersBody, /Jane Doe/);
    assert.doesNotMatch(deletedOrdersBody, /client-request-2/);
    assert.doesNotMatch(deletedOrdersBody, /client-request-3/);

    const deletedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedQuoteOpsBody = await deletedQuoteOpsResponse.text();
    assert.equal(deletedQuoteOpsResponse.status, 200);
    assert.match(deletedQuoteOpsBody, /John Smith/);
    assert.doesNotMatch(deletedQuoteOpsBody, /Jane Cooper/);
    assert.doesNotMatch(deletedQuoteOpsBody, /Jane Doe/);
    assert.doesNotMatch(deletedQuoteOpsBody, /client-request-2/);
    assert.doesNotMatch(deletedQuoteOpsBody, /client-request-3/);

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
    fetchStub.cleanup();
  }
});

test("keeps quote ops diagnostics hidden on the clients page when Supabase reads fail", async () => {
  const fetchStub = createFetchStub([
    {
      method: "GET",
      match: "/rest/v1/quote_ops_entries",
      status: 500,
      body: {
        message: "supabase read failed",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const response = await fetch(`${started.baseUrl}/admin/clients`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /<h1 class="admin-title">Клиенты<\/h1>/);
    assert.doesNotMatch(body, /База клиентов/i);
    assert.doesNotMatch(body, /Supabase/i);
    assert.doesNotMatch(body, /Чтение: fallback в память/i);
    assert.doesNotMatch(body, /Ошибка чтения Supabase: supabase read failed/i);
    assert.doesNotMatch(body, /quote_ops_entries/i);
  } finally {
    await stopServer(started.child);
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

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, />Добавить сотрудника</);
    assert.match(settingsBody, /data-admin-dialog-open="admin-user-create-dialog"/);
    assert.match(settingsBody, /<dialog class="admin-dialog" id="admin-user-create-dialog"/);
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

test("allows managers into admin workspace but blocks delete actions", async () => {
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

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardBody, /Обзор/i);
    assert.match(dashboardBody, /Менеджер/i);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Пользователи/i);
    assert.doesNotMatch(settingsBody, /aria-label="Удалить пользователя"/i);
    assert.doesNotMatch(settingsBody, /Почта приглашений/i);

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

    const updatedUsersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(updatedUsersStorePayload.users[0].phone, "+1(331)555-0198");

    const deleteUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete_user",
        userId: managerUser.id,
      }),
    });
    const deleteUserBody = await deleteUserResponse.text();
    assert.equal(deleteUserResponse.status, 403);
    assert.match(deleteUserBody, /Недостаточно прав/i);
    assert.match(deleteUserBody, /Удаление доступно только администратору/i);
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
            emailVerificationRequired: false,
            emailVerifiedAt: new Date().toISOString(),
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
    assert.match(settingsBody, /Письмо не ушло/i);
    assert.match(settingsBody, /SMTP не принял логин или app password/i);
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
