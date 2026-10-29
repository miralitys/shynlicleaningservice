"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const { mapEntryToRow } = require("../lib/supabase-quote-ops");
const { getRecurringSourceGuard } = require("../lib/quote-ops/recurring-identity");
const exec = promisify(execFile);
const json = value => `$schedule_test$${JSON.stringify(value)}$schedule_test$::jsonb`;

test("PostgreSQL moves an entire cadence atomically, preserves financial JSON, rejects stale writers and rolls back collisions", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0) return t.skip("Local PostgreSQL is not installed");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-series-move-pg-"));
  const data = path.join(root, "data");
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55444", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async text => (await exec("psql", [...args, "-c", text])).stdout.trim();
  let started = false;
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55444 -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await sql("create role anon; create role authenticated; create role service_role;");
    for (const file of ["quote_ops_schema.sql", "admin_audit_schema.sql", "recurring_order_insert.sql", "quote_ops_storage_safety.sql", "recurring_order_reschedule.sql"]) {
      await exec("psql", [...args, "-f", path.join(__dirname, "../supabase", file)]);
    }
    const entries = ["2026-10-18", "2026-11-01", "2026-11-15", "2026-11-29"].map((date, index) => {
      const state = { isCreated: true, status: index ? "scheduled" : "completed", frequency: "biweekly", paymentStatus: index ? "unpaid" : "paid",
        recurringSeriesId: "sql-schedule", recurringAnchorDate: "2026-10-18", recurringOccurrenceDate: date, recurringOccurrenceIndex: index,
        selectedDate: date, selectedTime: "10:00", assignedStaff: "Cleaner A, Cleaner B", payrollOverrides: { a: "95.00" },
        payroll: { items: [{ staffId: "a", amountCents: 9500, status: "owed" }] }, completion: { cleanerComment: "Keep me" } };
      return { id: `00000000-0000-4000-8000-00000000000${index + 1}`, requestId: `sql-schedule-${index}`,
        status: "success", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", totalPrice: index === 2 ? 395 : 380,
        selectedDate: date, selectedTime: "10:00", customerName: "ISOLATED SQL QA",
        payloadForRetry: { orderState: state, adminOrder: structuredClone(state), calculatorData: { totalPrice: 380, selectedDate: date, selectedTime: "10:00" } } };
    });
    for (const entry of entries) await sql(`insert into public.quote_ops_entries select * from jsonb_populate_record(null::public.quote_ops_entries, ${json(mapEntryToRow(entry))})`);
    const read = async () => JSON.parse(await sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q"));
    const before = await read();
    const plan = { seriesId: "sql-schedule", sourceId: entries[1].id,
      members: entries.map(entry => ({ id: entry.id, updatedAt: entry.updatedAt })),
      changes: entries.slice(1).map((entry, index) => ({ id: entry.id, date: ["2026-11-15", "2026-11-29", "2026-12-13"][index], time: "10:00",
        ...(index === 0 ? { marker: { index: 1, date: "2026-11-15", time: "10:00", frequency: "biweekly", version: 1 } } : {}) })) };
    const call = (value, role = "service_role") => sql(`set role ${role}; select public.reschedule_recurring_quote_orders(${json(value)}, ${json({ actor: { name: "Isolated Tester" }, scope: "future" })})`);
    await assert.rejects(call(plan, "anon"), /permission denied/);
    const [first, second] = await Promise.allSettled([call(plan), call(plan)]);
    assert.equal([first, second].filter(value => value.status === "fulfilled").length, 1, "one concurrent plan commits");
    const after = await read();
    assert.equal(await sql("select count(*) from public.quote_ops_mutation_events where actor->>'name' = 'Isolated Tester'"), "3");
    assert.equal(after.length, before.length);
    assert.deepEqual(after[0], before[0]);
    for (let index = 1; index < after.length; index++) {
      const scrub = row => {
        const copy = structuredClone(row);
        delete copy.selected_date; delete copy.selected_time; delete copy.updated_at;
        for (const state of Object.values(copy.payload_for_retry)) {
          delete state.selectedDate; delete state.selectedTime; delete state.updatedAt; delete state.recurringSchedule;
        }
        return copy;
      };
      assert.deepEqual(scrub(after[index]), scrub(before[index]));
    }
    const candidate = { ...mapEntryToRow(entries[0]), id: "00000000-0000-4000-8000-000000000005", code: "RECURRING_ORDER_CREATED",
      selected_date: "2027-01-10", request_id: "sql-schedule-next-20270110" };
    candidate.payload_for_retry.orderState.recurringOccurrenceDate = "2027-01-10";
    await assert.rejects(sql(`select public.insert_recurring_quote_order(${json(candidate)}, ${json(getRecurringSourceGuard(entries[0]))})`), /Recurring schedule changed/);
    const bad = structuredClone(plan);
    bad.members = after.map(row => ({ id: row.id, updatedAt: row.updated_at }));
    bad.changes[2].date = "2026-10-18";
    await assert.rejects(call(bad), /Recurring schedule collision/);
    assert.deepEqual(await read(), after, "a late failure cannot leave a partially moved branch");
    const paid = structuredClone(plan);
    paid.members = bad.members;
    await sql(`update public.quote_ops_entries set payload_for_retry=jsonb_set(payload_for_retry,'{orderState,payroll,items,0,status}','"paid"') where id='${entries[2].id}'`);
    const paidBefore = await read();
    await assert.rejects(call(paid), /Unsafe recurring schedule change/);
    assert.deepEqual(await read(), paidBefore);
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
