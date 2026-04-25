"use strict";

const {
  getStaffCleanerConfirmationStatus,
} = require("../cleaner-confirmation");

const {
  W9_FEDERAL_TAX_CLASSIFICATIONS,
  W9_TIN_TYPES,
  formatW9FederalTaxClassificationLabel,
  formatW9TinTypeLabel,
} = require("../staff-w9");

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
    renderAssignmentStatusBadge,
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

  function renderPhoneInput(name, value = "") {
    const onInputAttr = " oninput=\"this.value=this.value.replace(/\\D+/g,'').slice(0,10)\"";
    return `<label class="admin-label">
      Телефон
      <input class="admin-input admin-phone-input" type="tel" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlText(formatPhoneFieldValue(value))}" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="6305550101"${onInputAttr}>
    </label>`;
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
      { key: "dashboard", label: "Мой кабинет", href: ACCOUNT_ROOT_PATH },
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

  function renderAccountNotice(notice) {
    if (notice === "profile-saved") {
      return `<div class="admin-alert admin-alert-info">Профиль обновлён.</div>`;
    }
    if (notice === "password-saved") {
      return `<div class="admin-alert admin-alert-info">Пароль обновлён.</div>`;
    }
    if (notice === "profile-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить профиль. Проверьте email и телефон.</div>`;
    }
    if (notice === "password-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось изменить пароль. Проверьте текущий пароль и совпадение новых значений.</div>`;
    }
    if (notice === "w9-saved") {
      return `<div class="admin-alert admin-alert-info">Документы сотрудника сохранены. Contract и W-9 автоматически прикреплены к вашей карточке сотрудника.</div>`;
    }
    if (notice === "w9-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось собрать документы сотрудника. Проверьте обязательные поля, TIN, подпись и подтверждение сертификата.</div>`;
    }
    if (notice === "contract-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось открыть договор сотрудника. Попробуйте сформировать документы заново или обратитесь к администратору.</div>`;
    }
    if (notice === "assignment-confirmed") {
      return `<div class="admin-alert admin-alert-info">Вы подтвердили заказ. Администратор увидит это в расписании.</div>`;
    }
    if (notice === "assignment-en-route") {
      return `<div class="admin-alert admin-alert-info">Вы отметили, что уже выехали на заказ. Карточка перенесена в этап «В пути».</div>`;
    }
    if (notice === "assignment-cleaning-started") {
      return `<div class="admin-alert admin-alert-info">Вы отметили, что начинаете уборку. Карточка перенесена в этап «Начать уборку».</div>`;
    }
    if (notice === "assignment-checklist") {
      return `<div class="admin-alert admin-alert-info">Вы перешли к этапу чеклиста. Карточка перенесена в этап «Чеклист».</div>`;
    }
    if (notice === "assignment-photos") {
      return `<div class="admin-alert admin-alert-info">Вы перешли к этапу фото. Карточка перенесена в этап «Фото».</div>`;
    }
    if (notice === "assignment-cleaning-complete") {
      return `<div class="admin-alert admin-alert-info">Вы отметили, что уборка завершена. Карточка перенесена в этап «Уборка завершена».</div>`;
    }
    if (notice === "assignment-declined") {
      return `<div class="admin-alert admin-alert-error">Вы отметили, что не подтверждаете этот заказ. Администратор увидит это в расписании.</div>`;
    }
    if (notice === "assignment-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось обновить подтверждение заказа. Попробуйте ещё раз или обратитесь к администратору.</div>`;
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

    const shouldCollapseCompletedW9 = Boolean(documentsComplete && !w9Draft);
    const w9EditorBlock = shouldCollapseCompletedW9
      ? `<details class="admin-details" data-account-w9-details>
          <summary>Обновить документы</summary>
          <div class="admin-form-grid" style="margin-top:14px;">
            <p class="admin-field-note">Если данные изменились, раскройте форму и сохраните новую версию Contract и W-9.</p>
            ${w9FormMarkup}
          </div>
        </details>`
      : w9FormMarkup;

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

  function renderAccountCleanerConfirmationBadge(status) {
    if (status === "confirmed") return renderAdminBadge("Подтверждено вами", "success");
    if (status === "declined") return renderAdminBadge("Вы не подтвердили", "danger");
    return renderAdminBadge("Ждёт подтверждения", "outline");
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

  function getAccountNextAssignmentAction(orderStatus) {
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
    if (orderStatus === "checklist") {
      return {
        action: "mark-assignment-photos",
        label: "Фото",
      };
    }
    if (orderStatus === "photos") {
      return {
        action: "mark-assignment-cleaning-complete",
        label: "Уборка завершена",
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

  function getAccountAssignmentUiState(item = {}, staffId = "") {
    const orderStatus = getAccountOrderStatus(item);
    const cleanerConfirmationStatus = getStaffCleanerConfirmationStatus(
      item && item.entry,
      item && item.assignment,
      staffId
    );
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
    const nextAction = getAccountNextAssignmentAction(orderStatus);

    let helperCopy = "";
    if (orderStatus === "cleaning-complete") {
      helperCopy = "Вы отметили, что уборка завершена. Дальнейшие финансовые шаги команда увидит в админке.";
    } else if (orderStatus === "photos") {
      helperCopy = "Фото-этап отмечен. Когда всё готово, завершите уборку последней кнопкой.";
    } else if (orderStatus === "checklist") {
      helperCopy = "Чеклист отмечен как текущий этап. Следующий шаг — перейти к фото.";
    } else if (orderStatus === "cleaning-started") {
      helperCopy = "Вы отметили, что начали уборку. Следующий шаг — перейти к чеклисту.";
    } else if (orderStatus === "en-route") {
      helperCopy = "Вы отметили, что уже выехали на этот заказ.";
    } else if (cleanerConfirmationStatus === "confirmed") {
      helperCopy = "Вы уже подтвердили, что сможете выйти на этот заказ.";
    } else if (cleanerConfirmationStatus === "declined") {
      helperCopy = "Сейчас заказ отмечен как не подтверждённый вами.";
    } else if (orderStatus === "scheduled") {
      helperCopy =
        "Подтвердите, что сможете выйти на этот заказ, отметьте, что не подтверждаете его, или сразу укажите, что уже выехали.";
    }

    return {
      orderStatus,
      cleanerConfirmationStatus,
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

    const layoutClass = options.mobile ? "account-mobile-action-stack" : "admin-inline-actions";
    const primaryClass = options.mobile ? "admin-button account-mobile-action-button" : "admin-button";
    const secondaryClass = options.mobile
      ? "admin-button admin-button-secondary account-mobile-action-button"
      : "admin-button admin-button-secondary";
    const forms = [];

    if (uiState.canConfirm) {
      forms.push(`<form method="post" action="${ACCOUNT_ROOT_PATH}">
        <input type="hidden" name="action" value="confirm-assignment">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <button class="${primaryClass}" type="submit">Подтвердить</button>
      </form>`);
    }

    if (uiState.nextAction) {
      forms.push(`<form method="post" action="${ACCOUNT_ROOT_PATH}">
        <input type="hidden" name="action" value="${escapeHtmlAttribute(uiState.nextAction.action)}">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <button class="${uiState.canConfirm ? secondaryClass : primaryClass}" type="submit">${escapeHtml(
          uiState.nextAction.label
        )}</button>
      </form>`);
    }

    if (uiState.canDecline) {
      forms.push(`<form method="post" action="${ACCOUNT_ROOT_PATH}">
        <input type="hidden" name="action" value="decline-assignment">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entryId)}">
        <button class="${secondaryClass}" type="submit">Не подтверждаю</button>
      </form>`);
    }

    return forms.length ? `<div class="${layoutClass}">${forms.join("")}</div>` : "";
  }

  function renderAccountAssignmentActions(item = {}, staffId = "") {
    const uiState = getAccountAssignmentUiState(item, staffId);
    if (
      !uiState.isStageWithCleanerFlow ||
      !uiState.canAccessAssignment
    ) {
      return "";
    }

    return `<div class="admin-table-cell-stack">
      <div class="admin-inline-badge-row">
        ${renderAccountOrderStageBadge(uiState.orderStatus)}
        ${renderAccountCleanerConfirmationBadge(uiState.cleanerConfirmationStatus)}
      </div>
      <span class="admin-table-muted">${escapeHtml(uiState.helperCopy)}</span>
      ${renderAccountAssignmentActionForms(item, uiState)}
    </div>`;
  }

  function renderAccountMobileStageRail(orderStatus) {
    const steps = [
      { key: "scheduled", label: "План" },
      { key: "en-route", label: "В пути" },
      { key: "cleaning-started", label: "Старт" },
      { key: "checklist", label: "Чеклист" },
      { key: "photos", label: "Фото" },
      { key: "cleaning-complete", label: "Готово" },
    ];
    const currentIndex = steps.findIndex((step) => step.key === orderStatus);

    return `<div class="account-mobile-stage-rail">
      ${steps
        .map((step, index) => {
          const stateClass =
            currentIndex === -1
              ? ""
              : index < currentIndex
                ? " is-complete"
                : index === currentIndex
                  ? " is-current"
                  : "";
          return `<span class="account-mobile-stage-pill${stateClass}">${escapeHtml(step.label)}</span>`;
        })
        .join("")}
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

  function renderAccountMobileFeaturedAssignment(item = null, options = {}) {
    if (!item) return "";

    const staffId = String(options.staffId || "").trim();
    const uiState = getAccountAssignmentUiState(item, staffId);
    const serviceLabel = formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType);
    const summaryLabel = item.scheduleLabel || "Время уточняется";
    const addressLabel = item.entry.fullAddress || "Адрес уточняется администратором";

    return `<div class="account-mobile-focus-card">
      <div class="account-mobile-focus-copy">
        <p class="account-mobile-focus-eyebrow">Следующий заказ</p>
        <h3 class="account-mobile-focus-title">${escapeHtml(item.entry.customerName || "Клиент")}</h3>
        <p class="account-mobile-focus-meta">${escapeHtml(serviceLabel)} · ${escapeHtml(summaryLabel)}</p>
      </div>
      <div class="account-mobile-badge-row">
        ${renderAccountOrderStageBadge(uiState.orderStatus)}
        ${renderAccountCleanerConfirmationBadge(uiState.cleanerConfirmationStatus)}
      </div>
      <p class="account-mobile-focus-address">${escapeHtml(addressLabel)}</p>
      ${renderAccountAssignmentActionForms(item, uiState, { mobile: true })}
    </div>`;
  }

  function renderAccountMobileAssignmentCard(item = {}, options = {}) {
    const staffId = String(options.staffId || "").trim();
    const uiState = getAccountAssignmentUiState(item, staffId);
    const serviceLabel = formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType);
    const requestLabel = item.entry.requestId || item.entry.id;
    const addressLabel = item.entry.fullAddress || "Адрес уточняется";
    const notesLabel =
      item.assignment && item.assignment.notes ? item.assignment.notes : "";
    const issueBadge =
      item.assignmentStatus === "issue" || item.entry.status !== "success"
        ? renderAdminBadge(
            item.entry.status === "warning" ? "Нужно проверить" : "CRM сигнал",
            item.entry.status === "warning" ? "default" : "danger"
          )
        : "";

    return `<article class="account-mobile-order-card" data-account-mobile-order-card>
      <div class="account-mobile-order-head">
        <div class="account-mobile-order-copy">
          <p class="account-mobile-order-kicker">${escapeHtml(serviceLabel)}</p>
          <h3 class="account-mobile-order-title">${escapeHtml(item.entry.customerName || "Клиент")}</h3>
          <p class="account-mobile-order-request">${escapeHtml(requestLabel)}</p>
        </div>
        <div class="account-mobile-badge-row">
          ${renderAssignmentStatusBadge(item.assignmentStatus)}
          ${renderAccountOrderStageBadge(uiState.orderStatus)}
          ${renderAccountCleanerConfirmationBadge(uiState.cleanerConfirmationStatus)}
          ${issueBadge}
        </div>
      </div>
      ${renderAccountMobileStageRail(uiState.orderStatus)}
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

  function renderAccountMobileDashboardStyles() {
    return `<style>
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
          color: rgba(255, 244, 247, 0.82);
        }
        .account-mobile-summary-card .admin-button {
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.22);
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
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.24);
          box-shadow: none;
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
          color: rgba(255, 241, 245, 0.72);
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
          color: #fff;
        }
        .account-mobile-focus-meta,
        .account-mobile-focus-address,
        .account-mobile-order-request,
        .account-mobile-order-helper {
          margin: 0;
          color: #736570;
        }
        .account-mobile-focus-meta,
        .account-mobile-focus-address {
          color: rgba(255, 244, 247, 0.82);
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
        .account-mobile-stage-rail {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .account-mobile-stage-pill {
          min-width: 0;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(165, 77, 99, 0.14);
          background: #fff7f7;
          color: #8c7a83;
          font-size: 12px;
          font-weight: 700;
          text-align: center;
        }
        .account-mobile-stage-pill.is-complete {
          background: rgba(165, 77, 99, 0.12);
          color: #7e374d;
          border-color: rgba(165, 77, 99, 0.2);
        }
        .account-mobile-stage-pill.is-current {
          background: #1c1421;
          color: #fff;
          border-color: #1c1421;
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
        .account-mobile-action-stack > form {
          width: 100%;
        }
        .account-mobile-action-button {
          width: 100%;
          min-height: 52px;
          justify-content: center;
          border-radius: 18px;
          font-size: 16px;
          font-weight: 800;
        }
      }
    </style>`;
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
                <div class="admin-table-cell-stack">
                  <div class="admin-inline-badge-row">
                    ${renderAssignmentStatusBadge(item.assignmentStatus)}
                    ${item.entry.status === "success" ? renderAdminBadge("CRM ок", "success") : renderAdminBadge("Нужно проверить", item.entry.status === "warning" ? "default" : "danger")}
                  </div>
                  ${renderAccountAssignmentActions(item, staffId)}
                </div>
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
      <div class="account-mobile-summary-card">
        <div class="account-mobile-summary-top">
          <div>
            <p class="account-mobile-summary-kicker">Cleaning app</p>
            <h2 class="account-mobile-summary-title">${escapeHtml(
              (staffRecord && staffRecord.name) || (user && user.email) || "Мой кабинет"
            )}</h2>
            <p class="account-mobile-summary-copy">Назначенные на вас заказы из админки SHYNLI.</p>
          </div>
          <form method="post" action="${ACCOUNT_LOGOUT_PATH}">
            <button class="admin-button" type="submit">Выйти</button>
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
    const noticeBlock = renderAccountNotice(options.notice || "");
    const user = userContext.user;
    const staffRecord = userContext.staffRecord;
    const staffSummary = userContext.staffSummary;
    const assignedOrders = Array.isArray(userContext.assignedOrders) ? userContext.assignedOrders : [];
    const focusSection = String(options.focusSection || "").toLowerCase();
    const w9Focused = focusSection === "w9";
    const shouldShowW9 = !isAdminWorkspaceRole(user && user.role) || isEmployeeLinkedUser(user);
    const hasOnboardingDocuments = Boolean(staffRecord && staffRecord.w9 && staffRecord.contract);
    const w9ReminderBlock =
      shouldShowW9 && staffRecord && !hasOnboardingDocuments
        ? `<div class="admin-alert admin-alert-info">Для завершения профиля заполните документы сотрудника. После отправки система автоматически прикрепит к вашей карточке Contract и W-9.</div>`
        : "";
    const w9FocusBlock =
      shouldShowW9 && w9Focused && staffRecord && !hasOnboardingDocuments
        ? `<div class="admin-alert admin-alert-info">Открылся раздел документов сотрудника. Заполните форму ниже и нажмите «Сформировать документы».</div>`
        : "";

    const upcomingCount = assignedOrders.filter((item) => item.hasSchedule).length;
    const needsAttentionCount = assignedOrders.filter((item) => item.assignmentStatus === "issue" || item.entry.status !== "success").length;
    const completedCount = assignedOrders.filter((item) => item.assignmentStatus === "completed").length;
    const notice = String(options.notice || "");
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
        ${noticeBlock}
        ${w9FocusBlock}
        ${w9ReminderBlock}
        ${!staffRecord ? `<div class="admin-alert admin-alert-error">Этот аккаунт не привязан к карточке сотрудника. Обратитесь к администратору.</div>` : ""}
        ${renderAccountMobileDashboard(assignedOrders, {
          user,
          staffRecord,
          staffId,
        })}
        <div class="admin-stats-grid account-desktop-stats">
          ${renderAdminCard("Назначено", "Все ваши заявки.", `<p class="admin-metric-value">${escapeHtml(String(assignedOrders.length))}</p>`, { eyebrow: "Кабинет" })}
          ${renderAdminCard("Со временем", "Где уже указаны дата или время.", `<p class="admin-metric-value">${escapeHtml(String(upcomingCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
          ${renderAdminCard("Нужно проверить", "Назначения с вопросами или CRM-сигналами.", `<p class="admin-metric-value">${escapeHtml(String(needsAttentionCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
          ${renderAdminCard("Завершено", "Уже отмеченные выезды.", `<p class="admin-metric-value">${escapeHtml(String(completedCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
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
        bodyScripts: renderAccountDashboardScripts(),
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

  return {
    renderDashboardPage,
    renderLoginPage,
    renderUnavailablePage,
  };
}

module.exports = {
  createAccountRenderers,
};
