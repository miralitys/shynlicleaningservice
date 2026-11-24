"use strict";
const {test,assert,fs,os,path,startServer,stopServer,createAdminSession,loadAdminConfig,hashPassword,getCookieValue,getSetCookies}=require("./admin-route-helpers");

test("Eva records full Cash, Zelle, Venmo and Check receipts, not Card or Invoice, without access to other order fields",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"shynli-eva-methods-"));
  const password="LocalMethodsOnly123!";
  const users=[{id:"eva",email:"eva@shynli.local",role:"viewer"},{id:"observer",email:"observer@example.test",role:"viewer"}]
    .map(user=>({...user,staffId:`staff-${user.id}`,status:"active",name:user.id,passwordHash:hashPassword(password),emailVerificationRequired:false}));
  const env={ADMIN_MASTER_SECRET:"local-method-test",PROFITABILITY_ENABLED:"1",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",GHL_API_KEY:"",GHL_LOCATION_ID:"",
    ADMIN_USERS_STORE_PATH:path.join(root,"users.json"),ADMIN_STAFF_STORE_PATH:path.join(root,"staff.json"),ADMIN_AUDIT_STORE_PATH:path.join(root,"audit.jsonl"),
    PROFITABILITY_STORE_PATH:path.join(root,"finance.json"),CLIENT_REMINDER_BOOTSTRAP_DELAY_MS:"99999999",RECURRING_ORDER_MAINTENANCE_ENABLED:"0"};
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH,JSON.stringify({version:1,users}));
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH,JSON.stringify({staff:[],assignments:[]}));
  const app=await startServer({env});
  const post=(cookie,body,route="/admin/orders",json=true)=>fetch(app.baseUrl+route,{method:"POST",redirect:"manual",headers:{cookie,accept:"application/json",
    "content-type":json?"application/json":"application/x-www-form-urlencoded"},body:json?JSON.stringify(body):new URLSearchParams(body)});
  const get=(cookie,route)=>fetch(app.baseUrl+route,{headers:{cookie},redirect:"manual"});
  try{
    const owner=`shynli_admin_session=${await createAdminSession(app.baseUrl,loadAdminConfig(env))}`,cookies={};
    for(const user of users){const r=await post("",{email:user.email,password},"/admin/login",false);assert.equal(r.status,303);
      cookies[user.id]=`shynli_user_session=${getCookieValue(getSetCookies(r),"shynli_user_session")}`;}
    const create=async()=>{const r=await post(owner,{action:"create-manual-order",customerName:"TEST Payment Methods",customerPhone:"2025550142",fullAddress:"100 TEST ONLY St",
      acquisitionSource:"referral",serviceType:"deep",totalPrice:"374",selectedDate:"2099-12-21",selectedTime:"09:00",serviceDurationHours:"4",serviceDurationMinutes:"45"},"/admin/orders",false);
      assert.equal(r.status,303);return new URL(r.headers.get("location"),app.baseUrl).searchParams.get("order");};
    const finance=async id=>(await get(owner,`/admin/profitability/api?entryId=${id}`)).json();
    const receipt=async(id,body={},cookie=cookies.eva)=>post(cookie,{action:"mark-order-paid",entryId:id,expectedUpdatedAt:(await finance(id)).orderUpdatedAt,...body});
    const auditBefore=await fs.readFile(env.ADMIN_AUDIT_STORE_PATH,"utf8").catch(()=>"");
    for(const method of ["cash","zelle","venmo","check"]){
      const id=await create();
      const page=await(await get(cookies.eva,`/admin/orders?fragment=order-dialog&order=${id}`)).text();
      assert.match(page,/name="paymentMethod"/);
      for(const option of ["cash","zelle","venmo","check"])assert.match(page,new RegExp(`<option value="${option}"`));
      assert.doesNotMatch(page,/<option value="(?:card|invoice)"/);
      const paid=await receipt(id,{paymentMethod:method});assert.equal(paid.status,200,await paid.clone().text());
      const result=await paid.json();assert.equal(result.paidCents,37400);assert.equal(result.paymentMethod,method);
      const row=await finance(id);assert.equal(row.fields.paidCents,37400);assert.equal(row.fields.paymentMethod,method);
      const after=await(await get(owner,`/admin/orders?fragment=order-dialog&order=${id}`)).text();
      assert.match(after,/value="374\.00"/);assert.match(after,/2099-12-21/);
      assert.match(after,/name="serviceDurationHours"[^>]*value="4"/);assert.match(after,/name="serviceDurationMinutes"[^>]*value="45"/);
      const state=JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH,"utf8"));
      const version=state.records[id].version;
      const repeated=await receipt(id,{paymentMethod:method});assert.equal(repeated.status,200);
      assert.equal(JSON.parse(await fs.readFile(env.PROFITABILITY_STORE_PATH,"utf8")).records[id].version,version);
    }
    const id=await create();
    for(const method of ["card","invoice","crypto","",null,["cash"],{value:"cash"}])assert.equal((await receipt(id,{paymentMethod:method})).status,400,JSON.stringify(method));
    assert.equal((await receipt(id)).status,400);
    for(const field of ["paidCents","totalPrice","paymentStatus","selectedDate","selectedTime","serviceDurationMinutes","payroll","recurringEditScope","actor"])
      assert.equal((await receipt(id,{paymentMethod:"zelle",[field]:"forbidden"})).status,403,field);
    assert.equal((await receipt(id,{paymentMethod:"zelle"},cookies.observer)).status,403);
    const legacy=await receipt(id,{action:"mark-order-paid-cash"});assert.equal(legacy.status,200);assert.equal((await legacy.json()).paymentMethod,"cash");
    assert.equal((await receipt(id,{action:"mark-order-paid-cash",paymentMethod:"card"})).status,403);
    const events=(await fs.readFile(env.ADMIN_AUDIT_STORE_PATH,"utf8")).slice(auditBefore.length).split("\n").filter(Boolean).map(JSON.parse);
    const changes=events.filter(e=>e.actor?.id==="eva"&&e.status==="succeeded").flatMap(e=>e.changes||[]);
    for(const method of ["cash","zelle","venmo","check"])assert(changes.some(c=>c.field==="paymentMethod"&&c.new===method),method);
    const report=await(await get(cookies.eva,"/admin/profitability?status=all")).text();assert.match(report,/Venmo/);
  }finally{await stopServer(app.child);await fs.rm(root,{recursive:true,force:true});}
});
