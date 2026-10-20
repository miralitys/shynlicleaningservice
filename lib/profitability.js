"use strict";

const crypto = require("node:crypto");
const SOURCES = Object.freeze({ thumbtack: "Thumbtack", google_lsa: "Google LSA", google: "Google (сайт/поиск)",
  nextdoor: "Nextdoor", website: "Сайт напрямую", referral: "Рекомендация", repeat: "Повторный клиент", other: "Другое" });
const FINANCE_FIELDS = new Set(["source", "paidCents", "payouts", "leadCostCents", "discountCents", "addonsCents",
  "basePriceCents", "tipsCents", "paidAt", "paymentMethod", "actualMinutes", "comment", "tipsPassed"]);
const ASSISTANT_FIELDS = new Set(["source", "paidCents", "paidAt", "paymentMethod", "payouts"]);
const MONEY_FIELDS = new Set(["paidCents", "leadCostCents", "discountCents", "addonsCents", "basePriceCents", "tipsCents"]);
const COMPLETED = new Set(["cleaning-complete", "invoice-sent", "paid", "awaiting-review", "completed"]);
const enabled = (env = process.env) => env.PROFITABILITY_ENABLED === "1";

function canAccessProfitability(access = {}, env = process.env) {
  if (!enabled(env) || !access.authorized || access.role !== "admin") return false;
  if (access.source === "admin-session" && !access.user) return true;
  const ids = String(env.PROFITABILITY_ALLOWED_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
  return Boolean(access.user?.id && access.user.status !== "inactive" && ids.includes(access.user.id));
}

function validAssistantKey(authorization, env = process.env) {
  if (!enabled(env) || !/^[a-f0-9]{64}$/i.test(env.PROFITABILITY_ASSISTANT_KEY_SHA256 || "")) return false;
  const token = String(authorization || "").match(/^Bearer (\S{32,512})$/)?.[1];
  if (!token) return false;
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(token).digest(), Buffer.from(env.PROFITABILITY_ASSISTANT_KEY_SHA256, "hex"));
}

function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
function cents(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) invalid("Укажите сумму от 0 с точностью до цента.");
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function normalizePatch(patch, teamIds, assistant = false) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) invalid("Некорректные поля.");
  const allowed = assistant ? ASSISTANT_FIELDS : FINANCE_FIELDS;
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) invalid("Поле недоступно для изменения.");
    if (MONEY_FIELDS.has(key)) {
      if (value === null && ["paidCents", "basePriceCents"].includes(key)) result[key] = null;
      else if (!Number.isSafeInteger(value) || value < 0 || value > 999999999) invalid("Некорректная сумма в центах.");
      else result[key] = value;
    } else if (key === "source") {
      if (value !== "" && !Object.hasOwn(SOURCES, value)) invalid("Выберите источник.");
      result.source = value;
    } else if (key === "payouts") {
      if (!Array.isArray(value) || value.length > 30) invalid("Некорректные выплаты.");
      const seen = new Set();
      result.payouts = value.map(item => {
        if (!item || !teamIds.includes(item.staffId) || seen.has(item.staffId) ||
          (item.cents !== null && (!Number.isSafeInteger(item.cents) || item.cents < 0 || item.cents > 999999999))) invalid("Проверьте команду и выплаты.");
        seen.add(item.staffId);
        return { staffId: item.staffId, cents: item.cents };
      });
    } else if (key === "paidAt") {
      const date = new Date(`${value}T12:00:00Z`);
      if (value !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)) invalid("Некорректная дата оплаты.");
      result[key] = value;
    } else if (key === "paymentMethod") {
      if (!["", "zelle", "cash", "invoice", "check"].includes(value)) invalid("Некорректный способ оплаты.");
      result[key] = value;
    } else if (key === "actualMinutes") {
      if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 10080)) invalid("Некорректная длительность.");
      result[key] = value;
    } else if (key === "tipsPassed") {
      if (typeof value !== "boolean") invalid("Некорректная отметка чаевых.");
      result[key] = value;
    } else if (key === "comment") {
      if (typeof value !== "string" || value.length > 4000) invalid("Комментарий слишком длинный.");
      result[key] = value;
    }
  }
  if (!Object.keys(result).length) invalid("Нет изменений.");
  return result;
}

function calculateProfitability(order, finance = {}, team = [], settings = {}) {
  const total = Math.round(Number(order.totalPrice || 0) * 100);
  const payable = (finance.basePriceCents ?? total) + (finance.addonsCents || 0) - (finance.discountCents || 0);
  const paid = finance.paidCents ?? 0;
  const payouts = Array.isArray(finance.payouts) ? finance.payouts : [];
  // Historical payouts remain expenses if a cleaner is later removed from the team.
  const payoutTotal = payouts.reduce((sum, item) => sum + (item.cents || 0), 0);
  const payoutsComplete = team.length > 0 && team.every(person => payouts.some(item => item.staffId === person.id && item.cents !== null));
  const supplies = settings.suppliesCents || 0;
  const fuel = settings.fuelCents || 0;
  const method = finance.paymentMethod ?? order.paymentMethod;
  const cardFee = method === "invoice" ? Math.round(paid * (settings.cardFeeBasisPoints || 0) / 10000) : 0;
  const expenses = (finance.leadCostCents || 0) + payoutTotal + supplies + fuel + cardFee;
  const canceled = order.orderStatus === "canceled";
  const profit = canceled ? 0 : paid - expenses;
  const minutes = finance.actualMinutes ?? order.serviceDurationMinutes;
  return { basePriceCents: finance.basePriceCents ?? total, addonsCents: finance.addonsCents || 0,
    discountCents: finance.discountCents || 0, leadCostCents: finance.leadCostCents || 0, tipsCents: finance.tipsCents || 0,
    payableCents: payable, paidCents: paid, payoutTotalCents: payoutTotal, suppliesCents: supplies, fuelCents: fuel,
    cardFeeCents: cardFee, expensesCents: expenses, profitCents: profit,
    marginPercent: !canceled && paid > 0 ? profit * 100 / paid : null,
    profitPerHourCents: !canceled && minutes > 0 ? Math.round(profit * 60 / minutes) : null,
    debtCents: !canceled && COMPLETED.has(order.orderStatus) ? payable - paid : 0,
    creditCents: Math.max(0, paid - payable), actualMinutes: minutes || 0,
    complete: finance.paidCents != null && payoutsComplete && settings.configured === true, canceled };
}

function defaultSource(entry) { return entry?.payloadForRetry?.calculatorData?.acquisitionSource || ""; }
function sourceFromAttribution(attribution = {}) {
  const source = String(attribution.utm_source || "").trim().toLowerCase();
  if (["google_lsa", "google-lsa", "lsa"].includes(source)) return "google_lsa";
  if (source === "google" || attribution.gclid) return "google";
  if (source === "thumbtack" || source === "nextdoor") return source;
  return source ? "other" : "website";
}
async function inheritedSource(customer, ledger, financeStore = null) {
  const entries = await ledger.listOrderListEntries();
  const { isOrderCreatedEntry } = require("./admin/domain").createAdminDomainHelpers({ normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max) });
  const phone = value => String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const email = value => String(value || "").trim().toLowerCase();
  const matches = entries.filter(entry => entry.id !== customer.id && isOrderCreatedEntry(entry) &&
    ((customer.contactId && entry.contactId === customer.contactId) ||
      (phone(customer.customerPhone) && phone(entry.customerPhone) === phone(customer.customerPhone)) ||
      (email(customer.customerEmail) && email(entry.customerEmail) === email(customer.customerEmail))))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  if (!matches.length) return "";
  return (financeStore ? (await financeStore.get(matches[0].id)).data.source : "") || defaultSource(matches[0]);
}

module.exports = { SOURCES, enabled, canAccessProfitability, validAssistantKey, cents, normalizePatch,
  calculateProfitability, defaultSource, inheritedSource, sourceFromAttribution };
