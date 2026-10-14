"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { insideCleaningRequest, withoutServicePrice, buildAddonSummary } = require("../lib/quote-service-display");

test("an appliance condition alone does not order a cleaning service", () => {
  assert.equal(insideCleaningRequest({ cabinetsCondition: "emptied" }, "insideCabinets"), "Не заказано");
  assert.equal(insideCleaningRequest({ refrigeratorCondition: "notEmptied" }, "refrigeratorCleaning"), "Не заказано");
});

test("addon summary combines selected extras and positive counts without prices or empty options", () => {
  const labels = { interiorWindowsWithTracks: "Окна внутри с направляющими ($8)", blindsCleaning: "Blinds Cleaning",
    slidingDoorInterior: "Двери изнутри ($12)", chandelierCleaning: "Люстра ($65)" };
  assert.deepEqual(buildAddonSummary({ quantityServices: { interiorWindowsWithTracks: 3, blindsCleaning: 2,
    slidingDoorInterior: 0, chandelierCleaning: -1 } }, ["Inside Cabinets Cleaning", "Inside Cabinets Cleaning"], labels),
    ["Шкафы внутри", "Окна внутри с направляющими — 3", "Жалюзи — 2"]);
  assert.deepEqual(buildAddonSummary({ cabinetsCondition: "emptied", quantityServices: { blindsCleaning: 0 } }, [], labels), []);
  assert.deepEqual(buildAddonSummary({ basementCleaning: "yes" }, [], labels), ["Подвал"]);
});
test("selected cabinet and refrigerator tasks explicitly describe work without prices", () => {
  assert.equal(insideCleaningRequest({ services: ["insideCabinets"], cabinetsCondition: "emptied" }, "insideCabinets"), "Убрать внутри; освобождены");
  assert.equal(insideCleaningRequest({ extras: ["insideFridge"], refrigeratorCondition: "notEmptied" }, "refrigeratorCleaning"), "Убрать внутри; вещи/продукты не убраны");
  assert.equal(withoutServicePrice("Dishwasher Cleaning ($30)"), "Dishwasher Cleaning");
});
