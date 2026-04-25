"use strict";

const ADMIN_SHARED_CORE_DATA_ENTRY_STYLES = `
      .admin-phone-field {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 46px;
        padding: 0 14px;
        border: 1px solid var(--input);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.9);
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }
      .admin-phone-field:focus-within {
        border-color: rgba(158, 67, 90, 0.48);
        box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.12);
        background: #fff;
      }
      .admin-phone-prefix {
        flex: 0 0 auto;
        color: var(--foreground);
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .admin-phone-field .admin-input {
        height: 44px;
        border: 0;
        border-radius: 0;
        padding: 0;
        background: transparent;
        box-shadow: none;
        min-width: 0;
      }
      .admin-phone-field .admin-input:focus {
        border-color: transparent;
        box-shadow: none;
        background: transparent;
      }
      .admin-picker-field { position: relative; }
      .admin-picker-display { padding-right: 56px; }
      .admin-picker-native {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
      }
      .admin-picker-trigger {
        position: absolute;
        top: 50%;
        right: 10px;
        transform: translateY(-50%);
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--muted-foreground);
        cursor: pointer;
        transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-picker-trigger:hover {
        background: rgba(24, 24, 27, 0.06);
        color: var(--foreground);
      }
      .admin-picker-trigger:focus-visible {
        outline: none;
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
        box-shadow: 0 0 0 3px rgba(158, 67, 90, 0.14);
      }
      .admin-picker-trigger svg { width: 20px; height: 20px; }
      .admin-time-picker-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 40;
        width: min(320px, calc(100vw - 40px));
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: var(--shadow-lg);
      }
      .admin-time-picker-panel[hidden] { display: none; }
      .admin-time-picker-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-time-picker-cell { display: grid; gap: 6px; min-width: 0; }
      .admin-time-picker-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-time-picker-select { min-width: 0; padding-right: 32px; }
      .admin-input-code {
        text-align: center;
        letter-spacing: 0.24em;
        font-size: 24px;
        font-weight: 700;
      }
      .admin-address-field { display: grid; gap: 8px; }
      .admin-address-suggestions {
        position: relative;
        display: grid;
        gap: 4px;
        padding: 8px;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: 0 18px 38px rgba(24, 24, 27, 0.12);
        backdrop-filter: blur(16px);
      }
      .admin-address-suggestions[hidden] { display: none; }
      .admin-address-suggestion {
        width: 100%;
        padding: 12px 14px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: var(--foreground);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.18s ease, color 0.18s ease;
      }
      .admin-address-suggestion:hover,
      .admin-address-suggestion:focus-visible {
        outline: none;
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-address-suggestion-main {
        display: block;
        font-size: 14px;
        line-height: 1.45;
        font-weight: 700;
      }
      .admin-address-suggestion-copy {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-inline-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }
      .admin-inline-actions-end { justify-content: flex-end; margin-left: auto; }
      .admin-dialog-actions-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .admin-sidebar-actions {
        margin-top: 4px;
        padding-top: 14px;
        border-top: 1px solid rgba(24, 24, 27, 0.08);
      }
      .admin-sidebar-role-badge { margin: -2px 0 2px; }
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
      .admin-sidebar-logout-copy { display: grid; gap: 4px; min-width: 0; }
      .admin-sidebar-logout-title { font-size: 16px; font-weight: 700; line-height: 1.2; }
      .admin-sidebar-logout-hint { color: var(--muted); font-size: 12px; line-height: 1.45; }
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
      .admin-sidebar-logout-icon svg { width: 18px; height: 18px; display: block; }
      .admin-form-actions { grid-column: 1 / -1; }
      .admin-checkbox-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .admin-checkbox {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.84);
        cursor: pointer;
      }
      .admin-checkbox input { margin-top: 3px; accent-color: var(--accent); }
      .admin-checkbox span { display: grid; gap: 4px; min-width: 0; }
      .admin-checkbox strong { font-size: 14px; line-height: 1.3; }
      .admin-checkbox small { color: var(--muted); font-size: 12px; line-height: 1.5; }
      .admin-entry-list { display: grid; gap: 14px; }
      .admin-overview-tile-success {
        border-color: rgba(15, 118, 110, 0.18);
        background: linear-gradient(180deg, rgba(15, 118, 110, 0.10), rgba(255,255,255,0.94));
      }
      .admin-overview-tile-danger {
        border-color: rgba(185, 28, 28, 0.18);
        background: linear-gradient(180deg, rgba(185, 28, 28, 0.08), rgba(255,255,255,0.94));
      }
      .admin-table-wrap {
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-gutter: stable both-edges;
        padding-bottom: 2px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.88);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.36);
      }
      .admin-inline-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-table {
        width: max-content;
        min-width: 100%;
        border-collapse: collapse;
        table-layout: auto;
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
      .admin-table tbody tr:last-child td { border-bottom: 0; }
      .admin-table tbody tr:hover td { background: rgba(158, 67, 90, 0.04); }
      .admin-table-row-clickable { cursor: pointer; outline: none; }
      .admin-table-row-clickable:focus-visible td,
      .admin-table-row-clickable:focus-within td {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-table-row-clickable:focus-visible td:first-child,
      .admin-table-row-clickable:focus-within td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      .admin-table-row-active td { background: rgba(158, 67, 90, 0.08); }
      .admin-table-row-active td:first-child { box-shadow: inset 4px 0 0 var(--accent); }
      .admin-table-link { font-weight: 700; font-size: 15px; line-height: 1.2; text-decoration: none; }
      .admin-table-link:hover {
        text-decoration: underline;
        text-decoration-color: rgba(158, 67, 90, 0.28);
      }
      .admin-table-link-button {
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .admin-table-link-button:hover { color: var(--accent); }
      .admin-table-stack,
      .admin-table-cell-stack {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .admin-table-cell-stack { gap: 3px; }
      .admin-table-strong { font-weight: 600; line-height: 1.3; }
      .admin-table-muted { color: var(--muted); font-size: 12px; line-height: 1.35; }
      .admin-table:not(.admin-team-calendar-table) .admin-line-clamp-two {
        display: block;
        -webkit-line-clamp: unset;
        overflow: visible;
        white-space: inherit;
      }
      .admin-line-clamp-two {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .admin-table-number { white-space: nowrap; font-weight: 600; }
`;

module.exports = {
  ADMIN_SHARED_CORE_DATA_ENTRY_STYLES,
};
