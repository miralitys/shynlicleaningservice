"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const { gzipSync } = require("node:zlib");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { tableRow } = require("./support/orders-table-view.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry, mapEntryToRow } = require("../lib/supabase-quote-ops");
const { projectOrderListEntry, hydrateOrderListRow, ADMIN_ORDER_TABLE_VIEW, ADMIN_ORDER_LIST_VIEW,
  ORDER_LIST_SELECT, ORDER_TABLE_SELECT } = require("../lib/quote-ops/order-list");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { getCleanerConfirmationDisplay } = require("../lib/cleaner-confirmation");
const exec = promisify(execFile);
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const compact = orders => orders.map(({ entry, ...order }) => order);

function fixtureWithHistory(count = 1107) {
  const fixture = createFixture(count, 107);
  for (const [i, row] of fixture.rows.entries()) {
    const payload = row.payload_for_retry;
    payload.calculatorData = { ...payload.calculatorData, selectedTime: "11:00", frequency: "biweekly",
      selectedServices: { insideOven: true }, serviceQuantities: { interiorWindows: 6 },
      bedrooms: 3, bathrooms: 2.5, totalPrice: 417, quoteExplanation: "Saved calculation details" };
    payload.adminClient = { addressBook: [{ address: "QA second address", rooms: 4 }, { address: "QA third address", rooms: 2 }],
      notes: "Private client notes", photos: [{ path: "client-photo" }] };
    payload.adminLead = { status: i % 3 ? "confirmed" : "new", updatedAt: row.updated_at,
      managerId: "manager", managerName: "QA manager", tasks: [{ id: `task-${i}`, title: "Contact client",
        dueAt: "2099-01-01T12:00:00Z", status: i % 2 ? "open" : "completed", assigneeId: "manager" }],
      history: [{ oldValue: "Before", newValue: "After", comment: "Private task audit" }] };
    if (i % 3 === 0) delete payload.orderState;
    if (i % 7 === 0) payload.adminOrder.status = "canceled";
    payload.adminOrder.cleanerConfirmation = { signature: "QA signature", byStaffId: { a: { status: "declined" } } };
  }
  return fixture;
}

function semantics(entries) {
  return {
    orders: compact(domain.collectAdminOrderRecords(entries)),
    leads: filterQuoteOpsEntries(entries, { leadStatus: "new", excludeRemovedRecurringOrders: true }, normalizeString).map(e => e.id),
    tasks: entries.map(e => ({ id: e.id, status: domain.getLeadStatus(e), tasks: domain.getEntryLeadTasks(e) })),
    confirmations: entries.map(e => getCleanerConfirmationDisplay(e, { staffIds: ["a"], scheduleDate: "2099-01-01", scheduleTime: "09:00" })),
  };
}

test("table-only read preserves complete orders, filters, sidebar tasks and full client/history/finance paths", async () => {
  const fixture = fixtureWithHistory();
  const original = structuredClone(fixture);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 123 })) });
  const old = await client.fetchOrderListEntries();
  const start = calls.length;
  const slim = await client.fetchOrderListEntries({ forOrdersPage: true });
  assert.equal(slim.length, fixture.rows.length);
  assert.ok(calls.slice(start).every(c => c.table === ADMIN_ORDER_TABLE_VIEW));
  assert.deepEqual(semantics(slim), semantics(old));
  for (const filter of [{}, { status: "canceled" }, { status: "completed" }, { status: "scheduled" },
    { serviceType: "deep" }, { frequency: "biweekly" }, { q: "QA signature" }, { q: "Client" }, { assignment: "unassigned" }]) {
    assert.deepEqual(compact(domain.filterAdminOrderRecords(domain.collectAdminOrderRecords(slim), filter)),
      compact(domain.filterAdminOrderRecords(domain.collectAdminOrderRecords(old), filter)));
  }
  assert.doesNotMatch(JSON.stringify(slim), /Private client notes|QA second address|Private task audit|quoteExplanation/);
  assert.deepEqual(await client.fetchEntryById(fixture.rows[0].id), mapRowToEntry(fixture.rows[0]));
  const payroll = await client.fetchOrderListEntries({ forOrdersPage: true, includePayroll: true });
  assert.deepEqual(payroll, await client.fetchOrderListEntries({ includePayroll: true }));
  assert.deepEqual(fixture, original, "No source record can be changed by a display projection");
  assert.ok(calls.every(c => c.method === "GET"));
});

test("optional table migration falls back once; denied, malformed and mid-page failures never return partial lists", async () => {
  const fixture = fixtureWithHistory(12);
  const paths = [];
  const read = createReadFetch(fixture);
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
    paths.push(new URL(url).pathname);
    if (new URL(url).pathname.endsWith(ADMIN_ORDER_TABLE_VIEW)) return Promise.resolve({ ok: false, status: 404,
      text: async () => JSON.stringify({ code: "PGRST205", message: "Missing table migration" }) });
    return read(url, options);
  } });
  const legacyClient = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const expected = (await legacyClient.fetchOrderListEntries()).map(entry => projectOrderListEntry(entry, { forOrdersPage: true }));
  for (let i = 0; i < 2; i++) assert.deepEqual(await client.fetchOrderListEntries({ forOrdersPage: true }), expected);
  assert.equal(paths.filter(p => p.endsWith(ADMIN_ORDER_TABLE_VIEW)).length, 1);
  assert.equal(paths.filter(p => p.endsWith(ADMIN_ORDER_LIST_VIEW)).length, 2);
  for (const noCount of [false, true]) {
    const valid = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, [], () => ({ cap: 5, noCount })) });
    assert.deepEqual(await valid.fetchOrderListEntries({ forOrdersPage: true }), expected);
  }
  for (const [failureAt, code, status] of [[1, "42501", 403], [2, "PGRST205", 404], [2, "503", 503]]) {
    let n = 0;
    const paths = [];
    const read = createReadFetch(fixture, [], () => ({ cap: 5 }));
    const bad = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
      paths.push(new URL(url).pathname);
      if (++n === failureAt) return Promise.resolve({ ok: false, status,
        text: async () => JSON.stringify({ code, message: "Denied or incomplete read" }) });
      return read(url, options);
    } });
    await assert.rejects(bad.fetchOrderListEntries({ forOrdersPage: true }), /Denied or incomplete/);
    assert.ok(paths.every(p => p.endsWith(ADMIN_ORDER_TABLE_VIEW)));
  }
  const empty = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch({ ...fixture, rows: [] }) });
  assert.deepEqual(await empty.fetchOrderListEntries({ forOrdersPage: true }), []);
  const malformed = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true, status: 200, text: async () => "[{" }) });
  await assert.rejects(malformed.fetchOrderListEntries({ forOrdersPage: true }), SyntaxError);
});

test("PostgreSQL table projection is additive, matches legacy semantics and leaves every stored value unchanged", { timeout: 60000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0) { t.skip("Local PostgreSQL required"); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-order-table-pg-")), data = path.join(root, "db");
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55451", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async text => {
    await fs.writeFile(path.join(root, "query.sql"), text);
    return (await exec("psql", [...args, "-f", path.join(root, "query.sql")], { maxBuffer: 64 * 1024 * 1024 })).stdout.trim();
  };
  const migrate = file => exec("psql", [...args, "-f", path.join(__dirname, "../supabase", file)]);
  let started = false;
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "pg.log"), "-o", `-F -k ${root} -p 55451 -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await sql("create role anon; create role authenticated; create role service_role bypassrls;");
    await migrate("quote_ops_schema.sql");
    await migrate("admin_order_list.sql");
    await sql("grant select on public.quote_ops_entries to service_role;");
    const fixture = fixtureWithHistory();
    const variants = [undefined, null, {}, [], false, true, "legacy", 0, { private: "retained" },
      { completion: { cleanerComment: "note" } }, { completion: { beforePhotos: [false] } },
      { isCreated: false, completion: { afterPhotos: [false] } }, { policyAcceptance: { signature: "keep" } },
      { status: "scheduled", assignedStaff: "Cleaner", selectedDate: "2099-02-03" }];
    for (const state of variants) for (const legacy of variants) for (const extra of [null, [], false, "legacy", {},
      { selectedDate: "2099-03-04", selectedTime: "08:00", frequency: "monthly", serviceType: "standard", serviceDurationMinutes: 180,
        status: "new", tasks: [{ id: "default-hidden", status: "open" }, { id: "real", status: "open" }] }]) {
      const row = structuredClone(fixture.rows[0]);
      row.payload_for_retry.orderState = state;
      row.payload_for_retry.adminOrder = legacy;
      row.payload_for_retry.calculatorData = extra;
      row.payload_for_retry.adminLead = extra;
      fixture.rows.push(row);
    }
    const rows = fixture.rows.map((row, i) => ({ ...mapEntryToRow(mapRowToEntry(row)),
      id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`, payload_for_retry: row.payload_for_retry }));
    const literal = JSON.stringify(rows).replaceAll("'", "''");
    await sql(`insert into public.quote_ops_entries select * from jsonb_populate_recordset(null::public.quote_ops_entries, '${literal}'::jsonb);`);
    const hash = table => sql(`select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.${table} q`);
    const before = await hash("quote_ops_entries"), beforeView = await hash("admin_order_list_entries");
    await migrate("admin_order_table.sql");
    await migrate("admin_order_table.sql");
    assert.equal(await hash("quote_ops_entries"), before);
    assert.equal(await hash("admin_order_list_entries"), beforeView);
    const select = table => sql(`begin read only; set local role service_role; select jsonb_agg(to_jsonb(q) order by id) from public.${table} q; commit;`);
    const oldRows = JSON.parse(await select("admin_order_list_entries"));
    const newRows = JSON.parse(await select("admin_order_table_entries"));
    assert.equal(newRows.length, rows.length);
    assert.deepEqual(newRows, oldRows.map(tableRow));
    const old = oldRows.map(row => projectOrderListEntry(mapRowToEntry(row)));
    const slim = newRows.map(row => projectOrderListEntry(mapRowToEntry(hydrateOrderListRow(row)), { forOrdersPage: true }));
    assert.deepEqual(semantics(slim), semantics(old));
    for (const role of ["anon", "authenticated"]) await assert.rejects(sql(`set role ${role}; select * from public.admin_order_table_entries;`), /permission denied/);
    assert.equal(await sql("select has_table_privilege('service_role','public.admin_order_table_entries','INSERT,UPDATE,DELETE')"), "f");
    assert.match(await sql("select reloptions from pg_class where relname='admin_order_table_entries'"), /security_invoker=true/);
    const bytes = values => Buffer.byteLength(JSON.stringify(values));
    const gzip = values => gzipSync(JSON.stringify(values)).length;
    const selectFields = ORDER_LIST_SELECT.split(",").map(field => field.includes(":")
      ? field.replace(/^(\w+):payload_for_retry->(\w+)$/, "payload_for_retry->'$2' as \"$1\"") : field).join(",");
    const timings = { before: [], after: [] };
    for (let pass = 0; pass < 11; pass++) for (const [name, view] of [["before", ADMIN_ORDER_LIST_VIEW], ["after", ADMIN_ORDER_TABLE_VIEW]]) {
      const columns = name === "after" ? ORDER_TABLE_SELECT.split(",").map(field => `"${field}"`).join(",") : selectFields;
      const explain = JSON.parse(await sql(`explain (analyze, buffers, format json) select ${columns} from public.${view} order by id limit 500;`));
      timings[name].push(explain[0]["Execution Time"]);
    }
    const summary = values => {
      const warm = values.slice(1).sort((a, b) => a - b);
      return { coldMs: values[0], warmMedianMs: (warm[4] + warm[5]) / 2, warmP95Ms: warm[9] };
    };
    const report = { synthetic: true, rows: rows.length, beforeBytes: bytes(oldRows), afterBytes: bytes(newRows),
      beforeGzip: gzip(oldRows), afterGzip: gzip(newRows), originalViewUnchanged: true, allStoredValuesUnchanged: true,
      sql: { before: summary(timings.before), after: summary(timings.after), samples: timings } };
    if (process.env.ORDERS_TABLE_SQL_REPORT) await fs.writeFile(process.env.ORDERS_TABLE_SQL_REPORT, JSON.stringify(report, null, 2));
    t.diagnostic(JSON.stringify(report));
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
