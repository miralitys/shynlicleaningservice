"use strict";

const {
  getStaffCleanerConfirmationState,
} = require("../cleaner-confirmation");

const {
  W9_FEDERAL_TAX_CLASSIFICATIONS,
  W9_TIN_TYPES,
  formatW9FederalTaxClassificationLabel,
  formatW9TinTypeLabel,
} = require("../staff-w9");
const {
  formatTravelEstimateUnavailableText,
} = require("../staff-travel-estimates");

function createAccountRenderers(deps = {}) {
  const {
    ACCOUNT_CONTRACT_DOWNLOAD_PATH,
    ACCOUNT_W9_DOWNLOAD_PATH,
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_LOGOUT_PATH,
    ACCOUNT_ROOT_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatOrderCountLabel,
    normalizeString,
    renderStaffStatusBadge,
    shared,
  } = deps;
  const {
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
  } = shared;
  const ACCOUNT_W9_SECTION_ID = "account-w9";

  function isAdminWorkspaceRole(role) {
    const normalized = String(role || "").trim().toLowerCase();
    return normalized === "admin" || normalized === "manager";
  }

  function isEmployeeLinkedUser(user) {
    if (!user || typeof user !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(user, "isEmployee")) {
      const rawValue = String(user.isEmployee || "").trim().toLowerCase();
      return user.isEmployee === true || rawValue === "1" || rawValue === "true" || rawValue === "yes" || rawValue === "on";
    }
    return !isAdminWorkspaceRole(user.role);
  }

  function isW9NextPath(nextPath = "") {
    const raw = String(nextPath || "");
    return raw.includes("focus=w9") || raw.includes(`#${ACCOUNT_W9_SECTION_ID}`);
  }

  function formatPhone(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Не указан";
    let digits = raw.replace(/\D+/g, "");
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }
    if (digits.length === 10) {
      return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return "Не указан";
  }

  function formatPhoneFieldValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let digits = raw.replace(/\D+/g, "");
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }
    return digits.slice(0, 10);
  }

  function formatPhoneHref(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let digits = raw.replace(/\D+/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    return digits.length >= 7 ? `+${digits}` : "";
  }

  function renderPhoneInput(name, value = "") {
    const onInputAttr = " oninput=\"this.value=this.value.replace(/\\D+/g,'').slice(0,10)\"";
    return `<label class="admin-label">
      Телефон
      <input class="admin-input admin-phone-input" type="tel" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlText(formatPhoneFieldValue(value))}" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="6305550101"${onInputAttr}>
    </label>`;
  }

  function buildAccountSectionHref(section = "dashboard") {
    return section === "payroll" ? `${ACCOUNT_ROOT_PATH}?section=payroll` : ACCOUNT_ROOT_PATH;
  }

  function renderAccountSidebar(userContext, activeKey = "dashboard") {
    const user = userContext && userContext.user ? userContext.user : null;
    const staffRecord = userContext && userContext.staffRecord ? userContext.staffRecord : null;
    const assignmentCount = userContext && Number.isFinite(userContext.assignmentCount) ? userContext.assignmentCount : 0;

    const statusBadges = [
      staffRecord ? renderStaffStatusBadge(staffRecord.status) : renderAdminBadge("Не привязан", "danger"),
      assignmentCount > 0 ? renderAdminBadge(formatOrderCountLabel(assignmentCount), "outline") : renderAdminBadge("Пока без заявок", "muted"),
    ].join("");

    const sidebarLinks = [
      { key: "dashboard", label: "Мой кабинет", href: buildAccountSectionHref("dashboard") },
      { key: "payroll", label: "Зарплаты", href: buildAccountSectionHref("payroll") },
    ];

    return `<div class="admin-sidebar-card">
      <div class="admin-brand">
        <div class="admin-brand-mark">S</div>
        <div>
          <p class="admin-sidebar-label">SHYNLI CLEANING</p>
          <h2 class="admin-sidebar-title">Кабинет сотрудника</h2>
        </div>
      </div>
      <p class="admin-sidebar-copy">Личный доступ к назначенным заявкам и профилю.</p>
      <div class="admin-badge-row">${statusBadges}</div>
      <nav class="admin-nav" style="margin-top:18px;">
        <div class="admin-nav-group">
          ${sidebarLinks
            .map((item) => `<a class="admin-nav-link${item.key === activeKey ? " admin-nav-link-active" : ""}" href="${item.href}">${escapeHtml(item.label)}</a>`)
            .join("")}
        </div>
      </nav>
      <div class="admin-divider" style="margin:18px 0;"></div>
      ${renderAdminPropertyList([
        { label: "Сотрудник", value: staffRecord ? staffRecord.name : "Не найден" },
        { label: "Email", value: user ? user.email : "Не указан" },
        { label: "Телефон", value: user ? formatPhone(user.phone) : "Не указан" },
      ])}
      <div class="admin-inline-actions admin-sidebar-actions">
        <form class="admin-logout-form" method="post" action="${ACCOUNT_LOGOUT_PATH}" data-admin-logout-form="true">
          <button class="admin-button admin-button-secondary" type="submit" data-admin-logout-trigger="true">Выйти</button>
        </form>
      </div>
    </div>`;
  }

  function renderAccountSystemNotice(message, tone = "info", timeoutMs = 5000) {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return "";
    const normalizedTone = tone === "error" ? "error" : tone === "muted" ? "muted" : "info";
    const alertClass =
      normalizedTone === "error"
        ? "admin-alert admin-alert-error"
        : normalizedTone === "muted"
          ? "admin-alert admin-alert-muted"
          : "admin-alert admin-alert-info";
    const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : 5000;
    const liveMode = normalizedTone === "error" ? "assertive" : "polite";

    return `<div class="${alertClass} account-system-notice" data-account-system-notice="true" data-account-notice-timeout="${escapeHtmlAttribute(
      String(timeout)
    )}" role="status" aria-live="${escapeHtmlAttribute(liveMode)}">
      <button class="account-system-notice-close" type="button" data-account-notice-close="true" aria-label="Закрыть уведомление">×</button>
      <span class="account-system-notice-copy">${escapeHtml(normalizedMessage)}</span>
    </div>`;
  }

  function renderAccountSystemNoticeChrome() {
    return `<style>
      .account-system-notice-stack {
        position: fixed;
        top: max(16px, env(safe-area-inset-top));
        left: 50%;
        z-index: 1000;
        width: min(560px, calc(100vw - 24px));
        transform: translateX(-50%);
        display: grid;
        gap: 10px;
        margin: 0;
        pointer-events: none;
      }
      .account-system-notice.admin-alert {
        position: relative;
        pointer-events: auto;
        display: block;
        padding: 18px 56px 18px 18px;
        border: 1px solid rgba(15, 118, 110, 0.24);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(248, 255, 252, 0.98), rgba(236, 248, 244, 0.98));
        color: #08746d;
        box-shadow:
          0 18px 36px rgba(32, 20, 30, 0.14),
          inset 0 1px 0 rgba(255, 255, 255, 0.78);
        font-size: 17px;
        font-weight: 700;
        line-height: 1.45;
        letter-spacing: normal;
        animation: accountNoticeEnter 180ms ease both;
        transition: opacity 220ms ease, transform 220ms ease, filter 220ms ease;
      }
      .account-system-notice.admin-alert-info {
        border-color: rgba(15, 118, 110, 0.24);
        background:
          linear-gradient(180deg, rgba(248, 255, 252, 0.98), rgba(236, 248, 244, 0.98));
        color: #08746d;
      }
      .account-system-notice.admin-alert-error {
        border-color: rgba(185, 28, 28, 0.22);
        background:
          linear-gradient(180deg, rgba(255, 248, 249, 0.98), rgba(254, 238, 242, 0.98));
        color: #9f263f;
      }
      .account-system-notice.admin-alert-muted {
        border-color: rgba(113, 113, 122, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 246, 249, 0.98));
        color: #52525b;
      }
      .account-system-notice-copy {
        display: block;
        max-width: 100%;
      }
      .account-system-notice-close {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 34px;
        height: 34px;
        border: 1px solid rgba(8, 116, 109, 0.18);
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.72);
        color: currentColor;
        font: inherit;
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
      }
      .account-system-notice-close:focus-visible {
        outline: 3px solid rgba(8, 116, 109, 0.28);
        outline-offset: 2px;
      }
      .account-desktop-status-row {
        align-items: center;
      }
      .account-desktop-inline-action-form {
        margin: 0;
        display: inline-flex;
      }
      .account-desktop-inline-action-button {
        min-height: 28px;
        padding: 0 12px;
        border: 1px solid transparent;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #8f3f5c;
        color: #fff;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: none;
      }
      .account-desktop-inline-action-button-secondary {
        background: rgba(255, 255, 255, 0.96);
        color: #5d3143;
        border-color: rgba(126, 55, 77, 0.18);
      }
      .account-desktop-inline-action-button:focus-visible {
        outline: 3px solid rgba(143, 63, 92, 0.22);
        outline-offset: 2px;
      }
      @keyframes accountNoticeEnter {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .account-system-notice.is-leaving {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
        filter: blur(2px);
      }
      @media (max-width: 720px) {
        .account-system-notice-stack {
          top: max(10px, env(safe-area-inset-top));
          width: calc(100vw - 20px);
        }
        .account-system-notice.admin-alert {
          padding: 15px 52px 15px 16px;
          border-radius: 20px;
          font-size: 15px;
        }
      }
    </style>
    <script>
      (() => {
        window.bindAccountSystemNotices = window.bindAccountSystemNotices || (() => {
          const notices = Array.from(document.querySelectorAll('[data-account-system-notice="true"]:not([data-account-notice-bound="true"])'));
          if (!notices.length) return;
          notices.forEach((node) => {
            node.setAttribute("data-account-notice-bound", "true");
            const stack = node.closest(".account-system-notice-stack");
            if (stack && stack.parentNode !== document.body) {
              document.body.appendChild(stack);
            }
            const closeButton = node.querySelector("[data-account-notice-close='true']");
            if (closeButton instanceof HTMLButtonElement) {
              closeButton.addEventListener("click", () => {
                node.classList.add("is-leaving");
                window.setTimeout(() => {
                  if (node.parentNode) {
                    node.parentNode.removeChild(node);
                  }
                }, 220);
              });
            }
            const timeoutMs = Number(node.getAttribute("data-account-notice-timeout") || "0");
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
            window.setTimeout(() => {
              node.classList.add("is-leaving");
              window.setTimeout(() => {
                if (node.parentNode) {
                  node.parentNode.removeChild(node);
                }
              }, 260);
            }, timeoutMs);
          });
        });
        window.bindAccountSystemNotices();
      })();
    </script>`;
  }

  function renderAccountNotice(notice, noticeMessage = "") {
    const normalizedNoticeMessage = String(noticeMessage || "").trim();
    if (notice === "profile-saved") {
      return renderAccountSystemNotice("Профиль обновлён.");
    }
    if (notice === "password-saved") {
      return renderAccountSystemNotice("Пароль обновлён.");
    }
    if (notice === "profile-error") {
      return renderAccountSystemNotice(
        "Не удалось сохранить профиль. Проверьте email и телефон.",
        "error"
      );
    }
    if (notice === "password-error") {
      return renderAccountSystemNotice(
        "Не удалось изменить пароль. Проверьте текущий пароль и совпадение новых значений.",
        "error"
      );
    }
    if (notice === "w9-saved") {
      return renderAccountSystemNotice(
        "Документы сотрудника сохранены. Contract и W-9 автоматически прикреплены к вашей карточке сотрудника."
      );
    }
    if (notice === "w9-error") {
      return renderAccountSystemNotice(
        "Не удалось собрать документы сотрудника. Проверьте обязательные поля, TIN, подпись и подтверждение сертификата.",
        "error"
      );
    }
    if (notice === "contract-error") {
      return renderAccountSystemNotice(
        "Не удалось открыть договор сотрудника. Попробуйте сформировать документы заново или обратитесь к администратору.",
        "error"
      );
    }
    if (notice === "assignment-confirmed") {
      return renderAccountSystemNotice("Вы подтвердили заказ. Администратор увидит это в расписании.");
    }
    if (notice === "assignment-en-route") {
      return renderAccountSystemNotice(
        "Вы отметили, что уже выехали на заказ. Карточка перенесена в этап «В пути»."
      );
    }
    if (notice === "assignment-cleaning-started") {
      return renderAccountSystemNotice(
        "Вы отметили, что начинаете уборку. Карточка перенесена в этап «Начать уборку»."
      );
    }
    if (notice === "assignment-checklist-opened") {
      return renderAccountSystemNotice(
        "Открыт этап «Чеклист». Отметьте выполненные пункты и сохраните результат."
      );
    }
    if (notice === "assignment-checklist") {
      return renderAccountSystemNotice("Чеклист сохранён. Теперь можно перейти к фото до и после.");
    }
    if (notice === "assignment-checklist-complete") {
      return renderAccountSystemNotice("Чеклист выполнен. Открылся этап «Фото».");
    }
    if (notice === "assignment-photos-opened") {
      return renderAccountSystemNotice(
        "Открыт этап «Фото». Загрузите фото до и после уборки."
      );
    }
    if (notice === "assignment-photos") {
      return renderAccountSystemNotice(
        "Фото до и после сохранены. Карточка перенесена в этап «Фото»."
      );
    }
    if (notice === "assignment-photos-complete") {
      return renderAccountSystemNotice("Этап «Фото» закрыт. Заказ перенесён в «Уборка завершена».");
    }
    if (notice === "assignment-note-saved") {
      return renderAccountSystemNotice("Заметка сохранена.");
    }
    if (notice === "assignment-cleaning-complete") {
      return renderAccountSystemNotice(
        "Вы отметили, что уборка завершена. Карточка перенесена в этап «Уборка завершена»."
      );
    }
    if (notice === "assignment-declined") {
      return renderAccountSystemNotice(
        "Вы отметили, что не подтверждаете этот заказ. Администратор увидит это в расписании.",
        "error"
      );
    }
    if (notice === "assignment-error") {
      return renderAccountSystemNotice(
        normalizedNoticeMessage ||
          "Не удалось обновить подтверждение заказа. Попробуйте ещё раз или обратитесь к администратору.",
        "error"
      );
    }
    return "";
  }

  function renderW9FederalTaxClassificationOptions(selectedValue = "") {
    const selected = String(selectedValue || "");
    return [
      `<option value="">Выберите вариант</option>`,
      ...W9_FEDERAL_TAX_CLASSIFICATIONS.map(
        (value) =>
          `<option value="${escapeHtmlAttribute(value)}"${selected === value ? " selected" : ""}>${escapeHtml(
            formatW9FederalTaxClassificationLabel(value)
          )}</option>`
      ),
    ].join("");
  }

  function renderW9TinTypeOptions(selectedValue = "") {
    const selected = String(selectedValue || "");
    return W9_TIN_TYPES.map(
      (value) =>
        `<option value="${escapeHtmlAttribute(value)}"${selected === value ? " selected" : ""}>${escapeHtml(
          formatW9TinTypeLabel(value)
        )}</option>`
    ).join("");
  }

  function getDraftW9Value(w9Draft, key, fallback = "") {
    if (w9Draft && Object.prototype.hasOwnProperty.call(w9Draft, key)) {
      return String(w9Draft[key] || "");
    }
    return fallback;
  }

  function getDraftW9Boolean(w9Draft, key, fallback = false) {
    if (w9Draft && Object.prototype.hasOwnProperty.call(w9Draft, key)) {
      return Boolean(w9Draft[key]);
    }
    return fallback;
  }

  function renderAccountW9SignaturePad(hasExistingW9 = false, signatureDataUrl = "") {
    const normalizedSignatureDataUrl = String(signatureDataUrl || "");
    return `<div class="account-signature-field" data-account-signature-pad data-account-w9-field="signature" data-has-signature="${normalizedSignatureDataUrl ? "true" : "false"}">
      <div class="account-signature-header">
        <div>
          <span class="account-signature-label">Signature</span>
          <p class="admin-field-note">Подпишите форму мышкой, пальцем или стилусом. Именно эта подпись будет вставлена в итоговые Contract и W-9 PDF.</p>
        </div>
        <button class="admin-button admin-button-secondary account-signature-clear" type="button" data-account-signature-clear disabled>Очистить</button>
      </div>
      <div class="account-signature-surface">
        <canvas
          class="account-signature-canvas"
          data-account-signature-canvas
          width="900"
          height="320"
          tabindex="0"
          aria-label="Поле подписи"
        ></canvas>
      </div>
      <input type="hidden" name="w9SignatureDataUrl" value="${escapeHtmlAttribute(normalizedSignatureDataUrl)}" data-account-signature-input>
      <p class="admin-field-hint" data-account-signature-status>${escapeHtml(
        normalizedSignatureDataUrl
          ? "Подпись сохранена в форме. Можно исправить остальные поля и отправить снова."
          : hasExistingW9
          ? "Если обновляете документы, нарисуйте подпись заново перед сохранением."
          : "Сначала нарисуйте подпись в поле выше."
      )}</p>
    </div>`;
  }

  function renderAccountDashboardScripts() {
    return `<script>
      (() => {
        function setW9FieldInvalid(container, invalid) {
          if (!(container instanceof HTMLElement)) return;
          container.setAttribute("data-invalid", invalid ? "true" : "false");
        }

        function validateW9Form(form) {
          if (!(form instanceof HTMLFormElement)) return false;

          const legalNameField = form.querySelector('[data-account-w9-field="legalName"]');
          const classificationField = form.querySelector('[data-account-w9-field="federalTaxClassification"]');
          const llcField = form.querySelector('[data-account-w9-field="llcTaxClassification"]');
          const otherField = form.querySelector('[data-account-w9-field="otherClassification"]');
          const addressField = form.querySelector('[data-account-w9-field="addressLine1"]');
          const cityStateZipField = form.querySelector('[data-account-w9-field="cityStateZip"]');
          const tinTypeField = form.querySelector('[data-account-w9-field="tinType"]');
          const tinValueField = form.querySelector('[data-account-w9-field="tinValue"]');
          const signatureField = form.querySelector('[data-account-w9-field="signature"]');
          const certificationField = form.querySelector('[data-account-w9-field="certificationConfirmed"]');
          const submitButton = form.querySelector("[data-account-w9-submit]");

          const legalNameInput = form.querySelector('[name="w9LegalName"]');
          const classificationInput = form.querySelector('[name="w9FederalTaxClassification"]');
          const llcInput = form.querySelector('[name="w9LlcTaxClassification"]');
          const otherInput = form.querySelector('[name="w9OtherClassification"]');
          const addressInput = form.querySelector('[name="w9AddressLine1"]');
          const cityStateZipInput = form.querySelector('[name="w9CityStateZip"]');
          const tinTypeInput = form.querySelector('[name="w9TinType"]');
          const tinValueInput = form.querySelector('[name="w9TinValue"]');
          const signatureInput = form.querySelector('[name="w9SignatureDataUrl"]');
          const certificationInput = form.querySelector('[name="w9CertificationConfirmed"]');

          const legalNameValid = Boolean(legalNameInput && legalNameInput.value.trim());
          const classificationValue = classificationInput ? classificationInput.value.trim() : "";
          const classificationValid = Boolean(classificationValue);
          const llcRequired = classificationValue === "llc";
          const otherRequired = classificationValue === "other";
          const llcValid = !llcRequired || Boolean(llcInput && llcInput.value.trim());
          const otherValid = !otherRequired || Boolean(otherInput && otherInput.value.trim());
          const addressValid = Boolean(addressInput && addressInput.value.trim());
          const cityStateZipValid = Boolean(cityStateZipInput && cityStateZipInput.value.trim());
          const tinTypeValid = Boolean(tinTypeInput && tinTypeInput.value.trim());
          const tinDigits = tinValueInput ? tinValueInput.value.replace(/\\D+/g, "") : "";
          const tinValueValid = tinDigits.length === 9;
          const signatureValid = Boolean(signatureInput && signatureInput.value.trim());
          const certificationValid = Boolean(certificationInput && certificationInput.checked);

          setW9FieldInvalid(legalNameField, !legalNameValid);
          setW9FieldInvalid(classificationField, !classificationValid);
          setW9FieldInvalid(llcField, !llcValid);
          setW9FieldInvalid(otherField, !otherValid);
          setW9FieldInvalid(addressField, !addressValid);
          setW9FieldInvalid(cityStateZipField, !cityStateZipValid);
          setW9FieldInvalid(tinTypeField, !tinTypeValid);
          setW9FieldInvalid(tinValueField, !tinValueValid);
          setW9FieldInvalid(signatureField, !signatureValid);
          setW9FieldInvalid(certificationField, !certificationValid);

          if (llcInput instanceof HTMLInputElement) {
            llcInput.required = llcRequired;
          }
          if (otherInput instanceof HTMLInputElement) {
            otherInput.required = otherRequired;
          }
          if (tinValueInput instanceof HTMLInputElement) {
            tinValueInput.setCustomValidity(tinValueValid ? "" : "TIN must contain 9 digits.");
          }

          const isValid =
            legalNameValid &&
            classificationValid &&
            llcValid &&
            otherValid &&
            addressValid &&
            cityStateZipValid &&
            tinTypeValid &&
            tinValueValid &&
            signatureValid &&
            certificationValid;

          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = !isValid;
          }

          return isValid;
        }

        function initW9FormValidation(form) {
          if (!(form instanceof HTMLFormElement)) return;

          const watchedFields = [
            form.querySelector('[name="w9LegalName"]'),
            form.querySelector('[name="w9FederalTaxClassification"]'),
            form.querySelector('[name="w9LlcTaxClassification"]'),
            form.querySelector('[name="w9OtherClassification"]'),
            form.querySelector('[name="w9AddressLine1"]'),
            form.querySelector('[name="w9CityStateZip"]'),
            form.querySelector('[name="w9TinType"]'),
            form.querySelector('[name="w9TinValue"]'),
            form.querySelector('[name="w9SignatureDataUrl"]'),
            form.querySelector('[name="w9CertificationConfirmed"]'),
          ].filter(Boolean);

          watchedFields.forEach((field) => {
            field.addEventListener("input", () => {
              validateW9Form(form);
            });
            field.addEventListener("change", () => {
              validateW9Form(form);
            });
          });

          form.addEventListener("submit", (event) => {
            if (validateW9Form(form)) return;
            event.preventDefault();
          });

          validateW9Form(form);
        }

        function trimSignatureDataUrl(canvas) {
          if (!(canvas instanceof HTMLCanvasElement)) return "";
          const ctx = canvas.getContext("2d");
          if (!ctx) return "";
          const width = canvas.width;
          const height = canvas.height;
          const imageData = ctx.getImageData(0, 0, width, height);
          const pixels = imageData.data;
          let minX = width;
          let minY = height;
          let maxX = -1;
          let maxY = -1;

          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const alpha = pixels[(y * width + x) * 4 + 3];
              if (alpha === 0) continue;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }

          if (maxX < minX || maxY < minY) return "";

          const padding = 20;
          const left = Math.max(0, minX - padding);
          const top = Math.max(0, minY - padding);
          const right = Math.min(width - 1, maxX + padding);
          const bottom = Math.min(height - 1, maxY + padding);
          const trimmedCanvas = document.createElement("canvas");
          trimmedCanvas.width = right - left + 1;
          trimmedCanvas.height = bottom - top + 1;
          const trimmedContext = trimmedCanvas.getContext("2d");
          if (!trimmedContext) return "";
          trimmedContext.drawImage(
            canvas,
            left,
            top,
            trimmedCanvas.width,
            trimmedCanvas.height,
            0,
            0,
            trimmedCanvas.width,
            trimmedCanvas.height
          );
          return trimmedCanvas.toDataURL("image/png");
        }

        function initSignaturePad(root) {
          if (!(root instanceof HTMLElement)) return;
          const canvas = root.querySelector("[data-account-signature-canvas]");
          const hiddenInput = root.querySelector("[data-account-signature-input]");
          const status = root.querySelector("[data-account-signature-status]");
          const clearButton = root.querySelector("[data-account-signature-clear]");
          const form = root.closest("form");
          if (!(canvas instanceof HTMLCanvasElement) || !(hiddenInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
            return;
          }

          const context = canvas.getContext("2d");
          if (!context) return;

          let isDrawing = false;
          let hasInk = false;
          let lastPoint = null;

          function setStatus(message, tone = "") {
            if (!(status instanceof HTMLElement)) return;
            status.textContent = message;
            status.setAttribute("data-tone", tone);
          }

          function syncHiddenInput() {
            hiddenInput.value = hasInk ? trimSignatureDataUrl(canvas) : "";
            root.setAttribute("data-has-signature", hiddenInput.value ? "true" : "false");
            if (clearButton instanceof HTMLButtonElement) {
              clearButton.disabled = !hiddenInput.value;
            }
            hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
          }

          function resetCanvas() {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.lineCap = "round";
            context.lineJoin = "round";
            context.strokeStyle = "#18181b";
            context.fillStyle = "#18181b";
            context.lineWidth = 4;
          }

          function drawSignatureImage(dataUrl) {
            const normalizedDataUrl = String(dataUrl || "");
            if (!normalizedDataUrl) {
              syncHiddenInput();
              return;
            }

            const image = new Image();
            image.addEventListener("load", () => {
              resetCanvas();
              const padding = 28;
              const maxWidth = canvas.width - padding * 2;
              const maxHeight = canvas.height - padding * 2;
              const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
              const width = Math.max(1, image.width * scale);
              const height = Math.max(1, image.height * scale);
              const offsetX = (canvas.width - width) / 2;
              const offsetY = (canvas.height - height) / 2;

              context.drawImage(image, offsetX, offsetY, width, height);
              hasInk = true;
              syncHiddenInput();
              setStatus("Подпись сохранена в форме. Можно отправить документы ещё раз.", "success");
            });
            image.addEventListener("error", () => {
              hiddenInput.value = "";
              hasInk = false;
              syncHiddenInput();
            });
            image.src = normalizedDataUrl;
          }

          function getPoint(event) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
            const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
            return {
              x: (event.clientX - rect.left) * scaleX,
              y: (event.clientY - rect.top) * scaleY,
            };
          }

          function drawDot(point) {
            context.beginPath();
            context.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
            context.fill();
          }

          function startDrawing(event) {
            if (event.button !== undefined && event.button !== 0) return;
            event.preventDefault();
            const point = getPoint(event);
            isDrawing = true;
            lastPoint = point;
            hasInk = true;
            drawDot(point);
            if (typeof canvas.setPointerCapture === "function" && event.pointerId !== undefined) {
              canvas.setPointerCapture(event.pointerId);
            }
            setStatus("Подпись готова. Теперь можно сформировать документы.", "success");
          }

          function continueDrawing(event) {
            if (!isDrawing || !lastPoint) return;
            event.preventDefault();
            const point = getPoint(event);
            context.beginPath();
            context.moveTo(lastPoint.x, lastPoint.y);
            context.lineTo(point.x, point.y);
            context.stroke();
            lastPoint = point;
          }

          function finishDrawing(event) {
            if (!isDrawing) return;
            if (event) event.preventDefault();
            isDrawing = false;
            lastPoint = null;
            syncHiddenInput();
          }

          resetCanvas();
          drawSignatureImage(hiddenInput.value);

          canvas.addEventListener("pointerdown", startDrawing);
          canvas.addEventListener("pointermove", continueDrawing);
          canvas.addEventListener("pointerup", finishDrawing);
          canvas.addEventListener("pointercancel", finishDrawing);

          if (clearButton instanceof HTMLButtonElement) {
            clearButton.addEventListener("click", () => {
              hasInk = false;
              lastPoint = null;
              isDrawing = false;
              resetCanvas();
              syncHiddenInput();
              setStatus("Подпись очищена. Нарисуйте её снова.", "");
            });
          }

          form.addEventListener("submit", (event) => {
            syncHiddenInput();
            if (hiddenInput.value) return;
            event.preventDefault();
            setStatus("Подпись обязательна: нарисуйте её в поле выше.", "danger");
            canvas.focus({ preventScroll: false });
          });
        }

        document.querySelectorAll("[data-account-signature-pad]").forEach((root) => {
          initSignaturePad(root);
        });
        document.querySelectorAll("[data-account-w9-form]").forEach((form) => {
          initW9FormValidation(form);
        });
      })();
    </script>`;
  }

  function renderAccountW9Card(userContext) {
    const staffRecord = userContext && userContext.staffRecord ? userContext.staffRecord : null;
    const contractRecord = staffRecord && staffRecord.contract ? staffRecord.contract : null;
    const w9Record = staffRecord && staffRecord.w9 ? staffRecord.w9 : null;
    const w9Draft =
      userContext && userContext.w9Draft && typeof userContext.w9Draft === "object"
        ? userContext.w9Draft
        : null;
    const w9Expanded = Boolean(userContext && userContext.w9Expanded);

    if (!staffRecord) {
      return renderAdminCard(
        "Документы сотрудника",
        "Эта форма появится здесь, когда аккаунт будет привязан к карточке сотрудника.",
        `<div class="admin-alert admin-alert-error">Пока нет карточки сотрудника, поэтому документы сотрудника заполнить нельзя.</div>`,
        { eyebrow: "Документы", muted: true }
      );
    }

    const prefill = {
      legalName: escapeHtmlText(
        getDraftW9Value(w9Draft, "legalName", (w9Record && w9Record.legalName) || staffRecord.name || "")
      ),
      businessName: escapeHtmlText(
        getDraftW9Value(w9Draft, "businessName", (w9Record && w9Record.businessName) || "")
      ),
      federalTaxClassification: getDraftW9Value(
        w9Draft,
        "federalTaxClassification",
        (w9Record && w9Record.federalTaxClassification) || ""
      ),
      llcTaxClassification: escapeHtmlText(
        getDraftW9Value(w9Draft, "llcTaxClassification", (w9Record && w9Record.llcTaxClassification) || "")
      ),
      otherClassification: escapeHtmlText(
        getDraftW9Value(w9Draft, "otherClassification", (w9Record && w9Record.otherClassification) || "")
      ),
      exemptPayeeCode: escapeHtmlText(
        getDraftW9Value(w9Draft, "exemptPayeeCode", (w9Record && w9Record.exemptPayeeCode) || "")
      ),
      fatcaCode: escapeHtmlText(
        getDraftW9Value(w9Draft, "fatcaCode", (w9Record && w9Record.fatcaCode) || "")
      ),
      addressLine1: escapeHtmlText(
        getDraftW9Value(w9Draft, "addressLine1", (w9Record && w9Record.addressLine1) || "")
      ),
      cityStateZip: escapeHtmlText(
        getDraftW9Value(w9Draft, "cityStateZip", (w9Record && w9Record.cityStateZip) || "")
      ),
      accountNumbers: escapeHtmlText(getDraftW9Value(w9Draft, "accountNumbers", "")),
      tinType: getDraftW9Value(w9Draft, "tinType", (w9Record && w9Record.tinType) || "ssn"),
      tinValue: escapeHtmlText(getDraftW9Value(w9Draft, "tinValue", "")),
      line3bApplies: getDraftW9Boolean(w9Draft, "line3bApplies", Boolean(w9Record && w9Record.line3bApplies)),
      certificationConfirmed: getDraftW9Boolean(w9Draft, "certificationConfirmed", false),
      signatureDataUrl: getDraftW9Value(w9Draft, "signatureDataUrl", ""),
    };

    const documentsComplete = Boolean(w9Record && contractRecord);
    const summaryBlock = documentsComplete
      ? `<div class="admin-alert admin-alert-info">
          Документы сотрудника сохранены ${escapeHtml(
            formatAdminDateTime(
              contractRecord.generatedAt || w9Record.generatedAt || contractRecord.updatedAt
            )
          )}. Contract и W-9 уже прикреплены к вашей карточке сотрудника.
        </div>
        ${renderAdminPropertyList([
          {
            label: "Contract",
            value:
              contractRecord.document && contractRecord.document.relativePath
                ? `Готов к скачиванию`
                : "Не сформирован",
          },
          {
            label: "W-9",
            value:
              w9Record.document && w9Record.document.relativePath
                ? "Готов к скачиванию"
                : "Не сформирован",
          },
          {
            label: "Tax classification",
            value: formatW9FederalTaxClassificationLabel(w9Record.federalTaxClassification),
          },
          {
            label: "TIN",
            value: `${formatW9TinTypeLabel(w9Record.tinType)} ${w9Record.maskedTin || ""}`.trim(),
          },
          {
            label: "Адрес",
            value:
              [w9Record.addressLine1, w9Record.cityStateZip].filter(Boolean).join(", ") ||
              "Не указан",
          },
        ])}`
      : `<div class="admin-alert admin-alert-info">Заполните форму один раз. После отправки система соберёт и прикрепит к вашей карточке сотрудника сразу два PDF: Contract и W-9.</div>`;

    const w9FormMarkup = `<form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-w9-form>
        <input type="hidden" name="action" value="save-w9">
        <label class="admin-label" data-account-w9-field="legalName">
          Full legal name
          <input class="admin-input" type="text" name="w9LegalName" value="${prefill.legalName}" autocomplete="name" required>
        </label>
        <label class="admin-label">
          Business name / disregarded entity
          <input class="admin-input" type="text" name="w9BusinessName" value="${prefill.businessName}" autocomplete="organization">
        </label>
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label" data-account-w9-field="federalTaxClassification">
            Federal tax classification
            <select class="admin-input" name="w9FederalTaxClassification" required>
              ${renderW9FederalTaxClassificationOptions(prefill.federalTaxClassification)}
            </select>
          </label>
          <label class="admin-label" data-account-w9-field="llcTaxClassification">
            LLC tax classification
            <input class="admin-input" type="text" name="w9LlcTaxClassification" value="${prefill.llcTaxClassification}" maxlength="1" placeholder="C, S, or P">
            <small class="admin-field-hint">Заполняйте только если выше выбрано LLC.</small>
          </label>
        </div>
        <label class="admin-label" data-account-w9-field="otherClassification">
          Other classification
          <input class="admin-input" type="text" name="w9OtherClassification" value="${prefill.otherClassification}" placeholder="Например, grantor trust">
          <small class="admin-field-hint">Только если выше выбрано Other.</small>
        </label>
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label" data-account-w9-field="addressLine1">
            Address
            <input class="admin-input" type="text" name="w9AddressLine1" value="${prefill.addressLine1}" autocomplete="address-line1" required>
          </label>
          <label class="admin-label" data-account-w9-field="cityStateZip">
            City, state, ZIP
            <input class="admin-input" type="text" name="w9CityStateZip" value="${prefill.cityStateZip}" autocomplete="address-level2" required>
          </label>
        </div>
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label">
            Exempt payee code
            <input class="admin-input" type="text" name="w9ExemptPayeeCode" value="${prefill.exemptPayeeCode}" maxlength="8">
          </label>
          <label class="admin-label">
            FATCA code
            <input class="admin-input" type="text" name="w9FatcaCode" value="${prefill.fatcaCode}" maxlength="8">
          </label>
        </div>
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label" data-account-w9-field="tinType">
            TIN type
            <select class="admin-input" name="w9TinType" required>
              ${renderW9TinTypeOptions(prefill.tinType)}
            </select>
          </label>
          <label class="admin-label" data-account-w9-field="tinValue">
            TIN number
            <input class="admin-input" type="text" name="w9TinValue" value="${prefill.tinValue}" inputmode="numeric" autocomplete="off" placeholder="123-45-6789 or 12-3456789" required>
            <small class="admin-field-hint">Номер не показывается в карточке полностью: сохраняем только PDF и маску последних 4 цифр.</small>
          </label>
        </div>
        <label class="admin-label">
          Account number(s)
          <input class="admin-input" type="text" name="w9AccountNumbers" value="${prefill.accountNumbers}" maxlength="120">
        </label>
        ${renderAccountW9SignaturePad(Boolean(w9Record), prefill.signatureDataUrl)}
        <label class="admin-label" style="display:flex;align-items:flex-start;gap:10px;">
          <input type="checkbox" name="w9Line3bApplies" value="1"${prefill.line3bApplies ? " checked" : ""}>
          <span>Line 3b applies to me.</span>
        </label>
        <label class="admin-label" data-account-w9-field="certificationConfirmed" style="display:flex;align-items:flex-start;gap:10px;">
          <input type="checkbox" name="w9CertificationConfirmed" value="1" required${prefill.certificationConfirmed ? " checked" : ""}>
          <span>Подтверждаю, что данные верны и система может сформировать финальные Contract и W-9 PDF.</span>
        </label>
        <div class="admin-inline-actions">
          <button class="admin-button" type="submit" data-account-w9-submit disabled>${documentsComplete ? "Обновить документы" : "Сформировать документы"}</button>
          ${contractRecord && contractRecord.document && contractRecord.document.relativePath
            ? `<a class="admin-button admin-button-secondary" href="${ACCOUNT_CONTRACT_DOWNLOAD_PATH}" download>Скачать Contract</a>`
            : ""}
          ${w9Record && w9Record.document && w9Record.document.relativePath
            ? `<a class="admin-button admin-button-secondary" href="${ACCOUNT_W9_DOWNLOAD_PATH}" download>Скачать W-9</a>`
            : ""}
        </div>
      </form>`;

    const w9EditorSummary = documentsComplete ? "Обновить документы" : "Открыть форму документов";
    const w9EditorNote = documentsComplete
      ? "Если данные изменились, раскройте форму и сохраните новую версию Contract и W-9."
      : "Нажмите, чтобы развернуть форму и один раз заполнить Contract + W-9.";
    const w9EditorBlock = `<details class="admin-details" data-account-w9-details${w9Expanded ? " open" : ""}>
        <summary>${w9EditorSummary}</summary>
        <div class="admin-form-grid" style="margin-top:14px;">
          <p class="admin-field-note">${w9EditorNote}</p>
          ${w9FormMarkup}
        </div>
      </details>`;

    return renderAdminCard(
      documentsComplete ? "Документы на файле" : "Заполните документы сотрудника",
      "Эта форма один раз собирает Contract и W-9. Храним только итоговые PDF и краткую служебную сводку.",
      `${summaryBlock}
      ${w9EditorBlock}`,
      { eyebrow: "Документы" }
    );
  }

  function getAccountOrderStatus(item = {}) {
    const payload =
      item && item.entry && item.entry.payloadForRetry && typeof item.entry.payloadForRetry === "object"
        ? item.entry.payloadForRetry
        : {};
    const adminOrder =
      payload.adminOrder && typeof payload.adminOrder === "object"
        ? payload.adminOrder
        : payload.orderState && typeof payload.orderState === "object"
          ? payload.orderState
          : {};
    const normalized = String(adminOrder.status || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    if (normalized === "scheduled") return "scheduled";
    if (normalized === "in-progress" || normalized === "en-route") return "en-route";
    if (normalized === "cleaning-started") return "cleaning-started";
    if (normalized === "checklist") return "checklist";
    if (normalized === "photo" || normalized === "photos") return "photos";
    if (normalized === "cleaning-complete") return "cleaning-complete";
    if (normalized === "rescheduled") return "rescheduled";
    if (normalized === "invoice-sent") return "invoice-sent";
    if (normalized === "paid") return "paid";
    if (normalized === "awaiting-review") return "awaiting-review";
    if (normalized === "completed") return "completed";
    if (normalized === "canceled" || normalized === "cancelled") return "canceled";
    return "new";
  }

  function getAccountCompletionData(item = {}) {
    const completion = item && item.completion && typeof item.completion === "object" ? item.completion : {};
    return {
      checklistItems: Array.isArray(completion.checklistItems) ? completion.checklistItems : [],
      beforePhotos: Array.isArray(completion.beforePhotos) ? completion.beforePhotos : [],
      afterPhotos: Array.isArray(completion.afterPhotos) ? completion.afterPhotos : [],
      photosSkipped: Boolean(completion.photosSkipped),
      photosSkippedAt: String(completion.photosSkippedAt || "").trim(),
    };
  }

  function getAccountChecklistItems(item = {}) {
    const completion = getAccountCompletionData(item);
    const completionItems = Array.isArray(completion.checklistItems) ? completion.checklistItems : [];
    if (completionItems.length > 0) {
      return completionItems;
    }
    const template =
      item && item.checklistTemplate && typeof item.checklistTemplate === "object"
        ? item.checklistTemplate
        : {};
    return Array.isArray(template.items) ? template.items : [];
  }

  function getAccountChecklistSummary(item = {}) {
    const items = getAccountChecklistItems(item);
    const completedCount = items.filter((itemRecord) => Boolean(itemRecord && itemRecord.completed)).length;
    return {
      items,
      completedCount,
      totalCount: items.length,
    };
  }

  function getAccountPhotoSummary(item = {}) {
    const completion = getAccountCompletionData(item);
    return {
      beforeCount: completion.beforePhotos.length,
      afterCount: completion.afterPhotos.length,
      skipped: Boolean(completion.photosSkipped),
    };
  }

  function renderAccountCleanerConfirmationBadge(confirmationState = {}) {
    const status = confirmationState && confirmationState.status ? confirmationState.status : "pending";
    if (status === "confirmed") return renderAdminBadge("Подтверждено", "success");
    if (status === "declined") return renderAdminBadge("Не подтвердил", "danger");
    return renderAdminBadge("Ждёт подтверждения", "outline");
  }

  function renderAccountCurrentStatusBadge(uiState = {}) {
    if (uiState.orderStatus === "scheduled") {
      return renderAccountCleanerConfirmationBadge(uiState.cleanerConfirmationState);
    }
    return renderAccountOrderStageBadge(uiState.orderStatus);
  }

  function renderAccountOrderStageBadge(orderStatus) {
    if (orderStatus === "scheduled") return renderAdminBadge("Запланировано", "outline");
    if (orderStatus === "en-route") return renderAdminBadge("В пути", "default");
    if (orderStatus === "cleaning-started") return renderAdminBadge("Начать уборку", "default");
    if (orderStatus === "checklist") return renderAdminBadge("Чеклист", "outline");
    if (orderStatus === "photos") return renderAdminBadge("Фото", "outline");
    if (orderStatus === "cleaning-complete") return renderAdminBadge("Уборка завершена", "success");
    return "";
  }

  function getAccountNextAssignmentAction(orderStatus, checklistSummary = {}) {
    if (orderStatus === "scheduled") {
      return {
        action: "mark-assignment-en-route",
        label: "Я в пути",
      };
    }
    if (orderStatus === "en-route") {
      return {
        action: "mark-assignment-cleaning-started",
        label: "Начать уборку",
      };
    }
    if (orderStatus === "cleaning-started") {
      return {
        action: "mark-assignment-checklist",
        label: "Чеклист",
      };
    }
    if (
      orderStatus === "checklist" &&
      Number(checklistSummary.totalCount) > 0 &&
      Number(checklistSummary.completedCount) >= Number(checklistSummary.totalCount)
    ) {
      return {
        action: "complete-assignment-checklist",
        label: "Чеклист",
      };
    }
    if (orderStatus === "photos") {
      return {
        action: "complete-assignment-photos",
        label: "Фото",
      };
    }
    return null;
  }

  function getAccountOrderStageLabel(orderStatus) {
    if (orderStatus === "scheduled") return "Запланировано";
    if (orderStatus === "en-route") return "В пути";
    if (orderStatus === "cleaning-started") return "Начать уборку";
    if (orderStatus === "checklist") return "Чеклист";
    if (orderStatus === "photos") return "Фото";
    if (orderStatus === "cleaning-complete") return "Уборка завершена";
    if (orderStatus === "rescheduled") return "Перенесено";
    if (orderStatus === "invoice-sent") return "Инвойс отправлен";
    if (orderStatus === "paid") return "Оплачено";
    if (orderStatus === "awaiting-review") return "Ждём отзыв";
    if (orderStatus === "completed") return "Завершено";
    if (orderStatus === "canceled") return "Отменено";
    return "Новая заявка";
  }

  function getAccountDesktopInlineActions(item = {}, uiState = {}) {
    if (!uiState || !uiState.canAccessAssignment) return [];
    const entryId = item && item.entry ? item.entry.id : "";
    if (!entryId) return [];
    if (uiState.orderStatus === "checklist" || uiState.orderStatus === "photos") return [];

    const actions = [];
    const canShowNextAction =
      Boolean(uiState.nextAction) &&
      (uiState.orderStatus !== "scheduled" || uiState.cleanerConfirmationStatus === "confirmed");

    if (uiState.canConfirm) {
      actions.push({
        action: "confirm-assignment",
        label: "Подтвердить",
        tone: "primary",
      });
    }
    if (canShowNextAction) {
      actions.push({
        action: uiState.nextAction.action,
        label: uiState.nextAction.label,
        tone: uiState.canConfirm ? "secondary" : "primary",
      });
    }
    if (uiState.canDecline) {
      actions.push({
        action: "decline-assignment",
        label: "Не подтверждаю",
        tone: "secondary",
      });
    }

    return actions;
  }

  function renderAccountDesktopStatusRow(item = {}, uiState = {}) {
    const badgeMarkup = renderAccountCurrentStatusBadge(uiState);
    const actions = getAccountDesktopInlineActions(item, uiState);
    if (!actions.length) {
      return `<div class="admin-inline-badge-row">${badgeMarkup}</div>`;
    }

    return `<div class="admin-inline-badge-row account-desktop-status-row">
      ${badgeMarkup}
      ${actions
        .map(
          (actionItem) => `<form class="account-desktop-inline-action-form" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-async-form="true">
            <input type="hidden" name="action" value="${escapeHtmlAttribute(actionItem.action)}">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(item && item.entry ? item.entry.id : "")}">
            <button class="account-desktop-inline-action-button${
              actionItem.tone === "secondary" ? " account-desktop-inline-action-button-secondary" : ""
            }" type="submit">${escapeHtml(actionItem.label)}</button>
          </form>`
        )
        .join("")}
    </div>`;
  }

  function getAccountAssignmentUiState(item = {}, staffId = "") {
    const orderStatus = getAccountOrderStatus(item);
    const checklistSummary = getAccountChecklistSummary(item);
    const photoSummary = getAccountPhotoSummary(item);
    const cleanerConfirmationState = getStaffCleanerConfirmationState(
      item && item.entry,
      item && item.assignment,
      staffId
    );
    const cleanerConfirmationStatus = cleanerConfirmationState.status;
    const canAccessAssignment =
      Boolean(staffId) &&
      item &&
      item.assignment &&
      Array.isArray(item.assignment.staffIds) &&
      item.assignment.staffIds.includes(staffId);
    const isStageWithCleanerFlow =
      orderStatus === "scheduled" ||
      orderStatus === "en-route" ||
      orderStatus === "cleaning-started" ||
      orderStatus === "checklist" ||
      orderStatus === "photos" ||
      orderStatus === "cleaning-complete";
    const nextAction = getAccountNextAssignmentAction(orderStatus, checklistSummary);

    let helperCopy = "";
    if (orderStatus === "cleaning-complete") {
      helperCopy = "";
    } else if (orderStatus === "photos") {
      helperCopy =
        photoSummary.skipped
          ? "Фото пропущены с отметкой клинера. Можно закрывать этап фото."
          : photoSummary.beforeCount > 0 || photoSummary.afterCount > 0
            ? `Фото сохранены: до — ${photoSummary.beforeCount}, после — ${photoSummary.afterCount}. Когда всё готово, закройте этап «Фото».`
          : checklistSummary.totalCount > 0
            ? `Чеклист сохранён: ${checklistSummary.completedCount} из ${checklistSummary.totalCount}. Загрузите фото до и после.`
            : "Загрузите фото до и после. После этого можно завершать уборку.";
    } else if (orderStatus === "checklist") {
      helperCopy =
        checklistSummary.totalCount > 0
          ? checklistSummary.completedCount > 0
            ? `Чеклист сохранён: ${checklistSummary.completedCount} из ${checklistSummary.totalCount}. Следующий этап — фото.`
            : `Отметьте чеклист: ${checklistSummary.completedCount} из ${checklistSummary.totalCount}. После сохранения можно перейти к фото.`
          : "Отметьте чеклист. После сохранения можно перейти к фото.";
    } else if (orderStatus === "cleaning-started") {
      helperCopy = "Вы отметили, что начали уборку. Следующий этап — открыть чеклист.";
    } else if (orderStatus === "en-route") {
      helperCopy = "Вы отметили, что уже выехали на этот заказ.";
    } else if (cleanerConfirmationStatus === "confirmed") {
      helperCopy =
        cleanerConfirmationState.automatic
          ? "До заказа осталось меньше 24 часов, поэтому система автоматически отметила его как подтверждённый."
          : "Вы уже подтвердили, что сможете выйти на этот заказ.";
    } else if (cleanerConfirmationStatus === "declined") {
      helperCopy = "Сейчас заказ отмечен как не подтверждённый с вашей стороны.";
    } else if (orderStatus === "scheduled") {
      helperCopy =
        cleanerConfirmationStatus === "confirmed"
          ? "Вы уже подтвердили заказ. Теперь можно перейти к следующему этапу и отметить, что вы в пути."
          : "Сначала подтвердите, что сможете выйти на этот заказ, или отметьте, что не подтверждаете его.";
    }

    return {
      orderStatus,
      cleanerConfirmationStatus,
      cleanerConfirmationState,
      checklistSummary,
      photoSummary,
      helperCopy,
      nextAction,
      canAccessAssignment,
      isStageWithCleanerFlow,
      canConfirm:
        canAccessAssignment &&
        orderStatus === "scheduled" &&
        cleanerConfirmationStatus !== "confirmed",
      canDecline:
        canAccessAssignment &&
        orderStatus === "scheduled" &&
        cleanerConfirmationStatus !== "declined",
    };
  }

  function renderAccountAssignmentActionForms(item = {}, uiState = {}, options = {}) {
    if (!uiState.canAccessAssignment || !uiState.isStageWithCleanerFlow) {
      return "";
    }

    const entryId = item && item.entry ? item.entry.id : "";
    if (!entryId) return "";

    const layoutClass = options.mobile
      ? [
          "account-mobile-action-stack",
          options.mobilePlacement === "top" ? "account-mobile-action-stack-top" : "",
          options.mobilePlacement === "bottom" ? "account-mobile-action-stack-bottom" : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "admin-inline-actions";
    const primaryClass = options.mobile ? "admin-button account-mobile-action-button" : "admin-button";
    const secondaryClass = options.mobile
      ? "admin-button admin-button-secondary account-mobile-action-button"
      : "admin-button admin-button-secondary";
    const forms = [];

    function renderChecklistEditor() {
      const checklistItems = Array.isArray(uiState.checklistSummary && uiState.checklistSummary.items)
        ? uiState.checklistSummary.items
        : [];
      if (!checklistItems.length) return "";
      const completedCount = Number(uiState.checklistSummary && uiState.checklistSummary.completedCount) || 0;
      const totalCount = Number(uiState.checklistSummary && uiState.checklistSummary.totalCount) || checklistItems.length;
      const summaryLabel = completedCount > 0 ? `Чеклист · ${completedCount}/${totalCount}` : "Чеклист";

      return `<details class="account-stage-editor" data-account-checklist-editor>
        <summary class="account-stage-editor-summary">${escapeHtml(summaryLabel)}</summary>
        <div class="account-stage-editor-body">
          <p class="account-stage-editor-copy">Логика взята из Cleaning app: можно отметить всё сразу или выбрать только выполненные пункты.</p>
          <form class="account-stage-editor-form" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-async-form="true" data-account-checklist-complete-form="true">
            <input type="hidden" name="action" value="complete-assignment-checklist">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
            <div class="account-stage-editor-toolbar">
              <button class="admin-button admin-button-secondary" type="button" data-account-checklist-select-all="true">Выделить все</button>
              <button class="admin-button admin-button-secondary" type="button" data-account-checklist-clear-all="true">Снять все</button>
            </div>
            <div class="account-checklist-list">
              ${checklistItems
                .map((itemRecord) => `<label class="account-checklist-item">
                  <input type="checkbox" name="checklistItemId" value="${escapeHtmlAttribute(itemRecord.id)}"${
                    itemRecord.completed ? " checked" : ""
                  }>
                  <span>
                    <strong>${escapeHtml(itemRecord.label || "")}</strong>
                    ${itemRecord.hint ? `<small>${escapeHtml(itemRecord.hint)}</small>` : ""}
                  </span>
                </label>`)
                .join("")}
            </div>
            <div class="account-stage-editor-actions">
              <button class="${primaryClass}" type="submit" data-account-checklist-complete-button="true" disabled>Чеклист</button>
            </div>
          </form>
        </div>
      </details>`;
    }

    function renderPhotoEditor() {
      const beforeCount = Number(uiState.photoSummary && uiState.photoSummary.beforeCount) || 0;
      const afterCount = Number(uiState.photoSummary && uiState.photoSummary.afterCount) || 0;
      const summaryLabel =
        uiState.photoSummary && uiState.photoSummary.skipped
          ? "Фото · пропущены"
          : beforeCount > 0 || afterCount > 0
          ? `Фото · до ${beforeCount} / после ${afterCount}`
          : "Фото до / после";
      return `<details class="account-stage-editor" data-account-photo-editor>
        <summary class="account-stage-editor-summary">${escapeHtml(summaryLabel)}</summary>
        <div class="account-stage-editor-body">
          <p class="account-stage-editor-copy">Загрузите фото до и после или отметьте, что клиент не разрешил фото. Без одного из вариантов этап «Фото» не закрывается.</p>
          <form class="account-stage-editor-form" method="post" action="${ACCOUNT_ROOT_PATH}" enctype="multipart/form-data" data-account-async-form="true" data-account-photo-complete-form="true">
            <input type="hidden" name="action" value="complete-assignment-photos">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
            <div class="account-photo-upload-grid">
              <label class="account-photo-upload-field">
                <span class="account-photo-upload-title">Фото до</span>
                <span
                  class="account-photo-upload-shell"
                  data-account-photo-shell="before"
                  data-has-files="${beforeCount > 0 ? "true" : "false"}"
                  data-disabled="false"
                >
                  <input
                    class="account-photo-upload-input"
                    type="file"
                    name="beforePhotos"
                    accept="image/*"
                    multiple
                    data-account-photo-input="before"
                    data-account-photo-stored-count="${escapeHtmlAttribute(String(beforeCount))}"
                  >
                  <span class="account-photo-upload-button">Выбрать файлы</span>
                  <span class="account-photo-upload-meta" data-account-photo-meta="before">${
                    beforeCount > 0 ? escapeHtml(`Сейчас загружено: ${beforeCount}`) : "Файлы не выбраны"
                  }</span>
                </span>
                <small data-account-photo-help="before">${escapeHtml(
                  beforeCount > 0
                    ? `Сейчас загружено: ${beforeCount}. При выборе новые файлы заменят текущие.`
                    : "Можно выбрать несколько фотографий."
                )}</small>
              </label>
              <label class="account-photo-upload-field">
                <span class="account-photo-upload-title">Фото после</span>
                <span
                  class="account-photo-upload-shell"
                  data-account-photo-shell="after"
                  data-has-files="${afterCount > 0 ? "true" : "false"}"
                  data-disabled="false"
                >
                  <input
                    class="account-photo-upload-input"
                    type="file"
                    name="afterPhotos"
                    accept="image/*"
                    multiple
                    data-account-photo-input="after"
                    data-account-photo-stored-count="${escapeHtmlAttribute(String(afterCount))}"
                  >
                  <span class="account-photo-upload-button">Выбрать файлы</span>
                  <span class="account-photo-upload-meta" data-account-photo-meta="after">${
                    afterCount > 0 ? escapeHtml(`Сейчас загружено: ${afterCount}`) : "Файлы не выбраны"
                  }</span>
                </span>
                <small data-account-photo-help="after">${escapeHtml(
                  afterCount > 0
                    ? `Сейчас загружено: ${afterCount}. При выборе новые файлы заменят текущие.`
                    : "Можно выбрать несколько фотографий."
                )}</small>
              </label>
              <label class="account-photo-skip-field">
                <input type="checkbox" name="photosSkipped" value="1" data-account-photo-skip="true"${
                  uiState.photoSummary && uiState.photoSummary.skipped ? " checked" : ""
                }>
                <span>Клиент не разрешил делать фото, пропустить этот этап</span>
              </label>
            </div>
            <div class="account-stage-editor-actions">
              <button class="${primaryClass}" type="submit" data-account-photo-complete-button="true" disabled>Фото</button>
            </div>
          </form>
        </div>
      </details>`;
    }

    if (uiState.canConfirm) {
      forms.push(`<form method="post" action="${ACCOUNT_ROOT_PATH}" data-account-async-form="true">
        <input type="hidden" name="action" value="confirm-assignment">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <button class="${primaryClass}" type="submit">Подтвердить</button>
      </form>`);
    }

    const canShowNextAction =
      Boolean(uiState.nextAction) &&
      (uiState.orderStatus !== "scheduled" || uiState.cleanerConfirmationStatus === "confirmed");

    if (uiState.orderStatus === "checklist") {
      forms.push(renderChecklistEditor());
    } else if (uiState.orderStatus === "photos") {
      forms.push(renderPhotoEditor());
    } else if (canShowNextAction) {
      forms.push(`<form method="post" action="${ACCOUNT_ROOT_PATH}" data-account-async-form="true">
        <input type="hidden" name="action" value="${escapeHtmlAttribute(uiState.nextAction.action)}">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <button class="${uiState.canConfirm ? secondaryClass : primaryClass}" type="submit">${escapeHtml(
          uiState.nextAction.label
        )}</button>
      </form>`);
    }

    if (uiState.canDecline) {
      forms.push(`<form method="post" action="${ACCOUNT_ROOT_PATH}" data-account-async-form="true">
        <input type="hidden" name="action" value="decline-assignment">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <button class="${secondaryClass}" type="submit">Не подтверждаю</button>
      </form>`);
    }

    return forms.length ? `<div class="${layoutClass}">${forms.join("")}</div>` : "";
  }

  function renderAccountAssignmentActions(item = {}, staffId = "") {
    const uiState = getAccountAssignmentUiState(item, staffId);
    if (!uiState.canAccessAssignment) {
      return "";
    }

    const shouldHideDesktopStack =
      uiState.orderStatus !== "checklist" &&
      uiState.orderStatus !== "photos" &&
      getAccountDesktopInlineActions(item, uiState).length > 0;

    return `<div class="admin-table-cell-stack">
      ${renderAccountDesktopStatusRow(item, uiState)}
      ${
        uiState.helperCopy
          ? `<span class="admin-table-muted">${escapeHtml(uiState.helperCopy)}</span>`
          : ""
      }
      ${
        uiState.isStageWithCleanerFlow && !shouldHideDesktopStack
          ? renderAccountAssignmentActionForms(item, uiState)
          : ""
      }
    </div>`;
  }

  function getAccountPrimaryMobileAssignment(orderItems = [], staffId = "") {
    if (!Array.isArray(orderItems) || !orderItems.length) return null;
    return (
      orderItems.find((item) => {
        const uiState = getAccountAssignmentUiState(item, staffId);
        return uiState.canAccessAssignment && uiState.isStageWithCleanerFlow;
      }) || orderItems[0]
    );
  }

  function getAccountTravelLeg(item = null, staffId = "") {
    const travelLegs = Array.isArray(item && item.travelLegs) ? item.travelLegs : [];
    if (!travelLegs.length) return null;
    const normalizedStaffId = String(staffId || "").trim();
    if (normalizedStaffId) {
      const matchedLeg = travelLegs.find(
        (leg) => String((leg && leg.staffId) || "").trim() === normalizedStaffId
      );
      if (matchedLeg) return matchedLeg;
    }
    return travelLegs[0] || null;
  }

  function renderAccountTravelEstimate(leg = null, options = {}) {
    if (!leg) return "";

    const estimate = leg && leg.travelEstimate ? leg.travelEstimate : null;
    const estimateLabel = estimate ? String(estimate.label || "").trim() : "";
    const estimateStatus = estimate ? String(estimate.status || "").trim().toLowerCase() : "";
    const savedText =
      estimateStatus === "ok" && estimateLabel
        ? `Дорога: ${estimateLabel}`
        : estimateStatus === "not-configured"
          ? "Дорога: карты не подключены"
          : estimateStatus === "unavailable"
            ? `Дорога: ${formatTravelEstimateUnavailableText(estimate) || "маршрут недоступен"}`
            : "";
    const fallbackText =
      leg.status === "missing-destination"
        ? "Дорога: у заказа не указан адрес."
        : leg.status === "missing-origin"
          ? "Дорога: у вас не указан домашний адрес."
          : leg.status === "same-place"
            ? "Дорога: вы уже на месте."
            : "Дорога: маршрут ожидает синхронизации.";
    const travelText = savedText || fallbackText;
    const className = options.compact
      ? "account-mobile-order-travel"
      : "account-mobile-focus-travel";

    return `<p class="${className}">${escapeHtml(travelText)}</p>`;
  }

  function getAccountMobileOrderDetailId(item = {}) {
    const entryId = item && item.entry ? String(item.entry.id || item.entry.requestId || "") : "";
    const normalizedId =
      entryId
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120) || "order";
    return `account-mobile-order-detail-${normalizedId}`;
  }

  function getAccountQuoteData(item = {}) {
    const payload =
      item && item.entry && item.entry.payloadForRetry && typeof item.entry.payloadForRetry === "object"
        ? item.entry.payloadForRetry
        : {};
    if (payload.calculatorData && typeof payload.calculatorData === "object") return payload.calculatorData;
    if (payload.quoteData && typeof payload.quoteData === "object") return payload.quoteData;
    return {};
  }

  function getAccountFirstValue(source = {}, keys = []) {
    for (const key of keys) {
      const value = source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : "";
      if (value === true) return "Yes";
      if (value === false) return "No";
      const normalized = String(value || "").trim();
      if (normalized) return normalized;
    }
    return "";
  }

  function formatAccountMobileStatValue(value, fallback = "Не указано") {
    const normalized = String(value || "").trim();
    return normalized || fallback;
  }

  function formatAccountMobileAreaValue(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return "Не указано";
    if (/[a-zA-Z]/.test(normalized)) return normalized;
    return `${normalized} sq ft`;
  }

  function formatAccountMobilePetsValue(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return "Не указано";
    const lower = normalized.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return "Есть";
    if (lower === "false" || lower === "no" || lower === "0") return "Нет";
    return normalized;
  }

  function getAccountMobileAddressParts(item = {}) {
    const quoteData = getAccountQuoteData(item);
    const fullAddress = item && item.entry && item.entry.fullAddress
      ? item.entry.fullAddress
      : getAccountFirstValue(quoteData, ["fullAddress", "address"]);
    const parts = String(fullAddress || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      fullAddress: fullAddress || "Адрес уточняется",
      title: parts[0] || fullAddress || "Адрес уточняется",
      locality: getAccountFirstValue(quoteData, ["neighborhood", "city"]) || parts[2] || parts[1] || "",
    };
  }

  function renderAccountMobileDetailIcon(name = "pin") {
    if (name === "check") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 12.4l2.5 2.5 5.7-6.1"/><path d="M7.2 3.8h9.6c1.9 0 3.4 1.5 3.4 3.4v9.6c0 1.9-1.5 3.4-3.4 3.4H7.2c-1.9 0-3.4-1.5-3.4-3.4V7.2c0-1.9 1.5-3.4 3.4-3.4z"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg>`;
  }

  function renderAccountMobileFeaturedAssignment(item = null, options = {}) {
    if (!item) return "";

    const staffId = String(options.staffId || "").trim();
    const uiState = getAccountAssignmentUiState(item, staffId);
    const travelLeg = getAccountTravelLeg(item, staffId);
    const serviceLabel = formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType);
    const summaryLabel = item.scheduleLabel || "Время уточняется";
    const addressLabel = item.entry.fullAddress || "Адрес уточняется администратором";
    const detailId = getAccountMobileOrderDetailId(item);

    return `<div
      class="account-mobile-focus-card"
      data-account-mobile-detail-open="${escapeHtmlAttribute(detailId)}"
      tabindex="0"
      role="button"
      aria-label="Открыть заказ ${escapeHtmlAttribute(item.entry.customerName || "Клиент")}"
    >
      <div class="account-mobile-focus-copy">
        <p class="account-mobile-focus-eyebrow">Следующий заказ</p>
        <h3 class="account-mobile-focus-title">${escapeHtml(item.entry.customerName || "Клиент")}</h3>
        <p class="account-mobile-focus-meta">${escapeHtml(serviceLabel)} · ${escapeHtml(summaryLabel)}</p>
      </div>
      <div class="account-mobile-badge-row">
        ${renderAccountCurrentStatusBadge(uiState)}
      </div>
      <p class="account-mobile-focus-address">${escapeHtml(addressLabel)}</p>
      ${renderAccountTravelEstimate(travelLeg)}
      ${renderAccountAssignmentActionForms(item, uiState, { mobile: true })}
    </div>`;
  }

  function renderAccountMobileAssignmentCard(item = {}, options = {}) {
    const staffId = String(options.staffId || "").trim();
    const uiState = getAccountAssignmentUiState(item, staffId);
    const travelLeg = getAccountTravelLeg(item, staffId);
    const serviceLabel = formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType);
    const requestLabel = item.entry.requestId || item.entry.id;
    const addressLabel = item.entry.fullAddress || "Адрес уточняется";
    const notesLabel =
      item.assignment && item.assignment.notes ? item.assignment.notes : "";
    const detailId = getAccountMobileOrderDetailId(item);
    return `<article
      class="account-mobile-order-card"
      data-account-mobile-order-card
      data-account-mobile-detail-open="${escapeHtmlAttribute(detailId)}"
      tabindex="0"
      role="button"
      aria-label="Открыть заказ ${escapeHtmlAttribute(item.entry.customerName || "Клиент")}"
    >
      <div class="account-mobile-order-head">
        <div class="account-mobile-order-copy">
          <p class="account-mobile-order-kicker">${escapeHtml(serviceLabel)}</p>
          <h3 class="account-mobile-order-title">${escapeHtml(item.entry.customerName || "Клиент")}</h3>
          <p class="account-mobile-order-request">${escapeHtml(requestLabel)}</p>
        </div>
        <div class="account-mobile-badge-row">
          ${renderAccountCurrentStatusBadge(uiState)}
        </div>
      </div>
      <div class="account-mobile-order-grid">
        <div class="account-mobile-order-field">
          <span class="account-mobile-order-label">Дата и время</span>
          <strong>${escapeHtml(item.scheduleLabel || "Не указано")}</strong>
        </div>
        <div class="account-mobile-order-field">
          <span class="account-mobile-order-label">Сумма</span>
          <strong>${escapeHtml(formatCurrencyAmount(item.entry.totalPrice))}</strong>
        </div>
        <div class="account-mobile-order-field account-mobile-order-field-full">
          <span class="account-mobile-order-label">Адрес</span>
          <strong>${escapeHtml(addressLabel)}</strong>
          ${renderAccountTravelEstimate(travelLeg, { compact: true })}
        </div>
        ${
          notesLabel
            ? `<div class="account-mobile-order-field account-mobile-order-field-full">
                <span class="account-mobile-order-label">Комментарий</span>
                <strong>${escapeHtml(notesLabel)}</strong>
              </div>`
            : ""
        }
      </div>
      ${
        uiState.helperCopy
          ? `<p class="account-mobile-order-helper">${escapeHtml(uiState.helperCopy)}</p>`
          : ""
      }
      ${renderAccountAssignmentActionForms(item, uiState, { mobile: true })}
    </article>`;
  }

  function renderAccountMobileDetailStats(item = {}) {
    const quoteData = getAccountQuoteData(item);
    const stats = [
      {
        label: "Спальни",
        value: formatAccountMobileStatValue(getAccountFirstValue(quoteData, ["rooms", "bedrooms", "bedroomCount"])),
      },
      {
        label: "Ванные",
        value: formatAccountMobileStatValue(getAccountFirstValue(quoteData, ["bathrooms", "bathroomCount"])),
      },
      {
        label: "Площадь",
        value: formatAccountMobileAreaValue(getAccountFirstValue(quoteData, ["squareFeet", "squareFootage", "squareMeters"])),
      },
      {
        label: "Питомцы",
        value: formatAccountMobilePetsValue(getAccountFirstValue(quoteData, ["pets", "hasPets"])),
      },
    ];

    return `<section class="account-mobile-detail-card account-mobile-detail-stats" aria-label="Детали объекта">
      ${stats
        .map((stat) => `<div class="account-mobile-detail-stat">
          <span>${escapeHtml(stat.label)}</span>
          <strong>${escapeHtml(stat.value)}</strong>
        </div>`)
        .join("")}
    </section>`;
  }

  function renderAccountMobileDetailTimeline(uiState = {}) {
    const steps = [
      { key: "scheduled", label: "Подтвердить" },
      { key: "en-route", label: "В пути" },
      { key: "cleaning-started", label: "Начать уборку" },
      { key: "checklist", label: "Чеклист" },
      { key: "photos", label: "Фото" },
      { key: "cleaning-complete", label: "Завершить" },
    ];
    const statusToIndex = {
      scheduled: 0,
      "en-route": 1,
      "cleaning-started": 2,
      checklist: 3,
      photos: 4,
      "cleaning-complete": 5,
      completed: 5,
    };
    const currentIndex = Object.prototype.hasOwnProperty.call(statusToIndex, uiState.orderStatus)
      ? statusToIndex[uiState.orderStatus]
      : 0;

    return `<section class="account-mobile-detail-card account-mobile-detail-timeline">
      <h3>Этапы заказа</h3>
      <ol>
        ${steps
          .map((step, index) => {
            const className =
              index < currentIndex
                ? " is-complete"
                : index === currentIndex
                  ? " is-current"
                  : "";
            return `<li class="${className}">
              <span>${escapeHtml(String(index + 1))}</span>
              <strong>${escapeHtml(step.label)}</strong>
            </li>`;
          })
          .join("")}
      </ol>
    </section>`;
  }

  function renderAccountMobileDetailChecklist(item = {}, uiState = {}) {
    const checklistItems = Array.isArray(uiState.checklistSummary && uiState.checklistSummary.items)
      ? uiState.checklistSummary.items
      : [];
    const completedCount = Number(uiState.checklistSummary && uiState.checklistSummary.completedCount) || 0;
    const totalCount = Number(uiState.checklistSummary && uiState.checklistSummary.totalCount) || checklistItems.length;
    const progress = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;
    const entryId = item && item.entry ? item.entry.id : "";
    const canEditChecklist = Boolean(entryId && uiState.canAccessAssignment && uiState.orderStatus === "checklist");
    const checklistItemsMarkup = checklistItems
      .map((itemRecord) => {
        const itemBody = `<span class="account-mobile-detail-check"></span>
          <div>
            <strong>${escapeHtml(itemRecord.label || "")}</strong>
            ${itemRecord.hint ? `<small>${escapeHtml(itemRecord.hint)}</small>` : ""}
          </div>`;
        if (!canEditChecklist) {
          return `<div class="account-mobile-detail-checklist-item${itemRecord.completed ? " is-complete" : ""}">
            ${itemBody}
          </div>`;
        }
        return `<label class="account-mobile-detail-checklist-item${itemRecord.completed ? " is-complete" : ""}">
          <input type="checkbox" name="checklistItemId" value="${escapeHtmlAttribute(itemRecord.id)}"${
            itemRecord.completed ? " checked" : ""
          }>
          ${itemBody}
        </label>`;
      })
      .join("");

    return `<section class="account-mobile-detail-card account-mobile-detail-checklist">
      <div class="account-mobile-detail-card-head">
        <h3>Чеклист</h3>
        <span>${escapeHtml(`${completedCount} из ${totalCount}`)}</span>
      </div>
      <div class="account-mobile-detail-progress" aria-hidden="true"><span style="width:${escapeHtmlAttribute(String(progress))}%;"></span></div>
      ${
        checklistItems.length
          ? canEditChecklist
            ? `<form class="account-mobile-detail-checklist-form" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-checklist-editor data-account-checklist-complete-form="true" data-account-async-form="true">
                <input type="hidden" name="action" value="complete-assignment-checklist">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
                <button class="account-mobile-detail-soft-button" type="button" data-account-checklist-select-all="true" data-account-no-card-open>
                  <span aria-hidden="true">✓</span> Выделить все
                </button>
                <div class="account-mobile-detail-checklist-list">${checklistItemsMarkup}</div>
                <button class="account-mobile-detail-soft-button account-mobile-detail-save-button" type="submit" data-account-checklist-complete-button="true" data-account-no-card-open disabled>Чеклист</button>
              </form>`
            : `<div class="account-mobile-detail-checklist-list">${checklistItemsMarkup}</div>`
          : `<p class="account-mobile-detail-muted">Чеклист появится, когда заказ перейдёт на этот этап.</p>`
      }
    </section>`;
  }

  function renderAccountMobileDetailNotes(item = {}) {
    const entryId = item && item.entry ? item.entry.id : "";
    const completion = item && item.completion && typeof item.completion === "object" ? item.completion : {};
    const cleanerComments = Array.isArray(completion.cleanerComments)
      ? completion.cleanerComments.filter((comment) => comment && comment.text)
      : completion.cleanerComment
        ? [{ text: completion.cleanerComment, authorName: "", createdAt: "" }]
        : [];
    const commentsMarkup = cleanerComments.length
      ? `<div class="account-mobile-detail-note-log">
          ${cleanerComments
            .map((comment, index) => {
              const authorName = comment.authorName || "Клинер";
              const createdAt = comment.createdAt ? formatAdminDateTime(comment.createdAt) : "";
              const meta = [authorName, createdAt].filter(Boolean).join(" • ") || `Заметка ${index + 1}`;
              return `<article class="account-mobile-detail-note-item">
                <span>${escapeHtml(meta)}</span>
                <p>${escapeHtml(comment.text)}</p>
              </article>`;
            })
            .join("")}
        </div>`
      : "";
    return `<section class="account-mobile-detail-card account-mobile-detail-notes">
      <h3>Заметки</h3>
      ${commentsMarkup}
      <form class="account-mobile-detail-notes-form" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-no-card-open data-account-async-form="true">
        <input type="hidden" name="action" value="save-assignment-note">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <textarea class="account-mobile-detail-textarea" name="cleanerComment" placeholder="Добавить заметку" data-account-no-card-open></textarea>
        <button class="account-mobile-detail-soft-button" type="submit" data-account-no-card-open>Добавить</button>
      </form>
    </section>`;
  }

  function renderAccountMobileDetailIssueHistory() {
    return `<section class="account-mobile-detail-card account-mobile-detail-issue">
      <h3>История проблем</h3>
      <div class="account-mobile-detail-note-box account-mobile-detail-note-box-small">Другое</div>
      <textarea class="account-mobile-detail-textarea" placeholder="Опишите проблему"></textarea>
      <button class="account-mobile-detail-soft-button" type="button" data-account-no-card-open>
        <span aria-hidden="true">⚑</span> Отправить
      </button>
    </section>`;
  }

  function renderAccountMobileDetailContactActions(managerContact = null) {
    const phoneHref = formatPhoneHref(managerContact && managerContact.phone);
    const managerName = managerContact && managerContact.name ? managerContact.name : "менеджеру";
    const callLabel = `Позвонить ${managerName === "менеджеру" ? managerName : "менеджеру"}`;
    const smsLabel = "Чат с менеджером";
    const callAction = phoneHref
      ? `<a class="account-mobile-detail-contact-button account-mobile-detail-contact-call" href="tel:${escapeHtmlAttribute(phoneHref)}" data-account-no-card-open aria-label="${escapeHtmlAttribute(`Позвонить менеджеру ${managerName}`)}">
          <span aria-hidden="true">☎</span> ${escapeHtml(callLabel)}
        </a>`
      : `<button class="account-mobile-detail-contact-button account-mobile-detail-contact-call" type="button" data-account-no-card-open>
        <span aria-hidden="true">☎</span> Позвонить менеджеру
      </button>`;
    const smsAction = phoneHref
      ? `<a class="account-mobile-detail-contact-button account-mobile-detail-contact-chat" href="sms:${escapeHtmlAttribute(phoneHref)}" data-account-no-card-open aria-label="${escapeHtmlAttribute(`Написать SMS менеджеру ${managerName}`)}">
          <span aria-hidden="true">○</span> ${escapeHtml(smsLabel)}
        </a>`
      : `<button class="account-mobile-detail-contact-button account-mobile-detail-contact-chat" type="button" data-account-no-card-open>
          <span aria-hidden="true">○</span> ${escapeHtml(smsLabel)}
        </button>`;

    return `<div class="account-mobile-detail-contact-actions">
      ${callAction}
      ${smsAction}
    </div>`;
  }

  function renderAccountMobileDetailBottomNav() {
    return `<nav class="account-mobile-detail-bottom-nav" aria-label="Навигация кабинета">
      <a href="${buildAccountSectionHref("dashboard")}" aria-current="page"><span aria-hidden="true">▣</span>Заказы</a>
      <a href="${ACCOUNT_ROOT_PATH}"><span aria-hidden="true">▦</span>Календарь</a>
      <a href="${buildAccountSectionHref("payroll")}"><span aria-hidden="true">▱</span>Заработок</a>
    </nav>`;
  }

  function renderAccountMobileDetailTopAction(item = {}, uiState = {}) {
    const entryId = item && item.entry ? item.entry.id : "";
    if (!entryId || !uiState.nextAction) return "";
    if (uiState.orderStatus === "scheduled" && uiState.cleanerConfirmationStatus !== "confirmed") return "";
    if (uiState.orderStatus === "checklist" || uiState.orderStatus === "photos") return "";

    return `<form class="account-mobile-detail-top-action" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-no-card-open>
      <input type="hidden" name="action" value="${escapeHtmlAttribute(uiState.nextAction.action)}">
      <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
      <button class="account-mobile-detail-primary-button" type="submit">${escapeHtml(uiState.nextAction.label)}</button>
    </form>`;
  }

  function renderAccountMobileDetailTopStageActions(item = {}, uiState = {}) {
    if (uiState.orderStatus !== "photos") return "";
    const stageActions = renderAccountAssignmentActionForms(item, uiState, {
      mobile: true,
      mobilePlacement: "top",
    });
    if (!stageActions) return "";
    return `<div class="account-mobile-detail-top-stage-actions">${stageActions}</div>`;
  }

  function renderAccountMobileAssignmentDetailView(item = {}, options = {}) {
    if (!item || !item.entry) return "";

    const staffId = String(options.staffId || "").trim();
    const uiState = getAccountAssignmentUiState(item, staffId);
    const travelLeg = getAccountTravelLeg(item, staffId);
    const detailId = getAccountMobileOrderDetailId(item);
    const titleId = `${detailId}-title`;
    const serviceLabel = formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType);
    const addressParts = getAccountMobileAddressParts(item);
    const instructions = String((item.assignment && item.assignment.notes) || "").trim();
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.fullAddress)}`;
    const shouldRenderStageActions = uiState.orderStatus !== "checklist";
    const shouldRenderAddressActions =
      uiState.orderStatus === "scheduled" || uiState.orderStatus === "en-route";
    const instructionsSection = instructions
      ? `<section class="account-mobile-detail-card account-mobile-detail-instructions">
          <div class="account-mobile-detail-card-row">
            <span class="account-mobile-detail-card-icon">${renderAccountMobileDetailIcon("check")}</span>
            <div>
              <h3>Инструкции</h3>
              <p>${escapeHtml(instructions)}</p>
            </div>
          </div>
        </section>`
      : "";

    return `<section
      class="account-mobile-detail-view"
      id="${escapeHtmlAttribute(detailId)}"
      data-account-mobile-detail-view
      aria-labelledby="${escapeHtmlAttribute(titleId)}"
      hidden
    >
      <header class="account-mobile-detail-topbar">
        <button class="account-mobile-detail-back" type="button" data-account-mobile-detail-back aria-label="Назад к заказам">
          <span aria-hidden="true">←</span>
        </button>
      </header>
      <section class="account-mobile-detail-hero">
        <h2 id="${escapeHtmlAttribute(titleId)}">${escapeHtml(item.entry.customerName || "Клиент")}</h2>
        <p>${escapeHtml(item.scheduleLabel || "Время уточняется")}</p>
        <div class="account-mobile-badge-row">
          ${renderAccountCurrentStatusBadge(uiState)}
        </div>
      </section>
      <section class="account-mobile-detail-price-card">
        <span>${escapeHtml(serviceLabel)}</span>
        <strong>${escapeHtml(formatCurrencyAmount(item.entry.totalPrice))}</strong>
      </section>
      ${renderAccountMobileDetailTopAction(item, uiState)}
      ${renderAccountMobileDetailTopStageActions(item, uiState)}
      <section class="account-mobile-detail-card account-mobile-detail-address">
        <div class="account-mobile-detail-card-row">
          <span class="account-mobile-detail-card-icon">${renderAccountMobileDetailIcon("pin")}</span>
          <div>
            <h3>${escapeHtml(addressParts.title)}</h3>
            <p>${escapeHtml(addressParts.fullAddress)}</p>
            ${addressParts.locality ? `<p>${escapeHtml(addressParts.locality)}</p>` : ""}
            ${renderAccountTravelEstimate(travelLeg, { compact: true })}
          </div>
        </div>
        ${
          shouldRenderAddressActions
            ? `<button class="account-mobile-detail-soft-button" type="button" data-account-copy-text="${escapeHtmlAttribute(addressParts.fullAddress)}" data-account-no-card-open>
                <span aria-hidden="true">▣</span> Скопировать
              </button>
              <a class="account-mobile-detail-soft-button" href="${escapeHtmlAttribute(mapsHref)}" target="_blank" rel="noopener" data-account-no-card-open>
                <span aria-hidden="true">↗</span> Открыть в навигаторе
              </a>`
            : ""
        }
      </section>
      ${instructionsSection}
      ${renderAccountMobileDetailStats(item)}
      ${uiState.orderStatus === "checklist" ? renderAccountMobileDetailChecklist(item, uiState) : ""}
      ${renderAccountMobileDetailNotes(item)}
      ${renderAccountMobileDetailIssueHistory()}
      ${renderAccountMobileDetailContactActions(options.managerContact || null)}
      ${uiState.helperCopy ? `<p class="account-mobile-detail-helper">${escapeHtml(uiState.helperCopy)}</p>` : ""}
      ${
        shouldRenderStageActions
          ? renderAccountAssignmentActionForms(item, uiState, {
              mobile: true,
              mobilePlacement: "bottom",
            })
          : ""
      }
      ${renderAccountMobileDetailBottomNav()}
    </section>`;
  }

  function renderAccountMobileAssignmentDetailViews(orderItems = [], options = {}) {
    const items = Array.isArray(orderItems) ? orderItems : [];
    const seen = new Set();
    return items
      .map((item) => {
        const detailId = getAccountMobileOrderDetailId(item);
        if (seen.has(detailId)) return "";
        seen.add(detailId);
        return renderAccountMobileAssignmentDetailView(item, options);
      })
      .join("");
  }

  function renderAccountMobileDashboardStyles() {
    return `<style>
      .account-stage-editor {
        border: 1px solid rgba(165, 77, 99, 0.14);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.78);
        overflow: hidden;
      }
      .account-stage-editor-summary {
        cursor: pointer;
        list-style: none;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 15px;
        font-weight: 800;
        line-height: 1.2;
        color: #3c2230;
        -webkit-tap-highlight-color: transparent;
      }
      .account-stage-editor-summary::-webkit-details-marker {
        display: none;
      }
      .account-stage-editor-summary::after {
        content: "▾";
        flex-shrink: 0;
        margin-left: auto;
        color: #8b6e77;
      }
      .account-stage-editor-summary:focus,
      .account-stage-editor-summary:focus-visible {
        outline: none;
      }
      .account-stage-editor[open] .account-stage-editor-summary::after {
        content: "▴";
      }
      .account-stage-editor-body {
        padding: 0 16px 16px;
        display: grid;
        gap: 14px;
      }
      .account-stage-editor-copy {
        margin: 0;
        color: #736570;
        line-height: 1.45;
      }
      .account-stage-editor-toolbar,
      .account-stage-editor-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .account-checklist-list {
        display: grid;
        gap: 10px;
      }
      .account-checklist-item {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr);
        gap: 10px;
        align-items: flex-start;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(165, 77, 99, 0.12);
        background: #fbf7f5;
      }
      .account-checklist-item input {
        margin-top: 2px;
      }
      .account-checklist-item span {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .account-checklist-item strong,
      .account-checklist-item small {
        word-break: break-word;
      }
      .account-checklist-item small {
        color: #736570;
      }
      .account-photo-upload-grid {
        display: grid;
        gap: 12px;
      }
      .account-photo-upload-field {
        display: grid;
        gap: 8px;
      }
      .account-photo-upload-title {
        font-weight: 700;
        color: #3c2230;
      }
      .account-photo-upload-shell {
        position: relative;
        min-height: 76px;
        padding: 14px 16px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(165, 77, 99, 0.14);
        border-radius: 20px;
        background: #fff;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88);
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, opacity 0.2s ease;
        overflow: hidden;
      }
      .account-photo-upload-shell:focus-within {
        border-color: rgba(165, 77, 99, 0.34);
        box-shadow: 0 0 0 4px rgba(165, 77, 99, 0.08);
      }
      .account-photo-upload-shell[data-has-files="true"] {
        border-color: rgba(165, 77, 99, 0.26);
        background: linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(251, 244, 246, 0.98) 100%);
      }
      .account-photo-upload-shell[data-disabled="true"] {
        opacity: 0.56;
      }
      .account-photo-upload-input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .account-photo-upload-shell[data-disabled="true"] .account-photo-upload-input {
        cursor: not-allowed;
      }
      .account-photo-upload-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 14px;
        background: #f3e4e9;
        color: #a54d63;
        font-weight: 800;
        white-space: nowrap;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .account-photo-upload-shell[data-has-files="true"] .account-photo-upload-button {
        background: #a54d63;
        color: #fff;
      }
      .account-photo-upload-meta {
        min-width: 0;
        color: #5d515a;
        font-weight: 600;
        line-height: 1.35;
        word-break: break-word;
      }
      .account-photo-upload-field small {
        color: #736570;
        line-height: 1.4;
      }
      .account-photo-skip-field {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        padding: 12px 14px;
        border: 1px solid rgba(165, 77, 99, 0.14);
        border-radius: 16px;
        background: #fbf7f5;
        color: #3c2230;
        font-weight: 700;
        line-height: 1.35;
      }
      .account-photo-skip-field input {
        margin-top: 3px;
      }
      .account-mobile-action-button:disabled,
      .account-mobile-detail-primary-button:disabled,
      .account-mobile-detail-soft-button:disabled,
      .admin-button:disabled {
        opacity: 0.48;
        cursor: not-allowed;
        box-shadow: none;
      }
      .account-mobile-dashboard { display: none; }
      .account-desktop-stats,
      .account-desktop-assignments { display: block; }
      @media (max-width: 720px) {
        body:has([data-account-dashboard-root]) {
          background:
            radial-gradient(circle at top left, rgba(165, 77, 99, 0.16), transparent 34%),
            linear-gradient(180deg, #fff8f4 0%, #f7f1ec 100%);
          padding: 0 0 24px;
        }
        body:has([data-account-dashboard-root]) .admin-shell-with-sidebar {
          display: block;
          max-width: none;
          padding: 0;
        }
        body:has([data-account-dashboard-root]) .admin-sidebar,
        body:has([data-account-dashboard-root]) .admin-hero {
          display: none;
        }
        body:has([data-account-dashboard-root]) .admin-panel {
          background: transparent;
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }
        body:has([data-account-dashboard-root]) .admin-content {
          padding: 12px 12px 24px;
        }
        .account-mobile-dashboard {
          display: grid;
          gap: 16px;
          margin-bottom: 16px;
        }
        [data-account-mobile-dashboard-main] {
          display: grid;
          gap: 16px;
        }
        .account-desktop-stats,
        .account-desktop-assignments {
          display: none;
        }
        .account-mobile-summary-card,
        .account-mobile-order-card,
        .account-mobile-focus-card {
          border: 1px solid rgba(165, 77, 99, 0.16);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 18px 40px rgba(53, 27, 35, 0.08);
        }
        [data-account-mobile-detail-open] {
          cursor: pointer;
          touch-action: manipulation;
        }
        [data-account-mobile-detail-open]:focus-visible {
          outline: 3px solid rgba(255, 255, 255, 0.72);
          outline-offset: 4px;
        }
        .account-mobile-summary-card {
          padding: 22px 18px 18px;
          background:
            linear-gradient(150deg, rgba(165, 77, 99, 0.94), rgba(126, 55, 77, 0.94));
          color: #fff7f9;
          border-color: rgba(165, 77, 99, 0.32);
        }
        .account-mobile-summary-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .account-mobile-summary-kicker {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 240, 244, 0.72);
        }
        .account-mobile-summary-title {
          margin: 8px 0 4px;
          font-size: 28px;
          line-height: 1;
        }
        .account-mobile-summary-copy {
          margin: 0;
          color: rgba(255, 244, 247, 0.9);
          line-height: 1.45;
        }
        .account-mobile-summary-top form {
          flex-shrink: 0;
        }
        .account-mobile-logout-button {
          width: 48px;
          min-width: 48px;
          min-height: 48px;
          padding: 0;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.22);
        }
        .account-mobile-logout-button svg {
          width: 22px;
          height: 22px;
          display: block;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.85;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .account-mobile-summary-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 18px;
        }
        .account-mobile-metric {
          min-width: 0;
          padding: 12px 12px 10px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
          display: grid;
          gap: 4px;
        }
        .account-mobile-metric-label {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 240, 244, 0.72);
        }
        .account-mobile-metric-value {
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          color: #fff;
        }
        .account-mobile-focus-card {
          margin-top: 16px;
          padding: 16px;
          display: grid;
          gap: 12px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 245, 247, 0.96));
          border-color: rgba(255, 255, 255, 0.56);
          box-shadow: 0 14px 28px rgba(53, 27, 35, 0.12);
        }
        .account-mobile-focus-eyebrow,
        .account-mobile-order-kicker,
        .account-mobile-order-label {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8b6e77;
        }
        .account-mobile-focus-card .account-mobile-focus-eyebrow,
        .account-mobile-focus-card .account-mobile-order-label {
          color: #8c6574;
        }
        .account-mobile-focus-title,
        .account-mobile-order-title {
          margin: 0;
          font-size: 25px;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #1c1421;
        }
        .account-mobile-focus-title {
          color: #1c1421;
        }
        .account-mobile-focus-meta,
        .account-mobile-focus-address,
        .account-mobile-focus-travel,
        .account-mobile-order-request,
        .account-mobile-order-helper,
        .account-mobile-order-travel {
          margin: 0;
          color: #736570;
        }
        .account-mobile-focus-meta,
        .account-mobile-focus-address,
        .account-mobile-focus-travel {
          color: #655564;
        }
        .account-mobile-focus-address {
          font-weight: 600;
        }
        .account-mobile-focus-travel,
        .account-mobile-order-travel {
          font-size: 13px;
          line-height: 1.4;
        }
        .account-mobile-order-travel {
          margin-top: 2px;
        }
        .account-mobile-focus-card .admin-badge {
          background: rgba(255, 255, 255, 0.92);
          color: #5d3143;
          border-color: rgba(126, 55, 77, 0.16);
        }
        .account-mobile-focus-card .admin-badge-outline {
          background: rgba(165, 77, 99, 0.12);
          color: #6b384d;
          border-color: rgba(126, 55, 77, 0.22);
        }
        .account-mobile-focus-card .admin-badge-success {
          background: #effaf3;
          color: #1c6a4a;
          border-color: rgba(28, 106, 74, 0.18);
        }
        .account-mobile-focus-card .admin-badge-danger {
          background: #fff0f3;
          color: #a03a55;
          border-color: rgba(160, 58, 85, 0.18);
        }
        .account-mobile-section {
          display: grid;
          gap: 12px;
        }
        .account-mobile-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 4px;
        }
        .account-mobile-section-head h2,
        .account-mobile-section-head h3 {
          margin: 0;
          font-size: 20px;
          line-height: 1.1;
          color: #1c1421;
        }
        .account-mobile-section-pill {
          min-width: 34px;
          height: 34px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          border: 1px solid rgba(165, 77, 99, 0.18);
          background: rgba(255, 255, 255, 0.9);
          color: #7e374d;
          font-weight: 700;
        }
        .account-mobile-order-list {
          display: grid;
          gap: 14px;
        }
        .account-mobile-order-card {
          padding: 16px;
          display: grid;
          gap: 14px;
        }
        .account-mobile-order-head {
          display: grid;
          gap: 10px;
        }
        .account-mobile-badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .account-mobile-order-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 10px;
        }
        .account-mobile-order-field {
          min-width: 0;
          display: grid;
          gap: 4px;
          padding: 12px 12px 10px;
          border-radius: 18px;
          background: #fbf7f5;
          border: 1px solid rgba(165, 77, 99, 0.08);
        }
        .account-mobile-order-field strong,
        .account-mobile-order-helper {
          word-break: break-word;
        }
        .account-mobile-order-field-full {
          grid-column: 1 / -1;
        }
        .account-mobile-action-stack {
          display: grid;
          gap: 10px;
        }
        .account-mobile-action-stack > form,
        .account-mobile-action-stack > details {
          width: 100%;
        }
        .account-mobile-action-stack > details .account-stage-editor-summary {
          min-height: 52px;
          padding: 14px 18px;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 8px 18px rgba(60, 34, 48, 0.08);
        }
        .account-mobile-action-stack > details .account-stage-editor-body {
          padding: 14px 0 0;
        }
        .account-mobile-action-stack > details .account-stage-editor-toolbar .admin-button,
        .account-mobile-action-stack > details .account-stage-editor-actions .admin-button {
          min-height: 48px;
          border-radius: 16px;
        }
        .account-mobile-action-button {
          width: 100%;
          min-height: 52px;
          justify-content: center;
          border-radius: 18px;
          font-size: 16px;
          font-weight: 800;
          background: #3c2230;
          color: #fff;
          border-color: #3c2230;
          box-shadow: 0 10px 22px rgba(60, 34, 48, 0.18);
        }
        .account-mobile-action-stack .admin-button-secondary.account-mobile-action-button {
          background: rgba(255, 255, 255, 0.96);
          color: #3c2230;
          border-color: rgba(60, 34, 48, 0.14);
          box-shadow: none;
        }
        [data-account-mobile-dashboard-main][hidden],
        .account-mobile-detail-view[hidden] {
          display: none !important;
        }
        .account-mobile-detail-view {
          min-height: 100dvh;
          margin: -12px -12px -24px;
          padding: 0 12px 96px;
          display: grid;
          align-content: start;
          gap: 14px;
          background: #f1f0f6;
        }
        .account-mobile-detail-topbar {
          position: sticky;
          top: 0;
          z-index: 4;
          margin: 0 -12px;
          padding: 10px 12px;
          background: rgba(247, 247, 250, 0.92);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(28, 20, 33, 0.06);
        }
        .account-mobile-detail-back {
          width: 42px;
          height: 42px;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: #1c1421;
          font-size: 30px;
          line-height: 1;
        }
        .account-mobile-detail-hero {
          padding: 10px 2px 4px;
          display: grid;
          gap: 8px;
        }
        .account-mobile-detail-hero h2 {
          margin: 0;
          font-size: clamp(38px, 11vw, 52px);
          line-height: 0.96;
          letter-spacing: -0.07em;
          color: #0f0b13;
        }
        .account-mobile-detail-hero p {
          margin: 0;
          font-size: 24px;
          line-height: 1.18;
          color: #76727d;
        }
        .account-mobile-detail-price-card,
        .account-mobile-detail-card {
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 16px 28px rgba(30, 24, 38, 0.07);
        }
        .account-mobile-detail-price-card {
          min-height: 76px;
          padding: 18px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .account-mobile-detail-price-card span {
          min-width: 0;
          color: #6f6b73;
          font-size: 22px;
          font-weight: 600;
        }
        .account-mobile-detail-price-card strong {
          flex-shrink: 0;
          color: #a54d63;
          font-size: 40px;
          line-height: 1;
        }
        .account-mobile-detail-card {
          padding: 18px;
          display: grid;
          gap: 16px;
        }
        .account-mobile-detail-card h3 {
          margin: 0;
          color: #111014;
          font-size: 24px;
          line-height: 1.08;
          letter-spacing: -0.03em;
        }
        .account-mobile-detail-card p,
        .account-mobile-detail-muted,
        .account-mobile-detail-helper {
          margin: 0;
          color: #7a7580;
          font-size: 19px;
          line-height: 1.38;
        }
        .account-mobile-detail-helper {
          padding: 0 6px;
        }
        .account-mobile-detail-card-row {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        .account-mobile-detail-card-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f3e4e9;
          color: #a54d63;
        }
        .account-mobile-detail-card-icon svg {
          width: 30px;
          height: 30px;
          display: block;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.85;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .account-mobile-detail-soft-button {
          min-height: 58px;
          border: 0;
          border-radius: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #ececf2;
          color: #5f5c65;
          font-size: 20px;
          font-weight: 800;
          text-decoration: none;
        }
        .account-mobile-detail-top-action {
          margin: -2px 0 2px;
        }
        .account-mobile-detail-top-stage-actions {
          margin: -2px 0 2px;
        }
        .account-mobile-detail-primary-button {
          width: 100%;
          min-height: 72px;
          border: 0;
          border-radius: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 22px;
          background: #3c2230;
          color: #fff;
          font-size: 23px;
          font-weight: 900;
          box-shadow: 0 18px 32px rgba(60, 34, 48, 0.18);
        }
        .account-mobile-detail-stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .account-mobile-detail-stat {
          min-height: 108px;
          padding: 18px;
          border-radius: 20px;
          background: #f8f7fb;
          display: grid;
          align-content: center;
          gap: 8px;
        }
        .account-mobile-detail-stat span {
          color: #817d86;
          font-size: 18px;
          font-weight: 800;
        }
        .account-mobile-detail-stat strong {
          color: #0f0b13;
          font-size: 28px;
          line-height: 1;
        }
        .account-mobile-detail-timeline ol {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
        }
        .account-mobile-detail-timeline li {
          position: relative;
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          gap: 18px;
          align-items: center;
          min-height: 66px;
          color: #8b8790;
        }
        .account-mobile-detail-timeline li::after {
          content: "";
          position: absolute;
          left: 23px;
          top: 47px;
          bottom: -19px;
          width: 2px;
          background: #ececf2;
        }
        .account-mobile-detail-timeline li:last-child::after {
          display: none;
        }
        .account-mobile-detail-timeline li span {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #ececf2;
          background: #fff;
          font-weight: 800;
        }
        .account-mobile-detail-timeline li strong {
          font-size: 21px;
        }
        .account-mobile-detail-timeline li.is-current,
        .account-mobile-detail-timeline li.is-complete {
          color: #111014;
        }
        .account-mobile-detail-timeline li.is-current span {
          background: #a54d63;
          border-color: #a54d63;
          color: #fff;
        }
        .account-mobile-detail-timeline li.is-complete span {
          background: #f3e4e9;
          border-color: #f3e4e9;
          color: #a54d63;
        }
        .account-mobile-detail-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .account-mobile-detail-card-head span {
          color: #7a7580;
          font-size: 19px;
          font-weight: 800;
        }
        .account-mobile-detail-progress {
          height: 10px;
          border-radius: 999px;
          overflow: hidden;
          background: #ececf2;
        }
        .account-mobile-detail-progress span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #a54d63;
        }
        .account-mobile-detail-checklist-list {
          display: grid;
          gap: 14px;
        }
        .account-mobile-detail-checklist-form {
          display: grid;
          gap: 14px;
        }
        .account-mobile-detail-checklist-item {
          position: relative;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          cursor: pointer;
        }
        .account-mobile-detail-checklist-item input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .account-mobile-detail-check {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 2px solid #dfdde3;
          background: #fff;
        }
        .account-mobile-detail-checklist-item input:checked + .account-mobile-detail-check,
        .account-mobile-detail-checklist-item.is-complete .account-mobile-detail-check {
          background: #a54d63;
          border-color: #a54d63;
          box-shadow: inset 0 0 0 9px #fff;
        }
        .account-mobile-detail-checklist-item strong {
          display: block;
          color: #0f0b13;
          font-size: 21px;
          line-height: 1.18;
        }
        .account-mobile-detail-checklist-item small {
          display: block;
          margin-top: 6px;
          color: #7a7580;
          font-size: 17px;
          line-height: 1.26;
        }
        .account-mobile-detail-note-box,
        .account-mobile-detail-textarea {
          min-height: 116px;
          border: 0;
          border-radius: 18px;
          padding: 18px;
          background: #f7f6fa;
          color: #7a7580;
          font: inherit;
          font-size: 20px;
          line-height: 1.35;
        }
        .account-mobile-detail-note-box-small {
          min-height: 58px;
        }
        .account-mobile-detail-textarea {
          resize: vertical;
        }
        .account-mobile-detail-notes-form {
          display: grid;
          gap: 14px;
        }
        .account-mobile-detail-note-log {
          display: grid;
          gap: 10px;
        }
        .account-mobile-detail-note-item {
          display: grid;
          gap: 6px;
          padding: 14px 16px;
          border-radius: 18px;
          background: #f7f6fa;
        }
        .account-mobile-detail-note-item span {
          color: #8c7d86;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.3;
        }
        .account-mobile-detail-note-item p {
          margin: 0;
          color: #1a1620;
          font-size: 18px;
          line-height: 1.35;
        }
        .account-mobile-detail-contact-actions {
          display: grid;
          gap: 12px;
        }
        .account-mobile-detail-contact-button {
          min-height: 74px;
          border: 0;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 21px;
          font-weight: 800;
          text-decoration: none;
        }
        .account-mobile-detail-contact-call {
          background: #dfeee8;
          color: #56a875;
        }
        .account-mobile-detail-contact-chat {
          background: #eadfe6;
          color: #a54d63;
        }
        .account-mobile-detail-view > .account-mobile-action-stack.account-mobile-action-stack-bottom {
          position: sticky;
          bottom: 82px;
          z-index: 3;
        }
        .account-mobile-detail-view > .account-mobile-action-stack.account-mobile-action-stack-bottom .account-mobile-action-button {
          min-height: 72px;
          border-radius: 20px;
          background: #a54d63;
          border-color: #a54d63;
          font-size: 23px;
        }
        .account-mobile-detail-view > .account-mobile-action-stack.account-mobile-action-stack-bottom .admin-button-secondary.account-mobile-action-button {
          background: #ececf2;
          color: #5f5c65;
          border-color: #ececf2;
        }
        .account-mobile-detail-view > .account-mobile-action-stack > details .account-stage-editor-summary {
          min-height: 60px;
          padding: 18px 20px;
          border-radius: 20px;
          font-size: 18px;
          line-height: 1.18;
        }
        .account-mobile-detail-view > .account-mobile-action-stack > details .account-stage-editor-body {
          padding: 16px 0 0;
        }
        .account-mobile-detail-view > .account-mobile-action-stack > details .account-stage-editor-copy {
          font-size: 18px;
          line-height: 1.4;
        }
        .account-mobile-detail-view .account-photo-upload-grid {
          gap: 16px;
        }
        .account-mobile-detail-view .account-photo-upload-field {
          gap: 10px;
        }
        .account-mobile-detail-view .account-photo-upload-title {
          font-size: 18px;
        }
        .account-mobile-detail-view .account-photo-upload-shell {
          min-height: 0;
          padding: 16px;
          grid-template-columns: minmax(0, 1fr);
          align-items: start;
          gap: 12px;
          border-radius: 18px;
        }
        .account-mobile-detail-view .account-photo-upload-button {
          width: 100%;
          min-height: 52px;
          border-radius: 16px;
          font-size: 18px;
        }
        .account-mobile-detail-view .account-photo-upload-meta {
          font-size: 18px;
          line-height: 1.35;
        }
        .account-mobile-detail-view .account-photo-upload-field small {
          font-size: 16px;
          line-height: 1.45;
        }
        .account-mobile-detail-view .account-photo-skip-field {
          padding: 16px;
          grid-template-columns: 24px minmax(0, 1fr);
          align-items: start;
          gap: 12px;
        }
        .account-mobile-detail-view .account-photo-skip-field input {
          width: 24px;
          height: 24px;
          margin-top: 4px;
        }
        .account-mobile-detail-view .account-photo-skip-field span {
          font-size: 18px;
          line-height: 1.35;
        }
        .account-mobile-detail-bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 5;
          min-height: 78px;
          padding: 10px 22px calc(10px + env(safe-area-inset-bottom));
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          background: rgba(255, 255, 255, 0.94);
          border-top: 1px solid rgba(28, 20, 33, 0.08);
          box-shadow: 0 -16px 28px rgba(30, 24, 38, 0.08);
        }
        .account-mobile-detail-bottom-nav a {
          display: grid;
          justify-items: center;
          gap: 4px;
          color: #8c8991;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }
        .account-mobile-detail-bottom-nav a[aria-current="page"] {
          color: #a54d63;
        }
        .account-mobile-detail-bottom-nav span {
          font-size: 22px;
          line-height: 1;
        }
        .account-mobile-detail-address .account-mobile-order-travel {
          margin-top: 8px;
          color: #6f6170;
          font-size: 17px;
        }
        .account-mobile-detail-view .admin-badge {
          min-height: 38px;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 16px;
        }
        .account-mobile-detail-view .account-stage-editor {
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 16px 28px rgba(30, 24, 38, 0.07);
        }
        .account-mobile-detail-view .account-stage-editor-summary {
          min-height: 64px;
          padding: 20px;
          font-size: 20px;
        }
        .account-mobile-detail-view .account-stage-editor-body {
          padding: 0 18px 18px;
        }
        @media (max-width: 420px) {
          .account-mobile-detail-hero h2 {
            font-size: 38px;
          }
          .account-mobile-detail-hero p,
          .account-mobile-detail-price-card span {
            font-size: 20px;
          }
          .account-mobile-detail-price-card strong {
            font-size: 34px;
          }
          .account-mobile-detail-card {
            padding: 16px;
          }
          .account-mobile-detail-stats {
            grid-template-columns: 1fr 1fr;
          }
        }
      }
    </style>`;
  }

  function renderAccountTravelEstimateScript() {
    return "";
  }

  function renderAccountStageEditorsScript() {
    return `<script>
      (() => {
        const interactiveSelector = [
          "a",
          "button",
          "input",
          "select",
          "textarea",
          "label",
          "summary",
          "details",
          "form",
          ".account-mobile-action-stack",
          "[data-admin-dialog-open]",
          "[data-admin-dialog-close]",
          "[data-account-no-card-open]"
        ].join(",");

        function shouldSkipCardOpen(target) {
          return Boolean(target && target.closest && target.closest(interactiveSelector));
        }

        function getDashboardMain() {
          return document.querySelector("[data-account-mobile-dashboard-main]");
        }

        function getDetailViews() {
          return Array.from(document.querySelectorAll("[data-account-mobile-detail-view]"));
        }

        function getActiveDetailId() {
          const activeDetail = document.querySelector("[data-account-mobile-detail-view]:not([hidden])");
          return activeDetail ? activeDetail.id || "" : "";
        }

        function openAccountOrderDetail(detailId) {
          const dashboardMain = getDashboardMain();
          const detailViews = getDetailViews();
          const detail = detailId ? document.getElementById(detailId) : null;
          if (!detail || !dashboardMain) return;
          detailViews.forEach((view) => {
            view.hidden = view !== detail;
          });
          dashboardMain.hidden = true;
          detail.hidden = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        }

        function closeAccountOrderDetail() {
          const dashboardMain = getDashboardMain();
          const detailViews = getDetailViews();
          detailViews.forEach((view) => {
            view.hidden = true;
          });
          if (dashboardMain) {
            dashboardMain.hidden = false;
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        }

        function showAccountInlineNotice(message, tone = "info", timeoutMs = 3500) {
          const normalizedMessage = String(message || "").trim();
          if (!normalizedMessage) return;
          let stack = document.querySelector(".account-system-notice-stack");
          if (!stack) {
            stack = document.createElement("div");
            stack.className = "account-system-notice-stack";
            document.body.appendChild(stack);
          }
          const notice = document.createElement("div");
          notice.className = tone === "error"
            ? "admin-alert admin-alert-error account-system-notice"
            : "admin-alert admin-alert-info account-system-notice";
          notice.setAttribute("data-account-system-notice", "true");
          notice.setAttribute("data-account-notice-timeout", String(timeoutMs));
          notice.setAttribute("role", "status");
          const closeButton = document.createElement("button");
          closeButton.className = "account-system-notice-close";
          closeButton.type = "button";
          closeButton.setAttribute("data-account-notice-close", "true");
          closeButton.setAttribute("aria-label", "Закрыть уведомление");
          closeButton.textContent = "×";
          const copy = document.createElement("span");
          copy.className = "account-system-notice-copy";
          copy.textContent = normalizedMessage;
          notice.appendChild(closeButton);
          notice.appendChild(copy);
          stack.appendChild(notice);
          if (typeof window.bindAccountSystemNotices === "function") {
            window.bindAccountSystemNotices();
          }
        }

        function updateChecklistCompletionState(editor) {
          const inputs = Array.from(editor.querySelectorAll("input[type='checkbox'][name='checklistItemId']"));
          const completeButton = editor.querySelector("[data-account-checklist-complete-button='true']");
          const allChecked = inputs.length > 0 && inputs.every((input) => input.checked);
          inputs.forEach((input) => {
            const item = input.closest(".account-mobile-detail-checklist-item");
            if (item) item.classList.toggle("is-complete", input.checked);
          });
          if (completeButton instanceof HTMLButtonElement) {
            completeButton.disabled = !allChecked;
          }
        }

        function updatePhotoCompletionState(editor) {
          const beforeInput = editor.querySelector("[data-account-photo-input='before']");
          const afterInput = editor.querySelector("[data-account-photo-input='after']");
          const skipInput = editor.querySelector("[data-account-photo-skip='true']");
          const completeButton = editor.querySelector("[data-account-photo-complete-button='true']");
          const hasBeforeUpload = beforeInput instanceof HTMLInputElement && beforeInput.files && beforeInput.files.length > 0;
          const hasAfterUpload = afterInput instanceof HTMLInputElement && afterInput.files && afterInput.files.length > 0;
          const hasStoredBefore =
            beforeInput instanceof HTMLInputElement &&
            Number(beforeInput.getAttribute("data-account-photo-stored-count") || "0") > 0;
          const hasStoredAfter =
            afterInput instanceof HTMLInputElement &&
            Number(afterInput.getAttribute("data-account-photo-stored-count") || "0") > 0;
          const skipped = skipInput instanceof HTMLInputElement && skipInput.checked;
          const ready = skipped || ((hasBeforeUpload || hasStoredBefore) && (hasAfterUpload || hasStoredAfter));
          if (completeButton instanceof HTMLButtonElement) {
            completeButton.disabled = !ready;
          }
          [beforeInput, afterInput].forEach((input) => {
            if (input instanceof HTMLInputElement) {
              input.disabled = skipped;
              const field = input.closest(".account-photo-upload-field");
              const shell = field ? field.querySelector(".account-photo-upload-shell") : null;
              const meta = field ? field.querySelector(".account-photo-upload-meta") : null;
              const help = field ? field.querySelector("small") : null;
              const storedCount = Number(input.getAttribute("data-account-photo-stored-count") || "0");
              const selectedCount = input.files ? input.files.length : 0;
              const hasFiles = selectedCount > 0 || storedCount > 0;
              if (shell) {
                shell.setAttribute("data-disabled", skipped ? "true" : "false");
                shell.setAttribute("data-has-files", hasFiles ? "true" : "false");
              }
              if (meta) {
                if (selectedCount > 1) {
                  meta.textContent = "Выбрано файлов: " + String(selectedCount);
                } else if (selectedCount === 1 && input.files && input.files[0]) {
                  meta.textContent = input.files[0].name;
                } else if (storedCount > 0) {
                  meta.textContent = "Сейчас загружено: " + String(storedCount);
                } else {
                  meta.textContent = "Файлы не выбраны";
                }
              }
              if (help) {
                if (selectedCount > 0) {
                  help.textContent =
                    selectedCount === 1
                      ? "Новый файл будет загружен после сохранения."
                      : "Новые файлы будут загружены после сохранения.";
                } else if (storedCount > 0) {
                  help.textContent =
                    "Сейчас загружено: " +
                    String(storedCount) +
                    ". При выборе новые файлы заменят текущие.";
                } else {
                  help.textContent = "Можно выбрать несколько фотографий.";
                }
              }
            }
          });
        }

        async function refreshAccountDashboard(refreshPath, detailIdToRestore) {
          const response = await fetch(refreshPath || "/account", {
            credentials: "same-origin",
            headers: { "X-Shynli-Account-Partial": "1" }
          });
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const nextRoot = doc.querySelector("[data-account-dashboard-root]");
          const currentRoot = document.querySelector("[data-account-dashboard-root]");
          if (!nextRoot || !currentRoot) {
            window.location.href = refreshPath || "/account";
            return;
          }
          currentRoot.replaceWith(document.importNode(nextRoot, true));
          bindAccountInteractions();
          if (typeof window.bindAccountSystemNotices === "function") {
            window.bindAccountSystemNotices();
          }
          if (detailIdToRestore && document.getElementById(detailIdToRestore)) {
            openAccountOrderDetail(detailIdToRestore);
          }
        }

        function getAccountAsyncFormAction(form) {
          if (!(form instanceof HTMLFormElement)) return "/account";
          const attributeAction = String(form.getAttribute("action") || "").trim();
          if (attributeAction) return attributeAction;
          const propertyAction = typeof form.action === "string" ? form.action.trim() : "";
          return propertyAction || "/account";
        }

        async function submitAccountAsyncForm(form) {
          const detailIdToRestore = getActiveDetailId();
          const formAction = getAccountAsyncFormAction(form);
          const submitButtons = Array.from(form.querySelectorAll("button[type='submit']"));
          submitButtons.forEach((button) => {
            if (button instanceof HTMLButtonElement) {
              button.disabled = true;
              button.setAttribute("data-account-submit-pending", "true");
            }
          });
          try {
            const response = await fetch(formAction, {
              method: "POST",
              body: new FormData(form),
              credentials: "same-origin",
              headers: {
                Accept: "application/json",
                "X-Shynli-Account-Async": "1"
              }
            });
            const responseContentType = String(response.headers.get("content-type") || "").toLowerCase();
            if (!responseContentType.includes("application/json")) {
              window.location.href = response.url || formAction || "/account";
              return;
            }
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) {
              throw new Error(payload.message || "Не удалось обновить заказ. Попробуйте ещё раз.");
            }
            const refreshPath = payload.refreshPath || "/account";
            try {
              await refreshAccountDashboard(refreshPath, detailIdToRestore || payload.detailId || "");
            } catch {
              window.location.href = refreshPath;
            }
          } catch (error) {
            showAccountInlineNotice(error && error.message ? error.message : "Не удалось обновить заказ.", "error", 5000);
            submitButtons.forEach((button) => {
              if (button instanceof HTMLButtonElement) {
                button.disabled = false;
                button.removeAttribute("data-account-submit-pending");
              }
            });
          }
        }

        function bindAccountInteractions() {
          if (typeof window.bindAccountSystemNotices === "function") {
            window.bindAccountSystemNotices();
          }

          document.querySelectorAll("[data-account-mobile-detail-open]:not([data-account-bound='true'])").forEach((card) => {
            card.setAttribute("data-account-bound", "true");
            const detailId = card.getAttribute("data-account-mobile-detail-open") || "";
            card.addEventListener("click", (event) => {
              const target = event.target instanceof Element ? event.target : null;
              if (shouldSkipCardOpen(target)) return;
              openAccountOrderDetail(detailId);
            });
            card.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              if (event.target !== card) return;
              event.preventDefault();
              openAccountOrderDetail(detailId);
            });
          });

          document.querySelectorAll("[data-account-mobile-detail-back]:not([data-account-bound='true'])").forEach((button) => {
            button.setAttribute("data-account-bound", "true");
            button.addEventListener("click", closeAccountOrderDetail);
          });

          document.querySelectorAll("[data-account-copy-text]:not([data-account-bound='true'])").forEach((button) => {
            button.setAttribute("data-account-bound", "true");
            button.addEventListener("click", async () => {
              const value = button.getAttribute("data-account-copy-text") || "";
              if (!value) return;
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(value);
                }
                button.textContent = "Скопировано";
                window.setTimeout(() => {
                  button.textContent = "▣ Скопировать";
                }, 1800);
              } catch {
                button.textContent = value;
              }
            });
          });

          document.querySelectorAll("[data-account-checklist-editor]:not([data-account-bound='true'])").forEach((editor) => {
            editor.setAttribute("data-account-bound", "true");
            const selectAllButton = editor.querySelector("[data-account-checklist-select-all='true']");
            const clearAllButton = editor.querySelector("[data-account-checklist-clear-all='true']");
            const inputs = Array.from(editor.querySelectorAll("input[type='checkbox'][name='checklistItemId']"));
            if (!inputs.length) return;
            updateChecklistCompletionState(editor);

            if (selectAllButton instanceof HTMLButtonElement) {
              selectAllButton.addEventListener("click", () => {
                inputs.forEach((input) => {
                  input.checked = true;
                });
                updateChecklistCompletionState(editor);
              });
            }

            if (clearAllButton instanceof HTMLButtonElement) {
              clearAllButton.addEventListener("click", () => {
                inputs.forEach((input) => {
                  input.checked = false;
                });
                updateChecklistCompletionState(editor);
              });
            }

            inputs.forEach((input) => {
              input.addEventListener("change", () => updateChecklistCompletionState(editor));
            });
          });

          document.querySelectorAll("[data-account-photo-complete-form='true']:not([data-account-bound='true'])").forEach((editor) => {
            editor.setAttribute("data-account-bound", "true");
            updatePhotoCompletionState(editor);
            editor.querySelectorAll("input").forEach((input) => {
              input.addEventListener("change", () => updatePhotoCompletionState(editor));
            });
          });

          document.querySelectorAll("form[data-account-async-form='true']:not([data-account-async-bound='true'])").forEach((form) => {
            form.setAttribute("data-account-async-bound", "true");
            form.addEventListener("submit", (event) => {
              event.preventDefault();
              submitAccountAsyncForm(form);
            });
          });
        }

        bindAccountInteractions();
        window.bindAccountInteractions = bindAccountInteractions;
      })();
    </script>`;
  }

  function renderAccountAssignmentsTable(orderItems = [], options = {}) {
    if (!orderItems.length) {
      return `<div class="admin-empty-state">Пока на вас ничего не назначено. Как только администратор привяжет заявку, она появится здесь.</div>`;
    }

    const staffId = String(options.staffId || "").trim();

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Услуга</th>
            <th>Дата и время</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          ${orderItems
            .map((item) => `<tr>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(item.entry.customerName || "Клиент")}</span>
                  <span class="admin-table-muted">${escapeHtml(item.entry.requestId || item.entry.id)}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType))}</span>
                  <span class="admin-table-muted">${escapeHtml(formatCurrencyAmount(item.entry.totalPrice))}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(item.scheduleLabel || "Не указано")}</span>
                  <span class="admin-table-muted">${escapeHtml(formatAdminDateTime(item.entry.createdAt))}</span>
                </div>
              </td>
              <td>
                ${renderAccountAssignmentActions(item, staffId)}
              </td>
              <td>
                ${item.entry.fullAddress
                  ? `<span class="admin-line-clamp-two">${escapeHtml(item.entry.fullAddress)}</span>`
                  : `<span class="admin-table-muted">Не указан</span>`}
              </td>
              <td>
                ${item.assignment && item.assignment.notes
                  ? `<span class="admin-line-clamp-two">${escapeHtml(item.assignment.notes)}</span>`
                  : `<span class="admin-table-muted">Без комментария</span>`}
              </td>
            </tr>`)
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderAccountDesktopMetrics(metrics = []) {
    const items = Array.isArray(metrics) ? metrics.filter(Boolean) : [];
    if (!items.length) return "";

    return `<div class="admin-orders-metrics account-desktop-metrics">
      ${items
        .map((item) => {
          const className = item.emphasis
            ? "admin-orders-metric admin-orders-metric-emphasis"
            : "admin-orders-metric";
          return `<article class="${className}">
            <span class="admin-orders-metric-label">${escapeHtml(item.label)}</span>
            <strong class="admin-orders-metric-value">${escapeHtml(String(item.value))}</strong>
            <p class="admin-orders-metric-copy">${escapeHtml(item.copy)}</p>
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderAccountMobileDashboard(orderItems = [], options = {}) {
    const user = options.user || null;
    const staffRecord = options.staffRecord || null;
    const activeOrders = orderItems.filter((item) => {
      const orderStatus = getAccountOrderStatus(item);
      return (
        orderStatus === "scheduled" ||
        orderStatus === "en-route" ||
        orderStatus === "cleaning-started" ||
        orderStatus === "checklist" ||
        orderStatus === "photos"
      );
    });
    const primaryAssignment = getAccountPrimaryMobileAssignment(orderItems, options.staffId || "");
    const dueTodayCount = orderItems.filter((item) => item.hasSchedule).length;
    const pendingCount = orderItems.filter((item) => {
      const uiState = getAccountAssignmentUiState(item, options.staffId || "");
      return uiState.orderStatus === "scheduled" && uiState.cleanerConfirmationStatus !== "confirmed";
    }).length;
    const completedCount = orderItems.filter((item) => {
      const status = getAccountOrderStatus(item);
      return status === "cleaning-complete" || status === "completed";
    }).length;

    return `<section class="account-mobile-dashboard" data-account-mobile-dashboard>
      <div data-account-mobile-dashboard-main>
        <div class="account-mobile-summary-card">
          <div class="account-mobile-summary-top">
            <div>
              <p class="account-mobile-summary-kicker">Cleaning app</p>
              <h2 class="account-mobile-summary-title">${escapeHtml(
                (staffRecord && staffRecord.name) || (user && user.email) || "Мой кабинет"
              )}</h2>
              <p class="account-mobile-summary-copy">Назначенные на вас заказы.</p>
            </div>
            <form method="post" action="${ACCOUNT_LOGOUT_PATH}">
              <button class="admin-button account-mobile-logout-button" type="submit" aria-label="Выйти" title="Выйти">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 5H6.75C5.78 5 5 5.78 5 6.75v10.5C5 18.22 5.78 19 6.75 19H10" />
                  <path d="M13 8l4 4-4 4" />
                  <path d="M9 12h8" />
                  <path d="M10 4.5h4.25C15.22 4.5 16 5.28 16 6.25v1.5" />
                </svg>
              </button>
            </form>
          </div>
          <div class="account-mobile-summary-metrics">
            <div class="account-mobile-metric">
              <span class="account-mobile-metric-label">Активно</span>
              <strong class="account-mobile-metric-value">${escapeHtml(String(activeOrders.length))}</strong>
            </div>
            <div class="account-mobile-metric">
              <span class="account-mobile-metric-label">Со временем</span>
              <strong class="account-mobile-metric-value">${escapeHtml(String(dueTodayCount))}</strong>
            </div>
            <div class="account-mobile-metric">
              <span class="account-mobile-metric-label">Нужно ответить</span>
              <strong class="account-mobile-metric-value">${escapeHtml(String(pendingCount))}</strong>
            </div>
          </div>
          ${
            primaryAssignment
              ? renderAccountMobileFeaturedAssignment(primaryAssignment, { staffId: options.staffId || "" })
              : `<div class="account-mobile-focus-card">
                  <p class="account-mobile-focus-eyebrow">Сегодня спокойно</p>
                  <h3 class="account-mobile-focus-title">Пока без назначений</h3>
                  <p class="account-mobile-focus-meta">Как только администратор привяжет заказ, он появится здесь.</p>
                </div>`
          }
        </div>
        <div class="account-mobile-section">
          <div class="account-mobile-section-head">
            <h3>Мои заказы</h3>
            <span class="account-mobile-section-pill">${escapeHtml(String(orderItems.length))}</span>
          </div>
          <div class="account-mobile-order-list">
            ${orderItems
              .map((item) =>
                renderAccountMobileAssignmentCard(item, {
                  staffId: options.staffId || "",
                })
              )
              .join("")}
          </div>
        </div>
        ${
          completedCount
            ? `<div class="account-mobile-section">
                <div class="account-mobile-section-head">
                  <h3>Завершено</h3>
                  <span class="account-mobile-section-pill">${escapeHtml(String(completedCount))}</span>
                </div>
              </div>`
            : ""
        }
      </div>
      ${renderAccountMobileAssignmentDetailViews(orderItems, {
        staffId: options.staffId || "",
        managerContact: options.managerContact || null,
      })}
    </section>`;
  }

  function renderLoginPage(options = {}) {
    const setupMode = Boolean(options.setupMode);
    const nextPath = String(options.nextPath || "");
    const hiddenNextField = nextPath
      ? `<input type="hidden" name="next" value="${escapeHtmlAttribute(nextPath)}">`
      : "";
    const opensW9Flow = isW9NextPath(nextPath);
    const errorBlock = options.error
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
      : "";
    const infoBlock = options.info
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(options.info)}</div>`
      : "";
    const emailValue = escapeHtmlText(options.email || "");

    const primaryCard = setupMode
      ? renderAdminCard(
          "Задайте пароль",
          opensW9Flow
            ? "Email уже подтверждён. Сохраните первый пароль, и система сразу откроет документы сотрудника."
            : "Email уже подтверждён. Сохраните свой первый пароль, и кабинет откроется сразу.",
          `<form class="admin-form" method="post" action="${ACCOUNT_LOGIN_PATH}" autocomplete="on">
            <input type="hidden" name="action" value="setup-first-password">
            ${hiddenNextField}
            <label class="admin-label">
              Почта
              <input class="admin-input" type="email" name="email" value="${emailValue}" autocomplete="username" readonly required>
            </label>
            <label class="admin-label">
              Новый пароль
              <input class="admin-input" type="password" name="newPassword" autocomplete="new-password" minlength="8" required>
            </label>
            <label class="admin-label">
              Повторите пароль
              <input class="admin-input" type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required>
            </label>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Сохранить и войти</button>
            </div>
          </form>`,
          { eyebrow: "Первый вход" }
        )
      : renderAdminCard(
          "Вход",
          opensW9Flow
            ? "Используйте рабочую почту и пароль. После входа откроется раздел документов сотрудника."
            : "Используйте свою рабочую почту и пароль.",
          `<form class="admin-form" method="post" action="${ACCOUNT_LOGIN_PATH}" autocomplete="on">
            ${hiddenNextField}
            <label class="admin-label">
              Почта
              <input class="admin-input" type="email" name="email" value="${emailValue}" autocomplete="username" required>
            </label>
            <label class="admin-label">
              Пароль
              <input class="admin-input" type="password" name="password" autocomplete="current-password">
            </label>
            <p class="admin-helper-copy">Если это первый вход после подтверждения email, оставьте пароль пустым и нажмите «Войти».</p>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Войти</button>
            </div>
          </form>`,
          { eyebrow: "Доступ" }
        );

    const secondaryCard = setupMode
      ? renderAdminCard(
          "Что будет дальше",
          opensW9Flow
            ? "После сохранения вы сразу попадёте в раздел документов и сможете сформировать Contract и W-9."
            : "После сохранения вы сразу попадёте в кабинет сотрудника.",
          `<ul class="admin-feature-list">
            <li>Пароль сохранится только для этого аккаунта.</li>
            <li>Дальше вход будет уже по email и вашему паролю.</li>
            <li>${escapeHtml(opensW9Flow ? "После входа откроется раздел документов сотрудника." : "Потом пароль можно будет поменять в кабинете.")}</li>
          </ul>`,
          { eyebrow: "Безопасность", muted: true }
        )
      : renderAdminCard(
          "Что будет внутри",
          opensW9Flow
            ? "После входа откроется нужный раздел документов сотрудника, а остальные данные кабинета останутся ниже на странице."
            : "После входа вы увидите только свои заявки и сможете обновить личные данные.",
          `<ul class="admin-feature-list">
            <li>${escapeHtml(opensW9Flow ? "Сразу откроется Contract + W-9." : "Назначенные на вас заявки.")}</li>
            <li>Ваш телефон и email.</li>
            <li>${escapeHtml(opensW9Flow ? "После отправки система сама сгенерирует оба PDF." : "Смена собственного пароля.")}</li>
          </ul>`,
          { eyebrow: "Кабинет", muted: true }
        );

    return renderAdminLayout(
      "Вход сотрудника",
      `${errorBlock}
      ${infoBlock}
      <div class="admin-section-grid admin-form-grid-two">
        ${primaryCard}
        ${secondaryCard}
      </div>`,
      {
        subtitle: "Личный кабинет сотрудника для работы с назначенными заявками.",
        sidebar: `<div class="admin-sidebar-card">
          <div class="admin-brand">
            <div class="admin-brand-mark">S</div>
            <div>
              <p class="admin-sidebar-label">SHYNLI CLEANING</p>
              <h2 class="admin-sidebar-title">Кабинет сотрудника</h2>
            </div>
          </div>
          <p class="admin-sidebar-copy">Отдельный вход для сотрудников команды.</p>
        </div>`,
      }
    );
  }

  function renderUnavailablePage() {
    return renderAdminLayout(
      "Кабинет недоступен",
      renderAdminCard(
        "Доступ пока не настроен",
        "Пользовательские аккаунты ещё не подключены.",
        `<div class="admin-alert admin-alert-error">Обратитесь к администратору, чтобы вам создали аккаунт.</div>`,
        { eyebrow: "Статус", muted: true }
      ),
      {
        subtitle: "Когда администратор создаст пользователя, здесь появится доступ.",
      }
    );
  }

  function renderDashboardPage(userContext, options = {}) {
    const noticeBlock = renderAccountNotice(options.notice || "", options.noticeMessage || "");
    const user = userContext.user;
    const staffRecord = userContext.staffRecord;
    const staffSummary = userContext.staffSummary;
    const assignedOrders = Array.isArray(userContext.assignedOrders) ? userContext.assignedOrders : [];
    const focusSection = String(options.focusSection || "").toLowerCase();
    const w9Focused = focusSection === "w9";
    const notice = String(options.notice || "");
    const shouldShowW9 = !isAdminWorkspaceRole(user && user.role) || isEmployeeLinkedUser(user);
    const hasOnboardingDocuments = Boolean(staffRecord && staffRecord.w9 && staffRecord.contract);
    const w9DetailsOpen = notice === "w9-error" || (w9Focused && !hasOnboardingDocuments);
    const w9ReminderBlock =
      shouldShowW9 && staffRecord && !hasOnboardingDocuments
        ? renderAccountSystemNotice(
            "Для завершения профиля заполните документы сотрудника. После отправки система автоматически прикрепит к вашей карточке Contract и W-9.",
            "info",
            60000
          )
        : "";
    const w9FocusBlock =
      shouldShowW9 && w9Focused && staffRecord && !hasOnboardingDocuments
        ? renderAccountSystemNotice(
            "Открылся раздел документов сотрудника. Заполните форму ниже и нажмите «Сформировать документы».",
            "info",
            60000
          )
        : "";
    const systemNotices = [noticeBlock, w9FocusBlock, w9ReminderBlock].filter(Boolean).join("");

    const upcomingCount = assignedOrders.filter((item) => item.hasSchedule).length;
    const needsAttentionCount = assignedOrders.filter((item) => item.assignmentStatus === "issue" || item.entry.status !== "success").length;
    const completedCount = assignedOrders.filter((item) => item.assignmentStatus === "completed").length;
    const profileDetailsOpen = notice === "profile-error";
    const passwordDetailsOpen = notice === "password-error";
    const staffId = staffRecord && staffRecord.id ? staffRecord.id : "";
    const profileSummaryBlock = renderAdminPropertyList([
      { label: "Email", value: user.email || "Не указан" },
      { label: "Телефон", value: formatPhone(user.phone) },
    ]);
    const profileEditorBlock = `<details class="admin-details" data-account-profile-details${profileDetailsOpen ? " open" : ""}>
            <summary>Изменить контакты</summary>
            <form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}">
              <input type="hidden" name="action" value="save-profile">
              <label class="admin-label">
                Email
                <input class="admin-input" type="email" name="email" value="${escapeHtmlText(user.email || "")}" required>
              </label>
              ${renderPhoneInput("phone", user.phone)}
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Сохранить профиль</button>
              </div>
            </form>
          </details>`;
    const passwordSummaryBlock = `<div class="admin-alert admin-alert-muted">
            Пароль скрыт. Откройте блок только тогда, когда действительно нужно обновить доступ.
          </div>`;
    const passwordEditorBlock = `<details class="admin-details" data-account-password-details${passwordDetailsOpen ? " open" : ""}>
            <summary>Обновить пароль</summary>
            <form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}">
              <input type="hidden" name="action" value="change-password">
              <label class="admin-label">
                Текущий пароль
                <input class="admin-input" type="password" name="currentPassword" autocomplete="current-password" required>
              </label>
              <label class="admin-label">
                Новый пароль
                <input class="admin-input" type="password" name="newPassword" autocomplete="new-password" minlength="8" required>
              </label>
              <label class="admin-label">
                Повторите новый пароль
                <input class="admin-input" type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required>
              </label>
              <div class="admin-inline-actions">
                <button class="admin-button admin-button-secondary" type="submit">Обновить пароль</button>
              </div>
            </form>
          </details>`;

    return renderAdminLayout(
      "Мой кабинет",
      `<div data-account-dashboard-root>
        ${renderAccountMobileDashboardStyles()}
        ${renderAccountTravelEstimateScript()}
        ${renderAccountSystemNoticeChrome()}
        ${systemNotices ? `<div class="account-system-notice-stack">${systemNotices}</div>` : ""}
        ${!staffRecord ? `<div class="admin-alert admin-alert-error">Этот аккаунт не привязан к карточке сотрудника. Обратитесь к администратору.</div>` : ""}
        ${renderAccountMobileDashboard(assignedOrders, {
          user,
          staffRecord,
          staffId,
          managerContact: userContext.managerContact || null,
        })}
        <div class="account-desktop-stats">
          ${renderAccountDesktopMetrics([
            {
              label: "Кабинет",
              value: assignedOrders.length,
              copy: "Все ваши заявки.",
              emphasis: true,
            },
            {
              label: "Со временем",
              value: upcomingCount,
              copy: "Где уже указаны дата или время.",
            },
            {
              label: "Нужно проверить",
              value: needsAttentionCount,
              copy: "Назначения с вопросами или CRM-сигналами.",
            },
            {
              label: "Завершено",
              value: completedCount,
              copy: "Уже отмеченные выезды.",
            },
          ])}
        </div>
        <div class="admin-section-grid account-desktop-assignments">
          ${renderAdminCard(
            "Мои заявки",
            "Все заявки и выезды, назначенные именно на вас.",
            renderAccountAssignmentsTable(assignedOrders, {
              staffId,
            }),
            { eyebrow: "Работа" }
          )}
        </div>
        ${shouldShowW9
          ? `<div class="admin-section-grid">
              <div id="${ACCOUNT_W9_SECTION_ID}" tabindex="-1">
                ${renderAccountW9Card({
                  ...userContext,
                  w9Draft: options.w9Draft || null,
                  w9Expanded: w9DetailsOpen,
                })}
              </div>
            </div>`
          : ""}
        <div class="admin-section-grid admin-form-grid-two">
          ${renderAdminCard(
            "Профиль",
            "Измените контакты, которые видят администраторы и которые используются в вашей карточке.",
            `${profileSummaryBlock}
            ${profileEditorBlock}`,
            { eyebrow: "Профиль", muted: true }
          )}
          ${renderAdminCard(
            "Пароль",
            "Меняйте пароль отдельно, чтобы вход оставался под вашим контролем.",
            `${passwordSummaryBlock}
            ${passwordEditorBlock}`,
            { eyebrow: "Безопасность", muted: true }
          )}
        </div>
      </div>`,
      {
        subtitle: staffSummary
          ? `Добро пожаловать. Здесь видны только ваши назначения и личные настройки.`
          : "Личный кабинет сотрудника.",
        bodyScripts: `${renderAccountDashboardScripts()}${renderAccountStageEditorsScript()}`,
        sidebar: renderAccountSidebar(
          {
            user,
            staffRecord,
            assignmentCount: assignedOrders.length,
          },
          "dashboard"
        ),
      }
    );
  }

  function renderAccountPayrollStatusBadge(status) {
    return normalizeString(status, 32).toLowerCase() === "paid"
      ? renderAdminBadge("Выплачено", "success")
      : renderAdminBadge("К выплате", "outline");
  }

  function renderAccountPayrollCompensationLabel(row = {}) {
    const compensationValue = normalizeString(row && row.compensationValue, 32);
    if (!compensationValue) return "Не указана";
    if (normalizeString(row && row.compensationType, 32).toLowerCase() === "percent") {
      return `${escapeHtml(compensationValue)}%`;
    }
    return `Фикс: ${escapeHtml(formatCurrencyAmount(Number(compensationValue) || 0))}`;
  }

  function renderAccountPayrollTable(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<div class="admin-empty-state">Пока нет завершённых заказов, которые попали в зарплату.</div>`;
    }

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Модель</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>Выплачено</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const scheduleLabel = [row.selectedDate, row.selectedTime].filter(Boolean).join(" • ") || "Без даты";
              const paidAtLabel =
                row.paidAt && typeof formatAdminDateTime === "function"
                  ? formatAdminDateTime(row.paidAt)
                  : row.paidAt || "—";
              return `<tr>
                <td>
                  <strong>${escapeHtml(row.customerName || "Клиент")}</strong><br>
                  <span class="admin-table-muted">${escapeHtml(formatAdminServiceLabel(row.serviceName || ""))}</span><br>
                  <span class="admin-table-muted">${escapeHtml(scheduleLabel)}</span>
                </td>
                <td>${renderAccountPayrollCompensationLabel(row)}</td>
                <td><strong>${escapeHtml(formatCurrencyAmount((Number(row.amountCents) || 0) / 100))}</strong></td>
                <td>${renderAccountPayrollStatusBadge(row.status)}</td>
                <td>${escapeHtml(paidAtLabel)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderPayrollPage(userContext, options = {}) {
    const payrollSummary =
      userContext && userContext.payrollSummary && typeof userContext.payrollSummary === "object"
        ? userContext.payrollSummary
        : { rows: [], totals: { owedCents: 0, paidCents: 0, totalCents: 0, rowsCount: 0 } };
    const user = userContext && userContext.user ? userContext.user : null;
    const staffRecord = userContext && userContext.staffRecord ? userContext.staffRecord : null;
    const systemNotice = renderAccountNotice(options.notice || "", options.noticeMessage || "");
    const totals = payrollSummary.totals || {};

    return renderAdminLayout(
      "Зарплаты",
      `<div data-account-payroll-root>
        ${systemNotice ? `${renderAccountSystemNoticeChrome()}<div class="account-system-notice-stack">${systemNotice}</div>` : ""}
        <div class="account-desktop-stats">
          ${renderAccountDesktopMetrics([
            {
              label: "К выплате",
              value: formatCurrencyAmount((Number(totals.owedCents) || 0) / 100),
              copy: `${escapeHtml(String(Number(totals.owedCount) || 0))} строк ещё не закрыты.`,
              emphasis: true,
            },
            {
              label: "Выплачено",
              value: formatCurrencyAmount((Number(totals.paidCents) || 0) / 100),
              copy: `${escapeHtml(String(Number(totals.paidCount) || 0))} строк уже отмечены как выплаченные.`,
            },
            {
              label: "Всего начислено",
              value: formatCurrencyAmount((Number(totals.totalCents) || 0) / 100),
              copy: "Все зарплатные строки по завершённым заказам.",
            },
            {
              label: "Заказов",
              value: escapeHtml(String(Number(totals.rowsCount) || 0)),
              copy: "Строки, которые попали в вашу историю выплат.",
            },
          ])}
        </div>
        <div class="admin-section-grid">
          ${renderAdminCard(
            "Моя зарплата",
            "История начислений по заказам, которые уже дошли до завершения уборки.",
            renderAccountPayrollTable(payrollSummary.rows),
            { eyebrow: "История" }
          )}
        </div>
      </div>`,
      {
        subtitle: "Здесь видны ваши начисления, уже выплаченные суммы и то, что ещё ждёт выплаты.",
        sidebar: renderAccountSidebar(
          {
            user,
            staffRecord,
            assignmentCount: Array.isArray(userContext && userContext.assignedOrders)
              ? userContext.assignedOrders.length
              : 0,
          },
          "payroll"
        ),
      }
    );
  }

  return {
    renderDashboardPage,
    renderLoginPage,
    renderPayrollPage,
    renderUnavailablePage,
  };
}

module.exports = {
  createAccountRenderers,
};
