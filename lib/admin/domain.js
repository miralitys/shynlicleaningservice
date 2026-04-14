"use strict";

const crypto = require("crypto");
const path = require("path");

function createAdminDomainHelpers(deps = {}) {
  const {
    ADMIN_CHALLENGE_COOKIE,
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_SESSION_COOKIE,
    ADMIN_STAFF_PATH,
    GOOGLE_PLACES_API_KEY,
    ORDER_ASSIGNMENT_VALUES,
    PERF_ENDPOINT_ENABLED,
    PERF_ENDPOINT_TOKEN,
    QRCode,
    SITE_ORIGIN,
    adminAuth,
    adminSharedRenderers,
    escapeHtmlText,
    getClientAddress,
    getQuoteTokenSecret,
    getQuoteTokenTtlSeconds,
    getRequestUrl,
    loadLeadConnectorConfig,
    loadSupabaseQuoteOpsConfig,
    normalizeString,
    parseCookies,
    shouldTrustProxyHeaders,
    shouldUseSecureCookies,
  } = deps;
  const ADMIN_TIME_ZONE = "America/Chicago";

function getAdminConfig() {
  if (!adminAuth) return null;
  const config = adminAuth.loadAdminConfig(process.env);
  return config.configured ? config : null;
}

function getAdminRequestFingerprint(req) {
  const userAgent = normalizeString(req.headers["user-agent"], 240);
  const acceptLanguage = normalizeString(req.headers["accept-language"], 240);
  const clientAddress = shouldTrustProxyHeaders(req) ? getClientAddress(req) : "";
  return crypto
    .createHash("sha256")
    .update(`${clientAddress}|${userAgent}|${acceptLanguage}`)
    .digest("hex")
    .slice(0, 32);
}

function getAdminCookieOptions(req) {
  return {
    path: "/admin",
    httpOnly: true,
    sameSite: "Lax",
    secure: shouldUseSecureCookies(req),
  };
}

function getAdminAuthState(req) {
  const config = getAdminConfig();
  const cookies = parseCookies(req.headers.cookie);
  const fingerprint = getAdminRequestFingerprint(req);
  const state = {
    config,
    fingerprint,
    session: null,
    challenge: null,
    cookies,
  };

  if (!config) return state;

  try {
    const sessionPayload = adminAuth.verifyAdminSessionToken(cookies[ADMIN_SESSION_COOKIE], config);
    if (sessionPayload && sessionPayload.email === config.email && sessionPayload.fingerprint === fingerprint) {
      state.session = sessionPayload;
    }
  } catch {}

  try {
    const challengePayload = adminAuth.verifyAdminChallengeToken(cookies[ADMIN_CHALLENGE_COOKIE], config);
    if (challengePayload && challengePayload.email === config.email && challengePayload.fingerprint === fingerprint) {
      state.challenge = challengePayload;
    }
  } catch {}

  return state;
}

function getLeadConnectorAdminState() {
  if (typeof loadLeadConnectorConfig !== "function") {
    return {
      available: false,
      configured: false,
      config: null,
      error: "LeadConnector module is not available in this build.",
    };
  }

  try {
    const config = loadLeadConnectorConfig(process.env);
    return {
      available: true,
      configured: Boolean(config && config.configured),
      config,
      error: "",
    };
  } catch (error) {
    return {
      available: true,
      configured: false,
      config: null,
      error: normalizeString(error && error.message ? error.message : "Invalid LeadConnector configuration", 200),
    };
  }
}

function getAdminIntegrationState() {
  const leadConnector = getLeadConnectorAdminState();
  const stripeConfigured = Boolean(normalizeString(process.env.STRIPE_SECRET_KEY, 256));
  const quoteTokenSecret = getQuoteTokenSecret(process.env);
  const supabaseConfig =
    typeof loadSupabaseQuoteOpsConfig === "function"
      ? loadSupabaseQuoteOpsConfig(process.env)
      : { configured: false, url: "", serviceRoleKey: "", tableName: "" };
  return {
    leadConnector,
    stripeConfigured,
    placesConfigured: Boolean(GOOGLE_PLACES_API_KEY),
    supabaseConfigured: Boolean(supabaseConfig.configured),
    supabaseUrl: supabaseConfig.url,
    supabaseTableName: supabaseConfig.tableName || "",
    quoteTokenConfigured: Boolean(quoteTokenSecret),
    quoteTokenTtlSeconds: Number(getQuoteTokenTtlSeconds(process.env) || 0),
    perfEndpointEnabled: PERF_ENDPOINT_ENABLED,
    perfTokenPresent: Boolean(PERF_ENDPOINT_TOKEN),
    perfProtected: PERF_ENDPOINT_ENABLED && Boolean(PERF_ENDPOINT_TOKEN),
  };
}

function formatBooleanLabel(value, yesLabel = "Enabled", noLabel = "Disabled") {
  return value ? yesLabel : noLabel;
}

function formatCountList(values) {
  return values.map((value) => String(value)).join(", ");
}

function formatCurrencyAmount(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDurationLabel(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  if (!seconds) return "Not available";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatAdminDateTime(value) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не указано";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  });
}

function formatAdminServiceLabel(value) {
  const normalized = normalizeString(value, 120).toLowerCase();
  if (!normalized) return "Уборка";
  if (normalized.includes("regular")) return "Регулярная уборка";
  if (normalized.includes("deep")) return "Генеральная уборка";
  if (normalized.includes("moving") || normalized.includes("move")) return "Уборка перед переездом";
  return normalizeString(value, 120);
}

function formatRussianPlural(count, one, few, many) {
  const absolute = Math.abs(Number(count || 0));
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatOrderCountLabel(count) {
  return `${count} ${formatRussianPlural(count, "заказ", "заказа", "заказов")}`;
}

function formatStaffCountLabel(count) {
  return `${count} ${formatRussianPlural(count, "сотрудник", "сотрудника", "сотрудников")}`;
}

function formatAdminCalendarDate(value) {
  const normalized = normalizeString(value, 32);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized || "Не указано";
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function formatAdminClockTime(value) {
  const normalized = normalizeString(value, 32);
  if (!normalized) return "Не указано";

  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (twelveHourMatch) {
    const hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const meridiem = twelveHourMatch[3].toUpperCase();
    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      const normalizedHours = meridiem === "PM" && hours !== 12 ? hours + 12 : meridiem === "AM" && hours === 12 ? 0 : hours;
      return new Date(Date.UTC(2000, 0, 1, normalizedHours, minutes, 0)).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      });
    }
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!twentyFourHourMatch) return normalized;

  const hours = Number(twentyFourHourMatch[1]);
  const minutes = Number(twentyFourHourMatch[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return normalized;

  return new Date(Date.UTC(2000, 0, 1, hours, minutes, 0)).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function normalizeAdminOrderDateInput(value) {
  const normalized = normalizeString(value, 32);
  if (!normalized) return "";

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const dotMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return normalized;
}

function formatAdminOrderDateInputValue(value) {
  const normalized = normalizeAdminOrderDateInput(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized;
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

function normalizeAdminOrderPriceInput(value, fallback = null) {
  const normalized = normalizeString(value, 64);
  if (!normalized) return fallback;

  let compact = normalized.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
  if (!compact) return fallback;

  if (compact.includes(".") && compact.includes(",")) {
    compact = compact.replace(/,/g, "");
  } else if (!compact.includes(".") && compact.includes(",")) {
    compact = compact.replace(/,/g, ".");
  } else {
    compact = compact.replace(/,/g, "");
  }

  const parsed = Number(compact);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}

function formatAdminOrderPriceInputValue(value) {
  const normalized = normalizeAdminOrderPriceInput(value, null);
  if (!Number.isFinite(normalized)) return "";
  return normalized.toFixed(2);
}

function normalizeAdminOrderTimeInput(value) {
  const normalized = normalizeString(value, 32);
  if (!normalized) return "";

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const meridiemMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] || "00");
    const meridiem = meridiemMatch[3].toUpperCase();
    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (meridiem === "P" && hours < 12) hours += 12;
      if (meridiem === "A" && hours === 12) hours = 0;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  return normalized;
}

function formatAdminOrderTimeInputValue(value) {
  const normalized = normalizeAdminOrderTimeInput(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return normalized;

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridiem}`;
}

function formatAdminScheduleLabel(dateValue, timeValue) {
  const normalizedDate = normalizeString(dateValue, 32);
  const normalizedTime = normalizeString(timeValue, 32);
  if (!normalizedDate && !normalizedTime) return "Дата не указана";
  if (!normalizedDate) return normalizedTime ? `Время: ${formatAdminClockTime(normalizedTime)}` : "Дата не указана";
  if (!normalizedTime) return formatAdminCalendarDate(normalizedDate);
  return `${formatAdminCalendarDate(normalizedDate)}, ${formatAdminClockTime(normalizedTime)}`;
}

function toAdminScheduleTimestamp(dateValue, timeValue) {
  const normalizedDate = normalizeString(dateValue, 32);
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const [, year, month, day] = match;
  const timeMatch = normalizeString(timeValue, 32).match(/^(\d{1,2}):(\d{2})/);
  const hours = timeMatch ? Number(timeMatch[1]) : 12;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, 0);
}

function formatStaffStatusLabel(status) {
  if (status === "inactive") return "Не активен";
  if (status === "on_leave") return "В отпуске";
  return "Активен";
}

function formatAssignmentStatusLabel(status) {
  if (status === "confirmed") return "Подтверждено";
  if (status === "completed") return "Завершено";
  if (status === "issue") return "Нужно проверить";
  return "Запланировано";
}

function renderStaffStatusBadge(status) {
  if (status === "inactive") return adminSharedRenderers.renderAdminBadge(formatStaffStatusLabel(status), "muted");
  if (status === "on_leave") return adminSharedRenderers.renderAdminBadge(formatStaffStatusLabel(status), "outline");
  return adminSharedRenderers.renderAdminBadge(formatStaffStatusLabel(status), "success");
}

function renderAssignmentStatusBadge(status) {
  if (status === "completed") return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "success");
  if (status === "confirmed") return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "default");
  if (status === "issue") return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "danger");
  return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "outline");
}

function buildStaffReturnPath(value) {
  const candidate = normalizeString(value, 1000);
  if (!candidate) return ADMIN_STAFF_PATH;

  try {
    const parsed = new URL(candidate, SITE_ORIGIN);
    if (parsed.pathname !== ADMIN_STAFF_PATH) return ADMIN_STAFF_PATH;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return ADMIN_STAFF_PATH;
  }
}

function buildStaffPlanningContext(entries = [], staffSnapshot = {}) {
  const orderEntries = Array.isArray(entries) ? entries.filter((entry) => isOrderCreatedEntry(entry)) : [];
  const staff = Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff.slice() : [];
  const assignments = Array.isArray(staffSnapshot.assignments) ? staffSnapshot.assignments.slice() : [];
  const staffById = new Map(staff.map((record) => [record.id, record]));
  const assignmentsByEntryId = new Map(assignments.map((record) => [record.entryId, record]));
  const orderItems = orderEntries
    .map((entry) => {
      const assignment = assignmentsByEntryId.get(entry.id) || null;
      const assignedStaff = assignment
        ? assignment.staffIds.map((staffId) => staffById.get(staffId)).filter(Boolean)
        : [];
      const missingStaffIds = assignment
        ? assignment.staffIds.filter((staffId) => !staffById.has(staffId))
        : [];
      const scheduleDate = normalizeString((assignment && assignment.scheduleDate) || entry.selectedDate, 32);
      const scheduleTime = normalizeString((assignment && assignment.scheduleTime) || entry.selectedTime, 32);
      return {
        entry,
        assignment,
        assignedStaff,
        missingStaffIds,
        scheduleDate,
        scheduleTime,
        hasSchedule: Boolean(scheduleDate || scheduleTime),
        scheduleTimestamp: toAdminScheduleTimestamp(scheduleDate, scheduleTime),
        scheduleLabel: formatAdminScheduleLabel(scheduleDate, scheduleTime),
        assignmentStatus: assignment ? assignment.status : "planned",
      };
    })
    .sort((left, right) => {
      const leftHasTimestamp = Number.isFinite(left.scheduleTimestamp);
      const rightHasTimestamp = Number.isFinite(right.scheduleTimestamp);
      if (leftHasTimestamp && rightHasTimestamp && left.scheduleTimestamp !== right.scheduleTimestamp) {
        return left.scheduleTimestamp - right.scheduleTimestamp;
      }
      if (left.hasSchedule !== right.hasSchedule) {
        return left.hasSchedule ? -1 : 1;
      }
      const leftCreatedAt = Date.parse(left.entry.createdAt || "");
      const rightCreatedAt = Date.parse(right.entry.createdAt || "");
      return (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) - (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0);
    });
  const plannedOrderItems = attachStaffTravelPlanning(orderItems);

  const now = Date.now();
  const weekAhead = now + (7 * 24 * 60 * 60 * 1000);
  const orderItemsByEntryId = new Map(plannedOrderItems.map((item) => [item.entry.id, item]));
  const staffSummaries = staff.map((record) => {
    const assignedOrders = plannedOrderItems.filter((item) => item.assignedStaff.some((staffRecord) => staffRecord.id === record.id));
    const scheduledOrders = assignedOrders.filter((item) => item.hasSchedule);
    const datedOrders = scheduledOrders.filter((item) => Number.isFinite(item.scheduleTimestamp));
    const nextOrder = datedOrders.length > 0 ? datedOrders[0] : scheduledOrders[0] || null;
    const upcomingWeekCount = datedOrders.filter((item) => item.scheduleTimestamp >= now && item.scheduleTimestamp <= weekAhead).length;
    return {
      ...record,
      assignedOrders,
      scheduledOrders,
      assignedCount: assignedOrders.length,
      scheduledCount: scheduledOrders.length,
      upcomingWeekCount,
      nextOrder,
    };
  });

  const scheduledOrders = plannedOrderItems.filter((item) => item.hasSchedule);
  const assignedScheduledCount = scheduledOrders.filter((item) => item.assignedStaff.length > 0).length;
  const unassignedScheduledCount = scheduledOrders.filter((item) => item.assignedStaff.length === 0).length;

  return {
    staff,
    assignments,
    staffById,
    assignmentsByEntryId,
    orderItems: plannedOrderItems,
    orderItemsByEntryId,
    staffSummaries,
    scheduledOrders,
    assignedScheduledCount,
    unassignedScheduledCount,
    activeStaffCount: staff.filter((record) => record.status === "active").length,
  };
}

function attachStaffTravelPlanning(orderItems = []) {
  const normalizedItems = Array.isArray(orderItems) ? orderItems.map((item) => ({ ...item, travelLegs: [] })) : [];
  const bucketByStaffAndDay = new Map();

  for (const item of normalizedItems) {
    if (!item || !item.entry || !Array.isArray(item.assignedStaff) || item.assignedStaff.length === 0) continue;
    if (!item.hasSchedule || !Number.isFinite(item.scheduleTimestamp)) continue;
    const scheduleDate = normalizeString(item.scheduleDate, 32);
    if (!scheduleDate) continue;

    for (const staffRecord of item.assignedStaff) {
      if (!staffRecord || !staffRecord.id) continue;
      const key = `${staffRecord.id}::${scheduleDate}`;
      const bucket = bucketByStaffAndDay.get(key) || [];
      bucket.push({ item, staffRecord });
      bucketByStaffAndDay.set(key, bucket);
    }
  }

  for (const bucket of bucketByStaffAndDay.values()) {
    bucket.sort((left, right) => compareStaffTravelItems(left.item, right.item));
    let previousItem = null;

    for (const bucketItem of bucket) {
      const leg = buildStaffTravelLeg(bucketItem.staffRecord, bucketItem.item, previousItem);
      bucketItem.item.travelLegs.push(leg);
      previousItem = bucketItem.item;
    }
  }

  for (const item of normalizedItems) {
    item.travelLegs.sort((left, right) =>
      normalizeString(left && left.staffName, 120).localeCompare(normalizeString(right && right.staffName, 120), "ru")
    );
  }

  return normalizedItems;
}

function compareStaffTravelItems(left, right) {
  const leftHasTimestamp = Number.isFinite(left && left.scheduleTimestamp);
  const rightHasTimestamp = Number.isFinite(right && right.scheduleTimestamp);
  if (leftHasTimestamp && rightHasTimestamp && left.scheduleTimestamp !== right.scheduleTimestamp) {
    return left.scheduleTimestamp - right.scheduleTimestamp;
  }
  const leftCreatedAt = Date.parse((left && left.entry && left.entry.createdAt) || "");
  const rightCreatedAt = Date.parse((right && right.entry && right.entry.createdAt) || "");
  return (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0) - (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0);
}

function buildStaffTravelLeg(staffRecord, item, previousItem) {
  const staffName = normalizeString(staffRecord && staffRecord.name, 120) || "Сотрудник";
  const homeAddress = normalizeString(staffRecord && staffRecord.address, 500);
  const destinationAddress = normalizeString(item && item.entry && item.entry.fullAddress, 500);
  const previousAddress = normalizeString(previousItem && previousItem.entry && previousItem.entry.fullAddress, 500);
  const previousCustomerName = normalizeString(previousItem && previousItem.entry && previousItem.entry.customerName, 160);

  let originAddress = "";
  let sourceType = "home";
  let sourceLabel = "Из дома";
  let sourceTitle = staffName;

  if (previousAddress) {
    originAddress = previousAddress;
    sourceType = "previous-order";
    sourceLabel = "От предыдущего заказа";
    sourceTitle = previousCustomerName || "Предыдущий заказ";
  } else if (homeAddress) {
    originAddress = homeAddress;
  }

  const sameAddress =
    originAddress &&
    destinationAddress &&
    originAddress.toLowerCase() === destinationAddress.toLowerCase();
  const status = !destinationAddress
    ? "missing-destination"
    : !originAddress
      ? "missing-origin"
      : sameAddress
        ? "same-place"
        : "ready";

  return {
    staffId: normalizeString(staffRecord && staffRecord.id, 120),
    staffName,
    originAddress,
    destinationAddress,
    sourceType,
    sourceLabel,
    sourceTitle,
    departureTimestamp: Number.isFinite(item && item.scheduleTimestamp) ? item.scheduleTimestamp : 0,
    destinationLabel: normalizeString(item && item.scheduleLabel, 120),
    status,
  };
}

function normalizeOrderServiceType(value, fallback = "standard") {
  const normalized = normalizeString(value, 40)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (!normalized) return fallback;
  if (normalized === "deep") return "deep";
  if (
    normalized === "moving" ||
    normalized === "move-in/out" ||
    normalized === "move-in-out" ||
    normalized === "moveout" ||
    normalized === "moveinout"
  ) {
    return "move-in/out";
  }
  if (normalized === "regular" || normalized === "standard") return "standard";
  return fallback;
}

function formatOrderServiceTypeLabel(value) {
  const normalized = normalizeOrderServiceType(value);
  if (normalized === "deep") return "Deep";
  if (normalized === "move-in/out") return "Move-in/out";
  return "Standard";
}

function normalizeOrderFrequency(value, fallback = "") {
  const normalized = normalizeString(value, 40)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (!normalized) return fallback;
  if (normalized === "weekly") return "weekly";
  if (normalized === "monthly") return "monthly";
  if (normalized === "biweekly") return "biweekly";
  return fallback;
}

function formatOrderFrequencyLabel(value) {
  const normalized = normalizeOrderFrequency(value, "");
  if (normalized === "weekly") return "Weekly";
  if (normalized === "monthly") return "Monthly";
  if (normalized === "biweekly") return "Bi-weekly";
  return "Not set";
}

function normalizeOrderPaymentStatus(value, fallback = "unpaid") {
  const normalized = normalizeString(value, 40).toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return fallback;
  if (normalized === "paid") return "paid";
  if (normalized === "partial") return "partial";
  if (normalized === "unpaid") return "unpaid";
  return fallback;
}

function formatOrderPaymentStatusLabel(value) {
  const normalized = normalizeOrderPaymentStatus(value, "unpaid");
  if (normalized === "paid") return "Paid";
  if (normalized === "partial") return "Partial";
  return "Unpaid";
}

function normalizeOrderPaymentMethod(value, fallback = "") {
  const normalized = normalizeString(value, 40).toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return fallback;
  if (normalized === "cash") return "cash";
  if (normalized === "zelle") return "zelle";
  if (normalized === "card") return "card";
  if (normalized === "invoice") return "invoice";
  return fallback;
}

function formatOrderPaymentMethodLabel(value) {
  const normalized = normalizeOrderPaymentMethod(value, "");
  if (normalized === "cash") return "Cash";
  if (normalized === "zelle") return "Zelle";
  if (normalized === "card") return "Card";
  if (normalized === "invoice") return "Invoice";
  return "Not set";
}

function normalizeOrderStatus(value, fallback = "") {
  const normalized = normalizeString(value, 40).toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");
  if (!compact) return fallback;
  if (compact === "new") return "new";
  if (compact === "scheduled") return "scheduled";
  if (compact === "inprogress") return "in-progress";
  if (compact === "invoicesent") return "invoice-sent";
  if (compact === "paid") return "paid";
  if (compact === "awaitingreview" || compact === "waitingreview") return "awaiting-review";
  if (compact === "completed") return "completed";
  if (compact === "canceled" || compact === "cancelled") return "canceled";
  if (compact === "rescheduled") return "rescheduled";
  return fallback;
}

function formatOrderStatusLabel(value) {
  const normalized = normalizeOrderStatus(value, "new");
  if (normalized === "scheduled") return "Запланировано";
  if (normalized === "in-progress") return "В работе";
  if (normalized === "invoice-sent") return "Инвойс отправлен";
  if (normalized === "paid") return "Оплачено";
  if (normalized === "awaiting-review") return "Ждем отзыв";
  if (normalized === "completed") return "Завершено";
  if (normalized === "canceled") return "Отменено";
  if (normalized === "rescheduled") return "Перенесено";
  return "Новые";
}

function getEntryPayload(entry = {}) {
  return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object" ? entry.payloadForRetry : {};
}

function getEntryCalculatorData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.calculatorData && typeof payload.calculatorData === "object" ? payload.calculatorData : {};
}

function getEntryAdminOrderData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminOrder && typeof payload.adminOrder === "object" ? payload.adminOrder : {};
}

function getEntryOrderPolicyAcceptanceData(entry = {}) {
  const adminOrder = getEntryAdminOrderData(entry);
  return adminOrder.policyAcceptance && typeof adminOrder.policyAcceptance === "object"
    ? { ...adminOrder.policyAcceptance }
    : {};
}

function getEntryAdminLeadData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminLead && typeof payload.adminLead === "object" ? payload.adminLead : {};
}

function getEntryAdminSmsData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
}

function normalizeAdminSmsHistoryDirection(value) {
  const normalized = normalizeString(value, 20).toLowerCase();
  return normalized === "inbound" ? "inbound" : "outbound";
}

function normalizeAdminSmsHistorySource(value) {
  const normalized = normalizeString(value, 20).toLowerCase();
  return normalized === "automatic" ? "automatic" : "manual";
}

function normalizeAdminSmsHistoryEntries(entries = [], fallbackTimestamp = "") {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  return entries
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const message = normalizeString(item.message, 1000);
      if (!message) return null;
      return {
        id: normalizeString(item.id, 120) || crypto.randomUUID(),
        sentAt: normalizeLeadTaskDueAt(item.sentAt || item.createdAt, fallbackTimestamp || new Date().toISOString()),
        message,
        phone: normalizeString(item.phone, 80),
        contactId: normalizeString(item.contactId, 120),
        channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
        direction: normalizeAdminSmsHistoryDirection(item.direction),
        source: normalizeAdminSmsHistorySource(item.source),
        targetType: normalizeString(item.targetType, 40).toLowerCase(),
        targetRef: normalizeString(item.targetRef, 160),
        conversationId: normalizeString(item.conversationId, 120),
        messageId: normalizeString(item.messageId, 120),
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function getEntrySmsHistory(entry = {}) {
  return normalizeAdminSmsHistoryEntries(getEntryAdminSmsData(entry).history || []);
}

const LEAD_STATUS_VALUES = new Set(["new", "no-response", "discussion", "confirmed", "declined"]);

function normalizeLeadStatus(value, fallback = "new") {
  const normalized = normalizeString(value, 40).toLowerCase();
  const compact = normalized.replace(/[\s_]+/g, "-");
  if (!compact) return fallback;
  if (compact === "new" || compact === "новая") return "new";
  if (
    compact === "no-response" ||
    compact === "noanswer" ||
    compact === "no-answer" ||
    compact === "без-ответа" ||
    compact === "безответа"
  ) {
    return "no-response";
  }
  if (compact === "discussion" || compact === "обсуждение") return "discussion";
  if (compact === "confirmed" || compact === "подтверждено" || compact === "confirm") return "confirmed";
  if (compact === "declined" || compact === "refused" || compact === "отказ") return "declined";
  return fallback;
}

function formatLeadStatusLabel(value) {
  const normalized = normalizeLeadStatus(value, "new");
  if (normalized === "no-response") return "Без ответа";
  if (normalized === "discussion") return "Обсуждение";
  if (normalized === "confirmed") return "Подтверждено";
  if (normalized === "declined") return "Отказ";
  return "New";
}

function getLeadStatus(entry = {}) {
  const adminLead = getEntryAdminLeadData(entry);
  const explicitStatus = normalizeLeadStatus(adminLead.status, "");
  if (explicitStatus) return explicitStatus;
  if (isOrderCreatedEntry(entry)) return "confirmed";
  return "new";
}

function normalizeLeadTaskStatus(value, fallback = "open") {
  const normalized = normalizeString(value, 32).toLowerCase();
  if (normalized === "completed" || normalized === "done") return "completed";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  return fallback;
}

function normalizeLeadTaskKind(value, fallback = "contact-client") {
  const normalized = normalizeString(value, 64).toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "contact-client" || normalized === "initial-contact") return "contact-client";
  if (normalized === "retry-3h" || normalized === "call-back-3h") return "retry-3h";
  if (normalized === "retry-next-morning" || normalized === "call-next-morning") return "retry-next-morning";
  if (normalized === "discussion-followup" || normalized === "follow-up") return "discussion-followup";
  return fallback;
}

function formatLeadTaskTitle(kind) {
  const normalized = normalizeLeadTaskKind(kind);
  if (normalized === "retry-3h") return "Связаться с клиентом";
  if (normalized === "retry-next-morning") return "Перезвонить клиенту на следующий день утром";
  if (normalized === "discussion-followup") return "Связаться с клиентом в назначенное время";
  return "Связаться с клиентом";
}

function getChicagoLocalParts(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "literal") continue;
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 0),
    day: Number(parts.day || 0),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
  };
}

function buildChicagoIsoDateTime(year, month, day, hour, minute = 0) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const local = getChicagoLocalParts(new Date(utcMs));
    const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actualUtcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second || 0);
    const diffMinutes = Math.round((actualUtcMs - desiredUtcMs) / (60 * 1000));
    if (diffMinutes === 0) {
      return new Date(utcMs).toISOString();
    }
    utcMs -= diffMinutes * 60 * 1000;
  }
  return new Date(utcMs).toISOString();
}

function addHoursToIso(value, hoursToAdd) {
  const baseDate = new Date(value || Date.now());
  const baseMs = Number.isFinite(baseDate.getTime()) ? baseDate.getTime() : Date.now();
  return new Date(baseMs + Math.max(0, Number(hoursToAdd) || 0) * 60 * 60 * 1000).toISOString();
}

function buildNextChicagoMorningIso(value, targetHour = 9) {
  const local = getChicagoLocalParts(value || Date.now());
  const anchorUtcMs = Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0) + 24 * 60 * 60 * 1000;
  const nextLocal = getChicagoLocalParts(new Date(anchorUtcMs));
  return buildChicagoIsoDateTime(nextLocal.year, nextLocal.month, nextLocal.day, targetHour, 0);
}

function normalizeLeadTaskDueAt(value, fallback = "") {
  const normalized = normalizeString(value, 80);
  if (!normalized) return fallback;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function createLeadTaskRecord(input = {}, defaults = {}) {
  const createdAt = normalizeLeadTaskDueAt(input.createdAt, normalizeLeadTaskDueAt(defaults.createdAt, new Date().toISOString()));
  return {
    id: normalizeString(input.id, 120) || crypto.randomUUID(),
    kind: normalizeLeadTaskKind(input.kind, defaults.kind || "contact-client"),
    title: normalizeString(input.title, 240) || formatLeadTaskTitle(input.kind || defaults.kind || "contact-client"),
    stage: normalizeLeadStatus(input.stage, defaults.stage || "new"),
    dueAt: normalizeLeadTaskDueAt(input.dueAt, normalizeLeadTaskDueAt(defaults.dueAt, createdAt)),
    status: normalizeLeadTaskStatus(input.status, defaults.status || "open"),
    createdAt,
    updatedAt: normalizeLeadTaskDueAt(input.updatedAt, normalizeLeadTaskDueAt(defaults.updatedAt, createdAt)),
    completedAt: normalizeLeadTaskDueAt(input.completedAt, normalizeLeadTaskDueAt(defaults.completedAt, "")),
    resolution: normalizeString(input.resolution, 80),
    attempt: Math.max(0, Number(input.attempt ?? defaults.attempt ?? 0) || 0),
  };
}

function normalizeLeadTasks(value = [], defaults = {}) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((task) => createLeadTaskRecord(task, defaults))
    .sort((left, right) => {
      const leftDue = Date.parse(left.dueAt) || 0;
      const rightDue = Date.parse(right.dueAt) || 0;
      if (left.status !== right.status) {
        if (left.status === "open") return -1;
        if (right.status === "open") return 1;
      }
      return leftDue - rightDue;
    });
}

function buildDefaultNewLeadTask(entry = {}) {
  const createdAt = normalizeLeadTaskDueAt(entry.createdAt, new Date().toISOString());
  return createLeadTaskRecord(
    {
      kind: "contact-client",
      title: formatLeadTaskTitle("contact-client"),
      stage: "new",
      dueAt: createdAt,
      status: "open",
      createdAt,
      updatedAt: createdAt,
      attempt: 0,
    },
    {
      createdAt,
      dueAt: createdAt,
      stage: "new",
    }
  );
}

function getEntryLeadTasks(entry = {}) {
  const adminLead = getEntryAdminLeadData(entry);
  const tasks = normalizeLeadTasks(adminLead.tasks, {
    createdAt: normalizeLeadTaskDueAt(adminLead.updatedAt, normalizeLeadTaskDueAt(entry.createdAt, new Date().toISOString())),
    stage: getLeadStatus(entry),
  });
  if (tasks.length > 0) return tasks;
  if (getLeadStatus(entry) === "new") {
    return [buildDefaultNewLeadTask(entry)];
  }
  return [];
}

function getEntryOpenLeadTask(entry = {}) {
  return getEntryLeadTasks(entry).find((task) => task.status === "open") || null;
}

function normalizeOrderCompletionAssets(value = [], fallbackKind = "before") {
  const items = Array.isArray(value) ? value : [];
  const normalizedAssets = [];
  const seen = new Set();

  for (const asset of items) {
    if (!asset || typeof asset !== "object") continue;
    const pathValue = normalizeString(asset.path, 500);
    if (!pathValue || seen.has(pathValue)) continue;
    seen.add(pathValue);
    normalizedAssets.push({
      id: normalizeString(asset.id || path.basename(pathValue), 160) || path.basename(pathValue),
      kind: normalizeString(asset.kind, 32).toLowerCase() === "after" ? "after" : fallbackKind,
      path: pathValue,
      fileName: normalizeString(asset.fileName || path.basename(pathValue), 180) || path.basename(pathValue),
      contentType: normalizeString(asset.contentType, 160) || "image/jpeg",
      sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
      uploadedAt: normalizeString(asset.uploadedAt, 80),
    });
    if (normalizedAssets.length >= 40) break;
  }

  return normalizedAssets;
}

function getEntryOrderCompletionData(entry = {}) {
  const adminOrder = getEntryAdminOrderData(entry);
  const completion =
    adminOrder && adminOrder.completion && typeof adminOrder.completion === "object"
      ? adminOrder.completion
      : {};
  return {
    cleanerComment: normalizeString(completion.cleanerComment, 4000),
    beforePhotos: normalizeOrderCompletionAssets(completion.beforePhotos, "before"),
    afterPhotos: normalizeOrderCompletionAssets(completion.afterPhotos, "after"),
    updatedAt: normalizeString(completion.updatedAt, 80),
  };
}

function getEntryAdminClientData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminClient && typeof payload.adminClient === "object" ? payload.adminClient : {};
}

const ADMIN_CLIENT_PROPERTY_TYPE_ALIASES = Object.freeze({
  house: "house",
  home: "house",
  дом: "house",
  apartment: "apartment",
  apt: "apartment",
  flat: "apartment",
  квартира: "apartment",
  office: "office",
  офис: "office",
  airbnb: "airbnb",
});

const ADMIN_CLIENT_PETS_ALIASES = Object.freeze({
  none: "none",
  no: "none",
  нет: "none",
  cat: "cat",
  кошка: "cat",
  dog: "dog",
  собака: "dog",
});

function buildAdminClientAddressKey(value) {
  const normalized = normalizeString(value, 500).toLowerCase();
  return normalized || "no-address";
}

function normalizeAdminClientPropertyType(value) {
  const normalized = normalizeString(value, 40).toLowerCase();
  if (!normalized) return "";
  if (ADMIN_CLIENT_PROPERTY_TYPE_ALIASES[normalized]) {
    return ADMIN_CLIENT_PROPERTY_TYPE_ALIASES[normalized];
  }
  if (normalized.includes("air")) return "airbnb";
  if (normalized.includes("кварт")) return "apartment";
  if (normalized.includes("оф")) return "office";
  if (normalized.includes("дом") || normalized.includes("house") || normalized.includes("home")) return "house";
  return "";
}

function normalizeAdminClientPetsValue(value) {
  const normalized = normalizeString(value, 40).toLowerCase();
  if (!normalized) return "";
  if (ADMIN_CLIENT_PETS_ALIASES[normalized]) {
    return ADMIN_CLIENT_PETS_ALIASES[normalized];
  }
  if (normalized.includes("кош")) return "cat";
  if (normalized.includes("cat")) return "cat";
  if (normalized.includes("соб")) return "dog";
  if (normalized.includes("dog")) return "dog";
  if (normalized.includes("нет") || normalized.includes("none") || normalized === "no") return "none";
  return "";
}

function splitAdminClientAddressSizeDetails(value) {
  const normalized = normalizeString(value, 250);
  if (!normalized) {
    return {
      squareFootage: "",
      roomCount: "",
    };
  }

  const parts = normalized
    .split(/\s*\/\s*/)
    .map((part) => normalizeString(part, 160))
    .filter(Boolean);
  let squareFootage = "";
  let roomCount = "";

  for (const part of parts) {
    const lowerPart = part.toLowerCase();
    if (!squareFootage && /(sq|ft|м2|m2|метр|кв\.?\s*ф|кв\.?\s*м)/i.test(lowerPart)) {
      squareFootage = part;
      continue;
    }
    if (!roomCount && /(room|rooms|bed|beds|комнат|комнаты|спальн)/i.test(lowerPart)) {
      roomCount = part;
      continue;
    }
    if (!squareFootage) {
      squareFootage = part;
      continue;
    }
    if (!roomCount) {
      roomCount = part;
    }
  }

  return {
    squareFootage,
    roomCount,
  };
}

function buildAdminClientAddressSizeDetails(squareFootage, roomCount) {
  const normalizedSquareFootage = normalizeString(squareFootage, 120);
  const normalizedRoomCount = normalizeString(roomCount, 120);
  return [normalizedSquareFootage, normalizedRoomCount].filter(Boolean).join(" / ");
}

function normalizeAdminClientAddressRecordInput(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : { address: value };
  const address = normalizeString(source.address || source.value, 500);
  if (!address) return null;
  const legacySizeDetails = normalizeString(
    source.sizeDetails ||
      source.homeProfile ||
      source.homeSize ||
      source.homeMetrics,
    250
  );
  const legacySizeParts = splitAdminClientAddressSizeDetails(legacySizeDetails);
  const squareFootage = normalizeString(
    source.squareFootage ||
      source.footage ||
      source.size ||
      source.squareMeters ||
      legacySizeParts.squareFootage,
    120
  );
  const roomCount = normalizeString(
    source.roomCount ||
      source.rooms ||
      source.roomLabel ||
      legacySizeParts.roomCount,
    120
  );

  return {
    address,
    propertyType: normalizeAdminClientPropertyType(source.propertyType || source.type || source.objectType),
    squareFootage,
    roomCount,
    sizeDetails: buildAdminClientAddressSizeDetails(squareFootage, roomCount) || legacySizeDetails,
    pets: normalizeAdminClientPetsValue(source.pets || source.petType || source.animals),
    notes: normalizeString(source.notes || source.instructions || source.specialInstructions, 800),
  };
}

function mergeAdminClientAddressRecord(target, source = {}) {
  if (!target || !source) return target;
  if (Object.prototype.hasOwnProperty.call(source, "address")) {
    target.address = normalizeString(source.address, 500);
  }
  if (Object.prototype.hasOwnProperty.call(source, "propertyType")) {
    target.propertyType = normalizeAdminClientPropertyType(source.propertyType);
  }
  if (Object.prototype.hasOwnProperty.call(source, "squareFootage")) {
    target.squareFootage = normalizeString(source.squareFootage, 120);
  }
  if (Object.prototype.hasOwnProperty.call(source, "roomCount")) {
    target.roomCount = normalizeString(source.roomCount, 120);
  }
  if (source.sizeDetails && !target.squareFootage && !target.roomCount) {
    const legacySizeParts = splitAdminClientAddressSizeDetails(source.sizeDetails);
    if (legacySizeParts.squareFootage) target.squareFootage = legacySizeParts.squareFootage;
    if (legacySizeParts.roomCount) target.roomCount = legacySizeParts.roomCount;
  }
  target.sizeDetails = buildAdminClientAddressSizeDetails(target.squareFootage, target.roomCount);
  if (Object.prototype.hasOwnProperty.call(source, "pets")) {
    target.pets = normalizeAdminClientPetsValue(source.pets);
  }
  if (Object.prototype.hasOwnProperty.call(source, "notes")) {
    target.notes = normalizeString(source.notes, 800);
  }
  return target;
}

function normalizeAdminClientAddressBookInput(value) {
  const rawValues = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        rawValues.push(item);
      } else {
        rawValues.push(...String(item || "").split(/\r?\n+/));
      }
    }
  } else if (value && typeof value === "object") {
    rawValues.push(value);
  } else {
    rawValues.push(...String(value || "").split(/\r?\n+/));
  }

  const itemsByKey = new Map();

  for (const rawValue of rawValues) {
    const addressRecord = normalizeAdminClientAddressRecordInput(rawValue);
    if (!addressRecord) continue;
    const key = buildAdminClientAddressKey(addressRecord.address);
    const existing = itemsByKey.get(key);
    if (existing) {
      mergeAdminClientAddressRecord(existing, addressRecord);
    } else {
      itemsByKey.set(key, addressRecord);
    }
  }

  return Array.from(itemsByKey.values());
}

function getEntryAdminClientAddressBook(entry = {}) {
  const adminClient = getEntryAdminClientData(entry);
  return normalizeAdminClientAddressBookInput(adminClient.addressBook);
}

function getEntryAdminClientAddresses(entry = {}) {
  return getEntryAdminClientAddressBook(entry).map((item) => item.address);
}

function getEntryAdminClientRemovedAddressKeys(entry = {}) {
  const adminClient = getEntryAdminClientData(entry);
  const rawValues = Array.isArray(adminClient.removedAddressKeys) ? adminClient.removedAddressKeys : [];
  const normalizedKeys = [];
  const seen = new Set();

  for (const rawValue of rawValues) {
    const key = buildAdminClientAddressKey(rawValue);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalizedKeys.push(key);
  }

  return normalizedKeys;
}

function getOrderSelectedDate(entry = {}) {
  const calculatorData = getEntryCalculatorData(entry);
  return normalizeString(entry.selectedDate || calculatorData.selectedDate, 32);
}

function getOrderSelectedTime(entry = {}) {
  const calculatorData = getEntryCalculatorData(entry);
  return normalizeString(entry.selectedTime || calculatorData.selectedTime, 32);
}

function getOrderServiceType(entry = {}) {
  const calculatorData = getEntryCalculatorData(entry);
  return normalizeOrderServiceType(entry.serviceType || calculatorData.serviceType);
}

function getOrderFrequency(entry = {}) {
  const calculatorData = getEntryCalculatorData(entry);
  const adminOrder = getEntryAdminOrderData(entry);
  return normalizeOrderFrequency(adminOrder.frequency || calculatorData.frequency, "");
}

function getOrderAssignedStaff(entry = {}) {
  const adminOrder = getEntryAdminOrderData(entry);
  return normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 500);
}

function getOrderPaymentStatus(entry = {}) {
  const adminOrder = getEntryAdminOrderData(entry);
  return normalizeOrderPaymentStatus(adminOrder.paymentStatus, "unpaid");
}

function getOrderPaymentMethod(entry = {}) {
  const adminOrder = getEntryAdminOrderData(entry);
  return normalizeOrderPaymentMethod(adminOrder.paymentMethod, "");
}

function isOrderCreatedEntry(entry = {}) {
  const adminOrder = getEntryAdminOrderData(entry);
  if (!adminOrder || typeof adminOrder !== "object") return false;
  if (adminOrder.isCreated === true) return true;
  if (normalizeString(adminOrder.createdAt, 80)) return true;
  if (normalizeOrderStatus(adminOrder.status, "")) return true;
  if (normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 500)) return true;
  if (normalizeString(adminOrder.selectedDate, 32) || normalizeString(adminOrder.selectedTime, 32)) return true;
  if (normalizeOrderFrequency(adminOrder.frequency, "")) return true;
  if (normalizeOrderPaymentMethod(adminOrder.paymentMethod, "")) return true;
  const completion =
    adminOrder.completion && typeof adminOrder.completion === "object"
      ? adminOrder.completion
      : null;
  if (
    completion &&
    (
      normalizeString(completion.cleanerComment, 4000) ||
      (Array.isArray(completion.beforePhotos) && completion.beforePhotos.length > 0) ||
      (Array.isArray(completion.afterPhotos) && completion.afterPhotos.length > 0)
    )
  ) {
    return true;
  }
  return false;
}

function getOrderStatus(entry = {}) {
  if (!isOrderCreatedEntry(entry)) return "new";
  const adminOrder = getEntryAdminOrderData(entry);
  const explicitStatus = normalizeOrderStatus(adminOrder.status, "");
  if (explicitStatus) return explicitStatus;
  if (getOrderSelectedDate(entry) || getOrderSelectedTime(entry)) return "scheduled";
  return "new";
}

function formatOrderScheduleLabel(selectedDate, selectedTime) {
  const normalizedDate = normalizeString(selectedDate, 32);
  const normalizedTime = normalizeString(selectedTime, 32);
  if (!normalizedDate && !normalizedTime) return "Не указаны";
  return formatAdminScheduleLabel(normalizedDate, normalizedTime);
}

function getOrderSearchHaystack(order) {
  return [
    order.customerName,
    order.customerPhone,
    order.customerEmail,
    order.requestId,
    order.fullAddress,
    order.assignedStaff,
    order.paymentStatusLabel,
    order.paymentMethodLabel,
    order.serviceLabel,
    order.frequencyLabel,
    order.orderStatusLabel,
  ]
    .join(" ")
    .toLowerCase();
}

function collectAdminOrderRecords(entries = []) {
  return entries.filter((entry) => isOrderCreatedEntry(entry)).map((entry) => {
    const serviceType = getOrderServiceType(entry);
    const selectedDate = getOrderSelectedDate(entry);
    const selectedTime = getOrderSelectedTime(entry);
    const frequency = getOrderFrequency(entry);
    const assignedStaff = getOrderAssignedStaff(entry);
    const orderStatus = getOrderStatus(entry);
    const paymentStatus = getOrderPaymentStatus(entry);
    const paymentMethod = getOrderPaymentMethod(entry);
    const policyAcceptance = getEntryOrderPolicyAcceptanceData(entry);

    return {
      entry,
      id: normalizeString(entry.id, 120),
      customerName: normalizeString(entry.customerName || "Клиент", 250),
      customerPhone: normalizeString(entry.customerPhone, 80),
      customerEmail: normalizeString(entry.customerEmail, 250),
      requestId: normalizeString(entry.requestId, 120),
      fullAddress: normalizeString(entry.fullAddress, 500),
      createdAt: normalizeString(entry.createdAt, 80),
      serviceType,
      serviceLabel: formatOrderServiceTypeLabel(serviceType),
      frequency,
      frequencyLabel: formatOrderFrequencyLabel(frequency),
      orderStatus,
      orderStatusLabel: formatOrderStatusLabel(orderStatus),
      paymentStatus,
      paymentStatusLabel: formatOrderPaymentStatusLabel(paymentStatus),
      paymentMethod,
      paymentMethodLabel: formatOrderPaymentMethodLabel(paymentMethod),
      assignedStaff,
      selectedDate,
      selectedTime,
      scheduleLabel: formatOrderScheduleLabel(selectedDate, selectedTime),
      hasSchedule: Boolean(selectedDate || selectedTime),
      totalPrice: Number(entry.totalPrice || 0),
      crmStatus: normalizeString(entry.status, 32),
      needsAttention: normalizeString(entry.status, 32) !== "success",
      isAssigned: Boolean(assignedStaff),
      isRecurring: Boolean(frequency),
      policyAcceptance,
      policyAccepted: Boolean(policyAcceptance.policyAccepted),
    };
  });
}

function filterAdminOrderRecords(orderRecords = [], filters = {}) {
  const status = normalizeString(filters.status, 40).toLowerCase();
  const serviceType = normalizeString(filters.serviceType, 40).toLowerCase();
  const frequency = normalizeString(filters.frequency, 40).toLowerCase();
  const assignment = normalizeString(filters.assignment, 40).toLowerCase();
  const query = normalizeString(filters.q, 200).toLowerCase();

  return orderRecords.filter((order) => {
    if (status && status !== "all" && order.orderStatus !== normalizeOrderStatus(status, "")) return false;
    if (serviceType && serviceType !== "all" && order.serviceType !== normalizeOrderServiceType(serviceType, "")) return false;
    if (frequency && frequency !== "all" && order.frequency !== normalizeOrderFrequency(frequency, "")) return false;
    if (assignment === "assigned" && !order.isAssigned) return false;
    if (assignment === "unassigned" && order.isAssigned) return false;
    if (query && !getOrderSearchHaystack(order).includes(query)) return false;
    return true;
  });
}

function countOrdersByStatus(orderRecords = []) {
  const counts = {
    new: 0,
    scheduled: 0,
    "in-progress": 0,
    "invoice-sent": 0,
    paid: 0,
    "awaiting-review": 0,
    completed: 0,
    canceled: 0,
    rescheduled: 0,
  };

  for (const order of orderRecords) {
    if (Object.prototype.hasOwnProperty.call(counts, order.orderStatus)) {
      counts[order.orderStatus] += 1;
    }
  }

  return counts;
}

function getOrdersFilters(req) {
  const reqUrl = getRequestUrl(req);
  const rawStatus = normalizeString(reqUrl.searchParams.get("status"), 40).toLowerCase();
  const rawServiceType = normalizeString(reqUrl.searchParams.get("serviceType"), 40).toLowerCase();
  const rawFrequency = normalizeString(reqUrl.searchParams.get("frequency"), 40).toLowerCase();
  const rawAssignment = normalizeString(reqUrl.searchParams.get("assignment"), 40).toLowerCase();
  const q = normalizeString(reqUrl.searchParams.get("q"), 200);

  return {
    reqUrl,
    filters: {
      status: rawStatus === "all" ? "all" : normalizeOrderStatus(rawStatus, "") || "all",
      serviceType:
        rawServiceType === "all" ? "all" : normalizeOrderServiceType(rawServiceType, "") || "all",
      frequency: rawFrequency === "all" ? "all" : normalizeOrderFrequency(rawFrequency, "") || "all",
      assignment: ORDER_ASSIGNMENT_VALUES.has(rawAssignment) ? rawAssignment : "all",
      q,
    },
  };
}

function buildOrdersReturnPath(value) {
  const candidate = normalizeString(value, 1000);
  if (!candidate) return ADMIN_ORDERS_PATH;

  try {
    const parsed = new URL(candidate, SITE_ORIGIN);
    if (parsed.pathname !== ADMIN_ORDERS_PATH) return ADMIN_ORDERS_PATH;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return ADMIN_ORDERS_PATH;
  }
}

function applyLeadEntryUpdates(entry, updates = {}) {
  if (!entry || typeof entry !== "object") return null;

  const payload = {
    ...getEntryPayload(entry),
  };
  const adminLead = {
    ...getEntryAdminLeadData(entry),
  };
  const timestamp = normalizeLeadTaskDueAt(updates.now, new Date().toISOString());
  const currentStatus = getLeadStatus(entry);
  const hasStatusUpdate = Object.prototype.hasOwnProperty.call(updates, "status");
  const hasTaskAction = Object.prototype.hasOwnProperty.call(updates, "taskAction");
  const hasManagerId = Object.prototype.hasOwnProperty.call(updates, "managerId");
  const hasManagerName = Object.prototype.hasOwnProperty.call(updates, "managerName");
  const hasManagerEmail = Object.prototype.hasOwnProperty.call(updates, "managerEmail");
  const hasNotesUpdate = Object.prototype.hasOwnProperty.call(updates, "notes");
  const hasContactId = Object.prototype.hasOwnProperty.call(updates, "contactId");
  const hasSmsHistory = Object.prototype.hasOwnProperty.call(updates, "smsHistory");
  const hasManagerUpdate = hasManagerId || hasManagerName || hasManagerEmail;
  const managerId = hasManagerId ? normalizeString(updates.managerId, 120) : normalizeString(adminLead.managerId, 120);
  const managerName = hasManagerName ? normalizeString(updates.managerName, 200) : normalizeString(adminLead.managerName, 200);
  const managerEmail = hasManagerEmail ? normalizeString(updates.managerEmail, 250).toLowerCase() : normalizeString(adminLead.managerEmail, 250).toLowerCase();
  const notes = hasNotesUpdate ? normalizeString(updates.notes, 2000) : normalizeString(adminLead.notes, 2000);
  const nextContactAt = normalizeLeadTaskDueAt(
    updates.discussionNextContactAt || updates.nextContactAt,
    normalizeLeadTaskDueAt(adminLead.discussionNextContactAt, "")
  );
  let nextStatus = hasStatusUpdate ? normalizeLeadStatus(updates.status, currentStatus) : currentStatus;
  let noResponseAttempts = Math.max(0, Number(updates.noResponseAttempts ?? adminLead.noResponseAttempts ?? 0) || 0);
  let tasks = getEntryLeadTasks(entry).map((task) => ({ ...task }));
  const taskId = normalizeString(updates.taskId, 120);
  const taskAction = normalizeString(updates.taskAction, 40).toLowerCase();

  function touchTask(task, status, resolution) {
    if (!task) return;
    task.status = normalizeLeadTaskStatus(status, task.status || "open");
    task.resolution = normalizeString(resolution, 80);
    task.updatedAt = timestamp;
    task.completedAt = task.status === "open" ? "" : timestamp;
  }

  function closeOpenTasks(resolution = "stage-changed", status = "canceled") {
    tasks = tasks.map((task) => {
      if (task.status === "open") {
        return {
          ...task,
          status: normalizeLeadTaskStatus(status, "canceled"),
          resolution: normalizeString(resolution, 80),
          updatedAt: timestamp,
          completedAt: timestamp,
        };
      }
      return task;
    });
  }

  function pushTask(kind, stage, dueAt, attempt = 0) {
    const normalizedDueAt =
      normalizeLeadTaskDueAt(dueAt, "") ||
      (kind === "retry-next-morning" ? buildNextChicagoMorningIso(timestamp) : timestamp);
    tasks.push(
      createLeadTaskRecord({
        kind,
        title: formatLeadTaskTitle(kind),
        stage,
        dueAt: normalizedDueAt,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
        attempt,
      })
    );
  }

  if (hasTaskAction) {
    const activeTask =
      tasks.find((task) => task.status === "open" && task.id === taskId) ||
      tasks.find((task) => task.status === "open") ||
      null;

    if (taskAction === "contacted") {
      touchTask(activeTask, "completed", "contacted");
      const targetStatus = normalizeLeadStatus(updates.nextStatus, "discussion");
      closeOpenTasks("contacted-follow-up", "canceled");
      nextStatus = targetStatus;
      noResponseAttempts = 0;
      if (targetStatus === "discussion") {
        pushTask("discussion-followup", "discussion", nextContactAt || addHoursToIso(timestamp, 24));
      } else if (targetStatus === "new") {
        pushTask("contact-client", "new", timestamp, 0);
      } else if (targetStatus === "declined") {
        closeOpenTasks("declined", "canceled");
      }
    } else if (taskAction === "no-answer") {
      touchTask(activeTask, "completed", "no-answer");
      const activeKind = activeTask ? normalizeLeadTaskKind(activeTask.kind, "contact-client") : "contact-client";
      closeOpenTasks("no-answer-follow-up", "canceled");
      if (activeKind === "retry-next-morning" || noResponseAttempts >= 2) {
        nextStatus = "declined";
        noResponseAttempts = 2;
      } else if (activeKind === "retry-3h" || noResponseAttempts >= 1) {
        nextStatus = "no-response";
        noResponseAttempts = 2;
        pushTask("retry-next-morning", "no-response", buildNextChicagoMorningIso(timestamp), 2);
      } else {
        nextStatus = "no-response";
        noResponseAttempts = 1;
        pushTask("retry-3h", "no-response", addHoursToIso(timestamp, 3), 1);
      }
    } else if (taskAction === "complete") {
      touchTask(activeTask, "completed", "completed");
    }
  } else if (hasStatusUpdate) {
    closeOpenTasks("stage-changed", "canceled");
    if (nextStatus === "new") {
      noResponseAttempts = 0;
      pushTask("contact-client", "new", timestamp, 0);
    } else if (nextStatus === "no-response") {
      noResponseAttempts = Math.max(1, noResponseAttempts || 1);
      pushTask("retry-3h", "no-response", addHoursToIso(timestamp, 3), 1);
    } else if (nextStatus === "discussion") {
      noResponseAttempts = 0;
      pushTask("discussion-followup", "discussion", nextContactAt || addHoursToIso(timestamp, 24));
    } else if (nextStatus === "declined") {
      noResponseAttempts = Math.max(noResponseAttempts, 0);
    } else if (nextStatus === "confirmed") {
      noResponseAttempts = 0;
    }
  }

  if (!tasks.some((task) => task.status === "open") && nextStatus === "new") {
    pushTask("contact-client", "new", timestamp, 0);
  }

  const normalizedTasks = normalizeLeadTasks(tasks, {
    createdAt: timestamp,
    stage: nextStatus,
  }).slice(0, 30);

  adminLead.status = nextStatus;
  adminLead.noResponseAttempts = noResponseAttempts;
  adminLead.updatedAt = timestamp;
  if (hasContactId) {
    entry.contactId = normalizeString(updates.contactId, 120);
  }
  if (managerId) {
    adminLead.managerId = managerId;
  } else {
    delete adminLead.managerId;
  }
  if (managerName) {
    adminLead.managerName = managerName;
  } else {
    delete adminLead.managerName;
  }
  if (managerEmail) {
    adminLead.managerEmail = managerEmail;
  } else {
    delete adminLead.managerEmail;
  }
  if (notes) {
    adminLead.notes = notes;
  } else if (hasNotesUpdate) {
    delete adminLead.notes;
  }
  if (nextStatus === "discussion") {
    adminLead.discussionNextContactAt = nextContactAt || (normalizedTasks.find((task) => task.status === "open") || {}).dueAt || "";
  } else {
    delete adminLead.discussionNextContactAt;
  }
  if (nextStatus === "confirmed") {
    adminLead.confirmedAt = normalizeLeadTaskDueAt(adminLead.confirmedAt, timestamp);
  } else {
    delete adminLead.confirmedAt;
  }
  if (nextStatus === "declined") {
    adminLead.declinedAt = normalizeLeadTaskDueAt(adminLead.declinedAt, timestamp);
  } else {
    delete adminLead.declinedAt;
  }
  if (normalizedTasks.length > 0) {
    adminLead.tasks = normalizedTasks;
  } else {
    delete adminLead.tasks;
  }

  const smsHistory = hasSmsHistory
    ? normalizeAdminSmsHistoryEntries(updates.smsHistory, timestamp)
    : getEntrySmsHistory(entry);
  if (smsHistory.length > 0) {
    payload.adminSms = {
      ...getEntryAdminSmsData(entry),
      history: smsHistory,
      updatedAt: timestamp,
    };
  } else {
    delete payload.adminSms;
  }

  payload.adminLead = adminLead;
  entry.updatedAt = timestamp;
  entry.payloadForRetry = payload;

  if (nextStatus === "confirmed") {
    applyOrderEntryUpdates(entry, {
      createOrder: true,
      orderStatus: "new",
    });
  }

  return entry;
}

function normalizeAdminClientPhoneInput(value) {
  let digits = normalizeString(value, 80).replace(/\D+/g, "");
  if (!digits) return "";
  while (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

function applyClientEntryUpdates(entry, updates = {}) {
  if (!entry || typeof entry !== "object") return null;

  const payload = {
    ...getEntryPayload(entry),
  };
  const calculatorData = {
    ...getEntryCalculatorData(entry),
  };
  const contactData =
    payload.contactData && typeof payload.contactData === "object"
      ? { ...payload.contactData }
      : {};
  const legacyContact =
    payload.contact && typeof payload.contact === "object"
      ? { ...payload.contact }
      : null;
  const adminClient = {
    ...getEntryAdminClientData(entry),
  };
  const timestamp = new Date().toISOString();
  const hasName = Object.prototype.hasOwnProperty.call(updates, "name");
  const hasPhone = Object.prototype.hasOwnProperty.call(updates, "phone");
  const hasEmail = Object.prototype.hasOwnProperty.call(updates, "email");
  const hasContactId = Object.prototype.hasOwnProperty.call(updates, "contactId");
  const hasSmsHistory = Object.prototype.hasOwnProperty.call(updates, "smsHistory");

  const customerName = hasName ? normalizeString(updates.name, 250) : normalizeString(entry.customerName, 250);
  const customerPhone = hasPhone ? normalizeAdminClientPhoneInput(updates.phone) : normalizeAdminClientPhoneInput(entry.customerPhone);
  const customerEmail = hasEmail
    ? normalizeString(updates.email, 250).toLowerCase()
    : normalizeString(entry.customerEmail, 250).toLowerCase();
  const addressBook = normalizeAdminClientAddressBookInput(
    updates.addressBook || updates.addresses || updates.address || adminClient.addressBook || []
  );
  const nextAddressKeys = new Set(addressBook.map((item) => buildAdminClientAddressKey(item.address)));
  const removedAddressKeys = new Set([
    ...getEntryAdminClientRemovedAddressKeys(entry),
    ...(Array.isArray(updates.removedAddressKeys) ? updates.removedAddressKeys.map((item) => buildAdminClientAddressKey(item)) : []),
  ]);

  entry.customerName = customerName;
  entry.customerPhone = customerPhone;
  entry.customerEmail = customerEmail;
  entry.updatedAt = timestamp;
  if (hasContactId) {
    entry.contactId = normalizeString(updates.contactId, 120);
  }

  if (customerName) {
    contactData.fullName = customerName;
  } else if (hasName) {
    delete contactData.fullName;
  }

  if (customerPhone) {
    contactData.phone = customerPhone;
  } else if (hasPhone) {
    delete contactData.phone;
  }

  if (customerEmail) {
    contactData.email = customerEmail;
  } else if (hasEmail) {
    delete contactData.email;
  }

  if (Object.keys(contactData).length > 0) {
    payload.contactData = contactData;
  } else {
    delete payload.contactData;
  }

  if (legacyContact) {
    if (customerName) {
      legacyContact.fullName = customerName;
    } else if (hasName) {
      delete legacyContact.fullName;
    }
    if (customerPhone) {
      legacyContact.phone = customerPhone;
    } else if (hasPhone) {
      delete legacyContact.phone;
    }
    if (customerEmail) {
      legacyContact.email = customerEmail;
    } else if (hasEmail) {
      delete legacyContact.email;
    }
    payload.contact = legacyContact;
  }

  for (const key of nextAddressKeys) {
    removedAddressKeys.delete(key);
  }

  if (addressBook.length > 0) {
    adminClient.addressBook = addressBook;
  } else {
    delete adminClient.addressBook;
  }

  if (removedAddressKeys.size > 0) {
    adminClient.removedAddressKeys = Array.from(removedAddressKeys);
  } else {
    delete adminClient.removedAddressKeys;
  }

  if (
    (Array.isArray(adminClient.addressBook) && adminClient.addressBook.length > 0) ||
    (Array.isArray(adminClient.removedAddressKeys) && adminClient.removedAddressKeys.length > 0)
  ) {
    adminClient.updatedAt = timestamp;
    payload.adminClient = adminClient;
  } else {
    delete adminClient.updatedAt;
    delete payload.adminClient;
  }

  payload.calculatorData = calculatorData;
  const smsHistory = hasSmsHistory
    ? normalizeAdminSmsHistoryEntries(updates.smsHistory, timestamp)
    : getEntrySmsHistory(entry);
  if (smsHistory.length > 0) {
    payload.adminSms = {
      ...getEntryAdminSmsData(entry),
      history: smsHistory,
      updatedAt: timestamp,
    };
  } else {
    delete payload.adminSms;
  }
  entry.payloadForRetry = payload;

  return entry;
}

function applyOrderEntryUpdates(entry, updates = {}) {
  if (!entry || typeof entry !== "object") return null;

  const payload = {
    ...getEntryPayload(entry),
  };
  const calculatorData = {
    ...getEntryCalculatorData(entry),
  };
  const currentAdminOrder = getEntryAdminOrderData(entry);
  const adminOrder = {
    ...currentAdminOrder,
  };
  const currentCompletion = getEntryOrderCompletionData(entry);
  const timestamp = new Date().toISOString();
  const removeOrder = Boolean(updates.removeOrder);
  const hasExplicitOrderUpdates = Object.keys(updates).some((key) => key !== "removeOrder" && key !== "createOrder");
  const shouldCreateOrder = Boolean(updates.createOrder) || hasExplicitOrderUpdates || isOrderCreatedEntry(entry);

  if (removeOrder) {
    delete payload.adminOrder;
    entry.updatedAt = timestamp;
    entry.payloadForRetry = payload;
    return entry;
  }

  const hasSelectedDate = Object.prototype.hasOwnProperty.call(updates, "selectedDate");
  const hasSelectedTime = Object.prototype.hasOwnProperty.call(updates, "selectedTime");
  const hasFrequency = Object.prototype.hasOwnProperty.call(updates, "frequency");
  const hasAssignedStaff = Object.prototype.hasOwnProperty.call(updates, "assignedStaff");
  const hasPaymentStatus = Object.prototype.hasOwnProperty.call(updates, "paymentStatus");
  const hasPaymentMethod = Object.prototype.hasOwnProperty.call(updates, "paymentMethod");
  const hasTotalPrice = Object.prototype.hasOwnProperty.call(updates, "totalPrice");
  const hasCleanerComment = Object.prototype.hasOwnProperty.call(updates, "cleanerComment");
  const hasBeforePhotos = Object.prototype.hasOwnProperty.call(updates, "completionBeforePhotos");
  const hasAfterPhotos = Object.prototype.hasOwnProperty.call(updates, "completionAfterPhotos");
  const hasPolicyAcceptance = Object.prototype.hasOwnProperty.call(updates, "policyAcceptance");
  const hasContactId = Object.prototype.hasOwnProperty.call(updates, "contactId");
  const hasSmsHistory = Object.prototype.hasOwnProperty.call(updates, "smsHistory");

  const selectedDate = hasSelectedDate
    ? normalizeAdminOrderDateInput(updates.selectedDate)
    : normalizeAdminOrderDateInput(adminOrder.selectedDate || entry.selectedDate || calculatorData.selectedDate);
  const selectedTime = hasSelectedTime
    ? normalizeAdminOrderTimeInput(updates.selectedTime)
    : normalizeAdminOrderTimeInput(adminOrder.selectedTime || entry.selectedTime || calculatorData.selectedTime);
  const frequency = hasFrequency
    ? normalizeOrderFrequency(updates.frequency, "")
    : normalizeOrderFrequency(adminOrder.frequency || calculatorData.frequency, "");
  const assignedStaff = hasAssignedStaff
    ? normalizeString(updates.assignedStaff, 500)
    : normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 500);
  const paymentStatus = hasPaymentStatus
    ? normalizeOrderPaymentStatus(updates.paymentStatus, "unpaid")
    : normalizeOrderPaymentStatus(adminOrder.paymentStatus, "unpaid");
  const paymentMethod = hasPaymentMethod
    ? normalizeOrderPaymentMethod(updates.paymentMethod, "")
    : normalizeOrderPaymentMethod(adminOrder.paymentMethod, "");
  const currentTotalPrice = normalizeAdminOrderPriceInput(
    calculatorData.totalPrice === 0 || calculatorData.totalPrice ? calculatorData.totalPrice : entry.totalPrice,
    Number.isFinite(Number(entry.totalPrice)) ? Number(entry.totalPrice) : 0
  );
  const totalPrice = hasTotalPrice
    ? normalizeAdminOrderPriceInput(updates.totalPrice, currentTotalPrice)
    : currentTotalPrice;
  const totalPriceCents = Math.round(Number(totalPrice || 0) * 100);
  const orderStatus = normalizeOrderStatus(
    updates.orderStatus,
    normalizeOrderStatus(adminOrder.status, "") || (shouldCreateOrder ? getOrderStatus(entry) : "new")
  );
  const cleanerComment = hasCleanerComment
    ? normalizeString(updates.cleanerComment, 4000)
    : currentCompletion.cleanerComment;
  const beforePhotos = hasBeforePhotos
    ? normalizeOrderCompletionAssets(updates.completionBeforePhotos, "before")
    : currentCompletion.beforePhotos;
  const afterPhotos = hasAfterPhotos
    ? normalizeOrderCompletionAssets(updates.completionAfterPhotos, "after")
    : currentCompletion.afterPhotos;
  const currentPolicyAcceptance =
    adminOrder.policyAcceptance && typeof adminOrder.policyAcceptance === "object"
      ? adminOrder.policyAcceptance
      : {};

  entry.selectedDate = selectedDate;
  entry.selectedTime = selectedTime;
  entry.totalPrice = Number(totalPrice || 0);
  entry.totalPriceCents = totalPriceCents;
  entry.updatedAt = timestamp;
  if (hasContactId) {
    entry.contactId = normalizeString(updates.contactId, 120);
  }

  calculatorData.selectedDate = selectedDate;
  calculatorData.selectedTime = selectedTime;
  calculatorData.totalPrice = Number(totalPrice || 0);
  calculatorData.totalPriceCents = totalPriceCents;
  if (frequency) {
    calculatorData.frequency = frequency;
  } else {
    delete calculatorData.frequency;
  }

  adminOrder.status = orderStatus;
  adminOrder.isCreated = Boolean(shouldCreateOrder);
  adminOrder.frequency = frequency;
  adminOrder.assignedStaff = assignedStaff;
  adminOrder.paymentStatus = paymentStatus;
  if (paymentMethod) {
    adminOrder.paymentMethod = paymentMethod;
  } else {
    delete adminOrder.paymentMethod;
  }
  adminOrder.totalPrice = Number(totalPrice || 0);
  adminOrder.selectedDate = selectedDate;
  adminOrder.selectedTime = selectedTime;
  adminOrder.updatedAt = timestamp;
  if (!adminOrder.createdAt) adminOrder.createdAt = timestamp;

  if (cleanerComment || beforePhotos.length > 0 || afterPhotos.length > 0) {
    adminOrder.completion = {
      cleanerComment,
      beforePhotos,
      afterPhotos,
      updatedAt: timestamp,
    };
  } else {
    delete adminOrder.completion;
  }

  if (hasPolicyAcceptance) {
    if (updates.policyAcceptance && typeof updates.policyAcceptance === "object") {
      adminOrder.policyAcceptance = { ...updates.policyAcceptance };
      adminOrder.policyAccepted = Boolean(updates.policyAcceptance.policyAccepted);
    } else {
      delete adminOrder.policyAcceptance;
      delete adminOrder.policyAccepted;
    }
  } else if (Object.keys(currentPolicyAcceptance).length > 0) {
    adminOrder.policyAcceptance = { ...currentPolicyAcceptance };
    adminOrder.policyAccepted = Boolean(
      adminOrder.policyAccepted || currentPolicyAcceptance.policyAccepted
    );
  } else {
    delete adminOrder.policyAcceptance;
    delete adminOrder.policyAccepted;
  }

  payload.calculatorData = calculatorData;
  payload.adminOrder = adminOrder;
  const smsHistory = hasSmsHistory
    ? normalizeAdminSmsHistoryEntries(updates.smsHistory, timestamp)
    : getEntrySmsHistory(entry);
  if (smsHistory.length > 0) {
    payload.adminSms = {
      ...getEntryAdminSmsData(entry),
      history: smsHistory,
      updatedAt: timestamp,
    };
  } else {
    delete payload.adminSms;
  }
  entry.payloadForRetry = payload;

  return entry;
}

function maskSecretPreview(value, visibleEnd = 4) {
  const raw = normalizeString(value, 512);
  if (!raw) return "Missing";
  if (raw.length <= visibleEnd) return `${"*".repeat(raw.length)}`;
  return `${"*".repeat(Math.max(6, raw.length - visibleEnd))}${raw.slice(-visibleEnd)}`;
}

function getQuoteOpsFilters(req) {
  const reqUrl = getRequestUrl(req);
  const section = normalizeString(reqUrl.searchParams.get("section"), 32).toLowerCase();
  const status = normalizeString(reqUrl.searchParams.get("status"), 32).toLowerCase();
  const serviceType = normalizeString(reqUrl.searchParams.get("serviceType"), 32).toLowerCase();
  const leadStatus = normalizeString(reqUrl.searchParams.get("leadStatus"), 40).toLowerCase();
  const managerId = normalizeString(reqUrl.searchParams.get("managerId"), 120);
  const q = normalizeString(reqUrl.searchParams.get("q"), 200);
  return {
    reqUrl,
    filters: {
      section: ["funnel", "tasks", "list"].includes(section) ? section : "list",
      status: status || "all",
      serviceType: serviceType || "all",
      leadStatus: leadStatus || "all",
      managerId,
      q,
    },
  };
}

function normalizePhoneFilterValue(value) {
  return normalizeString(value, 80).replace(/\D+/g, "");
}

function getAdminClientsFilters(req) {
  const reqUrl = getRequestUrl(req);
  const q = normalizeString(reqUrl.searchParams.get("q"), 250);
  const name = normalizeString(reqUrl.searchParams.get("name"), 200);
  const email = normalizeString(reqUrl.searchParams.get("email"), 250).toLowerCase();
  const phone = normalizeString(reqUrl.searchParams.get("phone"), 80);
  const client = normalizeString(reqUrl.searchParams.get("client"), 250).toLowerCase();
  const addressKey = normalizeString(reqUrl.searchParams.get("addressKey"), 500).toLowerCase();
  return {
    reqUrl,
    filters: {
      q,
      name,
      email,
      phone,
      client,
      addressKey,
    },
  };
}

function collectAdminClientRecords(entries = []) {
  const clients = [];

  function createAddressRecord(address) {
    const normalizedInput = normalizeAdminClientAddressRecordInput(address) || { address: normalizeString(address, 500) };
    const normalizedAddress = normalizeString(normalizedInput.address, 500);
    return {
      key: buildAdminClientAddressKey(normalizedAddress),
      address: normalizedAddress,
      propertyType: normalizeAdminClientPropertyType(normalizedInput.propertyType),
      squareFootage: normalizeString(normalizedInput.squareFootage, 120),
      roomCount: normalizeString(normalizedInput.roomCount, 120),
      sizeDetails: normalizeString(normalizedInput.sizeDetails, 250),
      pets: normalizeAdminClientPetsValue(normalizedInput.pets),
      notes: normalizeString(normalizedInput.notes, 800),
      latestCreatedAt: "",
      latestCreatedAtMs: 0,
      latestRequestId: "",
      latestService: "",
      latestStatus: "",
      requestCount: 0,
      totalRevenue: 0,
      statuses: [],
      entries: [],
    };
  }

  function ensureAddressRecord(client, address) {
    const normalizedInput = normalizeAdminClientAddressRecordInput(address) || { address: normalizeString(address, 500) };
    const normalizedAddress = normalizeString(normalizedInput.address, 500);
    const addressKey = buildAdminClientAddressKey(normalizedAddress);
    let addressRecord = client.addressesByKey.get(addressKey);
    if (!addressRecord) {
      addressRecord = createAddressRecord(normalizedInput);
      client.addressesByKey.set(addressKey, addressRecord);
    } else {
      mergeAdminClientAddressRecord(addressRecord, normalizedInput);
    }
    return addressRecord;
  }

  function createClientRecord(key, input = {}) {
    return {
      key,
      phoneKey: normalizeString(input.phoneKey, 80),
      emailKey: normalizeString(input.emailKey, 250).toLowerCase(),
      fallbackKey: normalizeString(input.fallbackKey, 500),
      name: normalizeString(input.name, 250),
      email: normalizeString(input.email, 250).toLowerCase(),
      phone: normalizeString(input.phone, 80),
      address: normalizeString(input.address, 500),
      latestCreatedAt: normalizeString(input.createdAt, 80),
      latestCreatedAtMs: Number.isFinite(input.createdAtMs) ? input.createdAtMs : 0,
      latestRequestId: normalizeString(input.requestId, 120),
      latestService: normalizeString(input.serviceName, 120),
      latestStatus: normalizeString(input.status, 32).toLowerCase(),
      requestCount: 0,
      totalRevenue: 0,
      statuses: [],
      entries: [],
      addressesByKey: new Map(),
      removedAddressKeys: new Set(),
    };
  }

  for (const entry of entries) {
    const name = normalizeString(entry.customerName || "Клиент", 250);
    const normalizedName = name.toLowerCase();
    const email = normalizeString(entry.customerEmail, 250).toLowerCase();
    const phone = normalizeString(entry.customerPhone, 80);
    const phoneKey = normalizePhoneFilterValue(phone);
    const address = normalizeString(entry.fullAddress, 500);
    const normalizedAddress = address.toLowerCase();
    const requestId = normalizeString(entry.requestId, 120);
    const serviceName = normalizeString(entry.serviceName || entry.serviceType, 120);
    const status = normalizeString(entry.status, 32).toLowerCase();
    const createdAt = normalizeString(entry.createdAt, 80);
    const createdAtMs = Date.parse(createdAt);
    const addressBook = getEntryAdminClientAddressBook(entry);
    const removedAddressKeys = getEntryAdminClientRemovedAddressKeys(entry);
    const nameAddressKey = normalizeString([normalizedName, normalizedAddress].filter(Boolean).join("|"), 500);
    let client = null;

    if (phoneKey) {
      client = clients.find((candidate) => candidate.phoneKey === phoneKey) || null;
      if (!client && email) {
        client = clients.find((candidate) => !candidate.phoneKey && candidate.emailKey === email) || null;
      }
      if (!client && nameAddressKey) {
        client = clients.find((candidate) => !candidate.phoneKey && !candidate.emailKey && candidate.fallbackKey === nameAddressKey) || null;
      }
    } else if (email) {
      client = clients.find((candidate) => candidate.emailKey === email) || null;
      if (!client && nameAddressKey) {
        client = clients.find((candidate) => !candidate.phoneKey && candidate.fallbackKey === nameAddressKey) || null;
      }
    } else if (nameAddressKey) {
      client = clients.find((candidate) => !candidate.phoneKey && !candidate.emailKey && candidate.fallbackKey === nameAddressKey) || null;
    }

    if (!client) {
      client = createClientRecord(phoneKey || email || nameAddressKey || normalizeString(entry.id, 120), {
        phoneKey,
        emailKey: email,
        fallbackKey: nameAddressKey,
        name,
        email,
        phone,
        address,
        createdAt,
        createdAtMs,
        requestId,
        serviceName,
        status,
      });
      clients.push(client);
    } else {
      if (phoneKey) {
        client.phoneKey = phoneKey;
        client.key = phoneKey;
      }
      if (!client.emailKey && email) client.emailKey = email;
      if (!client.fallbackKey && nameAddressKey) client.fallbackKey = nameAddressKey;
    }

    client.requestCount += 1;
    client.totalRevenue += Number(entry.totalPrice || 0);
    if (!client.email && email) client.email = email;
    if (!client.phone && phone) client.phone = phone;
    if (!client.name && name) client.name = name;
    if (!client.address && address) client.address = address;
    if (status && !client.statuses.includes(status)) client.statuses.push(status);

    client.entries.push({
      ...entry,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      fullAddress: address,
      requestId,
      serviceName,
      status,
      createdAt,
    });

    for (const removedAddressKey of removedAddressKeys) {
      client.removedAddressKeys.add(removedAddressKey);
      client.addressesByKey.delete(removedAddressKey);
    }

    const currentAddressKey = buildAdminClientAddressKey(address);
    if (!client.removedAddressKeys.has(currentAddressKey)) {
      const addressRecord = ensureAddressRecord(client, address);
      addressRecord.requestCount += 1;
      addressRecord.totalRevenue += Number(entry.totalPrice || 0);
      if (status && !addressRecord.statuses.includes(status)) addressRecord.statuses.push(status);
      addressRecord.entries.push({
        ...entry,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        fullAddress: address,
        requestId,
        serviceName,
        status,
        createdAt,
      });

      const isAddressNewer =
        Number.isFinite(createdAtMs) && createdAtMs >= addressRecord.latestCreatedAtMs;
      if (isAddressNewer || (!addressRecord.latestCreatedAt && createdAt)) {
        addressRecord.latestCreatedAt = createdAt;
        addressRecord.latestCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : addressRecord.latestCreatedAtMs;
        addressRecord.latestRequestId = requestId;
        addressRecord.latestService = serviceName;
        addressRecord.latestStatus = status;
        if (address) addressRecord.address = address;
      }
    }

    for (const manualAddress of addressBook) {
      if (client.removedAddressKeys.has(buildAdminClientAddressKey(manualAddress.address))) continue;
      ensureAddressRecord(client, manualAddress);
    }

    const isNewer =
      Number.isFinite(createdAtMs) && createdAtMs >= client.latestCreatedAtMs;
    if (isNewer || (!client.latestCreatedAt && createdAt)) {
      client.latestCreatedAt = createdAt;
      client.latestCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : client.latestCreatedAtMs;
      client.latestRequestId = requestId;
      client.latestService = serviceName;
      client.latestStatus = status;
      if (address) client.address = address;
      if (name) client.name = name;
      if (email) client.email = email;
      if (phone) client.phone = phone;
    }
  }

  return clients
    .map((client) => ({
      ...client,
      address: Array.from(client.addressesByKey.values())
        .sort((left, right) => {
          if (right.latestCreatedAtMs !== left.latestCreatedAtMs) {
            return right.latestCreatedAtMs - left.latestCreatedAtMs;
          }
          return normalizeString(left.address, 500).localeCompare(normalizeString(right.address, 500), "ru");
        })[0]?.address || "",
      addressCount: client.addressesByKey.size,
      addresses: Array.from(client.addressesByKey.values())
        .map((addressRecord) => ({
          ...addressRecord,
          entries: addressRecord.entries
            .slice()
            .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "")),
        }))
        .sort((left, right) => {
          if (right.latestCreatedAtMs !== left.latestCreatedAtMs) {
            return right.latestCreatedAtMs - left.latestCreatedAtMs;
          }
          return normalizeString(left.address, 500).localeCompare(normalizeString(right.address, 500), "ru");
        }),
      removedAddressKeys: Array.from(client.removedAddressKeys.values()),
      entries: client.entries
        .slice()
        .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "")),
    }))
    .sort((left, right) => {
      if (right.latestCreatedAtMs !== left.latestCreatedAtMs) {
        return right.latestCreatedAtMs - left.latestCreatedAtMs;
      }
      return normalizeString(left.name, 250).localeCompare(normalizeString(right.name, 250), "ru");
    });
}

function filterAdminClientRecords(clientRecords = [], filters = {}) {
  const q = normalizeString(filters.q, 250).toLowerCase();
  const qPhone = normalizePhoneFilterValue(filters.q);
  const name = normalizeString(filters.name, 200).toLowerCase();
  const email = normalizeString(filters.email, 250).toLowerCase();
  const phone = normalizePhoneFilterValue(filters.phone);

  return clientRecords.filter((client) => {
    if (q) {
      const haystack = [
        normalizeString(client.name, 250).toLowerCase(),
        normalizeString(client.email, 250).toLowerCase(),
        normalizeString(client.phone, 80).toLowerCase(),
        normalizeString(client.address, 500).toLowerCase(),
        ...(Array.isArray(client.addresses)
          ? client.addresses.map((addressRecord) => normalizeString(addressRecord.address, 500).toLowerCase())
          : []),
        normalizeString(client.latestRequestId, 120).toLowerCase(),
        normalizeString(client.latestService, 120).toLowerCase(),
        ...client.entries.flatMap((entry) => [
          normalizeString(entry.requestId, 120).toLowerCase(),
          normalizeString(entry.fullAddress, 500).toLowerCase(),
          normalizeString(entry.serviceName || entry.serviceType, 120).toLowerCase(),
        ]),
      ].join("\n");
      const matchesPhone = qPhone ? normalizePhoneFilterValue(client.phone).includes(qPhone) : false;
      if (!haystack.includes(q) && !matchesPhone) return false;
    }
    if (name && !normalizeString(client.name, 250).toLowerCase().includes(name)) return false;
    if (email && !normalizeString(client.email, 250).toLowerCase().includes(email)) return false;
    if (phone && !normalizePhoneFilterValue(client.phone).includes(phone)) return false;
    return true;
  });
}

function buildQuoteOpsReturnPath(value) {
  const candidate = normalizeString(value, 1000);
  if (!candidate) return ADMIN_QUOTE_OPS_PATH;

  try {
    const parsed = new URL(candidate, SITE_ORIGIN);
    if (parsed.pathname !== ADMIN_QUOTE_OPS_PATH) return ADMIN_QUOTE_OPS_PATH;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return ADMIN_QUOTE_OPS_PATH;
  }
}

function buildAdminRedirectPath(basePath, params = {}) {
  const url = new URL(basePath, SITE_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function buildAdminQrMarkup(text) {
  if (!QRCode || !text) return "";
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      width: 220,
      color: {
        dark: "#18181b",
        light: "#ffffff",
      },
    });
    return `<img class="admin-qr-image" src="${escapeHtmlText(dataUrl)}" alt="Authenticator QR code">`;
  } catch {
    return "";
  }
}

  return {
    applyLeadEntryUpdates,
    applyClientEntryUpdates,
    applyOrderEntryUpdates,
    buildAdminQrMarkup,
    buildAdminRedirectPath,
    buildOrdersReturnPath,
    buildQuoteOpsReturnPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectAdminOrderRecords,
    countOrdersByStatus,
    filterAdminClientRecords,
    filterAdminOrderRecords,
    formatAdminCalendarDate,
    formatAdminClockTime,
    formatAdminDateTime,
    formatAdminOrderDateInputValue,
    formatAdminOrderPriceInputValue,
    formatAdminOrderTimeInputValue,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatCurrencyAmount,
    formatLeadStatusLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    getAdminAuthState,
    getAdminCookieOptions,
    getAdminClientsFilters,
    getEntryAdminOrderData,
    getEntryAdminLeadData,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getLeadStatus,
    getOrderStatus,
    getOrdersFilters,
    getQuoteOpsFilters,
    isOrderCreatedEntry,
    normalizeLeadStatus,
    normalizeOrderStatus,
    renderAssignmentStatusBadge,
    renderStaffStatusBadge,
  };
}

module.exports = {
  createAdminDomainHelpers,
};
