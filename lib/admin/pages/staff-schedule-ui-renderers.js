"use strict";

const {
  formatTravelEstimateUnavailableText,
} = require("../../staff-travel-estimates");

function createStaffScheduleUiHelpers(deps = {}) {
  const {
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    ASSIGNMENT_STATUS_VALUES,
    STAFF_COMPENSATION_OPTIONS,
    STAFF_TEAM_CALENDAR_DAYS,
    STAFF_TEAM_CALENDAR_FUTURE_DAYS,
    STAFF_TEAM_CALENDAR_PAST_DAYS,
    STAFF_TEAM_CALENDAR_TIME_ZONE,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminClockTime,
    formatCurrencyAmount,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    formatW9FederalTaxClassificationLabel,
    formatW9TinTypeLabel,
    formatWorkspaceRoleLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getEntrySmsHistoryEntries,
    getStaffSmsHistoryEntries,
    getRequestUrl,
    inferWorkspaceRoleValue,
    buildAdminRedirectPath,
    isAdminLinkedUser,
    normalizeAdminOrderDateInput,
    normalizeAdminOrderTimeInput,
    normalizeString,
    renderAdminSelectOptions,
    renderAdminBadge,
    renderAdminClientInfoGrid,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminGhlSmsComposer,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminToggleIconButton,
    renderAssignmentStatusBadge,
    renderQuoteOpsStatusBadge,
    renderStaffStatusBadge,
    STAFF_STATUS_VALUES,
    USER_ROLE_VALUES,
  } = deps;

function getStaffCalendarTodayDateValue() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const values = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
}
function normalizeStaffCalendarDateValue(value) {
  const normalized = normalizeString(value, 32);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}
function parseStaffCalendarDate(value) {
  const normalized = normalizeStaffCalendarDateValue(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}
function addDaysToStaffCalendarDate(value, days) {
  const baseDate = parseStaffCalendarDate(value);
  if (!baseDate) return getStaffCalendarTodayDateValue();
  const next = new Date(baseDate.getTime());
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}
function addMonthsToStaffCalendarDate(value, months) {
  const baseDate = parseStaffCalendarDate(value);
  if (!baseDate) return getStaffCalendarTodayDateValue();
  const target = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + Number(months || 0), 1, 12, 0, 0));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12, 0, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(baseDate.getUTCDate(), lastDayOfTargetMonth));
  return target.toISOString().slice(0, 10);
}
function getStaffCalendarInclusiveDayCount(startDateValue, endDateValue) {
  const startDate = parseStaffCalendarDate(startDateValue);
  const endDate = parseStaffCalendarDate(endDateValue);
  if (!startDate || !endDate || endDate < startDate) return 1;
  return Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}
function getStaffCalendarMonthStartDate(value) {
  const baseDate = parseStaffCalendarDate(value);
  if (!baseDate) return getStaffCalendarTodayDateValue();
  return new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 12, 0, 0)).toISOString().slice(0, 10);
}
function getStaffCalendarMonthEndDate(value) {
  const baseDate = parseStaffCalendarDate(value);
  if (!baseDate) return getStaffCalendarTodayDateValue();
  return new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0, 12, 0, 0)).toISOString().slice(0, 10);
}
function getStaffCalendarMondayWeekStartDate(value) {
  const baseDate = parseStaffCalendarDate(value);
  if (!baseDate) return getStaffCalendarTodayDateValue();
  const mondayOffset = (baseDate.getUTCDay() + 6) % 7;
  return addDaysToStaffCalendarDate(value, -mondayOffset);
}
function getStaffCalendarSundayWeekEndDate(value) {
  const baseDate = parseStaffCalendarDate(value);
  if (!baseDate) return getStaffCalendarTodayDateValue();
  const mondayOffset = (baseDate.getUTCDay() + 6) % 7;
  return addDaysToStaffCalendarDate(value, 6 - mondayOffset);
}
function formatStaffTeamCalendarMonthLabel(anchorDateValue) {
  const date = parseStaffCalendarDate(anchorDateValue);
  if (!date) return "";
  const label = date
    .toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(/\s*г\.$/, "");
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "";
}
function normalizeStaffTeamCalendarView(value) {
  const normalized = normalizeString(value, 24).toLowerCase();
  if (normalized === "day") return "day";
  if (normalized === "month") return "month";
  return "week";
}
function getStaffTeamCalendarAssignmentStatusTone(status) {
  const normalized = normalizeString(status, 32).toLowerCase();
  if (
    normalized === "confirmed" ||
    normalized === "completed" ||
    normalized === "issue" ||
    normalized === "canceled"
  ) {
    return normalized;
  }
  return "planned";
}
function getStaffTeamCalendarView(reqUrl) {
  return normalizeStaffTeamCalendarView(reqUrl && reqUrl.searchParams
    ? reqUrl.searchParams.get("calendarView")
    : "");
}
function getStaffTeamCalendarViewDayCount(view) {
  const normalizedView = normalizeStaffTeamCalendarView(view);
  if (normalizedView === "day") return 1;
  if (normalizedView === "month") return 42;
  return 14;
}
function getStaffTeamCalendarNavigationDayStep(view) {
  const normalizedView = normalizeStaffTeamCalendarView(view);
  if (normalizedView === "month") return 0;
  return getStaffTeamCalendarViewDayCount(normalizedView);
}
function buildStaffTeamCalendarWindow(anchorDateValue, view = "week") {
  const anchorDate = normalizeStaffCalendarDateValue(anchorDateValue) || getStaffCalendarTodayDateValue();
  const normalizedView = normalizeStaffTeamCalendarView(view);
  const monthStartDate = normalizedView === "month" ? getStaffCalendarMonthStartDate(anchorDate) : "";
  const monthEndDate = normalizedView === "month" ? getStaffCalendarMonthEndDate(anchorDate) : "";
  const firstDate = normalizedView === "month"
    ? getStaffCalendarMondayWeekStartDate(monthStartDate)
    : anchorDate;
  const lastDate = normalizedView === "month" ? getStaffCalendarSundayWeekEndDate(monthEndDate) : "";
  const dayCount = normalizedView === "month"
    ? getStaffCalendarInclusiveDayCount(firstDate, lastDate)
    : getStaffTeamCalendarViewDayCount(view);
  return Array.from({ length: dayCount }, (_, index) => {
    const dateValue = addDaysToStaffCalendarDate(firstDate, index);
    const date = parseStaffCalendarDate(dateValue) || new Date();
    const startMs = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0
    );
    const endMs = startMs + (24 * 60 * 60 * 1000);
    return {
      dateValue,
      startMs,
      endMs,
      weekdayLabel: date.toLocaleDateString("ru-RU", {
        weekday: "short",
        timeZone: "UTC",
      }),
      dateLabel: date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    };
  });
}
function buildStaffTeamCalendarMonthScrollWindows(anchorDateValue) {
  const normalizedAnchorDate = normalizeStaffCalendarDateValue(anchorDateValue) || getStaffCalendarTodayDateValue();
  const anchorMonthStartDate = getStaffCalendarMonthStartDate(normalizedAnchorDate);
  return [-1, 0, 1].map((monthOffset) => {
    const monthStartDate = addMonthsToStaffCalendarDate(anchorMonthStartDate, monthOffset);
    return {
      monthOffset,
      monthStartDate,
      label: formatStaffTeamCalendarMonthLabel(monthStartDate),
      days: buildStaffTeamCalendarWindow(monthStartDate, "month"),
      isAnchorMonth: monthOffset === 0,
    };
  });
}
function formatStaffTeamCalendarRangeLabel(days) {
  if (!Array.isArray(days) || days.length === 0) return "";
  const firstDate = parseStaffCalendarDate(days[0].dateValue);
  const lastDate = parseStaffCalendarDate(days[days.length - 1].dateValue);
  if (!firstDate || !lastDate) return "";
  if (days.length === 1 || days[0].dateValue === days[days.length - 1].dateValue) {
    return firstDate.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `${firstDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })} - ${lastDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}
function getStaffTeamCalendarStartDate(reqUrl) {
  return normalizeStaffCalendarDateValue(reqUrl.searchParams.get("calendarStart")) || getStaffCalendarTodayDateValue();
}
const STAFF_TEAM_CALENDAR_COLOR_PALETTE = [
  { color: "#2563eb", soft: "#eff6ff", border: "#bfdbfe", text: "#1e3a8a" },
  { color: "#0f766e", soft: "#ecfdf5", border: "#99f6e4", text: "#134e4a" },
  { color: "#9e435a", soft: "#fff1f5", border: "#fbcfe8", text: "#831843" },
  { color: "#7c3aed", soft: "#f5f3ff", border: "#ddd6fe", text: "#4c1d95" },
  { color: "#ca8a04", soft: "#fefce8", border: "#fde68a", text: "#713f12" },
  { color: "#0891b2", soft: "#ecfeff", border: "#a5f3fc", text: "#164e63" },
  { color: "#dc2626", soft: "#fef2f2", border: "#fecaca", text: "#7f1d1d" },
  { color: "#16a34a", soft: "#f0fdf4", border: "#bbf7d0", text: "#14532d" },
];

function getStaffTeamCalendarColorMapKey(staffSummary = {}, staffIndex = 0) {
  const stableKey = normalizeString(staffSummary.id || staffSummary.email || staffSummary.name, 240);
  return `${stableKey || "staff"}:${Number.isFinite(Number(staffIndex)) ? Number(staffIndex) : 0}`;
}

function normalizeStaffTeamCalendarHexColor(value) {
  const normalized = normalizeString(value, 32);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : "";
}

function getStaffTeamCalendarGeneratedColor(colorIndex = 0) {
  const safeIndex = Math.max(0, Number.parseInt(String(colorIndex || 0), 10) || 0);
  const hue = ((safeIndex * 137.508 + 214) % 360).toFixed(3).replace(/\.?0+$/, "");
  const saturation = 68 + (safeIndex % 4) * 4;
  const lightness = 42 + (Math.floor(safeIndex / 4) % 3) * 4;
  return {
    color: `hsl(${hue} ${saturation}% ${lightness}%)`,
    soft: `hsl(${hue} 92% 97%)`,
    border: `hsl(${hue} 68% 84%)`,
    text: `hsl(${hue} 72% 28%)`,
  };
}

function getStaffTeamCalendarPaletteColor(colorIndex = 0) {
  const safeIndex = Math.max(0, Number.parseInt(String(colorIndex || 0), 10) || 0);
  return STAFF_TEAM_CALENDAR_COLOR_PALETTE[safeIndex] ||
    getStaffTeamCalendarGeneratedColor(safeIndex - STAFF_TEAM_CALENDAR_COLOR_PALETTE.length);
}

function getStaffTeamCalendarColor(staffSummary = {}, staffIndex = 0) {
  const explicitColor = normalizeString(
    staffSummary.calendarColor || staffSummary.color || staffSummary.staffColor,
    32
  );
  const explicitHexColor = normalizeStaffTeamCalendarHexColor(explicitColor);
  if (explicitHexColor) {
    return {
      color: explicitHexColor,
      soft: "#f8fafc",
      border: "#cbd5e1",
      text: explicitHexColor,
    };
  }

  return getStaffTeamCalendarPaletteColor(staffIndex);
}

function getStaffTeamCalendarColorSignature(color = {}) {
  return normalizeString(color.color, 64).toLowerCase();
}

function buildStaffTeamCalendarColorMap(staffSummaries = []) {
  const colorMap = new Map();
  const usedColors = new Set();
  let paletteIndex = 0;

  (Array.isArray(staffSummaries) ? staffSummaries : []).forEach((staffSummary, staffIndex) => {
    const explicitHexColor = normalizeStaffTeamCalendarHexColor(
      staffSummary && (staffSummary.calendarColor || staffSummary.color || staffSummary.staffColor)
    );
    let color = explicitHexColor
      ? {
          color: explicitHexColor,
          soft: "#f8fafc",
          border: "#cbd5e1",
          text: explicitHexColor,
        }
      : null;

    if (!color || usedColors.has(getStaffTeamCalendarColorSignature(color))) {
      let attempts = 0;
      do {
        color = getStaffTeamCalendarPaletteColor(paletteIndex);
        paletteIndex += 1;
        attempts += 1;
      } while (usedColors.has(getStaffTeamCalendarColorSignature(color)) && attempts < 1000);
    }

    usedColors.add(getStaffTeamCalendarColorSignature(color));
    colorMap.set(getStaffTeamCalendarColorMapKey(staffSummary, staffIndex), color);
  });

  return colorMap;
}

function getStaffTeamCalendarMappedColor(staffSummary = {}, staffIndex = 0, colorMap = null) {
  if (colorMap instanceof Map) {
    const mappedColor = colorMap.get(getStaffTeamCalendarColorMapKey(staffSummary, staffIndex));
    if (mappedColor) return mappedColor;
  }
  return getStaffTeamCalendarColor(staffSummary, staffIndex);
}

function renderStaffTeamCalendarColorVars(staffSummary = {}, staffIndex = 0, colorMap = null) {
  const color = getStaffTeamCalendarMappedColor(staffSummary, staffIndex, colorMap);
  return [
    `--admin-staff-color:${color.color}`,
    `--admin-staff-color-soft:${color.soft}`,
    `--admin-staff-color-border:${color.border}`,
    `--admin-staff-color-text:${color.text}`,
  ].join(";");
}
function getStaffTeamCalendarWorkloadCount(staffSummary = {}, days = []) {
  const dateValues = new Set((Array.isArray(days) ? days : []).map((day) => day && day.dateValue).filter(Boolean));
  if (!dateValues.size || !Array.isArray(staffSummary.assignedOrders)) return 0;
  return staffSummary.assignedOrders.filter((item) => dateValues.has(item && item.scheduleDate)).length;
}
function doesStaffTeamCalendarBlockCoverDay(block, day) {
  if (!block || !day) return false;
  if (block.allDay && block.startDate) {
    const startDate = normalizeStaffCalendarDateValue(block.startDate);
    const endDate = normalizeStaffCalendarDateValue(block.endDate);
    if (!startDate) return false;
    return day.dateValue >= startDate && (!endDate || day.dateValue < endDate);
  }
  const startMs = Number(block.startMs);
  const endMs = Number(block.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return startMs < day.endMs && endMs > day.startMs;
}
function getStaffTeamCalendarDayAssignments(staffSummary = {}, day = {}) {
  return Array.isArray(staffSummary.assignedOrders)
    ? staffSummary.assignedOrders
        .filter((item) => item && item.scheduleDate === day.dateValue)
        .sort((left, right) => {
          const leftTimestamp = Number.isFinite(left.scheduleTimestamp) ? left.scheduleTimestamp : Number.MAX_SAFE_INTEGER;
          const rightTimestamp = Number.isFinite(right.scheduleTimestamp) ? right.scheduleTimestamp : Number.MAX_SAFE_INTEGER;
          return leftTimestamp - rightTimestamp;
        })
    : [];
}
function getStaffTeamCalendarUnavailableBlocks(staffSummary = {}, day = {}) {
  return Array.isArray(staffSummary.calendarAvailabilityBlocks)
    ? staffSummary.calendarAvailabilityBlocks.filter((block) => doesStaffTeamCalendarBlockCoverDay(block, day))
    : [];
}
function isStaffTeamCalendarCellEmpty(staffSummary = {}, day = {}) {
  return (
    getStaffTeamCalendarDayAssignments(staffSummary, day).length === 0 &&
    getStaffTeamCalendarUnavailableBlocks(staffSummary, day).length === 0
  );
}
function renderStaffTeamCalendarAssignmentEntry(orderItem) {
  const customerName =
    orderItem.entry.customerName ||
    orderItem.entry.fullAddress ||
    orderItem.entry.requestId ||
    "Заказ";
  const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
  const timeLabel = normalizeString(orderItem.scheduleTime, 32)
    ? formatAdminClockTime(orderItem.scheduleTime)
    : "Без времени";
  const statusTone = getStaffTeamCalendarAssignmentStatusTone(orderItem.assignmentStatus);

  return `<button
    class="admin-team-calendar-entry admin-team-calendar-entry-button admin-team-calendar-entry-order admin-team-calendar-entry-order-${escapeHtmlAttribute(statusTone)}"
    type="button"
    data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
    aria-label="${escapeHtmlAttribute(`Открыть заказ ${customerName}`)}"
  >
    <div class="admin-team-calendar-entry-head">
      <span class="admin-team-calendar-entry-time">${escapeHtml(timeLabel)}</span>
      <span class="admin-team-calendar-entry-status">${escapeHtml(formatAssignmentStatusLabel(orderItem.assignmentStatus))}</span>
    </div>
    <strong class="admin-team-calendar-entry-title">${escapeHtml(customerName)}</strong>
    <span class="admin-team-calendar-entry-copy">${escapeHtml(
      [
        formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType),
        orderItem.serviceDurationLabel && orderItem.serviceDurationLabel !== "Не указана"
          ? orderItem.serviceDurationLabel
          : "",
      ]
        .filter(Boolean)
        .join(" • ")
    )}</span>
  </button>`;
}
function renderStaffTeamCalendarAvailabilityEntry(block, options = {}) {
  const timeLabel =
    block.allDay || !Number.isFinite(block.startMs)
      ? "All day"
      : new Date(block.startMs).toLocaleTimeString("en-US", {
          timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
  void options;

  return `<article class="admin-team-calendar-entry admin-team-calendar-entry-unavailable">
    <div class="admin-team-calendar-entry-head">
      <span class="admin-team-calendar-entry-time">${escapeHtml(timeLabel)}</span>
      <span class="admin-team-calendar-entry-status">Unavailable</span>
    </div>
    <strong class="admin-team-calendar-entry-title">${escapeHtml(block.summary || "Day off")}</strong>
  </article>`;
}
function renderStaffTeamCalendarCell(staffSummary, day, staffIndex = 0, colorMap = null, options = {}) {
  const assignments = getStaffTeamCalendarDayAssignments(staffSummary, day);
  const unavailableBlocks = getStaffTeamCalendarUnavailableBlocks(staffSummary, day);

  if (!assignments.length && !unavailableBlocks.length) {
    return `<div class="admin-team-calendar-empty" aria-hidden="true">-</div>`;
  }

  return `<div class="admin-team-calendar-cell" style="${escapeHtmlAttribute(renderStaffTeamCalendarColorVars(staffSummary, staffIndex, colorMap))}">
    ${unavailableBlocks.map((block) => renderStaffTeamCalendarAvailabilityEntry(block, options)).join("")}
    ${assignments.map((item) => renderStaffTeamCalendarAssignmentEntry(item)).join("")}
  </div>`;
}
function renderStaffTeamCalendarPath(startDateValue, view) {
  return buildAdminRedirectPath(ADMIN_STAFF_PATH, {
    section: "calendar",
    calendarStart: startDateValue,
    calendarView: normalizeStaffTeamCalendarView(view),
  });
}
function renderStaffTeamCalendarCellMenu(staffSummary, day, options = {}) {
  const staffId = normalizeString(staffSummary && staffSummary.id, 120);
  const staffName = normalizeString(staffSummary && staffSummary.name, 120) || "Сотрудник";
  const availabilityDate = normalizeStaffCalendarDateValue(day && day.dateValue);
  if (!staffId || !availabilityDate) return "";

  const unavailableBlocks = getStaffTeamCalendarUnavailableBlocks(staffSummary, day);
  const manualUnavailableBlock = unavailableBlocks.find(
    (block) => normalizeString(block && block.source, 40).toLowerCase() === "manual"
  );
  const isBusy = unavailableBlocks.length > 0;
  const canToggle = !isBusy || Boolean(manualUnavailableBlock);
  const action = manualUnavailableBlock ? "clear-staff-unavailable-day" : "save-staff-unavailable-day";
  const normalizedView = normalizeStaffTeamCalendarView(options.calendarView);
  const menuLabel = `Действия: ${staffName}, ${availabilityDate}`;

  return `<details class="admin-team-calendar-cell-menu" data-admin-team-calendar-menu="true">
    <summary
      class="admin-team-calendar-cell-menu-trigger"
      data-admin-team-calendar-menu-summary="true"
      aria-label="${escapeHtmlAttribute(menuLabel)}"
      title="Действия"
    >
      <span aria-hidden="true">•••</span>
    </summary>
    <div class="admin-team-calendar-cell-menu-popover">
      ${canToggle
        ? `<form class="admin-team-calendar-busy-form" method="post" action="${escapeHtmlAttribute(ADMIN_STAFF_PATH)}">
          <input type="hidden" name="action" value="${escapeHtmlAttribute(action)}">
          <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffId)}">
          <input type="hidden" name="availabilityDate" value="${escapeHtmlAttribute(availabilityDate)}">
          <input type="hidden" name="availabilityReason" value="Не может выйти на работу">
          <input type="hidden" name="calendarStart" value="${escapeHtmlAttribute(options.calendarStart || availabilityDate)}">
          <input type="hidden" name="calendarView" value="${escapeHtmlAttribute(normalizedView)}">
          <label class="admin-team-calendar-busy-option">
            <input
              type="checkbox"
              name="busy"
              value="1"
              data-admin-team-calendar-busy-checkbox="true"
              ${isBusy ? "checked" : ""}
            >
            <span>Занят</span>
          </label>
        </form>`
        : `<label class="admin-team-calendar-busy-option admin-team-calendar-busy-option-disabled">
          <input type="checkbox" checked disabled>
          <span>Занят</span>
        </label>`}
    </div>
  </details>`;
}
function renderStaffTeamCalendarCleanerHeader(staffSummary, staffIndex, days, lowWorkloadCount, colorMap = null) {
  const workloadCount = getStaffTeamCalendarWorkloadCount(staffSummary, days);
  const isLessLoaded = workloadCount === lowWorkloadCount;
  const colorVars = renderStaffTeamCalendarColorVars(staffSummary, staffIndex, colorMap);

  return `<th
    class="admin-team-calendar-cleaner-col"
    style="${escapeHtmlAttribute(colorVars)}"
    data-admin-team-calendar-cleaner-id="${escapeHtmlAttribute(staffSummary.id || "")}"
    data-admin-team-calendar-load="${escapeHtmlAttribute(String(workloadCount))}"
    ${isLessLoaded ? 'data-admin-team-calendar-low-load="true"' : ""}
  >
    <div class="admin-team-calendar-cleaner-head">
      <span class="admin-team-calendar-cleaner-swatch" aria-hidden="true"></span>
      <span class="admin-team-calendar-cleaner-copy">
        <span class="admin-team-calendar-cleaner-name">${escapeHtml(staffSummary.name || "Сотрудник")}</span>
        <span class="admin-team-calendar-cleaner-role">${escapeHtml(staffSummary.role || "Роль не указана")}</span>
      </span>
      <span class="admin-team-calendar-cleaner-load">${escapeHtml(formatOrderCountLabel(workloadCount))}</span>
    </div>
  </th>`;
}
function renderStaffTeamCalendarDateCell(day, normalizedStartDate, todayDateValue) {
  const isToday = day.dateValue === todayDateValue;
  return `<th
    class="admin-team-calendar-date-col"
    scope="row"
    ${day.dateValue === normalizedStartDate ? 'data-admin-team-calendar-anchor="true"' : ""}
    ${isToday ? 'data-admin-team-calendar-today="true"' : ""}
  >
    <div class="admin-team-calendar-day-head">
      <span class="admin-team-calendar-day-weekday">${escapeHtml(day.weekdayLabel)}</span>
      <span class="admin-team-calendar-day-date">${escapeHtml(day.dateLabel)}</span>
      ${isToday ? '<span class="admin-team-calendar-today-label">сегодня</span>' : ""}
    </div>
  </th>`;
}
function renderStaffTeamCalendarMonthAssignmentEntry(staffSummary, staffIndex, orderItem, colorMap = null, options = {}) {
  const customerName =
    orderItem.entry.customerName ||
    orderItem.entry.fullAddress ||
    orderItem.entry.requestId ||
    "Заказ";
  const staffName = normalizeString(staffSummary && staffSummary.name, 160) || "Клинер";
  const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
  const timeLabel = normalizeString(orderItem.scheduleTime, 32)
    ? formatAdminClockTime(orderItem.scheduleTime)
    : "Без времени";
  const serviceLabel = formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType);
  const statusTone = getStaffTeamCalendarAssignmentStatusTone(orderItem.assignmentStatus);

  return `<button
    class="admin-team-calendar-month-event admin-team-calendar-month-event-${escapeHtmlAttribute(statusTone)}"
    type="button"
    data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
    data-admin-team-calendar-cleaner-id="${escapeHtmlAttribute((staffSummary && staffSummary.id) || "")}"
    ${options.isLessLoaded ? 'data-admin-team-calendar-low-load="true"' : ""}
    style="${escapeHtmlAttribute(renderStaffTeamCalendarColorVars(staffSummary, staffIndex, colorMap))}"
    aria-label="${escapeHtmlAttribute(`Открыть заказ ${customerName}`)}"
  >
    <span class="admin-team-calendar-month-event-dot" aria-hidden="true"></span>
    <span class="admin-team-calendar-month-event-time">${escapeHtml(timeLabel)}</span>
    <strong class="admin-team-calendar-month-event-title">${escapeHtml(customerName)}</strong>
    <span class="admin-team-calendar-month-event-meta">${escapeHtml([staffName, serviceLabel].filter(Boolean).join(" • "))}</span>
  </button>`;
}
function renderStaffTeamCalendarMonthAvailabilityEntry(staffSummary, staffIndex, block, colorMap = null, options = {}) {
  const staffName = normalizeString(staffSummary && staffSummary.name, 160) || "Клинер";
  const timeLabel =
    block.allDay || !Number.isFinite(block.startMs)
      ? "All day"
      : new Date(block.startMs).toLocaleTimeString("en-US", {
          timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

  return `<article
    class="admin-team-calendar-month-event admin-team-calendar-month-event-unavailable"
    data-admin-team-calendar-cleaner-id="${escapeHtmlAttribute((staffSummary && staffSummary.id) || "")}"
    ${options.isLessLoaded ? 'data-admin-team-calendar-low-load="true"' : ""}
    style="${escapeHtmlAttribute(renderStaffTeamCalendarColorVars(staffSummary, staffIndex, colorMap))}"
  >
    <span class="admin-team-calendar-month-event-dot" aria-hidden="true"></span>
    <span class="admin-team-calendar-month-event-time">${escapeHtml(timeLabel)}</span>
    <strong class="admin-team-calendar-month-event-title">${escapeHtml(block.summary || "Day off")}</strong>
    <span class="admin-team-calendar-month-event-meta">${escapeHtml(staffName)}</span>
  </article>`;
}
function renderStaffTeamCalendarMonthDayCell(staffSummaries, day, options = {}) {
  const {
    anchorMonthIndex = -1,
    colorMap = null,
    days = [],
    lowWorkloadCount = 0,
    normalizedStartDate = "",
    todayDateValue = "",
  } = options;
  const date = parseStaffCalendarDate(day.dateValue);
  const isOutsideMonth = !date || date.getUTCMonth() !== anchorMonthIndex;
  const isToday = day.dateValue === todayDateValue;
  const isAnchor = day.dateValue === normalizedStartDate;
  const dayNumberLabel =
    date && date.getUTCDate() === 1
      ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
      : date
        ? String(date.getUTCDate())
        : day.dateLabel;
  const events = [];

  (Array.isArray(staffSummaries) ? staffSummaries : []).forEach((staffSummary, staffIndex) => {
    const workloadCount = getStaffTeamCalendarWorkloadCount(staffSummary, days);
    const isLessLoaded = workloadCount === lowWorkloadCount;
    const assignments = Array.isArray(staffSummary.assignedOrders)
      ? staffSummary.assignedOrders
          .filter((item) => item && item.scheduleDate === day.dateValue)
          .sort((left, right) => {
            const leftTimestamp = Number.isFinite(left.scheduleTimestamp) ? left.scheduleTimestamp : Number.MAX_SAFE_INTEGER;
            const rightTimestamp = Number.isFinite(right.scheduleTimestamp) ? right.scheduleTimestamp : Number.MAX_SAFE_INTEGER;
            return leftTimestamp - rightTimestamp;
          })
      : [];
    assignments.forEach((item) => {
      events.push({
        timestamp: Number.isFinite(item.scheduleTimestamp) ? item.scheduleTimestamp : Number.MAX_SAFE_INTEGER,
        markup: renderStaffTeamCalendarMonthAssignmentEntry(staffSummary, staffIndex, item, colorMap, { isLessLoaded }),
      });
    });

    const unavailableBlocks = Array.isArray(staffSummary.calendarAvailabilityBlocks)
      ? staffSummary.calendarAvailabilityBlocks.filter((block) => doesStaffTeamCalendarBlockCoverDay(block, day))
      : [];
    unavailableBlocks.forEach((block) => {
      events.push({
        timestamp: Number.isFinite(block.startMs) ? block.startMs : 0,
        markup: renderStaffTeamCalendarMonthAvailabilityEntry(staffSummary, staffIndex, block, colorMap, { isLessLoaded }),
      });
    });
  });

  const className = [
    "admin-team-calendar-month-day",
    isOutsideMonth ? "admin-team-calendar-month-day-outside" : "",
    isToday ? "admin-team-calendar-month-day-today" : "",
    isAnchor ? "admin-team-calendar-month-day-anchor" : "",
  ].filter(Boolean).join(" ");

  return `<section
    class="${escapeHtmlAttribute(className)}"
    ${isAnchor ? 'data-admin-team-calendar-anchor="true"' : ""}
    ${isToday ? 'data-admin-team-calendar-today="true"' : ""}
  >
    <div class="admin-team-calendar-month-day-head">
      <span class="admin-team-calendar-month-day-weekday">${escapeHtml(day.weekdayLabel)}</span>
      <span class="admin-team-calendar-month-day-number">${escapeHtml(dayNumberLabel)}</span>
      ${isToday ? '<span class="admin-team-calendar-today-label">сегодня</span>' : ""}
    </div>
    <div class="admin-team-calendar-month-events">
      ${events
        .sort((left, right) => left.timestamp - right.timestamp)
        .map((event) => event.markup)
        .join("")}
    </div>
  </section>`;
}
function renderStaffTeamCalendarMonthGrid(staffSummaries, monthWindows, normalizedStartDate, todayDateValue, colorMap = null, lowWorkloadCount = 0) {
  const weekdayLabels = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

  return `<div class="admin-table-wrap admin-team-calendar-wrap admin-team-calendar-month-wrap" data-admin-team-calendar-scroll="true">
    <div class="admin-team-calendar-month-scroll" data-admin-team-calendar-month="true">
      ${(Array.isArray(monthWindows) ? monthWindows : [])
        .map((monthWindow) => {
          const monthStartDate = normalizeStaffCalendarDateValue(monthWindow && monthWindow.monthStartDate);
          const anchorDate = parseStaffCalendarDate(monthStartDate);
          const anchorMonthIndex = anchorDate ? anchorDate.getUTCMonth() : -1;
          const days = Array.isArray(monthWindow && monthWindow.days) ? monthWindow.days : [];
          return `<section
            class="admin-team-calendar-month-section${monthWindow && monthWindow.isAnchorMonth ? " admin-team-calendar-month-section-current" : ""}"
            data-admin-team-calendar-month-section="${escapeHtmlAttribute(monthWindow && monthWindow.isAnchorMonth ? "current" : "adjacent")}"
            ${monthWindow && monthWindow.isAnchorMonth ? 'data-admin-team-calendar-anchor="true"' : ""}
          >
            <div class="admin-team-calendar-month-section-head">
              <strong>${escapeHtml((monthWindow && monthWindow.label) || formatStaffTeamCalendarMonthLabel(monthStartDate))}</strong>
            </div>
            <div class="admin-team-calendar-month-grid">
              <div class="admin-team-calendar-month-weekdays" aria-hidden="true">
                ${weekdayLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
              </div>
              <div class="admin-team-calendar-month-days">
                ${days
                  .map((day) =>
                    renderStaffTeamCalendarMonthDayCell(staffSummaries, day, {
                      anchorMonthIndex,
                      colorMap,
                      days,
                      lowWorkloadCount,
                      normalizedStartDate,
                      todayDateValue,
                    })
                  )
                  .join("")}
              </div>
            </div>
          </section>`;
        })
        .join("")}
    </div>
  </div>`;
}
function renderStaffTeamCalendarTable(staffSummaries, startDateValue, options = {}) {
  if (!staffSummaries.length) {
    return `<div class="admin-empty-state">Сначала добавьте сотрудников, и здесь появится общий календарь команды.</div>`;
  }

  const normalizedStartDate = normalizeStaffCalendarDateValue(startDateValue) || getStaffCalendarTodayDateValue();
  const view = normalizeStaffTeamCalendarView(options.view);
  const dayStep = getStaffTeamCalendarNavigationDayStep(view);
  const todayDateValue = getStaffCalendarTodayDateValue();
  const monthWindows = view === "month" ? buildStaffTeamCalendarMonthScrollWindows(normalizedStartDate) : [];
  const days = view === "month"
    ? monthWindows.flatMap((monthWindow) => monthWindow.days)
    : buildStaffTeamCalendarWindow(normalizedStartDate, view);
  const colorMap = buildStaffTeamCalendarColorMap(staffSummaries);
  const workloadCounts = staffSummaries.map((staffSummary) => getStaffTeamCalendarWorkloadCount(staffSummary, days));
  const lowWorkloadCount = workloadCounts.length ? Math.min(...workloadCounts) : 0;
  const previousDateValue = view === "month"
    ? addMonthsToStaffCalendarDate(normalizedStartDate, -1)
    : addDaysToStaffCalendarDate(normalizedStartDate, -dayStep);
  const nextDateValue = view === "month"
    ? addMonthsToStaffCalendarDate(normalizedStartDate, 1)
    : addDaysToStaffCalendarDate(normalizedStartDate, dayStep);
  const rangeLabel =
    view === "month"
      ? formatStaffTeamCalendarMonthLabel(normalizedStartDate)
      : formatStaffTeamCalendarRangeLabel(days);
  const metaLabel =
    view === "month"
      ? "Текущий месяц в центре ленты: можно прокрутить к прошлому или следующему месяцу."
      : "Даты идут вертикально, клинеры — горизонтально. Цвет уборки совпадает с цветом клинера.";
  const viewButtons = [
    { key: "day", label: "День" },
    { key: "week", label: "2 недели" },
    { key: "month", label: "1 месяц" },
  ];

  return `<div class="admin-team-calendar-shell" data-admin-team-calendar-shell="true" aria-live="polite">
    <div class="admin-team-calendar-toolbar">
      <div class="admin-team-calendar-copy">
        <strong class="admin-team-calendar-range">${escapeHtml(rangeLabel)}</strong>
        <span class="admin-team-calendar-meta">${escapeHtml(metaLabel)}</span>
      </div>
      <div class="admin-team-calendar-actions">
        <div class="admin-team-calendar-view-toggle" aria-label="Период календаря">
          ${viewButtons
            .map((item) => `<a
              class="admin-team-calendar-view-link${item.key === view ? " admin-team-calendar-view-link-active" : ""}"
              href="${escapeHtmlAttribute(renderStaffTeamCalendarPath(normalizedStartDate, item.key))}"
              data-admin-team-calendar-nav="true"
              aria-current="${item.key === view ? "page" : "false"}"
            >${escapeHtml(item.label)}</a>`)
            .join("")}
        </div>
        <label class="admin-team-calendar-low-load-toggle">
          <input type="checkbox" data-admin-team-calendar-low-load-toggle="true">
          <span>Менее загруженные клинеры</span>
        </label>
        <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(renderStaffTeamCalendarPath(previousDateValue, view))}" data-admin-team-calendar-nav="true">Назад</a>
        <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(renderStaffTeamCalendarPath(todayDateValue, view))}" data-admin-team-calendar-nav="true" data-admin-team-calendar-scroll-today="true">Сегодня</a>
        <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(renderStaffTeamCalendarPath(nextDateValue, view))}" data-admin-team-calendar-nav="true">Вперёд</a>
        <button class="admin-link-button admin-button-secondary" type="button" data-admin-team-calendar-fullscreen-button="true" aria-pressed="false">На весь экран</button>
      </div>
    </div>
    ${view === "month"
      ? renderStaffTeamCalendarMonthGrid(staffSummaries, monthWindows, normalizedStartDate, todayDateValue, colorMap, lowWorkloadCount)
      : `<div class="admin-table-wrap admin-team-calendar-wrap" data-admin-team-calendar-scroll="true">
      <table class="admin-table admin-team-calendar-table" data-admin-team-calendar="true" style="--admin-team-calendar-staff:${escapeHtmlAttribute(String(staffSummaries.length))};">
        <thead>
          <tr>
            <th class="admin-team-calendar-date-col">Дата</th>
            ${staffSummaries.map((staffSummary, staffIndex) => renderStaffTeamCalendarCleanerHeader(staffSummary, staffIndex, days, lowWorkloadCount, colorMap)).join("")}
          </tr>
        </thead>
        <tbody>
          ${days
            .map(
              (day) => `<tr${day.dateValue === todayDateValue ? ' class="admin-team-calendar-today-row"' : ""}>
                ${renderStaffTeamCalendarDateCell(day, normalizedStartDate, todayDateValue)}
                ${staffSummaries.map((staffSummary, staffIndex) => {
                  const workloadCount = getStaffTeamCalendarWorkloadCount(staffSummary, days);
                  const isLessLoaded = workloadCount === lowWorkloadCount;
                  const emptyCell = isStaffTeamCalendarCellEmpty(staffSummary, day);
                  const unavailableBlocks = getStaffTeamCalendarUnavailableBlocks(staffSummary, day);
                  const showCellMenu = emptyCell || unavailableBlocks.length > 0;
                  return `<td
                    class="admin-team-calendar-day-cell"
                    style="${escapeHtmlAttribute(renderStaffTeamCalendarColorVars(staffSummary, staffIndex, colorMap))}"
                    data-admin-team-calendar-cleaner-id="${escapeHtmlAttribute(staffSummary.id || "")}"
                    data-admin-team-calendar-cleaner-name="${escapeHtmlAttribute(staffSummary.name || "Сотрудник")}"
                    data-admin-team-calendar-date="${escapeHtmlAttribute(day.dateValue)}"
                    ${emptyCell ? 'data-admin-team-calendar-empty="true"' : ""}
                    ${isLessLoaded ? 'data-admin-team-calendar-low-load="true"' : ""}
                  >${showCellMenu ? renderStaffTeamCalendarCellMenu(staffSummary, day, {
                    calendarStart: normalizedStartDate,
                    calendarView: view,
                  }) : ""}${renderStaffTeamCalendarCell(staffSummary, day, staffIndex, colorMap, {
                    staffId: staffSummary.id,
                    calendarStart: normalizedStartDate,
                    calendarView: view,
                  })}</td>`;
                }).join("")}
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`}
  </div>`;
}
function renderCreateStaffDialog(options = {}) {
  const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

  return `<dialog class="admin-dialog" id="admin-staff-create-dialog"${autoOpenAttr} aria-labelledby="admin-staff-create-title">
    <div class="admin-dialog-panel">
      <div class="admin-dialog-head">
        <div class="admin-dialog-copy-block">
          <p class="admin-card-eyebrow">Команда</p>
          <h2 class="admin-dialog-title" id="admin-staff-create-title">Новый сотрудник</h2>
          <p class="admin-dialog-copy">Заполните карточку сотрудника, и он сразу появится в команде, графике и назначениях.</p>
        </div>
        ${renderAdminDialogCloseButton("admin-staff-create-dialog")}
      </div>
      <form class="admin-form-grid" method="post" action="${ADMIN_STAFF_PATH}">
        <input type="hidden" name="action" value="create-staff">
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label">
            Имя
            <input class="admin-input" type="text" name="name" placeholder="Anna Petrova" required>
          </label>
          <label class="admin-label">
            Роль
            <select class="admin-input" name="role">
              ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}">${escapeHtml(formatWorkspaceRoleLabel(role))}</option>`).join("")}
            </select>
          </label>
          ${renderAdminPhoneInput("phone")}
          <label class="admin-label">
            Email
            <input class="admin-input" type="email" name="email" placeholder="team@shynli.com">
          </label>
          ${renderStaffCompensationFields({})}
        </div>
        ${renderStaffAddressField({
          id: "admin-staff-create-address",
        })}
        <label class="admin-label">
          Статус
          <select class="admin-input" name="status">
            ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Заметки
          <textarea class="admin-input" name="notes" placeholder="Районы, доступность, предпочтительные смены, ключи"></textarea>
        </label>
        <div class="admin-inline-actions">
          <button class="admin-button" type="submit">Добавить сотрудника</button>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-staff-create-dialog">Отмена</button>
        </div>
      </form>
    </div>
  </dialog>`;
}
function getStaffAssignmentDialogId(entryId) {
  const normalized = normalizeString(entryId, 120);
  const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `admin-staff-assignment-dialog-${safeSuffix || "entry"}`;
}
function renderStaffAssignmentTableRow(orderItem) {
  const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
  const assignedTeamLabel = orderItem.assignedStaff.length > 0
    ? orderItem.assignedStaff.map((record) => record.name).join(", ")
    : "Команда не назначена";

  return `<tr
    class="admin-table-row-clickable"
    tabindex="0"
    data-admin-dialog-row="true"
    data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
    aria-label="${escapeHtmlAttribute(`Открыть назначение ${orderItem.entry.customerName || "Клиент"}`)}"
  >
    <td>
      <div class="admin-table-stack">
        <span class="admin-table-link">${escapeHtml(orderItem.entry.customerName || "Клиент")}</span>
        <span class="admin-table-muted">${escapeHtml(formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(orderItem.entry.totalPrice))}</span>
      </div>
    </td>
    <td>
      <div class="admin-table-cell-stack">
        <span class="admin-table-strong">${escapeHtml(orderItem.scheduleLabel)}</span>
        <span class="admin-table-muted">${escapeHtml(
          orderItem.serviceDurationLabel && orderItem.serviceDurationLabel !== "Не указана"
            ? orderItem.serviceDurationLabel
            : orderItem.entry.requestId || orderItem.entry.id
        )}</span>
      </div>
    </td>
    <td>
      <div class="admin-table-cell-stack">
        <span class="admin-table-strong">${escapeHtml(assignedTeamLabel)}</span>
        ${orderItem.assignedStaff.length > 0
          ? `<span class="admin-table-muted">${escapeHtml(formatStaffCountLabel(orderItem.assignedStaff.length))}</span>`
          : `<span>${renderAdminBadge("Команда не назначена", "danger")}</span>`}
      </div>
    </td>
    <td>
      <div class="admin-inline-badge-row">
        ${renderAssignmentStatusBadge(orderItem.assignmentStatus)}
        ${renderQuoteOpsStatusBadge(orderItem.entry.status)}
      </div>
    </td>
    <td>
      ${renderStaffTravelEstimateList(orderItem, { compact: true })}
    </td>
    <td>
      ${orderItem.entry.fullAddress
        ? `<div class="admin-table-cell-stack">
            <span class="admin-line-clamp-two">${escapeHtml(orderItem.entry.fullAddress)}</span>
          </div>`
        : `<span class="admin-table-muted">Не указан</span>`}
    </td>
  </tr>`;
}
function renderStaffAssignmentDialog(orderItem, staffRecords) {
  const selectableStaff = staffRecords.filter((record) => record.status === "active" || orderItem.assignedStaff.some((item) => item.id === record.id));
  const assignedIds = orderItem.assignment ? orderItem.assignment.staffIds : [];
  const dialogId = getStaffAssignmentDialogId(orderItem.entry.id);
  const currentTeamMarkup =
    orderItem.assignedStaff.length > 0
      ? orderItem.assignedStaff.map((record) => renderAdminBadge(record.name, "outline")).join("")
      : renderAdminBadge("Команда не назначена", "muted");
  const scheduleDateValue =
    typeof normalizeAdminOrderDateInput === "function"
      ? normalizeAdminOrderDateInput(orderItem.scheduleDate)
      : normalizeString(orderItem.scheduleDate, 32);
  const scheduleTimeValue =
    typeof normalizeAdminOrderTimeInput === "function"
      ? normalizeAdminOrderTimeInput(orderItem.scheduleTime)
      : normalizeString(orderItem.scheduleTime, 32);
  const missingStaffBlock = orderItem.missingStaffIds.length > 0
    ? `<div class="admin-alert admin-alert-error">В назначении есть сотрудник, которого уже нет в команде. Сохраните карточку заказа заново.</div>`
    : "";
  const infoItems = [
    { label: "Дата и время", value: orderItem.scheduleLabel },
    { label: "Длительность", value: orderItem.serviceDurationLabel || "Не указана" },
    { label: "Контакты", value: formatAdminPhoneNumber(orderItem.entry.customerPhone) || orderItem.entry.customerEmail || "Контакты не указаны" },
    { label: "Заявка", value: orderItem.entry.requestId || orderItem.entry.id },
    { label: "Адрес", value: orderItem.entry.fullAddress || "Адрес не указан", wide: true },
    { label: "Комментарий", value: orderItem.assignment && orderItem.assignment.notes ? orderItem.assignment.notes : "Пока без комментария", wide: true },
  ];

  return `<dialog class="admin-dialog admin-dialog-wide" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
    <div class="admin-dialog-panel">
      <div class="admin-dialog-head">
        <div class="admin-dialog-copy-block">
          <p class="admin-card-eyebrow">График</p>
          <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(orderItem.entry.customerName || "Клиент")}</h2>
          <p class="admin-dialog-copy">${escapeHtml(formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(orderItem.entry.totalPrice))}</p>
        </div>
        ${renderAdminDialogCloseButton(dialogId)}
      </div>
      <section class="admin-client-section">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">Назначение</h3>
          <div class="admin-inline-badge-row">
            ${renderAssignmentStatusBadge(orderItem.assignmentStatus)}
            ${renderQuoteOpsStatusBadge(orderItem.entry.status)}
          </div>
        </div>
        <div class="admin-badge-row">
          ${currentTeamMarkup}
        </div>
        ${renderAdminClientInfoGrid(infoItems)}
      </section>
      <section class="admin-client-section">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">Дорога</h3>
          <span class="admin-action-hint">Маршрут считается один раз от домашнего адреса сотрудника до адреса клиента и сохраняется в назначении.</span>
        </div>
        ${renderStaffTravelEstimateList(orderItem, { showSourceDetail: true })}
      </section>
      <section class="admin-client-section">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">Команда и смена</h3>
          <span class="admin-action-hint">По умолчанию дата и время берутся из карточки заказа. Меняйте их только если для команды нужен отдельный слот.</span>
        </div>
        ${missingStaffBlock}
        <form
          class="admin-form-grid"
          method="post"
          action="${ADMIN_STAFF_PATH}"
          data-admin-async-save="true"
          data-admin-async-success="Назначение сохранено."
          data-admin-async-error="Не удалось сохранить назначение."
        >
          <input type="hidden" name="action" value="save-assignment">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(orderItem.entry.id)}">
          <div>
            ${selectableStaff.length > 0
              ? `<div class="admin-checkbox-grid">
                  ${selectableStaff
                    .map(
                      (record) => `<label class="admin-checkbox">
                        <input type="checkbox" name="staffIds" value="${escapeHtmlAttribute(record.id)}"${assignedIds.includes(record.id) ? " checked" : ""}>
                        <span>
                          <strong>${escapeHtml(record.name)}</strong>
                          <small>${escapeHtml([record.role, formatStaffStatusLabel(record.status)].filter(Boolean).join(" • "))}</small>
                        </span>
                      </label>`
                    )
                    .join("")}
                </div>`
              : `<div class="admin-empty-state">Сначала создайте сотрудника в разделе "Настройки → Пользователи". После этого он появится здесь для назначения на заказы.</div>`}
          </div>
          <div class="admin-form-grid admin-form-grid-two">
            <label class="admin-label">
              Дата смены
              <input class="admin-input" type="date" name="scheduleDate" value="${escapeHtmlAttribute(scheduleDateValue)}">
            </label>
            <label class="admin-label">
              Время смены
              <input class="admin-input" type="time" name="scheduleTime" value="${escapeHtmlAttribute(scheduleTimeValue)}">
            </label>
            <label class="admin-label">
              Статус
              <select class="admin-input" name="status">
                ${ASSIGNMENT_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${orderItem.assignmentStatus === status ? " selected" : ""}>${escapeHtml(formatAssignmentStatusLabel(status))}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="admin-label">
            Комментарий
            <textarea class="admin-input" name="notes" placeholder="Ключи, инструкции по доступу, комментарий для команды">${escapeHtml(orderItem.assignment ? orderItem.assignment.notes : "")}</textarea>
          </label>
          <p class="admin-field-note" data-admin-async-feedback hidden></p>
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit">Сохранить назначение</button>
          </div>
        </form>
        ${orderItem.assignment
          ? `<form class="admin-inline-actions" method="post" action="${ADMIN_STAFF_PATH}">
              <input type="hidden" name="action" value="clear-assignment">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(orderItem.entry.id)}">
              <button class="admin-button admin-button-secondary" type="submit">Очистить назначение</button>
            </form>`
          : ""}
      </section>
    </div>
  </dialog>`;
}
function renderStaffAssignmentsTable(orderItems) {
  if (!orderItems.length) {
    return `<div class="admin-empty-state">Пока заказов нет. Как только появятся заявки, здесь можно будет назначать команду и вести график.</div>`;
  }

  const sortedOrderItems = orderItems
    .slice()
    .sort((left, right) => {
      const leftUnassigned = !left || !Array.isArray(left.assignedStaff) || left.assignedStaff.length === 0;
      const rightUnassigned = !right || !Array.isArray(right.assignedStaff) || right.assignedStaff.length === 0;
      if (leftUnassigned !== rightUnassigned) {
        return leftUnassigned ? -1 : 1;
      }

      const leftHasTimestamp = Number.isFinite(left && left.scheduleTimestamp);
      const rightHasTimestamp = Number.isFinite(right && right.scheduleTimestamp);
      if (leftHasTimestamp && rightHasTimestamp && left.scheduleTimestamp !== right.scheduleTimestamp) {
        return left.scheduleTimestamp - right.scheduleTimestamp;
      }
      if (Boolean(left && left.hasSchedule) !== Boolean(right && right.hasSchedule)) {
        return left && left.hasSchedule ? -1 : 1;
      }

      const leftCreatedAt = Date.parse((left && left.entry && left.entry.createdAt) || "");
      const rightCreatedAt = Date.parse((right && right.entry && right.entry.createdAt) || "");
      return (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) - (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0);
    });

  return `<div class="admin-table-wrap admin-orders-table-wrap">
    <table class="admin-table admin-staff-schedule-table">
      <thead>
        <tr>
          <th>Заказ</th>
          <th>Дата и время</th>
          <th>Команда</th>
          <th>Статус</th>
          <th>Дорога</th>
          <th>Адрес</th>
        </tr>
      </thead>
      <tbody>
        ${sortedOrderItems.map((item) => renderStaffAssignmentTableRow(item)).join("")}
      </tbody>
    </table>
  </div>`;
}
function renderStaffAssignmentDialogs(orderItems, staffRecords) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return "";
  return orderItems.map((item) => renderStaffAssignmentDialog(item, staffRecords)).join("");
}
function renderStaffTravelEstimateList(orderItem, options = {}) {
  const assignedStaff = Array.isArray(orderItem && orderItem.assignedStaff) ? orderItem.assignedStaff : [];
  const travelLegs = Array.isArray(orderItem && orderItem.travelLegs) ? orderItem.travelLegs : [];
  if (assignedStaff.length === 0) {
    return `<span class="admin-table-muted">Появится после назначения команды.</span>`;
  }
  if (travelLegs.length === 0) {
    return `<span class="admin-table-muted">Добавьте дату и адрес, чтобы посчитать маршрут.</span>`;
  }
  return `<div class="admin-travel-estimate-list${options.compact ? " admin-travel-estimate-list-compact" : ""}">
    ${travelLegs.map((leg) => renderStaffTravelEstimateItem(leg, options)).join("")}
  </div>`;
}
function renderStaffTravelEstimateItem(leg, options = {}) {
  const showStaffName = !options.compact;
  const sourceLabel = normalizeString(leg && leg.sourceLabel, 80) || "Маршрут";
  const estimate = leg && leg.travelEstimate ? leg.travelEstimate : null;
  const estimateLabel = estimate ? normalizeString(estimate.label, 120) : "";
  const estimateStatus = estimate ? normalizeString(estimate.status, 40).toLowerCase() : "";
  const savedText =
    estimateStatus === "ok" && estimateLabel
      ? `${sourceLabel}: ${estimateLabel}`
      : estimateStatus === "not-configured"
        ? `${sourceLabel}: карты не подключены`
        : estimateStatus === "unavailable"
          ? `${sourceLabel}: ${formatTravelEstimateUnavailableText(estimate) || "маршрут недоступен"}`
          : "";
  const fallbackText = leg && leg.status === "missing-destination"
    ? "У заказа не указан адрес."
    : leg && leg.status === "missing-origin"
      ? `${sourceLabel}: у сотрудника нет домашнего адреса.`
      : leg && leg.status === "same-place"
        ? `${sourceLabel}: клинер уже на месте.`
        : `${sourceLabel}: маршрут ожидает синхронизации.`;
  const travelText = savedText || fallbackText;
  const sourceDetail =
    options.showSourceDetail && leg && leg.sourceType === "previous-order" && leg.sourceTitle
      ? `<span class="admin-table-muted">Точка старта: ${escapeHtml(leg.sourceTitle)}</span>`
      : "";
  const errorDetail =
    estimateStatus === "unavailable" && estimate && estimate.error
      ? `<span class="admin-table-muted">Причина: ${escapeHtml(formatTravelEstimateUnavailableText(estimate, { technical: true }))}</span>`
      : "";

  return `<div class="admin-table-cell-stack admin-travel-estimate-stack">
    ${showStaffName ? `<span class="admin-table-strong">${escapeHtml((leg && leg.staffName) || "Сотрудник")}</span>` : ""}
    <span class="admin-table-muted">${escapeHtml(travelText)}</span>
    ${sourceDetail}
    ${errorDetail}
  </div>`;
}

  return {
    getStaffCalendarTodayDateValue,
    normalizeStaffCalendarDateValue,
    parseStaffCalendarDate,
    addDaysToStaffCalendarDate,
    normalizeStaffTeamCalendarView,
    getStaffTeamCalendarView,
    getStaffTeamCalendarViewDayCount,
    buildStaffTeamCalendarWindow,
    buildStaffTeamCalendarMonthScrollWindows,
    formatStaffTeamCalendarRangeLabel,
    getStaffTeamCalendarStartDate,
    getStaffTeamCalendarColor,
    buildStaffTeamCalendarColorMap,
    renderStaffTeamCalendarColorVars,
    getStaffTeamCalendarWorkloadCount,
    doesStaffTeamCalendarBlockCoverDay,
    getStaffTeamCalendarDayAssignments,
    getStaffTeamCalendarUnavailableBlocks,
    isStaffTeamCalendarCellEmpty,
    renderStaffTeamCalendarCellMenu,
    renderStaffTeamCalendarAssignmentEntry,
    renderStaffTeamCalendarAvailabilityEntry,
    renderStaffTeamCalendarCell,
    renderStaffTeamCalendarTable,
    renderCreateStaffDialog,
    getStaffAssignmentDialogId,
    renderStaffAssignmentTableRow,
    renderStaffAssignmentDialog,
    renderStaffAssignmentsTable,
    renderStaffAssignmentDialogs,
    renderStaffTravelEstimateList,
    renderStaffTravelEstimateItem,
  };
}

module.exports = {
  createStaffScheduleUiHelpers,
};
