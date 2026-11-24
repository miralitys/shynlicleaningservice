"use strict";

const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs/promises"),
  os = require("node:os"), path = require("node:path"), { execFile, spawnSync } = require("node:child_process"), { promisify } = require("node:util");
const exec = promisify(execFile);
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

test("Cash payment is atomic with both audit journals, server-derived, conflict-safe, idempotent and preserves every unrelated order field", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0) { t.skip("Local PostgreSQL unavailable"); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-cash-pg-")), data = path.join(root, "db");
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55463", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async text => (await exec("psql", [...args, "-c", text])).stdout.trim();
  const migration = file => exec("psql", [...args, "-f", path.join(__dirname, "../supabase", file)]);
  let started = false;
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55463 -c listen_addresses=''`, "-w", "start"]); started = true;
    await sql("create role anon; create role authenticated; create role service_role;");
    for (const file of ["quote_ops_schema.sql", "admin_audit_schema.sql", "recurring_order_insert.sql", "quote_ops_storage_safety.sql", "profitability_schema.sql"]) await migration(file);
    const id = "00000000-0000-4000-8000-000000000001", sibling = "00000000-0000-4000-8000-000000000002";
    const state = { isCreated: true, status: "scheduled", frequency: "biweekly", selectedDate: "2099-12-21", selectedTime: "09:00", assignedStaff: "Cleaner A",
      serviceDurationMinutes: 285, payrollOverrides: { a: "150.00" }, payroll: { items: [{ staffId: "a", status: "paid", amountCents: 15000 }] },
      policyAcceptance: { policyAccepted: true, signedAt: "2026-10-01", certificateFile: { id: "keep-certificate" } } };
    const payload = { orderState: state, adminOrder: state, calculatorData: { rooms: 3 }, adminSms: { history: [{ message: "Keep history" }] } };
    await sql(`insert into quote_ops_entries(id,status,total_price,total_price_cents,selected_date,selected_time,payload_for_retry) values
      ('${id}','success',374,37400,'2099-12-21','09:00',${literal(payload)}),
      ('${sibling}','success',400,40000,'2099-12-28','09:00',${literal({ orderState: { isCreated: true, status: "scheduled" } })});`);
    const baseline = await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from quote_ops_entries q;");
    await migration("order_cash_payment.sql"); await migration("order_cash_payment.sql");
    assert.equal(await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from quote_ops_entries q;"), baseline, "Installing the additive function changes no records");
    const before = JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}'`));
    const untouched = await sql(`select to_jsonb(q) from quote_ops_entries q where id='${sibling}'`);
    const finance = { paidCents: 10000, basePriceCents: 37400, addonsCents: 2000, discountCents: 500, source: "google", payouts: [{ staffId: "a", cents: 15000 }] };
    await sql(`insert into profitability_records(id,version,data) values('${id}',1,${literal(finance)});`);
    const actor = { id: "eva", email: "eva@shynli.local", permission: "orders.update_operations" };
    const call = (stamp, version = 1) => sql(`set role service_role; select mark_order_paid_cash('${id}','${stamp}',${version},${literal(actor)},'2026-11-24',${literal({ requestId: "qa-cash", route: "/admin/orders" })});`);
    await assert.rejects(call("2000-01-01")); await assert.rejects(call(before.updated_at, 0));
    const paid = JSON.parse(await call(before.updated_at)); assert.equal(paid.data.paidCents, 38900); assert.equal(paid.data.paymentMethod, "cash");
    assert.equal(paid.data.paidAt, "2026-11-24"); assert.equal(paid.data.source, "google"); assert.deepEqual(paid.data.payouts, finance.payouts);
    const after = JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}'`));
    const nextState = after.payload_for_retry.orderState;
    assert.equal(nextState.paymentStatus, "paid"); assert.equal(nextState.paymentMethod, "cash"); assert.equal(nextState.paymentReceivedCents, 38900);
    const stripped = { ...nextState }; for (const field of ["paymentStatus", "paymentMethod", "paymentReceivedCents", "paymentReceivedAt"]) delete stripped[field];
    assert.deepEqual(stripped, state); assert.deepEqual(after.payload_for_retry.adminOrder, nextState);
    const unchanged = { ...after, updated_at: before.updated_at, payload_for_retry: before.payload_for_retry }; assert.deepEqual(unchanged, before);
    assert.equal(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${sibling}'`), untouched);
    const audits = JSON.parse(await sql(`select jsonb_agg(to_jsonb(e)) from admin_audit_events e where entry_id='${id}'`));
    assert.equal(audits.length, 1); assert.equal(audits[0].actor.id, "eva"); assert(audits[0].changes.some(change => change.field === "paymentReceivedCents" && change.new === 38900));
    assert.equal(await sql(`select actor->>'id' from profitability_events where record_id='${id}'`), "eva");
    const eventCount = await sql("select count(*) from quote_ops_mutation_events;");
    const again = JSON.parse(await call(after.updated_at, 2)); assert.equal(again.version, 2); assert.equal(again.orderUpdatedAt, after.updated_at);
    assert.equal(await sql("select count(*) from quote_ops_mutation_events;"), eventCount);
    assert.equal(await sql("select count(*) from profitability_events;"), "1");
    await sql(`update profitability_records set data=jsonb_set(data,'{paidCents}','50000') where id='${id}';`);
    await assert.rejects(call(after.updated_at, 2), "The command cannot reduce an overpayment");
    await sql(`update profitability_records set data=${literal(finance)},version=1 where id='${id}';
      create function fail_cash_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end $$;
      create trigger reject_cash_audit before insert on admin_audit_events for each row execute function fail_cash_audit();`);
    const beforeFailure = await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from quote_ops_entries q;");
    await assert.rejects(call(after.updated_at));
    assert.equal(await sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from quote_ops_entries q;"), beforeFailure);
    assert.equal(await sql(`select version from profitability_records where id='${id}'`), "1");
    assert.equal(await sql("select count(*) from profitability_events;"), "1", "Journal failure rolls back finance, receipt and durable history");
    for (const role of ["anon", "authenticated"]) await assert.rejects(sql(`set role ${role}; select mark_order_paid_cash('${id}','${after.updated_at}',1,'{}','2026-11-24','{}');`));
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
