"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { hashPassword } = require("../lib/admin-auth");
const { getClientSourcePreference, resolveManualOrderClientSource } = require("../lib/admin/manual-order-source");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { inheritedSource } = require("../lib/profitability");
const domain=createAdminDomainHelpers({normalizeString:(v,max=500)=>String(v||"").trim().slice(0,max)});

function order(id,address="100 Test Street") {
 return {id,kind:"quote_submission",customerName:"TEST Source Profile",customerPhone:"6305550141",customerEmail:"source@example.test",fullAddress:address,createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",totalPrice:417,status:"success",serviceType:"regular",
  payloadForRetry:{calculatorData:{acquisitionSource:"google",frequency:"biweekly"},orderState:{isCreated:true,status:"completed",selectedDate:"2026-01-01",assignedStaff:"TEST Cleaner",payrollOverrides:{a:120}}}};
}
function profile(id,source,stamp="2026-11-25T00:00:00Z") {
 return {id,kind:"client_record",customerName:"TEST Source Profile",customerPhone:"6305550141",customerEmail:"source@example.test",fullAddress:"100 Test Street",createdAt:stamp,updatedAt:stamp,
  payloadForRetry:{adminClient:{sourcePreferenceOnly:true,acquisitionSource:source,acquisitionSourceUpdatedAt:stamp,secondaryPhone:"6305550142"}}};
}

test("client source preference distinguishes unknown from unset and uses the latest valid profile only",()=>{
 assert.equal(getClientSourcePreference([order("old")]),null);
 const rows=[profile("first","referral","2026-01-01"),profile("latest","nextdoor"),profile("bad","invalid","2027-01-01"),profile("bad-array",["google"],"2028-01-01"),{...order("not-profile"),payloadForRetry:{adminClient:{acquisitionSource:"thumbtack"}}}];
 const before=JSON.stringify(rows);
 assert.equal(getClientSourcePreference(rows).source,"nextdoor");
 assert.equal(getClientSourcePreference([...rows,profile("unknown","","2026-12-01")]).source,"");
 assert.equal(JSON.stringify(rows),before);
});

test("a source-only profile preserves client counts, addresses, revenue and latest-visit metadata",async()=>{
 const rows=[order("one"),order("two","200 Test Street")],before=domain.collectAdminClientRecords(rows)[0];
 const withProfile=[profile("profile","referral"),...rows],client=domain.collectAdminClientRecords(withProfile)[0];
 assert.equal(domain.collectAdminClientRecords(withProfile).length,1);
 for(const key of ["requestCount","addressCount","totalRevenue","pastVisitRevenue","latestCreatedAt","latestRequestId","latestService","latestStatus","regularVisitCount","recurringVisitCount"])
  assert.deepEqual(client[key],before[key],key);
 assert.deepEqual(client.addresses,before.addresses);
 assert.equal(client.acquisitionSource,"referral");
 assert.equal(client.hasAcquisitionSourcePreference,true);
 const ledger={listOrderListEntries:async()=>withProfile};
 const finance={listSources:async()=>{throw Error("Profile preference must not read finance");},get:async()=>{throw Error("Profile preference must not read finance");}};
 for(const customerPhone of ["6305550141","+1 (630) 555-0142"]){
  assert.deepEqual(await resolveManualOrderClientSource({customerPhone},ledger,finance),{existingClient:true,source:"referral"});
  assert.equal(await inheritedSource({customerPhone},ledger,finance),"referral");
 }
});

test("profile source follows linked secondary identities and distinguishes explicit unknown from website fallback",async()=>{
 const saved=profile("profile","referral"); delete saved.payloadForRetry.adminClient.secondaryPhone;
 const linked=order("linked"); linked.payloadForRetry.adminClient={secondaryPhone:"6305550142"};
 const ledger={listOrderListEntries:async()=>[saved,linked]};
 assert.equal(await inheritedSource({customerPhone:"6305550142"},ledger),"referral");
 saved.payloadForRetry.adminClient.acquisitionSource="";
 assert.equal(await inheritedSource({customerPhone:"6305550142"},ledger,null,{fallback:"website"}),"");
 assert.equal(await inheritedSource({customerPhone:"6305550199"},ledger,null,{fallback:"website"}),"website");
});

test("profile display ignores an earlier quote that never became an order",()=>{
 const quote=order("quote"); delete quote.payloadForRetry.orderState; quote.createdAt="2025-01-01";
 const visit=order("visit"); visit.payloadForRetry.calculatorData.acquisitionSource="referral";
 assert.equal(domain.collectAdminClientRecords([quote,visit])[0].acquisitionSource,"referral");
});

test("simultaneous first profile saves have one winner and never overwrite or create duplicates",async()=>{
 const {createQuoteOpsStore}=require("../lib/quote-ops/store");
 const normalizeString=(v,max=500)=>String(v||"").trim().slice(0,max);
 const input={kind:"client_record",ok:true,code:"CLIENT_SOURCE_PROFILE_CREATED",sourceProfileKey:"6305550141",
  payloadForRetry:{adminClient:{sourcePreferenceOnly:true,acquisitionSource:"referral"}}};
 const store=createQuoteOpsStore({...domain,normalizeString,env:{},QUOTE_OPS_LEDGER_LIMIT:100});
 const results=await Promise.allSettled([store.recordSubmission(input),store.recordSubmission({...input,payloadForRetry:{adminClient:{sourcePreferenceOnly:true,acquisitionSource:"google"}}})]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(results.find(r=>r.status==="rejected").reason.status,409);
 assert.equal((await store.listEntries({includeHidden:true})).length,1);
 const rows=new Map();let syncs=0;
 const remote=()=>createQuoteOpsStore({...domain,normalizeString,env:{},QUOTE_OPS_LEDGER_LIMIT:100,
  orderStore:{async upsertEntry(){syncs++;}},createSupabaseQuoteOpsClient:()=>({isConfigured:()=>true,
   async upsertEntry(entry){await Promise.resolve();if(rows.has(entry.id))throw Object.assign(new Error("duplicate key"),{code:"23505"});rows.set(entry.id,structuredClone(entry));}})});
 const race=await Promise.allSettled([remote().recordSubmission(input),remote().recordSubmission({...input,payloadForRetry:{adminClient:{sourcePreferenceOnly:true,acquisitionSource:"google"}}})]);
 assert.equal(race.filter(r=>r.status==="fulfilled").length,1);assert.equal(race.find(r=>r.status==="rejected").reason.status,409);
 assert.equal(rows.size,1);assert.equal(syncs,1);
});

test("source saves reuse standalone profiles, preserve their fields, survive contact edits and support contactless clients",async()=>{
 const record=profile("standalone","google");delete record.payloadForRetry.adminClient.sourcePreferenceOnly;
 Object.assign(record.payloadForRetry.adminClient,{notes:"Keep notes",automaticNotificationsEnabled:false,photos:[{path:"keep-photo"}]});
 record.payloadForRetry.other={keep:true};const before=structuredClone(record);
 domain.applyClientEntryUpdates(record,{acquisitionSource:"referral",expectedSourceUpdatedAt:getClientSourcePreference([record]).updatedAt});
 for(const key of ["notes","automaticNotificationsEnabled","photos"])assert.deepEqual(record.payloadForRetry.adminClient[key],before.payloadForRetry.adminClient[key]);
 for(const key of ["customerName","customerPhone","customerEmail","fullAddress","totalPrice","createdAt"])assert.deepEqual(record[key],before[key]);
 assert.deepEqual(record.payloadForRetry.other,before.payloadForRetry.other);
 domain.applyClientEntryUpdates(record,{notes:"Updated notes"});
 assert.equal(getClientSourcePreference([record]).source,"referral");
 const noContact=profile("no-contact","nextdoor");noContact.customerPhone="";noContact.customerEmail="";delete noContact.payloadForRetry.adminClient.secondaryPhone;
 const client=domain.collectAdminClientRecords([noContact])[0];
 assert.deepEqual(await resolveManualOrderClientSource({selectedClientKey:client.key,customerName:client.name},{listOrderListEntries:async()=>[noContact]}),{existingClient:true,source:"nextdoor"});
});

test("source-only client save inherits across addresses without changing previous orders, finance or roles",{timeout:40000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"shynli-client-source-"));
 const password="LocalSourceProfile123!",viewer={id:"eva-source-test",name:"Eva TEST",email:"eva@shynli.local",role:"viewer",status:"active",staffId:"eva-test",passwordHash:hashPassword(password),emailVerificationRequired:false};
 const env={ADMIN_MASTER_SECRET:"isolated-client-profile-source",PROFITABILITY_ENABLED:"1",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",GHL_API_KEY:"",GHL_LOCATION_ID:"",
  ADMIN_USERS_STORE_PATH:path.join(root,"users.json"),PROFITABILITY_STORE_PATH:path.join(root,"finance.json"),ADMIN_AUDIT_STORE_PATH:path.join(root,"audit.jsonl")};
 await fs.writeFile(env.ADMIN_USERS_STORE_PATH,JSON.stringify({version:1,users:[viewer]}));
 const app=await startServer({env});
 const post=(route,cookie,values,ajax=false)=>fetch(app.baseUrl+route,{method:"POST",redirect:"manual",headers:{cookie,"content-type":"application/x-www-form-urlencoded",...(ajax?{accept:"application/json","x-requested-with":"XMLHttpRequest"}:{})},body:new URLSearchParams(values)});
 const get=async(route,cookie)=>{const r=await fetch(app.baseUrl+route,{headers:{cookie}});assert.equal(r.status,200);return r.text();};
 const clientData=html=>JSON.parse(html.match(/<script type="application\/json" data-admin-manual-client-data>([\s\S]*?)<\/script>/)[1]);
 const sourceStamp=html=>html.match(/name="expectedSourceUpdatedAt" value="([^"]*)"/)[1];
 try{
  const cookie=`shynli_admin_session=${await createAdminSession(app.baseUrl,loadAdminConfig(env))}`;
  const create={action:"create-manual-order",customerName:"TEST Source Profile",customerPhone:"6305550141",customerEmail:"source@example.test",serviceType:"regular",totalPrice:"417",acquisitionSource:"google",selectedDate:"2099-01-01",selectedTime:"09:00"};
  const ids=[];
  for(const fullAddress of ["100 Test Street","200 Test Street"]){const r=await post("/admin/orders",cookie,{...create,fullAddress});assert.equal(r.status,303);ids.push(new URL(r.headers.get("location"),app.baseUrl).searchParams.get("order"));}
  const details=await Promise.all(ids.map(id=>get(`/admin/orders?fragment=order-dialog&order=${id}`,cookie)));
  const {createProfitabilityStore}=require("../lib/profitability-store");
  await createProfitabilityStore({env}).saveBatch([{id:ids[0],version:0,patch:{source:"thumbtack"}}],{id:"local-qa"});
  const clientsPath="/admin/clients?client=6305550141";
  const card=await get(clientsPath,cookie);
  assert.match(card,/name="action" value="update-client-source"/);
  assert.match(card,/<option value="thumbtack" selected>/,"profile respects the corrected first order source");
  assert.match(card,/Откуда узнали о нас/);
  const financeBefore=await fs.readFile(env.PROFITABILITY_STORE_PATH).catch(e=>{if(e.code==="ENOENT")return null;throw e;});
  const save={action:"update-client-source",clientKey:"6305550141",returnTo:clientsPath,acquisitionSource:"referral",expectedSourceUpdatedAt:sourceStamp(card)};
  const saved=await post("/admin/clients",cookie,save,true);assert.equal(saved.status,200,await saved.text());
  const after=await get(clientsPath,cookie);assert.match(after,/<option value="referral" selected>/);
  for(let i=0;i<ids.length;i++)assert.equal(await get(`/admin/orders?fragment=order-dialog&order=${ids[i]}`,cookie),details[i],"historical order changed");
  for(const address of ["100 Test Street","200 Test Street"]){
   const form=await get(`/admin/orders?fragment=create-order-dialog&createClientKey=6305550141&createAddressKey=${encodeURIComponent(address.toLowerCase())}`,cookie);
   assert.equal(clientData(form).find(c=>c.phone.replace(/\D/g,"").endsWith("6305550141")).acquisitionSource,"referral");
  }
  const created=await post("/admin/orders",cookie,{...create,acquisitionSource:"",fullAddress:"200 Test Street",selectedDate:"2099-01-03"});assert.equal(created.status,303);
  const newId=new URL(created.headers.get("location"),app.baseUrl).searchParams.get("order");
  const receipt=JSON.parse(await get(`/admin/profitability/api?entryId=${newId}`,cookie));assert.equal(receipt.fields.source,"referral");
  for(const extra of [{acquisitionSource:"invalid"},{totalPrice:"1"},{assignedStaff:"forged"}])assert.equal((await post("/admin/clients",cookie,{...save,expectedSourceUpdatedAt:sourceStamp(after),...extra},true)).status,400);
  const stale=await post("/admin/clients",cookie,{...save,acquisitionSource:"nextdoor"},true);assert.equal(stale.status,409);
  const unknown=await post("/admin/clients",cookie,{...save,acquisitionSource:"",expectedSourceUpdatedAt:sourceStamp(after)},true);assert.equal(unknown.status,200);
  const unknownForm=clientData(await get("/admin/orders?fragment=create-order-dialog",cookie)).find(c=>c.phone.replace(/\D/g,"").endsWith("6305550141"));assert.equal(unknownForm.acquisitionSource,"");
  const usersBefore=JSON.parse(await fs.readFile(env.ADMIN_USERS_STORE_PATH,"utf8")).users;
  const login=await post("/admin/login","",{email:viewer.email,password});assert.equal(login.status,303);const eva=login.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
  assert.doesNotMatch(await get(clientsPath,eva),/name="action" value="update-client-source"/);
  assert.equal((await post("/admin/clients",eva,{...save,expectedSourceUpdatedAt:sourceStamp(await get(clientsPath,cookie))},true)).status,403);
  const usersAfter=JSON.parse(await fs.readFile(env.ADMIN_USERS_STORE_PATH,"utf8")).users;
  for(const before of usersBefore)for(const key of ["id","role","status","email","passwordHash"])assert.equal(usersAfter.find(x=>x.id===before.id)[key],before[key]);
  const financeAfter=await fs.readFile(env.PROFITABILITY_STORE_PATH).catch(e=>{if(e.code==="ENOENT")return null;throw e;});assert.deepEqual(financeAfter,financeBefore);
  const audit=(await fs.readFile(env.ADMIN_AUDIT_STORE_PATH,"utf8")).split("\n").filter(Boolean).map(JSON.parse);
  assert(audit.some(e=>e.entity_type==="client"&&e.status==="succeeded"&&e.changes.some(c=>c.field==="client.acquisitionSource"&&c.new==="referral")));
 }finally{await stopServer(app.child);await fs.rm(root,{recursive:true,force:true});}
});
