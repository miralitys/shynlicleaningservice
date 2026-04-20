"use strict";

function createOrdersUiHelpers(deps = {}) {
  const {
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDER_FREQUENCY_OPTIONS,
    ADMIN_ORDER_SERVICE_OPTIONS,
    ADMIN_ORDERS_PATH,
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    ORDER_QUOTE_QUANTITY_LABELS,
    ORDER_QUOTE_SERVICE_ALIASES,
    ORDER_QUOTE_SERVICE_LABELS,
    ORDER_QUOTE_SQUARE_FOOTAGE_LABELS,
    buildOrdersReturnPath,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminCalendarDate,
    formatAdminClockTime,
    formatAdminDateTime,
    formatAdminOrderDateInputValue,
    formatAdminOrderTimeInputValue,
    formatAdminPhoneNumber,
    formatCurrencyAmount,
    formatStaffCountLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getEntryOrderCompletionData,
    normalizeOrderStatus,
    normalizeString,
    renderAdminBadge,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminEditIcon,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminPropertyList,
    renderAdminSelectOptions,
    renderQuoteOpsStatusBadge,
    renderStaffAddressField,
  } = deps;

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
  function filterOrderAssignedStaffNames(value, hiddenStaffNames = new Set()) {
    const normalizedHiddenStaffNames =
      hiddenStaffNames instanceof Set ? hiddenStaffNames : new Set();
    return parseOrderAssignedStaffNames(value).filter(
      (name) => !normalizedHiddenStaffNames.has(name.toLowerCase())
    );
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
    const completion = getEntryOrderCompletionData(order && order.entry ? order.entry : null);

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
  function formatOrderQuotePetsLabel(value, emptyLabel = "Не указано") {
    if (value === true || value === false) return value ? "Да" : "Нет";
    const normalized = normalizeString(value, 64);
    if (!normalized) return emptyLabel;
    const compact = normalized.toLowerCase();
    if (["no", "none", "false", "0", "off"].includes(compact)) return "Нет";
    if (compact === "cat") return "Кошка";
    if (compact === "dog") return "Собака";
    if (["yes", "true", "1", "on"].includes(compact)) return "Да";
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
  return {
    renderOrderStatusBadge,
    renderOrderPaymentStatusBadge,
    renderOrderPaymentMethodBadge,
    renderOrdersMetric,
    renderOrderSnapshot,
    renderCreateManualOrderForm,
    renderCreateManualOrderDialog,
    getOrderDialogId,
    getOrderAssignedLabel,
    parseOrderAssignedStaffNames,
    filterOrderAssignedStaffNames,
    getOrderResponsibleOptions,
    formatOrderAssignedStaffSummary,
    renderOrderResponsibleSelect,
    getOrderQuoteData,
    getOrderCompletionData,
    normalizeOrderQuoteToken,
    normalizeOrderQuoteList,
    formatOrderQuoteText,
    formatOrderQuoteDateValue,
    formatOrderQuoteTimeValue,
    formatOrderQuoteRequestedSlot,
    buildFormattedScheduleLabel,
    formatOrderQuoteBoolean,
    formatOrderQuotePetsLabel,
    formatOrderQuoteServiceType,
    formatOrderQuoteFrequency,
    formatOrderQuoteSquareFootage,
    getOrderQuoteSelectedServices,
    getOrderQuoteQuantityValue,
    formatOrderQuoteMultiline,
    buildOrderMediaPath,
    formatOrderMediaCountLabel,
    renderOrderMediaGallery,
    renderOrderQuoteField,
    renderOrderDetailCard,
    renderOrderPropertyCard,
    renderOrderBriefCard,
    renderOrderBriefFact,
    renderOrderPolicyAcceptancePanel,
    renderOrderServicePills,
    renderOrderTableRow,
    renderOrderEntryCard,
  };
}

module.exports = {
  createOrdersUiHelpers,
};
