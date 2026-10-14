"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { insideCleaningRequest, withoutServicePrice } = require("../lib/quote-service-display");

test("an appliance condition alone does not order a cleaning service", () => {
  assert.equal(insideCleaningRequest({ cabinetsCondition: "emptied" }, "insideCabinets"), "Не заказано");
  assert.equal(insideCleaningRequest({ refrigeratorCondition: "notEmptied" }, "refrigeratorCleaning"), "Не заказано");
});
test("selected cabinet and refrigerator tasks explicitly describe work without prices", () => {
  assert.equal(insideCleaningRequest({ services: ["insideCabinets"], cabinetsCondition: "emptied" }, "insideCabinets"), "Убрать внутри; освобождены");
  assert.equal(insideCleaningRequest({ extras: ["insideFridge"], refrigeratorCondition: "notEmptied" }, "refrigeratorCleaning"), "Убрать внутри; вещи/продукты не убраны");
  assert.equal(withoutServicePrice("Dishwasher Cleaning ($30)"), "Dishwasher Cleaning");
});
