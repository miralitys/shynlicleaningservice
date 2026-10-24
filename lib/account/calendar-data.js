"use strict";

function normalizeString(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function getAccountAdminOrderData(item = {}) {
  const payload = item && item.entry && item.entry.payloadForRetry && typeof item.entry.payloadForRetry === "object"
    ? item.entry.payloadForRetry : {};
  return payload.adminOrder && typeof payload.adminOrder === "object"
    ? payload.adminOrder
    : payload.orderState && typeof payload.orderState === "object" ? payload.orderState : {};
}

function getAccountOrderStatus(item = {}) {
  const normalized = String(getAccountAdminOrderData(item).status || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "scheduled") return "scheduled";
  if (normalized === "in-progress" || normalized === "en-route") return "en-route";
  if (normalized === "cleaning-started") return "cleaning-started";
  if (normalized === "checklist") return "checklist";
  if (normalized === "photo" || normalized === "photos") return "cleaning-complete";
  if (normalized === "cleaning-complete") return "cleaning-complete";
  if (normalized === "rescheduled") return "rescheduled";
  if (normalized === "invoice-sent") return "invoice-sent";
  if (normalized === "paid") return "paid";
  if (normalized === "awaiting-review") return "awaiting-review";
  if (normalized === "completed") return "completed";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  return "new";
}

function isAccountCalendarOrderVisible(item = {}) {
  const assignmentStatus = normalizeString(item && item.assignmentStatus, 32).toLowerCase();
  if (assignmentStatus === "canceled" || assignmentStatus === "cancelled") return false;
  return getAccountOrderStatus(item) !== "canceled";
}

function getAccountTodayDateValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const byType = new Map(parts.map(part => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function normalizeAccountCalendarDate(value) {
  const normalized = normalizeString(value, 32);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function getAccountCalendarOrderDate(item = {}) {
  return normalizeAccountCalendarDate(
    item.scheduleDate || (item.entry && item.entry.selectedDate) || (item.assignment && item.assignment.scheduleDate)
  );
}

function selectAccountCalendarEntries({ entries, assignments, calendarDate, getOrderSelectedDate, isOrderCreatedEntry, detailMode = "month" }) {
  const date = normalizeAccountCalendarDate(calendarDate) || getAccountTodayDateValue();
  const month = date.slice(0, 7);
  const byEntryId = new Map(assignments.map(assignment => [assignment.entryId, assignment]));
  const selected = [];
  const orderCountByDate = {};
  let assignmentCount = 0;
  for (const entry of entries) {
    if (!isOrderCreatedEntry(entry)) continue;
    const assignment = byEntryId.get(entry.id);
    const item = {
      entry, assignment, assignmentStatus: assignment ? assignment.status : "planned",
      scheduleDate: normalizeString((assignment && assignment.scheduleDate) || getOrderSelectedDate(entry), 32),
    };
    if (!isAccountCalendarOrderVisible(item)) continue;
    assignmentCount++;
    const orderDate = getAccountCalendarOrderDate(item);
    if (!orderDate.startsWith(month)) continue;
    orderCountByDate[orderDate] = (orderCountByDate[orderDate] || 0) + 1;
    if (detailMode === "month" || (detailMode === "day" && orderDate === date)) selected.push(entry);
  }
  return { entries: selected, assignmentCount, calendarDate: date, orderCountByDate };
}

module.exports = {
  getAccountAdminOrderData, getAccountOrderStatus, isAccountCalendarOrderVisible,
  getAccountTodayDateValue, normalizeAccountCalendarDate, getAccountCalendarOrderDate,
  selectAccountCalendarEntries,
};
