"use strict";

const ADMIN_SHARED_WORKSPACE_STYLES = String.raw`
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
  ADMIN_SHARED_WORKSPACE_STYLES,
};
