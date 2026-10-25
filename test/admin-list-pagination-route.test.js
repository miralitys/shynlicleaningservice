"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { startServer, stopServer } = require("./server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { createUserSessionToken } = require("../lib/account-auth");
const { createListFixture } = require("./support/admin-list-fixture.cjs");
const { mapRowToEntry } = require("../lib/supabase-quote-ops");
const { filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");

const normalizeString = (value, length = 500) => String(value ?? "").trim().slice(0, length);
const domain = createAdminDomainHelpers({ normalizeString });
const get = (node, key) => node?.attrs?.find(attr => attr.name === key)?.value;
function findAll(node, predicate) {
  return (predicate(node) ? [node] : []).concat(...(node.childNodes || []).map(child => findAll(child, predicate)));
}
const find = (node, key, value) => findAll(node, n => get(n, key) !== undefined && (value === undefined || get(n, key) === value))[0];
const text = node => findAll(node, n => n.nodeName === "#text").map(n => n.value.trim()).filter(Boolean).join(" ");

test("orders and clients keep every logical row beyond 1000, all-address history, filters and permissions", { timeout: 120000 }, async () => {
  const { parse } = await import("parse5");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-list-pagination-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-list-pagination", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    ACCOUNT_SECTION_CAPTURE: path.join(root, "reads.ndjson"),
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "support/admin-list-fixture.cjs") };
  await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, "{}");
  const fixture = createListFixture();
  const visible = filterQuoteOpsEntries(fixture.rows.map(mapRowToEntry), {}, normalizeString);
  const expectedOrders = domain.collectAdminOrderRecords(visible);
  const expectedClients = domain.collectAdminClientRecords(visible);
  assert.ok(expectedClients.length > 1000);
  const app = await startServer({ env });
  try {
    const owner = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const read = async (route, cookie = owner, status = 200) => {
      const response = await fetch(app.baseUrl + route, { headers: { cookie }, redirect: "manual" });
      assert.equal(response.status, status, route);
      if (status === 200) assert.match(response.headers.get("cache-control"), /no-store/);
      return response.text();
    };
    const initialOrders = parse(await read("/admin/orders"));
    const initialClients = parse(await read("/admin/clients"));
    for (const [doc, id] of [[initialOrders, "orders-table"], [initialClients, "clients"]]) {
      const list = find(doc, "data-admin-list-id", id);
      assert.match(get(list, "style"), /min-width:0/);
      assert.match(get(find(list, "data-admin-list-pager"), "style"), /flex-wrap:wrap/);
      assert.ok(find(list, "data-admin-list-reload").attrs.some(attr => attr.name === "hidden"));
    }
    async function walk(initial, id) {
      let list = find(initial, "data-admin-list-id", id);
      const all = [];
      const total = Number(get(list, "data-admin-list-total"));
      let pages = 0;
      while (list) {
        const chunk = find(list, "data-admin-list-rows");
        const rows = (chunk.childNodes || []).filter(n => get(n, "data-admin-list-key"));
        assert.ok(rows.length <= 50);
        all.push(...rows);
        const next = find(list, "data-admin-list-next");
        if (!next) break;
        const url = new URL(get(next, "href"), app.baseUrl);
        url.searchParams.set("fragment", "list");
        list = find(parse(await read(url.pathname + url.search)), "data-admin-list-response", id);
        assert.ok(list);
        assert.equal(get(list, "data-admin-list-error"), undefined);
        assert.equal(Number(get(list, "data-admin-list-total")), total);
        assert.equal(Number(get(list, "data-admin-list-start")), all.length);
        if (++pages > 30) assert.fail("Cursor did not terminate");
      }
      assert.equal(all.length, total);
      assert.equal(new Set(all.map(n => get(n, "data-admin-list-key"))).size, total);
      return all;
    }
    const orderRows = await walk(initialOrders, "orders-table");
    assert.deepEqual(orderRows.map(n => get(n, "data-admin-list-key")).sort(), expectedOrders.map(o => o.id).sort());
    const byOrder = new Map(expectedOrders.map(order => [order.id, order]));
    for (const row of orderRows) {
      const order = byOrder.get(get(row, "data-admin-list-key"));
      assert.ok(text(row).includes(domain.formatCurrencyAmount(order.totalPrice)), order.id);
      assert.ok(text(row).includes(order.fullAddress), order.id);
      assert.ok(text(row).includes("Cleaner A") && text(row).includes("Cleaner B"), order.id);
    }
    const clientRows = await walk(initialClients, "clients");
    assert.deepEqual(clientRows.map(n => get(n, "data-admin-list-key")).sort(), expectedClients.map(c => c.key).sort());
    const byClient = new Map(expectedClients.map(client => [client.key, client]));
    for (const row of clientRows) {
      const client = byClient.get(get(row, "data-admin-list-key"));
      assert.ok(text(row).includes(domain.formatCurrencyAmount(client.pastVisitRevenue)), client.key);
    }
    const laneIds = findAll(initialOrders, n => Boolean(get(n, "data-order-funnel-lane"))).map(n => get(n, "data-admin-list-id"));
    const cards = [];
    for (const id of laneIds) cards.push(...await walk(initialOrders, id));
    assert.deepEqual(cards.map(n => get(n, "data-admin-list-key")).sort(), expectedOrders.map(o => o.id).sort());
    assert.equal(new Set(cards.map(n => get(n, "data-admin-list-key"))).size, expectedOrders.length);

    const search = parse(await read("/admin/orders?q=manual-1106"));
    assert.equal(get(find(search, "data-admin-list-id", "orders-table"), "data-admin-list-total"), "1");
    assert.ok(find(search, "data-admin-list-key", "order-01106"));
    const clientSearch = parse(await read("/admin/clients?q=1107%20Test%20Street"));
    const matchingClients = domain.filterAdminClientRecords(expectedClients, { q: "1107 Test Street" });
    assert.equal(Number(get(find(clientSearch, "data-admin-list-id", "clients"), "data-admin-list-total")), matchingClients.length);
    const merged = expectedClients.find(c => c.phone === "6300000000");
    assert.ok(merged.addresses.length >= 3);
    const fullClient = await read(`/admin/clients?client=${merged.key}`);
    for (const address of ["1 Test Street", "601 Test Street", "1107 Test Street"]) assert.ok(fullClient.includes(address), address);
    const fullOrder = await read("/admin/orders?fragment=order-dialog&order=order-01106");
    assert.match(fullOrder, /1107 Test Street/);
    assert.match(fullOrder, /admin-order-dialog-/);
    assert.match(fullOrder, /Visit note 1106/);

    const next = get(find(find(initialOrders, "data-admin-list-id", "orders-table"), "data-admin-list-next"), "href");
    const nextUrl = new URL(next, app.baseUrl);
    nextUrl.searchParams.set("fragment", "list");
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, '{"adminOrderViewError":true}');
    const failed = await fetch(app.baseUrl + nextUrl.pathname + nextUrl.search, { headers: { cookie: owner }, redirect: "manual" });
    assert.ok(failed.status >= 500, "A failed read cannot masquerade as the end of the list");
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, "{}");
    const retried = parse(await read(nextUrl.pathname + nextUrl.search));
    assert.equal(get(find(retried, "data-admin-list-response"), "data-admin-list-start"), "50");
    const changedFilter = new URL(nextUrl);
    changedFilter.searchParams.set("q", "manual-1106");
    const conflict = parse(await read(changedFilter.pathname + changedFilter.search));
    assert.ok(find(conflict, "data-admin-list-error"));
    assert.equal(findAll(conflict, n => get(n, "data-admin-list-key") !== undefined).length, 0);

    for (const [userId, allowed, canEdit] of [["manager", true, true], ["eva", true, false], ["user-a", false, false]]) {
      const cookie = "shynli_user_session=" + createUserSessionToken({ masterSecret: env.ADMIN_MASTER_SECRET }, { userId });
      for (const route of [nextUrl.pathname + nextUrl.search, "/admin/clients?fragment=list&list=clients"]) {
        const response = await fetch(app.baseUrl + route, { headers: { cookie }, redirect: "manual" });
        assert.equal(response.status === 200, allowed, userId);
        const html = await response.text();
        if (allowed) {
          assert.match(html, /data-admin-list-response/);
          if (!canEdit) assert.doesNotMatch(html, /draggable="true"|name="totalPrice"|name="orderStatus"/);
        } else assert.doesNotMatch(html, /data-admin-list-key/);
      }
    }
    const anonymous = await fetch(app.baseUrl + nextUrl.pathname + nextUrl.search, { redirect: "manual" });
    assert.notEqual(anonymous.status, 200);
    const reads = (await fs.readFile(env.ACCOUNT_SECTION_CAPTURE, "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(reads.every(row => row.method === "GET"), "List, card and history reads cannot write data");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
