"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile,spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const { projectOrderStaffRow,projectOrderStaffPlanningRow } = require("./support/orders-staff-view.cjs");
const { mapQuoteOpsRowToStaffRecord,mapQuoteOpsRowToAssignmentRecord } = require("../lib/supabase-admin-staff");
const exec = promisify(execFile);

test("Orders SQL preserves legacy fallback values, contains no private payloads, changes no records and denies browser roles",{timeout:30000},async t=>{
  if(spawnSync("initdb",["--version"]).status!==0){t.skip("Local PostgreSQL is not installed");return;}
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"shynli-orders-staff-pg-")),data=path.join(root,"data");
  const args=["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h",root,"-p","55450","-U",os.userInfo().username,"-d","postgres"];
  const sql=async command=>(await exec("psql",[...args,"-c",command],{maxBuffer:20*1024*1024})).stdout.trim();
  let started=false;
  try{
    await exec("initdb",["-D",data,"-A","trust","--no-locale"]);
    await exec("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-F -k ${root} -p 55450 -c listen_addresses=''`,"-w","start"]);
    started=true;
    await sql("create role anon; create role authenticated; create role service_role bypassrls;");
    await exec("psql",[...args,"-f",path.join(__dirname,"../supabase/quote_ops_schema.sql")]);
    await sql(`grant select on public.quote_ops_entries to service_role;
      insert into public.quote_ops_entries(id,kind,status,request_id,customer_name,service_name,full_address,
        selected_date,selected_time,code,warnings,error_message,created_at,updated_at,payload_for_retry)
      select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
        case when i<=1107 then 'admin_staff_assignment' else 'admin_staff_member' end,'success','order-'||i,
        'Fallback name','cleaner','QA address','2027-01-01','09:00','confirmed','["legacy-cleaner"]'::jsonb,
        'retain notes','2026-10-01T12:00Z'::timestamptz,'2026-10-01T12:00Z'::timestamptz,
        jsonb_build_object(case when i<=1107 then 'assignment' else 'staff' end,
          jsonb_build_object('id','cleaner-'||i,'name',v,'role',v,'address',v,'status',v,'entryId',v,
            'staffIds',v,'scheduleDate',v,'scheduleTime',v,'notes',v,'createdAt',v,'updatedAt',v,
            'travelEstimates',case when i%4=0 then 'null'::jsonb when i%4=1 then '[]'::jsonb
              when i%4=2 then jsonb_build_array(null,false,0,jsonb_build_object('staffId',v,'originAddress',repeat('QA route ',100),'durationSeconds',900))
              else jsonb_build_array(jsonb_build_object('staffId','cleaner-a','originAddress',repeat('QA route ',100),'durationSeconds',900),
                jsonb_build_object('staffId','cleaner-a'),jsonb_build_object('staffId',' ')) end,
            'calendarSync','PRIVATE','smsHistory','PRIVATE','compensationValue',500),
          'adminSms','PRIVATE')
      from generate_series(1,1120) i cross join lateral
        (select ('[null,false,0,"",[],{}," ","value",["a"]]'::jsonb)->(i%9) as v) vals;`);
    const hash=()=>sql("select md5(string_agg(to_jsonb(q)::text,'' order by id)) from public.quote_ops_entries q");
    const before=await hash();
    const migration=await fs.readFile(path.join(__dirname,"../supabase/admin_order_staff_list.sql"),"utf8");
    const projectionStart=migration.indexOf("\nselect id,kind,list_record,");
    const projectionEnd=migration.indexOf("\nfrom records;",projectionStart);
    assert.ok(projectionStart>0&&projectionEnd>projectionStart);
    await sql(migration.slice(0,projectionStart)+"\nselect id,kind,list_record"+migration.slice(projectionEnd));
    const legacyViewHash=()=>sql("select md5(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'list_record',list_record) order by id)::text) from public.admin_order_staff_list_entries");
    const beforeView=await legacyViewHash();
    for(let i=0;i<2;i++)await exec("psql",[...args,"-f",path.join(__dirname,"../supabase/admin_order_staff_list.sql")]);
    assert.equal(await legacyViewHash(),beforeView,"Existing apps retain identical list_record after the additive migration");
    const full=JSON.parse(await sql("select jsonb_agg(to_jsonb(q) order by id) from public.quote_ops_entries q"));
    const narrow=JSON.parse(await sql("begin read only; set local role service_role; select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'list_record',q.list_record) order by id) from public.admin_order_staff_list_entries q; commit;"));
    assert.deepEqual(narrow,full.map(projectOrderStaffRow));
    const planning=JSON.parse(await sql("select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'list_record',q.planning_record) order by id) from public.admin_order_staff_list_entries q"));
    assert.deepEqual(planning,full.map(projectOrderStaffPlanningRow));
    assert.doesNotMatch(JSON.stringify(planning),/QA route|originAddress|durationSeconds/);
    assert.equal(narrow.length,1120);
    assert.doesNotMatch(JSON.stringify(narrow),/PRIVATE|smsHistory|calendarSync|compensationValue|adminSms/);
    for(let i=0;i<full.length;i++){
      const staff=full[i].kind==="admin_staff_member",key=staff?"staff":"assignment";
      const mapper=staff?mapQuoteOpsRowToStaffRecord:mapQuoteOpsRowToAssignmentRecord;
      const old=mapper(full[i]),current=mapper({id:narrow[i].id,payload_for_retry:{[key]:narrow[i].list_record}});
      for(const field of Object.keys(narrow[i].list_record))assert.deepEqual(current[field],old[field],`${i}:${field}`);
      if(!staff){
        const compact=mapper({payload_for_retry:{assignment:planning[i].list_record}});
        assert.equal(compact.travelEstimates.length>0,old.travelEstimates.length>0,`${i}:legacy travel presence`);
        assert.deepEqual(compact.travelEstimates.map(r=>r.staffId),old.travelEstimates.map(r=>r.staffId));
      }
    }
    for(const role of ["anon","authenticated"]){
      await assert.rejects(sql(`set role ${role}; select * from public.admin_order_staff_list_entries;`),/permission denied/);
      await assert.rejects(sql(`set role ${role}; select public.admin_order_staff_list_value(null,null);`),/permission denied/);
    }
    assert.equal(await sql("select bool_and(provolatile='i' and not prosecdef) from pg_proc where proname='admin_order_staff_list_value'"),"t");
    assert.match(await sql("select reloptions from pg_class where relname='admin_order_staff_list_entries'"),/security_invoker=true/);
    assert.equal(await hash(),before);
    t.diagnostic(JSON.stringify({records:1120,assignments:1107,entireTableUnchanged:true,rolesDenied:["anon","authenticated"]}));
  }finally{
    if(started)await exec("pg_ctl",["-D",data,"-m","immediate","-w","stop"]).catch(()=>{});
    await fs.rm(root,{recursive:true,force:true});
  }
});
