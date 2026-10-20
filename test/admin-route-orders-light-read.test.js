"use strict";

const { test, assert, fs, createFetchStub, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");

test("the application starts with independent series maintenance enabled, without an Orders page request", async () => {
  const stub = createFetchStub([{ method: "GET", match: "/rest/v1/", body: [] }]);
  const started = await startServer({ env: { ADMIN_MASTER_SECRET: "worker_startup_test", RECURRING_ORDER_MAINTENANCE_ENABLED: "1",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "9999999", SUPABASE_URL: "https://worker-test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry } });
  try { assert.equal(started.child.exitCode, null); }
  finally { await stopServer(started.child); stub.cleanup(); }
});

test("orders GET reads all pages without maintaining series or writes, and detail links load complete records", async () => {
  const rows = Array.from({ length: 1003 }, (_, i) => {
    const state = { isCreated: true, status: "scheduled", assignedStaff: `Cleaner ${i % 2}`, frequency: "weekly",
      paymentStatus: "unpaid", serviceDurationMinutes: 180, managerConfirmedAt: "2026-10-01T12:00:00Z",
      completion: { cleanerComment: "FULL_DETAIL_ONLY" } };
    return { id: `entry-${String(i).padStart(5, "0")}`, kind: "quote_submission", status: "success",
      request_id: `manual-client-${i}`, customer_name: `Test Client ${i}`, customer_phone: `630555${String(i).padStart(4, "0")}`,
      service_type: "standard", selected_date: "2099-12-01", selected_time: "10:00", total_price: 250 + i,
      created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
      payload_for_retry: { orderState: state, adminOrder: state, calculatorData: { bedrooms: 3, bathrooms: 2, squareFootage: "2000" } } };
  });
  const before = structuredClone(rows);
  const stub = createFetchStub([
    { method: "GET", match: "id=eq.entry-00002", body: [] },
    { method: "GET", match: "id=eq.entry-00001", body: [rows[1]] },
    { method: "GET", match: "id=gt.entry-00999", body: rows.slice(1000), headers: { "content-range": "0-2/3" } },
    { method: "GET", match: "id=gt.entry-00499", body: rows.slice(500, 1000), headers: { "content-range": "0-499/503" } },
    { method: "GET", match: "/rest/v1/quote_ops_entries", body: rows.slice(0, 500), headers: { "content-range": "0-499/1003" } },
    { method: "GET", match: "/rest/v1/", body: [] },
  ]);
  const env = { ADMIN_MASTER_SECRET: "orders_light_test", SUPABASE_URL: "https://orders-test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const started = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const get = async query => {
      const response = await fetch(`${started.baseUrl}/admin/orders${query}`, { headers: { cookie } });
      assert.equal(response.status, 200);
      return response.text();
    };
    const html = await get("");
    const cards = html.match(/<article\b[^>]*data-order-funnel-card="true"[^>]*>/g) || [];
    assert.equal(cards.length, rows.length);
    assert.equal(new Set(cards.map(card => card.match(/data-order-entry-id="([^"]+)"/)[1])).size, rows.length);
    assert.doesNotMatch(html, /FULL_DETAIL_ONLY/);
    for (const index of [0, 499, 500, 999, 1002]) {
      const card = html.match(new RegExp(`<article\\b[^>]*data-order-entry-id="${rows[index].id}"[\\s\\S]*?</article>`))?.[0];
      assert.ok(card);
      assert.ok(card.includes(`Cleaner ${index % 2}`));
      assert.ok(card.includes(`$${(250 + index).toLocaleString("en-US", { minimumFractionDigits: 2 })}`));
    }
    const filtered = await get("?q=manual-client-1002");
    assert.match(filtered, /data-order-entry-id="entry-01002"/);
    const detail = await get("?fragment=order-dialog&order=entry-00001");
    assert.match(detail, /FULL_DETAIL_ONLY/);
    assert.match(detail, /\$251\.00/);
    assert.match(detail, /Cleaner 1/);
    const direct = await get("?order=entry-00001");
    assert.match(direct, /FULL_DETAIL_ONLY/);
    const unavailable = await get("?order=entry-00002");
    assert.match(unavailable, /Не удалось загрузить полную карточку заказа/);
    assert.doesNotMatch(unavailable, /id="admin-order-detail-dialog-entry-00002"/);
    const calls = (await fs.readFile(stub.captureFile, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.ok(calls.every(call => call.method === "GET"));
    const fullReads = calls.filter(call => /quote_ops_entries/.test(call.url) && new URL(call.url).searchParams.get("select") === "*");
    assert.ok(fullReads.every(call => ["eq.entry-00001", "eq.entry-00002"].includes(new URL(call.url).searchParams.get("id"))));
    assert.deepEqual(rows, before);
  } finally {
    await stopServer(started.child);
    stub.cleanup();
  }
});
