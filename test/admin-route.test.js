"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, loadAdminConfig, generateTotpCode } = require("../lib/admin-auth");
const { createFetchStub, createSmtpTestServer, startServer, stopServer } = require("./server-test-helpers");

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

function getStaffAssignmentEntryIdByCustomerName(html, customerName) {
  const match = String(html || "").match(
    new RegExp(
      `<dialog class="admin-dialog admin-dialog-wide" id="admin-staff-assignment-dialog-[^"]+"[\\s\\S]*?<h2 class="admin-dialog-title"[^>]*>${escapeRegex(customerName)}<\\/h2>[\\s\\S]*?<input type="hidden" name="entryId" value="([^"]+)"`,
      "i"
    )
  );
  return match ? match[1] : "";
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
    assert.match(settingsBody, /Регулярная уборка/i);
    assert.match(settingsBody, /Генеральная уборка/i);
    assert.match(settingsBody, /Уборка перед переездом/i);

    const firstItemMatch = settingsBody.match(/name="completedItemIds" value="([^"]+)"/);
    assert.ok(firstItemMatch);
    const firstItemId = firstItemMatch[1];

    const saveResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save_checklist_state",
        serviceType: "regular",
        completedItemIds: firstItemId,
      }),
    });
    assert.equal(saveResponse.status, 303);
    const saveLocation = saveResponse.headers.get("location") || "";
    assert.match(saveLocation, /notice=saved/);

    const savedResponse = await fetch(`${started.baseUrl}${saveLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const savedBody = await savedResponse.text();
    assert.equal(savedResponse.status, 200);
    assert.match(savedBody, /Отметки чек-листа сохранены/i);
    assert.match(savedBody, new RegExp(`value="${firstItemId}"[^>]*checked`, "i"));

    const customLabel = "Проверить зеркала в прихожей";
    const addResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "add_checklist_item",
        serviceType: "regular",
        itemLabel: customLabel,
      }),
    });
    assert.equal(addResponse.status, 303);
    const addLocation = addResponse.headers.get("location") || "";
    assert.match(addLocation, /notice=added/);

    const updatedResponse = await fetch(`${started.baseUrl}${addLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedBody = await updatedResponse.text();
    assert.equal(updatedResponse.status, 200);
    assert.match(updatedBody, /Новый пункт добавлен в шаблон/i);
    assert.match(updatedBody, new RegExp(customLabel, "i"));

    const resetResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "reset_checklist_state",
        serviceType: "regular",
      }),
    });
    assert.equal(resetResponse.status, 303);
    const resetLocation = resetResponse.headers.get("location") || "";
    assert.match(resetLocation, /notice=reset/);

    const resetPageResponse = await fetch(`${started.baseUrl}${resetLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const resetBody = await resetPageResponse.text();
    assert.equal(resetPageResponse.status, 200);
    assert.match(resetBody, /Все отметки по этому шаблону сброшены/i);
    assert.doesNotMatch(resetBody, new RegExp(`value="${firstItemId}"[^>]*checked`, "i"));
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
        phone: "13125550199123456789",
        email: "olga@example.com",
        address: "742 Cedar Avenue, Aurora, IL 60506",
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
    assert.match(staffBody, /href="\/admin\/staff\?section=team"/);
    assert.match(staffBody, /href="\/admin\/staff\?section=calendar&calendarStart=/);
    assert.match(staffBody, /href="\/admin\/staff\?section=assignments"/);
    assert.doesNotMatch(staffBody, /href="\/admin\/settings\?section=users"/);
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
    assert.match(staffBody, /Olga Stone <span class="admin-staff-dialog-title-role">\(Team Lead\)<\/span>/);
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
    assert.match(staffBody, /data-admin-phone-input="true"/);
    assert.match(staffBody, /maxlength="15"/);
    assert.match(staffBody, /placeholder="\+1\(000\)000-0000"/);
    assert.match(staffBody, /aria-label="Удалить сотрудника"/);
    assert.doesNotMatch(staffBody, /Удаление очистит его назначения в графике/);
    assert.match(staffBody, /Olga Stone/);
    assert.match(staffBody, /Team Lead/);
    assert.match(staffBody, /742 Cedar Avenue, Aurora, IL 60506/);
    assert.match(staffBody, /Jane Doe/);

    const staffIdMatch = staffBody.match(/name="staffId" value="([^"]+)"/);
    assert.ok(staffIdMatch);
    const staffId = staffIdMatch[1];

    const entryIdMatch = staffBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

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

    const assignmentsSectionResponse = await fetch(`${started.baseUrl}/admin/staff?section=assignments`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const assignmentsSectionBody = await assignmentsSectionResponse.text();
    assert.equal(assignmentsSectionResponse.status, 200);
    assert.match(assignmentsSectionBody, /class="admin-table admin-staff-schedule-table"/);
    assert.doesNotMatch(assignmentsSectionBody, /class="admin-table admin-staff-table"/);

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
    assert.match(ordersBody, /<select class="admin-input" name="assignedStaff">/);
    assert.match(ordersBody, /<option value="Olga Stone" selected>Olga Stone<\/option>/);

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
    assert.match(ordersBody, /data-admin-dialog-row="true"/);
    assert.match(ordersBody, /class="admin-table-row-clickable"/);
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
    assert.doesNotMatch(ordersBody, /Команда назначена/);
    assert.doesNotMatch(ordersBody, /CRM без ошибок/);
    assert.doesNotMatch(ordersBody, /Успешно/);
    assert.doesNotMatch(ordersBody, /Удаление убирает запись из рабочих разделов админки/);

    const entryIdMatch = ordersBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

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
    assert.match(focusedOrderBody, /type="date"/);
    assert.match(focusedOrderBody, /type="time"/);

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
    assert.match(updatedOrdersBody, /value="03\/24\/2026"/);
    assert.match(updatedOrdersBody, /value="11:30 AM"/);

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
    assert.match(quoteOpsBody, /data-admin-auto-submit="true"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-delay="320"/);
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
    assert.match(quoteOpsBody, /Gate code 2040/);
    assert.doesNotMatch(quoteOpsBody, /admin-quote-ops-filter-disclosure" open/);
    assert.doesNotMatch(quoteOpsBody, /Persistent storage active/i);
    assert.doesNotMatch(quoteOpsBody, /Подключено к Supabase/i);
    assert.doesNotMatch(quoteOpsBody, /quote_ops_entries/i);
    assert.doesNotMatch(quoteOpsBody, /CRM OK/);
    assert.doesNotMatch(quoteOpsBody, /CRM и отправка/);
    assert.doesNotMatch(quoteOpsBody, /<th>Действие<\/th>/);
    assert.doesNotMatch(quoteOpsBody, /<th>CRM<\/th>/);
    assert.doesNotMatch(quoteOpsBody, /Скачать CSV/);
    assert.doesNotMatch(quoteOpsBody, />Применить<\/button>/);
    assert.doesNotMatch(quoteOpsBody, /в текущей выборке/);
    assert.doesNotMatch(quoteOpsBody, /Критичных заявок нет/);
    assert.doesNotMatch(quoteOpsBody, /Последняя:/);

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
    const janeRomeovilleClientKey = "jane doe|123 main st, romeoville, il 60446";

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
    assert.match(clientsBody, /Клик по строке открывает профиль/i);
    assert.match(clientsBody, /data-admin-row-href="\/admin\/clients\?client=/);
    assert.doesNotMatch(clientsBody, /Карточка клиента/i);
    assert.equal((clientsBody.match(/>Jane Doe<\/a>/g) || []).length, 2);

    const selectedClientResponse = await fetch(
      `${started.baseUrl}/admin/clients?client=${encodeURIComponent(janeRomeovilleClientKey)}`,
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
    assert.match(selectedClientDialog, /Сумма заказов/i);
    assert.match(selectedClientDialog, /client-request-2/);
    assert.match(selectedClientDialog, /Команда: Olga Stone/);
    assert.match(selectedClientDialog, /Редактировать/i);
    assert.match(selectedClientDialog, /<a class="admin-button" href="\/admin\/orders\?q=client-request-2&amp;order=/i);
    assert.match(selectedClientDialog, /admin\/orders\?q=client-request-2&amp;order=/i);
    assert.doesNotMatch(selectedClientDialog, /delete-client/i);
    assert.doesNotMatch(selectedClientDialog, /admin-client-delete-form/i);
    assert.doesNotMatch(selectedClientDialog, /<h3 class="admin-subsection-title">Контакты<\/h3>/);
    assert.match(selectedClientDialog, /\+1\(312\)555-0100/);
    assert.match(selectedClientDialog, /\+1\(312\)555-0100[\s\S]*jane@example\.com[\s\S]*123 Main St, Romeoville, IL 60446/i);
    assert.doesNotMatch(selectedClientDialog, /client-request-3/);
    assert.match(selectedClientDialog, /123 Main St, Romeoville, IL 60446/);
    assert.doesNotMatch(selectedClientDialog, /789 Cedar Ln, Plainfield, IL 60544/);
    assert.doesNotMatch(selectedClientBody, /Карточка клиента/i);
    assert.doesNotMatch(selectedClientBody, /id="client-card"/);

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
    assert.equal((emailFilterBody.match(/>Jane Doe<\/a>/g) || []).length, 2);
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

    const deleteClientResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-client",
        clientKey: janeRomeovilleClientKey,
        returnTo: `/admin/clients?client=${encodeURIComponent(janeRomeovilleClientKey)}`,
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
    assert.match(deletedClientsBody, /Jane Doe/);
    assert.match(deletedClientsBody, /789 Cedar Ln, Plainfield, IL 60544/);
    assert.doesNotMatch(deletedClientsBody, /123 Main St, Romeoville, IL 60446/);

    const deletedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedOrdersBody = await deletedOrdersResponse.text();
    assert.equal(deletedOrdersResponse.status, 200);
    assert.match(deletedOrdersBody, /John Smith/);
    assert.match(deletedOrdersBody, /Jane Doe/);
    assert.doesNotMatch(deletedOrdersBody, /client-request-2/);
    assert.match(deletedOrdersBody, /client-request-3/);

    const deletedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedQuoteOpsBody = await deletedQuoteOpsResponse.text();
    assert.equal(deletedQuoteOpsResponse.status, 200);
    assert.match(deletedQuoteOpsBody, /John Smith/);
    assert.match(deletedQuoteOpsBody, /Jane Doe/);
    assert.doesNotMatch(deletedQuoteOpsBody, /client-request-2/);
    assert.match(deletedQuoteOpsBody, /client-request-3/);

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
    assert.doesNotMatch(settingsBody, /Шаблоны чек-листов/i);

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
        staffRole: "Cleaner",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "alina.staff@example.com",
        phone: "3125550101",
        address: "742 Cedar Avenue, Aurora, IL 60506",
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

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffStorePayload.staff.length, 1);
    const staffId = staffStorePayload.staff[0].id;
    assert.ok(staffId);
    assert.equal(staffStorePayload.staff[0].name, "Alina Carter");
    assert.equal(staffStorePayload.staff[0].role, "Cleaner");
    assert.equal(staffStorePayload.staff[0].address, "742 Cedar Avenue, Aurora, IL 60506");

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

    const usersAfterProfileSave = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersAfterProfileSave.users[0].email, "alina.updated@example.com");
    assert.equal(usersAfterProfileSave.users[0].phone, "3315550110");

    const staffAfterProfileSave = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffAfterProfileSave.staff[0].email, "alina.updated@example.com");
    assert.equal(staffAfterProfileSave.staff[0].phone, "3315550110");

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
        staffRole: "Operations Manager",
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
        staffRole: "Operations Lead",
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

test("sends an invite email and requires confirmation before first employee login when email delivery is configured", async () => {
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
        staffRole: "Cleaner",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "invite.cleaner@example.com",
        phone: "3125550101",
        address: "1289 Rhodes Ln, Naperville, IL 60540",
        notes: "Invite email test",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    assert.match(createUserResponse.headers.get("location") || "", /notice=user-created-email-sent/);

    const usersAfterCreate = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersAfterCreate.users.length, 1);
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
        password: "StrongPass123!",
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
    assert.equal(verifyResponse.headers.get("location"), "/account/login?notice=email-verified");

    const verifiedLoginPageResponse = await fetch(`${started.baseUrl}/account/login?notice=email-verified`);
    const verifiedLoginPageBody = await verifiedLoginPageResponse.text();
    assert.equal(verifiedLoginPageResponse.status, 200);
    assert.match(verifiedLoginPageBody, /Email подтверждён/i);

    const successfulLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "invite.cleaner@example.com",
        password: "StrongPass123!",
      }),
    });
    assert.equal(successfulLoginResponse.status, 303);
    assert.equal(successfulLoginResponse.headers.get("location"), "/account");

    const usersAfterVerify = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.ok(usersAfterVerify.users[0].emailVerifiedAt);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
