"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");

const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });

for (const code of [null, "23505", "40001", "40P01"]) {
  test(`explicit order version reports a late ${code || "CAS rejection"} as 409`, async () => {
    const original = {
      id: "visit", updatedAt: "2026-11-24T12:00:00.000Z", totalPrice: 374,
      payloadForRetry: { orderState: { isCreated: true, status: "scheduled" } },
    };
    let cacheWrites = 0;
    let conditionalWrites = 0;
    const store = createQuoteOpsStore({
      ...domain, normalizeString, env: {}, QUOTE_OPS_LEDGER_LIMIT: 25,
      orderStore: { async upsertEntry() { cacheWrites++; } },
      createSupabaseQuoteOpsClient: () => ({
        isConfigured: () => true,
        async fetchEntryById() { return structuredClone(original); },
        async updateEntryIfUnchanged(entry, expectedUpdatedAt) {
          conditionalWrites++;
          assert.equal(expectedUpdatedAt, original.updatedAt);
          if (code) throw Object.assign(new Error("Concurrent order mutation"), { code });
          return false;
        },
      }),
    });

    await assert.rejects(store.updateOrderEntry("visit", {
      requireExistingOrder: true, expectedUpdatedAt: original.updatedAt, orderStatus: "photos",
    }), error => error.status === 409 && error.code === (code || "40001"));
    assert.equal(conditionalWrites, 1);
    assert.equal(cacheWrites, 0);
    assert.deepEqual(await store.getEntry("visit"), original);
  });
}
