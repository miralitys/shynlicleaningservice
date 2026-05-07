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
        frequency: "weekly",
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
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "client-request-1");
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "client-request-2");
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "client-request-3");

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
    assert.match(clientsBody, /Постоянные: 1/);
    assert.match(clientsBody, /Одноразовые: 1/);
    assert.match(clientsBody, /Регулярные: 1/);
    assert.match(clientsBody, /Нерегулярные: 1/);
    assert.match(clientsBody, /Постоянный клиент/);
    assert.match(clientsBody, /Одноразовый клиент/);
    assert.match(clientsBody, /Регулярные уборки/);
    assert.match(clientsBody, /Нерегулярные уборки/);

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
    assert.match(selectedClientDialog, /data-admin-save-confirm="true"/i);
    assert.match(selectedClientDialog, /name="clientKey" value="3125550100"/i);
    assert.match(selectedClientDialog, /name="addresses"/i);
    assert.match(selectedClientDialog, /name="addressPropertyTypes"/i);
    assert.match(selectedClientDialog, /name="addressSquareFootages"/i);
    assert.match(selectedClientDialog, /name="addressRoomCounts"/i);
    assert.match(selectedClientDialog, /name="addressBathroomCounts"/i);
    assert.match(selectedClientDialog, /name="addressPets"/i);
    assert.match(selectedClientDialog, /name="addressNotes"/i);
    assert.match(selectedClientDialog, /data-admin-client-address-remove="true"/i);
    assert.match(selectedClientDialog, /Добавить адрес/i);
    assert.match(selectedClientDialog, /Параметры адреса/i);
    assert.match(selectedClientDialog, /Редактирование клиента/i);
    assert.match(selectedClientDialog, /789 Cedar Ln, Plainfield, IL 60544/i);
    assert.doesNotMatch(selectedClientDialog, /Открыть заявки клиента/i);
    assert.match(selectedClientDialog, /admin-client-delete-form/i);
    assert.match(selectedClientDialog, /admin-client-head-delete-form/i);
    assert.match(selectedClientDialog, /name="action" value="delete-client"/i);
    assert.match(selectedClientDialog, /aria-label="Удалить клиента"/i);
    assert.match(selectedClientDialog, /data-admin-toggle-companion="admin-client-edit-3125550100"/i);
    assert.match(selectedClientDialog, /data-admin-confirm-title="Точно удалить\?"/i);
    assert.match(selectedClientDialog, /Удалить клиента Jane Doe и все связанные с ним заявки\?/i);
    assert.doesNotMatch(selectedClientDialog, /admin\/orders\?q=client-request-2&amp;order=/i);
    assert.doesNotMatch(selectedClientDialog, /<h3 class="admin-subsection-title">Контакты<\/h3>/);
    assert.match(selectedClientDialog, /\+1\(312\)555-0100/);
    assert.match(selectedClientDialog, /\+1\(312\)555-0100[\s\S]*jane@example\.com[\s\S]*123 Main St, Romeoville, IL 60446/i);
    assert.doesNotMatch(selectedClientDialog, /client-request-3/);
    assert.match(selectedClientDialog, /123 Main St, Romeoville, IL 60446/);
    assert.doesNotMatch(selectedClientBody, /Карточка клиента обновлена/i);
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

    const permanentFilterResponse = await fetch(`${started.baseUrl}/admin/clients?lifecycle=permanent`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const permanentFilterBody = await permanentFilterResponse.text();
    assert.equal(permanentFilterResponse.status, 200);
    assert.match(permanentFilterBody, /John Smith/);
    assert.doesNotMatch(permanentFilterBody, /Jane Doe/);

    const oneTimeFilterResponse = await fetch(`${started.baseUrl}/admin/clients?lifecycle=one-time`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const oneTimeFilterBody = await oneTimeFilterResponse.text();
    assert.equal(oneTimeFilterResponse.status, 200);
    assert.match(oneTimeFilterBody, /Jane Doe/);
    assert.doesNotMatch(oneTimeFilterBody, /John Smith/);

    const regularFilterResponse = await fetch(`${started.baseUrl}/admin/clients?serviceSegment=regular`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const regularFilterBody = await regularFilterResponse.text();
    assert.equal(regularFilterResponse.status, 200);
    assert.match(regularFilterBody, /John Smith/);
    assert.doesNotMatch(regularFilterBody, /Jane Doe/);

    const nonRegularFilterResponse = await fetch(`${started.baseUrl}/admin/clients?serviceSegment=nonregular`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const nonRegularFilterBody = await nonRegularFilterResponse.text();
    assert.equal(nonRegularFilterResponse.status, 200);
    assert.match(nonRegularFilterBody, /Jane Doe/);
    assert.doesNotMatch(nonRegularFilterBody, /John Smith/);

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
        bathroomCount: "2 туалета",
        pets: "dog",
        notes: "Gate code 1942. Use hypoallergenic products.",
      },
      {
        address: "789 Cedar Ln, Plainfield, IL 60544",
        propertyType: "apartment",
        squareFootage: "2 bedrooms",
        roomCount: "2 rooms",
        bathroomCount: "1 bath",
        pets: "cat",
        notes: "Do not touch nursery shelves.",
      },
      {
        address: "500 River Rd, Naperville, IL 60540",
        propertyType: "office",
        squareFootage: "1200 sq ft",
        roomCount: "5 rooms",
        bathroomCount: "2 bathrooms",
        pets: "none",
        notes: "Key at front desk. Alarm code 4455.",
      },
      {
        address: bolingbrookAddress,
        propertyType: "airbnb",
        squareFootage: "1800 sq ft",
        roomCount: "3 bedrooms",
        bathroomCount: "1.5 baths",
        pets: "none",
        notes: "Lockbox on left rail.",
      },
    ].forEach((addressRecord) => {
      updateClientForm.append("addresses", addressRecord.address);
      updateClientForm.append("addressPropertyTypes", addressRecord.propertyType);
      updateClientForm.append("addressSquareFootages", addressRecord.squareFootage);
      updateClientForm.append("addressRoomCounts", addressRecord.roomCount);
      updateClientForm.append("addressBathroomCounts", addressRecord.bathroomCount);
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

    const ajaxUpdateClientForm = new URLSearchParams(updateClientForm);
    ajaxUpdateClientForm.set("clientKey", currentJaneClientKey);

    const ajaxUpdateClientResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: ajaxUpdateClientForm,
    });
    assert.equal(ajaxUpdateClientResponse.status, 200);
    const ajaxUpdateClientPayload = await ajaxUpdateClientResponse.json();
    assert.equal(ajaxUpdateClientPayload.ok, true);
    assert.equal(ajaxUpdateClientPayload.notice, "client-saved");
    assert.equal(ajaxUpdateClientPayload.clientKey, "3125550111");

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
    assert.match(updatedClientDialog, /<span class="admin-client-address-fact-label">Туалеты<\/span>[\s\S]*?<p class="admin-client-address-fact-value">2 туалета<\/p>/i);
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
    assert.match(napervilleClientDialog, /<span class="admin-client-address-fact-label">Туалеты<\/span>[\s\S]*?<p class="admin-client-address-fact-value">2 bathrooms<\/p>/i);
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
        bathroomCount: "2 туалета",
        pets: "dog",
        notes: "Gate code 1942. Use hypoallergenic products.",
      },
      {
        address: "500 River Rd, Naperville, IL 60540",
        propertyType: "office",
        squareFootage: "1200 sq ft",
        roomCount: "5 rooms",
        bathroomCount: "2 bathrooms",
        pets: "none",
        notes: "Key at front desk. Alarm code 4455.",
      },
      {
        address: bolingbrookAddress,
        propertyType: "airbnb",
        squareFootage: "1800 sq ft",
        roomCount: "3 bedrooms",
        bathroomCount: "1.5 baths",
        pets: "none",
        notes: "Lockbox on left rail.",
      },
    ].forEach((addressRecord) => {
      removeAddressForm.append("addresses", addressRecord.address);
      removeAddressForm.append("addressPropertyTypes", addressRecord.propertyType);
      removeAddressForm.append("addressSquareFootages", addressRecord.squareFootage);
      removeAddressForm.append("addressRoomCounts", addressRecord.roomCount);
      removeAddressForm.append("addressBathroomCounts", addressRecord.bathroomCount);
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
    const contactCalls = calls.filter((record) =>
      record.method === "POST" &&
      String(record.url).includes("/contacts/")
    );
    const autoSmsCalls = calls.filter((record) =>
      record.method === "POST" &&
      String(record.url).includes("/conversations/messages")
    );
    assert.equal(contactCalls.length, 3);
    assert.equal(autoSmsCalls.length, 4);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
    fetchStub.cleanup();
  }
});

test("allows admins to attach persistent photos to a client card", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-client-photo-123",
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
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "client-photo-request-1",
      fullName: "Photo Client",
      phone: "(312) 555-0134",
      email: "photo.client@example.com",
      serviceType: "regular",
      selectedDate: "2026-05-07",
      selectedTime: "09:00",
      fullAddress: "77 Photo Lane, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const clientKey = "3125550134";
    const returnTo = `/admin/clients?client=${encodeURIComponent(clientKey)}`;
    const initialClientResponse = await fetch(`${started.baseUrl}${returnTo}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const initialClientBody = await initialClientResponse.text();
    assert.equal(initialClientResponse.status, 200);
    assert.match(initialClientBody, /Важные фото/i);
    assert.match(initialClientBody, /name="action" value="add-client-photo"/i);
    assert.match(initialClientBody, /Фото пока нет/i);

    const uploadForm = new FormData();
    uploadForm.set("action", "add-client-photo");
    uploadForm.set("clientKey", clientKey);
    uploadForm.set("returnTo", returnTo);
    uploadForm.append(
      "clientPhotos",
      new Blob([Buffer.from("client-important-photo")], { type: "image/jpeg" }),
      "Access Panel.JPG"
    );

    const uploadResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: uploadForm,
    });
    assert.equal(uploadResponse.status, 303);
    assert.match(uploadResponse.headers.get("location") || "", /notice=client-photo-added/);

    const uploadedClientResponse = await fetch(`${started.baseUrl}${uploadResponse.headers.get("location") || ""}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const uploadedClientBody = await uploadedClientResponse.text();
    assert.equal(uploadedClientResponse.status, 200);
    assert.match(uploadedClientBody, /Фото прикреплено к карточке клиента/i);
    assert.match(uploadedClientBody, /access-panel\.jpg/i);
    assert.match(uploadedClientBody, /name="action" value="delete-client-photo"/i);

    const mediaSrc = uploadedClientBody.match(/<img class="admin-client-photo-thumb" src="([^"]+)"/)?.[1] || "";
    assert.ok(mediaSrc, "Expected an admin media image URL for the client photo");
    const mediaResponse = await fetch(`${started.baseUrl}${mediaSrc.replace(/&amp;/g, "&")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    assert.equal(mediaResponse.status, 200);
    assert.match(mediaResponse.headers.get("content-type") || "", /image\/jpeg/);
    assert.equal(Buffer.from(await mediaResponse.arrayBuffer()).toString("utf8"), "client-important-photo");

    const assetId = uploadedClientBody.match(/name="assetId" value="([^"]+)"/)?.[1] || "";
    const assetPath = uploadedClientBody.match(/name="assetPath" value="([^"]+)"/)?.[1] || "";
    assert.ok(assetId);
    assert.ok(assetPath);

    const deletePhotoResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-client-photo",
        clientKey,
        assetId,
        assetPath,
        returnTo,
      }),
    });
    assert.equal(deletePhotoResponse.status, 303);
    assert.match(deletePhotoResponse.headers.get("location") || "", /notice=client-photo-deleted/);

    const deletedPhotoResponse = await fetch(`${started.baseUrl}${deletePhotoResponse.headers.get("location") || ""}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedPhotoBody = await deletedPhotoResponse.text();
    assert.equal(deletedPhotoResponse.status, 200);
    assert.match(deletedPhotoBody, /Фото удалено из карточки клиента/i);
    assert.doesNotMatch(deletedPhotoBody, /access-panel\.jpg/i);
    assert.match(deletedPhotoBody, /Фото пока нет/i);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});

test("loads inbound SMS replies into the client dialog history", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-client-sms-123",
        },
      },
    },
    {
      method: "GET",
      match: "/conversations/search",
      status: 200,
      body: {
        conversations: [
          {
            id: "conversation-client-sms-123",
          },
        ],
      },
    },
    {
      method: "GET",
      match: "/conversations/conversation-client-sms-123/messages",
      status: 200,
      body: {
        messages: [
          {
            id: "message-client-sms-reply-123",
            type: "TYPE_SMS",
            direction: "inbound",
            body: "Client replied from the same phone.",
            dateAdded: "2026-05-03T18:00:00.000Z",
            conversationId: "conversation-client-sms-123",
            phone: "+13125550123",
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
      requestId: "client-sms-history-request-1",
      fullName: "Client SMS History Lead",
      phone: "(312) 555-0123",
      email: "client.sms@example.com",
      serviceType: "regular",
      selectedDate: "2026-05-04",
      selectedTime: "09:30",
      fullAddress: "123 Reply Lane, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const historyResponse = await fetch(`${started.baseUrl}/admin/clients`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "load-client-sms-history",
        clientKey: "3125550123",
        returnTo: "/admin/clients?client=3125550123",
      }),
    });

    assert.equal(historyResponse.status, 200);
    const historyPayload = await historyResponse.json();
    assert.equal(historyPayload.ok, true);
    assert.equal(historyPayload.sms.historyCountLabel, "2 SMS");
    assert.equal(historyPayload.sms.history.length, 2);
    const inboundEntry = historyPayload.sms.history.find((entry) => entry.direction === "inbound");
    assert.ok(inboundEntry);
    assert.equal(inboundEntry.directionLabel, "Входящее");
    assert.equal(inboundEntry.message, "Client replied from the same phone.");
  } finally {
    await stopServer(started.child);
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
    fetchStub.cleanup();
  }
});
