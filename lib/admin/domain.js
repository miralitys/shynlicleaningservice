"use strict";

const crypto = require("crypto");
const path = require("path");
const { createAdminClientDomain } = require("./domain-clients");
const { createAdminDomainFormatters } = require("./domain-formatters");
const { createAdminLeadDomain } = require("./domain-leads");
const { createAdminOrderDomain } = require("./domain-orders");
const {
  getEntryOrderCompletionData: getPersistedOrderCompletionData,
  getEntryOrderPolicyAcceptanceData: getPersistedOrderPolicyAcceptanceData,
  getEntryOrderState: getPersistedOrderState,
  getEntryPayload: getPersistedEntryPayload,
  getEntryPaymentState: getPersistedPaymentState,
  setEntryOrderState,
  setEntryPaymentState,
} = require("../admin-order-state");

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
    path: "/",
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

  const {
    formatCurrencyAmount,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatAdminCalendarDate,
    formatAdminClockTime,
    normalizeAdminOrderDateInput,
    formatAdminOrderDateInputValue,
    normalizeAdminOrderPriceInput,
    formatAdminOrderPriceInputValue,
    normalizeAdminOrderTimeInput,
    formatAdminOrderTimeInputValue,
    formatAdminScheduleLabel,
    toAdminScheduleTimestamp,
    formatStaffStatusLabel,
    formatAssignmentStatusLabel,
    renderStaffStatusBadge,
    renderAssignmentStatusBadge,
  } = createAdminDomainFormatters({
    ADMIN_TIME_ZONE,
    adminSharedRenderers,
    normalizeString,
  });

  const {
    buildStaffPlanningContext,
    normalizeOrderServiceType,
    normalizeOrderFrequency,
    normalizeOrderPaymentStatus,
    normalizeOrderPaymentMethod,
    normalizeOrderStatus,
    getOrderSelectedDate,
    getOrderSelectedTime,
    getOrderServiceType,
    getOrderFrequency,
    getOrderAssignedStaff,
    getOrderPaymentStatus,
    getOrderPaymentMethod,
    isOrderCreatedEntry,
    getOrderStatus,
    collectAdminOrderRecords,
    filterAdminOrderRecords,
    countOrdersByStatus,
    getOrdersFilters,
    buildOrdersReturnPath,
  } = createAdminOrderDomain({
    ADMIN_ORDERS_PATH,
    ORDER_ASSIGNMENT_VALUES,
    SITE_ORIGIN,
    formatAdminScheduleLabel,
    getEntryAdminOrderData,
    getEntryCalculatorData,
    getEntryOrderPolicyAcceptanceData,
    getEntryPaymentData,
    getRequestUrl,
    normalizeAdminOrderDateInput,
    normalizeAdminOrderTimeInput,
    normalizeString,
    toAdminScheduleTimestamp,
  });

  const {
    normalizeLeadStatus,
    formatLeadStatusLabel,
    normalizeLeadTaskDueAt,
    getLeadStatus,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    applyLeadEntryUpdates,
    getQuoteOpsFilters,
  } = createAdminLeadDomain({
    applyOrderEntryUpdates,
    getEntryAdminLeadData,
    getEntryAdminSmsData,
    getEntryPayload,
    getEntrySmsHistory,
    getRequestUrl,
    isOrderCreatedEntry,
    normalizeAdminSmsHistoryEntries,
    normalizeString,
  });

  const {
    applyClientEntryUpdates,
    getAdminClientsFilters,
    collectAdminClientRecords,
    filterAdminClientRecords,
  } = createAdminClientDomain({
    getEntryAdminSmsData,
    getEntryCalculatorData,
    getEntryPayload,
    getEntrySmsHistory,
    getRequestUrl,
    normalizeAdminSmsHistoryEntries,
    normalizeString,
  });

function formatBooleanLabel(value, yesLabel = "Enabled", noLabel = "Disabled") {
  return value ? yesLabel : noLabel;
}

function formatCountList(values) {
  return values.map((value) => String(value)).join(", ");
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

function getEntryPayload(entry = {}) {
  return getPersistedEntryPayload(entry);
}

function getEntryCalculatorData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.calculatorData && typeof payload.calculatorData === "object" ? payload.calculatorData : {};
}

function getEntryAdminOrderData(entry = {}) {
  return getPersistedOrderState(entry);
}

function getEntryPaymentData(entry = {}) {
  return getPersistedPaymentState(entry);
}

function getEntryOrderPolicyAcceptanceData(entry = {}) {
  return getPersistedOrderPolicyAcceptanceData(entry);
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

function cloneSerializable(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function addRecurringScheduleDate(dateValue, frequency) {
  const normalizedDate = normalizeAdminOrderDateInput(dateValue);
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const [, year, month, day] = match;
  const nextDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(nextDate.getTime())) return "";

  if (frequency === "weekly") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (frequency === "biweekly") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 14);
  } else if (frequency === "monthly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 2);
  } else {
    return "";
  }

  const nextYear = String(nextDate.getUTCFullYear());
  const nextMonth = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(nextDate.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function buildRecurringOrderRequestId(seriesId, nextDate) {
  const base = normalizeString(seriesId, 90)
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const dateToken = normalizeString(nextDate, 32).replace(/[^0-9]/g, "");
  const safeBase = base || "recurring-order";
  const safeDateToken = dateToken || Date.now().toString().slice(-8);
  return normalizeString(`${safeBase}-next-${safeDateToken}`, 120);
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
  const completion = getPersistedOrderCompletionData(entry);
  return {
    cleanerComment: normalizeString(completion.cleanerComment, 4000),
    beforePhotos: normalizeOrderCompletionAssets(completion.beforePhotos, "before"),
    afterPhotos: normalizeOrderCompletionAssets(completion.afterPhotos, "after"),
    updatedAt: normalizeString(completion.updatedAt, 80),
  };
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
  const currentPayment = getEntryPaymentData(entry);
  const timestamp = new Date().toISOString();
  const removeOrder = Boolean(updates.removeOrder);
  const hasExplicitOrderUpdates = Object.keys(updates).some((key) => key !== "removeOrder" && key !== "createOrder");
  const shouldCreateOrder = Boolean(updates.createOrder) || hasExplicitOrderUpdates || isOrderCreatedEntry(entry);

  if (removeOrder) {
    entry.updatedAt = timestamp;
    entry.payloadForRetry = payload;
    setEntryOrderState(entry, null);
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
  const hasRecurringNextEntryId = Object.prototype.hasOwnProperty.call(updates, "recurringNextEntryId");
  const hasRecurringGeneratedAt = Object.prototype.hasOwnProperty.call(updates, "recurringGeneratedAt");
  const hasRecurringSeriesId = Object.prototype.hasOwnProperty.call(updates, "recurringSeriesId");

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
    : normalizeOrderPaymentStatus(adminOrder.paymentStatus || currentPayment.status, "unpaid");
  const paymentMethod = hasPaymentMethod
    ? normalizeOrderPaymentMethod(updates.paymentMethod, "")
    : normalizeOrderPaymentMethod(adminOrder.paymentMethod || currentPayment.method, "");
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
  if (hasRecurringNextEntryId) {
    const recurringNextEntryId = normalizeString(updates.recurringNextEntryId, 120);
    if (recurringNextEntryId) {
      adminOrder.recurringNextEntryId = recurringNextEntryId;
    } else {
      delete adminOrder.recurringNextEntryId;
    }
  }
  if (hasRecurringGeneratedAt) {
    const recurringGeneratedAt = normalizeString(updates.recurringGeneratedAt, 80);
    if (recurringGeneratedAt) {
      adminOrder.recurringGeneratedAt = recurringGeneratedAt;
    } else {
      delete adminOrder.recurringGeneratedAt;
    }
  }
  if (hasRecurringSeriesId) {
    const recurringSeriesId = normalizeString(updates.recurringSeriesId, 120);
    if (recurringSeriesId) {
      adminOrder.recurringSeriesId = recurringSeriesId;
    } else {
      delete adminOrder.recurringSeriesId;
    }
  }

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
  setEntryOrderState(entry, adminOrder);

  return entry;
}

function applyPaymentEntryUpdates(entry, updates = {}) {
  if (!entry || typeof entry !== "object") return null;

  const payload = {
    ...getEntryPayload(entry),
  };
  const currentPayment = getEntryPaymentData(entry);
  const payment = {
    ...currentPayment,
  };
  const currentAdminOrder = getEntryAdminOrderData(entry);
  const hasAdminOrder =
    currentAdminOrder &&
    typeof currentAdminOrder === "object" &&
    Object.keys(currentAdminOrder).length > 0;
  const adminOrder = hasAdminOrder ? { ...currentAdminOrder } : null;
  const timestamp = new Date().toISOString();
  const paymentStatus = normalizeOrderPaymentStatus(
    updates.paymentStatus || updates.status || payment.status,
    normalizeOrderPaymentStatus(payment.status, "unpaid")
  );
  const paymentMethod = normalizeOrderPaymentMethod(
    updates.paymentMethod || updates.method || payment.method,
    normalizeOrderPaymentMethod(payment.method, "")
  );
  const provider = normalizeString(updates.provider || payment.provider, 40).toLowerCase();
  const sessionId = normalizeString(
    updates.stripeSessionId || updates.sessionId || payment.stripeSessionId || payment.sessionId,
    160
  );
  const paymentIntentId = normalizeString(
    updates.stripePaymentIntentId || updates.paymentIntentId || payment.stripePaymentIntentId || payment.paymentIntentId,
    160
  );
  const customerEmail = normalizeString(updates.customerEmail || payment.customerEmail, 250).toLowerCase();
  const currency = normalizeString(updates.currency || payment.currency, 12).toLowerCase();
  const eventId = normalizeString(updates.eventId || payment.eventId, 160);
  const eventType = normalizeString(updates.eventType || payment.eventType, 120);
  const rawPaymentStatus = normalizeString(updates.rawPaymentStatus || payment.rawPaymentStatus, 40).toLowerCase();
  const receivedAt = normalizeString(updates.receivedAt || payment.receivedAt, 80) || timestamp;
  const amountTotalCents = Number.isFinite(Number(updates.amountTotalCents))
    ? Number(updates.amountTotalCents)
    : Number.isFinite(Number(payment.amountTotalCents))
      ? Number(payment.amountTotalCents)
      : 0;

  payment.status = paymentStatus;
  if (paymentMethod) {
    payment.method = paymentMethod;
  } else {
    delete payment.method;
  }
  if (provider) {
    payment.provider = provider;
  } else {
    delete payment.provider;
  }
  if (sessionId) {
    payment.stripeSessionId = sessionId;
  } else {
    delete payment.stripeSessionId;
  }
  if (paymentIntentId) {
    payment.stripePaymentIntentId = paymentIntentId;
  } else {
    delete payment.stripePaymentIntentId;
  }
  if (customerEmail) {
    payment.customerEmail = customerEmail;
  } else {
    delete payment.customerEmail;
  }
  if (currency) {
    payment.currency = currency;
  } else {
    delete payment.currency;
  }
  if (eventId) {
    payment.eventId = eventId;
  } else {
    delete payment.eventId;
  }
  if (eventType) {
    payment.eventType = eventType;
  } else {
    delete payment.eventType;
  }
  if (rawPaymentStatus) {
    payment.rawPaymentStatus = rawPaymentStatus;
  } else {
    delete payment.rawPaymentStatus;
  }
  if (amountTotalCents > 0) {
    payment.amountTotalCents = amountTotalCents;
    payment.amountTotal = Number((amountTotalCents / 100).toFixed(2));
  } else {
    delete payment.amountTotalCents;
    delete payment.amountTotal;
  }
  payment.receivedAt = receivedAt;
  payment.updatedAt = timestamp;

  if (adminOrder) {
    adminOrder.paymentStatus = paymentStatus;
    if (paymentMethod) {
      adminOrder.paymentMethod = paymentMethod;
    } else {
      delete adminOrder.paymentMethod;
    }
    adminOrder.updatedAt = timestamp;
  }

  entry.updatedAt = timestamp;
  entry.payloadForRetry = payload;
  setEntryPaymentState(entry, payment);
  if (adminOrder) {
    setEntryOrderState(entry, adminOrder);
  }
  return entry;
}

function buildRecurringOrderSubmission(entry = {}) {
  if (!entry || typeof entry !== "object") return null;

  const frequency = getOrderFrequency(entry);
  if (!frequency) return null;

  const selectedDate = getOrderSelectedDate(entry);
  const nextSelectedDate = addRecurringScheduleDate(selectedDate, frequency);
  if (!nextSelectedDate) return null;

  const selectedTime = normalizeAdminOrderTimeInput(getOrderSelectedTime(entry));
  const payload = cloneSerializable(getEntryPayload(entry), {});
  const calculatorData =
    payload && payload.calculatorData && typeof payload.calculatorData === "object"
      ? payload.calculatorData
      : {};
  const currentAdminOrder = getEntryAdminOrderData(entry);
  const timestamp = new Date().toISOString();
  const recurringSeriesId = normalizeString(
    currentAdminOrder.recurringSeriesId || currentAdminOrder.recurringSourceRequestId || entry.requestId || entry.id,
    120
  );
  const totalPrice = normalizeAdminOrderPriceInput(entry.totalPrice, 0) || 0;
  const totalPriceCents = Math.round(totalPrice * 100);

  delete payload.adminLead;
  calculatorData.selectedDate = nextSelectedDate;
  calculatorData.selectedTime = selectedTime;
  calculatorData.formattedDateTime = formatAdminScheduleLabel(nextSelectedDate, selectedTime);
  calculatorData.totalPrice = totalPrice;
  calculatorData.totalPriceCents = totalPriceCents;
  if (frequency) {
    calculatorData.frequency = frequency;
  } else {
    delete calculatorData.frequency;
  }
  payload.calculatorData = calculatorData;
  const nextOrderState = {
    isCreated: true,
    status: "new",
    frequency,
    assignedStaff: "",
    paymentStatus: "unpaid",
    totalPrice,
    selectedDate: nextSelectedDate,
    selectedTime,
    createdAt: timestamp,
    updatedAt: timestamp,
    recurringSeriesId,
    recurringSourceEntryId: normalizeString(entry.id, 120),
    recurringSourceRequestId: normalizeString(entry.requestId, 120),
  };
  payload.orderState = cloneSerializable(nextOrderState, {});
  payload.adminOrder = cloneSerializable(nextOrderState, {});

  return {
    ok: true,
    requestId: buildRecurringOrderRequestId(recurringSeriesId, nextSelectedDate),
    sourceRoute: ADMIN_ORDERS_PATH,
    source: "Recurring order automation",
    customerName: normalizeString(entry.customerName, 250),
    customerPhone: normalizeString(entry.customerPhone, 80),
    customerEmail: normalizeString(entry.customerEmail, 250),
    serviceType: getOrderServiceType(entry),
    serviceName: normalizeString(entry.serviceName, 120),
    totalPrice,
    totalPriceCents,
    selectedDate: nextSelectedDate,
    selectedTime,
    fullAddress: normalizeString(entry.fullAddress || calculatorData.fullAddress || calculatorData.address, 500),
    httpStatus: 200,
    code: "RECURRING_ORDER_CREATED",
    retryable: false,
    warnings: [],
    errorMessage: "",
    contactId: normalizeString(entry.contactId, 120),
    noteCreated: Boolean(entry.noteCreated),
    opportunityCreated: Boolean(entry.opportunityCreated),
    customFieldsUpdated: Boolean(entry.customFieldsUpdated),
    usedExistingContact: Boolean(entry.usedExistingContact || entry.contactId),
    payloadForRetry: payload,
  };
}

function maskSecretPreview(value, visibleEnd = 4) {
  const raw = normalizeString(value, 512);
  if (!raw) return "Missing";
  if (raw.length <= visibleEnd) return `${"*".repeat(raw.length)}`;
  return `${"*".repeat(Math.max(6, raw.length - visibleEnd))}${raw.slice(-visibleEnd)}`;
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
    applyPaymentEntryUpdates,
    applyLeadEntryUpdates,
    applyClientEntryUpdates,
    applyOrderEntryUpdates,
    buildRecurringOrderSubmission,
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
