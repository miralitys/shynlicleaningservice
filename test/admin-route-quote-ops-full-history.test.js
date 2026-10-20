"use strict";

const { test, assert, fs, createFetchStub, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");

test("quote list, stage filter, search, funnel, counts and tasks cover old leads past 1000 ledger rows without writes", async () => {
  const hidden = Array.from({ length: 1000 }, (_, i) => ({ id: `hidden-${i}`, kind: "admin_staff_member", status: "success",
    created_at: "2026-10-20T12:00:00Z", updated_at: "2026-10-20T12:00:00Z", customer_name: "Internal Staff Record" }));
  const leads = ["no-response", "discussion", "new", "declined"].map((status, i) => ({
    id: `old-lead-${i}`, kind: "quote_submission", status: "success", request_id: `archived-request-${i}`,
    created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-02T12:00:00Z", customer_name: `Archived Client ${i}`,
    customer_phone: `630555010${i}`, customer_email: `archived${i}@example.com`, service_type: "deep", service_name: "Deep",
    selected_date: "2099-11-01", selected_time: "09:00", full_address: "1 Test St, Chicago, IL", total_price: 250,
    payload_for_retry: { calculatorData: {}, adminLead: { status, managerName: "Test Manager", tasks: i < 2 ? [{
      id: `old-task-${i}`, kind: "discussion-followup", title: "Связаться с клиентом в назначенное время",
      status: "open", dueAt: "2099-10-20T15:00:00Z", stage: status,
    }] : [] } },
  }));
  leads.push(
    { ...leads[2], id: "removed-recurring-visit", request_id: "recurring-series-next-20991101",
      customer_name: "Removed Recurring Shell", code: "RECURRING_ORDER_CREATED",
      payload_for_retry: { calculatorData: {} } },
    { ...leads[2], id: "removed-recurring-visit-new", request_id: "legacy-series-next-20991101",
      customer_name: "Legacy Recurring Shell New", code: "RECURRING_ORDER_CREATED",
      payload_for_retry: { calculatorData: {}, adminLead: { status: "new" } } },
    { ...leads[2], id: "real-recurring-visit", request_id: "recurring-series-next-20991101",
      customer_name: "Real Recurring Visit", code: "RECURRING_ORDER_CREATED",
      payload_for_retry: { calculatorData: {}, orderState: { status: "scheduled" } } },
  );
  const stub = createFetchStub([
    { method: "GET", match: "order=id.asc&limit=500&offset=0", body: hidden.slice(0, 500) },
    { method: "GET", match: "order=id.asc&limit=500&offset=500", body: hidden.slice(500) },
    { method: "GET", match: "order=id.asc&limit=500&offset=1000", body: leads },
    { method: "GET", match: "/rest/v1/quote_ops_entries", body: hidden.slice(0, 180) },
    { method: "GET", match: "/rest/v1/", body: [] },
  ]);
  const env = { ADMIN_MASTER_SECRET: "full_quote_history_test", SUPABASE_URL: "https://quote-workspace-test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake_quote_workspace_test", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  let started;
  try {
    started = await startServer({ env });
    const cookie = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const get = async query => {
      const response = await fetch(`${started.baseUrl}/admin/quote-ops${query}`, { headers: { cookie } });
      assert.equal(response.status, 200);
      return response.text();
    };
    const all = await get("");
    for (const lead of leads.filter(lead => !lead.id.startsWith("removed-recurring-visit"))) assert.match(all, new RegExp(lead.customer_name));
    assert.doesNotMatch(all, /Removed Recurring Shell|Legacy Recurring Shell New/);
    assert.match(all, /Показано 5 из 5 заявок/);
    assert.match(all, /data-admin-nav-new-quote-count="1"/);
    assert.doesNotMatch(all, /Internal Staff Record/);
    const stage = await get("?leadStatus=no-response");
    assert.match(stage, /Archived Client 0/);
    assert.doesNotMatch(stage, /Archived Client [123]/);
    assert.match(stage, /Показано 1 из 5 заявок/);
    const search = await get("?q=archived-request-1");
    assert.match(search, /Archived Client 1/);
    assert.doesNotMatch(search, /Archived Client [023]/);
    const funnel = await get("?section=funnel&leadStatus=discussion");
    assert.match(funnel, /Archived Client 1/);
    assert.doesNotMatch(funnel, /Archived Client [023]/);
    const newLeads = await get("?section=funnel&leadStatus=new");
    assert.match(newLeads, /Archived Client 2/);
    assert.doesNotMatch(newLeads, /Removed Recurring Shell|Legacy Recurring Shell New|Real Recurring Visit/);
    assert.match(newLeads, /data-admin-nav-new-quote-count="1"/);
    const tasks = await get("?section=tasks");
    assert.match(tasks, /old-task-0/);
    assert.match(tasks, /old-task-1/);

    const calls = (await fs.readFile(stub.captureFile, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    const fullReads = calls.filter(call => /order=id.asc/.test(call.url) && /quote_ops_entries/.test(call.url));
    assert.equal(fullReads.length, 18, "one three-page complete read per workspace request");
    assert.equal(calls.filter(call => call.method !== "GET" && /quote_ops_entries/.test(call.url)).length, 0);
  } finally {
    if (started) await stopServer(started.child);
    stub.cleanup();
  }
});
