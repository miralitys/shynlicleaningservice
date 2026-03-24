"use strict";

const PRICING = Object.freeze({
  regular: Object.freeze({
    basePrices: Object.freeze({
      weekly: 101,
      biweekly: 111,
      monthly: 121,
    }),
    roomPrice: 12,
    firstBathroomPrice: 22,
    bathroomStepPrice: 12,
    bathroomStepSize: 0.5,
    squareFeetStepPrice: 20,
    basementCleaningFee: 45,
    includedServices: Object.freeze([]),
  }),
  deep: Object.freeze({
    basePrice: 84.5,
    roomPrice: 22.5,
    firstBathroomPrice: 45,
    bathroomStepPrice: 22.5,
    bathroomStepSize: 0.5,
    squareFeetStepPrice: 20,
    basementCleaningFee: 65,
    includedServices: Object.freeze(["baseboardCleaning", "doorsCleaning"]),
  }),
  moving: Object.freeze({
    basePrice: 129.5,
    roomPrice: 22.5,
    firstBathroomPrice: 45,
    bathroomStepPrice: 22.5,
    bathroomStepSize: 0.5,
    squareFeetStepPrice: 20,
    basementCleaningFee: 65,
    includedServices: Object.freeze([
      "ovenCleaning",
      "refrigeratorCleaning",
      "baseboardCleaning",
      "doorsCleaning",
    ]),
  }),
  squareFeetIncluded: 1200,
  squareFeetStep: 500,
  squareFeetStepPrice: 20,
  services: Object.freeze({
    ovenCleaning: 45,
    refrigeratorCleaning: 45,
    baseboardCleaning: 22,
    doorsCleaning: 22,
    insideCabinets: 45,
    rangeHood: 22,
    furniturePolishing: 20,
  }),
  quantityServices: Object.freeze({
    interiorWindowsCleaning: 6,
    blindsCleaning: 8,
    bedLinenChange: 8,
  }),
});

const SERVICE_TYPE_NAMES = Object.freeze({
  regular: "Regular Cleaning",
  deep: "Deep Cleaning",
  moving: "Move In/Move Out Clean",
});
const ALLOWED_ROOM_COUNTS = new Set([1, 2, 3, 4, 5]);
const ALLOWED_BATHROOM_COUNTS = new Set([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
const ALLOWED_SQUARE_FEET_BUCKETS = Object.freeze([950, 1600, 2250, 2750, 3250, 3750, 4500, 5500, 6500]);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeInteger(value, fallback = 0, min = 0, max = 9999) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function normalizeBoolean(value) {
  if (value === true) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "1" || normalized === "on";
}

function parseBathroomCount(value, fallback = 0) {
  const rawValue = String(value ?? "").trim().replace(",", ".");
  if (!rawValue) return fallback;
  if (rawValue.endsWith("+")) {
    const base = Number.parseFloat(rawValue.slice(0, -1));
    return Number.isFinite(base) ? base + 0.5 : fallback;
  }
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRoomCount(value) {
  const parsed = normalizeInteger(value, 1, 1, 5);
  return ALLOWED_ROOM_COUNTS.has(parsed) ? parsed : 1;
}

function normalizeBathroomCount(value) {
  const parsed = parseBathroomCount(value, 1);
  return ALLOWED_BATHROOM_COUNTS.has(parsed) ? parsed : 1;
}

function normalizeSquareFeetBucket(value) {
  const parsed = normalizeInteger(value, 0, 0, ALLOWED_SQUARE_FEET_BUCKETS[ALLOWED_SQUARE_FEET_BUCKETS.length - 1]);
  if (parsed <= 0) return 0;

  for (const bucket of ALLOWED_SQUARE_FEET_BUCKETS) {
    if (parsed <= bucket) return bucket;
  }

  return ALLOWED_SQUARE_FEET_BUCKETS[ALLOWED_SQUARE_FEET_BUCKETS.length - 1];
}

function normalizeServiceType(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  if (normalized === "deep" || normalized === "moving") return normalized;
  return "regular";
}

function normalizeFrequency(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  if (normalized === "weekly" || normalized === "monthly" || normalized === "biweekly") return normalized;
  return "biweekly";
}

function normalizeServiceList(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      list
        .map((entry) => normalizeString(entry, 64))
        .filter((entry) => entry && Object.prototype.hasOwnProperty.call(PRICING.services, entry))
    )
  );
}

function normalizeQuantityServices(rawValue) {
  const quantitySource = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue : {};
  return {
    interiorWindowsCleaning: normalizeInteger(quantitySource.interiorWindowsCleaning, 0, 0, 200),
    blindsCleaning: normalizeInteger(quantitySource.blindsCleaning, 0, 0, 200),
    bedLinenChange: normalizeInteger(quantitySource.bedLinenChange, 0, 0, 200),
  };
}

function normalizeQuotePricingInput(rawInput = {}) {
  const quote = rawInput.calculatorData || rawInput.quote || rawInput;
  const serviceType = normalizeServiceType(quote.serviceType);

  return {
    serviceType,
    frequency: normalizeFrequency(quote.frequency),
    rooms: normalizeRoomCount(quote.rooms),
    bathrooms: normalizeBathroomCount(quote.bathrooms),
    squareMeters: normalizeSquareFeetBucket(quote.squareMeters),
    basementCleaning: normalizeBoolean(quote.basementCleaning),
    services: normalizeServiceList(quote.services),
    quantityServices: normalizeQuantityServices(quote.quantityServices),
    selectedDate: normalizeString(quote.selectedDate, 32),
    selectedTime: normalizeString(quote.selectedTime, 32),
    formattedDateTime: normalizeString(quote.formattedDateTime, 120),
    address: normalizeString(quote.address, 500),
    fullAddress: normalizeString(quote.fullAddress, 500),
    addressLine2: normalizeString(quote.addressLine2, 200),
    city: normalizeString(quote.city, 120),
    state: normalizeString(quote.state, 32),
    zipCode: normalizeString(quote.zipCode, 32),
  };
}

function getRegularBasePrice(frequency) {
  const normalizedFrequency = normalizeFrequency(frequency);
  return PRICING.regular.basePrices[normalizedFrequency] ?? PRICING.regular.basePrices.biweekly;
}

function calculateBedroomPrice(serviceType, rooms) {
  const typePricing = PRICING[serviceType] || PRICING.regular;
  return rooms * (typePricing.roomPrice || 0);
}

function calculateBathroomPrice(typePricing, bathrooms) {
  if (!bathrooms || bathrooms <= 0) return 0;
  const firstBathroomPrice = typePricing.firstBathroomPrice ?? 0;
  const bathroomStepPrice = typePricing.bathroomStepPrice ?? typePricing.bathroomPrice ?? 0;
  const bathroomStepSize = typePricing.bathroomStepSize ?? 0.5;

  if (bathrooms <= 1) return firstBathroomPrice;

  return firstBathroomPrice + Math.max(0, (bathrooms - 1) / bathroomStepSize) * bathroomStepPrice;
}

function calculateSquareFeetPrice(typePricing, squareFeet) {
  if (squareFeet <= PRICING.squareFeetIncluded) return 0;
  const extraSquareFeet = squareFeet - PRICING.squareFeetIncluded;
  const extraSteps = Math.ceil(extraSquareFeet / PRICING.squareFeetStep);
  const stepPrice =
    typePricing.squareFeetStepPrice !== undefined
      ? typePricing.squareFeetStepPrice
      : PRICING.squareFeetStepPrice;

  return extraSteps * stepPrice;
}

function getBasementCleaningFee(serviceType) {
  const typePricing = PRICING[serviceType] || PRICING.regular;
  return typePricing.basementCleaningFee ?? 0;
}

function calculateQuotePricing(rawInput = {}) {
  const quote = normalizeQuotePricingInput(rawInput);
  const typePricing = PRICING[quote.serviceType] || PRICING.regular;
  const includedServices = typePricing.includedServices || [];

  let total = quote.serviceType === "regular" ? getRegularBasePrice(quote.frequency) : typePricing.basePrice;

  total += calculateBedroomPrice(quote.serviceType, quote.rooms);
  total += calculateBathroomPrice(typePricing, quote.bathrooms);
  total += calculateSquareFeetPrice(typePricing, quote.squareMeters);

  if (quote.basementCleaning) {
    total += getBasementCleaningFee(quote.serviceType);
  }

  for (const service of quote.services) {
    if (!includedServices.includes(service)) {
      total += PRICING.services[service] || 0;
    }
  }

  for (const [serviceKey, quantity] of Object.entries(quote.quantityServices)) {
    total += quantity * (PRICING.quantityServices[serviceKey] || 0);
  }

  const totalPrice = Number(total.toFixed(2));

  return {
    ...quote,
    includedServices: [...includedServices],
    totalPrice,
    totalPriceCents: Math.round(totalPrice * 100),
    currency: "usd",
    serviceName: SERVICE_TYPE_NAMES[quote.serviceType] || "Cleaning Service",
  };
}

module.exports = {
  ALLOWED_BATHROOM_COUNTS,
  ALLOWED_ROOM_COUNTS,
  ALLOWED_SQUARE_FEET_BUCKETS,
  PRICING,
  SERVICE_TYPE_NAMES,
  calculateQuotePricing,
  calculateBathroomPrice,
  calculateBedroomPrice,
  calculateSquareFeetPrice,
  getBasementCleaningFee,
  getRegularBasePrice,
  normalizeQuotePricingInput,
};
