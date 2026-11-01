"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { gzipSync } = require("node:zlib");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");
const { createSupabaseQuoteOpsClient, mapRowToEntry, mapEntryToRow } = require("../lib/supabase-quote-ops");
const { adminDirectorySelect, hydrateAdminDirectoryRow, projectAdminDirectoryEntry } = require("../lib/quote-ops/admin-directory");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { hasEntryOrderState } = require("../lib/admin-order-state");

let pgBin;
try { pgBin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const normalizeString = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

test("PostgreSQL client view exactly preserves directory, addresses, legacy orders and full history without modifying records", {
  skip: !pgBin || process.getuid?.() === 0 ? "Local PostgreSQL and an unprivileged user are required" : false,
  timeout: 120000,
}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-client-directory-pg-")), dir = path.join(root, "db");
  const run = (bin, args) => execFileSync(path.join(pgBin, bin), args,
    { encoding: "utf8", timeout: 45000, maxBuffer: 96 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  let started = false;
  t.after(() => {
    try { if (started) run("pg_ctl", ["-D", dir, "-m", "immediate", "stop"]); }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  run("initdb", ["-D", dir, "-A", "trust", "-U", "clients_qa", "--no-locale"]);
  run("pg_ctl", ["-D", dir, "-l", path.join(root, "postgres.log"), "-o", `-k ${root} -h '' -p 55458`, "start"]);
  started = true;
  const sql = source => {
    const file = path.join(root, "query.sql"); fs.writeFileSync(file, source);
    return run("psql", ["-X", "-h", root, "-p", "55458", "-U", "clients_qa", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-Atq", "-f", file]).trim();
  };
  const migrate = name => sql(fs.readFileSync(path.join(__dirname, "../supabase", name), "utf8"));
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  sql("create role anon; create role authenticated; create role service_role bypassrls;");
  migrate("quote_ops_schema.sql");
  sql("grant select on public.quote_ops_entries to service_role;");
  const fixture = createFixture(1107, 107);
  fixture.rows.forEach((row, i) => {
    row.customer_phone = String(2025550000 + i % 135);
    row.customer_email = `${i % 135}@example.test`;
    row.created_at = new Date(Date.UTC(2026, 9, 1, 0, 0, i % 20)).toISOString();
    row.payload_for_retry.adminClient = { ...row.payload_for_retry.adminClient,
      secondaryPhone: i === 0 ? "2025550136" : "", notes: "Retained client note",
      automaticNotificationsEnabled: false, paymentNotificationsEnabled: false,
      addressBook: [{ address: "Second test house", roomCount: "5", bathroomCount: "3", squareFootage: "2800", notes: "Door code retained" }],
      removedAddressKeys: ["removed test house"] };
    row.payload_for_retry.adminLead = { status: "confirmed", tasks: [{ id: `task-${i}`, status: "completed" }], unknownLegacyField: "Keep" };
  });
  fixture.rows[0].kind = "client_record";
  const variants = [undefined, null, {}, [], ["legacy"], false, true, "legacy", 0,
    { unknownField: true }, { policyAcceptance: {} }, { payroll: { items: [{ amountCents: 50000, status: "paid" }] } },
    { completion: null }, { completion: [] }, { completion: {} }, { completion: { beforePhotos: [{ path: "PRIVATE-PHOTO" }] } },
    { isCreated: false, completion: { afterPhotos: [false] } },
    ...["note", "", "\u00a0", "\t\n", [], [null, null], {}, false, true, 0].map(cleanerComment => ({ completion: { cleanerComment } })),
    { status: "canceled", selectedDate: "2026-01-01", selectedTime: "09:00", assignedStaff: "Cleaner A", payrollOverrides: { a: "500" } },
    { status: "rescheduled" }, { status: "completed" }, { frequency: "biweekly", recurringSeriesId: "keep-series" }];
  for (const orderState of variants) for (const adminOrder of variants) {
    const row = structuredClone(fixture.rows[1]);
    row.payload_for_retry.orderState = orderState;
    row.payload_for_retry.adminOrder = adminOrder;
    fixture.rows.push(row);
  }
  for (const payload of [null, [], false, "legacy"]) fixture.rows.push({ ...fixture.rows[1], payload_for_retry: payload });
  fixture.rows = fixture.rows.map((row, i) => ({ ...mapEntryToRow(mapRowToEntry(row)),
    id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`, payload_for_retry: row.payload_for_retry }));
  for (let i = 0; i < fixture.rows.length; i += 100) {
    sql(`insert into public.quote_ops_entries select * from jsonb_populate_recordset(null::public.quote_ops_entries, ${literal(fixture.rows.slice(i, i + 100))});`);
  }
  const hash = () => sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;");
  const before = hash();
  migrate("admin_client_directory.sql"); migrate("admin_client_directory.sql");
  assert.equal(hash(), before, "Installing and reinstalling the view must not modify data");
  fixture.rows = JSON.parse(sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q;"));
  fixture.clientDirectoryRows = JSON.parse(sql("set role service_role; select jsonb_agg(to_jsonb(q) order by id) from public.admin_client_directory_entries q;"));
  const oldRows = fixture.rows.map(row => Object.fromEntries(adminDirectorySelect(true).split(",").map(field => {
    const [alias, expression] = field.includes(":") ? field.split(":") : [field, field];
    return [alias, expression.split("->").reduce((value, key) => value?.[key], row) ?? null];
  })));
  const project = rows => rows.map(row => projectAdminDirectoryEntry(mapRowToEntry(hydrateAdminDirectoryRow(row, true)), true));
  assert.deepEqual(project(fixture.clientDirectoryRows), project(oldRows), "Exact SQL/old JS DTO parity, including all legacy root pairs");
  assert.doesNotMatch(JSON.stringify(fixture.clientDirectoryRows), /signatureDataUrl|PRIVATE-PHOTO|checklistItems|amountCents|adminSms/);
  const domain = createAdminDomainHelpers({ normalizeString });
  const sorted = entries => entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const expected = sorted(project(oldRows));
  const visible = entries => filterQuoteOpsEntries(entries, {}, normalizeString);
  const expectedClients = domain.collectAdminClientRecords(visible(expected));
  for (const noCount of [false, true]) {
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 123, noCount })) });
    const actual = await client.fetchAdminDirectoryEntries({ includeClients: true });
    assert.equal(actual.length, fixture.rows.length);
    assert.deepEqual(actual, expected);
    assert.deepEqual(actual.map(hasEntryOrderState), expected.map(hasEntryOrderState));
    const clients = domain.collectAdminClientRecords(visible(actual));
    assert.deepEqual(clients, expectedClients);
    for (const filters of [{}, { q: "Second test house" }, { q: "Retained client note" }, { q: "manual-1106" },
      { phone: "0136" }, { email: "3@example.test" }, { lifecycle: "permanent" }, { serviceSegment: "nonregular" }]) {
      assert.deepEqual(domain.filterAdminClientRecords(clients, filters), domain.filterAdminClientRecords(expectedClients, filters));
    }
    assert(calls.length > 10 && calls.every(call => call.method === "GET" && call.table === "admin_client_directory_entries"));
    for (const row of [fixture.rows[0], fixture.rows[1106], fixture.rows.at(-1)]) {
      assert.deepEqual(await client.fetchEntryById(row.id), mapRowToEntry(row), "Complete cards retain photos, policy, payroll and SMS");
    }
  }
  for (const role of ["anon", "authenticated"]) {
    assert.throws(() => sql(`set role ${role}; select * from public.admin_client_directory_entries;`), /permission denied/);
    assert.throws(() => sql(`set role ${role}; select public.admin_client_directory_state('{}');`), /permission denied/);
  }
  assert.equal(sql("select has_table_privilege('service_role', 'public.admin_client_directory_entries', 'INSERT,UPDATE,DELETE');"), "f");
  assert.equal(sql("select reloptions::text from pg_class where oid='public.admin_client_directory_entries'::regclass;"), "{security_invoker=true,security_barrier=true}");
  assert.equal(hash(), before, "Dates, prices, teams, payouts and complete history stay byte-for-byte unchanged");
  const sizes = rows => ({ json: Buffer.byteLength(JSON.stringify(rows)), gzip: gzipSync(JSON.stringify(rows)).length });
  const oldSize = sizes(oldRows), newSize = sizes(fixture.clientDirectoryRows);
  assert(newSize.json < oldSize.json && newSize.gzip < oldSize.gzip);
  t.diagnostic(JSON.stringify({ syntheticRows: fixture.rows.length, clients: expectedClients.length,
    oldSize, newSize, reductionPercent: +(100 * (1 - newSize.json / oldSize.json)).toFixed(1),
    exactDirectoryParity: true, allRecordsUnchanged: true, completeHistoryReadable: true }));
});
