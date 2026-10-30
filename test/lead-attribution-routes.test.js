"use strict";
const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig, createFetchStub } = require("./admin-route-helpers");
const { FIELD_NAMES, fieldKey } = require("../lib/lead-attribution-fields");
const { parse } = require("parse5");

function nodes(node, predicate, result=[]) {
  if (predicate(node)) result.push(node);
  for (const child of node.childNodes || []) nodes(child,predicate,result);
  return result;
}
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;

test("every form type persists attribution in new orders, card, complete filtered list and GHL without changing the canonical price", { timeout:60000 }, async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"shynli-attribution-routes-"));
  const mock=createFetchStub([
    {method:"GET",match:"/contacts/contact-attribution-test",status:200,body:{contact:{id:"contact-attribution-test",customFields:[]}}},
    {method:"POST",match:"/contacts/",status:201,body:{contact:{id:"contact-attribution-test"}}},
    {method:"PUT",match:"/contacts/",status:200,body:{contact:{id:"contact-attribution-test"}}},
  ]);
  const env={ADMIN_MASTER_SECRET:"isolated-attribution-qa",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",GHL_API_KEY:"synthetic",GHL_LOCATION_ID:"isolated-shynli",GHL_ENABLE_NOTES:"0",GHL_CREATE_OPPORTUNITY:"0",PROFITABILITY_ENABLED:"0",SHYNLI_FETCH_STUB_ENTRY:mock.stubEntry,
    GHL_CUSTOM_FIELDS_JSON:JSON.stringify(Object.fromEntries(FIELD_NAMES.map(name=>[fieldKey(name),`attr-${name}`]))),ADMIN_STAFF_STORE_PATH:path.join(root,"staff.json")};
  const app=await startServer({env});
  try {
    const cookie=`shynli_admin_session=${await createAdminSession(app.baseUrl,loadAdminConfig(env))}`;
    const cases=[
      {source:{utm_source:"chatgpt.com"},channel:"ИИ-поиск (ChatGPT)",form:"quote"},
      {source:{gclid:"test"},channel:"Google Ads",form:"calculator"},
      {source:{referrer:"google.com"},channel:"Google (органика или карты/GBP)",form:"booking"},
      {source:{},channel:"Прямой заход",form:"callback"},
    ];
    for (const [index,item] of cases.entries()) {
      const response=await fetch(app.baseUrl+"/api/quote/submit",{method:"POST",headers:{"content-type":"application/json",cookie:`shynli_attribution=${encodeURIComponent(JSON.stringify({...item.source,landing_page:"https://shynlicleaningservice.com/"}))}`},body:JSON.stringify({form_type:item.form,
        submission_page:"https://shynlicleaningservice.com/quote?private=removed",contactData:{fullName:`TEST Attribution ${index}`,phone:`202555014${index}`},calculatorData:{serviceType:"deep",rooms:4,bathrooms:3,squareMeters:2000,zipCode:"60540",fullAddress:"100 Isolated Test Street",services:[],consent:false}})});
      assert.equal(response.status,201);const result=await response.json();assert.equal(result.pricing.totalPrice,352);assert.deepEqual(result.warnings,[]);
      const listResponse=await fetch(app.baseUrl+"/admin/orders?leadSource="+encodeURIComponent(item.channel),{headers:{cookie}});
      assert.equal(listResponse.status,200);const html=await listResponse.text();assert.match(html,new RegExp(`TEST Attribution ${index}`));
      const rows=nodes(parse(html),n=>n.tagName==="tr"&&!!attr(n,"data-admin-list-key"));
      assert.equal(rows.length,1); const id=attr(rows[0],"data-admin-list-key");
      const card=await (await fetch(app.baseUrl+`/admin/orders?order=${id}`,{headers:{cookie}})).text();
      assert.match(card,/data-lead-attribution="true"/); assert.ok(card.includes(item.channel));assert.match(card,new RegExp(`<dd[^>]*>${item.form}</dd>`));assert.doesNotMatch(card,/private=removed/);
      const sourcePanels=nodes(parse(card),n=>attr(n,"data-lead-attribution")==="true");
      assert.equal(sourcePanels.length,1);
      const sourcePanel=sourcePanels[0];
      const dialogPanel=sourcePanel.parentNode;
      assert.ok(attr(dialogPanel,"class").split(/\s+/).includes("admin-order-dialog-panel"));
      const panelChildren=dialogPanel.childNodes.filter(n=>n.tagName);
      assert.equal(panelChildren.at(-1),sourcePanel,"source follows the complete order layout on desktop and mobile");
      assert.ok(attr(panelChildren.at(-2),"class").split(/\s+/).includes("admin-order-dialog-layout"));
    }
    const calls=(await fs.readFile(mock.captureFile,"utf8")).trim().split("\n").map(line=>JSON.parse(line));
    const writes=calls.filter(call=>call.method==="PUT");assert.equal(writes.length,4);
    assert.ok(writes.every(call=>Object.keys(JSON.parse(call.body)).join(",")==="customFields"));
    assert.ok(!calls.some(call=>call.url.includes("/opportunities")));
  } finally {await stopServer(app.child);mock.cleanup();await fs.rm(root,{recursive:true,force:true});}
});
