"use strict";

const ADMIN_SHARED_SETTINGS_STYLES = String.raw`
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
`;

module.exports = {
  ADMIN_SHARED_SETTINGS_STYLES,
};
