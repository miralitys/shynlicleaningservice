"use strict";
const { entryAttribution, attributionHelpers } = require("../../lead-attribution");

function renderLeadAttribution(entry, escapeHtml) {
  const attr = entryAttribution(entry);
  if (!attr) return "";
  const first = attr.first || attr;
  const last = attr.last || first;
  const context = touch => touch.referrer || touch.utm_source ||
    ["gclid", "gbraid", "wbraid", "fbclid"].filter(key => touch[key]).map(key => `${key}: ${touch[key]}`).join(", ") || "Прямой заход";
  const rows = [
    ["Первый источник", attributionHelpers.channel(first)],
    ["Первый переход", context(first)],
    ["Последний источник", attributionHelpers.channel(last)],
    ["Последний переход", context(last)],
    ["Страница входа", first.landing_page],
    ["Страница отправки", attr.submission_page],
    ["Тип формы", attr.form_type],
    ...attributionHelpers.keys.filter(key => first[key]).map(key => [key, first[key]]),
  ];
  return `<section class="admin-client-summary-panel" data-lead-attribution="true"><div class="admin-subsection-head"><h3 class="admin-subsection-title">Источник</h3></div><dl class="admin-order-quote-fields">${rows.filter(([,value]) => value).map(([label,value]) => `<div style="min-width:0"><dt class="admin-order-quote-field-label">${escapeHtml(label)}</dt><dd class="admin-order-quote-field-value" style="margin:4px 0 0;overflow-wrap:anywhere">${escapeHtml(String(value))}</dd></div>`).join("")}</dl></section>`;
}
module.exports = { renderLeadAttribution };
