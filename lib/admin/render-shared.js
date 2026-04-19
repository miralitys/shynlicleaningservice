"use strict";

const {
  ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT,
} = require("./render-shared-picker-multiselect-script");
const {
  renderAdminSidebarBrand,
} = require("./render-shared-sidebar-brand");
const {
  renderAdminAuthSidebar: renderAdminAuthSidebarMarkup,
} = require("./render-shared-auth-sidebar");
const {
  renderAdminAppSidebar: renderAdminAppSidebarMarkup,
} = require("./render-shared-app-sidebar");
const {
  renderAdminLayoutMarkup,
} = require("./render-shared-layout");

function createAdminSharedRenderers(deps = {}) {
  const {
    adminAuth,
    ADMIN_APP_NAV_ITEMS,
    ADMIN_LOGIN_PATH,
    ADMIN_2FA_PATH,
    ADMIN_LOGOUT_PATH,
    QUOTE_PUBLIC_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
  } = deps;

  function renderAdminBadge(label, tone = "default") {
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

  function renderAdminCard(title, description, body, options = {}) {
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

  function renderAdminAuthSidebar(activeStep) {
    return renderAdminAuthSidebarMarkup({
      activeStep,
      escapeHtml,
      renderAdminSidebarBrand,
    });
  }

  function renderAdminAppSidebar(activePath, options = {}) {
    return renderAdminAppSidebarMarkup({
      activePath,
      options,
      ADMIN_APP_NAV_ITEMS,
      ADMIN_LOGOUT_PATH,
      escapeHtml,
      renderAdminBadge,
      renderAdminSidebarBrand,
    });
  }

  function renderAdminLayout(title, content, options = {}) {
    return renderAdminLayoutMarkup(title, content, options, escapeHtml);
  }

  function renderAdminUnavailablePage() {
    return renderAdminLayout(
      "Админка недоступна",
      `${renderAdminCard(
        "Вход временно недоступен",
        "Нужные настройки для входа пока не завершены.",
        `<div class="admin-alert admin-alert-error">Админка сейчас недоступна. Пожалуйста, обратитесь к разработчику.</div>`,
        { eyebrow: "Статус", muted: true }
      )}`,
      {
        kicker: "SHYNLI CLEANING",
        subtitle: "Как только настройки будут готовы, вход снова заработает.",
        sidebar: renderAdminAuthSidebar("login"),
      }
    );
  }

  function renderLoginPage(config, options = {}) {
    const errorBlock = options.error
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
      : "";
    const infoBlock = options.info
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(options.info)}</div>`
      : "";
    const requiresSecondFactor = Boolean(options.requireSecondFactor);

    return renderAdminLayout(
      "Вход в админку",
      `${errorBlock}
        ${infoBlock}
        <div class="admin-section-grid admin-form-grid-two">
          ${renderAdminCard(
            "Вход",
            requiresSecondFactor
              ? "Введите почту и пароль. После этого потребуется код из приложения."
              : "Введите почту и пароль.",
            `<form class="admin-form" method="post" action="${ADMIN_LOGIN_PATH}" autocomplete="on">
              <label class="admin-label">
                Почта
                <input class="admin-input" type="email" name="email" value="${escapeHtmlText(options.email || config.email)}" autocomplete="username" required>
              </label>
              <label class="admin-label">
                Пароль
                <input class="admin-input" type="password" name="password" autocomplete="current-password" required>
              </label>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Продолжить</button>
                <span class="admin-action-hint">${
                  requiresSecondFactor
                    ? "После проверки пароля откроется шаг подтверждения по коду."
                    : "После успешного входа админка откроется сразу."
                }</span>
              </div>
            </form>`,
            { eyebrow: "Вход" }
          )}
          ${renderAdminCard(
            "Дальше",
            requiresSecondFactor
              ? "После логина и пароля потребуется код из приложения-аутентификатора."
              : "Весь доступ теперь работает только по логину и паролю.",
            `<ul class="admin-feature-list">
              <li>Owner, admin и manager входят через эту же форму.</li>
              <li>${
                requiresSecondFactor
                  ? "После успешной проверки почты и пароля откроется шаг с кодом подтверждения."
                  : "После успешной проверки почты и пароля открывается рабочая панель."
              }</li>
              <li>${
                requiresSecondFactor
                  ? "Подойдут Google Authenticator, 1Password и похожие приложения."
                  : "Дополнительные шаги подтверждения больше не используются."
              }</li>
            </ul>`,
            { eyebrow: "Подсказка", muted: true }
          )}
        </div>`,
      {
        subtitle: requiresSecondFactor
          ? "Введите рабочую почту и пароль, затем подтвердите вход кодом из приложения."
          : "Введите рабочую почту и пароль, чтобы сразу открыть админку.",
        sidebar: renderAdminAuthSidebar("login"),
      }
    );
  }

  function renderTwoFactorPage(config, options = {}) {
    const errorBlock = options.error
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
      : "";
    const secret = options.secret || adminAuth.getTotpSecretMaterial(config);
    const qrMarkup = options.qrMarkup || "";

    return renderAdminLayout(
      "Подтверждение входа",
      `${errorBlock}
        <div class="admin-section-grid admin-form-grid-two">
          ${renderAdminCard(
            "Код из приложения",
            "Введите текущий 6-значный код.",
            `<form class="admin-form" method="post" action="${ADMIN_2FA_PATH}" autocomplete="off">
              <label class="admin-label">
                Код
                <input class="admin-input admin-input-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" name="code" placeholder="123456" autocomplete="one-time-code" required>
              </label>
              <p class="admin-field-note">Шаг 2 из 2.</p>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Подтвердить вход</button>
                <a class="admin-link-button admin-button-secondary" href="${ADMIN_LOGIN_PATH}">Назад</a>
              </div>
            </form>`,
            { eyebrow: "Код" }
          )}
          ${renderAdminCard(
            "Настройка приложения",
            "Если приложение ещё не подключено, используйте QR-код или ключ ниже.",
            `<details class="admin-details" open>
              <summary>QR-код и ключ</summary>
              <div class="admin-form-grid admin-form-grid-two" style="margin-top:14px;">
                ${renderAdminCard(
                  "QR-код",
                  "Откройте приложение и отсканируйте код.",
                  qrMarkup
                    ? `<div class="admin-qr-card">
                        ${qrMarkup}
                        <p class="admin-field-note">Подойдёт Google Authenticator, 1Password и похожие приложения.</p>
                      </div>`
                    : `<p class="admin-field-note">Если QR-код не появился, используйте ключ вручную.</p>`,
                  { eyebrow: "QR", muted: true }
                )}
                ${renderAdminCard(
                  "Ключ вручную",
                  "Введите эти данные в приложении, если QR-код не используется.",
                  `<div class="admin-property-list">
                    <div class="admin-property-row">
                      <span class="admin-property-label">Сервис</span>
                      <span class="admin-property-value">${escapeHtml(config.issuer)}</span>
                    </div>
                    <div class="admin-property-row">
                      <span class="admin-property-label">Аккаунт</span>
                      <span class="admin-property-value">${escapeHtml(config.email)}</span>
                    </div>
                    <div class="admin-property-row">
                      <span class="admin-property-label">Ключ</span>
                      <span class="admin-property-value"><code>${escapeHtml(secret.base32)}</code></span>
                    </div>
                  </div>`,
                  { eyebrow: "Ключ", muted: true }
                )}
              </div>
            </details>`,
            { eyebrow: "Настройка", muted: true }
          )}
        </div>`,
      {
        subtitle: "Введите код из приложения для подтверждения входа.",
        sidebar: renderAdminAuthSidebar("2fa"),
      }
    );
  }

  function renderAdminPropertyList(rows = []) {
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

  return {
    renderAdminAppSidebar,
    renderAdminAuthSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
    renderAdminUnavailablePage,
    renderLoginPage,
    renderTwoFactorPage,
  };
}

module.exports = {
  createAdminSharedRenderers,
};
