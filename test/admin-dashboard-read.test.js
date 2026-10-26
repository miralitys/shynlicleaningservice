"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDashboardPageRenderer } = require("../lib/admin/pages/dashboard-page");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { createOrdersUiPrimitives } = require("../lib/admin/pages/orders-ui-primitives");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const ui = createOrdersUiPrimitives({ normalizeString });
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const storeFor = client => createQuoteOpsStore({ normalizeString, QUOTE_OPS_LEDGER_LIMIT: 250,
  createSupabaseQuoteOpsClient: () => client });
const filter = (entries, filters = {}) => filterQuoteOpsEntries(entries, filters, normalizeString);
function renderer(capture, overrides = {}) {
  return createDashboardPageRenderer({
    ...domain, ...ui, filterQuoteOpsEntries: filter,
    ADMIN_ROOT_PATH: "/admin", ADMIN_ORDERS_PATH: "/admin/orders", ADMIN_QUOTE_OPS_PATH: "/admin/quote-ops",
    DASHBOARD_NEW_ORDERS_LIMIT: 8, DASHBOARD_QUOTE_OPS_PAGE_LIMIT: 1000, QUOTE_OPS_TASK_CLIENT_LEDGER_LIMIT: 1000,
    STAFF_TEAM_CALENDAR_TIME_ZONE: "America/Chicago", normalizeString,
    buildFormattedScheduleLabel: (...args) => args.join(" "), escapeHtml: String, escapeHtmlAttribute: String,
    formatCurrencyAmount: String, formatAdminPhoneNumber: String, formatAdminDateTime: String,
    renderOrderStatusBadge: String, renderLeadStatusBadge: String,
    getProjectedOrderRecords: async (runtime, entries) => domain.collectAdminOrderRecords(entries),
    getWorkspaceAccessContext: runtime => ({ canEdit: runtime.role !== "viewer", canDelete: runtime.role === "admin" }),
    collectNonAssignableStaffIds: () => new Set(), filterStaffSnapshotByHiddenStaffIds: x => x,
    buildQuoteOpsTaskRecords: entries => entries.flatMap(entry => (entry.payloadForRetry?.adminLead?.tasks || [])
      .map(task => ({ ...task, entry, customerName: entry.customerName, serviceLabel: entry.serviceName,
        manager: { name: task.assigneeName }, leadStatus: entry.payloadForRetry.adminLead.status }))),
    renderAdminBadge: String, renderQuoteOpsWorkspaceStyle: () => "", renderAdminAppSidebar: () => "",
    renderAdminCard: (title, copy, body) => `<section>${title}${body}</section>`,
    renderAdminLayout: (title, body) => body,
    renderOrderTableRow: order => { capture.rows.push(order); return `<tr>${order.id}</tr>`; },
    renderOrderManagementDialog: (order, returnTo, options) => {
      capture.orders.push({ order, entry: options.planningItem?.entry, canEdit: options.canEdit }); return "";
    },
    renderQuoteOpsTaskResultDialog: (task, returnTo, id, options) => {
      capture.tasks.push({ task, canEdit: options.canEdit }); return "";
    }, ...overrides,
  });
}

test("dashboard reads every source row beyond 1000, including standalone tasks, without full payloads or writes", async () => {
  const fixture = createFixture(1107, 157);
  fixture.rows.push({ ...structuredClone(fixture.rows[0]), id: "standalone-task", kind: "admin_standalone_task",
    payload_for_retry: { adminLead: { tasks: [{ id: "standalone", status: "open", dueAt: "2020-01-01" }] } } });
  fixture.rows[0].payload_for_retry.adminClient.addressBook = [{ address: "Retained second house", roomCount: "4" }];
  const before = structuredClone(fixture);
  for (const noCount of [false, true]) {
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 37, noCount })) });
    const expected = (await client.fetchAllEntries({ completeCursor: true }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    calls.length = 0;
    const actual = await storeFor(client).listDashboardEntries();
    assert.deepEqual(actual.map(x => x.id).sort(), expected.map(x => x.id).sort());
    const sort = records => records.map(x => { const { entry, entries, addressesByKey, addresses, policyAcceptance, ...rest } = x;
      return rest; }).sort((a, b) => (a.id || a.key).localeCompare(b.id || b.key));
    assert.deepEqual(sort(domain.collectAdminOrderRecords(filter(actual))), sort(domain.collectAdminOrderRecords(filter(expected))));
    const clients = entries => domain.collectAdminClientRecords(filter(entries)).map(client => ({
      key: client.key, name: client.name, phone: client.phone, email: client.email,
      totalRevenue: client.totalRevenue, requestCount: client.requestCount,
      entries: client.entries.map(entry => entry.id).sort(),
      addresses: client.addresses.map(address => ({ key: address.key, address: address.address,
        roomCount: address.roomCount, bathroomCount: address.bathroomCount, squareFootage: address.squareFootage,
        notes: address.notes, entries: address.entries.map(entry => entry.id).sort() })).sort((a, b) => a.key.localeCompare(b.key)),
    })).sort((a, b) => a.key.localeCompare(b.key));
    assert.deepEqual(clients(actual), clients(expected));
    assert.ok(actual.some(entry => entry.id === "standalone-task"));
    assert.equal(actual.find(entry => entry.id === fixture.rows[0].id).payloadForRetry.adminClient.addressBook[0].address, "Retained second house");
    assert.ok(actual.every(entry => !entry.payloadForRetry.adminSms && !entry.payloadForRetry.orderState?.payroll));
    assert.ok(calls.length > 25);
    assert.ok(calls.every(call => call.table === "admin_order_list_entries" && call.method === "GET"));
    const full = await storeFor(client).listDashboardDetailEntries([fixture.rows[0].id]);
    assert.ok(full[0].payloadForRetry.adminSms.history.length);
    assert.deepEqual(full[0].payloadForRetry.orderState.payroll, fixture.rows[0].payload_for_retry.orderState.payroll);
    assert.deepEqual(fixture, before);
  }
});

test("dashboard starts its independent reads together and does not repeat a prepared read", async () => {
  const started = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const read = (name, result) => async () => { started.push(name); await gate; return result; };
  const ledger = { listDashboardEntries: read("entries", []) };
  const runtime = { staffStore: { getSnapshot: read("staff", { staff: [], assignments: [] }) },
    usersStore: { getSnapshot: read("users", { users: [] }) } };
  const page = renderer({ rows: [], orders: [], tasks: [] });
  const pending = page.prepareContext(ledger, runtime);
  assert.deepEqual(started, ["entries", "staff", "users"]);
  release();
  const prepared = await pending;
  await page({}, {}, ledger, runtime, prepared);
  assert.equal(started.length, 3);
});

test("full displayed cards, saved payouts, address data, policy and task history match the old full-read path", async () => {
  const fixture = createFixture(30, 0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  fixture.rows[0].payload_for_retry.orderState.selectedDate = today;
  fixture.rows[0].payload_for_retry.orderState.payrollOverrides = { a: "534.00" };
  fixture.rows[0].payload_for_retry.orderState.assignedStaff = "";
  fixture.rows[0].payload_for_retry.adminLead = { status: "new", tasks: [{ id: "old-task", status: "open", dueAt: "2020-01-01T12:00:00Z",
    title: "Retained task", assigneeName: "Manager", comment: "Retained history" }] };
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const full = await client.fetchAllEntries({ completeCursor: true });
  const legacy = { listEntries: async filters => filter(full, filters) };
  const store = storeFor(client);
  const before = structuredClone(fixture);
  for (const role of ["admin", "manager", "viewer"]) {
    const oldCapture = { rows: [], orders: [], tasks: [] }, nextCapture = { rows: [], orders: [], tasks: [] };
    const runtime = { role };
    const oldHtml = await renderer(oldCapture)({}, {}, legacy, runtime);
    const nextHtml = await renderer(nextCapture)({}, {}, store, runtime);
    assert.equal(nextHtml, oldHtml);
    assert.deepEqual(nextCapture, oldCapture);
    assert.ok(nextCapture.orders.some(item => item.order.entry.payloadForRetry.orderState.payrollOverrides?.a === "534.00"));
    assert.ok(nextCapture.tasks.some(item => item.task.comment === "Retained history"));
    assert.ok(nextCapture.orders.every(item => item.canEdit === (role !== "viewer")));
  }
  assert.deepEqual(fixture, before);
});

test("missing or changed full cards fail visibly, not as empty indicators or stale payouts", async () => {
  const fixture = createFixture(1, 0);
  fixture.rows[0].payload_for_retry.orderState.assignedStaff = "";
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const store = storeFor(client);
  const page = renderer({ rows: [], orders: [], tasks: [] });
  for (const mode of ["missing", "changed"]) {
    const prepared = await page.prepareContext(store);
    const details = await store.listDashboardDetailEntries([fixture.rows[0].id]);
    await assert.rejects(page({}, {}, { ...store, listDashboardDetailEntries: async () => mode === "missing" ? []
      : details.map(entry => ({ ...entry, updatedAt: "changed" })) }, {}, prepared), /changed while loading/);
  }
});

test("dashboard read errors never return an old memory list and the next request sees fresh values", async () => {
  const fixture = createFixture(2, 0);
  const state = {};
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, [], () => state) });
  const store = storeFor(client);
  await store.listDashboardEntries();
  state.adminOrderViewError = true;
  await assert.rejects(store.listDashboardEntries(), /denied/i);
  delete state.adminOrderViewError;
  fixture.rows[0].total_price = 534;
  fixture.rows[0].total_price_cents = 53400;
  assert.equal((await store.listDashboardEntries()).find(entry => entry.id === fixture.rows[0].id).totalPriceCents, 53400);
});
