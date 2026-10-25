"use strict";

const { createHash } = require("node:crypto");

const ADMIN_LIST_PAGE_SIZE = 50;
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("base64url");
const attr = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function listReturnUrl(url) {
  const clean = new URL(url);
  for (const key of ["fragment", "list", "after"]) clean.searchParams.delete(key);
  return clean.pathname + clean.search;
}

// Page only after grouping/filtering/sorting. The fingerprint rejects changed ordering
// rather than silently skipping records when another user edits the list between reads.
function paginateAdminList(rows, { id, filters, url, key }) {
  const ids = rows.map(key);
  if (ids.some(value => typeof value !== "string" || !value) || new Set(ids).size !== ids.length) {
    throw new Error("Admin list requires unique logical IDs");
  }
  const fingerprint = digest([id, filters, ids]);
  const requested = url.searchParams.get("list") === id;
  const after = requested ? url.searchParams.get("after") : "";
  let start = 0;
  let error = false;
  if (after) {
    try {
      if (after.length > 2048) throw new Error("Invalid cursor");
      const cursor = JSON.parse(Buffer.from(after, "base64url").toString("utf8"));
      if (cursor.v !== 1 || cursor.f !== fingerprint || typeof cursor.last !== "string") throw new Error("Stale cursor");
      start = ids.indexOf(cursor.last) + 1;
      if (!start) throw new Error("Missing anchor");
    } catch { error = true; }
  } else if (requested && url.searchParams.has("after")) {
    error = true;
  }
  const page = error ? [] : rows.slice(start, start + ADMIN_LIST_PAGE_SIZE);
  const complete = !error && start + page.length === rows.length;
  let next = "";
  if (!error && !complete) {
    const nextUrl = new URL(listReturnUrl(url), url);
    nextUrl.searchParams.delete("order");
    nextUrl.searchParams.delete("client");
    nextUrl.searchParams.delete("addressKey");
    nextUrl.searchParams.set("list", id);
    nextUrl.searchParams.set("after", Buffer.from(JSON.stringify({ v: 1, f: fingerprint, last: key(page.at(-1)) })).toString("base64url"));
    next = nextUrl.pathname + nextUrl.search;
  }
  return { id, rows: page, total: rows.length, start, complete, error, next, reload: listReturnUrl(url) };
}

function renderAdminListPager(page) {
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;min-width:0" data-admin-list-pager="true">
    ${page.next ? `<a class="admin-link-button admin-button-secondary" data-admin-list-next="true" href="${attr(page.next)}">Показать ещё</a>` : ""}
    <span class="admin-action-hint" role="status" data-admin-list-message="true">${page.error
      ? "Список изменился. Обновите его, чтобы не пропустить записи." : ""}</span>
    <span data-admin-list-reload="true"${page.error ? "" : " hidden"}><a class="admin-link-button admin-button-secondary" href="${attr(page.reload)}">Обновить список</a></span>
  </div>`;
}

function renderAdminListFragment(page, html, { table = false } = {}) {
  const rows = `<${table ? "tbody" : "div"} data-admin-list-rows="true">${html}</${table ? "tbody" : "div"}>`;
  return `<section data-admin-list-response="${attr(page.id)}" data-admin-list-total="${page.total}" data-admin-list-start="${page.start}" data-admin-list-complete="${page.complete}"${page.error ? ' data-admin-list-error="true"' : ""}>
    ${table ? `<table>${rows}</table>` : rows}${renderAdminListPager(page)}</section>`;
}

module.exports = { ADMIN_LIST_PAGE_SIZE, listReturnUrl, paginateAdminList, renderAdminListPager, renderAdminListFragment };
