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
      .admin-quote-ops-page,
      .admin-quote-ops-main,
      .admin-quote-ops-side,
      .admin-quote-lanes {
        display: grid;
        gap: 18px;
        min-width: 0;
      }
      .admin-quote-ops-overview {
        grid-template-columns: 1fr;
      }
      .admin-quote-ops-layout {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1fr) 320px;
        align-items: start;
      }
      .admin-quote-ops-side {
        position: sticky;
        top: var(--page-top-offset);
      }
      .admin-quote-ops-filter-head,
      .admin-quote-lane-head,
      .admin-quote-entry-head,
      .admin-quote-entry-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px 18px;
        flex-wrap: wrap;
      }
      .admin-quote-ops-panel-kicker,
      .admin-quote-lane-kicker {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-quote-ops-panel-kicker,
      .admin-quote-lane-warning .admin-quote-lane-kicker {
        color: var(--accent);
      }
      .admin-quote-lane-success .admin-quote-lane-kicker {
        color: var(--success);
      }
      .admin-quote-lane-error .admin-quote-lane-kicker {
        color: var(--danger);
      }
      .admin-quote-ops-panel-title,
      .admin-quote-lane-title {
        margin: 6px 0 0;
        font-size: clamp(22px, 3vw, 28px);
        line-height: 1.1;
        letter-spacing: -0.03em;
      }
      .admin-quote-ops-panel-copy,
      .admin-quote-lane-copy {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-quote-ops-filter-meta {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border: 1px solid rgba(228, 228, 231, 0.9);
        border-radius: 18px;
        background: rgba(250,250,251,0.78);
      }
      .admin-quote-ops-filter-meta-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px 18px;
        flex-wrap: wrap;
      }
      .admin-quote-ops-filter-actions {
        display: grid;
        gap: 10px;
        justify-items: end;
        align-content: start;
      }
      .admin-quote-ops-filter-disclosure {
        width: 100%;
      }
      .admin-quote-ops-filter-disclosure[open] {
        width: 100%;
      }
      .admin-quote-ops-filter-actions .admin-quote-ops-filter-disclosure {
        width: auto;
      }
      .admin-quote-ops-filter-panel {
        display: grid;
        gap: 14px;
      }
      .admin-quote-ops-filter-form {
        display: grid;
        gap: 14px;
      }
      .admin-quote-ops-filter-inline-row {
        display: grid;
        gap: 14px 18px;
        grid-template-columns: minmax(280px, 1.2fr) repeat(2, minmax(180px, 220px)) auto;
        align-items: end;
      }
      .admin-quote-ops-filter-search {
        min-width: 0;
      }
      .admin-quote-ops-filter-inline-actions {
        justify-content: flex-end;
        flex-wrap: nowrap;
      }
      .admin-quote-ops-filter-hint {
        margin: 0;
      }
      .admin-quote-ops-filter-badges,
      .admin-quote-lane-meta,
      .admin-quote-entry-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .admin-quote-lane {
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,247,0.90));
        box-shadow: var(--shadow-sm);
        min-width: 0;
        max-width: 100%;
      }
      .admin-quote-lane-success {
        border-color: rgba(15, 118, 110, 0.16);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(240,249,248,0.92));
      }
      .admin-quote-lane-warning {
        border-color: rgba(158, 67, 90, 0.18);
      }
      .admin-quote-lane-error {
        border-color: rgba(185, 28, 28, 0.18);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(254,242,242,0.92));
      }
      .admin-quote-lane-list {
        display: grid;
        gap: 14px;
      }
      .admin-quote-table-wrap {
        width: 100%;
        max-width: 100%;
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
        touch-action: pan-x;
        overscroll-behavior-x: contain;
      }
      .admin-quote-success-table {
        min-width: 1380px;
      }
      .admin-quote-success-table th:nth-child(1),
      .admin-quote-success-table td:nth-child(1) {
        min-width: 320px;
      }
      .admin-quote-success-table th:nth-child(2),
      .admin-quote-success-table td:nth-child(2) {
        min-width: 380px;
      }
      .admin-quote-success-table th:nth-child(3),
      .admin-quote-success-table td:nth-child(3) {
        min-width: 320px;
      }
      .admin-quote-success-table th:nth-child(4),
      .admin-quote-success-table td:nth-child(4) {
        min-width: 240px;
      }
      .admin-quote-success-table th:nth-child(5),
      .admin-quote-success-table td:nth-child(5) {
        min-width: 140px;
      }
      .admin-quote-entry {
        position: relative;
        display: grid;
        gap: 16px;
        padding: 18px;
        border: 1px solid rgba(228, 228, 231, 0.94);
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.92));
        overflow: hidden;
      }
      .admin-quote-entry::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--accent);
      }
      .admin-quote-entry-success {
        border-color: rgba(15, 118, 110, 0.18);
      }
      .admin-quote-entry-success::before {
        background: var(--success);
      }
      .admin-quote-entry-error {
        border-color: rgba(185, 28, 28, 0.18);
      }
      .admin-quote-entry-error::before {
        background: var(--danger);
      }
      .admin-quote-entry-main {
        display: grid;
        gap: 8px;
        min-width: 0;
        flex: 1 1 340px;
      }
      .admin-quote-entry-topline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
      }
      .admin-quote-entry-separator {
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: rgba(113, 113, 122, 0.45);
      }
      .admin-quote-entry-title {
        margin: 0;
        font-size: clamp(22px, 3vw, 28px);
        line-height: 1.08;
        letter-spacing: -0.04em;
        word-break: break-word;
      }
      .admin-quote-entry-title-button {
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .admin-quote-entry-title-button:hover,
      .admin-quote-entry-title-button:focus-visible {
        color: var(--accent);
      }
      .admin-quote-entry-copy {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-quote-entry-side {
        display: grid;
        gap: 10px;
        justify-items: end;
        min-width: 0;
      }
      .admin-quote-entry-amount {
        font-size: clamp(24px, 3vw, 30px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
      }
      .admin-quote-entry-crm-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .admin-quote-entry-crm-item,
      .admin-quote-entry-info {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
      }
      .admin-quote-entry-crm-item {
        padding: 12px 14px;
        background: rgba(248,249,252,0.9);
        display: grid;
        gap: 6px;
      }
      .admin-quote-entry-crm-label,
      .admin-quote-entry-info-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-quote-entry-crm-value,
      .admin-quote-entry-info-value {
        margin: 0;
        word-break: break-word;
      }
      .admin-quote-entry-crm-value {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
      }
      .admin-quote-entry-info-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-quote-entry-info {
        padding: 14px;
        background: rgba(255,255,255,0.9);
        display: grid;
        gap: 8px;
      }
      .admin-quote-entry-info-wide {
        grid-column: 1 / -1;
      }
      .admin-quote-entry-info-value {
        display: grid;
        gap: 4px;
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-quote-entry-info-value span {
        display: block;
      }
      .admin-quote-entry-feedback {
        display: grid;
        gap: 6px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid transparent;
      }
      .admin-quote-entry-feedback strong {
        font-size: 13px;
        line-height: 1.35;
      }
      .admin-quote-entry-feedback span {
        color: var(--muted-foreground);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-quote-entry-feedback-warning {
        background: rgba(158, 67, 90, 0.08);
        border-color: rgba(158, 67, 90, 0.16);
      }
      .admin-quote-entry-feedback-warning strong {
        color: var(--accent);
      }
      .admin-quote-entry-feedback-error {
        background: var(--danger-soft);
        border-color: rgba(185, 28, 28, 0.16);
      }
      .admin-quote-entry-feedback-error strong {
        color: var(--danger);
      }
      .admin-quote-entry-footer .admin-action-hint {
        flex: 1 1 320px;
      }
      .admin-clients-layout {
        display: grid;
        gap: 20px;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
      }
      .admin-overview-strip {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .admin-compact-summary-strip {
        display: grid;
        gap: 1px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding: 1px;
        border-radius: 20px;
        background: rgba(228, 228, 231, 0.92);
        box-shadow: var(--shadow-sm);
        overflow: hidden;
      }
      .admin-compact-summary-item {
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 14px 16px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.90));
      }
      .admin-compact-summary-item-accent {
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.96));
      }
      .admin-compact-summary-item-success {
        background: linear-gradient(180deg, rgba(15, 118, 110, 0.10), rgba(255,255,255,0.96));
      }
      .admin-compact-summary-item-danger {
        background: linear-gradient(180deg, rgba(185, 28, 28, 0.08), rgba(255,255,255,0.96));
      }
      .admin-compact-summary-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .admin-compact-summary-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-compact-summary-value {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
        white-space: nowrap;
      }
      .admin-compact-summary-copy {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-overview-tile {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.88));
        padding: 14px 16px;
        display: grid;
        gap: 6px;
      }
      .admin-overview-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-overview-value {
        margin: 0;
        font-size: 26px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
      }
      .admin-overview-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-diagnostics-strip {
        display: grid;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(250,250,251,0.9), rgba(255,255,255,0.98));
      }
      .admin-diagnostics-head {
        display: grid;
        gap: 8px;
      }
      .admin-diagnostics-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-diagnostics-card {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.84);
        padding: 12px 14px;
      }
      .admin-diagnostics-label {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-diagnostics-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }
      .admin-clients-card .admin-card-header {
        padding: 16px 18px 0;
        gap: 4px;
      }
      .admin-clients-card .admin-card-content {
        padding: 14px 18px 18px;
        gap: 12px;
      }
      .admin-clients-card .admin-card-title {
        font-size: 20px;
      }
      .admin-clients-card .admin-card-description {
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-orders-card .admin-card-header {
        padding: 16px 20px 0;
        gap: 4px;
      }
      .admin-orders-card .admin-card-content {
        padding-top: 14px;
      }
      .admin-orders-card .admin-card-title {
        font-size: 20px;
      }
      .admin-orders-card .admin-card-description {
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-clients-workspace {
        display: grid;
        gap: 12px;
      }
      .admin-orders-workspace {
        display: grid;
        gap: 14px;
      }
      .admin-orders-toolbar-shell {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 12px 16px;
      }
      .admin-orders-toolbar-actions {
        display: grid;
        grid-template-columns: minmax(320px, 1fr) auto;
        align-items: center;
        justify-content: end;
        gap: 12px;
        min-width: 0;
      }
      .admin-orders-toolbar-actions .admin-clients-search-form {
        width: 100%;
        max-width: none;
        margin-left: 0;
      }
      .admin-orders-toolbar-actions .admin-dialog-launcher-inline,
      .admin-orders-toolbar-actions .admin-dialog-launcher-inline > *:not(dialog) {
        width: auto;
      }
      .admin-clients-toolbar-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 460px);
        align-items: start;
        gap: 12px 16px;
      }
      .admin-clients-toolbar-left {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        min-width: 0;
        position: relative;
        z-index: 12;
      }
      .admin-filter-disclosure {
        min-width: 0;
        position: relative;
      }
      .admin-filter-disclosure > summary {
        list-style: none;
      }
      .admin-filter-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .admin-filter-disclosure[open] {
        z-index: 18;
      }
      .admin-clients-toolbar-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid rgba(212, 212, 216, 0.92);
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        box-shadow: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        color: var(--foreground);
        transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
      }
      .admin-clients-toolbar-button:hover {
        border-color: rgba(158, 67, 90, 0.28);
        background: #fff;
        transform: translateY(-1px);
      }
      .admin-filter-disclosure[open] > .admin-clients-toolbar-button {
        border-color: rgba(158, 67, 90, 0.32);
        background: rgba(158, 67, 90, 0.08);
        color: var(--accent);
      }
      .admin-clients-toolbar-button-secondary {
        background: rgba(250,250,251,0.96);
      }
      .admin-clients-toolbar-count {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
      }
      .admin-filter-disclosure-panel {
        position: absolute;
        top: calc(100% + 10px);
        left: 0;
        width: min(760px, calc(100vw - 140px));
        min-width: 580px;
        margin-top: 0;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 18px;
        background: rgba(255,255,255,0.98);
        box-shadow: 0 22px 48px rgba(24, 24, 27, 0.12);
      }
      .admin-orders-filter-toggle {
        min-width: 0;
      }
      .admin-orders-filter-toggle[open] {
        z-index: auto;
      }
      .admin-orders-filter-inline-panel {
        grid-column: 1 / -1;
        position: static;
        width: 100%;
        min-width: 0;
        margin-top: 0;
        padding: 0 18px;
        border: 1px solid transparent;
        border-radius: 18px;
        background: rgba(255,255,255,0.98);
        box-shadow: none;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transform: translateY(-8px);
        transition:
          max-height 0.24s ease,
          opacity 0.18s ease,
          transform 0.24s ease,
          padding 0.24s ease,
          border-color 0.24s ease,
          box-shadow 0.24s ease;
      }
      .admin-orders-filter-toggle[open] ~ .admin-orders-filter-inline-panel {
        padding: 16px 18px;
        border-color: rgba(228, 228, 231, 0.92);
        box-shadow: var(--shadow-sm);
        max-height: 320px;
        overflow: visible;
        opacity: 1;
        transform: translateY(0);
      }
      .admin-clients-toolbar-disclosure[open] {
        width: auto;
      }
      .admin-clients-filter-bar {
        display: grid;
        gap: 10px 12px;
        grid-template-columns: repeat(3, minmax(160px, 1fr)) auto;
        align-items: end;
      }
      .admin-orders-filter-bar {
        display: grid;
        gap: 12px 14px;
        grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
        align-items: end;
      }
      .admin-clients-filter-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-start;
        align-items: center;
        align-self: end;
      }
      .admin-clients-filter-actions .admin-button,
      .admin-clients-filter-actions .admin-link-button {
        min-height: 40px;
        padding: 0 14px;
        box-shadow: none;
      }
      .admin-clients-search-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 460px;
        margin-left: auto;
      }
      .admin-clients-search-box {
        position: relative;
        min-width: 0;
        max-width: none;
      }
      .admin-clients-search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--muted);
        font-size: 16px;
        line-height: 1;
        pointer-events: none;
      }
      .admin-clients-search-input {
        height: 42px;
        padding-left: 40px;
        border-radius: 14px;
        background: rgba(255,255,255,0.98);
      }
      .admin-clients-search-submit {
        min-height: 42px;
        padding: 0 16px;
        box-shadow: none;
      }
      .admin-clients-toolbar-link {
        color: var(--muted-foreground);
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
      }
      .admin-clients-toolbar-link:hover {
        color: var(--accent);
        text-decoration: underline;
      }
      .admin-badge-row-inline {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-clients-meta-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px 14px;
      }
      .admin-clients-meta-main {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .admin-clients-active-badges {
        gap: 6px;
      }
      .admin-clients-summary-copy {
        margin: 0;
        max-width: none;
        color: var(--muted-foreground);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-clients-meta-hint {
        text-align: right;
        white-space: nowrap;
      }
      .admin-clients-diagnostics-disclosure .admin-filter-disclosure-panel {
        width: min(560px, calc(100vw - 140px));
        min-width: 420px;
        background: rgba(250,250,251,0.98);
      }
      }
      .admin-inline-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-clients-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-orders-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-staff-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-settings-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-table {
        width: max-content;
        min-width: 100%;
        border-collapse: collapse;
        table-layout: auto;
      }
      .admin-clients-table {
        min-width: 1160px;
      }
      .admin-orders-table {
        min-width: 1240px;
      }
      .admin-staff-table {
        min-width: 1320px;
      }
      .admin-settings-users-table {
        min-width: 1120px;
      }
      .admin-settings-checklists-table {
        min-width: 980px;
      }
      .admin-staff-schedule-table {
        min-width: 1120px;
      }
      .admin-table th,
      .admin-table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(228, 228, 231, 0.92);
        vertical-align: top;
        text-align: left;
        min-width: 0;
      }
      .admin-table:not(.admin-team-calendar-table) th,
      .admin-table:not(.admin-team-calendar-table) td {
        white-space: nowrap;
      }
      .admin-table th {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        background: rgba(250,250,251,0.98);
        white-space: nowrap;
      }
      .admin-settings-users-table th,
      .admin-settings-users-table td,
      .admin-settings-checklists-table th,
      .admin-settings-checklists-table td {
        white-space: normal;
      }
      .admin-clients-table th,
      .admin-clients-table td {
        padding: 14px 16px;
      }
      .admin-orders-table th,
      .admin-orders-table td {
        padding: 14px 16px;
      }
      .admin-staff-table th,
      .admin-staff-table td {
        padding: 14px 16px;
      }
      .admin-staff-table th:nth-child(1),
      .admin-staff-table td:nth-child(1) {
        width: 320px;
        min-width: 320px;
      }
      .admin-staff-table th:nth-child(2),
      .admin-staff-table td:nth-child(2) {
        width: 300px;
        min-width: 300px;
      }
      .admin-staff-table th:nth-child(3),
      .admin-staff-table td:nth-child(3) {
        width: 180px;
        min-width: 180px;
      }
      .admin-staff-table th:nth-child(4),
      .admin-staff-table td:nth-child(4) {
        width: 220px;
        min-width: 220px;
      }
      .admin-staff-table th:nth-child(5),
      .admin-staff-table td:nth-child(5) {
        width: 300px;
        min-width: 300px;
      }
      .admin-staff-schedule-table th,
      .admin-staff-schedule-table td {
        padding: 14px 16px;
      }
      .admin-clients-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-orders-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-staff-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-staff-schedule-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-team-calendar-shell {
        display: grid;
        gap: 14px;
      }
      .admin-team-calendar-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
      }
      .admin-team-calendar-copy {
        display: grid;
        gap: 4px;
      }
      .admin-team-calendar-range {
        font-size: 15px;
        line-height: 1.3;
      }
      .admin-team-calendar-meta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-team-calendar-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-team-calendar-wrap {
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 4px;
        cursor: grab;
        touch-action: pan-x;
        overscroll-behavior-x: contain;
      }
      .admin-team-calendar-wrap.admin-team-calendar-wrap-dragging,
      .admin-team-calendar-wrap.admin-team-calendar-wrap-dragging * {
        cursor: grabbing !important;
        user-select: none;
      }
      .admin-team-calendar-table {
        width: max(100%, calc(220px + (var(--admin-team-calendar-days, 7) * 200px)));
        min-width: max-content;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
      }
      .admin-team-calendar-table th,
      .admin-team-calendar-table td {
        padding: 10px 12px;
        vertical-align: top;
      }
      .admin-team-calendar-table th:not(.admin-team-calendar-staff-col),
      .admin-team-calendar-table td:not(.admin-team-calendar-staff-col) {
        width: 200px;
        min-width: 200px;
        border-left: 2px solid rgba(203, 213, 225, 0.72);
        position: relative;
        z-index: 1;
      }
      .admin-team-calendar-table th:last-child,
      .admin-team-calendar-table td:last-child {
        border-right: 2px solid rgba(203, 213, 225, 0.72);
      }
      .admin-team-calendar-staff-col {
        position: sticky;
        left: 0;
        z-index: 8;
        width: 220px;
        min-width: 220px;
        background: #ffffff !important;
        isolation: isolate;
      }
      .admin-team-calendar-staff-col::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        background: #ffffff;
        box-shadow:
          inset -1px 0 0 rgba(203, 213, 225, 0.9),
          14px 0 0 #ffffff,
          18px 0 22px rgba(15, 23, 42, 0.08);
        pointer-events: none;
      }
      .admin-team-calendar-table thead .admin-team-calendar-staff-col {
        z-index: 9;
        background: #f8f9fc !important;
      }
      .admin-team-calendar-table thead .admin-team-calendar-staff-col::before {
        background: #f8f9fc;
        box-shadow:
          inset -1px 0 0 rgba(203, 213, 225, 0.9),
          14px 0 0 #f8f9fc,
          18px 0 22px rgba(15, 23, 42, 0.08);
      }
      .admin-team-calendar-day-head {
        display: grid;
        gap: 1px;
      }
      .admin-team-calendar-day-weekday {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #4d5a72;
      }
      .admin-team-calendar-day-date {
        font-size: 12px;
        font-weight: 600;
        color: #1f2937;
      }
      .admin-team-calendar-cell {
        display: grid;
        gap: 6px;
        min-height: 40px;
        min-width: 0;
        overflow: hidden;
      }
      .admin-team-calendar-empty {
        min-height: 40px;
        display: grid;
        place-items: center;
        color: var(--muted);
        font-size: 12px;
      }
      .admin-team-calendar-staff-col .admin-table-stack {
        gap: 3px;
      }
      .admin-team-calendar-staff-col .admin-inline-badge-row {
        gap: 6px;
      }
      .admin-team-calendar-staff-col .admin-badge {
        min-height: 24px;
        padding: 0 8px;
        font-size: 11px;
      }
      .admin-team-calendar-entry {
        display: grid;
        gap: 3px;
        width: 100%;
        min-width: 0;
        padding: 8px 9px;
        border-radius: 12px;
        border: 1px solid rgba(24, 24, 27, 0.08);
        background: rgba(255,255,255,0.94);
        overflow: hidden;
      }
      .admin-team-calendar-entry-button {
        appearance: none;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .admin-team-calendar-entry-button:hover {
        border-color: rgba(158, 67, 90, 0.24);
        box-shadow: 0 6px 20px rgba(158, 67, 90, 0.08);
      }
      .admin-team-calendar-entry-button:focus-visible {
        outline: 2px solid rgba(158, 67, 90, 0.32);
        outline-offset: 2px;
      }
      .admin-team-calendar-entry-order {
        background: rgba(158, 67, 90, 0.06);
        border-color: rgba(158, 67, 90, 0.16);
      }
      .admin-team-calendar-entry-order-confirmed {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-team-calendar-entry-order-completed {
        background: rgba(14, 116, 144, 0.08);
        border-color: rgba(14, 116, 144, 0.16);
      }
      .admin-team-calendar-entry-order-issue {
        background: rgba(185, 28, 28, 0.08);
        border-color: rgba(185, 28, 28, 0.18);
      }
      .admin-team-calendar-entry-unavailable {
        background: rgba(75, 85, 99, 0.08);
        border-color: rgba(75, 85, 99, 0.14);
      }
      .admin-team-calendar-entry-head {
        display: grid;
        grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
        align-items: start;
        gap: 6px;
      }
      .admin-team-calendar-entry-time,
      .admin-team-calendar-entry-status {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: uppercase;
        line-height: 1.15;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-team-calendar-entry-time {
        color: #334155;
      }
      .admin-team-calendar-entry-status {
        color: rgba(31, 41, 55, 0.68);
        justify-self: end;
        text-align: right;
      }
      .admin-team-calendar-entry-title {
        font-size: 12px;
        line-height: 1.25;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .admin-team-calendar-entry-copy {
        color: var(--muted);
        font-size: 11px;
        line-height: 1.3;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      }
      .admin-client-table-cell {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .admin-table .admin-client-avatar {
        width: 38px;
        height: 38px;
        font-size: 15px;
      }
      .admin-staff-table .admin-client-table-cell {
        min-width: 260px;
      }
      .admin-client-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 1px solid rgba(228, 228, 231, 0.96);
        display: grid;
        place-items: center;
        flex: none;
        font-size: 16px;
        font-weight: 700;
        color: #30405f;
      }
      .admin-client-avatar-tone-1 {
        background: #e9f1ff;
      }
      .admin-client-avatar-tone-2 {
        background: #edf8df;
      }
      .admin-client-avatar-tone-3 {
        background: #ffefdf;
      }
      .admin-client-avatar-tone-4 {
        background: #e7f7f3;
      }
      .admin-client-avatar-tone-5 {
        background: #f4ecef;
      }
      .admin-table-stack {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .admin-table-cell-stack {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .admin-travel-estimate-list {
        display: grid;
        gap: 10px;
      }
      .admin-travel-estimate-list-compact {
        gap: 8px;
      }
      .admin-travel-estimate-stack {
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(158, 67, 90, 0.12);
        background: rgba(250, 246, 247, 0.84);
      }
      .admin-client-address-preview-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
      }
      .admin-client-address-preview-item,
      .admin-client-address-preview-more {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 5px 9px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 999px;
        background: rgba(250, 250, 251, 0.96);
        font-size: 12px;
        line-height: 1.35;
      }
      .admin-client-address-preview-item {
        max-width: 100%;
        color: var(--foreground);
        word-break: break-word;
      }
      .admin-client-address-preview-more {
        background: var(--accent-soft);
        border-color: rgba(158, 67, 90, 0.18);
        color: var(--accent);
        font-weight: 700;
        white-space: nowrap;
      }
      }
      .admin-staff-table-actions {
        width: 132px;
      }
      .admin-client-panel-head {
        display: grid;
        gap: 14px;
      }
      .admin-client-title-block {
        display: grid;
        gap: 6px;
      }
      .admin-client-title {
        margin: 0;
        font-size: clamp(22px, 2vw, 30px);
        line-height: 1.15;
        word-break: break-word;
      }
      .admin-client-dialog-panel {
        gap: 16px;
      }
      .admin-client-dialog-intro {
        gap: 0;
      }
      .admin-client-dialog-title-row {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }
      .admin-client-avatar-large {
        width: 56px;
        height: 56px;
        font-size: 20px;
      }
      .admin-client-dialog-title-block {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-client-dialog-meta-stack {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-staff-dialog-title-role {
        color: var(--muted-foreground);
        font-weight: 600;
      }
      .admin-staff-dialog-address {
        word-break: break-word;
      }
      .admin-client-dialog-meta {
        word-break: break-word;
      }
      .admin-client-dialog-address {
        word-break: break-word;
      }
      .admin-client-dialog-head-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      .admin-client-dialog-body {
        display: grid;
        gap: 14px;
      }
      .admin-client-summary-panel,
      .admin-client-section {
        display: grid;
        gap: 14px;
        padding: 16px 18px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-lg);
        background: rgba(255,255,255,0.94);
      }
      [data-admin-toggle-panel][hidden] {
        display: none !important;
      }
      [data-admin-order-amount-editor][hidden],
      [data-admin-order-amount-action-for][hidden],
      [data-admin-order-amount-edit-trigger][hidden],
      [data-admin-order-payment-editor][hidden],
      [data-admin-order-payment-action-for][hidden],
      [data-admin-order-payment-edit-trigger][hidden],
      [data-admin-order-team-editor][hidden],
      [data-admin-order-team-action-for][hidden],
      [data-admin-order-team-edit-trigger][hidden] {
        display: none !important;
      }
      .admin-client-summary-panel {
        background: linear-gradient(180deg, rgba(249,250,251,0.96), rgba(255,255,255,0.98));
      }
      .admin-client-summary-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px 14px;
        flex-wrap: wrap;
      }
      .admin-client-summary-copy-block {
        display: grid;
        gap: 8px;
      }
      .admin-client-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-client-summary-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-client-address-switcher {
        display: grid;
        gap: 10px;
      }
      .admin-client-address-head {
        align-items: center;
      }
      .admin-client-address-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-client-address-editor {
        display: grid;
        gap: 10px;
      }
      .admin-client-address-input-list {
        display: grid;
        gap: 10px;
      }
      .admin-client-address-input-row {
        display: grid;
        gap: 8px;
      }
      .admin-client-address-input-panel {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 18px;
        background: rgba(250, 250, 251, 0.78);
      }
      .admin-client-address-input-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .admin-client-address-input-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .admin-client-address-remove-button {
        flex: 0 0 auto;
      }
      .admin-client-address-detail-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .admin-client-address-profile-section {
        display: grid;
        gap: 12px;
      }
      .admin-client-address-profile-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .admin-client-address-fact,
      .admin-client-address-note-card {
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 16px;
        background: rgba(255,255,255,0.86);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
      }
      .admin-client-address-note-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(249, 245, 247, 0.94));
        border-color: rgba(158, 67, 90, 0.14);
      }
      .admin-client-address-fact-label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-client-address-fact-value,
      .admin-client-address-note-copy {
        margin: 0;
        color: var(--foreground);
        font-weight: 700;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-client-address-fact-value {
        font-size: 15px;
      }
      .admin-client-address-note-copy {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.6;
      }
      .admin-client-address-pill {
        display: inline-grid;
        gap: 2px;
        min-width: min(280px, 100%);
        padding: 10px 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
        background: rgba(255,255,255,0.82);
        color: var(--foreground);
        text-decoration: none;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-client-address-pill:hover {
        border-color: rgba(158, 67, 90, 0.28);
        background: rgba(255,255,255,0.96);
      }
      .admin-client-address-pill-active {
        border-color: rgba(158, 67, 90, 0.34);
        background: rgba(158, 67, 90, 0.08);
        box-shadow: 0 0 0 3px rgba(158, 67, 90, 0.10);
      }
      .admin-client-address-pill-copy {
        font-size: 14px;
        line-height: 1.45;
        font-weight: 600;
        word-break: break-word;
      }
      .admin-client-address-pill-meta {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      @media (max-width: 900px) {
        .admin-team-calendar-toolbar {
          align-items: flex-start;
        }
        .admin-team-calendar-actions {
          width: 100%;
        }
      }
      .admin-client-metric-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-client-metric-grid-dialog {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .admin-client-metric-card,
      .admin-client-contact-card {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        background: rgba(255,255,255,0.84);
      }
      .admin-client-metric-card-wide {
        grid-column: 1 / -1;
      }
      .admin-client-metric-label,
      .admin-client-contact-label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-client-metric-value,
      .admin-client-contact-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-client-metric-value {
        font-size: 15px;
        font-weight: 700;
      }
      .admin-client-info-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-client-info-grid-three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-client-info-grid-compact {
        grid-template-columns: 1fr;
      }
      .admin-client-info-card {
        display: grid;
        gap: 6px;
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.88);
        border-radius: 14px;
        background: rgba(249,250,251,0.92);
        min-width: 0;
      }
      .admin-client-info-card-wide {
        grid-column: 1 / -1;
      }
      .admin-client-info-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-client-info-value {
        margin: 0;
        color: var(--foreground);
        font-size: 15px;
        line-height: 1.45;
        font-weight: 600;
        word-break: break-word;
      }
      .admin-client-info-hint {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-client-contact-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-dialog-panel {
        gap: 18px;
      }
      .admin-order-dialog-layout {
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr;
        align-items: start;
      }
      .admin-order-dialog-main,
      .admin-order-dialog-side {
        display: grid;
        gap: 16px;
        align-content: start;
      }
      .admin-order-section-card {
        display: grid;
        gap: 14px;
        padding: 18px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-lg);
        background: rgba(255,255,255,0.92);
        box-shadow: var(--shadow-sm);
      }
      .admin-order-summary-panel {
        background: linear-gradient(180deg, rgba(249,250,251,0.96), rgba(255,255,255,0.98));
      }
      .admin-order-summary-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-order-summary-copy-block {
        display: grid;
        gap: 10px;
      }
      .admin-order-summary-strip {
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 2px;
        scrollbar-width: thin;
      }
      .admin-order-summary-strip > * {
        flex: 0 0 auto;
      }
      .admin-order-summary-copy,
      .admin-order-summary-ok,
      .admin-order-detail-copy,
      .admin-order-detail-note {
        margin: 0;
      }
      .admin-order-summary-copy,
      .admin-order-summary-ok,
      .admin-order-detail-copy {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-order-summary-ok {
        padding: 12px 14px;
        border: 1px solid rgba(15, 118, 110, 0.14);
        border-radius: 14px;
        background: rgba(15, 118, 110, 0.08);
        color: var(--success);
      }
      .admin-order-summary-flags {
        align-items: flex-start;
      }
      .admin-order-summary-grid,
      .admin-order-detail-grid {
        display: grid;
        gap: 12px;
      }
      .admin-order-summary-card,
      .admin-order-detail-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        align-content: start;
      }
      .admin-order-summary-card-compact {
        gap: 6px;
        max-width: min(280px, 100%);
        justify-self: start;
        padding: 10px 12px;
        background: rgba(250,250,251,0.78);
      }
      .admin-order-summary-card-danger {
        border-color: rgba(185, 28, 28, 0.16);
        background: rgba(185, 28, 28, 0.06);
      }
      .admin-order-summary-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .admin-order-summary-card-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        flex: 0 0 auto;
      }
      .admin-order-summary-card-actions .admin-icon-button {
        flex: 0 0 auto;
      }
      .admin-order-summary-card-team {
        position: relative;
      }
      .admin-order-summary-card-team:has([data-admin-order-team-editor]:not([hidden])) {
        grid-column: 1 / -1;
        z-index: 12;
      }
      .admin-order-summary-card-value {
        margin: 0;
        font-size: 20px;
        line-height: 1.24;
        font-weight: 700;
        letter-spacing: -0.03em;
        word-break: break-word;
      }
      .admin-order-summary-card-note {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-order-summary-card-compact .admin-order-summary-card-value {
        font-size: 16px;
        line-height: 1.35;
        letter-spacing: -0.02em;
      }
      .admin-order-summary-card-compact .admin-order-summary-card-note {
        font-size: 11px;
        line-height: 1.35;
      }
      .admin-order-highlight-editor {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        margin-top: 4px;
        border-top: 1px solid rgba(228, 228, 231, 0.92);
      }
      .admin-order-highlight-editor-field {
        gap: 6px;
      }
      .admin-order-summary-card .admin-order-control-fields {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .admin-confirm-button {
        color: var(--success);
        background: rgba(15, 118, 110, 0.08);
        border-color: rgba(15, 118, 110, 0.18);
      }
      .admin-confirm-button:hover {
        color: #0b5f59;
        background: rgba(15, 118, 110, 0.14);
        border-color: rgba(15, 118, 110, 0.24);
      }
      .admin-close-button {
        color: var(--muted-foreground);
      }
      .admin-close-button:hover {
        color: var(--foreground);
      }
      .admin-order-detail-card-wide {
        grid-column: 1 / -1;
      }
      .admin-order-detail-card .admin-property-row {
        padding-bottom: 10px;
      }
      .admin-order-detail-note {
        color: var(--foreground);
        font-size: 14px;
        line-height: 1.7;
        word-break: break-word;
      }
      .admin-order-brief-layout {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-brief-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,245,247,0.9));
      }
      .admin-order-brief-card-wide {
        grid-column: 1 / -1;
      }
      .admin-order-brief-copy {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-order-brief-stack {
        display: grid;
        gap: 8px;
      }
      .admin-order-brief-overview {
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(150px, 0.58fr));
        align-items: start;
      }
      .admin-order-brief-metric {
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 8px 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 12px;
        background: rgba(255,255,255,0.84);
      }
      .admin-order-brief-metric-wide {
        grid-column: span 1;
      }
      .admin-order-brief-metric-label,
      .admin-order-brief-fact-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-order-brief-metric-value,
      .admin-order-brief-fact-value {
        margin: 0;
        color: var(--foreground);
        font-weight: 700;
        letter-spacing: -0.03em;
        word-break: break-word;
      }
      .admin-order-brief-metric-value {
        font-size: 18px;
        line-height: 1.22;
      }
      .admin-order-brief-metric-meta {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.4;
      }
      .admin-order-brief-payment,
      .admin-order-brief-payment .admin-inline-badge-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .admin-order-brief-fact-grid {
        display: grid;
        gap: 6px;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      }
      .admin-order-brief-fact {
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 8px 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 10px;
        background: rgba(255,255,255,0.78);
      }
      .admin-order-brief-fact-wide {
        grid-column: 1 / -1;
      }
      .admin-order-brief-fact-value {
        font-size: 13px;
        line-height: 1.35;
        font-weight: 600;
      }
      .admin-order-service-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .admin-order-service-pill {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        padding: 5px 8px;
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.08);
        color: var(--accent);
        font-size: 11px;
        line-height: 1.35;
        font-weight: 600;
      }
      .admin-order-service-empty,
      .admin-order-client-note {
        margin: 0;
        padding: 8px 10px;
        border-radius: 12px;
      }
      .admin-order-service-empty {
        border: 1px dashed rgba(158, 67, 90, 0.18);
        background: rgba(255,255,255,0.76);
        color: var(--muted);
        font-size: 11px;
        line-height: 1.4;
      }
      .admin-order-address-hero {
        display: grid;
        gap: 4px;
        padding: 8px 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 12px;
        background: rgba(255,255,255,0.84);
      }
      .admin-order-address-main {
        margin: 0;
        color: var(--foreground);
        font-size: 16px;
        line-height: 1.28;
        font-weight: 700;
        letter-spacing: -0.02em;
        word-break: break-word;
      }
      .admin-order-address-sub {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.4;
        word-break: break-word;
      }
      .admin-order-client-note {
        border: 1px solid rgba(228, 228, 231, 0.92);
        background: rgba(248,245,247,0.76);
        color: var(--foreground);
        font-size: 12px;
        line-height: 1.5;
        word-break: break-word;
      }
      .admin-order-media-stack {
        display: grid;
        gap: 16px;
      }
      .admin-order-media-layout,
      .admin-order-completion-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-media-panel {
        display: grid;
        gap: 12px;
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(250,250,251,0.9);
      }
      .admin-order-media-head {
        align-items: flex-start;
      }
      .admin-order-media-copy {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-order-media-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .admin-order-media-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }
      .admin-order-media-thumb {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        display: block;
        border-radius: 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        background: rgba(255,255,255,0.96);
        box-shadow: var(--shadow-sm);
      }
      .admin-order-media-caption {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-order-media-empty {
        padding: 14px;
        border: 1px dashed rgba(158, 67, 90, 0.18);
        border-radius: 16px;
        background: rgba(255,255,255,0.82);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-file-input {
        padding: 14px 16px;
      }
      .admin-input-help {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-order-completion-feedback {
        margin-top: 2px;
      }
      .admin-order-completion-panel,
      .admin-order-cleaner-comment-form {
        gap: 12px;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(250,250,251,0.9);
      }
      .admin-order-cleaner-comment-feedback {
        margin-top: 2px;
      }
      .admin-action-hint-hidden {
        display: none !important;
      }
      .admin-order-comment-field {
        min-height: 140px;
        resize: vertical;
      }
      .admin-order-side-card {
        gap: 12px;
      }
      .admin-order-control-form {
        gap: 10px;
      }
      .admin-order-control-fields,
      .admin-order-control-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-control-field {
        gap: 6px;
        font-size: 13px;
      }
      .admin-order-control-field-wide {
        grid-column: 1 / -1;
      }
      .admin-order-multiselect {
        position: relative;
      }
      .admin-order-multiselect[open] {
        z-index: 48;
      }
      .admin-order-multiselect > summary {
        list-style: none;
      }
      .admin-order-multiselect > summary::-webkit-details-marker {
        display: none;
      }
      .admin-order-multiselect-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 46px;
        cursor: pointer;
      }
      .admin-order-multiselect-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
      }
      .admin-order-multiselect-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        color: var(--muted);
        flex: 0 0 auto;
        transition: transform 0.18s ease, color 0.18s ease;
      }
      .admin-order-multiselect-icon svg {
        width: 18px;
        height: 18px;
      }
      .admin-order-multiselect[open] .admin-order-multiselect-icon {
        transform: rotate(180deg);
        color: var(--foreground);
      }
      .admin-order-multiselect-panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        right: auto;
        width: min(420px, calc(100vw - 96px));
        min-width: min(320px, 100%);
        max-width: calc(100vw - 96px);
        z-index: 49;
        display: grid;
        gap: 8px;
        padding: 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: var(--shadow-sm);
        max-height: min(320px, calc(100vh - 220px));
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .admin-order-multiselect-list {
        display: grid;
        gap: 6px;
      }
      .admin-order-multiselect-option {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding: 8px 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 12px;
        background: rgba(250,250,251,0.92);
        font-size: 13px;
        line-height: 1.4;
        color: var(--foreground);
        cursor: pointer;
      }
      .admin-order-quote-section .admin-subsection-head {
        margin-bottom: 2px;
      }
      .admin-order-quote-section .admin-subsection-title {
        font-size: 15px;
      }
      .admin-order-quote-section .admin-subsection-head + .admin-order-brief-layout {
        margin-top: -2px;
      }
      .admin-dialog-hero-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .admin-dialog-hero-title-status {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
      }
      .admin-order-multiselect-empty {
        padding: 8px 10px;
        border: 1px dashed rgba(158, 67, 90, 0.18);
        border-radius: 12px;
        background: rgba(255,255,255,0.84);
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-order-multiselect-checkbox {
        width: 16px;
        height: 16px;
        margin: 0;
        flex: 0 0 auto;
      }
      .admin-order-action-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .admin-order-primary-action {
        flex: 1 1 220px;
      }
      .admin-order-action-row > .admin-button-secondary {
        flex: 0 1 auto;
      }
      .admin-client-detail-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
      }
      .admin-client-contact-card-wide {
        grid-column: 1 / -1;
      }
      .admin-client-section-side {
        align-content: start;
      }
      .admin-staff-workload-section {
        align-content: start;
      }
      .admin-staff-calendar-section {
        align-content: start;
      }
      .admin-staff-calendar-actions {
        margin-top: 14px;
      }
      .admin-staff-calendar-actions form {
        margin: 0;
      }
      .admin-w9-empty-state {
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
      }
      .admin-w9-empty-copy {
        min-width: 0;
      }
      .admin-w9-empty-title {
        margin: 0;
        color: var(--foreground);
        font-size: 15px;
        line-height: 1.6;
        font-weight: 600;
      }
      .admin-w9-empty-hint {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.7;
      }
      .admin-w9-empty-actions {
        margin: 0;
        justify-self: end;
      }
      .admin-w9-preview-actions {
        margin-top: 14px;
      }
      .admin-client-actions-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-order-quote-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
      }
      .admin-order-quote-card {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.92);
        align-self: start;
        align-content: start;
      }
      .admin-order-quote-card-wide {
        grid-column: 1 / -1;
      }
      .admin-order-quote-fields {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-quote-fields-primary {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-order-quote-fields-services {
        grid-template-columns: 1fr;
      }
      .admin-order-quote-field {
        display: grid;
        gap: 6px;
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
        background: rgba(248, 245, 247, 0.72);
      }
      .admin-order-quote-field-wide {
        grid-column: 1 / -1;
      }
      .admin-order-quote-field-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-order-quote-field-value,
      .admin-order-quote-note {
        margin: 0;
        color: var(--foreground);
        font-size: 15px;
        line-height: 1.55;
        word-break: break-word;
      }
      .admin-order-quote-field-value {
        font-weight: 600;
      }
      .admin-order-quote-note {
        font-size: 14px;
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
      .admin-orders-page {
        display: grid;
        gap: 18px;
      }
      .admin-orders-hero {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 1fr);
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,247,0.92));
        box-shadow: var(--shadow-sm);
      }
      .admin-orders-hero-main,
      .admin-orders-side-block {
        display: grid;
        gap: 10px;
      }
      .admin-orders-kicker,
      .admin-orders-panel-kicker,
      .admin-orders-lane-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-orders-total {
        margin: 0;
        font-size: clamp(28px, 4vw, 38px);
        line-height: 1.05;
        letter-spacing: -0.04em;
      }
      .admin-orders-copy,
      .admin-orders-panel-copy,
      .admin-orders-lane-copy {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-orders-metrics {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .admin-orders-metric {
        min-height: 118px;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.82);
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .admin-orders-metric-emphasis {
        border-color: rgba(158, 67, 90, 0.2);
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.94));
      }
      .admin-orders-metric-label,
      .admin-order-snapshot-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-orders-metric-value {
        margin: 0;
        font-size: 26px;
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      .admin-orders-panel-title,
      .admin-orders-lane-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }
      .admin-orders-metric-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-orders-layout {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
        align-items: start;
      }
      .admin-orders-filters-panel,
      .admin-orders-side-panel,
      .admin-orders-lane {
        padding: 18px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: rgba(255,255,255,0.88);
        box-shadow: var(--shadow-sm);
      }
      .admin-orders-filters-panel,
      .admin-orders-side-panel,
      .admin-orders-lanes,
      .admin-order-stack {
        display: grid;
        gap: 16px;
      }
      .admin-orders-side-panel {
        position: sticky;
        top: var(--page-top-offset);
      }
      .admin-orders-panel-head,
      .admin-orders-lane-head,
      .admin-order-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        flex-wrap: wrap;
      }
      .admin-orders-filter-form {
        gap: 16px;
      }
      .admin-orders-lane-meta {
        display: grid;
        gap: 8px;
        justify-items: end;
      }
      .admin-orders-lane-count {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 14px;
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
        font-size: 18px;
        font-weight: 700;
      }
      .admin-order-card {
        position: relative;
        overflow: hidden;
        padding: 18px 18px 18px 22px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 20px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 10px 30px rgba(24, 24, 27, 0.04);
        display: grid;
        gap: 14px;
      }
      .admin-order-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: rgba(158, 67, 90, 0.24);
      }
      .admin-order-card-new::before {
        background: #9e435a;
      }
      .admin-order-card-scheduled::before {
        background: #0f766e;
      }
      .admin-order-card-in-progress::before {
        background: #1d4ed8;
      }
      .admin-order-card-completed::before {
        background: #2f855a;
      }
      .admin-order-card-rescheduled::before {
        background: #b45309;
      }
      .admin-order-card-canceled::before {
        background: #b91c1c;
      }
      .admin-order-card-attention {
        box-shadow: 0 16px 32px rgba(185, 28, 28, 0.06);
      }
      .admin-order-title-block {
        display: grid;
        gap: 6px;
      }
      .admin-order-request {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-order-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.15;
      }
      .admin-order-caption,
      .admin-order-focus-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-order-focus {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-order-snapshot-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .admin-order-snapshot {
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.88);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(250,250,251,0.92), rgba(255,255,255,0.98));
        display: grid;
        gap: 6px;
      }
      .admin-order-snapshot-wide {
        grid-column: 1 / -1;
      }
      .admin-order-snapshot-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.55;
        word-break: break-word;
      }
      .admin-order-editor {
        border-style: solid;
        border-color: rgba(228, 228, 231, 0.88);
        background: rgba(252,252,253,0.92);
      }
      .admin-order-editor summary {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
        list-style: none;
      }
      .admin-order-editor-summary {
        margin-left: auto;
      }
      .admin-order-editor summary::-webkit-details-marker {
        display: none;
      }
      .admin-order-editor summary::after {
        content: none;
      }
      .admin-order-editor[open] summary::after {
        content: none;
      }
      .admin-order-editor-body {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .admin-orders-status-stack {
        display: grid;
        gap: 8px;
      }
      .admin-order-form {
        gap: 14px;
      }
      .admin-order-delete-form {
        justify-content: flex-end;
        padding-top: 4px;
        margin-left: auto;
      }
      .admin-order-action-row .admin-order-delete-form {
        margin-left: 0;
        padding-top: 0;
      }
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
