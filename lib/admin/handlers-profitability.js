"use strict";

const { parse } = require("csv-parse/sync");
const { createAdminDomainHelpers } = require("./domain");
const { createOrdersUiPrimitives } = require("./pages/orders-ui-primitives");
const { SOURCES, canAccessProfitability, canEditAssistantProfitabilityFields, ASSISTANT_ACCOUNT_PERMISSION, ASSISTANT_ACCOUNT_FIELDS, validAssistantKey, cents, normalizePatch, calculateProfitability, defaultSource } = require("../profitability");
const { renderProfitabilityPage, money, labels } = require("./pages/profitability-page");
const { withCustomerHistory, buildSummary, rowValues, PAYMENT_METHODS } = require("../profitability-report");
const { orderPayouts, prepareOrderPayouts, invalidatePayoutCache } = require("../order-payouts");
const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const ui = createOrdersUiPrimitives({ normalizeString });

function parseSourceImport(csv, orders, records) {
  let items;
  try { items = parse(csv, { bom: true, trim: true, skip_empty_lines: true, columns: true, max_record_size: 4000 }); }
  catch { throw Object.assign(new Error("Некорректный CSV. Нужны колонки ID заказа, источник."), { status: 400 }); }
  if (!items.length || items.length > 500) throw Object.assign(new Error("Импорт: от 1 до 500 строк."), { status: 400 });
  const validIds = new Set(orders.map(order => order.id));
  const seen = new Set();
  return items.map(item => {
    if (Object.keys(item).some(key => !["ID заказа", "источник", "id", "source"].includes(key))) throw Object.assign(new Error("Разрешены только ID заказа и источник."), { status: 400 });
    const id = item["ID заказа"] || item.id;
    const value = item["источник"] || item.source;
    const source = Object.keys(SOURCES).find(key => key === value || SOURCES[key].toLowerCase() === String(value || "").toLowerCase());
    if (!validIds.has(id) || seen.has(id) || !source) throw Object.assign(new Error("Проверьте ID, источники и повторы в CSV."), { status: 400 });
    seen.add(id);
    const old = records.get(id);
    return { id, source, label: SOURCES[source], oldLabel: SOURCES[old?.data.source || defaultSource(orders.find(order => order.id === id)?.entry)] || "Не указан", version: old?.version || 0 };
  });
}

function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function createProfitabilityHandler({ store, shared, readTextBody, readJsonBody, parseFormBody,
  writeHtmlWithTiming, writeJsonWithTiming, writeHeadWithTiming, redirectWithTiming, escapeHtml, env = process.env }) {
  return async function handle(context) {
    const { req, res, currentUserAccess: access, quoteOpsLedger: ledger, staffStore, requestStartNs: start } = context;
    const url = new URL(req.url, "http://localhost");
    if (!["/admin/profitability", "/admin/profitability/api"].includes(url.pathname)) return false;
    const api = url.pathname.endsWith("/api");
    const bearer = Boolean(req.headers.authorization);
    const assistant = api && validAssistantKey(req.headers.authorization, env);
    const limitedEditor = !bearer && canEditAssistantProfitabilityFields(access, env);
    const allowed = bearer ? assistant : canAccessProfitability(access, env);
    const json = (status, data) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Vary", "Cookie, Authorization");
      writeJsonWithTiming(res, status, data, start, false);
    };
    if (!allowed || (assistant && !["GET", "PATCH"].includes(req.method))) { json(403, { ok: false, message: "Доступ запрещён." }); return true; }
    if (req.headers.origin && req.headers.origin !== `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`) {
      json(403, { ok: false, message: "Доступ запрещён." }); return true;
    }
    if (!["GET", "POST", "PATCH"].includes(req.method) || (req.method === "PATCH" && !api)) { json(limitedEditor ? 403 : 405, { ok: false }); return true; }
    const actor = assistant ? { id: "assistant:eva", name: "Ева", permission: "profitability.update_fields" }
      : access.user ? { id: access.user.id, email: access.user.email, role: access.role, ...(limitedEditor ? { permission: ASSISTANT_ACCOUNT_PERMISSION } : {}) }
        : { id: "legacy-admin", name: "Рамис (общий администратор)", role: "admin" };
    try {
      const [entries, snapshot, finances] = await Promise.all([ledger.listOrderListEntries({ includePayroll: true }), staffStore.getSnapshot(), store.list()]);
      const planning = domain.buildStaffPlanningContext(entries, snapshot);
      const orders = domain.collectAdminOrderRecords(entries).map(order => {
        const decorated = ui.decorateOrderForPlanning(order, planning.orderItemsByEntryId, []);
        return { ...decorated, selectedDate: decorated.planningItem?.scheduleDate || decorated.selectedDate,
          selectedTime: decorated.planningItem?.scheduleTime || decorated.selectedTime };
      });
      const records = new Map(finances.map(record => [record.id, record]));
      const settingsRecord = records.get("settings") || { version: 0, data: {} };
      const settings = settingsRecord.data;
      const teamFor = order => {
        const planningItem = planning.orderItemsByEntryId.get(order.id);
        if (planningItem?.assignedStaff?.length) return planningItem.assignedStaff;
        return String(order.assignedStaff || "").split(",").map(name => name.trim()).filter(Boolean).map(name =>
          snapshot.staff.find(person => person.name.toLowerCase() === name.toLowerCase()) || { id: `legacy:${name.toLowerCase()}`, name });
      };
      const recordFor = id => {
        const record = records.get(id) || { id, version: 0, data: {} };
        const order = orders.find(order => order.id === id);
        return order ? { ...record, data: { ...record.data, payouts: orderPayouts(order.entry, teamFor(order)) } } : record;
      };
      const ajax = api || String(req.headers.accept || "").includes("application/json");
      const redirect = () => redirectWithTiming(res, 303, "/admin/profitability", start, false);
      let importPreview = null;
      if (req.method === "POST" || req.method === "PATCH") {
        const body = String(req.headers["content-type"] || "").startsWith("application/json")
          ? await readJsonBody(req, 100000) : parseFormBody(await readTextBody(req, 100000));
        if (!body || typeof body !== "object") throw Object.assign(new Error("Некорректные данные."), { status: 400 });
        const action = api ? "update" : String(body.action || "");
        if (limitedEditor) {
          const permitted = api ? ["entryId", "version", "orderUpdatedAt", "patch"] : ["action", "entryId", "version", "orderUpdatedAt", ...[...ASSISTANT_ACCOUNT_FIELDS].filter(key => key !== "payouts")];
          const forbidden = action !== "update" || Object.keys(body).some(key => !permitted.includes(key) && (api || !key.startsWith("payout:"))) ||
            (api && body.patch && Object.keys(body.patch).some(key => !ASSISTANT_ACCOUNT_FIELDS.has(key)));
          if (forbidden) { json(403, { ok: false, message: "Это поле недоступно для изменения." }); return true; }
        }
        if (action === "settings" && !api) {
          const patch = { suppliesCents: cents(body.supplies), fuelCents: cents(body.fuel), cardFeeBasisPoints: cents(body.cardFee), configured: true };
          if (patch.cardFeeBasisPoints > 10000) throw Object.assign(new Error("Комиссия не может быть больше 100%."), { status: 400 });
          await store.save("settings", patch, Number(body.version), actor); redirect(); return true;
        }
        if (["preview-import", "apply-import"].includes(action) && !api) {
          const csv = String(body.csv || "");
          const items = parseSourceImport(csv, orders, records);
          if (action === "apply-import") {
            const versions = JSON.parse(body.versions || "{}");
            if (items.some(item => versions[item.id] !== item.version)) throw Object.assign(new Error("Источники изменились после проверки. Повторите импорт."), { status: 409 });
            await store.saveBatch(items.map(item => ({ id: item.id, patch: { source: item.source }, version: item.version })), actor);
            redirect(); return true;
          }
          importPreview = { items, csv, versions: Object.fromEntries(items.map(item => [item.id, item.version])) };
        } else if (action === "update") {
          const order = orders.find(order => order.id === body.entryId);
          if (!order) { json(404, { ok: false, message: "Заказ не найден." }); return true; }
          const old = recordFor(order.id);
          const team = teamFor(order);
          const ids = [...new Set([...team.map(person => person.id), ...(old.data.payouts || []).map(item => item.staffId)])];
          if (limitedEditor && !api && Object.keys(body).some(key => key.startsWith("payout:") && !ids.includes(key.slice(7)))) {
            json(403, { ok: false, message: "Нельзя менять команду заказа." }); return true;
          }
          const formPatch = {};
          if (!api) {
            for (const field of ["source", "paidAt", "paymentMethod", "comment"]) if (Object.hasOwn(body, field)) formPatch[field] = body[field];
            for (const [field, key] of Object.entries({ paidAmount: "paidCents", leadCost: "leadCostCents", addons: "addonsCents", discount: "discountCents", tips: "tipsCents" })) {
              if (Object.hasOwn(body, field)) formPatch[key] = body[field] === "" && key === "paidCents" ? null : cents(body[field]);
            }
            if (Object.hasOwn(body, "actualHours")) {
              const hours = String(body.actualHours).trim().replace(",", ".");
              if (hours && (!/^\d{1,3}(?:\.\d{1,4})?$/.test(hours) || Number(hours) > 168 || Number(hours) < 1 / 60)) throw Object.assign(new Error("Укажите длительность от 1 минуты до 168 часов."), { status: 400 });
              formPatch.actualMinutes = hours ? Math.round(Number(hours) * 60) : null;
            }
            if (Object.hasOwn(body, "tipsPassed")) {
              if (!["yes", "no"].includes(body.tipsPassed)) throw Object.assign(new Error("Некорректная отметка чаевых."), { status: 400 });
              formPatch.tipsPassed = body.tipsPassed === "yes";
            }
            if (ids.some(id => Object.hasOwn(body, `payout:${id}`))) formPatch.payouts = ids.map(staffId => ({ staffId,
              cents: !Object.hasOwn(body, `payout:${staffId}`) ? old.data.payouts?.find(item => item.staffId === staffId)?.cents ?? null :
                body[`payout:${staffId}`] === "" ? null : cents(body[`payout:${staffId}`]) }));
          }
          const patch = normalizePatch(api ? body.patch : formPatch, ids, assistant);
          if (patch.payouts) {
            // A partial payout edit must not drop another cleaner's existing payout.
            patch.payouts = [...new Map([...(old.data.payouts || []), ...patch.payouts].map(item => [item.staffId, item])).values()];
          }
          if (calculateProfitability(order, { ...old.data, ...patch }, team, settings).payableCents < 0) throw Object.assign(new Error("Скидка превышает стоимость заказа."), { status: 400 });
          let change = null;
          if (patch.payouts) {
            const entry = await ledger.getEntry(order.id);
            if (!entry || entry.updatedAt !== order.entry.updatedAt) throw Object.assign(new Error("Заказ уже изменился. Обновите строку."), { status: 409 });
            change = prepareOrderPayouts(entry, patch.payouts, team, snapshot.staff);
            if (change.changed && (!body.orderUpdatedAt || body.orderUpdatedAt !== entry.updatedAt)) throw Object.assign(new Error("Заказ изменился после открытия таблицы. Обновите строку."), { status: 409 });
            patch.payouts = change.after;
          }
          const updated = change?.changed
            ? await store.saveWithPayroll(order.id, patch, Number(body.version), actor, change, ledger)
            : await store.save(order.id, patch, Number(body.version), actor);
          if (change?.changed) invalidatePayoutCache(ledger);
          updated.data = { ...updated.data, payouts: change?.after || old.data.payouts };
          if (ajax) {
            const metrics = calculateProfitability(order, updated.data, team, settings);
            json(200, assistant ? { ok: true, entryId: order.id, version: updated.version, orderUpdatedAt: updated.orderUpdatedAt || order.entry.updatedAt } :
              { ok: true, version: updated.version, orderUpdatedAt: updated.orderUpdatedAt || order.entry.updatedAt, metrics, profitLabel: metrics.canceled ? "Не учитывается" : metrics.complete ? money(metrics.profitCents) : "—" });
          } else redirect();
          return true;
        } else if (!importPreview) { json(400, { ok: false, message: "Действие недоступно." }); return true; }
      } else if (api) {
        const order = orders.find(order => order.id === url.searchParams.get("entryId"));
        if (!order) { json(404, { ok: false }); return true; }
        const record = recordFor(order.id);
        const fields = ["source", "paidCents", "paidAt", "paymentMethod", "payouts", ...(limitedEditor ? ["comment"] : [])];
        json(200, { ok: true, entryId: order.id, version: record.version, orderUpdatedAt: order.entry.updatedAt,
          fields: Object.fromEntries(fields.map(key => [key, key === "source" ? record.data.source || defaultSource(order.entry) : record.data[key] ?? null])) });
        return true;
      }

      if (url.searchParams.has("history")) {
        const id = url.searchParams.get("history");
        if (!orders.some(order => order.id === id)) { json(404, { ok: false }); return true; }
        const history = await store.history(id);
        const format = (data = {}) => [
          `Источник: ${SOURCES[data.source] || "Не указан"}`,
          ...[["Оплачено", "paidCents"], ["Стоимость лида", "leadCostCents"], ["Цена (финансовая разбивка)", "basePriceCents"], ["Допы", "addonsCents"], ["Скидка", "discountCents"], ["Чаевые", "tipsCents"]]
            .map(([label, key]) => `${label}: ${money(data[key])}`),
          `Дата оплаты: ${data.paidAt || "не указана"}`, `Способ оплаты: ${PAYMENT_METHODS[data.paymentMethod] || "не указан"}`,
          `Факт, ч: ${data.actualMinutes == null ? "по плану" : data.actualMinutes / 60}`, `Чаевые переданы: ${data.tipsPassed === true ? "да" : "нет"}`,
          `Комментарий: ${data.comment || "не указан"}`,
          `Выплаты: ${(data.payouts || []).map(item => `${snapshot.staff.find(person => person.id === item.staffId)?.name || item.staffId}: ${money(item.cents)}`).join(", ") || "не заполнены"}`,
        ].join("\n");
        const dateLabel = value => new Intl.DateTimeFormat("ru-RU", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
        const html = shared.renderAdminLayout("История доходности", `<a href="/admin/profitability">К доходности</a><ul>${history.map(event => `<li>${escapeHtml(dateLabel(event.occurred_at))} · ${escapeHtml(event.actor.name || event.actor.email || event.actor.id)}<h3>Было</h3><p style="white-space:pre-wrap">${escapeHtml(format(event.before_data || event.before))}</p><h3>Стало</h3><p style="white-space:pre-wrap">${escapeHtml(format(event.after_data || event.after))}</p></li>`).join("")}</ul>`);
        writeHtmlWithTiming(res, 200, html, start, false); return true;
      }
      const filters = Object.fromEntries(["start", "end", "status", "source", "serviceType", "cleaner", "debt"].map(key => [key, url.searchParams.get(key) || ""]));
      const view = url.searchParams.get("view") === "summary" ? "summary" : "orders";
      if (view === "summary" && !url.searchParams.has("status")) filters.status = "all";
      const clientMap = new Map(domain.collectAdminClientRecords(entries).flatMap(client => client.entries.map(entry => [entry.id, client.key])));
      const staffNames = new Map(snapshot.staff.map(person => [person.id, person.name]));
      const allRows = withCustomerHistory(orders.map(order => { const record = recordFor(order.id); const team = teamFor(order);
        return { order, record, team, staffNames, source: record.data.source || defaultSource(order.entry), metrics: calculateProfitability(order, record.data, team, settings), clientKey: clientMap.get(order.id) || "" };
      }));
      const rows = allRows.filter(row => (!filters.start || row.order.selectedDate >= filters.start) && (!filters.end || row.order.selectedDate <= filters.end) &&
        (filters.status === "all" || (filters.status ? row.order.orderStatus === filters.status : !row.metrics.canceled)) &&
        (!filters.source || row.source === filters.source) && (!filters.serviceType || row.order.serviceType === filters.serviceType) &&
        (!filters.cleaner || row.team.some(person => person.id === filters.cleaner)) && (!filters.debt || row.metrics.debtCents > 0))
        .sort((a, b) => String(b.order.selectedDate).localeCompare(String(a.order.selectedDate)) || a.order.id.localeCompare(b.order.id));
      if (url.searchParams.get("format") === "csv") {
        const contents = [labels, ...rows.map(rowValues)]
          .map(row => row.map(csvCell).join(",")).join("\r\n");
        writeHeadWithTiming(res, 200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="profitability.csv"', "Cache-Control": "no-store" }, start, false);
        res.end(`\uFEFF${contents}`); return true;
      }
      const html = renderProfitabilityPage({ rows, allRows, summary: buildSummary(rows), view, settings, settingsVersion: settingsRecord.version, filters,
        access: { ...access, canAccessProfitability: true, limitedEditor, roleLabel: limitedEditor ? "Наблюдатель" : "Админ" }, shared, escapeHtml, importPreview });
      writeHtmlWithTiming(res, 200, html, start, false);
    } catch (error) { json(error.status || 503, { ok: false, message: error.status ? error.message : "Не удалось загрузить доходность. Проверьте хранилище." }); }
    return true;
  };
}

module.exports = { createProfitabilityHandler, parseSourceImport, csvCell };
