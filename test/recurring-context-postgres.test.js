"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const { mapRowToEntry, createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { projectRecurringContextEntry } = require("../lib/quote-ops/recurring-context");
const { gzipSync } = require("node:zlib");

const exec = promisify(execFile);

test("local PostgreSQL context RPC is SELECT-only, complete, field-equivalent and restricted to the server role", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0 || spawnSync("pg_ctl", ["--version"]).status !== 0) {
    t.skip("Local PostgreSQL binaries are not installed"); return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-context-pg-"));
  const data = path.join(root, "data");
  let started = false;
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55447", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async command => (await exec("psql", [...args, "-c", command], { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55447 -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await sql("create role anon; create role authenticated; create role service_role bypassrls;");
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/quote_ops_schema.sql")]);
    await sql(`grant select on public.quote_ops_entries to service_role;
      insert into public.quote_ops_entries (id, status, request_id, selected_date, selected_time, total_price, payload_for_retry)
      select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        'success',
        case when i = 3 then 'test-series-next-20261115' else 'unrelated-' || i end,
        case when i = 1 then '2020-01-01' else '2099-11-01' end, '10:00', 417,
        jsonb_build_object('orderState', case when i = 1 then '{}'::jsonb when i = 2 then 'null'::jsonb
          when i = 3 then '[]'::jsonb when i = 4 then '{"privateOnly":"HIDDEN"}'::jsonb
          else jsonb_build_object('isCreated',true,'status',case when i % 2 = 0 then 'completed' else 'canceled' end,
            'frequency','biweekly','recurringSeriesId',case when i % 5 = 0 then 'test-series' else 'other-series' end,
            'recurringSchedule',jsonb_build_object('index',3,'version',4,'unknownFutureField','preserve'),
            'payroll',jsonb_build_object('paid',12500),'completion',jsonb_build_object('photos','HIDDEN')) end,
          'adminOrder',jsonb_build_object('frequency','biweekly','recurringSeriesId','legacy-series'),
          'adminSms',jsonb_build_object('history',repeat('HIDDEN SMS ',200)),
          'calculatorData',jsonb_build_object('totalPrice',417))
      from generate_series(1,1003) i;`);
    const fingerprint = () => sql("select md5(string_agg(row_to_json(q)::text,'' order by q.id)) from public.quote_ops_entries q");
    const before = await fingerprint();
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/recurring_order_context.sql")]);
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/recurring_order_context.sql")]);
    assert.equal(await fingerprint(), before, "idempotent installation must not modify any order");
    const full = JSON.parse(await sql("select jsonb_agg(to_jsonb(q) order by q.id) from public.quote_ops_entries q"));
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      fetch: async (url, options) => {
        assert.match(url, /\/rpc\/read_recurring_order_context$/);
        const p = JSON.parse(options.body); calls.push(p);
        const command = `begin read only; set local role service_role;
          select public.read_recurring_order_context(${p.p_after ? `'${p.p_after}'::uuid` : 'null'}, ${p.p_limit},
          ${p.p_series_id ? `'${p.p_series_id}'` : 'null'}, array[${p.p_known_entry_ids.map(id => `'${id}'::uuid`).join(',')}]::uuid[]); commit;`;
        const body = await sql(command);
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => body };
      } });
    const narrow = await client.fetchRecurringContextEntries();
    assert.equal(calls.length, 3);
    assert.equal(narrow.length, 1003);
    assert.deepEqual(narrow, full.map(row => projectRecurringContextEntry(mapRowToEntry(row))));
    const known = full[0].id;
    const filtered = await client.fetchRecurringContextEntries({ recurringSeriesId: "test-series", recurringSeriesEntryIds: [known] });
    const expected = full.filter(row => row.id === known || row.request_id.startsWith("test-series-next-") ||
      row.payload_for_retry.orderState?.recurringSeriesId === "test-series" || row.payload_for_retry.adminOrder?.recurringSeriesId === "test-series");
    assert.deepEqual(filtered, expected.map(row => projectRecurringContextEntry(mapRowToEntry(row))));
    assert.ok(filtered.some(row => row.id === full[2].id), "removed/legacy shell must reserve its canonical request ID");
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(sql(`set role ${role}; select public.read_recurring_order_context();`), /permission denied/);
      await assert.rejects(sql(`set role ${role}; select public.recurring_order_context_state('{}');`), /permission denied/);
    }
    for (const args of ["null,0", "null,501", "null,500,'a_b'", "null,500,'BAD'", "null,500,null,array['00000000-0000-4000-8000-000000000001'::uuid]",
      "null,500,'series',array[null]::uuid[]"]) await assert.rejects(sql(`select public.read_recurring_order_context(${args})`));
    assert.equal(await sql("select bool_and(provolatile='s' and not prosecdef) from pg_proc where proname='read_recurring_order_context'"), "t");
    assert.equal(await fingerprint(), before, "all reads, failures and grants leave the entire table byte-equivalent");
    const size = value => Buffer.byteLength(JSON.stringify(value));
    t.diagnostic(JSON.stringify({ records: full.length, fullBytes: size(full), narrowBytes: size(narrow),
      fullGzipBytes: gzipSync(JSON.stringify(full)).length, narrowGzipBytes: gzipSync(JSON.stringify(narrow)).length }));
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});
