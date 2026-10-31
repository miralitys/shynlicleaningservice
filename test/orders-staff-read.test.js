"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminStaffStore } = require("../lib/admin-staff-store");
const { createSupabaseAdminStaffClient, mapQuoteOpsRowToStaffRecord, mapQuoteOpsRowToAssignmentRecord } = require("../lib/supabase-admin-staff");
const { createOrdersPageRenderer } = require("../lib/admin/pages/orders-page");
const { readOrderStaffView } = require("./support/orders-staff-view.cjs");
const env = { SUPABASE_URL: "https://staff-read.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" };
const stamp = "2026-10-01T12:00:00.000Z";
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const response = (body, status=200, total) => ({ ok:status===200,status,text:async()=>JSON.stringify(body),
  headers:{get:name=>name==="content-range" && total !== undefined ? `0-0/${total}` : null} });

function fixture(count=1107, {cap=71, dedicated=false, failure=()=>null}={}) {
  const calls=[], rows=[];
  for(let i=0;i<6;i++) rows.push({id:uuid(i+1),kind:"admin_staff_member",customer_name:`Fallback ${i}`,full_address:"Fallback address",code:"active",created_at:stamp,updated_at:stamp,
    payload_for_retry:{staff:{id:`staff-${i}`,name:`Cleaner ${i}`,address:`${i} QA road`,role:"cleaner",status:i===1?"inactive":"active",
      compensationValue:"500",compensationType:"fixed",smsHistory:[{id:`sms-${i}`,message:"PRIVATE SMS",sentAt:stamp}],
      calendar:{tokenCipher:{version:1,data:"PRIVATE TOKEN"}},contract:{notes:"PRIVATE CONTRACT"},w9:{legalName:"PRIVATE W9"},createdAt:stamp,updatedAt:stamp}}});
  for(let i=0;i<count;i++)rows.push({id:uuid(100+i),kind:"admin_staff_assignment",request_id:`order-${i}`,warnings:["staff-0"],
    selected_date:"2027-01-01",selected_time:"09:00",code:"confirmed",error_message:"legacy notes",created_at:stamp,updated_at:stamp,
    payload_for_retry:{assignment:i===1?null:{entryId:`order-${i}`,staffIds:i===2?" staff-1 ":["staff-0","staff-1"],
      scheduleDate:i%2?"2027-02-03":"",scheduleTime:i%2?"11:30":"",status:i===3?"canceled":"confirmed",
      notes:"retain planning notes",calendarSync:{google:{byStaffId:{"staff-0":{eventId:"PRIVATE EVENT",calendarId:"PRIVATE CALENDAR"}}}},
      travelEstimates:[],createdAt:stamp,updatedAt:stamp},privateExtra:{history:"PRIVATE HISTORY"}}});
  const read=async(url,options={})=>{
    const u=new URL(url);calls.push({u,options});assert.equal(options.method,"GET");
    const broken=failure(u,calls);if(broken)return broken;
    if(u.pathname.endsWith("/admin_order_staff_list_entries"))return readOrderStaffView(rows,u,cap);
    if(u.pathname.includes("/admin_staff")&&!dedicated)return response({code:"PGRST205",message:"Could not find the table"},404);
    let matched=u.pathname.endsWith("/quote_ops_entries")?rows.filter(r=>`eq.${r.kind}`===u.searchParams.get("kind")):[];
    const cursor=u.searchParams.get("id");if(cursor)matched=matched.filter(r=>r.id>cursor.slice(3));
    const desc=u.searchParams.get("order")?.includes("desc"),key=u.searchParams.get("order")?.split(".")[0]||"id";
    matched=matched.slice().sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(desc?-1:1));
    const total=matched.length;
    matched=matched.slice(0,Math.min(cap,Number(u.searchParams.get("limit")||1000)));
    const select=u.searchParams.get("select");
    if(select!=="*")matched=matched.map(row=>Object.fromEntries(select.split(",").map(field=>{
      const [alias,expr]=field.includes(":")?field.split(":"):[field,field];
      return [alias,expr.split("->").reduce((v,k)=>v?.[k],row)??null];
    })));
    return response(matched,200,total);
  };
  const client=createSupabaseAdminStaffClient({env,fetch:read});
  const store=createAdminStaffStore({createSupabaseAdminStaffClient:()=>client});
  const complete=()=>({staff:rows.filter(r=>r.kind==="admin_staff_member").sort((a,b)=>a.customer_name.localeCompare(b.customer_name)).map(mapQuoteOpsRowToStaffRecord),
    assignments:rows.filter(r=>r.kind==="admin_staff_assignment").sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(mapQuoteOpsRowToAssignmentRecord)});
  const reference=createAdminStaffStore({createSupabaseAdminStaffClient:()=>({isConfigured:()=>true,fetchSnapshot:async()=>complete()})});
  return {calls,rows,client,store,reference};
}

function pickExpected(full){return {isOrderListSummary:true,
  staff:full.staff.map(s=>Object.fromEntries(["id","name","role","address","status","createdAt","updatedAt"].map(k=>[k,s[k]]))),
  assignments:full.assignments.map(a=>Object.fromEntries(["entryId","scheduleDate","scheduleTime","status","notes","createdAt","updatedAt","staffIds"].map(k=>[k,a[k]]))),
};}

test("order list reads every assignment beyond 1000 without employee documents, pay, SMS or calendar connections",async()=>{
  const f=fixture(),before=structuredClone(f.rows);
  const result=await f.store.getOrderListSnapshot();
  assert.deepEqual(result,pickExpected(await f.reference.getSnapshot()));
  assert.equal(result.assignments.length,1107);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|compensation|contract|calendarSync|smsHistory/);
  assert.ok(f.calls.filter(c=>c.u.pathname.endsWith("quote_ops_entries")).every(c=>c.u.searchParams.get("select")!=="*"));
  assert.equal(f.calls.filter(c=>c.u.pathname.includes("admin_staff")).length,2);
  f.calls.length=0;
  f.rows[0].payload_for_retry.staff.name="Updated cleaner";
  assert.ok((await f.store.getOrderListSnapshot()).staff.some(s=>s.name==="Updated cleaner"));
  assert.ok(f.calls.every(c=>c.u.pathname.endsWith("admin_order_staff_list_entries")),"schema discovery is not repeated");
  f.rows[0]=before[0];assert.deepEqual(f.rows,before);
});

test("notes-only assignments retain their presence and empty placeholders retain their old filtering",async()=>{
  const f=fixture(2);
  Object.assign(f.rows[6],{selected_date:"",selected_time:"",code:"planned",warnings:[],error_message:""});
  f.rows[6].payload_for_retry.assignment={entryId:"order-0",staffIds:[],status:"planned",notes:"important legacy note",createdAt:stamp,updatedAt:stamp};
  Object.assign(f.rows[7],{selected_date:"",selected_time:"",code:"planned",warnings:[],error_message:""});
  assert.deepEqual(await f.store.getOrderListSnapshot(),pickExpected(await f.reference.getSnapshot()));
  assert.equal((await f.store.getOrderListSnapshot()).assignments.length,1);
});

test("ambiguous legacy identity precedence uses full data, and incomplete full fallbacks are never accepted",async()=>{
  for(const cap of [500,1]){
    const f=fixture(2,{cap});f.rows[7].payload_for_retry={assignment:{...f.rows[6].payload_for_retry.assignment,staffIds:["staff-2"]}};
    if(cap===1){await assert.rejects(f.store.getOrderListSnapshot(),/Incomplete legacy/);continue;}
    assert.deepEqual(await f.store.getOrderListSnapshot(),pickExpected(await f.reference.getSnapshot()));
    assert.ok(f.calls.some(c=>c.u.pathname.endsWith("quote_ops_entries")&&c.u.searchParams.get("select")==="*"));
  }
});

test("missing counts, malformed pages, denied and failed subsequent reads stop rather than display partial assignments",async()=>{
  for(const fail of ["count","malformed","denied","next"]){
    const f=fixture(1107,{failure:u=>{
      if(!u.pathname.endsWith("admin_order_staff_list_entries"))return null;
      if(fail==="count")return response([]);
      if(fail==="malformed")return response({rows:[]},200,0);
      if(fail==="denied")return response({message:"Denied",code:"42501"},403);
      if(fail==="next"&&u.searchParams.has("id"))return response({message:"Second page unavailable"},503);
      return null;
    }});
    await assert.rejects(f.store.getOrderListSnapshot());
    assert.ok(f.calls.every(c=>c.options.method==="GET"));
  }
});

test("list summaries cannot poison full writes, payouts or the existing full cache",async()=>{
  const f=fixture(2,{cap:500});
  const full=await f.store.getSnapshot();
  await f.store.getOrderListSnapshot();
  assert.deepEqual(await f.store.getSnapshot(),full);
  assert.equal(full.staff[0].compensationValue,"500");assert.ok(full.staff[0].smsHistory.length);
  let writes=0;
  const writeClient={isConfigured:()=>true,fetchSnapshot:async()=>full,
    fetchOrderListSnapshot:async()=>({staff:[],assignments:[]}),
    upsertStaff:async record=>{writes++;assert.equal(record.compensationValue,"500");assert.equal(record.name,"New QA name");assert.ok(record.smsHistory.length);}};
  const store=createAdminStaffStore({createSupabaseAdminStaffClient:()=>writeClient});
  await store.getOrderListSnapshot();await store.updateStaff(full.staff[0].id,{name:"New QA name"});assert.equal(writes,1);
});

test("list staff failures are not replaced by stale memory after a successful full read",async()=>{
  const store=createAdminStaffStore({createSupabaseAdminStaffClient:()=>({isConfigured:()=>true,
    fetchSnapshot:async()=>({staff:[{id:"a",name:"QA"}],assignments:[]}),
    fetchOrderListSnapshot:async()=>{throw new Error("offline");}})});
  await store.getSnapshot();await assert.rejects(store.getOrderListSnapshot(),/offline/);
});

test("travel and legacy falsy fields keep their existing normalization",async()=>{
  const f=fixture(3);
  Object.assign(f.rows[0].payload_for_retry.staff,{name:"",address:false,status:0});
  Object.assign(f.rows[6].payload_for_retry.assignment,{staffIds:false,scheduleDate:0,scheduleTime:false,status:"",notes:"",
    travelEstimates:[{staffId:"staff-0",status:"ok",durationSeconds:600,distanceMeters:2000,originAddress:"QA",destinationAddress:"QA home"}]});
  const list=await f.store.getOrderListSnapshot();
  assert.deepEqual(list,pickExpected(await f.reference.getSnapshot()));
  assert.equal(list.assignments.find(a=>a.entryId==="order-0").travelEstimates,undefined);
  assert.equal((await f.reference.getSnapshot()).assignments.find(a=>a.entryId==="order-0").travelEstimates[0].durationSeconds,600);
});

test("a later assignment update still reads the full record and retains dates, team and calendar sync",async()=>{
  const f=fixture(2,{cap:500}),full=await f.reference.getSnapshot();
  let saved;
  const store=createAdminStaffStore({createSupabaseAdminStaffClient:()=>({isConfigured:()=>true,fetchSnapshot:async()=>full,
    fetchOrderListSnapshot:async()=>({staff:[],assignments:[]}),upsertAssignment:async row=>{saved=row;}})});
  await store.getOrderListSnapshot();await store.setAssignment(full.assignments[0].entryId,{notes:"QA edited note"});
  for(const key of ["entryId","staffIds","scheduleDate","scheduleTime","status","calendarSync","travelEstimates","createdAt"])
    assert.deepEqual(saved[key],full.assignments[0][key],key);
  assert.equal(saved.notes,"QA edited note");
});

test("Orders context chooses summary reads only when explicitly in list mode",async()=>{
  const calls=[];
  const renderer=createOrdersPageRenderer({collectNonAssignableStaffIds:()=>new Set(),normalizeString:v=>String(v||""),
    filterStaffSnapshotByHiddenStaffIds:s=>s});
  const staff={getSnapshot:async()=>{calls.push("full");return {staff:[],assignments:[]};},
    getOrderListSnapshot:async()=>{calls.push("list");return {staff:[],assignments:[],isOrderListSummary:true};}};
  await renderer.prepareStaffContext(staff,null);
  await renderer.prepareStaffContext(staff,null,{listOnly:false});
  assert.deepEqual(calls,["list","full"]);
});

test("an uninstalled view safely uses complete full reads and remembers only schema availability",async()=>{
  const f=fixture(1107,{failure:u=>u.pathname.endsWith("admin_order_staff_list_entries") ?
    response({code:"PGRST205",message:"Could not find the table admin_order_staff_list_entries"},404) : null});
  assert.deepEqual(await f.store.getOrderListSnapshot(),pickExpected(await f.reference.getSnapshot()));
  f.calls.length=0;
  f.rows[0].payload_for_retry.staff.name="Fresh fallback name";
  assert.ok((await f.store.getOrderListSnapshot()).staff.some(s=>s.name==="Fresh fallback name"));
  assert.ok(f.calls.every(c=>c.u.pathname.endsWith("quote_ops_entries")));
});

test("a disappearing second page or incomplete view record is an error, not a smaller successful list",async()=>{
  for(const variant of ["missing-next","record"]){
    const f=fixture(1107,{failure:u=>{
      if(!u.pathname.endsWith("admin_order_staff_list_entries"))return null;
      if(variant==="missing-next"&&u.searchParams.has("id"))return response({code:"PGRST205",message:"Could not find the table"},404);
      if(variant==="record")return response([{id:uuid(1),kind:"admin_staff_member",list_record:{}}],200,1);
      return null;
    }});
    await assert.rejects(f.store.getOrderListSnapshot());
    assert.ok(!f.calls.some(c=>c.u.pathname.endsWith("quote_ops_entries")));
  }
});

test("old SQL projections stay compatible without caching data or repeating missing-column probes",async()=>{
  const f=fixture(1107,{failure:u=>u.pathname.endsWith("admin_order_staff_list_entries")&&u.searchParams.get("select").includes("planning_record")?
    response({code:"42703",message:"column planning_record does not exist"},400):null});
  assert.deepEqual(await f.store.getOrderListSnapshot(),pickExpected(await f.reference.getSnapshot()));
  assert.equal(f.calls.filter(c=>c.u.searchParams.get("select")?.includes("planning_record")).length,2);
  f.calls.length=0;f.rows[0].payload_for_retry.staff.name="Changed while using old SQL";
  assert.ok((await f.store.getOrderListSnapshot()).staff.some(s=>s.name==="Changed while using old SQL"));
  assert.ok(f.calls.every(c=>!c.u.searchParams.get("select")?.includes("planning_record")));
});

test("a later missing-column or permission error cannot silently change the list projection",async()=>{
  for(const variant of ["next","denied"]){
    const f=fixture(1107,{failure:u=>{
      if(!u.pathname.endsWith("admin_order_staff_list_entries"))return null;
      if(variant==="next"&&u.searchParams.has("id"))return response({code:"42703",message:"column planning_record does not exist"},400);
      if(variant==="denied")return response({code:"42501",message:"planning_record denied"},403);
      return null;
    }});
    await assert.rejects(f.store.getOrderListSnapshot());
    assert.ok(f.calls.filter(c=>c.u.pathname.endsWith("admin_order_staff_list_entries")).every(c=>c.u.searchParams.get("select").includes("planning_record")));
  }
});

test("compact travel probes preserve exactly which legacy travel-only assignments exist",async()=>{
  for(const travel of [null,false,0,"",{},[],[null,false,0,"a",[]], [{staffId:" "}], [{staffId:0}], [{staffId:[]}],
    [{staffId:{}}], [{staffId:["a",null]}], [{staffId:"\uFEFF a \n",originAddress:"QA hidden route",durationSeconds:900}],
    [{staffId:"a"},{staffId:"a"},{staffId:" b "}]]){
    const f=fixture(1);
    Object.assign(f.rows[6],{selected_date:"",selected_time:"",code:"planned",warnings:[],error_message:""});
    f.rows[6].payload_for_retry.assignment={entryId:"order-0",staffIds:[],status:"planned",travelEstimates:travel,createdAt:stamp,updatedAt:stamp};
    const result=await f.store.getOrderListSnapshot();
    assert.deepEqual(result,pickExpected(await f.reference.getSnapshot()),JSON.stringify(travel));
    assert.ok(result.assignments.every(a=>!Object.hasOwn(a,"travelEstimates")));
  }
});
