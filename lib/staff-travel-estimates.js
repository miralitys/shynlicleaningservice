"use strict";

const GOOGLE_ROUTE_MATRIX_ENDPOINT =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const TRAVEL_TIME_BUFFER_MINUTES = 5;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeTravelStatus(value) {
  const normalized = normalizeString(value, 40).toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "missing-origin" ||
    normalized === "missing-destination" ||
    normalized === "same-place" ||
    normalized === "not-configured" ||
    normalized === "unavailable"
  ) {
    return normalized;
  }
  return "unavailable";
}

function parseGoogleDurationSeconds(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.round(Number(value)));
  const normalized = normalizeString(value, 40);
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)s$/);
  if (!match) return 0;
  return Math.max(0, Math.round(Number(match[1])));
}

function formatTravelDuration(seconds) {
  const durationSeconds = Number(seconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "";
  const bufferedSeconds = durationSeconds + TRAVEL_TIME_BUFFER_MINUTES * 60;
  const totalMinutes = Math.max(1, Math.round(bufferedSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  return `${totalMinutes} min`;
}

function formatTravelDistance(meters) {
  const distanceMeters = Number(meters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return "";
  const miles = distanceMeters / 1609.344;
  if (miles >= 10) return `${Math.round(miles)} mi`;
  if (miles >= 1) return `${miles.toFixed(1).replace(/\.0$/, "")} mi`;
  return `${Math.round(distanceMeters * 3.28084)} ft`;
}

function buildTravelEstimateLabel(record = {}) {
  const status = normalizeTravelStatus(record.status);
  if (status !== "ok") return "";
  const durationText =
    normalizeString(record.durationText, 80) || formatTravelDuration(record.durationSeconds);
  const distanceText =
    normalizeString(record.distanceText, 80) || formatTravelDistance(record.distanceMeters);
  return [durationText, distanceText].filter(Boolean).join(" • ");
}

function sanitizeTravelEstimateRecord(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const staffId = normalizeString(source.staffId, 120);
  const status = normalizeTravelStatus(source.status);
  const durationSeconds = Math.max(0, Math.round(Number(source.durationSeconds) || 0));
  const distanceMeters = Math.max(0, Math.round(Number(source.distanceMeters) || 0));
  const record = {
    staffId,
    staffName: normalizeString(source.staffName, 120),
    originAddress: normalizeString(source.originAddress, 500),
    destinationAddress: normalizeString(source.destinationAddress, 500),
    sourceType: normalizeString(source.sourceType, 40) || "home",
    sourceLabel: normalizeString(source.sourceLabel, 80) || "Из дома",
    departureTimestamp: Math.max(0, Math.round(Number(source.departureTimestamp) || 0)),
    status,
    durationSeconds,
    distanceMeters,
    durationText: normalizeString(source.durationText, 80),
    distanceText: normalizeString(source.distanceText, 80),
    label: normalizeString(source.label, 120),
    error: normalizeString(source.error, 240),
    calculatedAt: normalizeString(source.calculatedAt, 80),
  };

  if (!record.label) {
    record.label = buildTravelEstimateLabel(record);
  }
  return record;
}

function sanitizeTravelEstimateRecords(records = []) {
  const items = Array.isArray(records) ? records : [];
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const record = sanitizeTravelEstimateRecord(item);
    if (!record.staffId) continue;
    const key = record.staffId;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(record);
    if (output.length >= 12) break;
  }
  return output;
}

function getTravelEstimateForStaff(records = [], staffId = "") {
  const normalizedStaffId = normalizeString(staffId, 120);
  if (!normalizedStaffId) return null;
  return (
    sanitizeTravelEstimateRecords(records).find((record) => record.staffId === normalizedStaffId) ||
    null
  );
}

function toScheduleTimestamp(dateValue, timeValue) {
  const normalizedDate = normalizeString(dateValue, 32);
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const [, year, month, day] = match;
  const timeMatch = normalizeString(timeValue, 32).match(/^(\d{1,2}):(\d{2})/);
  const hours = timeMatch ? Number(timeMatch[1]) : 12;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, 0);
}

function resolveRouteUnavailableReason(error) {
  const message = normalizeString(
    (error && (error.message || error.status || error.code)) || error,
    500
  ).toLowerCase();
  if (!message) return "маршрут недоступен";
  if (
    message.includes("routes api") &&
    (message.includes("not enabled") ||
      message.includes("disabled") ||
      message.includes("has not been used"))
  ) {
    return "включите Routes API в Google Cloud";
  }
  if (message.includes("request_denied") || message.includes("api key") || message.includes("referer")) {
    return "ключ Google Maps не имеет доступа к Routes API";
  }
  if (message.includes("billing")) return "для Routes API нужен включённый billing";
  if (message.includes("route_not_found") || message.includes("zero_results")) {
    return "маршрут не найден";
  }
  return "маршрут недоступен";
}

function pickRouteMatrixItem(body) {
  if (Array.isArray(body)) return body[0] || null;
  if (body && Array.isArray(body.elements)) return body.elements[0] || null;
  return (
    body &&
    body.matrix &&
    body.matrix.rows &&
    body.matrix.rows[0] &&
    body.matrix.rows[0].items &&
    body.matrix.rows[0].items[0]
  ) || null;
}

function createBaseTravelEstimate(input = {}) {
  return sanitizeTravelEstimateRecord({
    staffId: input.staffId,
    staffName: input.staffName,
    originAddress: input.originAddress,
    destinationAddress: input.destinationAddress,
    sourceType: input.sourceType || "home",
    sourceLabel: input.sourceLabel || "Из дома",
    departureTimestamp: input.departureTimestamp,
    calculatedAt: new Date().toISOString(),
  });
}

function createStaffTravelEstimateService(options = {}) {
  const googleMapsApiKey = normalizeString(
    options.googleMapsApiKey || options.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY,
    4096
  );
  const fetchImpl = options.fetch || global.fetch;

  async function calculateTravelEstimate(input = {}) {
    const base = createBaseTravelEstimate(input);
    const originAddress = normalizeString(base.originAddress, 500);
    const destinationAddress = normalizeString(base.destinationAddress, 500);

    if (!destinationAddress) {
      return sanitizeTravelEstimateRecord({ ...base, status: "missing-destination" });
    }
    if (!originAddress) {
      return sanitizeTravelEstimateRecord({ ...base, status: "missing-origin" });
    }
    if (originAddress.toLowerCase() === destinationAddress.toLowerCase()) {
      return sanitizeTravelEstimateRecord({
        ...base,
        status: "same-place",
        durationSeconds: 0,
        distanceMeters: 0,
      });
    }
    if (!googleMapsApiKey || typeof fetchImpl !== "function") {
      return sanitizeTravelEstimateRecord({
        ...base,
        status: "not-configured",
        error: "Google Routes API key is not configured.",
      });
    }

    try {
      const body = {
        origins: [{ waypoint: { address: originAddress } }],
        destinations: [{ waypoint: { address: destinationAddress } }],
        travelMode: "DRIVE",
        units: "IMPERIAL",
      };

      const departureTimestamp = Number(base.departureTimestamp);
      if (Number.isFinite(departureTimestamp) && departureTimestamp > Date.now() - 15 * 60 * 1000) {
        body.routingPreference = "TRAFFIC_AWARE";
        body.departureTime = new Date(departureTimestamp).toISOString();
      }

      const response = await fetchImpl(GOOGLE_ROUTE_MATRIX_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleMapsApiKey,
          "X-Goog-FieldMask":
            "originIndex,destinationIndex,status,condition,distanceMeters,duration,staticDuration",
        },
        body: JSON.stringify(body),
      });
      const responseText = await response.text();
      const responseBody = responseText ? JSON.parse(responseText) : null;

      if (!response.ok) {
        const message =
          responseBody && responseBody.error && responseBody.error.message
            ? responseBody.error.message
            : `Google Routes API returned ${response.status}`;
        throw new Error(message);
      }

      const item = pickRouteMatrixItem(responseBody);
      const routeExists =
        item &&
        (
          item.condition === "ROUTE_EXISTS" ||
          (!item.condition && (item.duration || item.staticDuration || item.distanceMeters))
        );
      if (!routeExists) {
        return sanitizeTravelEstimateRecord({
          ...base,
          status: "unavailable",
          error:
            item && item.status && item.status.message
              ? item.status.message
              : item && item.condition === "ROUTE_NOT_FOUND"
                ? "маршрут не найден"
                : "маршрут недоступен",
        });
      }

      const durationSeconds =
        parseGoogleDurationSeconds(item.duration) ||
        parseGoogleDurationSeconds(item.staticDuration) ||
        Math.round(Number(item.durationMillis || item.staticDurationMillis) / 1000) ||
        0;
      const distanceMeters = Math.round(Number(item.distanceMeters) || 0);
      const durationText = formatTravelDuration(durationSeconds);
      const distanceText = formatTravelDistance(distanceMeters);

      return sanitizeTravelEstimateRecord({
        ...base,
        status: "ok",
        durationSeconds,
        distanceMeters,
        durationText,
        distanceText,
        label: [durationText, distanceText].filter(Boolean).join(" • "),
      });
    } catch (error) {
      return sanitizeTravelEstimateRecord({
        ...base,
        status: "unavailable",
        error: resolveRouteUnavailableReason(error),
      });
    }
  }

  async function buildAssignmentTravelEstimates(input = {}) {
    const entry = input.entry && typeof input.entry === "object" ? input.entry : {};
    const assignment = input.assignment && typeof input.assignment === "object" ? input.assignment : {};
    const staffRecords = Array.isArray(input.staffRecords) ? input.staffRecords : [];
    const staffById = new Map(staffRecords.map((record) => [normalizeString(record && record.id, 120), record]));
    const staffIds = Array.isArray(assignment.staffIds) ? assignment.staffIds : [];
    const scheduleDate = normalizeString(
      assignment.scheduleDate || input.scheduleDate || entry.selectedDate,
      32
    );
    const scheduleTime = normalizeString(
      assignment.scheduleTime || input.scheduleTime || entry.selectedTime,
      32
    );
    const destinationAddress = normalizeString(
      input.destinationAddress || entry.fullAddress || entry.address,
      500
    );
    const departureTimestamp = toScheduleTimestamp(scheduleDate, scheduleTime);
    const estimates = [];

    for (const staffId of staffIds) {
      const normalizedStaffId = normalizeString(staffId, 120);
      const staffRecord = staffById.get(normalizedStaffId);
      if (!normalizedStaffId || !staffRecord) continue;
      estimates.push(
        await calculateTravelEstimate({
          staffId: normalizedStaffId,
          staffName: staffRecord.name,
          originAddress: staffRecord.address,
          destinationAddress,
          sourceType: "home",
          sourceLabel: "Из дома",
          departureTimestamp,
        })
      );
    }

    return sanitizeTravelEstimateRecords(estimates);
  }

  return {
    buildAssignmentTravelEstimates,
    calculateTravelEstimate,
    googleMapsApiKeyConfigured: Boolean(googleMapsApiKey),
  };
}

module.exports = {
  TRAVEL_TIME_BUFFER_MINUTES,
  buildTravelEstimateLabel,
  createStaffTravelEstimateService,
  formatTravelDistance,
  formatTravelDuration,
  getTravelEstimateForStaff,
  sanitizeTravelEstimateRecord,
  sanitizeTravelEstimateRecords,
};
