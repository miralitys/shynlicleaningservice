"use strict";

const { SOURCES } = require("./profitability");
const PAYMENT_METHODS = Object.freeze({ zelle: "Zelle", cash: "Cash", invoice: "Invoice (карта)", check: "Check" });
const COLUMNS = Object.freeze([
  ["id", "ID заказа"], ["date", "Дата уборки"], ["client", "Клиент"], ["customerKind", "Новый / повторный"],
  ["service", "Тип уборки"], ["frequency", "Частота"], ["status", "Статус"], ["duration", "Длительность план / факт, ч"],
  ["source", "Источник"], ["leadCostCents", "Стоимость лида"], ["basePriceCents", "Цена заказа"], ["addonsCents", "Допы"],
  ["discountCents", "Скидка"], ["payableCents", "Итого к оплате"], ["paymentMethod", "Способ оплаты"], ["paidCents", "Оплачено"],
  ["paidAt", "Дата оплаты"], ["tipsCents", "Чаевые"], ["team", "Команда"], ["teamCount", "Число клинеров"],
  ["payout1", "Выплата клинеру 1"], ["payout2", "Выплата клинеру 2"], ["payout3", "Выплата клинеру 3+"],
  ["payoutTotalCents", "Выплаты всего"], ["tipsPassed", "Чаевые переданы"], ["suppliesCents", "Расходники"], ["fuelCents", "Бензин"],
  ["cardFeeCents", "Комиссия за карту"], ["expensesCents", "Расходы всего"], ["profitCents", "Прибыль"],
  ["marginPercent", "Маржа, %"], ["profitPerHourCents", "Прибыль на час"], ["debtCents", "Долг"], ["comment", "Комментарий"],
]);

function payoutPeople(row) {
  const ids = new Set(row.team.map(person => person.id));
  return [...row.team, ...(row.record.data.payouts || []).filter(item => !ids.has(item.staffId))
    .map(item => ({ id: item.staffId, name: row.staffNames?.get(item.staffId) || `Ранее в команде (${item.staffId.slice(0, 8)})` }))];
}

// Classification uses the entire order history, before report date/status filters.
function withCustomerHistory(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.clientKey || row.order.entry?.contactId ||
      String(row.order.customerPhone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") ||
      String(row.order.customerEmail || "").trim().toLowerCase() || row.order.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups, ([customerKey, items]) => {
    const ordered = [...items].sort((a, b) =>
      String(a.order.selectedDate || "9999").localeCompare(String(b.order.selectedDate || "9999")) ||
      String(a.order.createdAt || "").localeCompare(String(b.order.createdAt || "")) || a.order.id.localeCompare(b.order.id));
    const first = ordered.find(row => !row.metrics.canceled) || ordered[0];
    return items.map(row => ({ ...row, customerKey, isNewCustomer: row.order.id === first.order.id }));
  }).flat();
}

function aggregate(rows) {
  const active = rows.filter(row => !row.metrics.canceled);
  const complete = active.filter(row => row.metrics.complete);
  const sum = (items, field) => items.reduce((total, row) => total + row.metrics[field], 0);
  const result = {
    orders: active.length, allOrders: rows.length, incomplete: active.length - complete.length,
    newClients: new Set(active.filter(row => row.isNewCustomer).map(row => row.customerKey)).size,
    clients: new Set(active.map(row => row.customerKey)).size,
    canceled: rows.filter(row => row.metrics.canceled).length,
    rescheduled: rows.filter(row => row.order.orderStatus === "rescheduled").length,
  };
  for (const key of ["basePriceCents", "addonsCents", "discountCents", "payableCents", "paidCents", "leadCostCents", "tipsCents", "payoutTotalCents",
    "suppliesCents", "fuelCents", "cardFeeCents", "expensesCents", "debtCents"]) result[key] = sum(active, key);
  result.profitCents = sum(complete, "profitCents");
  const knownPaid = sum(complete, "paidCents");
  const knownMinutes = complete.reduce((sum, row) => sum + row.metrics.actualMinutes, 0);
  result.marginPercent = knownPaid > 0 ? result.profitCents * 100 / knownPaid : null;
  result.profitPerHourCents = knownMinutes > 0 && complete.every(row => row.metrics.actualMinutes > 0) ? Math.round(result.profitCents * 60 / knownMinutes) : null;
  result.actualMinutes = active.reduce((sum, row) => sum + row.metrics.actualMinutes, 0);
  result.plannedMinutes = active.reduce((sum, row) => sum + (row.order.serviceDurationMinutes || 0), 0);
  result.averageOrders = result.clients ? result.orders / result.clients : null;
  result.acquisitionCostCents = result.newClients ? Math.round(result.leadCostCents / result.newClients) : null;
  result.canceledPercent = rows.length ? result.canceled * 100 / rows.length : null;
  result.rescheduledPercent = rows.length ? result.rescheduled * 100 / rows.length : null;
  return result;
}

function groupRows(rows, keyFor, labelFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups, ([key, items]) => ({ key, label: labelFor(key, items), ...aggregate(items) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function buildSummary(rows) {
  const months = groupRows(rows, row => row.order.selectedDate?.slice(0, 7) || "", key => key || "Без даты")
    .sort((a, b) => b.key.localeCompare(a.key));
  const sources = groupRows(rows, row => row.source || "", key => SOURCES[key] || "Не указан");
  const types = groupRows(rows, row => row.order.serviceType || "", (key, items) => items[0].order.serviceLabel || key || "Не указан");
  const regularity = groupRows(rows, row => row.order.frequency ? "regular" : "oneoff", key => key === "regular" ? "Регулярные" : "Разовые");
  const people = new Map();
  for (const row of rows.filter(row => !row.metrics.canceled)) {
    const current = new Set(row.team.map(person => person.id));
    for (const person of payoutPeople(row)) {
      if (!people.has(person.id)) people.set(person.id, { id: person.id, label: person.name, orders: 0, minutes: 0, payoutCents: 0, paidCents: 0, incomplete: 0 });
      const group = people.get(person.id);
      const payout = (row.record.data.payouts || []).find(item => item.staffId === person.id);
      group.payoutCents += payout?.cents || 0;
      if (current.has(person.id)) {
        group.orders += 1;
        group.minutes += row.metrics.actualMinutes;
        group.paidCents += row.metrics.paidCents;
        if (payout?.cents == null || row.record.data.paidCents == null) group.incomplete += 1;
      }
    }
  }
  return { totals: aggregate(rows), months, sources, types, regularity,
    cleaners: [...people.values()].sort((a, b) => a.label.localeCompare(b.label, "ru")) };
}

function rowValues(row) {
  const { order, record, metrics: m } = row;
  const data = record.data;
  const people = payoutPeople(row);
  const payout = person => data.payouts?.find(item => item.staffId === person?.id)?.cents;
  return COLUMNS.map(([key]) => {
    if (key.endsWith("Cents")) {
      if (["profitCents", "profitPerHourCents"].includes(key) && (!m.complete || m.canceled)) return "";
      if (key === "paidCents" && data.paidCents == null) return "";
      return m[key] == null ? "" : m[key] / 100;
    }
    switch (key) {
      case "id": return order.id;
      case "date": return `${order.selectedDate || ""} ${order.selectedTime || ""}`.trim();
      case "client": return order.customerName;
      case "customerKind": return row.isNewCustomer ? "Новый" : "Повторный";
      case "service": return order.serviceLabel;
      case "frequency": return order.frequency ? order.frequencyLabel : "Разовая";
      case "status": return order.orderStatusLabel;
      case "duration": return `${(order.serviceDurationMinutes || 0) / 60} / ${m.actualMinutes / 60}`;
      case "source": return SOURCES[row.source] || "";
      case "paymentMethod": return PAYMENT_METHODS[data.paymentMethod ?? order.paymentMethod] || "";
      case "paidAt": return data.paidAt || "";
      case "team": return row.team.map(person => person.name).join(", ");
      case "teamCount": return row.team.length;
      case "payout1": case "payout2": return payout(people[key === "payout1" ? 0 : 1]) == null ? "" : payout(people[key === "payout1" ? 0 : 1]) / 100;
      case "payout3": return people.length > 3 ? people.slice(2).map(person => `${person.name}: ${payout(person) == null ? "не заполнено" : (payout(person) / 100).toFixed(2)}`).join("; ") : payout(people[2]) == null ? "" : payout(people[2]) / 100;
      case "tipsPassed": return data.tipsPassed === true ? "Да" : "Нет";
      case "marginPercent": return m.complete && !m.canceled ? m.marginPercent : "";
      case "comment": return data.comment || "";
      default: return "";
    }
  });
}

module.exports = { COLUMNS, PAYMENT_METHODS, payoutPeople, withCustomerHistory, aggregate, buildSummary, rowValues };
