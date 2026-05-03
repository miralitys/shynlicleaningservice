"use strict";

function createStaffViewCompensationHelpers(deps = {}) {
  const {
    STAFF_COMPENSATION_OPTIONS,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatCurrencyAmount,
    normalizeString,
    renderAdminSelectOptions,
  } = deps;

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
    return normalizeString(value, 32).toLowerCase() === "percent"
      ? "Процент (делится в команде)"
      : "Фиксированная оплата";
  }

  function formatStaffCompensationLabel(record = {}) {
    const value = normalizeCompensationFieldValue(
      record && (record.compensationValue || record.salaryValue || record.payRateValue)
    );
    if (!value) return "Не указана";
    if (normalizeString(record && record.compensationType, 32).toLowerCase() === "percent") {
      return `${value}% (если один)`;
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
      <small class="admin-field-hint">Если выбран процент, это ставка за сольный выезд. В команде процент автоматически делится на число назначенных сотрудников.</small>
    </label>`;
  }

  return {
    normalizeCompensationFieldValue,
    formatStaffCompensationTypeLabel,
    formatStaffCompensationLabel,
    renderStaffCompensationFields,
  };
}

module.exports = {
  createStaffViewCompensationHelpers,
};
