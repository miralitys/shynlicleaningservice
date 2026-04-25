"use strict";

const DEFAULT_TIME_ZONE = "America/Chicago";
const AUTO_CONFIRM_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeCleanerConfirmationStatus(value, fallback = "pending") {
  const normalized = normalizeString(value, 32).toLowerCase();
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "declined") return "declined";
  return fallback === "confirmed" || fallback === "declined" ? fallback : "pending";
}

function buildCleanerConfirmationSignature(entry = {}, assignment = {}) {
  return [
    normalizeString(assignment.scheduleDate || entry.selectedDate, 32),
    normalizeString(assignment.scheduleTime || entry.selectedTime, 32),
    normalizeString(entry.fullAddress, 500),
    normalizeString(entry.serviceName, 120),
  ].join("|");
}

function getTimeZoneParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const output = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    output[part.type] = part.value;
  }
  return output;
}

function getTimeZoneOffsetMinutes(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtcTimestamp = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtcTimestamp - date.getTime()) / 60000);
}

function localDateTimeToInstant(dateValue, timeValue, timeZone = DEFAULT_TIME_ZONE) {
  const normalizedDate = normalizeString(dateValue, 32);
  const normalizedTime = normalizeString(timeValue, 32);
  if (!normalizedDate || !normalizedTime) return null;

  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizedTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const baseUtcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let offsetMinutes = getTimeZoneOffsetMinutes(new Date(baseUtcTimestamp), timeZone);
  let utcTimestamp = baseUtcTimestamp - offsetMinutes * 60 * 1000;
  const adjustedOffsetMinutes = getTimeZoneOffsetMinutes(new Date(utcTimestamp), timeZone);
  if (adjustedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = adjustedOffsetMinutes;
    utcTimestamp = baseUtcTimestamp - offsetMinutes * 60 * 1000;
  }

  return {
    date: new Date(utcTimestamp),
    localDate: normalizedDate,
    localTime: normalizedTime,
  };
}

function getOrderCleanerConfirmation(entry = {}) {
  const payload =
    entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
      ? entry.payloadForRetry
      : {};
  const adminOrder =
    payload.adminOrder && typeof payload.adminOrder === "object"
      ? payload.adminOrder
      : payload.orderState && typeof payload.orderState === "object"
        ? payload.orderState
        : {};
  const raw =
    adminOrder.cleanerConfirmation && typeof adminOrder.cleanerConfirmation === "object"
      ? adminOrder.cleanerConfirmation
      : {};
  const byStaffId = {};
  const rawByStaffId =
    raw.byStaffId && typeof raw.byStaffId === "object" ? raw.byStaffId : {};

  Object.entries(rawByStaffId).forEach(([staffId, record]) => {
    const normalizedStaffId = normalizeString(staffId, 120);
    if (!normalizedStaffId || !record || typeof record !== "object") return;
    byStaffId[normalizedStaffId] = {
      status: normalizeCleanerConfirmationStatus(record.status),
      respondedAt: normalizeString(record.respondedAt, 80),
    };
  });

  return {
    signature: normalizeString(raw.signature, 500),
    byStaffId,
    updatedAt: normalizeString(raw.updatedAt, 80),
  };
}

function isCleanerAutoConfirmed(entry = {}, assignment = {}, options = {}) {
  const dateValue = normalizeString(assignment.scheduleDate || entry.selectedDate, 32);
  const timeValue = normalizeString(assignment.scheduleTime || entry.selectedTime, 32);
  const schedule = localDateTimeToInstant(dateValue, timeValue, options.timeZone || DEFAULT_TIME_ZONE);
  if (!schedule || !schedule.date || Number.isNaN(schedule.date.getTime())) {
    return false;
  }

  const nowValue = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = nowValue.getTime();
  if (Number.isNaN(nowMs)) return false;

  return schedule.date.getTime() - nowMs <= AUTO_CONFIRM_WINDOW_MS;
}

function buildCleanerConfirmationUpdate(entry = {}, assignment = {}, staffId = "", status = "pending") {
  const normalizedStaffId = normalizeString(staffId, 120);
  if (!normalizedStaffId) return null;

  const nextStatus = normalizeCleanerConfirmationStatus(status);
  const signature = buildCleanerConfirmationSignature(entry, assignment);
  const current = getOrderCleanerConfirmation(entry);
  const timestamp = new Date().toISOString();
  const nextByStaffId =
    current.signature === signature && current.byStaffId && typeof current.byStaffId === "object"
      ? { ...current.byStaffId }
      : {};

  nextByStaffId[normalizedStaffId] = {
    status: nextStatus,
    respondedAt: timestamp,
  };

  return {
    signature,
    byStaffId: nextByStaffId,
    updatedAt: timestamp,
  };
}

function getStaffCleanerConfirmationState(entry = {}, assignment = {}, staffId = "", options = {}) {
  const normalizedStaffId = normalizeString(staffId, 120);
  if (!normalizedStaffId) {
    return {
      status: "pending",
      automatic: false,
      respondedAt: "",
    };
  }

  const current = getOrderCleanerConfirmation(entry);
  const signature = buildCleanerConfirmationSignature(entry, assignment);
  if (!signature || current.signature !== signature) {
    return isCleanerAutoConfirmed(entry, assignment, options)
      ? {
          status: "confirmed",
          automatic: true,
          respondedAt: "",
        }
      : {
          status: "pending",
          automatic: false,
          respondedAt: "",
        };
  }

  const record = current.byStaffId && current.byStaffId[normalizedStaffId];
  const explicitStatus = normalizeCleanerConfirmationStatus(record && record.status);
  if (explicitStatus === "confirmed" || explicitStatus === "declined") {
    return {
      status: explicitStatus,
      automatic: false,
      respondedAt: normalizeString(record && record.respondedAt, 80),
    };
  }

  if (isCleanerAutoConfirmed(entry, assignment, options)) {
    return {
      status: "confirmed",
      automatic: true,
      respondedAt: "",
    };
  }

  return {
    status: "pending",
    automatic: false,
    respondedAt: normalizeString(record && record.respondedAt, 80),
  };
}

function getStaffCleanerConfirmationStatus(entry = {}, assignment = {}, staffId = "", options = {}) {
  return getStaffCleanerConfirmationState(entry, assignment, staffId, options).status;
}

function getCleanerConfirmationDisplay(entry = {}, assignment = {}, options = {}) {
  const staffIds = Array.isArray(assignment && assignment.staffIds)
    ? assignment.staffIds.map((staffId) => normalizeString(staffId, 120)).filter(Boolean)
    : [];
  if (staffIds.length === 0) return null;

  const states = staffIds.map((staffId) =>
    getStaffCleanerConfirmationState(entry, assignment, staffId, options)
  );
  if (states.some((state) => state.status === "declined")) {
    return {
      key: "declined",
      label: "Не подтвердил",
      tone: "danger",
      confirmed: false,
      declined: true,
      pending: false,
    };
  }

  if (states.length > 0 && states.every((state) => state.status === "confirmed")) {
    return {
      key: "confirmed",
      label: "Подтверждено",
      tone: "success",
      confirmed: true,
      declined: false,
      pending: false,
    };
  }

  return {
    key: "pending",
    label: "Ждёт подтверждения",
    tone: "outline",
    confirmed: false,
    declined: false,
    pending: true,
  };
}

module.exports = {
  AUTO_CONFIRM_WINDOW_MS,
  buildCleanerConfirmationSignature,
  buildCleanerConfirmationUpdate,
  getCleanerConfirmationDisplay,
  getOrderCleanerConfirmation,
  getStaffCleanerConfirmationState,
  getStaffCleanerConfirmationStatus,
  isCleanerAutoConfirmed,
  localDateTimeToInstant,
  normalizeCleanerConfirmationStatus,
};
