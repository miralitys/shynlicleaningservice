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

test("shows recent quote submissions in admin quote ops and retries CRM sync", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-order-media-admin-"));
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const fetchStub = createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "contact-ops-123",
        },
      },
    },
    {
      method: "PUT",
      match: "/contacts/contact-ops-123",
      status: 200,
      body: {
        contact: {
          id: "contact-ops-123",
        },
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    ADMIN_ORDER_MEDIA_STORAGE_DIR: path.join(tempDir, "order-media"),
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_CUSTOM_FIELDS_JSON: JSON.stringify({
      fullAddress: "cf_full_address",
    }),
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await fetch(`${started.baseUrl}/api/quote/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "ops-request-1",
      },
      body: JSON.stringify({
        contact: {
          fullName: "Jane Doe",
          phone: "312-555-0100",
          email: "jane@example.com",
        },
        quote: {
          serviceType: "regular",
          frequency: "weekly",
          rooms: 4,
          bathrooms: 2,
          squareMeters: 1600,
          hasPets: "cat",
          basementCleaning: "yes",
          services: ["ovenCleaning", "insideCabinets"],
          quantityServices: {
            interiorWindowsCleaning: 3,
            blindsCleaning: 2,
            bedLinenChange: 1,
          },
          additionalDetails: "Please call on arrival\nGate code 2040",
          selectedDate: "2026-03-22",
          selectedTime: "09:00",
          formattedDateTime: "March 22, 2026 at 09:00",
          address: "123 Main St",
          addressLine2: "Apt 4B",
          city: "Romeoville",
          state: "IL",
          zipCode: "60446",
          fullAddress: "123 Main St, Romeoville, IL 60446",
          consent: true,
        },
      }),
    });

    assert.equal(quoteResponse.status, 201);

    const loginResponse = await fetch(`${started.baseUrl}/admin/login`, {
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

    const sessionCookieValue = getCookieValue(getSetCookies(loginResponse), "shynli_admin_session");
    assert.ok(sessionCookieValue);
    await createOrderFromQuoteRequest(started.baseUrl, sessionCookieValue, "ops-request-1");

    for (const [index, name] of ["Olga Martinez", "Anna Petrova", "Diana Brooks"].entries()) {
      const createStaffResponse = await fetch(`${started.baseUrl}/admin/staff`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
        body: new URLSearchParams({
          action: "create-staff",
          name,
          role: "cleaner",
          phone: `31255501${String(10 + index).padStart(2, "0")}`,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          address: `${100 + index} Main St, Naperville, IL 60540`,
          compensationValue: "180",
          compensationType: "fixed",
          status: "active",
          notes: "Orders team test",
        }),
      });
      assert.equal(createStaffResponse.status, 303);
      assert.match(createStaffResponse.headers.get("location") || "", /notice=staff-created/);
    }

    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /Jane Doe/);
    assert.match(ordersBody, /Weekly/);
    assert.match(ordersBody, /Запланировано/);
    assert.match(ordersBody, /Инвойс отправлен/);
    assert.match(ordersBody, /Оплачено/);
    assert.match(ordersBody, /Ждем отзыв/);
    assert.match(ordersBody, /admin-compact-summary-strip/);
    assert.match(ordersBody, /Воронка заказов/);
    assert.match(ordersBody, /class="admin-order-funnel-board"/);
    assert.match(ordersBody, /\.admin-order-funnel-board\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;/);
    assert.match(ordersBody, /admin-order-funnel-column-policy/);
    assert.match(ordersBody, /admin-order-funnel-column-scheduled/);
    assert.match(ordersBody, /admin-order-funnel-column-invoice-sent/);
    assert.match(ordersBody, /admin-order-funnel-column-paid/);
    assert.match(ordersBody, /admin-order-funnel-column-awaiting-review/);
    assert.match(ordersBody, /data-order-funnel-card="true"/);
    assert.match(ordersBody, /data-order-funnel-status="/);
    assert.match(ordersBody, /data-order-dropzone="policy"/);
    assert.match(ordersBody, /data-order-dropzone="scheduled"/);
    assert.match(ordersBody, /data-order-funnel-stage-form="true"/);
    assert.match(ordersBody, /X-SHYNLI-ADMIN-AJAX/);
    assert.match(ordersBody, /Ближайшие выезды/);
    assert.match(ordersBody, /admin-orders-filter-inline-panel/);
    assert.match(ordersBody, /data-admin-auto-submit="true"/);
    assert.match(ordersBody, /data-admin-auto-submit-delay="600"/);
    assert.match(ordersBody, /data-admin-auto-submit-min-length="2"/);
    assert.match(ordersBody, /data-admin-auto-submit-restore-focus="true"/);
    assert.match(ordersBody, /data-admin-auto-submit-scroll-target="#admin-orders-workspace"/);
    assert.match(ordersBody, /data-admin-dialog-row="true"/);
    assert.match(ordersBody, /class="admin-table-row-clickable"/);
    assert.match(ordersBody, /\.admin-table-wrap\s*\{[\s\S]*overflow-x: auto;[\s\S]*overflow-y: hidden;/);
    assert.match(ordersBody, /\.admin-table\s*\{[\s\S]*width: max-content;[\s\S]*table-layout: auto;/);
    assert.match(ordersBody, /\.admin-table:not\(\.admin-team-calendar-table\) th,\s*\.admin-table:not\(\.admin-team-calendar-table\) td\s*\{[\s\S]*white-space: nowrap;/);
    assert.match(ordersBody, /\.admin-orders-table-wrap-capped\s*\{[\s\S]*max-height:\s*[^;]+;[\s\S]*overflow-y:\s*auto;/);
    assert.doesNotMatch(ordersBody, /admin-kicker">Заказы</);
    assert.doesNotMatch(ordersBody, /Найдено \d+ из \d+ заказов/);
    assert.doesNotMatch(ordersBody, /Показан общий рабочий список/);
    assert.match(ordersBody, /Поля из формы клиента/);
    assert.match(ordersBody, /admin-delete-button/);
    assert.match(ordersBody, /Inside Cabinets Cleaning/);
    assert.match(ordersBody, /Interior Windows Cleaning/);
    assert.match(ordersBody, /Apt 4B/);
    assert.match(ordersBody, /Romeoville/);
    assert.match(ordersBody, /Питомцы[\s\S]*Кошка/);
    assert.match(ordersBody, /03\/22\/2026, 09:00 AM/);
    assert.match(ordersBody, /Please call on arrival/);
    assert.match(ordersBody, /Gate code 2040/);
    assert.match(ordersBody, /Команда не назначена/);
    assert.doesNotMatch(ordersBody, /Отчёт клинера/);
    assert.doesNotMatch(ordersBody, /data-admin-order-completion-panel="true"/);
    assert.doesNotMatch(ordersBody, /data-admin-order-cleaner-comment-panel="true"/);
    assert.match(ordersBody, /name="paymentStatus"/);
    assert.match(ordersBody, /name="paymentMethod"/);
    assert.doesNotMatch(ordersBody, /Команда назначена/);
    assert.doesNotMatch(ordersBody, /CRM без ошибок/);
    assert.doesNotMatch(ordersBody, /Успешно/);
    assert.doesNotMatch(ordersBody, /Удаление убирает запись из рабочих разделов админки/);

    const entryIdMatch = ordersBody.match(/name="entryId" value="([^"]+)"/);
    assert.ok(entryIdMatch);
    const entryId = entryIdMatch[1];

    const staffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const findStaffIdByName = (name) =>
      ((staffStorePayload.staff || []).find((record) => record && record.name === name) || {}).id || "";
    const olgaId = findStaffIdByName("Olga Martinez");
    const annaId = findStaffIdByName("Anna Petrova");
    const dianaId = findStaffIdByName("Diana Brooks");
    assert.ok(olgaId);
    assert.ok(annaId);
    assert.ok(dianaId);

    const assignInitialTeamResponse = await fetch(`${started.baseUrl}/admin/staff`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams([
        ["action", "save-assignment"],
        ["entryId", entryId],
        ["staffIds", olgaId],
        ["status", "confirmed"],
      ]),
    });
    assert.equal(assignInitialTeamResponse.status, 303);
    assert.match(assignInitialTeamResponse.headers.get("location") || "", /notice=assignment-saved/);

    const focusedOrderResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=ops-request-1&order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const focusedOrderBody = await focusedOrderResponse.text();
    assert.equal(focusedOrderResponse.status, 200);
    assert.match(focusedOrderBody, /data-admin-dialog-autopen="true"/);
    assert.match(focusedOrderBody, /data-admin-dialog-return-url="\/admin\/orders\?q=ops-request-1"/);
    assert.match(focusedOrderBody, /class="admin-dialog-head admin-dialog-hero"/);
    assert.match(focusedOrderBody, /class="admin-dialog-hero-title-row"/);
    assert.match(focusedOrderBody, /class="admin-client-summary-panel admin-order-summary-panel"/);
    assert.match(focusedOrderBody, /class="admin-inline-badge-row admin-order-summary-strip"/);
    assert.match(focusedOrderBody, /data-admin-picker-trigger="date"/);
    assert.match(focusedOrderBody, /data-admin-picker-trigger="time"/);
    assert.match(focusedOrderBody, /data-admin-time-panel/);
    assert.match(focusedOrderBody, /<option value="AM">AM<\/option>/);
    assert.match(focusedOrderBody, /<option value="PM">PM<\/option>/);
    assert.match(
      focusedOrderBody,
      /<label class="admin-label admin-order-control-field">\s*Повторяемость[\s\S]*?<select class="admin-input" name="frequency">/
    );
    assert.match(focusedOrderBody, /type="date"/);
    assert.match(focusedOrderBody, /type="time"/);
    assert.match(focusedOrderBody, /name="paymentStatus"/);
    assert.match(focusedOrderBody, /<option value="unpaid" selected>Unpaid/);
    assert.match(focusedOrderBody, /name="paymentMethod"/);
    assert.match(focusedOrderBody, /<option value="" selected>Not set/);
    assert.match(focusedOrderBody, /data-admin-order-amount-open="admin-order-detail-dialog-[^"]+-amount-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-amount-cancel="admin-order-detail-dialog-[^"]+-amount-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-amount-cancel="admin-order-detail-dialog-[^"]+-amount-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-amount-action-for="admin-order-detail-dialog-[^"]+-amount-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /\[data-admin-order-amount-editor\]\[hidden\],[\s\S]*\[data-admin-order-amount-action-for\]\[hidden\]/);
    assert.match(focusedOrderBody, /data-admin-order-payment-open="admin-order-detail-dialog-[^"]+-payment-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-payment-cancel="admin-order-detail-dialog-[^"]+-payment-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-payment-cancel="admin-order-detail-dialog-[^"]+-payment-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-payment-action-for="admin-order-detail-dialog-[^"]+-payment-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-team-open="admin-order-detail-dialog-[^"]+-team-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-team-cancel="admin-order-detail-dialog-[^"]+-team-edit-panel"/);
    assert.match(focusedOrderBody, /data-admin-order-team-cancel="admin-order-detail-dialog-[^"]+-team-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /data-admin-order-team-action-for="admin-order-detail-dialog-[^"]+-team-edit-panel"[\s\S]*hidden/);
    assert.match(focusedOrderBody, /name="totalPrice"/);
    assert.match(focusedOrderBody, /name="totalPrice"[\s\S]*value="[0-9]+\.[0-9]{2}"/);
    assert.match(
      focusedOrderBody,
      new RegExp(
        `name="returnTo" value="/admin/orders\\?q=ops-request-1&amp;order=${escapeRegex(entryId)}"`
      )
    );
    assert.match(focusedOrderBody, /data-admin-order-multiselect="true"/);
    assert.match(focusedOrderBody, /\.admin-order-multiselect-panel\s*\{[\s\S]*position: absolute;[\s\S]*z-index: 49;[\s\S]*overflow-y: auto;/);
    assert.doesNotMatch(
      focusedOrderBody,
      /class="admin-inline-badge-row admin-order-summary-flags"/
    );
    assert.doesNotMatch(focusedOrderBody, /Заказ выглядит готовым к работе/);
    assert.doesNotMatch(focusedOrderBody, /admin-order-brief-fact-label">Дата</);
    assert.doesNotMatch(focusedOrderBody, /admin-order-brief-fact-label">Время</);
    assert.doesNotMatch(focusedOrderBody, /Сумма из quote/);
    assert.doesNotMatch(focusedOrderBody, /Текущая сумма заказа/);
    assert.match(focusedOrderBody, /Olga Martinez/);
    assert.match(focusedOrderBody, /type="checkbox" name="assignedStaff" value="Olga Martinez" checked/);
    assert.doesNotMatch(focusedOrderBody, /Отчёт клинера/);
    assert.doesNotMatch(focusedOrderBody, /data-admin-order-completion-panel="true"/);
    assert.doesNotMatch(focusedOrderBody, /data-admin-order-cleaner-comment-panel="true"/);
    assert.doesNotMatch(focusedOrderBody, /<button[^>]+data-admin-order-cleaner-comment-submit/);

    const saveTeamForm = new URLSearchParams();
    saveTeamForm.set("entryId", entryId);
    saveTeamForm.set("returnTo", `/admin/orders?q=ops-request-1&order=${entryId}`);
    saveTeamForm.append("assignedStaff", "Anna Petrova");
    saveTeamForm.append("assignedStaff", "Diana Brooks");

    const saveTeamResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveTeamForm,
    });
    assert.equal(saveTeamResponse.status, 303);
    assert.match(
      saveTeamResponse.headers.get("location") || "",
      new RegExp(`(?=.*notice=order-saved)(?=.*order=${escapeRegex(entryId)})`)
    );

    const teamLocation = saveTeamResponse.headers.get("location");
    assert.ok(teamLocation);
    const teamUpdatedResponse = await fetch(`${started.baseUrl}${teamLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const teamUpdatedBody = await teamUpdatedResponse.text();
    assert.equal(teamUpdatedResponse.status, 200);
    assert.match(teamUpdatedBody, /data-admin-dialog-autopen="true"/);
    assert.match(teamUpdatedBody, /2 сотрудника/);
    assert.match(teamUpdatedBody, /type="checkbox" name="assignedStaff" value="Anna Petrova" checked/);
    assert.match(teamUpdatedBody, /type="checkbox" name="assignedStaff" value="Diana Brooks" checked/);
    assert.match(
      teamUpdatedBody,
      /<button[^>]*data-admin-order-team-edit-trigger="admin-order-detail-dialog-[^"]+-team-edit-panel"[^>]*>/
    );
    assert.match(
      teamUpdatedBody,
      /<form[^>]*data-admin-order-team-editor="admin-order-detail-dialog-[^"]+-team-edit-panel"[^>]*hidden/
    );
    assert.match(
      teamUpdatedBody,
      /<button[^>]*aria-label="Сохранить команду"[^>]*hidden/
    );
    assert.match(
      teamUpdatedBody,
      /<button[^>]*aria-label="Отменить редактирование команды"[^>]*hidden/
    );

    const updatedStaffStorePayload = JSON.parse(await fs.readFile(staffStorePath, "utf8"));
    const savedAssignment = (updatedStaffStorePayload.assignments || []).find(
      (record) => record && record.entryId === entryId
    );
    assert.ok(savedAssignment);
    assert.deepEqual(savedAssignment.staffIds, [annaId, dianaId]);

    const saveAmountForm = new URLSearchParams();
    saveAmountForm.set("entryId", entryId);
    saveAmountForm.set("returnTo", `/admin/orders?q=ops-request-1&order=${entryId}`);
    saveAmountForm.set("totalPrice", "200.00");

    const saveAmountResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveAmountForm,
    });
    assert.equal(saveAmountResponse.status, 303);
    assert.match(
      saveAmountResponse.headers.get("location") || "",
      new RegExp(`(?=.*notice=order-saved)(?=.*order=${escapeRegex(entryId)})`)
    );
    assert.doesNotMatch(saveAmountResponse.headers.get("location") || "", /amountEditor=1/);

    const amountEditorLocation = saveAmountResponse.headers.get("location");
    assert.ok(amountEditorLocation);
    const amountEditorResponse = await fetch(`${started.baseUrl}${amountEditorLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const amountEditorBody = await amountEditorResponse.text();
    assert.equal(amountEditorResponse.status, 200);
    assert.match(amountEditorBody, /data-admin-dialog-autopen="true"/);
    assert.match(amountEditorBody, /\$200\.00/);
    assert.match(amountEditorBody, /value="200\.00"/);
    assert.match(
      amountEditorBody,
      /<button[^>]*data-admin-order-amount-edit-trigger="admin-order-detail-dialog-[^"]+-amount-edit-panel"[^>]*>/
    );
    assert.match(
      amountEditorBody,
      /<form[^>]*data-admin-order-amount-editor="admin-order-detail-dialog-[^"]+-amount-edit-panel"[^>]*hidden/
    );
    assert.match(
      amountEditorBody,
      /<button[^>]*aria-label="Сохранить сумму"[^>]*hidden/
    );
    assert.match(
      amountEditorBody,
      /<button[^>]*aria-label="Отменить редактирование суммы"[^>]*hidden/
    );

    const savePaymentForm = new URLSearchParams();
    savePaymentForm.set("entryId", entryId);
    savePaymentForm.set("returnTo", `/admin/orders?q=ops-request-1&order=${entryId}`);
    savePaymentForm.set("paymentStatus", "paid");
    savePaymentForm.set("paymentMethod", "zelle");

    const savePaymentResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: savePaymentForm,
    });
    assert.equal(savePaymentResponse.status, 303);
    assert.match(
      savePaymentResponse.headers.get("location") || "",
      new RegExp(`(?=.*notice=order-saved)(?=.*order=${escapeRegex(entryId)})`)
    );

    const paymentEditorLocation = savePaymentResponse.headers.get("location");
    assert.ok(paymentEditorLocation);
    const paymentEditorResponse = await fetch(`${started.baseUrl}${paymentEditorLocation}`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const paymentEditorBody = await paymentEditorResponse.text();
    assert.equal(paymentEditorResponse.status, 200);
    assert.match(paymentEditorBody, /data-admin-dialog-autopen="true"/);
    assert.match(paymentEditorBody, /<option value="paid" selected>Paid/);
    assert.match(paymentEditorBody, /<option value="zelle" selected>Zelle/);
    assert.match(
      paymentEditorBody,
      /<button[^>]*data-admin-order-payment-edit-trigger="admin-order-detail-dialog-[^"]+-payment-edit-panel"[^>]*>/
    );
    assert.match(
      paymentEditorBody,
      /<form[^>]*data-admin-order-payment-editor="admin-order-detail-dialog-[^"]+-payment-edit-panel"[^>]*hidden/
    );
    assert.match(
      paymentEditorBody,
      /<button[^>]*aria-label="Сохранить оплату"[^>]*hidden/
    );
    assert.match(
      paymentEditorBody,
      /<button[^>]*aria-label="Отменить редактирование оплаты"[^>]*hidden/
    );

    const completionFormData = new FormData();
    completionFormData.set("action", "save-order-completion");
    completionFormData.set("entryId", entryId);
    completionFormData.set("returnTo", "/admin/orders");
    completionFormData.append("beforePhotos", new File([Buffer.from("before-image-1")], "before-one.jpg", { type: "image/jpeg" }));
    completionFormData.append("beforePhotos", new File([Buffer.from("before-image-2")], "before-two.jpg", { type: "image/jpeg" }));
    completionFormData.append("afterPhotos", new File([Buffer.from("after-image-1")], "after-one.jpg", { type: "image/jpeg" }));

    const saveCompletionResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: completionFormData,
    });
    assert.equal(saveCompletionResponse.status, 303);
    assert.match(saveCompletionResponse.headers.get("location") || "", /notice=completion-saved/);

    const ajaxCleanerCommentRequestPayload = {
      action: "save-order-cleaner-comment",
      entryId,
      returnTo: `/admin/orders?order=${entryId}`,
      cleanerComment: "Cleaner finished successfully.\nKitchen cabinets needed extra attention.\nTeam double-checked the bathroom.",
    };

    const ajaxCompletionResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        "content-type": "application/json;charset=UTF-8",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: JSON.stringify(ajaxCleanerCommentRequestPayload),
    });
    assert.equal(ajaxCompletionResponse.status, 200);
    const ajaxCompletionPayload = await ajaxCompletionResponse.json();
    assert.equal(ajaxCompletionPayload.ok, true);
    assert.equal(ajaxCompletionPayload.notice, "completion-saved");
    assert.equal(
      ajaxCompletionPayload.completion.cleanerComment,
      "Cleaner finished successfully.\nKitchen cabinets needed extra attention.\nTeam double-checked the bathroom."
    );
    assert.equal(ajaxCompletionPayload.completion.beforePhotos.length, 2);
    assert.equal(ajaxCompletionPayload.completion.afterPhotos.length, 1);
    assert.match(ajaxCompletionPayload.message, /Комментарий клинера сохранён/);
    assert.ok(ajaxCompletionPayload.completion.updatedAtLabel);

    const ajaxCompletionFallbackRequestPayload = {
      action: "save-order-cleaner-comment",
      entryId,
      returnTo: `/admin/orders?order=${entryId}`,
      cleanerComment: "Comment saved through ajax query fallback.",
    };

    const ajaxCompletionFallbackResponse = await fetch(`${started.baseUrl}/admin/orders?ajax=1`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-shynli-admin-ajax": "1",
        "content-type": "application/json;charset=UTF-8",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: JSON.stringify(ajaxCompletionFallbackRequestPayload),
    });
    assert.equal(ajaxCompletionFallbackResponse.status, 200);
    const ajaxCompletionFallbackPayload = await ajaxCompletionFallbackResponse.json();
    assert.equal(ajaxCompletionFallbackPayload.ok, true);
    assert.equal(ajaxCompletionFallbackPayload.notice, "completion-saved");
    assert.equal(
      ajaxCompletionFallbackPayload.completion.cleanerComment,
      "Comment saved through ajax query fallback."
    );

    const saveOrderForm = new URLSearchParams();
    saveOrderForm.set("entryId", entryId);
    saveOrderForm.set("returnTo", "/admin/orders");
    saveOrderForm.set("orderStatus", "rescheduled");
    saveOrderForm.append("assignedStaff", "Anna Petrova");
    saveOrderForm.append("assignedStaff", "Diana Brooks");
    saveOrderForm.set("paymentStatus", "partial");
    saveOrderForm.set("paymentMethod", "card");
    saveOrderForm.set("totalPrice", "245.50");
    saveOrderForm.set("selectedDate", "2026-03-24");
    saveOrderForm.set("selectedTime", "11:30");
    saveOrderForm.set("frequency", "monthly");

    const saveOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: saveOrderForm,
    });
    assert.equal(saveOrderResponse.status, 303);
    assert.match(saveOrderResponse.headers.get("location") || "", /notice=order-saved/);

    const ajaxOrderSaveResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "x-shynli-admin-ajax": "1",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/orders",
        orderStatus: "completed",
      }),
    });
    assert.equal(ajaxOrderSaveResponse.status, 200);
    const ajaxOrderSavePayload = await ajaxOrderSaveResponse.json();
    assert.equal(ajaxOrderSavePayload.ok, true);
    assert.equal(ajaxOrderSavePayload.notice, "order-saved");
    assert.equal(ajaxOrderSavePayload.order.orderStatus, "completed");

    const updatedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const updatedOrdersBody = await updatedOrdersResponse.text();
    assert.equal(updatedOrdersResponse.status, 200);
    assert.match(updatedOrdersBody, /Завершено/);
    assert.match(updatedOrdersBody, /2 сотрудника/);
    assert.match(updatedOrdersBody, /Monthly/);
    assert.match(updatedOrdersBody, /<option value="partial" selected>Partial/);
    assert.match(updatedOrdersBody, /type="checkbox" name="assignedStaff" value="Anna Petrova" checked/);
    assert.match(updatedOrdersBody, /type="checkbox" name="assignedStaff" value="Diana Brooks" checked/);
    assert.match(updatedOrdersBody, /<option value="card" selected>Card/);
    assert.match(updatedOrdersBody, /\$245\.50/);
    assert.match(updatedOrdersBody, /name="totalPrice"/);
    assert.match(updatedOrdersBody, /value="245\.50"/);
    assert.match(updatedOrdersBody, /value="03\/24\/2026"/);
    assert.match(updatedOrdersBody, /value="11:30 AM"/);
    assert.match(updatedOrdersBody, /Отчёт клинера/);
    assert.match(updatedOrdersBody, /Фото до/);
    assert.match(updatedOrdersBody, /Фото после/);
    assert.match(updatedOrdersBody, /Комментарий клинера/);
    assert.match(updatedOrdersBody, /Comment saved through ajax query fallback\./);
    assert.match(updatedOrdersBody, /Посмотреть/);
    assert.doesNotMatch(updatedOrdersBody, /<img class="admin-order-media-thumb"/);
    assert.doesNotMatch(updatedOrdersBody, /type="file" name="beforePhotos"/);
    assert.doesNotMatch(updatedOrdersBody, /type="file" name="afterPhotos"/);
    assert.doesNotMatch(updatedOrdersBody, /<button[^>]+data-admin-order-cleaner-comment-submit/);

    const filteredOrdersResponse = await fetch(`${started.baseUrl}/admin/orders?q=ops-request-1`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const filteredOrdersBody = await filteredOrdersResponse.text();
    assert.equal(filteredOrdersResponse.status, 200);
    assert.match(filteredOrdersBody, /Найдено 2 из 2 заказов\./);
    assert.match(filteredOrdersBody, /С учётом поиска и фильтров\./);
    const mediaMatches = Array.from(
      updatedOrdersBody.matchAll(new RegExp(`/admin/orders\\?media=1&amp;entryId=${escapeRegex(entryId)}&amp;asset=([^"&]+)`, "g"))
    );
    assert.equal(mediaMatches.length, 3);

    const mediaResponse = await fetch(
      `${started.baseUrl}/admin/orders?media=1&entryId=${encodeURIComponent(entryId)}&asset=${encodeURIComponent(mediaMatches[0][1])}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(await mediaResponse.text(), "before-image-1");

    const quoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const quoteOpsBody = await quoteOpsResponse.text();
    assert.equal(quoteOpsResponse.status, 200);
    assert.match(quoteOpsBody, /Jane Doe/);
    assert.match(quoteOpsBody, /ops-request-1/);
    assert.match(quoteOpsBody, /Лента заявок/);
    assert.match(quoteOpsBody, /Быстро найти нужную заявку/);
    assert.match(quoteOpsBody, /Все заявки/);
    assert.match(quoteOpsBody, /admin-table admin-quote-success-table/);
    assert.match(quoteOpsBody, /\.admin-quote-success-table\s*\{[\s\S]*min-width: 1380px;/);
    assert.match(quoteOpsBody, /\.admin-quote-lane\s*\{[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/);
    assert.match(quoteOpsBody, /\.admin-quote-table-wrap\s*\{[\s\S]*width: 100%;[\s\S]*max-width: 100%;/);
    assert.match(quoteOpsBody, /data-admin-auto-submit="true"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-delay="600"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-min-length="2"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-restore-focus="true"/);
    assert.match(quoteOpsBody, /id="admin-quote-ops-filters"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-scroll-target="#admin-quote-ops-filters"/);
    assert.match(quoteOpsBody, /data-admin-auto-submit-scroll-offset="18"/);
    assert.match(quoteOpsBody, /const autoSubmitScrollStorageKey = "adminAutoSubmitScroll"/);
    const adminScriptMatch = quoteOpsBody.match(/<script>\s*\(\(\) => \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
    assert.ok(adminScriptMatch);
    assert.doesNotThrow(() => new Function(`(() => {${adminScriptMatch[1]}})();`));
    assert.match(quoteOpsBody, /123 Main St, Romeoville, IL 60446/);
    assert.match(quoteOpsBody, /\+1\(312\)555-0100/);
    assert.match(quoteOpsBody, /data-admin-dialog-open="admin-quote-entry-detail-dialog-/);
    assert.match(quoteOpsBody, /class="admin-table-row-clickable"/);
    assert.match(quoteOpsBody, /data-admin-dialog-row="true"/);
    assert.match(quoteOpsBody, /Удалить заявку/);
    assert.match(quoteOpsBody, /data-admin-confirm-message="Удалить эту заявку из системы без возможности восстановления\?"/);
    assert.match(quoteOpsBody, /Телефон: \+1\(312\)555-0100/);
    assert.match(quoteOpsBody, /E-mail: jane@example\.com/);
    assert.match(quoteOpsBody, /admin-client-metric-card-wide/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Сумма<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Дата и время<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Телефон<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Услуга<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-metric-label">Адрес<\/span>/);
    assert.match(quoteOpsBody, /admin-client-info-grid admin-client-info-grid-three/);
    assert.match(quoteOpsBody, /<span class="admin-client-info-label">Создана<\/span>/);
    assert.match(quoteOpsBody, /<span class="admin-client-info-label">Менеджер<\/span>/);
    assert.match(quoteOpsBody, /Не назначен/);
    assert.match(quoteOpsBody, /Что заказал клиент/);
    assert.match(quoteOpsBody, /Поля из формы клиента/);
    assert.match(quoteOpsBody, /Комментарий клиента/);
    assert.match(quoteOpsBody, /\$245\.50/);
    assert.match(quoteOpsBody, /Gate code 2040/);
    assert.doesNotMatch(quoteOpsBody, /Главные детали собраны в компактные блоки/);
    assert.doesNotMatch(quoteOpsBody, /admin-quote-ops-filter-disclosure" open/);
    assert.doesNotMatch(quoteOpsBody, /Persistent storage active/i);
    assert.doesNotMatch(quoteOpsBody, /Подключено к Supabase/i);
    assert.doesNotMatch(quoteOpsBody, /quote_ops_entries/i);
    assert.doesNotMatch(quoteOpsBody, /CRM OK/);
    assert.doesNotMatch(quoteOpsBody, /CRM и отправка/);
    assert.doesNotMatch(quoteOpsBody, /<th>Действие<\/th>/);
    assert.doesNotMatch(quoteOpsBody, /<th>CRM<\/th>/);
    assert.doesNotMatch(quoteOpsBody, /<colgroup>/);
    assert.doesNotMatch(quoteOpsBody, /Скачать CSV/);
    assert.doesNotMatch(quoteOpsBody, /в текущей выборке/);
    assert.doesNotMatch(quoteOpsBody, /Критичных заявок нет/);
    assert.doesNotMatch(quoteOpsBody, /Последняя:/);
    assert.doesNotMatch(quoteOpsBody, /Запрос:\s*Standard Cleaning/i);
    assert.doesNotMatch(quoteOpsBody, /Клиент выбрал слот/i);
    assert.doesNotMatch(quoteOpsBody, /Заявка ушла в CRM без ошибок/i);
    assert.doesNotMatch(quoteOpsBody, /Адрес и комментарий/);
    assert.doesNotMatch(quoteOpsBody, /Полный адрес/);
    assert.doesNotMatch(quoteOpsBody, /Короткий адрес/);
    assert.doesNotMatch(quoteOpsBody, /admin-dialog-actions-row[\s\S]*Повторить отправку[\s\S]*Закрыть/);

    const quoteOpsAddressSearchResponse = await fetch(
      `${started.baseUrl}/admin/quote-ops?q=${encodeURIComponent("123 Main St, Romeoville, IL 60446")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const quoteOpsAddressSearchBody = await quoteOpsAddressSearchResponse.text();
    assert.equal(quoteOpsAddressSearchResponse.status, 200);
    assert.match(quoteOpsAddressSearchBody, /Jane Doe/);
    assert.match(quoteOpsAddressSearchBody, /Показано 2 из 2 заявок\./);
    assert.doesNotMatch(quoteOpsAddressSearchBody, /По текущему фильтру заявок нет/);

    const removedExportResponse = await fetch(`${started.baseUrl}/admin/quote-ops/export.csv`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    assert.equal(removedExportResponse.status, 404);

    const retryResponse = await fetch(`${started.baseUrl}/admin/quote-ops/retry`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: "/admin/quote-ops",
      }),
    });
    assert.equal(retryResponse.status, 303);
    assert.match(retryResponse.headers.get("location") || "", /notice=retry-success/);

    const deleteOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-order",
        entryId,
        returnTo: "/admin/orders",
      }),
    });
    assert.equal(deleteOrderResponse.status, 303);
    assert.match(deleteOrderResponse.headers.get("location") || "", /notice=order-deleted/);

    const deletedOrdersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedOrdersBody = await deletedOrdersResponse.text();
    assert.equal(deletedOrdersResponse.status, 200);
    assert.match(deletedOrdersBody, /Jane Doe/);
    assert.doesNotMatch(deletedOrdersBody, /(?<![a-z0-9-])ops-request-1(?!-[a-z0-9])/i);

    const deletedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const deletedQuoteOpsBody = await deletedQuoteOpsResponse.text();
    assert.equal(deletedQuoteOpsResponse.status, 200);
    assert.match(deletedQuoteOpsBody, /Jane Doe/);
    assert.match(deletedQuoteOpsBody, /ops-request-1/);

    const deleteLeadResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "delete-lead-entry",
        entryId,
        returnTo: `/admin/quote-ops?entry=${encodeURIComponent(entryId)}`,
      }),
    });
    assert.equal(deleteLeadResponse.status, 303);
    assert.match(deleteLeadResponse.headers.get("location") || "", /notice=lead-deleted/);
    assert.doesNotMatch(deleteLeadResponse.headers.get("location") || "", /(?:\?|&)entry=/);

    const removedQuoteOpsResponse = await fetch(`${started.baseUrl}/admin/quote-ops`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const removedQuoteOpsBody = await removedQuoteOpsResponse.text();
    assert.equal(removedQuoteOpsResponse.status, 200);
    assert.doesNotMatch(
      removedQuoteOpsBody,
      /(?<![a-z0-9-])ops-request-1(?!-[a-z0-9])/i
    );
    assert.doesNotMatch(
      removedQuoteOpsBody,
      new RegExp(`admin-quote-entry-detail-dialog-${escapeRegex(entryId)}`)
    );

    const captureRaw = await fs.readFile(fetchStub.captureFile, "utf8");
    const calls = captureRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const crmSyncCalls = calls.filter((record) =>
      String(record.url).includes("/contacts/")
    );
    const autoSmsCalls = calls.filter((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.equal(crmSyncCalls.length, 4);
    assert.equal(autoSmsCalls.length, 1);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
