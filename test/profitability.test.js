"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { canAccessProfitability, validAssistantKey, cents, normalizePatch, calculateProfitability, inheritedSource, sourceFromAttribution } = require("../lib/profitability");
const { createProfitabilityStore } = require("../lib/profitability-store");
const { parseSourceImport, csvCell } = require("../lib/admin/handlers-profitability");

test("profitability grants only the shared owner and two configured active personal accounts, not a role", () => {
  const env = { PROFITABILITY_ENABLED: "1", PROFITABILITY_ALLOWED_USER_IDS: "tonya,nastya" };
  assert.equal(canAccessProfitability({ authorized: true, role: "admin", source: "admin-session", user: null }, env), true);
  for (const id of ["tonya", "nastya"]) assert.equal(canAccessProfitability({ authorized: true, role: "admin", user: { id } }, env), true);
  for (const role of ["admin", "manager", "viewer", "cleaner", ""]) assert.equal(canAccessProfitability({ authorized: true, role, user: { id: "other" } }, env), false);
  assert.equal(canAccessProfitability({ authorized: true, role: "manager", user: { id: "tonya" } }, env), false);
  assert.equal(canAccessProfitability({ authorized: true, role: "admin", user: { id: "tonya", status: "inactive" } }, env), false);
  assert.equal(canAccessProfitability({ authorized: false, role: "admin", source: "admin-session" }, env), false);
  assert.equal(canAccessProfitability({ authorized: true, role: "admin", source: "admin-session" }, {}), false);
});

test("the assistant key is disabled by default and has a separate explicit field allowlist", () => {
  const key = "test-only-key-not-a-production-secret-12345";
  const env = { PROFITABILITY_ENABLED: "1", PROFITABILITY_ASSISTANT_KEY_SHA256: crypto.createHash("sha256").update(key).digest("hex") };
  assert.equal(validAssistantKey(`Bearer ${key}`, {}), false);
  assert.equal(validAssistantKey(`Bearer ${key}`, env), true);
  assert.equal(validAssistantKey(`Bearer ${key}x`, env), false);
  assert.equal(validAssistantKey("Bearer short", env), false);
  assert.deepEqual(normalizePatch({ source: "referral", paidCents: 12500, payouts: [{ staffId: "a", cents: 7500 }] }, ["a"], true),
    { source: "referral", paidCents: 12500, payouts: [{ staffId: "a", cents: 7500 }] });
  for (const key of ["totalPrice", "orderStatus", "selectedDate", "assignedStaff", "comment", "discountCents", "taskId"])
    assert.throws(() => normalizePatch({ [key]: "changed" }, ["a"], true));
  assert.throws(() => normalizePatch({ payouts: [{ staffId: "other", cents: 5 }] }, ["a"]));
  assert.throws(() => normalizePatch({ payouts: [{ staffId: "a", cents: 5 }, { staffId: "a", cents: 10 }] }, ["a"]));
  for (const value of [-1, 1.5, Infinity, "100", null]) assert.throws(() => normalizePatch({ leadCostCents: value }, []));
  assert.throws(() => normalizePatch({ paidAt: "2026-02-30" }, []));
  assert.throws(() => normalizePatch({ paidAt: "2026-99-99" }, []));
  assert.equal(cents("12,34"), 1234);
  for (const value of ["", "1.111", "-2", "NaN", "1e3"]) assert.throws(() => cents(value));
});

test("all seven formulas are exact for one-off, recurring and canceled visits without changing orders", () => {
  const team = [{ id: "a" }, { id: "b" }];
  const settings = { configured: true, suppliesCents: 500, fuelCents: 700, cardFeeBasisPoints: 290 };
  const order = { totalPrice: 300, serviceDurationMinutes: 180, orderStatus: "completed", paymentMethod: "invoice" };
  const before = structuredClone(order);
  const actual = calculateProfitability(order, { basePriceCents: 30000, addonsCents: 4000, discountCents: 1500,
    paidCents: 20000, leadCostCents: 1500, actualMinutes: 150,
    payouts: [{ staffId: "a", cents: 6000 }, { staffId: "b", cents: 5000 }] }, team, settings);
  assert.deepEqual([actual.payableCents, actual.payoutTotalCents, actual.expensesCents, actual.profitCents,
    actual.marginPercent, actual.profitPerHourCents, actual.debtCents], [32500, 11000, 14280, 5720, 28.6, 2288, 12500]);
  assert.equal(actual.cardFeeCents, 580);
  assert.equal(actual.complete, true);
  const recurring = calculateProfitability({ totalPrice: 250, frequency: "weekly", serviceDurationMinutes: 120, orderStatus: "cleaning-complete", paymentMethod: "zelle" },
    { paidCents: 30000, discountCents: 1000, payouts: [{ staffId: "a", cents: 10000 }] }, [{ id: "a" }], settings);
  assert.deepEqual([recurring.payableCents, recurring.payoutTotalCents, recurring.expensesCents, recurring.profitCents, recurring.debtCents, recurring.profitPerHourCents],
    [24000, 10000, 11200, 18800, -6000, 9400]);
  assert.ok(Math.abs(recurring.marginPercent - 18800 / 30000 * 100) < 1e-9);
  assert.equal(recurring.actualMinutes, 120);
  const canceled = calculateProfitability({ ...order, orderStatus: "canceled" }, { paidCents: 10000, payouts: [{ staffId: "a", cents: 5000 }] }, [{ id: "a" }], settings);
  assert.deepEqual([canceled.profitCents, canceled.marginPercent, canceled.profitPerHourCents, canceled.debtCents, canceled.canceled], [0, null, null, 0, true]);
  assert.deepEqual(order, before);
  assert.equal(calculateProfitability({ ...order, paymentStatus: "paid" }, {}, team, settings).complete, false);
  assert.equal(calculateProfitability({ ...order, paymentStatus: "paid" }, {}, team, settings).debtCents, null);
  assert.equal(calculateProfitability(order, { paidCents: 0 }, team, settings).debtCents, 30000);
  assert.equal(calculateProfitability(order, { paidCents: 10000, payouts: [{ staffId: "a", cents: 0 }] }, team, settings).complete, false);
  assert.equal(calculateProfitability(order, { paidCents: 10000, payouts: [{ staffId: "a", cents: 0 }, { staffId: "b", cents: 0 }] }, team, settings).complete, true);
  const removed = calculateProfitability(order, { paidCents: 20000, payouts: [{ staffId: "a", cents: 6000 }, { staffId: "removed", cents: 4000 }] }, [{ id: "a" }], settings);
  assert.equal(removed.payoutTotalCents, 10000);
});

test("financial saves are atomic with private history, reject stale versions and never write order data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-profit-"));
  const env = { PROFITABILITY_STORE_PATH: path.join(root, "private.json") };
  try {
    const store = createProfitabilityStore({ env });
    await store.save("order-a", { paidCents: 20000, source: "referral" }, 0, { id: "tonya" });
    const results = await Promise.allSettled([store.save("order-a", { paidCents: 21000 }, 1, { id: "nastya" }), store.save("order-a", { paidCents: 22000 }, 1, { id: "tonya" })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await store.history("order-a")).length, 2);
    await assert.rejects(store.saveBatch([{ id: "new", patch: { source: "google" }, version: 0 }, { id: "order-a", patch: { source: "google" }, version: 0 }], { id: "tonya" }), error => error.status === 409);
    assert.equal((await store.get("new")).version, 0);
    assert.equal((await fs.stat(env.PROFITABILITY_STORE_PATH)).mode & 0o777, 0o600);
    assert.deepEqual(await store.listSources(), [{ id: "order-a", source: "referral" }]);
    const history = await store.history("order-a");
    assert.equal(history[1].actor.id, "tonya");
    assert.deepEqual(history[1].after, { paidCents: 20000, source: "referral" });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("CSV source import validates the whole file and protects exports from spreadsheet formulas", () => {
  const orders = [{ id: "a" }, { id: "b" }];
  assert.equal(parseSourceImport('ID заказа,источник\na,"Google (сайт/поиск)"\nb,Thumbtack', orders, new Map()).length, 2);
  for (const csv of ["id,source\na,unknown", "id,source\na,google\na,website", "id,source\nmissing,website", "id,source,paidCents\na,google,100"])
    assert.throws(() => parseSourceImport(csv, orders, new Map()));
  assert.equal(csvCell("=IMPORTDATA(1)"), '"\'=IMPORTDATA(1)"');
  assert.equal(csvCell(-125), '"-125"');
});

test("repeat orders inherit the first order's source rather than the latest order", async () => {
  const entries = [{ id: "late", createdAt: "2026-10-20", customerPhone: "6305550123", payloadForRetry: { orderState: { status: "completed" }, calculatorData: { acquisitionSource: "google" } } },
    { id: "first", createdAt: "2026-01-01", customerPhone: "+1(630)555-0123", payloadForRetry: { orderState: { status: "completed" }, calculatorData: { acquisitionSource: "referral" } } }];
  assert.equal(await inheritedSource({ customerPhone: "6305550123" }, { listOrderListEntries: async () => entries }), "referral");
  assert.equal(await inheritedSource({ customerPhone: "6305550123" }, { listOrderListEntries: async () => entries }, { get: async () => ({ data: { source: "thumbtack" } }) }), "thumbtack");
});

test("website source uses explicit tracking and does not invent Google or LSA attribution", () => {
  assert.equal(sourceFromAttribution(), "website");
  assert.equal(sourceFromAttribution({ gclid: "test-click" }), "google");
  assert.equal(sourceFromAttribution({ utm_source: "GOOGLE" }), "google");
  assert.equal(sourceFromAttribution({ utm_source: "google_lsa" }), "google_lsa");
  assert.equal(sourceFromAttribution({ utm_source: "thumbtack" }), "thumbtack");
  assert.equal(sourceFromAttribution({ utm_source: "nextdoor" }), "nextdoor");
  assert.equal(sourceFromAttribution({ utm_source: "unknown-campaign" }), "other");
});
