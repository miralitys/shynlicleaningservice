"use strict";

function createQuoteOpsStyleUi(deps = {}) {
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
    .admin-quote-section-nav-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }
    .admin-quote-section-nav-row .admin-subnav-strip {
      margin-bottom: 0;
    }
    .admin-quote-create-task-trigger {
      border-color: rgba(158, 67, 90, 0.34);
      background: linear-gradient(135deg, #9e435a, #b2526d);
      color: #fff;
      box-shadow: 0 16px 40px rgba(158, 67, 90, 0.18);
      white-space: nowrap;
    }
    .admin-quote-create-task-trigger:hover {
      border-color: rgba(158, 67, 90, 0.48);
      background: linear-gradient(135deg, #8f394f, #b2526d);
      color: #fff;
    }
    .admin-quote-manual-task-dialog {
      width: min(680px, calc(100vw - 32px));
      max-width: 680px;
    }
    .admin-quote-manual-task-dialog .admin-dialog-panel {
      max-width: none;
    }
    .admin-quote-manual-task-form {
      align-items: end;
      grid-template-columns: minmax(0, 1fr);
      margin-top: 18px;
    }
    .admin-quote-manual-task-form .admin-form-grid-span-2 {
      grid-column: auto;
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
      .admin-quote-section-nav-row {
        align-items: stretch;
        flex-direction: column;
      }
      .admin-quote-create-task-trigger {
        justify-content: center;
        width: 100%;
      }
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

  return {
    renderQuoteOpsWorkspaceStyle,
  };
}

module.exports = {
  createQuoteOpsStyleUi,
};
