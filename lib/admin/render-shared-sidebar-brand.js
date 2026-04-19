"use strict";

function renderAdminSidebarBrand(options = {}) {
  const {
    label = "SHYNLI CLEANING",
    title = "Панель управления",
    brandClassName = "",
    copyClassName = "",
  } = options;

  return `<div class="admin-brand${brandClassName ? ` ${brandClassName}` : ""}">
    <div class="admin-brand-mark">S</div>
    <div${copyClassName ? ` class="${copyClassName}"` : ""}>
      <p class="admin-sidebar-label">${label}</p>
      <h2 class="admin-sidebar-title">${title}</h2>
    </div>
  </div>`;
}

module.exports = {
  renderAdminSidebarBrand,
};
