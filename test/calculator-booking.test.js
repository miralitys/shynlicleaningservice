"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const pricing = require("../lib/quote-pricing");
const { createFetchStub, startServer, stopServer } = require("./server-test-helpers");

function bookingControls() {
  const window = { ShynliPricing: pricing };
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/calculator-controls"), "utf8"), { window, URLSearchParams });
  return window.ShynliCalculatorControls;
}

test("moving cabinets default on but remain removable in browser and server pricing", () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/cleaning-pricing"), "utf8"), browser);
  const input = { serviceType: "moving", rooms: 3, bathrooms: 2, squareMeters: 1 };
  const defaults = pricing.PRICING.moving.defaultSelectedServices;
  assert.ok(defaults.includes("insideCabinets"));
  assert.equal(pricing.PRICING.moving.includedServices.includes("insideCabinets"), false);
  assert.deepEqual(pricing.PRICING.regular.defaultSelectedServices, []);
  assert.deepEqual(pricing.PRICING.deep.defaultSelectedServices, ["baseboardCleaning", "doorsCleaning"]);
  for (const [selection, expected] of [
    [input, 509],
    [{ ...input, services: defaults }, 509],
    [{ ...input, services: defaults.filter(key => key !== "insideCabinets"), cabinetsCondition: "notEmptied" }, 464],
    [{ ...input, cabinetsCondition: "notEmptied" }, 554],
    [{ ...input, services: [] }, 329],
  ]) {
    const server = pricing.roundCustomerQuotePricing(pricing.calculateQuotePricing(selection));
    const client = browser.ShynliPricing.roundCustomerQuotePricing(browser.ShynliPricing.calculateQuotePricing(selection));
    assert.equal(server.totalPrice, expected);
    assert.equal(JSON.stringify(client), JSON.stringify(server));
  }
});

test("customer totals round up after calculation without changing rates or duration", () => {
  for (const [input, expected] of [
    [{ serviceType: "deep", rooms: 4, bathrooms: 3, squareMeters: 1 }, 397],
    [{ serviceType: "regular", frequency: "biweekly", rooms: 3, bathrooms: 3, squareMeters: 1, basementCleaning: true, hasPets: true }, 307],
    [{ serviceType: "regular", frequency: "monthly", rooms: 2, bathrooms: 2, squareMeters: 0 }, 191],
  ]) {
    const raw = pricing.calculateQuotePricing(input);
    const result = pricing.roundCustomerQuotePricing(raw);
    assert.equal(result.totalPrice, expected);
    assert.equal(result.totalPriceCents, expected * 100);
    assert.equal(result.fullPriceBeforeDiscount, expected);
    for (const key of ["durationLabel", "estimatedDurationMinutes", "serviceDurationMinutes"])
      assert.equal(result[key], raw[key]);
    assert.deepEqual(pricing.roundCustomerQuotePricing(result), result);
  }
  assert.equal(pricing.calculateQuotePricing({ serviceType: "deep", rooms: 4, bathrooms: 3, squareMeters: 1 }).totalPrice, 396.5);
});

test("booking handoff preserves every selection but never contact data or a client total", () => {
  const controls = bookingControls();
  for (const serviceType of ["regular", "deep", "moving"]) {
    for (const frequency of ["weekly", "biweekly", "every3weeks", "monthly"]) {
      const input = {
        serviceType, frequency, rooms: 4, bathrooms: 2.5, squareMeters: 3,
        basementCleaning: "yes", hasPets: "yes",
        services: Object.keys(pricing.PRICING.services),
        additionalRooms: { office: 1, sunroom: 2, familyRoom: 3, loft: 4 },
        quantityServices: Object.fromEntries(Object.keys(pricing.PRICING.quantityServices).map((key, i) => [key, i + 1])),
        refrigeratorCondition: "notEmptied", cabinetsCondition: "notEmptied",
        fullAddress: "PRIVATE", phone: "PRIVATE", totalPrice: 1,
      };
      const selection = controls.bookingSelection(input);
      const decoded = controls.readBookingSelection("?calculator=" + encodeURIComponent(JSON.stringify(selection)));
      assert.equal(JSON.stringify(decoded), JSON.stringify(selection));
      assert.deepEqual(pricing.calculateQuotePricing(decoded), pricing.calculateQuotePricing(selection));
      assert.equal(JSON.stringify(decoded).includes("PRIVATE"), false);
      assert.equal(Object.hasOwn(decoded, "totalPrice"), false);
    }
  }
  const empty = controls.readBookingSelection('?calculator=' + encodeURIComponent(JSON.stringify({ serviceType: "deep", services: [] })));
  assert.deepEqual(Array.from(empty.services), []);
  for (const search of ["", "?calculator=bad", "?calculator=null", '?calculator={"serviceType":"bad"}', "?calculator=" + "a".repeat(8001)])
    assert.equal(controls.readBookingSelection(search), null);
});

test("public submission returns and signs the rounded price", async () => {
  const stub = createFetchStub([{ method: "POST", match: "/contacts/", status: 200, body: { contact: { id: "calculator-test-contact" } } }]);
  const server = await startServer({ env: { GHL_API_KEY: "test", GHL_LOCATION_ID: "test", GHL_ENABLE_NOTES: "0", GHL_CREATE_OPPORTUNITY: "0", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry } });
  try {
    const quote = { serviceType: "deep", rooms: 4, bathrooms: 3, squareMeters: 1, selectedDate: "2026-12-01", selectedTime: "09:00", fullAddress: "123 Test St, Naperville, IL 60540", zipCode: "60540", consent: true };
    for (const [selection, expected] of [
      [quote, 397],
      [{ ...quote, serviceType: "moving", rooms: 3, bathrooms: 2 }, 509],
      [{ ...quote, serviceType: "moving", rooms: 3, bathrooms: 2, services: pricing.PRICING.moving.defaultSelectedServices.filter(key => key !== "insideCabinets") }, 464],
    ]) {
      const response = await fetch(server.baseUrl + "/api/quote/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact: { fullName: "Test Calculator", phone: "2025550142" }, quote: selection }) });
      assert.equal(response.status, 201);
      const result = await response.json();
      assert.equal(result.pricing.totalPrice, expected);
      assert.equal(result.pricing.totalPriceCents, expected * 100);
      const token = require("../lib/quote-token").verifyQuoteToken(result.quoteToken, { env: { GHL_API_KEY: "test" } });
      assert.equal(token.totalPriceCents, expected * 100);
    }
  } finally {
    await stopServer(server.child);
    stub.cleanup();
  }
});

async function assertLedgerQuote(quote, expectedTotal) {
  const { createApiHandlers } = require("../lib/api/handlers");
  let recorded;
  let response;
  const handler = createApiHandlers({
    QUOTE_PUBLIC_PATH: "/quote", SITE_ORIGIN: "https://example.test",
    calculateQuotePricing: pricing.calculateQuotePricing,
    normalizeString: (value, max) => String(value || "").trim().slice(0, max),
    enforcePostRateLimit: () => false,
    readJsonBody: async () => ({ contact: { fullName: "Test Calculator", phone: "2025550142" }, quote }),
    getLeadConnectorClient: () => ({ submitQuoteSubmission: async () => ({ ok: true, status: 201 }) }),
    applyOrderEntryUpdates: entry => ({ ...entry }),
    createQuoteToken: () => "",
    writeJsonWithTiming: (_res, status, body) => { response = { status, body }; },
  });
  await handler.handleQuoteSubmissionRequest({ method: "POST", headers: {}, url: "/api/quote/submit", socket: {} }, {}, 0n, {}, { log() {} }, {
    recordSubmission: async entry => { recorded = entry; return { ...entry, id: "test-order" }; },
  });
  assert.equal(response.status, 201);
  const expected = pricing.roundCustomerQuotePricing(pricing.calculateQuotePricing(quote));
  if (expectedTotal !== undefined) assert.equal(expected.totalPrice, expectedTotal);
  assert.equal(recorded.totalPrice, expected.totalPrice);
  assert.equal(recorded.totalPriceCents, expected.totalPriceCents);
  const saved = recorded.payloadForRetry.calculatorData;
  for (const key of ["services", "additionalRooms", "quantityServices", "refrigeratorCondition", "cabinetsCondition", "rooms", "bathrooms", "squareMeters", "hasPets", "basementCleaning", "serviceDurationMinutes", "totalPrice"])
    assert.deepEqual(saved[key], expected[key], key);
}

test("the order ledger receives every selected extra and the rounded total, not the submitted amount", async () => {
  await assertLedgerQuote({
    serviceType: "deep", rooms: 4, bathrooms: 3, squareMeters: 1,
    services: ["doorsCleaning", "refrigeratorCleaning", "insideCabinets", "ovenCleaning", "rangeHood"],
    refrigeratorCondition: "notEmptied", cabinetsCondition: "notEmptied",
    additionalRooms: { office: 1, sunroom: 2, familyRoom: 1, loft: 1 },
    quantityServices: Object.fromEntries(Object.keys(pricing.PRICING.quantityServices).map(key => [key, 2])),
    hasPets: true, basementCleaning: true, totalPrice: 1,
    selectedDate: "2026-12-01", selectedTime: "09:00", zipCode: "60540", fullAddress: "123 Test St, Naperville, IL 60540", consent: true,
  });
});

test("moving order records keep the selected cabinets and the matching $509 or $464 total", async () => {
  const quote = {
    serviceType: "moving", rooms: 3, bathrooms: 2, squareMeters: 1, hasPets: false, basementCleaning: false, totalPrice: 1,
    selectedDate: "2026-12-01", selectedTime: "09:00", zipCode: "60540", fullAddress: "123 Test St, Naperville, IL 60540", consent: true,
  };
  await assertLedgerQuote(quote, 509);
  await assertLedgerQuote({ ...quote, services: pricing.PRICING.moving.defaultSelectedServices.filter(key => key !== "insideCabinets") }, 464);
});
