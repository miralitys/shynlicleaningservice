"use strict";

const crypto = require("node:crypto");

const DEFAULT_STAFF_UNAVAILABLE_SUMMARY = "Не может выйти на работу";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeStaffAvailabilityDate(value) {
  const normalized = normalizeString(value, 32);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeStaffAvailabilityTime(value) {
  const normalized = normalizeString(value, 16);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return "";
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getStaffAvailabilityTimeMinutes(value) {
  const normalized = normalizeStaffAvailabilityTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseStaffAvailabilityDate(value) {
  const normalized = normalizeStaffAvailabilityDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysToStaffAvailabilityDate(value, days) {
  const baseDate = parseStaffAvailabilityDate(value);
  if (!baseDate) return "";
  const next = new Date(baseDate.getTime());
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}

function getStaffAvailabilityStartMs(dateValue) {
  const date = parseStaffAvailabilityDate(dateValue);
  if (!date) return 0;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0);
}

function sanitizeStaffAvailabilityBlock(input = {}) {
  if (!input || typeof input !== "object") return null;
  const date = normalizeStaffAvailabilityDate(input.date || input.startDate || input.scheduleDate);
  if (!date) return null;
  const endDate =
    normalizeStaffAvailabilityDate(input.endDate) ||
    addDaysToStaffAvailabilityDate(date, 1);
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  const summary =
    normalizeString(input.summary || input.reason || input.title, 180) ||
    DEFAULT_STAFF_UNAVAILABLE_SUMMARY;
  const startMs = getStaffAvailabilityStartMs(date);
  const requestedStartTime = normalizeStaffAvailabilityTime(input.startTime);
  const requestedEndTime = normalizeStaffAvailabilityTime(input.endTime);
  const startTimeMinutes = getStaffAvailabilityTimeMinutes(requestedStartTime);
  const endTimeMinutes = getStaffAvailabilityTimeMinutes(requestedEndTime);
  const explicitlyAllDay =
    input.allDay === true || String(input.allDay || "").toLowerCase() === "true";
  const wantsTimeRange =
    !explicitlyAllDay &&
    (
      normalizeString(input.mode || input.availabilityMode, 32).toLowerCase() === "time-range" ||
      input.allDay === false ||
      String(input.allDay || "").toLowerCase() === "false" ||
      Boolean(requestedStartTime && requestedEndTime)
    );
  const hasValidTimeRange =
    wantsTimeRange &&
    Number.isInteger(startTimeMinutes) &&
    Number.isInteger(endTimeMinutes) &&
    endTimeMinutes > startTimeMinutes;
  const allDay = !hasValidTimeRange;
  const blockStartMs = allDay ? startMs : startMs + startTimeMinutes * 60 * 1000;
  const blockEndMs = allDay
    ? getStaffAvailabilityStartMs(endDate) || startMs + 24 * 60 * 60 * 1000
    : startMs + endTimeMinutes * 60 * 1000;

  return {
    id:
      normalizeString(input.id, 160) ||
      `manual-unavailable-${date}-${crypto.randomUUID()}`,
    source: normalizeString(input.source, 40).toLowerCase() || "manual",
    date,
    summary,
    notes: normalizeString(input.notes || input.comment, 500),
    allDay,
    startTime: allDay ? "" : requestedStartTime,
    endTime: allDay ? "" : requestedEndTime,
    startDate: date,
    endDate,
    startMs: blockStartMs,
    endMs: blockEndMs,
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
  };
}

function sanitizeStaffAvailabilityBlocks(blocks = []) {
  const sourceItems = Array.isArray(blocks) ? blocks : blocks ? [blocks] : [];
  const byDate = new Map();

  for (const item of sourceItems) {
    const block = sanitizeStaffAvailabilityBlock(item);
    if (!block) continue;
    byDate.set(block.date, block);
  }

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function upsertStaffAvailabilityBlock(blocks = [], input = {}) {
  const nextBlock = sanitizeStaffAvailabilityBlock({
    ...input,
    source: input.source || "manual",
    updatedAt: new Date().toISOString(),
  });
  if (!nextBlock) return sanitizeStaffAvailabilityBlocks(blocks);

  return sanitizeStaffAvailabilityBlocks([
    ...sanitizeStaffAvailabilityBlocks(blocks).filter((block) => block.date !== nextBlock.date),
    nextBlock,
  ]);
}

function removeStaffAvailabilityBlock(blocks = [], dateValue = "") {
  const date = normalizeStaffAvailabilityDate(dateValue);
  if (!date) return sanitizeStaffAvailabilityBlocks(blocks);
  return sanitizeStaffAvailabilityBlocks(blocks).filter((block) => block.date !== date);
}

function doesStaffAvailabilityBlockCoverDate(block, dateValue) {
  const date = normalizeStaffAvailabilityDate(dateValue);
  const startDate = normalizeStaffAvailabilityDate(block && (block.startDate || block.date));
  const endDate = normalizeStaffAvailabilityDate(block && block.endDate);
  if (!date || !startDate) return false;
  return date >= startDate && (!endDate || date < endDate);
}

function findStaffAvailabilityConflicts(
  staffRecords = [],
  staffIds = [],
  scheduleDate = "",
  scheduleTime = "",
  serviceDurationMinutes = 0
) {
  const date = normalizeStaffAvailabilityDate(scheduleDate);
  if (!date) return [];
  const scheduleStartMinutes = getStaffAvailabilityTimeMinutes(scheduleTime);
  const normalizedDurationMinutes = Number(serviceDurationMinutes);
  const scheduleEndMinutes = Number.isInteger(scheduleStartMinutes)
    ? scheduleStartMinutes +
      (Number.isFinite(normalizedDurationMinutes) && normalizedDurationMinutes > 0
        ? normalizedDurationMinutes
        : 1)
    : null;
  const targetStaffIds = new Set((Array.isArray(staffIds) ? staffIds : []).map((id) => normalizeString(id, 120)).filter(Boolean));
  if (!targetStaffIds.size) return [];

  return (Array.isArray(staffRecords) ? staffRecords : [])
    .filter((record) => record && targetStaffIds.has(normalizeString(record.id, 120)))
    .map((record) => {
      const blocks = sanitizeStaffAvailabilityBlocks(record.availabilityBlocks || record.manualAvailabilityBlocks);
      const block = blocks.find((candidate) => {
        if (!doesStaffAvailabilityBlockCoverDate(candidate, date)) return false;
        if (candidate.allDay) return true;
        const blockStartMinutes = getStaffAvailabilityTimeMinutes(candidate.startTime);
        const blockEndMinutes = getStaffAvailabilityTimeMinutes(candidate.endTime);
        if (
          !Number.isInteger(scheduleStartMinutes) ||
          !Number.isInteger(scheduleEndMinutes) ||
          !Number.isInteger(blockStartMinutes) ||
          !Number.isInteger(blockEndMinutes)
        ) {
          return true;
        }
        return scheduleStartMinutes < blockEndMinutes && scheduleEndMinutes > blockStartMinutes;
      });
      if (!block) return null;
      return {
        staffId: record.id,
        name: normalizeString(record.name || record.fullName, 120) || "Сотрудник",
        date,
        label: block.summary || DEFAULT_STAFF_UNAVAILABLE_SUMMARY,
        block,
      };
    })
    .filter(Boolean);
}

module.exports = {
  DEFAULT_STAFF_UNAVAILABLE_SUMMARY,
  addDaysToStaffAvailabilityDate,
  doesStaffAvailabilityBlockCoverDate,
  findStaffAvailabilityConflicts,
  getStaffAvailabilityTimeMinutes,
  normalizeStaffAvailabilityDate,
  normalizeStaffAvailabilityTime,
  removeStaffAvailabilityBlock,
  sanitizeStaffAvailabilityBlock,
  sanitizeStaffAvailabilityBlocks,
  upsertStaffAvailabilityBlock,
};
