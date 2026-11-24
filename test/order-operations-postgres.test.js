"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs/promises"), os = require("node:os"),
  path = require("node:path"), { execFile, spawnSync } = require("node:child_process"), { promisify } = require("node:util");
const exec = promisify(execFile), literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

test("limited visit updates are atomic with assignment and audit, preserve override dates and paid payroll, and reject concurrent changes", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0) { t.skip("Local PostgreSQL unavailable"); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-operations-pg-")), data = path.join(root, "db");
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55464", "-U", os.userInfo().username, "-d", "postgres"];
  const sql = async text => (await exec("psql", [...args, "-c", text])).stdout.trim();
  const migration = file => exec("psql", [...args, "-f", path.join(__dirname, "../supabase", file)]);
  let started = false;
  try {
    await exec("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -k ${root} -p 55464 -c listen_addresses=''`, "-w", "start"]); started = true;
    await sql("create role anon; create role authenticated; create role service_role;");
    for (const file of ["quote_ops_schema.sql", "admin_audit_schema.sql", "recurring_order_insert.sql", "quote_ops_storage_safety.sql", "admin_staff_schema.sql"]) await migration(file);
    const id = "00000000-0000-4000-8000-000000000001", a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
    const paid = { staffId: a, status: "paid", amountCents: 15000, paidAt: "2026-11-23", paidByName: "Manager", paidByEmail: "test@example.test" };
    const state = { isCreated: true, status: "scheduled", assignedStaff: "A", selectedDate: "2099-12-21", selectedTime: "09:00", totalPrice: 374,
      serviceDurationMinutes: 285, payroll: { items: [paid] }, payrollOverrides: { [a]: "150.00" }, policyAcceptance: { policyAccepted: true, certificateFile: "keep" } };
    const payload = { orderState: state, adminOrder: state, adminSms: { history: ["Keep history"] }, calculatorData: { rooms: 3 } };
    await sql(`insert into quote_ops_entries(id,status,total_price,selected_date,selected_time,payload_for_retry) values('${id}','success',374,'2099-12-21','09:00',${literal(payload)});
      insert into admin_staff(id,name,status) values('${a}','A','active'),('${b}','B','active');
      insert into admin_staff_assignments(entry_id,staff_ids,schedule_date,schedule_time,status,notes,calendar_sync) values
        ('${id}',${literal([a])},'2099-12-22','11:00','confirmed','Keep notes',${literal({ keep: "calendar" })});`);
    const fingerprint = () => sql("select md5((select jsonb_agg(to_jsonb(q)) from quote_ops_entries q)::text || (select jsonb_agg(to_jsonb(a)) from admin_staff_assignments a)::text)");
    const baseline = await fingerprint();
    await migration("order_operations.sql"); await migration("order_operations.sql"); assert.equal(await fingerprint(), baseline);
    const readOrder = async () => JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}'`));
    const readAssignment = async () => JSON.parse(await sql(`select to_jsonb(a) from admin_staff_assignments a where entry_id='${id}'`));
    const before = await readOrder(), assignment = await readAssignment();
    const next = { ...state, assignedStaff: "B", payroll: { items: [paid, { staffId: b, status: "owed", amountCents: 10000 }] } };
    const call = (stamp, teamStamp, changed = next) => sql(`set role service_role; select update_order_operations('${id}','${stamp}',${teamStamp ? `'${teamStamp}'` : 'null'},${literal(changed)},${literal({ staffIds: [b], status: "confirmed" })},${literal({ id: "eva", permission: "orders.update_operations" })},${literal({ requestId: "qa-operations" })});`);
    await assert.rejects(call("2000-01-01", assignment.updated_at));
    await assert.rejects(call(before.updated_at, "2000-01-01"));
    await assert.rejects(call(before.updated_at, assignment.updated_at, { ...next, selectedDate: "2099-01-01" }));
    await assert.rejects(call(before.updated_at, assignment.updated_at, { ...next, payroll: { items: [{ ...paid, status: "owed" }] } }));
    assert.equal(await fingerprint(), baseline);
    await sql("create function fail_assignment() returns trigger language plpgsql as $$ begin raise exception 'Injected assignment failure'; end $$; create trigger fail_assignment before update on admin_staff_assignments for each row execute function fail_assignment();");
    await assert.rejects(call(before.updated_at, assignment.updated_at)); assert.equal(await fingerprint(), baseline);
    await sql("drop trigger fail_assignment on admin_staff_assignments;");
    await sql("create function fail_audit() returns trigger language plpgsql as $$ begin raise exception 'Injected journal failure'; end $$; create trigger fail_audit before insert on admin_audit_events for each row execute function fail_audit();");
    await assert.rejects(call(before.updated_at, assignment.updated_at)); assert.equal(await fingerprint(), baseline);
    await sql("drop trigger fail_audit on admin_audit_events;");
    await call(before.updated_at, assignment.updated_at);
    const after = await readOrder(), savedAssignment = await readAssignment();
    assert.deepEqual(after.payload_for_retry.orderState, next);
    assert.deepEqual({ ...after, updated_at: before.updated_at, payload_for_retry: before.payload_for_retry }, before);
    assert.deepEqual({ ...savedAssignment, staff_ids: assignment.staff_ids, updated_at: assignment.updated_at }, assignment);
    assert.deepEqual(savedAssignment.staff_ids, [b]);
    assert.equal(await sql("select actor->>'id' from admin_audit_events where request_id='qa-operations'"), "eva");
    // A concurrent payout changes the order version, so stale preparation cannot overwrite it.
    await sql(`update quote_ops_entries set updated_at=clock_timestamp(),payload_for_retry=jsonb_set(payload_for_retry,'{orderState,payroll,items,1,status}','"paid"') where id='${id}';`);
    await assert.rejects(call(after.updated_at, savedAssignment.updated_at));
    assert.equal((await readOrder()).payload_for_retry.orderState.payroll.items[1].status, "paid");
    for (const role of ["anon", "authenticated"]) await assert.rejects(sql(`set role ${role}; select update_order_operations('${id}',now(),null,'{}',null,'{}','{}');`));
  } finally {
    if (started) await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("operations use the existing quote-ledger staff backend when dedicated staff tables do not exist", { timeout: 30000 }, async t => {
  if (spawnSync("initdb", ["--version"]).status !== 0) { t.skip("Local PostgreSQL unavailable"); return; }
  const { mapAssignmentRecordToQuoteOpsRow, mapStaffRecordToQuoteOpsRow, buildQuoteOpsAssignmentRowId } = require("../lib/supabase-admin-staff");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-operations-ledger-pg-")), data = path.join(root,"db");
  const args = ["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h",root,"-p","55465","-U",os.userInfo().username,"-d","postgres"];
  const sql = async text => (await exec("psql",[...args,"-c",text])).stdout.trim();
  const migration = file => exec("psql",[...args,"-f",path.join(__dirname,"../supabase",file)]);
  let started = false;
  try {
    await exec("initdb",["-D",data,"-A","trust","--no-locale"]);
    await exec("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-F -k ${root} -p 55465 -c listen_addresses=''`,"-w","start"]); started = true;
    await sql("create role anon; create role authenticated; create role service_role;");
    for (const file of ["quote_ops_schema.sql","admin_audit_schema.sql","recurring_order_insert.sql","quote_ops_storage_safety.sql"]) await migration(file);
    const id = "00000000-0000-4000-8000-000000000001", a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
    const stamp = "2026-11-24T00:00:00.000Z", assignmentId = buildQuoteOpsAssignmentRowId(id);
    const assignment = mapAssignmentRecordToQuoteOpsRow({ entryId:id,staffIds:[a],scheduleDate:"2099-12-22",scheduleTime:"11:00",status:"confirmed",
      notes:"Keep notes",calendarSync:{keep:"calendar"},createdAt:stamp,updatedAt:stamp });
    for (const row of [mapStaffRecordToQuoteOpsRow({id:a,name:"A",status:"active",createdAt:stamp,updatedAt:stamp}),
      mapStaffRecordToQuoteOpsRow({id:b,name:"B",status:"active",createdAt:stamp,updatedAt:stamp}),assignment]) {
      await sql(`insert into quote_ops_entries(id,kind,status,created_at,updated_at,request_id,warnings,code,selected_date,selected_time,error_message,payload_for_retry)
        values('${row.id}','${row.kind}','success','${stamp}','${stamp}',${row.request_id?`'${row.request_id}'`:'null'},${literal(row.warnings||[])},'${row.code||""}',
        '${row.selected_date||""}','${row.selected_time||""}','${row.error_message||""}',${literal(row.payload_for_retry)});`);
    }
    const paid = {staffId:a,status:"paid",amountCents:15000,paidAt:"2026-11-23"};
    const state = {isCreated:true,status:"scheduled",assignedStaff:"A",selectedDate:"2099-12-21",selectedTime:"09:00",totalPrice:374,
      serviceDurationMinutes:285,payroll:{items:[paid]},payrollOverrides:{[a]:"150.00"},policyAcceptance:{policyAccepted:true,certificateFile:"keep"}};
    await sql(`insert into quote_ops_entries(id,status,total_price,payload_for_retry) values('${id}','success',374,${literal({orderState:state,adminOrder:state,adminSms:{history:["keep"]}})});`);
    const fingerprint = () => sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from quote_ops_entries q");
    const baseline = await fingerprint();
    await migration("order_operations.sql"); await migration("order_operations.sql"); assert.equal(await fingerprint(),baseline);
    assert.equal(await sql("select to_regclass('public.admin_staff') is null and to_regclass('public.admin_staff_assignments') is null"),"t");
    const before = JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}'`));
    const beforeAssignment = JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${assignmentId}'`));
    const next = {...state,assignedStaff:"B"};
    const call = (version=before.updated_at,teamVersion=stamp,changed=next) => sql(`set role service_role; select update_order_operations('${id}','${version}','${teamVersion}',${literal(changed)},${literal({staffIds:[b],status:"confirmed"})},${literal({id:"eva"})},${literal({requestId:"qa-ledger"})});`);
    await assert.rejects(call(before.updated_at,"2000-01-01"));
    await sql("create function fail_assignment() returns trigger language plpgsql as $$ begin if new.kind='admin_staff_assignment' then raise exception 'Injected assignment failure'; end if; return new; end $$; create trigger fail_assignment before update on quote_ops_entries for each row execute function fail_assignment();");
    await assert.rejects(call()); assert.equal(await fingerprint(),baseline);
    await sql("drop trigger fail_assignment on quote_ops_entries;");
    await sql("create function fail_audit() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end $$; create trigger fail_audit before insert on admin_audit_events for each row execute function fail_audit();");
    await assert.rejects(call()); assert.equal(await fingerprint(),baseline);
    await sql("drop trigger fail_audit on admin_audit_events;");
    await call();
    const afterAssignment = JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${assignmentId}'`));
    assert.deepEqual(afterAssignment.warnings,[b]); assert.deepEqual(afterAssignment.payload_for_retry.assignment.staffIds,[b]);
    for(const field of ["scheduleDate","scheduleTime","notes","calendarSync","createdAt"]) assert.deepEqual(afterAssignment.payload_for_retry.assignment[field],beforeAssignment.payload_for_retry.assignment[field],field);
    assert.equal(afterAssignment.selected_date,beforeAssignment.selected_date); assert.equal(afterAssignment.selected_time,beforeAssignment.selected_time);
    const after = JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}'`));
    assert.deepEqual(after.payload_for_retry.orderState,next);
    assert.deepEqual({...after,updated_at:before.updated_at,payload_for_retry:before.payload_for_retry},before);
    assert.equal(await sql("select actor->>'id' from admin_audit_events where request_id='qa-ledger'"),"eva");
    await assert.rejects(call());
    // Creating a first assignment uses the same deterministic ID as the existing store.
    await sql(`delete from quote_ops_entries where id='${assignmentId}';`);
    await sql(`set role service_role; select update_order_operations('${id}','${after.updated_at}',null,${literal(next)},${literal({staffIds:[b],status:"confirmed"})},${literal({id:"eva"})},'{}');`);
    assert.equal(await sql(`select count(*) from quote_ops_entries where id='${assignmentId}' and kind='admin_staff_assignment' and request_id='${id}'`),"1");
  } finally {
    if(started) await exec("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
    await fs.rm(root,{recursive:true,force:true});
  }
});
