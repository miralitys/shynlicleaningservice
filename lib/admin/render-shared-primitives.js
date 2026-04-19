"use strict";

function renderAdminBadge(escapeHtml, label, tone = "default") {
  const toneClass =
    tone === "success"
      ? " admin-badge-success"
      : tone === "muted"
        ? " admin-badge-muted"
        : tone === "danger"
          ? " admin-badge-danger"
          : tone === "outline"
            ? " admin-badge-outline"
            : "";
  return `<span class="admin-badge${toneClass}">${escapeHtml(label)}</span>`;
}

function renderAdminCard(escapeHtml, title, description, body, options = {}) {
  const eyebrow = options.eyebrow ? `<p class="admin-card-eyebrow">${escapeHtml(options.eyebrow)}</p>` : "";
  const baseClass = options.muted ? "admin-card admin-card-muted" : "admin-card";
  const cardClass = options.className ? `${baseClass} ${options.className}` : baseClass;
  const headerClass = options.headerClass ? `admin-card-header ${options.headerClass}` : "admin-card-header";
  const contentClass = options.contentClass ? `admin-card-content ${options.contentClass}` : "admin-card-content";
  return `<section class="${cardClass}">
      ${(eyebrow || title || description) ? `<div class="${headerClass}">
        ${eyebrow}
        ${title ? `<h2 class="admin-card-title">${escapeHtml(title)}</h2>` : ""}
        ${description ? `<p class="admin-card-description">${escapeHtml(description)}</p>` : ""}
      </div>` : ""}
      <div class="${contentClass}">
        ${body}
      </div>
    </section>`;
}

function renderAdminPropertyList(escapeHtml, rows = []) {
  return `<div class="admin-property-list">
      ${rows
        .map(
          (row) => `<div class="admin-property-row">
            <span class="admin-property-label">${escapeHtml(row.label)}</span>
            <span class="admin-property-value">${row.raw ? row.value : escapeHtml(row.value)}</span>
          </div>`
        )
        .join("")}
    </div>`;
}

module.exports = {
  renderAdminBadge,
  renderAdminCard,
  renderAdminPropertyList,
};
