"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsStore, filterQuoteOpsEntries } = require("../lib/quote-ops/store");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

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

test("hides admin staff shadow rows from quote ops listings", () => {
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
    ],
    { limit: 10 },
    normalizeString
  );

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["entry-1"]
  );
});
