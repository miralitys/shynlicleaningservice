"use strict";

const ADMIN_SHARED_DETAIL_CLIENT_STYLES = String.raw`
.admin-client-panel-head { display: grid; gap: 14px; }
.admin-client-title-block { display: grid; gap: 6px; }
.admin-client-title {
  margin: 0;
  font-size: clamp(22px, 2vw, 30px);
  line-height: 1.15;
  word-break: break-word;
}
.admin-client-dialog-panel { gap: 16px; }
.admin-client-dialog-intro { gap: 0; }
.admin-client-dialog-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.admin-client-avatar-large { width: 56px; height: 56px; font-size: 20px; }
.admin-client-dialog-title-block { display: grid; gap: 6px; min-width: 0; }
.admin-client-dialog-meta-stack { display: grid; gap: 4px; min-width: 0; }
.admin-staff-dialog-title-role { color: var(--muted-foreground); font-weight: 600; }
.admin-staff-dialog-address,
.admin-client-dialog-meta,
.admin-client-dialog-address { word-break: break-word; }
.admin-client-dialog-head-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.admin-client-dialog-body { display: grid; gap: 14px; }
.admin-client-summary-panel,
.admin-client-section {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.94);
}
[data-admin-toggle-panel][hidden] { display: none !important; }
.admin-client-summary-panel {
  background: linear-gradient(180deg, rgba(249,250,251,0.96), rgba(255,255,255,0.98));
}
.admin-client-summary-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px 14px;
  flex-wrap: wrap;
}
.admin-client-summary-copy-block { display: grid; gap: 8px; }
.admin-client-badge-row { display: flex; flex-wrap: wrap; gap: 8px; }
.admin-client-summary-copy {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}
.admin-client-address-switcher { display: grid; gap: 10px; }
.admin-client-address-head { align-items: center; }
.admin-client-address-list { display: flex; flex-wrap: wrap; gap: 8px; }
.admin-client-address-editor { display: grid; gap: 10px; }
.admin-client-address-input-list { display: grid; gap: 10px; }
.admin-client-address-input-row { display: grid; gap: 8px; }
.admin-client-address-input-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 18px;
  background: rgba(250, 250, 251, 0.78);
}
.admin-client-address-input-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.admin-client-address-input-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.admin-client-address-remove-button { flex: 0 0 auto; }
.admin-client-address-detail-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.admin-client-address-profile-section { display: grid; gap: 12px; }
.admin-client-address-profile-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.admin-client-address-fact,
.admin-client-address-note-card {
  padding: 14px 16px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 16px;
  background: rgba(255,255,255,0.86);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
}
.admin-client-address-note-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(249, 245, 247, 0.94));
  border-color: rgba(158, 67, 90, 0.14);
}
.admin-client-address-fact-label {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.admin-client-address-fact-value,
.admin-client-address-note-copy {
  margin: 0;
  color: var(--foreground);
  font-weight: 700;
  line-height: 1.45;
  word-break: break-word;
}
.admin-client-address-fact-value { font-size: 15px; }
.admin-client-address-note-copy {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
}
.admin-client-address-pill {
  display: inline-grid;
  gap: 2px;
  min-width: min(280px, 100%);
  padding: 10px 12px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 14px;
  background: rgba(255,255,255,0.82);
  color: var(--foreground);
  text-decoration: none;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.admin-client-address-pill:hover {
  border-color: rgba(158, 67, 90, 0.28);
  background: rgba(255,255,255,0.96);
}
.admin-client-address-pill-active {
  border-color: rgba(158, 67, 90, 0.34);
  background: rgba(158, 67, 90, 0.08);
  box-shadow: 0 0 0 3px rgba(158, 67, 90, 0.10);
}
.admin-client-address-pill-copy {
  font-size: 14px;
  line-height: 1.45;
  font-weight: 600;
  word-break: break-word;
}
.admin-client-address-pill-meta { color: var(--muted); font-size: 12px; line-height: 1.45; }
.admin-client-metric-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-client-metric-grid-dialog { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.admin-client-metric-card,
.admin-client-contact-card {
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: rgba(255,255,255,0.84);
}
.admin-client-metric-card-wide { grid-column: 1 / -1; }
.admin-client-metric-label,
.admin-client-contact-label {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.admin-client-metric-value,
.admin-client-contact-value {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
}
.admin-client-metric-value { font-size: 15px; font-weight: 700; }
.admin-client-info-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-client-info-grid-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.admin-client-info-grid-compact { grid-template-columns: 1fr; }
.admin-client-info-card {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgba(228, 228, 231, 0.88);
  border-radius: 14px;
  background: rgba(249,250,251,0.92);
  min-width: 0;
}
.admin-client-info-card-wide { grid-column: 1 / -1; }
.admin-client-info-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.admin-client-info-value {
  margin: 0;
  color: var(--foreground);
  font-size: 15px;
  line-height: 1.45;
  font-weight: 600;
  word-break: break-word;
}
.admin-client-info-hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.admin-client-contact-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
`;

module.exports = {
  ADMIN_SHARED_DETAIL_CLIENT_STYLES,
};
