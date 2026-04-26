"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatTravelEstimateUnavailableText,
} = require("../lib/staff-travel-estimates");

test("formats unavailable travel estimate reasons for cleaner and admin UI", () => {
  const routeNotFound = {
    status: "unavailable",
    error: "ROUTE_NOT_FOUND",
  };
  assert.equal(formatTravelEstimateUnavailableText(routeNotFound), "маршрут не найден");

  const apiKeyError = {
    status: "unavailable",
    error: "API key not authorized for Routes API",
  };
  assert.equal(formatTravelEstimateUnavailableText(apiKeyError), "карты временно недоступны");
  assert.equal(
    formatTravelEstimateUnavailableText(apiKeyError, { technical: true }),
    "API key not authorized for Routes API"
  );
});
