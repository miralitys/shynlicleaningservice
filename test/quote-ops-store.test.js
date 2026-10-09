"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

test("guarded background order writes use compare-and-set and stop on a concurrent deletion", async () => {
  const original = {
    id: "visit", updatedAt: "2026-10-08T12:00:00.000Z",
    payloadForRetry: { orderState: { isCreated: true, status: "scheduled" } },
  };
  let conditionalWrites = 0;
  let unconditionalWrites = 0;
  const store = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 25, normalizeString,
    applyOrderEntryUpdates(entry) {
      entry.updatedAt = "2026-10-08T13:00:00.000Z";
      return entry;
    },
    createSupabaseQuoteOpsClient: () => ({
      config: { configured: true }, isConfigured: () => true,
      async fetchEntryById() { return structuredClone(original); },
      async upsertEntry() { unconditionalWrites++; },
      async updateEntryIfUnchanged(entry, expectedUpdatedAt) {
        conditionalWrites++;
        assert.equal(expectedUpdatedAt, original.updatedAt);
        return false;
      },
    }),
  });
  assert.equal(await store.updateOrderEntry("visit", { requireExistingOrder: true, recurringNextEntryId: "next" }), null);
  assert.equal(conditionalWrites, 1);
  assert.equal(unconditionalWrites, 0);
});

test("guarded background writes skip an already deleted order", async () => {
  let writes = 0;
  const store = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 25, normalizeString,
    applyOrderEntryUpdates() { throw new Error("Deleted visits must not be mutated"); },
    createSupabaseQuoteOpsClient: () => ({
      config: { configured: true }, isConfigured: () => true,
      async fetchEntryById() { return { id: "visit", payloadForRetry: { orderState: null } }; },
      async upsertEntry() { writes++; },
    }),
  });
  assert.equal(await store.updateOrderEntry("visit", { requireExistingOrder: true, recurringSeriesId: "series" }), null);
  assert.equal(writes, 0);
});

test("complete series reads fail closed instead of using a partial memory fallback", async () => {
  const store = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 25,
    normalizeString,
    applyOrderEntryUpdates: (entry) => entry,
    createSupabaseQuoteOpsClient: () => ({
      config: { configured: true, url: "https://example.supabase.co", tableName: "quote_ops_entries" },
      isConfigured: () => true,
      async fetchAllEntries() { throw new Error("incomplete ledger"); },
      async fetchEntries() { return [{ id: "only-recent-entry" }]; },
    }),
  });
  await assert.rejects(store.listAllEntries(), /incomplete ledger/);
});

test("tracks diagnostics when Supabase read falls back to local memory", async () => {
  const store = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 25,
    applyOrderEntryUpdates(entry) {
      return entry;
    },
    createSupabaseQuoteOpsClient() {
      return {
        config: {
          configured: true,
          url: "https://example.supabase.co",
          tableName: "quote_ops_entries",
        },
        isConfigured() {
          return true;
        },
        async fetchEntries() {
          throw new Error("supabase read failed");
        },
        async fetchEntryById() {
          return null;
        },
        async upsertEntry() {
          return null;
        },
        async deleteEntry() {
          return true;
        },
      };
    },
    normalizeString,
  });

  const entries = await store.listEntries({ limit: 10 });
  const diagnostics = store.getDiagnostics();

  assert.deepEqual(entries, []);
  assert.equal(store.mode, "supabase");
  assert.equal(diagnostics.mode, "supabase");
  assert.equal(diagnostics.tableName, "quote_ops_entries");
  assert.equal(diagnostics.lastReadSource, "memory-fallback");
  assert.match(diagnostics.lastReadError, /supabase read failed/i);
  assert.ok(diagnostics.lastReadAt);
});

test("tracks diagnostics when Supabase write fails", async () => {
  const store = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 25,
    applyOrderEntryUpdates(entry) {
      return entry;
    },
    createSupabaseQuoteOpsClient() {
      return {
        config: {
          configured: true,
          url: "https://example.supabase.co",
          tableName: "quote_ops_entries",
        },
        isConfigured() {
          return true;
        },
        async fetchEntries() {
          return [];
        },
        async fetchEntryById() {
          return null;
        },
        async upsertEntry() {
          throw new Error("supabase write failed");
        },
        async deleteEntry() {
          return true;
        },
      };
    },
    normalizeString,
  });

  const entry = await store.recordSubmission({
    ok: true,
    requestId: "diagnostics-write-1",
    customerName: "Test Client",
  });
  const diagnostics = store.getDiagnostics();

  assert.ok(entry && entry.id);
  assert.equal(diagnostics.mode, "supabase");
  assert.match(diagnostics.lastWriteError, /supabase write failed/i);
  assert.ok(diagnostics.lastWriteAt);
});

test("loads only requested cleaner entries from Supabase", async () => {
  const requestedIds = [];
  const store = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 1000,
    applyOrderEntryUpdates(entry) {
      return entry;
    },
    createSupabaseQuoteOpsClient() {
      return {
        config: {
          configured: true,
          url: "https://example.supabase.co",
          tableName: "quote_ops_entries",
        },
        isConfigured() {
          return true;
        },
        async fetchEntriesByIds(entryIds) {
          requestedIds.push(...entryIds);
          return entryIds.map((id) => ({ id, customerName: `Client ${id}` }));
        },
        async fetchEntries() {
          throw new Error("full ledger should not be loaded");
        },
      };
    },
    normalizeString,
  });

  const entries = await store.listEntriesByIds(["order-1", "order-2", "order-1"]);

  assert.deepEqual(requestedIds, ["order-1", "order-2"]);
  assert.deepEqual(entries.map((entry) => entry.id), ["order-1", "order-2"]);
  assert.equal(store.getDiagnostics().lastReadSource, "supabase-entry-ids");
});

test("hides admin shadow rows from quote ops listings", () => {
  const entries = filterQuoteOpsEntries(
    [
      {
        id: "entry-1",
        kind: "quote_submission",
        status: "success",
        customerName: "Visible order",
        serviceType: "standard",
      },
      {
        id: "entry-2",
        kind: "admin_staff_member",
        status: "success",
        customerName: "Hidden staff row",
        serviceType: "",
      },
      {
        id: "entry-3",
        kind: "admin_staff_assignment",
        status: "success",
        customerName: "",
        serviceType: "",
      },
      {
        id: "entry-4",
        kind: "admin_user_account",
        status: "success",
        customerName: "Hidden user row",
        serviceType: "",
      },
      {
        id: "entry-5",
        kind: "admin_mail_integration",
        status: "success",
        customerName: "Hidden mail row",
        serviceType: "",
      },
      {
        id: "entry-6",
        kind: "admin_standalone_task",
        status: "success",
        customerName: "Без клиента",
        serviceType: "",
      },
    ],
    { limit: 10 },
    normalizeString
  );

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["entry-1"]
  );
});

test("includes standalone task rows only when explicitly requested", () => {
  const entries = filterQuoteOpsEntries(
    [
      {
        id: "entry-1",
        kind: "quote_submission",
        status: "success",
        customerName: "Visible order",
      },
      {
        id: "entry-2",
        kind: "admin_standalone_task",
        status: "success",
        customerName: "Без клиента",
      },
    ],
    { limit: 10, includeHidden: true },
    normalizeString
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["entry-1", "entry-2"]);
});
