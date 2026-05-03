"use strict";

const ADMIN_SHARED_QUOTE_OPS_STYLES = String.raw`
.admin-quote-ops-page,
.admin-quote-ops-main,
.admin-quote-ops-side,
.admin-quote-lanes {
  display: grid;
  gap: 18px;
  min-width: 0;
}
.admin-quote-ops-overview {
  grid-template-columns: 1fr;
}
.admin-quote-ops-layout {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: start;
}
.admin-quote-ops-side {
  position: sticky;
  top: var(--page-top-offset);
}
.admin-quote-ops-filter-head,
.admin-quote-lane-head,
.admin-quote-entry-head,
.admin-quote-entry-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px 18px;
  flex-wrap: wrap;
}
.admin-quote-ops-panel-kicker,
.admin-quote-lane-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.admin-quote-ops-panel-kicker,
.admin-quote-lane-warning .admin-quote-lane-kicker {
  color: var(--accent);
}
.admin-quote-lane-success .admin-quote-lane-kicker {
  color: var(--success);
}
.admin-quote-lane-error .admin-quote-lane-kicker {
  color: var(--danger);
}
.admin-quote-ops-panel-title,
.admin-quote-lane-title {
  margin: 6px 0 0;
  font-size: clamp(22px, 3vw, 28px);
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.admin-quote-ops-panel-copy,
.admin-quote-lane-copy {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}
.admin-quote-ops-filter-meta {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid rgba(228, 228, 231, 0.9);
  border-radius: 18px;
  background: rgba(250,250,251,0.78);
}
.admin-quote-ops-filter-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px 18px;
  flex-wrap: wrap;
}
.admin-quote-ops-filter-actions {
  display: grid;
  gap: 10px;
  justify-items: end;
  align-content: start;
}
.admin-quote-ops-filter-disclosure {
  width: 100%;
}
.admin-quote-ops-filter-disclosure[open] {
  width: 100%;
}
.admin-quote-ops-filter-actions .admin-quote-ops-filter-disclosure {
  width: auto;
}
.admin-quote-ops-filter-panel {
  display: grid;
  gap: 14px;
}
.admin-quote-ops-filter-form {
  display: grid;
  gap: 14px;
}
.admin-quote-ops-filter-inline-row {
  display: grid;
  gap: 14px 18px;
  grid-template-columns: minmax(280px, 1.2fr) repeat(2, minmax(180px, 220px)) auto;
  align-items: end;
}
.admin-quote-ops-filter-search {
  min-width: 0;
}
.admin-quote-ops-filter-inline-actions {
  justify-content: flex-end;
  flex-wrap: nowrap;
}
.admin-quote-ops-filter-hint {
  margin: 0;
}
.admin-quote-ops-filter-badges,
.admin-quote-lane-meta,
.admin-quote-entry-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.admin-quote-lane {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,247,0.90));
  box-shadow: var(--shadow-sm);
  min-width: 0;
  max-width: 100%;
}
.admin-quote-lane-success {
  border-color: rgba(15, 118, 110, 0.16);
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(240,249,248,0.92));
}
.admin-quote-lane-warning {
  border-color: rgba(158, 67, 90, 0.18);
}
.admin-quote-lane-new {
  border-color: rgba(158, 67, 90, 0.24);
  background:
    radial-gradient(circle at top right, rgba(158, 67, 90, 0.10), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(252,246,248,0.94));
}
.admin-quote-lane-new .admin-quote-lane-kicker {
  color: var(--accent);
}
.admin-quote-lane-error {
  border-color: rgba(185, 28, 28, 0.18);
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(254,242,242,0.92));
}
.admin-quote-lane-list {
  display: grid;
  gap: 14px;
}
.admin-quote-table-wrap {
  width: 100%;
  max-width: 100%;
  border-radius: 20px;
  background: rgba(255,255,255,0.98);
  touch-action: pan-x;
  overscroll-behavior-x: contain;
}
.admin-quote-success-table {
  min-width: 1520px;
}
.admin-quote-success-table th:nth-child(1),
.admin-quote-success-table td:nth-child(1) {
  min-width: 320px;
}
.admin-quote-success-table th:nth-child(2),
.admin-quote-success-table td:nth-child(2) {
  min-width: 160px;
}
.admin-quote-success-table th:nth-child(3),
.admin-quote-success-table td:nth-child(3) {
  min-width: 380px;
}
.admin-quote-success-table th:nth-child(4),
.admin-quote-success-table td:nth-child(4) {
  min-width: 320px;
}
.admin-quote-success-table th:nth-child(5),
.admin-quote-success-table td:nth-child(5) {
  min-width: 240px;
}
.admin-quote-success-table th:nth-child(6),
.admin-quote-success-table td:nth-child(6) {
  min-width: 140px;
}
.admin-quote-entry {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(228, 228, 231, 0.94);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.92));
  overflow: hidden;
}
.admin-quote-entry::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
}
.admin-quote-entry-success {
  border-color: rgba(15, 118, 110, 0.18);
}
.admin-quote-entry-success::before {
  background: var(--success);
}
.admin-quote-entry-error {
  border-color: rgba(185, 28, 28, 0.18);
}
.admin-quote-entry-error::before {
  background: var(--danger);
}
.admin-quote-entry-main {
  display: grid;
  gap: 8px;
  min-width: 0;
  flex: 1 1 340px;
}
.admin-quote-entry-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.admin-quote-entry-separator {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(113, 113, 122, 0.45);
}
.admin-quote-entry-title {
  margin: 0;
  font-size: clamp(22px, 3vw, 28px);
  line-height: 1.08;
  letter-spacing: -0.04em;
  word-break: break-word;
}
.admin-quote-entry-title-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.admin-quote-entry-title-button:hover,
.admin-quote-entry-title-button:focus-visible {
  color: var(--accent);
}
.admin-quote-entry-copy {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 14px;
  line-height: 1.65;
}
.admin-quote-entry-side {
  display: grid;
  gap: 10px;
  justify-items: end;
  min-width: 0;
}
.admin-quote-entry-amount {
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
}
.admin-quote-entry-crm-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.admin-quote-entry-crm-item,
.admin-quote-entry-info {
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 14px;
}
.admin-quote-entry-crm-item {
  padding: 12px 14px;
  background: rgba(248,249,252,0.9);
  display: grid;
  gap: 6px;
}
.admin-quote-entry-crm-label,
.admin-quote-entry-info-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.admin-quote-entry-crm-value,
.admin-quote-entry-info-value {
  margin: 0;
  word-break: break-word;
}
.admin-quote-entry-crm-value {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}
.admin-quote-entry-info-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-quote-entry-info {
  padding: 14px;
  background: rgba(255,255,255,0.9);
  display: grid;
  gap: 8px;
}
.admin-quote-entry-info-wide {
  grid-column: 1 / -1;
}
.admin-quote-entry-info-value {
  display: grid;
  gap: 4px;
  font-size: 14px;
  line-height: 1.6;
}
.admin-quote-entry-info-value span {
  display: block;
}
.admin-quote-entry-feedback {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid transparent;
}
.admin-quote-entry-feedback strong {
  font-size: 13px;
  line-height: 1.35;
}
.admin-quote-entry-feedback span {
  color: var(--muted-foreground);
  font-size: 14px;
  line-height: 1.6;
}
.admin-quote-entry-feedback-warning {
  background: rgba(158, 67, 90, 0.08);
  border-color: rgba(158, 67, 90, 0.16);
}
.admin-quote-entry-feedback-warning strong {
  color: var(--accent);
}
.admin-quote-entry-feedback-error {
  background: var(--danger-soft);
  border-color: rgba(185, 28, 28, 0.16);
}
.admin-quote-entry-feedback-error strong {
  color: var(--danger);
}
.admin-quote-entry-footer .admin-action-hint {
  flex: 1 1 320px;
}`;

module.exports = {
  ADMIN_SHARED_QUOTE_OPS_STYLES,
};
