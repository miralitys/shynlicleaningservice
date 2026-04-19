"use strict";

const ADMIN_SHARED_DETAIL_PANELS_STYLES = String.raw`
.admin-client-panel-head {
  display: grid;
  gap: 14px;
}
.admin-client-title-block {
  display: grid;
  gap: 6px;
}
.admin-client-title {
  margin: 0;
  font-size: clamp(22px, 2vw, 30px);
  line-height: 1.15;
  word-break: break-word;
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
.admin-staff-dialog-title-role {
  color: var(--muted-foreground);
  font-weight: 600;
}
.admin-staff-dialog-address {
  word-break: break-word;
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
.admin-client-summary-panel,
.admin-client-section {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.94);
}
[data-admin-toggle-panel][hidden] {
  display: none !important;
}
[data-admin-order-amount-editor][hidden],
[data-admin-order-amount-action-for][hidden],
[data-admin-order-amount-edit-trigger][hidden],
[data-admin-order-payment-editor][hidden],
[data-admin-order-payment-action-for][hidden],
[data-admin-order-payment-edit-trigger][hidden],
[data-admin-order-team-editor][hidden],
[data-admin-order-team-action-for][hidden],
[data-admin-order-team-edit-trigger][hidden] {
  display: none !important;
}
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
.admin-client-summary-copy-block {
  display: grid;
  gap: 8px;
}
.admin-client-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.admin-client-summary-copy {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}
.admin-client-address-switcher {
  display: grid;
  gap: 10px;
}
.admin-client-address-head {
  align-items: center;
}
.admin-client-address-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.admin-client-address-editor {
  display: grid;
  gap: 10px;
}
.admin-client-address-input-list {
  display: grid;
  gap: 10px;
}
.admin-client-address-input-row {
  display: grid;
  gap: 8px;
}
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
.admin-client-address-remove-button {
  flex: 0 0 auto;
}
.admin-client-address-detail-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.admin-client-address-profile-section {
  display: grid;
  gap: 12px;
}
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
.admin-client-address-fact-value {
  font-size: 15px;
}
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
.admin-client-address-pill-meta {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.admin-client-metric-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-client-metric-grid-dialog {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.admin-client-metric-card,
.admin-client-contact-card {
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: rgba(255,255,255,0.84);
}
.admin-client-metric-card-wide {
  grid-column: 1 / -1;
}
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
.admin-client-metric-value {
  font-size: 15px;
  font-weight: 700;
}
.admin-client-info-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-client-info-grid-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.admin-client-info-grid-compact {
  grid-template-columns: 1fr;
}
.admin-client-info-card {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgba(228, 228, 231, 0.88);
  border-radius: 14px;
  background: rgba(249,250,251,0.92);
  min-width: 0;
}
.admin-client-info-card-wide {
  grid-column: 1 / -1;
}
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
.admin-order-section-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.92);
  box-shadow: var(--shadow-sm);
}
.admin-order-summary-panel {
  background: linear-gradient(180deg, rgba(249,250,251,0.96), rgba(255,255,255,0.98));
}
.admin-order-summary-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.admin-order-summary-copy-block {
  display: grid;
  gap: 10px;
}
.admin-order-summary-strip {
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: thin;
}
.admin-order-summary-strip > * {
  flex: 0 0 auto;
}
.admin-order-summary-copy,
.admin-order-summary-ok,
.admin-order-detail-copy,
.admin-order-detail-note {
  margin: 0;
}
.admin-order-summary-copy,
.admin-order-summary-ok,
.admin-order-detail-copy {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}
.admin-order-summary-ok {
  padding: 12px 14px;
  border: 1px solid rgba(15, 118, 110, 0.14);
  border-radius: 14px;
  background: rgba(15, 118, 110, 0.08);
  color: var(--success);
}
.admin-order-summary-flags {
  align-items: flex-start;
}
.admin-order-summary-grid,
.admin-order-detail-grid {
  display: grid;
  gap: 12px;
}
.admin-order-summary-card,
.admin-order-detail-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  align-content: start;
}
.admin-order-summary-card-compact {
  gap: 6px;
  max-width: min(280px, 100%);
  justify-self: start;
  padding: 10px 12px;
  background: rgba(250,250,251,0.78);
}
.admin-order-summary-card-danger {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(185, 28, 28, 0.06);
}
.admin-order-summary-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.admin-order-summary-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex: 0 0 auto;
}
.admin-order-summary-card-actions .admin-icon-button {
  flex: 0 0 auto;
}
.admin-order-summary-card-team {
  position: relative;
}
.admin-order-summary-card-team:has([data-admin-order-team-editor]:not([hidden])) {
  grid-column: 1 / -1;
  z-index: 12;
}
.admin-order-summary-card-value {
  margin: 0;
  font-size: 20px;
  line-height: 1.24;
  font-weight: 700;
  letter-spacing: -0.03em;
  word-break: break-word;
}
.admin-order-summary-card-note {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.admin-order-summary-card-compact .admin-order-summary-card-value {
  font-size: 16px;
  line-height: 1.35;
  letter-spacing: -0.02em;
}
.admin-order-summary-card-compact .admin-order-summary-card-note {
  font-size: 11px;
  line-height: 1.35;
}
.admin-order-highlight-editor {
  display: grid;
  gap: 8px;
  padding-top: 10px;
  margin-top: 4px;
  border-top: 1px solid rgba(228, 228, 231, 0.92);
}
.admin-order-highlight-editor-field {
  gap: 6px;
}
.admin-order-summary-card .admin-order-control-fields {
  grid-template-columns: 1fr;
  gap: 8px;
}
.admin-confirm-button {
  color: var(--success);
  background: rgba(15, 118, 110, 0.08);
  border-color: rgba(15, 118, 110, 0.18);
}
.admin-confirm-button:hover {
  color: #0b5f59;
  background: rgba(15, 118, 110, 0.14);
  border-color: rgba(15, 118, 110, 0.24);
}
.admin-close-button {
  color: var(--muted-foreground);
}
.admin-close-button:hover {
  color: var(--foreground);
}
.admin-order-detail-card-wide {
  grid-column: 1 / -1;
}
.admin-order-detail-card .admin-property-row {
  padding-bottom: 10px;
}
.admin-order-detail-note {
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}
.admin-order-brief-layout {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-order-brief-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,245,247,0.9));
}
.admin-order-brief-card-wide {
  grid-column: 1 / -1;
}
.admin-order-brief-copy {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.admin-order-brief-stack {
  display: grid;
  gap: 8px;
}
.admin-order-brief-overview {
  display: grid;
  gap: 6px;
  grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(150px, 0.58fr));
  align-items: start;
}
.admin-order-brief-metric {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 12px;
  background: rgba(255,255,255,0.84);
}
.admin-order-brief-metric-wide {
  grid-column: span 1;
}
.admin-order-brief-metric-label,
.admin-order-brief-fact-label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.admin-order-brief-metric-value,
.admin-order-brief-fact-value {
  margin: 0;
  color: var(--foreground);
  font-weight: 700;
  letter-spacing: -0.03em;
  word-break: break-word;
}
.admin-order-brief-metric-value {
  font-size: 18px;
  line-height: 1.22;
}
.admin-order-brief-metric-meta {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.admin-order-brief-payment,
.admin-order-brief-payment .admin-inline-badge-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.admin-order-brief-fact-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.admin-order-brief-fact {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 10px;
  background: rgba(255,255,255,0.78);
}
.admin-order-brief-fact-wide {
  grid-column: 1 / -1;
}
.admin-order-brief-fact-value {
  font-size: 13px;
  line-height: 1.35;
  font-weight: 600;
}
.admin-order-service-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.admin-order-service-pill {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid rgba(158, 67, 90, 0.14);
  border-radius: 999px;
  background: rgba(158, 67, 90, 0.08);
  color: var(--accent);
  font-size: 11px;
  line-height: 1.35;
  font-weight: 600;
}
.admin-order-service-empty,
.admin-order-client-note {
  margin: 0;
  padding: 8px 10px;
  border-radius: 12px;
}
.admin-order-service-empty {
  border: 1px dashed rgba(158, 67, 90, 0.18);
  background: rgba(255,255,255,0.76);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.admin-order-address-hero {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 12px;
  background: rgba(255,255,255,0.84);
}
.admin-order-address-main {
  margin: 0;
  color: var(--foreground);
  font-size: 16px;
  line-height: 1.28;
  font-weight: 700;
  letter-spacing: -0.02em;
  word-break: break-word;
}
.admin-order-address-sub {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
  word-break: break-word;
}
.admin-order-client-note {
  border: 1px solid rgba(228, 228, 231, 0.92);
  background: rgba(248,245,247,0.76);
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}
.admin-order-media-stack {
  display: grid;
  gap: 16px;
}
.admin-order-media-layout,
.admin-order-completion-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-order-media-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  background: rgba(250,250,251,0.9);
}
.admin-order-media-head {
  align-items: flex-start;
}
.admin-order-media-copy {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.admin-order-media-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.admin-order-media-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.admin-order-media-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
  border-radius: 16px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  background: rgba(255,255,255,0.96);
  box-shadow: var(--shadow-sm);
}
.admin-order-media-caption {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}
.admin-order-media-empty {
  padding: 14px;
  border: 1px dashed rgba(158, 67, 90, 0.18);
  border-radius: 16px;
  background: rgba(255,255,255,0.82);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.admin-file-input {
  padding: 14px 16px;
}
.admin-input-help {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.admin-order-completion-feedback {
  margin-top: 2px;
}
.admin-order-completion-panel,
.admin-order-cleaner-comment-form {
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: var(--radius-md);
  background: rgba(250,250,251,0.9);
}
.admin-order-cleaner-comment-feedback {
  margin-top: 2px;
}
.admin-action-hint-hidden {
  display: none !important;
}
.admin-order-comment-field {
  min-height: 140px;
  resize: vertical;
}
.admin-order-side-card {
  gap: 12px;
}
.admin-order-control-form {
  gap: 10px;
}
.admin-order-control-fields,
.admin-order-control-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-order-control-field {
  gap: 6px;
  font-size: 13px;
}
.admin-order-control-field-wide {
  grid-column: 1 / -1;
}
.admin-order-multiselect {
  position: relative;
}
.admin-order-multiselect[open] {
  z-index: 48;
}
.admin-order-multiselect > summary {
  list-style: none;
}
.admin-order-multiselect > summary::-webkit-details-marker {
  display: none;
}
.admin-order-multiselect-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 46px;
  cursor: pointer;
}
.admin-order-multiselect-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.admin-order-multiselect-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--muted);
  flex: 0 0 auto;
  transition: transform 0.18s ease, color 0.18s ease;
}
.admin-order-multiselect-icon svg {
  width: 18px;
  height: 18px;
}
.admin-order-multiselect[open] .admin-order-multiselect-icon {
  transform: rotate(180deg);
  color: var(--foreground);
}
.admin-order-multiselect-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: auto;
  width: min(420px, calc(100vw - 96px));
  min-width: min(320px, 100%);
  max-width: calc(100vw - 96px);
  z-index: 49;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 16px;
  background: rgba(255,255,255,0.98);
  box-shadow: var(--shadow-sm);
  max-height: min(320px, calc(100vh - 220px));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.admin-order-multiselect-list {
  display: grid;
  gap: 6px;
}
.admin-order-multiselect-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(228, 228, 231, 0.92);
  border-radius: 12px;
  background: rgba(250,250,251,0.92);
  font-size: 13px;
  line-height: 1.4;
  color: var(--foreground);
  cursor: pointer;
}
.admin-order-quote-section .admin-subsection-head {
  margin-bottom: 2px;
}
.admin-order-quote-section .admin-subsection-title {
  font-size: 15px;
}
.admin-order-quote-section .admin-subsection-head + .admin-order-brief-layout {
  margin-top: -2px;
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
.admin-order-multiselect-empty {
  padding: 8px 10px;
  border: 1px dashed rgba(158, 67, 90, 0.18);
  border-radius: 12px;
  background: rgba(255,255,255,0.84);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.admin-order-multiselect-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: 0 0 auto;
}
.admin-order-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.admin-order-primary-action {
  flex: 1 1 220px;
}
.admin-order-action-row > .admin-button-secondary {
  flex: 0 1 auto;
}
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
  ADMIN_SHARED_DETAIL_PANELS_STYLES,
};
