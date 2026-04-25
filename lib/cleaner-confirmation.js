"use strict";

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

function getStaffCleanerConfirmationStatus(entry = {}, assignment = {}, staffId = "") {
  const normalizedStaffId = normalizeString(staffId, 120);
  if (!normalizedStaffId) return "pending";

  const current = getOrderCleanerConfirmation(entry);
  const signature = buildCleanerConfirmationSignature(entry, assignment);
  if (!signature || current.signature !== signature) {
    return "pending";
  }

  const record = current.byStaffId && current.byStaffId[normalizedStaffId];
  return normalizeCleanerConfirmationStatus(record && record.status);
}

function getCleanerConfirmationDisplay(entry = {}, assignment = {}) {
  const staffIds = Array.isArray(assignment && assignment.staffIds)
    ? assignment.staffIds.map((staffId) => normalizeString(staffId, 120)).filter(Boolean)
    : [];
  if (staffIds.length === 0) return null;

  const current = getOrderCleanerConfirmation(entry);
  const signature = buildCleanerConfirmationSignature(entry, assignment);
  if (!signature || current.signature !== signature) {
    return {
      key: "not-confirmed",
      label: "Не подтверждено клинером",
      tone: "outline",
      confirmed: false,
      declined: false,
      pending: true,
    };
  }

  const responses = staffIds.map((staffId) => current.byStaffId[staffId] || null);
  if (responses.some((record) => record && record.status === "declined")) {
    return {
      key: "not-confirmed",
      label: "Не подтверждено клинером",
      tone: "danger",
      confirmed: false,
      declined: true,
      pending: false,
    };
  }

  if (responses.length > 0 && responses.every((record) => record && record.status === "confirmed")) {
    return {
      key: "confirmed",
      label: "Подтверждено клинером",
      tone: "success",
      confirmed: true,
      declined: false,
      pending: false,
    };
  }

  return {
    key: "not-confirmed",
    label: "Не подтверждено клинером",
    tone: "outline",
    confirmed: false,
    declined: false,
    pending: true,
  };
}

module.exports = {
  buildCleanerConfirmationSignature,
  buildCleanerConfirmationUpdate,
  getCleanerConfirmationDisplay,
  getOrderCleanerConfirmation,
  getStaffCleanerConfirmationStatus,
  normalizeCleanerConfirmationStatus,
};
