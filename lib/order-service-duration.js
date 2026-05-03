"use strict";

const MAX_SERVICE_DURATION_MINUTES = 24 * 60;

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeOrderServiceDurationMinutes(value, fallback = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return clampNumber(Math.floor(numericValue), 0, MAX_SERVICE_DURATION_MINUTES);
}

function buildOrderServiceDurationMinutes(hoursValue, minutesValue) {
  const hours = clampNumber(Math.floor(Number(hoursValue) || 0), 0, 24);
  const minutes = clampNumber(Math.floor(Number(minutesValue) || 0), 0, 59);
  return normalizeOrderServiceDurationMinutes(hours * 60 + minutes, 0);
}

function splitOrderServiceDurationMinutes(value) {
  const normalized = normalizeOrderServiceDurationMinutes(value, 0);
  return {
    hours: Math.floor(normalized / 60),
    minutes: normalized % 60,
  };
}

function formatOrderServiceDurationLabel(value) {
  const normalized = normalizeOrderServiceDurationMinutes(value, 0);
  if (!normalized) return "Не указана";

  const { hours, minutes } = splitOrderServiceDurationMinutes(normalized);
  if (hours && minutes) return `${hours} ч ${minutes} мин`;
  if (hours) return `${hours} ч`;
  return `${minutes} мин`;
}

module.exports = {
  buildOrderServiceDurationMinutes,
  formatOrderServiceDurationLabel,
  normalizeOrderServiceDurationMinutes,
  splitOrderServiceDurationMinutes,
};
