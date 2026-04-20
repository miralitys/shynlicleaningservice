"use strict";

function createQuoteOpsFunnelUi(deps = {}) {
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

  return {
    renderQuoteOpsFunnelCard,
    renderQuoteOpsFunnelLane,
  };
}

module.exports = {
  createQuoteOpsFunnelUi,
};
