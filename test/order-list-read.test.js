"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { projectOrderListEntry, ORDER_LIST_SELECT } = require("../lib/quote-ops/order-list");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { hasEntryOrderState } = require("../lib/admin-order-state");

const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const env = { SUPABASE_URL: "https://orders-read-test.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };

function order(id, payload = {}) {
  return { id, kind: "quote_submission", status: "success", requestId: id, customerName: id, totalPrice: 534,
    createdAt: "2026-10-01T12:00:00Z", selectedDate: "2026-12-01", selectedTime: "10:00", serviceType: "standard",
    payloadForRetry: payload };
}

test("list projection preserves legacy/canonical orders, amounts, teams, frequency, payments, policy stage and client lookup data", () => {
  const state = { isCreated: true, status: "scheduled", assignedStaff: "Cleaner A, Cleaner B", frequency: "weekly",
    paymentStatus: "paid", paymentMethod: "invoice", serviceDurationMinutes: 210, recurringSeriesId: "series",
    cleanerConfirmation: { byStaffId: { a: { status: "confirmed" } } },
    policyAcceptance: { policyAccepted: false, sentAt: "2026-10-01T12:00:00Z", signatureDataUrl: "SECRET_SIGNATURE" },
    completion: { checklistItems: [{ label: "DETAIL_CHECKLIST" }], beforePhotos: [{ path: "DETAIL_PHOTO" }] } };
  const rows = [order("canonical", { orderState: state, adminOrder: { ...state, assignedStaff: "Legacy Different" } }),
    order("legacy", { adminOrder: state, payment: { status: "paid", method: "cash" } }),
    order("empty-canonical", { orderState: {}, adminOrder: state }),
    order("null-canonical", { orderState: null, adminOrder: state }),
    order("completion-only", { adminOrder: { completion: { beforePhotos: [{}] } } }),
    order("unknown-only", { orderState: { migrated: true } }),
    order("deleted-shell", {}),
    order("client", { calculatorData: { bedrooms: 4, bathrooms: 2.5, squareFootage: "2500", notes: "Keep client instructions" },
      adminClient: { addressBook: [{ address: "Second Test Address", roomCount: "2" }], automaticNotificationsEnabled: false },
      adminLead: { status: "discussion", tasks: [{ id: "task", dueAt: "2099-01-01", status: "open" }] },
      orderState: { status: "new" }, paymentState: { status: "paid", method: "zelle" } }),
  ];
  for (const row of rows) {
    row.payloadForRetry.adminSms = { history: [{ message: "DETAIL_SMS" }] };
    row.payloadForRetry.rawCrmRequest = "DETAIL_CRM";
    row.retryHistory = ["DETAIL_RETRY"];
  }
  const before = structuredClone(rows);
  const summaries = rows.map(projectOrderListEntry);
  const fields = records => records.map(({ entry, policyAcceptance, ...record }) => record);
  assert.deepEqual(fields(domain.collectAdminOrderRecords(summaries)), fields(domain.collectAdminOrderRecords(rows)));
  assert.deepEqual(summaries.map(hasEntryOrderState), rows.map(hasEntryOrderState));
  assert.deepEqual(summaries.at(-1).payloadForRetry.calculatorData, rows.at(-1).payloadForRetry.calculatorData);
  assert.deepEqual(summaries.at(-1).payloadForRetry.adminClient, rows.at(-1).payloadForRetry.adminClient);
  assert.deepEqual(summaries.at(-1).payloadForRetry.adminLead, rows.at(-1).payloadForRetry.adminLead);
  assert.deepEqual(rows, before);
  assert.doesNotMatch(JSON.stringify(summaries), /SECRET_SIGNATURE|DETAIL_SMS|DETAIL_CRM|DETAIL_RETRY|DETAIL_CHECKLIST|DETAIL_PHOTO/);
});

function projectRow(row, select) {
  return Object.fromEntries(select.split(",").map(field => {
    const [name, expression] = field.includes(":") ? field.split(":") : [field, field];
    return [name, expression.split("->").reduce((value, key) => value?.[key], row) ?? null];
  }));
}

test("lightweight read paginates past 1000 records and a detail read still returns the full original record", async () => {
  const rows = Array.from({ length: 1257 }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}`, kind: "quote_submission",
    created_at: "2026-10-01T12:00:00Z", total_price: 250 + i, customer_name: `Client ${i}`,
    payload_for_retry: { orderState: { isCreated: true, status: "scheduled", assignedStaff: `Cleaner ${i % 3}` },
      adminSms: { history: [{ message: "Full detail SMS" }] } } }));
  const before = structuredClone(rows);
  const queries = [];
  const client = createSupabaseQuoteOpsClient({ env, fetch: async (url, options) => {
    assert.equal(options.method, "GET");
    const query = new URL(url).searchParams;
    queries.push(query);
    const id = query.get("id");
    const body = id?.startsWith("eq.") ? rows.filter(row => row.id === id.slice(3))
      : rows.filter(row => !id || row.id > id.slice(3)).slice(0, Number(query.get("limit"))).map(row => projectRow(row, query.get("select")));
    return { ok: true, headers: { get: () => `0-${body.length - 1}/${body.length < 500 ? body.length : rows.filter(row => !id || row.id > id.slice(3)).length}` }, text: async () => JSON.stringify(body) };
  } });
  const entries = await client.fetchOrderListEntries();
  assert.equal(entries.length, rows.length);
  assert.equal(new Set(entries.map(entry => entry.id)).size, rows.length);
  for (const entry of entries) {
    const source = rows.find(row => row.id === entry.id);
    assert.equal(entry.totalPrice, source.total_price);
    assert.equal(entry.payloadForRetry.orderState.assignedStaff, source.payload_for_retry.orderState.assignedStaff);
    assert.equal(entry.payloadForRetry.adminSms, undefined);
  }
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => query.get("select") === ORDER_LIST_SELECT && query.get("order") === "id.asc"));
  const detail = await client.fetchEntryById(rows[0].id);
  assert.equal(detail.payloadForRetry.adminSms.history[0].message, "Full detail SMS");
  assert.deepEqual(rows, before);
});

test("incomplete remote reads fail visibly instead of returning a partial or cached empty list", async () => {
  let calls = 0;
  const client = createSupabaseQuoteOpsClient({ env, fetch: async () => {
    if (++calls === 2) throw new Error("Second page failed");
    return { ok: true, headers: { get: () => "0-499/501" }, text: async () => JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}` }))) };
  } });
  const store = createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 250, normalizeString,
    createSupabaseQuoteOpsClient: () => client });
  await assert.rejects(store.listOrderListEntries(), /Second page failed/);
});

test("a database response cap below the requested page size cannot hide later orders", async () => {
  const rows = Array.from({ length: 307 }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}` }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: async url => {
    const cursor = new URL(url).searchParams.get("id")?.slice(3);
    const remaining = rows.filter(row => !cursor || row.id > cursor);
    const page = remaining.slice(0, 100);
    return { ok: true, headers: { get: () => `0-${page.length - 1}/${remaining.length}` }, text: async () => JSON.stringify(page) };
  } });
  assert.equal((await client.fetchOrderListEntries()).length, rows.length);
});

test("an insert between pages cannot push an existing order out of an exact-multiple list", async () => {
  const original = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}` }));
  const rows = [...original];
  let reads = 0;
  const client = createSupabaseQuoteOpsClient({ env, fetch: async url => {
    if (++reads === 2) rows.splice(501, 0, { id: "id-00500a" });
    const cursor = new URL(url).searchParams.get("id")?.slice(3);
    const remaining = rows.filter(row => !cursor || row.id > cursor);
    const page = remaining.slice(0, 500);
    return { ok: true, headers: { get: () => `0-${page.length - 1}/${remaining.length}` }, text: async () => JSON.stringify(page) };
  } });
  const entries = await client.fetchOrderListEntries();
  const ids = new Set(entries.map(entry => entry.id));
  assert.ok(original.every(row => ids.has(row.id)), "every existing order must survive concurrent inserts");
  assert.equal(ids.size, 1001);
});

test("missing Content-Range never makes a short capped page look like the complete list", async () => {
  const rows = Array.from({ length: 207 }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}` }));
  const client = createSupabaseQuoteOpsClient({ env, fetch: async url => {
    const cursor = new URL(url).searchParams.get("id")?.slice(3);
    const page = rows.filter(row => !cursor || row.id > cursor).slice(0, 100);
    return { ok: true, text: async () => JSON.stringify(page) };
  } });
  assert.equal((await client.fetchOrderListEntries()).length, rows.length);
});

test("duplicate or nonascending IDs fail closed rather than satisfying the row count", async () => {
  const client = createSupabaseQuoteOpsClient({ env, fetch: async () => ({ ok: true,
    headers: { get: () => "0-1/2" }, text: async () => JSON.stringify([{ id: "same" }, { id: "same" }]) }) });
  await assert.rejects(client.fetchOrderListEntries(), /Invalid order list cursor/);
});

test("strict detail reads cannot substitute an old cached price when the authoritative row is absent or unavailable", async () => {
  let offline = false;
  const store = createQuoteOpsStore({ QUOTE_OPS_LEDGER_LIMIT: 250, normalizeString,
    createSupabaseQuoteOpsClient: () => ({ isConfigured: () => true,
      upsertEntry: async () => {},
      fetchEntryById: async () => { if (offline) throw new Error("Database unavailable"); return null; },
    }) });
  const cached = await store.recordSubmission({ requestId: "cached", totalPrice: 250 });
  assert.equal((await store.getEntry(cached.id)).totalPrice, 250, "legacy callers retain their existing fallback policy");
  assert.equal(await store.getEntry(cached.id, { allowMemoryFallback: false }), null);
  offline = true;
  await assert.rejects(store.getEntry(cached.id, { allowMemoryFallback: false }), /Database unavailable/);
});
