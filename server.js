#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { monitorEventLoopDelay } = require("perf_hooks");
const { URL } = require("url");
let createSupabaseQuoteOpsClient;
let loadSupabaseQuoteOpsConfig;
try {
  ({ createSupabaseQuoteOpsClient, loadSupabaseQuoteOpsConfig } = require("./lib/supabase-quote-ops"));
} catch (error) {
  createSupabaseQuoteOpsClient = null;
  loadSupabaseQuoteOpsConfig = null;
}
let createLeadConnectorClient;
let loadLeadConnectorConfig;
try {
  ({ createLeadConnectorClient, loadLeadConnectorConfig } = require("./lib/leadconnector"));
} catch (error) {
  createLeadConnectorClient = () => {
    throw new Error("Lead connector module is not available in this build.");
  };
  loadLeadConnectorConfig = null;
}
const {
  ALLOWED_BATHROOM_COUNTS,
  ALLOWED_ROOM_COUNTS,
  ALLOWED_SQUARE_FEET_BUCKETS,
  PRICING,
  calculateQuotePricing,
} = require("./lib/quote-pricing");
let QuoteTokenError;
let createQuoteToken;
let getQuoteTokenSecret;
let getQuoteTokenTtlSeconds;
let verifyQuoteToken;
try {
  ({ QuoteTokenError, createQuoteToken, getQuoteTokenSecret, getQuoteTokenTtlSeconds, verifyQuoteToken } = require("./lib/quote-token"));
} catch (error) {
  QuoteTokenError = class QuoteTokenError extends Error {};
  createQuoteToken = () => {
    throw new QuoteTokenError("Quote token module is not available in this build.");
  };
  getQuoteTokenSecret = () => "";
  getQuoteTokenTtlSeconds = () => 0;
  verifyQuoteToken = () => {
    throw new QuoteTokenError("Quote token module is not available in this build.");
  };
}
let createSlidingWindowRateLimiter;
try {
  ({ createSlidingWindowRateLimiter } = require("./lib/rate-limit"));
} catch (error) {
  createSlidingWindowRateLimiter = () => ({
    check: () => true,
    reset: () => {},
  });
}
let adminAuth;
try {
  adminAuth = require("./lib/admin-auth");
} catch (error) {
  adminAuth = null;
}
const {
  ASSIGNMENT_STATUS_VALUES,
  STAFF_STATUS_VALUES,
  createAdminStaffStore,
} = require("./lib/admin-staff-store");
const { createAdminSettingsStore } = require("./lib/admin-settings-store");
let QRCode;
try {
  QRCode = require("qrcode");
} catch (error) {
  QRCode = null;
}

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const SITE_DIR = __dirname;
const ROUTES_PATH = path.join(SITE_DIR, "routes.json");
const NOT_FOUND_PAGE = "page113047926.html";
const ADMIN_ROOT_PATH = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_2FA_PATH = "/admin/2fa";
const ADMIN_LOGOUT_PATH = "/admin/logout";
const ADMIN_CLIENTS_PATH = "/admin/clients";
const ADMIN_ORDERS_PATH = "/admin/orders";
const ADMIN_STAFF_PATH = "/admin/staff";
const ADMIN_SETTINGS_PATH = "/admin/settings";
const ADMIN_QUOTE_OPS_PATH = "/admin/quote-ops";
const ADMIN_QUOTE_OPS_EXPORT_PATH = "/admin/quote-ops/export.csv";
const ADMIN_QUOTE_OPS_RETRY_PATH = "/admin/quote-ops/retry";
const ADMIN_INTEGRATIONS_PATH = "/admin/integrations";
const ADMIN_RUNTIME_PATH = "/admin/runtime";
const ADMIN_SESSION_COOKIE = "shynli_admin_session";
const ADMIN_CHALLENGE_COOKIE = "shynli_admin_challenge";
const ADMIN_APP_ROUTES = new Set([
  ADMIN_ROOT_PATH,
  ADMIN_CLIENTS_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_STAFF_PATH,
  ADMIN_SETTINGS_PATH,
  ADMIN_QUOTE_OPS_PATH,
]);
const ADMIN_ALL_ROUTES = new Set([
  ...ADMIN_APP_ROUTES,
  ADMIN_QUOTE_OPS_EXPORT_PATH,
  ADMIN_QUOTE_OPS_RETRY_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_2FA_PATH,
  ADMIN_LOGOUT_PATH,
]);
const ADMIN_APP_NAV_ITEMS = Object.freeze([
  {
    path: ADMIN_ROOT_PATH,
    label: "Обзор",
  },
  {
    path: ADMIN_CLIENTS_PATH,
    label: "Клиенты",
  },
  {
    path: ADMIN_ORDERS_PATH,
    label: "Заказы",
  },
  {
    path: ADMIN_STAFF_PATH,
    label: "Сотрудники",
  },
  {
    path: ADMIN_SETTINGS_PATH,
    label: "Settings",
  },
  {
    path: ADMIN_QUOTE_OPS_PATH,
    label: "Заявки",
  },
]);
const ORDER_STATUS_VALUES = new Set(["new", "scheduled", "in-progress", "completed", "canceled", "rescheduled"]);
const ORDER_FREQUENCY_VALUES = new Set(["weekly", "biweekly", "monthly"]);
const ORDER_ASSIGNMENT_VALUES = new Set(["all", "assigned", "unassigned"]);
const QUOTE_PUBLIC_PATH = "/quote";
const REDIRECT_ROUTES = new Map([
  ["/home-simple", "/"],
  ["/действуй", "/quote"],
  ["/admin/setup", ADMIN_ROOT_PATH],
  ["/admin/users", ADMIN_ROOT_PATH],
  [ADMIN_INTEGRATIONS_PATH, ADMIN_ROOT_PATH],
  [ADMIN_RUNTIME_PATH, ADMIN_ROOT_PATH],
]);
const SITE_ORIGIN = normalizeConfiguredOrigin(
  process.env.PUBLIC_SITE_ORIGIN || process.env.SITE_BASE_URL || "https://shynlicleaningservice.com"
);
const NOINDEX_ROUTES = new Set(["/home-calculator", "/oauth/callback", "/quote"]);
const BREADCRUMB_LABELS = new Map([
  ["/about-us", "About Us"],
  ["/blog", "Blog"],
  ["/cancellation-policy", "Cancellation Policy"],
  ["/contacts", "Contact Us"],
  ["/faq", "FAQ"],
  ["/home-calculator", "Home Calculator"],
  ["/oauth/callback", "OAuth Callback"],
  ["/pricing", "Pricing"],
  ["/privacy-policy", "Privacy Policy"],
  ["/quote", "Quote"],
  ["/service-areas", "Service Areas"],
  ["/terms-of-service", "Terms of Service"],
  ["/services", "Services"],
]);
const ROUTE_META_OVERRIDES = {
  "/": {
    ogTitle: "Professional Home Cleaning Services | Shynli Cleaning",
    ogDescription:
      "Trusted local house cleaning in Chicago suburbs with upfront pricing, flexible scheduling, and insured cleaners.",
  },
  "/home-calculator": {
    title: "Instant House Cleaning Cost Calculator | Shynli Cleaning",
    description:
      "Use our instant house cleaning calculator to estimate regular, deep, and move-out cleaning prices across Chicago suburbs.",
    ogTitle: "Instant House Cleaning Cost Calculator | Shynli Cleaning",
    ogDescription:
      "Estimate your cleaning cost online for regular, deep, and move-out services in Chicago suburbs.",
    canonical: `${SITE_ORIGIN}/home-calculator`,
    robots: "noindex,follow",
  },
  "/services/post-construction-cleaning": {
    title: "Post-Construction Cleaning Services | Shynli Cleaning | Chicago Suburbs",
    description:
      "Professional post-construction cleaning for renovated homes and newly finished spaces across Chicago suburbs. Remove dust, debris, and residue with a final detailed clean.",
    ogTitle: "Post-Construction Cleaning Services | Shynli Cleaning",
    ogDescription:
      "Detailed post-construction cleaning for remodels, renovations, and newly completed spaces across Chicago suburbs.",
  },
  "/oauth/callback": {
    robots: "noindex,nofollow",
  },
  "/quote": {
    robots: "noindex,nofollow",
  },
};

const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const NEGOTIATED_IMAGE_VARY = "Accept, Sec-CH-Width, Viewport-Width, DPR";
const REQUEST_LOG_BUFFER_LIMIT = Number(process.env.REQUEST_LOG_BUFFER_LIMIT || 4000);
const REQUEST_LOG_FLUSH_INTERVAL_MS = Number(process.env.REQUEST_LOG_FLUSH_INTERVAL_MS || 250);
const HTML_CACHE_WARM_MODE = String(process.env.HTML_CACHE_WARM_MODE || "minimal").toLowerCase();
const PERF_WINDOW_MS = Number(process.env.PERF_WINDOW_MS || 5 * 60 * 1000);
const PERF_SUMMARY_INTERVAL_MS = Number(process.env.PERF_SUMMARY_INTERVAL_MS || 60 * 1000);
const PERF_MAX_SAMPLES = Number(process.env.PERF_MAX_SAMPLES || 40000);
const ALERT_P95_MS = Number(process.env.ALERT_P95_MS || 500);
const ALERT_P99_MS = Number(process.env.ALERT_P99_MS || 1000);
const ALERT_5XX_RATE = Number(process.env.ALERT_5XX_RATE || 0.01);
const ALERT_EVENT_LOOP_P95_MS = Number(process.env.ALERT_EVENT_LOOP_P95_MS || 100);
const STRIPE_CHECKOUT_ENDPOINT = "/api/stripe/checkout-session";
const QUOTE_REQUEST_ENDPOINT = "/api/quote/request";
const QUOTE_SUBMIT_ENDPOINT = "/api/quote/submit";
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 64 * 1024);
const STRIPE_MIN_AMOUNT_CENTS = Number(process.env.STRIPE_MIN_AMOUNT_CENTS || 50);
const STRIPE_MAX_AMOUNT_CENTS = Number(process.env.STRIPE_MAX_AMOUNT_CENTS || 200000);
const POST_RATE_LIMIT_WINDOW_MS = Number(process.env.POST_RATE_LIMIT_WINDOW_MS || 60_000);
const POST_RATE_LIMIT_MAX_REQUESTS = Number(process.env.POST_RATE_LIMIT_MAX_REQUESTS || 10);
const QUOTE_OPS_LEDGER_LIMIT = Number(process.env.QUOTE_OPS_LEDGER_LIMIT || 250);
const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60_000);
const ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS || 5);
const ADMIN_2FA_RATE_LIMIT_WINDOW_MS = Number(process.env.ADMIN_2FA_RATE_LIMIT_WINDOW_MS || 10 * 60_000);
const ADMIN_2FA_RATE_LIMIT_MAX_REQUESTS = Number(process.env.ADMIN_2FA_RATE_LIMIT_MAX_REQUESTS || 10);
const TRUST_PROXY_HEADERS = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY_HEADERS || ""));
const TRUSTED_PROXY_IPS = new Set(
  String(process.env.TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => {
      if (value === "::1") return "127.0.0.1";
      return value.startsWith("::ffff:") ? value.slice(7) : value;
    })
);
const PERF_ENDPOINT_ENABLED = /^(1|true|yes)$/i.test(String(process.env.ENABLE_PERF_ENDPOINT || ""));
const PERF_ENDPOINT_TOKEN = String(process.env.PERF_ENDPOINT_TOKEN || "").trim();
const GOOGLE_PLACES_API_KEY = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
const PUBLIC_ASSET_DIRECTORIES = new Set(["css", "images", "js"]);
const PUBLIC_ASSET_FILES = new Set(["robots.txt", "sitemap.xml"]);
const BASE_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' https://checkout.stripe.com https://api.stripe.com;",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

let stripeClient = null;
let leadConnectorClient = null;
const postRateLimiter = createSlidingWindowRateLimiter({
  windowMs: POST_RATE_LIMIT_WINDOW_MS,
  maxRequests: POST_RATE_LIMIT_MAX_REQUESTS,
});
const adminLoginRateLimiter = createSlidingWindowRateLimiter({
  windowMs: ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
  maxRequests: ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS,
});
const adminTwoFactorRateLimiter = createSlidingWindowRateLimiter({
  windowMs: ADMIN_2FA_RATE_LIMIT_WINDOW_MS,
  maxRequests: ADMIN_2FA_RATE_LIMIT_MAX_REQUESTS,
});

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (stripeClient) return stripeClient;
  // Lazy load keeps server start resilient even if Stripe is not configured yet.
  const Stripe = require("stripe");
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

function getLeadConnectorClient() {
  if (leadConnectorClient) return leadConnectorClient;
  leadConnectorClient = createLeadConnectorClient({
    env: process.env,
    fetch: global.fetch,
  });
  return leadConnectorClient;
}

function getRequestDurationMs(startTimeNs) {
  return Number(process.hrtime.bigint() - startTimeNs) / 1e6;
}

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function percentileFromSorted(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  const clamped = Math.max(0, Math.min(100, percentile));
  const index = Math.ceil((clamped / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function createBufferedLogger() {
  const queue = [];
  let droppedCount = 0;
  let flushing = false;

  function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;

    const chunk = queue.splice(0, queue.length).join("\n");
    const dropped = droppedCount;
    droppedCount = 0;
    let output = `${chunk}\n`;
    if (dropped > 0) {
      output += `${JSON.stringify({
        ts: new Date().toISOString(),
        type: "request_log_drop",
        dropped,
      })}\n`;
    }

    process.stdout.write(output, () => {
      flushing = false;
      if (queue.length > 0) {
        setImmediate(flush);
      }
    });
  }

  const flushTimer = setInterval(flush, REQUEST_LOG_FLUSH_INTERVAL_MS);
  flushTimer.unref();

  return {
    log(entry) {
      const line = typeof entry === "string" ? entry : JSON.stringify(entry);
      if (queue.length >= REQUEST_LOG_BUFFER_LIMIT) {
        droppedCount += 1;
        return;
      }
      queue.push(line);
      if (!flushing) {
        setImmediate(flush);
      }
    },
    close() {
      clearInterval(flushTimer);
      flush();
    },
  };
}

function getMemoryUsageSnapshot() {
  const toMb = (bytes) => roundNumber(bytes / (1024 * 1024));
  const usage = process.memoryUsage();
  return {
    rss_mb: toMb(usage.rss),
    heap_total_mb: toMb(usage.heapTotal),
    heap_used_mb: toMb(usage.heapUsed),
    external_mb: toMb(usage.external),
    array_buffers_mb: toMb(usage.arrayBuffers),
  };
}

function createRequestPerfWindow() {
  const samples = [];

  function trim(nowMs) {
    while (samples.length > 0 && nowMs - samples[0].ts > PERF_WINDOW_MS) {
      samples.shift();
    }
    if (samples.length > PERF_MAX_SAMPLES) {
      samples.splice(0, samples.length - PERF_MAX_SAMPLES);
    }
  }

  return {
    record(statusCode, durationMs) {
      const nowMs = Date.now();
      samples.push({ ts: nowMs, statusCode, durationMs });
      trim(nowMs);
    },
    snapshot() {
      const nowMs = Date.now();
      trim(nowMs);

      const total = samples.length;
      if (total === 0) {
        return {
          window_ms: PERF_WINDOW_MS,
          total_requests: 0,
          p50_ms: 0,
          p95_ms: 0,
          p99_ms: 0,
          status_5xx: 0,
          status_5xx_rate: 0,
        };
      }

      const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
      let status5xx = 0;
      for (const sample of samples) {
        if (sample.statusCode >= 500) status5xx += 1;
      }

      return {
        window_ms: PERF_WINDOW_MS,
        total_requests: total,
        p50_ms: roundNumber(percentileFromSorted(durations, 50)),
        p95_ms: roundNumber(percentileFromSorted(durations, 95)),
        p99_ms: roundNumber(percentileFromSorted(durations, 99)),
        status_5xx: status5xx,
        status_5xx_rate: roundNumber(status5xx / total, 4),
      };
    },
  };
}

function getQuoteOpsSearchHaystack(entry) {
  return [
    entry.requestId,
    entry.customerName,
    entry.customerPhone,
    entry.customerEmail,
    entry.contactId,
    entry.serviceName,
    entry.serviceType,
    entry.source,
    entry.code,
    entry.errorMessage,
  ]
    .join(" ")
    .toLowerCase();
}

function filterQuoteOpsEntries(entries = [], filters = {}) {
  const status = normalizeString(filters.status, 32).toLowerCase();
  const serviceType = normalizeString(filters.serviceType, 32).toLowerCase();
  const query = normalizeString(filters.q, 200).toLowerCase();
  const limitValue = Number.isFinite(filters.limit) ? filters.limit : entries.length;

  return entries
    .filter((entry) => {
      if (status && status !== "all" && entry.status !== status) return false;
      if (serviceType && serviceType !== "all" && entry.serviceType !== serviceType) return false;
      if (query && !getQuoteOpsSearchHaystack(entry).includes(query)) return false;
      return true;
    })
    .slice(0, Math.max(0, limitValue));
}

async function performQuoteOpsRetry(entry, options = {}) {
  if (!entry) {
    return {
      ok: false,
      status: 404,
      code: "ENTRY_NOT_FOUND",
      message: "Quote entry was not found.",
    };
  }

  if (!entry.payloadForRetry) {
    return {
      ok: false,
      status: 400,
      code: "RETRY_UNAVAILABLE",
      message: "Retry is not available for this quote entry.",
    };
  }

  function normalizeQuoteOpsStatus(ok, warnings) {
    if (!ok) return "error";
    return Array.isArray(warnings) && warnings.length > 0 ? "warning" : "success";
  }

  let leadConnector;
  try {
    leadConnector = options.getLeadConnectorClient();
  } catch (error) {
    const failureMessage = normalizeString(error && error.message ? error.message : "Quote retry is unavailable.", 200);
    const retryTimestamp = new Date().toISOString();
    entry.retryCount += 1;
    entry.lastRetryAt = retryTimestamp;
    entry.lastRetryStatus = "error";
    entry.lastRetryMessage = failureMessage;
    entry.updatedAt = retryTimestamp;
    entry.retryHistory.unshift({
      at: retryTimestamp,
      status: "error",
      code: "CLIENT_INIT_ERROR",
      message: failureMessage,
    });
    entry.retryHistory = entry.retryHistory.slice(0, 10);
    return {
      ok: false,
      status: 503,
      code: "CLIENT_INIT_ERROR",
      message: failureMessage,
    };
  }

  const submittedAt = new Date().toISOString();
  const retryRequestId = normalizeString(
    `${entry.requestId || "quote"}-retry-${Date.now()}`,
    120
  );
  const result = await leadConnector.submitQuoteSubmission({
    ...entry.payloadForRetry,
    requestId: retryRequestId,
    submittedAt,
    userAgent: normalizeString(options.userAgent || "Admin retry", 180),
  });

  const retryTimestamp = new Date().toISOString();
  const retryStatus = normalizeQuoteOpsStatus(Boolean(result.ok), result.warnings);
  entry.retryCount += 1;
  entry.lastRetryAt = retryTimestamp;
  entry.lastRetryStatus = retryStatus;
  entry.lastRetryMessage = normalizeString(
    result.ok ? "CRM retry completed." : result.message || "CRM retry failed.",
    300
  );
  entry.updatedAt = retryTimestamp;
  entry.retryHistory.unshift({
    at: retryTimestamp,
    status: retryStatus,
    code: normalizeString(result.code || "", 80),
    message: entry.lastRetryMessage,
  });
  entry.retryHistory = entry.retryHistory.slice(0, 10);

  if (result.ok) {
    entry.status = retryStatus;
    entry.httpStatus = Number(result.status) || entry.httpStatus;
    entry.code = normalizeString(result.code || "OK", 80);
    entry.retryable = Boolean(result.retryable);
    entry.warnings = Array.isArray(result.warnings) ? result.warnings.map((item) => normalizeString(item, 120)).filter(Boolean) : [];
    entry.errorMessage = "";
    entry.contactId = normalizeString(result.contactId || entry.contactId, 120);
    entry.noteCreated = Boolean(result.noteCreated);
    entry.opportunityCreated = Boolean(result.opportunityCreated);
    entry.customFieldsUpdated = Boolean(result.customFieldsUpdated);
    entry.usedExistingContact = Boolean(result.usedExistingContact);
  } else {
    entry.httpStatus = Number(result.status) || entry.httpStatus;
    entry.code = normalizeString(result.code || entry.code || "RETRY_FAILED", 80);
    entry.retryable = Boolean(result.retryable);
    entry.errorMessage = normalizeString(result.message || "CRM retry failed.", 300);
  }

  return result;
}

function createQuoteOpsLedger(limit = QUOTE_OPS_LEDGER_LIMIT) {
  const entries = [];
  const entryById = new Map();

  function trim() {
    while (entries.length > limit) {
      const removed = entries.pop();
      if (removed) {
        entryById.delete(removed.id);
      }
    }
  }

  function normalizeQuoteOpsStatus(ok, warnings) {
    if (!ok) return "error";
    return Array.isArray(warnings) && warnings.length > 0 ? "warning" : "success";
  }

  function createBaseEntry(input = {}) {
    const timestamp = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      kind: "quote_submission",
      status: normalizeQuoteOpsStatus(Boolean(input.ok), input.warnings),
      createdAt: timestamp,
      updatedAt: timestamp,
      requestId: normalizeString(input.requestId, 120),
      sourceRoute: normalizeString(input.sourceRoute, 120),
      source: normalizeString(input.source, 120),
      customerName: normalizeString(input.customerName, 250),
      customerPhone: normalizeString(input.customerPhone, 80),
      customerEmail: normalizeString(input.customerEmail, 250),
      serviceType: normalizeString(input.serviceType, 40),
      serviceName: normalizeString(input.serviceName, 120),
      totalPrice: Number.isFinite(input.totalPrice) ? Number(input.totalPrice) : 0,
      totalPriceCents: Number.isFinite(input.totalPriceCents) ? Number(input.totalPriceCents) : 0,
      selectedDate: normalizeString(input.selectedDate, 32),
      selectedTime: normalizeString(input.selectedTime, 32),
      fullAddress: normalizeString(input.fullAddress, 500),
      httpStatus: Number.isFinite(input.httpStatus) ? input.httpStatus : 0,
      code: normalizeString(input.code, 80),
      retryable: Boolean(input.retryable),
      warnings: Array.isArray(input.warnings) ? input.warnings.map((item) => normalizeString(item, 120)).filter(Boolean) : [],
      errorMessage: normalizeString(input.errorMessage, 300),
      contactId: normalizeString(input.contactId, 120),
      noteCreated: Boolean(input.noteCreated),
      opportunityCreated: Boolean(input.opportunityCreated),
      customFieldsUpdated: Boolean(input.customFieldsUpdated),
      usedExistingContact: Boolean(input.usedExistingContact),
      retryCount: 0,
      lastRetryAt: "",
      lastRetryStatus: "",
      lastRetryMessage: "",
      retryHistory: [],
      payloadForRetry: input.payloadForRetry || null,
    };
  }

  return {
    recordSubmission(input = {}) {
      const entry = createBaseEntry(input);
      entries.unshift(entry);
      entryById.set(entry.id, entry);
      trim();
      return entry;
    },
    getEntry(entryId) {
      return entryById.get(normalizeString(entryId, 120)) || null;
    },
    listEntries(filters = {}) {
      return filterQuoteOpsEntries(entries, filters);
    },
    updateOrderEntry(entryId, updates = {}) {
      const entry = entryById.get(normalizeString(entryId, 120));
      if (!entry) return null;
      return applyOrderEntryUpdates(entry, updates);
    },
    buildCsv(entriesToExport = []) {
      const headers = [
        "id",
        "status",
        "created_at",
        "updated_at",
        "request_id",
        "source_route",
        "source",
        "customer_name",
        "customer_phone",
        "customer_email",
        "service_type",
        "service_name",
        "total_price",
        "selected_date",
        "selected_time",
        "full_address",
        "http_status",
        "code",
        "retryable",
        "warnings",
        "error_message",
        "contact_id",
        "note_created",
        "opportunity_created",
        "custom_fields_updated",
        "used_existing_contact",
        "retry_count",
        "last_retry_at",
        "last_retry_status",
        "last_retry_message",
      ];
      const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = [headers.map(csvEscape).join(",")];

      for (const entry of entriesToExport) {
        lines.push(
          [
            entry.id,
            entry.status,
            entry.createdAt,
            entry.updatedAt,
            entry.requestId,
            entry.sourceRoute,
            entry.source,
            entry.customerName,
            entry.customerPhone,
            entry.customerEmail,
            entry.serviceType,
            entry.serviceName,
            entry.totalPrice,
            entry.selectedDate,
            entry.selectedTime,
            entry.fullAddress,
            entry.httpStatus,
            entry.code,
            entry.retryable,
            entry.warnings.join("|"),
            entry.errorMessage,
            entry.contactId,
            entry.noteCreated,
            entry.opportunityCreated,
            entry.customFieldsUpdated,
            entry.usedExistingContact,
            entry.retryCount,
            entry.lastRetryAt,
            entry.lastRetryStatus,
            entry.lastRetryMessage,
          ]
            .map(csvEscape)
            .join(",")
        );
      }

      return lines.join("\n");
    },
    async retrySubmission(entryId, options = {}) {
      const entry = entryById.get(normalizeString(entryId, 120));
      return performQuoteOpsRetry(entry, options);
    },
  };
}

function createQuoteOpsStore(options = {}) {
  const localLedger = createQuoteOpsLedger(options.limit);
  const supabaseClient =
    typeof createSupabaseQuoteOpsClient === "function"
      ? createSupabaseQuoteOpsClient({
          env: options.env || process.env,
          fetch: options.fetch || global.fetch,
        })
      : null;
  const remoteEnabled = Boolean(supabaseClient && typeof supabaseClient.isConfigured === "function" && supabaseClient.isConfigured());

  return {
    mode: remoteEnabled ? "supabase" : "memory",
    buildCsv(entriesToExport = []) {
      return localLedger.buildCsv(entriesToExport);
    },
    async recordSubmission(input = {}) {
      const entry = localLedger.recordSubmission(input);
      if (!remoteEnabled) return entry;
      try {
        await supabaseClient.upsertEntry(entry);
      } catch {}
      return entry;
    },
    async listEntries(filters = {}) {
      if (!remoteEnabled) {
        return localLedger.listEntries(filters);
      }
      try {
        const remoteEntries = await supabaseClient.fetchEntries(
          Number.isFinite(filters.limit) ? filters.limit : QUOTE_OPS_LEDGER_LIMIT
        );
        return filterQuoteOpsEntries(remoteEntries, filters);
      } catch {
        return localLedger.listEntries(filters);
      }
    },
    async getEntry(entryId) {
      const normalizedEntryId = normalizeString(entryId, 120);
      if (!normalizedEntryId) return null;
      if (!remoteEnabled) {
        return localLedger.getEntry(normalizedEntryId);
      }
      try {
        const remoteEntry = await supabaseClient.fetchEntryById(normalizedEntryId);
        if (remoteEntry) return remoteEntry;
      } catch {}
      return localLedger.getEntry(normalizedEntryId);
    },
    async retrySubmission(entryId, optionsForRetry = {}) {
      if (!remoteEnabled) {
        return localLedger.retrySubmission(entryId, optionsForRetry);
      }

      let entry = null;
      try {
        entry = await supabaseClient.fetchEntryById(entryId);
      } catch {}
      if (!entry) {
        entry = localLedger.getEntry(entryId);
      }

      const result = await performQuoteOpsRetry(entry, optionsForRetry);
      if (entry) {
        try {
          await supabaseClient.upsertEntry(entry);
        } catch {}
      }
      return result;
    },
    async updateOrderEntry(entryId, updates = {}) {
      let entry = null;
      if (remoteEnabled) {
        try {
          entry = await supabaseClient.fetchEntryById(entryId);
        } catch {}
      }
      if (!entry) {
        entry = localLedger.getEntry(entryId);
      }
      if (!entry) return null;

      const updatedEntry = applyOrderEntryUpdates(entry, updates);
      localLedger.updateOrderEntry(entryId, updates);

      if (remoteEnabled) {
        await supabaseClient.upsertEntry(updatedEntry);
      }

      return updatedEntry;
    },
  };
}

function createEventLoopStats() {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  function readSnapshot(reset = false) {
    if (histogram.count === 0) {
      if (reset) histogram.reset();
      return { min_ms: 0, mean_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0 };
    }

    const snapshot = {
      min_ms: roundNumber(histogram.min / 1e6),
      mean_ms: roundNumber(histogram.mean / 1e6),
      p95_ms: roundNumber(histogram.percentile(95) / 1e6),
      p99_ms: roundNumber(histogram.percentile(99) / 1e6),
      max_ms: roundNumber(histogram.max / 1e6),
    };
    if (reset) histogram.reset();
    return snapshot;
  }

  return {
    readSnapshot,
    close() {
      histogram.disable();
    },
  };
}

function getPerfAlertReasons(requestSnapshot, eventLoopSnapshot) {
  const reasons = [];
  if (requestSnapshot.total_requests > 0 && requestSnapshot.p95_ms >= ALERT_P95_MS) {
    reasons.push(`p95_ms >= ${ALERT_P95_MS}`);
  }
  if (requestSnapshot.total_requests > 0 && requestSnapshot.p99_ms >= ALERT_P99_MS) {
    reasons.push(`p99_ms >= ${ALERT_P99_MS}`);
  }
  if (requestSnapshot.total_requests > 0 && requestSnapshot.status_5xx_rate >= ALERT_5XX_RATE) {
    reasons.push(`status_5xx_rate >= ${ALERT_5XX_RATE}`);
  }
  if (eventLoopSnapshot.p95_ms >= ALERT_EVENT_LOOP_P95_MS) {
    reasons.push(`event_loop_p95_ms >= ${ALERT_EVENT_LOOP_P95_MS}`);
  }
  return reasons;
}

function toServerTimingHeader(startTimeNs, cacheHit) {
  const durationMs = getRequestDurationMs(startTimeNs);
  const durationToken = Math.max(0, durationMs).toFixed(2);
  const cacheToken = cacheHit ? "hit" : "miss";
  return `app;dur=${durationToken}, cache;desc="${cacheToken}"`;
}

function normalizeConfiguredOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function writeHeadWithTiming(res, statusCode, headers, startTimeNs, cacheHit) {
  const enrichedHeaders = {
    ...BASE_SECURITY_HEADERS,
    ...headers,
    "Server-Timing": toServerTimingHeader(startTimeNs, cacheHit),
  };
  res.writeHead(statusCode, enrichedHeaders);
}

function writeJsonWithTiming(res, statusCode, payload, startTimeNs, cacheHit) {
  writeHeadWithTiming(
    res,
    statusCode,
    {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    startTimeNs,
    cacheHit
  );
  res.end(JSON.stringify(payload));
}

function writeHtmlWithTiming(res, statusCode, html, startTimeNs, cacheHit, headers = {}) {
  writeHeadWithTiming(
    res,
    statusCode,
    {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers,
    },
    startTimeNs,
    cacheHit
  );
  res.end(html);
}

function redirectWithTiming(res, statusCode, location, startTimeNs, cacheHit, headers = {}) {
  writeHeadWithTiming(
    res,
    statusCode,
    {
      Location: location,
      "Cache-Control": "no-store",
      ...headers,
    },
    startTimeNs,
    cacheHit
  );
  res.end();
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const pair of String(cookieHeader || "").split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(String(value || ""))}`];
  segments.push(`Path=${options.path || "/"}`);
  if (Number.isFinite(options.maxAge)) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly !== false) segments.push("HttpOnly");
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  if (options.secure) segments.push("Secure");
  return segments.join("; ");
}

function clearCookie(name, options = {}) {
  return serializeCookie(name, "", {
    ...options,
    maxAge: 0,
  });
}

function isPublicDirectAssetPath(pathname) {
  const normalizedPath = String(pathname || "").replace(/^\/+/, "");
  if (!normalizedPath || !path.extname(normalizedPath)) return false;
  if (normalizedPath.includes("\0")) return false;
  if (!normalizedPath.includes("/") && /^favicon\./i.test(normalizedPath)) return true;

  const [topLevel] = normalizedPath.split("/");
  if (PUBLIC_ASSET_DIRECTORIES.has(topLevel)) return true;
  return PUBLIC_ASSET_FILES.has(normalizedPath);
}

function getStripeReturnOrigin() {
  return SITE_ORIGIN;
}

function canAccessPerfEndpoint(req) {
  if (!PERF_ENDPOINT_ENABLED || !PERF_ENDPOINT_TOKEN) return false;
  return String(req.headers["x-perf-token"] || "").trim() === PERF_ENDPOINT_TOKEN;
}

function normalizeClientIp(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "::1") return "127.0.0.1";
  if (normalized.startsWith("::ffff:")) return normalized.slice(7);
  return normalized;
}

function shouldTrustProxyHeaders(req) {
  if (!TRUST_PROXY_HEADERS || TRUSTED_PROXY_IPS.size === 0) return false;
  const remoteAddress = normalizeClientIp(req.socket && req.socket.remoteAddress);
  return Boolean(remoteAddress) && TRUSTED_PROXY_IPS.has(remoteAddress);
}

function getClientAddress(req) {
  if (shouldTrustProxyHeaders(req)) {
    const forwardedForChain = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((value) => normalizeClientIp(value))
      .filter(Boolean);
    const forwardedFor = forwardedForChain.length > 0 ? forwardedForChain[forwardedForChain.length - 1] : "";
    if (forwardedFor) return forwardedFor;
  }
  return normalizeString(normalizeClientIp(req.socket && req.socket.remoteAddress), 120) || "unknown";
}

function getRequestProtocol(req) {
  const forwardedProto = normalizeString(String(req.headers["x-forwarded-proto"] || "").split(",")[0], 16).toLowerCase();
  if (forwardedProto === "https" || forwardedProto === "http") return forwardedProto;
  if (req.socket && req.socket.encrypted) return "https";
  return "http";
}

function shouldUseSecureCookies(req) {
  return getRequestProtocol(req) === "https";
}

function enforcePostRateLimit(req, res, requestStartNs, requestContext, routeKey) {
  const decision = postRateLimiter.take(`${routeKey}:${getClientAddress(req)}`);
  if (decision.allowed) return false;

  requestContext.cacheHit = false;
  writeHeadWithTiming(
    res,
    429,
    {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
    },
    requestStartNs,
    requestContext.cacheHit
  );
  res.end(JSON.stringify({ error: "Too many requests. Please try again later." }));
  return true;
}

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function toAmountCents(amountValue) {
  const parsed = Number(amountValue);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100);
}

async function readTextBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    let payloadTooLarge = false;
    const chunks = [];

    function safeReject(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function safeResolve(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    req.on("data", (chunk) => {
      if (payloadTooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        payloadTooLarge = true;
        safeReject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (payloadTooLarge) return;
      safeResolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (err) => safeReject(err));
  });
}

async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const rawBody = await readTextBody(req, maxBytes);
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error("Invalid JSON");
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function parseFormBody(rawBody) {
  const params = new URLSearchParams(String(rawBody || ""));
  const output = {};
  for (const [key, value] of params.entries()) {
    if (!(key in output)) {
      output[key] = value;
      continue;
    }
    if (Array.isArray(output[key])) {
      output[key].push(value);
      continue;
    }
    output[key] = [output[key], value];
  }
  return output;
}

function getFormValue(formBody, key, maxLength = 500) {
  const value = formBody ? formBody[key] : "";
  if (Array.isArray(value)) {
    return normalizeString(value[value.length - 1], maxLength);
  }
  return normalizeString(value, maxLength);
}

function getFormValues(formBody, key, maxItems = 8, maxLength = 120) {
  const value = formBody ? formBody[key] : [];
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeString(item, maxLength);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }

  return output;
}

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
    sameSite: "Strict",
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
  return date.toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
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
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAdminScheduleLabel(dateValue, timeValue) {
  const normalizedDate = normalizeString(dateValue, 32);
  const normalizedTime = normalizeString(timeValue, 32);
  if (!normalizedDate && !normalizedTime) return "Дата не указана";
  if (!normalizedDate) return normalizedTime ? `Время: ${normalizedTime}` : "Дата не указана";
  if (!normalizedTime) return formatAdminCalendarDate(normalizedDate);
  return `${formatAdminCalendarDate(normalizedDate)} в ${normalizedTime}`;
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
  if (status === "inactive") return renderAdminBadge(formatStaffStatusLabel(status), "muted");
  if (status === "on_leave") return renderAdminBadge(formatStaffStatusLabel(status), "outline");
  return renderAdminBadge(formatStaffStatusLabel(status), "success");
}

function renderAssignmentStatusBadge(status) {
  if (status === "completed") return renderAdminBadge(formatAssignmentStatusLabel(status), "success");
  if (status === "confirmed") return renderAdminBadge(formatAssignmentStatusLabel(status), "default");
  if (status === "issue") return renderAdminBadge(formatAssignmentStatusLabel(status), "danger");
  return renderAdminBadge(formatAssignmentStatusLabel(status), "outline");
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

  const selectedDate = normalizeString(updates.selectedDate, 32);
  const selectedTime = normalizeString(updates.selectedTime, 32);
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

function getRequestUrl(req) {
  const host = normalizeString(req.headers.host || "localhost", 255) || "localhost";
  return new URL(req.url || "/", `http://${host}`);
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
  const name = normalizeString(reqUrl.searchParams.get("name"), 200);
  const email = normalizeString(reqUrl.searchParams.get("email"), 250).toLowerCase();
  const phone = normalizeString(reqUrl.searchParams.get("phone"), 80);
  const client = normalizeString(reqUrl.searchParams.get("client"), 250).toLowerCase();
  return {
    reqUrl,
    filters: {
      name,
      email,
      phone,
      client,
    },
  };
}

function filterAdminClientRecords(clientRecords = [], filters = {}) {
  const name = normalizeString(filters.name, 200).toLowerCase();
  const email = normalizeString(filters.email, 250).toLowerCase();
  const phone = normalizePhoneFilterValue(filters.phone);

  return clientRecords.filter((client) => {
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

function renderAdminBadge(label, tone = "default") {
  const toneClass =
    tone === "success"
      ? " admin-badge-success"
      : tone === "muted"
        ? " admin-badge-muted"
        : tone === "danger"
          ? " admin-badge-danger"
        : tone === "outline"
          ? " admin-badge-outline"
          : "";
  return `<span class="admin-badge${toneClass}">${escapeHtml(label)}</span>`;
}

function renderAdminCard(title, description, body, options = {}) {
  const eyebrow = options.eyebrow ? `<p class="admin-card-eyebrow">${escapeHtml(options.eyebrow)}</p>` : "";
  const cardClass = options.muted ? "admin-card admin-card-muted" : "admin-card";
  return `<section class="${cardClass}">
    ${(eyebrow || title || description) ? `<div class="admin-card-header">
      ${eyebrow}
      ${title ? `<h2 class="admin-card-title">${escapeHtml(title)}</h2>` : ""}
      ${description ? `<p class="admin-card-description">${escapeHtml(description)}</p>` : ""}
    </div>` : ""}
    <div class="admin-card-content">
      ${body}
    </div>
  </section>`;
}

function renderAdminAuthSidebar(activeStep) {
  const steps = [
    {
      key: "login",
      index: "01",
      title: "Вход",
      description: "Введите почту и пароль.",
    },
    {
      key: "2fa",
      index: "02",
      title: "Код",
      description: "Подтвердите вход кодом из приложения.",
    },
    {
      key: "dashboard",
      index: "03",
      title: "Панель",
      description: "После подтверждения откроется админка.",
    },
  ];

  return `
    <div class="admin-sidebar-card">
      <div class="admin-brand">
        <div class="admin-brand-mark">S</div>
        <div>
          <p class="admin-sidebar-label">SHYNLI</p>
          <h2 class="admin-sidebar-title">Панель управления</h2>
        </div>
      </div>
      <p class="admin-sidebar-copy">Вход в рабочую панель SHYNLI.</p>
      <div class="admin-step-list">
        ${steps
          .map(
            (step) => `<div class="admin-step${activeStep === step.key ? " admin-step-active" : ""}">
              <span class="admin-step-index">${step.index}</span>
              <div class="admin-step-copy">
                <strong>${escapeHtml(step.title)}</strong>
                <span>${escapeHtml(step.description)}</span>
              </div>
            </div>`
          )
          .join("")}
      </div>
    </div>
    <div class="admin-sidebar-card admin-sidebar-card-muted">
      <p class="admin-sidebar-label">Как войти</p>
      <ul class="admin-feature-list">
        <li>Сначала введите почту и пароль.</li>
        <li>Затем подтвердите вход кодом из приложения.</li>
        <li>Если приложение ещё не настроено, используйте QR-код на следующем шаге.</li>
      </ul>
    </div>`;
}

function renderAdminAppSidebar(activePath) {
  return `
    <div class="admin-sidebar-card">
      <div class="admin-brand">
        <div class="admin-brand-mark">S</div>
        <div>
          <p class="admin-sidebar-label">SHYNLI</p>
          <h2 class="admin-sidebar-title">Панель управления</h2>
        </div>
      </div>
      <p class="admin-sidebar-copy">Основные рабочие разделы.</p>
      <nav class="admin-nav">
        ${ADMIN_APP_NAV_ITEMS.map((item) => `<a class="admin-nav-link${item.path === activePath ? " admin-nav-link-active" : ""}" href="${item.path}">${escapeHtml(item.label)}</a>`).join("")}
      </nav>
    </div>
    <div class="admin-sidebar-card admin-sidebar-card-muted">
      <p class="admin-sidebar-label">Быстрый доступ</p>
      <div class="admin-link-grid">
        <a class="admin-link-tile" href="/" target="_blank" rel="noreferrer">
          <strong>Сайт</strong>
          <span>Открыть главную страницу.</span>
        </a>
        <a class="admin-link-tile" href="${QUOTE_PUBLIC_PATH}" target="_blank" rel="noreferrer">
          <strong>Форма заявки</strong>
          <span>Открыть публичную форму.</span>
        </a>
      </div>
    </div>`;
}

function renderAdminLayout(title, content, options = {}) {
  const pageTitle = `${title} | SHYNLI`;
  const subtitle = options.subtitle ? `<p class="admin-subtitle">${escapeHtml(options.subtitle)}</p>` : "";
  const heroMeta = options.heroMeta ? `<div class="admin-hero-meta">${options.heroMeta}</div>` : "";
  const kicker = escapeHtml(options.kicker || "SHYNLI");
  const sidebar = options.sidebar ? `<aside class="admin-sidebar">${options.sidebar}</aside>` : "";
  const shellClass = options.sidebar ? "admin-shell admin-shell-with-sidebar" : "admin-shell";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root {
      --background: #f6f7fb;
      --foreground: #18181b;
      --card: rgba(255, 255, 255, 0.94);
      --card-muted: rgba(250, 250, 251, 0.96);
      --border: #e4e4e7;
      --input: #d4d4d8;
      --muted: #71717a;
      --muted-foreground: #52525b;
      --accent: #9e435a;
      --accent-foreground: #ffffff;
      --accent-soft: rgba(158, 67, 90, 0.12);
      --success: #0f766e;
      --success-soft: rgba(15, 118, 110, 0.12);
      --danger: #b91c1c;
      --danger-soft: rgba(185, 28, 28, 0.10);
      --shadow-lg: 0 28px 70px rgba(24, 24, 27, 0.10);
      --shadow-sm: 0 1px 2px rgba(24, 24, 27, 0.05);
      --radius-xl: 28px;
      --radius-lg: 22px;
      --radius-md: 16px;
      --radius-sm: 12px;
    }
    * { box-sizing: border-box; }
    html { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Montserrat", "Segoe UI", sans-serif;
      color: var(--foreground);
      background:
        radial-gradient(circle at top left, rgba(158, 67, 90, 0.10), transparent 32%),
        radial-gradient(circle at top right, rgba(99, 102, 241, 0.08), transparent 24%),
        linear-gradient(180deg, #fcfcfd 0%, var(--background) 100%);
      padding: 28px 18px 40px;
    }
    a {
      color: inherit;
      text-decoration-color: rgba(158, 67, 90, 0.28);
      text-underline-offset: 3px;
    }
    code {
      font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.92em;
      background: rgba(24, 24, 27, 0.04);
      border: 1px solid rgba(24, 24, 27, 0.05);
      padding: 0.16em 0.42em;
      border-radius: 999px;
    }
    .admin-shell {
      max-width: 1220px;
      margin: 0 auto;
      display: grid;
      gap: 24px;
    }
    .admin-shell-with-sidebar {
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      align-items: start;
    }
    .admin-sidebar {
      display: grid;
      gap: 16px;
      position: sticky;
      top: 24px;
    }
    .admin-sidebar-card,
    .admin-panel {
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      background: var(--card);
      box-shadow: var(--shadow-lg);
      backdrop-filter: blur(18px);
    }
    .admin-sidebar-card {
      padding: 22px;
      box-shadow: var(--shadow-sm);
    }
    .admin-sidebar-card-muted,
    .admin-card-muted {
      background: var(--card-muted);
    }
    .admin-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 12px;
    }
    .admin-brand-mark {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--accent), #c55d78);
      color: var(--accent-foreground);
      font-size: 20px;
      font-weight: 700;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
    }
    .admin-sidebar-label {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .admin-sidebar-title {
      margin: 4px 0 0;
      font-size: 20px;
      line-height: 1.2;
    }
    .admin-sidebar-copy {
      margin: 0 0 18px;
      color: var(--muted-foreground);
      font-size: 14px;
      line-height: 1.65;
    }
    .admin-step-list,
    .admin-nav,
    .admin-badge-row,
    .admin-property-list,
    .admin-content,
    .admin-feature-list,
    .admin-link-grid,
    .admin-stats-grid,
    .admin-section-grid,
    .admin-form,
    .admin-form-grid {
      display: grid;
      gap: 14px;
    }
    .admin-step {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 12px;
      padding: 14px;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      background: rgba(24, 24, 27, 0.02);
    }
    .admin-step-active {
      border-color: rgba(158, 67, 90, 0.22);
      background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.88));
    }
    .admin-step-index {
      display: grid;
      place-items: center;
      height: 36px;
      border-radius: 12px;
      background: rgba(24, 24, 27, 0.06);
      font-size: 12px;
      font-weight: 700;
      color: var(--muted-foreground);
    }
    .admin-step-active .admin-step-index {
      background: rgba(158, 67, 90, 0.16);
      color: var(--accent);
    }
    .admin-step-copy {
      display: grid;
      gap: 4px;
    }
    .admin-step-copy strong {
      font-size: 14px;
    }
    .admin-step-copy span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .admin-nav-link,
    .admin-link-tile {
      display: block;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 13px 14px;
      background: rgba(255,255,255,0.72);
      color: var(--foreground);
      text-decoration: none;
      transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    }
    .admin-nav-link:hover,
    .admin-link-tile:hover {
      border-color: rgba(158, 67, 90, 0.24);
      background: rgba(255,255,255,0.96);
      transform: translateY(-1px);
    }
    .admin-nav-link-active {
      border-color: rgba(158, 67, 90, 0.24);
      background: rgba(158, 67, 90, 0.10);
      color: var(--accent);
      font-weight: 700;
    }
    .admin-link-tile strong {
      display: block;
      font-size: 14px;
      margin-bottom: 6px;
    }
    .admin-link-tile span {
      display: block;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .admin-divider {
      height: 1px;
      background: var(--border);
      margin: 4px 0;
    }
    .admin-panel {
      overflow: hidden;
    }
    .admin-hero {
      padding: 28px 30px 18px;
      border-bottom: 1px solid rgba(228, 228, 231, 0.88);
      background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,250,251,0.68));
    }
    .admin-kicker {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .admin-title {
      margin: 0;
      font-size: clamp(30px, 4vw, 40px);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }
    .admin-subtitle {
      margin: 12px 0 0;
      max-width: 760px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.7;
    }
    .admin-hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
    .admin-content {
      padding: 24px 30px 30px;
    }
    .admin-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82));
      box-shadow: var(--shadow-sm);
    }
    .admin-card-header {
      padding: 20px 20px 0;
      display: grid;
      gap: 6px;
    }
    .admin-card-eyebrow {
      margin: 0;
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .admin-card-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
    }
    .admin-card-description {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .admin-card-content {
      padding: 20px;
      display: grid;
      gap: 16px;
    }
    .admin-stats-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .admin-section-grid {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .admin-form {
      max-width: 520px;
    }
    .admin-form-grid-two {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    .admin-form-grid-three {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      align-items: end;
    }
    .admin-label {
      display: grid;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--foreground);
    }
    .admin-field-note {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .admin-input {
      width: 100%;
      height: 46px;
      border: 1px solid var(--input);
      border-radius: var(--radius-sm);
      padding: 0 14px;
      font: inherit;
      background: rgba(255,255,255,0.9);
      color: var(--foreground);
      transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    }
    .admin-input::placeholder {
      color: #a1a1aa;
    }
    select.admin-input {
      padding-right: 40px;
    }
    textarea.admin-input {
      min-height: 120px;
      height: auto;
      padding-top: 12px;
      padding-bottom: 12px;
      resize: vertical;
    }
    .admin-input:focus {
      outline: none;
      border-color: rgba(158, 67, 90, 0.48);
      box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.12);
      background: #fff;
    }
    .admin-input-code {
      text-align: center;
      letter-spacing: 0.24em;
      font-size: 24px;
      font-weight: 700;
    }
    .admin-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .admin-form-actions {
      grid-column: 1 / -1;
    }
    .admin-checkbox-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .admin-checkbox {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.84);
      cursor: pointer;
    }
    .admin-checkbox input {
      margin-top: 3px;
      accent-color: var(--accent);
    }
    .admin-checkbox span {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .admin-checkbox strong {
      font-size: 14px;
      line-height: 1.3;
    }
    .admin-checkbox small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .admin-entry-list {
      display: grid;
      gap: 14px;
    }
    .admin-clients-layout {
      display: grid;
      gap: 20px;
      grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.95fr);
      align-items: start;
    }
    .admin-sticky-card {
      position: sticky;
      top: 24px;
    }
    .admin-table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.82);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.36);
    }
    .admin-table {
      width: 100%;
      min-width: 760px;
      border-collapse: collapse;
    }
    .admin-table th,
    .admin-table td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(228, 228, 231, 0.92);
      vertical-align: top;
      text-align: left;
    }
    .admin-table th {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(250,250,251,0.94);
      white-space: nowrap;
    }
    .admin-table tbody tr:last-child td {
      border-bottom: 0;
    }
    .admin-table tbody tr:hover td {
      background: rgba(158, 67, 90, 0.04);
    }
    .admin-table-row-active td {
      background: rgba(158, 67, 90, 0.08);
    }
    .admin-table-link {
      font-weight: 700;
      text-decoration: none;
    }
    .admin-table-link:hover {
      text-decoration: underline;
      text-decoration-color: rgba(158, 67, 90, 0.28);
    }
    .admin-table-stack {
      display: grid;
      gap: 4px;
    }
    .admin-table-muted {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .admin-table-number {
      white-space: nowrap;
      font-weight: 600;
    }
    .admin-table-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(255,255,255,0.9);
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
    }
    .admin-table-action:hover {
      border-color: rgba(158, 67, 90, 0.24);
      background: rgba(255,255,255,0.98);
    }
    .admin-client-identity {
      display: grid;
      gap: 10px;
    }
    .admin-client-title {
      margin: 0;
      font-size: 22px;
      line-height: 1.15;
    }
    .admin-subsection-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .admin-subsection-title {
      margin: 0;
      font-size: 15px;
      line-height: 1.3;
    }
    .admin-history-list {
      display: grid;
      gap: 12px;
    }
    .admin-history-item {
      display: grid;
      gap: 10px;
      padding: 14px;
      border: 1px solid rgba(228, 228, 231, 0.92);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.84);
    }
    .admin-history-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }
    .admin-history-title,
    .admin-history-copy {
      margin: 0;
    }
    .admin-history-title {
      font-size: 15px;
      line-height: 1.35;
    }
    .admin-history-copy {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .admin-history-meta {
      display: grid;
      gap: 6px;
      color: var(--muted-foreground);
      font-size: 13px;
      line-height: 1.6;
    }
    .admin-checklist-list {
      display: grid;
      gap: 10px;
    }
    .admin-checklist-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid rgba(228, 228, 231, 0.92);
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.78);
    }
    .admin-checklist-row input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      accent-color: var(--accent);
      flex: none;
    }
    .admin-checklist-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .admin-checklist-copy strong,
    .admin-checklist-copy span {
      word-break: break-word;
    }
    .admin-checklist-copy span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .admin-checklist-summary {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .admin-entry-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.84);
      padding: 16px;
      display: grid;
      gap: 14px;
    }
    .admin-entry-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }
    .admin-entry-title {
      margin: 0;
      font-size: 16px;
      line-height: 1.3;
    }
    .admin-entry-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .admin-entry-copy {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .admin-entry-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    }
    .admin-mini-stat {
      border: 1px solid rgba(228, 228, 231, 0.92);
      border-radius: var(--radius-sm);
      padding: 12px;
      background: rgba(250,250,251,0.88);
    }
    .admin-mini-label {
      display: block;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .admin-mini-value {
      margin: 0;
      font-size: 14px;
      line-height: 1.45;
      word-break: break-word;
    }
    .admin-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .admin-empty-state {
      padding: 20px;
      border: 1px dashed rgba(158, 67, 90, 0.24);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.72);
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
    }
    .admin-action-hint {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .admin-button,
    .admin-link-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: linear-gradient(180deg, var(--accent), #88384d);
      color: var(--accent-foreground);
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
      box-shadow: 0 12px 24px rgba(158, 67, 90, 0.18);
    }
    .admin-button:hover,
    .admin-link-button:hover {
      transform: translateY(-1px);
      background: linear-gradient(180deg, #a94962, #7a3043);
    }
    .admin-button-secondary {
      background: rgba(255,255,255,0.84);
      border-color: var(--border);
      color: var(--foreground);
      box-shadow: none;
    }
    .admin-button-secondary:hover {
      background: rgba(255,255,255,0.96);
    }
    .admin-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid transparent;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .admin-badge-success {
      background: var(--success-soft);
      color: var(--success);
    }
    .admin-badge-muted {
      background: rgba(113, 113, 122, 0.10);
      color: var(--muted-foreground);
    }
    .admin-badge-danger {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .admin-badge-outline {
      background: transparent;
      border-color: var(--border);
      color: var(--muted-foreground);
    }
    .admin-alert {
      margin: 0;
      border-radius: var(--radius-md);
      padding: 14px 16px;
      font-size: 14px;
      line-height: 1.6;
      border: 1px solid transparent;
    }
    .admin-alert-error {
      background: var(--danger-soft);
      border-color: rgba(185, 28, 28, 0.16);
      color: var(--danger);
    }
    .admin-alert-info {
      background: var(--success-soft);
      border-color: rgba(15, 118, 110, 0.16);
      color: var(--success);
    }
    .admin-feature-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .admin-feature-list li {
      position: relative;
      padding-left: 18px;
      color: var(--muted-foreground);
      font-size: 14px;
      line-height: 1.65;
    }
    .admin-feature-list li::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0.72em;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
    }
    .admin-property-list {
      gap: 12px;
    }
    .admin-property-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(228, 228, 231, 0.92);
    }
    .admin-property-row:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }
    .admin-property-label {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .admin-property-value {
      color: var(--foreground);
      font-size: 14px;
      line-height: 1.55;
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }
    .admin-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
      padding: 16px 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: rgba(250,250,251,0.88);
    }
    .admin-topbar p,
    .admin-user-email,
    .admin-metric-value,
    .admin-card-copy {
      margin: 0;
    }
    .admin-topbar p,
    .admin-card-copy {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .admin-user-email {
      margin-top: 3px;
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
    }
    .admin-metric-value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }
    .admin-code {
      margin: 0;
      padding: 14px 16px;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(24, 24, 27, 0.06);
      background: #18181b;
      color: #fafafa;
      font-size: 13px;
      line-height: 1.65;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .admin-qr-card {
      display: grid;
      justify-items: center;
      gap: 12px;
      text-align: center;
    }
    .admin-qr-image {
      width: 220px;
      height: 220px;
      max-width: 100%;
      display: block;
      padding: 10px;
      border-radius: 18px;
      background: #ffffff;
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }
    details.admin-details {
      border: 1px dashed rgba(158, 67, 90, 0.24);
      border-radius: var(--radius-md);
      padding: 14px 16px;
      background: rgba(255,255,255,0.82);
    }
    details.admin-details summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--foreground);
    }
    .admin-logout-form {
      margin: 0;
    }
    @media (max-width: 980px) {
      .admin-shell-with-sidebar {
        grid-template-columns: 1fr;
      }
      .admin-sidebar {
        position: static;
      }
      .admin-clients-layout {
        grid-template-columns: 1fr;
      }
      .admin-sticky-card {
        position: static;
      }
    }
    @media (max-width: 720px) {
      body {
        padding: 14px 10px 28px;
      }
      .admin-hero {
        padding: 22px 18px 16px;
      }
      .admin-content {
        padding: 18px;
      }
      .admin-sidebar-card {
        padding: 18px;
      }
      .admin-card-header,
      .admin-card-content {
        padding-left: 16px;
        padding-right: 16px;
      }
      .admin-inline-actions > * {
        width: 100%;
      }
      .admin-inline-actions .admin-action-hint {
        width: 100%;
      }
      .admin-input-code {
        font-size: 20px;
      }
      .admin-property-row {
        flex-direction: column;
      }
      .admin-property-value {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <main class="${shellClass}">
    ${sidebar}
    <section class="admin-panel">
      <div class="admin-hero">
        <p class="admin-kicker">${kicker}</p>
        <h1 class="admin-title">${escapeHtml(title)}</h1>
        ${subtitle}
        ${heroMeta}
      </div>
      <div class="admin-content">
        ${content}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderAdminUnavailablePage() {
  return renderAdminLayout(
    "Админка недоступна",
    `${renderAdminCard(
      "Вход временно недоступен",
      "Нужные настройки для входа пока не завершены.",
      `<div class="admin-alert admin-alert-error">Админка сейчас недоступна. Пожалуйста, обратитесь к разработчику.</div>`,
      { eyebrow: "Статус", muted: true }
    )}`,
    {
      kicker: "SHYNLI",
      subtitle: "Как только настройки будут готовы, вход снова заработает.",
      sidebar: renderAdminAuthSidebar("login"),
    }
  );
}

function renderLoginPage(config, options = {}) {
  const errorBlock = options.error
    ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const infoBlock = options.info
    ? `<div class="admin-alert admin-alert-info">${escapeHtml(options.info)}</div>`
    : "";

  return renderAdminLayout(
    "Вход в админку",
    `${errorBlock}
      ${infoBlock}
      <div class="admin-section-grid admin-form-grid-two">
        ${renderAdminCard(
          "Вход",
          "Введите почту и пароль.",
          `<form class="admin-form" method="post" action="${ADMIN_LOGIN_PATH}" autocomplete="on">
            <label class="admin-label">
              Почта
              <input class="admin-input" type="email" name="email" value="${escapeHtmlText(options.email || config.email)}" autocomplete="username" required>
            </label>
            <label class="admin-label">
              Пароль
              <input class="admin-input" type="password" name="password" autocomplete="current-password" required>
            </label>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Продолжить</button>
              <span class="admin-action-hint">Шаг 1 из 2.</span>
            </div>
          </form>`,
          { eyebrow: "Вход" }
        )}
        ${renderAdminCard(
          "Дальше",
          "После пароля понадобится код из приложения.",
          `<ul class="admin-feature-list">
            <li>Если приложение ещё не настроено, на следующем шаге появится QR-код.</li>
            <li>Для входа нужен текущий 6-значный код.</li>
            <li>После подтверждения откроется админка.</li>
          </ul>`,
          { eyebrow: "Подсказка", muted: true }
        )}
      </div>`,
    {
      subtitle: "Введите почту и пароль, затем подтвердите вход кодом из приложения.",
      sidebar: renderAdminAuthSidebar("login"),
    }
  );
}

function renderTwoFactorPage(config, options = {}) {
  const errorBlock = options.error
    ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const secret = options.secret || adminAuth.getTotpSecretMaterial(config);
  const qrMarkup = options.qrMarkup || "";

  return renderAdminLayout(
    "Подтверждение входа",
    `${errorBlock}
      <div class="admin-section-grid admin-form-grid-two">
        ${renderAdminCard(
          "Код из приложения",
          "Введите текущий 6-значный код.",
          `<form class="admin-form" method="post" action="${ADMIN_2FA_PATH}" autocomplete="off">
            <label class="admin-label">
              Код
              <input class="admin-input admin-input-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" name="code" placeholder="123456" autocomplete="one-time-code" required>
            </label>
            <p class="admin-field-note">Шаг 2 из 2.</p>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Подтвердить вход</button>
              <a class="admin-link-button admin-button-secondary" href="${ADMIN_LOGIN_PATH}">Назад</a>
            </div>
          </form>`,
          { eyebrow: "Код" }
        )}
        ${renderAdminCard(
          "Настройка приложения",
          "Если приложение ещё не подключено, используйте QR-код или ключ ниже.",
          `<details class="admin-details" open>
            <summary>QR-код и ключ</summary>
            <div class="admin-form-grid admin-form-grid-two" style="margin-top:14px;">
              ${renderAdminCard(
                "QR-код",
                "Откройте приложение и отсканируйте код.",
                qrMarkup
                  ? `<div class="admin-qr-card">
                      ${qrMarkup}
                      <p class="admin-field-note">Подойдёт Google Authenticator, 1Password и похожие приложения.</p>
                    </div>`
                  : `<p class="admin-field-note">Если QR-код не появился, используйте ключ вручную.</p>`,
                { eyebrow: "QR", muted: true }
              )}
              ${renderAdminCard(
                "Ключ вручную",
                "Введите эти данные в приложении, если QR-код не используется.",
                `<div class="admin-property-list">
                  <div class="admin-property-row">
                    <span class="admin-property-label">Сервис</span>
                    <span class="admin-property-value">${escapeHtml(config.issuer)}</span>
                  </div>
                  <div class="admin-property-row">
                    <span class="admin-property-label">Аккаунт</span>
                    <span class="admin-property-value">${escapeHtml(config.email)}</span>
                  </div>
                  <div class="admin-property-row">
                    <span class="admin-property-label">Ключ</span>
                    <span class="admin-property-value"><code>${escapeHtml(secret.base32)}</code></span>
                  </div>
                </div>`,
                { eyebrow: "Ключ", muted: true }
              )}
            </div>
          </details>`,
          { eyebrow: "Настройка", muted: true }
        )}
      </div>`,
    {
      subtitle: "Введите код из приложения для подтверждения входа.",
      sidebar: renderAdminAuthSidebar("2fa"),
    }
  );
}

function renderAdminPropertyList(rows = []) {
  return `<div class="admin-property-list">
    ${rows
      .map(
        (row) => `<div class="admin-property-row">
          <span class="admin-property-label">${escapeHtml(row.label)}</span>
          <span class="admin-property-value">${row.raw ? row.value : escapeHtml(row.value)}</span>
        </div>`
      )
      .join("")}
  </div>`;
}

function renderAdminSignedInTopbar(config, options = {}) {
  const actions = [];
  if (options.linkHref && options.linkLabel) {
    actions.push(
      `<a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(options.linkHref)}"${options.linkExternal ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHtml(options.linkLabel)}</a>`
    );
  }
  actions.push(
    `<form class="admin-logout-form" method="post" action="${ADMIN_LOGOUT_PATH}">
      <button class="admin-button admin-button-secondary" type="submit">Выйти</button>
    </form>`
  );

  return `<div class="admin-topbar">
    <div>
      <p>${escapeHtml(options.caption || "Вы вошли как")}</p>
      <p class="admin-user-email">${escapeHtml(config.email)}</p>
    </div>
    <div class="admin-inline-actions">
      ${actions.join("")}
    </div>
  </div>`;
}

function collectAdminClientRecords(entries = []) {
  const clients = new Map();

  for (const entry of entries) {
    const clientKey = normalizeString(
      entry.customerEmail || entry.customerPhone || entry.contactId || entry.requestId || entry.id,
      250
    ).toLowerCase();
    if (!clientKey) continue;

    const latestService = normalizeString(entry.serviceName || entry.serviceType || "Уборка", 120);
    const latestStatus = normalizeString(entry.status, 32).toLowerCase();
    const totalPrice = Number(entry.totalPrice);
    const safeTotalPrice = Number.isFinite(totalPrice) ? totalPrice : 0;
    const historyEntry = {
      id: normalizeString(entry.id, 120),
      requestId: normalizeString(entry.requestId, 120),
      createdAt: normalizeString(entry.createdAt, 80),
      serviceName: latestService,
      totalPrice: safeTotalPrice,
      selectedDate: normalizeString(entry.selectedDate, 32),
      selectedTime: normalizeString(entry.selectedTime, 32),
      fullAddress: normalizeString(entry.fullAddress, 500),
      status: latestStatus,
    };
    const existing = clients.get(clientKey);

    if (!existing) {
      clients.set(clientKey, {
        key: clientKey,
        name: normalizeString(entry.customerName || "Клиент", 250),
        email: normalizeString(entry.customerEmail, 250),
        phone: normalizeString(entry.customerPhone, 80),
        address: normalizeString(entry.fullAddress, 500),
        latestCreatedAt: normalizeString(entry.createdAt, 80),
        latestService,
        requestCount: 1,
        latestStatus,
        latestRequestId: normalizeString(entry.requestId, 120),
        totalRevenue: safeTotalPrice,
        statuses: new Set([latestStatus].filter(Boolean)),
        entries: [historyEntry],
      });
      continue;
    }

    existing.requestCount += 1;
    existing.totalRevenue += safeTotalPrice;
    if (latestStatus) existing.statuses.add(latestStatus);
    existing.entries.push(historyEntry);

    const existingTime = Date.parse(existing.latestCreatedAt || "");
    const nextTime = Date.parse(entry.createdAt || "");
    if (!Number.isFinite(existingTime) || (Number.isFinite(nextTime) && nextTime >= existingTime)) {
      existing.name = normalizeString(entry.customerName || existing.name, 250);
      existing.email = normalizeString(entry.customerEmail || existing.email, 250);
      existing.phone = normalizeString(entry.customerPhone || existing.phone, 80);
      existing.address = normalizeString(entry.fullAddress || existing.address, 500);
      existing.latestCreatedAt = normalizeString(entry.createdAt || existing.latestCreatedAt, 80);
      existing.latestService = latestService || existing.latestService;
      existing.latestStatus = latestStatus || existing.latestStatus;
      existing.latestRequestId = normalizeString(entry.requestId || existing.latestRequestId, 120);
    }
  }

  return Array.from(clients.values())
    .map((client) => ({
      ...client,
      statuses: Array.from(client.statuses).filter(Boolean),
      entries: client.entries.sort((left, right) => {
        const leftTime = Date.parse(left.createdAt || "");
        const rightTime = Date.parse(right.createdAt || "");
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      }),
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.latestCreatedAt || "");
      const rightTime = Date.parse(right.latestCreatedAt || "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
}

function renderAdminClientStatusBadge(status) {
  const normalized = normalizeString(status, 32).toLowerCase();
  if (!normalized) return renderAdminBadge("Без статуса", "muted");
  return renderQuoteOpsStatusBadge(normalized);
}

function renderAdminClientHistoryItem(entry) {
  const scheduledLabel = [entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Дата не указана";
  return `<article class="admin-history-item">
    <div class="admin-history-head">
      <div>
        <h3 class="admin-history-title">${escapeHtml(formatAdminServiceLabel(entry.serviceName))}</h3>
        <p class="admin-history-copy">${escapeHtml(formatAdminDateTime(entry.createdAt))} • ${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</p>
      </div>
      <div class="admin-entry-meta">
        ${renderAdminClientStatusBadge(entry.status)}
      </div>
    </div>
    <div class="admin-history-meta">
      <span>${escapeHtml(`Номер заявки: ${entry.requestId || "не указан"}`)}</span>
      <span>${escapeHtml(`Дата уборки: ${scheduledLabel}`)}</span>
      <span>${escapeHtml(`Адрес: ${entry.fullAddress || "не указан"}`)}</span>
    </div>
  </article>`;
}

function renderAdminClientDetailCard(client) {
  if (!client) {
    return renderAdminCard(
      "Карточка клиента",
      "Выберите клиента в таблице, чтобы открыть историю заявок и сумму заказов.",
      `<div class="admin-empty-state">После выбора клиента здесь появятся контакты, общая сумма заказов и полная история заявок.</div>`,
      { eyebrow: "Клиент", muted: true }
    );
  }

  const quoteOpsHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
    q: client.email || client.phone || client.name,
  });
  const statusBadges = client.statuses.length > 0
    ? client.statuses.map((status) => renderAdminClientStatusBadge(status)).join("")
    : renderAdminBadge("Без статуса", "muted");

  return renderAdminCard(
    "Карточка клиента",
    "Контакты, сумма заказов и вся история обращений.",
    `<div class="admin-client-identity">
      <div>
        <h3 class="admin-client-title">${escapeHtml(client.name || "Клиент")}</h3>
        <p class="admin-card-copy">Последняя заявка: ${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</p>
      </div>
      <div class="admin-badge-row">
        ${statusBadges}
      </div>
    </div>
    ${renderAdminPropertyList([
      { label: "Email", value: client.email || "Не указан" },
      { label: "Телефон", value: client.phone || "Не указан" },
      { label: "Всего заявок", value: String(client.requestCount) },
      { label: "Сумма заказов", value: formatCurrencyAmount(client.totalRevenue) },
      { label: "Последняя услуга", value: formatAdminServiceLabel(client.latestService) },
      { label: "Адрес", value: client.address || "Не указан" },
    ])}
    <div class="admin-inline-actions">
      <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(quoteOpsHref)}">Открыть заявки клиента</a>
    </div>
    <div class="admin-divider"></div>
    <div class="admin-subsection-head">
      <h3 class="admin-subsection-title">История заявок</h3>
      <span class="admin-action-hint">${escapeHtml(client.requestCount === 1 ? "1 заявка" : `${client.requestCount} заявок`)}</span>
    </div>
    <div class="admin-history-list">
      ${client.entries.map((entry) => renderAdminClientHistoryItem(entry)).join("")}
    </div>`,
    { eyebrow: "Клиент", muted: true }
  );
}

async function renderDashboardPage(req, config, quoteOpsLedger) {
  const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
  const clientRecords = collectAdminClientRecords(allEntries);
  const scheduledCount = allEntries.filter((entry) => Boolean(entry.selectedDate || entry.selectedTime)).length;
  const attentionCount = allEntries.filter((entry) => entry.status !== "success").length;

  return renderAdminLayout(
    "Обзор",
    `${renderAdminSignedInTopbar(config, {
      linkHref: QUOTE_PUBLIC_PATH,
      linkLabel: "Открыть форму заявки",
      linkExternal: true,
    })}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Клиенты",
          "Все клиенты из текущих заявок.",
          `<p class="admin-metric-value">${escapeHtml(String(clientRecords.length))}</p>`,
          { eyebrow: "Обзор" }
        )}
        ${renderAdminCard(
          "Заказы",
          "Все заявки и заказы в работе.",
          `<p class="admin-metric-value">${escapeHtml(String(allEntries.length))}</p>`,
          { eyebrow: "Обзор", muted: true }
        )}
        ${renderAdminCard(
          "Назначена дата",
          "Заявки, где уже выбраны день или время.",
          `<p class="admin-metric-value">${escapeHtml(String(scheduledCount))}</p>`,
          { eyebrow: "Обзор", muted: true }
        )}
        ${renderAdminCard(
          "Нужно проверить",
          "Заявки, которым требуется внимание.",
          `<p class="admin-metric-value">${escapeHtml(String(attentionCount))}</p>`,
          { eyebrow: "Обзор", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Разделы",
          "Основные рабочие страницы админки.",
          `<div class="admin-link-grid">
            <a class="admin-link-tile" href="${ADMIN_CLIENTS_PATH}">
              <strong>Клиенты</strong>
              <span>База клиентов и контактов.</span>
            </a>
            <a class="admin-link-tile" href="${ADMIN_ORDERS_PATH}">
              <strong>Заказы</strong>
              <span>Текущие заказы и даты.</span>
            </a>
            <a class="admin-link-tile" href="${ADMIN_STAFF_PATH}">
              <strong>Сотрудники</strong>
              <span>Команда и роли.</span>
            </a>
            <a class="admin-link-tile" href="${ADMIN_SETTINGS_PATH}">
              <strong>Settings</strong>
              <span>Чек-листы и внутренние шаблоны.</span>
            </a>
            <a class="admin-link-tile" href="${ADMIN_QUOTE_OPS_PATH}">
              <strong>Заявки</strong>
              <span>Все заявки с сайта.</span>
            </a>
          </div>`,
          { eyebrow: "Меню" }
        )}
        ${renderAdminCard(
          "Быстрый доступ",
          "Полезные ссылки для ежедневной работы.",
          `<div class="admin-link-grid">
            <a class="admin-link-tile" href="/" target="_blank" rel="noreferrer">
              <strong>Сайт</strong>
              <span>Открыть главную страницу.</span>
            </a>
            <a class="admin-link-tile" href="${QUOTE_PUBLIC_PATH}" target="_blank" rel="noreferrer">
              <strong>Форма заявки</strong>
              <span>Открыть форму для клиента.</span>
            </a>
          </div>`,
          { eyebrow: "Ссылки", muted: true }
        )}
      </div>`,
    {
      kicker: "SHYNLI",
      subtitle: "Рабочая панель для клиентов, заказов, сотрудников и заявок.",
      sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH),
    }
  );
}

async function renderClientsPage(req, config, quoteOpsLedger) {
  const { filters } = getAdminClientsFilters(req);
  const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
  const clientRecords = collectAdminClientRecords(allEntries);
  const filteredClients = filterAdminClientRecords(clientRecords, filters);
  const clientsWithEmail = clientRecords.filter((client) => Boolean(client.email)).length;
  const repeatClients = clientRecords.filter((client) => client.requestCount > 1).length;
  const selectedClient = filteredClients.find((client) => client.key === filters.client) || filteredClients[0] || null;
  const selectedClientKey = selectedClient ? selectedClient.key : "";
  const resetHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, selectedClientKey ? { client: selectedClientKey } : {});
  const emptyStateMessage = clientRecords.length === 0
    ? "Пока клиентов нет. Как только появятся новые заявки, этот раздел заполнится автоматически."
    : "По текущим фильтрам клиентов не найдено.";

  return renderAdminLayout(
    "Клиенты",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_QUOTE_OPS_PATH,
      linkLabel: "Открыть заявки",
    })}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Всего клиентов",
          "Уникальные клиенты по текущим заявкам.",
          `<p class="admin-metric-value">${escapeHtml(String(clientRecords.length))}</p>`,
          { eyebrow: "Клиенты" }
        )}
        ${renderAdminCard(
          "Найдено сейчас",
          "Клиенты, подходящие под текущие фильтры.",
          `<p class="admin-metric-value">${escapeHtml(String(filteredClients.length))}</p>`,
          { eyebrow: "Поиск", muted: true }
        )}
        ${renderAdminCard(
          "Повторные обращения",
          "Клиенты с двумя и более заявками.",
          `<p class="admin-metric-value">${escapeHtml(String(repeatClients))}</p>`,
          { eyebrow: "Повторы", muted: true }
        )}
        ${renderAdminCard(
          "Есть email",
          "Клиенты, которым можно написать.",
          `<p class="admin-metric-value">${escapeHtml(String(clientsWithEmail))}</p>`,
          { eyebrow: "Контакты", muted: true }
        )}
      </div>
      <div class="admin-clients-layout">
        ${renderAdminCard(
          "База клиентов",
          "Полный список клиентов с поиском по имени, email и телефону.",
          `<form class="admin-form-grid admin-form-grid-three" method="get" action="${ADMIN_CLIENTS_PATH}">
            <label class="admin-label">
              Имя
              <input class="admin-input" type="search" name="name" value="${escapeHtmlText(filters.name)}" placeholder="Например, Jane">
            </label>
            <label class="admin-label">
              Email
              <input class="admin-input" type="search" name="email" value="${escapeHtmlText(filters.email)}" placeholder="name@example.com">
            </label>
            <label class="admin-label">
              Телефон
              <input class="admin-input" type="search" name="phone" value="${escapeHtmlText(filters.phone)}" placeholder="3125550100">
            </label>
            <div class="admin-inline-actions" style="align-self:end;">
              <button class="admin-button" type="submit">Применить</button>
              <a class="admin-link-button admin-button-secondary" href="${resetHref}">Сбросить</a>
            </div>
          </form>
          <div class="admin-toolbar">
            <span class="admin-action-hint">Найдено ${escapeHtml(String(filteredClients.length))} из ${escapeHtml(String(clientRecords.length))} клиентов.</span>
            <span class="admin-action-hint">${selectedClient ? `Открыта карточка: ${escapeHtml(selectedClient.name || "Клиент")}` : "Выберите клиента из списка, чтобы посмотреть историю."}</span>
          </div>
          ${filteredClients.length > 0
            ? `<div class="admin-table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>Контакты</th>
                      <th>Последняя заявка</th>
                      <th>Последняя услуга</th>
                      <th>Заявок</th>
                      <th>Сумма</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredClients
                      .map((client) => {
                        const rowHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
                          name: filters.name,
                          email: filters.email,
                          phone: filters.phone,
                          client: client.key,
                        });
                        return `<tr class="${client.key === selectedClientKey ? "admin-table-row-active" : ""}">
                          <td>
                            <div class="admin-table-stack">
                              <a class="admin-table-link" href="${escapeHtmlAttribute(rowHref)}">${escapeHtml(client.name || "Клиент")}</a>
                              <span class="admin-table-muted">${escapeHtml(client.address || "Адрес не указан")}</span>
                            </div>
                          </td>
                          <td>
                            ${client.email || client.phone
                              ? `<div class="admin-table-stack">
                                  ${client.email ? `<span>${escapeHtml(client.email)}</span>` : ""}
                                  ${client.phone ? `<span>${escapeHtml(client.phone)}</span>` : ""}
                                </div>`
                              : `<span class="admin-table-muted">Контакты не указаны</span>`}
                          </td>
                          <td>
                            <div class="admin-table-stack">
                              <span>${renderAdminClientStatusBadge(client.latestStatus)}</span>
                              <span>${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</span>
                              <span class="admin-table-muted">${escapeHtml(client.latestRequestId || "Номер не указан")}</span>
                            </div>
                          </td>
                          <td>${escapeHtml(formatAdminServiceLabel(client.latestService))}</td>
                          <td class="admin-table-number">${escapeHtml(String(client.requestCount))}</td>
                          <td class="admin-table-number">${escapeHtml(formatCurrencyAmount(client.totalRevenue))}</td>
                          <td><a class="admin-table-action" href="${escapeHtmlAttribute(rowHref)}">Открыть</a></td>
                        </tr>`;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<div class="admin-empty-state">${emptyStateMessage}</div>`}`,
          { eyebrow: "Клиенты" }
        )}
        <div class="admin-sticky-card">
          ${renderAdminClientDetailCard(selectedClient)}
        </div>
      </div>`,
    {
      kicker: "Клиенты",
      subtitle: "Полный список клиентов, фильтры и история заявок.",
      sidebar: renderAdminAppSidebar(ADMIN_CLIENTS_PATH),
    }
  );
}

function renderOrderStatusBadge(status) {
  const normalized = normalizeOrderStatus(status, "new");
  if (normalized === "completed") return renderAdminBadge("Completed", "success");
  if (normalized === "canceled") return renderAdminBadge("Canceled", "danger");
  if (normalized === "rescheduled") return renderAdminBadge("Rescheduled", "outline");
  if (normalized === "in-progress") return renderAdminBadge("In progress", "default");
  if (normalized === "scheduled") return renderAdminBadge("Scheduled", "outline");
  return renderAdminBadge("New", "muted");
}

function renderOrdersNotice(req) {
  const reqUrl = getRequestUrl(req);
  const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
  if (notice === "order-saved") {
    return `<div class="admin-alert admin-alert-info">Заказ обновлён.</div>`;
  }
  if (notice === "order-missing") {
    return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;
  }
  if (notice === "order-save-failed") {
    return `<div class="admin-alert admin-alert-error">Не удалось сохранить заказ. Попробуйте ещё раз.</div>`;
  }
  return "";
}

function renderOrderEntryCard(order, returnTo) {
  return `<article class="admin-entry-card">
    <div class="admin-entry-head">
      <div>
        <h3 class="admin-entry-title">${escapeHtml(order.customerName || "Клиент")}</h3>
        <p class="admin-entry-copy">${escapeHtml(order.serviceLabel)} • ${escapeHtml(formatCurrencyAmount(order.totalPrice))}</p>
      </div>
      <div class="admin-entry-meta">
        ${renderOrderStatusBadge(order.orderStatus)}
        ${renderAdminBadge(order.serviceLabel, "outline")}
        ${order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : ""}
        ${renderQuoteOpsStatusBadge(order.crmStatus)}
      </div>
    </div>
    <div class="admin-entry-grid">
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Номер заказа</span>
        <p class="admin-mini-value">${escapeHtml(order.requestId || "Не указан")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Дата и время</span>
        <p class="admin-mini-value">${escapeHtml(order.scheduleLabel)}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Повторяемость</span>
        <p class="admin-mini-value">${escapeHtml(order.frequencyLabel)}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Сотрудник</span>
        <p class="admin-mini-value">${escapeHtml(order.assignedStaff || "Не назначен")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Контакты</span>
        <p class="admin-mini-value">${escapeHtml(order.customerPhone || "Телефон не указан")}${order.customerEmail ? `<br>${escapeHtml(order.customerEmail)}` : ""}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Адрес</span>
        <p class="admin-mini-value">${escapeHtml(order.fullAddress || "Не указан")}</p>
      </div>
    </div>
    <form class="admin-form-grid admin-form-grid-two" method="post" action="${ADMIN_ORDERS_PATH}">
      <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
      <label class="admin-label">
        Статус заказа
        <select class="admin-input" name="orderStatus">
          <option value="new"${order.orderStatus === "new" ? " selected" : ""}>New</option>
          <option value="scheduled"${order.orderStatus === "scheduled" ? " selected" : ""}>Scheduled</option>
          <option value="in-progress"${order.orderStatus === "in-progress" ? " selected" : ""}>In progress</option>
          <option value="completed"${order.orderStatus === "completed" ? " selected" : ""}>Completed</option>
          <option value="canceled"${order.orderStatus === "canceled" ? " selected" : ""}>Canceled</option>
          <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Rescheduled</option>
        </select>
      </label>
      <label class="admin-label">
        Кто назначен
        <input class="admin-input" type="text" name="assignedStaff" value="${escapeHtmlText(order.assignedStaff)}" placeholder="Имя сотрудника">
      </label>
      <label class="admin-label">
        Дата уборки
        <input class="admin-input" type="date" name="selectedDate" value="${escapeHtmlAttribute(order.selectedDate)}">
      </label>
      <label class="admin-label">
        Время уборки
        <input class="admin-input" type="time" name="selectedTime" value="${escapeHtmlAttribute(order.selectedTime)}">
      </label>
      <label class="admin-label">
        Повторяемость
        <select class="admin-input" name="frequency">
          <option value=""${!order.frequency ? " selected" : ""}>Not set</option>
          <option value="weekly"${order.frequency === "weekly" ? " selected" : ""}>Weekly</option>
          <option value="biweekly"${order.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
          <option value="monthly"${order.frequency === "monthly" ? " selected" : ""}>Monthly</option>
        </select>
      </label>
      <div class="admin-inline-actions admin-form-actions">
        <button class="admin-button" type="submit">Сохранить заказ</button>
        <span class="admin-action-hint">Учитываем тип уборки, дату, повторяемость, статус и назначенного сотрудника.</span>
      </div>
    </form>
  </article>`;
}

async function renderOrdersPage(req, config, quoteOpsLedger) {
  const { reqUrl, filters } = getOrdersFilters(req);
  const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
  const allOrders = collectAdminOrderRecords(allEntries);
  const orders = filterAdminOrderRecords(allOrders, filters);
  const totalOrders = allOrders.length;
  const scheduledCount = allOrders.filter((order) => order.orderStatus === "scheduled").length;
  const recurringCount = allOrders.filter((order) => order.isRecurring).length;
  const assignedCount = allOrders.filter((order) => order.isAssigned).length;
  const attentionCount = allOrders.filter((order) => order.needsAttention).length;
  const revenuePipeline = allOrders.reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
  const statusCounts = countOrdersByStatus(allOrders);
  const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;

  return renderAdminLayout(
    "Заказы",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_QUOTE_OPS_PATH,
      linkLabel: "Открыть заявки",
    })}
      ${renderOrdersNotice(req)}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Всего заказов",
          "Все заказы и заявки, которые сейчас ведём.",
          `<p class="admin-metric-value">${escapeHtml(String(totalOrders))}</p>`,
          { eyebrow: "Заказы" }
        )}
        ${renderAdminCard(
          "Scheduled",
          "Заказы с подтверждённой датой или временем.",
          `<p class="admin-metric-value">${escapeHtml(String(scheduledCount))}</p>`,
          { eyebrow: "Статус", muted: true }
        )}
        ${renderAdminCard(
          "Recurring",
          "Weekly, bi-weekly или monthly заказы.",
          `<p class="admin-metric-value">${escapeHtml(String(recurringCount))}</p>`,
          { eyebrow: "Повторяемость", muted: true }
        )}
        ${renderAdminCard(
          "Assigned",
          "Заказы, у которых уже есть исполнитель.",
          `<p class="admin-metric-value">${escapeHtml(String(assignedCount))}</p>`,
          { eyebrow: "Сотрудники", muted: true }
        )}
      </div>
      ${renderAdminCard(
        "Список заказов",
        "Фильтруйте и обновляйте статус, дату, повторяемость и сотрудника.",
        `<form class="admin-form-grid admin-form-grid-two" method="get" action="${ADMIN_ORDERS_PATH}">
          <label class="admin-label">
            Поиск
            <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Клиент, телефон, адрес, сотрудник, номер">
          </label>
          <label class="admin-label">
            Статус
            <select class="admin-input" name="status">
              <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
              <option value="new"${filters.status === "new" ? " selected" : ""}>New</option>
              <option value="scheduled"${filters.status === "scheduled" ? " selected" : ""}>Scheduled</option>
              <option value="in-progress"${filters.status === "in-progress" ? " selected" : ""}>In progress</option>
              <option value="completed"${filters.status === "completed" ? " selected" : ""}>Completed</option>
              <option value="canceled"${filters.status === "canceled" ? " selected" : ""}>Canceled</option>
              <option value="rescheduled"${filters.status === "rescheduled" ? " selected" : ""}>Rescheduled</option>
            </select>
          </label>
          <label class="admin-label">
            Тип уборки
            <select class="admin-input" name="serviceType">
              <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
              <option value="standard"${filters.serviceType === "standard" ? " selected" : ""}>Standard</option>
              <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Deep</option>
              <option value="move-in/out"${filters.serviceType === "move-in/out" ? " selected" : ""}>Move-in/out</option>
            </select>
          </label>
          <label class="admin-label">
            Повторяемость
            <select class="admin-input" name="frequency">
              <option value="all"${filters.frequency === "all" ? " selected" : ""}>Все</option>
              <option value="weekly"${filters.frequency === "weekly" ? " selected" : ""}>Weekly</option>
              <option value="biweekly"${filters.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
              <option value="monthly"${filters.frequency === "monthly" ? " selected" : ""}>Monthly</option>
            </select>
          </label>
          <label class="admin-label">
            Назначение
            <select class="admin-input" name="assignment">
              <option value="all"${filters.assignment === "all" ? " selected" : ""}>Все</option>
              <option value="assigned"${filters.assignment === "assigned" ? " selected" : ""}>Назначен</option>
              <option value="unassigned"${filters.assignment === "unassigned" ? " selected" : ""}>Не назначен</option>
            </select>
          </label>
          <div class="admin-inline-actions admin-form-actions">
            <button class="admin-button" type="submit">Применить</button>
            <a class="admin-link-button admin-button-secondary" href="${ADMIN_ORDERS_PATH}">Сбросить</a>
          </div>
        </form>
        <div class="admin-divider"></div>
        <div class="admin-entry-list">
          ${orders.length > 0
            ? orders.map((order) => renderOrderEntryCard(order, currentReturnTo)).join("")
            : `<div class="admin-empty-state">По текущему фильтру заказов нет.</div>`}
        </div>`,
        { eyebrow: "Управление" }
      )}
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Сводка по статусам",
          "Быстрая картина по текущему состоянию заказов.",
          `${renderAdminPropertyList([
            { label: "New", value: String(statusCounts.new) },
            { label: "Scheduled", value: String(statusCounts.scheduled) },
            { label: "In progress", value: String(statusCounts["in-progress"]) },
            { label: "Completed", value: String(statusCounts.completed) },
            { label: "Canceled", value: String(statusCounts.canceled) },
            { label: "Rescheduled", value: String(statusCounts.rescheduled) },
            { label: "CRM требует внимания", value: String(attentionCount) },
            { label: "Сумма заказов", value: formatCurrencyAmount(revenuePipeline) },
          ])}`,
          { eyebrow: "Статусы", muted: true }
        )}
        ${renderAdminCard(
          "Что учитываем",
          "Поля, которые теперь ведём прямо в разделе заказов.",
          `<ul class="admin-feature-list">
            <li>Тип уборки: standard, deep, move-in/out.</li>
            <li>Дата и время визита.</li>
            <li>Повторяемость: weekly, bi-weekly, monthly.</li>
            <li>Статус заказа: new, scheduled, in progress, completed, canceled, rescheduled.</li>
            <li>Назначенный сотрудник.</li>
          </ul>`,
          { eyebrow: "Модель заказа", muted: true }
        )}
      </div>`,
    {
      kicker: "Заказы",
      subtitle: "Рабочий список заказов с датой, повторяемостью, статусом и назначенным сотрудником.",
      sidebar: renderAdminAppSidebar(ADMIN_ORDERS_PATH),
    }
  );
}

function renderStaffPage(req, config) {
  return renderAdminLayout(
    "Сотрудники",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_ORDERS_PATH,
      linkLabel: "Открыть заказы",
    })}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Сотрудники",
          "Список сотрудников появится здесь.",
          `<p class="admin-metric-value">0</p>`,
          { eyebrow: "Команда" }
        )}
        ${renderAdminCard(
          "Роли",
          "Раздел подготовлен для ролей и доступа.",
          `<p class="admin-metric-value">Скоро</p>`,
          { eyebrow: "Роли", muted: true }
        )}
        ${renderAdminCard(
          "График",
          "Здесь можно будет вести расписание.",
          `<p class="admin-metric-value">Скоро</p>`,
          { eyebrow: "График", muted: true }
        )}
        ${renderAdminCard(
          "Статус",
          "Раздел уже добавлен в админку.",
          `<p class="admin-metric-value">Готово</p>`,
          { eyebrow: "Статус", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Раздел сотрудников",
          "Здесь будут карточки сотрудников и их роли.",
          `<ul class="admin-feature-list">
            <li>Список сотрудников.</li>
            <li>Роли и статусы.</li>
            <li>График и заметки.</li>
          </ul>`,
          { eyebrow: "Команда" }
        )}
        ${renderAdminCard(
          "Сейчас",
          "Раздел уже на месте и готов к заполнению.",
          `${renderAdminPropertyList([
            { label: "Статус", value: "Раздел создан" },
            { label: "Данные", value: "Будут добавлены позже" },
            { label: "Назначение", value: "Работа с командой" },
          ])}`,
          { eyebrow: "Инфо", muted: true }
        )}
      </div>`,
    {
      kicker: "Сотрудники",
      subtitle: "Раздел для команды и ролей.",
      sidebar: renderAdminAppSidebar(ADMIN_STAFF_PATH),
    }
  );
}

function renderSettingsNotice(req) {
  const reqUrl = getRequestUrl(req);
  const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
  if (notice === "saved") {
    return `<div class="admin-alert admin-alert-info">Отметки чек-листа сохранены.</div>`;
  }
  if (notice === "added") {
    return `<div class="admin-alert admin-alert-info">Новый пункт добавлен в шаблон.</div>`;
  }
  if (notice === "reset") {
    return `<div class="admin-alert admin-alert-info">Все отметки по этому шаблону сброшены.</div>`;
  }
  if (notice === "error") {
    return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Попробуйте ещё раз.</div>`;
  }
  return "";
}

function buildSettingsRedirectPath(serviceType, notice = "") {
  const normalizedServiceType = normalizeString(serviceType, 32).toLowerCase();
  const pathWithQuery = buildAdminRedirectPath(ADMIN_SETTINGS_PATH, {
    notice,
    serviceType: normalizedServiceType,
  });
  return normalizedServiceType ? `${pathWithQuery}#settings-${normalizedServiceType}` : pathWithQuery;
}

function renderSettingsTemplateCard(template) {
  const completedCount = template.items.filter((item) => item.completed).length;

  return renderAdminCard(
    template.title,
    template.description,
    `<div id="settings-${escapeHtmlAttribute(template.serviceType)}"></div>
    <p class="admin-checklist-summary">Выполнено ${escapeHtml(String(completedCount))} из ${escapeHtml(String(template.items.length))}</p>
    <form class="admin-form" method="post" action="${ADMIN_SETTINGS_PATH}">
      <input type="hidden" name="action" value="save_checklist_state">
      <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
      <div class="admin-checklist-list">
        ${template.items.length > 0
          ? template.items
              .map(
                (item) => `<label class="admin-checklist-row">
                  <input type="checkbox" name="completedItemIds" value="${escapeHtmlAttribute(item.id)}"${item.completed ? " checked" : ""}>
                  <span class="admin-checklist-copy">
                    <strong>${escapeHtml(item.label)}</strong>
                    <span>${item.completed ? "Отмечено как выполненное" : "Пока не отмечено"}</span>
                  </span>
                </label>`
              )
              .join("")
          : `<div class="admin-empty-state">В этом шаблоне пока нет пунктов.</div>`}
      </div>
      <div class="admin-inline-actions" style="margin-top:14px;">
        <button class="admin-button" type="submit">Сохранить отметки</button>
      </div>
    </form>
    <div class="admin-divider"></div>
    <form class="admin-form-grid admin-form-grid-two" method="post" action="${ADMIN_SETTINGS_PATH}">
      <input type="hidden" name="action" value="add_checklist_item">
      <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
      <label class="admin-label">
        Новый пункт
        <input class="admin-input" type="text" name="itemLabel" maxlength="240" placeholder="Например: проверить зеркала" required>
      </label>
      <div class="admin-inline-actions" style="align-self:end;">
        <button class="admin-button admin-button-secondary" type="submit">Добавить пункт</button>
      </div>
    </form>
    <div class="admin-inline-actions" style="margin-top:12px;">
      <form method="post" action="${ADMIN_SETTINGS_PATH}">
        <input type="hidden" name="action" value="reset_checklist_state">
        <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
        <button class="admin-button admin-button-secondary" type="submit">Сбросить отметки</button>
      </form>
    </div>`,
    {
      eyebrow: "Чек-лист",
      muted: true,
    }
  );
}

async function renderSettingsPage(req, config, settingsStore) {
  const snapshot = settingsStore ? await settingsStore.getSnapshot() : { templates: [] };
  const templates = Array.isArray(snapshot.templates) ? snapshot.templates : [];
  const totalItems = templates.reduce((sum, template) => sum + template.items.length, 0);
  const completedItems = templates.reduce(
    (sum, template) => sum + template.items.filter((item) => item.completed).length,
    0
  );

  return renderAdminLayout(
    "Settings",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_ROOT_PATH,
      linkLabel: "Открыть обзор",
    })}
      ${renderSettingsNotice(req)}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Шаблоны",
          "Все типы уборки в одном месте.",
          `<p class="admin-metric-value">${escapeHtml(String(templates.length))}</p>`,
          { eyebrow: "Settings" }
        )}
        ${renderAdminCard(
          "Пункты",
          "Общее количество задач в шаблонах.",
          `<p class="admin-metric-value">${escapeHtml(String(totalItems))}</p>`,
          { eyebrow: "Settings", muted: true }
        )}
        ${renderAdminCard(
          "Отмечено",
          "Уже выполненные пункты.",
          `<p class="admin-metric-value">${escapeHtml(String(completedItems))}</p>`,
          { eyebrow: "Settings", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Шаблоны чек-листов",
          "Отмечайте выполненное и дополняйте шаблоны новыми пунктами.",
          templates.length > 0
            ? templates.map((template) => renderSettingsTemplateCard(template)).join("")
            : `<div class="admin-empty-state">Шаблоны пока не подготовлены.</div>`,
          { eyebrow: "Settings" }
        )}
        ${renderAdminCard(
          "Для чего этот раздел",
          "Здесь можно хранить рабочие шаблоны и небольшие внутренние базы.",
          `<ul class="admin-feature-list">
            <li>Шаблоны под каждый тип уборки.</li>
            <li>Отметки выполненных пунктов.</li>
            <li>Новые небольшие внутренние списки можно добавлять сюда позже.</li>
          </ul>`,
          { eyebrow: "Settings", muted: true }
        )}
      </div>`,
    {
      kicker: "Settings",
      subtitle: "Шаблоны чек-листов и внутренние рабочие списки.",
      sidebar: renderAdminAppSidebar(ADMIN_SETTINGS_PATH),
    }
  );
}

function renderQuoteOpsStatusBadge(status) {
  if (status === "success") return renderAdminBadge("Успешно", "success");
  if (status === "warning") return renderAdminBadge("Проверить", "default");
  return renderAdminBadge("Ошибка", "danger");
}

function renderQuoteOpsNotice(req) {
  const reqUrl = getRequestUrl(req);
  const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
  if (notice === "retry-success") {
    return `<div class="admin-alert admin-alert-info">Повторная отправка выполнена.</div>`;
  }
  if (notice === "retry-failed") {
    return `<div class="admin-alert admin-alert-error">Повторная отправка не удалась. Проверьте заявку ниже.</div>`;
  }
  if (notice === "retry-missing") {
    return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
  }
  return "";
}

function renderQuoteOpsEntryCard(entry, returnTo) {
  const warningBlock = entry.warnings.length > 0
    ? `<div class="admin-alert admin-alert-info">Нужно проверить: ${escapeHtml(entry.warnings.join(", "))}</div>`
    : "";
  const errorBlock = entry.errorMessage
    ? `<div class="admin-alert admin-alert-error">${escapeHtml(entry.errorMessage)}</div>`
    : "";

  return `<article class="admin-entry-card">
    <div class="admin-entry-head">
      <div>
        <h3 class="admin-entry-title">${escapeHtml(entry.customerName || "Клиент")}</h3>
        <p class="admin-entry-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</p>
      </div>
      <div class="admin-entry-meta">
        ${renderQuoteOpsStatusBadge(entry.status)}
        ${entry.retryCount > 0 ? renderAdminBadge(`Повтор ${entry.retryCount}`, "outline") : ""}
      </div>
    </div>
    <div class="admin-entry-grid">
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Дата</span>
        <p class="admin-mini-value">${escapeHtml(new Date(entry.createdAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }))}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Номер</span>
        <p class="admin-mini-value">${escapeHtml(entry.requestId || "Не указан")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Услуга</span>
        <p class="admin-mini-value">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Дата уборки</span>
        <p class="admin-mini-value">${escapeHtml([entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Не указана")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Контакты</span>
        <p class="admin-mini-value">${escapeHtml(entry.customerPhone || "Телефон не указан")}${entry.customerEmail ? `<br>${escapeHtml(entry.customerEmail)}` : ""}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Адрес</span>
        <p class="admin-mini-value">${escapeHtml(entry.fullAddress || "Не указан")}</p>
      </div>
    </div>
    ${warningBlock}
    ${errorBlock}
    <div class="admin-inline-actions">
      <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
        <button class="admin-button" type="submit">Повторить отправку</button>
      </form>
      <span class="admin-action-hint">Если нужно, отправьте заявку повторно.</span>
    </div>
  </article>`;
}

async function renderQuoteOpsPage(req, config, quoteOpsLedger) {
  const { reqUrl, filters } = getQuoteOpsFilters(req);
  const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
  const entries = filterQuoteOpsEntries(allEntries, filters);
  const totalEntries = allEntries.length;
  const successCount = allEntries.filter((entry) => entry.status === "success").length;
  const warningCount = allEntries.filter((entry) => entry.status === "warning").length;
  const errorCount = allEntries.filter((entry) => entry.status === "error").length;
  const exportHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_EXPORT_PATH, {
    status: filters.status !== "all" ? filters.status : "",
    serviceType: filters.serviceType !== "all" ? filters.serviceType : "",
    q: filters.q,
  });
  const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;

  return renderAdminLayout(
    "Заявки",
    `${renderAdminSignedInTopbar(config, {
      linkHref: QUOTE_PUBLIC_PATH,
      linkLabel: "Открыть форму заявки",
      linkExternal: true,
    })}
      ${renderQuoteOpsNotice(req)}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Всего заявок",
          "Все заявки с сайта.",
          `<p class="admin-metric-value">${escapeHtml(String(totalEntries))}</p>`,
          { eyebrow: "Заявки" }
        )}
        ${renderAdminCard(
          "Успешно",
          "Заявки без ошибок.",
          `<p class="admin-metric-value">${escapeHtml(String(successCount))}</p>`,
          { eyebrow: "Статус", muted: true }
        )}
        ${renderAdminCard(
          "Проверить",
          "Заявки, которые нужно перепроверить.",
          `<p class="admin-metric-value">${escapeHtml(String(warningCount))}</p>`,
          { eyebrow: "Статус", muted: true }
        )}
        ${renderAdminCard(
          "Ошибки",
          "Заявки, которые не дошли с первого раза.",
          `<p class="admin-metric-value">${escapeHtml(String(errorCount))}</p>`,
          { eyebrow: "Статус", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Список заявок",
          "Поиск, фильтр и повторная отправка.",
          `<form class="admin-form-grid admin-form-grid-two" method="get" action="${ADMIN_QUOTE_OPS_PATH}">
            <label class="admin-label">
              Поиск
              <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Имя, телефон, email, номер">
            </label>
            <label class="admin-label">
              Статус
              <select class="admin-input" name="status">
                <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                <option value="success"${filters.status === "success" ? " selected" : ""}>Успешно</option>
                <option value="warning"${filters.status === "warning" ? " selected" : ""}>Проверить</option>
                <option value="error"${filters.status === "error" ? " selected" : ""}>Ошибка</option>
              </select>
            </label>
            <label class="admin-label">
              Услуга
              <select class="admin-input" name="serviceType">
                <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                <option value="regular"${filters.serviceType === "regular" ? " selected" : ""}>Регулярная</option>
                <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Генеральная</option>
                <option value="moving"${filters.serviceType === "moving" ? " selected" : ""}>Перед переездом</option>
              </select>
            </label>
            <div class="admin-inline-actions" style="align-self:end;">
              <button class="admin-button" type="submit">Применить</button>
              <a class="admin-link-button admin-button-secondary" href="${ADMIN_QUOTE_OPS_PATH}">Сбросить</a>
              <a class="admin-link-button admin-button-secondary" href="${exportHref}">Скачать CSV</a>
            </div>
          </form>
          <div class="admin-divider"></div>
          <div class="admin-entry-list">
            ${entries.length > 0
              ? entries.map((entry) => renderQuoteOpsEntryCard(entry, currentReturnTo)).join("")
              : `<div class="admin-empty-state">По текущему фильтру заявок нет.</div>`}
          </div>`,
          { eyebrow: "Заявки" }
        )}
        ${renderAdminCard(
          "Что можно сделать",
          "Основные действия в этом разделе.",
          `<ul class="admin-feature-list">
            <li>Найти нужную заявку по имени, телефону или email.</li>
            <li>Скачать список заявок в CSV.</li>
            <li>Повторить отправку, если заявка требует проверки.</li>
          </ul>`,
          { eyebrow: "Действия", muted: true }
        )}
      </div>`,
    {
      kicker: "Заявки",
      subtitle: "Все заявки с сайта в одном месте.",
      sidebar: renderAdminAppSidebar(ADMIN_QUOTE_OPS_PATH),
    }
  );
}

function renderIntegrationsPage(req, config) {
  return renderAdminLayout(
    "Раздел скрыт",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_ROOT_PATH,
      linkLabel: "Вернуться в обзор",
    })}
      ${renderAdminCard(
        "Раздел скрыт",
        "Этот технический раздел скрыт из интерфейса.",
        `<div class="admin-alert admin-alert-info">Вернитесь в основные рабочие разделы админки.</div>`,
        { eyebrow: "Инфо", muted: true }
      )}`,
    {
      kicker: "SHYNLI",
      subtitle: "Технические разделы скрыты.",
      sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH),
    }
  );
}

function renderRuntimePage(req, config, adminRuntime = {}) {
  return renderIntegrationsPage(req, config, adminRuntime);
}

async function renderAdminAppPage(route, req, config, adminRuntime = {}, quoteOpsLedger = null) {
  if (route === ADMIN_ROOT_PATH) return renderDashboardPage(req, config, quoteOpsLedger);
  if (route === ADMIN_CLIENTS_PATH) return renderClientsPage(req, config, quoteOpsLedger);
  if (route === ADMIN_ORDERS_PATH) return renderOrdersPage(req, config, quoteOpsLedger);
  if (route === ADMIN_STAFF_PATH) return renderStaffPage(req, config);
  if (route === ADMIN_SETTINGS_PATH) return renderSettingsPage(req, config, adminRuntime.settingsStore);
  if (route === ADMIN_QUOTE_OPS_PATH) return renderQuoteOpsPage(req, config, quoteOpsLedger);
  if (route === ADMIN_INTEGRATIONS_PATH) return renderDashboardPage(req, config, quoteOpsLedger);
  if (route === ADMIN_RUNTIME_PATH) return renderDashboardPage(req, config, quoteOpsLedger);
  return renderDashboardPage(req, config, quoteOpsLedger);
}

function buildAdminAuthHeaders(req, cookies = []) {
  const headers = {};
  if (cookies.length > 0) {
    headers["Set-Cookie"] = cookies;
  }
  return headers;
}

function enforceSlidingRateLimit(rateLimiter, req, res, requestStartNs, requestContext, key, errorMessage) {
  const decision = rateLimiter.take(key);
  if (decision.allowed) return false;
  requestContext.cacheHit = false;
  writeHtmlWithTiming(
    res,
    429,
    renderAdminLayout(
      "Слишком много попыток",
      `<div class="admin-alert admin-alert-error">${escapeHtml(errorMessage || "Слишком много попыток. Подождите немного и попробуйте снова.")}</div>`,
      { subtitle: "Защита входа временно ограничила повторные попытки." }
    ),
    requestStartNs,
    requestContext.cacheHit,
    {
      "Retry-After": String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
    }
  );
  return true;
}

async function handleAdminRequest(
  req,
  res,
  requestStartNs,
  requestContext,
  requestLogger,
  adminRuntime = {},
  quoteOpsLedger = null,
  settingsStore = null
) {
  requestContext.cacheHit = false;
  const adminState = getAdminAuthState(req);
  if (!adminState.config) {
    writeHtmlWithTiming(res, 503, renderAdminUnavailablePage(), requestStartNs, requestContext.cacheHit);
    return;
  }

  const { config, session, challenge, fingerprint } = adminState;

  if (requestContext.route === ADMIN_QUOTE_OPS_EXPORT_PATH) {
    if (req.method !== "GET") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступен только GET.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }
    if (!session) {
      if (challenge) {
        redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    const { filters } = getQuoteOpsFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const exportEntries = filterQuoteOpsEntries(allEntries, filters);
    const csvBody = quoteOpsLedger ? quoteOpsLedger.buildCsv(exportEntries) : '"id","status"\n';
    writeHeadWithTiming(
      res,
      200,
      {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="shynli-quote-ops-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end(csvBody);
    return;
  }

  if (requestContext.route === ADMIN_QUOTE_OPS_RETRY_PATH) {
    if (req.method !== "POST") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступен только POST.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }
    if (!session) {
      if (challenge) {
        redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const entryId = getFormValue(formBody, "entryId", 120);
    const returnTo = buildQuoteOpsReturnPath(getFormValue(formBody, "returnTo", 1000));

    if (!quoteOpsLedger || !entryId) {
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, { notice: "retry-missing" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const retryResult = await quoteOpsLedger.retrySubmission(entryId, {
      getLeadConnectorClient,
      userAgent: normalizeString(req.headers["user-agent"], 180),
    });

    redirectWithTiming(
      res,
      303,
      buildAdminRedirectPath(returnTo, {
        notice: retryResult && retryResult.ok ? "retry-success" : "retry-failed",
      }),
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  if (requestContext.route === ADMIN_ORDERS_PATH && req.method === "POST") {
    if (!session) {
      if (challenge) {
        redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const entryId = getFormValue(formBody, "entryId", 120);
    const returnTo = buildOrdersReturnPath(getFormValue(formBody, "returnTo", 1000));

    if (!quoteOpsLedger || !entryId) {
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, { notice: "order-missing" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    try {
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        orderStatus: getFormValue(formBody, "orderStatus", 40),
        assignedStaff: getFormValue(formBody, "assignedStaff", 120),
        selectedDate: getFormValue(formBody, "selectedDate", 32),
        selectedTime: getFormValue(formBody, "selectedTime", 32),
        frequency: getFormValue(formBody, "frequency", 40),
      });

      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, {
          notice: updatedEntry ? "order-saved" : "order-missing",
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    } catch {
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, { notice: "order-save-failed" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }
  }

  if (requestContext.route === ADMIN_SETTINGS_PATH && req.method === "POST") {
    if (!session) {
      if (challenge) {
        redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 16 * 1024));
    const action = getFormValue(formBody, "action", 80).toLowerCase();
    const serviceType = getFormValue(formBody, "serviceType", 32).toLowerCase();

    if (!settingsStore) {
      redirectWithTiming(
        res,
        303,
        buildSettingsRedirectPath(serviceType, "error"),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    try {
      if (action === "save_checklist_state") {
        await settingsStore.setCompletedItems(serviceType, getFormValues(formBody, "completedItemIds", 200, 120));
        redirectWithTiming(
          res,
          303,
          buildSettingsRedirectPath(serviceType, "saved"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "add_checklist_item") {
        await settingsStore.addChecklistItem(serviceType, getFormValue(formBody, "itemLabel", 240));
        redirectWithTiming(
          res,
          303,
          buildSettingsRedirectPath(serviceType, "added"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "reset_checklist_state") {
        await settingsStore.resetChecklist(serviceType);
        redirectWithTiming(
          res,
          303,
          buildSettingsRedirectPath(serviceType, "reset"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    } catch {}

    redirectWithTiming(
      res,
      303,
      buildSettingsRedirectPath(serviceType, "error"),
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  if (ADMIN_APP_ROUTES.has(requestContext.route)) {
    if (req.method !== "GET") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступен только GET.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }
    if (session) {
      writeHtmlWithTiming(
        res,
        200,
        await renderAdminAppPage(requestContext.route, req, config, adminRuntime, quoteOpsLedger),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }
    if (challenge) {
      redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }
    redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
    return;
  }

  if (requestContext.route === ADMIN_LOGIN_PATH) {
    if (req.method === "GET") {
      if (session) {
        redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      writeHtmlWithTiming(res, 200, renderLoginPage(config), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (req.method !== "POST") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступны только GET и POST.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (
      enforceSlidingRateLimit(
        adminLoginRateLimiter,
        req,
        res,
        requestStartNs,
        requestContext,
        `${getClientAddress(req)}:login`,
        "Слишком много попыток входа. Подождите несколько минут и попробуйте снова."
      )
    ) {
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const email = getFormValue(formBody, "email", 320).toLowerCase();
    const password = getFormValue(formBody, "password", 200);
    const validEmail = email && email === config.email;
    const validPassword = password && adminAuth.verifyPassword(password, config.passwordHash);
    if (!validEmail || !validPassword) {
      writeHtmlWithTiming(
        res,
        401,
        renderLoginPage(config, {
          error: "Неверная почта или пароль. Попробуйте ещё раз.",
          email,
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const challengeToken = adminAuth.createAdminChallengeToken(config, {
      email: config.email,
      fingerprint,
    });
    redirectWithTiming(
      res,
      303,
      ADMIN_2FA_PATH,
      requestStartNs,
      requestContext.cacheHit,
      buildAdminAuthHeaders(req, [
        serializeCookie(ADMIN_CHALLENGE_COOKIE, challengeToken, {
          ...getAdminCookieOptions(req),
          maxAge: adminAuth.CHALLENGE_TTL_SECONDS,
        }),
        clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions(req)),
      ])
    );
    return;
  }

  if (requestContext.route === ADMIN_2FA_PATH) {
    if (!challenge) {
      redirectWithTiming(
        res,
        303,
        ADMIN_LOGIN_PATH,
        requestStartNs,
        requestContext.cacheHit,
        buildAdminAuthHeaders(req, [clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req))])
      );
      return;
    }

    if (req.method === "GET") {
      const secret = adminAuth.getTotpSecretMaterial(config);
      const otpauthUri = adminAuth.buildOtpauthUri(config);
      const qrMarkup = await buildAdminQrMarkup(otpauthUri);
      writeHtmlWithTiming(
        res,
        200,
        renderTwoFactorPage(config, { secret, otpauthUri, qrMarkup }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (req.method !== "POST") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступны только GET и POST.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (
      enforceSlidingRateLimit(
        adminTwoFactorRateLimiter,
        req,
        res,
        requestStartNs,
        requestContext,
        `${getClientAddress(req)}:2fa`,
        "Слишком много попыток подтверждения. Подождите несколько минут и попробуйте снова."
      )
    ) {
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const code = getFormValue(formBody, "code", 16);
    if (!adminAuth.verifyTotpCode(code, config)) {
      const secret = adminAuth.getTotpSecretMaterial(config);
      const otpauthUri = adminAuth.buildOtpauthUri(config);
      const qrMarkup = await buildAdminQrMarkup(otpauthUri);
      writeHtmlWithTiming(
        res,
        401,
        renderTwoFactorPage(config, {
          secret,
          otpauthUri,
          qrMarkup,
          error: "Неверный код. Проверьте приложение и попробуйте снова.",
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const sessionToken = adminAuth.createAdminSessionToken(config, {
      email: config.email,
      fingerprint,
    });
    redirectWithTiming(
      res,
      303,
      ADMIN_ROOT_PATH,
      requestStartNs,
      requestContext.cacheHit,
      buildAdminAuthHeaders(req, [
        serializeCookie(ADMIN_SESSION_COOKIE, sessionToken, {
          ...getAdminCookieOptions(req),
          maxAge: adminAuth.SESSION_TTL_SECONDS,
        }),
        clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req)),
      ])
    );
    return;
  }

  if (requestContext.route === ADMIN_LOGOUT_PATH) {
    if (req.method !== "POST") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Выход выполняется только через POST.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }
    redirectWithTiming(
      res,
      303,
      ADMIN_LOGIN_PATH,
      requestStartNs,
      requestContext.cacheHit,
      buildAdminAuthHeaders(req, [
        clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions(req)),
        clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req)),
      ])
    );
  }
}

function resolveSitePath(relativeOrAbsolutePath) {
  const trimmed = String(relativeOrAbsolutePath || "").replace(/^\/+/, "");
  return path.resolve(SITE_DIR, trimmed);
}

function toWeakEtagFromStat(size, mtimeMs) {
  return `W/"${size.toString(16)}-${Math.trunc(mtimeMs).toString(16)}"`;
}

function toWeakEtagFromString(content) {
  const sizeHex = Buffer.byteLength(content, "utf8").toString(16);
  const hash = crypto.createHash("sha1").update(content).digest("hex").slice(0, 16);
  return `W/"${sizeHex}-${hash}"`;
}

function normalizeEtagToken(token) {
  return token.trim().replace(/^W\//, "");
}

function hasMatchingEtag(ifNoneMatchValue, currentEtag) {
  if (!ifNoneMatchValue || !currentEtag) return false;
  if (ifNoneMatchValue.trim() === "*") return true;
  const current = normalizeEtagToken(currentEtag);
  return ifNoneMatchValue
    .split(",")
    .map((token) => normalizeEtagToken(token))
    .some((token) => token === current);
}

function isNotModified(reqHeaders, etag, mtimeMs) {
  const ifNoneMatch = reqHeaders["if-none-match"];
  if (ifNoneMatch) {
    return hasMatchingEtag(ifNoneMatch, etag);
  }

  const ifModifiedSince = reqHeaders["if-modified-since"];
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  if (!Number.isFinite(since)) return false;
  return Math.trunc(mtimeMs / 1000) <= Math.trunc(since / 1000);
}

function buildHtmlCacheEntry(sanitizedHtml, fileMeta) {
  const mtimeMs = fileMeta?.mtimeMs ?? Date.now();
  return {
    body: sanitizedHtml,
    etag: toWeakEtagFromString(sanitizedHtml),
    lastModified: fileMeta?.lastModified ?? new Date(mtimeMs).toUTCString(),
    mtimeMs,
  };
}

function getHtmlCacheKey(absolutePath, routePath = "") {
  return `${absolutePath}::${routePath || "__file__"}`;
}

function normalizeRoute(rawPath) {
  let value = rawPath || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

const DEEP_CLEANING_ADDONS_SECTION = `
<style id="deep-cleaning-addons-static-style">
#deep-cleaning-addons-static{background:#faf9f6;padding:0 0 56px;}
#deep-cleaning-addons-static .dc-addons{max-width:1200px;margin:0 auto;padding:0 20px;box-sizing:border-box;color:#313131;}
#deep-cleaning-addons-static .dc-addons__title{margin:0;text-align:center;font-family:'Playfair Display',serif;font-size:48px;line-height:1.14;font-weight:400;}
#deep-cleaning-addons-static .dc-addons__title-accent{color:#9e435a;}
#deep-cleaning-addons-static .dc-addons__subtitle{margin:14px 0 38px;text-align:center;font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;}
#deep-cleaning-addons-static .dc-addons__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px 80px;align-items:start;}
#deep-cleaning-addons-static .dc-addons__group-title{margin:0 0 26px;font-family:'Playfair Display',serif;font-size:32px;line-height:1.12;font-weight:400;color:#ddd8d2;}
#deep-cleaning-addons-static .dc-addons__list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:24px;}
#deep-cleaning-addons-static .dc-addons__item{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;align-items:start;}
#deep-cleaning-addons-static .dc-addons__item-label{font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;color:#313131;}
#deep-cleaning-addons-static .dc-addons__item-label strong{font-weight:700;}
#deep-cleaning-addons-static .dc-addons__icon{width:32px;height:32px;display:block;flex:none;margin-top:2px;}
#deep-cleaning-addons-static .dc-addons__note{margin:52px 0 30px;display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;align-items:start;}
#deep-cleaning-addons-static .dc-addons__note-box{background:#d8cfc4;border-radius:24px;padding:24px 28px;min-height:72px;display:flex;align-items:center;box-sizing:border-box;}
#deep-cleaning-addons-static .dc-addons__note-text{font-family:'Playfair Display',serif;font-size:32px;line-height:1.15;font-weight:400;color:#313131;}
#deep-cleaning-addons-static .dc-addons__cta{display:flex;flex-direction:column;align-items:center;gap:10px;}
#deep-cleaning-addons-static .dc-addons__button{display:inline-flex;align-items:center;justify-content:center;min-width:300px;min-height:70px;padding:0 32px;border-radius:999px;background:#9e435a;color:#faf9f6;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:16px;font-weight:500;line-height:1;box-sizing:border-box;transition:background-color .2s ease;}
#deep-cleaning-addons-static .dc-addons__button:hover{background:#6e2e3e;color:#faf9f6;}
#deep-cleaning-addons-static .dc-addons__helper{font-family:'Montserrat',sans-serif;font-size:12px;line-height:1.35;font-weight:400;color:#6a665f;text-align:center;}
@media (max-width:959px){
  #deep-cleaning-addons-static .dc-addons__title{font-size:42px;}
  #deep-cleaning-addons-static .dc-addons__grid{gap:40px 48px;}
  #deep-cleaning-addons-static .dc-addons__note-text{font-size:28px;}
}
@media (max-width:639px){
  #deep-cleaning-addons-static{padding:0 0 44px;}
  #deep-cleaning-addons-static .dc-addons{padding:0 16px;}
  #deep-cleaning-addons-static .dc-addons__title{font-size:34px;}
  #deep-cleaning-addons-static .dc-addons__subtitle{font-size:16px;margin:12px 0 30px;}
  #deep-cleaning-addons-static .dc-addons__grid{grid-template-columns:1fr;gap:28px;}
  #deep-cleaning-addons-static .dc-addons__group-title{font-size:26px;margin-bottom:20px;}
  #deep-cleaning-addons-static .dc-addons__list{gap:20px;}
  #deep-cleaning-addons-static .dc-addons__item{grid-template-columns:34px minmax(0,1fr);gap:14px;}
  #deep-cleaning-addons-static .dc-addons__item-label{font-size:16px;line-height:1.32;}
  #deep-cleaning-addons-static .dc-addons__icon{width:28px;height:28px;}
  #deep-cleaning-addons-static .dc-addons__note{margin:36px 0 24px;grid-template-columns:48px minmax(0,1fr);gap:12px;}
  #deep-cleaning-addons-static .dc-addons__note-box{padding:20px 22px;border-radius:22px;}
  #deep-cleaning-addons-static .dc-addons__note-text{font-size:24px;line-height:1.14;}
  #deep-cleaning-addons-static .dc-addons__button{min-width:100%;min-height:58px;font-size:15px;}
  #deep-cleaning-addons-static .dc-addons__helper{font-size:11px;}
}
@media (max-width:479px){
  #deep-cleaning-addons-static .dc-addons__title{font-size:24px;line-height:1.18;}
  #deep-cleaning-addons-static .dc-addons__title-accent{display:block;}
  #deep-cleaning-addons-static .dc-addons__subtitle{font-size:13px;line-height:1.4;margin:10px 0 22px;}
  #deep-cleaning-addons-static .dc-addons__group-title{font-size:22px;line-height:1.1;color:#d7d0c7;}
  #deep-cleaning-addons-static .dc-addons__item{grid-template-columns:28px minmax(0,1fr);gap:12px;}
  #deep-cleaning-addons-static .dc-addons__item-label{font-size:14px;line-height:1.3;}
  #deep-cleaning-addons-static .dc-addons__icon{width:24px;height:24px;margin-top:1px;}
  #deep-cleaning-addons-static .dc-addons__note{margin:30px 0 22px;grid-template-columns:42px minmax(0,1fr);gap:10px;}
  #deep-cleaning-addons-static .dc-addons__note-box{padding:18px 18px 20px;border-radius:20px;}
  #deep-cleaning-addons-static .dc-addons__note-text{font-size:17px;line-height:1.18;}
  #deep-cleaning-addons-static .dc-addons__button{min-height:52px;font-size:14px;padding:0 20px;}
}
</style>
<section id="deep-cleaning-addons-static">
  <div class="dc-addons">
    <h2 class="dc-addons__title">Take Your Deep Cleaning <span class="dc-addons__title-accent">Even Further</span></h2>
    <p class="dc-addons__subtitle">Add these services to any deep cleaning</p>
    <div class="dc-addons__grid">
      <div class="dc-addons__group">
        <h3 class="dc-addons__group-title">Interior Add-Ons:</h3>
        <ul class="dc-addons__list">
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Inside Fridge — <strong>$45</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Inside Oven — <strong>$45</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Interior Windows — <strong>$6 per window</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Wet Baseboards — <strong>$22</strong></span>
          </li>
        </ul>
      </div>
      <div class="dc-addons__group">
        <h3 class="dc-addons__group-title">Extra Focus:</h3>
        <ul class="dc-addons__list">
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Inside Cabinets (empty) — <strong>$45</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Polishing wooden furniture — <strong>$20</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Bed linen replacement — <strong>$8</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Doors — <strong>$22</strong></span>
          </li>
        </ul>
      </div>
    </div>
    <div class="dc-addons__note">
      <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
      <div class="dc-addons__note-box">
        <div class="dc-addons__note-text">Most add-ons are recommended after your first recurring visit.</div>
      </div>
    </div>
    <div class="dc-addons__cta">
      <a class="dc-addons__button" href="/quote">Start with Deep Cleaning</a>
      <div class="dc-addons__helper">Recommended before recurring service</div>
    </div>
  </div>
</section>
`;

function rebuildDeepCleaningAddonsSection(html, routePath) {
  if (normalizeRoute(routePath) !== "/services/deep-cleaning") return html;
  if (html.includes('id="deep-cleaning-addons-static"')) return html;

  const oldSectionPattern = /<div id="rec1778752123"[\s\S]*?(?=<div id="rec1778752133")/i;
  if (!oldSectionPattern.test(html)) return html;

  return html.replace(oldSectionPattern, DEEP_CLEANING_ADDONS_SECTION);
}

function toAbsoluteUrl(routePath) {
  const normalizedRoute = normalizeRoute(routePath);
  return `${SITE_ORIGIN}${normalizedRoute === "/" ? "/" : normalizedRoute}`;
}

function slugToTitle(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "faq") return "FAQ";
      if (lower === "oauth") return "OAuth";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function getRouteLabel(routePath) {
  if (BREADCRUMB_LABELS.has(routePath)) return BREADCRUMB_LABELS.get(routePath);
  const parts = normalizeRoute(routePath).split("/").filter(Boolean);
  if (parts.length === 0) return "Home";
  return slugToTitle(parts[parts.length - 1]);
}

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceOrInsertMetaTag(html, matcher, tagFactory) {
  if (matcher.test(html)) {
    return html.replace(matcher, tagFactory());
  }
  return html.replace(/<!--\/metatextblock-->/i, `${tagFactory()} <!--/metatextblock-->`);
}

function setTitleTag(html, title) {
  if (!title) return html;
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  }
  return html.replace(/<!--\/metatextblock-->/i, `<title>${safeTitle}</title> <!--/metatextblock-->`);
}

function setMetaContent(html, key, value, attr = "name") {
  if (!value) return html;
  const safeValue = escapeHtmlAttribute(value);
  const matcher = new RegExp(`<meta[^>]+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "i");
  return replaceOrInsertMetaTag(
    html,
    matcher,
    () => `<meta ${attr}="${key}" content="${safeValue}" />`
  );
}

function setCanonicalLink(html, url) {
  if (!url) return html;
  const safeUrl = escapeHtmlAttribute(url);
  if (/<link[^>]+rel="canonical"[^>]*>/i.test(html)) {
    return html.replace(
      /<link[^>]+rel="canonical"[^>]*>/i,
      `<link rel="canonical" href="${safeUrl}">`
    );
  }
  return html.replace(/<!--\/metatextblock-->/i, `<link rel="canonical" href="${safeUrl}"> <!--/metatextblock-->`);
}

function upsertJsonLd(html, id, payload) {
  const script = `<script type="application/ld+json" id="${id}">${JSON.stringify(payload)}</script>`;
  const matcher = new RegExp(`<script[^>]+id="${id}"[^>]*>[\\s\\S]*?<\\/script>`, "i");
  if (matcher.test(html)) {
    return html.replace(matcher, script);
  }
  return html.replace(/<\/head>/i, `${script}</head>`);
}

function buildBreadcrumbSchema(routePath) {
  const normalized = normalizeRoute(routePath);
  if (normalized === "/" || normalized === "/quote" || normalized === "/oauth/callback") return null;

  const parts = normalized.split("/").filter(Boolean);
  const itemListElement = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: `${SITE_ORIGIN}/`,
    },
  ];

  let currentPath = "";
  for (const [index, part] of parts.entries()) {
    currentPath += `/${part}`;
    itemListElement.push({
      "@type": "ListItem",
      position: index + 2,
      name: getRouteLabel(currentPath),
      item: toAbsoluteUrl(currentPath),
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}

function buildHomeSchemas() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${SITE_ORIGIN}/#localbusiness`,
        name: "Shynli Cleaning",
        url: `${SITE_ORIGIN}/`,
        telephone: "+1(630)812-7077",
        image: `${SITE_ORIGIN}/images/tild3663-3735-4236-a133-346266656365__photo.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: "Shynli Cleaning",
        publisher: { "@id": `${SITE_ORIGIN}/#localbusiness` },
      },
    ],
  };
}

function deriveRouteSeo(html, routePath) {
  const normalizedRoute = normalizeRoute(routePath);
  const overrides = ROUTE_META_OVERRIDES[normalizedRoute] || {};
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
  const existingTitle = titleMatch ? titleMatch[1].trim() : "";
  const existingDesc = descMatch ? descMatch[1].trim() : "";
  const title = overrides.title || existingTitle;
  const description = overrides.description || existingDesc;
  const canonical = overrides.canonical || toAbsoluteUrl(normalizedRoute);
  const ogUrl = overrides.ogUrl || canonical;
  const ogTitle = overrides.ogTitle || title;
  const ogDescription = overrides.ogDescription || description;
  const robots = overrides.robots || (NOINDEX_ROUTES.has(normalizedRoute) ? "noindex,follow" : "");
  return { title, description, canonical, ogUrl, ogTitle, ogDescription, robots };
}

function isFingerprintLikeAsset(absolutePath) {
  const name = path.basename(absolutePath);
  return /(?:^|[._-])[a-f0-9]{8,}(?:[._-]|$)/i.test(name);
}

function getCachePolicy(absolutePath, ext) {
  if (ext === ".html") {
    return {
      browser: "public, max-age=60, stale-while-revalidate=300",
      edge: "public, s-maxage=600, stale-while-revalidate=300, stale-if-error=86400",
    };
  }

  let browserPolicy = "public, max-age=31536000";
  let edgePolicy = "public, s-maxage=31536000, stale-while-revalidate=86400, stale-if-error=604800";
  if (isFingerprintLikeAsset(absolutePath)) {
    browserPolicy += ", immutable";
    edgePolicy += ", immutable";
  }

  return {
    browser: browserPolicy,
    edge: edgePolicy,
  };
}

function parseClientHintNumber(rawValue) {
  if (!rawValue) return null;
  const normalized = String(rawValue).replace(/"/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getTargetImageWidth(headers) {
  const widthHint =
    parseClientHintNumber(headers["sec-ch-width"]) ||
    parseClientHintNumber(headers["viewport-width"]);
  if (!widthHint) return null;

  const dpr = parseClientHintNumber(headers["dpr"]) || parseClientHintNumber(headers["sec-ch-dpr"]) || 1;
  return Math.max(1, Math.round(widthHint * dpr));
}

function getPreferredImageCodecs(acceptHeader) {
  const accept = String(acceptHeader || "").toLowerCase();
  const codecs = [];
  if (accept.includes("image/avif")) codecs.push("avif");
  if (accept.includes("image/webp")) codecs.push("webp");
  return codecs;
}

function findExistingOriginalImagePath(existingFiles, stemPath) {
  for (const ext of [".png", ".jpg", ".jpeg", ".PNG", ".JPG", ".JPEG"]) {
    const candidate = `${stemPath}${ext}`;
    if (existingFiles.has(candidate)) return candidate;
  }
  return null;
}

function buildImageVariantIndex(existingFiles) {
  const imageVariantsByOriginal = new Map();

  for (const absolutePath of existingFiles) {
    const codecExt = path.extname(absolutePath).toLowerCase();
    if (codecExt !== ".avif" && codecExt !== ".webp") continue;

    const withoutCodec = absolutePath.slice(0, -codecExt.length);
    let stem = withoutCodec;
    let width = null;
    const widthMatch = /\.w(\d+)$/.exec(withoutCodec);
    if (widthMatch) {
      width = Number.parseInt(widthMatch[1], 10);
      stem = withoutCodec.slice(0, widthMatch.index);
    }

    const originalPath = findExistingOriginalImagePath(existingFiles, stem);
    if (!originalPath) continue;

    let variants = imageVariantsByOriginal.get(originalPath);
    if (!variants) {
      variants = {
        avif: { full: null, widths: [] },
        webp: { full: null, widths: [] },
      };
      imageVariantsByOriginal.set(originalPath, variants);
    }

    const codec = codecExt.slice(1);
    if (width) {
      variants[codec].widths.push({ width, path: absolutePath });
    } else {
      variants[codec].full = absolutePath;
    }
  }

  for (const variants of imageVariantsByOriginal.values()) {
    variants.avif.widths.sort((a, b) => a.width - b.width);
    variants.webp.widths.sort((a, b) => a.width - b.width);
  }

  return imageVariantsByOriginal;
}

function selectWidthVariant(widthVariants, targetWidth) {
  if (!widthVariants.length) return null;
  for (const variant of widthVariants) {
    if (variant.width >= targetWidth) return variant.path;
  }
  return widthVariants[widthVariants.length - 1].path;
}

function selectNegotiatedImagePath(req, originalPath, runtimeIndex) {
  const ext = path.extname(originalPath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const variants = runtimeIndex.imageVariantsByOriginal.get(originalPath);
  if (!variants) return null;

  const preferredCodecs = getPreferredImageCodecs(req.headers.accept);
  if (!preferredCodecs.length) return null;

  const targetWidth = getTargetImageWidth(req.headers);
  for (const codec of preferredCodecs) {
    const variantSet = variants[codec];
    if (!variantSet) continue;

    if (targetWidth) {
      const widthMatch = selectWidthVariant(variantSet.widths, targetWidth);
      if (widthMatch) return widthMatch;
    }

    if (variantSet.full) return variantSet.full;
    if (variantSet.widths.length > 0) {
      return variantSet.widths[variantSet.widths.length - 1].path;
    }
  }

  return null;
}

function isSafePath(baseDir, filePath) {
  const resolvedBase = path.resolve(baseDir) + path.sep;
  const resolvedPath = path.resolve(filePath);
  return resolvedPath === path.resolve(baseDir) || resolvedPath.startsWith(resolvedBase);
}

const FULL_CARD_CLICK_SCRIPT = `<script id="full-card-click-handler">
(() => {
  if (window.__fullCardClickHandlerBound) return;
  window.__fullCardClickHandlerBound = true;

  const interactiveSelector = "a, button, input, select, textarea, label";

  function openLink(link, event) {
    if (event && (event.metaKey || event.ctrlKey)) {
      window.open(link.href, "_blank", "noopener");
      return;
    }
    window.location.href = link.href;
  }

  function initCardLinks() {
    const groups = document.querySelectorAll(".tn-group[data-group-type-value='physical']");
    groups.forEach((group) => {
      if (group.dataset.fullCardLinkBound === "1") return;

      const cardLink = Array.from(group.querySelectorAll("a.tn-atom[href]")).find((link) => {
        const text = (link.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
        return text.includes("learn more");
      });

      if (!cardLink) return;

      group.dataset.fullCardLinkBound = "1";
      group.style.cursor = "pointer";
      group.setAttribute("role", "link");
      if (!group.hasAttribute("tabindex")) group.setAttribute("tabindex", "0");

      group.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.target.closest(interactiveSelector)) return;
        openLink(cardLink, event);
      });

      group.addEventListener("keydown", (event) => {
        if (event.target !== group) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openLink(cardLink, event);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCardLinks);
  } else {
    initCardLinks();
  }
})();
</script>`;

const RUNTIME_CONFIG_SCRIPT = `<script id="runtime-config">
window.__shynliRuntimeConfig = Object.assign({}, window.__shynliRuntimeConfig || {}, {
  googlePlacesApiKey: ${JSON.stringify(GOOGLE_PLACES_API_KEY)}
});
</script>`;

const MOBILE_STICKY_CTA_SCRIPT = `<script id="mobile-sticky-cta">
(() => {
  if (window.__mobileStickyCtaBound) return;
  window.__mobileStickyCtaBound = true;

  const PHONE = "+16308127077";
  const EXCLUDED_PATHS = new Set(["/quote"]);
  const MOBILE_QUERY = "(max-width: 960px)";
  const CTA_TEXT_PATTERNS = ["book now", "book your cleaning", "order services", "call us"];
  const LEGACY_CTA_SELECTOR = [
    "a[href='/quote']",
    "a[href='tel:+16308127077']",
    ".t943__buttonwrapper",
    ".t943",
    ".t-btn",
    ".t-btnflex",
    ".t228",
    ".tmenu-mobile",
    ".t396__elem",
    "[style*='position:fixed']",
    "[style*='position: fixed']",
    "[style*='position:sticky']",
    "[style*='position: sticky']"
  ].join(",");

  let hideLegacyScheduled = false;

  function isMobileViewport() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function normalizeNodeText(node) {
    return (node && node.textContent ? node.textContent : "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function looksLikeLegacyCta(node) {
    if (!(node instanceof HTMLElement)) return false;
    const text = normalizeNodeText(node);
    const href = node.getAttribute("href") || "";
    return CTA_TEXT_PATTERNS.some((pattern) => text.includes(pattern)) || href === "/quote" || href === "tel:+16308127077";
  }

  function maybeHideLegacyCta(candidate) {
    if (!isMobileViewport()) return;
    if (!(candidate instanceof HTMLElement)) return;

    const ourBar = document.getElementById("mobileStickyCta");
    if (candidate === ourBar || (ourBar && ourBar.contains(candidate))) return;

    const target = candidate.closest(".t943__buttonwrapper,.t943,.t396__elem,.t-btn,.t-btnflex,.t-rec,.t228,.tmenu-mobile") || candidate;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "mobileStickyCta" || (ourBar && ourBar.contains(target))) return;
    if (target.hasAttribute("data-legacy-mobile-cta-hidden")) return;
    if (!looksLikeLegacyCta(target) && !looksLikeLegacyCta(candidate)) return;

    const style = window.getComputedStyle(target);
    if (style.position !== "fixed" && style.position !== "sticky") return;

    const rect = target.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.55) return;

    target.style.setProperty("display", "none", "important");
    target.setAttribute("data-legacy-mobile-cta-hidden", "true");
  }

  function hideLegacyStickyCtas() {
    if (!isMobileViewport()) return;
    document.querySelectorAll(LEGACY_CTA_SELECTOR).forEach(maybeHideLegacyCta);
  }

  function scheduleHideLegacyStickyCtas() {
    if (!isMobileViewport() || hideLegacyScheduled) return;
    hideLegacyScheduled = true;
    const run = () => {
      hideLegacyScheduled = false;
      hideLegacyStickyCtas();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      window.setTimeout(run, 16);
    }
  }

  function initStickyCta() {
    const currentPath = (((window.location && window.location.pathname) || "").replace(/\/+$/, "") || "/");
    if (EXCLUDED_PATHS.has(currentPath)) return;
    if (document.getElementById("mobileStickyCta")) return;

    const style = document.createElement("style");
    style.textContent = \`
      @media (max-width: 960px) {
        body.has-mobile-sticky-cta {
          padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)) !important;
        }
        #mobileStickyCta {
          position: fixed;
          left: 10px;
          right: 10px;
          bottom: calc(10px + env(safe-area-inset-bottom, 0px));
          z-index: 10050;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          pointer-events: auto;
          opacity: 0;
          visibility: hidden;
          transform: translateY(12px);
          transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
        }
        #mobileStickyCta.is-visible {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        #mobileStickyCta a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 48px;
          border-radius: 999px;
          text-decoration: none;
          font-family: Montserrat, Arial, sans-serif;
          font-size: 15px;
          font-weight: 600;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
        }
        #mobileStickyCta .cta-book {
          background: #9e435a;
          color: #ffffff;
        }
        #mobileStickyCta .cta-call {
          background: #faf9f6;
          color: #9e435a;
          border: 1px solid #9e435a;
        }
      }
      @media (min-width: 961px) {
        #mobileStickyCta { display: none !important; }
      }
    \`;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.id = "mobileStickyCta";
    wrap.innerHTML = \`
      <a class="cta-book" href="/quote">Book Now</a>
      <a class="cta-call" href="tel:\${PHONE}">Call Us</a>
    \`;
    document.body.appendChild(wrap);

    function updateCtaVisibility() {
      const isMobile = isMobileViewport();
      if (!isMobile) {
        wrap.classList.remove("is-visible");
        document.body.classList.remove("has-mobile-sticky-cta");
        return;
      }

      // Show CTA only after user scrolls roughly one full screen ("second scroll and below").
      const shouldShow = window.scrollY > window.innerHeight * 0.95;
      wrap.classList.toggle("is-visible", shouldShow);
      document.body.classList.toggle("has-mobile-sticky-cta", shouldShow);
    }

    hideLegacyStickyCtas();
    updateCtaVisibility();
    const observer = new MutationObserver(() => scheduleHideLegacyStickyCtas());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", () => {
      updateCtaVisibility();
      scheduleHideLegacyStickyCtas();
    }, { passive: true });
    window.addEventListener("scroll", () => {
      updateCtaVisibility();
    }, { passive: true });
    setTimeout(scheduleHideLegacyStickyCtas, 300);
    setTimeout(scheduleHideLegacyStickyCtas, 1000);
    setTimeout(scheduleHideLegacyStickyCtas, 2000);
    setTimeout(updateCtaVisibility, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStickyCta);
  } else {
    initStickyCta();
  }
})();
</script>`;

const DEEP_CLEANING_MOBILE_FIX = `<script id="deep-cleaning-addons-rebuild">
(() => {
  const path = ((window.location && window.location.pathname) || "").replace(/\/+$/, "") || "/";
  if (path !== "/services/deep-cleaning") return;

  const source = document.getElementById("rec1778752123");
  const anchor = document.getElementById("rec1778752133");
  if (!source || !anchor || document.getElementById("deep-cleaning-addons-rebuild-root")) return;

  const style = document.createElement("style");
  style.id = "deep-cleaning-addons-rebuild-style";
  style.textContent = [
    "#rec1778752123{display:none !important;}",
    "#deep-cleaning-addons-rebuild-root{background:#faf9f6;padding:0 0 56px;}",
    ".dc-addons{max-width:1200px;margin:0 auto;padding:0 20px;box-sizing:border-box;color:#313131;}",
    ".dc-addons__title{margin:0;text-align:center;font-family:'Playfair Display',serif;font-size:48px;line-height:1.14;font-weight:400;}",
    ".dc-addons__title-accent{color:#9e435a;}",
    ".dc-addons__subtitle{margin:14px 0 38px;text-align:center;font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;}",
    ".dc-addons__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px 80px;align-items:start;}",
    ".dc-addons__group-title{margin:0 0 26px;font-family:'Playfair Display',serif;font-size:32px;line-height:1.12;font-weight:400;color:#ddd8d2;}",
    ".dc-addons__list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:24px;}",
    ".dc-addons__item{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;align-items:start;}",
    ".dc-addons__item-label{font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;color:#313131;}",
    ".dc-addons__item-label strong{font-weight:700;}",
    ".dc-addons__icon{width:32px;height:32px;display:block;flex:none;margin-top:2px;}",
    ".dc-addons__note{margin:52px 0 30px;display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;align-items:start;}",
    ".dc-addons__note-box{background:#d8cfc4;border-radius:24px;padding:24px 28px;min-height:72px;display:flex;align-items:center;box-sizing:border-box;}",
    ".dc-addons__note-text{font-family:'Playfair Display',serif;font-size:32px;line-height:1.15;font-weight:400;color:#313131;}",
    ".dc-addons__cta{display:flex;flex-direction:column;align-items:center;gap:10px;}",
    ".dc-addons__button{display:inline-flex;align-items:center;justify-content:center;min-width:300px;min-height:70px;padding:0 32px;border-radius:999px;background:#9e435a;color:#faf9f6;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:16px;font-weight:500;line-height:1;box-sizing:border-box;transition:background-color .2s ease;}",
    ".dc-addons__button:hover{background:#6e2e3e;color:#faf9f6;}",
    ".dc-addons__helper{font-family:'Montserrat',sans-serif;font-size:12px;line-height:1.35;font-weight:400;color:#6a665f;text-align:center;}",
    "@media (max-width:959px){.dc-addons__title{font-size:42px;}.dc-addons__grid{gap:40px 48px;}.dc-addons__note-text{font-size:28px;}}",
    "@media (max-width:639px){#deep-cleaning-addons-rebuild-root{padding:0 0 44px;}.dc-addons{padding:0 16px;}.dc-addons__title{font-size:34px;}.dc-addons__subtitle{font-size:16px;margin:12px 0 30px;}.dc-addons__grid{grid-template-columns:1fr;gap:28px;}.dc-addons__group-title{font-size:26px;margin-bottom:20px;}.dc-addons__list{gap:20px;}.dc-addons__item{grid-template-columns:34px minmax(0,1fr);gap:14px;}.dc-addons__item-label{font-size:16px;line-height:1.32;}.dc-addons__icon{width:28px;height:28px;}.dc-addons__note{margin:36px 0 24px;grid-template-columns:48px minmax(0,1fr);gap:12px;}.dc-addons__note-box{padding:20px 22px;border-radius:22px;}.dc-addons__note-text{font-size:24px;line-height:1.14;}.dc-addons__button{min-width:100%;min-height:58px;font-size:15px;}.dc-addons__helper{font-size:11px;}}",
    "@media (max-width:479px){.dc-addons__title{font-size:24px;line-height:1.18;}.dc-addons__title-accent{display:block;}.dc-addons__subtitle{font-size:13px;line-height:1.4;margin:10px 0 22px;}.dc-addons__group-title{font-size:22px;line-height:1.1;}.dc-addons__item{grid-template-columns:28px minmax(0,1fr);gap:12px;}.dc-addons__item-label{font-size:14px;line-height:1.3;}.dc-addons__icon{width:24px;height:24px;margin-top:1px;}.dc-addons__note{margin:30px 0 22px;grid-template-columns:42px minmax(0,1fr);gap:10px;}.dc-addons__note-box{padding:18px 18px 20px;border-radius:20px;}.dc-addons__note-text{font-size:17px;line-height:1.18;}.dc-addons__button{min-height:52px;font-size:14px;padding:0 20px;}}"
  ].join("\\n");
  document.head.appendChild(style);

  const star = '<svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>';

  const leftItems = [
    'Inside Fridge — <strong>$45</strong>',
    'Inside Oven — <strong>$45</strong>',
    'Interior Windows — <strong>$6 per window</strong>',
    'Wet Baseboards — <strong>$22</strong>'
  ];

  const rightItems = [
    'Inside Cabinets (empty) — <strong>$45</strong>',
    'Polishing wooden furniture — <strong>$20</strong>',
    'Bed linen replacement — <strong>$8</strong>',
    'Doors — <strong>$22</strong>'
  ];

  const renderItems = (items) => items.map((item) =>
    '<li class="dc-addons__item">' +
      star +
      '<span class="dc-addons__item-label">' + item + '</span>' +
    '</li>'
  ).join('');

  const root = document.createElement("section");
  root.id = "deep-cleaning-addons-rebuild-root";
  root.innerHTML =
    '<div class="dc-addons">' +
      '<h2 class="dc-addons__title">Take Your Deep Cleaning <span class="dc-addons__title-accent">Even Further</span></h2>' +
      '<p class="dc-addons__subtitle">Add these services to any deep cleaning</p>' +
      '<div class="dc-addons__grid">' +
        '<div class="dc-addons__group">' +
          '<h3 class="dc-addons__group-title">Interior Add-Ons:</h3>' +
          '<ul class="dc-addons__list">' + renderItems(leftItems) + '</ul>' +
        '</div>' +
        '<div class="dc-addons__group">' +
          '<h3 class="dc-addons__group-title">Extra Focus:</h3>' +
          '<ul class="dc-addons__list">' + renderItems(rightItems) + '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="dc-addons__note">' +
        star +
        '<div class="dc-addons__note-box"><div class="dc-addons__note-text">Most add-ons are recommended after your first recurring visit.</div></div>' +
      '</div>' +
      '<div class="dc-addons__cta">' +
        '<a class="dc-addons__button" href="/quote">Start with Deep Cleaning</a>' +
        '<div class="dc-addons__helper">Recommended before recurring service</div>' +
      '</div>' +
    '</div>';

  source.style.display = "none";
  anchor.parentNode.insertBefore(root, anchor);
})();
</script>`;

const MOBILE_CONTACT_DETAILS_FIX = `<script id="mobile-contact-details-fix">
(() => {
  if (window.__mobileContactDetailsFixBound) return;
  window.__mobileContactDetailsFixBound = true;

  const CONTACT_ELEMENT_IDS = [
    "1767883949420",
    "1767883278623",
    "1767883278634",
    "1767883278627"
  ];

  function ensureStyle() {
    if (document.getElementById("mobile-contact-details-fix-style")) return;

    const style = document.createElement("style");
    style.id = "mobile-contact-details-fix-style";
    style.textContent = "@media (max-width: 640px) {" +
      ".tn-elem[data-elem-id=\"1767883949420\"]," +
      ".tn-elem[data-elem-id=\"1767883278623\"]," +
      ".tn-elem[data-elem-id=\"1767883278634\"]," +
      ".tn-elem[data-elem-id=\"1767883278627\"] {" +
      "z-index: 12 !important;" +
      "opacity: 1 !important;" +
      "visibility: visible !important;" +
      "}" +
      ".tn-elem[data-elem-id=\"1767883949420\"] .tn-atom," +
      ".tn-elem[data-elem-id=\"1767883278623\"] .tn-atom," +
      ".tn-elem[data-elem-id=\"1767883278634\"] .tn-atom," +
      ".tn-elem[data-elem-id=\"1767883278627\"] .tn-atom {" +
      "opacity: 1 !important;" +
      "visibility: visible !important;" +
      "}" +
      "}";
    document.head.appendChild(style);
  }

  function raiseContacts() {
    if (!window.matchMedia("(max-width: 640px)").matches) return;

    CONTACT_ELEMENT_IDS.forEach((id) => {
      document.querySelectorAll('.tn-elem[data-elem-id="' + id + '"]').forEach((element) => {
        element.style.setProperty("z-index", "12", "important");
        element.style.setProperty("opacity", "1", "important");
        element.style.setProperty("visibility", "visible", "important");
      });
    });
  }

  function applyFix() {
    ensureStyle();
    raiseContacts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFix, { once: true });
  } else {
    applyFix();
  }

  window.addEventListener("load", applyFix);
})();
</script>`;

const PRICING_CALCULATOR_SCROLL_SCRIPT = `<script id="pricing-calculator-scroll">
(() => {
  const path = ((window.location && window.location.pathname) || "").replace(/\\/+$/, "") || "/";
  if (path !== "/pricing") return;
  if (window.__pricingCalculatorScrollBound) return;
  window.__pricingCalculatorScrollBound = true;

  function getHeaderOffset() {
    const candidates = [
      document.querySelector(".t1272"),
      document.querySelector(".t228"),
      document.querySelector(".t-menu__wrapper"),
      document.querySelector(".tmenu-mobile")
    ].filter((node) => node instanceof HTMLElement);

    const header = candidates.find((node) => {
      const style = window.getComputedStyle(node);
      return style.position === "fixed" || style.position === "sticky";
    });

    if (!(header instanceof HTMLElement)) return 24;
    return Math.max(24, Math.ceil(header.getBoundingClientRect().height) + 16);
  }

  function scrollToCalculator(event) {
    const target =
      document.getElementById("calc") ||
      document.getElementById("rec1787758753") ||
      document.querySelector('a[name="calc"]');
    if (!target) return;

    event.preventDefault();
    const top = target.getBoundingClientRect().top + window.pageYOffset - getHeaderOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    if (typeof history !== "undefined" && typeof history.replaceState === "function") {
      history.replaceState(null, "", "#calc");
    }
  }

  function bind() {
    document.querySelectorAll('a[href="#calc"]').forEach((link) => {
      if (!(link instanceof HTMLElement)) return;
      if (link.dataset.calcScrollBound === "1") return;
      link.dataset.calcScrollBound = "1";
      link.addEventListener("click", scrollToCalculator);
    });
  }

  bind();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  }
})();
</script>`;

const SAFARI_HOME_LAYOUT_FIX = `<script id="safari-home-layout-fix">
(() => {
  if (window.__safariHomeLayoutFixBound) return;
  window.__safariHomeLayoutFixBound = true;

  const ua = navigator.userAgent || "";
  const isSafari =
    /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
  if (!isSafari) return;

  document.documentElement.classList.add("is-safari");

  const style = document.createElement("style");
  style.textContent = \`
@media (min-width: 960px) {
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361452"],
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361489"],
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361458"],
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361493"] {
    height: auto !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361452"] {
    top: 286px !important;
    width: 540px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361458"] {
    top: 372px !important;
    width: 540px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361489"] {
    top: 498px !important;
    width: 360px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361493"] {
    top: 585px !important;
    width: 360px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361452"] .tn-atom,
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361489"] .tn-atom {
    white-space: normal !important;
    line-height: 1.18 !important;
  }

  html.is-safari #rec1777833793 .t396__artboard,
  html.is-safari #rec1777833793 .t396__carrier,
  html.is-safari #rec1777833793 .t396__filter {
    height: 340px !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764341"],
  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764347"] {
    height: auto !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764341"] {
    top: 166px !important;
    width: 720px !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764341"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.15 !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764347"] {
    top: 252px !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056120"],
  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056136"] {
    height: auto !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056120"] {
    left: calc(50% - 600px + 110px) !important;
    width: 420px !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056120"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.08 !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056136"] {
    left: calc(50% - 600px + 220px) !important;
    width: 830px !important;
    top: 529px !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.15 !important;
  }

  html.is-safari #rec1767616313 .tn-elem[data-elem-id="1767801668999"],
  html.is-safari #rec1822459163 .tn-elem[data-elem-id="1767801668999"] {
    height: auto !important;
    left: calc(50% - 600px + 320px) !important;
    width: 560px !important;
  }

  html.is-safari #rec1767616313 .tn-elem[data-elem-id="1767801668999"] .tn-atom,
  html.is-safari #rec1822459163 .tn-elem[data-elem-id="1767801668999"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.08 !important;
    font-size: 28px !important;
  }

  html.is-safari #rec1767605783 .tn-elem[data-elem-id="1767901684054"] {
    height: auto !important;
    left: calc(50% - 600px + 150px) !important;
    width: 940px !important;
  }

  html.is-safari #rec1767605783 .tn-elem[data-elem-id="1767901684054"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.08 !important;
    font-size: 20px !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121807"] {
    height: auto !important;
    left: calc(50% - 600px + 90px) !important;
    width: 1020px !important;
    top: 70px !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121807"] .tn-atom {
    white-space: nowrap !important;
    font-size: 46px !important;
    line-height: 1.02 !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121917"] {
    top: 170px !important;
    left: calc(50% - 600px + 80px) !important;
    width: 1040px !important;
    height: auto !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121917"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.15 !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823334"] {
    height: auto !important;
    left: calc(50% - 600px + 240px) !important;
    width: 720px !important;
    top: 40px !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823334"] .tn-atom {
    white-space: nowrap !important;
    font-size: 46px !important;
    line-height: 1.02 !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823501"] {
    height: auto !important;
    left: calc(50% - 600px + 120px) !important;
    width: 960px !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823501"] .tn-atom {
    white-space: nowrap !important;
    font-size: 22px !important;
    line-height: 1.08 !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768311103133000001"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768311103133000001"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    line-height: 1.08 !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768240056136"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
    top: 529px !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    line-height: 1.12 !important;
  }

  html.is-safari #rec1787446063 .tn-elem[data-elem-id="1768240056136"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari #rec1787446063 .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    line-height: 1.12 !important;
  }

  /* Shared Safari desktop fixes for repeated Tilda text blocks */
  html.is-safari .tn-elem[data-elem-id="1767801668999"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari .tn-elem[data-elem-id="1767801668999"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 30px !important;
    line-height: 1.06 !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768305816214000039"],
  html.is-safari .tn-elem[data-elem-id="1768240056136"],
  html.is-safari .tn-elem[data-elem-id="1768231764341"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768305816214000039"] .tn-atom,
  html.is-safari .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 20px !important;
    line-height: 1.08 !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768231764341"] {
    top: 166px !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768231764341"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 20px !important;
    line-height: 1.08 !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768311103133000001"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768311103133000001"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 32px !important;
    line-height: 1.04 !important;
  }
}
\`;
  document.head.appendChild(style);
})();
</script>`;

function sanitizeHtml(html, routePath = "/") {
  let cleaned = html
    .replace(
      /<script src="https:\/\/neo\.tildacdn\.com\/js\/tilda-fallback-1\.0\.min\.js"[^>]*><\/script>/g,
      ""
    )
    .replace(/<!-- Tilda copyright\. Don't remove this line -->[\s\S]*?(?=<!-- Stat -->)/g, "")
    .replace(/data-tilda-export="yes"/g, 'data-export-source="tilda"')
    .replace(/<!--\s*Form export deps:[\s\S]*?-->/g, "")
    .replace(/<script[^>]+src="js\/tilda-animation-sbs-1\.0\.min\.js"[^>]*><\/script>/g, "");

  // Make header "Call Us" tappable as a phone link across pages.
  cleaned = cleaned.replace(
    /<strong>📞<\/strong>\s*Call Us/g,
    '<a href="tel:+16308127077" style="color: inherit; text-decoration: none;"><strong>📞</strong> Call Us</a>'
  );

  // Auto-run ZIP lookup as soon as the fifth digit is entered.
  cleaned = cleaned.replace(
    /document\.getElementById\('zipCode'\)\.addEventListener\('keypress',function\(e\) \{if\(e\.key==='Enter'\) checkZipArea\(\);\}\);document\.getElementById\('zipCode'\)\.addEventListener\('input',function\(\) \{this\.value=this\.value\.replace\(\/\\D\/g,''\);\}\);/g,
    `(()=>{const zipInput=document.getElementById('zipCode');if(!zipInput||zipInput.dataset.autoZipBound==='true') return;zipInput.dataset.autoZipBound='true';const zipWrapper=zipInput.closest('.zip-input-wrapper');const zipContainer=zipInput.closest('.zip-checker-container');const focusZipInput=(event)=>{if(event?.target?.closest('.zip-check-btn')) return;if(event?.target?.closest('.zip-result a')) return;zipInput.focus();const length=zipInput.value.length;if(typeof zipInput.setSelectionRange==='function'){zipInput.setSelectionRange(length,length);}};[zipWrapper,zipContainer].forEach((node)=>{if(!node) return;node.style.cursor='text';node.addEventListener('click',focusZipInput);});zipInput.addEventListener('keypress',function(e){if(e.key==='Enter') checkZipArea();});zipInput.addEventListener('input',function(){this.value=this.value.replace(/\\D/g,'').slice(0,5);if(this.value.length===5){checkZipArea();}});})();`
  );

  if (normalizeRoute(routePath) === "/pricing") {
    cleaned = cleaned.replace(/<a name="calc"([^>]*)><\/a>/i, '<a id="calc" name="calc"$1></a>');
  }

  cleaned = rebuildDeepCleaningAddonsSection(cleaned, routePath);

  const routeSeo = deriveRouteSeo(cleaned, routePath);
  cleaned = setTitleTag(cleaned, routeSeo.title);
  cleaned = setMetaContent(cleaned, "description", routeSeo.description);
  cleaned = setMetaContent(cleaned, "robots", routeSeo.robots);
  cleaned = setMetaContent(cleaned, "og:url", routeSeo.ogUrl, "property");
  cleaned = setMetaContent(cleaned, "og:title", routeSeo.ogTitle, "property");
  cleaned = setMetaContent(cleaned, "og:description", routeSeo.ogDescription, "property");
  cleaned = setCanonicalLink(cleaned, routeSeo.canonical);

  if (normalizeRoute(routePath) === "/") {
    cleaned = upsertJsonLd(cleaned, "schema-home", buildHomeSchemas());
  }
  const breadcrumbSchema = buildBreadcrumbSchema(routePath);
  if (breadcrumbSchema) {
    cleaned = upsertJsonLd(cleaned, "schema-breadcrumbs", breadcrumbSchema);
  }

  const hasForms = /data-elem-type='form'|class="t-form"|tn-atom__form/.test(cleaned);
  if (!hasForms) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-forms-1\.0\.min\.css"[^>]*>/g, "")
      .replace(/<script[^>]+src="js\/tilda-forms-1\.0\.min\.js"[^>]*><\/script>/g, "")
      .replace(/<script[^>]+src="js\/tilda-zero-forms-1\.0\.min\.js"[^>]*><\/script>/g, "");
  }

  // Fix relative asset paths on nested routes like /services/*.
  if (!/<base\s+href=/i.test(cleaned)) {
    cleaned = cleaned.replace(/<head>/i, '<head><base href="/" />');
  }
  if (normalizeRoute(routePath) === "/quote" && GOOGLE_PLACES_API_KEY && !cleaned.includes('id="runtime-config"')) {
    cleaned = cleaned.replace(/<head>/i, `<head>${RUNTIME_CONFIG_SCRIPT}`);
  }

  if (/<body[\s>]/i.test(cleaned)) {
    const runtimeScripts = [
      [FULL_CARD_CLICK_SCRIPT, "full-card-click-handler"],
      [MOBILE_STICKY_CTA_SCRIPT, "mobile-sticky-cta"],
      [DEEP_CLEANING_MOBILE_FIX, "deep-cleaning-addons-rebuild"],
      [MOBILE_CONTACT_DETAILS_FIX, "mobile-contact-details-fix"],
      [PRICING_CALCULATOR_SCROLL_SCRIPT, "pricing-calculator-scroll"],
      [SAFARI_HOME_LAYOUT_FIX, "safari-home-layout-fix"],
    ]
      .filter(([, scriptId]) => !cleaned.includes(`id="${scriptId}"`))
      .map(([script]) => script)
      .join("");

    if (runtimeScripts) {
      cleaned = cleaned.replace(/<\/body>/i, `${runtimeScripts}</body>`);
    }
  }

  return cleaned;
}

async function buildRuntimeIndex(routes) {
  const existingFiles = new Set();
  const fileMetaByPath = new Map();

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Runtime file index is for served content only.
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const resolvedPath = path.resolve(absolutePath);
        const stats = await fsp.stat(resolvedPath);
        existingFiles.add(resolvedPath);
        fileMetaByPath.set(resolvedPath, {
          size: stats.size,
          mtimeMs: stats.mtimeMs,
          lastModified: stats.mtime.toUTCString(),
          etag: toWeakEtagFromStat(stats.size, stats.mtimeMs),
        });
      }
    }
  }

  await walk(SITE_DIR);

  const routeFileByPath = new Map();
  const primaryRouteByFilePath = new Map();
  for (const [routePath, routeFile] of Object.entries(routes)) {
    const absolutePath = resolveSitePath(routeFile);
    if (existingFiles.has(absolutePath)) {
      routeFileByPath.set(routePath, absolutePath);
      if (!primaryRouteByFilePath.has(absolutePath)) {
        primaryRouteByFilePath.set(absolutePath, routePath);
      }
    }
  }

  const notFoundAbsolutePath = resolveSitePath(NOT_FOUND_PAGE);
  return {
    existingFiles,
    fileMetaByPath,
    imageVariantsByOriginal: buildImageVariantIndex(existingFiles),
    notFoundAbsolutePath,
    notFoundExists: existingFiles.has(notFoundAbsolutePath),
    routeFileByPath,
    primaryRouteByFilePath,
  };
}

async function warmHtmlCache(runtimeIndex) {
  const htmlCache = new Map();
  const filesToWarm = new Set();

  if (HTML_CACHE_WARM_MODE === "all") {
    for (const absolutePath of runtimeIndex.routeFileByPath.values()) {
      filesToWarm.add(absolutePath);
    }
  } else if (HTML_CACHE_WARM_MODE === "minimal") {
    const homeAbsolutePath = runtimeIndex.routeFileByPath.get("/");
    if (homeAbsolutePath) {
      filesToWarm.add(homeAbsolutePath);
    }
  }

  if (HTML_CACHE_WARM_MODE !== "off") {
    filesToWarm.add(runtimeIndex.notFoundAbsolutePath);
  }

  let warmedCount = 0;
  for (const absolutePath of filesToWarm) {
    if (!isSafePath(SITE_DIR, absolutePath)) continue;
    if (!runtimeIndex.existingFiles.has(absolutePath)) continue;

    try {
      const rawHtml = await fsp.readFile(absolutePath, "utf8");
      const routePath = runtimeIndex.primaryRouteByFilePath.get(absolutePath) || "/";
      const sanitizedHtml = sanitizeHtml(rawHtml, routePath);
      htmlCache.set(
        getHtmlCacheKey(absolutePath, routePath),
        buildHtmlCacheEntry(sanitizedHtml, runtimeIndex.fileMetaByPath.get(absolutePath))
      );
      warmedCount += 1;
    } catch {
      // Missing optional pages are ignored; route handling already has fallbacks.
    }
  }

  return { htmlCache, warmedCount };
}

async function getHtmlFromCache(absolutePath, routePath, htmlCache, fileMeta) {
  const cacheKey = getHtmlCacheKey(absolutePath, routePath);
  if (htmlCache.has(cacheKey)) {
    return {
      entry: htmlCache.get(cacheKey),
      cacheHit: true,
    };
  }

  const rawHtml = await fsp.readFile(absolutePath, "utf8");
  const htmlEntry = buildHtmlCacheEntry(sanitizeHtml(rawHtml, routePath), fileMeta);
  htmlCache.set(cacheKey, htmlEntry);
  return {
    entry: htmlEntry,
    cacheHit: false,
  };
}

async function sendFile(
  req,
  res,
  absolutePath,
  htmlCache,
  runtimeIndex,
  requestContext,
  requestStartNs,
  statusCode = 200
) {
  if (!isSafePath(SITE_DIR, absolutePath)) {
    requestContext.cacheHit = false;
    writeHeadWithTiming(
      res,
      403,
      { "Content-Type": "text/plain; charset=utf-8" },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end("Forbidden");
    return;
  }

  let filePathToServe = absolutePath;
  if (statusCode === 200) {
    const negotiatedPath = selectNegotiatedImagePath(req, absolutePath, runtimeIndex);
    if (negotiatedPath) {
      filePathToServe = negotiatedPath;
    }
  }

  const fileMeta = runtimeIndex.fileMetaByPath.get(filePathToServe);
  if (!fileMeta) {
    requestContext.cacheHit = false;
    writeHeadWithTiming(
      res,
      404,
      { "Content-Type": "text/plain; charset=utf-8" },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end("Not found");
    return;
  }

  try {
    const ext = path.extname(filePathToServe).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const cachePolicy = getCachePolicy(filePathToServe, ext);
    const baseHeaders = {
      "Cache-Control": cachePolicy.browser,
      "CDN-Cache-Control": cachePolicy.edge,
      "Cloudflare-CDN-Cache-Control": cachePolicy.edge,
      "Content-Type": contentType,
    };

    if (filePathToServe !== absolutePath) {
      baseHeaders.Vary = NEGOTIATED_IMAGE_VARY;
    }

    if (ext === ".html") {
      const htmlResult = await getHtmlFromCache(
        absolutePath,
        requestContext.route,
        htmlCache,
        fileMeta
      );
      const htmlEntry = htmlResult.entry;
      requestContext.cacheHit = htmlResult.cacheHit;
      const headers = {
        ...baseHeaders,
        "Accept-CH": "Width, Viewport-Width, DPR",
        ETag: htmlEntry.etag,
        "Last-Modified": htmlEntry.lastModified,
      };
      if (NOINDEX_ROUTES.has(requestContext.route) || statusCode === 404) {
        headers["X-Robots-Tag"] = "noindex, nofollow";
      }

      if (statusCode === 200 && isNotModified(req.headers, htmlEntry.etag, htmlEntry.mtimeMs)) {
        requestContext.cacheHit = true;
        writeHeadWithTiming(res, 304, headers, requestStartNs, requestContext.cacheHit);
        res.end();
        return;
      }

      writeHeadWithTiming(res, statusCode, headers, requestStartNs, requestContext.cacheHit);
      res.end(htmlEntry.body);
      return;
    }

    const headers = {
      ...baseHeaders,
      ETag: fileMeta.etag,
      "Last-Modified": fileMeta.lastModified,
    };

    if (statusCode === 200 && isNotModified(req.headers, fileMeta.etag, fileMeta.mtimeMs)) {
      requestContext.cacheHit = true;
      writeHeadWithTiming(res, 304, headers, requestStartNs, requestContext.cacheHit);
      res.end();
      return;
    }

    requestContext.cacheHit = false;
    writeHeadWithTiming(res, statusCode, headers, requestStartNs, requestContext.cacheHit);
    fs.createReadStream(filePathToServe).pipe(res);
  } catch {
    requestContext.cacheHit = false;
    writeHeadWithTiming(
      res,
      404,
      { "Content-Type": "text/plain; charset=utf-8" },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end("Not found");
  }
}

async function handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger) {
  requestContext.cacheHit = false;

  if (req.method !== "POST") {
    writeHeadWithTiming(
      res,
      405,
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Allow: "POST",
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (enforcePostRateLimit(req, res, requestStartNs, requestContext, STRIPE_CHECKOUT_ENDPOINT)) {
    return;
  }

  const stripe = getStripeClient();
  if (!stripe) {
    writeJsonWithTiming(
      res,
      503,
      { error: "Payments are temporarily unavailable. Stripe is not configured." },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
  } catch (error) {
    const isLarge = String(error && error.message).toLowerCase().includes("payload");
    writeJsonWithTiming(
      res,
      isLarge ? 413 : 400,
      { error: isLarge ? "Request payload is too large" : "Invalid request body" },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const quoteToken = normalizeString(body.quoteToken, 5000);
  if (!quoteToken) {
    writeJsonWithTiming(
      res,
      400,
      { error: "A valid quote token is required." },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  let checkoutQuote;
  try {
    checkoutQuote = verifyQuoteToken(quoteToken, { env: process.env });
  } catch (error) {
    const status = Number(error && error.status) || 400;
    const safeMessage =
      status >= 500
        ? "Payments are temporarily unavailable."
        : error instanceof QuoteTokenError && error.message
          ? error.message
          : "Invalid quote token.";
    writeJsonWithTiming(
      res,
      status,
      { error: safeMessage, code: error && error.code ? error.code : "INVALID_QUOTE_TOKEN" },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const amountCents = Number(checkoutQuote.totalPriceCents);
  if (
    !Number.isFinite(amountCents) ||
    amountCents < STRIPE_MIN_AMOUNT_CENTS ||
    amountCents > STRIPE_MAX_AMOUNT_CENTS
  ) {
    writeJsonWithTiming(
      res,
      400,
      {
        error: `Invalid amount. Allowed range is ${STRIPE_MIN_AMOUNT_CENTS / 100} to ${
          STRIPE_MAX_AMOUNT_CENTS / 100
        } USD.`,
      },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const origin = getStripeReturnOrigin();
  const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/quote?payment=success`;
  const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/quote?payment=cancelled`;
  const serviceName = normalizeString(checkoutQuote.serviceName || "Cleaning Service", 120);
  const customerEmail = normalizeString(body.customerEmail, 320);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);

  const metadata = {
    service_type: normalizeString(checkoutQuote.serviceType || "", 100),
    selected_date: normalizeString(checkoutQuote.selectedDate || "", 100),
    selected_time: normalizeString(checkoutQuote.selectedTime || "", 100),
    customer_name: normalizeString(checkoutQuote.customerName || "", 250),
    customer_phone: normalizeString(checkoutQuote.customerPhone || "", 80),
    full_address: normalizeString(checkoutQuote.fullAddress || checkoutQuote.address || "", 500),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: serviceName,
              description: "Cleaning service booking",
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      ...(isValidEmail ? { customer_email: customerEmail } : {}),
    });

    writeJsonWithTiming(
      res,
      200,
      {
        url: session.url,
        id: session.id,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  } catch (error) {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "stripe_checkout_error",
      message: error && error.message ? error.message : "Unknown Stripe error",
    });
    writeJsonWithTiming(
      res,
      502,
      { error: "Failed to create Stripe checkout session" },
      requestStartNs,
      requestContext.cacheHit
    );
  }
}

async function handleQuoteSubmissionRequest(
  req,
  res,
  requestStartNs,
  requestContext,
  requestLogger,
  quoteOpsLedger = null
) {
  requestContext.cacheHit = false;

  if (req.method !== "POST") {
    writeHeadWithTiming(
      res,
      405,
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Allow: "POST",
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (enforcePostRateLimit(req, res, requestStartNs, requestContext, QUOTE_SUBMIT_ENDPOINT)) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
  } catch (error) {
    const isLarge = String(error && error.message).toLowerCase().includes("payload");
    writeJsonWithTiming(
      res,
      isLarge ? 413 : 400,
      { error: isLarge ? "Request payload is too large" : "Invalid request body" },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const contactData = body?.contactData || body?.contact || {
    fullName: body?.fullName,
    phone: body?.phone,
    email: body?.email,
  };
  const calculatorData = body?.calculatorData || body?.quote || {
    serviceType: body?.serviceType,
    totalPrice: body?.totalPrice,
    selectedDate: body?.selectedDate,
    selectedTime: body?.selectedTime,
    fullAddress: body?.fullAddress,
    address: body?.address,
    addressLine2: body?.addressLine2,
    city: body?.city,
    state: body?.state,
    zipCode: body?.zipCode,
    rooms: body?.rooms,
    bathrooms: body?.bathrooms,
    squareMeters: body?.squareMeters,
    hasPets: body?.hasPets,
    basementCleaning: body?.basementCleaning,
    frequency: body?.frequency,
    services: body?.services,
    quantityServices: body?.quantityServices,
    additionalDetails: body?.additionalDetails,
    consent: body?.consent,
    formattedDateTime: body?.formattedDateTime,
  };
  const requestId = normalizeString(req.headers["x-request-id"] || crypto.randomUUID(), 120);
  const submittedAt = normalizeString(body?.submittedAt || new Date().toISOString(), 64);

  const pricing = calculateQuotePricing(calculatorData);
  const submittedTotalPrice = Number(calculatorData && calculatorData.totalPrice);
  if (
    Number.isFinite(submittedTotalPrice) &&
    Math.abs(submittedTotalPrice - pricing.totalPrice) > 0.009
  ) {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "quote_total_repriced",
      submitted_total: submittedTotalPrice,
      canonical_total: pricing.totalPrice,
    });
  }

  const canonicalCalculatorData = {
    ...calculatorData,
    serviceType: pricing.serviceType,
    frequency: pricing.frequency,
    rooms: pricing.rooms,
    bathrooms: pricing.bathrooms,
    squareMeters: pricing.squareMeters,
    basementCleaning: pricing.basementCleaning,
    services: pricing.services,
    quantityServices: pricing.quantityServices,
    totalPrice: pricing.totalPrice,
  };

  let leadConnector;
  try {
    leadConnector = getLeadConnectorClient();
  } catch (error) {
    const safeMessage = "Quote requests are temporarily unavailable.";
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "quote_client_init_error",
      message: error && error.message ? error.message : "Unknown LeadConnector init error",
    });
    if (quoteOpsLedger) {
      await quoteOpsLedger.recordSubmission({
        ok: false,
        requestId,
        sourceRoute: requestContext.route,
        source: body?.source || "Website Quote",
        customerName: contactData && contactData.fullName,
        customerPhone: contactData && contactData.phone,
        customerEmail: contactData && contactData.email,
        serviceType: pricing.serviceType,
        serviceName: pricing.serviceName,
        totalPrice: pricing.totalPrice,
        totalPriceCents: pricing.totalPriceCents,
        selectedDate: canonicalCalculatorData.selectedDate,
        selectedTime: canonicalCalculatorData.selectedTime,
        fullAddress: canonicalCalculatorData.fullAddress || canonicalCalculatorData.address,
        httpStatus: 503,
        code: "CLIENT_INIT_ERROR",
        retryable: false,
        errorMessage: safeMessage,
        payloadForRetry: {
          contactData,
          calculatorData: canonicalCalculatorData,
          source: body?.source || "Website Quote",
          pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
          requestId,
          submittedAt,
          userAgent: normalizeString(req.headers["user-agent"], 180),
        },
      });
    }
    writeJsonWithTiming(
      res,
      503,
      { error: safeMessage },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const result = await leadConnector.submitQuoteSubmission({
    contactData,
    calculatorData: canonicalCalculatorData,
    source: body?.source || "Website Quote",
    pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
    requestId,
    userAgent: normalizeString(req.headers["user-agent"], 180),
    submittedAt,
  });

  if (!result.ok) {
    const resultStatus = Number(result.status) || 502;
    const safeErrorMessage =
      resultStatus >= 400 && resultStatus < 500
        ? result.message || "Failed to submit quote request"
        : "Quote requests are temporarily unavailable.";

    requestLogger.log({
      ts: new Date().toISOString(),
      type: "quote_submission_error",
      status: resultStatus,
      code: result.code,
      retryable: Boolean(result.retryable),
    });
    if (quoteOpsLedger) {
      await quoteOpsLedger.recordSubmission({
        ok: false,
        requestId,
        sourceRoute: requestContext.route,
        source: body?.source || "Website Quote",
        customerName: contactData && contactData.fullName,
        customerPhone: contactData && contactData.phone,
        customerEmail: contactData && contactData.email,
        serviceType: pricing.serviceType,
        serviceName: pricing.serviceName,
        totalPrice: pricing.totalPrice,
        totalPriceCents: pricing.totalPriceCents,
        selectedDate: canonicalCalculatorData.selectedDate,
        selectedTime: canonicalCalculatorData.selectedTime,
        fullAddress: canonicalCalculatorData.fullAddress || canonicalCalculatorData.address,
        httpStatus: resultStatus,
        code: result.code,
        retryable: Boolean(result.retryable),
        warnings: result.warnings,
        errorMessage: safeErrorMessage,
        payloadForRetry: {
          contactData,
          calculatorData: canonicalCalculatorData,
          source: body?.source || "Website Quote",
          pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
          requestId,
          submittedAt,
          userAgent: normalizeString(req.headers["user-agent"], 180),
        },
      });
    }
    writeJsonWithTiming(
      res,
      resultStatus,
      { error: safeErrorMessage, code: result.code },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  requestLogger.log({
    ts: new Date().toISOString(),
    type: "quote_submission_success",
    status: result.status,
    contact_id: result.contactId,
    custom_fields_updated: Boolean(result.customFieldsUpdated),
    custom_field_sync_reason: result.customFieldSyncReason || "",
    opportunity_sync_reason: result.opportunitySyncReason || "",
    warnings: result.warnings || [],
  });

  let quoteToken = "";
  try {
    quoteToken = createQuoteToken(
      {
        ...pricing,
        customerName: normalizeString(contactData && contactData.fullName, 250),
        customerPhone: normalizeString(contactData && contactData.phone, 80),
      },
      { env: process.env }
    );
  } catch (error) {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "quote_token_error",
      message: error && error.message ? error.message : "Unknown quote token error",
    });
  }

  if (quoteOpsLedger) {
    await quoteOpsLedger.recordSubmission({
      ok: true,
      requestId,
      sourceRoute: requestContext.route,
      source: body?.source || "Website Quote",
      customerName: contactData && contactData.fullName,
      customerPhone: contactData && contactData.phone,
      customerEmail: contactData && contactData.email,
      serviceType: pricing.serviceType,
      serviceName: pricing.serviceName,
      totalPrice: pricing.totalPrice,
      totalPriceCents: pricing.totalPriceCents,
      selectedDate: canonicalCalculatorData.selectedDate,
      selectedTime: canonicalCalculatorData.selectedTime,
      fullAddress: canonicalCalculatorData.fullAddress || canonicalCalculatorData.address,
      httpStatus: Number(result.status) || 200,
      code: result.code || "OK",
      retryable: Boolean(result.retryable),
      warnings: result.warnings,
      contactId: result.contactId,
      noteCreated: result.noteCreated,
      opportunityCreated: result.opportunityCreated,
      customFieldsUpdated: result.customFieldsUpdated,
      usedExistingContact: result.usedExistingContact,
      payloadForRetry: {
        contactData,
        calculatorData: canonicalCalculatorData,
        source: body?.source || "Website Quote",
        pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
        requestId,
        submittedAt,
        userAgent: normalizeString(req.headers["user-agent"], 180),
      },
    });
  }

  writeJsonWithTiming(
    res,
    Number(result.status) || 200,
    {
      ok: true,
      success: true,
      contactId: result.contactId,
      usedExistingContact: Boolean(result.usedExistingContact),
      customFieldsUpdated: Boolean(result.customFieldsUpdated),
      customFieldSyncReason: result.customFieldSyncReason || "",
      noteCreated: Boolean(result.noteCreated),
      opportunityCreated: Boolean(result.opportunityCreated),
      opportunitySyncReason: result.opportunitySyncReason || "",
      skipped: result.skipped || {},
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      pricing: {
        totalPrice: pricing.totalPrice,
        totalPriceCents: pricing.totalPriceCents,
        currency: pricing.currency,
        serviceName: pricing.serviceName,
      },
      quoteToken,
    },
    requestStartNs,
    requestContext.cacheHit
  );
}

async function loadRoutes() {
  const raw = await fsp.readFile(ROUTES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = {};
  for (const [route, file] of Object.entries(parsed)) {
    normalized[normalizeRoute(route)] = file;
  }
  return normalized;
}

async function main() {
  const requestLogger = createBufferedLogger();
  const routes = await loadRoutes();
  const runtimeIndex = await buildRuntimeIndex(routes);
  requestLogger.log({
    ts: new Date().toISOString(),
    type: "startup_index_built",
    routes_count: Object.keys(routes).length,
    indexed_files: runtimeIndex.existingFiles.size,
    indexed_image_variant_sets: runtimeIndex.imageVariantsByOriginal.size,
    memory: getMemoryUsageSnapshot(),
  });

  const { htmlCache, warmedCount } = await warmHtmlCache(runtimeIndex);
  requestLogger.log({
    ts: new Date().toISOString(),
    type: "startup_cache_warmed",
    warm_mode: HTML_CACHE_WARM_MODE,
    warmed_html_cache_entries: warmedCount,
    memory: getMemoryUsageSnapshot(),
  });

  const requestPerfWindow = createRequestPerfWindow();
  const eventLoopStats = createEventLoopStats();
  const quoteOpsLedger = createQuoteOpsStore();
  const settingsStore = createAdminSettingsStore();

  const perfSummaryTimer = setInterval(() => {
    const requestSnapshot = requestPerfWindow.snapshot();
    const eventLoopSnapshot = eventLoopStats.readSnapshot(true);
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "perf_summary",
      request: requestSnapshot,
      event_loop: eventLoopSnapshot,
    });

    const reasons = getPerfAlertReasons(requestSnapshot, eventLoopSnapshot);
    if (reasons.length > 0) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "perf_alert",
        level: "warn",
        reasons,
        thresholds: {
          p95_ms: ALERT_P95_MS,
          p99_ms: ALERT_P99_MS,
          status_5xx_rate: ALERT_5XX_RATE,
          event_loop_p95_ms: ALERT_EVENT_LOOP_P95_MS,
        },
        request: requestSnapshot,
        event_loop: eventLoopSnapshot,
      });
    }
  }, PERF_SUMMARY_INTERVAL_MS);
  perfSummaryTimer.unref();

  const server = http.createServer(async (req, res) => {
    const requestStartNs = process.hrtime.bigint();
    const requestContext = {
      cacheHit: false,
      route: "/",
    };

    res.on("finish", () => {
      const durationMs = getRequestDurationMs(requestStartNs);
      requestPerfWindow.record(res.statusCode, durationMs);
      const logLine = {
        ts: new Date().toISOString(),
        route: requestContext.route,
        status: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        cache_hit: requestContext.cacheHit,
      };
      requestLogger.log(logLine);
    });

    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(reqUrl.pathname);
      const normalizedPath = normalizeRoute(pathname);
      requestContext.route = normalizedPath;

      const redirectTarget = REDIRECT_ROUTES.get(normalizedPath);
      if (redirectTarget) {
        requestContext.cacheHit = false;
        writeHeadWithTiming(
          res,
          301,
          {
            Location: redirectTarget,
            "Cache-Control": "public, max-age=3600",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        res.end();
        return;
      }

      if (normalizedPath === "/__perf") {
        if (!canAccessPerfEndpoint(req)) {
          requestContext.cacheHit = false;
          writeHeadWithTiming(
            res,
            404,
            {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
            requestStartNs,
            requestContext.cacheHit
          );
          res.end("Not found");
          return;
        }

        requestContext.cacheHit = false;
        const perfBody = JSON.stringify(
          {
            ts: new Date().toISOString(),
            request: requestPerfWindow.snapshot(),
            event_loop: eventLoopStats.readSnapshot(false),
            thresholds: {
              p95_ms: ALERT_P95_MS,
              p99_ms: ALERT_P99_MS,
              status_5xx_rate: ALERT_5XX_RATE,
              event_loop_p95_ms: ALERT_EVENT_LOOP_P95_MS,
            },
          },
          null,
          2
        );

        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        res.end(perfBody);
        return;
      }

      if (ADMIN_ALL_ROUTES.has(normalizedPath)) {
        await handleAdminRequest(req, res, requestStartNs, requestContext, requestLogger, {
          requestPerfWindow,
          eventLoopStats,
          settingsStore,
        }, quoteOpsLedger, settingsStore);
        return;
      }

      if (normalizedPath === STRIPE_CHECKOUT_ENDPOINT) {
        await handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger);
        return;
      }

      if (normalizedPath === QUOTE_REQUEST_ENDPOINT || normalizedPath === QUOTE_SUBMIT_ENDPOINT) {
        await handleQuoteSubmissionRequest(req, res, requestStartNs, requestContext, requestLogger, quoteOpsLedger);
        return;
      }

      const directAssetPath = resolveSitePath(pathname);
      if (
        pathname !== "/" &&
        isPublicDirectAssetPath(pathname) &&
        isSafePath(SITE_DIR, directAssetPath) &&
        runtimeIndex.existingFiles.has(directAssetPath)
      ) {
        await sendFile(
          req,
          res,
          directAssetPath,
          htmlCache,
          runtimeIndex,
          requestContext,
          requestStartNs
        );
        return;
      }

      const mappedFilePath = runtimeIndex.routeFileByPath.get(normalizedPath);
      if (mappedFilePath) {
        await sendFile(
          req,
          res,
          mappedFilePath,
          htmlCache,
          runtimeIndex,
          requestContext,
          requestStartNs
        );
        return;
      }

      if (runtimeIndex.notFoundExists) {
        await sendFile(
          req,
          res,
          runtimeIndex.notFoundAbsolutePath,
          htmlCache,
          runtimeIndex,
          requestContext,
          requestStartNs,
          404
        );
        return;
      }

      requestContext.cacheHit = false;
      writeHeadWithTiming(
        res,
        404,
        { "Content-Type": "text/plain; charset=utf-8" },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end("Page not found");
    } catch (error) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "request_unhandled_error",
        path: normalizedPath,
        method: req.method,
        message: error && error.message ? error.message : "Unknown unhandled request error",
        stack: error && error.stack ? String(error.stack).slice(0, 4000) : "",
      });
      requestContext.cacheHit = false;
      if (normalizedPath.startsWith("/api/")) {
        writeJsonWithTiming(
          res,
          500,
          { error: "Request failed unexpectedly. Please try again." },
          requestStartNs,
          requestContext.cacheHit
        );
      } else {
        writeHeadWithTiming(
          res,
          500,
          { "Content-Type": "text/plain; charset=utf-8" },
          requestStartNs,
          requestContext.cacheHit
        );
        res.end("Internal server error");
      }
    }
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(perfSummaryTimer);
    eventLoopStats.close();
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "shutdown",
      signal,
    });

    server.close(() => {
      requestLogger.close();
      process.exit(0);
    });

    const forceExitTimer = setTimeout(() => {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "force_exit",
      });
      requestLogger.close();
      process.exit(1);
    }, 5000);
    forceExitTimer.unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "unhandled_rejection",
      reason: reason instanceof Error ? reason.stack || reason.message : String(reason),
      memory: getMemoryUsageSnapshot(),
    });
  });
  process.on("uncaughtException", (error) => {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "uncaught_exception",
      error: error && error.stack ? error.stack : String(error),
      memory: getMemoryUsageSnapshot(),
    });
    requestLogger.close();
    setTimeout(() => process.exit(1), 100).unref();
  });

  server.listen(PORT, HOST, () => {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "startup_ready",
      host: HOST,
      port: PORT,
      routes_count: Object.keys(routes).length,
      indexed_files: runtimeIndex.existingFiles.size,
      indexed_image_variant_sets: runtimeIndex.imageVariantsByOriginal.size,
      warm_mode: HTML_CACHE_WARM_MODE,
      warmed_html_cache_entries: warmedCount,
      memory: getMemoryUsageSnapshot(),
    });
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
