"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const { createSupabaseAdminStaffClient, mapQuoteOpsRowToAssignmentRecord } = require("../lib/supabase-admin-staff");
const exec = promisify(execFile);

test("local assignment SQL is SELECT-only, complete above 1000, legacy-equivalent and service-role-only", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0) { t.skip("Local PostgreSQL is not installed"); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-assignment-pg-")), data = path.join(root, "data");
  let started = false;
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55449", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async command => (await exec("psql", [...args, "-c", command], { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55449 -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await sql("create role anon; create role authenticated; create role service_role bypassrls;");
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/quote_ops_schema.sql")]);
    await sql(`grant select on public.quote_ops_entries to service_role;
      insert into public.quote_ops_entries(id,kind,status,request_id,warnings,code,payload_for_retry)
      select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'admin_staff_assignment','success',
        case when i <= 1003 then 'order-0' else 'unrelated' end, '["legacy-cleaner"]'::jsonb, 'confirmed',
        jsonb_build_object('assignment',jsonb_build_object('entryId',case
          when i=1 then '" \\torder-0\\n "'::jsonb when i=2 then '["order-0"]'::jsonb
          when i=3 then '"different"'::jsonb when i=4 then '" "'::jsonb
          when i=5 then 'null'::jsonb else to_jsonb(case when i <= 1003 then 'order-0' else 'unrelated' end) end,
          'staffIds',case when i%2=0 then '[]'::jsonb else '["cleaner","cleaner"]'::jsonb end,
          'status',case when i%3=0 then 'canceled' else '' end,
          'notes',repeat('PRIVATE HISTORY ',100), 'calendarSync',jsonb_build_object('privateToken','HIDDEN'),
          'travelEstimates',jsonb_build_array('PRIVATE TRAVEL')),
          'adminSms',jsonb_build_object('history','HIDDEN SMS')) from generate_series(1,1103) i;`);
    const fingerprint = () => sql("select md5(string_agg(to_jsonb(q)::text,'' order by id)) from public.quote_ops_entries q");
    const before = await fingerprint();
    for (let i = 0; i < 2; i++) await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/recurring_assignment_context.sql")]);
    assert.equal(await fingerprint(), before);
    const full = JSON.parse(await sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q"));
    const calls = [];
    const client = createSupabaseAdminStaffClient({ env: { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      fetch: async url => {
        const u = new URL(url);
        if (u.pathname.includes("/admin_staff")) return { ok: false, status: 404,
          text: async () => JSON.stringify({ code: "PGRST205", message: "Could not find the table" }) };
        let body;
        if (u.pathname.includes("/rpc/")) {
          calls.push(u);
          const ids = u.searchParams.get("p_entry_ids"), after = u.searchParams.get("p_after");
          body = await sql(`begin read only; set local role service_role; select public.read_recurring_assignment_context(
            ${literal(ids)}::text[],${after ? `${literal(after)}::uuid` : 'null'},${Number(u.searchParams.get("p_limit"))}); commit;`);
          assert.doesNotMatch(body, /PRIVATE|HIDDEN|calendarSync|travelEstimates|adminSms/);
        } else body = JSON.stringify(u.searchParams.get("kind") === "eq.admin_staff_assignment" ? full : []);
        return { ok: true, status: 200, text: async () => body };
      } });
    const context = await client.fetchRecurringAssignmentContext(["order-0"]);
    const expected = full.map(mapQuoteOpsRowToAssignmentRecord).filter(a => a.entryId === "order-0")
      .map(({ entryId, staffIds, status }) => ({ entryId, staffIds, status }));
    assert.deepEqual(context.assignments, expected);
    assert.equal(expected.length, 1001); assert.equal(calls.length, 3);
    for (const role of ["anon", "authenticated"]) await assert.rejects(sql(`set role ${role}; select public.read_recurring_assignment_context(array['order-0']);`), /permission denied/);
    for (const parameters of ["null", "array[]::text[]", "array[null]::text[]", "array['x'],null,0", "array['x'],null,501", "array_fill('x'::text,array[76])"]) {
      await assert.rejects(sql(`select public.read_recurring_assignment_context(${parameters})`), /Invalid recurring assignment scope/);
    }
    assert.equal(await sql("select bool_and(provolatile='s' and not prosecdef) from pg_proc where proname='read_recurring_assignment_context'"), "t");
    assert.equal(await fingerprint(), before);
    t.diagnostic(JSON.stringify({ records: full.length, scopedAssignments: expected.length, pages: calls.length, entireTableUnchanged: true }));
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});
