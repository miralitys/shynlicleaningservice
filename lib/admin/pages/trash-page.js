"use strict";

function renderTrashPage(items, reqUrl, shared, escape, access) {
  const query = String(reqUrl.searchParams.get("q") || "").trim().toLowerCase();
  const rows = items.filter(item => !query || JSON.stringify(item.row_data).toLowerCase().includes(query));
  const formatDate = value => value ? new Date(value).toLocaleString("ru-RU", { timeZone: "America/Chicago" }) : "";
  const body = rows.map(item => {
    const raw = item.row_data || {};
    const payload = raw.payload_for_retry || raw.payloadForRetry || {};
    const order = payload.orderState || payload.adminOrder || {};
    return `<tr><td>${escape(formatDate(item.deleted_at))}</td><td>${item.scope === "order" ? "Заказ" : "Клиент / обращение с заказом"}</td>
      <td>${escape(raw.customer_name || raw.customerName || "Без имени")}<br><small>${escape(item.entry_id)}</small></td>
      <td>${escape(raw.selected_date || raw.selectedDate || "")} ${escape(raw.selected_time || raw.selectedTime || "")}</td>
      <td>${escape(raw.total_price ?? raw.totalPrice ?? "")}</td><td>${escape(order.assignedStaff || "")}</td>
      <td>${escape(item.actor?.name || item.actor?.email || item.actor?.id || "Система")}</td>
      <td><form method="post" action="/admin/trash"><input type="hidden" name="action" value="restore">
        <input type="hidden" name="trashId" value="${escape(item.id)}"><button type="submit" class="admin-button admin-button-secondary">Восстановить</button></form></td></tr>`;
  }).join("");
  return shared.renderAdminLayout("Корзина", `<form method="get" action="/admin/trash" class="admin-inline-actions">
    <input class="admin-input" name="q" aria-label="Поиск в корзине" value="${escape(query)}"><button class="admin-button" type="submit">Найти</button></form>
    ${reqUrl.searchParams.get("notice") === "restored" ? '<p role="status">Запись восстановлена.</p>' : ""}
    <div style="overflow-x:auto;margin-top:16px"><table class="admin-table"><thead><tr>
      <th>Удалено (Chicago)</th><th>Запись</th><th>Клиент / ID</th><th>Уборка</th><th>Сумма, $</th><th>Команда</th><th>Кто удалил</th><th></th>
    </tr></thead><tbody>${body || '<tr><td colspan="8">Корзина пуста.</td></tr>'}</tbody></table></div>`,
  { sidebar: shared.renderAdminAppSidebar("/admin/trash", { role: access.role }), readOnly: false });
}

module.exports = { renderTrashPage };
