"use strict";

const {
  fs,
  os,
  path,
  test,
  assert,
  loadAdminConfig,
  startServer,
  stopServer,
  getSetCookies,
  getCookieValue,
  createAdminSession,
} = require("./admin-route-helpers");

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
    assert.match(adminWorkspaceBody, /Дашборд/i);
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
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const accountDashboardBody = await accountDashboardResponse.text();
    assert.equal(accountDashboardResponse.status, 200);
    assert.match(accountDashboardBody, /Мой кабинет/i);
    assert.match(accountDashboardBody, /id="account-w9"/i);

    const dashboardResponse = await fetch(`${started.baseUrl}/admin`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const dashboardBody = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardBody, /Дашборд/i);
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
