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

test("PostgreSQL keeps finance and history atomic, blocks public roles, and never updates orders", { timeout: 30000 }, async t => {
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
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
