"use strict";

function createQuoteOpsDiagnosticsUi(deps = {}) {
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

  return {
    renderQuoteOpsDiagnostics,
  };
}

module.exports = {
  createQuoteOpsDiagnosticsUi,
};
