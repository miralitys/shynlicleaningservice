"use strict";

const crypto = require("crypto");
const { createAdminClientDomain } = require("./domain-clients");
const { createAdminDomainFormatters } = require("./domain-formatters");
const { createAdminLeadDomain } = require("./domain-leads");
const { createAdminOrderMutationDomain } = require("./domain-order-mutations");
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
    applyOrderEntryUpdates,
    applyPaymentEntryUpdates,
    buildRecurringOrderSubmission,
    getEntryOrderCompletionData,
  } = createAdminOrderMutationDomain({
    ADMIN_ORDERS_PATH,
    cloneSerializable,
    formatAdminScheduleLabel,
    getEntryAdminOrderData,
    getEntryAdminSmsData,
    getEntryCalculatorData,
    getEntryPayload,
    getEntryPaymentData,
    getEntrySmsHistory,
    getOrderFrequency,
    getOrderSelectedDate,
    getOrderSelectedTime,
    getOrderServiceType,
    getOrderStatus,
    getPersistedOrderCompletionData,
    isOrderCreatedEntry,
    normalizeAdminOrderDateInput,
    normalizeAdminOrderPriceInput,
    normalizeAdminOrderTimeInput,
    normalizeAdminSmsHistoryEntries,
    normalizeOrderFrequency,
    normalizeOrderPaymentMethod,
    normalizeOrderPaymentStatus,
    normalizeOrderStatus,
    normalizeString,
    setEntryOrderState,
    setEntryPaymentState,
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
