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

test("renders checklist templates in settings and persists checklist updates", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-settings-route-"));
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_SETTINGS_STORE_PATH: path.join(tempDir, "admin-settings-store.json"),
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=checklists`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Чек-листы/i);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, /Шаблоны чек-листов/i);
    assert.match(settingsBody, /admin-settings-checklists-table/);
    assert.match(settingsBody, /admin-settings-section-stack/);
    assert.match(settingsBody, /data-admin-dialog-row="true"/);
    assert.match(settingsBody, /Редактировать/i);
    assert.match(settingsBody, /aria-label="Редактировать чек-лист"/i);
    assert.match(settingsBody, /class="admin-icon-button admin-edit-button"/);
    assert.match(settingsBody, /Регулярная уборка/i);
    assert.match(settingsBody, /Генеральная уборка/i);
    assert.match(settingsBody, /Уборка перед переездом/i);
    assert.match(settingsBody, /Пылесосить полы/i);
    assert.match(settingsBody, /Все комнаты/i);
    assert.doesNotMatch(settingsBody, /Сохранить отметки/i);
    assert.doesNotMatch(settingsBody, /<th>Открыть<\/th>/i);
    assert.doesNotMatch(settingsBody, /Все типы уборки в одном месте\./i);
    assert.doesNotMatch(settingsBody, /Уже выполненные пункты\./i);

    const itemIdMatches = Array.from(settingsBody.matchAll(/name="itemId" value="([^"]*)"/g));
    assert.ok(itemIdMatches.length >= 2);
    const firstItemId = itemIdMatches[0][1];
    const secondItemId = itemIdMatches[1][1];
    assert.ok(firstItemId);
    assert.ok(secondItemId);

    const renamedLabel = "Проверить выключатели и зеркала";
    const renamedHint = "Прихожая и санузлы";
    const customLabel = "Осмотреть входную дверь";
    const customHint = "Ручка, наличник, стекло";

    const saveParams = new URLSearchParams();
    saveParams.append("action", "save_checklist_template");
    saveParams.append("serviceType", "regular");
    saveParams.append("itemId", firstItemId);
    saveParams.append("itemLabel", renamedLabel);
    saveParams.append("itemHint", renamedHint);
    saveParams.append("itemId", "");
    saveParams.append("itemLabel", customLabel);
    saveParams.append("itemHint", customHint);

    const saveResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveParams,
    });
    assert.equal(saveResponse.status, 303);
    const saveLocation = saveResponse.headers.get("location") || "";
    assert.match(saveLocation, /notice=checklist-updated/);

    const savedResponse = await fetch(`${started.baseUrl}${saveLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const savedBody = await savedResponse.text();
    assert.equal(savedResponse.status, 200);
    assert.match(savedBody, /Шаблон чек-листа обновлён/i);
    assert.match(savedBody, new RegExp(renamedLabel, "i"));
    assert.match(savedBody, new RegExp(renamedHint, "i"));
    assert.match(savedBody, new RegExp(customLabel, "i"));
    assert.match(savedBody, new RegExp(customHint, "i"));
    assert.doesNotMatch(savedBody, new RegExp(secondItemId, "i"));
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("creates employee users in settings and serves a personal cabinet with assigned jobs only", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-route-"));
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-account-123",
        },
      },
    },
  ]);
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const staffW9DocumentsDir = path.join(tempDir, "staff-documents");
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_USERS_STORE_PATH: usersStorePath,
    STAFF_W9_DOCUMENTS_DIR: staffW9DocumentsDir,
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const assignedQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "account-request-1",
      fullName: "Maria Assigned",
      phone: "312-555-0101",
      email: "maria.customer@example.com",
      serviceType: "deep",
      selectedDate: "2026-03-27",
      selectedTime: "10:00",
      fullAddress: "123 Main St, Romeoville, IL 60446",
    });
    assert.equal(assignedQuoteResponse.status, 201);

    const unassignedQuoteResponse = await submitQuote(started.baseUrl, {
      requestId: "account-request-2",
      fullName: "Nina Hidden",
      phone: "312-555-0102",
      email: "nina.customer@example.com",
      serviceType: "move",
      selectedDate: "2026-03-28",
      selectedTime: "01:00 PM",
      fullAddress: "456 Oak Ave, Plainfield, IL 60544",
    });
    assert.equal(unassignedQuoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "account-request-1");

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();
    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Пользователи/i);
    assert.match(settingsBody, /class="admin-settings-nav-row"/);
    assert.match(settingsBody, /class="admin-settings-nav-actions"/);
    const settingsNav = settingsBody.match(/<div class="admin-subnav-strip admin-settings-nav">[\s\S]*?<\/div>/)?.[0] || "";
    assert.ok(settingsNav);
    assert.ok(settingsNav.indexOf("Пользователи") < settingsNav.indexOf("Чек-листы"));
    assert.match(settingsBody, />Добавить сотрудника</);
    assert.match(settingsBody, /data-admin-dialog-open="admin-user-create-dialog"/);
    assert.match(settingsBody, /id="admin-user-create-dialog"/);
    assert.match(settingsBody, /admin-settings-users-table/);
    assert.match(settingsBody, /admin-settings-section-stack/);
    assert.match(settingsBody, /name="phone"[^>]*required/i);
    assert.match(settingsBody, /name="address"[^>]*required/i);
    assert.match(settingsBody, /name="compensationValue"/i);
    assert.match(settingsBody, /name="compensationType"/i);
    assert.match(settingsBody, /Почта приглашений/i);
    assert.ok(settingsBody.indexOf("admin-settings-users-table") < settingsBody.indexOf("Почта приглашений"));
    assert.doesNotMatch(settingsBody, /<th>Открыть<\/th>/i);
    assert.doesNotMatch(settingsBody, /Шаблоны чек-листов/i);

    const invalidCreateUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Incomplete User",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "incomplete@example.com",
        phone: "",
        address: "",
        notes: "",
        password: "StrongPass123!",
      }),
    });
    assert.equal(invalidCreateUserResponse.status, 303);
    assert.match(invalidCreateUserResponse.headers.get("location") || "", /notice=user-error/);

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Alina Carter",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "alina.staff@example.com",
        phone: "3125550101",
        address: "742 Cedar Avenue, Aurora, IL 60506",
        compensationValue: "28",
        compensationType: "percent",
        notes: "Assigned from settings test",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    const createdUserLocation = createUserResponse.headers.get("location") || "";
    assert.match(createdUserLocation, /notice=user-created-email-skipped/);

    const updatedSettingsResponse = await fetch(`${started.baseUrl}${createdUserLocation.replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedSettingsBody = await updatedSettingsResponse.text();
    assert.equal(updatedSettingsResponse.status, 200);
    assert.match(updatedSettingsBody, /Автоматическая отправка письма сейчас не настроена/i);
    assert.match(updatedSettingsBody, /alina\.staff@example\.com/i);
    assert.match(updatedSettingsBody, /Alina Carter/);
    assert.match(updatedSettingsBody, /aria-label="Открыть пользователя Alina Carter"/i);

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffStorePayload.staff.length, 1);
    const staffId = staffStorePayload.staff[0].id;
    assert.ok(staffId);
    assert.equal(staffStorePayload.staff[0].name, "Alina Carter");
    assert.equal(staffStorePayload.staff[0].role, "Клинер");
    assert.equal(staffStorePayload.staff[0].address, "742 Cedar Avenue, Aurora, IL 60506");
    assert.equal(staffStorePayload.staff[0].compensationValue, "28");
    assert.equal(staffStorePayload.staff[0].compensationType, "percent");

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersStorePayload.users.length, 1);
    assert.equal(usersStorePayload.users[0].staffId, staffId);
    assert.equal(usersStorePayload.users[0].email, "alina.staff@example.com");
    assert.equal(usersStorePayload.users[0].role, "cleaner");
    assert.equal(usersStorePayload.users[0].isEmployee, true);
    assert.equal(usersStorePayload.users[0].emailVerificationRequired, false);
    assert.ok(usersStorePayload.users[0].emailVerifiedAt);
    assert.match(usersStorePayload.users[0].passwordHash, /^scrypt\$/);

    const staffPageResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const staffPageBody = await staffPageResponse.text();
    assert.equal(staffPageResponse.status, 200);
    assert.match(staffPageBody, /Alina Carter/);

    const assignedEntryId = getStaffAssignmentEntryIdByCustomerName(staffPageBody, "Maria Assigned");
    assert.ok(assignedEntryId);

    const assignResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", assignedEntryId],
        ["staffIds", staffId],
        ["status", "confirmed"],
        ["notes", "Bring supplies"],
      ]),
    });
    assert.equal(assignResponse.status, 303);
    assert.match(assignResponse.headers.get("location") || "", /notice=assignment-saved/);

    const anonymousAccountResponse = await fetch(`${started.baseUrl}/account`, {
      redirect: "manual",
    });
    assert.equal(anonymousAccountResponse.status, 303);
    assert.equal(anonymousAccountResponse.headers.get("location"), "/account/login");

    const accountLoginPageResponse = await fetch(`${started.baseUrl}/account/login`);
    const accountLoginPageBody = await accountLoginPageResponse.text();
    assert.equal(accountLoginPageResponse.status, 200);
    assert.match(accountLoginPageBody, /Вход сотрудника/i);
    assert.match(accountLoginPageBody, /Назначенные на вас заявки/i);

    const accountLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.staff@example.com",
        password: "StrongPass123!",
      }),
    });
    assert.equal(accountLoginResponse.status, 303);
    assert.equal(accountLoginResponse.headers.get("location"), "/account");

    const userSessionCookieValue = getCookieValue(getSetCookies(accountLoginResponse), "shynli_user_session");
    assert.ok(userSessionCookieValue);

    const cleanerAdminLoginResponse = await fetch(`${started.baseUrl}/admin/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.staff@example.com",
        password: "StrongPass123!",
      }),
    });
    assert.equal(cleanerAdminLoginResponse.status, 303);
    assert.equal(cleanerAdminLoginResponse.headers.get("location"), "/account");
    assert.ok(getCookieValue(getSetCookies(cleanerAdminLoginResponse), "shynli_user_session"));

    const cleanerAdminResponse = await fetch(`${started.baseUrl}/admin`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(cleanerAdminResponse.status, 303);
    assert.equal(cleanerAdminResponse.headers.get("location"), "/account");

    const accountDashboardResponse = await fetch(`${started.baseUrl}/account`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const accountDashboardBody = await accountDashboardResponse.text();
    assert.equal(accountDashboardResponse.status, 200);
    assert.match(accountDashboardBody, /Мой кабинет/i);
    assert.match(accountDashboardBody, /Maria Assigned/);
    assert.match(accountDashboardBody, /Bring supplies/);
    assert.doesNotMatch(accountDashboardBody, /Nina Hidden/);
    assert.match(accountDashboardBody, /account-desktop-metrics/i);
    assert.match(accountDashboardBody, /admin-orders-metrics/i);
    assert.match(accountDashboardBody, /data-account-mobile-dashboard/i);
    assert.match(accountDashboardBody, /Cleaning app/i);
    assert.match(accountDashboardBody, /Назначенные на вас заказы\./i);
    assert.match(accountDashboardBody, /account-mobile-logout-button/i);
    assert.match(accountDashboardBody, /aria-label="Выйти"/i);
    assert.match(accountDashboardBody, /Следующий заказ/i);
    assert.match(accountDashboardBody, /account-mobile-focus-travel/i);
    assert.match(accountDashboardBody, /data-account-travel-estimate="true"/i);
    assert.match(accountDashboardBody, /Дорога: считаем маршрут/i);
    assert.match(accountDashboardBody, /data-account-mobile-order-card/i);
    assert.match(accountDashboardBody, /alina\.staff@example\.com/i);
    assert.match(accountDashboardBody, /<details class="admin-details" data-account-profile-details>/i);
    assert.match(accountDashboardBody, /<summary>Изменить контакты<\/summary>/i);
    assert.doesNotMatch(accountDashboardBody, /<details class="admin-details" data-account-profile-details" open>/i);
    assert.match(accountDashboardBody, /<details class="admin-details" data-account-password-details>/i);
    assert.match(accountDashboardBody, /<summary>Обновить пароль<\/summary>/i);
    assert.doesNotMatch(accountDashboardBody, /<details class="admin-details" data-account-password-details" open>/i);
    assert.match(accountDashboardBody, /Заполните документы сотрудника/i);
    assert.match(accountDashboardBody, /data-account-w9-details/i);
    assert.match(accountDashboardBody, /<summary>Открыть форму документов<\/summary>/i);
    assert.doesNotMatch(accountDashboardBody, /data-account-w9-details[^>]* open/i);
    assert.match(accountDashboardBody, /Подпишите форму мышкой, пальцем или стилусом/i);
    assert.match(accountDashboardBody, /data-account-w9-form/i);
    assert.match(accountDashboardBody, /data-account-w9-submit[^>]*disabled/i);
    assert.match(accountDashboardBody, /data-account-w9-field="legalName"/i);
    assert.match(accountDashboardBody, /data-account-w9-field="signature"/i);

    const adminStaffBeforeW9Response = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const adminStaffBeforeW9Body = await adminStaffBeforeW9Response.text();
    assert.equal(adminStaffBeforeW9Response.status, 200);
    assert.match(adminStaffBeforeW9Body, /Сотрудник ещё не завершил onboarding-документы/i);
    assert.match(adminStaffBeforeW9Body, /Отправить повторно/i);

    const invalidSaveW9Response = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-w9",
        w9LegalName: "Alina Draft",
        w9BusinessName: "Alina Draft LLC",
        w9FederalTaxClassification: "individual",
        w9LlcTaxClassification: "",
        w9OtherClassification: "",
        w9ExemptPayeeCode: "1",
        w9FatcaCode: "A",
        w9AddressLine1: "987 Draft Street",
        w9CityStateZip: "Naperville, IL 60540",
        w9AccountNumbers: "Draft-Account",
        w9TinType: "ssn",
        w9TinValue: "987-65-4321",
        w9Line3bApplies: "1",
        w9SignatureDataUrl: SIGNATURE_DATA_URL,
      }),
    });
    const invalidSaveW9Body = await invalidSaveW9Response.text();
    assert.equal(invalidSaveW9Response.status, 422);
    assert.match(invalidSaveW9Body, /Не удалось собрать документы сотрудника/i);
    assert.match(invalidSaveW9Body, /<details class="admin-details" data-account-w9-details[^>]* open>/i);
    assert.match(invalidSaveW9Body, /name="w9LegalName"[^>]*value="Alina Draft"/i);
    assert.match(invalidSaveW9Body, /name="w9BusinessName"[^>]*value="Alina Draft LLC"/i);
    assert.match(invalidSaveW9Body, /name="w9AddressLine1"[^>]*value="987 Draft Street"/i);
    assert.match(invalidSaveW9Body, /name="w9CityStateZip"[^>]*value="Naperville, IL 60540"/i);
    assert.match(invalidSaveW9Body, /name="w9AccountNumbers"[^>]*value="Draft-Account"/i);
    assert.match(invalidSaveW9Body, /name="w9TinValue"[^>]*value="987-65-4321"/i);
    assert.match(invalidSaveW9Body, /name="w9Line3bApplies"[^>]*checked/i);
    assert.match(invalidSaveW9Body, /name="w9SignatureDataUrl"[^>]*value="data:image\/png;base64,[^"]+"/i);
    assert.match(invalidSaveW9Body, /Подпись сохранена в форме\. Можно исправить остальные поля и отправить снова\./i);
    assert.match(invalidSaveW9Body, /data-account-w9-submit[^>]*disabled/i);

    const saveW9Response = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-w9",
        w9LegalName: "Alina Carter",
        w9BusinessName: "",
        w9FederalTaxClassification: "individual",
        w9LlcTaxClassification: "",
        w9OtherClassification: "",
        w9ExemptPayeeCode: "",
        w9FatcaCode: "",
        w9AddressLine1: "742 Cedar Avenue",
        w9CityStateZip: "Aurora, IL 60506",
        w9AccountNumbers: "Employee-7",
        w9TinType: "ssn",
        w9TinValue: "123-45-6789",
        w9SignatureDataUrl: SIGNATURE_DATA_URL,
        w9CertificationConfirmed: "1",
      }),
    });
    assert.equal(saveW9Response.status, 303);
    assert.match(saveW9Response.headers.get("location") || "", /notice=w9-saved/);

    const staffAfterW9Save = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffAfterW9Save.staff[0].contract.contractorName, "Alina Carter");
    assert.equal(
      staffAfterW9Save.staff[0].contract.document.relativePath,
      path.join(staffId, "contract.pdf")
    );
    assert.equal(staffAfterW9Save.staff[0].w9.legalName, "Alina Carter");
    assert.equal(staffAfterW9Save.staff[0].w9.maskedTin, "***-**-6789");
    assert.equal(staffAfterW9Save.staff[0].w9.document.relativePath, path.join(staffId, "w9.pdf"));

    const accountW9PageResponse = await fetch(
      `${started.baseUrl}${(saveW9Response.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      }
    );
    const accountW9PageBody = await accountW9PageResponse.text();
    assert.equal(accountW9PageResponse.status, 200);
    assert.match(accountW9PageBody, /Документы сотрудника сохранены/i);
    assert.match(accountW9PageBody, /Скачать Contract/i);
    assert.match(accountW9PageBody, /Скачать W-9/i);
    assert.match(accountW9PageBody, /Tax classification/i);
    assert.match(accountW9PageBody, /\*\*\*-\*\*-6789/);
    assert.match(accountW9PageBody, /data-account-w9-details/i);
    assert.match(accountW9PageBody, /<summary>Обновить документы<\/summary>/i);
    assert.doesNotMatch(accountW9PageBody, /data-account-w9-details[^>]* open/i);

    const accountContractDownloadResponse = await fetch(`${started.baseUrl}/account/contract`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountContractDownloadResponse.status, 200);
    assert.equal(accountContractDownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(
      accountContractDownloadResponse.headers.get("content-disposition") || "",
      /(attachment|inline);\s*filename=/i
    );
    assert.ok(Number(accountContractDownloadResponse.headers.get("content-length") || 0) > 0);

    const accountW9DownloadResponse = await fetch(`${started.baseUrl}/account/w9`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(accountW9DownloadResponse.status, 200);
    assert.equal(accountW9DownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(
      accountW9DownloadResponse.headers.get("content-disposition") || "",
      /(attachment|inline);\s*filename=/i
    );
    assert.ok(Number(accountW9DownloadResponse.headers.get("content-length") || 0) > 0);

    const adminStaffAfterW9Response = await fetch(`${started.baseUrl}/admin/staff`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const adminStaffAfterW9Body = await adminStaffAfterW9Response.text();
    assert.equal(adminStaffAfterW9Response.status, 200);
    assert.match(adminStaffAfterW9Body, /Документы сотрудника/i);
    assert.match(adminStaffAfterW9Body, /Скачать Contract/i);
    assert.match(adminStaffAfterW9Body, /Скачать W-9/i);
    assert.doesNotMatch(adminStaffAfterW9Body, /<iframe[^>]*admin-w9-preview-frame/i);
    assert.doesNotMatch(adminStaffAfterW9Body, /Отправить повторно/i);

    const adminContractDownloadResponse = await fetch(
      `${started.baseUrl}/admin/staff/contract?staffId=${encodeURIComponent(staffId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(adminContractDownloadResponse.status, 200);
    assert.equal(adminContractDownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(
      adminContractDownloadResponse.headers.get("content-disposition") || "",
      /attachment;\s*filename=/i
    );
    assert.equal(adminContractDownloadResponse.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(
      adminContractDownloadResponse.headers.get("content-security-policy") || "",
      /frame-ancestors 'self'/
    );
    assert.ok(Number(adminContractDownloadResponse.headers.get("content-length") || 0) > 0);

    const adminW9DownloadResponse = await fetch(
      `${started.baseUrl}/admin/staff/w9?staffId=${encodeURIComponent(staffId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(adminW9DownloadResponse.status, 200);
    assert.equal(adminW9DownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(adminW9DownloadResponse.headers.get("content-disposition") || "", /attachment;\s*filename=/i);
    assert.equal(adminW9DownloadResponse.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(
      adminW9DownloadResponse.headers.get("content-security-policy") || "",
      /frame-ancestors 'self'/
    );
    assert.ok(Number(adminW9DownloadResponse.headers.get("content-length") || 0) > 0);

    const saveProfileResponse = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "save-profile",
        email: "alina.updated@example.com",
        phone: "3315550110",
      }),
    });
    assert.equal(saveProfileResponse.status, 303);
    assert.match(saveProfileResponse.headers.get("location") || "", /notice=profile-saved/);

    const profilePageResponse = await fetch(`${started.baseUrl}${(saveProfileResponse.headers.get("location") || "").replace(/#.*$/, "")}`, {
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    const profilePageBody = await profilePageResponse.text();
    assert.equal(profilePageResponse.status, 200);
    assert.match(profilePageBody, /Профиль обновлён/i);
    assert.match(profilePageBody, /alina\.updated@example\.com/i);
    assert.match(profilePageBody, /\+1\(331\)555-0110/i);
    assert.match(profilePageBody, /<details class="admin-details" data-account-profile-details>/i);
    assert.match(profilePageBody, /<summary>Изменить контакты<\/summary>/i);
    assert.doesNotMatch(profilePageBody, /<details class="admin-details" data-account-profile-details" open>/i);
    assert.match(profilePageBody, /name="phone" value="3315550110"/i);

    const usersAfterProfileSave = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersAfterProfileSave.users[0].email, "alina.updated@example.com");
    assert.equal(usersAfterProfileSave.users[0].phone, "+1(331)555-0110");

    const staffAfterProfileSave = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(staffAfterProfileSave.staff[0].email, "alina.updated@example.com");
    assert.equal(staffAfterProfileSave.staff[0].phone, "+1(331)555-0110");

    const changePasswordResponse = await fetch(`${started.baseUrl}/account`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "change-password",
        currentPassword: "StrongPass123!",
        newPassword: "EvenStronger456!",
        confirmPassword: "EvenStronger456!",
      }),
    });
    assert.equal(changePasswordResponse.status, 303);
    assert.match(changePasswordResponse.headers.get("location") || "", /notice=password-saved/);

    const passwordPageResponse = await fetch(
      `${started.baseUrl}${(changePasswordResponse.headers.get("location") || "").replace(/#.*$/, "")}`,
      {
        headers: {
          cookie: `shynli_user_session=${userSessionCookieValue}`,
        },
      }
    );
    const passwordPageBody = await passwordPageResponse.text();
    assert.equal(passwordPageResponse.status, 200);
    assert.match(passwordPageBody, /Пароль обновлён/i);
    assert.match(passwordPageBody, /<details class="admin-details" data-account-password-details>/i);
    assert.match(passwordPageBody, /<summary>Обновить пароль<\/summary>/i);
    assert.doesNotMatch(passwordPageBody, /<details class="admin-details" data-account-password-details" open>/i);

    const logoutResponse = await fetch(`${started.baseUrl}/account/logout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `shynli_user_session=${userSessionCookieValue}`,
      },
    });
    assert.equal(logoutResponse.status, 303);
    assert.equal(logoutResponse.headers.get("location"), "/account/login");

    const oldPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.updated@example.com",
        password: "StrongPass123!",
      }),
    });
    const oldPasswordBody = await oldPasswordResponse.text();
    assert.equal(oldPasswordResponse.status, 401);
    assert.match(oldPasswordBody, /Неверная почта или пароль/i);

    const newPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "alina.updated@example.com",
        password: "EvenStronger456!",
      }),
    });
    assert.equal(newPasswordResponse.status, 303);
    assert.equal(newPasswordResponse.headers.get("location"), "/account");
    assert.ok(getCookieValue(getSetCookies(newPasswordResponse), "shynli_user_session"));
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
    fetchStub.cleanup();
  }
});

test("shows a readable SMTP invite error in the users settings page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-invite-error-route-"));
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
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify({
        staff: [
          {
            id: "staff-relay-1",
            name: "Relay Tester",
            role: "Cleaner",
            status: "active",
            email: "relay.tester@example.com",
          },
        ],
        assignments: [],
      }, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      usersStorePath,
      `${JSON.stringify({
        users: [
          {
            id: "user-relay-1",
            staffId: "staff-relay-1",
            email: "relay.tester@example.com",
            phone: "+1(312)555-0111",
            passwordHash: hashPassword("StrongPass123!"),
            status: "active",
            role: "cleaner",
            emailVerificationRequired: true,
            emailVerifiedAt: "",
            inviteEmailLastError:
              "ACCOUNT_INVITE_EMAIL_SEND_FAILED:535-5.7.8 Username and Password not accepted.",
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();

    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Ждёт подтверждения email/i);
    assert.match(settingsBody, /SMTP не принял логин или app password/i);
    assert.doesNotMatch(settingsBody, /Отправить письмо ещё раз/i);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("shows Gmail connect controls in the users settings page when Google Mail OAuth is configured", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GOOGLE_MAIL_CLIENT_ID: "gmail-client-id",
    GOOGLE_MAIL_CLIENT_SECRET: "gmail-client-secret",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();

    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /Почта приглашений/i);
    assert.match(settingsBody, /<details class="admin-details admin-settings-disclosure">/);
    assert.doesNotMatch(settingsBody, /<details class="admin-details admin-settings-disclosure" open>/);
    assert.match(settingsBody, /Открыть детали/);
    assert.match(settingsBody, />Подключить Gmail</);
    assert.doesNotMatch(settingsBody, /Добавьте GOOGLE_MAIL_CLIENT_ID/i);

    const connectResponse = await fetch(`${started.baseUrl}/admin/google-mail/connect`, {
      redirect: "manual",
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });

    assert.equal(connectResponse.status, 303);
    assert.match(connectResponse.headers.get("location") || "", /^https:\/\/accounts\.google\.com\//i);
  } finally {
    await stopServer(started.child);
  }
});

test("deleting a user from settings also deletes the linked staff record", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-delete-user-cascade-"));
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
        name: "Delete Me",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "delete.me@example.com",
        phone: "3125550188",
        address: "101 Main St, Naperville, IL 60540",
        notes: "Cascade delete test",
        password: "StrongPass123!",
      }),
    });
    assert.equal(createUserResponse.status, 303);

    const usersStorePayload = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(usersStorePayload.users.length, 1);
    assert.equal(staffStorePayload.staff.length, 1);

    const deleteUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete_user",
        userId: usersStorePayload.users[0].id,
      }),
    });
    assert.equal(deleteUserResponse.status, 303);
    assert.match(deleteUserResponse.headers.get("location") || "", /notice=user-deleted/);

    const usersAfterDelete = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    const staffAfterDelete = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    assert.equal(usersAfterDelete.users.length, 0);
    assert.equal(staffAfterDelete.staff.length, 0);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("normalizes malformed stored user phone values in settings edit forms", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-settings-user-phone-render-route-"));
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
    await fs.writeFile(
      staffStorePath,
      `${JSON.stringify({
        staff: [
          {
            id: "staff-user-phone-1",
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
    await fs.writeFile(
      usersStorePath,
      `${JSON.stringify({
        users: [
          {
            id: "user-phone-1",
            staffId: "staff-user-phone-1",
            email: "sophia.reed@example.com",
            phone: "+1(+1()630-)5550199",
            passwordHash: hashPassword("StrongPass123!"),
            status: "active",
            role: "cleaner",
            emailVerificationRequired: false,
            emailVerifiedAt: new Date().toISOString(),
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const settingsResponse = await fetch(`${started.baseUrl}/admin/settings?section=users`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const settingsBody = await settingsResponse.text();

    assert.equal(settingsResponse.status, 200);
    assert.match(settingsBody, /name="phone" value="6305550199"/);
    assert.match(settingsBody, /\+1\(630\)555-0199/);
  } finally {
    await stopServer(started.child);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("sends an invite email and lets the employee set a first password after email confirmation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-invite-"));
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

    const createUserResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Invite Cleaner",
        role: "cleaner",
        status: "active",
        staffStatus: "active",
        email: "invite.cleaner@example.com",
        phone: "3125550101",
        address: "1289 Rhodes Ln, Naperville, IL 60540",
        notes: "Invite email test",
        password: "",
      }),
    });
    assert.equal(createUserResponse.status, 303);
    assert.match(createUserResponse.headers.get("location") || "", /notice=user-created-email-sent/);

    const usersAfterCreate = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.equal(usersAfterCreate.users.length, 1);
    assert.equal(usersAfterCreate.users[0].passwordHash, "");
    assert.equal(usersAfterCreate.users[0].emailVerificationRequired, true);
    assert.equal(usersAfterCreate.users[0].emailVerifiedAt, "");
    assert.ok(usersAfterCreate.users[0].inviteEmailSentAt);

    assert.equal(smtpServer.messages.length, 1);
    assert.equal(smtpServer.messages[0].from, "<hello@shynli.com>");
    assert.deepEqual(smtpServer.messages[0].to, ["<invite.cleaner@example.com>"]);
    const rawEmail = decodeQuotedPrintable(smtpServer.messages[0].raw);
    assert.match(rawEmail, /Reply-To: info@shynli\.com/);
    assert.match(rawEmail, /Subject: Confirm your SHYNLI employee email/);
    const verifyUrlMatch = rawEmail.match(/https?:\/\/[^\s]+\/account\/verify-email\?token=[^\s=]+/);
    assert.ok(verifyUrlMatch);
    const verifyUrl = new URL(verifyUrlMatch[0]);
    const verificationToken = verifyUrl.searchParams.get("token");
    assert.ok(verificationToken);

    const blockedLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "invite.cleaner@example.com",
        password: "",
      }),
    });
    const blockedLoginBody = await blockedLoginResponse.text();
    assert.equal(blockedLoginResponse.status, 401);
    assert.match(blockedLoginBody, /Подтвердите email по ссылке из письма/i);

    const verifyResponse = await fetch(
      `${started.baseUrl}/account/verify-email?token=${encodeURIComponent(verificationToken)}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(verifyResponse.status, 303);
    assert.equal(
      verifyResponse.headers.get("location"),
      "/account/login?notice=email-verified-password-setup&email=invite.cleaner%40example.com"
    );
    const passwordSetupCookieValue = getCookieValue(
      getSetCookies(verifyResponse),
      "shynli_user_password_setup"
    );
    assert.ok(passwordSetupCookieValue);

    const verifiedLoginPageResponse = await fetch(
      `${started.baseUrl}/account/login?notice=email-verified-password-setup&email=invite.cleaner%40example.com`
    );
    const verifiedLoginPageBody = await verifiedLoginPageResponse.text();
    assert.equal(verifiedLoginPageResponse.status, 200);
    assert.match(verifiedLoginPageBody, /Email подтверждён/i);
    assert.match(verifiedLoginPageBody, /оставьте пароль пустым и нажмите «Войти»/i);

    const firstLoginResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_password_setup=${passwordSetupCookieValue}`,
      },
      body: new URLSearchParams({
        email: "invite.cleaner@example.com",
        password: "",
      }),
    });
    const firstLoginBody = await firstLoginResponse.text();
    assert.equal(firstLoginResponse.status, 200);
    assert.match(firstLoginBody, /Задайте пароль/i);
    assert.match(firstLoginBody, /Сохранить и войти/i);

    const setupPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_password_setup=${passwordSetupCookieValue}`,
      },
      body: new URLSearchParams({
        action: "setup-first-password",
        email: "invite.cleaner@example.com",
        newPassword: "StrongPass123!",
        confirmPassword: "StrongPass123!",
      }),
    });
    assert.equal(setupPasswordResponse.status, 303);
    assert.equal(setupPasswordResponse.headers.get("location"), "/account");
    assert.ok(getCookieValue(getSetCookies(setupPasswordResponse), "shynli_user_session"));

    const usersAfterVerify = JSON.parse(await fs.readFile(usersStorePath, "utf8"));
    assert.ok(usersAfterVerify.users[0].emailVerifiedAt);
    assert.match(usersAfterVerify.users[0].passwordHash, /^scrypt\$/);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
