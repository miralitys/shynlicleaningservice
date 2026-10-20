"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawnSync, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { mapEntryToRow } = require("../lib/supabase-quote-ops");
const { buildRecurringEntryId, getRecurringSourceGuard } = require("../lib/quote-ops/recurring-identity");

const exec = promisify(execFile);
const json = value => `$test_json$${JSON.stringify(value)}$test_json$::jsonb`;

test("PostgreSQL serializes recurring inserts and rejects a source changed by another instance", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0 || spawnSync("pg_ctl", ["--version"]).status !== 0) {
    t.skip("Local PostgreSQL binaries are not installed");
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-recurring-pg-"));
  const data = path.join(root, "data");
  let started = false;
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55439", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async command => (await exec("psql", [...args, "-c", command])).stdout.trim();
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55439 -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await sql("create role anon; create role authenticated; create role service_role;");
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/quote_ops_schema.sql")]);
    await exec("psql", [...args, "-f", path.join(__dirname, "../supabase/recurring_order_insert.sql")]);
    assert.equal(await sql(`select public.quote_ops_order_state(${json({ orderState: {}, adminOrder: { status: "scheduled" } })})`), "{}");

    const source = {
      id: "00000000-0000-4000-8000-000000000001", status: "success", requestId: "pg-series",
      createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z",
      selectedDate: "2099-11-01", selectedTime: "10:00", totalPrice: 280,
      payloadForRetry: { orderState: { isCreated: true, status: "scheduled", frequency: "weekly",
        recurringSeriesId: "pg-series", recurringAnchorDate: "2099-11-01", recurringOccurrenceDate: "2099-11-01",
        selectedDate: "2099-11-01", selectedTime: "10:00", assignedStaff: "Cleaner A" } },
    };
    await sql(`insert into public.quote_ops_entries select * from jsonb_populate_record(null::public.quote_ops_entries, ${json(mapEntryToRow(source))})`);
    const proposed = date => {
      const entry = { ...structuredClone(source), code: "RECURRING_ORDER_CREATED", requestId: `pg-series-next-${date.replaceAll("-", "")}`,
        selectedDate: date, payloadForRetry: { orderState: { ...source.payloadForRetry.orderState,
          selectedDate: date, recurringOccurrenceDate: date } } };
      entry.id = buildRecurringEntryId(entry);
      return mapEntryToRow(entry);
    };
    const guard = getRecurringSourceGuard(source);
    const call = async (entry, expected = guard, prefix = "") => JSON.parse(await sql(
      `${prefix} select public.insert_recurring_quote_order(${json(entry)}, ${json(expected)})`
    ));
    const staged = async (firstSql, lastSql, marker) => {
      const child = spawn("psql", [...args, "-c", firstSql, "-c", lastSql]);
      let output = "";
      const ready = new Promise((resolve, reject) => {
        child.stdout.on("data", data => { output += data; if (output.includes(marker)) resolve(); });
        child.on("error", reject);
        child.on("exit", code => { if (!output.includes(marker)) reject(new Error(`Writer exited: ${code}`)); });
      });
      const finished = new Promise((resolve, reject) => child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Writer exited: ${code}`))));
      await ready;
      return { finished };
    };
    const candidate = proposed("2099-11-08");
    assert.equal((await call(proposed("2099-11-01"))).skipped, true);
    const [a, b] = await Promise.all([call(candidate), call({ ...candidate, total_price: 534 })]);
    assert.equal(Number(a.inserted) + Number(b.inserted), 1);
    assert.equal(a.entry.id, b.entry.id);
    assert.equal(a.entry.total_price, b.entry.total_price);
    assert.equal(await sql("select count(*) from public.quote_ops_entries"), "2");
    const before = await sql(`select row_to_json(q) from public.quote_ops_entries q where id='${candidate.id}'`);
    await call({ ...candidate, total_price: 999 });
    assert.equal(await sql(`select row_to_json(q) from public.quote_ops_entries q where id='${candidate.id}'`), before);

    await sql(`update public.quote_ops_entries set payload_for_retry='{}' where id='${candidate.id}'`);
    const removed = await call(candidate);
    assert.equal(removed.inserted, false);
    assert.deepEqual(removed.entry.payload_for_retry, {});

    // Another instance changes the source while this generator waits for the series lock.
    const writer = await staged(
      "begin; select pg_advisory_xact_lock(hashtextextended('shynli:recurring-order:pg-series',0)); select 'LOCKED';",
      `select pg_sleep(0.3); update public.quote_ops_entries set selected_date='2099-11-15', payload_for_retry=jsonb_set(payload_for_retry,'{orderState,selectedDate}','\"2099-11-15\"') where id='${source.id}'; commit;`,
      "LOCKED"
    );
    await assert.rejects(call(proposed("2099-11-15")), /Recurring source changed/);
    await writer.finished;
    assert.equal(await sql("select count(*) from public.quote_ops_entries"), "2");

    const freshSource = structuredClone(source);
    freshSource.selectedDate = "2099-11-15";
    freshSource.payloadForRetry.orderState.selectedDate = "2099-11-15";
    const occupied = await call(proposed("2099-11-15"), getRecurringSourceGuard(freshSource));
    assert.equal(occupied.skipped, true);
    assert.equal(occupied.entry, null);
    assert.equal(await sql("select count(*) from public.quote_ops_entries"), "2");
    await assert.rejects(call(candidate, getRecurringSourceGuard(freshSource), "set role anon;"), /permission denied/);
    await call(candidate, getRecurringSourceGuard(freshSource), "set role service_role;");

    const sibling = proposed("2099-11-29");
    await sql(`insert into public.quote_ops_entries select * from jsonb_populate_record(null::public.quote_ops_entries, ${json(sibling)})`);
    const reschedule = await staged(
      `begin; update public.quote_ops_entries set selected_date='2099-11-22', payload_for_retry=jsonb_set(payload_for_retry,'{orderState,selectedDate}','\"2099-11-22\"') where id='${sibling.id}'; select 'MOVED';`,
      "select pg_sleep(0.3); commit;", "MOVED"
    );
    const blockedInsert = call(proposed("2099-11-22"), getRecurringSourceGuard(freshSource));
    await reschedule.finished;
    assert.equal((await blockedInsert).skipped, true);
    assert.equal(await sql("select count(*) from public.quote_ops_entries"), "3");

    const next = proposed("2099-12-06");
    const insert = await staged(
      `begin; select public.insert_recurring_quote_order(${json(next)}, ${json(getRecurringSourceGuard(freshSource))}); select 'INSERTED';`,
      "select pg_sleep(0.3); commit;", "INSERTED"
    );
    const movedSibling = { ...sibling, selected_date: "2099-12-06", payload_for_retry: { orderState: {
      ...sibling.payload_for_retry.orderState, selectedDate: "2099-12-06",
    } } };
    const upsert = row => `insert into public.quote_ops_entries select * from jsonb_populate_record(null::public.quote_ops_entries, ${json(row)}) on conflict(id) do update set selected_date=excluded.selected_date, payload_for_retry=excluded.payload_for_retry`;
    await assert.rejects(sql(upsert(movedSibling)), /Recurring slot already occupied/);
    await insert.finished;
    assert.equal(await sql(`select selected_date from public.quote_ops_entries where id='${sibling.id}'`), "2099-11-22");
    assert.equal(await sql("select count(*) from public.quote_ops_entries"), "4");

    // Installation does not clean up legacy duplicates, and paying them must remain possible.
    const duplicate = proposed("2099-12-13");
    duplicate.selected_date = "2099-11-22";
    duplicate.payload_for_retry.orderState.selectedDate = "2099-11-22";
    await sql(`alter table public.quote_ops_entries disable trigger quote_ops_recurring_slot_guard; insert into public.quote_ops_entries select * from jsonb_populate_record(null::public.quote_ops_entries, ${json(duplicate)}); alter table public.quote_ops_entries enable trigger quote_ops_recurring_slot_guard;`);
    const paid = { ...sibling, selected_date: "2099-11-22", payload_for_retry: { orderState: {
      ...sibling.payload_for_retry.orderState, selectedDate: "2099-11-22", paymentStatus: "paid", status: "completed",
    } } };
    await sql(upsert(paid));
    assert.equal(await sql(`select payload_for_retry->'orderState'->>'paymentStatus' from public.quote_ops_entries where id='${sibling.id}'`), "paid");
    const canceled = proposed("2099-12-20");
    canceled.selected_date = "2099-12-27";
    canceled.payload_for_retry.orderState.selectedDate = "2099-12-27";
    canceled.payload_for_retry.orderState.status = "canceled";
    await sql(`insert into public.quote_ops_entries select * from jsonb_populate_record(null::public.quote_ops_entries, ${json(canceled)})`);
    assert.equal((await call(proposed("2099-12-27"), getRecurringSourceGuard(freshSource))).inserted, true);
    await sql(`update public.quote_ops_entries set payload_for_retry='{}' where id='${source.id}'`);
    const deletedSource = { ...freshSource, payloadForRetry: {} };
    await assert.rejects(call(proposed("2099-11-22"), getRecurringSourceGuard(deletedSource)), /Recurring source changed/);
    assert.equal(await sql("select count(*) from public.quote_ops_entries"), "7");
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
