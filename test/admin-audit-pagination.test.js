"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { renderAuditPage } = require("../lib/admin/pages/audit-page");
const { AUDIT_PAGINATION_SCRIPT } = require("../lib/admin/pages/audit-pagination-script");

const events = Array.from({ length: 105 }, (_, i) => ({
  id: `event-${104 - i}`, occurred_at: new Date(Date.UTC(2026, 9, 19, 12, 0, 104 - i)).toISOString(),
  action: "update", status: "succeeded", entity_type: "order", entity_label: "Test client",
  entity_id: "test-order", actor: { name: "Test Manager" },
  changes: [{ field: "totalPrice", old: 250, new: 534 }],
}));
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const store = { list: async filters => events.slice(filters.offset, filters.offset + filters.limit) };
const shared = {
  renderAdminAppSidebar: () => "",
  renderAdminLayout: (title, content, options) => `<html><title>${title}</title>${content}${options.bodyScripts}</html>`,
};
const render = query => renderAuditPage(store, new URL(`https://example.com/admin/audit${query}`), shared, escape, { role: "admin" });
const ids = html => [...html.matchAll(/data-audit-event-id="([^"]+)"/g)].map(match => match[1]);

test("audit pages progressively load 50 records, keep filters, and retain GET links without JavaScript", async () => {
  const html = await render("?action=update&q=Test&from=2026-10-19");
  assert.equal(ids(html).length, 50);
  assert.equal(ids(html)[0], "event-104");
  assert.match(html, /data-audit-load-more href="\/admin\/audit\?action=update&amp;q=Test&amp;from=2026-10-19&amp;offset=50"/);
  assert.match(html, /data-audit-load-status/);
  assert.ok(html.includes(AUDIT_PAGINATION_SCRIPT));

  const middle = await render("?action=update&q=Test&offset=50&fragment=entries");
  assert.equal(ids(middle).length, 50);
  assert.equal(ids(middle)[0], "event-54");
  assert.doesNotMatch(middle, /<html|<script|fragment=/);
  assert.match(middle, /data-audit-load-more href="\/admin\/audit\?action=update&amp;q=Test&amp;offset=100"/);

  const last = await render("?offset=100&fragment=entries");
  assert.equal(ids(last).length, 5);
  assert.doesNotMatch(last, /data-audit-load-more/);
  assert.equal(new Set([...ids(html), ...ids(middle), ...ids(last)]).size, 105);
  assert.match(await render("?offset=105&fragment=entries"), /Записей пока нет/);
});

test("each audit event keeps its full-width details in the same appendable table group", async () => {
  const html = await render("");
  assert.match(html, /<table class="audit-table" data-audit-entries>/);
  assert.match(html, /<tbody data-audit-event-id="event-104"><tr>/);
  assert.match(html, /<summary aria-controls="audit-details-event-104">/);
  assert.match(html, /<tr class="audit-details-row" id="audit-details-event-104"><td colspan="5">/);
  assert.match(html, /\.audit-table>tbody:has\(>tr>td>details\[open\]\)>\.audit-details-row\{display:table-row\}/);
  assert.equal((html.match(/class="audit-details-row"/g) || []).length, 50);
  assert.doesNotMatch(html, /<summary[^>]*>[^<]*<\/summary><div/);
  const fragment = await render("?offset=50&fragment=entries");
  assert.equal((fragment.match(/class="audit-details-row"/g) || []).length, ids(fragment).length);
  assert.match(fragment, /<tbody data-audit-event-id="event-54"><tr>/);
});

test("audit load-more keeps existing rows, prevents double requests, and permits retry after a failure", async () => {
  const row = id => ({ dataset: { auditEventId: id } });
  const rows = [row("first")];
  const link = { href: "https://example.com/admin/audit?offset=50", textContent: "Далее", hidden: false,
    setAttribute() {}, removeAttribute() {} };
  const message = { textContent: "" };
  let click;
  let calls = 0;
  let resolve;
  let nextLink = { href: "/admin/audit?offset=100" };
  let nextRows = [row("first"), row("second")];
  const entries = { querySelectorAll: () => rows, append: (...added) => rows.push(...added) };
  const pagination = { addEventListener: (event, handler) => { click = handler; }, setAttribute() {}, removeAttribute() {} };
  const scrolls = [];
  const context = {
    document: { querySelector: selector => ({ "[data-audit-entries]": entries, "[data-audit-pagination]": pagination,
      "[data-audit-load-status]": message })[selector] },
    window: { location: { href: "https://example.com/admin/audit" }, scrollX: 0, scrollY: 600,
      scrollTo: (...position) => scrolls.push(position) },
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async url => { calls += 1; assert.equal(url.searchParams.get("fragment"), "entries");
      return new Promise(done => { resolve = done; }); },
    DOMParser: class { parseFromString() { return { querySelector: selector => selector === "[data-audit-entries]"
      ? { querySelectorAll: () => nextRows } : { querySelector: () => nextLink } }; } },
  };
  new vm.Script(AUDIT_PAGINATION_SCRIPT.replace(/^<script>|<\/script>$/g, "")).runInNewContext(context);
  const event = { target: { closest: () => link }, button: 0, preventDefault() {} };
  const response = { ok: true, redirected: false, text: async () => "fragment" };
  const firstRow = rows[0];
  const pending = click(event);
  assert.equal(link.textContent, "Загрузка…");
  await click(event);
  assert.equal(calls, 1);
  resolve(response);
  await pending;
  assert.equal(rows[0], firstRow);
  assert.deepEqual(rows.map(item => item.dataset.auditEventId), ["first", "second"]);
  assert.equal(link.href, "/admin/audit?offset=100");
  assert.deepEqual(scrolls, [[0, 600]]);

  const failed = click(event);
  resolve({ ok: false });
  await failed;
  assert.equal(rows.length, 2);
  assert.equal(link.hidden, false);
  assert.equal(link.textContent, "Далее");
  assert.match(message.textContent, /Не удалось/);
  const retry = click(event);
  nextRows = [row("third")];
  nextLink = null;
  resolve(response);
  await retry;
  assert.equal(rows.length, 3);
  assert.equal(link.hidden, true);
  assert.match(message.textContent, /Все записи загружены/);
});
