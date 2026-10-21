"use strict";

const { SOURCES } = require("../../profitability");
const { COLUMNS, PAYMENT_METHODS, payoutPeople, aggregate } = require("../../profitability-report");
const labels = COLUMNS.map(column => column[1]);
const money = cents => cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const amount = cents => cents == null ? "" : (cents / 100).toFixed(2);
const decimal = value => value == null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
const percent = value => value == null ? "—" : `${decimal(value)}%`;
const hours = minutes => decimal(minutes / 60);
const knownProfit = item => item.orders && item.incomplete === item.orders ? null : item.profitCents;
const debtLabel = item => `${money(item.unknownDebt && !item.knownDebt ? null : item.debtCents)}${item.unknownDebt ? `<small>Оплата не заполнена: ${item.unknownDebt}</small>` : ""}`;

const styles = `<style>
  .admin-content{grid-template-columns:minmax(0,1fr)}.admin-content>*{min-width:0}
  .profit-tabs{display:flex;gap:8px;border-bottom:1px solid #dfe1e5;margin-bottom:20px;padding-bottom:12px;flex-wrap:wrap}
  .profit-tabs [aria-current=page]{background:#9e405b;color:white}.profit-tools{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin-bottom:20px}
  .profit-tools label{display:grid;gap:6px}.profit-tools .profit-check{display:flex;align-items:center;min-height:44px}
  .profit-tools .profit-check input{width:16px;max-width:16px;height:16px;flex:none;margin:0 8px 0 0}
  .profit-scroll{overflow:auto;max-height:72vh;border:1px solid #e2e3e6;border-radius:6px;scrollbar-gutter:stable}
  .profit-table{border-collapse:separate;border-spacing:0;min-width:6500px;width:100%;font-size:13px;table-layout:fixed}
  .profit-table th,.profit-table td,.profit-summary-table th,.profit-summary-table td{padding:12px;vertical-align:top;border-bottom:1px solid #e2e3e6;text-align:left;overflow-wrap:anywhere}
  .profit-table thead th{position:sticky;top:0;background:#f5f6f7;z-index:2}.profit-table tfoot{background:#f5f6f7;font-weight:700}
  .profit-table input:not([type=hidden]),.profit-table select,.profit-table textarea{width:100%;min-width:0;min-height:36px;border:1px solid #d4d7dc;border-radius:4px;padding:7px;font:inherit;background:white;box-sizing:border-box}
  .profit-table textarea{min-height:90px;resize:vertical}.profit-table tbody td:nth-child(3){position:sticky;left:0;z-index:1;background:white;border-right:1px solid #e2e3e6}
  .profit-table tbody td:nth-child(3)>a,.profit-table tbody td:nth-child(3)>button{display:block}.profit-table tbody td:nth-child(3)>button{width:max-content;max-width:100%}
  .profit-table thead th:nth-child(3){left:0;z-index:3}.profit-table label{display:grid;gap:5px;margin-bottom:9px}
  .profit-table small,.profit-summary-table small{display:block;color:#62666d;font-weight:400}.profit-negative{color:#a22e46}.profit-positive{color:#176d61}
  .profit-status{min-height:22px;margin:8px 0}.profit-settings,.profit-summary-section{margin-top:28px;border-top:1px solid #ddd;padding-top:18px}
  .profit-table button{margin-top:10px}.profit-count{margin-bottom:12px;color:#62666d}.profit-overview{display:flex;flex-wrap:wrap;gap:24px;margin:24px 0}
  .profit-overview div{min-width:120px}.profit-overview dt{font-size:13px;color:#62666d}.profit-overview dd{margin:6px 0;font-size:22px;font-weight:700}
  .profit-overview small{font-size:12px;display:block;font-weight:400;color:#62666d}
  .profit-summary-scroll{overflow:auto}.profit-summary-table{border-collapse:collapse;width:100%;min-width:850px;font-size:14px}
  .profit-summary-table th{background:#f5f6f7}.profit-summary-table td:not(:first-child){font-variant-numeric:tabular-nums}
  .profit-summary-section h2{font-size:20px}.profit-history-link{white-space:nowrap}
  @media(max-width:700px){.profit-tools>label{flex:1 1 130px}.profit-tools input,.profit-tools select{width:100%;max-width:100%}.profit-scroll{max-height:68vh}.profit-overview{gap:18px}.profit-overview dd{font-size:20px}}
</style>`;

function renderOrders(rows, e, limitedEditor = false) {
  const totals = aggregate(rows);
  const options = (values, value, emptyLabel) => `<option value="">${emptyLabel}</option>${Object.entries(values).map(([id, label]) => `<option value="${e(id)}"${id === value ? " selected" : ""}>${e(label)}</option>`).join("")}`;
  const table = rows.map(row => {
    const { order, record, source, team, metrics: m } = row;
    const data = record.data;
    const id = `profit-${order.id}`;
    const people = payoutPeople(row);
    const input = (name, label, value, attrs = 'type="number" min="0" step="0.01"') =>
      limitedEditor && !name.startsWith("payout:") && name !== "paidAt" ? e(value || "—") :
        `<input form="${e(id)}" name="${name}" aria-label="${e(label)}: ${e(order.customerName)}" value="${e(value)}" ${attrs}>`;
    const select = (name, label, contents) => `<select form="${e(id)}" name="${name}" aria-label="${e(label)}: ${e(order.customerName)}">${contents}</select>`;
    const payout = person => `<label>${e(person.name)}${input(`payout:${e(person.id)}`, `Выплата ${person.name}`, amount(data.payouts?.find(item => item.staffId === person.id)?.cents))}</label>`;
    const cells = {
      id: `<a href="/admin/orders?order=${encodeURIComponent(order.id)}">${e(order.id)}</a>`,
      date: `${e(order.selectedDate || "—")}<small>${e(order.selectedTime || "")}</small>`,
      client: `<a href="/admin/clients?client=${encodeURIComponent(row.clientKey)}">${e(order.customerName)}</a>
        <button form="${e(id)}" type="submit" class="admin-button">Сохранить</button><p class="profit-status" role="status"></p>
        <a class="profit-history-link" href="/admin/profitability?history=${encodeURIComponent(order.id)}">История</a>`,
      customerKind: row.isNewCustomer ? "Новый" : "Повторный", service: e(order.serviceLabel),
      frequency: e(order.frequency ? order.frequencyLabel : "Разовая"), status: e(order.orderStatusLabel),
      duration: `<label>План: ${hours(order.serviceDurationMinutes || 0)}<span>Факт</span>${input("actualHours", "Фактические часы", data.actualMinutes == null ? "" : String(Number((data.actualMinutes / 60).toFixed(4))), `type="number" min="0.0167" max="168" step="any" placeholder="${e(hours(m.actualMinutes))}"`)}</label>`,
      source: select("source", "Источник", options(SOURCES, source, "Не указан")),
      leadCostCents: input("leadCost", "Стоимость лида", amount(m.leadCostCents)),
      basePriceCents: money(m.basePriceCents), addonsCents: input("addons", "Допы", amount(m.addonsCents)),
      discountCents: input("discount", "Скидка", amount(m.discountCents)), payableCents: money(m.payableCents),
      paymentMethod: select("paymentMethod", "Способ оплаты", options(PAYMENT_METHODS, data.paymentMethod ?? order.paymentMethod, "Не указан")),
      paidCents: input("paidAmount", "Оплачено", amount(data.paidCents), 'type="number" min="0" step="0.01" placeholder="Не заполнено"'),
      paidAt: input("paidAt", "Дата оплаты", data.paidAt || "", 'type="date"'),
      tipsCents: input("tips", "Чаевые", amount(m.tipsCents)), team: team.map(person => e(person.name)).join("<br>") || "Не назначена", teamCount: team.length,
      payout1: people[0] ? payout(people[0]) : "—", payout2: people[1] ? payout(people[1]) : "—", payout3: people.slice(2).map(payout).join("") || "—",
      payoutTotalCents: `<strong>${money(m.payoutTotalCents)}</strong>`,
      tipsPassed: limitedEditor ? data.tipsPassed ? "Да" : "Нет" : select("tipsPassed", "Чаевые переданы", `<option value="no"${!data.tipsPassed ? " selected" : ""}>Нет</option><option value="yes"${data.tipsPassed ? " selected" : ""}>Да</option>`),
      suppliesCents: money(m.suppliesCents), fuelCents: money(m.fuelCents), cardFeeCents: money(m.cardFeeCents), expensesCents: money(m.expensesCents),
      profitCents: `<strong class="${m.profitCents < 0 ? "profit-negative" : "profit-positive"}">${m.canceled ? "Не учитывается" : m.complete ? money(m.profitCents) : "—"}</strong>${!m.complete && !m.canceled ? "<small>Не заполнено</small>" : ""}`,
      marginPercent: m.complete ? percent(m.marginPercent) : "—", profitPerHourCents: m.complete ? money(m.profitPerHourCents) : "—",
      debtCents: money(m.debtCents),
      comment: `<textarea form="${e(id)}" name="comment" maxlength="4000" aria-label="Комментарий: ${e(order.customerName)}">${e(data.comment || "")}</textarea>
        <form id="${e(id)}" method="post" action="/admin/profitability" data-profit-form>
          <input type="hidden" name="action" value="update"><input type="hidden" name="entryId" value="${e(order.id)}"><input type="hidden" name="version" value="${record.version}">
        </form>`,
    };
    return `<tr data-profit-row="${e(order.id)}">${COLUMNS.map(([key]) => `<td data-column="${key}">${cells[key]}</td>`).join("")}</tr>`;
  }).join("");
  const totalCell = key => {
    if (key === "id") return "Итого без отменённых";
    if (key === "duration") return `${hours(totals.plannedMinutes)} / ${hours(totals.actualMinutes)}`;
    if (key === "profitCents") return `${money(knownProfit(totals))}${totals.incomplete ? `<small>Не заполнено: ${totals.incomplete}</small>` : ""}`;
    if (key === "debtCents") return debtLabel(totals);
    if (key === "marginPercent") return percent(totals.marginPercent);
    if (key === "profitPerHourCents") return money(totals.profitPerHourCents);
    return typeof totals[key] === "number" && key.endsWith("Cents") ? money(totals[key]) : "";
  };
  return `<div data-profit-report><p class="profit-count">Заказов: ${rows.length} · Финансовые данные не заполнены: ${totals.incomplete}</p>
    <div class="profit-scroll" tabindex="0" aria-label="Доходность по заказам"><table class="profit-table"><colgroup>${COLUMNS.map(([key]) => `<col style="width:${key === "comment" ? 270 : key === "client" || key === "team" || key.startsWith("payout") ? 210 : 180}px">`).join("")}</colgroup>
    <thead><tr>${labels.map((label, index) => `<th scope="col">${index + 1}. ${label}</th>`).join("")}</tr></thead>
    <tbody>${table || '<tr><td colspan="34">Заказов по фильтру нет.</td></tr>'}</tbody>
    <tfoot><tr>${COLUMNS.map(([key]) => `<td>${totalCell(key)}</td>`).join("")}</tr></tfoot></table></div></div>`;
}

function renderSummary(summary, e) {
  const profit = item => `${money(knownProfit(item))}${item.incomplete ? `<small>Не заполнено: ${item.incomplete}</small>` : ""}`;
  const table = (title, headings, items, values, id) => `<section class="profit-summary-section" id="${id}"><h2>${title}</h2><div class="profit-summary-scroll"><table class="profit-summary-table">
    <thead><tr>${headings.map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead><tbody>${items.map(item => `<tr><th scope="row">${e(item.label)}</th>${values(item).map(value => `<td>${value}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headings.length}">Нет данных по фильтру.</td></tr>`}</tbody></table></div></section>`;
  const total = summary.totals;
  return `<div data-profit-summary>
    <dl class="profit-overview">${[["Заказов", total.orders], ["Оплачено", money(total.paidCents)], ["Выплаты", money(total.payoutTotalCents)], ["Подтверждённая прибыль", money(knownProfit(total))], ["Маржа", percent(total.marginPercent)], ["Долг / аванс", debtLabel(total)]]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <p class="profit-count">Финансовые данные не заполнены: ${total.incomplete}</p>
    ${table("По месяцам", ["Месяц уборки", "Заказов", "Оплачено", "Выплаты", "Расходы", "Прибыль", "Маржа", "Долг / аванс"], summary.months,
      item => [item.orders, money(item.paidCents), money(item.payoutTotalCents), money(item.expensesCents), profit(item), percent(item.marginPercent), debtLabel(item)], "months")}
    ${table("По источникам", ["Источник", "Заказов", "Новых клиентов", "Оплачено", "Прибыль", "Стоимость лидов", "Стоимость привлечения", "Заказов на клиента"], summary.sources,
      item => [item.orders, item.newClients, money(item.paidCents), profit(item), money(item.leadCostCents), money(item.acquisitionCostCents), decimal(item.averageOrders)], "sources")}
    ${table("По типам уборки", ["Услуга", "Заказов", "Часы", "Оплачено", "Прибыль", "Прибыль на час"], summary.types,
      item => [item.orders, hours(item.actualMinutes), money(item.paidCents), profit(item), money(item.profitPerHourCents)], "types")}
    ${table("Регулярные и разовые", ["Уборки", "Заказов", "Оплачено", "Расходы", "Прибыль", "Прибыль на час"], summary.regularity,
      item => [item.orders, money(item.paidCents), money(item.expensesCents), profit(item), money(item.profitPerHourCents)], "regularity")}
    ${table("По клинерам", ["Клинер", "Заказов", "Часы на объекте", "Выплаты", "Оплачено по его заказам", "Не заполнено"], summary.cleaners,
      item => [item.orders, hours(item.minutes), money(item.payoutCents), money(item.paidCents), item.incomplete], "cleaners")}
    ${table("Отмены и переносы по источникам", ["Источник", "Всего записей", "Отменено", "Доля отмен", "Сейчас перенесено", "Доля переносов"], summary.sources,
      item => [item.allOrders, item.canceled, percent(item.canceledPercent), item.rescheduled, percent(item.rescheduledPercent)], "source-cancellations")}
    ${table("Отмены и переносы по услугам", ["Услуга", "Всего записей", "Отменено", "Доля отмен", "Сейчас перенесено", "Доля переносов"], summary.types,
      item => [item.allOrders, item.canceled, percent(item.canceledPercent), item.rescheduled, percent(item.rescheduledPercent)], "type-cancellations")}
    </div>`;
}

function renderProfitabilityPage({ rows, allRows = rows, summary, view = "orders", settings, settingsVersion, filters, access, shared, escapeHtml: e, notice = "", importPreview = null }) {
  const query = new URLSearchParams(filters);
  const link = target => {
    const params = new URLSearchParams(query);
    if (target === "summary") { params.set("view", target); if (!filters.status) params.delete("status"); }
    return `/admin/profitability?${e(params.toString())}`;
  };
  const csv = new URLSearchParams(query); csv.set("format", "csv");
  const options = (items, current) => items.map(([value, label]) => `<option value="${e(value)}"${current === value ? " selected" : ""}>${e(label)}</option>`).join("");
  const serviceTypes = [...new Map(allRows.map(row => [row.order.serviceType, row.order.serviceLabel])).entries()];
  const cleaners = [...new Map(allRows.flatMap(row => row.team.map(person => [person.id, person.name]))).entries()];
  const statuses = [["", "Все, кроме отменённых"], ["all", "Все"], ["new", "Новые"], ["scheduled", "Запланировано"],
    ["en-route", "В пути"], ["rescheduled", "Перенесено"], ["cleaning-started", "Уборка начата"], ["checklist", "Чеклист"], ["photos", "Фото"],
    ["cleaning-complete", "Уборка завершена"], ["invoice-sent", "Инвойс отправлен"], ["paid", "Оплачено"], ["awaiting-review", "Ожидается отзыв"], ["completed", "Завершено"], ["canceled", "Отменено"]];
  const content = `${styles}<nav class="profit-tabs" aria-label="Доходность">
    <a class="admin-button admin-button-secondary" href="${link("orders")}"${view === "orders" ? ' aria-current="page"' : ""}>По заказам</a>
    <a class="admin-button admin-button-secondary" href="${link("summary")}"${view === "summary" ? ' aria-current="page"' : ""}>Сводка</a></nav>
    ${notice ? `<p role="status" class="admin-alert">${e(notice)}</p>` : ""}
    <form method="get" class="profit-tools">${view === "summary" ? '<input type="hidden" name="view" value="summary">' : ""}
      <label>С даты<input class="admin-input" type="date" name="start" value="${e(filters.start)}"></label>
      <label>По дату<input class="admin-input" type="date" name="end" value="${e(filters.end)}"></label>
      <label>Статус<select class="admin-input" name="status">${options(statuses, filters.status)}</select></label>
      <label>Источник<select class="admin-input" name="source">${options([["", "Все"], ...Object.entries(SOURCES)], filters.source)}</select></label>
      <label>Тип уборки<select class="admin-input" name="serviceType">${options([["", "Все"], ...serviceTypes], filters.serviceType)}</select></label>
      <label>Клинер<select class="admin-input" name="cleaner">${options([["", "Все"], ...cleaners], filters.cleaner)}</select></label>
      <label class="profit-check"><input type="checkbox" name="debt" value="1"${filters.debt ? " checked" : ""}>Только с долгом</label>
      <button class="admin-button" type="submit">Применить</button><a class="admin-button admin-button-secondary" href="/admin/profitability?${e(csv.toString())}">CSV заказов</a>
    </form>
    ${view === "summary" ? renderSummary(summary, e) : renderOrders(rows, e, access.limitedEditor)}
    ${access.limitedEditor ? "" : `<details class="profit-settings"><summary>Расходы на заказ</summary><form method="post" action="/admin/profitability" class="profit-tools">
      <input type="hidden" name="action" value="settings"><input type="hidden" name="version" value="${settingsVersion}">
      <label>Расходники, $<input class="admin-input" name="supplies" type="number" min="0" step="0.01" required value="${amount(settings.suppliesCents || 0)}"></label>
      <label>Бензин, $<input class="admin-input" name="fuel" type="number" min="0" step="0.01" required value="${amount(settings.fuelCents || 0)}"></label>
      <label>Комиссия Invoice, %<input class="admin-input" name="cardFee" type="number" min="0" max="100" step="0.01" required value="${amount(settings.cardFeeBasisPoints || 0)}"></label>
      <button class="admin-button" type="submit">Сохранить расходы</button></form></details>
    <details class="profit-settings"><summary>Импорт источников CSV</summary><form method="post" action="/admin/profitability">
      <input type="hidden" name="action" value="preview-import"><label class="admin-label">ID заказа, источник<textarea class="admin-input" name="csv" rows="5" required placeholder="ID заказа,источник"></textarea></label>
      <button class="admin-button" type="submit">Проверить импорт</button></form></details>
    ${importPreview ? `<section><h2>Проверка импорта</h2><ul>${importPreview.items.map(item => `<li>${e(item.id)}: ${e(item.oldLabel)} → ${e(item.label)}</li>`).join("")}</ul><form method="post" action="/admin/profitability"><input type="hidden" name="action" value="apply-import"><input type="hidden" name="csv" value="${e(importPreview.csv)}"><input type="hidden" name="versions" value="${e(JSON.stringify(importPreview.versions))}"><button class="admin-button" type="submit">Применить импорт</button></form></section>` : ""}`}
    <script>(()=>{let saving=false;document.addEventListener('submit',async event=>{
      const form=event.target;if(!form.matches('[data-profit-form]'))return;event.preventDefault();if(saving)return;
      saving=true;const row=form.closest('tr');const status=row.querySelector('[role="status"]');const body=new URLSearchParams(new FormData(form));
      const controls=Array.from(row.querySelectorAll('input,select,textarea,button'));controls.forEach(control=>control.disabled=true);status.textContent='Сохраняется…';
      const saveButtons=Array.from(document.querySelectorAll('[data-profit-row] button'));saveButtons.forEach(button=>button.disabled=true);
      let saved=false;try{const response=await fetch(form.getAttribute('action'),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body});const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.message||'Не удалось сохранить.');saved=true;form.elements.version.value=result.version;
        const fresh=await fetch(window.location.href,{headers:{'Accept':'text/html'},cache:'no-store'});if(!fresh.ok)throw new Error('Не удалось обновить итог.');
        const doc=new DOMParser().parseFromString(await fresh.text(),'text/html');const next=doc.querySelector('[data-profit-report]');if(!next)throw new Error('Не удалось обновить итог.');
        const old=document.querySelector('[data-profit-report]');const scroll=old.querySelector('.profit-scroll');const left=scroll.scrollLeft,top=scroll.scrollTop;
        const current=Array.from(next.querySelectorAll('[data-profit-row]')).find(item=>item.dataset.profitRow===row.dataset.profitRow);
        if(current){row.replaceWith(current);current.querySelector('[role="status"]').textContent='Сохранено';}else row.remove();
        old.querySelector('tfoot').replaceWith(next.querySelector('tfoot'));old.querySelector('.profit-count').replaceWith(next.querySelector('.profit-count'));
        scroll.scrollTo(left,top);
      }catch(error){status.textContent=(saved?'Сохранено. ':'')+error.message;}finally{controls.forEach(control=>control.disabled=false);saveButtons.forEach(button=>button.disabled=false);saving=false;}
    });})();</script>`;
  return shared.renderAdminLayout("Доходность", content, { sidebar: shared.renderAdminAppSidebar("/admin/profitability", access), kicker: false });
}

module.exports = { renderProfitabilityPage, money, amount, labels, renderOrders, renderSummary };
