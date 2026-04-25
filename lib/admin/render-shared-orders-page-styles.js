"use strict";

const ADMIN_SHARED_ORDERS_PAGE_STYLES = String.raw`
.admin-orders-page {
  display: grid;
  gap: 18px;
}
.admin-orders-hero {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 1fr);
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,247,0.92));
  box-shadow: var(--shadow-sm);
}
.admin-orders-hero-main,
.admin-orders-side-block {
  display: grid;
  gap: 10px;
}
.admin-orders-kicker,
.admin-orders-panel-kicker,
.admin-orders-lane-kicker {
  margin: 0;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.admin-orders-total {
  margin: 0;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.05;
  letter-spacing: -0.04em;
}
.admin-orders-copy,
.admin-orders-panel-copy,
.admin-orders-lane-copy {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}
.admin-orders-metrics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.admin-orders-metric {
  min-height: 118px;
  padding: 14px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.82);
  display: grid;
  gap: 8px;
  align-content: start;
}
.admin-orders-metric-emphasis {
  border-color: rgba(158, 67, 90, 0.2);
  background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.94));
}
.admin-orders-metric-label,
.admin-order-snapshot-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.admin-orders-metric-value {
  margin: 0;
  font-size: 26px;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.admin-orders-panel-title,
.admin-orders-lane-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}
.admin-orders-metric-copy {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}
.admin-orders-layout {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
  align-items: start;
}
.admin-orders-filters-panel,
.admin-orders-side-panel,
.admin-orders-lane {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.88);
  box-shadow: var(--shadow-sm);
}
.admin-orders-filters-panel,
.admin-orders-side-panel,
.admin-orders-lanes,
.admin-order-stack {
  display: grid;
  gap: 16px;
}
.admin-orders-side-panel {
  position: sticky;
  top: var(--page-top-offset);
}
.admin-orders-panel-head,
.admin-orders-lane-head,
.admin-order-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap;
}
.admin-orders-filter-form {
  gap: 16px;
}
.admin-orders-lane-meta {
  display: grid;
  gap: 8px;
  justify-items: end;
}
.admin-orders-lane-count {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: rgba(158, 67, 90, 0.12);
  color: var(--accent);
  font-size: 18px;
  font-weight: 700;
}
.admin-order-card {
  position: relative;
  overflow: hidden;
  padding: 18px 18px 18px 22px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 20px;
  background: rgba(255,255,255,0.96);
  box-shadow: 0 10px 30px rgba(24, 24, 27, 0.04);
  display: grid;
  gap: 14px;
}
.admin-order-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: rgba(158, 67, 90, 0.24);
}
.admin-order-card-new::before {
  background: #9e435a;
}
.admin-order-card-scheduled::before {
  background: #0f766e;
}
.admin-order-card-en-route::before {
  background: #1d4ed8;
}
.admin-order-card-cleaning-started::before {
  background: #4338ca;
}
.admin-order-card-checklist::before {
  background: #7c3aed;
}
.admin-order-card-photos::before {
  background: #a855f7;
}
.admin-order-card-cleaning-complete::before {
  background: #059669;
}
.admin-order-card-completed::before {
  background: #2f855a;
}
.admin-order-card-rescheduled::before {
  background: #b45309;
}
.admin-order-card-canceled::before {
  background: #b91c1c;
}
.admin-order-card-attention {
  box-shadow: 0 16px 32px rgba(185, 28, 28, 0.06);
}
.admin-order-title-block {
  display: grid;
  gap: 6px;
}
.admin-order-request {
  margin: 0;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.admin-order-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
}
.admin-order-caption,
.admin-order-focus-copy {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.admin-order-focus {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.admin-order-snapshot-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.admin-order-snapshot {
  padding: 12px 14px;
  border: 1px solid rgba(228, 228, 231, 0.88);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(250,250,251,0.92), rgba(255,255,255,0.98));
  display: grid;
  gap: 6px;
}
.admin-order-snapshot-wide {
  grid-column: 1 / -1;
}
.admin-order-snapshot-value {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  word-break: break-word;
}
.admin-order-editor {
  border-style: solid;
  border-color: rgba(228, 228, 231, 0.88);
  background: rgba(252,252,253,0.92);
}
.admin-order-editor summary {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  list-style: none;
}
.admin-order-editor-summary {
  margin-left: auto;
}
.admin-order-editor summary::-webkit-details-marker {
  display: none;
}
.admin-order-editor summary::after {
  content: none;
}
.admin-order-editor[open] summary::after {
  content: none;
}
.admin-order-editor-body {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}
.admin-orders-status-stack {
  display: grid;
  gap: 8px;
}
.admin-order-form {
  gap: 14px;
}
.admin-order-delete-form {
  justify-content: flex-end;
  padding-top: 4px;
  margin-left: auto;
}
.admin-order-action-row .admin-order-delete-form {
  margin-left: 0;
  padding-top: 0;
}`;

module.exports = {
  ADMIN_SHARED_ORDERS_PAGE_STYLES,
};
