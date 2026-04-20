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

test("sends staff SMS over ajax and keeps SMS history in the staff dialog", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-staff-sms-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "GET",
      match: "/contacts/",
      status: 200,
      body: {
        contacts: [
          {
            id: "contact-staff-sms-123",
            phone: "(630) 555-0101",
          },
        ],
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-staff-sms-123",
        conversationId: "conversation-staff-sms-123",
      },
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
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify(
        {
          version: 1,
          staff: [
            {
              id: "staff-sms-anna",
              name: "Anna Petrova",
              role: "Менеджер",
              phone: "+1(630)555-0101",
              email: "anna.petrova@example.com",
              address: "720 Plainfield Rd, Willowbrook, IL 60527",
              status: "active",
            },
          ],
          assignments: [],
        },
        null,
        2
      )}\n`
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const pageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const pageBody = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(pageBody, /SMS сотруднику/i);
    assert.match(pageBody, /data-admin-ghl-sms="true"/i);

    const sendSmsResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "send-staff-sms",
        staffId: "staff-sms-anna",
        message: "Staff SMS history test",
        returnTo: "/admin/staff",
      }),
    });

    assert.equal(sendSmsResponse.status, 200);
    const sendSmsPayload = await sendSmsResponse.json();
    assert.equal(sendSmsPayload.ok, true);
    assert.equal(sendSmsPayload.notice, "staff-sms-sent");
    assert.equal(sendSmsPayload.sms.feedbackState, "success");
    assert.equal(sendSmsPayload.sms.feedbackMessage, "SMS отправлена через Go High Level.");
    assert.equal(sendSmsPayload.sms.historyCountLabel, "1 SMS");
    assert.equal(sendSmsPayload.sms.history.length, 1);
    assert.equal(sendSmsPayload.sms.history[0].message, "Staff SMS history test");
    assert.equal(sendSmsPayload.sms.history[0].source, "manual");

    const afterResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const afterBody = await afterResponse.text();
    assert.equal(afterResponse.status, 200);
    assert.match(afterBody, /История SMS/);
    assert.match(afterBody, /Staff SMS history test/);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequest = captureLines.find((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.ok(smsRequest);
    const smsPayload = JSON.parse(smsRequest.body);
    assert.deepEqual(smsPayload, {
      type: "SMS",
      contactId: "contact-staff-sms-123",
      message: "Staff SMS history test",
      status: "pending",
      toNumber: "+16305550101",
    });
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("resends a W-9 reminder from the staff card when the form is still missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-w9-reminder-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const smtpServer = await createSmtpTestServer();
  const fetchStub = createFetchStub([
    {
      method: "GET",
      match: "/contacts/",
      status: 200,
      body: {
        contacts: [
          {
            id: "contact-w9-rina-123",
            phone: "(312) 555-0142",
          },
        ],
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 200,
      body: {
        id: "message-w9-rina-123",
        conversationId: "conversation-w9-rina-123",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
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

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequest = captureLines.find((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.ok(smsRequest);
    const smsPayload = JSON.parse(smsRequest.body);
    assert.equal(smsPayload.type, "SMS");
    assert.equal(smsPayload.contactId, "contact-w9-rina-123");
    assert.equal(smsPayload.status, "pending");
    assert.equal(smsPayload.toNumber, "+13125550142");
    assert.match(
      smsPayload.message,
      /Please complete and sign your Contract and W-9 here:/i
    );

    const staffPageAfterReminderResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageAfterReminderBody = await staffPageAfterReminderResponse.text();
    assert.equal(staffPageAfterReminderResponse.status, 200);
    assert.match(staffPageAfterReminderBody, /История SMS/);
    assert.match(staffPageAfterReminderBody, /Автоматически/);
    assert.match(
      staffPageAfterReminderBody,
      /Please complete and sign your Contract and W-9 here:/i
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
    fetchStub.cleanup();
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
    assert.equal(usersPayload.users[0].isEmployee, false);

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

test("allows admin users marked as employees into staff scheduling and onboarding documents", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-admin-employee-"));
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
        name: "Ramis Admin",
        role: "admin",
        isEmployee: "1",
        status: "active",
        staffStatus: "active",
        email: "ramis.admin.employee@example.com",
        phone: "3125550191",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        notes: "Admin can also take jobs",
        password: "AdminPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(staffPayload.staff[0].role, "Админ");
    assert.equal(usersPayload.users[0].isEmployee, true);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Ramis Admin/i);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "ramis.admin.employee@example.com",
        password: "AdminPass123!",
        next: "/account?focus=w9#account-w9",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/account?focus=w9#account-w9");
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("persists an unchecked assignable-orders flag for non-admin users", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-user-assignable-"));
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

    const initialUsersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const managerUser = initialUsersPayload.users[0];
    assert.equal(managerUser.isEmployee, true);

    const updateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "update_user",
        userId: managerUser.id,
        staffId: managerUser.staffId,
        name: "Marta Greene",
        role: "manager",
        isEmployee: "0",
        status: "active",
        staffStatus: "active",
        email: "marta.manager@example.com",
        phone: "3125550198",
        address: "500 Executive Dr, Naperville, IL 60563",
        notes: "No longer assignable",
        password: "",
      }),
    });
    assert.equal(updateUserResponse.status, 303);
    assert.match(updateUserResponse.headers.get("location") || "", /notice=user-updated/);

    const updatedUsersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(updatedUsersPayload.users[0].isEmployee, false);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);

    const dialogMatch = settingsBody.match(
      new RegExp(
        `id="admin-settings-user-dialog-${escapeRegex(managerUser.id)}"[\\s\\S]*?<\\/dialog>`
      )
    );
    assert.ok(dialogMatch);
    assert.doesNotMatch(dialogMatch[0], /name="isEmployee" value="1" checked/);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("keeps non-assignable users out of the calendar and order assignment flows", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-user-assignable-enforcement-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-assignable-123",
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

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Nina Hidden",
        role: "cleaner",
        isEmployee: "0",
        status: "active",
        staffStatus: "active",
        email: "nina.hidden@example.com",
        phone: "3125550177",
        address: "177 Hidden Ln, Aurora, IL 60504",
        notes: "Should stay out of assignments",
        password: "CleanerPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const usersPayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const blockedUser = usersPayload.users[0];
    const blockedStaff = staffPayload.staff[0];
    assert.equal(blockedUser.isEmployee, false);
    assert.equal(blockedStaff.name, "Nina Hidden");

    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "assignable-hidden-request-1",
      fullName: "Calendar Hidden Customer",
      phone: "312-555-0189",
      email: "calendar.hidden@example.com",
      selectedDate: "2026-04-21",
      selectedTime: "09:00",
      fullAddress: "215 North Elm Street, Naperville, IL 60540",
    });
    assert.equal(quoteResponse.status, 201);

    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "assignable-hidden-request-1"
    );

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.doesNotMatch(
      ordersBody,
      /name="assignedStaff" value="Nina Hidden"/
    );

    const calendarResponse = await fetch(
      `${started.baseUrl}/admin/staff?section=calendar&calendarStart=2026-04-21`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const calendarBody = await calendarResponse.text();
    assert.equal(calendarResponse.status, 200);
    assert.doesNotMatch(calendarBody, /Nina Hidden/);

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
        ["staffIds", blockedStaff.id],
        ["status", "confirmed"],
        ["notes", "Manual tamper attempt"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const updatedStaffPayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const savedAssignment = updatedStaffPayload.assignments.find((record) => record.entryId === entryId);
    assert.ok(savedAssignment);
    assert.deepEqual(savedAssignment.staffIds, []);

    const refreshedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const refreshedOrdersBody = await refreshedOrdersResponse.text();
    assert.equal(refreshedOrdersResponse.status, 200);
    assert.doesNotMatch(refreshedOrdersBody, /Nina Hidden/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("gives managers the same admin workspace access as admins", async () => {
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

    const accountLoginResponse = await fetch(`${started.baseUrl}/admin/login`, {
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
    assert.ok(!getCookieValue(getSetCookies(accountLoginResponse), "shynli_admin_challenge"));

    const userSessionCookieValue = getCookieValue(getSetCookies(accountLoginResponse), "shynli_user_session");
    assert.ok(userSessionCookieValue);

    const accountDashboardResponse = await fetch(`${started.baseUrl}/account?focus=w9`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountDashboardResponse.status, 303);
    assert.equal(accountDashboardResponse.headers.get("location"), "/admin");

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardBody, /Обзор/i);
    assert.match(dashboardBody, /Менеджер/i);

    const managerWorkspacePages = [
      { path: "/admin/orders", pattern: /Заказы/i },
      { path: "/admin/clients", pattern: /Клиенты/i },
      { path: "/admin/staff", pattern: /Сотрудники/i },
      { path: "/admin/quote-ops", pattern: /Заявки/i },
    ];

    for (const page of managerWorkspacePages) {
      const response = await fetch(`${started.baseUrl}${page.path}`, {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      });
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, page.pattern);
    }

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, /aria-label="Удалить пользователя"/i);
    assert.match(settingsBody, /Почта приглашений/i);

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

    const ajaxUpdateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
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
        notes: "Updated by manager session via ajax",
        password: "",
      }),
    });
    assert.equal(ajaxUpdateUserResponse.status, 200);
    const ajaxUpdateUserPayload = await ajaxUpdateUserResponse.json();
    assert.equal(ajaxUpdateUserPayload.ok, true);
    assert.equal(ajaxUpdateUserPayload.notice, "user-updated");

    const updatedUsersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(updatedUsersStorePayload.users[0].phone, "+1(331)555-0198");

    const connectMailResponse = await fetch(`${started.baseUrl}/admin/google-mail/connect`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(connectMailResponse.status, 303);
    assert.match(connectMailResponse.headers.get("location") || "", /notice=mail-unavailable/);
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

    const ajaxUpdateStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
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
        notes: "Promoted from staff dialog via ajax",
      }),
    });
    assert.equal(ajaxUpdateStaffResponse.status, 200);
    const ajaxUpdateStaffPayload = await ajaxUpdateStaffResponse.json();
    assert.equal(ajaxUpdateStaffPayload.ok, true);
    assert.equal(ajaxUpdateStaffPayload.notice, "staff-updated");

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
