"use strict";
const { test, assert, fs, os, path, startServer, stopServer, createSmtpTestServer, createFetchStub,
  loadAdminConfig, createAdminSession, hashPassword, getSetCookies, getCookieValue } = require("./admin-route-helpers");
const { createAdminSmsHelpers } = require("../lib/admin/handlers-sms-helpers");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { snapshot, diff } = require("../lib/admin-audit");
const normalizeString = (value, max=500) => String(value || "").trim().slice(0,max);
const domain = createAdminDomainHelpers({ normalizeString });

function visit(policy) {
  const state={isCreated:true,status:"scheduled",selectedDate:"2099-12-21",selectedTime:"09:00",frequency:"biweekly",
    serviceDurationMinutes:285,assignedStaff:"Cleaner A",payrollOverrides:{a:"150.00"},
    ...(policy?{policyAcceptance:policy}:{}),cleanerConfirmation:{responses:{a:{status:"confirmed"}}}};
  return {id:"local-visit",requestId:"local-request",customerName:"TEST Client",customerPhone:"2025550142",customerEmail:"qa@example.test",
    fullAddress:"100 TEST ONLY St",serviceType:"deep",totalPrice:374,totalPriceCents:37400,selectedDate:state.selectedDate,selectedTime:state.selectedTime,
    payloadForRetry:{orderState:structuredClone(state),adminOrder:structuredClone(state),calculatorData:{serviceType:"deep",rooms:4,bathrooms:2.5,squareMeters:2000},adminSms:{history:[{message:"Keep history"}]}}};
}

test("per-visit policy preference preserves signature, schedule, money, team, payouts, confirmations and history",()=>{
  const signature={policyAccepted:true,status:"accepted",signedAt:"2026-08-01T12:00:00Z",typedSignature:"TEST Signature",certificateFile:{id:"old-certificate"}};
  const entry=visit(signature);domain.applyOrderEntryUpdates(entry,{});
  const before=snapshot(entry,"order"),policy=structuredClone(getEntryOrderState(entry).policyAcceptance),sms=structuredClone(entry.payloadForRetry.adminSms);
  domain.applyOrderEntryUpdates(entry,{policyAutoSendDisabled:true});
  assert.equal(getEntryOrderState(entry).policyAutoSendDisabled,true);
  assert.deepEqual(diff(before,snapshot(entry,"order")),[{field:"policyAutoSendDisabled",old:false,new:true}]);
  assert.deepEqual(getEntryOrderState(entry).policyAcceptance,policy);assert.deepEqual(entry.payloadForRetry.adminSms.history,sms.history);
  domain.applyOrderEntryUpdates(entry,{paymentMethod:"zelle"});assert.equal(getEntryOrderState(entry).policyAutoSendDisabled,true);
  const next=domain.buildRecurringOrderSubmission(entry,{frequency:"biweekly",selectedDate:"2099-12-28",selectedTime:"09:00"});assert(next);
  assert.notEqual(getEntryOrderState(next).policyAutoSendDisabled,true,"Opt-out is for this visit, not the whole series");
  domain.applyOrderEntryUpdates(entry,{policyAutoSendDisabled:false});assert.equal(getEntryOrderState(entry).policyAutoSendDisabled,false);
  assert.deepEqual(getEntryOrderState(entry).policyAcceptance,policy);
});

test("automatic policy opt-out stops before policy lookup, new tokens, SMTP, SMS or writes",async()=>{
  const entry=visit();entry.payloadForRetry.orderState.policyAutoSendDisabled=true;
  const before=structuredClone(entry);
  const helpers=createAdminSmsHelpers({normalizeString,orderPolicyAcceptance:{buildPendingAcceptance:()=>assert.fail("No new token")},
    accountInviteEmail:{getStatus:()=>assert.fail("No SMTP lookup"),sendOrderPolicyConfirmation:()=>assert.fail("No email")}});
  const result=await helpers.sendOrderPolicyAcceptanceInvite({listEntries:()=>assert.fail("No directory read"),updateOrderEntry:()=>assert.fail("No write")},
    entry.id,entry,{}, {sendSmsMessage:()=>assert.fail("No SMS")},{respectClientAutomaticNotifications:true});
  assert.equal(result.emailState,"auto-send-disabled");assert.equal(result.pendingAcceptance,null);assert.deepEqual(entry,before);
});

test("a relative's matching name/address is not evidence of the target client's signature",async()=>{
  const daughter=visit({policyAccepted:true,signedAt:"2026-10-01",certificateFile:{id:"daughter-only"}});
  daughter.id="daughter";daughter.customerName="Rita TEST";
  const mother=visit();mother.id="mother";mother.customerName="Vandana TEST";mother.customerEmail="other@example.test";mother.customerPhone="2025550188";
  const helpers=createAdminSmsHelpers({normalizeString});
  const result=await helpers.applyAlreadyAcceptedPolicyForClient({listEntries:async()=>[daughter,mother],updateOrderEntry:()=>assert.fail("Must not copy a relative's signature")},mother.id,mother);
  assert(!result.policyAcceptance);
});

test("managers can save per-order opt-out with Scheduled; default delivery, manual sending, history and readonly protection stay intact",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"shynli-policy-preference-"));
  const smtp=await createSmtpTestServer();
  const stub=await createFetchStub([{method:"GET",match:"/contacts/",status:200,body:{contacts:[]}},
    {method:"POST",match:"/contacts/",status:200,body:{contact:{id:"policy-optout-contact"}}},
    {method:"POST",match:"/conversations/messages",status:201,body:{messageId:"synthetic-message",conversationId:"synthetic-conversation"}}]);
  const password="LocalPolicyPreference123!";
  const env={ADMIN_MASTER_SECRET:"local-policy-preference",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",PROFITABILITY_ENABLED:"0",
    GHL_API_KEY:"ghl_test_key",GHL_LOCATION_ID:"location-test",GHL_ENABLE_NOTES:"0",GHL_CREATE_OPPORTUNITY:"0",SHYNLI_FETCH_STUB_ENTRY:stub.stubEntry,
    ADMIN_USERS_STORE_PATH:path.join(root,"users.json"),ADMIN_AUDIT_STORE_PATH:path.join(root,"audit.jsonl"),
    ACCOUNT_INVITE_EMAIL_FROM:"test@example.test",ACCOUNT_INVITE_SMTP_HOST:smtp.host,ACCOUNT_INVITE_SMTP_PORT:String(smtp.port),ACCOUNT_INVITE_SMTP_REQUIRE_TLS:"0",
    ORDER_POLICY_TOKEN_SECRET:"local-policy-preference",CLIENT_REMINDER_BOOTSTRAP_DELAY_MS:"99999999"};
  const users=[{id:"manager",role:"manager"},{id:"eva",role:"viewer"},{id:"cleaner",role:"cleaner",staffId:"a"}].map(user=>({...user,
    staffId:user.staffId||"staff-"+user.id,email:user.id+"@example.test",name:user.id,status:"active",passwordHash:hashPassword(password),emailVerificationRequired:false}));
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH,JSON.stringify({version:1,users}));
  const app=await startServer({env});
  const post=(cookie,fields,route="/admin/orders")=>fetch(app.baseUrl+route,{method:"POST",redirect:"manual",headers:{cookie,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(fields)});
  const get=async(cookie,id)=>{const response=await fetch(app.baseUrl+"/admin/orders?fragment=order-dialog&order="+id,{headers:{cookie}});assert.equal(response.status,200);return response.text();};
  const checked=html=>/name="policyAutoSendDisabled"[^>]* checked/.test(html);
  const policyEmails=()=>smtp.messages.filter(message=>message.raw.includes("Action Required: Please Review and Accept"));
  const policySms=async()=>{const captured=await fs.readFile(stub.captureFile,"utf8").catch(error=>{if(error.code==="ENOENT")return "";throw error;});
    const lines=captured.split("\n").filter(Boolean).map(JSON.parse);
    return lines.filter(item=>String(item.url).includes("/conversations/messages")&&/please review and accept our service policies here/i.test(item.body||""));};
  try{
    const owner="shynli_admin_session="+await createAdminSession(app.baseUrl,loadAdminConfig(env));
    const cookies={};for(const user of users){const response=await post("",{email:user.email,password},user.role==="cleaner"?"/account/login":"/admin/login");assert.equal(response.status,303);
      cookies[user.id]="shynli_user_session="+getCookieValue(getSetCookies(response),"shynli_user_session");}
    const create=async()=>{const response=await post(owner,{action:"create-manual-order",customerName:"TEST Policy Preference",customerPhone:"2025550142",customerEmail:"client@example.test",
      fullAddress:"100 TEST ONLY St",serviceType:"deep",totalPrice:"374",selectedDate:"2099-12-21",selectedTime:"09:00",serviceDurationHours:"4",serviceDurationMinutes:"45"});
      assert.equal(response.status,303);const id=new URL(response.headers.get("location"),app.baseUrl).searchParams.get("order");assert(id);return id;};
    const id=await create();
    const saved=await post(cookies.manager,{action:"update-order",entryId:id,orderStatus:"scheduled",assignedStaff:"TEST Cleaner",
      policyAutoSendPreferencePresent:"1",policyAutoSendDisabled:"1"});assert.equal(saved.status,303);
    let html=await get(owner,id);assert(checked(html));assert.match(html,/Автоотправка политики отключена/);
    assert.match(html,/Отправить вручную/);assert.match(html,/form="admin-order-detail-dialog-[^"]+-edit-form"/);
    assert.equal(policyEmails().length,0);assert.equal((await policySms()).length,0);
    const absent=await fetch(app.baseUrl+"/api/admin/policy-acceptance/"+id,{headers:{cookie:owner}});assert.equal(absent.status,404,"Opt-out is not a fake signature or an unsent pending token");
    await post(cookies.manager,{action:"update-order",entryId:id,paymentMethod:"zelle"});html=await get(owner,id);assert(checked(html),"A request without this field must not reset it");
    for(const[name,value]of [["totalPrice","374.00"],["serviceDurationHours","4"],["serviceDurationMinutes","45"]])assert.match(html,new RegExp(`name="${name}"[^>]*value="${value}"`));
    assert.match(html,/2099-12-21/);assert.match(html,/TEST Cleaner/);
    const second=await create();await post(cookies.manager,{action:"update-order",entryId:second,orderStatus:"scheduled",assignedStaff:"TEST Cleaner"});
    assert.equal(policyEmails().length,1,"Another order for the same client retains default auto delivery");assert.equal((await policySms()).length,1);
    const manual=await post(cookies.manager,{action:"resend-order-policy",entryId:id});assert.equal(manual.status,303);
    assert.equal(policyEmails().length,2,"Explicit manual sending remains available");assert.equal((await policySms()).length,2);
    const readPolicy=async()=>{const response=await fetch(app.baseUrl+"/api/admin/policy-acceptance/"+id,{headers:{cookie:owner}});assert.equal(response.status,200);return response.json();};
    const pending=await readPolicy();assert.equal(pending.policyAccepted,false);assert(pending.sentAt);
    await post(cookies.manager,{action:"update-order",entryId:id,policyAutoSendPreferencePresent:"1"});assert(!checked(await get(owner,id)));
    assert.deepEqual(await readPolicy(),pending,"Changing auto delivery must not revoke the active link");assert.equal(policyEmails().length,2);
    const denied=await post(cookies.eva,{action:"update-order",entryId:id,policyAutoSendDisabled:"1"});assert.equal(denied.status,403);
    const cleaner=await post(cookies.cleaner,{action:"update-order",entryId:id,policyAutoSendDisabled:"1"});assert.equal(cleaner.status,303);assert.match(cleaner.headers.get("location"),/^\/account/);
    assert.doesNotMatch(await get(cookies.eva,id),/name="policyAutoSendDisabled"/);
    assert(!checked(await get(owner,id)));
    const events=(await fs.readFile(env.ADMIN_AUDIT_STORE_PATH,"utf8")).split("\n").filter(Boolean).map(JSON.parse);
    const changes=events.filter(event=>event.entry_id===id).flatMap(event=>(event.changes||[]).filter(change=>change.field==="policyAutoSendDisabled").map(change=>({...change,actor:event.actor.id})));
    assert.deepEqual(changes.filter(change=>change.old!==null).map(change=>[change.old,change.new,change.actor]),[[false,true,"manager"],[true,false,"manager"]]);
  }finally{await stopServer(app.child);await smtp.close();await fs.rm(root,{recursive:true,force:true});}
});
