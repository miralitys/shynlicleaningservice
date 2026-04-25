"use strict";

const {
  fs,
  os,
  path,
  test,
  assert,
  loadAdminConfig,
  createFetchStub,
  createSmtpTestServer,
  startServer,
  stopServer,
  decodeQuotedPrintable,
  getSetCookies,
  getCookieValue,
  createAdminSession,
} = require("./admin-route-helpers");

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
