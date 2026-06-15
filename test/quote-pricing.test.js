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

test("clears recurring frequency for one-time service types", () => {
  const deepPricing = calculateQuotePricing({
    serviceType: "deep",
    frequency: "biweekly",
    rooms: "2",
    bathrooms: "2",
    squareMeters: "0",
  });

  assert.equal(deepPricing.serviceType, "deep");
  assert.equal(deepPricing.frequency, "");

  const movingPricing = calculateQuotePricing({
    serviceType: "moving",
    frequency: "weekly",
    rooms: "2",
    bathrooms: "2",
    squareMeters: "0",
  });

  assert.equal(movingPricing.serviceType, "moving");
  assert.equal(movingPricing.frequency, "");
});

test("bills included deep-cleaning services to match the pricing calculator", () => {
  const pricing = calculateQuotePricing({
    serviceType: "deep",
    rooms: "1",
    bathrooms: "3.5",
    squareMeters: "0",
    basementCleaning: "no",
    services: [
      "ovenCleaning",
      "refrigeratorCleaning",
      "insideCabinets",
      "baseboardCleaning",
      "doorsCleaning",
    ],
  });

  assert.equal(pricing.totalPrice, 443.5);
  assert.deepEqual(pricing.includedServices, ["baseboardCleaning", "doorsCleaning"]);
  assert.ok(pricing.services.includes("baseboardCleaning"));
  assert.ok(pricing.services.includes("doorsCleaning"));
});

test("bills included move-in/out services to match the pricing calculator", () => {
  const pricing = calculateQuotePricing({
    serviceType: "moving",
    rooms: "1",
    bathrooms: "3.5",
    squareMeters: "0",
    basementCleaning: "no",
    services: [
      "ovenCleaning",
      "refrigeratorCleaning",
      "insideCabinets",
      "baseboardCleaning",
      "doorsCleaning",
    ],
  });

  assert.equal(pricing.totalPrice, 488.5);
  assert.deepEqual(pricing.includedServices, ["baseboardCleaning", "doorsCleaning"]);
});

test("uses pricing-page square-foot step indexes and maps legacy raw square feet", () => {
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
  assert.equal(legacyBucketPricing.squareMeters, 1);
  assert.equal(legacyBucketPricing.totalPrice, 165);

  const largerLegacyBucketPricing = calculateQuotePricing({
    serviceType: "regular",
    rooms: "1",
    bathrooms: "1",
    squareMeters: "2250",
  });

  assert.equal(largerLegacyBucketPricing.squareMeters, 2);
  assert.equal(largerLegacyBucketPricing.totalPrice, 185);
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
