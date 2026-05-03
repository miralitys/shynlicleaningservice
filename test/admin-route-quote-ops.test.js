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

function getLeadTaskIdByEntryId(html, entryId) {
  const match = String(html || "").match(
    new RegExp(
      `name="entryId" value="${escapeRegex(entryId)}"[\\s\\S]*?name="taskId" value="([^"]+)"`,
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

test("renders quote ops funnel and tasks with manager ownership and creates an order after confirmation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-quote-funnel-route-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-funnel-123",
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
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "funnel-request-1",
      fullName: "Funnel Lead",
      phone: "312-555-0170",
      email: "funnel.lead@example.com",
      serviceType: "deep",
      selectedDate: "2026-04-16",
      selectedTime: "11:30",
      fullAddress: "310 Funnel Road, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

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
        name: "Mila Rivers",
        role: "manager",
        status: "active",
        staffStatus: "active",
        email: "mila.manager@example.com",
        phone: "3125550180",
        address: "520 Manager Lane, Naperville, IL 60540",
        compensationValue: "180",
        compensationType: "fixed",
        notes: "Quote manager",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    assert.match(createUserResponse.headers.get("location") || "", /notice=user-created-email-skipped/);

    const createAdminUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Zoe Admin",
        role: "admin",
        status: "active",
        staffStatus: "active",
        email: "zoe.admin@example.com",
        phone: "3125550181",
        address: "521 Admin Lane, Naperville, IL 60540",
        compensationValue: "180",
        compensationType: "fixed",
        notes: "Quote admin",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createAdminUserResponse.status, 303);
    assert.match(createAdminUserResponse.headers.get("location") || "", /notice=user-created-email-skipped/);

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersStorePayload.users.length, 2);
    const managerUserId = usersStorePayload.users.find((user) => user.email === "mila.manager@example.com").id;
    const adminUserId = usersStorePayload.users.find((user) => user.email === "zoe.admin@example.com").id;
    assert.ok(managerUserId);
    assert.ok(adminUserId);

    const funnelResponse = await fetch(`${started.baseUrl}/admin/quote-ops?section=funnel`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const funnelBody = await funnelResponse.text();
    assert.equal(funnelResponse.status, 200);
    assert.match(funnelBody, /Статус заявок/);
    assert.match(funnelBody, /class="admin-nav-sublink admin-nav-sublink-active" href="\/admin\/quote-ops\?section=funnel"/);
    assert.match(funnelBody, /href="\/admin\/quote-ops\?section=tasks"/);
    assert.doesNotMatch(funnelBody, /Весь поток заявок с сайта\./);
    assert.doesNotMatch(funnelBody, /За 24 часа/);
    assert.match(funnelBody, /admin-orders-filter-toggle/);
    assert.match(funnelBody, /admin-clients-search-form/);
    assert.match(funnelBody, /data-lead-dropzone="new"/);
    assert.match(funnelBody, /data-quote-funnel-stage-form="true"/);
    assert.match(funnelBody, /admin-quote-funnel-discussion-dialog/);
    assert.match(funnelBody, /data-quote-funnel-discussion-form="true"/);
    assert.match(funnelBody, /X-SHYNLI-ADMIN-AJAX/);
    assert.doesNotMatch(funnelBody, /stageForm\.submit\(\)/);
    assert.match(funnelBody, /\.admin-quote-funnel-board\s*\{[^}]*align-items:\s*stretch;/);
    assert.match(funnelBody, /\.admin-quote-funnel-list\s*\{[^}]*flex:\s*1 1 auto;/);
    assert.match(funnelBody, /\.admin-quote-funnel-card-detail\[hidden\]\s*\{\s*display:\s*none !important;/);
    assert.doesNotMatch(funnelBody, /Найдено \d+ из \d+ заявок/);
    assert.doesNotMatch(funnelBody, /Перетаскивайте карточки между колонками или откройте заявку по клику\./);
    assert.match(funnelBody, /data-admin-dialog-row="true"/);
    assert.match(funnelBody, /data-admin-dialog-open="admin-quote-entry-detail-dialog-/);

    const listResponse = await fetch(`${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("funnel-request-1")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const listBody = await listResponse.text();
    assert.equal(listResponse.status, 200);
    assert.match(listBody, /admin-quote-entry-stage-form/);
    assert.match(listBody, /admin-quote-entry-task-summary/);
    const entryIdMatch = listBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

    const updateNotesResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-lead-notes",
        entryId,
        notes: "Позвонить после 5 PM и уточнить код домофона.",
        returnTo: `/admin/quote-ops?q=${encodeURIComponent("funnel-request-1")}&entry=${encodeURIComponent(entryId)}`,
      }),
    });
    assert.equal(updateNotesResponse.status, 200);
    const updateNotesPayload = await updateNotesResponse.json();
    assert.equal(updateNotesPayload.ok, true);
    assert.equal(updateNotesPayload.notice, "lead-notes-saved");
    assert.equal(updateNotesPayload.entry.notes, "Позвонить после 5 PM и уточнить код домофона.");

    const notedListResponse = await fetch(`${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("funnel-request-1")}&entry=${encodeURIComponent(entryId)}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const notedListBody = await notedListResponse.text();
    assert.equal(notedListResponse.status, 200);
    assert.match(notedListBody, /data-quote-entry-notes-form="true"/);
    assert.match(notedListBody, /Заметки/);
    assert.match(notedListBody, /Позвонить после 5 PM и уточнить код домофона\./);
    assert.match(
      notedListBody,
      /document\.querySelectorAll\('\[data-quote-entry-notes-form="true"\]'\)[\s\S]*if \(activeSection !== "funnel"\) return;/
    );

    const discussionAt = "2026-04-17T09:15";
    const updateStatusResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-lead-status",
        entryId,
        leadStatus: "discussion",
        managerId: managerUserId,
        discussionNextContactAt: discussionAt,
        returnTo: "/admin/quote-ops?section=funnel",
      }),
    });
    assert.equal(updateStatusResponse.status, 200);
    const updateStatusPayload = await updateStatusResponse.json();
    assert.equal(updateStatusPayload.ok, true);
    assert.equal(updateStatusPayload.notice, "lead-stage-saved");
    assert.equal(updateStatusPayload.entry.leadStatus, "discussion");
    assert.equal(updateStatusPayload.entry.taskLabel, "Связаться с клиентом в назначенное время");

    const dialogAfterStatusResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("funnel-request-1")}&entry=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const dialogAfterStatusBody = await dialogAfterStatusResponse.text();
    assert.equal(dialogAfterStatusResponse.status, 200);
    assert.match(dialogAfterStatusBody, /Связаться с клиентом в назначенное время/);
    assert.doesNotMatch(dialogAfterStatusBody, /<span class="admin-badge admin-badge-success">Закрыта<\/span>/);
    assert.doesNotMatch(dialogAfterStatusBody, /<span class="admin-badge admin-badge-muted">Отменена<\/span>/);

    const tasksResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?section=tasks&managerId=${encodeURIComponent(managerUserId)}&q=${encodeURIComponent("funnel-request-1")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const tasksBody = await tasksResponse.text();
    assert.equal(tasksResponse.status, 200);
    assert.match(tasksBody, /Таски по заявкам/);
    assert.doesNotMatch(tasksBody, /Весь поток заявок с сайта\./);
    assert.doesNotMatch(tasksBody, /За 24 часа/);
    assert.doesNotMatch(tasksBody, /admin-quote-manual-task-card/);
    assert.match(tasksBody, /id="admin-quote-create-task-dialog"/);
    assert.match(tasksBody, /admin-nav-sublink-danger/);
    assert.match(tasksBody, /Выберите админа или менеджера/);
    assert.match(tasksBody, /Zoe Admin — админ/);
    assert.match(tasksBody, /name="action" value="create-lead-task"/);
    assert.match(tasksBody, /admin-orders-filter-toggle/);
    assert.match(tasksBody, /admin-clients-search-form/);
    assert.match(tasksBody, /admin-quote-task-table/);
    assert.match(tasksBody, /<th>Таск<\/th>\s*<th>Дедлайн<\/th>\s*<th>Этап<\/th>\s*<th>Исполнитель<\/th>\s*<th>Заявка<\/th>/);
    assert.doesNotMatch(tasksBody, /<th>Действия<\/th>/);
    assert.match(tasksBody, /data-admin-dialog-row="true"/);
    assert.match(tasksBody, /admin-quote-task-row-overdue td/);
    assert.match(tasksBody, /admin-quote-task-deadline-note-overdue/);
    assert.match(tasksBody, /Связаться с клиентом в назначенное время/);
    assert.match(tasksBody, /Mila Rivers/);
    assert.match(tasksBody, /Следующее действие/);
    assert.match(tasksBody, /Дозвонились/);
    assert.match(tasksBody, /data-quote-task-contacted-toggle=/);
    const taskId = getLeadTaskIdByEntryId(tasksBody, entryId);
    assert.ok(taskId);

    const createManualTaskResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-lead-task",
        entryId,
        taskTitle: "Проверить ручную заметку менеджера",
        taskDueAt: "2030-05-01T10:30",
        assigneeId: adminUserId,
        returnTo: `/admin/quote-ops?section=tasks&managerId=${encodeURIComponent(managerUserId)}&q=${encodeURIComponent("funnel-request-1")}`,
      }),
    });
    assert.equal(createManualTaskResponse.status, 303);
    assert.match(createManualTaskResponse.headers.get("location") || "", /notice=task-created/);

    const manualTasksResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?section=tasks&managerId=${encodeURIComponent(managerUserId)}&q=${encodeURIComponent("funnel-request-1")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const manualTasksBody = await manualTasksResponse.text();
    assert.equal(manualTasksResponse.status, 200);
    assert.match(manualTasksBody, /Проверить ручную заметку менеджера/);
    assert.match(manualTasksBody, /Zoe Admin/);
    assert.match(manualTasksBody, /Закрыть ручной таск/);
    assert.match(manualTasksBody, /Отметить выполнено/);

    const confirmResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "complete-lead-task",
        entryId,
        taskId,
        taskAction: "contacted",
        nextStatus: "confirmed",
        returnTo: `/admin/quote-ops?section=tasks&managerId=${encodeURIComponent(managerUserId)}`,
      }),
    });
    assert.equal(confirmResponse.status, 303);
    assert.match(confirmResponse.headers.get("location") || "", /notice=lead-confirmed/);

    const confirmedFunnelResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?section=funnel&leadStatus=confirmed&q=${encodeURIComponent("funnel-request-1")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const confirmedFunnelBody = await confirmedFunnelResponse.text();
    assert.equal(confirmedFunnelResponse.status, 200);
    assert.match(confirmedFunnelBody, /Подтверждено/);
    assert.match(confirmedFunnelBody, /Заказ создан/);
    assert.match(confirmedFunnelBody, /Mila Rivers/);
    assert.match(confirmedFunnelBody, /data-quote-card-deadline-row="true" hidden/);

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders?q=${encodeURIComponent("Funnel Lead")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Funnel Lead/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("auto-assigns new quote submissions to managers in round robin order", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-quote-manager-round-robin-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-manager-rr-123",
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
    const createUser = async (payload) => {
      const response = await fetch(`${started.baseUrl}/admin/settings`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
        body: new URLSearchParams({
          action: "create_user",
          name: payload.name,
          role: payload.role,
          status: "active",
          staffStatus: "active",
          email: payload.email,
          phone: payload.phone,
          address: payload.address,
          compensationValue: "180",
          compensationType: "fixed",
          notes: payload.notes || "",
          password: "StrongPass123!",
        }),
      });
      assert.equal(response.status, 303);
      assert.match(response.headers.get("location") || "", /notice=user-created-email-skipped/);
    };

    await createUser({
      name: "Mila Rivers",
      role: "manager",
      email: "mila.rr@example.com",
      phone: "3125550301",
      address: "301 Manager Loop, Naperville, IL 60540",
      notes: "Round robin manager A",
    });
    await createUser({
      name: "Nora Lane",
      role: "manager",
      email: "nora.rr@example.com",
      phone: "3125550302",
      address: "302 Manager Loop, Naperville, IL 60540",
      notes: "Round robin manager B",
    });
    await createUser({
      name: "Zoe Admin",
      role: "admin",
      email: "zoe.admin@example.com",
      phone: "3125550303",
      address: "303 Admin Loop, Naperville, IL 60540",
      notes: "Should stay out of lead assignment",
    });

    for (const request of [
      {
        requestId: "rr-request-1",
        fullName: "Round Robin One",
        phone: "312-555-0311",
        email: "rr-one@example.com",
        fullAddress: "111 Round Robin Ave, Aurora, IL 60502",
      },
      {
        requestId: "rr-request-2",
        fullName: "Round Robin Two",
        phone: "312-555-0312",
        email: "rr-two@example.com",
        fullAddress: "112 Round Robin Ave, Aurora, IL 60502",
      },
      {
        requestId: "rr-request-3",
        fullName: "Round Robin Three",
        phone: "312-555-0313",
        email: "rr-three@example.com",
        fullAddress: "113 Round Robin Ave, Aurora, IL 60502",
      },
    ]) {
      const quoteResponse = await submitQuote(started.baseUrl, request);
      assert.equal(quoteResponse.status, 201);
    }

    const quoteOpsResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("rr-request-")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const quoteOpsBody = await quoteOpsResponse.text();
    assert.equal(quoteOpsResponse.status, 200);

    const fetchQuoteBody = async (query) => {
      const response = await fetch(`${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent(query)}`, {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      });
      assert.equal(response.status, 200);
      return response.text();
    };
    assert.match(
      await fetchQuoteBody("rr-request-1"),
      /<option value="[^"]+" selected>\s*Mila Rivers\s*<\/option>/
    );
    assert.match(
      await fetchQuoteBody("rr-request-2"),
      /<option value="[^"]+" selected>\s*Nora Lane\s*<\/option>/
    );
    assert.match(
      await fetchQuoteBody("rr-request-3"),
      /<option value="[^"]+" selected>\s*Mila Rivers\s*<\/option>/
    );
    assert.match(quoteOpsBody, />Mila Rivers<\/option>/);
    assert.match(quoteOpsBody, />Nora Lane<\/option>/);
    assert.doesNotMatch(quoteOpsBody, />Не назначен<\/option>/);
    assert.doesNotMatch(quoteOpsBody, />Zoe Admin<\/option>/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("advances no-response lead tasks from same-day retry to next-morning and then refusal", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-quote-task-flow-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-taskflow-123",
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
    ADMIN_STAFF_STORE_PATH: path.join(tempDir, "admin-staff-store.json"),
    ADMIN_USERS_STORE_PATH: path.join(tempDir, "admin-users-store.json"),
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "taskflow-request-1",
      fullName: "No Answer Lead",
      phone: "312-555-0190",
      email: "no.answer@example.com",
      serviceType: "regular",
      selectedDate: "2026-04-18",
      selectedTime: "10:00",
      fullAddress: "901 Follow Up Dr, Aurora, IL 60506",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const listResponse = await fetch(`${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("taskflow-request-1")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const listBody = await listResponse.text();
    assert.equal(listResponse.status, 200);
    const entryIdMatch = listBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

    const tasksResponse = await fetch(`${started.baseUrl}/admin/quote-ops?section=tasks&q=${encodeURIComponent("taskflow-request-1")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const tasksBody = await tasksResponse.text();
    assert.equal(tasksResponse.status, 200);
    assert.match(tasksBody, /admin-quote-task-table/);
    assert.match(tasksBody, /Связаться с клиентом/);
    assert.match(
      tasksBody,
      new RegExp(`href="\\/admin\\/quote-ops\\?[^"]*entry=${entryId}[^"]*"[^>]*>Открыть заявку<`)
    );
    let taskId = getLeadTaskIdByEntryId(tasksBody, entryId);
    assert.ok(taskId);

    const directEntryResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?section=tasks&q=${encodeURIComponent("taskflow-request-1")}&entry=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const directEntryBody = await directEntryResponse.text();
    assert.equal(directEntryResponse.status, 200);
    assert.match(directEntryBody, /data-admin-dialog-autopen="true"/);
    assert.match(directEntryBody, new RegExp(`data-admin-dialog-return-url="\\/admin\\/quote-ops\\?[^"]*q=taskflow-request-1[^"]*"`));

    for (const expected of [
      /Связаться с клиентом/,
      /Перезвонить клиенту на следующий день утром/,
    ]) {
      const noAnswerResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
        body: new URLSearchParams({
          action: "complete-lead-task",
          entryId,
          taskId,
          taskAction: "no-answer",
          returnTo: "/admin/quote-ops?section=tasks",
        }),
      });
      assert.equal(noAnswerResponse.status, 303);
      assert.match(noAnswerResponse.headers.get("location") || "", /notice=task-saved/);

      const updatedTasksResponse = await fetch(
        `${started.baseUrl}/admin/quote-ops?section=tasks&q=${encodeURIComponent("taskflow-request-1")}`,
        {
          headers: {
            cookie: `shynli_admin_session=${sessionCookieValue}`,
          },
        }
      );
      const updatedTasksBody = await updatedTasksResponse.text();
      assert.equal(updatedTasksResponse.status, 200);
      assert.match(updatedTasksBody, expected);
      if (String(expected) === String(/Связаться с клиентом/)) {
        assert.doesNotMatch(updatedTasksBody, /Перезвонить клиенту через 3 часа/);
      }
      assert.match(updatedTasksBody, /Без ответа/);
      taskId = getLeadTaskIdByEntryId(updatedTasksBody, entryId);
      assert.ok(taskId);
    }

    const declineResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "complete-lead-task",
        entryId,
        taskId,
        taskAction: "no-answer",
        returnTo: "/admin/quote-ops?section=tasks",
      }),
    });
    assert.equal(declineResponse.status, 303);
    assert.match(declineResponse.headers.get("location") || "", /notice=task-saved/);

    const declinedFunnelResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?section=funnel&leadStatus=declined&q=${encodeURIComponent("taskflow-request-1")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const declinedFunnelBody = await declinedFunnelResponse.text();
    assert.equal(declinedFunnelResponse.status, 200);
    assert.match(declinedFunnelBody, /No Answer Lead/);
    assert.match(declinedFunnelBody, /Отказ/);

    const emptyTasksResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?section=tasks&q=${encodeURIComponent("taskflow-request-1")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const emptyTasksBody = await emptyTasksResponse.text();
    assert.equal(emptyTasksResponse.status, 200);
    assert.match(emptyTasksBody, /Для текущего фильтра открытых тасков нет/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("sends SMS from the quote dialog through Go High Level", async () => {
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-sms-quote-123",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-sms-quote-123",
        conversationId: "conversation-sms-quote-123",
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
      requestId: "sms-quote-request-1",
      fullName: "SMS Quote Lead",
      phone: "312-555-0177",
      email: "sms.quote@example.com",
      serviceType: "regular",
      selectedDate: "2026-04-19",
      selectedTime: "11:30",
      fullAddress: "825 Message Lane, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await getQuoteOpsEntryId(started.baseUrl, sessionCookieValue, "sms-quote-request-1");
    const returnTo = `/admin/quote-ops?q=${encodeURIComponent("sms-quote-request-1")}&entry=${encodeURIComponent(entryId)}`;

    const quoteOpsResponse = await fetch(`${started.baseUrl}${returnTo}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const quoteOpsBody = await quoteOpsResponse.text();
    assert.equal(quoteOpsResponse.status, 200);
    assert.match(quoteOpsBody, /data-admin-ghl-sms="true"/);
    assert.match(quoteOpsBody, /Отправить SMS/);

    const sendSmsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-quote-sms",
        entryId,
        message: "Your SHYNLI team is confirming your cleaning appointment.",
        returnTo,
      }),
    });

    assert.equal(sendSmsResponse.status, 303);
    assert.match(sendSmsResponse.headers.get("location") || "", /notice=quote-sms-sent/);
    assert.match(sendSmsResponse.headers.get("location") || "", /smsTarget=quote/);
    assert.match(sendSmsResponse.headers.get("location") || "", new RegExp(`smsRef=${escapeRegex(entryId)}`));

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequest = captureLines.find((record) => {
      if (!String(record.url).includes("/conversations/messages")) return false;
      try {
        return JSON.parse(record.body).message ===
          "Your SHYNLI team is confirming your cleaning appointment.";
      } catch {
        return false;
      }
    });
    assert.ok(smsRequest);
    assert.equal(smsRequest.method, "POST");

    const smsPayload = JSON.parse(smsRequest.body);
    assert.deepEqual(smsPayload, {
      type: "SMS",
      contactId: "contact-sms-quote-123",
      message: "Your SHYNLI team is confirming your cleaning appointment.",
      status: "pending",
      toNumber: "+13125550177",
    });
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
  }
});
