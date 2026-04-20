"use strict";

const {
  fs,
  os,
  path,
  test,
  assert,
  loadAdminConfig,
  createFetchStub,
  startServer,
  stopServer,
  createAdminSession,
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
