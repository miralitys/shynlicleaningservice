"use strict";

const { test, assert, fs, createFetchStub, startServer, stopServer, createAdminSession, loadAdminConfig,
  getChicagoDateValue } = require("./admin-route-helpers");
const { createOrdersUiPrimitives } = require("../lib/admin/pages/orders-ui-primitives");

const { decorateOrderForPlanning } = createOrdersUiPrimitives({
  normalizeString: (value, max) => String(value || "").trim().slice(0, max),
});

test("shared order planning view resolves calendar assignments, legacy names and hidden staff without mutations", () => {
  const order = { id: "visit", assignedStaff: "", isAssigned: false, scheduleLabel: "Original" };
  const planning = { assignedStaff: [{ id: "cleaner", name: "Calendar Cleaner" }], scheduleLabel: "Scheduled", hasSchedule: true };
  const before = structuredClone({ order, planning });
  const decorated = decorateOrderForPlanning(order, new Map([[order.id, planning]]), new Set());
  assert.equal(decorated.isAssigned, true);
  assert.equal(decorated.assignedStaff, "Calendar Cleaner");
  assert.equal(decorated.scheduleLabel, "Scheduled");
  assert.deepEqual({ order, planning }, before);
  assert.equal(decorateOrderForPlanning(order, new Map(), new Set()).isAssigned, false);
  assert.equal(decorateOrderForPlanning({ ...order, assignedStaff: "Legacy Cleaner" }, new Map(), new Set()).isAssigned, true);
  assert.equal(decorateOrderForPlanning({ ...order, assignedStaff: "Hidden Staff" }, new Map(), new Set(["hidden staff"])).isAssigned, false);
  assert.equal(decorateOrderForPlanning(order, new Map([[order.id, { ...planning, assignedStaff: [] }]]), new Set()).isAssigned, false);
});

test("dashboard shows actual new orders and excludes calendar-assigned orders from missing teams, without database writes", async () => {
  const today = getChicagoDateValue();
  const row = (id, status, extra = {}) => ({
    id, kind: "quote_submission", status: "success", request_id: id, customer_name: id,
    customer_phone: "6305550100", service_type: "regular", total_price: 250,
    selected_date: today, selected_time: "10:00", created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
    payload_for_retry: status ? { orderState: { isCreated: true, status, ...extra } } : {},
  });
  const newRows = Array.from({ length: 10 }, (_, i) => ({
    ...row(`new-${i}`, "new", i % 2 ? { managerConfirmationRequired: true } : {}),
    created_at: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
  }));
  const rows = [...newRows,
    row("calendar-assigned", "scheduled"), row("text-assigned", "scheduled", { assignedStaff: "Legacy Cleaner" }),
    row("really-unassigned", "scheduled"), row("archived-lead", ""),
    row("completed-unassigned", "completed"), row("canceled-unassigned", "canceled"),
  ];
  const stub = createFetchStub([
    { method: "GET", match: "/rest/v1/quote_ops_entries", body: rows },
    { method: "GET", match: "/rest/v1/admin_staff_assignments", body: [{ entry_id: "calendar-assigned", staff_ids: ["cleaner"], schedule_date: today, schedule_time: "10:00" }] },
    { method: "GET", match: "/rest/v1/admin_staff", body: [{ id: "cleaner", name: "Calendar Cleaner", role: "cleaner", status: "active" }] },
    { method: "GET", match: "/rest/v1/", body: [] },
  ]);
  const env = { ADMIN_MASTER_SECRET: "dashboard_orders_test", SUPABASE_URL: "https://dashboard-test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake_dashboard_test", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const started = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const response = await fetch(`${started.baseUrl}/admin`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    const section = (name) => html.match(new RegExp(`data-admin-dashboard-${name}="true"[\\s\\S]*?</table>`))?.[0] || "";
    const newOrders = section("new-orders");
    assert.ok(newOrders);
    assert.doesNotMatch(html, /Новые заявки|Заявки → Таски|data-admin-dashboard-new-requests/);
    assert.equal((newOrders.match(/href="\/admin\/orders\?order=/g) || []).length, 8);
    assert.ok(newOrders.indexOf('order=new-9"') < newOrders.indexOf('order=new-8"'));
    assert.match(newOrders, /order=new-2"/);
    assert.doesNotMatch(newOrders, /order=new-[01]"|archived-lead|calendar-assigned|completed-unassigned|canceled-unassigned/);
    const unassigned = section("unassigned-orders");
    assert.match(unassigned, /really-unassigned/);
    assert.doesNotMatch(unassigned, /calendar-assigned|text-assigned|completed-unassigned|canceled-unassigned|archived-lead/);
    const todaysOrders = section("today-orders");
    assert.match(todaysOrders, /calendar-assigned/);
    const assignedRow = todaysOrders.match(/<tr\b[^>]*aria-label="Открыть карточку заказа calendar-assigned"[\s\S]*?<\/tr>/)?.[0];
    assert.ok(assignedRow);
    assert.match(assignedRow, /Calendar Cleaner/);
    assert.doesNotMatch(assignedRow, /Команда не назначена/);
    const calls = (await fs.readFile(stub.captureFile, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.equal(calls.filter(call => call.method !== "GET" && /quote_ops_entries|admin_staff/.test(call.url)).length, 0);
    assert.ok(calls.some(call => call.method === "GET" && /quote_ops_entries/.test(call.url) && new URL(call.url).searchParams.get("limit") === "1000"));
  } finally {
    await stopServer(started.child);
    stub.cleanup();
  }
});
