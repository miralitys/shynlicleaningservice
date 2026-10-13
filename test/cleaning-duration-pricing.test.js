"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCleaningDuration, calculateQuotePricing } = require("../lib/quote-pricing");

test("duration uses full price, nearest quarter hour and a thirty-minute upper bound", () => {
  for (const [price, count, lower, upper] of [
    [550, 2, 360, 390], [433, 2, 285, 315], [200, 2, 135, 165],
    [360, 2, 240, 270], [360, 1, 480, 510], [360, 3, 165, 195],
  ]) {
    const result = calculateCleaningDuration(price, count);
    assert.equal(result.estimatedDurationMinutes, lower);
    assert.equal(result.serviceDurationMinutes, upper);
  }
  assert.equal(calculateCleaningDuration(360, 2).durationLabel, "4h - 4h 30m");
  assert.equal(calculateCleaningDuration(0, 2).serviceDurationMinutes, 0);
});

test("quote duration derives from canonical undiscounted price, not client duration or discount", () => {
  const result = calculateQuotePricing({ serviceType: "deep", discount: 100, serviceDurationMinutes: 1 });
  assert.equal(result.fullPriceBeforeDiscount, result.totalPrice);
  assert.equal(result.serviceDurationMinutes, calculateCleaningDuration(result.totalPrice, 2).serviceDurationMinutes);
});
