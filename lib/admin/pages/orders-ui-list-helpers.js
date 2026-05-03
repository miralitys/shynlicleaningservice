"use strict";

function createOrdersUiListHelpers(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminPhoneNumber,
    formatAdminDateTime,
    formatCurrencyAmount,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getOrderAssignedLabel,
    getOrderDialogId,
    renderAdminBadge,
    renderAdminDeleteIconButton,
    renderAdminEditIcon,
    renderAdminPickerField,
    renderOrderPaymentStatusBadge,
    renderOrderResponsibleSelect,
    renderOrderServiceDurationInputs,
    renderOrderSnapshot,
    renderOrderStatusBadge,
    renderQuoteOpsStatusBadge,
  } = deps;

  function renderOrderTableRow(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const dialogId = getOrderDialogId(order.id);
    const customerPhoneLabel = formatAdminPhoneNumber(order.customerPhone);
    const contactCell = [customerPhoneLabel, order.customerEmail].filter(Boolean);
    const scheduleNote =
      order.serviceDurationLabel && order.serviceDurationLabel !== "Не указана"
        ? `Длительность: ${order.serviceDurationLabel}`
        : order.hasSchedule
          ? "Визит назначен"
          : "Нужно назначить";

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
          ${planningItem ? renderAdminBadge(planningItem.assignmentStatusLabel || "", "outline") : ""}
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
        ${renderOrderSnapshot("Длительность", order.serviceDurationLabel || "Не указана")}
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
                <option value="en-route"${order.orderStatus === "en-route" ? " selected" : ""}>В пути</option>
                <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Перенесено</option>
                <option value="cleaning-started"${order.orderStatus === "cleaning-started" ? " selected" : ""}>Начать уборку</option>
                <option value="checklist"${order.orderStatus === "checklist" ? " selected" : ""}>Чеклист</option>
                <option value="photos"${order.orderStatus === "photos" ? " selected" : ""}>Фото</option>
                <option value="cleaning-complete"${order.orderStatus === "cleaning-complete" ? " selected" : ""}>Уборка завершена</option>
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
              displayValue: order.selectedDate || "",
              nativeValue: order.selectedDate,
              placeholder: "04/15/2026",
              pickerLabel: "Выбрать дату уборки",
            })}
            ${renderAdminPickerField({
              pickerType: "time",
              fieldId: `${dialogId}-selected-time`,
              label: "Время уборки",
              name: "selectedTime",
              displayValue: order.selectedTime || "",
              nativeValue: order.selectedTime,
              placeholder: "1:30 PM",
              pickerLabel: "Выбрать время уборки",
            })}
            ${renderOrderServiceDurationInputs({
              fieldPrefix: dialogId,
              serviceDurationMinutes: order.serviceDurationMinutes,
              serviceDurationLabel: order.serviceDurationLabel,
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
    renderOrderTableRow,
    renderOrderEntryCard,
  };
}

module.exports = {
  createOrdersUiListHelpers,
};
