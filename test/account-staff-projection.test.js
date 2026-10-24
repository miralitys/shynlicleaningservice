"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseAdminStaffClient, mapQuoteOpsRowToStaffRecord, mapQuoteOpsRowToAssignmentRecord,
  mapAssignmentRecordToQuoteOpsRow, QUOTE_OPS_ASSIGNMENT_KIND, QUOTE_OPS_STAFF_KIND } = require("../lib/supabase-admin-staff");
const { createSectionFixture } = require("./support/account-section-fixture.cjs");
const { createReadFetch } = require("./support/account-read-fixture.cjs");
const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

function harness(fixture, state = {}) {
  const calls = [];
  const read = createReadFetch(fixture, calls, () => ({ cap: 23, ...state }));
  const client = createSupabaseAdminStaffClient({ env, fetch: async (url, options) => {
    if (new URL(url).pathname.endsWith("/admin_staff_assignments")) return {
      ok: false, status: 404, text: async () => JSON.stringify({ code: "PGRST205", message: "Missing staff table" }),
    };
    return read(url, options);
  } });
  return { client, calls };
}
const withoutSms = person => ({ ...person, smsHistory: [] });

test("lean staff/assignment reads preserve every history ID, complete teams, pay rates, profile, availability and travel fields", async () => {
  const fixture = createSectionFixture(1107, 107);
  for (const row of fixture.rows.filter(row => row.kind === QUOTE_OPS_STAFF_KIND)) {
    Object.assign(row.payload_for_retry.staff, {
      smsHistory: [{ id: "large-message", message: "x".repeat(100000), sentAt: "2026-10-01T12:00:00.000Z" }],
      availabilityBlocks: [{ id: "busy", date: "2099-01-01", startTime: "09:00", endTime: "13:00", source: "manual",
        createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z" }],
      contract: { generatedAt: "2026-10-01", document: { relativePath: "contract.pdf", fileName: "contract.pdf" } },
      w9: { generatedAt: "2026-10-01", document: { relativePath: "w9.pdf", fileName: "w9.pdf" } },
    });
  }
  for (let i = 0; i < 300; i++) fixture.rows.push(mapAssignmentRecordToQuoteOpsRow({ entryId: `foreign-${i}`, staffIds: ["b"], notes: "not for a" }));
  const before = JSON.stringify(fixture);
  const expectedStaff = fixture.rows.filter(row => row.kind === QUOTE_OPS_STAFF_KIND).sort((a, b) => a.id.localeCompare(b.id)).map(mapQuoteOpsRowToStaffRecord);
  const expected = fixture.rows.filter(row => row.kind === QUOTE_OPS_ASSIGNMENT_KIND).sort((a, b) => a.id.localeCompare(b.id))
    .map(mapQuoteOpsRowToAssignmentRecord).filter(row => row.staffIds.includes("a"));
  const h = harness(fixture);
  const actual = await h.client.fetchAccountSnapshot("a");
  assert.deepEqual(actual.assignments, expected);
  assert.equal(actual.assignments.length, 1107);
  assert.ok(actual.assignments.some(row => row.entryId === "order-01106"));
  assert.ok(actual.assignments.every(row => row.staffIds.join(",") === "a,b"));
  assert.deepEqual(actual.staff, expectedStaff.map(withoutSms));
  assert.equal(actual.staff[0].contract.document.relativePath, "contract.pdf");
  assert.equal(actual.staff[0].w9.document.relativePath, "w9.pdf");
  const quotes = h.calls.filter(row => row.table === "quote_ops_entries");
  assert.ok(quotes.every(row => new URLSearchParams(row.query).get("select") !== "*"));
  const staffReads = quotes.filter(row => new URLSearchParams(row.query).get("kind") === `eq.${QUOTE_OPS_STAFF_KIND}`);
  assert.ok(staffReads.reduce((bytes, row) => bytes + row.bytes, 0) < 10000, "unused staff SMS is not transferred");
  const assignmentReads = quotes.filter(row => new URLSearchParams(row.query).get("kind") === `eq.${QUOTE_OPS_ASSIGNMENT_KIND}`);
  assert.equal(assignmentReads.reduce((count, row) => count + row.rows, 0), 1107, "other staff assignments are filtered before transfer");
  assert.ok(assignmentReads.every(row => new URLSearchParams(row.query).has("or")));
  const full = await h.client.fetchSnapshot();
  assert.deepEqual(full.staff, expectedStaff);
  assert.equal(full.staff[0].smsHistory.length, 1);
  const fullRows = fixture.rows.filter(row => row.kind === QUOTE_OPS_ASSIGNMENT_KIND)
    .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at))).slice(0, 23).map(mapQuoteOpsRowToAssignmentRecord);
  assert.deepEqual(full.assignments, fullRows, "the existing admin read retains its backend page semantics, not the cleaner subset");
  assert.ok(h.calls.some(row => new URLSearchParams(row.query).get("select") === "*" &&
    new URLSearchParams(row.query).get("kind") === `eq.${QUOTE_OPS_ASSIGNMENT_KIND}`));
  assert.equal(JSON.stringify(fixture), before);
  assert.ok(h.calls.every(row => row.method === "GET"));
});

test("legacy staff-ID precedence and normalization cannot hide orders or expose another cleaner's assignment", async () => {
  const fixture = createSectionFixture(10, 2);
  const values = [[" a ", "b"], " a ", null, false, 0, "", [], ["b"], ["other-a"], undefined];
  for (const [index, value] of values.entries()) {
    const row = mapAssignmentRecordToQuoteOpsRow({ entryId: `legacy-${index}`, staffIds: ["a"] });
    if (value === undefined) delete row.payload_for_retry.assignment.staffIds;
    else row.payload_for_retry.assignment.staffIds = value;
    row.warnings = index === 2 ? " a " : ["a"];
    fixture.rows.push(row);
  }
  const expected = fixture.rows.filter(row => row.kind === QUOTE_OPS_ASSIGNMENT_KIND).sort((a, b) => a.id.localeCompare(b.id))
    .map(mapQuoteOpsRowToAssignmentRecord).filter(row => row.staffIds.includes("a"));
  const h = harness(fixture);
  assert.deepEqual((await h.client.fetchAccountSnapshot("a")).assignments, expected);
  const tail = fixture.rows.find(row => row.kind === QUOTE_OPS_ASSIGNMENT_KIND && row.request_id === "order-00009");
  tail.payload_for_retry.assignment.staffIds = ["b"];
  assert.ok(!(await h.client.fetchAccountSnapshot("a")).assignments.some(row => row.entryId === "order-00009"));
  tail.payload_for_retry.assignment.staffIds = ["staff_a"];
  assert.ok((await h.client.fetchAccountSnapshot("staff_a")).assignments.some(row => row.entryId === "order-00009"));
  assert.ok(h.calls.filter(row => new URLSearchParams(row.query).get("kind") === `eq.${QUOTE_OPS_ASSIGNMENT_KIND}`).some(row => !new URLSearchParams(row.query).has("or")),
    "unusual IDs use the complete compatible read, never an unsafe interpolated filter");
});

test("lean reads paginate without count metadata and never replace a failed read with stale or partial assignments", async () => {
  const fixture = createSectionFixture(1107, 107);
  const state = { noCount: true };
  const h = harness(fixture, state);
  assert.equal((await h.client.fetchAccountSnapshot("a")).assignments.length, 1107);
  state.failOrders = true;
  await assert.rejects(h.client.fetchAccountSnapshot("a"));
});
