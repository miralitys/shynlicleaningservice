"use strict";

const {
  formatW9FederalTaxClassificationLabel,
  formatW9TinTypeLabel,
} = require("../staff-w9");

function createAdminPageRenderers(deps = {}) {
  const {
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    ADMIN_CLIENTS_PATH,
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
    ADMIN_GOOGLE_MAIL_CONNECT_PATH,
    ADMIN_INTEGRATIONS_PATH,
    ADMIN_ORDERS_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_RUNTIME_PATH,
    ADMIN_SETTINGS_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ASSIGNMENT_STATUS_VALUES,
    GOOGLE_PLACES_API_KEY,
    QUOTE_OPS_LEDGER_LIMIT,
    QUOTE_PUBLIC_PATH,
    STAFF_STATUS_VALUES,
    USER_ROLE_VALUES,
    USER_STATUS_VALUES,
    buildAdminRedirectPath,
    buildOrdersReturnPath,
    buildQuoteOpsReturnPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectAdminOrderRecords,
    countOrdersByStatus,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminClientRecords,
    filterAdminOrderRecords,
    filterQuoteOpsEntries,
    formatAdminCalendarDate,
    formatAdminClockTime,
    formatAdminDateTime,
    formatAdminOrderDateInputValue,
    formatAdminOrderPriceInputValue,
    formatAdminOrderTimeInputValue,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatCurrencyAmount,
    formatLeadStatusLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    getAdminClientsFilters,
    getEntryAdminLeadData,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    getOrdersFilters,
    getQuoteOpsFilters,
    getLeadStatus,
    isOrderCreatedEntry,
    getRequestUrl,
    normalizeLeadStatus,
    normalizeOrderStatus,
    normalizeString,
    renderAssignmentStatusBadge,
    renderStaffStatusBadge,
    shared,
  } = deps;
  const {
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
  } = shared;
  const ORDER_QUOTE_SERVICE_LABELS = Object.freeze({
    ovenCleaning: "Oven Cleaning",
    refrigeratorCleaning: "Inside Refrigerator Cleaning",
    baseboardCleaning: "Baseboard Cleaning (whole house)",
    doorsCleaning: "Doors Cleaning",
    insideCabinets: "Inside Cabinets Cleaning",
    rangeHood: "Range hood",
    furniturePolishing: "Wood Furniture Polishing",
  });
  const ORDER_QUOTE_SERVICE_ALIASES = Object.freeze({
    ovencleaning: "ovenCleaning",
    insideoven: "ovenCleaning",
    insideovencleaning: "ovenCleaning",
    refrigeratorcleaning: "refrigeratorCleaning",
    insidefridge: "refrigeratorCleaning",
    insidefridgecleaning: "refrigeratorCleaning",
    fridge: "refrigeratorCleaning",
    fridgecleaning: "refrigeratorCleaning",
    baseboardcleaning: "baseboardCleaning",
    baseboards: "baseboardCleaning",
    doorscleaning: "doorsCleaning",
    doors: "doorsCleaning",
    insidecabinets: "insideCabinets",
    cabinets: "insideCabinets",
    rangehood: "rangeHood",
    furniturepolishing: "furniturePolishing",
    woodfurniturepolishing: "furniturePolishing",
  });
  const ORDER_QUOTE_QUANTITY_LABELS = Object.freeze({
    interiorWindowsCleaning: "Interior Windows Cleaning",
    blindsCleaning: "Blinds Cleaning",
    bedLinenChange: "Bed Linen / Sofa Cover Change",
  });
  const STAFF_COMPENSATION_OPTIONS = Object.freeze([
    { value: "fixed", label: "Фиксированная оплата" },
    { value: "percent", label: "Процент" },
  ]);
  const ADMIN_ORDER_SERVICE_OPTIONS = Object.freeze([
    { value: "standard", label: "Standard" },
    { value: "deep", label: "Deep" },
    { value: "move-in/out", label: "Move-in/out" },
  ]);
  const ADMIN_ORDER_FREQUENCY_OPTIONS = Object.freeze([
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Bi-weekly" },
    { value: "monthly", label: "Monthly" },
  ]);
  const ADMIN_MANUAL_ORDER_DIALOG_ID = "admin-manual-order-create-dialog";
  const ORDER_QUOTE_SQUARE_FOOTAGE_LABELS = Object.freeze({
    0: "700 - 1,200 sq ft",
    1: "1,201 - 2,000 sq ft",
    2: "2,001 - 2,500 sq ft",
    3: "2,501 - 3,000 sq ft",
    4: "3,001 - 3,500 sq ft",
    5: "3,501 - 4,000 sq ft",
    6: "4,001 - 5,000 sq ft",
    7: "5,001+ sq ft",
    950: "700 - 1,200 sq ft",
    1600: "1,201 - 2,000 sq ft",
    2250: "2,001 - 2,500 sq ft",
    2750: "2,501 - 3,000 sq ft",
    3250: "3,001 - 3,500 sq ft",
    3750: "3,501 - 4,000 sq ft",
    4500: "4,001 - 5,000 sq ft",
    5500: "5,001+ sq ft",
    6500: "5,001+ sq ft",
  });
  const STAFF_TEAM_CALENDAR_PAST_DAYS = 31;
  const STAFF_TEAM_CALENDAR_FUTURE_DAYS = 31;
  const STAFF_TEAM_CALENDAR_DAYS = STAFF_TEAM_CALENDAR_PAST_DAYS + STAFF_TEAM_CALENDAR_FUTURE_DAYS + 1;
  const STAFF_TEAM_CALENDAR_TIME_ZONE = "America/Chicago";
  const DASHBOARD_NEW_REQUESTS_LIMIT = 8;
  const CLIENT_ADDRESS_TYPE_OPTIONS = Object.freeze([
    { value: "house", label: "Дом" },
    { value: "apartment", label: "Квартира" },
    { value: "office", label: "Офис" },
    { value: "airbnb", label: "Airbnb" },
  ]);
  const CLIENT_ADDRESS_PET_OPTIONS = Object.freeze([
    { value: "none", label: "Нет" },
    { value: "cat", label: "Кошка" },
    { value: "dog", label: "Собака" },
  ]);

  function formatWorkspaceRoleLabel(role) {
    if (role === "admin") return "Админ";
    if (role === "manager") return "Менеджер";
    return "Клинер";
  }

  function isAdminWorkspaceRole(role) {
    return normalizeString(role, 32).toLowerCase() === "admin";
  }

  function isEmployeeLinkedUser(user) {
    if (!user || typeof user !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(user, "isEmployee")) {
      const rawValue = user.isEmployee;
      if (rawValue === true || rawValue === false) return rawValue;
      const normalized = normalizeString(rawValue, 20).toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }
    return !isAdminWorkspaceRole(user.role);
  }

  function isAdminLinkedUser(user) {
    return Boolean(user && isAdminWorkspaceRole(user.role) && !isEmployeeLinkedUser(user));
  }

  function inferWorkspaceRoleValue(value) {
    const normalized = normalizeString(value, 80).toLowerCase();
    if (!normalized) return "";
    if (normalized === "admin" || normalized === "админ" || normalized === "administrator") return "admin";
    if (
      normalized === "manager" ||
      normalized === "менеджер" ||
      normalized.includes("manager") ||
      normalized.includes("lead")
    ) {
      return "manager";
    }
    if (
      normalized === "cleaner" ||
      normalized === "клинер" ||
      normalized.includes("clean")
    ) {
      return "cleaner";
    }
    return "";
  }

  function renderEmployeeToggleField(checked = true) {
    return `<div class="admin-label admin-checkbox-field">
      <span>Сотрудник</span>
      <input type="hidden" name="isEmployee" value="0">
      <label class="admin-checkbox-row">
        <input type="checkbox" name="isEmployee" value="1"${checked ? " checked" : ""}>
        <span>На этого пользователя можно назначать заказы</span>
      </label>
    </div>`;
  }

  function getWorkspaceAccessContext(adminRuntime = {}) {
    const currentUserAccess =
      adminRuntime && adminRuntime.currentUserAccess
        ? adminRuntime.currentUserAccess
        : {};
    const role = normalizeString(currentUserAccess.role, 32).toLowerCase() || "admin";
    return {
      role,
      canEdit: currentUserAccess.canEdit !== false,
      canDelete: currentUserAccess.canDelete !== false,
      logoutPath: normalizeString(currentUserAccess.logoutPath, 200) || "/admin/logout",
      roleLabel: formatWorkspaceRoleLabel(role),
      roleTone: role === "admin" ? "success" : role === "manager" ? "outline" : "muted",
    };
  }

  function renderAdminClientStatusBadge(status) {
    const normalized = normalizeString(status, 32).toLowerCase();
    if (!normalized) return renderAdminBadge("Без статуса", "muted");
    return renderQuoteOpsStatusBadge(normalized);
  }

  function formatClientRequestCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} заявка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} заявки`;
    return `${normalized} заявок`;
  }

  function formatClientAddressCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} адрес`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} адреса`;
    return `${normalized} адресов`;
  }

  function formatAdminClientAddressPropertyTypeLabel(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (normalized === "house") return "Дом";
    if (normalized === "apartment") return "Квартира";
    if (normalized === "office") return "Офис";
    if (normalized === "airbnb") return "Airbnb";
    return "Не указан";
  }

  function formatAdminClientAddressPetsLabel(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (normalized === "none") return "Нет";
    if (normalized === "cat") return "Кошка";
    if (normalized === "dog") return "Собака";
    return "Не указано";
  }

  function renderAdminSelectOptions(options = [], selectedValue = "", placeholder = "") {
    const normalizedSelectedValue = normalizeString(selectedValue, 80).toLowerCase();
    return [
      placeholder
        ? `<option value="">${escapeHtml(placeholder)}</option>`
        : "",
      ...options.map((option) => {
        const value = normalizeString(option && option.value, 80).toLowerCase();
        const label = normalizeString(option && option.label, 120) || value;
        return `<option value="${escapeHtmlAttribute(value)}"${value === normalizedSelectedValue ? " selected" : ""}>${escapeHtml(label)}</option>`;
      }),
    ].join("");
  }

  function formatAdminPhoneNumber(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";

    let digits = raw.replace(/\D+/g, "");
    if (!digits) return "";

    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }

    if (digits.length !== 10) return "";
    return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function formatAdminPhoneFieldValue(value) {
    const raw = normalizeString(value, 80);
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

  function renderAdminPhoneInput(name, value = "", options = {}) {
    const fieldLabel = normalizeString(options.label, 80) || "Телефон";
    const autocomplete = normalizeString(options.autocomplete, 80) || "tel-national";
    const placeholder = normalizeString(options.placeholder, 40) || "6305550101";
    const inputValue = formatAdminPhoneFieldValue(value);
    const requiredAttr = options.required ? " required" : "";
    const onInputAttr = " oninput=\"this.value=this.value.replace(/\\D+/g,'').slice(0,10)\"";

    return `<label class="admin-label">
      ${escapeHtml(fieldLabel)}
      <input class="admin-input admin-phone-input" type="tel" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlText(inputValue)}" inputmode="numeric" autocomplete="${escapeHtmlAttribute(autocomplete)}" maxlength="10" placeholder="${escapeHtmlAttribute(placeholder)}"${onInputAttr}${requiredAttr}>
    </label>`;
  }

  function normalizeCompensationFieldValue(value) {
    const normalized = normalizeString(value, 32).replace(/,/g, ".");
    if (!normalized) return "";
    const cleaned = normalized.replace(/[^0-9.]/g, "");
    if (!cleaned) return "";
    const [wholePart, ...fractionParts] = cleaned.split(".");
    const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
    const fraction = fractionParts.join("").slice(0, 2);
    return fraction ? `${whole}.${fraction}` : whole;
  }

  function formatStaffCompensationTypeLabel(value) {
    return normalizeString(value, 32).toLowerCase() === "percent" ? "Процент" : "Фиксированная оплата";
  }

  function formatStaffCompensationLabel(record = {}) {
    const value = normalizeCompensationFieldValue(
      record && (record.compensationValue || record.salaryValue || record.payRateValue)
    );
    if (!value) return "Не указана";
    if (normalizeString(record && record.compensationType, 32).toLowerCase() === "percent") {
      return `${value}%`;
    }
    return formatCurrencyAmount(value);
  }

  function renderStaffCompensationFields(options = {}) {
    const value = normalizeCompensationFieldValue(options.value);
    const type = normalizeString(options.type, 32).toLowerCase() === "percent" ? "percent" : "fixed";

    return `<label class="admin-label">
        Оплата
        <input
          class="admin-input"
          type="text"
          name="${escapeHtmlAttribute(options.valueName || "compensationValue")}"
          value="${escapeHtmlText(value)}"
          inputmode="decimal"
          placeholder="${escapeHtmlAttribute(options.placeholder || "30")}"
        >
      </label>
      <label class="admin-label">
        Тип оплаты
        <select class="admin-input" name="${escapeHtmlAttribute(options.typeName || "compensationType")}">
          ${renderAdminSelectOptions(STAFF_COMPENSATION_OPTIONS, type)}
        </select>
      </label>`;
  }

  function renderAdminHiddenInput(name, value) {
    const normalized = normalizeString(value, 250);
    if (!normalized) return "";
    return `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(normalized)}">`;
  }

  function renderAdminDeleteIconButton(label, confirmMessage) {
    const normalizedLabel = normalizeString(label, 120) || "Удалить";
    const normalizedConfirm = normalizeString(confirmMessage, 400);
    const confirmAttrs = ` data-admin-confirm="true" data-admin-confirm-title="Точно удалить?"${normalizedConfirm ? ` data-admin-confirm-message="${escapeHtmlAttribute(normalizedConfirm)}"` : ""}`;

    return `<button
      class="admin-icon-button admin-delete-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"${confirmAttrs}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function renderAdminClientAddressRemoveButton() {
    const label = "Удалить адрес";
    return `<button
      class="admin-icon-button admin-delete-button admin-client-address-remove-button"
      type="button"
      aria-label="${escapeHtmlAttribute(label)}"
      title="${escapeHtmlAttribute(label)}"
      data-admin-client-address-remove="true"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(label)}</span>
    </button>`;
  }

  function renderAdminToggleIconButton(label, targetId, options = {}) {
    const normalizedLabel = normalizeString(label, 120) || "Открыть";
    const normalizedTargetId = normalizeString(targetId, 200);
    if (!normalizedTargetId) return "";
    const openLabel = normalizeString(options.openLabel, 120) || "Скрыть";
    const closedLabel = normalizeString(options.closedLabel, 120) || normalizedLabel;

    return `<button
      class="admin-icon-button admin-edit-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"
      data-admin-toggle-icon="true"
      data-admin-toggle-target="${escapeHtmlAttribute(normalizedTargetId)}"
      data-admin-toggle-label-open="${escapeHtmlAttribute(openLabel)}"
      data-admin-toggle-label-closed="${escapeHtmlAttribute(closedLabel)}"
      aria-controls="${escapeHtmlAttribute(normalizedTargetId)}"
      aria-expanded="false"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M16.86 3.84a2.25 2.25 0 0 1 3.18 3.18l-9.9 9.9a3 3 0 0 1-1.33.79l-3.24.92a.75.75 0 0 1-.92-.92l.92-3.24a3 3 0 0 1 .79-1.33l9.9-9.9Zm2.12 1.06a.75.75 0 0 0-1.06 0l-1.05 1.06 2.12 2.12 1.05-1.06a.75.75 0 0 0 0-1.06L18.98 4.9Zm-3.17 2.12-8.79 8.79a1.5 1.5 0 0 0-.4.67l-.56 1.99 1.99-.56a1.5 1.5 0 0 0 .67-.4l8.79-8.79-2.12-2.12ZM4.5 20.25h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1 0-1.5Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function renderAdminEditIcon(label = "Редактировать") {
    const normalizedLabel = normalizeString(label, 120) || "Редактировать";

    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M16.86 3.84a2.25 2.25 0 0 1 3.18 3.18l-9.9 9.9a3 3 0 0 1-1.33.79l-3.24.92a.75.75 0 0 1-.92-.92l.92-3.24a3 3 0 0 1 .79-1.33l9.9-9.9Zm2.12 1.06a.75.75 0 0 0-1.06 0l-1.05 1.06 2.12 2.12 1.05-1.06a.75.75 0 0 0 0-1.06L18.98 4.9Zm-3.17 2.12-8.79 8.79a1.5 1.5 0 0 0-.4.67l-.56 1.99 1.99-.56a1.5 1.5 0 0 0 .67-.4l8.79-8.79-2.12-2.12ZM4.5 20.25h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1 0-1.5Z" fill="currentColor"/>
    </svg>
    <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>`;
  }

  function renderAdminCloseIcon(label = "Закрыть") {
    const normalizedLabel = normalizeString(label, 120) || "Закрыть";

    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
    </svg>
    <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>`;
  }

  function renderAdminDialogCloseButton(dialogId, label = "Закрыть") {
    const normalizedDialogId = normalizeString(dialogId, 200);
    const normalizedLabel = normalizeString(label, 120) || "Закрыть";
    if (!normalizedDialogId) return "";

    return `<button
      class="admin-icon-button admin-close-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"
      data-admin-dialog-close="${escapeHtmlAttribute(normalizedDialogId)}"
    >
      ${renderAdminCloseIcon(normalizedLabel)}
    </button>`;
  }

  function renderAdminCalendarIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.75 2.75a.75.75 0 0 1 .75.75V5h7V3.5a.75.75 0 0 1 1.5 0V5h.75A2.75 2.75 0 0 1 20.5 7.75v9.5A2.75 2.75 0 0 1 17.75 20h-11A2.75 2.75 0 0 1 4 17.25v-9.5A2.75 2.75 0 0 1 6.75 5h.75V3.5a.75.75 0 0 1 .75-.75ZM5.5 9.5v7.75c0 .69.56 1.25 1.25 1.25h11c.69 0 1.25-.56 1.25-1.25V9.5h-13Zm1.25-3A1.25 1.25 0 0 0 5.5 7.75V8h13v-.25c0-.69-.56-1.25-1.25-1.25h-.75V8a.75.75 0 0 1-1.5 0V6.5h-7V8a.75.75 0 0 1-1.5 0V6.5h-.75Z" fill="currentColor"/>
    </svg>`;
  }

  function renderAdminClockIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.25a8.75 8.75 0 1 1 0 17.5 8.75 8.75 0 0 1 0-17.5Zm0 1.5a7.25 7.25 0 1 0 0 14.5 7.25 7.25 0 0 0 0-14.5Zm0 2.5a.75.75 0 0 1 .75.75v3.69l2.47 1.43a.75.75 0 0 1-.75 1.3l-2.85-1.64a.75.75 0 0 1-.37-.65V8a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
    </svg>`;
  }

  function renderAdminPickerField(config = {}) {
    const pickerType = normalizeString(config.pickerType, 16).toLowerCase() === "time" ? "time" : "date";
    const fieldId = normalizeString(config.fieldId, 200) || `admin-picker-${pickerType}`;
    const nativeId = `${fieldId}-native`;
    const label = normalizeString(config.label, 120);
    const extraClassName = normalizeString(config.className, 160);
    const inputName = normalizeString(config.name, 80);
    const displayValue = normalizeString(config.displayValue, 64);
    const nativeValue = normalizeString(config.nativeValue, 32);
    const placeholder = normalizeString(config.placeholder, 40);
    const pickerLabel =
      normalizeString(config.pickerLabel, 120) || (pickerType === "time" ? "Выбрать время" : "Выбрать дату");
    const inputModeAttr = pickerType === "date" ? ' inputmode="numeric"' : "";
    const nativeAttrs = pickerType === "time" ? ' step="60"' : "";
    const iconMarkup = pickerType === "time" ? renderAdminClockIcon() : renderAdminCalendarIcon();
    const labelClassName = extraClassName ? `admin-label ${escapeHtmlAttribute(extraClassName)}` : "admin-label";
    const timePanelMarkup =
      pickerType === "time"
        ? `<div class="admin-time-picker-panel" data-admin-time-panel hidden>
            <div class="admin-time-picker-grid">
              <label class="admin-time-picker-cell">
                <span class="admin-time-picker-label">Hour</span>
                <select class="admin-input admin-time-picker-select" data-admin-time-hour>
                  ${Array.from({ length: 12 }, (_, index) => {
                    const hour = String(index + 1);
                    return `<option value="${hour}">${hour}</option>`;
                  }).join("")}
                </select>
              </label>
              <label class="admin-time-picker-cell">
                <span class="admin-time-picker-label">Minute</span>
                <select class="admin-input admin-time-picker-select" data-admin-time-minute>
                  ${Array.from({ length: 60 }, (_, index) => {
                    const minute = String(index).padStart(2, "0");
                    return `<option value="${minute}">${minute}</option>`;
                  }).join("")}
                </select>
              </label>
              <label class="admin-time-picker-cell">
                <span class="admin-time-picker-label">AM/PM</span>
                <select class="admin-input admin-time-picker-select" data-admin-time-meridiem>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </label>
            </div>
          </div>`
        : "";

    return `<label class="${labelClassName}">
      ${escapeHtml(label)}
      <div class="admin-picker-field" data-admin-picker-field="${escapeHtmlAttribute(pickerType)}">
        <input
          class="admin-input admin-picker-display"
          type="text"
          name="${escapeHtmlAttribute(inputName)}"
          value="${escapeHtmlAttribute(displayValue)}"
          placeholder="${escapeHtmlAttribute(placeholder)}"
          autocomplete="off"
          data-admin-picker-display="${escapeHtmlAttribute(pickerType)}"
          id="${escapeHtmlAttribute(fieldId)}"${inputModeAttr}
        >
        <input
          class="admin-picker-native"
          type="${escapeHtmlAttribute(pickerType)}"
          value="${escapeHtmlAttribute(nativeValue)}"
          tabindex="-1"
          aria-hidden="true"
          data-admin-picker-native="${escapeHtmlAttribute(pickerType)}"
          id="${escapeHtmlAttribute(nativeId)}"${nativeAttrs}
        >
        <button
          class="admin-picker-trigger"
          type="button"
          data-admin-picker-trigger="${escapeHtmlAttribute(pickerType)}"
          aria-label="${escapeHtmlAttribute(pickerLabel)}"
          title="${escapeHtmlAttribute(pickerLabel)}"
          aria-controls="${escapeHtmlAttribute(nativeId)}"${pickerType === "time" ? ' aria-expanded="false"' : ""}
        >
          ${iconMarkup}
        </button>
        ${timePanelMarkup}
      </div>
    </label>`;
  }

  function getAdminClientAvatarInitials(value) {
    const normalized = normalizeString(value, 120);
    if (!normalized) return "?";
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }

  function getAdminClientAvatarToneClass(value) {
    const normalized = normalizeString(value, 250);
    let hash = 0;
    for (const character of normalized) {
      hash = (hash + character.charCodeAt(0)) % 5;
    }
    return `admin-client-avatar-tone-${hash + 1}`;
  }

  function renderAdminClientInfoGrid(items = [], options = {}) {
    const className = [
      "admin-client-info-grid",
      options.compact ? "admin-client-info-grid-compact" : "",
      options.columns === 3 ? "admin-client-info-grid-three" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<div class="${className}">
      ${items
        .map((item) => {
          const itemClassName = item.wide
            ? "admin-client-info-card admin-client-info-card-wide"
            : "admin-client-info-card";
          const valueMarkup = item.raw ? item.value : escapeHtml(item.value);
          return `<article class="${itemClassName}">
            <span class="admin-client-info-label">${escapeHtml(item.label)}</span>
            <p class="admin-client-info-value">${valueMarkup}</p>
            ${item.hint ? `<p class="admin-client-info-hint">${item.raw ? item.hint : escapeHtml(item.hint)}</p>` : ""}
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function getAdminSmsComposerState(req, target, ref) {
    if (!req || !target || !ref) {
      return { notice: "", draft: "", error: "" };
    }

    const reqUrl = getRequestUrl(req);
    const smsTarget = normalizeString(reqUrl.searchParams.get("smsTarget"), 40).toLowerCase();
    const smsRef = normalizeString(reqUrl.searchParams.get("smsRef"), 160);
    if (smsTarget !== normalizeString(target, 40).toLowerCase() || smsRef !== normalizeString(ref, 160)) {
      return { notice: "", draft: "", error: "" };
    }

    return {
      notice: normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase(),
      draft: normalizeString(reqUrl.searchParams.get("smsDraft"), 1000),
      error: normalizeString(reqUrl.searchParams.get("smsError"), 240),
    };
  }

  function getEntryAdminSmsData(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    return payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
  }

  function getEntrySmsHistoryEntries(entry = {}) {
    const history = getEntryAdminSmsData(entry).history;
    if (!Array.isArray(history)) return [];
    return history
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const message = normalizeString(item.message, 1000);
        if (!message) return null;
        return {
          id: normalizeString(item.id, 120),
          sentAt: normalizeString(item.sentAt || item.createdAt, 80),
          message,
          phone: normalizeString(item.phone, 80),
          contactId: normalizeString(item.contactId, 120),
          channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
          direction: normalizeString(item.direction, 20).toLowerCase() === "inbound" ? "inbound" : "outbound",
          source: normalizeString(item.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
          targetType: normalizeString(item.targetType, 40).toLowerCase(),
          targetRef: normalizeString(item.targetRef, 160),
          conversationId: normalizeString(item.conversationId, 120),
          messageId: normalizeString(item.messageId, 120),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftMs = Date.parse(left.sentAt || "");
        const rightMs = Date.parse(right.sentAt || "");
        if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
          return rightMs - leftMs;
        }
        return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
      });
  }

  function getClientSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return client.entries
      .flatMap((entry) => getEntrySmsHistoryEntries(entry))
      .sort((left, right) => {
        const leftMs = Date.parse(left.sentAt || "");
        const rightMs = Date.parse(right.sentAt || "");
        if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
          return rightMs - leftMs;
        }
        return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
      });
  }

  function getStaffSmsHistoryEntries(staffRecord = {}) {
    if (!staffRecord || !Array.isArray(staffRecord.smsHistory)) return [];
    return staffRecord.smsHistory
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const message = normalizeString(item.message, 1000);
        if (!message) return null;
        return {
          id: normalizeString(item.id, 120),
          sentAt: normalizeString(item.sentAt || item.createdAt, 80),
          message,
          phone: normalizeString(item.phone, 80),
          contactId: normalizeString(item.contactId, 120),
          channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
          direction:
            normalizeString(item.direction, 20).toLowerCase() === "inbound"
              ? "inbound"
              : "outbound",
          source:
            normalizeString(item.source, 20).toLowerCase() === "automatic"
              ? "automatic"
              : "manual",
          targetType: normalizeString(item.targetType, 40).toLowerCase(),
          targetRef: normalizeString(item.targetRef, 160),
          conversationId: normalizeString(item.conversationId, 120),
          messageId: normalizeString(item.messageId, 120),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftMs = Date.parse(left.sentAt || "");
        const rightMs = Date.parse(right.sentAt || "");
        if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
          return rightMs - leftMs;
        }
        return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
      });
  }

  function formatAdminSmsHistorySourceLabel(value) {
    return normalizeString(value, 20).toLowerCase() === "automatic" ? "Автоматически" : "Вручную";
  }

  function formatAdminSmsHistoryDirectionLabel(value) {
    return normalizeString(value, 20).toLowerCase() === "inbound" ? "Входящее" : "Исходящее";
  }

  function formatAdminSmsHistoryCountLabel(count) {
    const numeric = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
    if (numeric === 0) return "Пока пусто";
    return `${numeric} SMS`;
  }

  function renderAdminSmsHistoryItems(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return `<div class="admin-empty-state admin-ghl-sms-history-empty">История SMS появится здесь после первой отправки.</div>`;
    }

    const scrollClass = entries.length > 2 ? " is-scrollable" : "";

    return `<div class="admin-history-list admin-ghl-sms-history-list${scrollClass}" data-admin-ghl-sms-history-list>
      ${entries
        .map((entry) => {
          const sentAtLabel = entry.sentAt && typeof formatAdminDateTime === "function"
            ? formatAdminDateTime(entry.sentAt)
            : "Дата не указана";
          const metaBadges = [
            renderAdminBadge(formatAdminSmsHistorySourceLabel(entry.source), entry.source === "automatic" ? "muted" : "success"),
            renderAdminBadge(formatAdminSmsHistoryDirectionLabel(entry.direction), "outline"),
            entry.channel === "ghl" ? renderAdminBadge("Go High Level", "outline") : "",
          ]
            .filter(Boolean)
            .join("");
          return `<article class="admin-history-item admin-client-history-item admin-ghl-sms-history-item">
            <div class="admin-ghl-sms-history-top">
              <div class="admin-client-history-copy-block">
                <div class="admin-ghl-sms-history-title-row">
                  <h3 class="admin-history-title">SMS</h3>
                  <p class="admin-history-copy">${escapeHtml(sentAtLabel)}</p>
                </div>
                <div class="admin-ghl-sms-history-badges">${metaBadges}</div>
              </div>
            </div>
            <div class="admin-ghl-sms-history-bubble">
              <p class="admin-client-history-address admin-ghl-sms-history-message">${escapeHtml(entry.message)}</p>
            </div>
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderAdminSmsFeedback(noticeState, noticePrefix) {
    const notice = normalizeString(noticeState && noticeState.notice, 80).toLowerCase();
    const prefix = normalizeString(noticePrefix, 40).toLowerCase();
    const error = normalizeString(noticeState && noticeState.error, 240);

    if (!notice || !prefix || !notice.startsWith(`${prefix}-sms-`)) return "";
    if (notice === `${prefix}-sms-sent`) {
      return `<div class="admin-alert admin-alert-info">SMS отправлена через Go High Level.</div>`;
    }
    if (notice === `${prefix}-sms-empty`) {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой.</div>`;
    }
    if (notice === `${prefix}-sms-unavailable`) {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === `${prefix}-sms-contact-missing`) {
      return `<div class="admin-alert admin-alert-error">${escapeHtml(error || "В Go High Level не найден контакт или телефон для отправки SMS.")}</div>`;
    }
    if (notice === `${prefix}-sms-failed`) {
      return `<div class="admin-alert admin-alert-error">${escapeHtml(error || "Не удалось отправить SMS через Go High Level.")}</div>`;
    }
    return "";
  }

  function renderAdminGhlSmsComposer(options = {}) {
    if (options.canEdit === false) return "";

    const noticePrefix = normalizeString(options.noticePrefix, 40).toLowerCase();
    const targetType = normalizeString(options.targetType, 40).toLowerCase();
    const targetRef = normalizeString(options.targetRef, 160);
    const targetFieldName = normalizeString(options.targetFieldName, 80);
    const targetFieldValue = normalizeString(options.targetFieldValue, 160);
    const actionPath = normalizeString(options.actionPath, 200) || ADMIN_QUOTE_OPS_PATH;
    const returnTo = normalizeString(options.returnTo, 1000);
    const title = normalizeString(options.title, 120) || "SMS через Go High Level";
    const description = normalizeString(options.description, 240) || "Сообщение уйдёт клиенту прямо из этой карточки.";
    const messagePlaceholder =
      normalizeString(options.messagePlaceholder, 240) ||
      "Напишите клиенту короткое SMS-сообщение...";
    const phone = normalizeString(options.phone, 80);
    const phoneLabel = formatAdminPhoneNumber(phone) || phone;
    const hasPhone = Boolean(phoneLabel);
    const hasContact = Boolean(normalizeString(options.contactId, 120));
    const composerState = getAdminSmsComposerState(options.req, targetType, targetRef);
    const feedbackMarkup = renderAdminSmsFeedback(composerState, noticePrefix);
    const historyEntries = Array.isArray(options.historyEntries) ? options.historyEntries : [];
    const historyMarkup = renderAdminSmsHistoryItems(historyEntries);
    const historyCountLabel = formatAdminSmsHistoryCountLabel(historyEntries.length);

    if (!options.leadConnectorConfigured) {
      return "";
    }

    return renderAdminCard(
      title,
      hasPhone
        ? `${description} Номер: ${phoneLabel}.`
        : description,
      `<div class="admin-ghl-sms-layout" data-admin-ghl-sms-root data-admin-ghl-sms-target="${escapeHtmlAttribute(targetType)}">
        <div class="admin-ghl-sms-compose-column">
          <div data-admin-ghl-sms-feedback>${feedbackMarkup}</div>
          ${!hasPhone && !hasContact
            ? `<div class="admin-alert admin-alert-error">У клиента нет телефона или GHL contact ID. SMS сейчас отправить нельзя.</div>`
            : `<form class="admin-form admin-form-grid admin-ghl-sms-form" method="post" action="${escapeHtmlAttribute(actionPath)}" data-admin-ghl-sms="true">
                <input type="hidden" name="action" value="${escapeHtmlAttribute(`send-${targetType}-sms`)}">
                <input type="hidden" name="${escapeHtmlAttribute(targetFieldName)}" value="${escapeHtmlAttribute(targetFieldValue)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <label class="admin-label">
                  Сообщение
                  <textarea class="admin-input" name="message" rows="4" maxlength="1000" placeholder="${escapeHtmlAttribute(messagePlaceholder)}">${escapeHtml(composerState.draft)}</textarea>
                </label>
                <div class="admin-inline-actions">
                  <button class="admin-button admin-button-secondary" type="submit">Отправить SMS</button>
                  <span class="admin-action-hint">${escapeHtml(hasPhone ? `Через GHL на ${phoneLabel}` : "Через контакт Go High Level")}</span>
                </div>
              </form>`}
        </div>
        <aside class="admin-ghl-sms-history-column">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">История SMS</h3>
            <span class="admin-action-hint" data-admin-ghl-sms-history-count>${escapeHtml(historyCountLabel)}</span>
          </div>
          <div data-admin-ghl-sms-history>${historyMarkup}</div>
        </aside>
      </div>`,
      {
        eyebrow: "SMS",
        muted: true,
        className: "admin-ghl-sms-card",
      }
    );
  }

  function getAdminClientHistoryTeamLabel(entry, planningItem = null) {
    if (planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0) {
      return planningItem.assignedStaff
        .map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
        .filter(Boolean)
        .join(", ");
    }

    const payload = entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
      ? entry.payloadForRetry
      : null;
    const adminOrder = payload && payload.adminOrder && typeof payload.adminOrder === "object"
      ? payload.adminOrder
      : null;
    const assignedFallback = normalizeString(
      adminOrder && (adminOrder.assignedStaff || adminOrder.assignee),
      160
    );

    if (assignedFallback) return assignedFallback;
    if (planningItem && planningItem.assignment && Array.isArray(planningItem.missingStaffIds) && planningItem.missingStaffIds.length > 0) {
      return "Команда назначена";
    }
    return "Команда не назначена";
  }

  function renderAdminClientHistoryItem(entry, planningItem = null) {
    const scheduledLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Дата не указана";
    const teamLabel = getAdminClientHistoryTeamLabel(entry, planningItem);
    return `<article class="admin-history-item admin-client-history-item">
      <div class="admin-client-history-header">
        <div class="admin-client-history-copy-block">
          <h3 class="admin-history-title">${escapeHtml(formatAdminServiceLabel(entry.serviceName))}</h3>
          <p class="admin-history-copy">${escapeHtml(formatAdminDateTime(entry.createdAt))}</p>
        </div>
        <div class="admin-client-history-side">
          <span class="admin-client-history-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
          ${renderAdminClientStatusBadge(entry.status)}
        </div>
      </div>
      <div class="admin-client-history-meta-row">
        <span class="admin-history-meta-chip">${escapeHtml(entry.requestId || "Номер не указан")}</span>
        <span class="admin-history-meta-chip">${escapeHtml(`Уборка: ${scheduledLabel}`)}</span>
        <span class="admin-history-meta-chip">${escapeHtml(`Команда: ${teamLabel}`)}</span>
      </div>
      <p class="admin-client-history-address">${escapeHtml(entry.fullAddress || "Адрес не указан")}</p>
    </article>`;
  }

  function getAdminClientEditPanelId(clientKey) {
    const normalized = normalizeString(clientKey, 180).toLowerCase();
    const safeKey = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `admin-client-edit-${safeKey || "panel"}`;
  }

  function renderAdminClientAddressTabs(client, returnTo = ADMIN_CLIENTS_PATH, activeAddressKey = "") {
    if (!client || !Array.isArray(client.addresses) || client.addresses.length === 0) return "";

    return `<div class="admin-client-address-switcher">
      <div class="admin-subsection-head admin-client-address-head">
        <h3 class="admin-subsection-title">Адреса клиента</h3>
        <span class="admin-action-hint">${escapeHtml(formatClientAddressCountLabel(client.addresses.length))}</span>
      </div>
      <div class="admin-client-address-list">
        ${client.addresses
          .map((addressRecord) => {
            const href = buildAdminRedirectPath(returnTo, {
              client: client.key,
              addressKey: addressRecord.key,
            });
            const className = [
              "admin-client-address-pill",
              addressRecord.key === activeAddressKey ? "admin-client-address-pill-active" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const metaCopy = [
              addressRecord.requestCount > 0
                ? formatClientRequestCountLabel(addressRecord.requestCount)
                : "Без заявок",
              addressRecord.propertyType ? formatAdminClientAddressPropertyTypeLabel(addressRecord.propertyType) : "",
            ]
              .filter(Boolean)
              .join(" • ");

            return `<a class="${className}" href="${escapeHtmlAttribute(href)}">
              <span class="admin-client-address-pill-copy">${escapeHtml(addressRecord.address || "Адрес не указан")}</span>
              <span class="admin-client-address-pill-meta">${escapeHtml(metaCopy)}</span>
            </a>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  function renderAdminClientAddressProfileSection(addressRecord) {
    if (!addressRecord) return "";

    const squareFootage = normalizeString(addressRecord.squareFootage, 120) || "Не указан";
    const roomCount = normalizeString(addressRecord.roomCount, 120) || "Не указано";
    const notes = normalizeString(addressRecord.notes, 800) || "Пока без заметок";

    return `<section class="admin-client-section admin-client-address-profile-section">
      <div class="admin-subsection-head">
        <h3 class="admin-subsection-title">Параметры адреса</h3>
        <span class="admin-action-hint">Меняются при переключении адреса клиента</span>
      </div>
      <div class="admin-client-address-profile-grid">
        <article class="admin-client-address-fact">
          <span class="admin-client-address-fact-label">Тип объекта</span>
          <p class="admin-client-address-fact-value">${escapeHtml(formatAdminClientAddressPropertyTypeLabel(addressRecord.propertyType))}</p>
        </article>
        <article class="admin-client-address-fact">
          <span class="admin-client-address-fact-label">Метраж</span>
          <p class="admin-client-address-fact-value">${escapeHtml(squareFootage)}</p>
        </article>
        <article class="admin-client-address-fact">
          <span class="admin-client-address-fact-label">Комнаты</span>
          <p class="admin-client-address-fact-value">${escapeHtml(roomCount)}</p>
        </article>
        <article class="admin-client-address-fact">
          <span class="admin-client-address-fact-label">Домашние животные</span>
          <p class="admin-client-address-fact-value">${escapeHtml(formatAdminClientAddressPetsLabel(addressRecord.pets))}</p>
        </article>
      </div>
      <article class="admin-client-address-note-card">
        <span class="admin-client-address-fact-label">Особые инструкции</span>
        <p class="admin-client-address-note-copy">${escapeHtml(notes)}</p>
      </article>
    </section>`;
  }

  function renderAdminClientAddressPreview(client) {
    const addresses = Array.isArray(client && client.addresses)
      ? client.addresses
        .map((addressRecord) => normalizeString(addressRecord && addressRecord.address, 500))
        .filter(Boolean)
      : [];

    if (addresses.length === 0 && client && client.address) {
      addresses.push(normalizeString(client.address, 500));
    }

    if (addresses.length === 0) {
      return `<span class="admin-table-muted">Не указан</span>`;
    }

    const visibleAddresses = addresses.slice(0, 3);
    const hiddenCount = Math.max(0, addresses.length - visibleAddresses.length);
    const hiddenTitle = hiddenCount > 0
      ? `Ещё ${hiddenCount} ${formatClientAddressCountLabel(hiddenCount)}`
      : "";

    return `<div class="admin-client-address-preview-list">
      ${visibleAddresses
        .map((address) => `<span class="admin-client-address-preview-item">${escapeHtml(address)}</span>`)
        .join("")}
      ${hiddenCount > 0
        ? `<span class="admin-client-address-preview-more" title="${escapeHtmlAttribute(hiddenTitle)}">+${escapeHtml(String(hiddenCount))}</span>`
        : ""}
    </div>`;
  }

  function renderAdminClientAddressInputRow(baseId, value = "", index = 0) {
    const addressRecord =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : { address: value };
    const inputId = normalizeString(`${baseId}-address-${index}`, 160);
    const suggestionsId = `${inputId}-suggestions`;

    return `<div class="admin-client-address-input-row" data-admin-client-address-row>
      <div class="admin-client-address-input-panel">
        <div class="admin-client-address-input-head">
          <span class="admin-client-address-input-title">Адрес клиента</span>
          ${renderAdminClientAddressRemoveButton()}
        </div>
        <label class="admin-label">
          Адрес
          <div class="admin-address-field" data-admin-address-field>
            <input
              class="admin-input"
              type="text"
              name="addresses"
              value="${escapeHtmlAttribute(normalizeString(addressRecord.address, 500))}"
              placeholder="58 South Grove Avenue, Elgin, IL"
              autocomplete="off"
              data-admin-address-autocomplete="true"
              data-admin-address-country="us"
              aria-autocomplete="list"
              aria-expanded="false"
              id="${escapeHtmlAttribute(inputId)}"
              aria-controls="${escapeHtmlAttribute(suggestionsId)}"
            >
            <div class="admin-address-suggestions" data-admin-address-suggestions hidden role="listbox" id="${escapeHtmlAttribute(suggestionsId)}"></div>
          </div>
        </label>
        <div class="admin-form-grid admin-form-grid-three admin-client-address-detail-grid">
          <label class="admin-label">
            Тип объекта
            <select class="admin-input" name="addressPropertyTypes">
              ${renderAdminSelectOptions(CLIENT_ADDRESS_TYPE_OPTIONS, addressRecord.propertyType, "Выберите тип")}
            </select>
          </label>
          <label class="admin-label">
            Метраж
            <input
              class="admin-input"
              type="text"
              name="addressSquareFootages"
              value="${escapeHtmlAttribute(normalizeString(addressRecord.squareFootage, 120))}"
              placeholder="1600 sq ft"
            >
          </label>
          <label class="admin-label">
            Комнаты
            <input
              class="admin-input"
              type="text"
              name="addressRoomCounts"
              value="${escapeHtmlAttribute(normalizeString(addressRecord.roomCount, 120))}"
              placeholder="3 комнаты"
            >
          </label>
          <label class="admin-label">
            Домашние животные
            <select class="admin-input" name="addressPets">
              ${renderAdminSelectOptions(CLIENT_ADDRESS_PET_OPTIONS, addressRecord.pets, "Не указано")}
            </select>
          </label>
        </div>
        <label class="admin-label">
          Особые инструкции
          <textarea class="admin-input" name="addressNotes" placeholder="Ключи, код двери, что не трогать, аллергии">${escapeHtml(normalizeString(addressRecord.notes, 800))}</textarea>
        </label>
      </div>
    </div>`;
  }

  function renderAdminClientEditPanel(client, returnTo = ADMIN_CLIENTS_PATH, panelId = "") {
    if (!client || !panelId) return "";
    const addressValues = Array.isArray(client.addresses)
      ? client.addresses
        .map((addressRecord) => ({
          address: normalizeString(addressRecord && addressRecord.address, 500),
          propertyType: normalizeString(addressRecord && addressRecord.propertyType, 40).toLowerCase(),
          squareFootage: normalizeString(addressRecord && addressRecord.squareFootage, 120),
          roomCount: normalizeString(addressRecord && addressRecord.roomCount, 120),
          sizeDetails: normalizeString(addressRecord && addressRecord.sizeDetails, 250),
          pets: normalizeString(addressRecord && addressRecord.pets, 40).toLowerCase(),
          notes: normalizeString(addressRecord && addressRecord.notes, 800),
        }))
        .filter((addressRecord) => addressRecord.address)
      : [];
    const initialAddresses = addressValues.length > 0
      ? addressValues
      : [{ address: "", propertyType: "", squareFootage: "", roomCount: "", sizeDetails: "", pets: "", notes: "" }];
    const addressTemplateId = `${panelId}-address-template`;

    return `<section class="admin-client-section admin-staff-form-section" id="${escapeHtmlAttribute(panelId)}" data-admin-toggle-panel hidden>
      <div class="admin-subsection-head">
        <h3 class="admin-subsection-title">Редактирование клиента</h3>
        <span class="admin-action-hint">Обновляет карточку клиента во всех связанных заявках</span>
      </div>
      <form
        class="admin-form-grid"
        method="post"
        action="${ADMIN_CLIENTS_PATH}"
        data-admin-async-save="true"
        data-admin-async-success="Карточка клиента сохранена."
        data-admin-async-error="Не удалось сохранить карточку клиента."
      >
        <input type="hidden" name="action" value="update-client">
        <input type="hidden" name="clientKey" value="${escapeHtmlAttribute(client.key)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label">
            Имя клиента
            <input class="admin-input" type="text" name="name" value="${escapeHtmlText(client.name)}" required>
          </label>
          ${renderAdminPhoneInput("phone", client.phone)}
          <label class="admin-label">
            Email
            <input class="admin-input" type="email" name="email" value="${escapeHtmlText(client.email)}" placeholder="client@example.com">
          </label>
        </div>
        <div class="admin-label">
          <span>Адреса клиента</span>
          <div class="admin-client-address-editor" data-admin-client-address-editor data-admin-client-address-next-index="${escapeHtmlAttribute(String(initialAddresses.length))}">
            <div class="admin-client-address-input-list" data-admin-client-address-list>
              ${initialAddresses.map((addressRecord, index) => renderAdminClientAddressInputRow(panelId, addressRecord, index)).join("")}
            </div>
            <div class="admin-inline-actions">
              <button
                class="admin-button admin-button-secondary"
                type="button"
                data-admin-client-address-add="true"
                data-admin-client-address-template="${escapeHtmlAttribute(addressTemplateId)}"
              >Добавить адрес</button>
            </div>
            <small class="admin-field-hint">Для каждого адреса можно сохранить тип объекта, параметры дома, животных и заметки. При переключении адреса в карточке эти данные меняются вместе с историей заявок.</small>
            <template id="${escapeHtmlAttribute(addressTemplateId)}">${renderAdminClientAddressInputRow(panelId, {
              address: "",
              propertyType: "",
              squareFootage: "",
              roomCount: "",
              sizeDetails: "",
              pets: "",
              notes: "",
            }, "__INDEX__")}</template>
          </div>
        </div>
        <p class="admin-field-note" data-admin-async-feedback hidden></p>
        <div class="admin-inline-actions">
          <button class="admin-button" type="submit">Сохранить клиента</button>
        </div>
      </form>
    </section>`;
  }

  function renderClientsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "client-saved") {
      return `<div class="admin-alert admin-alert-info">Карточка клиента обновлена.</div>`;
    }
    if (notice === "client-deleted") {
      return `<div class="admin-alert admin-alert-info">Клиент и его заявки удалены.</div>`;
    }
    if (notice === "client-missing") {
      return `<div class="admin-alert admin-alert-error">Клиент не найден.</div>`;
    }
    if (notice === "client-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить клиента. Попробуйте ещё раз.</div>`;
    }
    if (notice === "client-delete-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось удалить клиента. Попробуйте ещё раз.</div>`;
    }
    if (notice === "client-sms-sent") {
      return `<div class="admin-alert admin-alert-info">SMS клиенту отправлена через Go High Level.</div>`;
    }
    if (notice === "client-sms-empty") {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой SMS.</div>`;
    }
    if (notice === "client-sms-unavailable") {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === "client-sms-contact-missing" || notice === "client-sms-failed") {
      const smsError = normalizeString(reqUrl.searchParams.get("smsError"), 240);
      return `<div class="admin-alert admin-alert-error">${escapeHtml(smsError || "Не удалось отправить SMS клиенту.")}</div>`;
    }
    return "";
  }

  function renderQuoteOpsDiagnostics(quoteOpsLedger) {
    const diagnostics =
      quoteOpsLedger && typeof quoteOpsLedger.getDiagnostics === "function"
        ? quoteOpsLedger.getDiagnostics()
        : null;
    if (!diagnostics) return "";

    const modeLabel = diagnostics.mode === "supabase" ? "Supabase" : "Память процесса";
    const remoteStatusLabel =
      diagnostics.mode !== "supabase"
        ? "Только память"
        : diagnostics.remoteStatus === "healthy"
          ? "Persistent storage active"
          : diagnostics.remoteStatus === "fallback"
            ? "Есть fallback"
            : "Ожидаем первую синхронизацию";
    const readSourceLabel =
      diagnostics.lastReadSource === "supabase"
        ? "Чтение: Supabase"
        : diagnostics.lastReadSource === "memory-fallback"
          ? "Чтение: fallback в память"
          : diagnostics.lastReadSource === "memory"
            ? "Чтение: память"
            : "Чтение ещё не выполнялось";
    const statusBadge =
      diagnostics.lastReadError
        ? renderAdminBadge("Есть ошибка чтения", "danger")
        : diagnostics.mode === "supabase"
          ? renderAdminBadge("Подключено к Supabase", "success")
          : renderAdminBadge("Временное хранилище", "muted");

    const summaryAlert =
      diagnostics.mode !== "supabase"
        ? `<div class="admin-alert admin-alert-error">Заказы сейчас хранятся только в памяти сервера. После рестарта или деплоя они исчезнут.</div>`
        : diagnostics.remoteStatus === "fallback"
          ? `<div class="admin-alert admin-alert-error">Supabase подключён, но чтение или запись заказов сейчас откатились в локальный fallback.</div>`
          : diagnostics.remoteStatus === "healthy"
            ? `<div class="admin-alert admin-alert-info">Persistent storage active: заказы должны переживать деплои и рестарты.</div>`
            : `<div class="admin-alert admin-alert-info">Supabase подключён. Ждём первой успешной синхронизации.</div>`;

    return `<div class="admin-diagnostics-strip">
      ${summaryAlert}
      <div class="admin-diagnostics-head">
        <div class="admin-badge-row admin-badge-row-inline">
          ${renderAdminBadge(modeLabel, diagnostics.mode === "supabase" ? "success" : "muted")}
          ${renderAdminBadge(remoteStatusLabel, diagnostics.remoteStatus === "fallback" ? "danger" : diagnostics.mode === "supabase" ? "success" : "muted")}
          ${renderAdminBadge(readSourceLabel, diagnostics.lastReadError ? "danger" : "outline")}
          ${statusBadge}
        </div>
        <p class="admin-action-hint">Этот раздел строится только из заявок сайта в quote ops, а не из всей CRM-базы контактов.</p>
      </div>
      <div class="admin-diagnostics-grid">
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Таблица</span>
          <p class="admin-diagnostics-value">${escapeHtml(diagnostics.tableName || "Не указана")}</p>
        </article>
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Лимит чтения</span>
          <p class="admin-diagnostics-value">${escapeHtml(String(diagnostics.limit || 0))}</p>
        </article>
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Последнее чтение</span>
          <p class="admin-diagnostics-value">${escapeHtml(diagnostics.lastReadAt || "Нет данных")}</p>
        </article>
      </div>
      ${diagnostics.lastReadError
        ? `<div class="admin-alert admin-alert-error">Ошибка чтения Supabase: ${escapeHtml(diagnostics.lastReadError)}</div>`
        : diagnostics.lastSyncError
          ? `<div class="admin-alert admin-alert-error">Последняя ошибка синхронизации: ${escapeHtml(diagnostics.lastSyncError)}</div>`
          : ""}
    </div>`;
  }

  function getAdminClientEntryOrderStatus(entry) {
    if (!isOrderCreatedEntry(entry)) return "request";
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const calculatorData =
      payload.calculatorData && typeof payload.calculatorData === "object"
        ? payload.calculatorData
        : {};
    const adminOrder =
      payload.adminOrder && typeof payload.adminOrder === "object"
        ? payload.adminOrder
        : {};
    const explicitStatus = normalizeOrderStatus(adminOrder.status, "");
    if (explicitStatus) return explicitStatus;
    const selectedDate = normalizeString(entry.selectedDate || calculatorData.selectedDate, 32);
    const selectedTime = normalizeString(entry.selectedTime || calculatorData.selectedTime, 32);
    if (selectedDate || selectedTime) return "scheduled";
    return "new";
  }

  function isAdminClientEntryActive(entry) {
    if (!isOrderCreatedEntry(entry)) return false;
    const orderStatus = getAdminClientEntryOrderStatus(entry);
    return orderStatus !== "completed" && orderStatus !== "canceled";
  }

  function renderAdminClientDetailPanel(client, returnTo = ADMIN_CLIENTS_PATH, options = {}) {
    if (!client) {
      return `<div class="admin-empty-state">Выберите клиента в таблице, чтобы открыть его контакты, сводку по заявкам и историю обращений.</div>`;
    }

    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const activeAddressRecord =
      options.activeAddressRecord && typeof options.activeAddressRecord === "object"
        ? options.activeAddressRecord
        : Array.isArray(client.addresses)
          ? client.addresses[0] || null
          : null;
    const scopedEntries =
      activeAddressRecord && Array.isArray(activeAddressRecord.entries) ? activeAddressRecord.entries : [];
    const successfulEntries = scopedEntries.filter((entry) => normalizeString(entry.status, 32).toLowerCase() === "success").length;
    const issueCount = Math.max(0, scopedEntries.length - successfulEntries);
    const latestEntry = scopedEntries[0] || null;
    const activeEntry = scopedEntries.find((entry) => isAdminClientEntryActive(entry)) || null;
    const activeOrderStatus = activeEntry ? getAdminClientEntryOrderStatus(activeEntry) : "";
    const activeScheduledLabel = activeEntry
      ? buildFormattedScheduleLabel(activeEntry.selectedDate, activeEntry.selectedTime) || "Не указана"
      : "";
    const editPanelId = normalizeString(options.editPanelId, 200);
    const scopedLatestStatus =
      activeAddressRecord && activeAddressRecord.requestCount > 0 ? activeAddressRecord.latestStatus : "";
    const smsContactEntry = Array.isArray(client.entries)
      ? client.entries.find((entry) => normalizeString(entry && entry.contactId, 120))
      : null;
    const statusBadges = [
      renderAdminClientStatusBadge(scopedLatestStatus),
      renderAdminBadge(scopedEntries.length > 1 ? "Повторный адрес" : "Новый адрес", scopedEntries.length > 1 ? "outline" : "muted"),
      issueCount > 0 ? renderAdminBadge(`${issueCount} требуют внимания`, "danger") : renderAdminBadge("Без ошибок", "success"),
    ].join("");
    const summaryCopy = activeEntry
      ? `Активная заявка: ${formatAdminDateTime(activeEntry.createdAt)}`
      : latestEntry
        ? `Последняя заявка: ${formatAdminDateTime(latestEntry.createdAt)}`
        : "По выбранному адресу пока нет заявок.";
    const activeRequestItems = activeEntry
      ? [
          { label: "Услуга", value: formatAdminServiceLabel(activeEntry.serviceName || activeEntry.serviceType) },
          { label: "Сумма текущей заявки", value: formatCurrencyAmount(activeEntry.totalPrice) },
          { label: "Дата и время", value: activeScheduledLabel || "Не указана" },
          { label: "Статус заказа", value: renderOrderStatusBadge(activeOrderStatus), raw: true },
          { label: "Последнее обращение", value: formatAdminDateTime(activeEntry.createdAt) },
          { label: "Request ID", value: activeEntry.requestId || "Не указан" },
        ]
      : [];

    return `<div class="admin-client-dialog-body">
      <section class="admin-client-summary-panel">
        <div class="admin-client-summary-head">
          <div class="admin-client-summary-copy-block">
            <div class="admin-badge-row admin-client-badge-row">
              ${statusBadges}
            </div>
            <p class="admin-client-summary-copy">${escapeHtml(summaryCopy)}</p>
          </div>
        </div>
        <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Последний статус</span>
            <div class="admin-client-metric-value">${renderAdminClientStatusBadge(scopedLatestStatus)}</div>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Заявок по адресу</span>
            <p class="admin-client-metric-value">${escapeHtml(String(activeAddressRecord ? activeAddressRecord.requestCount : scopedEntries.length))}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Сумма по адресу</span>
            <p class="admin-client-metric-value">${escapeHtml(formatCurrencyAmount(activeAddressRecord ? activeAddressRecord.totalRevenue : 0))}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Адресов клиента</span>
            <p class="admin-client-metric-value">${escapeHtml(String(Array.isArray(client.addresses) ? client.addresses.length : 0))}</p>
          </article>
        </div>
        ${renderAdminClientAddressTabs(
          client,
          returnTo,
          activeAddressRecord ? activeAddressRecord.key : ""
        )}
      </section>
      ${renderAdminClientAddressProfileSection(activeAddressRecord)}
      ${renderAdminGhlSmsComposer({
        req: options.req,
        actionPath: ADMIN_CLIENTS_PATH,
        targetType: "client",
        targetRef: client.key,
        targetFieldName: "clientKey",
        targetFieldValue: client.key,
        returnTo,
        phone: client.phone,
              contactId: smsContactEntry ? smsContactEntry.contactId : "",
              historyEntries: getClientSmsHistoryEntries(client),
              leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
              canEdit: options.canEdit,
              noticePrefix: "client",
        title: "SMS клиенту",
        description: "Быстрая отправка сообщения через Go High Level прямо из карточки клиента.",
      })}
      ${renderAdminClientEditPanel(client, returnTo, editPanelId)}
      ${activeEntry
        ? `<section class="admin-client-section admin-client-section-side">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Сводка по активной заявке</h3>
            <span class="admin-action-hint">${escapeHtml(activeEntry.requestId || "Номер не указан")}</span>
          </div>
          ${renderAdminClientInfoGrid(activeRequestItems)}
        </section>`
        : ""}
      <section class="admin-client-section">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">История заявок по адресу</h3>
          <span class="admin-action-hint">${escapeHtml(formatClientRequestCountLabel(activeAddressRecord ? activeAddressRecord.requestCount : scopedEntries.length))}</span>
        </div>
        ${scopedEntries.length > 0
          ? `<div class="admin-history-list admin-client-history-list">
              ${scopedEntries.map((entry) => renderAdminClientHistoryItem(entry, planningByEntryId.get(entry.id) || null)).join("")}
            </div>`
          : `<div class="admin-empty-state admin-client-history-empty">По этому адресу пока нет заявок. Добавленный адрес уже сохранён в карточке клиента.</div>`}
      </section>
    </div>`;
  }

  function renderAdminClientDetailDialog(client, returnTo = ADMIN_CLIENTS_PATH, options = {}) {
    if (!client) return "";
    const closeHref = options.closeHref || ADMIN_CLIENTS_PATH;
    const dialogId = normalizeString(options.dialogId, 200) || "admin-client-detail-dialog";
    const titleId = `${dialogId}-title`;
    const autoOpenAttr = options.autoOpen === false ? "" : ' data-admin-dialog-autopen="true"';
    const clientTitle = client.name || "Клиент";
    const editPanelId = getAdminClientEditPanelId(client.key);
    const activeAddressRecord =
      options.activeAddressRecord && typeof options.activeAddressRecord === "object"
        ? options.activeAddressRecord
        : Array.isArray(client.addresses)
          ? client.addresses[0] || null
          : null;
    const clientMeta = [formatAdminPhoneNumber(client.phone) || client.phone || "", client.email || ""].filter(Boolean).join(" • ") || "Контакты пока не заполнены";
    const clientAddressLine = activeAddressRecord && activeAddressRecord.address ? activeAddressRecord.address : client.address || "";
    return `<dialog
      class="admin-dialog admin-dialog-wide"
      id="${escapeHtmlAttribute(dialogId)}"${autoOpenAttr}${closeHref ? ` data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"` : ""}
      aria-labelledby="${escapeHtmlAttribute(titleId)}"
    >
      <div class="admin-dialog-panel admin-client-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <span class="admin-client-avatar admin-client-avatar-large ${getAdminClientAvatarToneClass(client.key)}">${escapeHtml(getAdminClientAvatarInitials(clientTitle))}</span>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy admin-client-dialog-intro">
              <p class="admin-card-eyebrow">Клиент</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(titleId)}">${escapeHtml(clientTitle)}</h2>
                <div class="admin-dialog-hero-meta-stack">
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(clientMeta)}</p>
                  ${clientAddressLine ? `<p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(clientAddressLine)}</p>` : ""}
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${renderAdminToggleIconButton("Редактировать клиента", editPanelId, {
              openLabel: "Скрыть",
              closedLabel: "Редактировать клиента",
            })}
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        ${renderAdminClientDetailPanel(client, returnTo, {
          closeHref,
          editPanelId,
          activeAddressRecord,
          planningByEntryId: options.planningByEntryId,
        })}
      </div>
    </dialog>`;
  }

  async function renderDashboardPage(req, config, quoteOpsLedger, adminRuntime = {}) {
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot =
      adminRuntime && adminRuntime.staffStore && typeof adminRuntime.staffStore.getSnapshot === "function"
        ? await adminRuntime.staffStore.getSnapshot()
        : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const clientRecords = collectAdminClientRecords(allEntries);
    const orderRecords = collectAdminOrderRecords(allEntries);
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const managerOptions = await collectQuoteOpsManagerOptions(
      adminRuntime,
      adminRuntime && adminRuntime.staffStore ? adminRuntime.staffStore : null
    );
    const scheduledCount = orderRecords.filter((order) => order.hasSchedule).length;
    const attentionCount = allEntries.filter((entry) => entry.status !== "success").length;
    const todayDateValue = getAdminDashboardTodayDateValue();
    const recentEntries = allEntries
      .filter((entry) => !isOrderCreatedEntry(entry))
      .slice()
      .sort((left, right) => getDashboardEntryCreatedAtMs(right) - getDashboardEntryCreatedAtMs(left))
      .slice(0, DASHBOARD_NEW_REQUESTS_LIMIT);
    const dashboardTaskRecords = buildQuoteOpsTaskRecords(allEntries)
      .filter((task) => task.status === "open")
      .filter((task) => {
        const taskDateValue = getAdminDashboardDateValue(task.dueAt);
        return Boolean(taskDateValue) && taskDateValue <= todayDateValue;
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left.dueAt || "");
        const rightTime = Date.parse(right.dueAt || "");
        if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
        if (!Number.isFinite(leftTime)) return 1;
        if (!Number.isFinite(rightTime)) return -1;
        return leftTime - rightTime;
      });
    const overdueTaskRecords = dashboardTaskRecords.filter(
      (task) => getAdminDashboardDateValue(task.dueAt) < todayDateValue
    );
    const todayTaskRecords = dashboardTaskRecords.filter(
      (task) => getAdminDashboardDateValue(task.dueAt) === todayDateValue
    );
    const ordersWithoutTeam = orderRecords
      .filter((order) => isDashboardOrderWithoutTeam(order))
      .sort((left, right) => getDashboardOrderSortValue(left).localeCompare(getDashboardOrderSortValue(right), "en"));
    const todayOrders = orderRecords
      .filter((order) => normalizeString(order.selectedDate, 32) === todayDateValue)
      .sort((left, right) => getDashboardOrderSortValue(left).localeCompare(getDashboardOrderSortValue(right), "en"));
    const overviewItems = [
      {
        label: "Клиенты",
        value: clientRecords.length,
        copy: "Все клиенты из текущих заявок.",
        tone: "accent",
      },
      {
        label: "Заказы",
        value: orderRecords.length,
        copy: "Подтверждённые заявки, уже переведённые в заказы.",
        tone: "default",
      },
      {
        label: "Назначена дата",
        value: scheduledCount,
        copy: "Заказы, где уже выбраны день или время.",
        tone: "success",
      },
      {
        label: "Нужно проверить",
        value: attentionCount,
        copy: "Заявки, которым требуется внимание.",
        tone: attentionCount > 0 ? "danger" : "default",
      },
    ];

    return renderAdminLayout(
      "Обзор",
      `${renderQuoteOpsWorkspaceStyle()}
      <div class="admin-compact-summary-strip admin-dashboard-summary-strip">
        ${overviewItems
          .map(
            (item) => `<article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
              <div class="admin-compact-summary-head">
                <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
                <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
              </div>
              <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
            </article>`
          )
          .join("")}
      </div>
      ${renderAdminCard(
        "Новые заявки",
        "Последние входящие заявки с сайта. Полная история и детали доступны в разделе «Заявки».",
        renderDashboardNewRequestsTable(recentEntries, {
          req,
          managerOptions,
          returnTo: ADMIN_ROOT_PATH,
          canEdit: accessContext.canEdit,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        }),
        { eyebrow: "Обзор", muted: true }
      )}
      ${renderAdminCard(
        "Таски на контроле",
        "Открытые таски с дедлайном на сегодня или раньше. Будущие дедлайны остаются в разделе «Заявки → Таски».",
        renderDashboardLeadTasksSection({
          overdueTaskRecords,
          todayTaskRecords,
        }),
        { eyebrow: "Обзор", muted: true }
      )}
      <div class="admin-section-grid">
        ${renderAdminCard(
        "Заказы без команды",
        "Активные заказы, в которых ещё не назначена команда.",
        renderDashboardOrdersWithoutTeamTable(ordersWithoutTeam, {
          req,
          planningByEntryId,
          staffRecords: Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [],
          returnTo: ADMIN_ROOT_PATH,
          canDelete: accessContext.canDelete,
          canEdit: accessContext.canEdit,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        }),
        { eyebrow: "Обзор", muted: true }
      )}
      ${renderAdminCard(
        "Заказы на сегодня",
        "Все заказы, запланированные на сегодня по рабочему календарю.",
        renderDashboardTodayOrdersTable(todayOrders, {
          req,
          planningByEntryId,
          staffRecords: Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [],
          returnTo: ADMIN_ROOT_PATH,
          canDelete: accessContext.canDelete,
          canEdit: accessContext.canEdit,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        }),
        { eyebrow: "Обзор", muted: true }
      )}
      </div>`,
      {
        kicker: false,
        subtitle: "Единый дашборд по текущим клиентам, заказам и входящим заявкам.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH, accessContext),
      }
    );
  }

  function getDashboardEntryCreatedAtMs(entry) {
    const createdAtMs = Date.parse((entry && entry.createdAt) || "");
    return Number.isFinite(createdAtMs) ? createdAtMs : 0;
  }

  function getAdminDashboardDateValue(value) {
    const date = value instanceof Date ? value : new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const values = {};
    for (const part of parts) {
      if (part.type === "literal") continue;
      values[part.type] = part.value;
    }
    return `${values.year}-${values.month}-${values.day}`;
  }

  function getAdminDashboardTodayDateValue() {
    return getAdminDashboardDateValue(new Date());
  }

  function getDashboardOrderSortValue(order) {
    const selectedDate = normalizeString(order && order.selectedDate, 32);
    const selectedTime = normalizeString(order && order.selectedTime, 32);
    const createdAt = normalizeString(order && order.createdAt, 80);
    return [
      selectedDate || "9999-99-99",
      selectedTime || "99:99",
      createdAt || "9999-99-99T99:99:99.999Z",
    ].join("|");
  }

  function renderDashboardNewRequestsTable(entries = [], options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return `<div data-admin-dashboard-new-requests="true" class="admin-alert admin-alert-info">Новых заявок пока нет.</div>`;
    }

    const managerOptions = Array.isArray(options.managerOptions) ? options.managerOptions : [];
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ROOT_PATH;

    return `<div data-admin-dashboard-new-requests="true" class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-success-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Услуга</th>
            <th>Получена</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map((entry) => {
              const dialogId = getQuoteOpsDialogId(entry.id);
              const contactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "", entry.customerEmail || ""]
                .filter(Boolean)
                .join(" • ");
              const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime);
              const serviceLabel = formatAdminServiceLabel(entry.serviceName || entry.serviceType);
              return `<tr
                class="admin-table-row-clickable"
                tabindex="0"
                data-admin-dialog-row="true"
                data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                aria-label="${escapeHtmlAttribute(`Открыть заявку ${entry.customerName || "Клиент"}`)}"
              >
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-link">${escapeHtml(entry.customerName || "Клиент")}</span>
                    <span class="admin-table-muted">${escapeHtml(entry.requestId || "Номер не указан")}</span>
                  </div>
                </td>
                <td>
                  ${contactLabel
                    ? `<div class="admin-table-cell-stack">
                        <span class="admin-line-clamp-two">${escapeHtml(contactLabel)}</span>
                      </div>`
                    : `<span class="admin-table-muted">Не указаны</span>`}
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(serviceLabel)}</span>
                    <span class="admin-table-muted">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
                    <span class="admin-table-muted">${escapeHtml(scheduleLabel || "Дата уборки не назначена")}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span>${renderQuoteOpsStatusBadge(entry.status)}</span>
                    <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(entry.fullAddress || "Адрес не указан")}</span>
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      ${entries
        .map((entry) =>
          renderQuoteOpsDetailDialog(entry, returnTo, managerOptions, {
            req: options.req,
            canEdit: options.canEdit,
            leadConnectorConfigured: options.leadConnectorConfigured,
          })
        )
        .join("")}
    </div>`;
  }

  function renderDashboardLeadTasksSection({ overdueTaskRecords = [], todayTaskRecords = [] } = {}) {
    const allTaskRecords = [...overdueTaskRecords, ...todayTaskRecords];
    if (allTaskRecords.length === 0) {
      return `<div data-admin-dashboard-tasks="true" class="admin-alert admin-alert-info">Тасков на сегодня и просроченных задач пока нет.</div>`;
    }

    return `<div data-admin-dashboard-tasks="true" class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-task-table admin-dashboard-task-table">
        <thead>
          <tr>
            <th>Таск</th>
            <th>Дедлайн</th>
            <th>Этап</th>
            <th>Менеджер</th>
            <th>Заявка</th>
          </tr>
        </thead>
        <tbody>
          ${allTaskRecords.map((taskRecord) => renderDashboardLeadTaskTableRow(taskRecord, `${ADMIN_QUOTE_OPS_PATH}?section=tasks`)).join("")}
        </tbody>
      </table>
      ${allTaskRecords.map((taskRecord) => renderQuoteOpsTaskResultDialog(taskRecord, `${ADMIN_QUOTE_OPS_PATH}?section=tasks`)).join("")}
    </div>`;
  }

  function renderDashboardLeadTaskTableRow(taskRecord, returnTo) {
    const dialogId = `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const managerLabel = taskRecord.manager.name || taskRecord.manager.email || "Без менеджера";
    const requestLabel = taskRecord.requestId || taskRecord.entry.id;
    const phoneLabel = taskRecord.entry.customerPhone
      ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone
      : "Телефон не указан";

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть таск ${taskRecord.title} для ${taskRecord.customerName}`)}"
    >
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(taskRecord.title)}</span>
          <span class="admin-table-muted">${escapeHtml(taskRecord.customerName)} • ${escapeHtml(taskRecord.serviceLabel)}</span>
        </div>
      </td>
      <td>
        <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</span>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${renderLeadStatusBadge(taskRecord.leadStatus)}
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${managerLabel ? renderAdminBadge(managerLabel, managerLabel === "Без менеджера" ? "muted" : "outline") : ""}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(requestLabel)}</span>
          <span class="admin-table-muted">${escapeHtml(phoneLabel)}</span>
        </div>
      </td>
    </tr>`;
  }

  function isDashboardOrderWithoutTeam(order) {
    const status = normalizeString(order && order.orderStatus, 40).toLowerCase();
    return Boolean(order && !order.isAssigned && status !== "completed" && status !== "canceled");
  }

  function renderDashboardOrdersWithoutTeamTable(orderRecords = [], options = {}) {
    if (!Array.isArray(orderRecords) || orderRecords.length === 0) {
      return `<div data-admin-dashboard-unassigned-orders="true" class="admin-alert admin-alert-info">Сейчас нет активных заказов без команды.</div>`;
    }

    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ROOT_PATH;
    const canDelete = options.canDelete !== false;

    return `<div data-admin-dashboard-unassigned-orders="true" class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${orderRecords
            .map((order) =>
              renderOrderTableRow(order, returnTo, {
                planningItem: planningByEntryId.get(order.id) || null,
              })
            )
            .join("")}
        </tbody>
      </table>
      ${orderRecords
        .map((order) =>
          renderOrderManagementDialog(order, returnTo, {
            req: options.req,
            planningItem: planningByEntryId.get(order.id) || null,
            staffRecords,
            canDelete,
            canEdit: options.canEdit,
            leadConnectorConfigured: options.leadConnectorConfigured,
          })
        )
        .join("")}
    </div>`;
  }

  function renderDashboardTodayOrdersTable(orderRecords = [], options = {}) {
    if (!Array.isArray(orderRecords) || orderRecords.length === 0) {
      return `<div data-admin-dashboard-today-orders="true" class="admin-alert admin-alert-info">На сегодня заказов пока нет.</div>`;
    }

    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ROOT_PATH;
    const canDelete = options.canDelete !== false;

    return `<div data-admin-dashboard-today-orders="true" class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${orderRecords
            .map((order) =>
              renderOrderTableRow(order, returnTo, {
                planningItem: planningByEntryId.get(order.id) || null,
              })
            )
            .join("")}
        </tbody>
      </table>
      ${orderRecords
        .map((order) =>
          renderOrderManagementDialog(order, returnTo, {
            req: options.req,
            planningItem: planningByEntryId.get(order.id) || null,
            staffRecords,
            canDelete,
            canEdit: options.canEdit,
            leadConnectorConfigured: options.leadConnectorConfigured,
          })
        )
        .join("")}
    </div>`;
  }

  async function renderClientsPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const { reqUrl, filters } = getAdminClientsFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const clientRecords = collectAdminClientRecords(allEntries);
    const filteredClients = filterAdminClientRecords(clientRecords, filters);
    const clientsWithEmail = clientRecords.filter((client) => Boolean(client.email)).length;
    const repeatClients = clientRecords.filter((client) => client.requestCount > 1).length;
    const hasSearchQuery = Boolean(filters.q);
    const hasAdvancedFilters = Boolean(filters.name || filters.email || filters.phone);
    const hasActiveFilters = hasSearchQuery || hasAdvancedFilters;
    const selectedClient = filters.client ? filteredClients.find((client) => client.key === filters.client) || null : null;
    const selectedClientKey = selectedClient ? selectedClient.key : "";
    const selectedAddressRecord =
      selectedClient && Array.isArray(selectedClient.addresses)
        ? selectedClient.addresses.find((addressRecord) => addressRecord.key === filters.addressKey) || selectedClient.addresses[0] || null
        : null;
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const resetHref = ADMIN_CLIENTS_PATH;
    const closeDetailHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
      q: filters.q,
      name: filters.name,
      email: filters.email,
      phone: filters.phone,
      client: "",
      addressKey: "",
    });
    const emptyStateMessage = clientRecords.length === 0
      ? "Пока клиентов нет. Как только появятся новые заявки, этот раздел заполнится автоматически."
      : "По текущим фильтрам клиентов не найдено.";
    const accessContext = getWorkspaceAccessContext(adminRuntime);

    return renderAdminLayout(
      "Клиенты",
      `${renderClientsNotice(req)}
        <div class="admin-clients-layout">
          ${renderAdminCard(
            false,
            false,
            `<div class="admin-clients-workspace" id="admin-clients-workspace">
              <form
                class="admin-clients-search-form"
                method="get"
                action="${ADMIN_CLIENTS_PATH}"
                data-admin-auto-submit="true"
                data-admin-auto-submit-delay="600"
                data-admin-auto-submit-min-length="2"
                data-admin-auto-submit-restore-focus="true"
                data-admin-auto-submit-scroll-target="#admin-clients-workspace"
                data-admin-auto-submit-scroll-offset="18"
              >
                ${renderAdminHiddenInput("name", filters.name)}
                ${renderAdminHiddenInput("email", filters.email)}
                ${renderAdminHiddenInput("phone", filters.phone)}
                <label class="admin-clients-search-box">
                  <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
                  <input
                    class="admin-input admin-clients-search-input"
                    type="search"
                    name="q"
                    value="${escapeHtmlText(filters.q)}"
                    placeholder="Поиск по имени, email или телефону"
                  >
                </label>
                <button class="admin-sr-only" type="submit">Обновить поиск</button>
                ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
              </form>
              <div class="admin-clients-meta-row">
                <div class="admin-clients-meta-main">
                  <p class="admin-clients-summary-copy">
                    Найдено ${escapeHtml(String(filteredClients.length))} из ${escapeHtml(String(clientRecords.length))} клиентов.
                    ${hasActiveFilters ? "С учётом текущего запроса." : "Показан полный список."}
                  </p>
                  <div class="admin-badge-row admin-badge-row-inline admin-clients-active-badges">
                    ${hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : ""}
                    ${filters.name ? renderAdminBadge(`Имя: ${filters.name}`, "outline") : ""}
                    ${filters.email ? renderAdminBadge(`Email: ${filters.email}`, "outline") : ""}
                    ${filters.phone ? renderAdminBadge(`Телефон: ${filters.phone}`, "outline") : ""}
                    ${repeatClients ? renderAdminBadge(`Повторные: ${repeatClients}`, "outline") : ""}
                    ${clientsWithEmail ? renderAdminBadge(`С email: ${clientsWithEmail}`, "outline") : ""}
                  </div>
                </div>
                <span class="admin-action-hint admin-clients-meta-hint">${selectedClient ? "Профиль открыт в отдельном окне." : "Клик по строке открывает профиль."}</span>
              </div>
            ${filteredClients.length > 0
              ? `<div class="admin-table-wrap admin-clients-table-wrap">
                  <table class="admin-table admin-clients-table">
                    <colgroup>
                      <col style="width:26%">
                      <col style="width:16%">
                      <col style="width:24%">
                      <col style="width:22%">
                      <col style="width:12%">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>Телефон</th>
                        <th>Адрес</th>
                        <th>Последняя заявка</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredClients
                        .map((client) => {
                          const rowPath = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
                            q: filters.q,
                            name: filters.name,
                            email: filters.email,
                            phone: filters.phone,
                            client: client.key,
                          });
                          const rowHref = rowPath;
                          const rowClassName = [
                            "admin-table-row-clickable",
                            client.key === selectedClientKey ? "admin-table-row-active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return `<tr
                            class="${rowClassName}"
                            data-admin-row-href="${escapeHtmlAttribute(rowHref)}"
                            tabindex="0"
                            role="link"
                            aria-label="${escapeHtmlAttribute(`Открыть карточку клиента ${client.name || "Клиент"}`)}"
                          >
                            <td>
                              <div class="admin-client-table-cell">
                                <span class="admin-client-avatar ${getAdminClientAvatarToneClass(client.key)}">${escapeHtml(getAdminClientAvatarInitials(client.name || client.email || client.phone || "Клиент"))}</span>
                                <div class="admin-table-stack">
                                  <a class="admin-table-link" href="${escapeHtmlAttribute(rowHref)}">${escapeHtml(client.name || "Клиент")}</a>
                                  <span class="admin-table-muted">${escapeHtml(formatClientRequestCountLabel(client.requestCount))} • ${escapeHtml(client.requestCount > 1 ? "Повторный клиент" : "Новый клиент")}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              ${client.phone
                                ? `<div class="admin-table-cell-stack">
                                    <span class="admin-table-strong">${escapeHtml(formatAdminPhoneNumber(client.phone) || client.phone)}</span>
                                  </div>`
                                : `<span class="admin-table-muted">Не указан</span>`}
                            </td>
                            <td>
                              ${renderAdminClientAddressPreview(client)}
                            </td>
                            <td>
                              <div class="admin-table-cell-stack">
                                <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(client.latestService))}</span>
                                <span class="admin-table-muted">${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</span>
                                <span>${renderAdminClientStatusBadge(client.latestStatus)}</span>
                              </div>
                            </td>
                            <td class="admin-table-number">
                              <div class="admin-table-cell-stack">
                                <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(client.totalRevenue))}</span>
                                <span class="admin-table-muted">${escapeHtml(formatClientRequestCountLabel(client.requestCount))}</span>
                              </div>
                            </td>
                          </tr>`;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
            ${selectedClient
              ? renderAdminClientDetailDialog(selectedClient, currentReturnTo, {
                  req,
                  closeHref: closeDetailHref,
                  activeAddressRecord: selectedAddressRecord,
                  planningByEntryId,
                  leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                  canEdit: accessContext.canEdit,
                })
              : ""}
            </div>`,
            { eyebrow: false, className: "admin-clients-card" }
          )}
        </div>`,
      {
        kicker: false,
        subtitle: "CRM-таблица клиентов с быстрым поиском и карточкой по клику на строку.",
        bodyScripts: renderStaffAddressAutocompleteScript(),
        sidebar: renderAdminAppSidebar(ADMIN_CLIENTS_PATH, accessContext),
      }
    );
  }

  function renderOrderStatusBadge(status) {
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "completed") return renderAdminBadge("Завершено", "success");
    if (normalized === "canceled") return renderAdminBadge("Отменено", "danger");
    if (normalized === "paid") return renderAdminBadge("Оплачено", "success");
    if (normalized === "awaiting-review") return renderAdminBadge("Ждем отзыв", "default");
    if (normalized === "invoice-sent") return renderAdminBadge("Инвойс отправлен", "outline");
    if (normalized === "rescheduled") return renderAdminBadge("Перенесено", "outline");
    if (normalized === "in-progress") return renderAdminBadge("В работе", "default");
    if (normalized === "scheduled") return renderAdminBadge("Запланировано", "outline");
    return renderAdminBadge("Новые", "muted");
  }

  function getOrderFunnelStatus(order) {
    const orderStatus = normalizeOrderStatus(order && order.orderStatus, "new");
    const policyAcceptance =
      order && order.policyAcceptance && typeof order.policyAcceptance === "object"
        ? order.policyAcceptance
        : {};
    const hasSentPolicyInvite = Boolean(
      normalizeString(policyAcceptance.sentAt, 80) ||
        normalizeString(policyAcceptance.firstViewedAt, 80) ||
        normalizeString(policyAcceptance.lastViewedAt, 80) ||
        normalizeString(policyAcceptance.signedAt, 80)
    );
    if (orderStatus === "scheduled" && hasSentPolicyInvite && !policyAcceptance.policyAccepted) {
      return "policy";
    }
    return orderStatus;
  }

  function renderOrderFunnelStatusBadge(status) {
    if (normalizeString(status, 40).toLowerCase() === "policy") {
      return renderAdminBadge("Политика", "outline");
    }
    return renderOrderStatusBadge(status);
  }

  function renderOrderPaymentStatusBadge(status) {
    const normalized = normalizeString(status, 40).toLowerCase();
    if (normalized === "paid") return renderAdminBadge("Paid", "success");
    if (normalized === "partial") return renderAdminBadge("Partial", "outline");
    return renderAdminBadge("Unpaid", "danger");
  }

  function renderOrderPaymentMethodBadge(method) {
    const normalized = normalizeString(method, 40).toLowerCase();
    if (normalized === "cash") return renderAdminBadge("Cash", "outline");
    if (normalized === "zelle") return renderAdminBadge("Zelle", "outline");
    if (normalized === "card") return renderAdminBadge("Card", "outline");
    if (normalized === "invoice") return renderAdminBadge("Invoice", "outline");
    return renderAdminBadge("Payment method not set", "muted");
  }

  function getOrderLaneMeta(status) {
    if (normalizeString(status, 40).toLowerCase() === "policy") {
      return {
        title: "Политика",
        description: "Клиенту уже отправлена ссылка по SMS или email, и сейчас ждём подписание политики.",
      };
    }
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "scheduled") {
      return {
        title: "Запланировано",
        description: "Подтверждённые заказы с назначенным окном визита.",
      };
    }
    if (normalized === "in-progress") {
      return {
        title: "В работе",
        description: "Заказы, которые уже выполняются и требуют оперативного контроля.",
      };
    }
    if (normalized === "invoice-sent") {
      return {
        title: "Инвойс отправлен",
        description: "Работа завершена, клиенту уже отправлен инвойс и ждём оплату.",
      };
    }
    if (normalized === "paid") {
      return {
        title: "Оплачено",
        description: "Инвойс оплачен, осталось дождаться отзыва или финального закрытия.",
      };
    }
    if (normalized === "awaiting-review") {
      return {
        title: "Ждем отзыв",
        description: "Оплата уже получена, теперь команда ждёт отзыв клиента по выполненной работе.",
      };
    }
    if (normalized === "completed") {
      return {
        title: "Завершено",
        description: "Выполненные заказы, которые уже можно не держать в фокусе.",
      };
    }
    if (normalized === "canceled") {
      return {
        title: "Отменено",
        description: "Отменённые заказы, оставленные для истории.",
      };
    }
    if (normalized === "rescheduled") {
      return {
        title: "Перенесено",
        description: "Заказы, где дата или время уже менялись и нужен повторный контроль.",
      };
    }
    return {
      title: "Новые",
      description: "Новые обращения, которые нужно быстро разобрать и назначить.",
    };
  }

  function renderOrdersMetric(label, value, copy, options = {}) {
    const className = options.emphasis
      ? "admin-orders-metric admin-orders-metric-emphasis"
      : "admin-orders-metric";

    return `<article class="${className}">
      <span class="admin-orders-metric-label">${escapeHtml(label)}</span>
      <strong class="admin-orders-metric-value">${escapeHtml(String(value))}</strong>
      <p class="admin-orders-metric-copy">${escapeHtml(copy)}</p>
    </article>`;
  }

  function renderOrderSnapshot(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-snapshot admin-order-snapshot-wide"
      : "admin-order-snapshot";

    return `<div class="${className}">
      <span class="admin-order-snapshot-label">${escapeHtml(label)}</span>
      <p class="admin-order-snapshot-value">${escapeHtml(value)}</p>
    </div>`;
  }

  function renderOrdersNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "order-created") {
      return `<div class="admin-alert admin-alert-info">Заказ создан из подтверждённой заявки.</div>`;
    }
    if (notice === "manual-order-created") {
      return `<div class="admin-alert admin-alert-info">Заказ добавлен вручную.</div>`;
    }
    if (notice === "order-saved") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён.</div>`;
    }
    if (notice === "order-saved-policy-email-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, письмо с подтверждением политик отправлено клиенту.</div>`;
    }
    if (notice === "order-saved-calendar-policy-email-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, письмо с подтверждением политик отправлено клиенту, но синхронизация Google Calendar не обновилась.</div>`;
    }
    if (notice === "order-saved-policy-email-unavailable") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но автоматическая отправка письма с подтверждением политик сейчас не настроена.</div>`;
    }
    if (notice === "order-saved-policy-sms-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, ссылка на подтверждение политик отправлена клиенту по SMS. Email для этого заказа не указан.</div>`;
    }
    if (notice === "order-saved-policy-email-missing-recipient") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но у клиента не указан email для письма с подтверждением политик.</div>`;
    }
    if (notice === "order-saved-policy-email-failed") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но письмо с подтверждением политик не удалось отправить.</div>`;
    }
    if (notice === "order-saved-calendar-policy-sms-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, ссылка на подтверждение политик отправлена клиенту по SMS, но синхронизация Google Calendar не обновилась.</div>`;
    }
    if (notice === "order-saved-calendar-policy-email-error") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но письмо с подтверждением политик не удалось отправить, и синхронизация Google Calendar тоже не обновилась.</div>`;
    }
    if (notice === "order-policy-resent") {
      return `<div class="admin-alert admin-alert-info">Ссылка на подтверждение политик отправлена повторно по email и SMS. Новый срок действия ссылки — 48 часов.</div>`;
    }
    if (notice === "order-policy-resent-email-only") {
      return `<div class="admin-alert admin-alert-info">Ссылка на подтверждение политик отправлена повторно по email. SMS не удалось отправить, но ссылка уже продлена ещё на 48 часов.</div>`;
    }
    if (notice === "order-policy-resent-sms-only") {
      return `<div class="admin-alert admin-alert-info">Ссылка на подтверждение политик отправлена повторно по SMS. Email у клиента не указан, ссылка уже продлена ещё на 48 часов.</div>`;
    }
    if (notice === "order-policy-resend-unavailable") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не сработала: email для policy acceptance сейчас не настроен.</div>`;
    }
    if (notice === "order-policy-resend-missing-recipient") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не сработала: у клиента не указан email.</div>`;
    }
    if (notice === "order-policy-resend-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось отправить ссылку на подтверждение политик повторно.</div>`;
    }
    if (notice === "order-policy-already-signed") {
      return `<div class="admin-alert admin-alert-info">Политика уже подписана. Повторная отправка ссылки не требуется.</div>`;
    }
    if (notice === "order-policy-reset") {
      return `<div class="admin-alert admin-alert-info">Подтверждение политик сброшено. Заказ можно отправить на подтверждение заново.</div>`;
    }
    if (notice === "order-deleted") {
      return `<div class="admin-alert admin-alert-info">Заказ удалён.</div>`;
    }
    if (notice === "order-missing") {
      return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;
    }
    if (notice === "manual-order-invalid") {
      return `<div class="admin-alert admin-alert-error">Чтобы добавить заказ вручную, заполните имя клиента, телефон и адрес.</div>`;
    }
    if (notice === "order-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить заказ. Попробуйте ещё раз.</div>`;
    }
    if (notice === "order-saved-calendar-error") {
      return `<div class="admin-alert admin-alert-error">Заказ сохранён, но синхронизация Google Calendar не обновилась. Проверьте подключение сотрудника.</div>`;
    }
    if (notice === "order-delete-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось удалить заказ. Попробуйте ещё раз.</div>`;
    }
    if (notice === "completion-saved") {
      return `<div class="admin-alert admin-alert-info">Отчёт клинера сохранён.</div>`;
    }
    if (notice === "completion-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить фото или комментарий клинера. Попробуйте ещё раз.</div>`;
    }
    if (notice === "order-sms-sent") {
      return `<div class="admin-alert admin-alert-info">SMS по заказу отправлена через Go High Level.</div>`;
    }
    if (notice === "order-sms-empty") {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой SMS.</div>`;
    }
    if (notice === "order-sms-unavailable") {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === "order-sms-contact-missing" || notice === "order-sms-failed") {
      const smsError = normalizeString(reqUrl.searchParams.get("smsError"), 240);
      return `<div class="admin-alert admin-alert-error">${escapeHtml(smsError || "Не удалось отправить SMS по заказу.")}</div>`;
    }
    return "";
  }

  function renderCreateManualOrderForm(options = {}) {
    const returnTo = buildOrdersReturnPath(options.returnTo || ADMIN_ORDERS_PATH);

    return `<form class="admin-form-grid" method="post" action="${ADMIN_ORDERS_PATH}">
      <input type="hidden" name="action" value="create-manual-order">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя клиента
          <input class="admin-input" type="text" name="customerName" placeholder="Emily Johnson" required>
        </label>
        ${renderAdminPhoneInput("customerPhone", "", {
          label: "Телефон клиента",
          placeholder: "3125550199",
          required: true,
        })}
        <label class="admin-label">
          Email
          <input class="admin-input" type="email" name="customerEmail" placeholder="client@example.com">
        </label>
        <label class="admin-label">
          Тип уборки
          <select class="admin-input" name="serviceType">
            ${renderAdminSelectOptions(ADMIN_ORDER_SERVICE_OPTIONS, "standard")}
          </select>
        </label>
        ${renderAdminPickerField({
          pickerType: "date",
          fieldId: "admin-manual-order-selected-date",
          label: "Дата уборки",
          name: "selectedDate",
          displayValue: "",
          nativeValue: "",
          placeholder: "04/15/2026",
          pickerLabel: "Выбрать дату уборки",
        })}
        ${renderAdminPickerField({
          pickerType: "time",
          fieldId: "admin-manual-order-selected-time",
          label: "Время уборки",
          name: "selectedTime",
          displayValue: "",
          nativeValue: "",
          placeholder: "1:30 PM",
          pickerLabel: "Выбрать время уборки",
        })}
        <label class="admin-label">
          Повторяемость
          <select class="admin-input" name="frequency">
            ${renderAdminSelectOptions(ADMIN_ORDER_FREQUENCY_OPTIONS, "", "Not set")}
          </select>
        </label>
        <label class="admin-label">
          Сумма заказа
          <input class="admin-input" type="text" name="totalPrice" inputmode="decimal" placeholder="240.00">
        </label>
      </div>
      ${renderStaffAddressField({
        id: "admin-manual-order-address",
        name: "fullAddress",
        placeholder: "215 North Elm Street, Naperville, IL 60563",
        required: true,
      })}
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Создать заказ</button>
        <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${ADMIN_MANUAL_ORDER_DIALOG_ID}">Отмена</button>
      </div>
      <p class="admin-helper-copy">Используйте форму для заказов, которые пришли не через заявку на сайте.</p>
    </form>`;
  }

  function renderCreateManualOrderDialog(options = {}) {
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

    return `<dialog class="admin-dialog admin-dialog-wide" id="${ADMIN_MANUAL_ORDER_DIALOG_ID}"${autoOpenAttr} aria-labelledby="admin-manual-order-create-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Заказы</p>
            <h2 class="admin-dialog-title" id="admin-manual-order-create-title">Добавить заказ вручную</h2>
            <p class="admin-dialog-copy">Создайте заказ сразу в рабочей таблице, если он пришёл не через заявку.</p>
          </div>
          ${renderAdminDialogCloseButton(ADMIN_MANUAL_ORDER_DIALOG_ID)}
        </div>
        ${renderCreateManualOrderForm(options)}
      </div>
    </dialog>`;
  }

  function getOrderDialogId(orderId) {
    const normalized = normalizeString(orderId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-order-detail-dialog-${safeSuffix || "record"}`;
  }

  function getOrderAssignedLabel(order, planningItem) {
    const planningTeamLabel =
      planningItem && planningItem.assignedStaff.length > 0
        ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
        : "";
    return planningTeamLabel || order.assignedStaff || "Не назначен";
  }

  function parseOrderAssignedStaffNames(value, maxItems = 8) {
    const rawItems = Array.isArray(value) ? value : String(value || "").split(",");
    const seen = new Set();
    const output = [];

    for (const item of rawItems) {
      const normalized = normalizeString(item, 120);
      if (!normalized || seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      output.push(normalized);
      if (output.length >= maxItems) break;
    }

    return output;
  }

  function getOrderResponsibleOptions(order, staffRecords = [], planningItem = null) {
    const assignedValues = [
      ...parseOrderAssignedStaffNames(order && order.assignedStaff),
      ...parseOrderAssignedStaffNames(
        planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
          : []
      ),
    ];
    const optionMap = new Map();

    for (const record of Array.isArray(staffRecords) ? staffRecords : []) {
      const name = normalizeString(record && record.name, 120);
      if (!name) continue;
      const status = normalizeString(record && record.status, 40).toLowerCase();
      if (status === "active" || assignedValues.includes(name)) {
        optionMap.set(name.toLowerCase(), name);
      }
    }

    for (const value of assignedValues) {
      optionMap.set(value.toLowerCase(), value);
    }

    return Array.from(optionMap.values()).sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  }

  function formatOrderAssignedStaffSummary(values = [], options = {}) {
    const emptyLabel = normalizeString(options.emptyLabel, 120) || "Не назначен";
    const preferCount = options.preferCount === true;
    const maxVisible = Number.isFinite(options.maxVisible)
      ? Math.max(1, Math.min(4, Math.floor(options.maxVisible)))
      : 2;
    const normalizedValues = Array.isArray(values)
      ? values.map((value) => normalizeString(value, 120)).filter(Boolean)
      : [];

    if (normalizedValues.length === 0) return emptyLabel;
    if (normalizedValues.length === 1) return normalizedValues[0];
    if (preferCount) return formatStaffCountLabel(normalizedValues.length);
    if (normalizedValues.length <= maxVisible) return normalizedValues.join(", ");

    const hiddenCount = normalizedValues.length - maxVisible;
    return `${normalizedValues.slice(0, maxVisible).join(", ")} +${hiddenCount}`;
  }

  function renderOrderResponsibleSelect(order, options = {}) {
    const planningItem = options.planningItem || null;
    const selectableStaff = getOrderResponsibleOptions(order, options.staffRecords || [], planningItem);
    const selectedValues = parseOrderAssignedStaffNames(
      order && order.assignedStaff
        ? order.assignedStaff
        : planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
          : []
    );
    const selectedLookup = new Set(selectedValues.map((value) => value.toLowerCase()));
    const selectedLabel = formatOrderAssignedStaffSummary(selectedValues, {
      emptyLabel: "Не назначен",
      preferCount: true,
    });
    const optionsMarkup =
      selectableStaff.length > 0
        ? selectableStaff
            .map((staffName) => `<label class="admin-order-multiselect-option">
              <input class="admin-order-multiselect-checkbox" type="checkbox" name="assignedStaff" value="${escapeHtmlAttribute(staffName)}"${selectedLookup.has(staffName.toLowerCase()) ? " checked" : ""}>
              <span>${escapeHtml(staffName)}</span>
            </label>`)
            .join("")
        : `<div class="admin-order-multiselect-empty">Добавьте активных сотрудников в разделе staff, чтобы переназначить заказ.</div>`;

    return `<details
      class="admin-order-multiselect"
      data-admin-order-multiselect="true"
      data-admin-order-multiselect-empty-label="Не назначен"
      data-admin-order-multiselect-max-visible="2"
    >
      <summary class="admin-input admin-order-multiselect-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="admin-order-multiselect-value">${escapeHtml(selectedLabel)}</span>
        <span class="admin-order-multiselect-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M5.25 7.5 10 12.25 14.75 7.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
          </svg>
        </span>
      </summary>
      <div class="admin-order-multiselect-panel" role="listbox" aria-multiselectable="true">
        <input type="hidden" name="assignedStaff" value="">
        <div class="admin-order-multiselect-list">
          ${optionsMarkup}
        </div>
      </div>
    </details>`;
  }

  function getOrderQuoteData(order) {
    const payload =
      order && order.entry && order.entry.payloadForRetry && typeof order.entry.payloadForRetry === "object"
        ? order.entry.payloadForRetry
        : {};
    return payload.calculatorData && typeof payload.calculatorData === "object" ? payload.calculatorData : {};
  }

  function getOrderCompletionData(order) {
    const payload =
      order && order.entry && order.entry.payloadForRetry && typeof order.entry.payloadForRetry === "object"
        ? order.entry.payloadForRetry
        : {};
    const adminOrder =
      payload && payload.adminOrder && typeof payload.adminOrder === "object"
        ? payload.adminOrder
        : {};
    const completion =
      adminOrder && adminOrder.completion && typeof adminOrder.completion === "object"
        ? adminOrder.completion
        : {};

    function normalizeAssets(value = [], kind = "before") {
      const items = Array.isArray(value) ? value : [];
      const output = [];
      const seen = new Set();

      for (const asset of items) {
        if (!asset || typeof asset !== "object") continue;
        const assetId = normalizeString(asset.id, 180);
        if (!assetId || seen.has(assetId)) continue;
        seen.add(assetId);
        output.push({
          id: assetId,
          kind,
          fileName: normalizeString(asset.fileName, 180) || assetId,
          uploadedAt: normalizeString(asset.uploadedAt, 80),
          sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
        });
      }

      return output;
    }

    return {
      cleanerComment: normalizeString(completion.cleanerComment, 4000),
      beforePhotos: normalizeAssets(completion.beforePhotos, "before"),
      afterPhotos: normalizeAssets(completion.afterPhotos, "after"),
      updatedAt: normalizeString(completion.updatedAt, 80),
    };
  }

  function normalizeOrderQuoteToken(value) {
    return normalizeString(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normalizeOrderQuoteList(value) {
    const source = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];

    return source
      .map((entry) => normalizeString(entry, 120))
      .filter(Boolean);
  }

  function formatOrderQuoteText(value, emptyLabel = "Не указано", maxLength = 500) {
    const normalized = normalizeString(value, maxLength);
    return normalized || emptyLabel;
  }

  function formatOrderQuoteDateValue(value, emptyLabel = "Не указана") {
    const formatted = formatAdminCalendarDate(value);
    return formatted === "Не указано" ? emptyLabel : formatted;
  }

  function formatOrderQuoteTimeValue(value, emptyLabel = "Не указано") {
    const formatted = formatAdminClockTime(value);
    return formatted === "Не указано" ? emptyLabel : formatted;
  }

  function formatOrderQuoteRequestedSlot(formattedValue, dateValue, timeValue) {
    const scheduleLabel = buildFormattedScheduleLabel(dateValue, timeValue);
    if (scheduleLabel) return scheduleLabel;

    const normalized = normalizeString(formattedValue, 120);
    if (!normalized) return "Не указано";

    const parsedDate = new Date(normalized.replace(/\s+at\s+/i, " "));
    if (!Number.isNaN(parsedDate.getTime())) {
      return formatAdminDateTime(parsedDate);
    }

    return normalized;
  }

  function buildFormattedScheduleLabel(dateValue, timeValue) {
    const formattedDate = formatAdminCalendarDate(dateValue);
    const formattedTime = formatAdminClockTime(timeValue);
    const hasDate = formattedDate && formattedDate !== "Не указано";
    const hasTime = formattedTime && formattedTime !== "Не указано";

    if (hasDate && hasTime) return `${formattedDate}, ${formattedTime}`;
    if (hasDate) return formattedDate;
    if (hasTime) return formattedTime;
    return "";
  }

  function formatOrderQuoteBoolean(value, emptyLabel = "Не указано") {
    if (value === true || value === false) return value ? "Да" : "Нет";
    const normalized = normalizeString(value, 64);
    if (!normalized) return emptyLabel;
    const compact = normalized.toLowerCase();
    if (["yes", "true", "1", "on"].includes(compact)) return "Да";
    if (["no", "false", "0", "off"].includes(compact)) return "Нет";
    return normalized;
  }

  function formatOrderQuoteServiceType(value, fallback = "Не указано") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    if (!normalized) return fallback;
    if (normalized === "regular" || normalized === "standard") return "Standard";
    if (normalized === "deep") return "Deep";
    if (["moving", "move-in/out", "move-in-out", "moveout", "moveinout"].includes(normalized)) {
      return "Move-in/out";
    }
    return normalizeString(value, 80) || fallback;
  }

  function formatOrderQuoteFrequency(value, fallback = "Not set") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (!normalized) return fallback;
    if (normalized === "weekly") return "Weekly";
    if (normalized === "monthly") return "Monthly";
    if (normalized === "biweekly") return "Bi-weekly";
    return normalizeString(value, 80) || fallback;
  }

  function formatOrderQuoteSquareFootage(value) {
    const normalized = normalizeString(value, 32);
    if (!normalized) return "Не указано";
    const numeric = Number(normalized.replace(",", "."));
    if (Number.isFinite(numeric)) {
      const mapped = ORDER_QUOTE_SQUARE_FOOTAGE_LABELS[String(Math.round(numeric))];
      if (mapped) return mapped;
      return `${Math.round(numeric)} sq ft`;
    }
    return normalized;
  }

  function getOrderQuoteSelectedServices(quoteData = {}) {
    const selected = new Set();
    for (const source of [quoteData.services, quoteData.addOns, quoteData.extras]) {
      for (const item of normalizeOrderQuoteList(source)) {
        const normalizedKey = normalizeOrderQuoteToken(item);
        const serviceKey = ORDER_QUOTE_SERVICE_ALIASES[normalizedKey] || item;
        const label = ORDER_QUOTE_SERVICE_LABELS[serviceKey];
        selected.add(label || item);
      }
    }
    return Array.from(selected);
  }

  function getOrderQuoteQuantityValue(quoteData = {}, key) {
    const quantityServices =
      quoteData && quoteData.quantityServices && typeof quoteData.quantityServices === "object"
        ? quoteData.quantityServices
        : {};
    const rawValue = quantityServices[key];
    if (rawValue === 0 || rawValue === "0") return "0";
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue >= 0) return String(Math.round(numericValue));
    return formatOrderQuoteText(rawValue, "0", 32);
  }

  function formatOrderQuoteMultiline(value, emptyLabel = "Не указано") {
    const normalized = String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!normalized) return escapeHtml(emptyLabel);
    return escapeHtml(normalized).replace(/\n/g, "<br>");
  }

  function buildOrderMediaPath(orderId, assetId) {
    return `${ADMIN_ORDERS_PATH}?media=1&entryId=${encodeURIComponent(orderId)}&asset=${encodeURIComponent(assetId)}`;
  }

  function formatOrderMediaCountLabel(count, emptyLabel) {
    const normalized = Math.max(0, Number(count) || 0);
    if (normalized === 0) return emptyLabel;
    if (normalized === 1) return "1 файл";
    if (normalized >= 2 && normalized <= 4) return `${normalized} файла`;
    return `${normalized} файлов`;
  }

  function renderOrderMediaGallery(title, emptyLabel, orderId, assets = [], kind = "") {
    const items = Array.isArray(assets) ? assets : [];
    return `<article class="admin-order-media-panel">
      <div class="admin-subsection-head admin-order-media-head">
        <div>
          <h4 class="admin-subsection-title">${escapeHtml(title)}</h4>
          <p class="admin-order-media-copy" data-admin-order-media-copy>${escapeHtml(formatOrderMediaCountLabel(items.length, emptyLabel))}</p>
        </div>
      </div>
      <div
        class="admin-order-media-body"
        data-admin-order-media-body
        data-admin-order-media-kind="${escapeHtmlAttribute(kind)}"
        data-admin-order-media-title="${escapeHtmlAttribute(title)}"
        data-admin-order-media-empty-label="${escapeHtmlAttribute(emptyLabel)}"
      >
        ${items.length > 0
          ? `<div class="admin-order-media-grid">
              ${items
                .map((asset, index) => {
                  const mediaPath = buildOrderMediaPath(orderId, asset.id);
                  return `<a class="admin-order-media-card" href="${escapeHtmlAttribute(mediaPath)}" target="_blank" rel="noreferrer">
                    <img class="admin-order-media-thumb" src="${escapeHtmlAttribute(mediaPath)}" alt="${escapeHtmlAttribute(`${title} ${index + 1}`)}" loading="lazy">
                    <span class="admin-order-media-caption">${escapeHtml(asset.fileName || `${title} ${index + 1}`)}</span>
                  </a>`;
                })
                .join("")}
            </div>`
          : `<div class="admin-order-media-empty">${escapeHtml(emptyLabel)}</div>`}
      </div>
    </article>`;
  }

  function renderOrderQuoteField(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-quote-field admin-order-quote-field-wide"
      : "admin-order-quote-field";
    const content = options.raw ? value : escapeHtml(value);

    return `<div class="${className}">
      <span class="admin-order-quote-field-label">${escapeHtml(label)}</span>
      <p class="admin-order-quote-field-value">${content}</p>
    </div>`;
  }

  function renderOrderDetailCard(title, body, options = {}) {
    const className = options.wide
      ? "admin-order-detail-card admin-order-detail-card-wide"
      : "admin-order-detail-card";
    return `<article class="${className}">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">${escapeHtml(title)}</h4>
        ${options.hint ? `<span class="admin-action-hint">${escapeHtml(options.hint)}</span>` : ""}
      </div>
      ${options.description ? `<p class="admin-card-copy admin-order-detail-copy">${escapeHtml(options.description)}</p>` : ""}
      ${body}
    </article>`;
  }

  function renderOrderPropertyCard(title, rows = [], options = {}) {
    return renderOrderDetailCard(title, renderAdminPropertyList(rows), options);
  }

  function renderOrderBriefCard(title, body, options = {}) {
    const className = options.wide
      ? "admin-order-brief-card admin-order-brief-card-wide"
      : "admin-order-brief-card";
    return `<article class="${className}">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">${escapeHtml(title)}</h4>
        ${options.hint ? `<span class="admin-action-hint">${escapeHtml(options.hint)}</span>` : ""}
      </div>
      ${options.description ? `<p class="admin-card-copy admin-order-brief-copy">${escapeHtml(options.description)}</p>` : ""}
      ${body}
    </article>`;
  }

  function renderOrderBriefFact(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-brief-fact admin-order-brief-fact-wide"
      : "admin-order-brief-fact";
    const content = options.raw ? value : escapeHtml(value);

    return `<div class="${className}">
      <span class="admin-order-brief-fact-label">${escapeHtml(label)}</span>
      <p class="admin-order-brief-fact-value">${content}</p>
    </div>`;
  }

  function renderOrderPolicyAcceptancePanel(order, options = {}) {
    const policy = order && order.policyAcceptance ? order.policyAcceptance : null;
    const hasPolicyRecord = Boolean(
      policy && (policy.acceptanceId || policy.envelopeId || policy.sentAt || policy.signedAt)
    );
    const accepted = Boolean(policy && policy.policyAccepted);
    const policyActionAllowed =
      order &&
      order.orderStatus !== "new" &&
      order.orderStatus !== "canceled";
    const canResend = options.canEdit !== false && !accepted && policyActionAllowed;
    const canReset = options.canEdit !== false && hasPolicyRecord;
    const resendLabel = hasPolicyRecord ? "Отправить ещё раз" : "Отправить ссылку";
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ORDERS_PATH;
    const certificateUrl =
      accepted && policy && policy.certificateFile
        ? `${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/${encodeURIComponent(order.id)}/certificate`
        : "";

    if (!hasPolicyRecord) {
      return `<section class="admin-order-section-card">
        <div class="admin-subsection-head">
          <div>
            <h3 class="admin-subsection-title">Подтверждение политик</h3>
            <p class="admin-order-detail-copy">После перехода заказа в статус Scheduled клиенту автоматически уйдёт ссылка на подтверждение Terms of Service и Payment & Cancellation Policy.</p>
          </div>
        </div>
        <p class="admin-order-summary-ok">Письмо ещё не отправлялось.</p>
        ${canResend
          ? `<div class="admin-inline-actions admin-form-actions">
              <form method="post" action="${ADMIN_ORDERS_PATH}">
                <input type="hidden" name="action" value="resend-order-policy">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <button class="admin-button admin-button-secondary" type="submit">${resendLabel}</button>
              </form>
              <span class="admin-action-hint">Отправим ссылку по доступным каналам связи, а ссылка будет активна ещё 48 часов.</span>
            </div>`
          : ""}
      </section>`;
    }

    const statusBadge = accepted
      ? renderAdminBadge("Подписано", "success")
      : policy.lastError
        ? renderAdminBadge("Ошибка отправки", "danger")
        : renderAdminBadge("Политика не подписана", "danger");
    const sentLabel = policy.sentAt ? formatAdminDateTime(policy.sentAt) : "Не отправлено";
    const viewedLabel = policy.firstViewedAt
      ? formatAdminDateTime(policy.firstViewedAt)
      : policy.lastViewedAt
        ? formatAdminDateTime(policy.lastViewedAt)
        : "Ещё не открыто";
    const signedLabel = policy.signedAt ? formatAdminDateTime(policy.signedAt) : "Ещё не подписано";
    const expiresLabel = policy.expiresAt ? formatAdminDateTime(policy.expiresAt) : "Не указано";

    return `<section class="admin-order-section-card">
      <div class="admin-subsection-head">
        <div>
          <h3 class="admin-subsection-title">Подтверждение политик</h3>
          <p class="admin-order-detail-copy">Живой статус ссылки на policy acceptance и итоговый сертификат клиента.</p>
        </div>
        ${statusBadge}
      </div>
      <div class="admin-order-brief-fact-grid">
        ${renderOrderBriefFact("Отправлено", sentLabel)}
        ${renderOrderBriefFact("Открыто", viewedLabel)}
        ${renderOrderBriefFact("Подписано", signedLabel)}
        ${renderOrderBriefFact("Срок ссылки", expiresLabel)}
      </div>
      ${policy.lastError
        ? `<div class="admin-alert admin-alert-error">${escapeHtml(policy.lastError)}</div>`
        : ""}
      ${certificateUrl || canResend || canReset
        ? `<div class="admin-inline-actions admin-form-actions">
            ${certificateUrl
              ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(certificateUrl)}" target="_blank" rel="noreferrer">Открыть сертификат PDF</a>`
              : ""}
            ${canResend
              ? `<form method="post" action="${ADMIN_ORDERS_PATH}">
                  <input type="hidden" name="action" value="resend-order-policy">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button class="admin-button admin-button-secondary" type="submit">${resendLabel}</button>
                </form>`
              : ""}
            ${canReset
              ? `<form method="post" action="${ADMIN_ORDERS_PATH}">
                  <input type="hidden" name="action" value="reset-order-policy">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button
                    class="admin-button admin-button-secondary"
                    type="submit"
                    onclick="return window.confirm('Сбросить подтверждение политик для этого заказа?');"
                  >Сбросить подтверждение</button>
                </form>`
              : ""}
            ${canResend ? `<span class="admin-action-hint">Повторная отправка продлит ссылку ещё на 48 часов и заново отправит ссылку по доступным каналам связи.</span>` : ""}
            ${canReset ? `<span class="admin-action-hint">Сброс удалит текущую ссылку, подпись и статус сертификата, после чего подтверждение можно пройти заново.</span>` : ""}
          </div>`
        : ""}
    </section>`;
  }

  function renderOrderServicePills(items = [], emptyLabel = "Дополнительные add-ons не выбраны.") {
    if (!Array.isArray(items) || items.length === 0) {
      return `<p class="admin-order-service-empty">${escapeHtml(emptyLabel)}</p>`;
    }

    return `<div class="admin-order-service-pills">
      ${items.map((item) => `<span class="admin-order-service-pill">${escapeHtml(item)}</span>`).join("")}
    </div>`;
  }

  function renderOrderSummaryCard(label, value, options = {}) {
    const toneClass = options.tone ? ` admin-order-summary-card-${escapeHtmlAttribute(options.tone)}` : "";
    const sizeClass = options.compact ? " admin-order-summary-card-compact" : "";
    const customClass = options.className ? ` ${escapeHtmlAttribute(options.className)}` : "";
    const valueMarkup = options.raw ? value : escapeHtml(value);
    return `<article class="admin-client-metric-card admin-order-summary-card${toneClass}${sizeClass}${customClass}">
      <div class="admin-order-summary-card-head">
        <span class="admin-client-metric-label">${escapeHtml(label)}</span>
        ${options.actions || ""}
      </div>
      <p class="admin-client-metric-value admin-order-summary-card-value">${valueMarkup}</p>
      ${options.note ? `<p class="admin-order-summary-card-note">${options.rawNote ? options.note : escapeHtml(options.note)}</p>` : ""}
      ${options.editor || ""}
    </article>`;
  }

  function renderOrderTableRow(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const dialogId = getOrderDialogId(order.id);
    const customerPhoneLabel = formatAdminPhoneNumber(order.customerPhone);
    const contactCell = [customerPhoneLabel, order.customerEmail].filter(Boolean);
    const scheduleNote = order.hasSchedule ? "Визит назначен" : "Нужно назначить";

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть карточку заказа ${order.customerName || "Клиент"}`)}"
    >
      <td>
        <div class="admin-client-table-cell">
          <span class="admin-client-avatar ${getAdminClientAvatarToneClass(order.customerName || order.requestId || order.id)}">${escapeHtml(getAdminClientAvatarInitials(order.customerName || order.requestId || "Заказ"))}</span>
          <div class="admin-table-stack">
            <span class="admin-table-link">${escapeHtml(order.customerName || "Клиент")}</span>
            <span class="admin-table-muted">${escapeHtml(order.requestId || "Номер не указан")} • ${escapeHtml(order.serviceLabel)}</span>
            <div class="admin-inline-badge-row">
              ${order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : ""}
              ${order.needsAttention ? renderAdminBadge("Нужно проверить", "danger") : ""}
            </div>
          </div>
        </div>
      </td>
      <td>
        ${contactCell.length > 0
          ? `<div class="admin-table-cell-stack">
              ${customerPhoneLabel ? `<span class="admin-table-strong">${escapeHtml(customerPhoneLabel)}</span>` : ""}
              ${order.customerEmail ? `<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(order.customerEmail)}</span>` : ""}
            </div>`
          : `<span class="admin-table-muted">Не указаны</span>`}
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(order.scheduleLabel)}</span>
          <span class="admin-table-muted">${escapeHtml(scheduleNote)}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(assignedLabel)}</span>
          ${!order.isAssigned ? `<span>${renderAdminBadge("Команда не назначена", "danger")}</span>` : ""}
        </div>
      </td>
      <td>
        <div class="admin-orders-status-stack">
          <div class="admin-inline-badge-row">
            ${renderOrderStatusBadge(order.orderStatus)}
            ${renderOrderPaymentStatusBadge(order.paymentStatus)}
            ${order.needsAttention ? renderQuoteOpsStatusBadge(order.crmStatus) : ""}
          </div>
          ${order.needsAttention ? `<span class="admin-table-muted">Есть вопрос по CRM</span>` : ""}
        </div>
      </td>
      <td>
        ${order.fullAddress
          ? `<div class="admin-table-cell-stack">
              <span class="admin-line-clamp-two">${escapeHtml(order.fullAddress)}</span>
            </div>`
          : `<span class="admin-table-muted">Не указан</span>`}
      </td>
      <td class="admin-table-number">
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(order.totalPrice))}</span>
          <span class="admin-table-muted">${escapeHtml(order.paymentMethodLabel)}</span>
        </div>
      </td>
    </tr>`;
  }

  function renderOrderManagementDialog(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const canDelete = options.canDelete !== false;
    const dialogId = getOrderDialogId(order.id);
    const editFormId = `${dialogId}-edit-form`;
    const amountFormId = `${dialogId}-amount-form`;
    const amountEditPanelId = `${dialogId}-amount-edit-panel`;
    const paymentFormId = `${dialogId}-payment-form`;
    const paymentEditPanelId = `${dialogId}-payment-edit-panel`;
    const teamFormId = `${dialogId}-team-form`;
    const teamEditPanelId = `${dialogId}-team-edit-panel`;
    const dialogReturnTo = buildAdminRedirectPath(returnTo, {
      amountEditor: "",
    });
    const detailReturnTo = buildAdminRedirectPath(dialogReturnTo, {
      order: order.id,
    });
    const autoOpenAmountEditor = options.autoOpenAmountEditor === true;
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";
    const closeHref = options.closeHref || "";
    const titleLabel = order.customerName || "Карточка заказа";
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const assignedSummaryLabel = formatOrderAssignedStaffSummary(
      parseOrderAssignedStaffNames(assignedLabel),
      {
        emptyLabel: "Не назначен",
        preferCount: true,
      }
    );
    const createdLabel = formatAdminDateTime(order.createdAt);
    const phoneLabel = formatAdminPhoneNumber(order.customerPhone) || "Телефон не указан";
    const emailLabel = order.customerEmail || "E-mail не указан";
    const contactLabel = [phoneLabel, emailLabel].filter(Boolean).join(" • ");
    const scheduleLabel = order.scheduleLabel || "Дата не указана";
    const quoteData = getOrderQuoteData(order);
    const completionData = getOrderCompletionData(order);
    const selectedServices = getOrderQuoteSelectedServices(quoteData);
    const quoteAddressLabel = formatOrderQuoteText(quoteData.address, "Не указан", 500);
    const quoteFullAddressLabel = formatOrderQuoteText(
      quoteData.fullAddress || order.fullAddress,
      "Не указан",
      500
    );
    const orderHeaderAddress =
      quoteFullAddressLabel !== "Не указан" ? quoteFullAddressLabel : order.fullAddress || "Адрес не указан";
    const orderStatusBadgeMarkup = renderOrderStatusBadge(order.orderStatus);
    const policyNeedsSignature =
      order.orderStatus !== "new" &&
      order.orderStatus !== "canceled" &&
      !Boolean(order.policyAccepted);
    const summaryStripBadges = [
      renderAdminBadge(order.serviceLabel, "outline"),
      order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : "",
      order.requestId ? renderAdminBadge(`Request ${order.requestId}`, "outline") : "",
      policyNeedsSignature ? renderAdminBadge("Политика не подписана", "danger") : "",
      !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
        ? renderAdminBadge("Нужно назначить дату", "danger")
        : "",
      !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
        ? renderAdminBadge("Команда не назначена", "danger")
        : "",
      order.needsAttention ? renderAdminBadge("Есть вопрос по CRM", "danger") : "",
    ]
      .filter(Boolean)
      .join("");
    const serviceTypeLabel = formatOrderQuoteServiceType(quoteData.serviceType, order.serviceLabel);
    const frequencyLabel = formatOrderQuoteFrequency(quoteData.frequency, order.frequencyLabel);
    const requestedSlotLabel = formatOrderQuoteRequestedSlot(
      quoteData.formattedDateTime,
      quoteData.selectedDate || order.selectedDate,
      quoteData.selectedTime || order.selectedTime
    );
    const consentLabel = formatOrderQuoteBoolean(quoteData.consent);
    const roomsLabel = formatOrderQuoteText(quoteData.rooms, "Не указано", 32);
    const bathroomsLabel = formatOrderQuoteText(quoteData.bathrooms, "Не указано", 32);
    const squareFootageLabel = formatOrderQuoteSquareFootage(quoteData.squareMeters);
    const petsLabel = formatOrderQuoteBoolean(quoteData.hasPets);
    const basementLabel = formatOrderQuoteBoolean(quoteData.basementCleaning);
    const addressLine2Label = formatOrderQuoteText(quoteData.addressLine2, "Не указано", 200);
    const cityLabel = formatOrderQuoteText(quoteData.city, "Не указано", 120);
    const stateLabel = formatOrderQuoteText(quoteData.state, "Не указано", 32);
    const zipLabel = formatOrderQuoteText(quoteData.zipCode, "Не указано", 32);
    const customerCommentMarkup = formatOrderQuoteMultiline(quoteData.additionalDetails);
    const visitCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Что запросил клиент</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${renderOrderQuoteField("Тип уборки", serviceTypeLabel)}
        ${renderOrderQuoteField("Повторяемость", frequencyLabel)}
        ${renderOrderQuoteField("Запрошенный слот", requestedSlotLabel, { wide: true })}
        ${renderOrderQuoteField("Согласие", consentLabel)}
      </div>
    </article>`;
    const homeCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Дом и условия</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${renderOrderQuoteField("Спальни", roomsLabel)}
        ${renderOrderQuoteField("Санузлы", bathroomsLabel)}
        ${renderOrderQuoteField("Размер дома", squareFootageLabel)}
        ${renderOrderQuoteField("Питомцы", petsLabel)}
        ${renderOrderQuoteField("Basement cleaning", basementLabel)}
      </div>
    </article>`;
    const servicesCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Дополнительные услуги</h4>
      </div>
      <div class="admin-order-quote-fields admin-order-quote-fields-services">
        ${renderOrderQuoteField(
          "Выбранные add-ons",
          selectedServices.length > 0 ? selectedServices.join(", ") : "Не выбраны",
          { wide: true }
        )}
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField(
            ORDER_QUOTE_QUANTITY_LABELS.interiorWindowsCleaning,
            getOrderQuoteQuantityValue(quoteData, "interiorWindowsCleaning")
          )}
          ${renderOrderQuoteField(
            ORDER_QUOTE_QUANTITY_LABELS.blindsCleaning,
            getOrderQuoteQuantityValue(quoteData, "blindsCleaning")
          )}
          ${renderOrderQuoteField(
            ORDER_QUOTE_QUANTITY_LABELS.bedLinenChange,
            getOrderQuoteQuantityValue(quoteData, "bedLinenChange")
          )}
        </div>
      </div>
    </article>`;
    const addressFields = [
      quoteAddressLabel !== "Не указан" && quoteAddressLabel !== quoteFullAddressLabel
        ? renderOrderQuoteField("Короткий адрес", quoteAddressLabel, { wide: true })
        : "",
      renderOrderQuoteField("Apt / suite", addressLine2Label),
      renderOrderQuoteField("Город", cityLabel),
      renderOrderQuoteField("Штат", stateLabel),
      renderOrderQuoteField("ZIP", zipLabel),
    ]
      .filter(Boolean)
      .join("");
    const addressCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Адрес из формы</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${addressFields}
      </div>
    </article>`;
    const customerCommentCardMarkup = `<article class="admin-order-quote-card admin-order-quote-card-wide">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Комментарий клиента</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${renderOrderQuoteField("Комментарий клиента", customerCommentMarkup, { raw: true, wide: true })}
      </div>
    </article>`;
    const quoteCards = [
      visitCardMarkup,
      homeCardMarkup,
      servicesCardMarkup,
      addressCardMarkup,
      customerCommentCardMarkup,
    ].join("");
    const completionUpdatedAtLabel = completionData.updatedAt ? formatAdminDateTime(completionData.updatedAt) : "";
    const cleanerReportSection = `<section class="admin-order-section-card admin-order-cleaner-section">
      <div class="admin-subsection-head">
        <div>
          <h3 class="admin-subsection-title">Отчёт клинера</h3>
          <p class="admin-order-detail-copy">После выполнения заказа сюда загружаются все фото до, все фото после и комментарий клинера.</p>
        </div>
        <span
          class="admin-action-hint${completionUpdatedAtLabel ? "" : " admin-action-hint-hidden"}"
          data-admin-order-completion-updated-at
        >${completionUpdatedAtLabel ? `Обновлено ${escapeHtml(completionUpdatedAtLabel)}` : ""}</span>
      </div>
      <div class="admin-order-media-stack">
        <div class="admin-order-media-layout">
          ${renderOrderMediaGallery("Фото до", "Фото до ещё не загружены.", order.id, completionData.beforePhotos, "before")}
          ${renderOrderMediaGallery("Фото после", "Фото после ещё не загружены.", order.id, completionData.afterPhotos, "after")}
        </div>
        <div
          class="admin-form-grid admin-order-completion-panel"
          data-admin-order-completion-panel="true"
          data-admin-order-completion-entry-id="${escapeHtmlAttribute(order.id)}"
          data-admin-order-completion-return-to="${escapeHtmlAttribute(dialogReturnTo)}"
          data-admin-order-completion-action="${escapeHtmlAttribute(ADMIN_ORDERS_PATH)}"
        >
          <div class="admin-order-completion-grid">
            <label class="admin-label">
              Фото до
              <input class="admin-input admin-file-input" type="file" name="beforePhotos" accept="image/*" multiple>
              <span class="admin-input-help">Можно выбрать сразу весь набор фотографий до начала уборки.</span>
            </label>
            <label class="admin-label">
              Фото после
              <input class="admin-input admin-file-input" type="file" name="afterPhotos" accept="image/*" multiple>
              <span class="admin-input-help">Можно выбрать сразу весь набор фотографий после завершения заказа.</span>
            </label>
          </div>
          <div class="admin-inline-actions admin-form-actions">
            <button class="admin-button admin-button-secondary" type="button" data-admin-order-completion-submit>Сохранить фото</button>
            <span class="admin-action-hint">Если загрузить новые фото в одном из блоков, текущий набор в этом блоке заменится.</span>
          </div>
          <div class="admin-alert admin-alert-info admin-order-completion-feedback" data-admin-order-completion-feedback hidden></div>
        </div>
        <div
          class="admin-form-grid admin-order-cleaner-comment-form"
          data-admin-order-cleaner-comment-panel="true"
          data-admin-order-cleaner-comment-entry-id="${escapeHtmlAttribute(order.id)}"
          data-admin-order-cleaner-comment-return-to="${escapeHtmlAttribute(dialogReturnTo)}"
          data-admin-order-cleaner-comment-action="${escapeHtmlAttribute(ADMIN_ORDERS_PATH)}"
        >
          <label class="admin-label">
            Комментарий клинера
            <textarea class="admin-input admin-order-comment-field" name="cleanerComment" rows="5" placeholder="Что важно знать по этому заказу: результат, сложные зоны, материалы, доступ, нюансы...">${escapeHtml(completionData.cleanerComment)}</textarea>
          </label>
          <p class="admin-field-note" data-admin-async-feedback hidden></p>
          <div class="admin-inline-actions admin-form-actions">
            <button class="admin-button admin-button-secondary" type="button" data-admin-order-cleaner-comment-submit>Сохранить комментарий</button>
          </div>
          <div class="admin-alert admin-alert-info admin-order-cleaner-comment-feedback" data-admin-order-cleaner-comment-feedback hidden></div>
        </div>
      </div>
    </section>`;
    const amountHighlightCardMarkup = renderOrderSummaryCard(
      "Сумма",
      formatCurrencyAmount(order.totalPrice),
      {
        actions: `<div class="admin-order-summary-card-actions">
          <button
            class="admin-icon-button admin-edit-button"
            type="button"
            aria-label="Изменить сумму"
            title="Изменить сумму"
            data-admin-order-amount-open="${escapeHtmlAttribute(amountEditPanelId)}"
            data-admin-order-amount-edit-trigger="${escapeHtmlAttribute(amountEditPanelId)}"
            ${autoOpenAmountEditor ? "hidden" : ""}
          >
            ${renderAdminEditIcon("Изменить сумму")}
          </button>
          <button
            class="admin-icon-button admin-confirm-button"
            type="submit"
            form="${escapeHtmlAttribute(amountFormId)}"
            aria-label="Сохранить сумму"
            title="Сохранить сумму"
            data-admin-order-amount-action-for="${escapeHtmlAttribute(amountEditPanelId)}"
            ${autoOpenAmountEditor ? "" : "hidden"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.55 17.2 4.8 12.45a.75.75 0 1 1 1.06-1.06l3.69 3.69 8.59-8.58a.75.75 0 1 1 1.06 1.06l-9.12 9.11a.75.75 0 0 1-1.06 0Z" fill="currentColor"/>
            </svg>
            <span class="admin-sr-only">Сохранить сумму</span>
          </button>
          <button
            class="admin-icon-button admin-close-button"
            type="button"
            aria-label="Отменить редактирование суммы"
            title="Отменить"
            data-admin-order-amount-cancel="${escapeHtmlAttribute(amountEditPanelId)}"
            data-admin-order-amount-action-for="${escapeHtmlAttribute(amountEditPanelId)}"
            ${autoOpenAmountEditor ? "" : "hidden"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
            </svg>
            <span class="admin-sr-only">Отменить редактирование суммы</span>
          </button>
        </div>`,
        editor: `<form
          class="admin-order-highlight-editor"
          id="${escapeHtmlAttribute(amountFormId)}"
          method="post"
          action="${ADMIN_ORDERS_PATH}"
          data-admin-order-amount-editor="${escapeHtmlAttribute(amountEditPanelId)}"
          ${autoOpenAmountEditor ? "" : "hidden"}
        >
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(detailReturnTo)}">
          <label class="admin-label admin-order-highlight-editor-field">
            Изменить сумму
            <input
              class="admin-input"
              type="text"
              name="totalPrice"
              value="${escapeHtmlAttribute(formatAdminOrderPriceInputValue(order.totalPrice))}"
              data-admin-reset-value="${escapeHtmlAttribute(formatAdminOrderPriceInputValue(order.totalPrice))}"
              inputmode="decimal"
              placeholder="180.00"
            >
          </label>
        </form>`,
      }
    );
    const teamHighlightCardMarkup = renderOrderSummaryCard("Команда", assignedSummaryLabel, {
      className: "admin-order-summary-card-team",
      tone: order.isAssigned ? "" : "danger",
      note: order.isAssigned ? "" : "Требуется назначение",
      actions: `<div class="admin-order-summary-card-actions">
        <button
          class="admin-icon-button admin-edit-button"
          type="button"
          aria-label="Изменить команду"
          title="Изменить команду"
          data-admin-order-team-open="${escapeHtmlAttribute(teamEditPanelId)}"
          data-admin-order-team-edit-trigger="${escapeHtmlAttribute(teamEditPanelId)}"
        >
          ${renderAdminEditIcon("Изменить команду")}
        </button>
        <button
          class="admin-icon-button admin-confirm-button"
          type="submit"
          form="${escapeHtmlAttribute(teamFormId)}"
          aria-label="Сохранить команду"
          title="Сохранить команду"
          data-admin-order-team-action-for="${escapeHtmlAttribute(teamEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9.55 17.2 4.8 12.45a.75.75 0 1 1 1.06-1.06l3.69 3.69 8.59-8.58a.75.75 0 1 1 1.06 1.06l-9.12 9.11a.75.75 0 0 1-1.06 0Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Сохранить команду</span>
        </button>
        <button
          class="admin-icon-button admin-close-button"
          type="button"
          aria-label="Отменить редактирование команды"
          title="Отменить"
          data-admin-order-team-cancel="${escapeHtmlAttribute(teamEditPanelId)}"
          data-admin-order-team-action-for="${escapeHtmlAttribute(teamEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Отменить редактирование команды</span>
        </button>
      </div>`,
      editor: `<form
        class="admin-order-highlight-editor"
        id="${escapeHtmlAttribute(teamFormId)}"
        method="post"
        action="${ADMIN_ORDERS_PATH}"
        data-admin-order-team-editor="${escapeHtmlAttribute(teamEditPanelId)}"
        hidden
      >
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(detailReturnTo)}">
        <div class="admin-label admin-order-highlight-editor-field">
          <span>Переназначить команду</span>
          ${renderOrderResponsibleSelect(order, { planningItem, staffRecords })}
        </div>
      </form>`,
    });
    const paymentHighlightCardTone =
      order.paymentStatus === "paid" ? "" : order.paymentStatus === "partial" ? "" : "danger";
    const paymentHighlightCardMarkup = renderOrderSummaryCard("Оплата", order.paymentStatusLabel, {
      tone: paymentHighlightCardTone,
      note: order.paymentMethod ? order.paymentMethodLabel : "Способ оплаты не выбран",
      actions: `<div class="admin-order-summary-card-actions">
        <button
          class="admin-icon-button admin-edit-button"
          type="button"
          aria-label="Изменить оплату"
          title="Изменить оплату"
          data-admin-order-payment-open="${escapeHtmlAttribute(paymentEditPanelId)}"
          data-admin-order-payment-edit-trigger="${escapeHtmlAttribute(paymentEditPanelId)}"
        >
          ${renderAdminEditIcon("Изменить оплату")}
        </button>
        <button
          class="admin-icon-button admin-confirm-button"
          type="submit"
          form="${escapeHtmlAttribute(paymentFormId)}"
          aria-label="Сохранить оплату"
          title="Сохранить оплату"
          data-admin-order-payment-action-for="${escapeHtmlAttribute(paymentEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9.55 17.2 4.8 12.45a.75.75 0 1 1 1.06-1.06l3.69 3.69 8.59-8.58a.75.75 0 1 1 1.06 1.06l-9.12 9.11a.75.75 0 0 1-1.06 0Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Сохранить оплату</span>
        </button>
        <button
          class="admin-icon-button admin-close-button"
          type="button"
          aria-label="Отменить редактирование оплаты"
          title="Отменить"
          data-admin-order-payment-cancel="${escapeHtmlAttribute(paymentEditPanelId)}"
          data-admin-order-payment-action-for="${escapeHtmlAttribute(paymentEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Отменить редактирование оплаты</span>
        </button>
      </div>`,
      editor: `<form
        class="admin-order-highlight-editor"
        id="${escapeHtmlAttribute(paymentFormId)}"
        method="post"
        action="${ADMIN_ORDERS_PATH}"
        data-admin-order-payment-editor="${escapeHtmlAttribute(paymentEditPanelId)}"
        hidden
      >
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(detailReturnTo)}">
        <div class="admin-order-control-fields">
          <label class="admin-label admin-order-control-field">
            Статус оплаты
            <select class="admin-input" name="paymentStatus">
              <option value="unpaid"${order.paymentStatus === "unpaid" ? " selected" : ""}>Unpaid</option>
              <option value="partial"${order.paymentStatus === "partial" ? " selected" : ""}>Partial</option>
              <option value="paid"${order.paymentStatus === "paid" ? " selected" : ""}>Paid</option>
            </select>
          </label>
          <label class="admin-label admin-order-control-field">
            Способ оплаты
            <select class="admin-input" name="paymentMethod">
              <option value=""${!order.paymentMethod ? " selected" : ""}>Not set</option>
              <option value="cash"${order.paymentMethod === "cash" ? " selected" : ""}>Cash</option>
              <option value="zelle"${order.paymentMethod === "zelle" ? " selected" : ""}>Zelle</option>
              <option value="card"${order.paymentMethod === "card" ? " selected" : ""}>Card</option>
              <option value="invoice"${order.paymentMethod === "invoice" ? " selected" : ""}>Invoice</option>
            </select>
          </label>
        </div>
      </form>`,
    });

    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${escapeHtmlAttribute(dialogId)}"${autoOpenAttr}${closeHref ? ` data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"` : ""} aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel admin-order-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <span class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(titleLabel))}">${escapeHtml(getAdminClientAvatarInitials(titleLabel))}</span>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Заказ</p>
              <div class="admin-dialog-hero-title-block">
                <div class="admin-dialog-hero-title-row">
                  <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(titleLabel)}</h2>
                  <span class="admin-dialog-hero-title-status">${orderStatusBadgeMarkup}</span>
                </div>
                <p class="admin-dialog-hero-detail">${escapeHtml(contactLabel)}</p>
                <p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(orderHeaderAddress)}</p>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <div class="admin-order-dialog-layout">
          <div class="admin-order-dialog-main">
            <section class="admin-client-summary-panel admin-order-summary-panel">
              <div class="admin-order-summary-head">
                <div class="admin-order-summary-copy-block">
                  <div class="admin-inline-badge-row admin-order-summary-strip">${summaryStripBadges}</div>
                </div>
              </div>
              <div class="admin-client-metric-grid admin-client-metric-grid-dialog admin-order-summary-grid">
                ${amountHighlightCardMarkup}
                ${renderOrderSummaryCard("Дата и время", scheduleLabel, {
                  note: order.hasSchedule ? "Визит уже назначен" : "Нужно выбрать окно уборки",
                  tone: order.hasSchedule ? "default" : "danger",
                })}
                ${teamHighlightCardMarkup}
                ${paymentHighlightCardMarkup}
                ${renderOrderSummaryCard("Создан", createdLabel, {
                  note: "Дата создания заказа",
                  compact: true,
                })}
              </div>
            </section>
            ${renderAdminGhlSmsComposer({
              req: options.req,
              actionPath: ADMIN_ORDERS_PATH,
              targetType: "order",
              targetRef: order.id,
              targetFieldName: "entryId",
              targetFieldValue: order.id,
              returnTo: detailReturnTo,
          phone: order.customerPhone,
          contactId: order && order.entry ? order.entry.contactId : "",
          historyEntries: getEntrySmsHistoryEntries(order && order.entry ? order.entry : {}),
          leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
          canEdit: options.canEdit,
          noticePrefix: "order",
              title: "SMS по заказу",
              description: "Быстрая отправка сообщения клиенту по этому заказу через Go High Level.",
            })}
            <section class="admin-order-section-card admin-order-quote-section">
              <div class="admin-subsection-head">
                <h3 class="admin-subsection-title">Поля из формы клиента</h3>
              </div>
              <div class="admin-order-quote-grid">
                ${quoteCards}
              </div>
            </section>
            ${cleanerReportSection}
          </div>
          <aside class="admin-order-dialog-side">
            <section class="admin-order-section-card admin-order-side-card">
              <div class="admin-subsection-head">
                <h3 class="admin-subsection-title">Управление заказом</h3>
              </div>
              <form class="admin-form-grid admin-order-control-form" id="${escapeHtmlAttribute(editFormId)}" method="post" action="${ADMIN_ORDERS_PATH}">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(dialogReturnTo)}">
                <div class="admin-order-control-fields">
                  <label class="admin-label admin-order-control-field">
                    Статус заказа
                    <select class="admin-input" name="orderStatus">
                      <option value="new"${order.orderStatus === "new" ? " selected" : ""}>Новые</option>
                      <option value="scheduled"${order.orderStatus === "scheduled" ? " selected" : ""}>Запланировано</option>
                      <option value="in-progress"${order.orderStatus === "in-progress" ? " selected" : ""}>В работе</option>
                      <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="invoice-sent"${order.orderStatus === "invoice-sent" ? " selected" : ""}>Инвойс отправлен</option>
                      <option value="paid"${order.orderStatus === "paid" ? " selected" : ""}>Оплачено</option>
                      <option value="awaiting-review"${order.orderStatus === "awaiting-review" ? " selected" : ""}>Ждем отзыв</option>
                      <option value="completed"${order.orderStatus === "completed" ? " selected" : ""}>Завершено</option>
                      <option value="canceled"${order.orderStatus === "canceled" ? " selected" : ""}>Отменено</option>
                    </select>
                  </label>
                  ${renderAdminPickerField({
                    pickerType: "date",
                    fieldId: `${editFormId}-selected-date`,
                    label: "Дата уборки",
                    className: "admin-order-control-field",
                    name: "selectedDate",
                    displayValue: formatAdminOrderDateInputValue(order.selectedDate),
                    nativeValue: order.selectedDate,
                    placeholder: "04/15/2026",
                    pickerLabel: "Выбрать дату уборки",
                  })}
                  ${renderAdminPickerField({
                    pickerType: "time",
                    fieldId: `${editFormId}-selected-time`,
                    label: "Время уборки",
                    className: "admin-order-control-field",
                    name: "selectedTime",
                    displayValue: formatAdminOrderTimeInputValue(order.selectedTime),
                    nativeValue: order.selectedTime,
                    placeholder: "1:30 PM",
                    pickerLabel: "Выбрать время уборки",
                  })}
                  <label class="admin-label admin-order-control-field">
                    Повторяемость
                    <select class="admin-input" name="frequency">
                      <option value=""${!order.frequency ? " selected" : ""}>Not set</option>
                      <option value="weekly"${order.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                      <option value="biweekly"${order.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                      <option value="monthly"${order.frequency === "monthly" ? " selected" : ""}>Monthly</option>
                    </select>
                  </label>
                </div>
              </form>
              <div class="admin-order-action-row">
                <button class="admin-button admin-order-primary-action" type="submit" form="${escapeHtmlAttribute(editFormId)}">Сохранить заказ</button>
                  ${renderAdminDialogCloseButton(dialogId)}
                  ${canDelete
                    ? `<form class="admin-inline-actions admin-order-delete-form" method="post" action="${ADMIN_ORDERS_PATH}">
                        <input type="hidden" name="action" value="delete-order">
                        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(dialogReturnTo)}">
                        ${renderAdminDeleteIconButton(
                          "Удалить заказ",
                          "Удалить этот тестовый заказ? Запись исчезнет из заказов, клиентов и заявок."
                        )}
                      </form>`
                    : ""}
              </div>
            </section>
            ${renderOrderPolicyAcceptancePanel(order, { canEdit: options.canEdit, returnTo: detailReturnTo })}
          </aside>
        </div>
      </div>
    </dialog>`;
  }

  function renderOrderEntryCard(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const canDelete = options.canDelete !== false;
    const dialogId = getOrderDialogId(order.id);
    const planningTeamLabel =
      planningItem && planningItem.assignedStaff.length > 0
        ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
        : "";
    const assignedLabel = planningTeamLabel || order.assignedStaff || "Не назначен";
    const createdLabel = formatAdminDateTime(order.createdAt);
    const focusBadges = [];
    if (!order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled") {
      focusBadges.push(renderAdminBadge("Нужно назначить дату", "outline"));
    }
    if (!order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled") {
      focusBadges.push(renderAdminBadge("Нет команды", "outline"));
    }
    if (order.needsAttention) {
      focusBadges.push(renderAdminBadge("CRM требует внимания", "danger"));
    }

    return `<article class="admin-order-card admin-order-card-${escapeHtmlAttribute(order.orderStatus)}${order.needsAttention ? " admin-order-card-attention" : ""}">
      <div class="admin-order-card-head">
        <div class="admin-order-title-block">
          <p class="admin-order-request">Request ${escapeHtml(order.requestId || "не указан")}</p>
          <h3 class="admin-order-title">
            <button
              class="admin-table-link admin-table-link-button"
              type="button"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
            >${escapeHtml(order.customerName || "Клиент")}</button>
          </h3>
          <p class="admin-order-caption">${escapeHtml(order.serviceLabel)} • ${escapeHtml(formatCurrencyAmount(order.totalPrice))} • создан ${escapeHtml(createdLabel)}</p>
        </div>
        <div class="admin-entry-meta">
          ${planningItem ? renderAssignmentStatusBadge(planningItem.assignmentStatus) : ""}
          ${renderOrderStatusBadge(order.orderStatus)}
          ${renderOrderPaymentStatusBadge(order.paymentStatus)}
          ${renderAdminBadge(order.serviceLabel, "outline")}
          ${order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : ""}
          ${renderQuoteOpsStatusBadge(order.crmStatus)}
        </div>
      </div>
      <div class="admin-order-focus">
        ${focusBadges.length > 0
          ? focusBadges.join("")
          : `<span class="admin-order-focus-copy">Заказ читается как готовый к работе: дата, команда и CRM-статус уже на месте.</span>`}
      </div>
      <div class="admin-order-snapshot-grid">
        ${renderOrderSnapshot("Дата и время", order.scheduleLabel)}
        ${renderOrderSnapshot("Команда", assignedLabel)}
        ${renderOrderSnapshot("Оплата", `${order.paymentStatusLabel} • ${order.paymentMethodLabel}`)}
        ${renderOrderSnapshot("Повторяемость", order.frequencyLabel)}
        ${renderOrderSnapshot("Контакты", [formatAdminPhoneNumber(order.customerPhone) || "Телефон не указан", order.customerEmail || ""].filter(Boolean).join(" • "))}
        ${renderOrderSnapshot("Адрес", order.fullAddress || "Не указан", { wide: true })}
      </div>
      <details class="admin-details admin-order-editor">
        <summary class="admin-icon-button admin-edit-button admin-order-editor-summary" aria-label="Редактировать заказ" title="Редактировать заказ">
          ${renderAdminEditIcon("Редактировать заказ")}
        </summary>
        <div class="admin-order-editor-body">
          <form class="admin-form-grid admin-form-grid-two admin-order-form" method="post" action="${ADMIN_ORDERS_PATH}">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
            <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
            <label class="admin-label">
              Статус заказа
              <select class="admin-input" name="orderStatus">
                <option value="new"${order.orderStatus === "new" ? " selected" : ""}>Новые</option>
                <option value="scheduled"${order.orderStatus === "scheduled" ? " selected" : ""}>Запланировано</option>
                <option value="in-progress"${order.orderStatus === "in-progress" ? " selected" : ""}>В работе</option>
                <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Перенесено</option>
                <option value="invoice-sent"${order.orderStatus === "invoice-sent" ? " selected" : ""}>Инвойс отправлен</option>
                <option value="paid"${order.orderStatus === "paid" ? " selected" : ""}>Оплачено</option>
                <option value="awaiting-review"${order.orderStatus === "awaiting-review" ? " selected" : ""}>Ждем отзыв</option>
                <option value="completed"${order.orderStatus === "completed" ? " selected" : ""}>Завершено</option>
                <option value="canceled"${order.orderStatus === "canceled" ? " selected" : ""}>Отменено</option>
              </select>
            </label>
            ${renderAdminPickerField({
              pickerType: "date",
              fieldId: `${dialogId}-selected-date`,
              label: "Дата уборки",
              name: "selectedDate",
              displayValue: formatAdminOrderDateInputValue(order.selectedDate),
              nativeValue: order.selectedDate,
              placeholder: "04/15/2026",
              pickerLabel: "Выбрать дату уборки",
            })}
            ${renderAdminPickerField({
              pickerType: "time",
              fieldId: `${dialogId}-selected-time`,
              label: "Время уборки",
              name: "selectedTime",
              displayValue: formatAdminOrderTimeInputValue(order.selectedTime),
              nativeValue: order.selectedTime,
              placeholder: "1:30 PM",
              pickerLabel: "Выбрать время уборки",
            })}
            <label class="admin-label">
              Повторяемость
              <select class="admin-input" name="frequency">
                <option value=""${!order.frequency ? " selected" : ""}>Not set</option>
                <option value="weekly"${order.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                <option value="biweekly"${order.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                <option value="monthly"${order.frequency === "monthly" ? " selected" : ""}>Monthly</option>
              </select>
            </label>
            <div class="admin-label">
              <span>Ответственный</span>
              ${renderOrderResponsibleSelect(order, { planningItem, staffRecords })}
            </div>
            <label class="admin-label">
              Статус оплаты
              <select class="admin-input" name="paymentStatus">
                <option value="unpaid"${order.paymentStatus === "unpaid" ? " selected" : ""}>Unpaid</option>
                <option value="partial"${order.paymentStatus === "partial" ? " selected" : ""}>Partial</option>
                <option value="paid"${order.paymentStatus === "paid" ? " selected" : ""}>Paid</option>
              </select>
            </label>
            <label class="admin-label">
              Способ оплаты
              <select class="admin-input" name="paymentMethod">
                <option value=""${!order.paymentMethod ? " selected" : ""}>Not set</option>
                <option value="cash"${order.paymentMethod === "cash" ? " selected" : ""}>Cash</option>
                <option value="zelle"${order.paymentMethod === "zelle" ? " selected" : ""}>Zelle</option>
                <option value="card"${order.paymentMethod === "card" ? " selected" : ""}>Card</option>
                <option value="invoice"${order.paymentMethod === "invoice" ? " selected" : ""}>Invoice</option>
              </select>
            </label>
            <div class="admin-inline-actions admin-form-actions">
              <button class="admin-button" type="submit">Сохранить заказ</button>
              <span class="admin-action-hint">Точную команду и статусы смен удобнее вести в разделе «Сотрудники».</span>
            </div>
          </form>
          ${canDelete
            ? `<form class="admin-inline-actions admin-order-delete-form" method="post" action="${ADMIN_ORDERS_PATH}">
                <input type="hidden" name="action" value="delete-order">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                ${renderAdminDeleteIconButton(
                  "Удалить заказ",
                  "Удалить этот тестовый заказ? Запись исчезнет из заказов, клиентов и заявок."
                )}
              </form>`
            : ""}
        </div>
      </details>
    </article>`;
  }

  function renderOrdersLane(status, laneOrders, returnTo, planningByEntryId, staffRecords = [], options = {}) {
    const meta = getOrderLaneMeta(status);
    const droppable = options.droppable !== false;
    return `<section class="admin-order-funnel-column admin-order-funnel-column-${escapeHtmlAttribute(status)}" data-order-funnel-lane="${escapeHtmlAttribute(status)}">
      <div class="admin-order-funnel-head">
        <div>
          <h2 class="admin-order-funnel-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-order-funnel-copy">${escapeHtml(meta.description)}</p>
        </div>
        <div class="admin-order-funnel-meta">
          <span data-order-funnel-count="true">${renderAdminBadge(String(laneOrders.length), "outline")}</span>
        </div>
      </div>
      <div class="admin-order-funnel-list"${droppable ? ` data-order-dropzone="${escapeHtmlAttribute(status)}"` : ""} data-order-funnel-list="true">
        ${laneOrders
          .map((order) =>
            renderOrderFunnelCard(order, returnTo, {
              planningItem: planningByEntryId.get(order.id) || null,
              canEdit: options.canEdit,
            })
          )
          .join("") || `<div class="admin-order-funnel-empty">В этой колонке пока нет заказов.</div>`}
      </div>
    </section>`;
  }

  function renderOrderFunnelCard(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const canEdit = options.canEdit !== false;
    const dialogId = getOrderDialogId(order.id);
    const funnelStatus = getOrderFunnelStatus(order);
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const topBadge = order.needsAttention
      ? renderAdminBadge("CRM", "danger")
      : order.frequency
        ? renderAdminBadge(order.frequencyLabel, "outline")
        : "";

    return `<article
      class="admin-order-funnel-card admin-order-funnel-card-${escapeHtmlAttribute(funnelStatus)}"
      data-order-funnel-card="true"
      data-order-funnel-status="${escapeHtmlAttribute(funnelStatus)}"
      data-order-entry-id="${escapeHtmlAttribute(order.id)}"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      draggable="${canEdit ? "true" : "false"}"
      aria-label="${escapeHtmlAttribute(`Открыть карточку заказа ${order.customerName || "Клиент"}`)}"
    >
      <div class="admin-order-funnel-card-top">
        <div class="admin-order-funnel-card-title-block">
          <h3 class="admin-order-funnel-card-title">${escapeHtml(order.customerName || "Клиент")}</h3>
          <p class="admin-order-funnel-card-copy">${escapeHtml(order.serviceLabel)} • ${escapeHtml(order.requestId || "Номер не указан")}</p>
        </div>
        ${topBadge ? `<div class="admin-order-funnel-card-badge">${topBadge}</div>` : ""}
      </div>
      <div class="admin-order-funnel-card-details">
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Дата</p>
          <p class="admin-order-funnel-card-detail-value">${escapeHtml(order.scheduleLabel)}</p>
        </div>
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Команда</p>
          <p class="admin-order-funnel-card-detail-value${!order.isAssigned ? " admin-order-funnel-card-detail-value-danger" : ""}">${escapeHtml(assignedLabel)}</p>
        </div>
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Сумма</p>
          <p class="admin-order-funnel-card-detail-value">${escapeHtml(formatCurrencyAmount(order.totalPrice))}</p>
        </div>
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Оплата</p>
          <p class="admin-order-funnel-card-detail-value">${escapeHtml(order.paymentStatusLabel)}</p>
        </div>
      </div>
      <div class="admin-order-funnel-card-stage" data-order-card-stage="true">${renderOrderFunnelStatusBadge(funnelStatus)}</div>
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
    </article>`;
  }

  function renderOrdersFunnelScript(currentReturnTo, canEdit) {
    if (!canEdit) return "";

    return `<script>
      (() => {
        const stageForm = document.querySelector('[data-order-funnel-stage-form="true"]');
        const stageEntryInput = stageForm ? stageForm.querySelector('input[name="entryId"]') : null;
        const stageStatusInput = stageForm ? stageForm.querySelector('input[name="orderStatus"]') : null;
        const stageReturnInput = stageForm ? stageForm.querySelector('input[name="returnTo"]') : null;
        if (!stageForm || !stageEntryInput || !stageStatusInput || !stageReturnInput) return;

        let draggedCard = null;
        const statusClasses = ["new", "policy", "scheduled", "in-progress", "rescheduled", "invoice-sent", "paid", "awaiting-review", "completed", "canceled"];

        function createBadge(label, tone) {
          const badge = document.createElement("span");
          let className = "admin-badge";
          if (tone === "success") className += " admin-badge-success";
          else if (tone === "muted") className += " admin-badge-muted";
          else if (tone === "danger") className += " admin-badge-danger";
          else if (tone === "outline") className += " admin-badge-outline";
          badge.className = className;
          badge.textContent = label;
          return badge;
        }

        function getOrderBadgeMeta(status) {
          const normalized = String(status || "new");
          if (normalized === "policy") return { label: "Политика", tone: "outline" };
          if (normalized === "completed") return { label: "Завершено", tone: "success" };
          if (normalized === "canceled") return { label: "Отменено", tone: "danger" };
          if (normalized === "paid") return { label: "Оплачено", tone: "success" };
          if (normalized === "awaiting-review") return { label: "Ждем отзыв", tone: "default" };
          if (normalized === "invoice-sent") return { label: "Инвойс отправлен", tone: "outline" };
          if (normalized === "rescheduled") return { label: "Перенесено", tone: "outline" };
          if (normalized === "in-progress") return { label: "В работе", tone: "default" };
          if (normalized === "scheduled") return { label: "Запланировано", tone: "outline" };
          return { label: "Новые", tone: "muted" };
        }

        function findLane(status) {
          return Array.from(document.querySelectorAll("[data-order-funnel-lane]")).find(
            (lane) => lane.getAttribute("data-order-funnel-lane") === status
          ) || null;
        }

        function refreshLaneUi(lane) {
          if (!lane) return;
          const list = lane.querySelector('[data-order-funnel-list="true"]');
          const countTarget = lane.querySelector('[data-order-funnel-count="true"]');
          if (countTarget && list) {
            const count = list.querySelectorAll('[data-order-funnel-card="true"]').length;
            countTarget.replaceChildren(createBadge(String(count), "outline"));
          }
          if (!list) return;
          const hasCards = list.querySelector('[data-order-funnel-card="true"]');
          const emptyState = list.querySelector(".admin-order-funnel-empty");
          if (hasCards && emptyState) {
            emptyState.remove();
          } else if (!hasCards && !emptyState) {
            const placeholder = document.createElement("div");
            placeholder.className = "admin-order-funnel-empty";
            placeholder.textContent = "В этой колонке пока нет заказов.";
            list.appendChild(placeholder);
          }
        }

        function moveCardToLane(card, lane) {
          const list = lane ? lane.querySelector('[data-order-funnel-list="true"]') : null;
          if (!card || !list) return;
          const emptyState = list.querySelector(".admin-order-funnel-empty");
          if (emptyState) emptyState.remove();
          list.prepend(card);
        }

        function applyOrderPayloadToCard(card, payload) {
          if (!card || !payload || !payload.order) return;
          const status = String(payload.order.funnelStatus || payload.order.orderStatus || "new");
          const badgeMeta = getOrderBadgeMeta(status);
          const stageTarget = card.querySelector('[data-order-card-stage="true"]');
          card.setAttribute("data-order-funnel-status", status);
          statusClasses.forEach((value) => card.classList.remove("admin-order-funnel-card-" + value));
          card.classList.add("admin-order-funnel-card-" + status);
          if (stageTarget) {
            stageTarget.replaceChildren(createBadge(badgeMeta.label, badgeMeta.tone));
          }
        }

        async function submitOrderStageChange(formData) {
          const response = await fetch(${JSON.stringify(ADMIN_ORDERS_PATH)}, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "application/json",
              "X-SHYNLI-ADMIN-AJAX": "1",
            },
            body: new URLSearchParams(formData).toString(),
            credentials: "same-origin",
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(payload && payload.message ? payload.message : "Не удалось сохранить новый статус заказа.");
          }
          return payload;
        }

        document.querySelectorAll('[data-order-funnel-card="true"]').forEach((card) => {
          if (card.getAttribute("draggable") !== "true") return;
          card.addEventListener("dragstart", () => {
            draggedCard = card;
            card.classList.add("is-dragging");
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("is-dragging");
          });
        });

        document.querySelectorAll("[data-order-dropzone]").forEach((list) => {
          const lane = list.closest(".admin-order-funnel-column");
          list.addEventListener("dragover", (event) => {
            if (!draggedCard) return;
            event.preventDefault();
            if (lane) lane.setAttribute("data-drop-active", "true");
          });
          list.addEventListener("dragleave", () => {
            if (lane) lane.removeAttribute("data-drop-active");
          });
          list.addEventListener("drop", async (event) => {
            if (!draggedCard || !lane) return;
            event.preventDefault();
            lane.removeAttribute("data-drop-active");
            const nextStatus = list.getAttribute("data-order-dropzone");
            const entryId = draggedCard.getAttribute("data-order-entry-id") || "";
            const previousStatus = draggedCard.getAttribute("data-order-funnel-status") || "";
            const returnTo = draggedCard.querySelector('input[name="returnTo"]')?.value || ${JSON.stringify(currentReturnTo)};
            if (!nextStatus || !entryId || nextStatus === previousStatus) {
              draggedCard = null;
              return;
            }

            const card = draggedCard;
            const sourceLane = card.closest(".admin-order-funnel-column");
            const sourceList = card.parentElement;
            const sourceNextSibling = card.nextElementSibling;

            stageEntryInput.value = entryId;
            stageStatusInput.value = nextStatus;
            stageReturnInput.value = returnTo;

            card.classList.add("is-saving");
            moveCardToLane(card, lane);
            refreshLaneUi(sourceLane);
            refreshLaneUi(lane);

            try {
              const payload = await submitOrderStageChange(new FormData(stageForm));
              applyOrderPayloadToCard(card, payload);
              const resolvedLane = findLane(String(payload && payload.order && (payload.order.funnelStatus || payload.order.orderStatus) || nextStatus));
              if (resolvedLane && resolvedLane !== lane) {
                moveCardToLane(card, resolvedLane);
                refreshLaneUi(lane);
                refreshLaneUi(resolvedLane);
              }
            } catch (error) {
              if (sourceList) {
                if (sourceNextSibling && sourceNextSibling.parentElement === sourceList) {
                  sourceList.insertBefore(card, sourceNextSibling);
                } else {
                  sourceList.appendChild(card);
                }
              }
              refreshLaneUi(sourceLane);
              refreshLaneUi(lane);
              window.alert(error && error.message ? error.message : "Не удалось сохранить новый статус заказа.");
            } finally {
              card.classList.remove("is-saving");
              card.classList.remove("is-dragging");
              draggedCard = null;
            }
          });
        });
      })();
    </script>`;
  }

  function renderOrdersOverviewStrip(metrics = []) {
    return `<div class="admin-compact-summary-strip">
      ${metrics
        .map(
          (item) => `<article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone || "default")}">
            <div class="admin-compact-summary-head">
              <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
              <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
            </div>
            <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
          </article>`
        )
        .join("")}
    </div>`;
  }

  function renderOrdersUpcomingTable(upcomingOrders) {
    if (!upcomingOrders.length) {
      return `<div class="admin-empty-state">Пока нет ближайших выездов с датой и временем. Как только в заказах появится график, он подтянется сюда автоматически.</div>`;
    }

    return `<div class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Адрес</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${upcomingOrders
            .map(({ order, planningItem }) => {
              const dialogId = getOrderDialogId(order.id);
              const assignedLabel = getOrderAssignedLabel(order, planningItem);

              return `<tr
                class="admin-table-row-clickable"
                tabindex="0"
                data-admin-dialog-row="true"
                data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                aria-label="${escapeHtmlAttribute(`Открыть карточку заказа ${order.customerName || "Клиент"}`)}"
              >
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-link">${escapeHtml(order.customerName || "Клиент")}</span>
                    <span class="admin-table-muted">${escapeHtml(order.requestId || "Номер не указан")} • ${escapeHtml(order.serviceLabel)}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(planningItem.scheduleLabel || order.scheduleLabel)}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(assignedLabel)}</span>
                    ${!order.isAssigned ? `<span>${renderAdminBadge("Команда не назначена", "danger")}</span>` : ""}
                  </div>
                </td>
                <td>
                  ${order.fullAddress
                    ? `<div class="admin-table-cell-stack">
                        <span class="admin-line-clamp-two">${escapeHtml(order.fullAddress)}</span>
                      </div>`
                    : `<span class="admin-table-muted">Не указан</span>`}
                </td>
                <td>
                  <div class="admin-inline-badge-row">
                    ${renderOrderStatusBadge(order.orderStatus)}
                    ${renderOrderPaymentStatusBadge(order.paymentStatus)}
                    ${order.needsAttention ? renderQuoteOpsStatusBadge(order.crmStatus) : ""}
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderOrdersFunnelStyle() {
    return `<style>
      .admin-orders-funnel-section {
        display: grid;
        gap: 14px;
        padding-top: 10px;
        border-top: 1px solid rgba(228, 228, 231, 0.88);
      }
      .admin-order-funnel-board {
        display: flex;
        flex-wrap: nowrap;
        gap: 16px;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 6px;
        align-items: stretch;
      }
      .admin-order-funnel-column {
        flex: 0 0 248px;
        min-width: 248px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(255,255,255,0.88);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: clamp(340px, 50vh, 640px);
      }
      .admin-order-funnel-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 12px;
        min-height: 96px;
      }
      .admin-order-funnel-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-order-funnel-title {
        margin: 4px 0 0;
        font-size: 18px;
      }
      .admin-order-funnel-copy {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-order-funnel-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1 1 auto;
        min-height: 140px;
      }
      .admin-order-funnel-column[data-drop-active="true"] {
        border-color: rgba(59, 130, 246, 0.42);
        background: rgba(239, 246, 255, 0.82);
      }
      .admin-order-funnel-card {
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,250,251,0.96);
        display: grid;
        gap: 10px;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
        outline: none;
        min-width: 0;
        overflow: hidden;
        cursor: pointer;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-order-funnel-card.is-dragging {
        opacity: 0.72;
        box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
      }
      .admin-order-funnel-card.is-saving {
        pointer-events: none;
        opacity: 0.82;
      }
      .admin-order-funnel-card:hover,
      .admin-order-funnel-card:focus-visible,
      .admin-order-funnel-card:focus-within {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.98);
        box-shadow: 0 10px 26px rgba(158, 67, 90, 0.08);
      }
      .admin-order-funnel-card-policy {
        background: linear-gradient(180deg, rgba(255, 246, 239, 0.96), rgba(255, 252, 249, 0.99));
      }
      .admin-order-funnel-card-paid,
      .admin-order-funnel-card-completed {
        background: linear-gradient(180deg, rgba(240, 253, 250, 0.96), rgba(247, 254, 252, 0.98));
      }
      .admin-order-funnel-card-awaiting-review {
        background: linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(248, 250, 252, 0.98));
      }
      .admin-order-funnel-card-invoice-sent {
        background: linear-gradient(180deg, rgba(255, 251, 235, 0.94), rgba(255, 255, 255, 0.98));
      }
      .admin-order-funnel-card-canceled {
        border-color: rgba(161, 161, 170, 0.24);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(244, 244, 245, 0.98));
      }
      .admin-order-funnel-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .admin-order-funnel-card-title-block {
        min-width: 0;
        display: grid;
        gap: 4px;
      }
      .admin-order-funnel-card-title {
        margin: 0;
        font-size: 17px;
        line-height: 1.12;
      }
      .admin-order-funnel-card-copy {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-order-funnel-card-badge {
        flex: 0 0 auto;
      }
      .admin-order-funnel-card-details {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid rgba(228, 228, 231, 0.88);
      }
      .admin-order-funnel-card-detail {
        display: grid;
        grid-template-columns: minmax(0, 58px) minmax(0, 1fr);
        align-items: start;
        gap: 8px;
      }
      .admin-order-funnel-card-detail-label {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-order-funnel-card-detail-value {
        margin: 0;
        color: var(--foreground);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-order-funnel-card-detail-value-danger {
        color: var(--danger);
      }
      .admin-order-funnel-card-stage .admin-badge {
        display: flex;
        width: 100%;
        justify-content: center;
        text-align: center;
      }
      .admin-order-funnel-empty {
        min-height: 120px;
        border: 1px dashed rgba(212, 212, 216, 0.92);
        border-radius: 16px;
        background: rgba(250, 250, 250, 0.74);
        display: grid;
        place-items: center;
        padding: 16px;
        text-align: center;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-orders-table-wrap-capped {
        max-height: 34rem;
        overflow-y: auto;
      }
      .admin-orders-table-wrap-capped thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(250, 250, 251, 0.98);
        backdrop-filter: blur(8px);
      }
    </style>`;
  }

  async function renderOrdersPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const { reqUrl, filters } = getOrdersFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const allOrders = collectAdminOrderRecords(allEntries).map((order) => {
      const planningItem = planningByEntryId.get(order.id) || null;
      if (!planningItem) return order;

      const assignedTeamLabel =
        planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
          : "";

      return {
        ...order,
        assignedStaff: assignedTeamLabel || order.assignedStaff,
        isAssigned: Boolean(assignedTeamLabel || order.assignedStaff),
        scheduleLabel: planningItem.scheduleLabel || order.scheduleLabel,
        hasSchedule: planningItem.hasSchedule || order.hasSchedule,
        planningItem,
      };
    });
    const orders = filterAdminOrderRecords(allOrders, filters);
    const totalOrders = allOrders.length;
    const scheduledCount = allOrders.filter((order) => order.hasSchedule).length;
    const noScheduleOpenCount = allOrders.filter(
      (order) => !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const unassignedOpenCount = allOrders.filter(
      (order) => !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const statusCounts = countOrdersByStatus(allOrders);
    const activeCount = Math.max(0, totalOrders - statusCounts.completed - statusCounts.canceled);
    const orderById = new Map(allOrders.map((order) => [order.id, order]));
    const upcomingOrders = planning.scheduledOrders.slice(0, 8)
      .map((planningItem) => {
        const order = orderById.get(planningItem.entry.id);
        if (!order) return null;
        return { order, planningItem };
      })
      .filter(Boolean);
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const selectedOrderId = normalizeString(reqUrl.searchParams.get("order"), 120);
    const autoOpenAmountEditor = normalizeString(reqUrl.searchParams.get("amountEditor"), 16) === "1";
    const autoOpenCreateOrderDialog = normalizeString(reqUrl.searchParams.get("createOrder"), 16) === "1";
    const filteredCount = orders.length;
    const hasSearchQuery = Boolean(filters.q);
    const hasActiveFilters = Boolean(
      filters.q ||
      filters.status !== "all" ||
      filters.serviceType !== "all" ||
      filters.frequency !== "all" ||
      filters.assignment !== "all"
    );
    const advancedFilterCount = [
      filters.status !== "all",
      filters.serviceType !== "all",
      filters.frequency !== "all",
      filters.assignment !== "all",
    ].filter(Boolean).length;
    const advancedResetHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: filters.q,
      status: "",
      serviceType: "",
      frequency: "",
      assignment: "",
    });
    const resetHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: "",
      status: "",
      serviceType: "",
      frequency: "",
      assignment: "",
    });
    const closeOrderHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: filters.q,
      status: filters.status !== "all" ? filters.status : "",
      serviceType: filters.serviceType !== "all" ? filters.serviceType : "",
      frequency: filters.frequency !== "all" ? filters.frequency : "",
      assignment: filters.assignment !== "all" ? filters.assignment : "",
      order: "",
    });
    const funnelStatuses = ["new", "policy", "scheduled", "in-progress", "rescheduled", "invoice-sent", "paid", "awaiting-review", "completed", "canceled"];
    const emptyStateMessage = hasActiveFilters
      ? "По текущему фильтру заказов нет. Попробуйте очистить поиск или снять часть фильтров."
      : "Пока заказов нет. Подтверждённые заявки будут появляться здесь после создания заказа.";
    const overviewItems = [
      {
        label: "В работе",
        value: activeCount,
        copy: "Открытые заказы без completed и canceled.",
        tone: "accent",
      },
      {
        label: "В графике",
        value: scheduledCount,
        copy: "Есть дата или время визита.",
        tone: "success",
      },
      {
        label: "Без даты",
        value: noScheduleOpenCount,
        copy: "Нужно назначить окно уборки.",
        tone: noScheduleOpenCount > 0 ? "danger" : "default",
      },
      {
        label: "Без команды",
        value: unassignedOpenCount,
        copy: "Требуется назначение сотрудников.",
        tone: unassignedOpenCount > 0 ? "danger" : "default",
      },
    ];
    const filterBadges = [
      hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : "",
      filters.status !== "all" ? renderAdminBadge(`Статус: ${filters.status}`, "outline") : "",
      filters.serviceType !== "all" ? renderAdminBadge(`Тип: ${filters.serviceType}`, "outline") : "",
      filters.frequency !== "all" ? renderAdminBadge(`Повтор: ${filters.frequency}`, "outline") : "",
      filters.assignment === "assigned" ? renderAdminBadge("Только назначенные", "outline") : "",
      filters.assignment === "unassigned" ? renderAdminBadge("Только без команды", "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const accessContext = getWorkspaceAccessContext(adminRuntime);

    return renderAdminLayout(
      "Заказы",
      `<div class="admin-orders-page">
        ${renderOrdersFunnelStyle()}
        ${renderOrdersNotice(req)}
        ${renderOrdersOverviewStrip(overviewItems)}
        ${renderAdminCard(
          "Все заказы",
          "Рабочая таблица заказов с поиском, фильтрами и карточкой по клику.",
          `<div class="admin-orders-workspace" id="admin-orders-workspace">
            <div class="admin-orders-toolbar-shell">
              <details class="admin-filter-disclosure admin-orders-filter-toggle"${advancedFilterCount ? " open" : ""}>
                <summary class="admin-clients-toolbar-button">
                  <span>Фильтры</span>
                  ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
                </summary>
              </details>
              <div class="admin-orders-toolbar-actions">
                <form
                  class="admin-clients-search-form"
                  method="get"
                  action="${ADMIN_ORDERS_PATH}"
                  data-admin-auto-submit="true"
                  data-admin-auto-submit-delay="600"
                  data-admin-auto-submit-min-length="2"
                  data-admin-auto-submit-restore-focus="true"
                  data-admin-auto-submit-scroll-target="#admin-orders-workspace"
                  data-admin-auto-submit-scroll-offset="18"
                >
                  ${renderAdminHiddenInput("status", filters.status !== "all" ? filters.status : "")}
                  ${renderAdminHiddenInput("serviceType", filters.serviceType !== "all" ? filters.serviceType : "")}
                  ${renderAdminHiddenInput("frequency", filters.frequency !== "all" ? filters.frequency : "")}
                  ${renderAdminHiddenInput("assignment", filters.assignment !== "all" ? filters.assignment : "")}
                  <label class="admin-clients-search-box">
                    <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
                    <input
                      class="admin-input admin-clients-search-input"
                      type="search"
                      name="q"
                      value="${escapeHtmlText(filters.q)}"
                      placeholder="Поиск по клиенту, телефону, адресу, сотруднику или номеру"
                    >
                  </label>
                  <button class="admin-sr-only" type="submit">Обновить поиск</button>
                  ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
                </form>
                ${accessContext.canEdit
                  ? `<div class="admin-dialog-launcher admin-dialog-launcher-inline">
                      <button class="admin-button" type="button" data-admin-dialog-open="${ADMIN_MANUAL_ORDER_DIALOG_ID}">Добавить заказ</button>
                    </div>`
                  : ""}
              </div>
              <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
                <form class="admin-orders-filter-bar" method="get" action="${ADMIN_ORDERS_PATH}">
                  ${renderAdminHiddenInput("q", filters.q)}
                  <label class="admin-label">
                    Статус
                    <select class="admin-input" name="status">
                      <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                      <option value="new"${filters.status === "new" ? " selected" : ""}>Новые</option>
                      <option value="scheduled"${filters.status === "scheduled" ? " selected" : ""}>Запланировано</option>
                      <option value="in-progress"${filters.status === "in-progress" ? " selected" : ""}>В работе</option>
                      <option value="rescheduled"${filters.status === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="invoice-sent"${filters.status === "invoice-sent" ? " selected" : ""}>Инвойс отправлен</option>
                      <option value="paid"${filters.status === "paid" ? " selected" : ""}>Оплачено</option>
                      <option value="awaiting-review"${filters.status === "awaiting-review" ? " selected" : ""}>Ждем отзыв</option>
                      <option value="completed"${filters.status === "completed" ? " selected" : ""}>Завершено</option>
                      <option value="canceled"${filters.status === "canceled" ? " selected" : ""}>Отменено</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Тип уборки
                    <select class="admin-input" name="serviceType">
                      <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                      <option value="standard"${filters.serviceType === "standard" ? " selected" : ""}>Standard</option>
                      <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Deep</option>
                      <option value="move-in/out"${filters.serviceType === "move-in/out" ? " selected" : ""}>Move-in/out</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Повторяемость
                    <select class="admin-input" name="frequency">
                      <option value="all"${filters.frequency === "all" ? " selected" : ""}>Все</option>
                      <option value="weekly"${filters.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                      <option value="biweekly"${filters.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                      <option value="monthly"${filters.frequency === "monthly" ? " selected" : ""}>Monthly</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Назначение
                    <select class="admin-input" name="assignment">
                      <option value="all"${filters.assignment === "all" ? " selected" : ""}>Все</option>
                      <option value="assigned"${filters.assignment === "assigned" ? " selected" : ""}>Назначен</option>
                      <option value="unassigned"${filters.assignment === "unassigned" ? " selected" : ""}>Не назначен</option>
                    </select>
                  </label>
                  <div class="admin-clients-filter-actions">
                    <button class="admin-button" type="submit">Применить</button>
                    <a class="admin-link-button admin-button-secondary" href="${advancedResetHref}">Сбросить фильтры</a>
                  </div>
                </form>
              </div>
            </div>
            ${hasActiveFilters
              ? `<div class="admin-clients-meta-row">
                  <div class="admin-clients-meta-main">
                    <p class="admin-clients-summary-copy">
                      Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalOrders))} заказов.
                      С учётом поиска и фильтров.
                    </p>
                    ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
                  </div>
                </div>`
              : ""}
            ${orders.length > 0
              ? `<div class="admin-table-wrap admin-orders-table-wrap admin-orders-table-wrap-capped">
                  <table class="admin-table admin-orders-table">
                    <colgroup>
                      <col style="width:22%">
                      <col style="width:15%">
                      <col style="width:14%">
                      <col style="width:14%">
                      <col style="width:14%">
                      <col style="width:13%">
                      <col style="width:8%">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Заказ</th>
                        <th>Контакты</th>
                        <th>Дата и время</th>
                        <th>Команда</th>
                        <th>Статус</th>
                        <th>Адрес</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${orders
                        .map((order) =>
                          renderOrderTableRow(order, currentReturnTo, {
                            planningItem: planningByEntryId.get(order.id) || null,
                          })
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
                <section class="admin-orders-funnel-section">
                  <div class="admin-subsection-head">
                    <div>
                      <h3 class="admin-subsection-title">Воронка заказов</h3>
                      <p class="admin-order-detail-copy">Текущая выборка заказов, разложенная по статусам выполнения.</p>
                    </div>
                  </div>
                  <div class="admin-order-funnel-board">
                    <form method="post" action="${ADMIN_ORDERS_PATH}" data-order-funnel-stage-form="true" hidden>
                      <input type="hidden" name="entryId" value="">
                      <input type="hidden" name="orderStatus" value="">
                      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
                    </form>
                    ${funnelStatuses
                      .map((status) =>
                        renderOrdersLane(
                          status,
                          orders.filter(
                            (order) =>
                              getOrderFunnelStatus(order) === status
                          ),
                          currentReturnTo,
                          planningByEntryId,
                          staffSnapshot.staff,
                          {
                            canDelete: accessContext.canDelete,
                            canEdit: accessContext.canEdit,
                            droppable: true,
                          }
                        )
                      )
                      .join("")}
                  </div>
                </section>
                ${orders
                  .map((order) =>
                    renderOrderManagementDialog(order, currentReturnTo, {
                      req,
                      planningItem: planningByEntryId.get(order.id) || null,
                      staffRecords: staffSnapshot.staff,
                      canDelete: accessContext.canDelete,
                      canEdit: accessContext.canEdit,
                      leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                      autoOpen: selectedOrderId === order.id,
                      autoOpenAmountEditor: selectedOrderId === order.id && autoOpenAmountEditor,
                      closeHref: selectedOrderId === order.id ? closeOrderHref : "",
                    })
                  )
                  .join("")}`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
          </div>`,
          { className: "admin-orders-card" }
        )}
        ${accessContext.canEdit ? renderCreateManualOrderDialog({ autoOpen: autoOpenCreateOrderDialog, returnTo: currentReturnTo }) : ""}
        ${renderOrdersFunnelScript(currentReturnTo, accessContext.canEdit)}
        ${renderAdminCard(
          "Ближайшие выезды",
          "Заказы с назначенной датой и временем, отсортированные по ближайшему визиту.",
          renderOrdersUpcomingTable(upcomingOrders),
          { className: "admin-orders-card" }
        )}
      </div>`,
      {
        kicker: false,
        subtitle: "Рабочая таблица заказов и ближайших выездов.",
        sidebar: renderAdminAppSidebar(ADMIN_ORDERS_PATH, accessContext),
      }
    );
  }

  function renderStaffNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    const conflictedStaff = normalizeString(reqUrl.searchParams.get("staff"), 240);
    if (notice === "staff-created") {
      return `<div class="admin-alert admin-alert-info">Сотрудник добавлен в команду.</div>`;
    }
    if (notice === "staff-updated") {
      return `<div class="admin-alert admin-alert-info">Карточка сотрудника обновлена.</div>`;
    }
    if (notice === "staff-deleted") {
      return `<div class="admin-alert admin-alert-info">Сотрудник удалён, его назначения очищены.</div>`;
    }
    if (notice === "assignment-saved") {
      return `<div class="admin-alert admin-alert-info">Назначение и график сохранены.</div>`;
    }
    if (notice === "assignment-saved-calendar-error") {
      return `<div class="admin-alert admin-alert-error">Назначение сохранено, но Google Calendar не обновился. Проверьте подключение у сотрудника.</div>`;
    }
    if (notice === "assignment-cleared") {
      return `<div class="admin-alert admin-alert-info">Назначение очищено.</div>`;
    }
    if (notice === "assignment-conflict") {
      return `<div class="admin-alert admin-alert-error">Назначение не сохранено: ${escapeHtml(conflictedStaff || "сотрудник")} отмечен как unavailable в Google Calendar.</div>`;
    }
    if (notice === "calendar-connected") {
      return `<div class="admin-alert admin-alert-info">Google Calendar подключён. Подтверждённые назначения теперь будут уходить в календарь сотрудника.</div>`;
    }
    if (notice === "calendar-disconnected") {
      return `<div class="admin-alert admin-alert-info">Google Calendar отключён у сотрудника.</div>`;
    }
    if (notice === "calendar-connect-denied") {
      return `<div class="admin-alert admin-alert-error">Подключение Google Calendar отменено на стороне Google.</div>`;
    }
    if (notice === "calendar-unavailable") {
      return `<div class="admin-alert admin-alert-error">Google Calendar ещё не настроен на сервере. Добавьте OAuth credentials в Render.</div>`;
    }
    if (notice === "calendar-connect-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось подключить Google Calendar. Попробуйте ещё раз.</div>`;
    }
    if (notice === "w9-reminder-sent") {
      return `<div class="admin-alert admin-alert-info">Напоминание о Contract и W-9 отправлено сотруднику повторно.</div>`;
    }
    if (notice === "w9-reminder-unavailable") {
      return `<div class="admin-alert admin-alert-error">Автоматическая отправка email сейчас не настроена. Подключите почту в разделе «Настройки → Пользователи».</div>`;
    }
    if (notice === "w9-reminder-admin") {
      return `<div class="admin-alert admin-alert-info">Для админов onboarding-документы не отправляются: они не участвуют в разделе сотрудников.</div>`;
    }
    if (notice === "w9-reminder-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось отправить напоминание о Contract и W-9. Проверьте почтовые настройки и попробуйте ещё раз.</div>`;
    }
    if (notice === "staff-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Проверьте форму и попробуйте снова.</div>`;
    }
    return "";
  }

  function renderStaffOverviewStrip(planning) {
    const items = [
      {
        label: "Команда",
        value: planning.staff.length,
        copy: "Всего сотрудников в базе команды.",
        tone: "accent",
      },
      {
        label: "Активны",
        value: planning.activeStaffCount,
        copy: "Можно ставить в график прямо сейчас.",
        tone: "success",
      },
      {
        label: "Назначены",
        value: planning.assignedScheduledCount,
        copy: "Заказы уже закрыты командой.",
        tone: "default",
      },
      {
        label: "Пробелы",
        value: planning.unassignedScheduledCount,
        copy: "Смены ещё ждут назначения.",
        tone: planning.unassignedScheduledCount > 0 ? "danger" : "default",
      },
    ];

    return `<div class="admin-compact-summary-strip">
      ${items.map((item) => `
        <article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
          <div class="admin-compact-summary-head">
            <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
            <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
          </div>
          <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
        </article>
      `).join("")}
    </div>`;
  }

  function getStaffDialogId(staffId) {
    const normalized = normalizeString(staffId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-staff-edit-dialog-${safeSuffix || "record"}`;
  }

  function renderStaffAddressField(options = {}) {
    const inputId = normalizeString(options.id, 160);
    const fieldName = normalizeString(options.name, 80) || "address";
    const placeholder =
      normalizeString(options.placeholder, 200) || "215 North Elm Street, Naperville, IL";
    const value = normalizeString(options.value, 500);
    const suggestionsId = inputId ? `${inputId}-suggestions` : "";
    const requiredAttr = options.required ? " required" : "";

    return `<label class="admin-label">
      Адрес
      <div class="admin-address-field" data-admin-address-field>
        <input
          class="admin-input"
          type="text"
          name="${escapeHtmlAttribute(fieldName)}"
          value="${escapeHtmlAttribute(value)}"
          placeholder="${escapeHtmlAttribute(placeholder)}"
          autocomplete="off"
          data-admin-address-autocomplete="true"
          data-admin-address-country="us"
          aria-autocomplete="list"
          aria-expanded="false"${inputId ? ` id="${escapeHtmlAttribute(inputId)}"` : ""}${suggestionsId ? ` aria-controls="${escapeHtmlAttribute(suggestionsId)}"` : ""}${requiredAttr}
        >
        <div class="admin-address-suggestions" data-admin-address-suggestions hidden role="listbox"${suggestionsId ? ` id="${escapeHtmlAttribute(suggestionsId)}"` : ""}></div>
      </div>
    </label>`;
  }

  function renderStaffAddressAutocompleteScript() {
    if (!GOOGLE_PLACES_API_KEY) return "";

    return `<script>
      (() => {
        const adminPlacesApiKey = ${JSON.stringify(GOOGLE_PLACES_API_KEY)};
        if (!adminPlacesApiKey) return;

        function escapeSuggestionHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        }

        function createPlacesApi() {
          const placesNamespace = window.google && window.google.maps && window.google.maps.places;
          if (!placesNamespace) return null;
          const host = document.createElement("div");
          host.hidden = true;
          document.body.appendChild(host);
          return {
            autocompleteService: new placesNamespace.AutocompleteService(),
            placesService: new placesNamespace.PlacesService(host),
            placesStatus: placesNamespace.PlacesServiceStatus,
            sessionTokenCtor: placesNamespace.AutocompleteSessionToken,
          };
        }

        function loadPlacesApi() {
          if (window.__adminPlacesApiPromise) return window.__adminPlacesApiPromise;
          if (window.google && window.google.maps && window.google.maps.places) {
            window.__adminPlacesApiPromise = Promise.resolve(createPlacesApi());
            return window.__adminPlacesApiPromise;
          }

          window.__adminPlacesApiPromise = new Promise((resolve, reject) => {
            window.__adminGooglePlacesReady = () => resolve(createPlacesApi());

            const existingScript = document.querySelector('script[data-admin-google-places="true"]');
            if (existingScript) return;

            const script = document.createElement("script");
            script.async = true;
            script.defer = true;
            script.setAttribute("data-admin-google-places", "true");
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(adminPlacesApiKey) + "&libraries=places&loading=async&v=beta&callback=__adminGooglePlacesReady";
            script.onerror = () => reject(new Error("Failed to load Google Places"));
            document.head.appendChild(script);
          }).catch(() => null);

          return window.__adminPlacesApiPromise;
        }

        function bindAutocomplete(input, placesApi) {
          if (!input || input.dataset.adminAddressBound === "true") return;
          const field = input.closest("[data-admin-address-field]");
          const suggestions = field ? field.querySelector("[data-admin-address-suggestions]") : null;
          if (!field || !suggestions) return;

          input.dataset.adminAddressBound = "true";

          const autocompleteService = placesApi.autocompleteService;
          const placesService = placesApi.placesService;
          const placesStatus = placesApi.placesStatus;
          const SessionToken = placesApi.sessionTokenCtor;
          const country = input.getAttribute("data-admin-address-country") || "us";
          let currentPredictions = [];
          let pendingRequestId = 0;
          let inputTimer = null;
          let blurTimer = null;
          let sessionToken = typeof SessionToken === "function" ? new SessionToken() : null;

          function resetSessionToken() {
            sessionToken = typeof SessionToken === "function" ? new SessionToken() : null;
          }

          function closeSuggestions() {
            currentPredictions = [];
            suggestions.hidden = true;
            suggestions.innerHTML = "";
            input.setAttribute("aria-expanded", "false");
          }

          function openSuggestions() {
            if (!suggestions.innerHTML.trim()) return;
            suggestions.hidden = false;
            input.setAttribute("aria-expanded", "true");
          }

          function applySelectedAddress(value) {
            input.value = value || "";
            closeSuggestions();
            resetSessionToken();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }

          function renderPredictions(predictions) {
            currentPredictions = predictions.slice(0, 6);
            suggestions.innerHTML = currentPredictions
              .map((prediction, index) => {
                const formatting = prediction.structured_formatting || {};
                const mainText = formatting.main_text || prediction.description || "";
                const secondaryText = formatting.secondary_text || "";
                return '<button class="admin-address-suggestion" type="button" role="option" data-admin-address-option="' + index + '">' +
                  '<span class="admin-address-suggestion-main">' + escapeSuggestionHtml(mainText) + '</span>' +
                  (secondaryText
                    ? '<span class="admin-address-suggestion-copy">' + escapeSuggestionHtml(secondaryText) + '</span>'
                    : "") +
                '</button>';
              })
              .join("");
            openSuggestions();
          }

          function requestPredictions(query) {
            const trimmed = String(query || "").trim();
            if (trimmed.length < 3) {
              closeSuggestions();
              return;
            }

            const requestId = ++pendingRequestId;
            const request = {
              input: trimmed,
              componentRestrictions: { country },
              types: ["address"],
            };
            if (sessionToken) {
              request.sessionToken = sessionToken;
            }

            autocompleteService.getPlacePredictions(request, (predictions, status) => {
              if (requestId !== pendingRequestId) return;
              if (
                status !== placesStatus.OK ||
                !Array.isArray(predictions) ||
                predictions.length === 0
              ) {
                closeSuggestions();
                return;
              }
              renderPredictions(predictions);
            });
          }

          input.addEventListener("input", () => {
            if (blurTimer) {
              window.clearTimeout(blurTimer);
              blurTimer = null;
            }
            window.clearTimeout(inputTimer);
            inputTimer = window.setTimeout(() => requestPredictions(input.value), 120);
          });

          input.addEventListener("focus", () => {
            if (suggestions.innerHTML.trim()) {
              openSuggestions();
            } else if (input.value.trim().length >= 3) {
              requestPredictions(input.value);
            }
          });

          input.addEventListener("blur", () => {
            blurTimer = window.setTimeout(closeSuggestions, 140);
          });

          suggestions.addEventListener("mousedown", (event) => {
            const option = event.target.closest("[data-admin-address-option]");
            if (!option) return;
            event.preventDefault();
            const index = Number(option.getAttribute("data-admin-address-option"));
            const prediction = currentPredictions[index];
            if (!prediction) return;

            const fallbackAddress = prediction.description || "";
            if (!prediction.place_id) {
              applySelectedAddress(fallbackAddress);
              return;
            }

            const detailsRequest = {
              placeId: prediction.place_id,
              fields: ["formatted_address"],
            };
            if (sessionToken) {
              detailsRequest.sessionToken = sessionToken;
            }

            placesService.getDetails(detailsRequest, (place, status) => {
              const formattedAddress =
                status === placesStatus.OK && place && place.formatted_address
                  ? place.formatted_address
                  : fallbackAddress;
              applySelectedAddress(formattedAddress);
            });
          });

          document.addEventListener("click", (event) => {
            if (!field.contains(event.target)) {
              closeSuggestions();
            }
          });
        }

        function bindAddressInputs(scope = document) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          loadPlacesApi().then((placesApi) => {
            if (!placesApi) return;
            targetScope.querySelectorAll('[data-admin-address-autocomplete="true"]').forEach((input) => bindAutocomplete(input, placesApi));
          });
        }

        window.__adminLoadMapsApi = loadPlacesApi;
        window.__adminBindAddressAutocomplete = bindAddressInputs;
        bindAddressInputs(document);
      })();
    </script>`;
  }

  function renderStaffTravelEstimateScript() {
    if (!GOOGLE_PLACES_API_KEY) return "";

    return `<script>
      (() => {
        const estimateNodes = Array.from(document.querySelectorAll('[data-admin-travel-estimate="true"]'));
        if (!estimateNodes.length) return;

        const cache = window.__adminTravelEstimateCache || (window.__adminTravelEstimateCache = new Map());
        const TRAVEL_TIME_BUFFER_MINUTES = 5;

        function getMapsApi() {
          if (typeof window.__adminLoadMapsApi === "function") {
            return window.__adminLoadMapsApi().then(() => window.google && window.google.maps ? window.google.maps : null);
          }
          return Promise.resolve(window.google && window.google.maps ? window.google.maps : null);
        }

        function getRoutesApi() {
          if (window.__adminRoutesApiPromise) return window.__adminRoutesApiPromise;
          window.__adminRoutesApiPromise = getMapsApi()
            .then(async (mapsApi) => {
              if (!mapsApi || typeof mapsApi.importLibrary !== "function") {
                return null;
              }
              const routesLibrary = await mapsApi.importLibrary("routes");
              return {
                mapsApi,
                routesLibrary,
              };
            })
            .catch((error) => {
              window.__adminRoutesApiError = error;
              return null;
            });
          return window.__adminRoutesApiPromise;
        }

        function buildRouteKey(origin, destination, departureMs) {
          const departureBucket = departureMs > 0 ? Math.round(departureMs / (15 * 60 * 1000)) : 0;
          return [origin.trim().toLowerCase(), destination.trim().toLowerCase(), String(departureBucket)].join("::");
        }

        function updateNodes(nodes, formatter) {
          nodes.forEach((node) => {
            const sourceLabel = node.getAttribute("data-admin-travel-source-label") || "Маршрут";
            node.textContent = formatter(sourceLabel);
          });
        }

        function formatDurationFromMillis(durationMillis) {
          if (!Number.isFinite(durationMillis) || durationMillis <= 0) return "";
          const bufferedDurationMillis = durationMillis + (TRAVEL_TIME_BUFFER_MINUTES * 60 * 1000);
          const totalMinutes = Math.max(1, Math.round(bufferedDurationMillis / 60000));
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          if (hours > 0 && minutes > 0) {
            return hours + " hr " + minutes + " min";
          }
          if (hours > 0) {
            return hours + " hr";
          }
          return totalMinutes + " min";
        }

        function formatDistanceFromMeters(distanceMeters) {
          if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return "";
          const miles = distanceMeters / 1609.344;
          if (miles >= 10) return Math.round(miles) + " mi";
          if (miles >= 1) return miles.toFixed(1).replace(/\\.0$/, "") + " mi";
          const feet = Math.round(distanceMeters * 3.28084);
          return feet + " ft";
        }

        function resolveRouteUnavailableReason(error) {
          const message = String(
            (error && (error.message || error.status || error.code)) || error || ""
          )
            .trim()
            .toLowerCase();
          if (!message) return "маршрут недоступен";
          if (
            message.includes("routes api") &&
            (message.includes("not enabled") ||
              message.includes("disabled") ||
              message.includes("has not been used"))
          ) {
            return "включите Routes API в Google Cloud";
          }
          if (message.includes("request_denied") || message.includes("api key") || message.includes("referer")) {
            return "ключ Google Maps не имеет доступа к Routes API";
          }
          if (message.includes("billing")) {
            return "для Routes API нужен включённый billing";
          }
          if (message.includes("route_not_found") || message.includes("zero_results")) {
            return "маршрут не найден";
          }
          return "маршрут недоступен";
        }

        function createUnavailableFormatter(reason) {
          const message = reason || "маршрут недоступен";
          return (sourceLabel) => sourceLabel + ": " + message;
        }

        function resolveRoute(nodes, apiBundle) {
          const sampleNode = nodes[0];
          const origin = sampleNode.getAttribute("data-admin-travel-origin") || "";
          const destination = sampleNode.getAttribute("data-admin-travel-destination") || "";
          const departureMs = Number(sampleNode.getAttribute("data-admin-travel-departure") || "0");
          if (!origin || !destination) {
            updateNodes(nodes, createUnavailableFormatter("маршрут недоступен"));
            return;
          }

          const cacheKey = buildRouteKey(origin, destination, departureMs);
          if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            updateNodes(nodes, (sourceLabel) => cached(sourceLabel));
            return;
          }

          const mapsApi = apiBundle && apiBundle.mapsApi ? apiBundle.mapsApi : null;
          const routesLibrary = apiBundle && apiBundle.routesLibrary ? apiBundle.routesLibrary : null;
          const RouteMatrix = routesLibrary && routesLibrary.RouteMatrix;
          const RoutingPreference = routesLibrary && routesLibrary.RoutingPreference;
          const RouteMatrixItemCondition = routesLibrary && routesLibrary.RouteMatrixItemCondition;
          const units = mapsApi && mapsApi.UnitSystem && mapsApi.UnitSystem.IMPERIAL
            ? mapsApi.UnitSystem.IMPERIAL
            : "IMPERIAL";
          if (!RouteMatrix || typeof RouteMatrix.computeRouteMatrix !== "function") {
            const fallbackFormatter = createUnavailableFormatter("Routes API не загрузился");
            cache.set(cacheKey, fallbackFormatter);
            updateNodes(nodes, fallbackFormatter);
            return;
          }

          const request = {
            origins: [origin],
            destinations: [destination],
            travelMode: "DRIVING",
            units,
            fields: [
              "condition",
              "distanceMeters",
              "durationMillis",
              "staticDurationMillis",
              "localizedValues.distance",
              "localizedValues.duration",
              "localizedValues.staticDuration",
              "error",
            ],
          };
          if (Number.isFinite(departureMs) && departureMs > Date.now() - (15 * 60 * 1000)) {
            request.departureTime = new Date(departureMs);
            request.routingPreference =
              RoutingPreference && RoutingPreference.TRAFFIC_AWARE
                ? RoutingPreference.TRAFFIC_AWARE
                : "TRAFFIC_AWARE";
          }

          RouteMatrix.computeRouteMatrix(request)
            .then((response) => {
              const item =
                response &&
                response.matrix &&
                response.matrix.rows &&
                response.matrix.rows[0] &&
                response.matrix.rows[0].items &&
                response.matrix.rows[0].items[0];
              const routeExists =
                item &&
                (item.condition === "ROUTE_EXISTS" ||
                  (RouteMatrixItemCondition &&
                    item.condition === RouteMatrixItemCondition.ROUTE_EXISTS));
              if (!routeExists) {
                const fallbackFormatter = createUnavailableFormatter(
                  item && item.error
                    ? resolveRouteUnavailableReason(item.error)
                    : item && item.condition === "ROUTE_NOT_FOUND"
                      ? "маршрут не найден"
                      : "маршрут недоступен"
                );
                cache.set(cacheKey, fallbackFormatter);
                updateNodes(nodes, fallbackFormatter);
                return;
              }

              const localizedValues = item && item.localizedValues ? item.localizedValues : null;
              const durationText =
                formatDurationFromMillis(
                  Number(item && (item.durationMillis || item.staticDurationMillis))
                );
              const distanceText =
                localizedValues && localizedValues.distance
                  ? localizedValues.distance
                  : formatDistanceFromMeters(Number(item && item.distanceMeters));
              const successFormatter = (sourceLabel) =>
                [sourceLabel, durationText, distanceText].filter(Boolean).join(" • ");
              cache.set(cacheKey, successFormatter);
              updateNodes(nodes, successFormatter);
            })
            .catch((error) => {
              const fallbackFormatter = createUnavailableFormatter(
                resolveRouteUnavailableReason(error)
              );
              cache.set(cacheKey, fallbackFormatter);
              updateNodes(nodes, fallbackFormatter);
            });
        }

        getRoutesApi().then((apiBundle) => {
          if (!apiBundle) {
            const fallbackFormatter = createUnavailableFormatter(
              resolveRouteUnavailableReason(window.__adminRoutesApiError)
            );
            estimateNodes.forEach((node) => {
              const sourceLabel = node.getAttribute("data-admin-travel-source-label") || "Маршрут";
              node.textContent = node.getAttribute("data-admin-travel-fallback") || fallbackFormatter(sourceLabel);
            });
            return;
          }

          const groupedNodes = new Map();
          estimateNodes.forEach((node) => {
            const origin = node.getAttribute("data-admin-travel-origin") || "";
            const destination = node.getAttribute("data-admin-travel-destination") || "";
            const departureMs = Number(node.getAttribute("data-admin-travel-departure") || "0");
            const key = buildRouteKey(origin, destination, departureMs);
            const group = groupedNodes.get(key) || [];
            group.push(node);
            groupedNodes.set(key, group);
          });

          groupedNodes.forEach((nodes) => resolveRoute(nodes, apiBundle));
        });
      })();
    </script>`;
  }

  function renderStaffTeamCalendarDragScript() {
    return `<script>
      (() => {
        const calendarWraps = Array.from(document.querySelectorAll('[data-admin-team-calendar-scroll="true"]'));
        if (!calendarWraps.length) return;

        const getDialogTrigger = (target) =>
          target && target.closest ? target.closest('[data-admin-dialog-open]') : null;

        const isBlockedInteractiveTarget = (target) =>
          Boolean(
            target &&
            target.closest &&
            target.closest('input, select, textarea, summary, label, [data-admin-dialog-close]')
          );

        calendarWraps.forEach((wrap) => {
          let pointerId = null;
          let startX = 0;
          let startScrollLeft = 0;
          let suppressClick = false;
          let hasCenteredAnchor = false;
          let pendingDialogTrigger = null;

          const scrollToCell = (cell, behavior = 'auto') => {
            if (!cell) return;
            const targetScrollLeft = Math.max(
              0,
              cell.offsetLeft - (wrap.clientWidth / 2) + (cell.clientWidth / 2)
            );
            wrap.scrollTo({ left: targetScrollLeft, behavior });
          };

          const centerAnchorCell = () => {
            if (hasCenteredAnchor) return;
            const anchor = wrap.querySelector('[data-admin-team-calendar-anchor="true"]');
            if (!anchor) return;
            hasCenteredAnchor = true;
            scrollToCell(anchor);
          };

          const scrollToTodayCell = () => {
            const todayCell = wrap.querySelector('[data-admin-team-calendar-today="true"]');
            if (todayCell) {
              scrollToCell(todayCell, 'smooth');
              return;
            }
            const anchor = wrap.querySelector('[data-admin-team-calendar-anchor="true"]');
            scrollToCell(anchor, 'smooth');
          };

          const stopDragging = () => {
            pointerId = null;
            pendingDialogTrigger = null;
            wrap.classList.remove('admin-team-calendar-wrap-dragging');
            window.setTimeout(() => {
              suppressClick = false;
            }, 0);
          };

          wrap.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (isBlockedInteractiveTarget(event.target)) return;

            pendingDialogTrigger = getDialogTrigger(event.target);
            pointerId = event.pointerId;
            startX = event.clientX;
            startScrollLeft = wrap.scrollLeft;
            suppressClick = false;
            wrap.classList.add('admin-team-calendar-wrap-dragging');

            if (pendingDialogTrigger) {
              event.preventDefault();
            }

            if (typeof wrap.setPointerCapture === 'function') {
              wrap.setPointerCapture(event.pointerId);
            }
          });

          wrap.addEventListener('pointermove', (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;

            const deltaX = event.clientX - startX;
            if (Math.abs(deltaX) > 4) {
              suppressClick = true;
            }
            wrap.scrollLeft = startScrollLeft - deltaX;
            if (suppressClick) {
              event.preventDefault();
            }
          });

          wrap.addEventListener('pointerup', (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            const dialogTrigger = !suppressClick && pendingDialogTrigger ? pendingDialogTrigger : null;
            stopDragging();
            if (dialogTrigger && typeof dialogTrigger.click === 'function') {
              window.requestAnimationFrame(() => {
                dialogTrigger.click();
              });
            }
          });
          wrap.addEventListener('pointercancel', stopDragging);
          wrap.addEventListener('lostpointercapture', stopDragging);

          wrap.addEventListener(
            'click',
            (event) => {
              if (!suppressClick) return;
              event.preventDefault();
              event.stopPropagation();
            },
            true
          );

          if (document.readyState === 'complete') {
            centerAnchorCell();
          } else {
            window.addEventListener('load', centerAnchorCell, { once: true });
          }
          window.requestAnimationFrame(centerAnchorCell);

          const shell = wrap.closest('.admin-team-calendar-shell');
          const todayButton = shell
            ? shell.querySelector('[data-admin-team-calendar-scroll-today="true"]')
            : null;
          if (todayButton) {
            todayButton.addEventListener('click', (event) => {
              event.preventDefault();
              scrollToTodayCell();
            });
          }
        });
      })();
    </script>`;
  }

  function getStaffNextOrderName(staffSummary) {
    if (!staffSummary || !staffSummary.nextOrder) return "Ожидает назначения";
    return (
      staffSummary.nextOrder.entry.customerName ||
      staffSummary.nextOrder.entry.fullAddress ||
      staffSummary.nextOrder.entry.requestId ||
      "Заказ"
    );
  }

  function renderStaffCalendarPanel(staffSummary) {
    const calendarMeta =
      staffSummary && staffSummary.calendarMeta && typeof staffSummary.calendarMeta === "object"
        ? staffSummary.calendarMeta
        : { configured: false, connected: false };

    if (!calendarMeta.configured) {
      return `<section class="admin-client-section admin-client-section-side admin-staff-calendar-section">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">Google Calendar</h3>
          <span class="admin-action-hint">Не настроен</span>
        </div>
        <div class="admin-empty-state">Чтобы подключать календарь клинера и учитывать day off, добавьте Google OAuth credentials в Render.</div>
      </section>`;
    }

    const connectHref = `${ADMIN_STAFF_GOOGLE_CONNECT_PATH}?staffId=${encodeURIComponent(staffSummary.id)}`;
    const infoItems = calendarMeta.connected
      ? [
          { label: "Аккаунт", value: calendarMeta.accountEmail || "Подключён" },
          { label: "Рабочий календарь", value: calendarMeta.workCalendarName || "SHYNLI Work" },
          { label: "Day off", value: calendarMeta.unavailableCalendarName || "SHYNLI Unavailable" },
          {
            label: "Следующий unavailable",
            value: calendarMeta.nextUnavailableLabel || "Пока нет блоков",
            wide: true,
          },
          {
            label: "Подсказка",
            value: "Клинер отмечает выходные и недоступность в календаре SHYNLI Unavailable. Подтверждённые заказы прилетают в SHYNLI Work.",
            wide: true,
          },
        ]
      : [
          {
            label: "Статус",
            value: "Google Calendar пока не подключён",
            wide: true,
          },
          {
            label: "Что произойдёт",
            value: "После подключения подтверждённые уборки будут попадать в календарь сотрудника, а day off из SHYNLI Unavailable будет блокировать назначения.",
            wide: true,
          },
        ];

    return `<section class="admin-client-section admin-client-section-side admin-staff-calendar-section">
      <div class="admin-subsection-head">
        <h3 class="admin-subsection-title">Google Calendar</h3>
        <span class="admin-action-hint">${escapeHtml(calendarMeta.connected ? "Подключён" : "Ожидает подключения")}</span>
      </div>
      ${calendarMeta.syncError ? `<div class="admin-alert admin-alert-error">${escapeHtml(calendarMeta.syncError)}</div>` : ""}
      ${renderAdminClientInfoGrid(infoItems, { compact: true })}
      <div class="admin-inline-actions admin-staff-calendar-actions">
        ${calendarMeta.connected
          ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(connectHref)}">Переподключить</a>
              <form method="post" action="${ADMIN_STAFF_PATH}">
                <input type="hidden" name="action" value="disconnect-google-calendar">
                <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
                <button class="admin-button admin-button-secondary" type="submit">Отключить</button>
              </form>`
          : `<a class="admin-button" href="${escapeHtmlAttribute(connectHref)}">Подключить Google Calendar</a>`}
      </div>
    </section>`;
  }

  function renderStaffEditDialog(staffSummary, options = {}) {
    const canDelete = options.canDelete !== false;
    const linkedUser = staffSummary && staffSummary.linkedUser ? staffSummary.linkedUser : null;
    const accessRoleValue =
      linkedUser && linkedUser.role
        ? linkedUser.role
        : inferWorkspaceRoleValue(staffSummary.role) || "cleaner";
    const roleLabel = formatWorkspaceRoleLabel(accessRoleValue);
    const nextShiftLabel = staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены";
    const formattedPhone = formatAdminPhoneNumber(staffSummary.phone) || "";
    const contactLabel = [formattedPhone, staffSummary.email].filter(Boolean).join(" • ") || "Контакты не указаны";
    const nextOrderName = getStaffNextOrderName(staffSummary);
    const compensationLabel = formatStaffCompensationLabel(staffSummary);
    const calendarMeta =
      staffSummary && staffSummary.calendarMeta && typeof staffSummary.calendarMeta === "object"
        ? staffSummary.calendarMeta
        : { configured: false, connected: false };
    const detailReturnTo = (() => {
      try {
        const reqUrl = getRequestUrl(options.req);
        return `${reqUrl.pathname}${reqUrl.search}`;
      } catch {
        return ADMIN_STAFF_PATH;
      }
    })();
    const dialogId = getStaffDialogId(staffSummary.id);
    const editFormId = `${dialogId}-form`;
    const editPanelId = `${dialogId}-edit-panel`;
    const titleLabel = staffSummary.name || "Сотрудник";
    const summaryBadges = [
      renderStaffStatusBadge(staffSummary.status),
      renderAdminBadge(roleLabel, accessRoleValue === "admin" ? "success" : accessRoleValue === "manager" ? "outline" : "muted"),
      renderAdminBadge(
        staffSummary.nextOrder ? "Есть ближайшая смена" : "Свободен",
        staffSummary.nextOrder ? "default" : "muted"
      ),
      calendarMeta.configured
        ? renderAdminBadge(
            calendarMeta.connected ? "Google Calendar" : "Calendar не подключён",
            calendarMeta.connected ? "success" : "muted"
          )
        : "",
    ].join("");
    const heroCopy = staffSummary.nextOrder
      ? `Ближайший выезд запланирован на ${nextShiftLabel}. Следующий заказ: ${nextOrderName}.`
      : "Сотрудник пока свободен: карточка готова для контактов, адреса и будущих назначений.";
    const workloadItems = [
      { label: "Следующая смена", value: nextShiftLabel },
      { label: "Следующий заказ", value: nextOrderName },
      { label: "В графике", value: formatOrderCountLabel(staffSummary.scheduledCount) },
      { label: "На 7 дней", value: formatOrderCountLabel(staffSummary.upcomingWeekCount) },
      { label: "Заметки", value: staffSummary.notes || "Пока без внутренних заметок", wide: true },
    ];
    const contractRecord = staffSummary && staffSummary.contract ? staffSummary.contract : null;
    const w9Record = staffSummary && staffSummary.w9 ? staffSummary.w9 : null;
    const contractDownloadPath =
      contractRecord && contractRecord.document && contractRecord.document.relativePath
        ? `${ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH}?staffId=${encodeURIComponent(staffSummary.id)}`
        : "";
    const w9DownloadPath =
      w9Record && w9Record.document && w9Record.document.relativePath
        ? `${ADMIN_STAFF_W9_DOWNLOAD_PATH}?staffId=${encodeURIComponent(staffSummary.id)}`
        : "";
    const w9ReminderAvailable = Boolean(
      linkedUser &&
        linkedUser.id &&
        linkedUser.email &&
        !isAdminLinkedUser(linkedUser)
    );
    const documentsInfoItems = [
      {
        label: "Contract",
        value: contractRecord ? "PDF прикреплён" : "Ещё не подписан",
      },
      {
        label: "W-9",
        value: w9Record ? "PDF прикреплён" : "Ещё не заполнен",
      },
      {
        label: "Contract подписан",
        value: contractRecord && contractRecord.generatedAt
          ? formatAdminDateTime(contractRecord.generatedAt)
          : "Не указано",
      },
      {
        label: "W-9 сформирован",
        value: w9Record && w9Record.generatedAt
          ? formatAdminDateTime(w9Record.generatedAt)
          : "Не указано",
      },
      {
        label: "Tax classification",
        value: w9Record
          ? formatW9FederalTaxClassificationLabel(w9Record.federalTaxClassification)
          : "Не указано",
      },
      {
        label: "TIN",
        value: w9Record
          ? `${formatW9TinTypeLabel(w9Record.tinType)} ${w9Record.maskedTin || ""}`.trim()
          : "Не указано",
      },
      {
        label: "Адрес",
        value:
          (w9Record &&
            [w9Record.addressLine1, w9Record.cityStateZip].filter(Boolean).join(", ")) ||
          (contractRecord &&
            [
              contractRecord.contractorAddressLine1,
              contractRecord.contractorCityStateZip,
            ]
              .filter(Boolean)
              .join(", ")) ||
          "Не указан",
        wide: true,
      },
    ];
    const documentsComplete = Boolean(contractRecord && w9Record);
    const documentsPanelMarkup = `${renderAdminClientInfoGrid(documentsInfoItems)}
      <div class="admin-inline-actions admin-w9-preview-actions">
        ${contractDownloadPath
          ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(contractDownloadPath)}" download>Скачать Contract</a>`
          : ""}
        ${w9DownloadPath
          ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(w9DownloadPath)}" download>Скачать W-9</a>`
          : ""}
        ${!documentsComplete && w9ReminderAvailable
          ? `<form class="admin-inline-actions admin-w9-empty-actions" method="post" action="${ADMIN_STAFF_PATH}">
              <input type="hidden" name="action" value="resend-staff-w9-reminder">
              <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
              <input type="hidden" name="userId" value="${escapeHtmlAttribute(linkedUser.id)}">
              <input type="hidden" name="staffName" value="${escapeHtmlAttribute(staffSummary.name || linkedUser.email)}">
              <button class="admin-button admin-button-secondary" type="submit">Отправить повторно</button>
            </form>`
          : ""}
      </div>
      ${!documentsComplete
        ? `<div class="admin-alert admin-alert-muted" style="margin-top:16px;">Сотрудник ещё не завершил onboarding-документы. Напоминание отправит ссылку на Contract + W-9 в личном кабинете.</div>`
        : ""}`;

    return `<dialog class="admin-dialog" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel admin-staff-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Команда</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(titleLabel)} <span class="admin-staff-dialog-title-role">(${escapeHtml(roleLabel)})</span></h2>
                <div class="admin-dialog-hero-meta-stack">
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(contactLabel)}</p>
                  ${staffSummary.address ? `<p class="admin-dialog-hero-detail admin-staff-dialog-address">${escapeHtml(staffSummary.address)}</p>` : ""}
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${renderAdminToggleIconButton("Редактировать сотрудника", editPanelId, {
              openLabel: "Скрыть",
              closedLabel: "Редактировать сотрудника",
            })}
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <div class="admin-client-dialog-body admin-staff-dialog-body">
          <section class="admin-client-summary-panel admin-staff-summary-panel">
            <div class="admin-client-summary-head">
              <div class="admin-client-summary-copy-block">
                <div class="admin-badge-row admin-client-badge-row">
                  ${summaryBadges}
                </div>
                <p class="admin-client-summary-copy">${escapeHtml(heroCopy)}</p>
              </div>
            </div>
            <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">Роль</span>
                <p class="admin-client-metric-value">${escapeHtml(roleLabel)}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">Оплата</span>
                <p class="admin-client-metric-value">${escapeHtml(compensationLabel)}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">В графике</span>
                <p class="admin-client-metric-value">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">На 7 дней</span>
                <p class="admin-client-metric-value">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">Следующая смена</span>
                <p class="admin-client-metric-value">${escapeHtml(nextShiftLabel)}</p>
              </article>
            </div>
          </section>
          <section class="admin-client-section admin-client-section-side admin-staff-workload-section">
            <div class="admin-subsection-head">
              <h3 class="admin-subsection-title">Рабочая сводка</h3>
              <span class="admin-action-hint">Смены и заметки</span>
            </div>
            ${renderAdminClientInfoGrid(workloadItems)}
          </section>
          <section class="admin-client-section admin-client-section-side admin-staff-workload-section">
            <div class="admin-subsection-head">
              <h3 class="admin-subsection-title">Документы сотрудника</h3>
              <span class="admin-action-hint">Contract и W-9</span>
            </div>
            ${documentsPanelMarkup}
          </section>
          ${renderAdminGhlSmsComposer({
            req: options.req,
            actionPath: ADMIN_STAFF_PATH,
            targetType: "staff",
            targetRef: staffSummary.id,
            targetFieldName: "staffId",
            targetFieldValue: staffSummary.id,
            returnTo: detailReturnTo,
            phone: staffSummary.phone,
            contactId: "",
            historyEntries: getStaffSmsHistoryEntries(staffSummary),
            leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
            canEdit: options.canEdit,
            noticePrefix: "staff",
            title: "SMS сотруднику",
            description: "Быстрая отправка сообщения сотруднику через Go High Level.",
            messagePlaceholder: "Напишите сотруднику короткое SMS-сообщение...",
          })}
          ${renderStaffCalendarPanel(staffSummary)}
          <section class="admin-client-section admin-staff-form-section" id="${escapeHtmlAttribute(editPanelId)}" data-admin-toggle-panel hidden>
            <form
              class="admin-form-grid"
              id="${escapeHtmlAttribute(editFormId)}"
              method="post"
              action="${ADMIN_STAFF_PATH}"
              data-admin-async-save="true"
              data-admin-async-success="Карточка сотрудника сохранена."
              data-admin-async-error="Не удалось сохранить карточку сотрудника."
            >
              <input type="hidden" name="action" value="update-staff">
              <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
              ${linkedUser ? `<input type="hidden" name="userId" value="${escapeHtmlAttribute(linkedUser.id)}">` : ""}
              <div class="admin-form-grid admin-form-grid-two">
                <label class="admin-label">
                  Имя
                  <input class="admin-input" type="text" name="name" value="${escapeHtmlText(staffSummary.name)}" required>
                </label>
                <label class="admin-label">
                  Роль
                  <select class="admin-input" name="role">
                    ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}"${accessRoleValue === role ? " selected" : ""}>${escapeHtml(formatWorkspaceRoleLabel(role))}</option>`).join("")}
                  </select>
                  <small class="admin-field-hint">Эта роль используется и в карточке сотрудника, и для прав доступа.</small>
                </label>
                ${renderAdminPhoneInput("phone", staffSummary.phone)}
                <label class="admin-label">
                  Email
                  <input class="admin-input" type="email" name="email" value="${escapeHtmlText(staffSummary.email)}" placeholder="team@shynli.com">
                </label>
                ${renderStaffCompensationFields({
                  value: staffSummary.compensationValue,
                  type: staffSummary.compensationType,
                })}
              </div>
              ${renderStaffAddressField({
                id: `${dialogId}-address`,
                value: staffSummary.address,
              })}
              <label class="admin-label">
                Статус
                <select class="admin-input" name="status">
                  ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${staffSummary.status === status ? " selected" : ""}>${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
                </select>
              </label>
              <label class="admin-label">
                Заметки
                <textarea class="admin-input" name="notes" placeholder="Районы, предпочтительные смены, ключи, транспорт">${escapeHtml(staffSummary.notes)}</textarea>
              </label>
              <p class="admin-field-note" data-admin-async-feedback hidden></p>
            </form>
            <div class="admin-dialog-actions-row">
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit" form="${escapeHtmlAttribute(editFormId)}">Сохранить карточку</button>
              </div>
              ${canDelete
                ? `<form class="admin-inline-actions admin-inline-actions-end" method="post" action="${ADMIN_STAFF_PATH}">
                    <input type="hidden" name="action" value="delete-staff">
                    <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
                    ${renderAdminDeleteIconButton("Удалить сотрудника")}
                  </form>`
                : ""}
            </div>
          </section>
        </div>
      </div>
    </dialog>`;
  }

  function renderStaffTableRow(staffSummary) {
    const contactBits = [];
    const formattedPhone = formatAdminPhoneNumber(staffSummary.phone);
    if (formattedPhone) {
      contactBits.push(`<span class="admin-table-strong">${escapeHtml(formattedPhone)}</span>`);
    }
    if (staffSummary.email) {
      contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.email)}</span>`);
    }
    if (staffSummary.address) {
      contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.address)}</span>`);
    }
    const contactCell = contactBits.length
      ? `<div class="admin-table-cell-stack">${contactBits.join("")}</div>`
      : `<span class="admin-table-muted">Не указаны</span>`;
    const nextOrderName = getStaffNextOrderName(staffSummary);
    const dialogId = getStaffDialogId(staffSummary.id);

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть карточку сотрудника ${staffSummary.name || "Сотрудник"}`)}"
    >
      <td>
        <div class="admin-client-table-cell">
          <div class="admin-client-avatar ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
          <div class="admin-table-stack">
            <span class="admin-table-link">${escapeHtml(staffSummary.name || "Сотрудник")}</span>
            <span class="admin-table-muted">${escapeHtml(staffSummary.role || "Роль не указана")}</span>
            ${staffSummary.notes ? `<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.notes)}</span>` : ""}
          </div>
        </div>
      </td>
      <td>${contactCell}</td>
      <td>
        <div class="admin-table-cell-stack">
          ${renderStaffStatusBadge(staffSummary.status)}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</span>
          <span class="admin-table-muted">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))} на 7 дней</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены")}</span>
          <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(nextOrderName)}</span>
        </div>
      </td>
    </tr>`;
  }

  function renderStaffSummaryTable(staffSummaries, options = {}) {
    if (!staffSummaries.length) {
      return `<div class="admin-empty-state">Пока сотрудников нет. Создайте первого сотрудника в разделе "Настройки → Пользователи", и он сразу появится в команде и назначениях.</div>`;
    }

    return `<div class="admin-table-wrap admin-staff-table-wrap">
      <table class="admin-table admin-staff-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Контакты</th>
            <th>Статус</th>
            <th>Нагрузка</th>
            <th>Следующая смена</th>
          </tr>
        </thead>
        <tbody>
          ${staffSummaries.map((record) => renderStaffTableRow(record)).join("")}
        </tbody>
      </table>
      ${staffSummaries.map((record) => renderStaffEditDialog(record, options)).join("")}
    </div>`;
  }

  function getStaffSection(req) {
    const reqUrl = getRequestUrl(req);
    const section = normalizeString(reqUrl.searchParams.get("section"), 32).toLowerCase();
    if (section === "calendar" || section === "assignments") return section;
    if (section === "team") return "team";

    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice.startsWith("assignment-")) return "assignments";
    return "team";
  }

  function buildStaffSectionPath(section, extra = {}) {
    const normalizedSection =
      section === "calendar" ? "calendar" : section === "assignments" ? "assignments" : "team";
    const params = {
      section: normalizedSection,
      ...extra,
    };
    if (normalizedSection !== "calendar") {
      delete params.calendarStart;
    }
    return buildAdminRedirectPath(ADMIN_STAFF_PATH, params);
  }

  function renderStaffSectionNav(activeSection, stats = {}, calendarStartDate) {
    const items = [
      {
        key: "team",
        label: "Команда",
        href: buildStaffSectionPath("team"),
      },
      {
        key: "calendar",
        label: "Календарь команды",
        href: buildStaffSectionPath("calendar", { calendarStart: calendarStartDate }),
      },
      {
        key: "assignments",
        label: "Назначения и график",
        href: buildStaffSectionPath("assignments"),
      },
    ];

    return `<div class="admin-subnav-strip">
      ${items
        .map(
          (item) => `<a class="admin-subnav-link${item.key === activeSection ? " admin-subnav-link-active" : ""}" href="${item.href}">${escapeHtml(item.label)}</a>`
        )
        .join("")}
    </div>`;
  }

  function getStaffCalendarTodayDateValue() {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const values = {};
    for (const part of parts) {
      if (part.type === "literal") continue;
      values[part.type] = part.value;
    }
    return `${values.year}-${values.month}-${values.day}`;
  }

  function normalizeStaffCalendarDateValue(value) {
    const normalized = normalizeString(value, 32);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function parseStaffCalendarDate(value) {
    const normalized = normalizeStaffCalendarDateValue(value);
    if (!normalized) return null;
    const [year, month, day] = normalized.split("-").map((segment) => Number(segment));
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }

  function addDaysToStaffCalendarDate(value, days) {
    const baseDate = parseStaffCalendarDate(value);
    if (!baseDate) return getStaffCalendarTodayDateValue();
    const next = new Date(baseDate.getTime());
    next.setUTCDate(next.getUTCDate() + Number(days || 0));
    return next.toISOString().slice(0, 10);
  }

  function buildStaffTeamCalendarWindow(anchorDateValue) {
    const anchorDate = normalizeStaffCalendarDateValue(anchorDateValue) || getStaffCalendarTodayDateValue();
    return Array.from({ length: STAFF_TEAM_CALENDAR_DAYS }, (_, index) => {
      const dateValue = addDaysToStaffCalendarDate(anchorDate, index - STAFF_TEAM_CALENDAR_PAST_DAYS);
      const date = parseStaffCalendarDate(dateValue) || new Date();
      const startMs = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0
      );
      const endMs = startMs + (24 * 60 * 60 * 1000);
      return {
        dateValue,
        startMs,
        endMs,
        weekdayLabel: date.toLocaleDateString("ru-RU", {
          weekday: "short",
          timeZone: "UTC",
        }),
        dateLabel: date.toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }),
      };
    });
  }

  function formatStaffTeamCalendarRangeLabel(days) {
    if (!Array.isArray(days) || days.length === 0) return "";
    const firstDate = parseStaffCalendarDate(days[0].dateValue);
    const lastDate = parseStaffCalendarDate(days[days.length - 1].dateValue);
    if (!firstDate || !lastDate) return "";
    return `${firstDate.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })} - ${lastDate.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })}`;
  }

  function getStaffTeamCalendarStartDate(reqUrl) {
    return normalizeStaffCalendarDateValue(reqUrl.searchParams.get("calendarStart")) || getStaffCalendarTodayDateValue();
  }

  function doesStaffTeamCalendarBlockCoverDay(block, day) {
    if (!block || !day) return false;
    if (block.allDay && block.startDate) {
      const startDate = normalizeStaffCalendarDateValue(block.startDate);
      const endDate = normalizeStaffCalendarDateValue(block.endDate);
      if (!startDate) return false;
      return day.dateValue >= startDate && (!endDate || day.dateValue < endDate);
    }
    const startMs = Number(block.startMs);
    const endMs = Number(block.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    return startMs < day.endMs && endMs > day.startMs;
  }

  function renderStaffTeamCalendarAssignmentEntry(orderItem) {
    const customerName =
      orderItem.entry.customerName ||
      orderItem.entry.fullAddress ||
      orderItem.entry.requestId ||
      "Заказ";
    const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
    const timeLabel = normalizeString(orderItem.scheduleTime, 32)
      ? formatAdminClockTime(orderItem.scheduleTime)
      : "Без времени";
    const statusTone =
      orderItem.assignmentStatus === "completed"
        ? "completed"
        : orderItem.assignmentStatus === "confirmed"
          ? "confirmed"
          : orderItem.assignmentStatus === "issue"
            ? "issue"
            : "planned";

    return `<button
      class="admin-team-calendar-entry admin-team-calendar-entry-button admin-team-calendar-entry-order admin-team-calendar-entry-order-${escapeHtmlAttribute(statusTone)}"
      type="button"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть заказ ${customerName}`)}"
    >
      <div class="admin-team-calendar-entry-head">
        <span class="admin-team-calendar-entry-time">${escapeHtml(timeLabel)}</span>
        <span class="admin-team-calendar-entry-status">${escapeHtml(formatAssignmentStatusLabel(orderItem.assignmentStatus))}</span>
      </div>
      <strong class="admin-team-calendar-entry-title">${escapeHtml(customerName)}</strong>
      <span class="admin-team-calendar-entry-copy">${escapeHtml(formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType))}</span>
    </button>`;
  }

  function renderStaffTeamCalendarAvailabilityEntry(block) {
    const timeLabel =
      block.allDay || !Number.isFinite(block.startMs)
        ? "All day"
        : new Date(block.startMs).toLocaleTimeString("en-US", {
            timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

    return `<article class="admin-team-calendar-entry admin-team-calendar-entry-unavailable">
      <div class="admin-team-calendar-entry-head">
        <span class="admin-team-calendar-entry-time">${escapeHtml(timeLabel)}</span>
        <span class="admin-team-calendar-entry-status">Unavailable</span>
      </div>
      <strong class="admin-team-calendar-entry-title">${escapeHtml(block.summary || "Day off")}</strong>
    </article>`;
  }

  function renderStaffTeamCalendarCell(staffSummary, day) {
    const assignments = Array.isArray(staffSummary.assignedOrders)
      ? staffSummary.assignedOrders
          .filter((item) => item.scheduleDate === day.dateValue)
          .sort((left, right) => {
            const leftTimestamp = Number.isFinite(left.scheduleTimestamp) ? left.scheduleTimestamp : Number.MAX_SAFE_INTEGER;
            const rightTimestamp = Number.isFinite(right.scheduleTimestamp) ? right.scheduleTimestamp : Number.MAX_SAFE_INTEGER;
            return leftTimestamp - rightTimestamp;
          })
      : [];
    const unavailableBlocks = Array.isArray(staffSummary.calendarAvailabilityBlocks)
      ? staffSummary.calendarAvailabilityBlocks.filter((block) => doesStaffTeamCalendarBlockCoverDay(block, day))
      : [];

    if (!assignments.length && !unavailableBlocks.length) {
      return `<div class="admin-team-calendar-empty">-</div>`;
    }

    return `<div class="admin-team-calendar-cell">
      ${unavailableBlocks.map((block) => renderStaffTeamCalendarAvailabilityEntry(block)).join("")}
      ${assignments.map((item) => renderStaffTeamCalendarAssignmentEntry(item)).join("")}
    </div>`;
  }

  function renderStaffTeamCalendarTable(staffSummaries, startDateValue) {
    if (!staffSummaries.length) {
      return `<div class="admin-empty-state">Сначала добавьте сотрудников, и здесь появится общий календарь команды.</div>`;
    }

    const normalizedStartDate = normalizeStaffCalendarDateValue(startDateValue) || getStaffCalendarTodayDateValue();
    const todayDateValue = getStaffCalendarTodayDateValue();
    const days = buildStaffTeamCalendarWindow(normalizedStartDate);

    return `<div class="admin-team-calendar-shell">
      <div class="admin-team-calendar-toolbar">
        <div class="admin-team-calendar-copy">
          <strong class="admin-team-calendar-range">${escapeHtml(formatStaffTeamCalendarRangeLabel(days))}</strong>
          <span class="admin-team-calendar-meta">Тяните мышкой влево и вправо: календарь показывает месяц назад и месяц вперёд от выбранной даты.</span>
        </div>
        <div class="admin-team-calendar-actions">
          <button class="admin-link-button admin-button-secondary" type="button" data-admin-team-calendar-scroll-today="true">Сегодня</button>
        </div>
      </div>
      <div class="admin-table-wrap admin-team-calendar-wrap" data-admin-team-calendar-scroll="true">
        <table class="admin-table admin-team-calendar-table" data-admin-team-calendar="true" style="--admin-team-calendar-days:${escapeHtmlAttribute(String(days.length))};">
          <thead>
            <tr>
              <th class="admin-team-calendar-staff-col">Сотрудник</th>
              ${days
                .map(
                  (day) => `<th${day.dateValue === normalizedStartDate ? ' data-admin-team-calendar-anchor="true"' : ""}${day.dateValue === todayDateValue ? ' data-admin-team-calendar-today="true"' : ""}>
                    <div class="admin-team-calendar-day-head">
                      <span class="admin-team-calendar-day-weekday">${escapeHtml(day.weekdayLabel)}</span>
                      <span class="admin-team-calendar-day-date">${escapeHtml(day.dateLabel)}</span>
                    </div>
                  </th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${staffSummaries
              .map(
                (staffSummary) => `<tr>
                  <td class="admin-team-calendar-staff-col">
                    <div class="admin-table-stack">
                      <span class="admin-table-link">${escapeHtml(staffSummary.name || "Сотрудник")}</span>
                      <span class="admin-table-muted">${escapeHtml(staffSummary.role || "Роль не указана")}</span>
                      <div class="admin-inline-badge-row">
                        ${renderStaffStatusBadge(staffSummary.status)}
                        ${staffSummary.calendarMeta && staffSummary.calendarMeta.connected
                          ? renderAdminBadge("Google Calendar", "success")
                          : renderAdminBadge("Без синхронизации", "muted")}
                      </div>
                    </div>
                  </td>
                  ${days.map((day) => `<td class="admin-team-calendar-day-cell"${day.dateValue === normalizedStartDate ? ' data-admin-team-calendar-anchor="true"' : ""}${day.dateValue === todayDateValue ? ' data-admin-team-calendar-today="true"' : ""}>${renderStaffTeamCalendarCell(staffSummary, day)}</td>`).join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function renderCreateStaffDialog(options = {}) {
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

    return `<dialog class="admin-dialog" id="admin-staff-create-dialog"${autoOpenAttr} aria-labelledby="admin-staff-create-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Команда</p>
            <h2 class="admin-dialog-title" id="admin-staff-create-title">Новый сотрудник</h2>
            <p class="admin-dialog-copy">Заполните карточку сотрудника, и он сразу появится в команде, графике и назначениях.</p>
          </div>
          ${renderAdminDialogCloseButton("admin-staff-create-dialog")}
        </div>
        <form class="admin-form-grid" method="post" action="${ADMIN_STAFF_PATH}">
          <input type="hidden" name="action" value="create-staff">
          <div class="admin-form-grid admin-form-grid-two">
            <label class="admin-label">
              Имя
              <input class="admin-input" type="text" name="name" placeholder="Anna Petrova" required>
            </label>
            <label class="admin-label">
              Роль
              <select class="admin-input" name="role">
                ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}">${escapeHtml(formatWorkspaceRoleLabel(role))}</option>`).join("")}
              </select>
            </label>
            ${renderAdminPhoneInput("phone")}
            <label class="admin-label">
              Email
              <input class="admin-input" type="email" name="email" placeholder="team@shynli.com">
            </label>
            ${renderStaffCompensationFields({})}
          </div>
          ${renderStaffAddressField({
            id: "admin-staff-create-address",
          })}
          <label class="admin-label">
            Статус
            <select class="admin-input" name="status">
              ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
            </select>
          </label>
          <label class="admin-label">
            Заметки
            <textarea class="admin-input" name="notes" placeholder="Районы, доступность, предпочтительные смены, ключи"></textarea>
          </label>
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit">Добавить сотрудника</button>
            <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-staff-create-dialog">Отмена</button>
          </div>
        </form>
      </div>
    </dialog>`;
  }

  function getStaffAssignmentDialogId(entryId) {
    const normalized = normalizeString(entryId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-staff-assignment-dialog-${safeSuffix || "entry"}`;
  }

  function renderStaffAssignmentTableRow(orderItem) {
    const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
    const assignedTeamLabel = orderItem.assignedStaff.length > 0
      ? orderItem.assignedStaff.map((record) => record.name).join(", ")
      : "Команда не назначена";

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть назначение ${orderItem.entry.customerName || "Клиент"}`)}"
    >
      <td>
        <div class="admin-table-stack">
          <span class="admin-table-link">${escapeHtml(orderItem.entry.customerName || "Клиент")}</span>
          <span class="admin-table-muted">${escapeHtml(formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(orderItem.entry.totalPrice))}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(orderItem.scheduleLabel)}</span>
          <span class="admin-table-muted">${escapeHtml(orderItem.entry.requestId || orderItem.entry.id)}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(assignedTeamLabel)}</span>
          ${orderItem.assignedStaff.length > 0
            ? `<span class="admin-table-muted">${escapeHtml(formatStaffCountLabel(orderItem.assignedStaff.length))}</span>`
            : `<span>${renderAdminBadge("Команда не назначена", "danger")}</span>`}
        </div>
      </td>
      <td>
        <div class="admin-inline-badge-row">
          ${renderAssignmentStatusBadge(orderItem.assignmentStatus)}
          ${renderQuoteOpsStatusBadge(orderItem.entry.status)}
        </div>
      </td>
      <td>
        ${renderStaffTravelEstimateList(orderItem, { compact: true })}
      </td>
      <td>
        ${orderItem.entry.fullAddress
          ? `<div class="admin-table-cell-stack">
              <span class="admin-line-clamp-two">${escapeHtml(orderItem.entry.fullAddress)}</span>
            </div>`
          : `<span class="admin-table-muted">Не указан</span>`}
      </td>
    </tr>`;
  }

  function renderStaffAssignmentDialog(orderItem, staffRecords) {
    const selectableStaff = staffRecords.filter((record) => record.status === "active" || orderItem.assignedStaff.some((item) => item.id === record.id));
    const assignedIds = orderItem.assignment ? orderItem.assignment.staffIds : [];
    const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
    const currentTeamMarkup =
      orderItem.assignedStaff.length > 0
        ? orderItem.assignedStaff.map((record) => renderAdminBadge(record.name, "outline")).join("")
        : renderAdminBadge("Команда не назначена", "muted");
    const missingStaffBlock = orderItem.missingStaffIds.length > 0
      ? `<div class="admin-alert admin-alert-error">В назначении есть сотрудник, которого уже нет в команде. Сохраните карточку заказа заново.</div>`
      : "";
    const infoItems = [
      { label: "Дата и время", value: orderItem.scheduleLabel },
      { label: "Контакты", value: formatAdminPhoneNumber(orderItem.entry.customerPhone) || orderItem.entry.customerEmail || "Контакты не указаны" },
      { label: "Заявка", value: orderItem.entry.requestId || orderItem.entry.id },
      { label: "Адрес", value: orderItem.entry.fullAddress || "Адрес не указан", wide: true },
      { label: "Комментарий", value: orderItem.assignment && orderItem.assignment.notes ? orderItem.assignment.notes : "Пока без комментария", wide: true },
    ];

    return `<dialog class="admin-dialog admin-dialog-wide" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">График</p>
            <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(orderItem.entry.customerName || "Клиент")}</h2>
            <p class="admin-dialog-copy">${escapeHtml(formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(orderItem.entry.totalPrice))}</p>
          </div>
          ${renderAdminDialogCloseButton(dialogId)}
        </div>
        <section class="admin-client-section">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Назначение</h3>
            <div class="admin-inline-badge-row">
              ${renderAssignmentStatusBadge(orderItem.assignmentStatus)}
              ${renderQuoteOpsStatusBadge(orderItem.entry.status)}
            </div>
          </div>
          <div class="admin-badge-row">
            ${currentTeamMarkup}
          </div>
          ${renderAdminClientInfoGrid(infoItems)}
        </section>
        <section class="admin-client-section">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Дорога</h3>
            <span class="admin-action-hint">Маршрут считается от дома сотрудника или от предыдущего заказа в этот день.</span>
          </div>
          ${renderStaffTravelEstimateList(orderItem, { showSourceDetail: true })}
        </section>
        <section class="admin-client-section">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Команда и смена</h3>
            <span class="admin-action-hint">Оставьте дату и время пустыми, если нужно использовать график из самого заказа.</span>
          </div>
          ${missingStaffBlock}
          <form
            class="admin-form-grid"
            method="post"
            action="${ADMIN_STAFF_PATH}"
            data-admin-async-save="true"
            data-admin-async-success="Назначение сохранено."
            data-admin-async-error="Не удалось сохранить назначение."
          >
            <input type="hidden" name="action" value="save-assignment">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(orderItem.entry.id)}">
            <div>
              ${selectableStaff.length > 0
                ? `<div class="admin-checkbox-grid">
                    ${selectableStaff
                      .map(
                        (record) => `<label class="admin-checkbox">
                          <input type="checkbox" name="staffIds" value="${escapeHtmlAttribute(record.id)}"${assignedIds.includes(record.id) ? " checked" : ""}>
                          <span>
                            <strong>${escapeHtml(record.name)}</strong>
                            <small>${escapeHtml([record.role, formatStaffStatusLabel(record.status)].filter(Boolean).join(" • "))}</small>
                          </span>
                        </label>`
                      )
                      .join("")}
                  </div>`
                : `<div class="admin-empty-state">Сначала создайте сотрудника в разделе "Настройки → Пользователи". После этого он появится здесь для назначения на заказы.</div>`}
            </div>
            <div class="admin-form-grid admin-form-grid-two">
              <label class="admin-label">
                Дата смены
                <input class="admin-input" type="date" name="scheduleDate" value="${escapeHtmlAttribute(orderItem.assignment ? orderItem.assignment.scheduleDate : "")}">
              </label>
              <label class="admin-label">
                Время смены
                <input class="admin-input" type="time" name="scheduleTime" value="${escapeHtmlAttribute(orderItem.assignment ? orderItem.assignment.scheduleTime : "")}">
              </label>
              <label class="admin-label">
                Статус
                <select class="admin-input" name="status">
                  ${ASSIGNMENT_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${orderItem.assignmentStatus === status ? " selected" : ""}>${escapeHtml(formatAssignmentStatusLabel(status))}</option>`).join("")}
                </select>
              </label>
            </div>
            <label class="admin-label">
              Комментарий
              <textarea class="admin-input" name="notes" placeholder="Ключи, инструкции по доступу, комментарий для команды">${escapeHtml(orderItem.assignment ? orderItem.assignment.notes : "")}</textarea>
            </label>
            <p class="admin-field-note" data-admin-async-feedback hidden></p>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Сохранить назначение</button>
            </div>
          </form>
          ${orderItem.assignment
            ? `<form class="admin-inline-actions" method="post" action="${ADMIN_STAFF_PATH}">
                <input type="hidden" name="action" value="clear-assignment">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(orderItem.entry.id)}">
                <button class="admin-button admin-button-secondary" type="submit">Очистить назначение</button>
              </form>`
            : ""}
        </section>
      </div>
    </dialog>`;
  }

  function renderStaffAssignmentsTable(orderItems) {
    if (!orderItems.length) {
      return `<div class="admin-empty-state">Пока заказов нет. Как только появятся заявки, здесь можно будет назначать команду и вести график.</div>`;
    }

    const sortedOrderItems = orderItems
      .slice()
      .sort((left, right) => {
        const leftUnassigned = !left || !Array.isArray(left.assignedStaff) || left.assignedStaff.length === 0;
        const rightUnassigned = !right || !Array.isArray(right.assignedStaff) || right.assignedStaff.length === 0;
        if (leftUnassigned !== rightUnassigned) {
          return leftUnassigned ? -1 : 1;
        }

        const leftHasTimestamp = Number.isFinite(left && left.scheduleTimestamp);
        const rightHasTimestamp = Number.isFinite(right && right.scheduleTimestamp);
        if (leftHasTimestamp && rightHasTimestamp && left.scheduleTimestamp !== right.scheduleTimestamp) {
          return left.scheduleTimestamp - right.scheduleTimestamp;
        }
        if (Boolean(left && left.hasSchedule) !== Boolean(right && right.hasSchedule)) {
          return left && left.hasSchedule ? -1 : 1;
        }

        const leftCreatedAt = Date.parse((left && left.entry && left.entry.createdAt) || "");
        const rightCreatedAt = Date.parse((right && right.entry && right.entry.createdAt) || "");
        return (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) - (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0);
      });

    return `<div class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-staff-schedule-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Статус</th>
            <th>Дорога</th>
            <th>Адрес</th>
          </tr>
        </thead>
        <tbody>
          ${sortedOrderItems.map((item) => renderStaffAssignmentTableRow(item)).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderStaffAssignmentDialogs(orderItems, staffRecords) {
    if (!Array.isArray(orderItems) || orderItems.length === 0) return "";
    return orderItems.map((item) => renderStaffAssignmentDialog(item, staffRecords)).join("");
  }

  function renderStaffTravelEstimateList(orderItem, options = {}) {
    const assignedStaff = Array.isArray(orderItem && orderItem.assignedStaff) ? orderItem.assignedStaff : [];
    const travelLegs = Array.isArray(orderItem && orderItem.travelLegs) ? orderItem.travelLegs : [];
    if (assignedStaff.length === 0) {
      return `<span class="admin-table-muted">Появится после назначения команды.</span>`;
    }
    if (travelLegs.length === 0) {
      return `<span class="admin-table-muted">Добавьте дату и адрес, чтобы посчитать маршрут.</span>`;
    }
    return `<div class="admin-travel-estimate-list${options.compact ? " admin-travel-estimate-list-compact" : ""}">
      ${travelLegs.map((leg) => renderStaffTravelEstimateItem(leg, options)).join("")}
    </div>`;
  }

  function renderStaffTravelEstimateItem(leg, options = {}) {
    const showStaffName = !options.compact;
    const sourceLabel = normalizeString(leg && leg.sourceLabel, 80) || "Маршрут";
    const baseFallback =
      !GOOGLE_PLACES_API_KEY
        ? `${sourceLabel}: карты не подключены`
        : `${sourceLabel}: маршрут недоступен`;
    const fallbackText = leg && leg.status === "missing-destination"
      ? "У заказа не указан адрес."
      : leg && leg.status === "missing-origin"
        ? `${sourceLabel}: у сотрудника нет домашнего адреса.`
        : leg && leg.status === "same-place"
          ? `${sourceLabel}: клинер уже на месте.`
          : `${sourceLabel}: считаем маршрут…`;
    const travelAttrs =
      leg && leg.status === "ready" && GOOGLE_PLACES_API_KEY
        ? ` data-admin-travel-estimate="true"
            data-admin-travel-origin="${escapeHtmlAttribute(leg.originAddress)}"
            data-admin-travel-destination="${escapeHtmlAttribute(leg.destinationAddress)}"
            data-admin-travel-departure="${escapeHtmlAttribute(String(Number(leg.departureTimestamp) || 0))}"
            data-admin-travel-source-label="${escapeHtmlAttribute(sourceLabel)}"
            data-admin-travel-fallback="${escapeHtmlAttribute(baseFallback)}"`
        : "";
    const sourceDetail =
      options.showSourceDetail && leg && leg.sourceType === "previous-order" && leg.sourceTitle
        ? `<span class="admin-table-muted">Точка старта: ${escapeHtml(leg.sourceTitle)}</span>`
        : "";

    return `<div class="admin-table-cell-stack admin-travel-estimate-stack">
      ${showStaffName ? `<span class="admin-table-strong">${escapeHtml((leg && leg.staffName) || "Сотрудник")}</span>` : ""}
      <span class="admin-table-muted"${travelAttrs}>${escapeHtml(fallbackText)}</span>
      ${sourceDetail}
    </div>`;
  }

  async function renderStaffPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const activeSection = getStaffSection(req);
    const calendarStartDate = getStaffTeamCalendarStartDate(reqUrl);
    const googleCalendarIntegration =
      adminRuntime && adminRuntime.googleCalendarIntegration
        ? adminRuntime.googleCalendarIntegration
        : null;
    const usersStore =
      adminRuntime && adminRuntime.usersStore
        ? adminRuntime.usersStore
        : null;
    const usersSnapshot = usersStore ? await usersStore.getSnapshot() : { users: [] };
    const linkedUserByEmail = new Map(
      Array.isArray(usersSnapshot.users)
        ? usersSnapshot.users
            .filter((user) => user && user.email)
            .map((user) => [normalizeString(user.email, 200).toLowerCase(), user])
        : []
    );
    const linkedUserByStaffId = new Map(
      Array.isArray(usersSnapshot.users)
        ? usersSnapshot.users
            .filter((user) => user && user.staffId)
            .map((user) => [user.staffId, user])
        : []
    );
    const staffSummaries =
      googleCalendarIntegration &&
      typeof googleCalendarIntegration.loadStaffCalendarStates === "function"
        ? await googleCalendarIntegration.loadStaffCalendarStates(planning.staffSummaries, config)
        : planning.staffSummaries.map((record) => ({
            ...record,
            calendarMeta: {
              configured: Boolean(
                googleCalendarIntegration &&
                  typeof googleCalendarIntegration.isConfigured === "function" &&
                  googleCalendarIntegration.isConfigured()
              ),
              connected: false,
            },
            calendarAvailabilityBlocks: [],
          }));
    const enrichedStaffSummaries = staffSummaries.map((record) => ({
      ...record,
      linkedUser:
        linkedUserByStaffId.get(record.id) ||
        linkedUserByEmail.get(normalizeString(record.email, 200).toLowerCase()) ||
        null,
    }));
    const hiddenStaffIds = new Set(
      enrichedStaffSummaries
        .filter((record) => isAdminLinkedUser(record.linkedUser))
        .map((record) => record.id)
    );
    const visiblePlanning = {
      ...planning,
      staff: planning.staff.filter((record) => !hiddenStaffIds.has(record.id)),
      orderItems: planning.orderItems.map((item) => ({
        ...item,
        assignedStaff: Array.isArray(item.assignedStaff)
          ? item.assignedStaff.filter((record) => !hiddenStaffIds.has(record.id))
          : [],
        missingStaffIds: Array.isArray(item.missingStaffIds)
          ? item.missingStaffIds.filter((staffId) => !hiddenStaffIds.has(staffId))
          : [],
        travelLegs: Array.isArray(item.travelLegs)
          ? item.travelLegs.filter((leg) => !hiddenStaffIds.has(leg.staffId))
          : [],
      })),
      staffSummaries: enrichedStaffSummaries.filter((record) => !hiddenStaffIds.has(record.id)),
    };
    visiblePlanning.scheduledOrders = visiblePlanning.orderItems.filter((item) => item.hasSchedule);
    visiblePlanning.assignedScheduledCount = visiblePlanning.scheduledOrders.filter(
      (item) => item.assignedStaff.length > 0
    ).length;
    visiblePlanning.unassignedScheduledCount = visiblePlanning.scheduledOrders.filter(
      (item) => item.assignedStaff.length === 0
    ).length;
    visiblePlanning.activeStaffCount = visiblePlanning.staff.filter(
      (record) => record.status === "active"
    ).length;
    const upcomingOrders = visiblePlanning.orderItems.slice(0, 12);
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const sectionIntro = renderStaffSectionNav(
      activeSection,
      {
        staffCount: visiblePlanning.staffSummaries.length,
        activeStaffCount: visiblePlanning.activeStaffCount,
        scheduledOrdersCount: visiblePlanning.scheduledOrders.length,
      },
      calendarStartDate
    );
    const sectionContent =
      activeSection === "calendar"
        ? renderAdminCard(
            "Календарь команды",
            "Недельный календарь по всем сотрудникам: смены, подтверждённые заказы и day off.",
            renderStaffTeamCalendarTable(visiblePlanning.staffSummaries, calendarStartDate),
            { eyebrow: "Календарь", muted: true }
          )
        : activeSection === "assignments"
          ? renderAdminCard(
            "Назначения и график",
            "Свяжите сотрудников с заказами и зафиксируйте смены.",
            renderStaffAssignmentsTable(upcomingOrders),
            { eyebrow: "График" }
          )
        : renderAdminCard(
            "Команда",
            "Компактная таблица сотрудников, контактов и текущей загрузки.",
            renderStaffSummaryTable(visiblePlanning.staffSummaries, {
              req,
              canDelete: accessContext.canDelete,
              canEdit: accessContext.canEdit,
              leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
            }),
            { eyebrow: "Список", muted: true }
          );

    return renderAdminLayout(
      "Сотрудники",
      `${renderStaffNotice(req)}
        ${sectionIntro}
        ${renderStaffOverviewStrip(visiblePlanning)}
        ${sectionContent}
        ${renderStaffAssignmentDialogs(visiblePlanning.orderItems, visiblePlanning.staff)}`,
      {
        kicker: false,
        subtitle: "Рабочий инструмент для команды: компактный список сотрудников, привязка к заказам и график смен.",
        sidebar: renderAdminAppSidebar(ADMIN_STAFF_PATH, {
          ...accessContext,
          staffSection: activeSection,
        }),
        bodyScripts: `${renderStaffAddressAutocompleteScript()}${renderStaffTravelEstimateScript()}${renderStaffTeamCalendarDragScript()}`,
      }
    );
  }

  function renderSettingsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "saved") {
      return `<div class="admin-alert admin-alert-info">Отметки чек-листа сохранены.</div>`;
    }
    if (notice === "checklist-updated") {
      return `<div class="admin-alert admin-alert-info">Шаблон чек-листа обновлён.</div>`;
    }
    if (notice === "added") {
      return `<div class="admin-alert admin-alert-info">Новый пункт добавлен в шаблон.</div>`;
    }
    if (notice === "reset") {
      return `<div class="admin-alert admin-alert-info">Все отметки по этому шаблону сброшены.</div>`;
    }
    if (notice === "error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Попробуйте ещё раз.</div>`;
    }
    if (notice === "user-created") {
      return `<div class="admin-alert admin-alert-info">Пользователь создан.</div>`;
    }
    if (notice === "user-created-email-sent") {
      return `<div class="admin-alert admin-alert-info">Пользователь создан, письмо со ссылкой на подтверждение уже отправлено.</div>`;
    }
    if (notice === "user-created-email-skipped") {
      return `<div class="admin-alert admin-alert-info">Пользователь создан. Автоматическая отправка письма сейчас не настроена.</div>`;
    }
    if (notice === "user-created-email-failed") {
      return `<div class="admin-alert admin-alert-error">Пользователь создан, но письмо с подтверждением отправить не удалось.</div>`;
    }
    if (notice === "user-invite-sent") {
      return `<div class="admin-alert admin-alert-info">Письмо с подтверждением отправлено повторно.</div>`;
    }
    if (notice === "user-invite-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось отправить письмо повторно. Проверьте канал почты и текст ошибки в карточке пользователя.</div>`;
    }
    if (notice === "user-updated") {
      return `<div class="admin-alert admin-alert-info">Пользователь обновлён.</div>`;
    }
    if (notice === "user-deleted") {
      return `<div class="admin-alert admin-alert-info">Пользователь удалён.</div>`;
    }
    if (notice === "user-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить пользователя. Проверьте привязку к сотруднику, email и пароль.</div>`;
    }
    if (notice === "mail-connected") {
      return `<div class="admin-alert admin-alert-info">Google Mail подключён. Новые invite-письма будут уходить через Gmail API.</div>`;
    }
    if (notice === "mail-disconnected") {
      return `<div class="admin-alert admin-alert-info">Google Mail отключён.</div>`;
    }
    if (notice === "mail-connect-denied") {
      return `<div class="admin-alert admin-alert-error">Google Mail не был подключён: доступ в окне Google был отменён.</div>`;
    }
    if (notice === "mail-connect-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось завершить подключение Google Mail. Проверьте OAuth client, Gmail API и redirect URI.</div>`;
    }
    if (notice === "mail-unavailable") {
      return `<div class="admin-alert admin-alert-error">Google Mail OAuth пока не настроен. Добавьте client id/secret и подключите сервисный ящик.</div>`;
    }
    return "";
  }

  function getSettingsSection(req) {
    const reqUrl = getRequestUrl(req);
    const section = normalizeString(reqUrl.searchParams.get("section"), 32).toLowerCase();
    return section === "checklists" ? "checklists" : "users";
  }

  function formatSettingsPlural(count, one, few, many) {
    const absolute = Math.abs(Number(count || 0));
    const mod100 = absolute % 100;
    const mod10 = absolute % 10;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }

  function formatSettingsMetaCount(count, one, few, many) {
    return `${count} ${formatSettingsPlural(count, one, few, many)}`;
  }

  function buildSettingsSectionPath(section, notice = "", extraParams = {}) {
    const normalizedSection = section === "checklists" ? "checklists" : "users";
    return buildAdminRedirectPath(ADMIN_SETTINGS_PATH, {
      section: normalizedSection,
      notice,
      ...extraParams,
    });
  }

  function buildSettingsRedirectPath(serviceType, notice = "") {
    const normalizedServiceType = normalizeString(serviceType, 32).toLowerCase();
    const pathWithQuery = buildSettingsSectionPath("checklists", notice, {
      serviceType: normalizedServiceType,
    });
    return normalizedServiceType ? `${pathWithQuery}#settings-${normalizedServiceType}` : pathWithQuery;
  }

  function buildSettingsUsersRedirectPath(notice = "") {
    return `${buildSettingsSectionPath("users", notice)}#settings-users`;
  }

  function renderSettingsSectionNav(activeSection, stats = {}, options = {}) {
    const checklistCount = Number.isFinite(stats.checklistCount) ? stats.checklistCount : 0;
    const userCount = Number.isFinite(stats.userCount) ? stats.userCount : 0;
    const actions = options.actions || "";
    const items = [
      {
        key: "users",
        label: "Пользователи",
        meta: formatSettingsMetaCount(userCount, "аккаунт", "аккаунта", "аккаунтов"),
        href: buildSettingsSectionPath("users"),
      },
      {
        key: "checklists",
        label: "Чек-листы",
        meta: formatSettingsMetaCount(checklistCount, "шаблон", "шаблона", "шаблонов"),
        href: buildSettingsSectionPath("checklists"),
      },
    ];

    return `<div class="admin-settings-nav-row">
      <div class="admin-subnav-strip admin-settings-nav">
        ${items
          .map(
            (item) => `<a class="admin-subnav-link admin-settings-nav-link${item.key === activeSection ? " admin-subnav-link-active admin-settings-nav-link-active" : ""}" href="${item.href}">
              <span class="admin-settings-nav-label">${escapeHtml(item.label)}</span>
              <span class="admin-settings-nav-meta">${escapeHtml(item.meta)}</span>
            </a>`
          )
          .join("")}
      </div>
      ${actions ? `<div class="admin-settings-nav-actions">${actions}</div>` : ""}
    </div>`;
  }

  function renderChecklistEditorRemoveButton(label = "Удалить пункт") {
    const normalizedLabel = normalizeString(label, 120) || "Удалить пункт";
    return `<button
      class="admin-icon-button admin-delete-button"
      type="button"
      data-admin-checklist-remove-item="true"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function renderChecklistEditorRow(item, index) {
    return `<div class="admin-checklist-edit-row" data-admin-checklist-edit-row>
      <span class="admin-checklist-edit-index">${escapeHtml(String(index + 1))}</span>
      <input type="hidden" name="itemId" value="${escapeHtmlAttribute(item.id)}">
      <input class="admin-input admin-checklist-edit-input" type="text" name="itemLabel" value="${escapeHtmlText(item.label)}" maxlength="240" placeholder="Например: проверить зеркала">
      ${renderChecklistEditorRemoveButton()}
    </div>`;
  }

  function renderChecklistTemplatePreview(template) {
    const itemCountLabel = formatSettingsMetaCount(template.items.length, "пункт", "пункта", "пунктов");

    return `<div id="settings-${escapeHtmlAttribute(template.serviceType)}"></div>
      <section class="admin-checklist-template-shell">
        <div class="admin-checklist-template-hero">
          <div class="admin-checklist-template-copy">
            <div class="admin-inline-badge-row">
              ${renderAdminBadge(template.serviceType, "outline")}
              ${renderAdminBadge(itemCountLabel, "muted")}
            </div>
            <p class="admin-checklist-summary">${escapeHtml(template.description)}</p>
          </div>
        </div>
        <div class="admin-checklist-preview-list">
          ${template.items.length > 0
            ? template.items
                .map(
                  (item, index) => `<article class="admin-checklist-preview-item">
                    <span class="admin-checklist-preview-index">${escapeHtml(String(index + 1))}</span>
                    <div class="admin-checklist-preview-copy">
                      <strong>${escapeHtml(item.label)}</strong>
                    </div>
                  </article>`
                )
                .join("")
            : `<div class="admin-empty-state">В этом шаблоне пока нет пунктов.</div>`}
        </div>
      </section>`;
  }

  function renderSettingsTemplateEditor(template, panelId) {
    const templateHtml = escapeHtmlAttribute(
      `<div class="admin-checklist-edit-row" data-admin-checklist-edit-row>
        <span class="admin-checklist-edit-index">0</span>
        <input type="hidden" name="itemId" value="">
        <input class="admin-input admin-checklist-edit-input" type="text" name="itemLabel" value="" maxlength="240" placeholder="Например: проверить зеркала">
        ${renderChecklistEditorRemoveButton()}
      </div>`
    );

    return `<section class="admin-client-section admin-checklist-edit-section" id="${escapeHtmlAttribute(panelId)}" data-admin-toggle-panel hidden>
      <form class="admin-form-grid" method="post" action="${ADMIN_SETTINGS_PATH}">
        <input type="hidden" name="action" value="save_checklist_template">
        <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
        <div class="admin-checklist-edit-list" data-admin-checklist-item-list data-admin-checklist-item-template="${templateHtml}">
          ${template.items.length > 0
            ? template.items.map((item, index) => renderChecklistEditorRow(item, index)).join("")
            : ""}
        </div>
        <div class="admin-inline-actions admin-checklist-edit-actions">
          <button class="admin-button admin-button-secondary" type="button" data-admin-checklist-add-item="true">Добавить пункт</button>
          <button class="admin-button" type="submit">Сохранить шаблон</button>
        </div>
        <p class="admin-helper-copy">Пустые строки не сохраняются. Любой пункт можно удалить прямо в режиме редактирования.</p>
      </form>
    </section>`;
  }

  function renderChecklistTemplateDialog(template) {
    const dialogId = `admin-checklist-template-dialog-${escapeHtmlAttribute(template.serviceType)}`;
    const editPanelId = `${dialogId}-edit-panel`;

    return `<dialog class="admin-dialog" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <div class="admin-dialog-panel admin-checklist-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Чек-лист</p>
            <h2 class="admin-dialog-title" id="${dialogId}-title">${escapeHtml(template.title)}</h2>
            <p class="admin-dialog-copy">${escapeHtml(template.description)}</p>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions">
            ${renderAdminToggleIconButton("Редактировать чек-лист", editPanelId, {
              openLabel: "Скрыть редактирование чек-листа",
              closedLabel: "Редактировать чек-лист",
            })}
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        ${renderChecklistTemplatePreview(template)}
        ${renderSettingsTemplateEditor(template, editPanelId)}
      </div>
    </dialog>`;
  }

  function renderSettingsChecklistsTable(templates = []) {
    if (!templates.length) {
      return `<div class="admin-empty-state">Шаблоны пока не подготовлены.</div>`;
    }

    const rows = templates
      .map((template) => {
        const dialogId = `admin-checklist-template-dialog-${escapeHtmlAttribute(template.serviceType)}`;
        return `<tr
          class="admin-table-row-clickable"
          tabindex="0"
          data-admin-dialog-row="true"
          data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
          aria-label="${escapeHtmlAttribute(`Открыть шаблон чек-листа ${template.title}`)}"
        >
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-link">${escapeHtml(template.title)}</span>
              <span class="admin-table-muted">${escapeHtml(template.serviceType)}</span>
            </div>
          </td>
          <td>
            <span class="admin-line-clamp-two">${escapeHtml(template.description)}</span>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(String(template.items.length))}</span>
              <span class="admin-table-muted">${escapeHtml(formatSettingsMetaCount(template.items.length, "пункт", "пункта", "пунктов"))}</span>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    const dialogs = templates.map((template) => renderChecklistTemplateDialog(template)).join("");

    return `<div class="admin-table-wrap admin-settings-table-wrap">
      <table class="admin-table admin-settings-checklists-table">
        <thead>
          <tr>
            <th>Шаблон</th>
            <th>Описание</th>
            <th>Пункты</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${dialogs}`;
  }

  function formatSettingsUserStatusLabel(status) {
    return status === "inactive" ? "Не активен" : "Активен";
  }

  function formatSettingsUserRoleLabel(role) {
    if (role === "admin") return "Админ";
    if (role === "manager") return "Менеджер";
    return "Клинер";
  }

  function formatInviteEmailErrorMessage(errorValue) {
    const normalized = normalizeString(errorValue, 240);
    if (!normalized) return "";

    const rawMessage = normalized.replace(/^ACCOUNT_INVITE_EMAIL_SEND_FAILED:/i, "").trim();
    const compact = rawMessage.toLowerCase();

    if (compact.includes("google_mail_connection_missing")) {
      return "Google Mail ещё не подключён. Подключите сервисный ящик в блоке почты выше.";
    }
    if (compact.includes("invalid_grant")) {
      return "Google отключил refresh token или соединение истекло. Переподключите Gmail.";
    }
    if (
      compact.includes("insufficient") ||
      compact.includes("permission") ||
      compact.includes("gmail.send")
    ) {
      return "Google не дал приложению право на отправку писем. Переподключите Gmail и подтвердите доступ.";
    }
    if (
      compact.includes("invalid login") ||
      compact.includes("username and password not accepted") ||
      compact.includes("535")
    ) {
      return "SMTP не принял логин или app password. Проверьте relay mailbox и пароль приложения.";
    }
    if (compact.includes("missing credentials")) {
      return "В Render не подхватились SMTP логин или пароль.";
    }
    if (
      compact.includes("econnrefused") ||
      compact.includes("connection timeout") ||
      compact.includes("etimedout") ||
      compact.includes("enotfound")
    ) {
      return "Не удалось подключиться к SMTP relay. Проверьте host, port и доступность Google SMTP.";
    }
    if (compact.includes("tls")) {
      return "SMTP отклонил TLS-соединение. Проверьте настройки TLS в Google Workspace и Render.";
    }
    if (compact.includes("auth")) {
      return "Google Workspace отклонил SMTP-аутентификацию. Проверьте relay rule и app password.";
    }

    return rawMessage;
  }

  function renderInviteEmailStatusCard(status = {}) {
    const googleConfigured = Boolean(status.googleConfigured);
    const googleConnected = Boolean(status.googleConnected);
    const legacyConfigured = Boolean(status.legacyConfigured);
    const connectHref = status.googleAccountEmail
      ? `${ADMIN_GOOGLE_MAIL_CONNECT_PATH}?email=${encodeURIComponent(status.googleAccountEmail)}`
      : ADMIN_GOOGLE_MAIL_CONNECT_PATH;

    let copy = "Автоматическая отправка invite-писем пока не настроена.";
    let details = `<div class="admin-empty-state">Подключите Gmail API, чтобы письма с подтверждением email уходили без SMTP relay.</div>`;

    if (googleConnected) {
      copy = "Сервисный ящик подключён через Gmail API. Новые invite-письма уходят сразу через Google.";
      details = `<div class="admin-property-list">
        <div class="admin-property-row">
          <span class="admin-property-label">Канал</span>
          <span class="admin-property-value">Google Mail OAuth2</span>
        </div>
        <div class="admin-property-row">
          <span class="admin-property-label">Аккаунт</span>
          <span class="admin-property-value">${escapeHtml(status.googleAccountEmail || "Подключён")}</span>
        </div>
        ${status.legacyFromEmail ? `<div class="admin-property-row">
          <span class="admin-property-label">From header</span>
          <span class="admin-property-value">${escapeHtml(status.legacyFromEmail)}</span>
        </div>` : ""}
      </div>`;
    } else if (googleConfigured) {
      copy = "Google Mail OAuth уже настроен. Осталось один раз подключить сервисный ящик и invite-письма начнут уходить через Gmail API.";
      details = `<div class="admin-empty-state">OAuth client найден, но соединение с Google Mail ещё не завершено.</div>`;
    } else if (legacyConfigured) {
      copy = "Сейчас письма уходят через legacy transport. Gmail API можно подключить здесь же для более надёжной отправки.";
      details = `<div class="admin-property-list">
        <div class="admin-property-row">
          <span class="admin-property-label">Канал</span>
          <span class="admin-property-value">${escapeHtml(status.legacyProvider || "Email")}</span>
        </div>
        ${status.legacyFromEmail ? `<div class="admin-property-row">
          <span class="admin-property-label">From header</span>
          <span class="admin-property-value">${escapeHtml(status.legacyFromEmail)}</span>
        </div>` : ""}
      </div>`;
    }

    return renderAdminCard(
      "Почта приглашений",
      copy,
      `${details}
      ${status.googleLastError ? `<p class="admin-helper-copy" style="margin-top:10px;color:#b42318;">${escapeHtml(formatInviteEmailErrorMessage(status.googleLastError))}</p>` : ""}
      <div class="admin-inline-actions" style="margin-top:14px;">
        ${googleConfigured
          ? `<a class="admin-button" href="${connectHref}">${googleConnected ? "Переподключить Gmail" : "Подключить Gmail"}</a>`
          : `<span class="admin-helper-copy">Добавьте GOOGLE_MAIL_CLIENT_ID и GOOGLE_MAIL_CLIENT_SECRET в Render, затем вернитесь сюда.</span>`}
        ${googleConnected
          ? `<form method="post" action="${ADMIN_SETTINGS_PATH}">
              <input type="hidden" name="action" value="disconnect-google-mail">
              <button class="admin-button admin-button-secondary" type="submit">Отключить</button>
            </form>`
          : ""}
      </div>`,
      { eyebrow: "Почта", muted: true }
    );
  }

  function renderSettingsCreateUserForm(options = {}) {
    const inviteStatus = options.inviteEmailStatus || {};
    const inviteHelperCopy = options.inviteEmailConfigured
      ? inviteStatus.googleConnected
        ? `После создания сотрудник получит письмо через Gmail API от ${escapeHtml(inviteStatus.googleAccountEmail || "подключённого ящика")}. После подтверждения email он сам задаст первый пароль.`
        : "После создания сотрудник получит письмо со ссылкой на подтверждение email и сам задаст первый пароль."
      : inviteStatus.googleConfigured
        ? "Google Mail OAuth уже настроен, но сервисный ящик ещё не подключён. Сначала завершите подключение в блоке почты выше."
        : "Если письмо-приглашение не настроено, задайте стартовый пароль вручную. Иначе сотрудник не завершит первый вход.";

    return `<form
      class="admin-form-grid"
      method="post"
      action="${ADMIN_SETTINGS_PATH}"
      data-admin-async-save="true"
      data-admin-async-success="Карточка сотрудника сохранена."
      data-admin-async-error="Не удалось сохранить карточку сотрудника."
    >
      <input type="hidden" name="action" value="create_user">
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя сотрудника
          <input class="admin-input" type="text" name="name" placeholder="Anna Petrova" required>
        </label>
        <label class="admin-label">
          Роль
          <select class="admin-input" name="role">
            ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}">${escapeHtml(formatSettingsUserRoleLabel(role))}</option>`).join("")}
          </select>
        </label>
        ${renderEmployeeToggleField(true)}
        <label class="admin-label">
          Доступ в систему
          <select class="admin-input" name="status">
            ${USER_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatSettingsUserStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Статус сотрудника
          <select class="admin-input" name="staffStatus">
            ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Email для входа
          <input class="admin-input" type="email" name="email" placeholder="employee@shynli.com" required>
        </label>
        ${renderAdminPhoneInput("phone", "", { required: true })}
        ${renderStaffCompensationFields({})}
      </div>
      ${renderStaffAddressField({
        id: "settings-user-create-address",
        required: true,
      })}
      <label class="admin-label">
        Заметки
        <textarea class="admin-input" name="notes" placeholder="Районы, предпочтительные смены, комментарий по сотруднику"></textarea>
      </label>
      <label class="admin-label">
        Стартовый пароль
        <input class="admin-input" type="password" name="password" minlength="8" placeholder="Необязательно. Оставьте пустым для первого входа через email">
      </label>
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Создать сотрудника и кабинет</button>
        <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-user-create-dialog">Отмена</button>
      </div>
      <p class="admin-helper-copy">${inviteHelperCopy}</p>
    </form>`;
  }

  function renderCreateUserDialog(options = {}) {
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

    return `<dialog class="admin-dialog" id="admin-user-create-dialog"${autoOpenAttr} aria-labelledby="admin-user-create-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Пользователи</p>
            <h2 class="admin-dialog-title" id="admin-user-create-title">Новый сотрудник</h2>
            <p class="admin-dialog-copy">Создайте сотрудника и его личный кабинет одним действием.</p>
          </div>
          ${renderAdminDialogCloseButton("admin-user-create-dialog")}
        </div>
        ${renderSettingsCreateUserForm(options)}
      </div>
    </dialog>`;
  }

  function renderSettingsUserEditor(user, linkedStaff, staffSummary, options = {}) {
    const roleBadgeTone =
      user.role === "admin" ? "success" : user.role === "manager" ? "outline" : "muted";
    const verificationBadge =
      user.emailVerificationRequired && !user.emailVerifiedAt
        ? renderAdminBadge("Ждёт подтверждения email", "outline")
        : "";
    const inactiveBadge =
      normalizeString(user.status, 32).toLowerCase() === "inactive"
        ? renderAdminBadge("Не активен", "muted")
        : "";
    const inviteErrorCopy = !user.emailVerifiedAt && user.inviteEmailLastError
      ? formatInviteEmailErrorMessage(user.inviteEmailLastError)
      : "";
    const canResendInvite = options.inviteEmailConfigured && !user.emailVerifiedAt;

    return `<form class="admin-form-grid" method="post" action="${ADMIN_SETTINGS_PATH}">
      <input type="hidden" name="action" value="update_user">
      <input type="hidden" name="userId" value="${escapeHtmlAttribute(user.id)}">
      <input type="hidden" name="staffId" value="${escapeHtmlAttribute(user.staffId || "")}">
      <div class="admin-inline-badge-row">
        ${renderAdminBadge(formatSettingsUserRoleLabel(user.role), roleBadgeTone)}
        ${inactiveBadge}
        ${user.lastLoginAt ? renderAdminBadge(`Вход: ${formatAdminDateTime(user.lastLoginAt)}`, "outline") : renderAdminBadge("Пока не входил", "muted")}
        ${verificationBadge}
      </div>
      ${inviteErrorCopy ? `<p class="admin-helper-copy" style="margin-top:8px;color:#b42318;">${escapeHtml(inviteErrorCopy)}</p>` : ""}
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя сотрудника
          <input class="admin-input" type="text" name="name" value="${escapeHtmlText(linkedStaff ? linkedStaff.name : "")}" required>
        </label>
        <label class="admin-label">
          Роль
          <select class="admin-input" name="role">
            ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}"${user.role === role ? " selected" : ""}>${escapeHtml(formatSettingsUserRoleLabel(role))}</option>`).join("")}
          </select>
        </label>
        ${renderEmployeeToggleField(isEmployeeLinkedUser(user))}
        <label class="admin-label">
          Доступ в систему
          <select class="admin-input" name="status">
            ${USER_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${user.status === status ? " selected" : ""}>${escapeHtml(formatSettingsUserStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Статус сотрудника
          <select class="admin-input" name="staffStatus">
            ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${(linkedStaff ? linkedStaff.status : "active") === status ? " selected" : ""}>${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Email
          <input class="admin-input" type="email" name="email" value="${escapeHtmlText(user.email)}" required>
        </label>
        ${renderAdminPhoneInput("phone", user.phone)}
        ${renderStaffCompensationFields({
          value: linkedStaff ? linkedStaff.compensationValue : "",
          type: linkedStaff ? linkedStaff.compensationType : "fixed",
        })}
      </div>
      ${renderStaffAddressField({
        id: `settings-user-address-${user.id}`,
        value: linkedStaff ? linkedStaff.address : "",
      })}
      <label class="admin-label">
        Заметки
        <textarea class="admin-input" name="notes" placeholder="Районы, доступность, комментарий по сотруднику">${escapeHtml(linkedStaff ? linkedStaff.notes : "")}</textarea>
      </label>
      <label class="admin-label">
        Новый пароль
        <input class="admin-input" type="password" name="password" minlength="8" placeholder="Оставьте пустым, если менять не нужно">
      </label>
      <p class="admin-field-note" data-admin-async-feedback hidden></p>
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Сохранить сотрудника</button>
      </div>
    </form>
    ${canResendInvite
      ? `<form class="admin-inline-actions" method="post" action="${ADMIN_SETTINGS_PATH}">
          <input type="hidden" name="action" value="resend_user_invite">
          <input type="hidden" name="userId" value="${escapeHtmlAttribute(user.id)}">
          <input type="hidden" name="staffName" value="${escapeHtmlAttribute(linkedStaff ? linkedStaff.name : user.email)}">
          <button class="admin-button admin-button-secondary" type="submit">Отправить письмо ещё раз</button>
        </form>`
      : ""}
    ${options.canDelete
      ? `<form class="admin-inline-actions admin-inline-actions-end" method="post" action="${ADMIN_SETTINGS_PATH}">
          <input type="hidden" name="action" value="delete_user">
          <input type="hidden" name="userId" value="${escapeHtmlAttribute(user.id)}">
          ${renderAdminDeleteIconButton("Удалить пользователя")}
        </form>`
      : ""}
    ${staffSummary ? `<p class="admin-helper-copy">Сейчас у сотрудника ${escapeHtml(formatOrderCountLabel(staffSummary.assignedCount))} и ${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))} на ближайшие 7 дней.</p>` : ""}`;
  }

  function renderSettingsUserDialog(user, linkedStaff, staffSummary, options = {}) {
    const dialogId = `admin-settings-user-dialog-${escapeHtmlAttribute(user.id)}`;
    const subtitle = linkedStaff
      ? `${formatSettingsUserRoleLabel(user.role)} • ${staffSummary ? formatOrderCountLabel(staffSummary.assignedCount) : "0 заказов"}`
      : "Привязка к сотруднику потеряна.";
    const titleLabel = linkedStaff ? linkedStaff.name : user.email;
    const contactLabel = [user.email, formatAdminPhoneNumber(user.phone) || user.phone || ""].filter(Boolean).join(" • ");
    const addressLabel = linkedStaff && linkedStaff.address ? linkedStaff.address : "";
    const avatarToneSeed = linkedStaff ? linkedStaff.name || linkedStaff.id : user.email || user.id;

    return `<dialog class="admin-dialog" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <div class="admin-dialog-panel admin-client-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(avatarToneSeed))}">${escapeHtml(getAdminClientAvatarInitials(titleLabel))}</div>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Пользователь</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${dialogId}-title">${escapeHtml(titleLabel)}</h2>
                <p class="admin-dialog-hero-subtitle">${escapeHtml(subtitle)}</p>
                <div class="admin-dialog-hero-meta-stack">
                  ${contactLabel ? `<p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(contactLabel)}</p>` : ""}
                  ${addressLabel ? `<p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(addressLabel)}</p>` : ""}
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        ${renderSettingsUserEditor(user, linkedStaff, staffSummary, options)}
      </div>
    </dialog>`;
  }

  function renderSettingsUsersSection(users, staffRecords, staffSummaryById = new Map(), options = {}) {
    const createUserDialog = renderCreateUserDialog(options);

    if (!users.length) {
      return `<div id="settings-users"></div>
        <div class="admin-empty-state">Пользователей пока нет. Нажмите «Добавить сотрудника», и у него сразу появится личный кабинет.</div>
        ${createUserDialog}`;
    }

    const userRows = [];
    const userDialogs = [];

    users.forEach((user) => {
        const linkedStaff = staffRecords.find((record) => record.id === user.staffId) || null;
        const staffSummary = linkedStaff ? staffSummaryById.get(linkedStaff.id) || null : null;
        const dialogId = `admin-settings-user-dialog-${escapeHtmlAttribute(user.id)}`;
        const verificationText =
          user.emailVerificationRequired && user.emailVerifiedAt
            ? "Подтверждён"
            : user.emailVerificationRequired
              ? "Ждёт email"
              : "Без шага email";
        const inviteText = user.inviteEmailLastError
          ? "Ошибка письма"
          : user.inviteEmailSentAt
            ? `Отправлено ${formatAdminDateTime(user.inviteEmailSentAt)}`
            : "Не отправлялось";

        userRows.push(`<tr
          class="admin-table-row-clickable"
          tabindex="0"
          data-admin-dialog-row="true"
          data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
          aria-label="${escapeHtmlAttribute(`Открыть пользователя ${linkedStaff ? linkedStaff.name : user.email}`)}"
        >
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-link">${escapeHtml(linkedStaff ? linkedStaff.name : user.email)}</span>
              <span class="admin-table-muted">${escapeHtml(formatSettingsUserRoleLabel(user.role))}</span>
            </div>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(user.email)}</span>
              <span class="admin-table-muted">${escapeHtml(formatAdminPhoneNumber(user.phone) || "Телефон не указан")}</span>
            </div>
          </td>
          <td>
            <div class="admin-inline-badge-row">
              ${renderAdminBadge(formatSettingsUserStatusLabel(user.status), user.status === "active" ? "success" : "muted")}
              ${renderAdminBadge(verificationText, user.emailVerificationRequired && !user.emailVerifiedAt ? "outline" : "muted")}
            </div>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(staffSummary ? formatOrderCountLabel(staffSummary.assignedCount) : "0 заказов")}</span>
              <span class="admin-table-muted">${escapeHtml(staffSummary ? formatOrderCountLabel(staffSummary.upcomingWeekCount) : "0 заказов")} на 7 дней</span>
            </div>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(user.lastLoginAt ? formatAdminDateTime(user.lastLoginAt) : "Пока не входил")}</span>
              <span class="admin-table-muted">${escapeHtml(inviteText)}</span>
            </div>
          </td>
        </tr>`);
        userDialogs.push(renderSettingsUserDialog(user, linkedStaff, staffSummary, options));
      });

    return `<div id="settings-users"></div>
      <div class="admin-table-wrap admin-settings-table-wrap">
        <table class="admin-table admin-settings-users-table">
          <thead>
            <tr>
              <th>Пользователь</th>
            <th>Контакты</th>
            <th>Доступ</th>
            <th>Нагрузка</th>
            <th>Активность</th>
          </tr>
        </thead>
        <tbody>${userRows.join("")}</tbody>
      </table>
      </div>
      ${userDialogs.join("")}
      ${createUserDialog}`;
  }

  function renderSettingsChecklistEditorScript() {
    return `<script>
      (() => {
        function renumberChecklistRows(scope) {
          if (!scope || typeof scope.querySelectorAll !== "function") return;
          scope.querySelectorAll("[data-admin-checklist-edit-row]").forEach((row, index) => {
            const indexNode = row.querySelector(".admin-checklist-edit-index");
            if (indexNode) {
              indexNode.textContent = String(index + 1);
            }
          });
        }

        document.addEventListener("click", (event) => {
          const addTrigger = event.target.closest("[data-admin-checklist-add-item]");
          if (addTrigger) {
            const form = addTrigger.closest("form");
            const list = form && form.querySelector("[data-admin-checklist-item-list]");
            if (!list) return;
            const templateHtml = list.getAttribute("data-admin-checklist-item-template") || "";
            if (!templateHtml) return;
            const nextRow = document.createRange().createContextualFragment(templateHtml).firstElementChild;
            if (!nextRow) return;
            list.appendChild(nextRow);
            renumberChecklistRows(list);
            const nextInput = nextRow.querySelector('input[name="itemLabel"]');
            if (nextInput && typeof nextInput.focus === "function") {
              nextInput.focus();
            }
            return;
          }

          const removeTrigger = event.target.closest("[data-admin-checklist-remove-item]");
          if (!removeTrigger) return;
          const row = removeTrigger.closest("[data-admin-checklist-edit-row]");
          const list = row && row.parentElement;
          if (!row || !list) return;
          row.remove();
          renumberChecklistRows(list);
        });

        document.querySelectorAll("[data-admin-checklist-item-list]").forEach((list) => {
          renumberChecklistRows(list);
        });
      })();
    </script>`;
  }

  async function renderSettingsPage(req, config, settingsStore, usersStore, staffStore, quoteOpsLedger, adminRuntime = {}) {
    const snapshot = settingsStore ? await settingsStore.getSnapshot() : { templates: [] };
    const templates = Array.isArray(snapshot.templates) ? snapshot.templates : [];
    const usersSnapshot = usersStore ? await usersStore.getSnapshot() : { users: [] };
    const users = Array.isArray(usersSnapshot.users) ? usersSnapshot.users : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const staffRecords = Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [];
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const staffSummaryById = new Map((planning.staffSummaries || []).map((record) => [record.id, record]));
    const activeSection = getSettingsSection(req);
    const activeUsersCount = users.filter((user) => user.status === "active").length;
    const usersWithLoginCount = users.filter((user) => Boolean(user.lastLoginAt)).length;
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const reqUrl = getRequestUrl(req);
    const currentNotice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    const inviteEmailStatus =
      adminRuntime &&
      adminRuntime.accountInviteEmail &&
      typeof adminRuntime.accountInviteEmail.getStatus === "function"
        ? await adminRuntime.accountInviteEmail.getStatus(config)
        : { configured: false };
    const inviteEmailConfigured = Boolean(inviteEmailStatus && inviteEmailStatus.configured);

    const sectionIntro = renderSettingsSectionNav(
      activeSection,
      {
        checklistCount: templates.length,
        userCount: users.length,
      },
      {
        actions:
          activeSection === "users"
            ? `<div class="admin-dialog-launcher admin-dialog-launcher-inline">
                <button class="admin-button" type="button" data-admin-dialog-open="admin-user-create-dialog">Добавить сотрудника</button>
              </div>`
            : "",
      }
    );

    const checklistsContent = `
      <div class="admin-settings-section-stack">
        ${renderAdminCard(
          "Шаблоны чек-листов",
          "Открывайте шаблон, просматривайте состав и редактируйте пункты только при необходимости.",
          renderSettingsChecklistsTable(templates),
          { eyebrow: "Настройки" }
        )}
      </div>`;

    const usersContent = `
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Пользователи",
          "Все личные кабинеты сотрудников.",
          `<p class="admin-metric-value">${escapeHtml(String(users.length))}</p>`,
          { eyebrow: "Настройки" }
        )}
        ${renderAdminCard(
          "Активные",
          "Пользователи, которые могут войти.",
          `<p class="admin-metric-value">${escapeHtml(String(activeUsersCount))}</p>`,
          { eyebrow: "Настройки", muted: true }
        )}
        ${renderAdminCard(
          "Заходили",
          "Пользователи с хотя бы одним успешным входом.",
          `<p class="admin-metric-value">${escapeHtml(String(usersWithLoginCount))}</p>`,
          { eyebrow: "Настройки", muted: true }
        )}
      </div>
      <div class="admin-settings-section-stack">
        ${renderAdminCard(
          "Пользователи",
          "Создавайте личные кабинеты, привязывайте их к сотрудникам и управляйте доступом.",
          renderSettingsUsersSection(users, staffRecords, staffSummaryById, {
            canDelete: accessContext.canDelete,
            autoOpen: currentNotice === "user-error",
            inviteEmailConfigured,
            inviteEmailStatus,
          }),
          { eyebrow: "Настройки", muted: true }
        )}
        ${accessContext.canEdit ? renderInviteEmailStatusCard(inviteEmailStatus) : ""}
      </div>`;

    return renderAdminLayout(
      activeSection === "users" ? "Пользователи" : "Чек-листы",
      `${renderSettingsNotice(req)}
        ${sectionIntro}
        ${activeSection === "users" ? usersContent : checklistsContent}`,
      {
        kicker: "Настройки",
        subtitle:
          activeSection === "users"
            ? "Личные кабинеты сотрудников и управление доступом."
            : "Шаблоны чек-листов для разных типов уборки.",
        bodyScripts:
          activeSection === "users"
            ? renderStaffAddressAutocompleteScript()
            : renderSettingsChecklistEditorScript(),
        sidebar: renderAdminAppSidebar(ADMIN_SETTINGS_PATH, accessContext),
      }
    );
  }

  function renderQuoteOpsStatusBadge(status) {
    if (status === "success") return renderAdminBadge("Успешно", "success");
    if (status === "warning") return renderAdminBadge("Проверить", "default");
    return renderAdminBadge("Ошибка", "danger");
  }

  function renderLeadStatusBadge(status) {
    const normalized = normalizeLeadStatus(status, "new");
    if (normalized === "confirmed") return renderAdminBadge("Подтверждено", "success");
    if (normalized === "discussion") return renderAdminBadge("Обсуждение", "outline");
    if (normalized === "no-response") return renderAdminBadge("Без ответа", "default");
    if (normalized === "declined") return renderAdminBadge("Отказ", "danger");
    return renderAdminBadge("New", "muted");
  }

  async function collectQuoteOpsManagerOptions(adminRuntime = {}, staffStore = null) {
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    if (!usersStore || typeof usersStore.getSnapshot !== "function") return [];

    const [usersSnapshot, staffSnapshot] = await Promise.all([
      usersStore.getSnapshot(),
      staffStore && typeof staffStore.getSnapshot === "function"
        ? staffStore.getSnapshot()
        : Promise.resolve({ staff: [] }),
    ]);

    const staffNameById = new Map(
      (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
        .map((record) => [normalizeString(record && record.id, 120), normalizeString(record && record.name, 200)])
        .filter(([id, name]) => Boolean(id && name))
    );

    return (Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : [])
      .filter((user) => {
        const role = normalizeString(user && user.role, 32).toLowerCase();
        const status = normalizeString(user && user.status, 32).toLowerCase();
        return status === "active" && role === "manager";
      })
      .map((user) => {
        const id = normalizeString(user.id, 120);
        const email = normalizeString(user.email, 250).toLowerCase();
        const name = staffNameById.get(normalizeString(user.staffId, 120)) || email || "Менеджер";
        return { id, email, name };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  function getQuoteLeadManager(entry) {
    const adminLead = getEntryAdminLeadData(entry);
    return {
      id: normalizeString(adminLead.managerId, 120),
      name: normalizeString(adminLead.managerName, 200),
      email: normalizeString(adminLead.managerEmail, 250).toLowerCase(),
    };
  }

  function renderQuoteOpsManagerSelect(managerOptions, selectedManagerId) {
    const normalizedSelectedManagerId = normalizeString(selectedManagerId, 120);
    return `<select class="admin-input" name="managerId">
      ${managerOptions.length === 0 ? '<option value="">Не назначен</option>' : ""}
      ${managerOptions.map((manager) => `
        <option value="${escapeHtmlAttribute(manager.id)}"${manager.id === normalizedSelectedManagerId ? " selected" : ""}>
          ${escapeHtml(manager.name)}
        </option>
      `).join("")}
    </select>`;
  }

  function renderQuoteOpsSectionNav(activeSection) {
    const items = [
      { id: "list", label: "Лента", href: `${ADMIN_QUOTE_OPS_PATH}` },
      { id: "funnel", label: "Воронка", href: `${ADMIN_QUOTE_OPS_PATH}?section=funnel` },
      { id: "tasks", label: "Таски", href: `${ADMIN_QUOTE_OPS_PATH}?section=tasks` },
    ];

    return `<div class="admin-subnav-strip">
      ${items.map((item) => `
        <a class="admin-subnav-link${activeSection === item.id ? " admin-subnav-link-active" : ""}" href="${item.href}">
          ${escapeHtml(item.label)}
        </a>
      `).join("")}
    </div>`;
  }

  function formatAdminDateTimeInputValue(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const formatted = date.toLocaleString("sv-SE", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatted.replace(" ", "T");
  }

  function buildQuoteOpsTaskRecords(entries = []) {
    return entries.flatMap((entry) => {
      const leadStatus = getLeadStatus(entry);
      const manager = getQuoteLeadManager(entry);
      return getEntryLeadTasks(entry).map((task) => ({
        ...task,
        entry,
        leadStatus,
        manager,
        customerName: normalizeString(entry.customerName || "Клиент", 200),
        requestId: normalizeString(entry.requestId, 120),
        serviceLabel: formatAdminServiceLabel(entry.serviceName || entry.serviceType),
      }));
    });
  }

  function getQuoteOpsStatusMeta(status) {
    if (status === "success") {
      return {
        label: "Успешно",
        tone: "success",
        kicker: "",
        title: "Все заявки",
        copy: "Эти заявки дошли до CRM без ошибок и warning-статусов.",
      };
    }
    if (status === "warning") {
      return {
        label: "Проверить",
        tone: "default",
        kicker: "Нужна проверка",
        title: "Есть warning-статусы",
        copy: "CRM приняла заявку, но часть полей или действий требует ручной проверки.",
      };
    }
    return {
      label: "Ошибка",
      tone: "danger",
      kicker: "Сбой синхронизации",
      title: "Нужна ручная проверка",
      copy: "Эти заявки не дошли до CRM с первого раза и должны быть в приоритете.",
    };
  }

  function formatQuoteOpsEntryCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} заявка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} заявки`;
    return `${normalized} заявок`;
  }

  function renderQuoteOpsOverviewStrip(metrics) {
    const items = [
      {
        label: "Заявки",
        value: metrics.totalEntries,
        copy: "Весь поток заявок с сайта.",
        tone: "accent",
      },
      {
        label: "Успешно",
        value: metrics.successCount,
        copy: "Без ошибок и warning-статусов.",
        tone: "success",
      },
      {
        label: "Внимание",
        value: metrics.attentionCount,
        copy: "Ошибка CRM или warning после отправки.",
        tone: metrics.attentionCount > 0 ? "danger" : "default",
      },
      {
        label: "За 24 часа",
        value: metrics.recentCount,
        copy: "Новая входящая нагрузка за последние сутки.",
        tone: "default",
      },
    ];

    return `<div class="admin-compact-summary-strip admin-quote-ops-summary-strip">
      ${items.map((item) => `
        <article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
          <div class="admin-compact-summary-head">
            <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
            <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
          </div>
          <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
        </article>
      `).join("")}
    </div>`;
  }

  function renderQuoteOpsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "order-created") {
      return `<div class="admin-alert admin-alert-info">Заявка подтверждена и переведена в заказ.</div>`;
    }
    if (notice === "lead-confirmed") {
      return `<div class="admin-alert admin-alert-info">Заявка подтверждена. Заказ создан автоматически.</div>`;
    }
    if (notice === "lead-stage-saved") {
      return `<div class="admin-alert admin-alert-info">Статус заявки обновлён.</div>`;
    }
    if (notice === "lead-notes-saved") {
      return `<div class="admin-alert admin-alert-info">Заметки сохранены.</div>`;
    }
    if (notice === "lead-deleted") {
      return `<div class="admin-alert admin-alert-info">Заявка удалена.</div>`;
    }
    if (notice === "task-saved") {
      return `<div class="admin-alert admin-alert-info">Задача обновлена.</div>`;
    }
    if (notice === "manager-saved") {
      return `<div class="admin-alert admin-alert-info">Менеджер закреплён за заявкой.</div>`;
    }
    if (notice === "discussion-contact-required") {
      return `<div class="admin-alert admin-alert-error">Для этапа «Обсуждение» укажите следующий контакт с клиентом.</div>`;
    }
    if (notice === "lead-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось обновить заявку. Попробуйте ещё раз.</div>`;
    }
    if (notice === "lead-missing") {
      return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
    }
    if (notice === "retry-success") {
      return `<div class="admin-alert admin-alert-info">Повторная отправка выполнена.</div>`;
    }
    if (notice === "retry-failed") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не удалась. Проверьте заявку ниже.</div>`;
    }
    if (notice === "retry-missing") {
      return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
    }
    if (notice === "quote-sms-sent") {
      return `<div class="admin-alert admin-alert-info">SMS по заявке отправлена через Go High Level.</div>`;
    }
    if (notice === "quote-sms-empty") {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой SMS.</div>`;
    }
    if (notice === "quote-sms-unavailable") {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === "quote-sms-contact-missing" || notice === "quote-sms-failed") {
      const smsError = normalizeString(reqUrl.searchParams.get("smsError"), 240);
      return `<div class="admin-alert admin-alert-error">${escapeHtml(smsError || "Не удалось отправить SMS по заявке.")}</div>`;
    }
    return "";
  }

  function renderQuoteOpsInfoItem(label, value, options = {}) {
    return `<article class="admin-quote-entry-info${options.wide ? " admin-quote-entry-info-wide" : ""}">
      <span class="admin-quote-entry-info-label">${escapeHtml(label)}</span>
      <p class="admin-quote-entry-info-value">${value}</p>
    </article>`;
  }

  function renderQuoteOpsCrmItem(label, value) {
    return `<article class="admin-quote-entry-crm-item">
      <span class="admin-quote-entry-crm-label">${escapeHtml(label)}</span>
      <p class="admin-quote-entry-crm-value">${escapeHtml(value || "—")}</p>
    </article>`;
  }

  function getQuoteOpsDialogId(entryId) {
    const normalized = normalizeString(entryId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-quote-entry-detail-dialog-${safeSuffix || "record"}`;
  }

  function renderQuoteOpsEntryCard(entry, returnTo) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
    const leadStatus = getLeadStatus(entry);
    const manager = getQuoteLeadManager(entry);
    const openTask = getEntryOpenLeadTask(entry);
    const contactMarkup = [
      entry.customerPhone ? `<span>${escapeHtml(formatAdminPhoneNumber(entry.customerPhone) || entry.customerPhone)}</span>` : `<span>Телефон не указан</span>`,
      entry.customerEmail ? `<span>${escapeHtml(entry.customerEmail)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-quote-entry-feedback admin-quote-entry-feedback-warning">
          <strong>Нужно проверить</strong>
          <span>${escapeHtml(entry.warnings.join(" • "))}</span>
        </div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-quote-entry-feedback admin-quote-entry-feedback-error">
          <strong>Ошибка CRM</strong>
          <span>${escapeHtml(entry.errorMessage)}</span>
        </div>`
      : "";
    const stateBadges = [
      renderLeadStatusBadge(leadStatus),
      renderQuoteOpsStatusBadge(entry.status),
      entry.retryCount > 0 ? renderAdminBadge(`Retry ${entry.retryCount}`, "outline") : "",
      entry.contactId
        ? renderAdminBadge(entry.usedExistingContact ? "Контакт найден" : "Контакт создан", entry.usedExistingContact ? "outline" : "success")
        : "",
      entry.noteCreated ? renderAdminBadge("Заметка создана", "outline") : "",
      entry.opportunityCreated ? renderAdminBadge("Сделка создана", "outline") : "",
      entry.retryable ? renderAdminBadge("Можно повторить", entry.status === "error" ? "danger" : "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const retrySummary = entry.retryCount > 0
      ? `Последний retry: ${formatAdminDateTime(entry.lastRetryAt)}${entry.lastRetryMessage ? ` • ${entry.lastRetryMessage}` : ""}`
      : "Повторов ещё не было. Используйте retry только если нужно заново синхронизировать заявку с CRM.";

    return `<article class="admin-quote-entry admin-quote-entry-${escapeHtmlAttribute(entry.status || "error")}">
      <div class="admin-quote-entry-head">
        <div class="admin-quote-entry-main">
          <div class="admin-quote-entry-topline">
            <span>${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
            <span class="admin-quote-entry-separator"></span>
            <span>${escapeHtml(entry.requestId || "Номер не указан")}</span>
          </div>
          <h3 class="admin-quote-entry-title">
            <button
              class="admin-quote-entry-title-button"
              type="button"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
            >${escapeHtml(entry.customerName || "Клиент")}</button>
          </h3>
          <p class="admin-quote-entry-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
        </div>
        <div class="admin-quote-entry-side">
          <span class="admin-quote-entry-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
          <div class="admin-quote-entry-badges">
            ${stateBadges}
          </div>
        </div>
      </div>
      <div class="admin-quote-entry-crm-grid">
        ${renderQuoteOpsCrmItem("CRM код", entry.code || "—")}
        ${renderQuoteOpsCrmItem("HTTP", entry.httpStatus ? String(entry.httpStatus) : "—")}
        ${renderQuoteOpsCrmItem("Контакт ID", entry.contactId || "—")}
        ${renderQuoteOpsCrmItem("Источник", entry.source || "site")}
      </div>
      <div class="admin-quote-entry-info-grid">
        ${renderQuoteOpsInfoItem("Дата уборки", escapeHtml(scheduleLabel))}
        ${renderQuoteOpsInfoItem("Контакты", contactMarkup)}
        ${renderQuoteOpsInfoItem("Адрес", escapeHtml(entry.fullAddress || "Не указан"), { wide: true })}
      </div>
      ${warningBlock}
      ${errorBlock}
      <div class="admin-quote-entry-info-grid">
        ${renderQuoteOpsInfoItem("Менеджер", escapeHtml(manager.name || manager.email || "Не назначен"))}
        ${renderQuoteOpsInfoItem(
          "Активный таск",
          escapeHtml(
            openTask
              ? `${openTask.title} • ${formatAdminDateTime(openTask.dueAt)}`
              : leadStatus === "confirmed"
                ? "Заказ уже создан"
                : "Открытых задач нет"
          )
        )}
      </div>
      <div class="admin-quote-entry-footer">
        <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <button class="admin-button${entry.status === "success" ? " admin-button-secondary" : ""}" type="submit">Повторить отправку</button>
        </form>
        <span class="admin-action-hint">${escapeHtml(retrySummary)}</span>
      </div>
    </article>`;
  }

  function renderQuoteOpsSuccessTable(entries, returnTo) {
    void returnTo;
    return `<div class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-success-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Адрес</th>
            <th>Услуга</th>
            <th>Уборка</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => {
            const dialogId = getQuoteOpsDialogId(entry.id);
            const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
            const clientContactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "", entry.customerEmail || ""].filter(Boolean).join(" • ") || "Контакты не указаны";

            return `<tr
              class="admin-table-row-clickable"
              tabindex="0"
              data-admin-dialog-row="true"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
              aria-label="${escapeHtmlAttribute(`Открыть заявку ${entry.customerName || "Клиент"}`)}"
            >
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-link">${escapeHtml(entry.customerName || "Клиент")}</span>
                  <span class="admin-table-muted">${escapeHtml(clientContactLabel)}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-line-clamp-two">${escapeHtml(entry.fullAddress || "Не указан")}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</span>
                  <span class="admin-table-muted">${escapeHtml([formatAdminDateTime(entry.createdAt), entry.requestId || ""].filter(Boolean).join(" • "))}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(scheduleLabel)}</span>
                </div>
              </td>
              <td class="admin-table-number">
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
                  <span class="admin-table-muted">${escapeHtml(entry.retryCount > 0 ? `Retry ${entry.retryCount}` : "Без retry")}</span>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderQuoteOpsDetailDialog(entry, returnTo, managerOptions = [], options = {}) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";
    const closeHref = options.closeHref || "";
    const orderCreated = isOrderCreatedEntry(entry);
    const leadStatus = getLeadStatus(entry);
    const manager = getQuoteLeadManager(entry);
    const leadTasks = getEntryLeadTasks(entry);
    const openTasks = leadTasks.filter((task) => task.status === "open");
    const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
    const createdLabel = formatAdminDateTime(entry.createdAt);
    const phoneLabel = formatAdminPhoneNumber(entry.customerPhone) || "Телефон не указан";
    const emailLabel = entry.customerEmail || "E-mail не указан";
    const titleLabel = entry.customerName || "Карточка заявки";
    const serviceLabel = formatAdminServiceLabel(entry.serviceName || entry.serviceType);
    const leadData = getEntryAdminLeadData(entry);
    const leadNotes = normalizeString(leadData.notes, 2000);
    const leadTaskRecords = leadTasks.map((task) => ({
      ...task,
      entry,
      leadStatus,
      manager,
      customerName: normalizeString(entry.customerName || "Клиент", 200),
      requestId: normalizeString(entry.requestId, 120),
      serviceLabel,
    }));
    const openTaskRecords = leadTaskRecords.filter((task) => task.status === "open");
    const quoteData = getOrderQuoteData({ entry });
    const selectedServices = getOrderQuoteSelectedServices(quoteData);
    const additionalDetailsMarkup = formatOrderQuoteMultiline(quoteData.additionalDetails);
    const quoteTotalPrice =
      quoteData.totalPrice === 0 || quoteData.totalPrice
        ? quoteData.totalPrice
        : entry.totalPrice;
    const summaryBadges = [
      renderLeadStatusBadge(leadStatus),
      renderQuoteOpsStatusBadge(entry.status),
      renderAdminBadge(serviceLabel, "outline"),
      entry.retryCount > 0 ? renderAdminBadge(`Retry ${entry.retryCount}`, "outline") : "",
      entry.requestId ? renderAdminBadge(entry.requestId, "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const prioritySummaryItems = [
      { label: "Сумма", value: formatCurrencyAmount(quoteTotalPrice) },
      { label: "Дата и время", value: scheduleLabel },
      { label: "Телефон", value: phoneLabel },
      { label: "Услуга", value: serviceLabel },
      { label: "Адрес", value: entry.fullAddress || "Не указан", wide: true },
    ];
    const secondarySummaryItems = [
      { label: "E-mail", value: emailLabel },
      { label: "Создана", value: createdLabel },
      { label: "Менеджер", value: manager.name || manager.email || "Не назначен" },
    ].filter(Boolean);
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(entry.warnings.join(" • "))}</div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(entry.errorMessage)}</div>`
      : "";
    const quoteCards = [
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Что заказал клиент</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Тип уборки", formatOrderQuoteServiceType(quoteData.serviceType, serviceLabel))}
          ${renderOrderQuoteField("Повторяемость", formatOrderQuoteFrequency(quoteData.frequency, "Not set"))}
          ${renderOrderQuoteField("Дата", formatOrderQuoteDateValue(quoteData.selectedDate || entry.selectedDate))}
          ${renderOrderQuoteField("Время", formatOrderQuoteTimeValue(quoteData.selectedTime || entry.selectedTime))}
          ${renderOrderQuoteField("Запрошенный слот", formatOrderQuoteRequestedSlot(quoteData.formattedDateTime, quoteData.selectedDate || entry.selectedDate, quoteData.selectedTime || entry.selectedTime), { wide: true })}
          ${renderOrderQuoteField("Сумма из quote", formatCurrencyAmount(quoteTotalPrice))}
          ${renderOrderQuoteField("Согласие", formatOrderQuoteBoolean(quoteData.consent))}
          ${renderOrderQuoteField("Выбранные add-ons", selectedServices.length > 0 ? selectedServices.join(", ") : "Не выбраны", { wide: true })}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.interiorWindowsCleaning, getOrderQuoteQuantityValue(quoteData, "interiorWindowsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.blindsCleaning, getOrderQuoteQuantityValue(quoteData, "blindsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.bedLinenChange, getOrderQuoteQuantityValue(quoteData, "bedLinenChange"))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Дом и условия</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Спальни", formatOrderQuoteText(quoteData.rooms, "Не указано", 32))}
          ${renderOrderQuoteField("Санузлы", formatOrderQuoteText(quoteData.bathrooms, "Не указано", 32))}
          ${renderOrderQuoteField("Размер дома", formatOrderQuoteSquareFootage(quoteData.squareMeters))}
          ${renderOrderQuoteField("Питомцы", formatOrderQuoteBoolean(quoteData.hasPets))}
          ${renderOrderQuoteField("Basement cleaning", formatOrderQuoteBoolean(quoteData.basementCleaning))}
          ${renderOrderQuoteField("Apt / suite", formatOrderQuoteText(quoteData.addressLine2, "Не указано", 200))}
          ${renderOrderQuoteField("Город", formatOrderQuoteText(quoteData.city, "Не указано", 120))}
          ${renderOrderQuoteField("Штат", formatOrderQuoteText(quoteData.state, "Не указано", 32))}
          ${renderOrderQuoteField("ZIP", formatOrderQuoteText(quoteData.zipCode, "Не указано", 32))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Комментарий клиента</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Комментарий клиента", additionalDetailsMarkup, { raw: true, wide: true })}
        </div>
      </article>`,
    ].join("");

    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${escapeHtmlAttribute(dialogId)}"${autoOpenAttr}${closeHref ? ` data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"` : ""} aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(titleLabel))}">${escapeHtml(getAdminClientAvatarInitials(titleLabel))}</div>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Заявка</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(titleLabel)}</h2>
                <div class="admin-dialog-hero-meta-stack">
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(`Телефон: ${phoneLabel}`)}</p>
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(`E-mail: ${emailLabel}`)}</p>
                  <p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(entry.fullAddress || "Адрес не указан")}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${orderCreated
              ? `<a class="admin-button" href="${escapeHtmlAttribute(buildAdminRedirectPath(ADMIN_ORDERS_PATH, { order: entry.id, notice: "order-created" }))}">Открыть заказ</a>`
              : `<form method="post" action="${ADMIN_QUOTE_OPS_PATH}">
                  <input type="hidden" name="action" value="create-order-from-request">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button class="admin-button" type="submit">Подтвердить и создать заказ</button>
                </form>`}
            <form method="post" action="${ADMIN_QUOTE_OPS_PATH}">
              <input type="hidden" name="action" value="delete-lead-entry">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              ${renderAdminDeleteIconButton("Удалить заявку", "Удалить эту заявку из системы без возможности восстановления?")}
            </form>
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <section class="admin-client-summary-panel">
          <div class="admin-client-summary-head">
            <div class="admin-client-summary-copy-block">
              <div class="admin-badge-row admin-client-badge-row">
                ${summaryBadges}
              </div>
            </div>
          </div>
          ${warningBlock}
          ${errorBlock}
          <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
            ${prioritySummaryItems.map((item) => `
              <article class="admin-client-metric-card${item.wide ? " admin-client-metric-card-wide" : ""}">
                <span class="admin-client-metric-label">${escapeHtml(item.label)}</span>
                <p class="admin-client-metric-value">${escapeHtml(item.value)}</p>
              </article>
            `).join("")}
          </div>
          ${renderAdminClientInfoGrid(secondarySummaryItems, { columns: 3 })}
        </section>
        ${renderAdminGhlSmsComposer({
          req: options.req,
          actionPath: ADMIN_QUOTE_OPS_PATH,
          targetType: "quote",
          targetRef: entry.id,
          targetFieldName: "entryId",
          targetFieldValue: entry.id,
          returnTo,
          phone: entry.customerPhone,
          contactId: entry.contactId,
          historyEntries: getEntrySmsHistoryEntries(entry),
          leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
          canEdit: options.canEdit,
          noticePrefix: "quote",
          title: "SMS по заявке",
          description: "Быстрая отправка сообщения клиенту по этой заявке через Go High Level.",
        })}
        <section>
          ${renderAdminCard(
            "Заметки",
            "Внутренние заметки менеджера по этой заявке.",
            `<form class="admin-form admin-form-grid admin-quote-entry-notes-form" method="post" action="${ADMIN_QUOTE_OPS_PATH}" data-quote-entry-notes-form="true">
              <input type="hidden" name="action" value="update-lead-notes">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              <label class="admin-label">
                <span class="admin-sr-only">Заметки</span>
                <textarea class="admin-input" name="notes" rows="6" placeholder="Что важно знать по заявке: договорённости, нюансы, комментарии по клиенту">${escapeHtml(leadNotes)}</textarea>
              </label>
              <p class="admin-field-note" data-quote-entry-notes-feedback="true" hidden></p>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Сохранить</button>
              </div>
            </form>`,
            { muted: true }
          )}
        </section>
        <section>
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Поля из формы клиента</h3>
          </div>
          <div class="admin-order-quote-grid">
            ${quoteCards}
          </div>
        </section>
        <section>
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Этап и менеджер</h3>
          </div>
          <div class="admin-quote-entry-detail-grid">
            ${renderAdminCard(
              "Воронка заявки",
              "Назначьте менеджера и обновляйте текущий этап прямо из карточки.",
              `<form class="admin-form admin-form-grid admin-form-grid-two admin-quote-entry-stage-form" method="post" action="${ADMIN_QUOTE_OPS_PATH}">
                <input type="hidden" name="action" value="update-lead-status">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <label class="admin-label">
                  Статус заявки
                  <select class="admin-input" name="leadStatus">
                    <option value="new"${leadStatus === "new" ? " selected" : ""}>New</option>
                    <option value="no-response"${leadStatus === "no-response" ? " selected" : ""}>Без ответа</option>
                    <option value="discussion"${leadStatus === "discussion" ? " selected" : ""}>Обсуждение</option>
                    <option value="confirmed"${leadStatus === "confirmed" ? " selected" : ""}>Подтверждено</option>
                    <option value="declined"${leadStatus === "declined" ? " selected" : ""}>Отказ</option>
                  </select>
                </label>
                <label class="admin-label">
                  Менеджер
                  ${renderQuoteOpsManagerSelect(managerOptions, manager.id)}
                </label>
                <label class="admin-label admin-form-grid-span-2">
                  Следующий контакт с клиентом
                  <input
                    class="admin-input"
                    type="datetime-local"
                    name="discussionNextContactAt"
                    value="${escapeHtmlAttribute(formatAdminDateTimeInputValue(leadData.discussionNextContactAt || ""))}"
                  >
                </label>
                <div class="admin-inline-actions admin-form-grid-span-2">
                  <button class="admin-button" type="submit">Сохранить этап</button>
                </div>
              </form>`,
              { eyebrow: "Воронка", muted: true }
            )}
            ${renderAdminCard(
              "Таски по заявке",
              "Автоматические действия, связанные с текущим этапом.",
              openTaskRecords.length > 0
                ? `<div class="admin-table-wrap admin-quote-entry-task-summary">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>Таск</th>
                          <th>Дедлайн</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${openTaskRecords.map((task) => `<tr>
                          <td>
                            <div class="admin-table-cell-stack">
                              <span class="admin-table-strong">${escapeHtml(task.title)}</span>
                              <span class="admin-table-muted">${escapeHtml(task.requestId || entry.requestId || entry.id)}</span>
                            </div>
                          </td>
                          <td>
                            <div class="admin-table-cell-stack">
                              <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(task.dueAt))}</span>
                            </div>
                          </td>
                          <td>
                            <div class="admin-badge-row">
                              ${task.status === "open"
                                ? renderAdminBadge("Открыта", "outline")
                                : task.status === "completed"
                                  ? renderAdminBadge("Закрыта", "success")
                                  : renderAdminBadge("Отменена", "muted")}
                            </div>
                          </td>
                        </tr>`).join("")}
                      </tbody>
                    </table>
                  </div>`
                : `<div class="admin-empty-state">Для этой заявки сейчас нет активных тасков.</div>`,
              { eyebrow: "Таски", muted: true }
            )}
          </div>
        </section>
      </div>
    </dialog>`;
  }

  function renderQuoteOpsWorkspaceStyle() {
    return `<style>
      .admin-subnav-strip {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .admin-subnav-link {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255,255,255,0.78);
        color: var(--muted-foreground);
        font-weight: 600;
        text-decoration: none;
      }
      .admin-subnav-link-active {
        border-color: rgba(158, 67, 90, 0.22);
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
      }
      .admin-quote-funnel-board {
        display: grid;
        grid-template-columns: repeat(5, minmax(260px, 1fr));
        gap: 16px;
        overflow-x: auto;
        padding-bottom: 6px;
        align-items: stretch;
      }
      .admin-quote-funnel-column {
        min-width: 260px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(255,255,255,0.88);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: clamp(460px, 68vh, 840px);
        height: 100%;
        justify-content: flex-start;
      }
      .admin-quote-funnel-column[data-drop-active="true"] {
        border-color: rgba(158, 67, 90, 0.32);
        box-shadow: inset 0 0 0 2px rgba(158, 67, 90, 0.08);
      }
      .admin-quote-funnel-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        align-content: start;
        gap: 12px;
        min-height: 84px;
      }
      .admin-quote-funnel-head > div:first-child {
        min-width: 0;
      }
      .admin-quote-funnel-title {
        margin: 0;
        font-size: 18px;
      }
      .admin-quote-funnel-copy {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-quote-funnel-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
        justify-content: flex-start;
        flex: 1 1 auto;
        min-height: 180px;
      }
      .admin-quote-funnel-card {
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,250,251,0.96);
        display: grid;
        gap: 8px;
        cursor: grab;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
        outline: none;
        min-width: 0;
        overflow: hidden;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-quote-funnel-card[data-locked="true"] {
        cursor: default;
      }
      .admin-quote-funnel-card:hover,
      .admin-quote-funnel-card:focus-visible,
      .admin-quote-funnel-card:focus-within {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.98);
        box-shadow: 0 10px 26px rgba(158, 67, 90, 0.08);
      }
      .admin-quote-funnel-card.is-dragging {
        opacity: 0.45;
      }
      .admin-quote-funnel-card.is-saving {
        opacity: 0.82;
        pointer-events: none;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] {
        border-color: rgba(161, 161, 170, 0.26);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(244, 244, 245, 0.98));
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.03);
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"]:hover,
      .admin-quote-funnel-card[data-quote-entry-status="declined"]:focus-visible,
      .admin-quote-funnel-card[data-quote-entry-status="declined"]:focus-within {
        border-color: rgba(161, 161, 170, 0.34);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(241, 241, 243, 0.98));
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
      }
      .admin-quote-funnel-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .admin-quote-funnel-card-head {
        display: block;
        min-width: 0;
      }
      .admin-quote-funnel-card-title-block {
        display: grid;
        gap: 6px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .admin-quote-funnel-card-title {
        margin: 0;
        font-size: 16px;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }
      .admin-quote-funnel-card-stage {
        width: 100%;
        min-width: 0;
        margin-top: 12px;
      }
      .admin-quote-funnel-card-stage .admin-badge {
        display: flex;
        width: 100%;
        min-width: 0;
        justify-content: center;
        text-align: center;
      }
      .admin-quote-funnel-card-name {
        display: block;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-name {
        color: rgba(39, 39, 42, 0.88);
      }
      .admin-quote-funnel-card-copy,
      .admin-quote-task-card-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-copy {
        color: rgba(113, 113, 122, 0.92);
      }
      .admin-quote-funnel-card-details {
        display: grid;
        gap: 10px;
        padding-top: 12px;
        border-top: 1px solid rgba(228, 228, 231, 0.88);
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-details {
        border-top-color: rgba(212, 212, 216, 0.9);
      }
      .admin-quote-funnel-card-detail {
        display: grid;
        grid-template-columns: minmax(0, 58px) minmax(0, 1fr);
        align-items: start;
        gap: 8px;
        padding: 2px 0;
        border-top: 0;
      }
      .admin-quote-funnel-card-detail[hidden] {
        display: none !important;
      }
      .admin-quote-funnel-card-detail-label {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-detail-label {
        color: rgba(113, 113, 122, 0.9);
      }
      .admin-quote-funnel-card-detail-label-danger {
        color: var(--danger);
      }
      .admin-quote-funnel-card-detail-value {
        margin: 0;
        color: var(--foreground);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-detail-value {
        color: rgba(63, 63, 70, 0.92);
      }
      .admin-quote-funnel-card-detail-value-multiline {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        line-height: 1.22;
        overflow-wrap: anywhere;
      }
      .admin-quote-funnel-card[data-quote-entry-status="declined"] .admin-quote-funnel-card-stage .admin-badge {
        background: rgba(228, 228, 231, 0.9) !important;
        border-color: rgba(212, 212, 216, 0.95) !important;
        color: rgba(82, 82, 91, 0.96) !important;
      }
      .admin-quote-funnel-meta,
      .admin-quote-task-meta {
        display: grid;
        gap: 8px;
      }
      .admin-quote-funnel-meta-item,
      .admin-quote-task-meta-item {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
        color: var(--muted-foreground);
      }
      .admin-quote-funnel-meta-item strong,
      .admin-quote-task-meta-item strong {
        color: var(--foreground);
      }
      .admin-quote-funnel-empty,
      .admin-quote-task-empty {
        border: 1px dashed var(--border);
        border-radius: 18px;
        padding: 18px;
        color: var(--muted);
        text-align: center;
        background: rgba(250,250,251,0.76);
      }
      .admin-quote-task-table-wrap {
        overflow-x: auto;
        width: 100%;
      }
      .admin-quote-task-table {
        width: 100%;
        min-width: 100%;
        table-layout: fixed;
      }
      .admin-quote-task-table th,
      .admin-quote-task-table td {
        padding: 10px 12px;
      }
      .admin-quote-task-table .admin-table-cell-stack {
        gap: 2px;
      }
      .admin-quote-task-table .admin-table-strong {
        line-height: 1.15;
      }
      .admin-quote-task-table .admin-table-muted {
        font-size: 11px;
        line-height: 1.25;
      }
      .admin-quote-task-pill-row {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        min-width: 0;
      }
      .admin-quote-task-pill-row .admin-badge {
        min-height: 26px;
        padding: 0 10px;
        font-size: 11px;
      }
      .admin-quote-task-row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .admin-quote-task-row-actions form {
        margin: 0;
      }
      .admin-quote-task-row-actions .admin-button,
      .admin-quote-task-row-actions .admin-link-button {
        min-height: 38px;
        padding: 0 14px;
        box-shadow: none;
      }
      .admin-quote-task-row-id {
        font-size: 12px;
        color: var(--muted);
      }
      .admin-quote-task-row-overdue td {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-quote-task-row-overdue td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      .admin-quote-task-row-overdue:hover td,
      .admin-quote-task-row-overdue:focus-visible td,
      .admin-quote-task-row-overdue:focus-within td {
        background: rgba(158, 67, 90, 0.12);
      }
      .admin-quote-task-deadline-note-overdue {
        color: var(--accent);
        font-weight: 700;
      }
      .admin-quote-task-dialog-panel {
        display: grid;
        gap: 18px;
      }
      .admin-quote-task-dialog-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: start;
        padding: 18px 20px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 28px;
        background:
          radial-gradient(circle at top left, rgba(158, 67, 90, 0.08), transparent 38%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,246,247,0.96));
        box-shadow: 0 18px 34px rgba(15, 23, 42, 0.06);
      }
      .admin-quote-task-dialog-head-main {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        min-width: 0;
      }
      .admin-quote-task-dialog-head-copy {
        display: grid;
        gap: 6px;
        min-width: 0;
        padding-top: 2px;
      }
      .admin-quote-task-dialog-summary {
        display: grid;
        gap: 16px;
        padding: 18px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 24px;
        background: rgba(255,255,255,0.9);
      }
      .admin-quote-task-dialog-title-block {
        display: grid;
        gap: 6px;
      }
      .admin-quote-task-dialog-title-block .admin-dialog-title {
        font-size: 26px;
        line-height: 1.02;
      }
      .admin-quote-task-dialog-lead-copy {
        margin: 0;
        color: var(--foreground);
        font-size: 16px;
        line-height: 1.35;
        font-weight: 700;
      }
      .admin-quote-task-dialog-service {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.35;
      }
      .admin-quote-task-dialog-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .admin-quote-task-dialog-manager {
        margin: 0;
        color: var(--foreground);
        font-size: 13px;
        font-weight: 700;
      }
      .admin-quote-task-dialog-primary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .admin-quote-task-dialog-primary-card,
      .admin-quote-task-dialog-secondary-card {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-quote-task-dialog-label {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-quote-task-dialog-label-danger {
        color: var(--danger);
      }
      .admin-quote-task-dialog-primary-value {
        margin: 0;
        color: var(--foreground);
        font-size: 24px;
        line-height: 1.05;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .admin-quote-task-dialog-secondary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .admin-quote-task-dialog-secondary-value {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.35;
        font-weight: 600;
      }
      .admin-quote-task-dialog-actions {
        display: grid;
        gap: 14px;
      }
      .admin-quote-task-dialog-actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .admin-quote-task-contacted-panel[hidden] {
        display: none;
      }
      .admin-quote-task-contacted-panel {
        display: grid;
        gap: 12px;
        padding-top: 8px;
        border-top: 1px solid rgba(228, 228, 231, 0.9);
      }
      .admin-quote-task-dialog-field {
        display: none;
      }
      .admin-quote-task-dialog-field[data-visible="true"] {
        display: grid;
      }
      @media (max-width: 900px) {
        .admin-quote-task-dialog-head {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-quote-task-dialog-head-main {
          gap: 12px;
        }
        .admin-quote-task-dialog-title-block .admin-dialog-title {
          font-size: 22px;
        }
        .admin-quote-task-dialog-primary-grid,
        .admin-quote-task-dialog-secondary-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-quote-task-dialog-primary-value {
          font-size: 20px;
        }
      }
      .admin-quote-entry-detail-stack {
        align-items: start;
      }
      .admin-quote-entry-detail-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr);
        gap: 14px;
        align-items: start;
      }
      .admin-quote-entry-notes-form {
        max-width: none;
      }
      .admin-quote-entry-notes-form .admin-inline-actions {
        justify-content: flex-start;
      }
      .admin-quote-entry-stage-form {
        max-width: none;
      }
      .admin-quote-entry-stage-form .admin-inline-actions {
        justify-content: flex-start;
      }
      .admin-quote-entry-task-summary,
      .admin-quote-entry-quick-actions-list {
        display: grid;
        gap: 12px;
      }
      .admin-quote-entry-task-summary .admin-table {
        min-width: 0;
      }
      @media (max-width: 1080px) {
        .admin-quote-entry-detail-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>`;
  }

  function renderQuoteOpsFunnelCard(entry, returnTo) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const leadStatus = getLeadStatus(entry);
    const openTask = getEntryOpenLeadTask(entry);
    const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Не указана";
    const isLocked = leadStatus === "confirmed";
    const hideDeadlineRow = leadStatus === "confirmed" || leadStatus === "declined";
    const dueAtMs = Date.parse((openTask || {}).dueAt || "");
    const isOverdue = Boolean(openTask && Number.isFinite(dueAtMs) && dueAtMs < Date.now());
    const taskLabel = openTask ? openTask.title : leadStatus === "confirmed" ? "Заказ создан" : "Нет открытой задачи";
    const dueLabel = openTask ? formatAdminDateTime(openTask.dueAt) : "—";

    return `<article
      class="admin-quote-funnel-card"
      tabindex="0"
      draggable="${isLocked ? "false" : "true"}"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      data-quote-funnel-card="true"
      data-quote-entry-id="${escapeHtmlAttribute(entry.id)}"
      data-quote-entry-status="${escapeHtmlAttribute(leadStatus)}"
      data-locked="${isLocked ? "true" : "false"}"
      aria-label="${escapeHtmlAttribute(`Открыть заявку ${entry.customerName || "Клиент"}`)}"
    >
      <div class="admin-quote-funnel-card-head">
        <div class="admin-quote-funnel-card-title-block">
          <h3 class="admin-quote-funnel-title">
            <span class="admin-quote-funnel-card-name">${escapeHtml(entry.customerName || "Клиент")}</span>
          </h3>
          <p class="admin-quote-funnel-card-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
        </div>
      </div>
      <div class="admin-quote-funnel-card-details">
        <div class="admin-quote-funnel-card-detail">
          <p class="admin-quote-funnel-card-detail-label">Задача</p>
          <p class="admin-quote-funnel-card-detail-value admin-quote-funnel-card-detail-value-multiline" data-quote-card-task-value="true">${escapeHtml(taskLabel)}</p>
        </div>
        <div class="admin-quote-funnel-card-detail" data-quote-card-deadline-row="true"${hideDeadlineRow ? " hidden" : ""}>
          <p class="admin-quote-funnel-card-detail-label${isOverdue ? " admin-quote-funnel-card-detail-label-danger" : ""}" data-quote-card-due-label="true">Дедлайн</p>
          <p class="admin-quote-funnel-card-detail-value" data-quote-card-due-value="true">${escapeHtml(dueLabel)}</p>
        </div>
        <div class="admin-quote-funnel-card-detail">
          <p class="admin-quote-funnel-card-detail-label">Уборка</p>
          <p class="admin-quote-funnel-card-detail-value">${escapeHtml(scheduleLabel)}</p>
        </div>
      </div>
      <div class="admin-quote-funnel-card-stage" data-quote-card-stage="true">${renderLeadStatusBadge(leadStatus)}</div>
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
    </article>`;
  }

  function renderQuoteOpsFunnelLane(status, entries, returnTo) {
    const titles = {
      new: {
        title: "New",
        copy: "Новые заявки, которые нужно взять в работу сразу.",
      },
      "no-response": {
        title: "Без ответа",
        copy: "Клиенты, которым уже звонили, но они не ответили.",
      },
      discussion: {
        title: "Обсуждение",
        copy: "Есть контакт с клиентом и назначен следующий шаг.",
      },
      confirmed: {
        title: "Подтверждено",
        copy: "Заявки подтверждены и уже переведены в заказ.",
      },
      declined: {
        title: "Отказ",
        copy: "Закрытые заявки, по которым работа не продолжается.",
      },
    };
    const meta = titles[status] || titles.new;
    return `<section class="admin-quote-funnel-column" data-lead-dropzone="${escapeHtmlAttribute(status)}">
      <div class="admin-quote-funnel-head">
        <div>
          <h2 class="admin-quote-funnel-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-quote-funnel-copy">${escapeHtml(meta.copy)}</p>
        </div>
        <div data-quote-funnel-count="true">${renderAdminBadge(String(entries.length), "outline")}</div>
      </div>
      <div class="admin-quote-funnel-list" data-quote-funnel-list="true">
        ${entries.length > 0
          ? entries.map((entry) => renderQuoteOpsFunnelCard(entry, returnTo)).join("")
          : `<div class="admin-quote-funnel-empty">В этой колонке пока нет заявок.</div>`}
      </div>
    </section>`;
  }

  function renderQuoteOpsTaskResultDialog(taskRecord, returnTo, dialogIdOverride = "") {
    const dialogId = dialogIdOverride || `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const scheduleLabel = buildFormattedScheduleLabel(taskRecord.entry.selectedDate, taskRecord.entry.selectedTime) || "Дата не назначена";
    const requestLabel = taskRecord.requestId || taskRecord.entry.id;
    const managerLabel = taskRecord.manager.name || taskRecord.manager.email || "Без менеджера";
    const deadlineMs = Date.parse(taskRecord.dueAt || "");
    const overdue = taskRecord.status === "open" && Number.isFinite(deadlineMs) && deadlineMs < Date.now();
    const phoneLabel = taskRecord.entry.customerPhone
      ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone
      : "Телефон не указан";
    const openRequestHref = buildAdminRedirectPath(returnTo || ADMIN_QUOTE_OPS_PATH, {
      entry: taskRecord.entry.id,
    });
    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <div class="admin-dialog-panel admin-quote-task-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <span class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(taskRecord.customerName || requestLabel || taskRecord.id))}">${escapeHtml(getAdminClientAvatarInitials(taskRecord.customerName || "Клиент"))}</span>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Таск</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${dialogId}-title">${escapeHtml(taskRecord.customerName)}</h2>
                <p class="admin-dialog-hero-subtitle">${escapeHtml(taskRecord.title)}</p>
                <div class="admin-dialog-hero-meta-stack">
                  <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(`${phoneLabel} • ${managerLabel}`)}</p>
                  <p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(`${taskRecord.serviceLabel} • ${scheduleLabel}`)}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            <a
              class="admin-link-button admin-button-secondary"
              href="${escapeHtmlAttribute(openRequestHref)}"
              target="_blank"
              rel="noreferrer noopener"
            >Открыть заявку</a>
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <section class="admin-quote-task-dialog-summary">
          <div class="admin-quote-task-dialog-meta">
            ${renderLeadStatusBadge(taskRecord.leadStatus)}
            ${overdue ? renderAdminBadge("Нужно сегодня", "danger") : ""}
            <p class="admin-quote-task-dialog-manager">${escapeHtml(managerLabel)}</p>
          </div>
          <div class="admin-quote-task-dialog-primary-grid">
            <article class="admin-quote-task-dialog-primary-card">
              <p class="admin-quote-task-dialog-label">Телефон</p>
              <p class="admin-quote-task-dialog-primary-value">${escapeHtml(phoneLabel)}</p>
            </article>
            <article class="admin-quote-task-dialog-primary-card">
              <p class="admin-quote-task-dialog-label${overdue ? " admin-quote-task-dialog-label-danger" : ""}">Дедлайн</p>
              <p class="admin-quote-task-dialog-primary-value">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</p>
            </article>
          </div>
          <div class="admin-quote-task-dialog-secondary-grid">
            <article class="admin-quote-task-dialog-secondary-card">
              <p class="admin-quote-task-dialog-label">Заявка</p>
              <p class="admin-quote-task-dialog-secondary-value">${escapeHtml(requestLabel)}</p>
            </article>
            <article class="admin-quote-task-dialog-secondary-card">
              <p class="admin-quote-task-dialog-label">Уборка</p>
              <p class="admin-quote-task-dialog-secondary-value">${escapeHtml(scheduleLabel)}</p>
            </article>
          </div>
        </section>
        <div class="admin-settings-section-stack admin-quote-task-dialog-actions">
          ${renderAdminCard(
            "Следующее действие",
            "Выберите исход звонка. Если дозвонились, ниже откроется выбор следующего этапа.",
            `<div class="admin-quote-task-dialog-actions-row">
              <form class="admin-inline-actions" method="post" action="${ADMIN_QUOTE_OPS_PATH}">
                <input type="hidden" name="action" value="complete-lead-task">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(taskRecord.entry.id)}">
                <input type="hidden" name="taskId" value="${escapeHtmlAttribute(taskRecord.id)}">
                <input type="hidden" name="taskAction" value="no-answer">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <button class="admin-button admin-button-secondary" type="submit">Не дозвонились</button>
              </form>
              <button
                class="admin-button"
                type="button"
                data-quote-task-contacted-toggle="${escapeHtmlAttribute(dialogId)}"
                aria-expanded="false"
              >Дозвонились</button>
            </div>
            <form
              class="admin-form admin-form-grid admin-form-grid-two admin-quote-task-contacted-panel"
              method="post"
              action="${ADMIN_QUOTE_OPS_PATH}"
              data-quote-task-contacted-panel="${escapeHtmlAttribute(dialogId)}"
              hidden
            >
              <input type="hidden" name="action" value="complete-lead-task">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(taskRecord.entry.id)}">
              <input type="hidden" name="taskId" value="${escapeHtmlAttribute(taskRecord.id)}">
              <input type="hidden" name="taskAction" value="contacted">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              <label class="admin-label">
                Куда переносим заявку
                <select class="admin-input" name="nextStatus" data-lead-next-status="true">
                  <option value="discussion">Обсуждение</option>
                  <option value="confirmed">Подтверждено</option>
                  <option value="declined">Отказ</option>
                </select>
              </label>
              <label class="admin-label admin-quote-task-dialog-field" data-lead-next-contact-field="true" data-visible="true">
                Следующий контакт с клиентом
                <input class="admin-input" type="datetime-local" name="discussionNextContactAt">
              </label>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Сохранить переход</button>
              </div>
            </form>`,
            { eyebrow: "Звонок", muted: true }
          )}
        </div>
      </div>
    </dialog>`;
  }

  function renderQuoteOpsTaskTableRow(taskRecord, returnTo) {
    const dialogId = `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const dueAtMs = Date.parse(taskRecord.dueAt || "");
    const isOverdue = taskRecord.status === "open" && Number.isFinite(dueAtMs) && dueAtMs < Date.now();
    const scheduleLabel =
      taskRecord.entry.selectedDate || taskRecord.entry.selectedTime
        ? buildFormattedScheduleLabel(taskRecord.entry.selectedDate, taskRecord.entry.selectedTime) || "Дата не назначена"
        : "Дата не назначена";
    const dueNote = isOverdue ? "Просрочено" : scheduleLabel;
    return `<tr
      class="admin-table-row-clickable${isOverdue ? " admin-quote-task-row-overdue" : ""}"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть таск ${taskRecord.title} для ${taskRecord.customerName}`)}"
    >
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(taskRecord.title)}</span>
          <span class="admin-table-muted">${escapeHtml(taskRecord.customerName)} • ${escapeHtml(taskRecord.serviceLabel)}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</span>
          <span class="admin-table-muted${isOverdue ? " admin-quote-task-deadline-note-overdue" : ""}">
            ${escapeHtml(dueNote)}
          </span>
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${renderLeadStatusBadge(taskRecord.leadStatus)}
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${taskRecord.manager.name || taskRecord.manager.email
            ? renderAdminBadge(taskRecord.manager.name || taskRecord.manager.email, "outline")
            : renderAdminBadge("Без менеджера", "muted")}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(taskRecord.requestId || taskRecord.entry.id)}</span>
          <span class="admin-table-muted">${escapeHtml(taskRecord.entry.customerPhone ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone : "Телефон не указан")}</span>
        </div>
      </td>
    </tr>`;
  }

  function renderQuoteOpsDiscussionStageDialog(returnTo) {
    return `<dialog class="admin-dialog" id="admin-quote-funnel-discussion-dialog" aria-labelledby="admin-quote-funnel-discussion-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div>
            <p class="admin-card-eyebrow">Воронка</p>
            <h2 class="admin-dialog-title" id="admin-quote-funnel-discussion-title">Перевести в обсуждение</h2>
            <p class="admin-dialog-copy">Укажите, когда менеджер должен снова связаться с клиентом.</p>
          </div>
          ${renderAdminDialogCloseButton("admin-quote-funnel-discussion-dialog")}
        </div>
        <form class="admin-form admin-form-grid" method="post" action="${ADMIN_QUOTE_OPS_PATH}" data-quote-funnel-discussion-form="true">
          <input type="hidden" name="action" value="update-lead-status">
          <input type="hidden" name="entryId" value="">
          <input type="hidden" name="leadStatus" value="discussion">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <label class="admin-label admin-form-grid-span-2">
            Следующий контакт с клиентом
            <input class="admin-input" type="datetime-local" name="discussionNextContactAt" required>
          </label>
          <div class="admin-inline-actions admin-form-grid-span-2">
            <button class="admin-button" type="submit">Сохранить этап</button>
          </div>
        </form>
      </div>
    </dialog>`;
  }

  function renderQuoteOpsFunnelScript(activeSection) {
    return `<script>
      (() => {
        const activeSection = ${JSON.stringify(activeSection)};
        document.querySelectorAll('[data-lead-next-status="true"]').forEach((select) => {
          const form = select.closest("form");
          if (!form) return;
          const contactField = form.querySelector('[data-lead-next-contact-field="true"]');
          const syncFieldVisibility = () => {
            if (!contactField) return;
            const visible = String(select.value || "") === "discussion";
            contactField.setAttribute("data-visible", visible ? "true" : "false");
            const input = contactField.querySelector("input");
            if (input) {
              input.required = visible;
            }
          };
          syncFieldVisibility();
          select.addEventListener("change", syncFieldVisibility);
        });

        document.querySelectorAll("[data-quote-task-contacted-toggle]").forEach((button) => {
          const targetId = button.getAttribute("data-quote-task-contacted-toggle");
          if (!targetId) return;
          const panel = document.querySelector('[data-quote-task-contacted-panel="' + targetId + '"]');
          const dialog = document.getElementById(targetId);
          if (!panel) return;
          button.addEventListener("click", () => {
            const nextHidden = !panel.hidden;
            panel.hidden = nextHidden;
            button.setAttribute("aria-expanded", nextHidden ? "false" : "true");
            if (!nextHidden) {
              const firstField = panel.querySelector("select, input");
              if (firstField && typeof firstField.focus === "function") {
                firstField.focus();
              }
            }
          });
          if (dialog) {
            dialog.addEventListener("close", () => {
              panel.hidden = true;
              button.setAttribute("aria-expanded", "false");
            });
          }
        });

        const stageForm = document.querySelector('[data-quote-funnel-stage-form="true"]');
        const stageEntryInput = stageForm ? stageForm.querySelector('input[name="entryId"]') : null;
        const stageStatusInput = stageForm ? stageForm.querySelector('input[name="leadStatus"]') : null;
        const stageReturnInput = stageForm ? stageForm.querySelector('input[name="returnTo"]') : null;
        const discussionDialog = document.getElementById("admin-quote-funnel-discussion-dialog");
        const discussionForm = discussionDialog ? discussionDialog.querySelector('[data-quote-funnel-discussion-form="true"]') : null;
        const discussionEntryInput = discussionDialog ? discussionDialog.querySelector('input[name="entryId"]') : null;
        const discussionReturnInput = discussionDialog ? discussionDialog.querySelector('input[name="returnTo"]') : null;
        const discussionContactInput = discussionDialog ? discussionDialog.querySelector('input[name="discussionNextContactAt"]') : null;

        let draggedCard = null;
        let pendingDiscussionCard = null;
        let pendingDiscussionLane = null;

        function createBadge(label, tone) {
          const badge = document.createElement("span");
          let className = "admin-badge";
          if (tone === "success") className += " admin-badge-success";
          else if (tone === "muted") className += " admin-badge-muted";
          else if (tone === "danger") className += " admin-badge-danger";
          else if (tone === "outline") className += " admin-badge-outline";
          badge.className = className;
          badge.textContent = label;
          return badge;
        }

        function getLeadBadgeMeta(status) {
          const normalized = String(status || "new");
          if (normalized === "confirmed") return { label: "Подтверждено", tone: "success" };
          if (normalized === "discussion") return { label: "Обсуждение", tone: "outline" };
          if (normalized === "no-response") return { label: "Без ответа", tone: "default" };
          if (normalized === "declined") return { label: "Отказ", tone: "danger" };
          return { label: "New", tone: "muted" };
        }

        function refreshLaneUi(lane) {
          if (!lane) return;
          const list = lane.querySelector('[data-quote-funnel-list="true"]');
          const countTarget = lane.querySelector('[data-quote-funnel-count="true"]');
          if (countTarget && list) {
            const count = list.querySelectorAll('[data-quote-funnel-card="true"]').length;
            countTarget.replaceChildren(createBadge(String(count), "outline"));
          }
          if (!list) return;
          const hasCards = list.querySelector('[data-quote-funnel-card="true"]');
          const emptyState = list.querySelector(".admin-quote-funnel-empty");
          if (hasCards && emptyState) {
            emptyState.remove();
          } else if (!hasCards && !emptyState) {
            const placeholder = document.createElement("div");
            placeholder.className = "admin-quote-funnel-empty";
            placeholder.textContent = "В этой колонке пока нет заявок.";
            list.appendChild(placeholder);
          }
        }

        function moveCardToLane(card, lane) {
          const list = lane ? lane.querySelector('[data-quote-funnel-list="true"]') : null;
          if (!card || !list) return;
          const emptyState = list.querySelector(".admin-quote-funnel-empty");
          if (emptyState) emptyState.remove();
          list.prepend(card);
        }

        function applyLeadPayloadToCard(card, payload) {
          if (!card || !payload || !payload.entry) return;
          const entry = payload.entry;
          const badgeMeta = getLeadBadgeMeta(entry.leadStatus);
          const deadlineRowTarget = card.querySelector('[data-quote-card-deadline-row="true"]');
          const stageTarget = card.querySelector('[data-quote-card-stage="true"]');
          const managerTarget = card.querySelector('[data-quote-card-manager-name="true"]');
          const taskTarget = card.querySelector('[data-quote-card-task-value="true"]');
          const dueLabelTarget = card.querySelector('[data-quote-card-due-label="true"]');
          const dueValueTarget = card.querySelector('[data-quote-card-due-value="true"]');

          card.setAttribute("data-quote-entry-status", String(entry.leadStatus || "new"));
          card.setAttribute("data-locked", entry.locked ? "true" : "false");
          card.setAttribute("draggable", entry.locked ? "false" : "true");

          if (stageTarget) {
            stageTarget.replaceChildren(createBadge(badgeMeta.label, badgeMeta.tone));
          }
          if (managerTarget) {
            managerTarget.textContent = entry.managerLabel || "Без менеджера";
          }
          if (taskTarget) {
            taskTarget.textContent = entry.taskLabel || "Нет открытой задачи";
          }
          if (dueValueTarget) {
            dueValueTarget.textContent = entry.dueLabel || "—";
          }
          if (deadlineRowTarget) {
            deadlineRowTarget.hidden = Boolean(entry.hideDeadline);
          }
          if (dueLabelTarget) {
            dueLabelTarget.textContent = "Дедлайн";
            dueLabelTarget.classList.toggle(
              "admin-quote-funnel-card-detail-label-danger",
              Boolean(entry.dueOverdue)
            );
          }
        }

        function buildAjaxErrorMessage(payload, fallbackMessage = "Не удалось сохранить новый этап заявки.") {
          const errorCode = payload && typeof payload.error === "string" ? payload.error : "";
          if (errorCode === "discussion-contact-required") {
            return "Укажите следующий контакт с клиентом.";
          }
          if (errorCode === "lead-missing") {
            return "Заявка больше не найдена.";
          }
          return fallbackMessage;
        }

        async function submitStageChange(formData) {
          const response = await fetch(${JSON.stringify(ADMIN_QUOTE_OPS_PATH)}, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "application/json",
              "X-SHYNLI-ADMIN-AJAX": "1",
            },
            body: new URLSearchParams(formData).toString(),
            credentials: "same-origin",
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(buildAjaxErrorMessage(payload));
          }
          return payload;
        }

        async function submitNotesUpdate(formData) {
          const response = await fetch(${JSON.stringify(ADMIN_QUOTE_OPS_PATH)}, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "application/json",
              "X-SHYNLI-ADMIN-AJAX": "1",
            },
            body: new URLSearchParams(formData).toString(),
            credentials: "same-origin",
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(buildAjaxErrorMessage(payload, "Не удалось сохранить заметки."));
          }
          return payload;
        }

        document.querySelectorAll('[data-quote-entry-notes-form="true"]').forEach((form) => {
          if (!(form instanceof HTMLFormElement)) return;
          const textarea = form.querySelector('textarea[name="notes"]');
          const submitButton = form.querySelector('button[type="submit"]');
          const feedback = form.querySelector('[data-quote-entry-notes-feedback="true"]');
          let feedbackTimer = 0;

          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!(textarea instanceof HTMLTextAreaElement)) return;
            if (!(submitButton instanceof HTMLButtonElement)) return;

            submitButton.disabled = true;
            submitButton.textContent = "Сохраняем...";
            if (feedback instanceof HTMLElement) {
              feedback.hidden = true;
              feedback.textContent = "";
            }

            try {
              const payload = await submitNotesUpdate(new FormData(form));
              textarea.value = payload && payload.entry && typeof payload.entry.notes === "string" ? payload.entry.notes : textarea.value;
              if (feedback instanceof HTMLElement) {
                feedback.textContent = "Заметки сохранены.";
                feedback.hidden = false;
              }
            } catch (error) {
              if (feedback instanceof HTMLElement) {
                feedback.textContent = error && error.message ? error.message : "Не удалось сохранить заметки.";
                feedback.hidden = false;
              } else {
                window.alert(error && error.message ? error.message : "Не удалось сохранить заметки.");
              }
            } finally {
              submitButton.disabled = false;
              submitButton.textContent = "Сохранить";
              if (feedback instanceof HTMLElement) {
                window.clearTimeout(feedbackTimer);
                feedbackTimer = window.setTimeout(() => {
                  feedback.hidden = true;
                }, 2200);
              }
            }
          });
        });

        if (activeSection !== "funnel") return;

        document.querySelectorAll('[data-quote-funnel-card="true"]').forEach((card) => {
          if (card.getAttribute("draggable") !== "true") return;
          card.addEventListener("dragstart", () => {
            draggedCard = card;
            card.classList.add("is-dragging");
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("is-dragging");
          });
        });

        document.querySelectorAll("[data-lead-dropzone]").forEach((lane) => {
          lane.addEventListener("dragover", (event) => {
            if (!draggedCard) return;
            event.preventDefault();
            lane.setAttribute("data-drop-active", "true");
          });
          lane.addEventListener("dragleave", () => {
            lane.removeAttribute("data-drop-active");
          });
          lane.addEventListener("drop", async (event) => {
            if (!draggedCard || !stageForm || !stageEntryInput || !stageStatusInput || !stageReturnInput) return;
            event.preventDefault();
            lane.removeAttribute("data-drop-active");
            const nextStatus = lane.getAttribute("data-lead-dropzone");
            const entryId = draggedCard.getAttribute("data-quote-entry-id") || "";
            const returnTo = draggedCard.querySelector('input[name="returnTo"]')?.value || "/admin/quote-ops?section=funnel";
            const previousStatus = draggedCard.getAttribute("data-quote-entry-status") || "";
            if (!nextStatus || !entryId || nextStatus === previousStatus) {
              draggedCard = null;
              return;
            }
            if (nextStatus === "discussion" && discussionDialog && discussionEntryInput && discussionReturnInput) {
              discussionEntryInput.value = entryId;
              discussionReturnInput.value = returnTo;
              if (discussionContactInput) discussionContactInput.value = "";
              pendingDiscussionCard = draggedCard;
              pendingDiscussionLane = lane;
              if (typeof discussionDialog.showModal === "function") {
                discussionDialog.showModal();
              }
              draggedCard = null;
              return;
            }
            const card = draggedCard;
            const sourceLane = card.closest("[data-lead-dropzone]");
            const sourceList = card.parentElement;
            const sourceNextSibling = card.nextElementSibling;
            stageEntryInput.value = entryId;
            stageStatusInput.value = nextStatus;
            stageReturnInput.value = returnTo;
            card.classList.add("is-saving");
            moveCardToLane(card, lane);
            refreshLaneUi(sourceLane);
            refreshLaneUi(lane);
            try {
              const payload = await submitStageChange(new FormData(stageForm));
              applyLeadPayloadToCard(card, payload);
            } catch (error) {
              if (sourceList) {
                if (sourceNextSibling && sourceNextSibling.parentElement === sourceList) {
                  sourceList.insertBefore(card, sourceNextSibling);
                } else {
                  sourceList.appendChild(card);
                }
              }
              refreshLaneUi(sourceLane);
              refreshLaneUi(lane);
              window.alert(error && error.message ? error.message : "Не удалось сохранить новый этап заявки.");
            } finally {
              card.classList.remove("is-saving");
              card.classList.remove("is-dragging");
              draggedCard = null;
            }
          });
        });

        if (discussionDialog) {
          discussionDialog.addEventListener("close", () => {
            pendingDiscussionCard = null;
            pendingDiscussionLane = null;
          });
        }

        if (discussionForm) {
          discussionForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!pendingDiscussionCard || !pendingDiscussionLane) {
              discussionForm.submit();
              return;
            }

            const card = pendingDiscussionCard;
            const lane = pendingDiscussionLane;
            const sourceLane = card.closest("[data-lead-dropzone]");
            const sourceList = card.parentElement;
            const sourceNextSibling = card.nextElementSibling;

            card.classList.add("is-saving");
            moveCardToLane(card, lane);
            refreshLaneUi(sourceLane);
            refreshLaneUi(lane);

            try {
              const payload = await submitStageChange(new FormData(discussionForm));
              applyLeadPayloadToCard(card, payload);
              if (typeof discussionDialog.close === "function") {
                discussionDialog.close();
              }
            } catch (error) {
              if (sourceList) {
                if (sourceNextSibling && sourceNextSibling.parentElement === sourceList) {
                  sourceList.insertBefore(card, sourceNextSibling);
                } else {
                  sourceList.appendChild(card);
                }
              }
              refreshLaneUi(sourceLane);
              refreshLaneUi(lane);
              window.alert(error && error.message ? error.message : "Не удалось сохранить новый этап заявки.");
            } finally {
              card.classList.remove("is-saving");
              pendingDiscussionCard = null;
              pendingDiscussionLane = null;
            }
          });
        }
      })();
    </script>`;
  }

  function renderQuoteOpsLane(status, entries, returnTo) {
    const meta = getQuoteOpsStatusMeta(status);
    return `<section class="admin-quote-lane admin-quote-lane-${escapeHtmlAttribute(status)}">
      <div class="admin-quote-lane-head">
        <div>
          ${meta.kicker ? `<p class="admin-quote-lane-kicker">${escapeHtml(meta.kicker)}</p>` : ""}
          <h2 class="admin-quote-lane-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-quote-lane-copy">${escapeHtml(meta.copy)}</p>
        </div>
        <div class="admin-quote-lane-meta">
          ${status === "success" ? "" : renderQuoteOpsStatusBadge(status)}
          ${renderAdminBadge(formatQuoteOpsEntryCountLabel(entries.length), "outline")}
        </div>
      </div>
      ${status === "success"
        ? renderQuoteOpsSuccessTable(entries, returnTo)
        : `<div class="admin-quote-lane-list">
            ${entries.map((entry) => renderQuoteOpsEntryCard(entry, returnTo)).join("")}
          </div>`}
    </section>`;
  }

  async function renderQuoteOpsPage(req, config, quoteOpsLedger, adminRuntime = {}, staffStore = null) {
    void config;
    const { reqUrl, filters } = getQuoteOpsFilters(req);
    const allEntriesRaw = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const allEntries = filterQuoteOpsEntries(allEntriesRaw, {
      status: "all",
      serviceType: "all",
      leadStatus: "all",
      managerId: "",
      q: "",
      limit: QUOTE_OPS_LEDGER_LIMIT,
    });
    const entries = filterQuoteOpsEntries(allEntries, filters);
    const managerOptions = await collectQuoteOpsManagerOptions(adminRuntime, staffStore);
    const activeSection = filters.section || "list";
    const totalEntries = allEntries.length;
    const successCount = allEntries.filter((entry) => entry.status === "success").length;
    const warningCount = allEntries.filter((entry) => entry.status === "warning").length;
    const errorCount = allEntries.filter((entry) => entry.status === "error").length;
    const attentionCount = warningCount + errorCount;
    const last24HoursThreshold = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = allEntries.filter((entry) => {
      const createdAtMs = Date.parse(entry.createdAt);
      return Number.isFinite(createdAtMs) && createdAtMs >= last24HoursThreshold;
    }).length;
    const filteredCount = entries.length;
    const hasSearchQuery = Boolean(filters.q);
    const hasActiveFilters = Boolean(
      filters.q ||
      filters.status !== "all" ||
      filters.serviceType !== "all" ||
      filters.leadStatus !== "all" ||
      filters.managerId
    );
    const advancedFilterCount = [
      filters.status !== "all",
      filters.serviceType !== "all",
      filters.leadStatus !== "all",
      Boolean(filters.managerId),
    ].filter(Boolean).length;
    const managerOptionById = new Map(managerOptions.map((manager) => [manager.id, manager]));
    const crmFilterLabels = {
      success: "Успешно",
      warning: "Проверить",
      error: "Ошибка",
    };
    const leadFilterLabels = {
      new: "New",
      "no-response": "Без ответа",
      discussion: "Обсуждение",
      confirmed: "Подтверждено",
      declined: "Отказ",
    };
    const serviceFilterLabels = {
      regular: "Регулярная",
      deep: "Генеральная",
      moving: "Перед переездом",
    };
    const advancedResetHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
      section: activeSection !== "list" ? activeSection : "",
      q: filters.q,
      status: "",
      serviceType: "",
      leadStatus: "",
      managerId: "",
    });
    const resetHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
      section: activeSection !== "list" ? activeSection : "",
      q: "",
      status: "",
      serviceType: "",
      leadStatus: "",
      managerId: "",
    });
    const groupedEntries = ["error", "warning", "success"]
      .map((status) => ({
        status,
        entries: entries.filter((entry) => entry.status === status),
      }))
      .filter((group) => group.entries.length > 0);
    const funnelStatuses = ["new", "no-response", "discussion", "confirmed", "declined"];
    const taskRecords = buildQuoteOpsTaskRecords(entries)
      .filter((task) => task.status === "open")
      .sort((left, right) => {
        const leftTime = Date.parse(left.dueAt || "");
        const rightTime = Date.parse(right.dueAt || "");
        if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
        if (!Number.isFinite(leftTime)) return 1;
        if (!Number.isFinite(rightTime)) return -1;
        return leftTime - rightTime;
      });
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const selectedEntryId = normalizeString(reqUrl.searchParams.get("entry"), 120);
    const closeEntryHref = buildAdminRedirectPath(currentReturnTo, {
      entry: "",
    });
    const sectionTitle =
      activeSection === "funnel"
        ? "Воронка заявок"
        : activeSection === "tasks"
          ? "Таски по заявкам"
          : "Лента заявок";
    const sectionSubtitle =
      activeSection === "funnel"
        ? "Перетаскивайте заявки между этапами, назначайте менеджеров и держите всю воронку перед глазами."
        : activeSection === "tasks"
          ? "Здесь собраны все открытые действия по заявкам с дедлайнами и быстрыми результатами звонка."
          : "Рабочая лента входящих заявок с быстрым поиском и полным просмотром каждой формы.";
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const filterBadges = [
      hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : "",
      filters.status !== "all" ? renderAdminBadge(`CRM: ${crmFilterLabels[filters.status] || filters.status}`, "outline") : "",
      filters.leadStatus !== "all" ? renderAdminBadge(`Этап: ${leadFilterLabels[filters.leadStatus] || filters.leadStatus}`, "outline") : "",
      filters.serviceType !== "all" ? renderAdminBadge(`Тип: ${serviceFilterLabels[filters.serviceType] || filters.serviceType}`, "outline") : "",
      filters.managerId
        ? renderAdminBadge(`Менеджер: ${(managerOptionById.get(filters.managerId) || {}).name || "Выбран"}`, "outline")
        : "",
    ]
      .filter(Boolean)
      .join("");
    const filtersPanel = `<section class="admin-orders-filters-panel admin-quote-ops-filter-shell" id="admin-quote-ops-filters">
      <div class="admin-orders-panel-head">
        <div>
          <p class="admin-orders-panel-kicker">Навигация</p>
          <h2 class="admin-orders-panel-title">Быстро найти нужную заявку</h2>
          <p class="admin-orders-panel-copy">Поиск по имени, телефону, email, request ID и адресу. Фильтры одинаково работают для ленты, воронки и тасков.</p>
        </div>
        <span class="admin-action-hint">Показано ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalEntries))} заявок.</span>
      </div>
      <div class="admin-orders-toolbar-shell">
        <details class="admin-filter-disclosure admin-orders-filter-toggle"${advancedFilterCount ? " open" : ""}>
          <summary class="admin-clients-toolbar-button">
            <span>Фильтры</span>
            ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
          </summary>
        </details>
        <form
          class="admin-clients-search-form"
          method="get"
          action="${ADMIN_QUOTE_OPS_PATH}"
          data-admin-auto-submit="true"
          data-admin-auto-submit-delay="600"
          data-admin-auto-submit-min-length="2"
          data-admin-auto-submit-restore-focus="true"
          data-admin-auto-submit-scroll-target="#admin-quote-ops-filters"
          data-admin-auto-submit-scroll-offset="18"
        >
          ${renderAdminHiddenInput("section", activeSection !== "list" ? activeSection : "")}
          ${renderAdminHiddenInput("status", filters.status !== "all" ? filters.status : "")}
          ${renderAdminHiddenInput("serviceType", filters.serviceType !== "all" ? filters.serviceType : "")}
          ${renderAdminHiddenInput("leadStatus", filters.leadStatus !== "all" ? filters.leadStatus : "")}
          ${renderAdminHiddenInput("managerId", filters.managerId)}
          <label class="admin-clients-search-box">
            <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
            <input
              class="admin-input admin-clients-search-input"
              type="search"
              name="q"
              value="${escapeHtmlText(filters.q)}"
              placeholder="Поиск по клиенту, телефону, адресу, заявке или менеджеру"
            >
          </label>
          <button class="admin-sr-only" type="submit">Обновить поиск</button>
          ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
        </form>
        <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
          <form class="admin-orders-filter-bar" method="get" action="${ADMIN_QUOTE_OPS_PATH}">
            ${renderAdminHiddenInput("section", activeSection !== "list" ? activeSection : "")}
            ${renderAdminHiddenInput("q", filters.q)}
            <label class="admin-label">
              CRM
              <select class="admin-input" name="status">
                <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                <option value="success"${filters.status === "success" ? " selected" : ""}>Успешно</option>
                <option value="warning"${filters.status === "warning" ? " selected" : ""}>Проверить</option>
                <option value="error"${filters.status === "error" ? " selected" : ""}>Ошибка</option>
              </select>
            </label>
            <label class="admin-label">
              Этап
              <select class="admin-input" name="leadStatus">
                <option value="all"${filters.leadStatus === "all" ? " selected" : ""}>Все</option>
                <option value="new"${filters.leadStatus === "new" ? " selected" : ""}>New</option>
                <option value="no-response"${filters.leadStatus === "no-response" ? " selected" : ""}>Без ответа</option>
                <option value="discussion"${filters.leadStatus === "discussion" ? " selected" : ""}>Обсуждение</option>
                <option value="confirmed"${filters.leadStatus === "confirmed" ? " selected" : ""}>Подтверждено</option>
                <option value="declined"${filters.leadStatus === "declined" ? " selected" : ""}>Отказ</option>
              </select>
            </label>
            <label class="admin-label">
              Менеджер
              <select class="admin-input" name="managerId">
                <option value="">Все</option>
                ${managerOptions.map((manager) => `
                  <option value="${escapeHtmlAttribute(manager.id)}"${manager.id === filters.managerId ? " selected" : ""}>${escapeHtml(manager.name)}</option>
                `).join("")}
              </select>
            </label>
            <label class="admin-label">
              Тип уборки
              <select class="admin-input" name="serviceType">
                <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                <option value="regular"${filters.serviceType === "regular" ? " selected" : ""}>Регулярная</option>
                <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Генеральная</option>
                <option value="moving"${filters.serviceType === "moving" ? " selected" : ""}>Перед переездом</option>
              </select>
            </label>
            <div class="admin-clients-filter-actions">
              <button class="admin-button" type="submit">Применить</button>
              <a class="admin-link-button admin-button-secondary" href="${advancedResetHref}">Сбросить фильтры</a>
            </div>
          </form>
        </div>
      </div>
      ${hasActiveFilters
        ? `<div class="admin-clients-meta-row">
            <div class="admin-clients-meta-main">
              <p class="admin-clients-summary-copy">
                Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalEntries))} заявок.
                С учётом поиска и фильтров.
              </p>
              ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
            </div>
          </div>`
        : ""}
    </section>`;

    const listBody = groupedEntries.length > 0
      ? `<div class="admin-quote-lanes">
          ${groupedEntries.map((group) => renderQuoteOpsLane(group.status, group.entries, currentReturnTo)).join("")}
        </div>`
      : `<div class="admin-empty-state">По текущему фильтру заявок нет. Попробуйте сбросить фильтры или изменить поисковый запрос.</div>`;
    const funnelBody = `<div class="admin-quote-funnel-board">
      ${funnelStatuses.map((status) => renderQuoteOpsFunnelLane(status, entries.filter((entry) => getLeadStatus(entry) === status), currentReturnTo)).join("")}
    </div>
    <form method="post" action="${ADMIN_QUOTE_OPS_PATH}" data-quote-funnel-stage-form="true" hidden>
      <input type="hidden" name="action" value="update-lead-status">
      <input type="hidden" name="entryId" value="">
      <input type="hidden" name="leadStatus" value="">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
    </form>
    ${renderQuoteOpsDiscussionStageDialog(currentReturnTo)}`;
    const tasksBody = taskRecords.length > 0
      ? `<div class="admin-table-wrap admin-quote-task-table-wrap">
          <table class="admin-table admin-quote-task-table">
            <colgroup>
              <col style="width:38%">
              <col style="width:18%">
              <col style="width:14%">
              <col style="width:14%">
              <col style="width:16%">
            </colgroup>
            <thead>
              <tr>
                <th>Таск</th>
                <th>Дедлайн</th>
                <th>Этап</th>
                <th>Менеджер</th>
                <th>Заявка</th>
              </tr>
            </thead>
            <tbody>
              ${taskRecords.map((taskRecord) => renderQuoteOpsTaskTableRow(taskRecord, currentReturnTo)).join("")}
            </tbody>
          </table>
        </div>
        ${taskRecords.map((taskRecord) => renderQuoteOpsTaskResultDialog(taskRecord, currentReturnTo, `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`)).join("")}`
      : `<div class="admin-quote-task-empty">Для текущего фильтра открытых тасков нет.</div>`;

    const workspaceBody =
      activeSection === "funnel"
        ? funnelBody
        : activeSection === "tasks"
          ? tasksBody
          : listBody;

    return renderAdminLayout(
      sectionTitle,
      `<div class="admin-quote-ops-page">
        ${renderQuoteOpsWorkspaceStyle()}
        ${renderQuoteOpsNotice(req)}
        ${activeSection === "list"
          ? renderQuoteOpsOverviewStrip({
              totalEntries,
              successCount,
              attentionCount,
              recentCount,
            })
          : ""}
        ${renderQuoteOpsSectionNav(activeSection)}
        ${filtersPanel}
        ${workspaceBody}
        ${entries.map((entry) =>
          renderQuoteOpsDetailDialog(entry, currentReturnTo, managerOptions, {
            autoOpen: selectedEntryId === entry.id,
            closeHref: selectedEntryId === entry.id ? closeEntryHref : "",
            req,
            canEdit: accessContext.canEdit,
            leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
          })
        ).join("")}
      </div>`,
      {
        kicker: false,
        subtitle: sectionSubtitle,
        sidebar: renderAdminAppSidebar(ADMIN_QUOTE_OPS_PATH, {
          ...accessContext,
          quoteOpsSection: activeSection,
        }),
        bodyScripts: renderQuoteOpsFunnelScript(activeSection),
      }
    );
  }

  function renderIntegrationsPage(req, config, adminRuntime = {}) {
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    return renderAdminLayout(
      "Раздел скрыт",
      `${renderAdminCard(
          "Раздел скрыт",
          "Этот технический раздел скрыт из интерфейса.",
          `<div class="admin-alert admin-alert-info">Вернитесь в основные рабочие разделы админки.</div>`,
          { eyebrow: "Инфо", muted: true }
        )}`,
      {
        kicker: "SHYNLI CLEANING",
        subtitle: "Технические разделы скрыты.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH, accessContext),
      }
    );
  }

  function renderRuntimePage(req, config, adminRuntime = {}) {
    return renderIntegrationsPage(req, config, adminRuntime);
  }

  async function renderAdminAppPage(route, req, config, adminRuntime = {}, quoteOpsLedger = null, staffStore = null) {
    if (route === ADMIN_ROOT_PATH) return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
    if (route === ADMIN_CLIENTS_PATH) return renderClientsPage(req, config, quoteOpsLedger, staffStore, adminRuntime);
    if (route === ADMIN_ORDERS_PATH) return renderOrdersPage(req, config, quoteOpsLedger, staffStore, adminRuntime);
    if (route === ADMIN_STAFF_PATH) return renderStaffPage(req, config, quoteOpsLedger, staffStore, adminRuntime);
    if (route === ADMIN_SETTINGS_PATH) {
      return renderSettingsPage(req, config, adminRuntime.settingsStore, adminRuntime.usersStore, staffStore, quoteOpsLedger, adminRuntime);
    }
    if (route === ADMIN_QUOTE_OPS_PATH) return renderQuoteOpsPage(req, config, quoteOpsLedger, adminRuntime, staffStore);
    if (route === ADMIN_INTEGRATIONS_PATH) return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
    if (route === ADMIN_RUNTIME_PATH) return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
    return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
  }

  return {
    buildSettingsRedirectPath,
    buildSettingsUsersRedirectPath,
    renderAdminAppPage,
    renderDashboardPage,
    renderIntegrationsPage,
    renderLoginPage: shared.renderLoginPage,
    renderOrdersPage,
    renderQuoteOpsPage,
    renderRuntimePage,
    renderSettingsPage,
    renderStaffPage,
    renderTwoFactorPage: shared.renderTwoFactorPage,
    renderAdminLayout,
    renderAdminUnavailablePage: shared.renderAdminUnavailablePage,
  };
}

module.exports = {
  createAdminPageRenderers,
};
