"use strict";

function createQuoteOpsUiHelpers(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ORDER_QUOTE_QUANTITY_LABELS,
    buildAdminRedirectPath,
    buildFormattedScheduleLabel,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminDateTimeInputValue,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatQuoteOpsEntryCountLabel,
    formatOrderQuoteBoolean,
    formatOrderQuoteDateValue,
    formatOrderQuoteFrequency,
    formatOrderQuoteMultiline,
    formatOrderQuotePetsLabel,
    formatOrderQuoteRequestedSlot,
    formatOrderQuoteServiceType,
    formatOrderQuoteSquareFootage,
    formatOrderQuoteText,
    formatOrderQuoteTimeValue,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getEntryAdminLeadData,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    getEntrySmsHistoryEntries,
    getLeadStatus,
    getOrderQuoteData,
    getOrderQuoteQuantityValue,
    getOrderQuoteSelectedServices,
    getQuoteLeadManager,
    getQuoteOpsDialogId,
    getQuoteOpsStatusMeta,
    isOrderCreatedEntry,
    normalizeString,
    renderAdminBadge,
    renderAdminCard,
    renderAdminClientDetailDialog,
    renderAdminClientInfoGrid,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminGhlSmsComposer,
    renderAdminHiddenInput,
    renderLeadStatusBadge,
    renderOrderManagementDialog,
    renderOrderQuoteField,
    renderQuoteOpsCrmItem,
    renderQuoteOpsInfoItem,
    renderQuoteOpsManagerSelect,
    renderQuoteOpsStatusBadge,
  } = deps;

  function renderQuoteOpsDiagnostics(quoteOpsLedger) {
    const diagnostics =
      quoteOpsLedger && typeof quoteOpsLedger.getDiagnostics === "function"
        ? quoteOpsLedger.getDiagnostics()
        : null;
    if (!diagnostics) return "";

    const modeLabel = diagnostics.mode === "supabase" ? "Supabase" : "Память процесса";
    const remoteStatusLabel =
      diagnostics.mode !== "supabase"
        ? "Только память"
        : diagnostics.remoteStatus === "healthy"
          ? "Persistent storage active"
          : diagnostics.remoteStatus === "fallback"
            ? "Есть fallback"
            : "Ожидаем первую синхронизацию";
    const readSourceLabel =
      diagnostics.lastReadSource === "supabase"
        ? "Чтение: Supabase"
        : diagnostics.lastReadSource === "memory-fallback"
          ? "Чтение: fallback в память"
          : diagnostics.lastReadSource === "memory"
            ? "Чтение: память"
            : "Чтение ещё не выполнялось";
    const statusBadge =
      diagnostics.lastReadError
        ? renderAdminBadge("Есть ошибка чтения", "danger")
        : diagnostics.mode === "supabase"
          ? renderAdminBadge("Подключено к Supabase", "success")
          : renderAdminBadge("Временное хранилище", "muted");

    const summaryAlert =
      diagnostics.mode !== "supabase"
        ? `<div class="admin-alert admin-alert-error">Заказы сейчас хранятся только в памяти сервера. После рестарта или деплоя они исчезнут.</div>`
        : diagnostics.remoteStatus === "fallback"
          ? `<div class="admin-alert admin-alert-error">Supabase подключён, но чтение или запись заказов сейчас откатились в локальный fallback.</div>`
          : diagnostics.remoteStatus === "healthy"
            ? `<div class="admin-alert admin-alert-info">Persistent storage active: заказы должны переживать деплои и рестарты.</div>`
            : `<div class="admin-alert admin-alert-info">Supabase подключён. Ждём первой успешной синхронизации.</div>`;

    return `<div class="admin-diagnostics-strip">
      ${summaryAlert}
      <div class="admin-diagnostics-head">
        <div class="admin-badge-row admin-badge-row-inline">
          ${renderAdminBadge(modeLabel, diagnostics.mode === "supabase" ? "success" : "muted")}
          ${renderAdminBadge(remoteStatusLabel, diagnostics.remoteStatus === "fallback" ? "danger" : diagnostics.mode === "supabase" ? "success" : "muted")}
          ${renderAdminBadge(readSourceLabel, diagnostics.lastReadError ? "danger" : "outline")}
          ${statusBadge}
        </div>
        <p class="admin-action-hint">Этот раздел строится только из заявок сайта в quote ops, а не из всей CRM-базы контактов.</p>
      </div>
      <div class="admin-diagnostics-grid">
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Таблица</span>
          <p class="admin-diagnostics-value">${escapeHtml(diagnostics.tableName || "Не указана")}</p>
        </article>
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Лимит чтения</span>
          <p class="admin-diagnostics-value">${escapeHtml(String(diagnostics.limit || 0))}</p>
        </article>
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Последнее чтение</span>
          <p class="admin-diagnostics-value">${escapeHtml(diagnostics.lastReadAt || "Нет данных")}</p>
        </article>
      </div>
      ${diagnostics.lastReadError
        ? `<div class="admin-alert admin-alert-error">Ошибка чтения Supabase: ${escapeHtml(diagnostics.lastReadError)}</div>`
        : diagnostics.lastSyncError
          ? `<div class="admin-alert admin-alert-error">Последняя ошибка синхронизации: ${escapeHtml(diagnostics.lastSyncError)}</div>`
          : ""}
    </div>`;
  }

  function renderQuoteOpsEntryCard(entry, returnTo) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
    const leadStatus = getLeadStatus(entry);
    const manager = getQuoteLeadManager(entry);
    const openTask = getEntryOpenLeadTask(entry);
    const contactMarkup = [
      entry.customerPhone ? `<span>${escapeHtml(formatAdminPhoneNumber(entry.customerPhone) || entry.customerPhone)}</span>` : `<span>Телефон не указан</span>`,
      entry.customerEmail ? `<span>${escapeHtml(entry.customerEmail)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-quote-entry-feedback admin-quote-entry-feedback-warning">
          <strong>Нужно проверить</strong>
          <span>${escapeHtml(entry.warnings.join(" • "))}</span>
        </div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-quote-entry-feedback admin-quote-entry-feedback-error">
          <strong>Ошибка CRM</strong>
          <span>${escapeHtml(entry.errorMessage)}</span>
        </div>`
      : "";
    const stateBadges = [
      renderLeadStatusBadge(leadStatus),
      renderQuoteOpsStatusBadge(entry.status),
      entry.retryCount > 0 ? renderAdminBadge(`Retry ${entry.retryCount}`, "outline") : "",
      entry.contactId
        ? renderAdminBadge(entry.usedExistingContact ? "Контакт найден" : "Контакт создан", entry.usedExistingContact ? "outline" : "success")
        : "",
      entry.noteCreated ? renderAdminBadge("Заметка создана", "outline") : "",
      entry.opportunityCreated ? renderAdminBadge("Сделка создана", "outline") : "",
      entry.retryable ? renderAdminBadge("Можно повторить", entry.status === "error" ? "danger" : "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const retrySummary = entry.retryCount > 0
      ? `Последний retry: ${formatAdminDateTime(entry.lastRetryAt)}${entry.lastRetryMessage ? ` • ${entry.lastRetryMessage}` : ""}`
      : "Повторов ещё не было. Используйте retry только если нужно заново синхронизировать заявку с CRM.";

    return `<article class="admin-quote-entry admin-quote-entry-${escapeHtmlAttribute(entry.status || "error")}">
      <div class="admin-quote-entry-head">
        <div class="admin-quote-entry-main">
          <div class="admin-quote-entry-topline">
            <span>${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
            <span class="admin-quote-entry-separator"></span>
            <span>${escapeHtml(entry.requestId || "Номер не указан")}</span>
          </div>
          <h3 class="admin-quote-entry-title">
            <button
              class="admin-quote-entry-title-button"
              type="button"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
            >${escapeHtml(entry.customerName || "Клиент")}</button>
          </h3>
          <p class="admin-quote-entry-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
        </div>
        <div class="admin-quote-entry-side">
          <span class="admin-quote-entry-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
          <div class="admin-quote-entry-badges">
            ${stateBadges}
          </div>
        </div>
      </div>
      <div class="admin-quote-entry-crm-grid">
        ${renderQuoteOpsCrmItem("CRM код", entry.code || "—")}
        ${renderQuoteOpsCrmItem("HTTP", entry.httpStatus ? String(entry.httpStatus) : "—")}
        ${renderQuoteOpsCrmItem("Контакт ID", entry.contactId || "—")}
        ${renderQuoteOpsCrmItem("Источник", entry.source || "site")}
      </div>
      <div class="admin-quote-entry-info-grid">
        ${renderQuoteOpsInfoItem("Дата уборки", escapeHtml(scheduleLabel))}
        ${renderQuoteOpsInfoItem("Контакты", contactMarkup)}
        ${renderQuoteOpsInfoItem("Адрес", escapeHtml(entry.fullAddress || "Не указан"), { wide: true })}
      </div>
      ${warningBlock}
      ${errorBlock}
      <div class="admin-quote-entry-info-grid">
        ${renderQuoteOpsInfoItem("Менеджер", escapeHtml(manager.name || manager.email || "Не назначен"))}
        ${renderQuoteOpsInfoItem(
          "Активный таск",
          escapeHtml(
            openTask
              ? `${openTask.title} • ${formatAdminDateTime(openTask.dueAt)}`
              : leadStatus === "confirmed"
                ? "Заказ уже создан"
                : "Открытых задач нет"
          )
        )}
      </div>
      <div class="admin-quote-entry-footer">
        <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <button class="admin-button${entry.status === "success" ? " admin-button-secondary" : ""}" type="submit">Повторить отправку</button>
        </form>
        <span class="admin-action-hint">${escapeHtml(retrySummary)}</span>
      </div>
    </article>`;
  }
  function renderQuoteOpsSuccessTable(entries, returnTo) {
    void returnTo;
    return `<div class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-success-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Адрес</th>
            <th>Услуга</th>
            <th>Уборка</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => {
            const dialogId = getQuoteOpsDialogId(entry.id);
            const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
            const clientContactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "", entry.customerEmail || ""].filter(Boolean).join(" • ") || "Контакты не указаны";

            return `<tr
              class="admin-table-row-clickable"
              tabindex="0"
              data-admin-dialog-row="true"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
              aria-label="${escapeHtmlAttribute(`Открыть заявку ${entry.customerName || "Клиент"}`)}"
            >
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-link">${escapeHtml(entry.customerName || "Клиент")}</span>
                  <span class="admin-table-muted">${escapeHtml(clientContactLabel)}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-line-clamp-two">${escapeHtml(entry.fullAddress || "Не указан")}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</span>
                  <span class="admin-table-muted">${escapeHtml([formatAdminDateTime(entry.createdAt), entry.requestId || ""].filter(Boolean).join(" • "))}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(scheduleLabel)}</span>
                </div>
              </td>
              <td class="admin-table-number">
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
                  <span class="admin-table-muted">${escapeHtml(entry.retryCount > 0 ? `Retry ${entry.retryCount}` : "Без retry")}</span>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
  }
  function renderQuoteOpsDetailDialog(entry, returnTo, managerOptions = [], options = {}) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";
    const closeHref = options.closeHref || "";
    const orderCreated = isOrderCreatedEntry(entry);
    const leadStatus = getLeadStatus(entry);
    const manager = getQuoteLeadManager(entry);
    const leadTasks = getEntryLeadTasks(entry);
    const openTasks = leadTasks.filter((task) => task.status === "open");
    const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
    const createdLabel = formatAdminDateTime(entry.createdAt);
    const phoneLabel = formatAdminPhoneNumber(entry.customerPhone) || "Телефон не указан";
    const emailLabel = entry.customerEmail || "E-mail не указан";
    const titleLabel = entry.customerName || "Карточка заявки";
    const serviceLabel = formatAdminServiceLabel(entry.serviceName || entry.serviceType);
    const leadData = getEntryAdminLeadData(entry);
    const leadNotes = normalizeString(leadData.notes, 2000);
    const leadTaskRecords = leadTasks.map((task) => ({
      ...task,
      entry,
      leadStatus,
      manager,
      customerName: normalizeString(entry.customerName || "Клиент", 200),
      requestId: normalizeString(entry.requestId, 120),
      serviceLabel,
    }));
    const openTaskRecords = leadTaskRecords.filter((task) => task.status === "open");
    const quoteData = getOrderQuoteData({ entry });
    const selectedServices = getOrderQuoteSelectedServices(quoteData);
    const additionalDetailsMarkup = formatOrderQuoteMultiline(quoteData.additionalDetails);
    const quoteTotalPrice =
      quoteData.totalPrice === 0 || quoteData.totalPrice
        ? quoteData.totalPrice
        : entry.totalPrice;
    const summaryBadges = [
      renderLeadStatusBadge(leadStatus),
      renderQuoteOpsStatusBadge(entry.status),
      renderAdminBadge(serviceLabel, "outline"),
      entry.retryCount > 0 ? renderAdminBadge(`Retry ${entry.retryCount}`, "outline") : "",
      entry.requestId ? renderAdminBadge(entry.requestId, "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const prioritySummaryItems = [
      { label: "Сумма", value: formatCurrencyAmount(quoteTotalPrice) },
      { label: "Дата и время", value: scheduleLabel },
      { label: "Телефон", value: phoneLabel },
      { label: "Услуга", value: serviceLabel },
      { label: "Адрес", value: entry.fullAddress || "Не указан", wide: true },
    ];
    const secondarySummaryItems = [
      { label: "E-mail", value: emailLabel },
      { label: "Создана", value: createdLabel },
      { label: "Менеджер", value: manager.name || manager.email || "Не назначен" },
    ].filter(Boolean);
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(entry.warnings.join(" • "))}</div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(entry.errorMessage)}</div>`
      : "";
    const quoteCards = [
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Что заказал клиент</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Тип уборки", formatOrderQuoteServiceType(quoteData.serviceType, serviceLabel))}
          ${renderOrderQuoteField("Повторяемость", formatOrderQuoteFrequency(quoteData.frequency, "Not set"))}
          ${renderOrderQuoteField("Дата", formatOrderQuoteDateValue(quoteData.selectedDate || entry.selectedDate))}
          ${renderOrderQuoteField("Время", formatOrderQuoteTimeValue(quoteData.selectedTime || entry.selectedTime))}
          ${renderOrderQuoteField("Запрошенный слот", formatOrderQuoteRequestedSlot(quoteData.formattedDateTime, quoteData.selectedDate || entry.selectedDate, quoteData.selectedTime || entry.selectedTime), { wide: true })}
          ${renderOrderQuoteField("Сумма из quote", formatCurrencyAmount(quoteTotalPrice))}
          ${renderOrderQuoteField("Согласие", formatOrderQuoteBoolean(quoteData.consent))}
          ${renderOrderQuoteField("Выбранные add-ons", selectedServices.length > 0 ? selectedServices.join(", ") : "Не выбраны", { wide: true })}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.interiorWindowsCleaning, getOrderQuoteQuantityValue(quoteData, "interiorWindowsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.blindsCleaning, getOrderQuoteQuantityValue(quoteData, "blindsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.bedLinenChange, getOrderQuoteQuantityValue(quoteData, "bedLinenChange"))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Дом и условия</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Спальни", formatOrderQuoteText(quoteData.rooms, "Не указано", 32))}
          ${renderOrderQuoteField("Санузлы", formatOrderQuoteText(quoteData.bathrooms, "Не указано", 32))}
          ${renderOrderQuoteField("Размер дома", formatOrderQuoteSquareFootage(quoteData.squareMeters))}
          ${renderOrderQuoteField("Питомцы", formatOrderQuotePetsLabel(quoteData.hasPets))}
          ${renderOrderQuoteField("Basement cleaning", formatOrderQuoteBoolean(quoteData.basementCleaning))}
          ${renderOrderQuoteField("Apt / suite", formatOrderQuoteText(quoteData.addressLine2, "Не указано", 200))}
          ${renderOrderQuoteField("Город", formatOrderQuoteText(quoteData.city, "Не указано", 120))}
          ${renderOrderQuoteField("Штат", formatOrderQuoteText(quoteData.state, "Не указано", 32))}
          ${renderOrderQuoteField("ZIP", formatOrderQuoteText(quoteData.zipCode, "Не указано", 32))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Комментарий клиента</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Комментарий клиента", additionalDetailsMarkup, { raw: true, wide: true })}
        </div>
      </article>`,
    ].join("");

    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${escapeHtmlAttribute(dialogId)}"${autoOpenAttr}${closeHref ? ` data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"` : ""} aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(titleLabel))}">${escapeHtml(getAdminClientAvatarInitials(titleLabel))}</div>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Заявка</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(titleLabel)}</h2>
                <div class="admin-dialog-hero-meta-stack">
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(`Телефон: ${phoneLabel}`)}</p>
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(`E-mail: ${emailLabel}`)}</p>
                  <p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(entry.fullAddress || "Адрес не указан")}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${orderCreated
              ? `<a class="admin-button" href="${escapeHtmlAttribute(buildAdminRedirectPath(ADMIN_ORDERS_PATH, { order: entry.id, notice: "order-created" }))}">Открыть заказ</a>`
              : `<form method="post" action="${ADMIN_QUOTE_OPS_PATH}">
                  <input type="hidden" name="action" value="create-order-from-request">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button class="admin-button" type="submit">Подтвердить и создать заказ</button>
                </form>`}
            <form method="post" action="${ADMIN_QUOTE_OPS_PATH}">
              <input type="hidden" name="action" value="delete-lead-entry">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              ${renderAdminDeleteIconButton("Удалить заявку", "Удалить эту заявку из системы без возможности восстановления?")}
            </form>
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <section class="admin-client-summary-panel">
          <div class="admin-client-summary-head">
            <div class="admin-client-summary-copy-block">
              <div class="admin-badge-row admin-client-badge-row">
                ${summaryBadges}
              </div>
            </div>
          </div>
          ${warningBlock}
          ${errorBlock}
          <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
            ${prioritySummaryItems.map((item) => `
              <article class="admin-client-metric-card${item.wide ? " admin-client-metric-card-wide" : ""}">
                <span class="admin-client-metric-label">${escapeHtml(item.label)}</span>
                <p class="admin-client-metric-value">${escapeHtml(item.value)}</p>
              </article>
            `).join("")}
          </div>
          ${renderAdminClientInfoGrid(secondarySummaryItems, { columns: 3 })}
        </section>
        ${renderAdminGhlSmsComposer({
          req: options.req,
          actionPath: ADMIN_QUOTE_OPS_PATH,
          targetType: "quote",
          targetRef: entry.id,
          targetFieldName: "entryId",
          targetFieldValue: entry.id,
          returnTo,
          phone: entry.customerPhone,
          contactId: entry.contactId,
          historyEntries: getEntrySmsHistoryEntries(entry),
          leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
          canEdit: options.canEdit,
          noticePrefix: "quote",
          title: "SMS по заявке",
          description: "Быстрая отправка сообщения клиенту по этой заявке через Go High Level.",
        })}
        <section>
          ${renderAdminCard(
            "Заметки",
            "Внутренние заметки менеджера по этой заявке.",
            `<form class="admin-form admin-form-grid admin-quote-entry-notes-form" method="post" action="${ADMIN_QUOTE_OPS_PATH}" data-quote-entry-notes-form="true">
              <input type="hidden" name="action" value="update-lead-notes">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              <label class="admin-label">
                <span class="admin-sr-only">Заметки</span>
                <textarea class="admin-input" name="notes" rows="6" placeholder="Что важно знать по заявке: договорённости, нюансы, комментарии по клиенту">${escapeHtml(leadNotes)}</textarea>
              </label>
              <p class="admin-field-note" data-quote-entry-notes-feedback="true" hidden></p>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Сохранить</button>
              </div>
            </form>`,
            { muted: true }
          )}
        </section>
        <section>
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Поля из формы клиента</h3>
          </div>
          <div class="admin-order-quote-grid">
            ${quoteCards}
          </div>
        </section>
        <section>
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Этап и менеджер</h3>
          </div>
          <div class="admin-quote-entry-detail-grid">
            ${renderAdminCard(
              "Воронка заявки",
              "Назначьте менеджера и обновляйте текущий этап прямо из карточки.",
              `<form class="admin-form admin-form-grid admin-form-grid-two admin-quote-entry-stage-form" method="post" action="${ADMIN_QUOTE_OPS_PATH}">
                <input type="hidden" name="action" value="update-lead-status">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <label class="admin-label">
                  Статус заявки
                  <select class="admin-input" name="leadStatus">
                    <option value="new"${leadStatus === "new" ? " selected" : ""}>New</option>
                    <option value="no-response"${leadStatus === "no-response" ? " selected" : ""}>Без ответа</option>
                    <option value="discussion"${leadStatus === "discussion" ? " selected" : ""}>Обсуждение</option>
                    <option value="confirmed"${leadStatus === "confirmed" ? " selected" : ""}>Подтверждено</option>
                    <option value="declined"${leadStatus === "declined" ? " selected" : ""}>Отказ</option>
                  </select>
                </label>
                <label class="admin-label">
                  Менеджер
                  ${renderQuoteOpsManagerSelect(managerOptions, manager.id)}
                </label>
                <label class="admin-label admin-form-grid-span-2">
                  Следующий контакт с клиентом
                  <input
                    class="admin-input"
                    type="datetime-local"
                    name="discussionNextContactAt"
                    value="${escapeHtmlAttribute(formatAdminDateTimeInputValue(leadData.discussionNextContactAt || ""))}"
                  >
                </label>
                <div class="admin-inline-actions admin-form-grid-span-2">
                  <button class="admin-button" type="submit">Сохранить этап</button>
                </div>
              </form>`,
              { eyebrow: "Воронка", muted: true }
            )}
            ${renderAdminCard(
              "Таски по заявке",
              "Автоматические действия, связанные с текущим этапом.",
              openTaskRecords.length > 0
                ? `<div class="admin-table-wrap admin-quote-entry-task-summary">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>Таск</th>
                          <th>Дедлайн</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${openTaskRecords.map((task) => `<tr>
                          <td>
                            <div class="admin-table-cell-stack">
                              <span class="admin-table-strong">${escapeHtml(task.title)}</span>
                              <span class="admin-table-muted">${escapeHtml(task.requestId || entry.requestId || entry.id)}</span>
                            </div>
                          </td>
                          <td>
                            <div class="admin-table-cell-stack">
                              <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(task.dueAt))}</span>
                            </div>
                          </td>
                          <td>
                            <div class="admin-badge-row">
                              ${task.status === "open"
                                ? renderAdminBadge("Открыта", "outline")
                                : task.status === "completed"
                                  ? renderAdminBadge("Закрыта", "success")
                                  : renderAdminBadge("Отменена", "muted")}
                            </div>
                          </td>
                        </tr>`).join("")}
                      </tbody>
                    </table>
                  </div>`
                : `<div class="admin-empty-state">Для этой заявки сейчас нет активных тасков.</div>`,
              { eyebrow: "Таски", muted: true }
            )}
          </div>
        </section>
      </div>
    </dialog>`;
  }
  function renderQuoteOpsWorkspaceStyle() {
    return `<style>
      .admin-subnav-strip {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .admin-subnav-link {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255,255,255,0.78);
        color: var(--muted-foreground);
        font-weight: 600;
        text-decoration: none;
      }
      .admin-subnav-link-active {
        border-color: rgba(158, 67, 90, 0.22);
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
      }
      .admin-quote-funnel-board {
        display: grid;
        grid-template-columns: repeat(5, minmax(260px, 1fr));
        gap: 16px;
        overflow-x: auto;
        padding-bottom: 6px;
        align-items: stretch;
      }
      .admin-quote-funnel-column {
        min-width: 260px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(255,255,255,0.88);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: clamp(460px, 68vh, 840px);
        height: 100%;
        justify-content: flex-start;
      }
      .admin-quote-funnel-column[data-drop-active="true"] {
        border-color: rgba(158, 67, 90, 0.32);
        box-shadow: inset 0 0 0 2px rgba(158, 67, 90, 0.08);
      }
      .admin-quote-funnel-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        align-content: start;
        gap: 12px;
        min-height: 84px;
      }
      .admin-quote-funnel-head > div:first-child {
        min-width: 0;
      }
      .admin-quote-funnel-title {
        margin: 0;
        font-size: 18px;
      }
      .admin-quote-funnel-copy {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-quote-funnel-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
        justify-content: flex-start;
        flex: 1 1 auto;
        min-height: 180px;
      }
      .admin-quote-funnel-card {
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,250,251,0.96);
        display: grid;
        gap: 8px;
        cursor: grab;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
        outline: none;
        min-width: 0;
        overflow: hidden;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-quote-funnel-card[data-locked="true"] {
        cursor: default;
      }
      .admin-quote-funnel-card:hover,
      .admin-quote-funnel-card:focus-visible,
      .admin-quote-funnel-card:focus-within {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.98);
        box-shadow: 0 10px 26px rgba(158, 67, 90, 0.08);
      }
      .admin-quote-funnel-card.is-dragging {
        opacity: 0.45;
      }
      .admin-quote-funnel-card.is-saving {
        opacity: 0.82;
        pointer-events: none;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] {
        border-color: rgba(161, 161, 170, 0.26);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(244, 244, 245, 0.98));
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.03);
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"]:hover,
      .admin-quote-funnel-card[data-quote-entry-status="declined"]:focus-visible,
      .admin-quote-funnel-card[data-quote-entry-status="declined"]:focus-within {
        border-color: rgba(161, 161, 170, 0.34);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(241, 241, 243, 0.98));
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
      }
      .admin-quote-funnel-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .admin-quote-funnel-card-head {
        display: block;
        min-width: 0;
      }
      .admin-quote-funnel-card-title-block {
        display: grid;
        gap: 6px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .admin-quote-funnel-card-title {
        margin: 0;
        font-size: 16px;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }
      .admin-quote-funnel-card-stage {
        width: 100%;
        min-width: 0;
        margin-top: 12px;
      }
      .admin-quote-funnel-card-stage .admin-badge {
        display: flex;
        width: 100%;
        min-width: 0;
        justify-content: center;
        text-align: center;
      }
      .admin-quote-funnel-card-name {
        display: block;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-name {
        color: rgba(39, 39, 42, 0.88);
      }
      .admin-quote-funnel-card-copy,
      .admin-quote-task-card-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-copy {
        color: rgba(113, 113, 122, 0.92);
      }
      .admin-quote-funnel-card-details {
        display: grid;
        gap: 10px;
        padding-top: 12px;
        border-top: 1px solid rgba(228, 228, 231, 0.88);
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-details {
        border-top-color: rgba(212, 212, 216, 0.9);
      }
      .admin-quote-funnel-card-detail {
        display: grid;
        grid-template-columns: minmax(0, 58px) minmax(0, 1fr);
        align-items: start;
        gap: 8px;
        padding: 2px 0;
        border-top: 0;
      }
      .admin-quote-funnel-card-detail[hidden] {
        display: none !important;
      }
      .admin-quote-funnel-card-detail-label {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-detail-label {
        color: rgba(113, 113, 122, 0.9);
      }
      .admin-quote-funnel-card-detail-label-danger {
        color: var(--danger);
      }
      .admin-quote-funnel-card-detail-value {
        margin: 0;
        color: var(--foreground);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-detail-value {
        color: rgba(63, 63, 70, 0.92);
      }
      .admin-quote-funnel-card-detail-value-multiline {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        line-height: 1.22;
        overflow-wrap: anywhere;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-stage .admin-badge {
        background: rgba(228, 228, 231, 0.9) !important;
        border-color: rgba(212, 212, 216, 0.95) !important;
        color: rgba(82, 82, 91, 0.96) !important;
      }
      .admin-quote-funnel-meta,
      .admin-quote-task-meta {
        display: grid;
        gap: 8px;
      }
      .admin-quote-funnel-meta-item,
      .admin-quote-task-meta-item {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
        color: var(--muted-foreground);
      }
      .admin-quote-funnel-meta-item strong,
      .admin-quote-task-meta-item strong {
        color: var(--foreground);
      }
      .admin-quote-funnel-empty,
      .admin-quote-task-empty {
        border: 1px dashed var(--border);
        border-radius: 18px;
        padding: 18px;
        color: var(--muted);
        text-align: center;
        background: rgba(250,250,251,0.76);
      }
      .admin-quote-task-table-wrap {
        overflow-x: auto;
        width: 100%;
      }
      .admin-quote-task-table {
        width: 100%;
        min-width: 100%;
        table-layout: fixed;
      }
      .admin-quote-task-table th,
      .admin-quote-task-table td {
        padding: 10px 12px;
      }
      .admin-quote-task-table .admin-table-cell-stack {
        gap: 2px;
      }
      .admin-quote-task-table .admin-table-strong {
        line-height: 1.15;
      }
      .admin-quote-task-table .admin-table-muted {
        font-size: 11px;
        line-height: 1.25;
      }
      .admin-quote-task-pill-row {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        min-width: 0;
      }
      .admin-quote-task-pill-row .admin-badge {
        min-height: 26px;
        padding: 0 10px;
        font-size: 11px;
      }
      .admin-quote-task-row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .admin-quote-task-row-actions form {
        margin: 0;
      }
      .admin-quote-task-row-actions .admin-button,
      .admin-quote-task-row-actions .admin-link-button {
        min-height: 38px;
        padding: 0 14px;
        box-shadow: none;
      }
      .admin-quote-task-row-id {
        font-size: 12px;
        color: var(--muted);
      }
      .admin-quote-task-row-overdue td {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-quote-task-row-overdue td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      .admin-quote-task-row-overdue:hover td,
      .admin-quote-task-row-overdue:focus-visible td,
      .admin-quote-task-row-overdue:focus-within td {
        background: rgba(158, 67, 90, 0.12);
      }
      .admin-quote-task-deadline-note-overdue {
        color: var(--accent);
        font-weight: 700;
      }
      .admin-quote-task-dialog-panel {
        display: grid;
        gap: 18px;
      }
      .admin-quote-task-dialog-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: start;
        padding: 18px 20px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 28px;
        background:
          radial-gradient(circle at top left, rgba(158, 67, 90, 0.08), transparent 38%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,246,247,0.96));
        box-shadow: 0 18px 34px rgba(15, 23, 42, 0.06);
      }
      .admin-quote-task-dialog-head-main {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        min-width: 0;
      }
      .admin-quote-task-dialog-head-copy {
        display: grid;
        gap: 6px;
        min-width: 0;
        padding-top: 2px;
      }
      .admin-quote-task-dialog-summary {
        display: grid;
        gap: 16px;
        padding: 18px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 24px;
        background: rgba(255,255,255,0.9);
      }
      .admin-quote-task-dialog-title-block {
        display: grid;
        gap: 6px;
      }
      .admin-quote-task-dialog-title-block .admin-dialog-title {
        font-size: 26px;
        line-height: 1.02;
      }
      .admin-quote-task-dialog-lead-copy {
        margin: 0;
        color: var(--foreground);
        font-size: 16px;
        line-height: 1.35;
        font-weight: 700;
      }
      .admin-quote-task-dialog-service {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.35;
      }
      .admin-quote-task-dialog-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .admin-quote-task-dialog-manager {
        margin: 0;
        color: var(--foreground);
        font-size: 13px;
        font-weight: 700;
      }
      .admin-quote-task-dialog-primary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .admin-quote-task-dialog-primary-card,
      .admin-quote-task-dialog-secondary-card {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-quote-task-dialog-label {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-quote-task-dialog-label-danger {
        color: var(--danger);
      }
      .admin-quote-task-dialog-primary-value {
        margin: 0;
        color: var(--foreground);
        font-size: 24px;
        line-height: 1.05;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .admin-quote-task-dialog-secondary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .admin-quote-task-dialog-secondary-value {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.35;
        font-weight: 600;
      }
      .admin-quote-task-dialog-actions {
        display: grid;
        gap: 14px;
      }
      .admin-quote-task-dialog-actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .admin-quote-task-contacted-panel[hidden] {
        display: none;
      }
      .admin-quote-task-contacted-panel {
        display: grid;
        gap: 12px;
        padding-top: 8px;
        border-top: 1px solid rgba(228, 228, 231, 0.9);
      }
      .admin-quote-task-dialog-field {
        display: none;
      }
      .admin-quote-task-dialog-field[data-visible="true"] {
        display: grid;
      }
      @media (max-width: 900px) {
        .admin-quote-task-dialog-head {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-quote-task-dialog-head-main {
          gap: 12px;
        }
        .admin-quote-task-dialog-title-block .admin-dialog-title {
          font-size: 22px;
        }
        .admin-quote-task-dialog-primary-grid,
        .admin-quote-task-dialog-secondary-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-quote-task-dialog-primary-value {
          font-size: 20px;
        }
      }
      .admin-quote-entry-detail-stack {
        align-items: start;
      }
      .admin-quote-entry-detail-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr);
        gap: 14px;
        align-items: start;
      }
      .admin-quote-entry-notes-form {
        max-width: none;
      }
      .admin-quote-entry-notes-form .admin-inline-actions {
        justify-content: flex-start;
      }
      .admin-quote-entry-stage-form {
        max-width: none;
      }
      .admin-quote-entry-stage-form .admin-inline-actions {
        justify-content: flex-start;
      }
      .admin-quote-entry-task-summary,
      .admin-quote-entry-quick-actions-list {
        display: grid;
        gap: 12px;
      }
      .admin-quote-entry-task-summary .admin-table {
        min-width: 0;
      }
      @media (max-width: 1080px) {
        .admin-quote-entry-detail-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>`;
  }
  function renderQuoteOpsFunnelCard(entry, returnTo) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const leadStatus = getLeadStatus(entry);
    const openTask = getEntryOpenLeadTask(entry);
    const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
    const isLocked = leadStatus === "confirmed";
    const hideDeadlineRow = leadStatus === "confirmed" || leadStatus === "declined";
    const dueAtMs = Date.parse((openTask || {}).dueAt || "");
    const isOverdue = Boolean(openTask && Number.isFinite(dueAtMs) && dueAtMs < Date.now());
    const taskLabel = openTask ? openTask.title : leadStatus === "confirmed" ? "Заказ создан" : "Нет открытой задачи";
    const dueLabel = openTask ? formatAdminDateTime(openTask.dueAt) : "—";

    return `<article
      class="admin-quote-funnel-card"
      tabindex="0"
      draggable="${isLocked ? "false" : "true"}"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      data-quote-funnel-card="true"
      data-quote-entry-id="${escapeHtmlAttribute(entry.id)}"
      data-quote-entry-status="${escapeHtmlAttribute(leadStatus)}"
      data-locked="${isLocked ? "true" : "false"}"
      aria-label="${escapeHtmlAttribute(`Открыть заявку ${entry.customerName || "Клиент"}`)}"
    >
      <div class="admin-quote-funnel-card-head">
        <div class="admin-quote-funnel-card-title-block">
          <h3 class="admin-quote-funnel-title">
            <span class="admin-quote-funnel-card-name">${escapeHtml(entry.customerName || "Клиент")}</span>
          </h3>
          <p class="admin-quote-funnel-card-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
        </div>
      </div>
      <div class="admin-quote-funnel-card-details">
        <div class="admin-quote-funnel-card-detail">
          <p class="admin-quote-funnel-card-detail-label">Задача</p>
          <p class="admin-quote-funnel-card-detail-value admin-quote-funnel-card-detail-value-multiline" data-quote-card-task-value="true">${escapeHtml(taskLabel)}</p>
        </div>
        <div class="admin-quote-funnel-card-detail" data-quote-card-deadline-row="true"${hideDeadlineRow ? " hidden" : ""}>
          <p class="admin-quote-funnel-card-detail-label${isOverdue ? " admin-quote-funnel-card-detail-label-danger" : ""}" data-quote-card-due-label="true">Дедлайн</p>
          <p class="admin-quote-funnel-card-detail-value" data-quote-card-due-value="true">${escapeHtml(dueLabel)}</p>
        </div>
        <div class="admin-quote-funnel-card-detail">
          <p class="admin-quote-funnel-card-detail-label">Уборка</p>
          <p class="admin-quote-funnel-card-detail-value">${escapeHtml(scheduleLabel)}</p>
        </div>
      </div>
      <div class="admin-quote-funnel-card-stage" data-quote-card-stage="true">${renderLeadStatusBadge(leadStatus)}</div>
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
    </article>`;
  }
  function renderQuoteOpsFunnelLane(status, entries, returnTo) {
    const titles = {
      new: {
        title: "New",
        copy: "Новые заявки, которые нужно взять в работу сразу.",
      },
      "no-response": {
        title: "Без ответа",
        copy: "Клиенты, которым уже звонили, но они не ответили.",
      },
      discussion: {
        title: "Обсуждение",
        copy: "Есть контакт с клиентом и назначен следующий шаг.",
      },
      confirmed: {
        title: "Подтверждено",
        copy: "Заявки подтверждены и уже переведены в заказ.",
      },
      declined: {
        title: "Отказ",
        copy: "Закрытые заявки, по которым работа не продолжается.",
      },
    };
    const meta = titles[status] || titles.new;
    return `<section class="admin-quote-funnel-column" data-lead-dropzone="${escapeHtmlAttribute(status)}">
      <div class="admin-quote-funnel-head">
        <div>
          <h2 class="admin-quote-funnel-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-quote-funnel-copy">${escapeHtml(meta.copy)}</p>
        </div>
        <div data-quote-funnel-count="true">${renderAdminBadge(String(entries.length), "outline")}</div>
      </div>
      <div class="admin-quote-funnel-list" data-quote-funnel-list="true">
        ${entries.length > 0
          ? entries.map((entry) => renderQuoteOpsFunnelCard(entry, returnTo)).join("")
          : `<div class="admin-quote-funnel-empty">В этой колонке пока нет заявок.</div>`}
      </div>
    </section>`;
  }
  function renderQuoteOpsTaskResultDialog(taskRecord, returnTo, dialogIdOverride = "") {
    const dialogId = dialogIdOverride || `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const scheduleLabel = buildFormattedScheduleLabel(taskRecord.entry.selectedDate, taskRecord.entry.selectedTime) || "Дата не назначена";
    const requestLabel = taskRecord.requestId || taskRecord.entry.id;
    const managerLabel = taskRecord.manager.name || taskRecord.manager.email || "Без менеджера";
    const deadlineMs = Date.parse(taskRecord.dueAt || "");
    const overdue = taskRecord.status === "open" && Number.isFinite(deadlineMs) && deadlineMs < Date.now();
    const phoneLabel = taskRecord.entry.customerPhone
      ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone
      : "Телефон не указан";
    const openRequestHref = buildAdminRedirectPath(returnTo || ADMIN_QUOTE_OPS_PATH, {
      entry: taskRecord.entry.id,
    });
    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <div class="admin-dialog-panel admin-quote-task-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <span class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(taskRecord.customerName || requestLabel || taskRecord.id))}">${escapeHtml(getAdminClientAvatarInitials(taskRecord.customerName || "Клиент"))}</span>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Таск</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${dialogId}-title">${escapeHtml(taskRecord.customerName)}</h2>
                <p class="admin-dialog-hero-subtitle">${escapeHtml(taskRecord.title)}</p>
                <div class="admin-dialog-hero-meta-stack">
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(`${phoneLabel} • ${managerLabel}`)}</p>
                  <p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(`${taskRecord.serviceLabel} • ${scheduleLabel}`)}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            <a
              class="admin-link-button admin-button-secondary"
              href="${escapeHtmlAttribute(openRequestHref)}"
              target="_blank"
              rel="noreferrer noopener"
            >Открыть заявку</a>
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <section class="admin-quote-task-dialog-summary">
          <div class="admin-quote-task-dialog-meta">
            ${renderLeadStatusBadge(taskRecord.leadStatus)}
            ${overdue ? renderAdminBadge("Нужно сегодня", "danger") : ""}
            <p class="admin-quote-task-dialog-manager">${escapeHtml(managerLabel)}</p>
          </div>
          <div class="admin-quote-task-dialog-primary-grid">
            <article class="admin-quote-task-dialog-primary-card">
              <p class="admin-quote-task-dialog-label">Телефон</p>
              <p class="admin-quote-task-dialog-primary-value">${escapeHtml(phoneLabel)}</p>
            </article>
            <article class="admin-quote-task-dialog-primary-card">
              <p class="admin-quote-task-dialog-label${overdue ? " admin-quote-task-dialog-label-danger" : ""}">Дедлайн</p>
              <p class="admin-quote-task-dialog-primary-value">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</p>
            </article>
          </div>
          <div class="admin-quote-task-dialog-secondary-grid">
            <article class="admin-quote-task-dialog-secondary-card">
              <p class="admin-quote-task-dialog-label">Заявка</p>
              <p class="admin-quote-task-dialog-secondary-value">${escapeHtml(requestLabel)}</p>
            </article>
            <article class="admin-quote-task-dialog-secondary-card">
              <p class="admin-quote-task-dialog-label">Уборка</p>
              <p class="admin-quote-task-dialog-secondary-value">${escapeHtml(scheduleLabel)}</p>
            </article>
          </div>
        </section>
        <div class="admin-settings-section-stack admin-quote-task-dialog-actions">
          ${renderAdminCard(
            "Следующее действие",
            "Выберите исход звонка. Если дозвонились, ниже откроется выбор следующего этапа.",
            `<div class="admin-quote-task-dialog-actions-row">
              <form class="admin-inline-actions" method="post" action="${ADMIN_QUOTE_OPS_PATH}">
                <input type="hidden" name="action" value="complete-lead-task">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(taskRecord.entry.id)}">
                <input type="hidden" name="taskId" value="${escapeHtmlAttribute(taskRecord.id)}">
                <input type="hidden" name="taskAction" value="no-answer">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <button class="admin-button admin-button-secondary" type="submit">Не дозвонились</button>
              </form>
              <button
                class="admin-button"
                type="button"
                data-quote-task-contacted-toggle="${escapeHtmlAttribute(dialogId)}"
                aria-expanded="false"
              >Дозвонились</button>
            </div>
            <form
              class="admin-form admin-form-grid admin-form-grid-two admin-quote-task-contacted-panel"
              method="post"
              action="${ADMIN_QUOTE_OPS_PATH}"
              data-quote-task-contacted-panel="${escapeHtmlAttribute(dialogId)}"
              hidden
            >
              <input type="hidden" name="action" value="complete-lead-task">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(taskRecord.entry.id)}">
              <input type="hidden" name="taskId" value="${escapeHtmlAttribute(taskRecord.id)}">
              <input type="hidden" name="taskAction" value="contacted">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              <label class="admin-label">
                Куда переносим заявку
                <select class="admin-input" name="nextStatus" data-lead-next-status="true">
                  <option value="discussion">Обсуждение</option>
                  <option value="confirmed">Подтверждено</option>
                  <option value="declined">Отказ</option>
                </select>
              </label>
              <label class="admin-label admin-quote-task-dialog-field" data-lead-next-contact-field="true" data-visible="true">
                Следующий контакт с клиентом
                <input class="admin-input" type="datetime-local" name="discussionNextContactAt">
              </label>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Сохранить переход</button>
              </div>
            </form>`,
            { eyebrow: "Звонок", muted: true }
          )}
        </div>
      </div>
    </dialog>`;
  }
  function renderQuoteOpsTaskTableRow(taskRecord, returnTo) {
    const dialogId = `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const dueAtMs = Date.parse(taskRecord.dueAt || "");
    const isOverdue = taskRecord.status === "open" && Number.isFinite(dueAtMs) && dueAtMs < Date.now();
    const scheduleLabel =
      taskRecord.entry.selectedDate || taskRecord.entry.selectedTime
        ? buildFormattedScheduleLabel(taskRecord.entry.selectedDate, taskRecord.entry.selectedTime) || "Дата не назначена"
        : "Дата не назначена";
    const dueNote = isOverdue ? "Просрочено" : scheduleLabel;
    return `<tr
      class="admin-table-row-clickable${isOverdue ? " admin-quote-task-row-overdue" : ""}"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть таск ${taskRecord.title} для ${taskRecord.customerName}`)}"
    >
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(taskRecord.title)}</span>
          <span class="admin-table-muted">${escapeHtml(taskRecord.customerName)} • ${escapeHtml(taskRecord.serviceLabel)}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</span>
          <span class="admin-table-muted${isOverdue ? " admin-quote-task-deadline-note-overdue" : ""}">
            ${escapeHtml(dueNote)}
          </span>
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${renderLeadStatusBadge(taskRecord.leadStatus)}
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${taskRecord.manager.name || taskRecord.manager.email
            ? renderAdminBadge(taskRecord.manager.name || taskRecord.manager.email, "outline")
            : renderAdminBadge("Без менеджера", "muted")}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(taskRecord.requestId || taskRecord.entry.id)}</span>
          <span class="admin-table-muted">${escapeHtml(taskRecord.entry.customerPhone ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone : "Телефон не указан")}</span>
        </div>
      </td>
    </tr>`;
  }
  function renderQuoteOpsDiscussionStageDialog(returnTo) {
    return `<dialog class="admin-dialog" id="admin-quote-funnel-discussion-dialog" aria-labelledby="admin-quote-funnel-discussion-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div>
            <p class="admin-card-eyebrow">Воронка</p>
            <h2 class="admin-dialog-title" id="admin-quote-funnel-discussion-title">Перевести в обсуждение</h2>
            <p class="admin-dialog-copy">Укажите, когда менеджер должен снова связаться с клиентом.</p>
          </div>
          ${renderAdminDialogCloseButton("admin-quote-funnel-discussion-dialog")}
        </div>
        <form class="admin-form admin-form-grid" method="post" action="${ADMIN_QUOTE_OPS_PATH}" data-quote-funnel-discussion-form="true">
          <input type="hidden" name="action" value="update-lead-status">
          <input type="hidden" name="entryId" value="">
          <input type="hidden" name="leadStatus" value="discussion">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <label class="admin-label admin-form-grid-span-2">
            Следующий контакт с клиентом
            <input class="admin-input" type="datetime-local" name="discussionNextContactAt" required>
          </label>
          <div class="admin-inline-actions admin-form-grid-span-2">
            <button class="admin-button" type="submit">Сохранить этап</button>
          </div>
        </form>
      </div>
    </dialog>`;
  }
  function renderQuoteOpsLane(status, entries, returnTo) {
    const meta = getQuoteOpsStatusMeta(status);
    return `<section class="admin-quote-lane admin-quote-lane-${escapeHtmlAttribute(status)}">
      <div class="admin-quote-lane-head">
        <div>
          ${meta.kicker ? `<p class="admin-quote-lane-kicker">${escapeHtml(meta.kicker)}</p>` : ""}
          <h2 class="admin-quote-lane-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-quote-lane-copy">${escapeHtml(meta.copy)}</p>
        </div>
        <div class="admin-quote-lane-meta">
          ${status === "success" ? "" : renderQuoteOpsStatusBadge(status)}
          ${renderAdminBadge(formatQuoteOpsEntryCountLabel(entries.length), "outline")}
        </div>
      </div>
      ${status === "success"
        ? renderQuoteOpsSuccessTable(entries, returnTo)
        : `<div class="admin-quote-lane-list">
            ${entries.map((entry) => renderQuoteOpsEntryCard(entry, returnTo)).join("")}
          </div>`}
    </section>`;
  }
  return {
    renderQuoteOpsDiagnostics,
    renderQuoteOpsEntryCard,
    renderQuoteOpsSuccessTable,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsWorkspaceStyle,
    renderQuoteOpsFunnelCard,
    renderQuoteOpsFunnelLane,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsTaskTableRow,
    renderQuoteOpsDiscussionStageDialog,
    renderQuoteOpsLane,
  };
}

module.exports = {
  createQuoteOpsUiHelpers,
};
