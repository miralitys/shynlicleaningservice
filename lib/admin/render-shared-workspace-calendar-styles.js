"use strict";

const ADMIN_SHARED_WORKSPACE_CALENDAR_STYLES = String.raw`
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
