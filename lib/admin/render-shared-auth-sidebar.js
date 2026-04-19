"use strict";

function renderAdminAuthSidebar({ activeStep, escapeHtml, renderAdminSidebarBrand }) {
  const steps = [
    {
      key: "login",
      index: "01",
      title: "Вход",
      description: "Введите почту и пароль.",
    },
    {
      key: "dashboard",
      index: "02",
      title: "Панель",
      description: "После входа откроется админка.",
    },
  ];

  return `
      <div class="admin-sidebar-card">
        ${renderAdminSidebarBrand()}
        <p class="admin-sidebar-copy">Вход в рабочую панель SHYNLI CLEANING.</p>
        <div class="admin-step-list">
          ${steps
            .map(
              (step) => `<div class="admin-step${activeStep === step.key ? " admin-step-active" : ""}">
                <span class="admin-step-index">${step.index}</span>
                <div class="admin-step-copy">
                  <strong>${escapeHtml(step.title)}</strong>
                  <span>${escapeHtml(step.description)}</span>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="admin-sidebar-card admin-sidebar-card-muted">
        <p class="admin-sidebar-label">Как войти</p>
        <ul class="admin-feature-list">
          <li>Введите рабочую почту и пароль.</li>
          <li>После успешного входа сразу откроется админка.</li>
          <li>Никаких дополнительных кодов подтверждения не требуется.</li>
        </ul>
      </div>`;
}

module.exports = {
  renderAdminAuthSidebar,
};
