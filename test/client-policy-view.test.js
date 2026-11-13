"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { resolveClientPolicyView, samePolicyClient } = require("../lib/order-policy/client-policy-view");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createOrdersUiPolicyPanel } = require("../lib/admin/pages/orders-ui-policy-panel");
const { getCleanerConfirmationDisplay } = require("../lib/cleaner-confirmation");
const string = (value, max = 500) => String(value || "").trim().slice(0, max);
function entry(id, policy = null) {
  const state = { isCreated: true, status: "scheduled", selectedDate: "2099-11-14", selectedTime: "13:00", frequency: "monthly",
    assignedStaff: "Cleaner A", payrollOverrides: { a: "110.00" }, ...(policy ? { policyAcceptance: policy } : {}) };
  return { id, customerName: "Policy QA", customerPhone: "+1(630)555-0199", customerEmail: "qa@example.test", contactId: "qa-contact",
    selectedDate: "2099-11-14", selectedTime: "13:00", totalPrice: 191, fullAddress: "New QA address", serviceName: "Standard",
    payloadForRetry: { orderState: structuredClone(state), adminOrder: structuredClone(state),
      adminSms: { history: [{ text: "Private historical SMS" }] } } };
}
const signed = () => ({ acceptanceId: "original-acceptance", policyAccepted: true, status: "accepted", signedAt: "2026-07-18T17:56:02Z",
  certificateFile: { id: "original-pdf", fileName: "original.pdf", relativePath: "certs/original.pdf" }, typedSignature: "Original signature" });
const order = source => ({ entry: source, id: source.id, serviceType: "standard", orderStatus: "scheduled", policyAccepted: false, policyAcceptance: {} });
const panel = createOrdersUiPolicyPanel({ ADMIN_ORDERS_PATH: "/admin/orders", ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH: "/api/admin/policy-acceptance",
  normalizeString: string, escapeHtml: string, escapeHtmlAttribute: string, formatAdminDateTime: string,
  renderAdminBadge: label => `<b>${label}</b>`, renderOrderBriefFact: (label, value) => `<p>${label}: ${value}</p>` });

test("a recurring visit displays the original signature and certificate without copying or saving anything", async () => {
  const source = entry("old-visit", signed()), visit = entry("new-visit"), original = structuredClone([source, visit]);
  const calls = [];
  const view = await resolveClientPolicyView(order(visit), {
    listClientPolicyCandidates: async () => [{ id: source.id, customerEmail: source.customerEmail }],
    getEntry: async (id, options) => { calls.push([id, options]); return source; },
    updateOrderEntry: () => assert.fail("Display must never save an order"),
  });
  assert.equal(view.policyInherited, true); assert.equal(view.policySourceEntryId, source.id);
  assert.deepEqual(view.policyAcceptance, source.payloadForRetry.orderState.policyAcceptance);
  assert.deepEqual([source, visit], original); assert.deepEqual(calls, [[source.id, { allowMemoryFallback: false }]]);
  const html = panel.renderOrderPolicyAcceptancePanel(view);
  assert.match(html, /Политика подписана ранее/); assert.match(html, /old-visit\/certificate/);
  assert.doesNotMatch(html, /new-visit\/certificate|resend-order-policy|reset-order-policy/);
  const pending = getCleanerConfirmationDisplay(visit, { staffIds: ["a"], scheduleDate: visit.selectedDate, scheduleTime: visit.selectedTime }, { now: new Date("2099-11-01") });
  assert.equal(pending.key, "pending", "Policy lookup must not confirm a cleaner's future visit");
});

test("identity matches normalized contacts, never just the name or address", () => {
  const a = entry("a"); delete a.contactId; delete a.customerEmail;
  assert(samePolicyClient(a, { customerPhone: "6305550199" }));
  assert(samePolicyClient(a, { payloadForRetry: { adminClient: { alternate_phone: "1 630 555 0199" } } }));
  assert(!samePolicyClient(a, { customerName: a.customerName, fullAddress: a.fullAddress }));
  assert(!samePolicyClient(a, { customerPhone: "+1 630 555 0188" }));
  assert(!samePolicyClient({customerPhone:"0",customerEmail:"unknown"},{customerPhone:"0",customerEmail:"unknown"}));
});

test("fresh source identity, acceptance and revocation are checked, not trusted from summaries", async () => {
  const visit = entry("new");
  for (const source of [null, entry("wrong-id", signed()), entry("old"), entry("old", { ...signed(), revokedAt: "2026-08-01" }),
    { ...entry("old", signed()), customerPhone: "6305550188", customerEmail: "different@example.test", contactId: "other" }]) {
    const view = await resolveClientPolicyView(order(visit), { listClientPolicyCandidates: async () => [{ id: "old", customerEmail: visit.customerEmail }], getEntry: async () => source });
    assert.equal(view.policyAccepted, false);
    assert.equal(view.policyInherited, undefined);
  }
});

test("failed policy lookup is neutral and cannot invite a duplicate signature request", async () => {
  const view = await resolveClientPolicyView(order(entry("new")), { listClientPolicyCandidates: async () => { throw Error("offline"); } });
  assert.equal(view.policyLookupUnavailable, true);
  const html = panel.renderOrderPolicyAcceptancePanel(view);
  assert.match(html, /Статус политики не проверен/);
  assert.doesNotMatch(html, /Политика не подписана|resend-order-policy|reset-order-policy/);
});

test("an existing acceptance requires no lookup; page summaries reuse a strictly verified source", async () => {
  const source = entry("old", signed()), visit = entry("new");
  const own = { ...order(source), policyAccepted: true };
  assert.equal(await resolveClientPolicyView(own, {}), own);
  const view = await resolveClientPolicyView(order(visit), { getEntry: async () => source,
    listClientPolicyCandidates: async () => assert.fail("No extra directory read when page already contains proof candidate") }, { entries: [source] });
  assert.equal(view.policyInherited, true);
});

test("a legacy accepted policy without a PDF links to its source, not a nonexistent certificate", async () => {
  const record = signed(); delete record.certificateFile;
  const source = entry("old", record);
  const view = await resolveClientPolicyView(order(entry("new")), { getEntry: async () => source,
    listClientPolicyCandidates: async () => [{ id: "old", customerEmail: source.customerEmail }] });
  const html = panel.renderOrderPolicyAcceptancePanel(view);
  assert.match(html, /Политика подписана ранее/); assert.match(html, /\/admin\/orders\?order=old/);
  assert.doesNotMatch(html, /\/certificate/);
});

test("accepted-policy candidate read is narrow, GET-only, complete beyond 1000 rows, and fails on partial errors", async () => {
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async (url, options) => {
      const query = new URL(url).searchParams; calls.push({ query, method: options.method });
      assert(!query.get("select").includes("*")); assert(!query.get("select").includes("certificate"));
      assert.match(query.get("or"), /policyAccepted.eq.true/);
      const offset = Number(query.get("id")?.slice(3) || 0);
      const count = offset < 1000 ? 500 : offset < 1007 ? 7 : 0;
      return { ok: true, status: 200, headers: { get: () => `0-${count-1}/${1007-offset}` },
        text: async () => JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: String(offset + i + 1).padStart(5, "0"), customer_email: "qa@example.test" }))) };
    } });
  assert.equal((await client.fetchClientPolicyCandidates()).length, 1007);
  assert.equal(calls.length, 3); assert(calls.every(call => call.method === "GET"));
  const failure = createSupabaseQuoteOpsClient({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    fetch: async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ message: "denied" }) }) });
  await assert.rejects(failure.fetchClientPolicyCandidates());
});

test("API row caps do not hide older signatures and incomplete reads remain errors", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" };
  for (const knownTotal of [false, true]) {
    const client = createSupabaseQuoteOpsClient({ env, fetch: async url => {
      const offset = Number(new URL(url).searchParams.get("id")?.slice(3) || 0);
      const count = Math.min(37, 101-offset);
      return { ok: true, status: 200, headers: { get: () => knownTotal ? `0-${count-1}/${101-offset}` : null },
        text: async () => JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: String(offset+i+1).padStart(5,"0") }))) };
    } });
    assert.equal((await client.fetchClientPolicyCandidates()).length,101);
  }
  const partial = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok:true,status:200,
    headers:{get:()=>"*/7"},text:async()=>"[]" }) });
  await assert.rejects(partial.fetchClientPolicyCandidates(),/Incomplete/);
});

test("both direct cards and lazy dialog cards resolve the same original policy without writes or changed permissions", async () => {
  const { createOrdersPageRenderer } = require("../lib/admin/pages/orders-page");
  const { createAdminDomainHelpers } = require("../lib/admin/domain");
  const { createQuoteOpsStore } = require("../lib/quote-ops/store");
  const source = entry("old", signed()), visit = entry("new"), original = structuredClone([source,visit]);
  const domain = createAdminDomainHelpers({ normalizeString: string });
  const ledger = { getEntry: async id => id === source.id ? source : id === visit.id ? visit : null,
    listEntries: async () => [source,visit], listClientPolicyCandidates: async () => [source],
    updateOrderEntry: () => assert.fail("GET must not write") };
  const staff = { getSnapshot: async () => ({staff:[],assignments:[]}) };
  const runtime = { orderPageEntries:[source,visit] };
  const requestUrl = req => new URL(req.url,"https://example.test");
  for (const canEdit of [true,false]) {
    const seen=[];
    const renderer=createOrdersPageRenderer({ ...domain, normalizeString:string, ADMIN_ORDERS_PATH:"/admin/orders",
      getRequestUrl:requestUrl,
      getOrdersFilters:req=>({reqUrl:requestUrl(req),filters:{q:"",status:"all",serviceType:"all",frequency:"all",assignment:"all",leadSource:"all"}}),
      collectNonAssignableStaffIds:()=>new Set(),filterStaffSnapshotByHiddenStaffIds:s=>s,decorateOrderForPlanning:order=>order,
      getProjectedOrderRecords:async(_runtime,entries)=>domain.collectAdminOrderRecords(entries),
      getWorkspaceAccessContext:()=>({canEdit,canDelete:false}),
      buildAdminRedirectPath:(value,changes)=>{const url=new URL(value,"https://example.test");for(const[key,v]of Object.entries(changes))v?url.searchParams.set(key,v):url.searchParams.delete(key);return url.pathname+url.search;},
      escapeHtml:string,escapeHtmlText:string,escapeHtmlAttribute:string,
      renderAdminBadge:label=>label,renderAdminCard:(_title,_copy,body)=>body,renderAdminLayout:(_title,body)=>body,
      renderAdminAppSidebar:()=>"",renderAdminHiddenInput:()=>"",renderOrderTableRow:order=>`<tr>${order.id}</tr>`,
      renderOrderPaymentStatusBadge:()=>"",renderOrderStatusBadge:()=>"",renderQuoteOpsStatusBadge:()=>"",
      getOrderAssignedLabel:()=>"Cleaner A",getOrderDialogId:id=>"dialog-"+id,
      renderOrderManagementDialog:(view,_returnTo,options)=>{seen.push({source:view.policySourceEntryId,canEdit:options.canEdit});return panel.renderOrderPolicyAcceptancePanel(view,options);},
    });
    for (const body of [await renderer.renderDialogFragment({url:"/admin/orders?fragment=order-dialog&order=new"},{},ledger,staff,runtime),
      await renderer({url:"/admin/orders?order=new"},{},ledger,staff,runtime)]) {
      assert.match(body,/Политика подписана ранее/);assert.match(body,/old\/certificate/);
    }
    assert.deepEqual(seen,[{source:"old",canEdit},{source:"old",canEdit}]);
  }
  assert.deepEqual([source,visit],original);
  const memory=createQuoteOpsStore({normalizeString:string,QUOTE_OPS_LEDGER_LIMIT:2000,env:{}});
  await memory.recordSubmission({...source,ok:true});await memory.recordSubmission({...visit,ok:true});
  const candidates=await memory.listClientPolicyCandidates();
  assert.equal(candidates.length,1);
});
