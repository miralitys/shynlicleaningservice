"use strict";

const ADMIN_SHARED_WORKSPACE_SUMMARY_STYLES = String.raw`
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
}`;

module.exports = {
  ADMIN_SHARED_WORKSPACE_SUMMARY_STYLES,
};
