"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateTotpCode, loadAdminConfig } = require("../lib/admin-auth");
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    {
      method: "POST",
      match: "routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      status: 200,
      body: [
        {
          condition: "ROUTE_EXISTS",
          distanceMeters: 4989,
          duration: "900s",
        },
      ],
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
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "staff-request-1");
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "staff-request-2");

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
    assert.match(staffBody, /class="admin-nav-sublink" href="\/admin\/payroll">Зарплаты<\/a>/);
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
    assert.match(staffBody, /class="admin-dialog-head admin-dialog-hero"/);
    assert.match(staffBody, /Olga Stone <span class="admin-staff-dialog-title-role">\(Менеджер\)<\/span>/);
    assert.match(staffBody, /\+1\(312\)555-0199 • olga@example.com/);
    assert.doesNotMatch(staffBody, /<th>Действие<\/th>/);
    assert.doesNotMatch(staffBody, /<p class="admin-kicker">SHYNLI CLEANING<\/p>/);
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
    assert.match(staffBody, /v=beta/);
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
    assert.match(
      staffBody,
      /Jane Doe[\s\S]*?name="scheduleDate" value="2026-03-25"[\s\S]*?name="scheduleTime" value="12:00"/
    );

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
        ["scheduleDate", "2026-03-25"],
        ["scheduleTime", "12:00"],
        ["status", "confirmed"],
        ["notes", "Bring ladder"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const ajaxAssignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", entryId],
        ["staffIds", staffId],
        ["scheduleDate", "2026-03-25"],
        ["scheduleTime", "12:00"],
        ["status", "confirmed"],
        ["notes", "Bring tall ladder"],
      ]),
    });
    assert.equal(ajaxAssignResponse.status, 200);
    const ajaxAssignPayload = await ajaxAssignResponse.json();
    assert.equal(ajaxAssignPayload.ok, true);
    assert.equal(ajaxAssignPayload.notice, "assignment-saved");

    const updatedStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedStaffBody = await updatedStaffResponse.text();
    assert.equal(updatedStaffResponse.status, 200);
    assert.match(updatedStaffBody, /Подтверждено/);
    assert.match(updatedStaffBody, /Bring tall ladder/);
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
    assert.doesNotMatch(assignmentsSectionBody, /data-admin-travel-estimate="true"/);
    assert.match(assignmentsSectionBody, /Из дома: 20 min • 3\.1 mi/i);
    assert.doesNotMatch(assignmentsSectionBody, /Из дома: считаем маршрут/i);
    assert.doesNotMatch(assignmentsSectionBody, /importLibrary\("routes"\)/);
    assert.doesNotMatch(assignmentsSectionBody, /RouteMatrix\.computeRouteMatrix/);
    assert.doesNotMatch(assignmentsSectionBody, /TRAVEL_TIME_BUFFER_MINUTES = 5/);
    assert.doesNotMatch(assignmentsSectionBody, /DistanceMatrixService/);
    assert.match(assignmentsSectionBody, /Маршрут считается один раз от домашнего адреса сотрудника до адреса клиента и сохраняется в назначении\./);
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
    assert.equal(storePayload.assignments[0].scheduleDate, "");
    assert.equal(storePayload.assignments[0].scheduleTime, "");

    const rescheduleResponse = await fetch(`${started.baseUrl}/admin/staff`, {
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
        ["scheduleDate", "2026-03-27"],
        ["scheduleTime", "13:30"],
        ["status", "confirmed"],
        ["notes", "Bring tall ladder"],
      ]),
    });
    assert.equal(rescheduleResponse.status, 303);
    assert.match(rescheduleResponse.headers.get("location") || "", /notice=assignment-saved/);

    const rescheduledOrdersResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const rescheduledOrdersBody = await rescheduledOrdersResponse.text();
    assert.equal(rescheduledOrdersResponse.status, 200);
    assert.match(rescheduledOrdersBody, /name="selectedDate"[\s\S]*?value="2026-03-27"/);
    assert.match(rescheduledOrdersBody, /name="selectedTime"[\s\S]*?value="13:30"/);

    const rescheduledStorePayload = JSON.parse(await fs.readFile(storePath, "utf8"));
    assert.equal(rescheduledStorePayload.assignments[0].scheduleDate, "");
    assert.equal(rescheduledStorePayload.assignments[0].scheduleTime, "");

    const orderRescheduleResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-order",
        entryId,
        returnTo: "/admin/staff?section=assignments",
        selectedDate: "2026-03-28",
        selectedTime: "14:15",
      }),
    });
    assert.equal(orderRescheduleResponse.status, 303);
    assert.match(orderRescheduleResponse.headers.get("location") || "", /notice=order-saved/);

    const syncedAssignmentsResponse = await fetch(`${started.baseUrl}/admin/staff?section=assignments`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const syncedAssignmentsBody = await syncedAssignmentsResponse.text();
    assert.equal(syncedAssignmentsResponse.status, 200);
    assert.match(
      syncedAssignmentsBody,
      /Jane Doe[\s\S]*?name="scheduleDate"[\s\S]*?value="2026-03-28"[\s\S]*?name="scheduleTime"[\s\S]*?value="14:15"/
    );

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
  const assignmentDate = getChicagoDateValue(1);
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
      selectedDate: assignmentDate,
      selectedTime: "09:00",
      fullAddress: "215 North Elm Street, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "google-calendar-request-1");

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

    const calendarPageResponse = await fetch(`${started.baseUrl}/admin/staff?section=calendar&calendarStart=${encodeURIComponent(assignmentDate)}`, {
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
  const assignmentDate = getChicagoDateValue(1);
  const nextDay = getChicagoDateValue(2);
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
            start: { date: assignmentDate },
            end: { date: nextDay },
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
      selectedDate: assignmentDate,
      selectedTime: "10:00",
      fullAddress: "742 Cedar Avenue, Aurora, IL 60506",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "google-calendar-request-2");

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

    const calendarPageResponse = await fetch(`${started.baseUrl}/admin/staff?section=calendar&calendarStart=${encodeURIComponent(assignmentDate)}`, {
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
