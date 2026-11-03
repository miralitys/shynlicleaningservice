"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const pricing = require("../lib/quote-pricing");
const { createOrdersUiQuoteHelpers } = require("../lib/admin/pages/orders-ui-quote-helpers");
const { renderAuditValue } = require("../lib/admin/pages/audit-value-formatters");

test("all 4800 existing calculator selections retain their complete pricing results", () => {
  const hash = crypto.createHash("sha256");
  let count = 0;
  for (const serviceType of ["regular", "deep", "moving"])
    for (const frequency of ["weekly", "biweekly", "every3weeks", "monthly"])
      for (let rooms = 1; rooms <= 5; rooms++)
        for (let bathrooms = 1; bathrooms <= 5.5; bathrooms += 0.5)
          for (let squareMeters = 0; squareMeters <= 7; squareMeters++) {
            hash.update(JSON.stringify(pricing.calculateQuotePricing({ serviceType, frequency, rooms, bathrooms, squareMeters })));
            count++;
          }
  assert.equal(count, 4800);
  // Captured from the unmodified pricing engine before extending the limits.
  assert.equal(hash.digest("hex"), "f5dc6a6198365e4319bb68b32ef4e7879e63bf7f6dd52fef98299e17771babbc");
});

test("bedroom and half-bath counts reach 10 using the existing rates", () => {
  assert.deepEqual([...pricing.ALLOWED_ROOM_COUNTS], Array.from({ length: 10 }, (_, i) => i + 1));
  assert.deepEqual([...pricing.ALLOWED_BATHROOM_COUNTS], Array.from({ length: 19 }, (_, i) => 1 + i / 2));
  for (const serviceType of ["regular", "deep", "moving"]) {
    const rates = pricing.PRICING[serviceType];
    for (let rooms = 6; rooms <= 10; rooms++) {
      const result = pricing.calculateQuotePricing({ serviceType, rooms, bathrooms: 10 });
      assert.equal(result.rooms, rooms);
      assert.equal(result.bathrooms, 10);
      assert.equal(result.totalPrice - pricing.calculateQuotePricing({ serviceType, rooms: rooms - 1, bathrooms: 10 }).totalPrice, rates.roomPrice);
    }
    for (let bathrooms = 6; bathrooms <= 10; bathrooms += 0.5) {
      const result = pricing.calculateQuotePricing({ serviceType, rooms: 10, bathrooms });
      assert.equal(result.bathrooms, bathrooms);
      assert.equal(result.totalPrice - pricing.calculateQuotePricing({ serviceType, rooms: 10, bathrooms: bathrooms - 0.5 }).totalPrice, rates.bathroomStepPrice);
    }
  }
  assert.equal(pricing.normalizeQuotePricingInput({ rooms: 11 }).rooms, 10);
  assert.equal(pricing.ALLOWED_BATHROOM_COUNTS.has(10.5), false);
  assert.equal(pricing.normalizeQuotePricingInput({ bathrooms: "5+" }).bathrooms, 5.5);
});

test("new square-foot ranges are contiguous 500-foot steps at $20 and accept raw areas", () => {
  assert.equal(pricing.SQUARE_FEET_PRICING_BUCKETS.at(-1).max, 10000);
  assert.equal(pricing.ALLOWED_SQUARE_FEET_BUCKETS.at(-1), 16);
  for (const serviceType of ["regular", "deep", "moving"]) {
    const rates = pricing.PRICING[serviceType];
    for (let step = 7; step <= 16; step++) {
      const max = 5500 + (step - 7) * 500;
      for (const squareMeters of [step, String(step), max - 499, max]) {
        const result = pricing.calculateQuotePricing({ serviceType, squareMeters });
        assert.equal(result.squareMeters, step);
        assert.equal(pricing.calculateSquareFeetPrice(rates, squareMeters), step * 20);
      }
      assert.equal(pricing.calculateSquareFeetPrice(rates, step) - pricing.calculateSquareFeetPrice(rates, step - 1), 20);
    }
  }
  assert.equal(pricing.formatSquareFeetBucket(7), "5,001 - 5,500 sq ft");
  assert.equal(pricing.formatSquareFeetBucket(8), "5,501 - 6,000 sq ft");
  assert.equal(pricing.formatSquareFeetBucket(16), "9,501 - 10,000 sq ft");
  assert.equal(pricing.formatSquareFeetBucket(17), "");
});

test("browser engine, booking handoff and server agree for every expanded home size", () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/cleaning-pricing"), "utf8"), browser);
  const window = { ShynliPricing: browser.ShynliPricing };
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/calculator-controls"), "utf8"), { window, URLSearchParams });
  const controls = window.ShynliCalculatorControls;
  for (const serviceType of ["regular", "deep", "moving"])
    for (let rooms = 6; rooms <= 10; rooms++)
      for (let bathrooms = 6; bathrooms <= 10; bathrooms += 0.5)
        for (let squareMeters = 7; squareMeters <= 16; squareMeters++) {
          const input = { serviceType, rooms, bathrooms, squareMeters, refrigeratorCondition: "notEmptied", cabinetsCondition: "notEmptied" };
          const selected = controls.bookingSelection(input);
          const restored = controls.readBookingSelection("?calculator=" + encodeURIComponent(JSON.stringify(selected)));
          const expected = pricing.roundCustomerQuotePricing(pricing.calculateQuotePricing(selected));
          assert.equal(JSON.stringify(browser.ShynliPricing.roundCustomerQuotePricing(browser.ShynliPricing.calculateQuotePricing(restored))), JSON.stringify(expected));
          assert.equal(restored.rooms, rooms);
          assert.equal(restored.bathrooms, bathrooms);
          assert.equal(restored.squareMeters, squareMeters);
        }
});

test("new area codes render as ranges while old order and audit labels remain unchanged", () => {
  const helpers = createOrdersUiQuoteHelpers({
    normalizeString: (v, max) => String(v ?? "").trim().slice(0, max),
    ORDER_QUOTE_SQUARE_FOOTAGE_LABELS: { 0: "700 - 1,200 sq ft", 7: "5,001+ sq ft", 6500: "5,001+ sq ft" },
  });
  for (let step = 8; step <= 16; step++) {
    assert.equal(helpers.formatOrderQuoteSquareFootage(step), pricing.formatSquareFeetBucket(step));
    assert.equal(renderAuditValue("squareMeters", step, String), pricing.formatSquareFeetBucket(step));
  }
  assert.equal(helpers.formatOrderQuoteSquareFootage(7), "5,001+ sq ft");
  assert.equal(helpers.formatOrderQuoteSquareFootage(6500), "5,001+ sq ft");
  assert.equal(renderAuditValue("squareMeters", 7, String), "5 001 и более кв. футов");
});
