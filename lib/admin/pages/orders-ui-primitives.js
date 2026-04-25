"use strict";

function createOrdersUiPrimitives(deps = {}) {
  const {
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDER_FREQUENCY_OPTIONS,
    ADMIN_ORDER_SERVICE_OPTIONS,
    ADMIN_ORDERS_PATH,
    buildOrdersReturnPath,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminPhoneNumber,
    formatStaffCountLabel,
    normalizeOrderStatus,
    normalizeString,
    renderAdminBadge,
    renderAdminDialogCloseButton,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminSelectOptions,
    renderStaffAddressField,
  } = deps;

  function renderOrderStatusBadge(status) {
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "completed") return renderAdminBadge("Завершено", "success");
    if (normalized === "canceled") return renderAdminBadge("Отменено", "danger");
    if (normalized === "paid") return renderAdminBadge("Оплачено", "success");
    if (normalized === "awaiting-review") return renderAdminBadge("Ждем отзыв", "default");
    if (normalized === "invoice-sent") return renderAdminBadge("Инвойс отправлен", "outline");
    if (normalized === "cleaning-complete") return renderAdminBadge("Уборка завершена", "success");
    if (normalized === "photos") return renderAdminBadge("Фото", "outline");
    if (normalized === "checklist") return renderAdminBadge("Чеклист", "outline");
    if (normalized === "cleaning-started") return renderAdminBadge("Начать уборку", "default");
    if (normalized === "rescheduled") return renderAdminBadge("Перенесено", "outline");
    if (normalized === "en-route") return renderAdminBadge("В пути", "default");
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

    return Array.from(optionMap.values()).sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "base" })
    );
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
    formatAdminPhoneNumber,
  };
}

module.exports = {
  createOrdersUiPrimitives,
};
