"use strict";

const { AUDIT_PAGINATION_SCRIPT } = require("./audit-pagination-script");

const ACTIONS = { create: "Создание", update: "Изменение", delete: "Удаление" };
const STATUSES = { pending: "Результат ещё не подтверждён", succeeded: "Сохранено", failed: "Не выполнено", unconfirmed: "Запись в базе не подтверждена" };
const FIELDS = {
  customerName: "Имя", customerPhone: "Телефон", customerEmail: "Email", fullAddress: "Адрес",
  totalPrice: "Сумма", selectedDate: "Дата уборки", selectedTime: "Время уборки", status: "Статус",
  assignedStaff: "Команда", paymentStatus: "Оплата", paymentMethod: "Способ оплаты", frequency: "Повторяемость",
  serviceType: "Услуга", serviceDurationMinutes: "Длительность, мин.", payrollOverrides: "Вознаграждение клинеров",
  payroll: "Расчёт выплат", policyAccepted: "Политика подписана", policyAcceptedAt: "Дата подписи политики",
  cleanerConfirmedAt: "Подтверждение клинером", managerConfirmedAt: "Подтверждение менеджером",
  recurringAdditionalDetails: "Комментарий для следующих уборок", recurringSeriesCanceledFromDate: "Отмена серии с даты",
  "client.addressBook": "Адреса и параметры жилья", "client.secondaryPhone": "Дополнительный телефон",
  "client.automaticNotificationsEnabled": "Автосообщения", "client.paymentNotificationsEnabled": "Уведомления об оплате",
  "client.removedAddressKeys": "Удалённые адреса", "client.photosCount": "Количество фото клиента",
  "quote.rooms": "Спальни", "quote.bathrooms": "Санузлы", "quote.squareMeters": "Площадь",
  "quote.additionalRooms": "Дополнительные комнаты", "quote.hasPets": "Питомцы", "quote.basementCleaning": "Подвал",
  "quote.services": "Дополнительные услуги", "quote.quantityServices": "Количество дополнительных услуг",
  "quote.refrigeratorCondition": "Холодильник", "quote.cabinetsCondition": "Шкафы",
  "quote.additionalDetails": "Комментарий", "quote.consent": "Согласие", "quote.addressLine2": "Квартира",
  "quote.city": "Город", "quote.state": "Штат", "quote.zipCode": "ZIP",
  "quote.initialCleaning": "Первая уборка", "quote.propertyType": "Тип жилья",
  "completion.cleanerComment": "Комментарий клинера", "completion.cleanerComments": "Комментарии клинеров",
  "completion.checklistItems": "Чеклист", "completion.photosSkipped": "Без фото",
  "completion.beforePhotosCount": "Количество фото до", "completion.afterPhotosCount": "Количество фото после",
};

function chicagoMidnight(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const target = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== value) return "";
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let time = target;
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, part.value]));
    time += target - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  }
  return new Date(time).toISOString();
}

function auditFilters(params) {
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const endDate = chicagoMidnight(to) ? new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : "";
  return {
    entityType: ["client", "order"].includes(params.get("entityType")) ? params.get("entityType") : "",
    action: Object.hasOwn(ACTIONS, params.get("action")) ? params.get("action") : "",
    status: Object.hasOwn(STATUSES, params.get("status")) ? params.get("status") : "",
    actor: (params.get("actor") || "").trim().slice(0, 250),
    entityId: (params.get("entityId") || "").trim().slice(0, 250),
    q: (params.get("q") || "").trim().slice(0, 200),
    start: chicagoMidnight(from), end: chicagoMidnight(endDate),
    offset: Math.min(1000000, Math.max(0, Math.floor(Number(params.get("offset")) || 0))), limit: 51,
  };
}

async function renderAuditPage(store, reqUrl, shared, escape, access) {
  const filters = auditFilters(reqUrl.searchParams);
  const records = await store.list(filters);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const dateTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "medium" });
  const value = (field, item) => item == null || item === "" ? "Не указано" : field === "totalPrice" ? money.format(item)
    : typeof item === "boolean" ? item ? "Да" : "Нет" : typeof item === "object" ? JSON.stringify(item) : String(item);
  const rows = records.slice(0, 50).map(event => {
    const changes = event.changes || [];
    const amount = changes.find(change => change.field === "totalPrice");
    const summary = event.action === "update" && amount ? `Сумма: ${value("totalPrice", amount.old)} → ${value("totalPrice", amount.new)}`
      : event.action === "delete" ? "Запись удалена" : event.action === "create" ? "Новая запись" : `Изменено полей: ${changes.length}`;
    const details = changes.map(change => `<tr><th scope="row">${escape(FIELDS[change.field] || change.field)}</th><td>${escape(value(change.field, change.old))}</td><td>${escape(value(change.field, change.new))}</td></tr>`).join("");
    return `<tr data-audit-event-id="${escape(event.id)}"><td><time datetime="${escape(event.occurred_at)}">${escape(dateTime.format(new Date(event.occurred_at)))}</time></td>
      <td>${escape(event.actor.name || event.actor.email || "Автоматически")}<small>${escape(event.actor.email || event.actor.source || "")}</small></td>
      <td>${escape(ACTIONS[event.action] || event.action)}<small class="audit-status-${escape(event.status)}">${escape(STATUSES[event.status] || event.status)}</small></td>
      <td>${event.entity_type === "order" ? "Заказ" : "Клиент"}: ${escape(event.entity_label)}<small>${escape(event.entity_id)}</small><small>Источник: ${escape(event.route || "Фоновый процесс")}</small></td>
      <td><details><summary>${escape(summary)}</summary>${details ? `<div class="audit-table-scroll"><table class="audit-diff"><thead><tr><th>Поле</th><th>Было</th><th>Стало</th></tr></thead><tbody>${details}</tbody></table></div>` : "Нет подтверждённых изменений"}<small>ID события: ${escape(event.id)}</small><small>ID заявки: ${escape(event.entry_id || "")}</small><small>ID операции: ${escape(event.request_id || "")}</small></details></td></tr>`;
  }).join("");
  function input(name, label, type = "text") {
    return `<label class="admin-label">${escape(label)}<input class="admin-input" type="${type}" name="${name}" value="${escape(reqUrl.searchParams.get(name) || "")}"></label>`;
  }
  function select(name, label, choices) {
    return `<label class="admin-label">${escape(label)}<select class="admin-input" name="${name}"><option value="">Все</option>${Object.entries(choices).map(([key, title]) => `<option value="${key}"${filters[name] === key ? " selected" : ""}>${title}</option>`).join("")}</select></label>`;
  }
  function pageLink(offset, label, loadMore = false) {
    const params = new URLSearchParams(reqUrl.searchParams);
    params.delete("fragment");
    params.set("offset", String(offset));
    return `<a class="admin-button admin-button-secondary"${loadMore ? " data-audit-load-more" : ""} href="/admin/audit?${escape(params.toString())}">${label}</a>`;
  }
  const table = `<div class="audit-table-scroll"><table class="audit-table"><colgroup><col style="width:15%"><col style="width:16%"><col style="width:13%"><col style="width:22%"><col style="width:34%"></colgroup>
      <thead><tr><th>Когда (Chicago)</th><th>Кто</th><th>Действие</th><th>Запись</th><th>Изменения</th></tr></thead>
      <tbody data-audit-entries>${rows || `<tr><td colspan="5">Записей пока нет.</td></tr>`}</tbody></table></div>`;
  const pagination = `<nav class="audit-pagination" data-audit-pagination aria-label="Страницы журнала">${filters.offset ? pageLink(Math.max(0, filters.offset - 50), "Назад") : ""}${records.length > 50 ? pageLink(filters.offset + 50, "Далее", true) : ""}<span role="status" data-audit-load-status></span></nav>`;
  if (reqUrl.searchParams.get("fragment") === "entries") return table + pagination;
  return shared.renderAdminLayout("Журнал действий", `
    <style>
      .audit-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:24px}
      .audit-filters .admin-label{display:flex;flex-direction:column;gap:6px;min-width:0}
      .audit-table-scroll{overflow-x:auto}.audit-table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
      .audit-table th,.audit-table td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid #e3e5e8;overflow-wrap:anywhere}
      .audit-table th{font-size:12px;background:#f6f7f8}.audit-table small{display:block;color:#626970;margin-top:6px;font-size:12px}
      .audit-table summary{cursor:pointer;font-weight:600}.audit-table details[open] summary{margin-bottom:12px}
      .audit-diff{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}.audit-diff th,.audit-diff td{padding:8px}
      .audit-table .audit-status-failed,.audit-table .audit-status-unconfirmed,.audit-table .audit-status-pending{color:#9b303b}
      .audit-pagination{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:20px;overflow-anchor:none}
      .audit-pagination [aria-disabled="true"]{opacity:.65;cursor:wait}
      .audit-pagination [hidden]{display:none}
      @media(max-width:1000px){.audit-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.audit-table{min-width:850px}}
      @media(max-width:550px){.audit-filters{grid-template-columns:minmax(0,1fr)}}
    </style>
    <form method="get" action="/admin/audit" class="audit-filters">
      ${input("from", "С даты (Chicago)", "date")}${input("to", "По дату (Chicago)", "date")}
      ${input("q", "Имя клиента")}${input("actor", "Email сотрудника", "email")}
      ${select("entityType", "Запись", { client: "Клиенты", order: "Заказы" })}${select("action", "Действие", ACTIONS)}
      ${input("entityId", "ID записи / телефон клиента")}${select("status", "Результат", STATUSES)}
      <div class="admin-inline-actions"><button class="admin-button" type="submit">Найти</button><a href="/admin/audit">Сбросить</a></div>
    </form>
    ${table}${pagination}`,
  { sidebar: shared.renderAdminAppSidebar("/admin/audit", { role: access.role }), readOnly: true,
    bodyScripts: AUDIT_PAGINATION_SCRIPT });
}

module.exports = { renderAuditPage, auditFilters, chicagoMidnight };
