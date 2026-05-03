"use strict";

const ADMIN_SHARED_WORKSPACE_CALENDAR_STYLES = String.raw`
.admin-team-calendar-shell {
  display: grid;
  gap: 14px;
  min-width: 0;
  background: #ffffff;
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
  align-items: center;
  gap: 8px;
}
.admin-team-calendar-view-toggle {
  display: inline-grid;
  grid-auto-flow: column;
  gap: 2px;
  min-height: 38px;
  padding: 3px;
  border: 1px solid rgba(212, 212, 216, 0.9);
  border-radius: 8px;
  background: rgba(248, 249, 252, 0.96);
}
.admin-team-calendar-view-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
}
.admin-team-calendar-view-link:hover {
  color: var(--foreground);
  background: rgba(255, 255, 255, 0.96);
}
.admin-team-calendar-view-link-active {
  color: var(--accent);
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}
.admin-team-calendar-low-load-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(212, 212, 216, 0.9);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
}
.admin-team-calendar-low-load-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  margin: 0;
}
.admin-team-calendar-wrap {
  overflow: auto;
  padding-bottom: 4px;
  cursor: grab;
  touch-action: pan-x pan-y;
  overscroll-behavior: contain;
  max-height: min(72vh, 740px);
}
.admin-team-calendar-wrap.admin-team-calendar-wrap-dragging,
.admin-team-calendar-wrap.admin-team-calendar-wrap-dragging * {
  cursor: grabbing !important;
  user-select: none;
}
.admin-team-calendar-table {
  width: max(100%, calc(160px + (var(--admin-team-calendar-staff, 1) * 220px)));
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
.admin-team-calendar-cleaner-col,
.admin-team-calendar-day-cell {
  width: 220px;
  min-width: 220px;
  border-left: 2px solid rgba(203, 213, 225, 0.72);
  position: relative;
  z-index: 1;
  transition: opacity 160ms ease, background-color 160ms ease;
}
.admin-team-calendar-table th:last-child,
.admin-team-calendar-table td:last-child {
  border-right: 2px solid rgba(203, 213, 225, 0.72);
}
.admin-team-calendar-date-col {
  position: sticky;
  left: 0;
  z-index: 8;
  width: 160px;
  min-width: 160px;
  background: #ffffff !important;
  isolation: isolate;
}
.admin-team-calendar-date-col::before {
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
.admin-team-calendar-table thead th {
  position: sticky;
  top: 0;
  z-index: 7;
  background: #f8f9fc;
}
.admin-team-calendar-table thead .admin-team-calendar-date-col {
  z-index: 10;
  background: #f8f9fc !important;
}
.admin-team-calendar-table thead .admin-team-calendar-date-col::before {
  background: #f8f9fc;
  box-shadow:
    inset -1px 0 0 rgba(203, 213, 225, 0.9),
    14px 0 0 #f8f9fc,
    18px 0 22px rgba(15, 23, 42, 0.08);
}
.admin-team-calendar-cleaner-col {
  background:
    linear-gradient(180deg, var(--admin-staff-color-soft, #f8f9fc), #ffffff 88%);
}
.admin-team-calendar-cleaner-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 9px;
  align-items: center;
  min-width: 0;
}
.admin-team-calendar-cleaner-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--admin-staff-color, #2563eb);
  box-shadow: 0 0 0 3px var(--admin-staff-color-soft, #eff6ff);
}
.admin-team-calendar-cleaner-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.admin-team-calendar-cleaner-name,
.admin-team-calendar-cleaner-role,
.admin-team-calendar-cleaner-load {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.admin-team-calendar-cleaner-name {
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
}
.admin-team-calendar-cleaner-role {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
}
.admin-team-calendar-cleaner-load {
  grid-column: 2;
  justify-self: start;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  max-width: 100%;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--admin-staff-color-border, #bfdbfe);
  background: rgba(255, 255, 255, 0.72);
  color: var(--admin-staff-color-text, #1e3a8a);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
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
.admin-team-calendar-entry {
  display: grid;
  gap: 3px;
  width: 100%;
  min-width: 0;
  padding: 8px 9px;
  border-radius: 8px;
  border: 1px solid rgba(24, 24, 27, 0.08);
  background: rgba(255,255,255,0.94);
  overflow: hidden;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.admin-team-calendar-entry-button {
  appearance: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.admin-team-calendar-entry-button:hover {
  border-color: var(--admin-staff-color-border, rgba(158, 67, 90, 0.24));
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.admin-team-calendar-entry-button:focus-visible {
  outline: 2px solid var(--admin-staff-color-border, rgba(158, 67, 90, 0.32));
  outline-offset: 2px;
}
.admin-team-calendar-entry-order {
  background: var(--admin-staff-color-soft, rgba(158, 67, 90, 0.06));
  border-color: var(--admin-staff-color-border, rgba(158, 67, 90, 0.16));
  border-left: 4px solid var(--admin-staff-color, #9e435a);
}
.admin-team-calendar-entry-order-confirmed {
  background: var(--admin-staff-color-soft, rgba(158, 67, 90, 0.08));
}
.admin-team-calendar-entry-order-completed {
  background: var(--admin-staff-color-soft, rgba(14, 116, 144, 0.08));
  border-color: var(--admin-staff-color-border, rgba(14, 116, 144, 0.16));
}
.admin-team-calendar-entry-order-issue {
  background: var(--admin-staff-color-soft, rgba(185, 28, 28, 0.08));
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
  letter-spacing: 0;
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
.admin-team-calendar-today-row .admin-team-calendar-date-col {
  background: rgba(250, 246, 247, 0.98) !important;
}
.admin-team-calendar-today-row .admin-team-calendar-day-cell {
  background: rgba(250, 246, 247, 0.28);
}
.admin-team-calendar-shell.admin-team-calendar-show-low-load .admin-team-calendar-cleaner-col:not([data-admin-team-calendar-low-load="true"]),
.admin-team-calendar-shell.admin-team-calendar-show-low-load .admin-team-calendar-day-cell:not([data-admin-team-calendar-low-load="true"]) {
  opacity: 0.32;
}
.admin-team-calendar-shell.admin-team-calendar-show-low-load [data-admin-team-calendar-low-load="true"] {
  opacity: 1;
}
.admin-team-calendar-shell.admin-team-calendar-show-low-load .admin-team-calendar-cleaner-col[data-admin-team-calendar-low-load="true"] {
  box-shadow: inset 0 3px 0 var(--admin-staff-color, #2563eb);
}
.admin-team-calendar-shell:fullscreen,
.admin-team-calendar-shell.admin-team-calendar-shell-fullscreen {
  width: 100vw;
  min-height: 100vh;
  padding: 24px;
  background: #f8f9fc;
  overflow: auto;
}
.admin-team-calendar-shell.admin-team-calendar-shell-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
}
body.admin-team-calendar-body-lock {
  overflow: hidden;
}
.admin-team-calendar-shell:fullscreen .admin-team-calendar-wrap,
.admin-team-calendar-shell.admin-team-calendar-shell-fullscreen .admin-team-calendar-wrap {
  max-height: calc(100vh - 138px);
}
.admin-team-calendar-shell:fullscreen .admin-team-calendar-toolbar,
.admin-team-calendar-shell.admin-team-calendar-shell-fullscreen .admin-team-calendar-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  padding-bottom: 10px;
  background: #f8f9fc;
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
.admin-staff-table-actions {
  width: 132px;
}`;

module.exports = {
  ADMIN_SHARED_WORKSPACE_CALENDAR_STYLES,
};
