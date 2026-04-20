"use strict";

const ADMIN_SHARED_DETAIL_SUPPLEMENTAL_STYLES = String.raw`
.admin-client-detail-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
}
.admin-client-contact-card-wide {
  grid-column: 1 / -1;
}
.admin-client-section-side {
  align-content: start;
}
.admin-staff-workload-section {
  align-content: start;
}
.admin-staff-calendar-section {
  align-content: start;
}
.admin-staff-calendar-actions {
  margin-top: 14px;
}
.admin-staff-calendar-actions form {
  margin: 0;
}
.admin-w9-empty-state {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}
.admin-w9-empty-copy {
  min-width: 0;
}
.admin-w9-empty-title {
  margin: 0;
  color: var(--foreground);
  font-size: 15px;
  line-height: 1.6;
  font-weight: 600;
}
.admin-w9-empty-hint {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}
.admin-w9-empty-actions {
  margin: 0;
  justify-self: end;
}
.admin-w9-preview-actions {
  margin-top: 14px;
}
.admin-client-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.admin-order-quote-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}
.admin-order-quote-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.92);
  align-self: start;
  align-content: start;
}
.admin-order-quote-card-wide {
  grid-column: 1 / -1;
}
.admin-order-quote-fields {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-order-quote-fields-primary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.admin-order-quote-fields-services {
  grid-template-columns: 1fr;
}
.admin-order-quote-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 14px;
  background: rgba(248, 245, 247, 0.72);
}
.admin-order-quote-field-wide {
  grid-column: 1 / -1;
}
.admin-order-quote-field-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.admin-order-quote-field-value,
.admin-order-quote-note {
  margin: 0;
  color: var(--foreground);
  font-size: 15px;
  line-height: 1.55;
  word-break: break-word;
}
.admin-order-quote-field-value {
  font-weight: 600;
}
.admin-order-quote-note {
  font-size: 14px;
}
`;

module.exports = {
  ADMIN_SHARED_DETAIL_SUPPLEMENTAL_STYLES,
};
