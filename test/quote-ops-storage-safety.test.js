"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { mapEntryToRow } = require("../lib/supabase-quote-ops");
const { createAdminDomainHelpers } = require("../lib/admin/domain");

const normalizeString = value => String(value || "").trim();
const domain = createAdminDomainHelpers({ normalizeString });
const input = { ok: true, customerName: "Local Storage QA", customerPhone: "6305550199", totalPrice: 417,
  payloadForRetry: { calculatorData: { rooms: 3, bathrooms: 2.5, services: ["ovenCleaning"] } } };

test("trash retains full order and customer data; explicit restores are guarded", async () => {
  const store = createQuoteOpsStore({ ...domain, normalizeString, env: {}, QUOTE_OPS_LEDGER_LIMIT: 100 });
  const created = await store.recordSubmission(input);
  await store.updateOrderEntry(created.id, { createOrder: true, orderStatus: "scheduled", assignedStaff: "Cleaner A", totalPrice: 417 });
  const before = structuredClone(await store.getEntry(created.id));
  await assert.rejects(store.deleteEntry(created.id, { requireNoOrder: true }), /containing an order/);
  assert.deepEqual(await store.getEntry(created.id), before);
  await store.updateOrderEntry(created.id, { removeOrder: true });
  const orderTrash = (await store.listTrash())[0];
  assert.deepEqual(orderTrash.row_data, before);
  assert.ok(await store.getEntry(created.id), "customer remains after removing only the order");
  await assert.rejects(store.updateOrderEntry(created.id, { totalPrice: 999 }), /Order is in trash/);
  await store.restoreTrash(orderTrash.id);
  assert.deepEqual(await store.getEntry(created.id), before);
  await store.deleteEntry(created.id);
  assert.equal(await store.getEntry(created.id), null);
  const clientTrash = (await store.listTrash())[0];
  assert.deepEqual(clientTrash.row_data, before);
  await store.restoreTrash(clientTrash.id);
  assert.deepEqual(await store.getEntry(created.id), before);
  assert.equal((await store.listTrash()).length, 0);
});

test("write outages, read outages and stale versions never mutate caches or return success", async () => {
  let saved;
  let offline = false;
  let failRead = false;
  let conflict = false;
  let cacheWrites = 0;
  const store = createQuoteOpsStore({ ...domain, normalizeString, env: {}, QUOTE_OPS_LEDGER_LIMIT: 100,
    orderStore: { async upsertEntry() { cacheWrites++; } },
    createSupabaseQuoteOpsClient: () => ({ isConfigured: () => true,
      async upsertEntry(entry) { if (offline) throw new Error("database offline"); saved = structuredClone(entry); },
      async fetchEntryById() { if (failRead) throw new Error("read offline"); return structuredClone(saved); },
      async fetchEntryByRequestId() { if (failRead) throw new Error("read offline"); return structuredClone(saved); },
      async updateEntryIfUnchanged(entry) { if (offline) throw new Error("database offline"); if (conflict) return false; saved = structuredClone(entry); return true; },
      async deleteEntry() { if (offline) throw new Error("database offline"); saved = null; return true; },
    }),
  });
  const entry = await store.recordSubmission(input);
  const before = structuredClone(saved);
  const initialCacheWrites = cacheWrites;
  offline = true;
  for (const mutate of [() => store.recordSubmission(input), () => store.updateOrderEntry(entry.id, { totalPrice: 999 }),
    () => store.updateClientEntry(entry.id, { name: "Unexpected rename" }), () => store.updateLeadEntry(entry.id, { status: "declined" }),
    () => store.recordPaymentEvent("request", { status: "paid" }), () => store.deleteEntry(entry.id)]) {
    await assert.rejects(mutate(), /offline/);
    assert.deepEqual(saved, before);
    assert.equal(cacheWrites, initialCacheWrites);
  }
  offline = false;
  failRead = true;
  await assert.rejects(store.updateOrderEntry(entry.id, { totalPrice: 999 }), /read offline/);
  failRead = false;
  conflict = true;
  await assert.rejects(store.updateOrderEntry(entry.id, { totalPrice: 999 }), /changed or was removed/);
  saved = null;
  assert.equal(await store.updateOrderEntry(entry.id, { totalPrice: 999 }), null, "memory must not resurrect a removed row");
  assert.equal(cacheWrites, initialCacheWrites);
});

test("production cannot accept business writes into memory-only storage", async () => {
  const store = createQuoteOpsStore({ ...domain, normalizeString, env: { NODE_ENV: "production" }, QUOTE_OPS_LEDGER_LIMIT: 100 });
  await assert.rejects(store.recordSubmission(input), /Database storage is required/);
});

let pgBin;
try { pgBin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
test("PostgreSQL: atomic trash, history, version guards, restores and rollback on journal failure", {
  skip: !pgBin || process.getuid?.() === 0 ? "Local PostgreSQL binaries and an unprivileged user are required" : false,
}, async t => {
  // A fresh Unix-socket-only cluster. Never reads credentials or connects to a configured database.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-storage-pg-"));
  const dir = path.join(root, "db");
  const run = (bin, args, extra = {}) => execFileSync(path.join(pgBin, bin), args,
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...extra });
  let started = false;
  t.after(() => {
    if (started) run("pg_ctl", ["-D", dir, "-m", "immediate", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  });
  run("initdb", ["-D", dir, "-A", "trust", "-U", "storage_qa", "--no-locale"]);
  run("pg_ctl", ["-D", dir, "-l", path.join(root, "postgres.log"), "-o", `-k ${root} -h '' -p 55438`, "start"]);
  started = true;
  const sql = text => run("psql", ["-X", "-h", root, "-p", "55438", "-U", "storage_qa", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { input: text }).trim();
  const migration = name => sql(fs.readFileSync(path.join(__dirname, "..", "supabase", name), "utf8"));
  const literal = object => `'${JSON.stringify(object).replaceAll("'", "''")}'::jsonb`;
  const id = "11111111-1111-4111-8111-111111111111";
  const ctx = literal({ actor: { id: "qa-manager", name: "QA Manager" }, requestId: "qa-write", route: "/admin/orders" });
  const row = mapEntryToRow({ ...input, id, kind: "quote_submission", status: "success", requestId: "storage-qa",
    createdAt: "2026-08-12T19:30:00.000Z", updatedAt: "2026-08-12T19:30:00.000Z",
    payloadForRetry: { ...input.payloadForRetry, adminSms: { history: [{ message: "private-sms-fixture" }] },
      orderState: { isCreated: true, status: "scheduled", assignedStaff: "Cleaner A", policyAcceptance: { secureToken: "private-policy-fixture", status: "accepted" } } } });
  sql("create role anon; create role authenticated; create role service_role;");
  migration("quote_ops_schema.sql");
  migration("admin_audit_schema.sql");
  migration("recurring_order_insert.sql");
  sql(`insert into quote_ops_entries select (jsonb_populate_record(null::quote_ops_entries, ${literal(row)})).*;`);
  const original = sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}';`);
  migration("quote_ops_storage_safety.sql");
  migration("quote_ops_storage_safety.sql");
  assert.equal(sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}';`), original, "migration must not rewrite existing records");
  assert.equal(sql("select count(*) from quote_ops_mutation_events;"), "0");
  assert.throws(() => sql(`select archive_quote_ops_entry('${id}', '${row.updated_at}', true, ${ctx});`), /containing an order/);
  assert.equal(sql("select count(*) from quote_ops_trash;"), "0");
  assert.equal(sql(`set role service_role; select archive_quote_ops_entry('${id}', '${row.updated_at}', false, ${ctx});`), "t");
  assert.equal(sql("select count(*) from quote_ops_entries;"), "0");
  assert.equal(sql("select row_data from quote_ops_trash;"), original);
  assert.equal(sql("select actor->>'id' from quote_ops_mutation_events;"), "qa-manager");
  assert.equal(sql("select count(*) from quote_ops_mutation_events where before_data::text like '%private-sms-fixture%' or before_data::text like '%private-policy-fixture%';"), "0");
  assert.equal(sql(`select save_quote_ops_entry(${literal(row)}, 'update', '${row.updated_at}', ${ctx}) is null;`), "t", "stale form cannot resurrect deleted entries");
  const trashId = sql("select id from quote_ops_trash;");
  sql(`set role service_role; select restore_quote_ops_entry('${trashId}', ${ctx});`);
  assert.equal(sql("select total_price::text || '|' || (payload_for_retry->'orderState'->>'assignedStaff') from quote_ops_entries;"), "417.00|Cleaner A");
  assert.equal(sql("select operation from quote_ops_mutation_events order by occurred_at desc limit 1;"), "restore");
  assert.equal(sql(`select restore_quote_ops_entry('${trashId}', ${ctx}) is null;`), "t", "restore is not repeatable");
  const current = JSON.parse(sql("select to_jsonb(q) from quote_ops_entries q;"));
  const removedOrder = { ...current, payload_for_retry: { ...current.payload_for_retry, orderState: null, adminOrder: null } };
  sql(`select save_quote_ops_entry(${literal(removedOrder)}, 'update', '${current.updated_at}', ${ctx});`);
  assert.equal(sql("select count(*) from quote_ops_entries;"), "1", "removing only an order preserves its customer");
  assert.equal(sql("select count(*) from quote_ops_trash where scope='order' and restored_at is null;"), "1");
  const removedVersion = sql("select updated_at from quote_ops_entries;");
  assert.throws(() => sql(`select save_quote_ops_entry(${literal(current)}, 'update', '${removedVersion}', ${ctx});`), /Order is in trash/);
  const orderTrashId = sql("select id from quote_ops_trash where scope='order';");
  sql(`select restore_quote_ops_entry('${orderTrashId}', ${ctx});`);
  const currentBeforeSeries = JSON.parse(sql("select to_jsonb(q) from quote_ops_entries q;"));
  const seriesRow = { ...currentBeforeSeries, selected_date: "2099-08-13", selected_time: "09:00",
    payload_for_retry: { ...currentBeforeSeries.payload_for_retry, orderState: {
      ...currentBeforeSeries.payload_for_retry.orderState, recurringSeriesId: "qa-weekly", recurringOccurrenceDate: "2099-08-13", frequency: "weekly",
    } } };
  sql(`select save_quote_ops_entry(${literal(seriesRow)}, 'update', '${currentBeforeSeries.updated_at}', ${ctx});`);
  const seriesVersion = sql("select updated_at from quote_ops_entries;");
  sql(`select archive_quote_ops_entry('${id}', '${seriesVersion}', false, ${ctx});`);
  const conflictingId = "22222222-2222-4222-8222-222222222222";
  sql(`select save_quote_ops_entry(${literal({ ...seriesRow, id: conflictingId })}, 'insert', null, ${ctx});`);
  const seriesTrashId = sql(`select id from quote_ops_trash where entry_id='${id}' and restored_at is null;`);
  assert.throws(() => sql(`select restore_quote_ops_entry('${seriesTrashId}', ${ctx});`), /slot already occupied/);
  assert.equal(sql(`select count(*) from quote_ops_trash where id='${seriesTrashId}' and restored_at is null;`), "1");
  sql(`select archive_quote_ops_entry('${conflictingId}', (select updated_at from quote_ops_entries where id='${conflictingId}'), false, ${ctx});`);
  sql(`select restore_quote_ops_entry('${seriesTrashId}', ${ctx});`);
  assert.equal(sql(`select save_quote_ops_entry(${literal({ ...seriesRow, total_price: 999 })}, 'update', '${seriesVersion}', ${ctx}) is null;`), "t");
  const beforeFailure = sql("select to_jsonb(q) from quote_ops_entries q;");
  sql("alter table quote_ops_mutation_events add constraint qa_fail_history check(false) not valid;");
  const latest = JSON.parse(beforeFailure);
  assert.throws(() => sql(`select save_quote_ops_entry(${literal({ ...latest, total_price: 999 })}, 'update', '${latest.updated_at}', ${ctx});`), /qa_fail_history/);
  assert.throws(() => sql(`select archive_quote_ops_entry('${id}', '${latest.updated_at}', false, ${ctx});`), /qa_fail_history/);
  assert.equal(sql("select to_jsonb(q) from quote_ops_entries q;"), beforeFailure, "journal failure rolls back amount, team and deletion");
  assert.equal(sql(`select count(*) from quote_ops_trash where entry_id='${id}' and restored_at is null;`), "0");
  assert.throws(() => sql(`set role anon; select restore_quote_ops_entry('${trashId}', ${ctx});`), /permission denied/);
  assert.throws(() => sql("set role service_role; delete from quote_ops_trash;"), /permission denied/);
});
