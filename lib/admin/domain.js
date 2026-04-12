"use strict";

const crypto = require("crypto");

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
  const staff = Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff.slice() : [];
  const assignments = Array.isArray(staffSnapshot.assignments) ? staffSnapshot.assignments.slice() : [];
  const staffById = new Map(staff.map((record) => [record.id, record]));
  const assignmentsByEntryId = new Map(assignments.map((record) => [record.entryId, record]));
  const orderItems = entries
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

  const now = Date.now();
  const weekAhead = now + (7 * 24 * 60 * 60 * 1000);
  const orderItemsByEntryId = new Map(orderItems.map((item) => [item.entry.id, item]));
  const staffSummaries = staff.map((record) => {
    const assignedOrders = orderItems.filter((item) => item.assignedStaff.some((staffRecord) => staffRecord.id === record.id));
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

  const scheduledOrders = orderItems.filter((item) => item.hasSchedule);
  const assignedScheduledCount = scheduledOrders.filter((item) => item.assignedStaff.length > 0).length;
  const unassignedScheduledCount = scheduledOrders.filter((item) => item.assignedStaff.length === 0).length;

  return {
    staff,
    assignments,
    staffById,
    assignmentsByEntryId,
    orderItems,
    orderItemsByEntryId,
    staffSummaries,
    scheduledOrders,
    assignedScheduledCount,
    unassignedScheduledCount,
    activeStaffCount: staff.filter((record) => record.status === "active").length,
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

function normalizeOrderStatus(value, fallback = "") {
  const normalized = normalizeString(value, 40).toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");
  if (!compact) return fallback;
  if (compact === "new") return "new";
  if (compact === "scheduled") return "scheduled";
  if (compact === "inprogress") return "in-progress";
  if (compact === "completed") return "completed";
  if (compact === "canceled" || compact === "cancelled") return "canceled";
  if (compact === "rescheduled") return "rescheduled";
  return fallback;
}

function formatOrderStatusLabel(value) {
  const normalized = normalizeOrderStatus(value, "new");
  if (normalized === "scheduled") return "Scheduled";
  if (normalized === "in-progress") return "In progress";
  if (normalized === "completed") return "Completed";
  if (normalized === "canceled") return "Canceled";
  if (normalized === "rescheduled") return "Rescheduled";
  return "New";
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

function normalizeAdminClientAddressRecordInput(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : { address: value };
  const address = normalizeString(source.address || source.value, 500);
  if (!address) return null;

  return {
    address,
    propertyType: normalizeAdminClientPropertyType(source.propertyType || source.type || source.objectType),
    sizeDetails: normalizeString(
      source.sizeDetails ||
        source.homeProfile ||
        source.homeSize ||
        source.homeMetrics ||
        source.squareFootage ||
        source.rooms,
      250
    ),
    pets: normalizeAdminClientPetsValue(source.pets || source.petType || source.animals),
    notes: normalizeString(source.notes || source.instructions || source.specialInstructions, 800),
  };
}

function mergeAdminClientAddressRecord(target, source = {}) {
  if (!target || !source) return target;
  if (source.address) target.address = normalizeString(source.address, 500);
  if (source.propertyType) target.propertyType = normalizeAdminClientPropertyType(source.propertyType);
  if (source.sizeDetails) target.sizeDetails = normalizeString(source.sizeDetails, 250);
  if (source.pets) target.pets = normalizeAdminClientPetsValue(source.pets);
  if (source.notes) target.notes = normalizeString(source.notes, 800);
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
  return normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 120);
}

function getOrderStatus(entry = {}) {
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
    order.serviceLabel,
    order.frequencyLabel,
    order.orderStatusLabel,
  ]
    .join(" ")
    .toLowerCase();
}

function collectAdminOrderRecords(entries = []) {
  return entries.map((entry) => {
    const serviceType = getOrderServiceType(entry);
    const selectedDate = getOrderSelectedDate(entry);
    const selectedTime = getOrderSelectedTime(entry);
    const frequency = getOrderFrequency(entry);
    const assignedStaff = getOrderAssignedStaff(entry);
    const orderStatus = getOrderStatus(entry);

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

  const customerName = normalizeString(updates.name, 250);
  const customerPhone = normalizeAdminClientPhoneInput(updates.phone);
  const customerEmail = normalizeString(updates.email, 250).toLowerCase();
  const addressBook = normalizeAdminClientAddressBookInput(
    updates.addressBook || updates.addresses || updates.address || adminClient.addressBook || []
  );

  entry.customerName = customerName;
  entry.customerPhone = customerPhone;
  entry.customerEmail = customerEmail;
  entry.updatedAt = timestamp;

  if (customerName) {
    contactData.fullName = customerName;
  } else {
    delete contactData.fullName;
  }

  if (customerPhone) {
    contactData.phone = customerPhone;
  } else {
    delete contactData.phone;
  }

  if (customerEmail) {
    contactData.email = customerEmail;
  } else {
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
    } else {
      delete legacyContact.fullName;
    }
    if (customerPhone) {
      legacyContact.phone = customerPhone;
    } else {
      delete legacyContact.phone;
    }
    if (customerEmail) {
      legacyContact.email = customerEmail;
    } else {
      delete legacyContact.email;
    }
    payload.contact = legacyContact;
  }

  if (addressBook.length > 0) {
    adminClient.addressBook = addressBook;
    adminClient.updatedAt = timestamp;
    payload.adminClient = adminClient;
  } else {
    delete adminClient.addressBook;
    delete adminClient.updatedAt;
    delete payload.adminClient;
  }

  payload.calculatorData = calculatorData;
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
  const timestamp = new Date().toISOString();

  const selectedDate = normalizeAdminOrderDateInput(updates.selectedDate);
  const selectedTime = normalizeAdminOrderTimeInput(updates.selectedTime);
  const frequency = normalizeOrderFrequency(updates.frequency, "");
  const assignedStaff = normalizeString(updates.assignedStaff, 120);
  const orderStatus = normalizeOrderStatus(
    updates.orderStatus,
    normalizeOrderStatus(adminOrder.status, "") || getOrderStatus(entry)
  );

  entry.selectedDate = selectedDate;
  entry.selectedTime = selectedTime;
  entry.updatedAt = timestamp;

  calculatorData.selectedDate = selectedDate;
  calculatorData.selectedTime = selectedTime;
  if (frequency) {
    calculatorData.frequency = frequency;
  } else {
    delete calculatorData.frequency;
  }

  adminOrder.status = orderStatus;
  adminOrder.frequency = frequency;
  adminOrder.assignedStaff = assignedStaff;
  adminOrder.updatedAt = timestamp;
  if (!adminOrder.createdAt) adminOrder.createdAt = timestamp;

  payload.calculatorData = calculatorData;
  payload.adminOrder = adminOrder;
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
  const status = normalizeString(reqUrl.searchParams.get("status"), 32).toLowerCase();
  const serviceType = normalizeString(reqUrl.searchParams.get("serviceType"), 32).toLowerCase();
  const q = normalizeString(reqUrl.searchParams.get("q"), 200);
  return {
    reqUrl,
    filters: {
      status: status || "all",
      serviceType: serviceType || "all",
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

    for (const manualAddress of addressBook) {
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
    formatAdminOrderTimeInputValue,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatCurrencyAmount,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    getAdminAuthState,
    getAdminCookieOptions,
    getAdminClientsFilters,
    getOrdersFilters,
    getQuoteOpsFilters,
    normalizeOrderStatus,
    renderAssignmentStatusBadge,
    renderStaffStatusBadge,
  };
}

module.exports = {
  createAdminDomainHelpers,
};
