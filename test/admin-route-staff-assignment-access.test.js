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
  escapeRegex,
  createAdminSession,
  submitQuote,
  createOrderFromQuoteRequest,
} = require("./admin-route-helpers");

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
