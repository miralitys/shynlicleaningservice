"use strict";

const ADMIN_SHARED_RESPONSIVE_STYLES = `
      .admin-sidebar-actions {
        margin-top: 4px;
        padding-top: 14px;
        border-top: 1px solid rgba(24, 24, 27, 0.08);
      }
      .admin-sidebar-role-badge {
        margin: -2px 0 2px;
      }
      .admin-sidebar-role-badge .admin-badge {
        width: 100%;
        min-height: 32px;
        padding: 0 14px;
        border-radius: 999px;
        letter-spacing: 0.06em;
      }
      .admin-sidebar-logout-button {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 14px 16px;
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,245,247,0.96));
        color: var(--foreground);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        box-shadow: 0 10px 22px rgba(24, 24, 27, 0.06);
      }
      .admin-sidebar-logout-button:hover {
        transform: translateY(-1px);
        border-color: rgba(158, 67, 90, 0.22);
        background: linear-gradient(180deg, rgba(255,255,255,1), rgba(249,245,247,0.98));
        box-shadow: 0 14px 28px rgba(24, 24, 27, 0.08);
      }
      .admin-sidebar-logout-button:focus-visible {
        outline: none;
        border-color: rgba(158, 67, 90, 0.32);
        box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.12);
      }
      .admin-sidebar-logout-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-sidebar-logout-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-sidebar-logout-hint {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-sidebar-logout-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
      }
      .admin-sidebar-logout-icon svg {
        width: 18px;
        height: 18px;
        display: block;
      }
      .admin-settings-nav-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
      }
      .admin-settings-nav {
        flex: 1 1 420px;
        margin-bottom: 0;
      }
      .admin-settings-nav-actions {
        margin-left: auto;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        flex: 0 0 auto;
      }
      .admin-settings-nav-link {
        gap: 10px;
        justify-content: space-between;
        min-width: 0;
        padding: 0 14px;
      }
      .admin-settings-nav-label {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-settings-nav-meta {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(24, 24, 27, 0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
      }
      .admin-settings-nav-link-active .admin-settings-nav-meta {
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
      }
      .admin-settings-section-stack {
        display: grid;
        gap: 14px;
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
      @media (max-width: 900px) {
        .admin-team-calendar-toolbar {
          align-items: flex-start;
        }
        .admin-team-calendar-actions {
          width: 100%;
        }
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
`;

module.exports = {
  ADMIN_SHARED_RESPONSIVE_STYLES,
};
