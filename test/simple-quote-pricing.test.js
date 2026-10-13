"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateQuotePricing } = require("../lib/quote-pricing");
test("simplified quote extras use canonical prices without affecting pricing defaults", () => {
  assert.equal(calculateQuotePricing({ serviceType: "regular" }).totalPrice, 145);
  const initial = calculateQuotePricing({ serviceType: "deep" });
  assert.equal(initial.totalPrice, 219);
  const extras = calculateQuotePricing({ serviceType: "deep", services: [...initial.services, "dishwasherCleaning", "insideCabinets"], quantityServices: { interiorWindowsCleaning: 1, interiorWindowsWithTracks: 2 } });
  assert.equal(extras.totalPrice, 219 + 30 + 45 + 6 + 16);
  assert.ok(extras.services.includes("dishwasherCleaning"));
});
