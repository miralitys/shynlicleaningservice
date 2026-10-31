"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseAdminStaffClient, mapQuoteOpsRowToAssignmentRecord } = require("../lib/supabase-admin-staff");
const { createAdminStaffStore } = require("../lib/admin-staff-store");
const env = { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" };
const response = (body, status = 200, total) => ({ ok: status === 200, status,
  headers: { get: () => total === undefined ? null : `0-0/${total}` }, text: async () => JSON.stringify(body) });

function fixture({ dedicated = false, cap = 500, rpc = null } = {}) {
  const calls = [], rows = Array.from({ length: 1103 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    request_id: `order-${index % 103}`, warnings: ["cleaner"], code: "confirmed",
    payload_for_retry: { assignment: { entryId: `order-${index % 103}`, staffIds: ["cleaner"], status: "confirmed" } },
  }));
  const fetch = async (url, options) => {
    const u = new URL(url); calls.push({ u, options });
    if (u.pathname.endsWith("/rpc/read_recurring_assignment_context")) {
      if (rpc) return rpc(u, options);
      const ids = JSON.parse(`[${u.searchParams.get("p_entry_ids").slice(1, -1)}]`);
      const after = u.searchParams.get("p_after");
      const matching = rows.filter(row => (!after || row.id > after) && ids.includes(mapQuoteOpsRowToAssignmentRecord(row).entryId));
      return response({ version: 1, after, total: matching.length, rows: matching.slice(0, cap) });
    }
    if (u.pathname.includes("/admin_staff")) {
      if (!dedicated) return response({ code: "PGRST205", message: "Could not find the table" }, 404);
      if (u.pathname.endsWith("/admin_staff")) return response([]);
      const scope = u.searchParams.get("and");
      if (!scope) return response([]);
      const cursor = u.searchParams.get("entry_id")?.slice(3);
      const ids = JSON.parse(`[${scope.slice("(entry_id.in.(".length, -2)}]`);
      const matching = ids.filter(id => !cursor || id > cursor).sort().map(id => ({ entry_id: id, staff_ids: ["cleaner"], status: "confirmed" }));
      return response(matching.slice(0, cap), 200, matching.length);
    }
    return response(u.searchParams.get("kind") === "eq.admin_staff_assignment" ? rows : []);
  };
  const client = createSupabaseAdminStaffClient({ env, fetch });
  return { client, calls, rows };
}

test("recurring assignments read every scoped page/batch, retain duplicate rows and never cache employee data", async () => {
  const f = fixture({ cap: 37 });
  const ids = Array.from({ length: 103 }, (_, i) => `order-${i}`);
  await f.client.fetchSnapshot(); f.calls.length = 0;
  const before = structuredClone(f.rows);
  const result = await f.client.fetchRecurringAssignmentContext(ids);
  assert.equal(result.complete, true);
  assert.equal(result.assignments.length, 1103);
  assert.deepEqual(result.assignments, ids.flatMap((_, i) => i % 75 ? [] : f.rows
    .filter(row => ids.slice(i, i + 75).includes(mapQuoteOpsRowToAssignmentRecord(row).entryId))
    .map(row => { const { entryId, staffIds, status } = mapQuoteOpsRowToAssignmentRecord(row); return { entryId, staffIds, status }; })));
  assert.ok(f.calls.every(call => call.u.pathname.endsWith("/rpc/read_recurring_assignment_context") && call.options.method === "GET"));
  f.rows[0].payload_for_retry.assignment.staffIds = ["changed"];
  assert.deepEqual((await f.client.fetchRecurringAssignmentContext(["order-0"])).assignments[0].staffIds, ["changed"]);
  f.rows[0] = before[0];
  assert.deepEqual(f.rows, before);
});

test("only an absent recurring RPC uses the old full path and schema absence is remembered", async () => {
  const f = fixture({ rpc: () => response({ code: "PGRST202", message: "Could not find read_recurring_assignment_context" }, 404) });
  for (let pass = 0; pass < 2; pass++) assert.equal(await f.client.fetchRecurringAssignmentContext(["order-0"]), null);
  assert.equal(f.calls.filter(c => c.u.pathname.includes("/rpc/")).length, 1);
});

test("denied, failed, malformed, partial and non-advancing recurring reads fail closed", async () => {
  for (const rpc of [
    () => response({ code: "42501", message: "denied" }, 403),
    () => response({ message: "unavailable" }, 503),
    () => response([]),
    () => response({ version: 1, after: null, total: 1, rows: [] }),
    () => response({ version: 1, after: null, total: 1, rows: [{ id: "invalid" }] }),
    u => response({ version: 1, after: u.searchParams.get("p_after"), total: 2,
      rows: [{ id: "00000000-0000-4000-8000-000000000001", request_id: "order-0" }] }),
  ]) {
    const f = fixture({ rpc });
    await assert.rejects(f.client.fetchRecurringAssignmentContext(["order-0"]));
    assert.ok(f.calls.every(call => call.options.method === "GET"));
  }
});

test("dedicated schema uses only scoped assignment columns and no full staff reads after discovery", async () => {
  const f = fixture({ dedicated: true });
  await f.client.fetchSnapshot(); f.calls.length = 0;
  const result = await f.client.fetchRecurringAssignmentContext(["order-0", "order-1"]);
  assert.equal(result.assignments.length, 2);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].u.searchParams.get("select"), "entry_id,staff_ids,status,created_at,updated_at");
  assert.equal(f.calls[0].u.searchParams.get("and"), '(entry_id.in.("order-0","order-1"))');
});

test("dedicated assignment cursors keep their original scope on every page", async () => {
  const f = fixture({ dedicated: true, cap: 1 });
  await f.client.fetchSnapshot(); f.calls.length = 0;
  const result = await f.client.fetchRecurringAssignmentContext(["order-0", "order-1", "order-2"]);
  assert.deepEqual(result.assignments.map(a => a.entryId), ["order-0", "order-1", "order-2"]);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(call => call.u.searchParams.get("and") === '(entry_id.in.("order-0","order-1","order-2"))'));
});

test("summaries cannot replace the full store cache and strict repair reads never use stale assignments", async () => {
  let failed = false;
  const snapshot = { staff: [{ id: "cleaner", name: "QA", compensationValue: "500", compensationType: "fixed" }],
    assignments: [{ entryId: "order-0", staffIds: ["cleaner"], status: "confirmed", notes: "preserve", calendarSync: {} }] };
  const client = { isConfigured: () => true,
    fetchSnapshot: async () => { if (failed) throw new Error("DB unavailable"); return structuredClone(snapshot); },
    fetchRecurringAssignmentContext: async () => ({ version: 1, complete: true, entryIds: ["order-0"], assignments: [] }),
  };
  const store = createAdminStaffStore({ createSupabaseAdminStaffClient: () => client });
  const before = await store.getSnapshot();
  await store.getRecurringAssignmentContext(["order-0"]);
  failed = true;
  assert.deepEqual(await store.getSnapshot(), before);
  await assert.rejects(store.getSnapshot({ allowMemoryFallback: false }), /DB unavailable/);
  assert.deepEqual(snapshot.assignments[0].staffIds, ["cleaner"]);
});
