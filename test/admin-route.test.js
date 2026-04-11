"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
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

function getInlineScripts(html) {
  return Array.from(html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g), (match) => match[1]).filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    assert.match(staffBody, /data-admin-dialog-open="admin-staff-create-dialog"/);
    assert.match(staffBody, /<dialog class="admin-dialog" id="admin-staff-create-dialog"/);
    assert.match(staffBody, /<dialog class="admin-dialog admin-confirm-dialog" id="admin-confirm-dialog"/);
    assert.match(staffBody, /Точно удалить\?/);
    assert.match(staffBody, /class="admin-table admin-staff-table"/);
    assert.match(staffBody, /class="admin-table admin-staff-schedule-table"/);
    assert.match(staffBody, /class="admin-table-row-clickable"/);
    assert.match(staffBody, /data-admin-dialog-row="true"/);
    assert.match(staffBody, /data-admin-dialog-open="admin-staff-edit-dialog-/);
    assert.match(staffBody, /data-admin-dialog-open="admin-staff-assignment-dialog-/);
    assert.match(staffBody, /aria-label="Открыть карточку сотрудника /);
    assert.match(staffBody, /aria-label="Открыть назначение Jane Doe"/);
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

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    const staffIdMatch = staffPageBody.match(/name="staffId" value="([^"]+)"/);
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
