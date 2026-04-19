"use strict";

const {
  ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT,
} = require("./render-shared-picker-multiselect-script");
const {
  ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT,
  ADMIN_SHARED_DIALOG_STATE_SCRIPT,
} = require("./render-shared-dialog-toggle-script");
const {
  ADMIN_SHARED_ORDER_COMPLETION_AND_EDITOR_SCRIPT,
} = require("./render-shared-order-completion-editor-script");
const {
  ADMIN_SHARED_GHL_SMS_SCRIPT,
} = require("./render-shared-ghl-sms-script");
const {
  ADMIN_SHARED_CORE_STYLES,
} = require("./render-shared-core-styles");
const {
  ADMIN_SHARED_DIALOG_PANEL_STYLES,
} = require("./render-shared-dialog-panel-styles");
const {
  ADMIN_SHARED_RESPONSIVE_STYLES,
} = require("./render-shared-responsive-styles");
const {
  ADMIN_SHARED_AUTO_SUBMIT_PHONE_SCRIPT,
} = require("./render-shared-auto-submit-phone-script");
const {
  ADMIN_SHARED_ASYNC_FORMS_SCRIPT,
} = require("./render-shared-async-forms-script");
const {
  ADMIN_SHARED_QUOTE_OPS_STYLES,
} = require("./render-shared-quote-ops-styles");
const {
  ADMIN_SHARED_WORKSPACE_STYLES,
} = require("./render-shared-workspace-styles");
const {
  ADMIN_SHARED_DETAIL_PANELS_STYLES,
} = require("./render-shared-detail-panels-styles");
const {
  ADMIN_SHARED_ORDERS_PAGE_STYLES,
} = require("./render-shared-orders-page-styles");

  function renderAdminLayoutMarkup(title, content, options = {}, escapeHtml) {
    const pageTitle = `${title} | SHYNLI CLEANING`;
    const subtitle = options.subtitle
      ? `<div class="admin-hero-summary"><p class="admin-subtitle">${escapeHtml(options.subtitle)}</p></div>`
      : "";
    const heroMeta = options.heroMeta ? `<div class="admin-hero-meta">${options.heroMeta}</div>` : "";
    const heroActions = options.heroActions ? `<div class="admin-hero-actions">${options.heroActions}</div>` : "";
    const heroSide = subtitle || heroActions ? `<div class="admin-hero-side">${subtitle}${heroActions}</div>` : "";
    const bodyScripts = options.bodyScripts || "";
    const kicker = options.kicker === false ? "" : escapeHtml(options.kicker || "SHYNLI CLEANING");
    const sidebar = options.sidebar ? `<aside class="admin-sidebar">${options.sidebar}</aside>` : "";
    const shellClass = options.sidebar ? "admin-shell admin-shell-with-sidebar" : "admin-shell";

    return `<!DOCTYPE html>
  <html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(pageTitle)}</title>
    <style>
${ADMIN_SHARED_CORE_STYLES}
${ADMIN_SHARED_DIALOG_PANEL_STYLES}
${ADMIN_SHARED_QUOTE_OPS_STYLES}
${ADMIN_SHARED_WORKSPACE_STYLES}
${ADMIN_SHARED_DETAIL_PANELS_STYLES}
      @media (max-width: 900px) {
        .admin-team-calendar-toolbar {
          align-items: flex-start;
        }
        .admin-team-calendar-actions {
          width: 100%;
        }
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
      .admin-client-actions-bar {
        display: grid;
        gap: 10px;
        padding-top: 2px;
      }
      .admin-client-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-client-action-row .admin-link-button {
        min-height: 40px;
        padding: 0 14px;
        box-shadow: none;
      }
      .admin-client-danger-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .admin-client-delete-form {
        margin: 0;
        display: inline-flex;
        align-items: center;
      }
      .admin-subsection-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .admin-subsection-title {
        margin: 0;
        font-size: 15px;
        line-height: 1.3;
      }
      .admin-history-list {
        display: grid;
        gap: 10px;
      }
      .admin-history-item {
        display: grid;
        gap: 10px;
        min-width: 0;
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.84);
      }
      .admin-history-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-client-history-list {
        gap: 10px;
      }
      .admin-client-history-item {
        gap: 8px;
        padding: 14px 16px;
      }
      .admin-client-history-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .admin-client-history-copy-block {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-client-history-side {
        display: grid;
        gap: 6px;
        justify-items: end;
      }
      .admin-client-history-amount {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-client-history-meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-history-meta-chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(248,249,252,0.98);
        border: 1px solid rgba(228, 228, 231, 0.92);
        color: var(--muted-foreground);
        font-size: 12px;
        font-weight: 600;
      }
      .admin-client-history-address {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-client-history-empty {
        min-height: 0;
      }
      .admin-ghl-sms-layout {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
        align-items: start;
      }
      .admin-ghl-sms-compose-column,
      .admin-ghl-sms-history-column {
        display: grid;
        gap: 14px;
        min-width: 0;
      }
      .admin-ghl-sms-history-item {
        gap: 12px;
        padding: 18px;
      }
      .admin-ghl-sms-history-top {
        display: grid;
        gap: 10px;
        min-width: 0;
      }
      .admin-ghl-sms-history-title-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-ghl-sms-history-badges {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
        gap: 8px;
      }
      .admin-ghl-sms-history-list.is-scrollable {
        max-height: 420px;
        overflow-y: auto;
        padding-right: 6px;
      }
      .admin-ghl-sms-history-bubble {
        padding: 14px 16px;
        border-radius: var(--radius-md);
        border: 1px solid rgba(228, 228, 231, 0.92);
        background: rgba(248,249,252,0.82);
      }
      .admin-ghl-sms-history-message {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--foreground);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-history-title,
      .admin-history-copy {
        margin: 0;
      }
      .admin-history-title {
        font-size: 15px;
        line-height: 1.35;
      }
      .admin-history-copy {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-history-meta {
        display: grid;
        gap: 6px;
        color: var(--muted-foreground);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-checklist-list {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-dialog-panel {
        gap: 20px;
      }
      .admin-checklist-template-shell {
        display: grid;
        gap: 18px;
      }
      .admin-checklist-template-hero {
        padding: 18px 20px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,245,247,0.92)),
          radial-gradient(circle at top right, rgba(158, 67, 90, 0.08), transparent 46%);
      }
      .admin-checklist-template-copy {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-preview-list {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-preview-item {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 18px;
        background: rgba(255,255,255,0.84);
      }
      .admin-checklist-preview-index,
      .admin-checklist-edit-index {
        display: inline-grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 14px;
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
      }
      .admin-checklist-preview-copy {
        min-width: 0;
      }
      .admin-checklist-preview-copy strong {
        display: block;
        font-size: 16px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-checklist-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.78);
      }
      .admin-checklist-row input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin-top: 2px;
        accent-color: var(--accent);
        flex: none;
      }
      .admin-checklist-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-checklist-copy strong,
      .admin-checklist-copy span {
        word-break: break-word;
      }
      .admin-checklist-copy span {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-checklist-summary {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-checklist-edit-section {
        gap: 14px;
      }
      .admin-checklist-edit-list {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-edit-row {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }
      .admin-checklist-edit-input {
        min-width: 0;
      }
      .admin-checklist-edit-actions {
        flex-wrap: wrap;
      }
      .admin-entry-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.84);
        padding: 16px;
        display: grid;
        gap: 14px;
      }
      .admin-entry-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-entry-title {
        margin: 0;
        font-size: 16px;
        line-height: 1.3;
      }
      .admin-entry-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-entry-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-entry-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      }
      .admin-mini-stat {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-sm);
        padding: 12px;
        background: rgba(250,250,251,0.88);
      }
      .admin-mini-label {
        display: block;
        margin-bottom: 4px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-mini-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }
        letter-spacing: -0.03em;
      }
${ADMIN_SHARED_ORDERS_PAGE_STYLES}
      }
      .admin-settings-disclosure {
        margin-top: 2px;
      }
      .admin-settings-disclosure summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        list-style: none;
      }
      .admin-settings-disclosure summary::-webkit-details-marker {
        display: none;
      }
      .admin-settings-disclosure-copy {
        display: grid;
        gap: 4px;
      }
      .admin-settings-disclosure-title {
        font-size: 15px;
        font-weight: 700;
      }
      .admin-settings-disclosure-meta {
        font-size: 13px;
        font-weight: 500;
        color: var(--muted);
      }
      .admin-settings-disclosure-toggle {
        font-size: 13px;
        font-weight: 700;
        color: var(--accent);
        white-space: nowrap;
      }
      .admin-settings-disclosure-body {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .admin-logout-form {
        margin: 0;
        width: 100%;
      }
      @media (max-width: 980px) {
        .admin-shell-with-sidebar {
          grid-template-columns: 1fr;
        }
        .admin-sidebar {
          position: static;
        }
        .admin-compact-summary-strip,
        .admin-overview-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-clients-filter-bar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-orders-filter-bar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-clients-layout {
          grid-template-columns: 1fr;
        }
        .admin-clients-toolbar-row,
        .admin-clients-meta-row {
          grid-template-columns: 1fr;
          align-items: stretch;
        }
        .admin-orders-toolbar-shell {
          grid-template-columns: 1fr;
        }
        .admin-orders-toolbar-actions {
          width: 100%;
          justify-content: stretch;
        }
        .admin-clients-search-form {
          width: 100%;
          max-width: none;
          margin-left: 0;
          grid-template-columns: minmax(0, 1fr) auto;
        }
        .admin-orders-toolbar-actions .admin-clients-search-form,
        .admin-orders-toolbar-actions .admin-dialog-launcher-inline,
        .admin-orders-toolbar-actions .admin-dialog-launcher-inline > *:not(dialog) {
          width: 100%;
          max-width: none;
        }
        .admin-clients-search-box {
          max-width: none;
        }
        .admin-orders-hero,
        .admin-orders-layout {
          grid-template-columns: 1fr;
        }
        .admin-orders-side-panel {
          position: static;
        }
        .admin-quote-ops-layout {
          grid-template-columns: 1fr;
        }
        .admin-quote-ops-side {
          position: static;
        }
        .admin-quote-success-table {
          min-width: 980px;
        }
      }
      @media (max-width: 720px) {
        body {
          padding: 10px 0 28px;
        }
        .account-signature-header {
          flex-direction: column;
          align-items: stretch;
        }
        .account-signature-clear {
          width: 100%;
        }
        .admin-sidebar-role-badge {
          margin: -4px 0 4px;
        }
        .admin-hero {
          padding: 18px 18px 14px;
        }
        .admin-hero-head {
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
        }
        .admin-hero-copy,
        .admin-hero-side,
        .admin-hero-actions {
          width: 100%;
        }
        .admin-hero-actions {
          justify-content: stretch;
        }
        .admin-hero-actions .admin-dialog-launcher-inline,
        .admin-hero-actions .admin-dialog-launcher-inline > *:not(dialog) {
          width: 100%;
        }
        .admin-settings-nav-row,
        .admin-settings-nav-actions,
        .admin-settings-nav-actions .admin-dialog-launcher-inline,
        .admin-settings-nav-actions .admin-dialog-launcher-inline > *:not(dialog) {
          width: 100%;
        }
        .admin-content {
          padding: 16px;
        }
        .admin-sidebar-card {
          padding: 16px;
        }
        .admin-card-header,
        .admin-card-content {
          padding-left: 16px;
          padding-right: 16px;
        }
        .admin-inline-actions > * {
          width: 100%;
        }
        .admin-inline-actions > .admin-icon-button,
        .admin-inline-actions > .admin-delete-button {
          width: 38px;
        }
        .admin-inline-actions .admin-action-hint {
          width: 100%;
        }
        .admin-w9-empty-state {
          grid-template-columns: 1fr;
        }
        .admin-w9-empty-actions {
          justify-self: stretch;
        }
        .admin-compact-summary-strip,
        .admin-overview-strip,
        .admin-diagnostics-grid,
        .admin-clients-filter-bar,
        .admin-orders-filter-bar,
        .admin-client-metric-grid,
        .admin-client-info-grid,
        .admin-client-contact-grid,
        .admin-client-detail-grid,
        .admin-order-dialog-layout,
        .admin-order-summary-grid,
        .admin-order-highlight-grid,
        .admin-order-detail-grid,
        .admin-order-brief-layout,
        .admin-order-brief-overview,
        .admin-order-brief-fact-grid,
        .admin-order-control-fields,
        .admin-order-control-grid,
        .admin-order-media-layout,
        .admin-order-completion-grid {
          grid-template-columns: 1fr;
        }
        .admin-clients-search-form,
        .admin-clients-toolbar-left {
          width: 100%;
        }
        .admin-orders-filter-toggle ~ .admin-orders-filter-inline-panel {
          max-height: 0;
        }
        .admin-orders-filter-toggle[open] ~ .admin-orders-filter-inline-panel {
          max-height: 720px;
        }
        .admin-clients-toolbar-disclosure[open] {
          width: 100%;
        }
        .admin-clients-toolbar-button {
          width: 100%;
          justify-content: space-between;
        }
        .admin-filter-disclosure,
        .admin-clients-search-box {
          width: 100%;
        }
        .admin-filter-disclosure-panel {
          position: static;
          width: 100%;
          min-width: 0;
          margin-top: 10px;
        }
        .admin-order-multiselect-panel {
          max-height: min(280px, calc(100vh - 180px));
        }
        .admin-clients-filter-actions,
        .admin-client-action-row,
        .admin-client-danger-row {
          justify-content: stretch;
        }
        .admin-client-danger-row {
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .admin-clients-meta-main {
          width: 100%;
        }
        .admin-clients-meta-hint {
          text-align: left;
          white-space: normal;
        }
        .admin-client-table-cell {
          align-items: flex-start;
        }
        .admin-client-avatar {
          width: 38px;
          height: 38px;
          font-size: 15px;
        }
        .admin-client-history-side {
          justify-items: start;
        }
        .admin-ghl-sms-layout {
          grid-template-columns: 1fr;
        }
        .admin-ghl-sms-history-badges {
          justify-content: flex-start;
        }
        .admin-client-dialog-title-row,
        .admin-client-summary-head {
          align-items: flex-start;
        }
        .admin-dialog-hero {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-dialog-hero-main {
          gap: 12px;
        }
        .admin-dialog-hero .admin-dialog-title {
          font-size: 22px;
        }
        .admin-dialog-hero-actions {
          width: 100%;
          justify-self: stretch;
          justify-content: flex-start;
        }
        .admin-client-dialog-head-actions {
          width: 100%;
        }
        .admin-client-avatar-large {
          width: 48px;
          height: 48px;
          font-size: 18px;
        }
        .admin-clients-filter-actions > *,
        .admin-client-action-row > *,
        .admin-clients-search-form > button,
        .admin-clients-search-form > a {
          width: 100%;
        }
        .admin-input-code {
          font-size: 20px;
        }
        .admin-property-row {
          flex-direction: column;
        }
        .admin-property-value {
          text-align: left;
        }
        .admin-order-quote-grid,
        .admin-order-quote-fields,
        .admin-order-quote-fields-primary,
        .admin-quote-entry-detail-grid,
        .admin-quote-task-dialog-primary-grid,
        .admin-quote-task-dialog-secondary-grid {
          grid-template-columns: 1fr;
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
        .admin-quote-task-dialog-primary-value {
          font-size: 20px;
        }
        .admin-order-brief-metric-value {
          font-size: 18px;
        }
        .admin-order-address-main {
          font-size: 16px;
        }
        .admin-order-section-card {
          padding: 16px;
        }
        .admin-order-action-row > .admin-button,
        .admin-order-action-row > form {
          width: 100%;
        }
        .admin-orders-hero,
        .admin-orders-filters-panel,
        .admin-orders-side-panel,
        .admin-orders-lane,
        .admin-order-card {
          padding: 16px;
        }
        .admin-order-card {
          padding-left: 18px;
        }
        .admin-order-snapshot-grid {
          grid-template-columns: 1fr;
        }
        .admin-orders-lane-meta {
          justify-items: start;
        }
        .admin-quote-ops-filter-head,
        .admin-quote-lane-head,
        .admin-quote-entry-head,
        .admin-quote-entry-footer {
          flex-direction: column;
          align-items: stretch;
        }
        .admin-quote-ops-filter-actions {
          justify-items: start;
        }
        .admin-quote-ops-filter-actions .admin-quote-ops-filter-disclosure {
          width: 100%;
        }
        .admin-quote-ops-filter-inline-row {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-quote-ops-filter-inline-actions {
          justify-content: flex-start;
          flex-wrap: wrap;
        }
        .admin-quote-ops-filter-hint {
          text-align: left;
        }
        .admin-quote-ops-filter-badges,
        .admin-quote-lane-meta,
        .admin-quote-entry-badges {
          width: 100%;
        }
        .admin-quote-lane,
        .admin-quote-entry {
          padding: 16px;
        }
        .admin-quote-entry-side {
          justify-items: start;
        }
        .admin-quote-entry-crm-grid,
        .admin-quote-entry-info-grid {
          grid-template-columns: 1fr;
        }
        .admin-quote-entry-info-wide {
          grid-column: auto;
        }
        .admin-quote-entry-footer > * {
          width: 100%;
        }
        .admin-dialog {
          width: calc(100vw - 20px);
        }
        .admin-dialog-panel {
          padding: 18px;
        }
        .admin-dialog-head > * {
          width: 100%;
        }
      }
${ADMIN_SHARED_RESPONSIVE_STYLES}
    </style>
  </head>
  <body>
    <main class="${shellClass}">
      ${sidebar}
      <section class="admin-panel">
        <div class="admin-hero">
          <div class="admin-hero-head">
            <div class="admin-hero-copy">
              ${kicker ? `<p class="admin-kicker">${kicker}</p>` : ""}
              <h1 class="admin-title">${escapeHtml(title)}</h1>
            </div>
            ${heroSide}
          </div>
          ${heroMeta}
        </div>
        <div class="admin-content">
          ${content}
        </div>
      </section>
    </main>
    <dialog class="admin-dialog admin-confirm-dialog" id="admin-confirm-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-copy">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-copy-block">
          <p class="admin-card-eyebrow">Подтверждение</p>
          <h2 class="admin-dialog-title" id="admin-confirm-title">Точно удалить?</h2>
          <p class="admin-dialog-copy" id="admin-confirm-copy" hidden></p>
        </div>
        <div class="admin-inline-actions admin-confirm-dialog-actions">
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-confirm-dialog">Нет</button>
          <button class="admin-button" type="button" data-admin-confirm-accept="true">Да</button>
        </div>
      </div>
    </dialog>
    <script>
      (() => {
${ADMIN_SHARED_AUTO_SUBMIT_PHONE_SCRIPT}

${ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT}

${ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT}

${ADMIN_SHARED_ORDER_COMPLETION_AND_EDITOR_SCRIPT}

        function escapeAdminHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

${ADMIN_SHARED_GHL_SMS_SCRIPT}

${ADMIN_SHARED_ASYNC_FORMS_SCRIPT}

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            initializeAdminAutoSubmitPhoneRuntime();
            loadAdminGhlSmsHistoryWithin(document);
            startAdminGhlSmsHistoryPollingWithin(document);
          }, { once: true });
        } else {
          initializeAdminAutoSubmitPhoneRuntime();
          loadAdminGhlSmsHistoryWithin(document);
          startAdminGhlSmsHistoryPollingWithin(document);
        }

        document.addEventListener("click", async (event) => {
          const trigger = event.target instanceof Element
            ? event.target.closest("[data-admin-order-completion-submit]")
            : null;
          if (!(trigger instanceof HTMLButtonElement)) return;
          const panel = trigger.closest("[data-admin-order-completion-panel]");
          if (!(panel instanceof HTMLElement)) return;

          event.preventDefault();
          if (panel.getAttribute("data-admin-order-completion-pending") === "true") return;

          panel.setAttribute("data-admin-order-completion-pending", "true");
          setOrderCompletionPending(panel, true);
          setOrderCompletionFeedback(panel, "info", "");

          try {
            const request = buildOrderCompletionRequest(panel);
            if (!request) {
              setOrderCompletionFeedback(panel, "error", "Выберите хотя бы одно фото до или после.");
              return;
            }
            const requestUrl = new URL(request.actionUrl || window.location.href, window.location.href);
            requestUrl.searchParams.set("ajax", "1");
            const response = await window.fetch(requestUrl.toString(), {
              method: "POST",
              headers: request.headers,
              body: request.body,
              credentials: "same-origin",
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (error) {
              void error;
            }

            if (!response.ok || !payload || payload.ok !== true) {
              setOrderCompletionFeedback(
                panel,
                "error",
                payload && payload.message
                  ? payload.message
                  : "Не удалось сохранить фотографии. Попробуйте ещё раз."
              );
              return;
            }

            applyOrderCompletionPayload(panel, payload);
          } catch (error) {
            void error;
            setOrderCompletionFeedback(
              panel,
              "error",
              "Не удалось сохранить фотографии. Проверьте соединение и попробуйте ещё раз."
            );
          } finally {
            panel.setAttribute("data-admin-order-completion-pending", "false");
            setOrderCompletionPending(panel, false);
          }
        });


        document.addEventListener("click", async (event) => {
          const trigger = event.target instanceof Element
            ? event.target.closest("[data-admin-order-cleaner-comment-submit]")
            : null;
          if (!(trigger instanceof HTMLButtonElement)) return;
          const panel = trigger.closest("[data-admin-order-cleaner-comment-panel]");
          if (!(panel instanceof HTMLElement)) return;

          event.preventDefault();
          if (panel.getAttribute("data-admin-order-cleaner-comment-pending") === "true") return;

          panel.setAttribute("data-admin-order-cleaner-comment-pending", "true");
          setOrderCleanerCommentPending(panel, true);
          setOrderCleanerCommentFeedback(panel, "info", "");

          try {
            const request = buildOrderCleanerCommentRequest(panel);
            const requestUrl = new URL(request.actionUrl || window.location.href, window.location.href);
            requestUrl.searchParams.set("ajax", "1");
            const response = await window.fetch(requestUrl.toString(), {
              method: "POST",
              headers: request.headers,
              body: request.body,
              credentials: "same-origin",
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (error) {
              void error;
            }

            if (!response.ok || !payload || payload.ok !== true) {
              setOrderCleanerCommentFeedback(
                panel,
                "error",
                payload && payload.message
                  ? payload.message
                  : "Не удалось сохранить комментарий клинера. Попробуйте ещё раз."
              );
              return;
            }

            applyOrderCleanerCommentPayload(panel, payload);
          } catch (error) {
            void error;
            setOrderCleanerCommentFeedback(
              panel,
              "error",
              "Не удалось сохранить комментарий клинера. Проверьте соединение и попробуйте ещё раз."
            );
          } finally {
            panel.setAttribute("data-admin-order-cleaner-comment-pending", "false");
            setOrderCleanerCommentPending(panel, false);
          }
        });

        document.addEventListener("click", (event) => {
          const orderAmountOpenTrigger = event.target.closest("[data-admin-order-amount-open]");
          if (orderAmountOpenTrigger) {
            event.preventDefault();
            resetOrderPaymentEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderAmountOpenTrigger.getAttribute("data-admin-order-amount-open");
            const panel = panelId ? document.querySelector('[data-admin-order-amount-editor="' + panelId + '"]') : null;
            setOrderAmountEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
              if (typeof firstField.select === "function") {
                firstField.select();
              }
            }
            return;
          }

          const orderAmountCancelTrigger = event.target.closest("[data-admin-order-amount-cancel]");
          if (orderAmountCancelTrigger) {
            event.preventDefault();
            closeOrderAmountEditor(orderAmountCancelTrigger.getAttribute("data-admin-order-amount-cancel"), { reset: true });
            return;
          }

          const orderPaymentOpenTrigger = event.target.closest("[data-admin-order-payment-open]");
          if (orderPaymentOpenTrigger) {
            event.preventDefault();
            resetOrderAmountEditors(document, { reset: true });
            resetOrderPaymentEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderPaymentOpenTrigger.getAttribute("data-admin-order-payment-open");
            const panel = panelId ? document.querySelector('[data-admin-order-payment-editor="' + panelId + '"]') : null;
            setOrderPaymentEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("select, input, textarea") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const orderPaymentCancelTrigger = event.target.closest("[data-admin-order-payment-cancel]");
          if (orderPaymentCancelTrigger) {
            event.preventDefault();
            closeOrderPaymentEditor(orderPaymentCancelTrigger.getAttribute("data-admin-order-payment-cancel"), { reset: true });
            return;
          }

          const orderTeamOpenTrigger = event.target.closest("[data-admin-order-team-open]");
          if (orderTeamOpenTrigger) {
            event.preventDefault();
            resetOrderAmountEditors(document, { reset: true });
            resetOrderPaymentEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderTeamOpenTrigger.getAttribute("data-admin-order-team-open");
            const panel = panelId ? document.querySelector('[data-admin-order-team-editor="' + panelId + '"]') : null;
            setOrderTeamEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("summary, input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const orderTeamCancelTrigger = event.target.closest("[data-admin-order-team-cancel]");
          if (orderTeamCancelTrigger) {
            event.preventDefault();
            closeOrderTeamEditor(orderTeamCancelTrigger.getAttribute("data-admin-order-team-cancel"), { reset: true });
            return;
          }

          const activeOrderMultiselect = event.target.closest("[data-admin-order-multiselect]");
          if (!activeOrderMultiselect) {
            closeOrderMultiselects(null);
          }

          const activeTimeField = event.target.closest("[data-admin-picker-field='time']");
          if (!activeTimeField) {
            closeAllTimePickerPanels();
          }

          const pickerTrigger = event.target.closest("[data-admin-picker-trigger]");
          if (pickerTrigger) {
            event.preventDefault();
            openPickerField(pickerTrigger.closest("[data-admin-picker-field]"));
            return;
          }

          const addAddressTrigger = event.target.closest("[data-admin-client-address-add]");
          if (addAddressTrigger) {
            const editor = addAddressTrigger.closest("[data-admin-client-address-editor]");
            const list = editor ? editor.querySelector("[data-admin-client-address-list]") : null;
            const templateId = addAddressTrigger.getAttribute("data-admin-client-address-template");
            const template = templateId ? document.getElementById(templateId) : null;
            if (!editor || !list || !(template instanceof HTMLTemplateElement)) return;

            const nextIndex = Number(editor.getAttribute("data-admin-client-address-next-index") || "0");
            const markup = template.innerHTML.replace(/__INDEX__/g, String(Number.isFinite(nextIndex) ? nextIndex : 0));
            list.insertAdjacentHTML("beforeend", markup);
            editor.setAttribute("data-admin-client-address-next-index", String((Number.isFinite(nextIndex) ? nextIndex : 0) + 1));

            const newRow = list.lastElementChild;
            if (newRow && typeof window.__adminBindAddressAutocomplete === "function") {
              window.__adminBindAddressAutocomplete(newRow);
            }
            const firstField = newRow ? newRow.querySelector("input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const removeAddressTrigger = event.target.closest("[data-admin-client-address-remove]");
          if (removeAddressTrigger) {
            event.preventDefault();
            const row = removeAddressTrigger.closest("[data-admin-client-address-row]");
            if (!row) return;

            const list = row.parentElement;
            const nextFocusable =
              row.nextElementSibling?.querySelector("input, textarea, select, button") ||
              row.previousElementSibling?.querySelector("input, textarea, select, button") ||
              list?.parentElement?.querySelector("[data-admin-client-address-add]");

            row.remove();

            if (nextFocusable && typeof nextFocusable.focus === "function") {
              nextFocusable.focus();
            }
            return;
          }

          const rowTrigger = event.target.closest("[data-admin-row-href]");
          if (rowTrigger) {
            const interactiveTrigger = event.target.closest("a, button, input, select, textarea, summary, label");
            if (!interactiveTrigger) {
              const href = rowTrigger.getAttribute("data-admin-row-href");
              if (href) {
                window.location.assign(href);
              }
              return;
            }
          }

        });

        document.addEventListener("input", (event) => {
          const nativeInput = event.target.closest("[data-admin-picker-native]");
          if (nativeInput) {
            syncPickerDisplayFromNative(nativeInput.closest("[data-admin-picker-field]"));
          }
        });

        document.addEventListener("change", (event) => {
          const nativeInput = event.target.closest("[data-admin-picker-native]");
          if (nativeInput) {
            syncPickerDisplayFromNative(nativeInput.closest("[data-admin-picker-field]"));
            return;
          }
          const displayInput = event.target.closest("[data-admin-picker-display]");
          if (displayInput) {
            const field = displayInput.closest("[data-admin-picker-field]");
            syncPickerNativeFromDisplay(field);
            if (field && field.getAttribute("data-admin-picker-field") === "time") {
              syncTimePanelFromField(field);
            }
          }
        });

        document.addEventListener("blur", (event) => {
          const displayInput = event.target.closest("[data-admin-picker-display]");
          if (displayInput) {
            const field = displayInput.closest("[data-admin-picker-field]");
            syncPickerNativeFromDisplay(field);
            if (field && field.getAttribute("data-admin-picker-field") === "time") {
              syncTimePanelFromField(field);
            }
          }
        }, true);

        document.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement) {
            const rowTrigger = event.target.closest("[data-admin-row-href]");
            if (rowTrigger && event.target === rowTrigger) {
              event.preventDefault();
              const href = rowTrigger.getAttribute("data-admin-row-href");
              if (href) {
                window.location.assign(href);
              }
              return;
            }
          }
          if (event.key === "Escape") {
            const openTimeField = document.querySelector("[data-admin-picker-field='time'][data-admin-time-open='true']");
            if (openTimeField) {
              event.preventDefault();
              closeTimePickerPanel(openTimeField);
              return;
            }
            const openOrderMultiselect = document.querySelector("[data-admin-order-multiselect][open]");
            if (openOrderMultiselect) {
              event.preventDefault();
              closeOrderMultiselect(openOrderMultiselect);
              return;
            }
            const openOrderAmountEditor = document.querySelector("[data-admin-order-amount-editor]:not([hidden])");
            if (openOrderAmountEditor) {
              event.preventDefault();
              closeOrderAmountEditor(openOrderAmountEditor.getAttribute("data-admin-order-amount-editor"), { reset: true });
              return;
            }
            const openOrderPaymentEditor = document.querySelector("[data-admin-order-payment-editor]:not([hidden])");
            if (openOrderPaymentEditor) {
              event.preventDefault();
              closeOrderPaymentEditor(openOrderPaymentEditor.getAttribute("data-admin-order-payment-editor"), { reset: true });
              return;
            }
            const openOrderTeamEditor = document.querySelector("[data-admin-order-team-editor]:not([hidden])");
            if (openOrderTeamEditor) {
              event.preventDefault();
              closeOrderTeamEditor(openOrderTeamEditor.getAttribute("data-admin-order-team-editor"), { reset: true });
              return;
            }
          }
        });

        document.querySelectorAll("[data-admin-order-multiselect]").forEach((details) => {
          syncOrderMultiselectValue(details);
          setOrderMultiselectExpandedState(details);
          details.addEventListener("toggle", () => {
            if (details.hasAttribute("open")) {
              closeOrderMultiselects(details);
            }
            setOrderMultiselectExpandedState(details);
          });
        });

        syncOrderAmountEditors(document);
        syncOrderPaymentEditors(document);
        syncOrderTeamEditors(document);

${ADMIN_SHARED_DIALOG_STATE_SCRIPT}
      })();
    </script>
    ${bodyScripts}
  </body>
  </html>`;
  }


module.exports = {
  renderAdminLayoutMarkup,
};
