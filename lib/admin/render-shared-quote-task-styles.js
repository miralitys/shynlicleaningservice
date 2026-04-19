"use strict";

const ADMIN_SHARED_QUOTE_TASK_STYLES = String.raw`
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
@media (max-width: 720px) {
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
}
`;

module.exports = {
  ADMIN_SHARED_QUOTE_TASK_STYLES,
};
