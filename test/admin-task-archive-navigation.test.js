"use strict";

const { test, assert, fs, createFetchStub, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { renderAdminAppSidebar } = require("../lib/admin/render-shared-app-sidebar");
const { getLegacyQuoteHistory } = require("../lib/admin/pages/quote-ops-archive");

function sidebar(role, section = "tasks") {
  return renderAdminAppSidebar({
    activePath: "/admin/quote-ops", options: { role, quoteOpsSection: section, newQuoteCount: 99, newLeadTaskCount: 3 },
    ADMIN_APP_NAV_ITEMS: [
      { path: "/admin", label: "Дашборд" }, { path: "/admin/quote-ops", label: "Заявки" },
      { path: "/admin/orders", label: "Заказы" }, { path: "/admin/clients", label: "Клиенты" },
      { path: "/admin/staff", label: "Сотрудники" }, { path: "/admin/settings", label: "Настройки" },
    ],
    ADMIN_LOGOUT_PATH: "/admin/logout", escapeHtml: value => String(value),
    renderAdminBadge: label => label, renderAdminSidebarBrand: () => "SHYNLI",
  });
}

for (const role of ["admin", "manager", "viewer"]) {
  test(`${role} has a standalone Tasks item and archive outside the main navigation`, () => {
    const html = sidebar(role);
    const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)[0];
    assert.match(nav, /class="admin-nav-link admin-nav-link-active" href="\/admin\/quote-ops\?section=tasks"/);
    assert.match(nav, /<span>Таски<\/span>/);
    assert.match(nav, /data-admin-nav-new-task-count="3"/);
    assert.doesNotMatch(nav, /href="\/admin\/quote-ops"|section=funnel|Архив|>Заявки<|>Статус</);
    assert.doesNotMatch(html, /data-admin-nav-new-quote-count/);
    assert.match(html, /href="\/admin\/quote-ops\?section=archive" data-admin-archive-link="true">Архив заявок/);
    if (role === "viewer") assert.doesNotMatch(nav, /href="\/admin\/(settings|staff)"/);
    assert.ok(html.indexOf("data-admin-archive-link") > html.indexOf("</nav>"));
  });
}

test("the archive preserves legacy requests, excludes modern orders and descendants, and never mutates the ledger", () => {
  const row = (id, order = {}, extra = {}) => ({ id, requestId: id, customerPhone: "6305550100", ...extra,
    payloadForRetry: { orderState: order } });
  const rows = [row("legacy-lead"), row("old-order", { status: "completed" }),
    row("new-grandchild", { recurringSourceEntryId: "new-child" }),
    row("new-child", { recurringSourceEntryId: "new-root" }),
    row("new-series-sibling", { recurringSeriesId: "new-root" }),
    row("new-root", { managerConfirmationRequired: true, managerConfirmedAt: "2026-10-20T21:00:00Z" }),
    row("old-series-child", { recurringSourceEntryId: "old-order" }),
  ];
  const before = structuredClone(rows);
  assert.deepEqual(getLegacyQuoteHistory(rows).map(entry => entry.id), ["legacy-lead", "old-order", "old-series-child"]);
  assert.deepEqual(rows, before);
});

test("archive GETs preserve history and filters while standalone Tasks still includes modern orders, without database writes", async () => {
  const row = (id, name, order = {}) => ({
    id, kind: "quote_submission", status: "success", request_id: id, customer_name: name, customer_phone: "6305550100",
    created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", service_type: "regular", total_price: 250,
    payload_for_retry: { orderState: order, adminLead: { status: "new", managerName: "Ramina", tasks: [{
      id: `task-${id}`, kind: "contact-client", status: "open", title: `Task ${name}`, dueAt: "2099-11-01T15:00:00Z",
    }] } },
  });
  const rows = [row("historic", "Historic Client"), row("modern", "Modern Client", { managerConfirmationRequired: true, status: "new" })];
  const stub = createFetchStub([
    { method: "GET", match: "/rest/v1/quote_ops_entries", body: rows },
    { method: "GET", match: "/rest/v1/", body: [] },
  ]);
  const env = { ADMIN_MASTER_SECRET: "task_archive_navigation_test", SUPABASE_URL: "https://archive-test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake_archive_test", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const started = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const get = async query => {
      const response = await fetch(`${started.baseUrl}/admin/quote-ops${query}`, { headers: { cookie } });
      assert.equal(response.status, 200);
      return response.text();
    };
    const archive = await get("?section=archive");
    assert.match(archive, /<title>Архив заявок/);
    assert.match(archive, /data-quote-entry-id="historic"/);
    assert.doesNotMatch(archive, /data-quote-entry-id="modern"/);
    assert.match(archive, /name="section" value="archive"/);
    const filtered = await get("?section=archive&q=historic");
    assert.match(filtered, /data-quote-entry-id="historic"/);
    assert.match(filtered, /href="\/admin\/quote-ops\?section=archive"/);
    const tasks = await get("?section=tasks");
    assert.match(tasks, /<title>Таски/);
    assert.match(tasks, /Task Historic Client/);
    assert.match(tasks, /Task Modern Client/);
    const compatible = await get("");
    assert.match(compatible, /data-quote-entry-id="historic"/);
    const calls = (await fs.readFile(stub.captureFile, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.equal(calls.filter(call => call.method !== "GET" && /quote_ops_entries/.test(call.url)).length, 0);
  } finally {
    await stopServer(started.child);
    stub.cleanup();
  }
});
