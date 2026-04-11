"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateQuotePricing } = require("../lib/quote-pricing");

test("calculates quote pricing with the same core rules as the client calculator", () => {
  const pricing = calculateQuotePricing({
    serviceType: "regular",
    frequency: "biweekly",
    rooms: "3",
    bathrooms: "2.5",
    squareMeters: "1600",
    basementCleaning: "yes",
    services: ["ovenCleaning", "insideCabinets"],
    quantityServices: {
      interiorWindowsCleaning: "2",
      blindsCleaning: "1",
      bedLinenChange: "0",
    },
  });

  assert.equal(pricing.serviceType, "regular");
  assert.equal(pricing.totalPrice, 380);
  assert.equal(pricing.totalPriceCents, 38000);
});

test("supports the current UI square-foot step indexes and still accepts legacy square-foot buckets", () => {
  const stepIndexedPricing = calculateQuotePricing({
    serviceType: "regular",
    rooms: "1",
    bathrooms: "1",
    squareMeters: "1",
  });

  assert.equal(stepIndexedPricing.squareMeters, 1);
  assert.equal(stepIndexedPricing.totalPrice, 165);

  const legacyBucketPricing = calculateQuotePricing({
    serviceType: "regular",
    rooms: "0",
    bathrooms: "0",
    squareMeters: "1234",
  });

  assert.equal(legacyBucketPricing.rooms, 1);
  assert.equal(legacyBucketPricing.bathrooms, 1);
  assert.equal(legacyBucketPricing.squareMeters, 1600);
  assert.equal(legacyBucketPricing.totalPrice, 165);
});

test("clamps obviously invalid quote inputs back to UI-supported minimums", () => {
  const pricing = calculateQuotePricing({
    serviceType: "regular",
    rooms: "0",
    bathrooms: "0",
    squareMeters: "-999",
  });

  assert.equal(pricing.rooms, 1);
  assert.equal(pricing.bathrooms, 1);
  assert.equal(pricing.squareMeters, 0);
  assert.equal(pricing.totalPrice, 145);
});
