"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadQuoteOpsWorkspaceEntries } = require("../lib/admin/pages/quote-ops-workspace-entries");

test("quote workspace reads the complete ledger once and keeps entries beyond both historical limits", async () => {
  const entries = Array.from({ length: 1205 }, (_, i) => ({ id: `entry-${i}`, createdAt: "2026-10-20T12:00:00Z" }));
  entries.push({ id: "older-active-lead", createdAt: "2026-01-01T12:00:00Z" });
  const original = structuredClone(entries);
  let calls = 0;
  const actual = await loadQuoteOpsWorkspaceEntries({
    listAllEntries: async () => { calls += 1; return entries; },
    listEntries: async () => { throw new Error("A capped ledger must not be used"); },
  });
  assert.equal(calls, 1);
  assert.equal(actual.length, 1206);
  assert.equal(actual.at(-1).id, "older-active-lead");
  assert.deepEqual(entries, original);
});

test("an incomplete full read is reported instead of silently substituting a limited list", async () => {
  let fallback = false;
  await assert.rejects(loadQuoteOpsWorkspaceEntries({
    listAllEntries: async () => { throw new Error("Full ledger unavailable"); },
    listEntries: async () => { fallback = true; return []; },
  }), /Full ledger unavailable/);
  assert.equal(fallback, false);
  assert.deepEqual(await loadQuoteOpsWorkspaceEntries(null), []);
});
