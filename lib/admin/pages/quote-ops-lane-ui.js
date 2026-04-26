"use strict";

function createQuoteOpsLaneUi(deps = {}) {
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
        ${entry.errorMessage ? `<span>${escapeHtml(entry.errorMessage)}</span>` : ""}
      </div>`
    : "";
  const errorBlock = entry.status === "error" && entry.errorMessage
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
    renderQuoteOpsEntryCard,
    renderQuoteOpsSuccessTable,
    renderQuoteOpsLane,
  };
}

module.exports = {
  createQuoteOpsLaneUi,
};
