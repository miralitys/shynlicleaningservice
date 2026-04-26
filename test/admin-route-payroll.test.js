"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFetchStub,
  startServer,
  stopServer,
} = require("./server-test-helpers");
const {
  loadAdminConfig,
} = require("../lib/admin-auth");
const {
  createAdminSession,
  getCookieValue,
  getSetCookies,
  submitQuote,
  createOrderFromQuoteRequest,
} = require("./admin-route-helpers");

test("renders admin payroll and lets admins mark payouts as paid", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-payroll-admin-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-payroll-admin",
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
          distanceMeters: 6400,
          duration: "1200s",
        },
      ],
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
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "payroll-admin-order",
      fullName: "Payroll Admin Client",
      phone: "312-555-2201",
      email: "payroll.admin.client@example.com",
      serviceType: "deep",
      selectedDate: "2026-05-01",
      selectedTime: "10:00",
      fullAddress: "500 Payroll Ave, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "payroll-admin-order"
    );

    const createStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-staff",
        name: "Olga Payroll",
        role: "cleaner",
        phone: "3125554400",
        email: "olga.payroll@example.com",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        compensationValue: "180",
        compensationType: "fixed",
        status: "active",
        notes: "",
      }),
    });
    assert.equal(createStaffResponse.status, 303);

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const staffId = staffStorePayload.staff[0].id;
    assert.ok(staffId);

    const assignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-assignment",
        entryId,
        staffIds: staffId,
        scheduleDate: "",
        scheduleTime: "",
        status: "planned",
        notes: "",
      }),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const completeResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/orders",
        orderStatus: "cleaning-complete",
        totalPrice: "240",
      }),
    });
    assert.equal(completeResponse.status, 303);

    const payrollResponse = await fetch(`${started.baseUrl}/admin/payroll`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const payrollBody = await payrollResponse.text();
    assert.equal(payrollResponse.status, 200);
    assert.match(payrollBody, /Зарплаты/i);
    assert.match(payrollBody, /Payroll Admin Client/i);
    assert.match(payrollBody, /Olga Payroll/i);
    assert.match(payrollBody, /\$180\.00/);
    assert.match(payrollBody, /К выплате/i);
    assert.match(payrollBody, /name="dateFrom"/);
    assert.match(payrollBody, /name="dateTo"/);
    assert.match(payrollBody, /class="admin-nav-link admin-nav-link-parent-active" href="\/admin\/staff">Сотрудники<\/a>/);
    assert.match(payrollBody, /class="admin-nav-sublink admin-nav-sublink-active" href="\/admin\/payroll">Зарплаты<\/a>/);
    assert.match(payrollBody, /data-admin-dialog-row="true"/);
    assert.match(payrollBody, /admin-order-detail-dialog-/);
    assert.doesNotMatch(payrollBody, /Открыть заказ/);

    const markPaidResponse = await fetch(`${started.baseUrl}/admin/payroll`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "mark-payroll-paid",
        entryId,
        staffId,
        returnTo: "/admin/payroll",
      }),
    });
    assert.equal(markPaidResponse.status, 303);
    assert.match(markPaidResponse.headers.get("location") || "", /notice=payroll-paid/);

    const paidPayrollResponse = await fetch(
      `${started.baseUrl}${(markPaidResponse.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const paidPayrollBody = await paidPayrollResponse.text();
    assert.equal(paidPayrollResponse.status, 200);
    assert.match(paidPayrollBody, /Выплачено/i);
    assert.match(paidPayrollBody, /Строка зарплаты отмечена как выплаченная/i);

    const today = new Date();
    const todayLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;

    const filteredPaidPayrollResponse = await fetch(
      `${started.baseUrl}/admin/payroll?status=paid&staffId=${encodeURIComponent(staffId)}&dateFrom=${encodeURIComponent(todayLabel)}&dateTo=${encodeURIComponent(todayLabel)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const filteredPaidPayrollBody = await filteredPaidPayrollResponse.text();
    assert.equal(filteredPaidPayrollResponse.status, 200);
    assert.match(filteredPaidPayrollBody, /Payroll Admin Client/i);
    assert.match(filteredPaidPayrollBody, /value="paid" selected/);
    assert.match(filteredPaidPayrollBody, new RegExp(`value="${staffId}" selected`));
    assert.match(filteredPaidPayrollBody, new RegExp(`name="dateFrom" value="${todayLabel}"`));
    assert.match(filteredPaidPayrollBody, new RegExp(`name="dateTo" value="${todayLabel}"`));

    const emptyRangePayrollResponse = await fetch(
      `${started.baseUrl}/admin/payroll?status=paid&staffId=${encodeURIComponent(staffId)}&dateFrom=2099-01-01&dateTo=2099-01-31`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const emptyRangePayrollBody = await emptyRangePayrollResponse.text();
    assert.equal(emptyRangePayrollResponse.status, 200);
    assert.match(emptyRangePayrollBody, /По текущему фильтру начислений нет/i);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("shows employee-only payroll history inside the account workspace", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-payroll-account-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-payroll-account",
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
          distanceMeters: 7200,
          duration: "1080s",
        },
      ],
    },
  ]);
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
      requestId: "payroll-account-order",
      fullName: "Payroll Account Client",
      phone: "312-555-2202",
      email: "payroll.account.client@example.com",
      serviceType: "standard",
      selectedDate: "2026-05-03",
      selectedTime: "11:30",
      fullAddress: "610 Cleaner Route, Romeoville, IL 60446",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "payroll-account-order"
    );

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Alina Payroll",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "alina.payroll@example.com",
        phone: "3125558899",
        address: "881 Worker Street, Bolingbrook, IL 60440",
        compensationValue: "25",
        compensationType: "percent",
        notes: "",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const staffId = staffStorePayload.staff[0].id;
    assert.ok(staffId);

    const assignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-assignment",
        entryId,
        staffIds: staffId,
        scheduleDate: "",
        scheduleTime: "",
        status: "planned",
        notes: "",
      }),
    });
    assert.equal(assignResponse.status, 303);

    const completeResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/orders",
        orderStatus: "cleaning-complete",
        totalPrice: "240",
      }),
    });
    assert.equal(completeResponse.status, 303);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.payroll@example.com",
        password: "StrongPass123!",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/account");
    const userSessionCookieValue = getCookieValue(
      getSetCookies(accountLoginResponse),
      "shynli_user_session"
    );
    assert.ok(userSessionCookieValue);

    const accountPayrollResponse = await fetch(`${started.baseUrl}/account?section=payroll`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const accountPayrollBody = await accountPayrollResponse.text();
    assert.equal(accountPayrollResponse.status, 200);
    assert.match(accountPayrollBody, /Зарплаты/i);
    assert.match(accountPayrollBody, /Payroll Account Client/i);
    assert.match(accountPayrollBody, /\$60\.00/);
    assert.match(accountPayrollBody, /К выплате/i);
    assert.match(accountPayrollBody, /Моя зарплата/i);

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const userId = usersStorePayload.users[0].id;
    assert.ok(userId);

    const updateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "update_user",
        userId,
        staffId,
        name: "Ramis Iaparov",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "alina.payroll@example.com",
        phone: "3125558899",
        address: "881 Worker Street, Bolingbrook, IL 60440",
        compensationValue: "180",
        compensationType: "fixed",
        notes: "",
        password: "",
      }),
    });
    assert.equal(updateUserResponse.status, 303);

    const adminPayrollAfterUpdateResponse = await fetch(`${started.baseUrl}/admin/payroll`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const adminPayrollAfterUpdateBody = await adminPayrollAfterUpdateResponse.text();
    assert.equal(adminPayrollAfterUpdateResponse.status, 200);
    assert.match(adminPayrollAfterUpdateBody, /Ramis Iaparov/i);
    assert.match(adminPayrollAfterUpdateBody, /Фикс:\s*\$180\.00/i);
    assert.match(adminPayrollAfterUpdateBody, /\$180\.00/);
    assert.doesNotMatch(adminPayrollAfterUpdateBody, />Не указана</);

    const accountPayrollAfterUpdateResponse = await fetch(`${started.baseUrl}/account?section=payroll`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const accountPayrollAfterUpdateBody = await accountPayrollAfterUpdateResponse.text();
    assert.equal(accountPayrollAfterUpdateResponse.status, 200);
    assert.match(accountPayrollAfterUpdateBody, /Фикс:\s*\$180\.00/i);
    assert.match(accountPayrollAfterUpdateBody, /\$180\.00/);
    assert.doesNotMatch(accountPayrollAfterUpdateBody, />Не указана</);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
