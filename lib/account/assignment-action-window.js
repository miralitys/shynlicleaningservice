"use strict";

const { localDateTimeToInstant } = require("../cleaner-confirmation");

const DEFAULT_TIME_ZONE = "America/Chicago";
const EN_ROUTE_ACTION_WINDOW_MS = 2 * 60 * 60 * 1000;

function normalizeString(value, maxLength = 0) {
  const stringValue = value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function getAssignmentScheduleDateTime(source = {}) {
  const entry = source && source.entry && typeof source.entry === "object" ? source.entry : {};
  const assignment =
    source && source.assignment && typeof source.assignment === "object" ? source.assignment : {};
  const adminOrder =
    source && source.adminOrder && typeof source.adminOrder === "object" ? source.adminOrder : {};

  return {
    dateValue: normalizeString(
      source.scheduleDate || assignment.scheduleDate || adminOrder.selectedDate || entry.selectedDate,
      32
    ),
    timeValue: normalizeString(
      source.scheduleTime || assignment.scheduleTime || adminOrder.selectedTime || entry.selectedTime,
      32
    ),
  };
}

function getAssignmentScheduleInstant(source = {}, options = {}) {
  const { dateValue, timeValue } = getAssignmentScheduleDateTime(source);
  const schedule = localDateTimeToInstant(
    dateValue,
    timeValue,
    normalizeString(options.timeZone, 80) || DEFAULT_TIME_ZONE
  );
  const scheduleDate = schedule && schedule.date instanceof Date ? schedule.date : null;
  if (!scheduleDate || Number.isNaN(scheduleDate.getTime())) return null;
  return scheduleDate;
}

function getEnRouteActionWindowState(source = {}, options = {}) {
  const windowMs = Number.isFinite(Number(options.windowMs))
    ? Math.max(0, Number(options.windowMs))
    : EN_ROUTE_ACTION_WINDOW_MS;
  const scheduleDate = getAssignmentScheduleInstant(source, options);
  const nowDate = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = nowDate.getTime();
  if (!Number.isFinite(nowMs)) {
    return {
      allowed: false,
      reason: "invalid-now",
      windowMs,
      windowHours: windowMs / (60 * 60 * 1000),
    };
  }
  if (!scheduleDate) {
    return {
      allowed: false,
      reason: "missing-schedule",
      nowMs,
      windowMs,
      windowHours: windowMs / (60 * 60 * 1000),
    };
  }

  const scheduleAtMs = scheduleDate.getTime();
  const availableAtMs = scheduleAtMs - windowMs;
  const allowed = nowMs >= availableAtMs;
  return {
    allowed,
    reason: allowed ? "available" : "too-early",
    nowMs,
    scheduleAtMs,
    availableAtMs,
    windowMs,
    windowHours: windowMs / (60 * 60 * 1000),
    minutesUntilAvailable: allowed ? 0 : Math.ceil((availableAtMs - nowMs) / (60 * 1000)),
  };
}

module.exports = {
  DEFAULT_TIME_ZONE,
  EN_ROUTE_ACTION_WINDOW_MS,
  getAssignmentScheduleDateTime,
  getAssignmentScheduleInstant,
  getEnRouteActionWindowState,
};
