"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry, mapEntryToRow } = require("../lib/supabase-quote-ops");
const { ADMIN_ORDER_LIST_VIEW, projectOrderListEntry, hydrateOrderListRow } = require("../lib/quote-ops/order-list");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { hasEntryOrderState } = require("../lib/admin-order-state");
const { collectPayrollRecords } = require("../lib/payroll");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const sorted = entries => entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
const summary = (row, options = {}) => projectOrderListEntry(mapRowToEntry(hydrateOrderListRow({ ...row,
  ...Object.fromEntries(["orderState", "adminOrder", "paymentState", "payment", "calculatorData", "adminClient", "adminLead"]
    .map(key => [`list_${key}`, row.payload_for_retry?.[key] ?? null])),
})), options);

test("admin order view falls back only for an absent migration and does not repeat its 404", async () => {
  const fixture = createFixture(17, 5);
  const before = structuredClone(fixture);
  const calls = [];
  const paths = [];
  const read = createReadFetch(fixture, calls, () => ({ missingAdminOrderView: true }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
    paths.push(new URL(url).pathname); return read(url, options);
  } });
  for (let i = 0; i < 2; i++) assert.deepEqual(await client.fetchOrderListEntries(), sorted(fixture.rows.map(summary)));
  assert.equal(paths.filter(p => p.endsWith(ADMIN_ORDER_LIST_VIEW)).length, 1);
  assert.equal(paths.filter(p => p.endsWith("quote_ops_entries")).length, 2);
  assert.deepEqual(fixture, before);
});

test("denied, failed, malformed or empty admin-view reads never turn into an old-table fallback", async () => {
  const fixture = createFixture(4, 2);
  for (const state of [{ adminOrderViewError: true }, { failOrders: true }]) {
    const paths = [];
    const read = createReadFetch(fixture, [], () => state);
    const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
      paths.push(new URL(url).pathname); return read(url, options);
    } });
    await assert.rejects(client.fetchOrderListEntries(), /denied|failure/);
    assert.ok(paths.every(p => p.endsWith(ADMIN_ORDER_LIST_VIEW)));
  }
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch({ ...fixture, adminOrderRows: [] }, calls) });
  assert.deepEqual(await client.fetchOrderListEntries(), []);
  assert.ok(calls.every(call => call.table === ADMIN_ORDER_LIST_VIEW));
  const paths = [];
  const malformed = createSupabaseQuoteOpsClient({ env, fetch: async url => {
    paths.push(new URL(url).pathname);
    return { ok: true, status: 200, text: async () => "[{" };
  } });
  await assert.rejects(malformed.fetchOrderListEntries(), SyntaxError);
  assert.deepEqual(paths, [`/rest/v1/${ADMIN_ORDER_LIST_VIEW}`]);
});

test("a missing or failed second view page fails closed without partial rows or old-table fallback", async () => {
  for (const failure of ["PGRST205", "42501", "503"]) {
    const fixture = createFixture(12, 4);
    let reads = 0;
    const paths = [];
    const read = createReadFetch(fixture, [], () => ({ cap: 5 }));
    const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
      paths.push(new URL(url).pathname);
      if (++reads === 2) return Promise.resolve({ ok: false, status: 503,
        text: async () => JSON.stringify({ code: failure, message: "Second page failed" }) });
      return read(url, options);
    } });
    const store = createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 250, normalizeString, createSupabaseQuoteOpsClient: () => client });
    await assert.rejects(store.listOrderListEntries(), /Second page failed/);
    assert.deepEqual(paths, [`/rest/v1/${ADMIN_ORDER_LIST_VIEW}`, `/rest/v1/${ADMIN_ORDER_LIST_VIEW}`]);
  }
});

test("saved payroll and full detail keep reading the original ledger, never display-only view data", async () => {
  const fixture = createFixture(4, 2);
  const before = structuredClone(fixture);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls) });
  await client.fetchOrderListEntries();
  calls.length = 0;
  const payroll = await client.fetchOrderListEntries({ includePayroll: true });
  assert.deepEqual(payroll, sorted(fixture.rows.map(row => summary(row, { includePayroll: true }))));
  assert.ok(calls.every(call => call.table === "quote_ops_entries"));
  for (const staffId of ["a", "b"]) assert.deepEqual(collectPayrollRecords({ entries: payroll, staffId }),
    collectPayrollRecords({ entries: sorted(fixture.rows.map(mapRowToEntry)), staffId }));
  const detail = await client.fetchEntryById(fixture.rows[0].id);
  assert.deepEqual(detail, mapRowToEntry(fixture.rows[0]));
  assert.ok(detail.payloadForRetry.adminSms.history.length);
  assert.ok(detail.payloadForRetry.orderState.policyAcceptance.signatureDataUrl);
  assert.deepEqual(fixture, before);
});

test("custom ledger tables never read the default admin order view", async () => {
  const fixture = createFixture(2, 1);
  const paths = [];
  const read = createReadFetch(fixture);
  const client = createSupabaseQuoteOpsClient({ env: { ...env, SUPABASE_QUOTE_OPS_TABLE: "custom_ledger" }, fetch: (url, options) => {
    const parsed = new URL(url); paths.push(parsed.pathname);
    assert.equal(parsed.pathname, "/rest/v1/custom_ledger");
    parsed.pathname = "/rest/v1/quote_ops_entries"; return read(parsed, options);
  } });
  assert.equal((await client.fetchOrderListEntries()).length, fixture.rows.length);
  assert.deepEqual(paths, ["/rest/v1/custom_ledger"]);
});

let pgBin;
try { pgBin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}

test("PostgreSQL: admin view preserves all legacy roots, displayed fields, filters, client data and full history without writes", {
  skip: !pgBin || process.getuid?.() === 0 ? "Local PostgreSQL binaries and an unprivileged user are required" : false,
}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-admin-order-view-pg-"));
  const dir = path.join(root, "db");
  const run = (bin, args, extra = {}) => execFileSync(path.join(pgBin, bin), args,
    { encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...extra });
  let started = false;
  t.after(() => {
    if (started) run("pg_ctl", ["-D", dir, "-m", "immediate", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  });
  run("initdb", ["-D", dir, "-A", "trust", "-U", "orders_qa", "--no-locale"]);
  run("pg_ctl", ["-D", dir, "-l", path.join(root, "postgres.log"), "-o", `-k ${root} -h '' -p 55447`, "start"]);
  started = true;
  const sql = input => {
    // Avoid blocking macOS synchronous stdin pipes on large synthetic SQL fixtures.
    const file = path.join(root, "query.sql");
    fs.writeFileSync(file, input);
    return run("psql", ["-X", "-h", root, "-p", "55447", "-U", "orders_qa", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-Atq", "-f", file]).trim();
  };
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const migration = file => sql(fs.readFileSync(path.join(__dirname, "../supabase", file), "utf8"));
  sql("create role anon; create role authenticated; create role service_role bypassrls;");
  migration("quote_ops_schema.sql");
  sql("grant select on public.quote_ops_entries to service_role;");
  const fixture = createFixture(366, 157);
  const variants = [undefined, null, {}, [], false, true, "legacy", 0, { migrated: true },
    { payrollOverrides: { a: "0", b: "500" } }, { payroll: { items: [{ staffId: "a", amountCents: 50000, status: "paid" }] } },
    { policyAcceptance: {} }, { policyAcceptance: { signatureDataUrl: "private-signature" } },
    { policyAcceptance: false }, { policyAcceptance: { policyAccepted: true, sentAt: "sent", firstViewedAt: "first", signedAt: "signed" } },
    { completion: {} }, { completion: [] }, { completion: { beforePhotos: [{ path: "private-photo" }] } },
    { isCreated: false, completion: { afterPhotos: [false], checklistItems: [] } },
    ...["note", "", "\u00a0", "\t\n", " ".repeat(4100) + "note", [], [null], [null, null], {}, false, true, 0]
      .map(cleanerComment => ({ completion: { cleanerComment } })),
    { status: "completed", paymentStatus: "partial", paymentMethod: "invoice", assignedStaff: "Cleaner A, Cleaner B" },
    { status: "cancelled" }, { status: "rescheduled" }, { createdAt: "legacy" }, { selectedDate: "2099-01-03" },
    { selectedTime: "09:00" }, { assignee: "Cleaner B" }, { frequency: "monthly" }, { listHasOrderState: false }];
  for (const orderState of variants) for (const adminOrder of variants) {
    const row = structuredClone(fixture.rows[0]);
    row.payload_for_retry = { calculatorData: { bedrooms: 3, bathrooms: 2.5, selectedDate: "2099-02-03", frequency: "monthly" },
      paymentState: {}, payment: { status: "paid", method: "Zelle", unrelated: "private-payment-detail" },
      adminClient: { secondaryPhone: "2025550123", addressBook: [{ address: "Second address", roomCount: "4" }],
        removedAddressKeys: ["Old address"], automaticNotificationsEnabled: false, photos: ["private-client-photo"] },
      adminLead: { status: "new", tasks: [{ id: "task", status: "open", dueAt: "2099-02-03" }] },
      adminSms: { history: [{ id: "retained", message: "private-sms" }] } };
    if (orderState !== undefined) row.payload_for_retry.orderState = orderState;
    if (adminOrder !== undefined) row.payload_for_retry.adminOrder = adminOrder;
    fixture.rows.push(row);
  }
  for (const payload of [null, [], false, "legacy"]) fixture.rows.push({ ...fixture.rows[0], payload_for_retry: payload });
  for (const [index, row] of fixture.rows.entries()) row.id = `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
  fixture.rows = fixture.rows.map(row => ({ ...mapEntryToRow(mapRowToEntry(row)), payload_for_retry: row.payload_for_retry }));
  sql(`insert into public.quote_ops_entries select * from jsonb_populate_recordset(null::public.quote_ops_entries, ${literal(fixture.rows)});`);
  const ledgerHash = () => sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;");
  const before = ledgerHash();
  migration("admin_order_list.sql");
  migration("admin_order_list.sql");
  assert.equal(ledgerHash(), before, "Installing/reinstalling the migration cannot change records");
  fixture.rows = JSON.parse(sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q;"));
  fixture.adminOrderRows = JSON.parse(sql("set role service_role; select jsonb_agg(to_jsonb(q) order by id) from public.admin_order_list_entries q;"));
  assert.equal(fixture.rows.length, fixture.adminOrderRows.length);
  assert.doesNotMatch(JSON.stringify(fixture.adminOrderRows), /private-signature|private-photo|private-client-photo|private-sms|private-payment-detail|checklistItems|payrollOverrides|amountCents/);
  const domain = createAdminDomainHelpers({ normalizeString });
  const expected = sorted(fixture.rows.map(summary));
  const compact = entries => entries.map(entry => ({ id: entry.id, payload: Object.fromEntries(
    Object.entries(entry.payloadForRetry).filter(([, value]) => value != null)) }));
  const clients = domain.collectAdminClientRecords(expected);
  const displayed = domain.collectAdminOrderRecords(expected);
  const calls = [];
  for (const noCount of [false, true]) {
    const callStart = calls.length;
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 123, noCount })) });
    const actual = await client.fetchOrderListEntries();
    assert.deepEqual(compact(actual), compact(expected), "Exact SQL projection parity for every legacy root pair");
    assert.deepEqual(actual.map(hasEntryOrderState), expected.map(hasEntryOrderState));
    assert.deepEqual(domain.collectAdminClientRecords(actual), clients);
    assert.deepEqual(domain.collectAdminOrderRecords(actual), displayed);
    const visible = entries => filterQuoteOpsEntries(entries, {}, normalizeString).map(entry => entry.id);
    assert.deepEqual(visible(actual), visible(expected));
    for (const filter of [{}, { status: "completed" }, { status: "canceled" }, { status: "scheduled" }, { status: "new" },
      { frequency: "monthly" }, { serviceType: "deep" }, { assignment: "unassigned" }, { q: "Second address" }, { q: "Cleaner B" }]) {
      assert.deepEqual(domain.filterAdminOrderRecords(domain.collectAdminOrderRecords(actual), filter), domain.filterAdminOrderRecords(displayed, filter));
    }
    const oldCalls = [];
    const old = await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, oldCalls, () => ({ missingAdminOrderView: true, cap: 123, noCount })) }).fetchOrderListEntries();
    assert.deepEqual(old, actual, "An unapplied migration keeps the full established list available");
    const bytes = rows => rows.reduce((n, row) => n + row.bytes, 0);
    const newBytes = bytes(calls.slice(callStart));
    assert.ok(newBytes < bytes(oldCalls), "Network size decreases before Node parses JSON");
    if (!noCount) t.diagnostic(JSON.stringify({ rows: actual.length, beforeBytes: bytes(oldCalls), afterBytes: newBytes,
      reductionPercent: +(100 * (1 - newBytes / bytes(oldCalls))).toFixed(1), sqlProjectionParity: true }));
    const detail = await client.fetchEntryById(fixture.rows[0].id);
    assert.deepEqual(detail, mapRowToEntry(fixture.rows[0]));
  }
  assert.ok(calls.filter(call => call.query.includes("limit=500")).every(call => call.table === ADMIN_ORDER_LIST_VIEW));
  for (const role of ["anon", "authenticated"]) assert.throws(() => sql(`set role ${role}; select * from public.admin_order_list_entries;`), /permission denied/);
  assert.equal(sql("select has_table_privilege('service_role', 'public.admin_order_list_entries', 'INSERT,UPDATE,DELETE');"), "f");
  assert.equal(sql("select has_function_privilege('anon', 'public.admin_order_list_state(jsonb)', 'EXECUTE');"), "f");
  assert.equal(sql("select reloptions::text from pg_class where oid='public.admin_order_list_entries'::regclass;"), "{security_invoker=true,security_barrier=true}");
  assert.equal(ledgerHash(), before, "All complete reads leave history, prices, teams and payouts unchanged");
});
