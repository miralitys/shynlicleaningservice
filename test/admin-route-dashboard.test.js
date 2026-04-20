"use strict";

const {
  crypto,
  fs,
  os,
  path,
  test,
  assert,
  createAdminDomainHelpers,
  generateTotpCode,
  hashPassword,
  loadAdminConfig,
  createFetchStub,
  createSmtpTestServer,
  startServer,
  stopServer,
  SIGNATURE_DATA_URL,
  getSetCookies,
  getCookieValue,
  escapeRegex,
  getOrderFunnelLaneSlice,
  normalizeEmailSource,
  decodeQuotedPrintable,
  getChicagoDateValue,
  getChicagoDateTimeLocalValue,
  getStaffAssignmentEntryIdByCustomerName,
  getLeadTaskIdByEntryId,
  createAdminSession,
  createStripeWebhookSignature,
  submitQuote,
  createOrderFromQuoteRequest,
  getQuoteOpsEntryId,
} = require("./admin-route-helpers");

test("formats admin timestamps in America/Chicago", () => {
  const domain = createAdminDomainHelpers();
  assert.equal(domain.formatAdminDateTime("2026-04-13T02:30:00.000Z"), "04/12/2026, 09:30 PM");
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
  const overdueTaskAt = getChicagoDateTimeLocalValue(-1, 9, 15);
  const futureTaskAt = getChicagoDateTimeLocalValue(1, 10, 30);
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

    const freshLeadResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-new-1",
      fullName: "Fresh Lead",
      phone: "312-555-0203",
      email: "fresh.lead@example.com",
      serviceType: "regular",
      selectedDate: futureDate,
      selectedTime: "14:00",
      fullAddress: "789 Fresh Blvd, Bolingbrook, IL 60440",
    });
    assert.equal(freshLeadResponse.status, 201);

    const overdueLeadResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-overdue-1",
      fullName: "Overdue Task Lead",
      phone: "312-555-0204",
      email: "overdue.task@example.com",
      serviceType: "deep",
      selectedDate: futureDate,
      selectedTime: "15:00",
      fullAddress: "160 Overdue Ct, Naperville, IL 60563",
    });
    assert.equal(overdueLeadResponse.status, 201);

    const futureLeadResponse = await submitQuote(started.baseUrl, {
      requestId: "overview-future-task-1",
      fullName: "Future Task Lead",
      phone: "312-555-0205",
      email: "future.task@example.com",
      serviceType: "regular",
      selectedDate: futureDate,
      selectedTime: "16:30",
      fullAddress: "220 Future Task Ln, Plainfield, IL 60544",
    });
    assert.equal(futureLeadResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const overdueLeadEntryId = await getQuoteOpsEntryId(started.baseUrl, sessionCookieValue, "overview-overdue-1");
    const futureLeadEntryId = await getQuoteOpsEntryId(started.baseUrl, sessionCookieValue, "overview-future-task-1");

    const overdueTaskStatusResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-lead-status",
        entryId: overdueLeadEntryId,
        leadStatus: "discussion",
        discussionNextContactAt: overdueTaskAt,
        returnTo: "/admin/quote-ops?section=tasks",
      }),
    });
    assert.equal(overdueTaskStatusResponse.status, 200);

    const futureTaskStatusResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
      },
      body: new URLSearchParams({
        action: "update-lead-status",
        entryId: futureLeadEntryId,
        leadStatus: "discussion",
        discussionNextContactAt: futureTaskAt,
        returnTo: "/admin/quote-ops?section=tasks",
      }),
    });
    assert.equal(futureTaskStatusResponse.status, 200);

    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "overview-today-1");
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "overview-future-1");

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
    assert.match(dashboardBody, /Таски на контроле/i);
    assert.match(dashboardBody, /Заказы без команды/i);
    assert.match(dashboardBody, /Заказы на сегодня/i);
    assert.ok(dashboardBody.indexOf("Назначена дата") < dashboardBody.indexOf("Новые заявки"));
    assert.ok(dashboardBody.indexOf("Новые заявки") < dashboardBody.indexOf("Таски на контроле"));
    assert.ok(dashboardBody.indexOf("Таски на контроле") < dashboardBody.indexOf("Заказы без команды"));
    assert.ok(dashboardBody.indexOf("Заказы без команды") < dashboardBody.indexOf("Заказы на сегодня"));

    const newRequestsSection = dashboardBody.match(
      /data-admin-dashboard-new-requests="true"[\s\S]*?<\/table>/
    )?.[0];
    const unassignedSection = dashboardBody.match(
      /data-admin-dashboard-unassigned-orders="true"[\s\S]*?<\/table>/
    )?.[0];
    const todaySection = dashboardBody.match(
      /data-admin-dashboard-today-orders="true"[\s\S]*?<\/table>/
    )?.[0];

    assert.ok(newRequestsSection);
    assert.match(dashboardBody, /data-admin-dashboard-tasks="true"/);
    assert.ok(unassignedSection);
    assert.ok(todaySection);
    assert.match(newRequestsSection, /Fresh Lead/);
    assert.match(newRequestsSection, /data-admin-dialog-row="true"/);
    assert.match(newRequestsSection, /<span class="admin-table-link">Fresh Lead<\/span>/);
    assert.doesNotMatch(newRequestsSection, /<a class="admin-table-link"/);
    assert.match(newRequestsSection, /overview-new-1/);
    assert.doesNotMatch(newRequestsSection, /Today Assigned/);
    assert.doesNotMatch(newRequestsSection, /Future No Team/);
    assert.match(dashboardBody, /Overdue Task Lead/);
    assert.match(dashboardBody, /Fresh Lead/);
    assert.doesNotMatch(dashboardBody, /Просроченные/);
    assert.doesNotMatch(dashboardBody, /На сегодня/);
    assert.doesNotMatch(dashboardBody, /Просрочено/);
    assert.match(dashboardBody, /admin-dialog admin-dialog-wide admin-dialog-orders" id="admin-quote-task-result-dialog-/);
    assert.doesNotMatch(dashboardBody, /data-admin-dashboard-tasks="true"[\s\S]*Future Task Lead/);
    assert.match(unassignedSection, /data-admin-dialog-row="true"/);
    assert.match(unassignedSection, /<span class="admin-table-link">Future No Team<\/span>/);
    assert.match(dashboardBody, /id="admin-order-detail-dialog-/);
    assert.match(dashboardBody, /\.admin-quote-entry-detail-grid\s*\{/);
    assert.match(dashboardBody, /\.admin-quote-task-dialog-head\s*\{/);
    assert.match(unassignedSection, /Future No Team/);
    assert.doesNotMatch(unassignedSection, /Today Assigned/);
    assert.match(unassignedSection, /Команда не назначена/);
    assert.match(todaySection, /data-admin-dialog-row="true"/);
    assert.match(todaySection, /<span class="admin-table-link">Today Assigned<\/span>/);
    assert.match(dashboardBody, /id="admin-order-detail-dialog-/);
    assert.match(todaySection, /Today Assigned/);
    assert.match(todaySection, /Anna Petrova/);
    assert.doesNotMatch(todaySection, /Future No Team/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
