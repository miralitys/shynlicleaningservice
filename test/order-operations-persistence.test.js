"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { persistLimitedOrderOperations } = require("../lib/admin/order-operations-store");

test("limited team persistence keeps schedule overrides and sends one versioned transaction, without a later payroll write", async () => {
  const entry = { id: "order", updatedAt: "2026-11-24T00:00:00.000Z", totalPrice: 374, selectedDate: "2099-12-21", selectedTime: "09:00",
    payloadForRetry: { orderState: { isCreated: true, status: "scheduled", assignedStaff: "A", serviceDurationMinutes: 285,
      payroll: { items: [{ staffId: "a", status: "paid", amountCents: 15000, paidAt: "2026-11-23" }] } } } };
  const assignment = { entryId: "order", staffIds: ["a"], scheduleDate: "2099-12-22", scheduleTime: "11:00", status: "confirmed", notes: "keep",
    updatedAt: "2026-11-23T00:00:00.000Z" };
  let call;
  const result = await persistLimitedOrderOperations({ entry, updates: { assignedStaff: "B" }, staffIds: ["b"],
    staffStore: { getSnapshot: async () => ({ staff: [{ id: "a", name: "A" }, { id: "b", name: "B" }], assignments: [assignment] }) },
    ledger: { getEntry: async () => ({ ...entry, updatedAt: "2026-11-24T01:00:00.000Z" }) },
    env: { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, actor: { id: "eva" },
    fetch: async (url, options) => { call = { url: String(url), body: JSON.parse(options.body) }; return { ok: true, json: async () => ({}) }; } });
  assert.match(call.url, /rpc\/update_order_operations$/);
  assert.equal(call.body.p_expected_updated_at, entry.updatedAt);
  assert.equal(call.body.p_expected_assignment_updated_at, assignment.updatedAt);
  assert.equal(call.body.p_assignment.scheduleDate, assignment.scheduleDate);
  assert.equal(call.body.p_assignment.scheduleTime, assignment.scheduleTime);
  assert.equal(call.body.p_assignment.notes, "keep");
  assert.equal(call.body.p_order_state.serviceDurationMinutes, 285);
  assert.equal(call.body.p_order_state.payroll.items.find(item => item.staffId === "a").amountCents, 15000);
  assert.equal(call.body.p_order_state.payroll.items.find(item => item.staffId === "a").status, "paid");
  assert(result.entry); assert.equal(result.assignmentChanged, true);
});

test("a status-only operation leaves payroll byte-for-byte unchanged", async () => {
  const payroll = { items: [{ staffId: "a", status: "paid", amountCents: 12345 }], updatedAt: "keep" };
  const entry = { id: "order", updatedAt: "2026-11-24T00:00:00Z", payloadForRetry: { orderState: { isCreated: true, status: "scheduled", payroll } } };
  let body;
  await persistLimitedOrderOperations({ entry, updates: { status: "cleaning-complete" }, staffStore: { getSnapshot: async () => ({ staff: [], assignments: [] }) },
    ledger: { getEntry: async () => entry }, env: { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, actor: { id: "eva" },
    fetch: async (_, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; } });
  assert.deepEqual(body.p_order_state.payroll, payroll);
  assert.equal(body.p_assignment, null);
});

test("rescheduling to Scheduled confirms the same assignment without clearing its date override", async () => {
  const entry = { id: "order", updatedAt: "2026-11-24T00:00:00Z", payloadForRetry: { orderState: { isCreated: true, status: "en-route" } } };
  let body;
  await persistLimitedOrderOperations({ entry, updates: { orderStatus: "scheduled" },
    staffStore: { getSnapshot: async () => ({ staff: [], assignments: [{ entryId: "order", staffIds: ["a"], status: "planned", scheduleDate: "2099-12-22", scheduleTime: "11:00", updatedAt: "keep" }] }) },
    ledger: { getEntry: async () => entry }, env: { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, actor: { id: "eva" },
    fetch: async (_, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; } });
  assert.equal(body.p_assignment.status, "confirmed"); assert.equal(body.p_assignment.scheduleDate, "2099-12-22"); assert.equal(body.p_assignment.scheduleTime, "11:00");
});

test("calendar synchronization reads the committed team rather than a pre-save request snapshot", async () => {
  const { runAdminReadContext, memoAdminRead } = require("../lib/admin/read-context");
  const entry = {id:"order",updatedAt:"2026-11-24T00:00:00Z",totalPrice:374,payloadForRetry:{orderState:{isCreated:true,status:"scheduled",assignedStaff:"A"}}};
  const owner = {};
  let stored = {staff:[{id:"a",name:"A"},{id:"b",name:"B"}],assignments:[{entryId:"order",staffIds:["a"],updatedAt:entry.updatedAt}]};
  const staffStore = {getSnapshot:()=>memoAdminRead(owner,"staff","snapshot",()=>structuredClone(stored))};
  await runAdminReadContext({res:{},route:"/admin/orders"},async()=>{
    await staffStore.getSnapshot();
    await persistLimitedOrderOperations({entry,updates:{assignedStaff:"B"},staffIds:["b"],staffStore,ledger:{getEntry:async()=>entry},
      env:{SUPABASE_URL:"https://example.test",SUPABASE_SERVICE_ROLE_KEY:"test-key"},actor:{id:"eva"},
      fetch:async()=>{stored={...stored,assignments:[{entryId:"order",staffIds:["b"],updatedAt:"2026-11-24T01:00:00Z"}]};return{ok:true,json:async()=>({})};}});
    assert.deepEqual((await staffStore.getSnapshot()).assignments[0].staffIds,["b"]);
  });
});
