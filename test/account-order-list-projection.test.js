"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry, mapEntryToRow } = require("../lib/supabase-quote-ops");
const { projectAccountListEntry, ACCOUNT_LIST_VIEW } = require("../lib/account/order-list");
const { hydrateOrderListRow } = require("../lib/quote-ops/order-list");
const { getEntryOrderState, hasEntryOrderState } = require("../lib/admin-order-state");
const { collectPayrollRecords, calculateStaffPayrollItem } = require("../lib/payroll");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const summary = row => projectAccountListEntry(mapRowToEntry(hydrateOrderListRow({ ...row,
  ...Object.fromEntries(["orderState", "adminOrder", "paymentState", "payment", "calculatorData"]
    .map(key => [`list_${key}`, row.payload_for_retry?.[key] ?? null])),
})));

test("account view fallback is limited to a missing migration, never errors or an empty result", async () => {
  const fixture = createFixture(4, 2);
  const calls = [];
  const fallbackFetch = createReadFetch(fixture, [], () => ({ missingAccountView: true }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
    calls.push(new URL(url).pathname);
    return fallbackFetch(url, options);
  } });
  const ids = fixture.rows.map(row => row.id);
  for (let pass = 0; pass < 2; pass++) {
    const result = await client.fetchAccountEntriesByIds(ids);
    assert.deepEqual(result, fixture.rows.map(summary).sort((a, b) => a.id.localeCompare(b.id)));
  }
  assert.equal(calls.filter(url => url.endsWith(ACCOUNT_LIST_VIEW)).length, 1);
  assert.equal(calls.filter(url => url.endsWith("quote_ops_entries")).length, 2);
  for (const state of [{ failOrders: true }, { accountViewError: true }]) {
    const requests = [];
    const fetch = createReadFetch(fixture, requests, () => state);
    await assert.rejects(createSupabaseQuoteOpsClient({ env, fetch }).fetchAccountEntriesByIds(ids), /failure|denied/);
    assert.equal(requests.filter(call => call.table === "quote_ops_entries").length, 0);
  }
  const emptyCalls = [];
  const empty = { ...fixture, accountRows: [] };
  assert.deepEqual(await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(empty, emptyCalls) })
    .fetchAccountEntriesByIds(ids), []);
  assert.ok(emptyCalls.every(call => call.table === ACCOUNT_LIST_VIEW));
  assert.deepEqual(await client.fetchAccountEntriesByIds([]), []);
});

let pgBin;
try { pgBin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}

test("PostgreSQL: lean account view preserves every summary, payroll and state root without mutating the ledger", {
  skip: !pgBin || process.getuid?.() === 0 ? "Local PostgreSQL binaries and an unprivileged user are required" : false,
}, async t => {
  // A disposable Unix-socket-only cluster, never the configured Supabase database.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-account-view-pg-"));
  const dir = path.join(root, "db");
  const run = (bin, args, extra = {}) => execFileSync(path.join(pgBin, bin), args,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...extra });
  let started = false;
  t.after(() => {
    if (started) run("pg_ctl", ["-D", dir, "-m", "immediate", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  });
  run("initdb", ["-D", dir, "-A", "trust", "-U", "account_qa", "--no-locale"]);
  run("pg_ctl", ["-D", dir, "-l", path.join(root, "postgres.log"), "-o", `-k ${root} -h '' -p 55439`, "start"]);
  started = true;
  const sql = input => run("psql", ["-X", "-h", root, "-p", "55439", "-U", "account_qa", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-Atq"], { input }).trim();
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const migration = name => sql(fs.readFileSync(path.join(__dirname, "..", "supabase", name), "utf8"));
  sql("create role anon; create role authenticated; create role service_role bypassrls;");
  migration("quote_ops_schema.sql");
  sql("grant select on public.quote_ops_entries to service_role;");
  const fixture = createFixture(254, 163);
  const variants = [undefined, null, {}, [], false, "legacy", { unrelated: "still an order" },
    { notifications: ["message".repeat(500)] }, { updatedAt: null }, { updatedAt: "2026-10-24T12:00:00Z" },
    { policyAcceptance: { signatureDataUrl: "private-signature", policyAccepted: true, signedAt: "2026-10-24" } },
    { completion: { beforePhotos: [{ path: "private-photo" }] } },
    { isCreated: false, completion: { afterPhotos: ["private-photo"], checklistItems: [] } },
    { completion: { cleanerComment: "  note  ", checklistItems: [{ id: "x", completed: false }] } },
    { completion: { cleanerComment: "", beforePhotos: [], afterPhotos: {} } },
    { completion: { cleanerComment: ["legacy note"] } },
    { payrollOverrides: { a: "0", b: "500" }, status: "completed", assignedStaff: "Cleaner A, Cleaner B" },
    { payroll: { items: [{ staffId: "a", amountCents: 50000, status: "paid", paidAt: "2026-10-24" }] } },
    { status: "cancelled", payrollOverrides: { a: "125.50" } },
  ];
  for (const orderState of variants) for (const adminOrder of variants) {
    const row = structuredClone(fixture.rows[0]);
    row.payload_for_retry = { calculatorData: row.payload_for_retry.calculatorData,
      paymentState: {}, payment: { status: "paid", method: "Zelle", unrelated: "omit" } };
    if (orderState !== undefined) row.payload_for_retry.orderState = orderState;
    if (adminOrder !== undefined) row.payload_for_retry.adminOrder = adminOrder;
    fixture.rows.push(row);
  }
  for (const payload of [null, [], false, "legacy"]) fixture.rows.push({ ...fixture.rows[0], payload_for_retry: payload });
  const richState = { ...structuredClone(fixture.rows[0].payload_for_retry.orderState),
    createdAt: "2026-10-01T12:00:00Z", assignee: "Cleaner A", frequency: "biweekly", paymentStatus: "paid", paymentMethod: "Zelle",
    recurringNextEntryId: "next", recurringGeneratedAt: "2026-10-24", recurringSeriesId: "series",
    recurringAnchorDate: "2026-10-24", recurringSourceEntryId: "source",
    cleanerConfirmation: { a: { status: "confirmed", confirmedAt: "2026-10-24T12:00:00Z" } },
    policyAcceptance: { policyAccepted: true, sentAt: "sent", firstViewedAt: "first", lastViewedAt: "last", signedAt: null,
      signatureDataUrl: "private-signature" },
  };
  fixture.rows.push({ ...fixture.rows[0], payload_for_retry: { orderState: richState, adminOrder: richState,
    paymentState: { status: "paid", method: "Cash" }, payment: null, calculatorData: { rooms: 4, squareFeet: 2000 } } });
  for (const [index, row] of fixture.rows.entries()) row.id = `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
  fixture.rows = fixture.rows.map(row => ({ ...mapEntryToRow(mapRowToEntry(row)), payload_for_retry: row.payload_for_retry }));
  sql(`insert into public.quote_ops_entries select * from jsonb_populate_recordset(null::public.quote_ops_entries, ${literal(fixture.rows)});`);
  const ledgerHash = () => sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;");
  const before = ledgerHash();
  migration("account_order_list.sql");
  migration("account_order_list.sql");
  assert.equal(ledgerHash(), before, "installing/reinstalling the view does not change rows");
  fixture.rows = JSON.parse(sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q;"));
  fixture.accountRows = JSON.parse(sql("set role service_role; select jsonb_agg(to_jsonb(q) order by id) from public.account_order_list_entries q;"));
  assert.equal(fixture.rows.length, fixture.accountRows.length);
  for (let i = 0; i < fixture.rows.length; i++) {
    const expected = summary(fixture.rows[i]);
    const actual = summary(fixture.accountRows[i]);
    assert.deepEqual(actual, expected, `Exact summary parity for row ${i}`);
    assert.equal(hasEntryOrderState(actual), hasEntryOrderState(expected));
    assert.deepEqual(getEntryOrderState(actual), getEntryOrderState(expected));
    for (const person of ["a", "b"]) {
      const staff = { id: person, compensationType: "percent", compensationValue: "50" };
      const payroll = [actual, expected].map(entry => calculateStaffPayrollItem(entry, staff, { teamSize: 2 }));
      for (const item of payroll) if (item) { delete item.createdAt; delete item.updatedAt; }
      assert.deepEqual(payroll[0], payroll[1]);
    }
  }
  assert.doesNotMatch(JSON.stringify(fixture.accountRows), /private-signature|private-photo/);
  for (const noCount of [false, true]) {
    const calls = [];
    const entries = await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 23, noCount })) })
      .fetchAccountEntriesByIds(fixture.rows.map(row => row.id));
    assert.deepEqual(entries, fixture.rows.map(summary));
    for (const staffId of ["a", "b"]) assert.deepEqual(collectPayrollRecords({ entries, staffId }),
      collectPayrollRecords({ entries: fixture.rows.map(summary), staffId }));
    assert.ok(calls.every(call => call.method === "GET" && call.table === ACCOUNT_LIST_VIEW));
  }
  const oldCalls = [], newCalls = [];
  const ids = fixture.rows.map(row => row.id);
  await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, oldCalls, () => ({ missingAccountView: true })) }).fetchAccountEntriesByIds(ids);
  await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, newCalls) }).fetchAccountEntriesByIds(ids);
  const bytes = calls => calls.reduce((sum, call) => sum + call.bytes, 0);
  assert.ok(bytes(newCalls) < bytes(oldCalls) * 0.6, "network payload reduced, not merely pruned after downloading");
  t.diagnostic(JSON.stringify({ rows: ids.length, beforeBytes: bytes(oldCalls), afterBytes: bytes(newCalls),
    reductionPercent: +(100 * (1 - bytes(newCalls) / bytes(oldCalls))).toFixed(1), exactSummaryParity: true }));
  for (const role of ["anon", "authenticated"]) assert.throws(() => sql(`set role ${role}; select * from public.account_order_list_entries;`), /permission denied/);
  assert.equal(sql("select has_table_privilege('service_role', 'public.account_order_list_entries', 'INSERT,UPDATE,DELETE');"), "f");
  assert.equal(sql("select has_function_privilege('anon', 'public.account_order_list_state(jsonb)', 'EXECUTE');"), "f");
  assert.equal(sql("select reloptions::text from pg_class where oid='public.account_order_list_entries'::regclass;"), "{security_invoker=true,security_barrier=true}");
  assert.equal(ledgerHash(), before, "all list reads leave full records unchanged");
});
