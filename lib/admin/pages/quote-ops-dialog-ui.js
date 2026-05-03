"use strict";

function createQuoteOpsDialogUi(deps = {}) {
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
    ? `<div class="admin-alert admin-alert-info">
        <strong>Нужно проверить:</strong> ${escapeHtml(entry.warnings.join(" • "))}
        ${entry.errorMessage ? `<br>${escapeHtml(entry.errorMessage)}` : ""}
      </div>`
    : "";
  const errorBlock = entry.status === "error" && entry.errorMessage
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
            "Статус заявки",
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
            { eyebrow: "Статус", muted: true }
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

function renderQuoteOpsTaskResultDialog(taskRecord, returnTo, dialogIdOverride = "") {
  const dialogId = dialogIdOverride || `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
  const scheduleLabel = buildFormattedScheduleLabel(taskRecord.entry.selectedDate, taskRecord.entry.selectedTime) || "Дата не назначена";
  const requestLabel = taskRecord.requestId || taskRecord.entry.id;
  const managerLabel = taskRecord.manager.name || taskRecord.manager.email || "Без исполнителя";
  const deadlineMs = Date.parse(taskRecord.dueAt || "");
  const overdue = taskRecord.status === "open" && Number.isFinite(deadlineMs) && deadlineMs < Date.now();
  const phoneLabel = taskRecord.entry.customerPhone
    ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone
    : "Телефон не указан";
  const openRequestHref = buildAdminRedirectPath(returnTo || ADMIN_QUOTE_OPS_PATH, {
    entry: taskRecord.entry.id,
  });
  const isManualTask = normalizeString(taskRecord.kind, 64).toLowerCase() === "manual";
  const taskActionCard = isManualTask
    ? renderAdminCard(
        "Закрыть ручной таск",
        "Отметьте задачу выполненной, когда менеджер завершил ручное действие.",
        `<form class="admin-inline-actions" method="post" action="${ADMIN_QUOTE_OPS_PATH}">
          <input type="hidden" name="action" value="complete-lead-task">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(taskRecord.entry.id)}">
          <input type="hidden" name="taskId" value="${escapeHtmlAttribute(taskRecord.id)}">
          <input type="hidden" name="taskAction" value="complete">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <button class="admin-button" type="submit">Отметить выполнено</button>
        </form>`,
        { eyebrow: "Ручной таск", muted: true }
      )
    : renderAdminCard(
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
      );
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
        ${taskActionCard}
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
          : renderAdminBadge("Без исполнителя", "muted")}
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
          <p class="admin-card-eyebrow">Статус</p>
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

  return {
    renderQuoteOpsDetailDialog,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsTaskTableRow,
    renderQuoteOpsDiscussionStageDialog,
  };
}

module.exports = {
  createQuoteOpsDialogUi,
};
