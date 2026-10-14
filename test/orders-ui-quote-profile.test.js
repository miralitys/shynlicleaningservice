"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrdersUiQuoteHelpers } = require("../lib/admin/pages/orders-ui-quote-helpers");
const { getOrderQuoteData } = createOrdersUiQuoteHelpers();

test("order quote fields inherit missing values from the matching saved client address", () => {
  const order = { entry: { fullAddress: "100 Test St, USA", payloadForRetry: {
    calculatorData: { totalPrice: 220, serviceType: "standard", frequency: "monthly" },
    adminClient: { addressBook: [
      { address: "200 Other St, USA", roomCount: "9" },
      { address: "100 Test St, США", roomCount: "3", bathroomCount: "2.5", squareFootage: "1800",
        pets: "dog", notes: "Call on arrival", basementCleaning: "no" },
    ] },
  } } };
  const before = structuredClone(order);
  assert.deepEqual(getOrderQuoteData(order), { totalPrice: 220, serviceType: "standard", frequency: "monthly",
    rooms: "3", bathrooms: "2.5", squareMeters: "1800", hasPets: "dog", additionalDetails: "Call on arrival", basementCleaning: "no" });
  assert.deepEqual(order, before);
});

test("explicit order values including zero and false are never replaced", () => {
  const data = { rooms: 0, bathrooms: "1", squareMeters: "2", hasPets: false, additionalDetails: "Visit-specific instruction" };
  const order = { entry: { fullAddress: "A", payloadForRetry: { calculatorData: data,
    adminClient: { addressBook: [{ address: "A", roomCount: 4, bathroomCount: 3, squareFootage: 2500, pets: "dog", notes: "Other" }] } } } };
  assert.deepEqual(getOrderQuoteData(order), data);
});

test("unmatched and missing visit addresses never borrow parameters from another home", () => {
  for (const fullAddress of ["B", ""]) {
    assert.deepEqual(getOrderQuoteData({ entry: { fullAddress, payloadForRetry: {
      adminClient: { addressBook: [{ address: "A", roomCount: 4 }] } } } }), {});
  }
});
