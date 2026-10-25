"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { hasEntryOrderState } = require("../lib/admin-order-state");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { projectAdminDirectoryEntry } = require("../lib/quote-ops/admin-directory");
const { createFixture, createReadFetch } = require("./support/account-read-fixture.cjs");

const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
const normalizeString = (value, length = 500) => String(value ?? "").trim().slice(0, length);
const domain = createAdminDomainHelpers({ normalizeString });
const storeFor = client => createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 1000, normalizeString,
  createSupabaseQuoteOpsClient: () => client });
const visible = entries => filterQuoteOpsEntries(entries, {}, normalizeString);
function listShape(client) {
  const { entries, photos, addresses, addressesByKey, photosByPath, ...rest } = client;
  return { ...rest, entries: entries.map(entry => entry.id),
    addresses: addresses.map(({ entries: visits, ...address }) => ({ ...address, entries: visits.map(entry => entry.id) })) };
}

test("directory retains every client, alias, address, segment, search and revenue beyond 1000 rows", async () => {
  const fixture = createFixture(1107, 107);
  fixture.rows.forEach((row, index) => {
    row.customer_phone = String(2025550000 + index % 135);
    row.customer_email = `${index % 135}@example.test`;
    row.created_at = new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString();
  });
  fixture.rows[1].kind = "client_record";
  fixture.rows[2].kind = "admin_staff_member";
  fixture.rows[3].payload_for_retry.adminClient = { secondaryPhone: "2025559999", notes: "Retained client note",
    addressBook: [{ address: "Another house", rooms: "5", bathrooms: "3" }], removedAddressKeys: ["old house"] };
  fixture.rows[4].customer_phone = "2025559999";
  const before = JSON.stringify(fixture);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls, () => ({ cap: 123 })) });
  const fullCalls = [];
  const completeClient = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, fullCalls) });
  const full = (await completeClient.fetchAllEntries()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  calls.length = 0;
  const summaries = await client.fetchAdminDirectoryEntries({ includeClients: true });
  assert.equal(summaries.length, fixture.rows.length);
  assert(calls.length > 3, "Server-side response caps must not hide the tail");
  assert(calls.every(call => call.method === "GET" && !new URLSearchParams(call.query).get("select").includes("adminSms")));
  assert(calls.reduce((sum, call) => sum + call.bytes, 0) < fullCalls.reduce((sum, call) => sum + call.bytes, 0));
  const expected = domain.collectAdminClientRecords(visible(full));
  const actual = domain.collectAdminClientRecords(visible(summaries));
  assert.deepEqual(actual.map(listShape), expected.map(listShape));
  for (const filters of [{}, { q: "Another house" }, { q: "manual-1106" }, { phone: "9999" },
    { name: "Test Client 1106" }, { email: "3@example.test" }, { lifecycle: "one-time" }, { serviceSegment: "nonregular" }]) {
    assert.deepEqual(domain.filterAdminClientRecords(actual, filters).map(listShape),
      domain.filterAdminClientRecords(expected, filters).map(listShape));
  }
  assert.equal(JSON.stringify(fixture), before);
});

test("menu preserves the raw row prefix, legacy order detection and normalized tasks", async () => {
  const fixture = createFixture(20, 3);
  const states = [{}, null, { completion: { cleanerComment: "Legacy" } }, { policyAcceptance: {} },
    { customLegacyField: true }, { status: "new" }, { isCreated: false }];
  fixture.rows.forEach((row, index) => {
    row.payload_for_retry.orderState = states[index % states.length];
    row.payload_for_retry.adminOrder = { completion: { cleanerComment: "Fallback state" } };
    row.payload_for_retry.adminLead = { status: index % 3 ? (index % 2 ? "new" : "confirmed") : "", tasks: [
      { id: `task-${index}`, status: "open", dueAt: "2026-12-01T15:00:00.000Z", title: "Call", comment: "Keep" }] };
  });
  fixture.rows[0].kind = "admin_staff_member";
  fixture.rows[1].code = "RECURRING_ORDER_CREATED";
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture) });
  const full = await client.fetchEntries(10);
  const summaries = await client.fetchAdminDirectoryEntries({ limit: 10 });
  assert.deepEqual(summaries.map(entry => entry.id), full.map(entry => entry.id));
  const shape = entries => entries.map(entry => ({ id: entry.id, hasOrder: hasEntryOrderState(entry),
    leadStatus: domain.getLeadStatus(entry), tasks: domain.getEntryLeadTasks(entry) }));
  assert.deepEqual(shape(summaries), shape(full));
  const filters = { leadStatus: "new", excludeRemovedRecurringOrders: true, limit: 10 };
  assert.deepEqual(visible(summaries).map(entry => entry.id), visible(full).map(entry => entry.id));
  assert.deepEqual(filterQuoteOpsEntries(summaries, filters, normalizeString).map(entry => entry.id),
    filterQuoteOpsEntries(full, filters, normalizeString).map(entry => entry.id));
});

test("full client history loads independently in bounded batches without truncation or writes", async () => {
  const fixture = createFixture(1107, 107);
  const before = JSON.stringify(fixture);
  const calls = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: createReadFetch(fixture, calls) });
  const store = storeFor(client);
  const directory = await store.listAdminDirectoryEntries({ includeClients: true });
  assert(directory.every(entry => !entry.payloadForRetry.adminSms && !entry.payloadForRetry.orderState?.payroll));
  const full = await store.listClientDetailEntries(directory.map(entry => entry.id));
  assert.equal(full.length, fixture.rows.length);
  const saved = full.find(entry => entry.id === "order-00000");
  assert.equal(saved.totalPriceCents, fixture.rows[0].total_price_cents);
  assert.deepEqual(saved.payloadForRetry.orderState.payroll, fixture.rows[0].payload_for_retry.orderState.payroll);
  assert.deepEqual(saved.payloadForRetry.orderState.payrollOverrides, fixture.rows[0].payload_for_retry.orderState.payrollOverrides);
  assert.equal(saved.payloadForRetry.orderState.assignedStaff, "Cleaner A, Cleaner B");
  assert.deepEqual(saved.payloadForRetry.adminSms, fixture.rows[0].payload_for_retry.adminSms);
  assert.deepEqual(saved.payloadForRetry.adminClient.photos, fixture.rows[0].payload_for_retry.adminClient.photos);
  assert.deepEqual(await client.fetchEntryById(saved.id), saved, "Directory reads cannot overwrite the full-record cache");
  assert(calls.every(call => call.method === "GET"));
  assert.equal(JSON.stringify(fixture), before);
});

test("directory failures and incomplete detail reads fail closed, never show partial memory history", async () => {
  const store = storeFor({ isConfigured: () => true,
    fetchAdminDirectoryEntries: async () => { throw new Error("Offline"); },
    fetchEntriesByIds: async () => [] });
  await assert.rejects(store.listAdminDirectoryEntries({ includeClients: true }), /Offline/);
  await assert.rejects(store.listClientDetailEntries(["missing"]), /Incomplete/);
  const duplicate = storeFor({ isConfigured: () => true,
    fetchEntriesByIds: async () => [{ id: "same" }, { id: "same" }] });
  await assert.rejects(duplicate.listClientDetailEntries(["same"]), /Invalid/);
  const fixture = createFixture(2, 1);
  const client = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true,
    text: async () => "{}", headers: { get: () => null } }) });
  await assert.rejects(client.fetchAdminDirectoryEntries({ includeClients: true }), /Invalid/);
  const repeatedRow = { ...fixture.rows[0], directory_orderState: {}, directory_adminOrder: {},
    directory_adminLead: null, directory_calculatorData: {}, directory_adminClient: {} };
  const repeated = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true,
    text: async () => JSON.stringify([repeatedRow, repeatedRow]), headers: { get: () => null } }) });
  await assert.rejects(repeated.fetchAdminDirectoryEntries({ includeClients: true }), /cursor/);
  const malformedRow = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true,
    text: async () => JSON.stringify([fixture.rows[0]]), headers: { get: () => null } }) });
  await assert.rejects(malformedRow.fetchAdminDirectoryEntries({ includeClients: true }), /Invalid.*row/);
});

test("projection never edits the supplied complete record", () => {
  const entry = { id: "full", payloadForRetry: { adminSms: { history: ["Keep"] },
    orderState: { completion: { cleanerComment: "Keep" }, payroll: { items: [{ amountCents: 50000 }] } },
    adminClient: { photos: [{ path: "keep.jpg" }], notes: "Keep" } } };
  const before = structuredClone(entry);
  const summary = projectAdminDirectoryEntry(entry, true);
  assert(hasEntryOrderState(summary));
  assert(!summary.payloadForRetry.adminSms);
  assert(!summary.payloadForRetry.adminClient.photos);
  assert.deepEqual(entry, before);
});
