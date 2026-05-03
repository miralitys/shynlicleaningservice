"use strict";

const {
  ADMIN_SHARED_ORDERS_PAGE_STYLES,
} = require("./render-shared-orders-page-styles");
const {
  ADMIN_SHARED_SETTINGS_STYLES,
} = require("./render-shared-settings-styles");

const ADMIN_SHARED_LAYOUT_EXTRA_STYLES = [
  String.raw`
      @media (max-width: 900px) {
        .admin-team-calendar-toolbar {
          align-items: flex-start;
        }
        .admin-team-calendar-actions {
          width: 100%;
        }
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
      .admin-client-delete-form[hidden],
      [data-admin-toggle-companion][hidden] {
        display: none !important;
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
      .admin-payroll-page {
        display: grid;
        align-content: start;
        gap: 24px;
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
      .admin-ghl-sms-filter-row {
        display: grid;
        grid-template-columns: minmax(118px, 0.9fr) minmax(128px, 1fr) minmax(176px, 1.35fr) minmax(112px, 0.9fr);
        gap: 10px;
        align-items: stretch;
      }
      .admin-ghl-sms-filter-button {
        appearance: none;
        border: 1px solid rgba(212, 212, 216, 0.9);
        background: rgba(255,255,255,0.9);
        color: var(--muted-foreground);
        border-radius: 999px;
        width: 100%;
        min-width: 0;
        padding: 8px 10px;
        font: inherit;
        font-size: 12px;
        line-height: 1.2;
        font-weight: 700;
        text-align: center;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
      }
      .admin-ghl-sms-filter-button:hover {
        border-color: rgba(190, 24, 93, 0.2);
        color: var(--foreground);
        transform: translateY(-1px);
      }
      .admin-ghl-sms-filter-button.is-active,
      .admin-ghl-sms-filter-button[aria-pressed="true"] {
        border-color: rgba(15, 118, 110, 0.12);
        background: rgba(226, 239, 238, 0.96);
        color: rgb(15, 118, 110);
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
`,
  ADMIN_SHARED_SETTINGS_STYLES,
  ADMIN_SHARED_ORDERS_PAGE_STYLES,
  String.raw`
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
        .admin-ghl-sms-filter-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .admin-ghl-sms-filter-button {
          white-space: normal;
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
        .admin-order-quote-fields-primary {
          grid-template-columns: 1fr;
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
`,
].join("\n");

module.exports = {
  ADMIN_SHARED_LAYOUT_EXTRA_STYLES,
};
