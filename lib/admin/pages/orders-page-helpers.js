"use strict";

function createOrdersPageHelpers(deps = {}) {
  const {
    escapeHtml,
    getOrderAssignedLabel,
    getOrderDialogId,
    getRequestUrl,
    normalizeString,
    renderAdminBadge,
    renderOrderPaymentStatusBadge,
    renderOrderStatusBadge,
    renderQuoteOpsStatusBadge,
  } = deps;

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

  function renderOrdersOverviewStrip(metrics = []) {
    return `<div class="admin-compact-summary-strip">
      ${metrics
        .map(
          (item) => `<article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtml(item.tone || "default")}">
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
                data-admin-dialog-open="${escapeHtml(dialogId)}"
                aria-label="${escapeHtml(`Открыть карточку заказа ${order.customerName || "Клиент"}`)}"
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
                    ? `<div class="admin-table-cell-stack"><span class="admin-line-clamp-two">${escapeHtml(order.fullAddress)}</span></div>`
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

  return {
    renderOrdersNotice,
    renderOrdersOverviewStrip,
    renderOrdersUpcomingTable,
  };
}

module.exports = {
  createOrdersPageHelpers,
};
