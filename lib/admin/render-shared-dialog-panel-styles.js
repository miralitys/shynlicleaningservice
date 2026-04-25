"use strict";

const ADMIN_SHARED_DIALOG_PANEL_STYLES = String.raw`
.admin-dialog-actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
.admin-order-completion-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-order-completion-feedback {
  margin-top: 2px;
}
.admin-order-completion-panel {
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  background: rgba(250,250,251,0.9);
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
  display: grid;
  gap: 4px;
  min-width: 0;
}
.admin-checklist-preview-copy strong {
  display: block;
  font-size: 16px;
  line-height: 1.45;
  word-break: break-word;
}
.admin-checklist-preview-copy span {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
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
  align-items: start;
}
.admin-checklist-edit-fields {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.admin-checklist-edit-input {
  min-width: 0;
}
.admin-checklist-edit-actions {
  flex-wrap: wrap;
}
.admin-dialog-launcher {
  display: grid;
  gap: 10px;
  align-content: start;
}
.admin-dialog {
  width: min(760px, calc(100vw - 24px));
  max-width: 760px;
  margin: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}
.admin-dialog-wide {
  width: min(980px, calc(100vw - 24px));
  max-width: 980px;
}
.admin-dialog-orders {
  width: min(1240px, calc(100vw - 24px));
  max-width: 1240px;
}
.admin-dialog::backdrop {
  background: rgba(24, 24, 27, 0.44);
  backdrop-filter: blur(6px);
}
.admin-dialog-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid rgba(228, 228, 231, 0.96);
  border-radius: var(--radius-xl);
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,245,247,0.96));
  box-shadow: var(--shadow-lg);
}
.admin-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.admin-dialog-head-actions {
  margin-left: auto;
}
.admin-dialog-hero {
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
.admin-dialog-hero-main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-width: 0;
}
.admin-dialog-hero-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding-top: 2px;
}
.admin-dialog-hero-title-block {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.admin-dialog-hero .admin-dialog-title {
  font-size: 26px;
  line-height: 1.02;
}
.admin-dialog-hero-subtitle {
  margin: 0;
  color: var(--foreground);
  font-size: 16px;
  line-height: 1.35;
  font-weight: 700;
}
.admin-dialog-hero-detail {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.35;
  word-break: break-word;
}
.admin-dialog-hero-meta-stack {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.admin-dialog-hero-actions {
  justify-self: end;
  justify-content: flex-end;
  margin-left: 0;
}
.admin-dialog-copy-block {
  display: grid;
  gap: 8px;
}
.admin-dialog-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.admin-dialog-copy {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}
.admin-confirm-dialog .admin-dialog-panel {
  gap: 20px;
}
.admin-confirm-dialog .admin-dialog-copy-block {
  gap: 6px;
}
.admin-confirm-dialog-actions {
  justify-content: flex-end;
}
`;

module.exports = {
  ADMIN_SHARED_DIALOG_PANEL_STYLES,
};
