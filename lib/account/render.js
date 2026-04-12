"use strict";

const {
  W9_FEDERAL_TAX_CLASSIFICATIONS,
  W9_TIN_TYPES,
  formatW9FederalTaxClassificationLabel,
  formatW9TinTypeLabel,
} = require("../staff-w9");

function createAccountRenderers(deps = {}) {
  const {
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
    return String(role || "").trim().toLowerCase() === "admin";
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
        <form class="admin-logout-form" method="post" action="${ACCOUNT_LOGOUT_PATH}">
          <button class="admin-button admin-button-secondary" type="submit">Выйти</button>
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
      return `<div class="admin-alert admin-alert-info">W-9 сохранён. PDF автоматически прикреплён к вашей карточке сотрудника.</div>`;
    }
    if (notice === "w9-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось создать W-9. Проверьте обязательные поля, TIN, подпись и подтверждение сертификата.</div>`;
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
          <p class="admin-field-note">Подпишите форму мышкой, пальцем или стилусом. Именно эта подпись будет вставлена в итоговый W-9 PDF.</p>
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
          ? "Если обновляете W-9, нарисуйте подпись заново перед сохранением."
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
              setStatus("Подпись сохранена в форме. Можно отправить W-9 ещё раз.", "success");
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
            setStatus("Подпись готова. Теперь можно сформировать W-9.", "success");
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
    const w9Record = staffRecord && staffRecord.w9 ? staffRecord.w9 : null;
    const w9Draft =
      userContext && userContext.w9Draft && typeof userContext.w9Draft === "object"
        ? userContext.w9Draft
        : null;

    if (!staffRecord) {
      return renderAdminCard(
        "W-9",
        "Эта форма появится здесь, когда аккаунт будет привязан к карточке сотрудника.",
        `<div class="admin-alert admin-alert-error">Пока нет карточки сотрудника, поэтому форму W-9 заполнить нельзя.</div>`,
        { eyebrow: "Налоги", muted: true }
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

    const summaryBlock = w9Record
      ? `<div class="admin-alert admin-alert-info">
          Последняя версия W-9 сохранена ${escapeHtml(formatAdminDateTime(w9Record.generatedAt))}.
          ${w9Record.document && w9Record.document.relativePath
            ? ` <a href="${ACCOUNT_W9_DOWNLOAD_PATH}">Открыть PDF</a>.`
            : ""}
        </div>
        ${renderAdminPropertyList([
          {
            label: "Статус",
            value: "PDF прикреплён к карточке сотрудника",
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
      : `<div class="admin-alert admin-alert-info">Заполните W-9. После отправки система соберёт PDF и автоматически прикрепит его к вашей карточке сотрудника.</div>`;

    return renderAdminCard(
      w9Record ? "W-9 on file" : "Заполните W-9",
      "Эта форма нужна для налоговой карточки сотрудника. Храним только итоговый PDF и короткую служебную сводку.",
      `${summaryBlock}
      <form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}" data-account-w9-form>
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
          <span>Подтверждаю, что данные в W-9 верны и система может сформировать финальный PDF.</span>
        </label>
        <div class="admin-inline-actions">
          <button class="admin-button" type="submit" data-account-w9-submit disabled>${w9Record ? "Обновить W-9" : "Сформировать W-9"}</button>
          ${w9Record && w9Record.document && w9Record.document.relativePath
            ? `<a class="admin-button admin-button-secondary" href="${ACCOUNT_W9_DOWNLOAD_PATH}">Скачать текущий PDF</a>`
            : ""}
        </div>
      </form>`,
      { eyebrow: "Налоги" }
    );
  }

  function renderAccountAssignmentsTable(orderItems = []) {
    if (!orderItems.length) {
      return `<div class="admin-empty-state">Пока на вас ничего не назначено. Как только администратор привяжет заявку, она появится здесь.</div>`;
    }

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
                <div class="admin-inline-badge-row">
                  ${renderAssignmentStatusBadge(item.assignmentStatus)}
                  ${item.entry.status === "success" ? renderAdminBadge("CRM ок", "success") : renderAdminBadge("Нужно проверить", item.entry.status === "warning" ? "default" : "danger")}
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
            ? "Email уже подтверждён. Сохраните первый пароль, и система сразу откроет форму W-9."
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
            ? "Используйте рабочую почту и пароль. После входа откроется форма W-9."
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
            ? "После сохранения вы сразу попадёте в раздел W-9 и сможете сформировать PDF."
            : "После сохранения вы сразу попадёте в кабинет сотрудника.",
          `<ul class="admin-feature-list">
            <li>Пароль сохранится только для этого аккаунта.</li>
            <li>Дальше вход будет уже по email и вашему паролю.</li>
            <li>${escapeHtml(opensW9Flow ? "После входа откроется форма W-9." : "Потом пароль можно будет поменять в кабинете.")}</li>
          </ul>`,
          { eyebrow: "Безопасность", muted: true }
        )
      : renderAdminCard(
          "Что будет внутри",
          opensW9Flow
            ? "После входа откроется нужный раздел W-9, а остальные данные кабинета останутся ниже на странице."
            : "После входа вы увидите только свои заявки и сможете обновить личные данные.",
          `<ul class="admin-feature-list">
            <li>${escapeHtml(opensW9Flow ? "Сразу откроется форма W-9." : "Назначенные на вас заявки.")}</li>
            <li>Ваш телефон и email.</li>
            <li>${escapeHtml(opensW9Flow ? "После отправки система сама сгенерирует PDF." : "Смена собственного пароля.")}</li>
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
    const shouldShowW9 = !isAdminWorkspaceRole(user && user.role);
    const w9ReminderBlock =
      shouldShowW9 && staffRecord && !staffRecord.w9
        ? `<div class="admin-alert admin-alert-info">Для завершения профиля заполните W-9. После отправки PDF автоматически появится в вашей карточке сотрудника.</div>`
        : "";
    const w9FocusBlock =
      shouldShowW9 && w9Focused && staffRecord && !staffRecord.w9
        ? `<div class="admin-alert admin-alert-info">Открылся раздел W-9. Заполните форму ниже и нажмите «Сформировать W-9».</div>`
        : "";

    const upcomingCount = assignedOrders.filter((item) => item.hasSchedule).length;
    const needsAttentionCount = assignedOrders.filter((item) => item.assignmentStatus === "issue" || item.entry.status !== "success").length;
    const completedCount = assignedOrders.filter((item) => item.assignmentStatus === "completed").length;

    return renderAdminLayout(
      "Мой кабинет",
      `${noticeBlock}
      ${w9FocusBlock}
      ${w9ReminderBlock}
      ${!staffRecord ? `<div class="admin-alert admin-alert-error">Этот аккаунт не привязан к карточке сотрудника. Обратитесь к администратору.</div>` : ""}
      <div class="admin-stats-grid">
        ${renderAdminCard("Назначено", "Все ваши заявки.", `<p class="admin-metric-value">${escapeHtml(String(assignedOrders.length))}</p>`, { eyebrow: "Кабинет" })}
        ${renderAdminCard("Со временем", "Где уже указаны дата или время.", `<p class="admin-metric-value">${escapeHtml(String(upcomingCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
        ${renderAdminCard("Нужно проверить", "Назначения с вопросами или CRM-сигналами.", `<p class="admin-metric-value">${escapeHtml(String(needsAttentionCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
        ${renderAdminCard("Завершено", "Уже отмеченные выезды.", `<p class="admin-metric-value">${escapeHtml(String(completedCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Мои заявки",
          "Все заявки и выезды, назначенные именно на вас.",
          renderAccountAssignmentsTable(assignedOrders),
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
          `<form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}">
            <input type="hidden" name="action" value="save-profile">
            <label class="admin-label">
              Email
              <input class="admin-input" type="email" name="email" value="${escapeHtmlText(user.email || "")}" required>
            </label>
            ${renderPhoneInput("phone", user.phone)}
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Сохранить профиль</button>
            </div>
          </form>`,
          { eyebrow: "Профиль", muted: true }
        )}
        ${renderAdminCard(
          "Пароль",
          "Меняйте пароль отдельно, чтобы вход оставался под вашим контролем.",
          `<form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}">
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
          </form>`,
          { eyebrow: "Безопасность", muted: true }
        )}
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
