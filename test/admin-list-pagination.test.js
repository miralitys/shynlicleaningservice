"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { paginateAdminList, listReturnUrl, renderAdminListPager } = require("../lib/admin/list-pagination");

const origin = "https://example.test";
const options = { id: "orders-table", filters: { status: "all", q: "" }, key: row => row.id };
const rows = Array.from({ length: 1107 }, (_, i) => ({ id: `id-${i}`, date: "2026-10-25", price: 534, team: ["a", "b"], payout: 500 }));
const read = (data, href, extra = {}) => paginateAdminList(data, { ...options, url: new URL(href, origin), ...extra });

test("logical cursor traverses 1107 equal-date rows in their existing order, without mutations or duplicates", () => {
  const before = JSON.stringify(rows);
  const ids = [];
  let href = "/admin/orders?status=all";
  let pages = 0;
  do {
    const page = read(rows, href);
    assert.equal(page.error, false);
    assert.equal(page.total, 1107);
    assert.equal(page.start, ids.length);
    assert.ok(page.rows.length <= 50);
    ids.push(...page.rows.map(options.key));
    href = page.next;
    assert.equal(page.complete, !href);
    pages++;
  } while (href && pages < 30);
  assert.equal(pages, 23);
  assert.deepEqual(ids, rows.map(options.key));
  assert.equal(JSON.stringify(rows), before);
});

test("insertions, removals, merges, sorting and filter changes explicitly reject an old cursor", () => {
  const cursor = read(rows, "/admin/orders").next;
  for (const changed of [rows.slice(1), [{ id: "new" }, ...rows], [...rows].reverse(), rows.filter(row => row.id !== "id-50")]) {
    const page = read(changed, cursor);
    assert.equal(page.error, true);
    assert.equal(page.complete, false);
    assert.equal(page.next, "");
    assert.deepEqual(page.rows, []);
  }
  assert.equal(read(rows, cursor, { filters: { status: "new" } }).error, true);
  assert.equal(read(rows, cursor.replace("orders-table", "orders-scheduled"), { id: "orders-scheduled" }).error, true);
  assert.match(renderAdminListPager(read(rows.slice(1), cursor)), /Обновить список/);
});

test("a fresh request or next page reads current prices and payouts, not cached business data", () => {
  const cursor = read(rows, "/admin/orders").next;
  const changed = rows.map(row => ({ ...row, price: 600, payout: 550 }));
  assert.equal(read(changed, cursor).rows[0].price, 600);
  assert.equal(read(changed, "/admin/orders").rows[0].payout, 550);
});

test("malformed cursors fail closed and list URLs do not retain detail/fragment state", () => {
  for (const after of ["", "bad", "x".repeat(2049), Buffer.from('{}').toString("base64url")]) {
    const page = read(rows, "/admin/orders?list=orders-table&after=" + after);
    assert.equal(page.error, true);
    assert.equal(page.complete, false);
  }
  const url = new URL("/admin/orders?status=all&order=old&fragment=list&list=orders-table&after=x", origin);
  assert.equal(listReturnUrl(url), "/admin/orders?status=all&order=old");
  const next = read(rows, "/admin/orders?status=all&order=old&createOrder=1").next;
  assert.ok(!new URL(next, origin).searchParams.has("order"));
  assert.equal(read([], "/admin/orders").complete, true);
  assert.equal(read(rows.slice(0, 50), "/admin/orders").complete, true);
  assert.throws(() => read([rows[0], rows[0]], "/admin/orders"), /unique logical IDs/);
});
