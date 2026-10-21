"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);
const json = value => `$finance_json$${JSON.stringify(value)}$finance_json$::jsonb`;

test("PostgreSQL isolates ordinary finance and atomically synchronizes only payroll with private history", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0 || spawnSync("pg_ctl", ["--version"]).status !== 0) { t.skip("Local PostgreSQL is not installed"); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-finance-pg-"));
  const data = path.join(root, "data");
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55441", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async command => (await exec("psql", [...args, "-c", command])).stdout.trim();
  let started = false;
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55441 -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await sql("create role anon; create role authenticated; create role service_role bypassrls;");
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/quote_ops_schema.sql")]);
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/profitability_schema.sql")]);
    await sql("grant select on public.quote_ops_entries to service_role;");
    const a = "00000000-0000-4000-8000-000000000001";
    const b = "00000000-0000-4000-8000-000000000002";
    await sql(`insert into public.quote_ops_entries(id, status, total_price, payload_for_retry) values ('${a}', 'success', 250, '{"orderState":{"status":"scheduled","assignedStaff":"Cleaner A"}}'), ('${b}', 'success', 300, '{"orderState":{"status":"completed"}}');`);
    const before = await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;");
    const call = (updates, actor) => sql(`set role service_role; select public.save_profitability_batch(${json(updates)}, ${json(actor)});`);
    const first = JSON.parse(await call([{ id: a, version: 0, patch: { paidCents: 25000, payouts: [{ staffId: "cleaner-a", cents: 12000 }] } }], { id: "tonya" }));
    assert.equal(first[0].version, 1);
    const race = await Promise.allSettled([
      call([{ id: a, version: 1, patch: { paidCents: 26000 } }], { id: "nastya" }),
      call([{ id: a, version: 1, patch: { paidCents: 27000 } }], { id: "tonya" }),
    ]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await sql("select count(*) from public.profitability_events;"), "2");
    await assert.rejects(call([{ id: b, version: 0, patch: { source: "google" } }, { id: a, version: 0, patch: { source: "website" } }], { id: "tonya" }));
    assert.equal(await sql(`select count(*) from public.profitability_records where id='${b}';`), "0");
    assert.equal(await sql("select count(*) from public.profitability_events;"), "2");
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(sql(`set role ${role}; select * from public.profitability_records;`));
      await assert.rejects(sql(`set role ${role}; select * from public.profitability_events;`));
      await assert.rejects(sql(`set role ${role}; select public.save_profitability_batch('[]', '{}');`));
    }
    assert.equal(await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;"), before);
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/profitability_payroll.sql")]);
    await sql("grant update on public.quote_ops_entries to service_role;");
    const at = await sql(`select updated_at from public.quote_ops_entries where id='${a}'`);
    const payoutCall = (version, stamp, value) => sql(`set role service_role; select public.save_profitability_with_payroll('${a}', ${json({ payouts: [{ staffId: "cleaner-a", cents: value }] })}, ${version}, ${json({ id: "eva", email: "eva@shynli.local" })}, '${stamp}', ${json({ "cleaner-a": (value / 100).toFixed(2) })}, null, ${json([{ staffId: "cleaner-a", cents: null }])});`);
    await assert.rejects(payoutCall(0, at, 50000));
    assert.equal(await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from public.quote_ops_entries q;"), before, "version conflict leaves the order untouched");
    const saved = JSON.parse(await payoutCall(2, at, 50000));
    assert.equal(saved.version, 3);
    const order = JSON.parse(await sql(`select to_jsonb(q) from public.quote_ops_entries q where id='${a}'`));
    assert.equal(order.total_price, 250);
    assert.equal(order.payload_for_retry.orderState.assignedStaff, "Cleaner A");
    assert.equal(order.payload_for_retry.orderState.status, "scheduled");
    assert.equal(order.payload_for_retry.orderState.payrollOverrides["cleaner-a"], "500.00");
    assert.deepEqual(order.payload_for_retry.adminOrder, order.payload_for_retry.orderState);
    const event = JSON.parse(await sql(`select to_jsonb(e) from public.profitability_events e where record_id='${a}' order by occurred_at desc limit 1`));
    assert.equal(event.actor.id, "eva");
    assert.deepEqual(event.before_data.payouts, [{ staffId: "cleaner-a", cents: null }]);
    assert.equal(event.after_data.payouts[0].cents, 50000);
    await assert.rejects(payoutCall(3, at, 60000), "a stale order snapshot must not overwrite a concurrent edit");
    const current = await sql(`select updated_at from public.quote_ops_entries where id='${a}'`);
    await sql(`create function fail_finance_history() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$; create trigger fail_history before insert on public.profitability_events for each row execute function fail_finance_history();`);
    await assert.rejects(payoutCall(3, current, 60000));
    assert.equal(await sql(`select payload_for_retry->'orderState'->'payrollOverrides'->>'cleaner-a' from public.quote_ops_entries where id='${a}'`), "500.00", "audit failure rolls back the entire transaction");
    assert.equal(await sql(`select version from public.profitability_records where id='${a}'`), "3");
    for (const role of ["anon", "authenticated"]) await assert.rejects(sql(`set role ${role}; select public.save_profitability_with_payroll('${a}', '{}', 3, '{}', '${current}', '{}', null, '[]');`));
    await sql("drop trigger fail_history on public.profitability_events;");
    const settled = { staffId: "cleaner-a", status: "paid", amountCents: 50000, paidAt: "2026-10-21T12:00:00Z" };
    await sql(`update public.quote_ops_entries set payload_for_retry = jsonb_set(payload_for_retry, '{orderState,payroll}', ${json({ items: [settled] })}) where id='${a}';`);
    await assert.rejects(payoutCall(3, current, 60000), "the database also rejects changing settled payroll, independently of HTTP validation");
    const keepPaid = JSON.parse(await sql(`set role service_role; select public.save_profitability_with_payroll('${a}', ${json({ payouts: [{ staffId: "cleaner-a", cents: 50000 }, { staffId: "cleaner-b", cents: 10000 }] })}, 3, ${json({ id: "eva" })}, '${current}', ${json({ "cleaner-a": "500.00", "cleaner-b": "100.00" })}, ${json({ items: [settled, { staffId: "cleaner-b", status: "owed", amountCents: 10000 }] })}, ${json([{ staffId: "cleaner-a", cents: 50000 }])});`));
    assert.equal(keepPaid.version, 4);
    const paidAfter = JSON.parse(await sql(`select payload_for_retry->'orderState'->'payroll'->'items' from public.quote_ops_entries where id='${a}'`));
    assert.deepEqual(paidAfter[0], settled, "another cleaner can be edited without touching paid amount or metadata");
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
