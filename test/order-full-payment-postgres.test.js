"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path"),
  {execFile,spawnSync}=require("node:child_process"),{promisify}=require("node:util");
const exec=promisify(execFile),literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
test("four full-receipt methods are atomic, audited, versioned and preserve existing order and payout data",{timeout:30000},async t=>{
  if(spawnSync("initdb",["--version"]).status!==0){t.skip("Local PostgreSQL unavailable");return;}
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"shynli-four-methods-pg-")),data=path.join(root,"db");
  const args=["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h",root,"-p","55466","-U",os.userInfo().username,"-d","postgres"];
  const sql=async text=>(await exec("psql",[...args,"-c",text])).stdout.trim();
  const migration=file=>exec("psql",[...args,"-f",path.join(__dirname,"../supabase",file)]);
  let started=false;
  try{
    await exec("initdb",["-D",data,"-A","trust","--no-locale"]);
    await exec("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-F -k ${root} -p 55466 -c listen_addresses=''`,"-w","start"]);started=true;
    await sql("create role anon;create role authenticated;create role service_role;");
    for(const file of ["quote_ops_schema.sql","admin_audit_schema.sql","recurring_order_insert.sql","quote_ops_storage_safety.sql","profitability_schema.sql","order_cash_payment.sql"])await migration(file);
    const state={isCreated:true,status:"scheduled",assignedStaff:"Cleaner A",selectedDate:"2099-12-21",selectedTime:"09:00",serviceDurationMinutes:285,
      payroll:{items:[{staffId:"a",status:"paid",amountCents:15000}]},payrollOverrides:{a:"150.00"},policyAcceptance:{policyAccepted:true,certificateFile:"keep"}};
    const payload={orderState:state,adminOrder:state,adminSms:{history:["Keep history"]}};
    const methods=["cash","zelle","venmo","check"],ids=methods.map((_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
    for(const id of ids)await sql(`insert into quote_ops_entries(id,status,total_price,selected_date,selected_time,payload_for_retry) values('${id}','success',374,'2099-12-21','09:00',${literal(payload)});`);
    const fingerprint=()=>sql("select md5(jsonb_agg(to_jsonb(q) order by id)::text) from quote_ops_entries q");
    const baseline=await fingerprint();await migration("order_full_payment.sql");await migration("order_full_payment.sql");assert.equal(await fingerprint(),baseline);
    const actor={id:"eva",role:"viewer",permission:"orders.update_operations"};
    const read=async id=>JSON.parse(await sql(`select to_jsonb(q) from quote_ops_entries q where id='${id}'`));
    const call=(id,stamp,version,method)=>sql(`set role service_role;select mark_order_paid('${id}','${stamp}',${version},${literal(actor)},'2026-11-24',${literal({requestId:"qa-full-payment"})},${method===null?'null':`'${method}'`});`);
    for(const [i,method] of methods.entries()){
      const id=ids[i],before=await read(id);
      const finance={paidCents:1000,basePriceCents:40000,addonsCents:1000,discountCents:200,source:"google",payouts:[{staffId:"a",cents:15000}]};
      await sql(`insert into profitability_records(id,version,data) values('${id}',1,${literal(finance)});`);
      await assert.rejects(call(id,"2000-01-01",1,method));await assert.rejects(call(id,before.updated_at,0,method));
      const saved=JSON.parse(await call(id,before.updated_at,1,method));assert.equal(saved.data.paidCents,40800);assert.equal(saved.data.paymentMethod,method);assert.deepEqual(saved.data.payouts,finance.payouts);
      const after=await read(id),receipt=after.payload_for_retry.orderState;assert.equal(receipt.paymentMethod,method);assert.equal(receipt.paymentReceivedCents,40800);assert.equal(receipt.paymentStatus,"paid");
      const stripped={...receipt};for(const key of ["paymentStatus","paymentMethod","paymentReceivedCents","paymentReceivedAt"])delete stripped[key];assert.deepEqual(stripped,state);
      assert.deepEqual({...after,updated_at:before.updated_at,payload_for_retry:before.payload_for_retry},before);
      const again=JSON.parse(await call(id,after.updated_at,2,method));assert.equal(again.version,2);assert.equal(again.orderUpdatedAt,after.updated_at);
      assert.equal(await sql(`select count(*) from profitability_events where record_id='${id}'`),"1");
      const audit=JSON.parse(await sql(`select jsonb_agg(to_jsonb(e)) from admin_audit_events e where entry_id='${id}'`));assert.equal(audit.length,1);assert.equal(audit[0].actor.id,"eva");
      assert(audit[0].changes.some(c=>c.field==="paymentMethod"&&c.new===method));assert(audit[0].changes.some(c=>c.field==="paymentReceivedCents"&&c.new===40800));
      for(const rejected of ["card","invoice","crypto","",null])await assert.rejects(call(id,after.updated_at,2,rejected));
      await sql(`update profitability_records set data=jsonb_set(data,'{paidCents}','50000') where id='${id}';`);
      await assert.rejects(call(id,after.updated_at,2,method));
      await sql(`update profitability_records set data=jsonb_set(data,'{paidCents}','40800') where id='${id}';`);
    }
    const id=ids[0],before=await read(id),financeBefore=await sql(`select to_jsonb(p) from profitability_records p where id='${id}'`),orderBefore=await fingerprint();
    await sql("create function reject_receipt_audit() returns trigger language plpgsql as $$begin raise exception 'Audit unavailable';end$$;create trigger reject_receipt_audit before insert on admin_audit_events for each row execute function reject_receipt_audit();");
    await assert.rejects(call(id,before.updated_at,2,"zelle"));assert.equal(await fingerprint(),orderBefore);assert.equal(await sql(`select to_jsonb(p) from profitability_records p where id='${id}'`),financeBefore);
    await sql("drop trigger reject_receipt_audit on admin_audit_events;");
    const legacyOrder=await read(ids[1]);
    const legacy=JSON.parse(await sql(`set role service_role;select mark_order_paid_cash('${ids[1]}','${legacyOrder.updated_at}',2,${literal(actor)},'2026-11-24','{}');`));assert.equal(legacy.data.paymentMethod,"cash");
    for(const role of ["anon","authenticated"])await assert.rejects(sql(`set role ${role};select mark_order_paid('${id}',now(),0,'{}','2026-11-24','{}','cash');`));
  }finally{if(started)await exec("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);await fs.rm(root,{recursive:true,force:true});}
});
