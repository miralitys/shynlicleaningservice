"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { calculateQuotePricing } = require("../lib/quote-pricing");

test("Deep and Moving defaults increase only by the agreed $23", () => {
  assert.equal(calculateQuotePricing({ serviceType: "deep" }).totalPrice, 219);
  assert.equal(
    calculateQuotePricing({ serviceType: "moving" }).totalPrice,
    354,
  );
  assert.equal(
    calculateQuotePricing({ serviceType: "regular" }).totalPrice,
    145,
  );
});
test("doors are removable while baseboards stay included", () => {
  for (const serviceType of ["deep", "moving"]) {
    const selected = calculateQuotePricing({
      serviceType,
      services: ["doorsCleaning"],
    });
    const removed = calculateQuotePricing({ serviceType, services: [] });
    assert.equal(selected.totalPrice - removed.totalPrice, 45);
    assert.deepEqual(removed.services, ["baseboardCleaning"]);
  }
  assert.equal(
    calculateQuotePricing({ services: ["doorsCleaning"] }).totalPrice,
    190,
  );
});
test("all additional rooms use bedroom rate for each service", () => {
  for (const serviceType of ["regular", "deep", "moving"]) {
    const base = calculateQuotePricing({ serviceType, services: [] });
    const rooms = calculateQuotePricing({
      serviceType,
      services: [],
      additionalRooms: { office: 2, sunroom: 1, familyRoom: 1, loft: 1 },
    });
    assert.equal(
      rooms.totalPrice - base.totalPrice,
      5 * (serviceType === "regular" ? 12 : 22.5),
    );
  }
});
test("new per-item options charge exactly their unit prices", () => {
  const base = calculateQuotePricing({ services: [] }).totalPrice;
  const result = calculateQuotePricing({
    services: [],
    quantityServices: {
      interiorWindowsCleaning: 2,
      interiorWindowsWithTracks: 3,
      slidingDoorInterior: 2,
      slidingDoorBothSides: 1,
      chandelierCleaning: 2,
      blindsCleaning: 2,
    },
  });
  assert.equal(result.totalPrice - base, 12 + 24 + 24 + 20 + 130 + 16);
});
test("refrigerator and cabinet variants only charge when selected", () => {
  assert.equal(
    calculateQuotePricing({
      services: [],
      refrigeratorCondition: "notEmptied",
      cabinetsCondition: "notEmptied",
    }).totalPrice,
    145,
  );
  assert.equal(
    calculateQuotePricing({
      services: ["refrigeratorCleaning", "insideCabinets"],
      refrigeratorCondition: "notEmptied",
      cabinetsCondition: "notEmptied",
    }).totalPrice,
    325,
  );
  assert.equal(
    calculateQuotePricing({
      services: ["refrigeratorCleaning", "insideCabinets"],
    }).totalPrice,
    235,
  );
});
test("pets add $25 once and no-pet values do not", () => {
  for (const hasPets of ["cat", "dog", "yes", true])
    assert.equal(calculateQuotePricing({ hasPets }).totalPrice, 170);
  for (const hasPets of ["no", "none", false])
    assert.equal(calculateQuotePricing({ hasPets }).totalPrice, 145);
});
test("cabinet tops restricted to Deep and Moving", () => {
  assert.equal(
    calculateQuotePricing({ services: ["topKitchenCabinets"] }).totalPrice,
    145,
  );
  assert.equal(
    calculateQuotePricing({
      serviceType: "deep",
      services: ["topKitchenCabinets"],
    }).totalPrice,
    219,
  );
});
test("Every 3 weeks keeps frequency but explicitly prices as biweekly", () => {
  const result = calculateQuotePricing({ frequency: "every3weeks" });
  assert.equal(result.frequency, "every3weeks");
  assert.equal(result.pricingFrequency, "biweekly");
  assert.equal(result.totalPrice, 145);
  assert.match(result.frequencyNotice, /monthly rate/);
});
test("browser and server share exact calculations including new fields", () => {
  const browser = {};
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../js/cleaning-pricing"), "utf8"),
    browser,
  );
  const inputs = {
    serviceType: "deep",
    rooms: 3,
    bathrooms: 3.5,
    squareMeters: 4,
    hasPets: "dog",
    services: ["doorsCleaning", "insideCabinets"],
    cabinetsCondition: "notEmptied",
    additionalRooms: { office: 1, loft: 2 },
    quantityServices: {
      slidingDoorBothSides: 2,
      interiorWindowsWithTracks: 4,
      chandelierCleaning: 1,
    },
  };
  assert.equal(
    JSON.stringify(browser.ShynliPricing.calculateQuotePricing(inputs)),
    JSON.stringify(calculateQuotePricing(inputs)),
  );
});
