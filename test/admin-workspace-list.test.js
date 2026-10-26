"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry, mapEntryToRow } = require("../lib/supabase-quote-ops");
const { projectWorkspaceListEntry, hydrateWorkspaceListRow, WORKSPACE_LIST_SELECT, WORKSPACE_PAYLOAD_KEYS } = require("../lib/quote-ops/workspace-list");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { hasEntryOrderState } = require("../lib/admin-order-state");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { createQuoteOpsHelpers } = require("../lib/admin/pages/quote-ops-helpers");
const { createOrdersUiQuoteHelpers } = require("../lib/admin/pages/orders-ui-quote-helpers");
const { getLegacyQuoteHistory } = require("../lib/admin/pages/quote-ops-archive");
const { runAdminReadContext } = require("../lib/admin/read-context");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const helpers = createQuoteOpsHelpers({ ...domain, normalizeString });
const quote = createOrdersUiQuoteHelpers({ normalizeString });
const semantics = entries => entries.map(entry => ({ id: entry.id, hasOrder: hasEntryOrderState(entry),
  lead: domain.getLeadStatus(entry), tasks: domain.getEntryLeadTasks(entry),
  comment: quote.getOrderQuoteData({ entry }).additionalDetails, manager: helpers.getQuoteLeadManager(entry),
  name: entry.customerName, phone: entry.customerPhone, address: entry.fullAddress,
  price: entry.totalPrice, priceCents: entry.totalPriceCents, retryCount: entry.retryCount }));
const ascending = entries => [...entries].sort((a, b) => a.id.localeCompare(b.id));
const ids = entries => entries.map(entry => entry.id).sort();

function addTasks(fixture) {
  fixture.rows.forEach((row, i) => {
    row.payload_for_retry.adminLead = { status: ["new", "discussion", "confirmed", "declined"][i % 4],
      updatedAt: "2026-10-01T12:00:00Z", managerId: "manager", managerName: "Test Manager", managerEmail: "manager@example.test",
      notes: `Comment ${i}`, taskStatusAudit: [{ privateHistory: "not a list field" }],
      tasks: [{ id: "shared-task", title: `Call ${i}`, kind: "manual", status: i % 2 ? "open" : "completed",
        assigneeId: "eva", assigneeName: "Synthetic Eva", assigneeRole: "viewer", dueAt: "2026-10-01T12:00:00Z",
        createdAt: "2026-10-01T12:00:00Z", comment: `Task note ${i}` }, { id: "default-old", status: "open" }] };
  });
}

test("workspace walks more than 1000 rows before filtering, stays fresh and retains all task states", async () => {
  const fixture = createFixture(1107, 157);
  addTasks(fixture);
  const before = structuredClone(fixture);
  for (const noCount of [false, true]) {
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 37, noCount })) });
    const actual = await client.fetchWorkspaceListEntries();
    assert.deepEqual(semantics(actual), semantics(ascending(fixture.rows.map(mapRowToEntry))));
    assert(calls.length > 25);
    assert(calls.every(call => call.method === "GET" && call.table === "admin_workspace_list_entries"));
    assert.doesNotMatch(JSON.stringify(actual), /adminSms|signatureDataUrl|payrollOverrides|taskStatusAudit/);
    assert.deepEqual(fixture, before);
    fixture.rows[0].total_price = 777.25;
    fixture.rows[0].payload_for_retry.adminLead.tasks[0].status = "open";
    await runAdminReadContext({ res: {}, route: "/admin/quote-ops" }, async () => {
      const fresh = await client.fetchWorkspaceListEntries();
      assert.equal(fresh.find(row => row.id === fixture.rows[0].id).totalPrice, 777.25);
      assert.equal(domain.getEntryLeadTasks(fresh.find(row => row.id === fixture.rows[0].id))[0].status, "open");
    });
    fixture.rows[0] = structuredClone(before.rows[0]);
  }
});

test("missing migration falls back once to a complete read, never on denial or a broken later page", async () => {
  const fixture = createFixture(17, 5);
  addTasks(fixture);
  const calls = [];
  const paths = [];
  const read = createReadFetch(fixture, calls, () => ({ missingWorkspaceView: true, cap: 5 }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => { paths.push(new URL(url).pathname); return read(url, options); } });
  for (let i = 0; i < 2; i++) assert.deepEqual(semantics(await client.fetchWorkspaceListEntries()), semantics(ascending(fixture.rows.map(mapRowToEntry))));
  assert.equal(paths.filter(p => p.endsWith("admin_workspace_list_entries")).length, 1);
  const denied = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, [], () => ({ workspaceViewError: true })) });
  await assert.rejects(denied.fetchWorkspaceListEntries(), /Workspace denied/);
  for (const code of ["PGRST205", "42501", "503"]) {
    let count = 0;
    const calls = [];
    const normal = createReadFetch(fixture, [], () => ({ cap: 5 }));
    const broken = createSupabaseQuoteOpsClient({ env, fetch: (url, options) => {
      calls.push(new URL(url).pathname);
      if (new URL(url).pathname.endsWith("read_admin_workspace_page")) return normal(url, options);
      return ++count === 2 ? Promise.resolve({ ok: false, status: 503, text: async () => JSON.stringify({ code, message: "Later page failed" }) }) : normal(url, options);
    } });
    const store = createQuoteOpsStore({ normalizeString, QUOTE_OPS_LEDGER_LIMIT: 250, createSupabaseQuoteOpsClient: () => broken });
    await assert.rejects(store.listWorkspaceListEntries(), /Later page failed/);
    assert(calls.every(p => p.endsWith("admin_workspace_list_entries") || p.endsWith("read_admin_workspace_page")));
  }
});

test("empty, malformed and invalid-cursor responses are explicit, not partial fallbacks", async () => {
  const fixture = createFixture(2, 1);
  for (const body of [{}, [{ id: "a" }], [null]]) {
    const client = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true, text: async () => JSON.stringify(body) }) });
    await assert.rejects(client.fetchWorkspaceListEntries(), /Invalid workspace list/);
  }
  const empty = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch({ ...fixture, workspaceRows: [] }) });
  assert.deepEqual(await empty.fetchWorkspaceListEntries(), []);
});

test("display reads never replace full documents, financial fields or history in the mutation cache", async () => {
  const fixture = createFixture(4, 2);
  addTasks(fixture);
  const before = structuredClone(fixture);
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const store = createQuoteOpsStore({ normalizeString, QUOTE_OPS_LEDGER_LIMIT: 250, createSupabaseQuoteOpsClient: () => client });
  await store.listWorkspaceListEntries();
  const entry = await store.getEntry(fixture.rows[0].id);
  assert.deepEqual(entry, mapRowToEntry(fixture.rows[0]));
  assert(entry.payloadForRetry.orderState.payroll);
  assert(entry.payloadForRetry.orderState.payrollOverrides);
  assert(entry.payloadForRetry.adminSms.history.length);
  assert.deepEqual(fixture, before);
});

test("custom tables retain complete original reads and never use a default-table view", async () => {
  const fixture = createFixture(17, 5);
  const read = createReadFetch(fixture, [], () => ({ cap: 5 }));
  const paths = [];
  const client = createSupabaseQuoteOpsClient({ env: { ...env, SUPABASE_QUOTE_OPS_TABLE: "custom_ledger" }, fetch: (url, options) => {
    const parsed = new URL(url); paths.push(parsed.pathname);
    assert.equal(parsed.pathname, "/rest/v1/custom_ledger");
    parsed.pathname = "/rest/v1/quote_ops_entries"; return read(parsed, options);
  } });
  assert.equal((await client.fetchWorkspaceListEntries()).length, fixture.rows.length);
  assert(paths.length > 2);
});

let pgBin;
try { pgBin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim(); } catch {}
test("PostgreSQL workspace view preserves legacy recognition, series/archive membership, comments and filters", {
  skip: !pgBin || process.getuid?.() === 0 ? "Local PostgreSQL required" : false,
}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-workspace-pg-"));
  const dir = path.join(root, "db");
  const run = (bin, args) => execFileSync(path.join(pgBin, bin), args, { encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  let started = false;
  t.after(() => { if (started) run("pg_ctl", ["-D", dir, "-m", "immediate", "stop"]); fs.rmSync(root, { recursive: true, force: true }); });
  run("initdb", ["-D", dir, "-A", "trust", "-U", "workspace_qa", "--no-locale"]);
  run("pg_ctl", ["-D", dir, "-l", path.join(root, "postgres.log"), "-o", `-k ${root} -p 55449 -c listen_addresses=''`, "-w", "start"]); started = true;
  const sql = text => { const file = path.join(root, "query.sql"); fs.writeFileSync(file, text);
    return run("psql", ["-X", "-h", root, "-p", "55449", "-U", "workspace_qa", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq", "-f", file]).trim(); };
  const migration = name => sql(fs.readFileSync(path.join(__dirname, "../supabase", name), "utf8"));
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  sql("create role anon; create role authenticated; create role service_role bypassrls;");
  migration("quote_ops_schema.sql"); sql("grant select on public.quote_ops_entries to service_role;");
  const fixture = createFixture(1107, 157);
  const states = [undefined, null, {}, [], false, "legacy", { unknown: true }, { policyAcceptance: {} },
    { payrollOverrides: { a: "0" } }, { status: "scheduled" }, { managerConfirmationRequired: true, recurringSeriesId: "modern" },
    { managerConfirmationRequired: false, recurringSourceEntryId: "source" }, { isCreated: false, completion: { beforePhotos: [false] } },
    ...["note", "", "\t", " ".repeat(4100) + "note", [], {}, false, 0].map(cleanerComment => ({ completion: { cleanerComment } }))];
  for (const orderState of states) for (const adminOrder of states) {
    const row = structuredClone(fixture.rows[0]);
    delete row.payload_for_retry.orderState; delete row.payload_for_retry.adminOrder;
    if (orderState !== undefined) row.payload_for_retry.orderState = orderState;
    if (adminOrder !== undefined) row.payload_for_retry.adminOrder = adminOrder;
    row.payload_for_retry.calculatorData = { fullAddress: "Same home", additionalDetails: "" };
    row.payload_for_retry.adminClient = { photos: ["PRIVATE PHOTO"], addressBook: [
      { address: "Different home", notes: "WRONG HOME" }, { address: row.full_address, notes: "Selected home note", roomCount: "4" }] };
    fixture.rows.push(row);
  }
  addTasks(fixture);
  fixture.rows[0].payload_for_retry.adminLead.notes = "";
  fixture.rows[0].payload_for_retry.adminClient = { addressBook: [{ address: fixture.rows[0].full_address, notes: "Address note fallback" }] };
  fixture.rows[0].payload_for_retry.calculatorData = {};
  fixture.rows.forEach((row, i) => { row.id = `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`; });
  fixture.rows[0].payload_for_retry.orderState = { isCreated: true, managerConfirmationRequired: true, recurringSeriesId: "shared-series" };
  fixture.rows[1].payload_for_retry.orderState = { isCreated: true, recurringSeriesId: "shared-series", recurringSourceEntryId: fixture.rows[0].id };
  delete fixture.rows[2].payload_for_retry.orderState;
  fixture.rows[2].payload_for_retry.adminOrder = { isCreated: true, recurringSourceEntryId: fixture.rows[1].id };
  fixture.rows = fixture.rows.map(row => ({ ...mapEntryToRow(mapRowToEntry(row)), payload_for_retry: row.payload_for_retry }));
  sql(`insert into public.quote_ops_entries select * from jsonb_populate_recordset(null::public.quote_ops_entries, ${literal(fixture.rows)});`);
  const checksum = () => sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;");
  const before = checksum();
  migration("admin_order_list.sql"); migration("admin_workspace_list.sql"); migration("admin_workspace_list.sql"); migration("admin_menu.sql");
  migration("admin_workspace_page.sql"); migration("admin_workspace_page.sql");
  assert.equal(checksum(), before);
  fixture.rows = JSON.parse(sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q;"));
  fixture.workspaceRows = JSON.parse(sql("set role service_role; select jsonb_agg(to_jsonb(q) order by id) from public.admin_workspace_list_entries q;"));
  fixture.adminMenuRows = JSON.parse(sql("set role service_role; select jsonb_agg(to_jsonb(q) order by id) from public.admin_menu_entries q;"));
  const full = ascending(fixture.rows.map(mapRowToEntry));
  const expected = full.map(projectWorkspaceListEntry);
  const rpcRows = [];
  let after = null;
  for (;;) {
    const page = JSON.parse(sql(`set role service_role; select public.read_admin_workspace_page(${after ? `'${after}'::uuid` : "null"}, 500);`));
    assert.equal(page.after, after);
    assert.equal(page.version, 1);
    assert.equal(page.rows.length, Math.min(500, page.total));
    rpcRows.push(...page.rows);
    if (page.rows.length === page.total) break;
    after = page.rows.at(-1).id;
  }
  fixture.workspacePageRows = rpcRows;
  const rpcClient = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, [], () => ({ workspacePage: true })) });
  assert.deepEqual(semantics(await rpcClient.fetchWorkspaceListEntries()), semantics(full));
  assert.equal(rpcRows.length, fixture.workspaceRows.length);
  rpcRows.forEach((row, i) => assert.deepEqual(projectWorkspaceListEntry(mapRowToEntry(hydrateWorkspaceListRow(row))),
    projectWorkspaceListEntry(mapRowToEntry(fixture.workspaceRows[i])), `Workspace RPC row ${i}`));
  for (const noCount of [false, true]) {
    const calls = [];
    const actual = await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 37, noCount })) }).fetchWorkspaceListEntries();
    assert.deepEqual(semantics(actual), semantics(full));
    assert.deepEqual(semantics(actual), semantics(expected));
    assert.deepEqual(ids(getLegacyQuoteHistory(actual)), ids(getLegacyQuoteHistory(full)));
    const archived = ids(getLegacyQuoteHistory(actual));
    for (const row of fixture.rows.slice(0, 3)) assert(!archived.includes(row.id), "Modern series must stay out of legacy archive");
    assert(archived.includes(fixture.rows[3].id), "An unrelated old request must remain visible");
    for (const filter of [{}, { leadStatus: "new" }, { leadStatus: "confirmed" }, { managerId: "manager" },
      { q: "Test Manager" }, { q: "Synthetic Eva" }, { q: "Test Street" }, { q: "manual-1" }, { includeHidden: true }]) {
      assert.deepEqual(ids(filterQuoteOpsEntries(actual, filter, normalizeString)), ids(filterQuoteOpsEntries(full, filter, normalizeString)));
    }
    assert(calls.every(call => call.method === "GET" && call.table === "admin_workspace_list_entries"));
    const menu = await createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, [], () => ({ cap: 37, noCount })) }).fetchAdminMenuEntries();
    const count = entries => filterQuoteOpsEntries(entries, {}, normalizeString)
      .reduce((sum, entry) => sum + (domain.getLeadStatus(entry) === "new"
        ? domain.getEntryLeadTasks(entry).filter(task => task.status === "open").length : 0), 0);
    assert.equal(count(menu), count(full), "Menu counts must use the complete original task semantics");
  }
  for (const role of ["anon", "authenticated"]) assert.throws(() => sql(`set role ${role}; select * from public.admin_workspace_list_entries;`), /permission denied/);
  for (const role of ["anon", "authenticated"]) assert.throws(() => sql(`set role ${role}; select public.read_admin_workspace_page();`), /permission denied/);
  assert.throws(() => sql("set role service_role; select public.read_admin_workspace_page(null, 501);"), /Workspace page limit/);
  assert.equal(sql("select provolatile::text || ':' || prosecdef::text from pg_proc where oid = 'public.read_admin_workspace_page(uuid,integer)'::regprocedure;"), "s:false");
  assert.equal(sql("select has_table_privilege('service_role', 'public.admin_workspace_list_entries', 'INSERT,UPDATE,DELETE');"), "f");
  assert.equal(sql("select has_function_privilege('anon', 'public.admin_workspace_state(jsonb)', 'EXECUTE');"), "f");
  assert.equal(checksum(), before, "No order, address, history, team or payout changes");
  if (process.env.WORKSPACE_SQL_BENCHMARK === "1") {
    const selected = WORKSPACE_LIST_SELECT.split(",").filter(column => !column.includes(":")).concat(
      WORKSPACE_PAYLOAD_KEYS.map(key => `payload_for_retry->'${key}' as "workspace_${key}"`)).join(",");
    const cursors = [null];
    for (let i = 499; i < fixture.rows.length - 1; i += 500) cursors.push(fixture.rows[i].id);
    const oldQuery = cursor => {
      const where = cursor ? `where id > '${cursor}'::uuid` : "";
      return `with pgrst_source as (select ${selected} from public.admin_workspace_list_entries ${where} order by id limit 500),
        pgrst_source_count as (select 1 from public.admin_workspace_list_entries ${where})
        select (select count(*) from pgrst_source_count), count(r), coalesce(json_agg(r),'[]') from pgrst_source r`;
    };
    const newQuery = cursor => `select public.read_admin_workspace_page(${cursor ? `'${cursor}'::uuid` : "null"},500)::text`;
    const explain = query => JSON.parse(sql(`set role service_role; explain (analyze,buffers,format json) ${query};`))[0];
    const samples = [];
    for (let round = 0; round < 10; round++) {
      const sample = { round: round + 1, old: [], current: [] };
      for (const [key, query] of (round % 2 ? [["current",newQuery],["old",oldQuery]] : [["old",oldQuery],["current",newQuery]])) {
        for (const cursor of cursors) sample[key].push(explain(query(cursor))["Execution Time"]);
      }
      samples.push(sample);
    }
    const migrationText = fs.readFileSync(path.join(__dirname, "../supabase/admin_workspace_page.sql"), "utf8");
    const pageQuery = migrationText.slice(migrationText.indexOf("with raw_page"), migrationText.indexOf("  return jsonb_build_object"))
      .replace(" into result_rows", "").replaceAll("p_limit", "500").replaceAll("p_after", "null::uuid").trim().replace(/;$/, "");
    const pagePlan = explain(pageQuery);
    const nodes = [];
    const walk = node => { nodes.push({ type: node["Node Type"], cte: node["CTE Name"], name: node["Subplan Name"], rows: node["Actual Rows"] });
      (node.Plans || []).forEach(walk); };
    walk(pagePlan.Plan);
    assert.equal(nodes.find(n => n.name === "CTE projected").rows, 500);
    assert.equal(nodes.find(n => n.name === "CTE raw_page").rows, 500);
    assert.equal(checksum(), before);
    t.diagnostic(JSON.stringify({ workspaceSqlBenchmark: { rows: full.length, pages: cursors.length, samples, nodes } }));
  }
  t.diagnostic(JSON.stringify({ rows: full.length, beforeBytes: Buffer.byteLength(JSON.stringify(fixture.rows)),
    afterBytes: Buffer.byteLength(JSON.stringify(fixture.workspaceRows)), unchanged: true }));
});
