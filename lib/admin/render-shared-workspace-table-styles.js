"use strict";

const ADMIN_SHARED_WORKSPACE_TABLE_STYLES = String.raw`
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
.admin-orders-toolbar-shell > .admin-clients-search-form {
  width: 100%;
  max-width: none;
  margin-left: 0;
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
}`;

module.exports = {
  ADMIN_SHARED_WORKSPACE_TABLE_STYLES,
};
