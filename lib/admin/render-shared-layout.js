"use strict";

const {
  ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT,
} = require("./render-shared-picker-multiselect-script");
const {
  ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT,
  ADMIN_SHARED_DIALOG_STATE_SCRIPT,
} = require("./render-shared-dialog-toggle-script");
const {
  ADMIN_SHARED_ORDER_COMPLETION_AND_EDITOR_SCRIPT,
} = require("./render-shared-order-completion-editor-script");
const {
  ADMIN_SHARED_GHL_SMS_SCRIPT,
} = require("./render-shared-ghl-sms-script");
const {
  ADMIN_SHARED_ESCAPE_HTML_SCRIPT,
} = require("./render-shared-escape-html-script");
const {
  ADMIN_SHARED_CORE_STYLES,
} = require("./render-shared-core-styles");
const {
  ADMIN_SHARED_DIALOG_PANEL_STYLES,
} = require("./render-shared-dialog-panel-styles");
const {
  ADMIN_SHARED_RESPONSIVE_STYLES,
} = require("./render-shared-responsive-styles");
const {
  ADMIN_SHARED_AUTO_SUBMIT_PHONE_SCRIPT,
} = require("./render-shared-auto-submit-phone-script");
const {
  ADMIN_SHARED_ASYNC_FORMS_SCRIPT,
} = require("./render-shared-async-forms-script");
const {
  ADMIN_SHARED_QUOTE_OPS_STYLES,
} = require("./render-shared-quote-ops-styles");
const {
  ADMIN_SHARED_WORKSPACE_STYLES,
} = require("./render-shared-workspace-styles");
const {
  ADMIN_SHARED_DETAIL_PANELS_STYLES,
} = require("./render-shared-detail-panels-styles");
const {
  ADMIN_SHARED_QUOTE_TASK_STYLES,
} = require("./render-shared-quote-task-styles");
const {
  ADMIN_SHARED_LAYOUT_EXTRA_STYLES,
} = require("./render-shared-layout-extra-styles");
const {
  ADMIN_SHARED_LAYOUT_RUNTIME_SCRIPT,
} = require("./render-shared-layout-runtime-script");

function renderAdminLayoutMarkup(title, content, options = {}, escapeHtml) {
  const pageTitle = `${title} | SHYNLI CLEANING`;
  const subtitle = options.subtitle
    ? `<div class="admin-hero-summary"><p class="admin-subtitle">${escapeHtml(options.subtitle)}</p></div>`
    : "";
  const heroMeta = options.heroMeta ? `<div class="admin-hero-meta">${options.heroMeta}</div>` : "";
  const heroActions = options.heroActions ? `<div class="admin-hero-actions">${options.heroActions}</div>` : "";
  const heroSide = subtitle || heroActions ? `<div class="admin-hero-side">${subtitle}${heroActions}</div>` : "";
  const bodyScripts = options.bodyScripts || "";
  const kicker = options.kicker === false ? "" : escapeHtml(options.kicker || "SHYNLI CLEANING");
  const sidebar = options.sidebar ? `<aside class="admin-sidebar">${options.sidebar}</aside>` : "";
  const shellClass = options.sidebar ? "admin-shell admin-shell-with-sidebar" : "admin-shell";

  return `<!DOCTYPE html>
  <html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(pageTitle)}</title>
    <style>
${ADMIN_SHARED_CORE_STYLES}
${ADMIN_SHARED_DIALOG_PANEL_STYLES}
${ADMIN_SHARED_QUOTE_OPS_STYLES}
${ADMIN_SHARED_WORKSPACE_STYLES}
${ADMIN_SHARED_DETAIL_PANELS_STYLES}
${ADMIN_SHARED_QUOTE_TASK_STYLES}
${ADMIN_SHARED_LAYOUT_EXTRA_STYLES}
${ADMIN_SHARED_RESPONSIVE_STYLES}
    </style>
  </head>
  <body>
    <main class="${shellClass}">
      ${sidebar}
      <section class="admin-panel">
        <div class="admin-hero">
          <div class="admin-hero-head">
            <div class="admin-hero-copy">
              ${kicker ? `<p class="admin-kicker">${kicker}</p>` : ""}
              <h1 class="admin-title">${escapeHtml(title)}</h1>
            </div>
            ${heroSide}
          </div>
          ${heroMeta}
        </div>
        <div class="admin-content">
          ${content}
        </div>
      </section>
    </main>
    <dialog class="admin-dialog admin-confirm-dialog" id="admin-confirm-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-copy">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-copy-block">
          <p class="admin-card-eyebrow">Подтверждение</p>
          <h2 class="admin-dialog-title" id="admin-confirm-title">Точно удалить?</h2>
          <p class="admin-dialog-copy" id="admin-confirm-copy" hidden></p>
        </div>
        <div class="admin-inline-actions admin-confirm-dialog-actions">
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-confirm-dialog">Нет</button>
          <button class="admin-button" type="button" data-admin-confirm-accept="true">Да</button>
        </div>
      </div>
    </dialog>
    <script>
      (() => {
${ADMIN_SHARED_AUTO_SUBMIT_PHONE_SCRIPT}

${ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT}

${ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT}

${ADMIN_SHARED_ORDER_COMPLETION_AND_EDITOR_SCRIPT}

${ADMIN_SHARED_ESCAPE_HTML_SCRIPT}

${ADMIN_SHARED_GHL_SMS_SCRIPT}

${ADMIN_SHARED_ASYNC_FORMS_SCRIPT}

${ADMIN_SHARED_LAYOUT_RUNTIME_SCRIPT}

${ADMIN_SHARED_DIALOG_STATE_SCRIPT}
      })();
    </script>
    ${bodyScripts}
  </body>
  </html>`;
  }


module.exports = {
  renderAdminLayoutMarkup,
};
