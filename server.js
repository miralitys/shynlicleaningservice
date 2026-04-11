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

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const SITE_DIR = __dirname;
const ROUTES_PATH = path.join(SITE_DIR, "routes.json");
const NOT_FOUND_PAGE = "page113047926.html";
const ADMIN_ROOT_PATH = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_2FA_PATH = "/admin/2fa";
const ADMIN_LOGOUT_PATH = "/admin/logout";
const ADMIN_QUOTE_OPS_PATH = "/admin/quote-ops";
const ADMIN_QUOTE_OPS_EXPORT_PATH = "/admin/quote-ops/export.csv";
const ADMIN_QUOTE_OPS_RETRY_PATH = "/admin/quote-ops/retry";
const ADMIN_INTEGRATIONS_PATH = "/admin/integrations";
const ADMIN_RUNTIME_PATH = "/admin/runtime";
const ADMIN_SESSION_COOKIE = "shynli_admin_session";
const ADMIN_CHALLENGE_COOKIE = "shynli_admin_challenge";
const ADMIN_APP_ROUTES = new Set([
  ADMIN_ROOT_PATH,
  ADMIN_QUOTE_OPS_PATH,
  ADMIN_INTEGRATIONS_PATH,
  ADMIN_RUNTIME_PATH,
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
    label: "Overview",
  },
  {
    path: ADMIN_QUOTE_OPS_PATH,
    label: "Quote Ops",
  },
  {
    path: ADMIN_INTEGRATIONS_PATH,
    label: "Integrations",
  },
  {
    path: ADMIN_RUNTIME_PATH,
    label: "Runtime",
  },
]);
const QUOTE_PUBLIC_PATH = "/quote";
const REDIRECT_ROUTES = new Map([
  ["/home-simple", "/"],
  ["/действуй", "/quote"],
  ["/admin/setup", ADMIN_ROOT_PATH],
  ["/admin/users", ADMIN_ROOT_PATH],
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
    output[key] = value;
  }
  return output;
}

function getAdminConfig() {
  if (!adminAuth) return null;
  const config = adminAuth.loadAdminConfig(process.env);
  return config.configured ? config : null;
}

function getAdminRequestFingerprint(req) {
  return crypto
    .createHash("sha256")
    .update(`${getClientAddress(req)}|${normalizeString(req.headers["user-agent"], 240)}`)
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
      title: "Credentials",
      description: "Confirm the admin email and password before any TOTP prompt appears.",
    },
    {
      key: "2fa",
      index: "02",
      title: "Authenticator",
      description: "Use the current 6-digit code from Google Authenticator, 1Password, or a similar app.",
    },
    {
      key: "dashboard",
      index: "03",
      title: "Dashboard",
      description: "Open the secured overview for runtime visibility and future internal tools.",
    },
  ];

  return `
    <div class="admin-sidebar-card">
      <div class="admin-brand">
        <div class="admin-brand-mark">S</div>
        <div>
          <p class="admin-sidebar-label">SHYNLI</p>
          <h2 class="admin-sidebar-title">Admin Workspace</h2>
        </div>
      </div>
      <p class="admin-sidebar-copy">A framework-free admin shell restyled with shadcn/ui card, input, button, and badge patterns.</p>
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
      <p class="admin-sidebar-label">Security Defaults</p>
      <ul class="admin-feature-list">
        <li>Password verification happens before the second factor challenge.</li>
        <li>TOTP codes rotate every 30 seconds and accept only a narrow validation window.</li>
        <li>Admin cookies stay HttpOnly and SameSite=Strict for every route under <code>/admin</code>.</li>
      </ul>
    </div>`;
}

function renderAdminAppSidebar(config, req, activePath, statusBadges) {
  const cookieMode = `HttpOnly + SameSite=Strict${shouldUseSecureCookies(req) ? " + Secure" : ""}`;
  return `
    <div class="admin-sidebar-card">
      <div class="admin-brand">
        <div class="admin-brand-mark">S</div>
        <div>
          <p class="admin-sidebar-label">SHYNLI</p>
          <h2 class="admin-sidebar-title">Admin Dashboard</h2>
        </div>
      </div>
      <p class="admin-sidebar-copy">A shadcn-style operator shell for secure access, quote operations, integration visibility, and runtime diagnostics.</p>
      <nav class="admin-nav">
        ${ADMIN_APP_NAV_ITEMS.map((item) => `<a class="admin-nav-link${item.path === activePath ? " admin-nav-link-active" : ""}" href="${item.path}">${escapeHtml(item.label)}</a>`).join("")}
      </nav>
    </div>
    <div class="admin-sidebar-card admin-sidebar-card-muted">
      <p class="admin-sidebar-label">Access Posture</p>
      <div class="admin-badge-row">${statusBadges}</div>
      <div class="admin-divider"></div>
      <div class="admin-property-list">
        <div class="admin-property-row">
          <span class="admin-property-label">Account</span>
          <span class="admin-property-value">${escapeHtml(config.email)}</span>
        </div>
        <div class="admin-property-row">
          <span class="admin-property-label">Protocol</span>
          <span class="admin-property-value">${escapeHtml(getRequestProtocol(req))}</span>
        </div>
        <div class="admin-property-row">
          <span class="admin-property-label">Cookies</span>
          <span class="admin-property-value">${escapeHtml(cookieMode)}</span>
        </div>
      </div>
      <div class="admin-divider"></div>
      <div class="admin-link-grid">
        <a class="admin-link-tile" href="/" target="_blank" rel="noreferrer">
          <strong>Website Homepage</strong>
          <span>Open the public marketing site in a new tab.</span>
        </a>
        <a class="admin-link-tile" href="${QUOTE_PUBLIC_PATH}" target="_blank" rel="noreferrer">
          <strong>Quote Form</strong>
          <span>Preview the public quote flow and checkout handoff.</span>
        </a>
      </div>
    </div>`;
}

function renderAdminLayout(title, content, options = {}) {
  const pageTitle = `${title} | SHYNLI Admin`;
  const subtitle = options.subtitle ? `<p class="admin-subtitle">${escapeHtml(options.subtitle)}</p>` : "";
  const heroMeta = options.heroMeta ? `<div class="admin-hero-meta">${options.heroMeta}</div>` : "";
  const kicker = escapeHtml(options.kicker || "Secure Access");
  const sidebar = options.sidebar ? `<aside class="admin-sidebar">${options.sidebar}</aside>` : "";
  const shellClass = options.sidebar ? "admin-shell admin-shell-with-sidebar" : "admin-shell";

  return `<!DOCTYPE html>
<html lang="en">
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
    .admin-entry-list {
      display: grid;
      gap: 14px;
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
    "Admin Unavailable",
    `${renderAdminCard(
      "Configuration Required",
      "The route is already wired, but secure authentication cannot start until the server has a private signing secret.",
      `<div class="admin-alert admin-alert-error">Admin access needs a server-side secret before it can be enabled. Configure <code>ADMIN_MASTER_SECRET</code>, or make sure one of <code>QUOTE_SIGNING_SECRET</code>, <code>GHL_API_KEY</code>, or <code>STRIPE_SECRET_KEY</code> is available on the server.</div>
      <ul class="admin-feature-list">
        <li><code>ADMIN_MASTER_SECRET</code> is the preferred source for signing challenge and session cookies.</li>
        <li>If you do not set it explicitly, the server can fall back to <code>QUOTE_SIGNING_SECRET</code>, <code>GHL_API_KEY</code>, or <code>STRIPE_SECRET_KEY</code>.</li>
        <li>Once a signing secret exists, the login and TOTP steps become available immediately.</li>
      </ul>`,
      { eyebrow: "Status", muted: true }
    )}`,
    {
      kicker: "Configuration",
      subtitle: "The admin shell is ready. It just needs one private signing secret before secure access can begin.",
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
    "Admin Login",
    `${errorBlock}
      ${infoBlock}
      <div class="admin-section-grid admin-form-grid-two">
        ${renderAdminCard(
          "Credentials",
          "Enter the admin email and password first. The second step will ask for a 6-digit code from your Authenticator app.",
          `<form class="admin-form" method="post" action="${ADMIN_LOGIN_PATH}" autocomplete="on">
            <label class="admin-label">
              Email
              <input class="admin-input" type="email" name="email" value="${escapeHtmlText(options.email || config.email)}" autocomplete="username" required>
            </label>
            <label class="admin-label">
              Password
              <input class="admin-input" type="password" name="password" autocomplete="current-password" required>
            </label>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Continue to 2FA</button>
              <span class="admin-action-hint">Step 1 of 2. Successful credentials issue a short-lived challenge cookie.</span>
            </div>
          </form>`,
          { eyebrow: "Sign In" }
        )}
        ${renderAdminCard(
          "What Happens Next",
          "The flow stays intentionally small, similar to a clean shadcn auth block: card, field labels, focused input states, and one clear primary action.",
          `<ul class="admin-feature-list">
            <li>The submitted email must match the configured admin account exactly.</li>
            <li>Password verification uses a server-side scrypt hash, not plaintext comparison.</li>
            <li>After success, the server redirects you to <code>${ADMIN_2FA_PATH}</code> with a challenge cookie scoped to <code>/admin</code>.</li>
          </ul>`,
          { eyebrow: "Flow", muted: true }
        )}
      </div>`,
    {
      subtitle: "Use your admin email and password first. The second step will ask for a 6-digit code from your Authenticator app.",
      sidebar: renderAdminAuthSidebar("login"),
    }
  );
}

function renderTwoFactorPage(config, options = {}) {
  const errorBlock = options.error
    ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const secret = adminAuth.getTotpSecretMaterial(config);
  const otpauthUri = adminAuth.buildOtpauthUri(config);
  const secretMode = secret.derived
    ? "This key is derived from your server secret and current admin credentials."
    : "This key comes from ADMIN_TOTP_SECRET.";

  return renderAdminLayout(
    "Two-Factor Authentication",
    `${errorBlock}
      <div class="admin-section-grid admin-form-grid-two">
        ${renderAdminCard(
          "Authenticator Code",
          "Enter the current 6-digit code from your authenticator app. If this is your first time, use the setup card on the right before verifying.",
          `<form class="admin-form" method="post" action="${ADMIN_2FA_PATH}" autocomplete="off">
            <label class="admin-label">
              6-digit code
              <input class="admin-input admin-input-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" name="code" placeholder="123456" autocomplete="one-time-code" required>
            </label>
            <p class="admin-field-note">Step 2 of 2. The current code is tied to the configured issuer and rotates every 30 seconds.</p>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Verify and sign in</button>
              <a class="admin-link-button admin-button-secondary" href="${ADMIN_LOGIN_PATH}">Back</a>
            </div>
          </form>`,
          { eyebrow: "Verification" }
        )}
        ${renderAdminCard(
          "Need to Set Up Your Authenticator App?",
          `Add a new TOTP account in Google Authenticator, Microsoft Authenticator, 1Password, or a similar app using the values below. ${secretMode}`,
          `<details class="admin-details" open>
            <summary>Manual Setup Details</summary>
            <div class="admin-form-grid admin-form-grid-two" style="margin-top:14px;">
              ${renderAdminCard(
                "Manual Setup",
                "These values match the current admin issuer and account.",
                `<div class="admin-property-list">
                  <div class="admin-property-row">
                    <span class="admin-property-label">Issuer</span>
                    <span class="admin-property-value">${escapeHtml(config.issuer)}</span>
                  </div>
                  <div class="admin-property-row">
                    <span class="admin-property-label">Account</span>
                    <span class="admin-property-value">${escapeHtml(config.email)}</span>
                  </div>
                  <div class="admin-property-row">
                    <span class="admin-property-label">Key</span>
                    <span class="admin-property-value"><code>${escapeHtml(secret.base32)}</code></span>
                  </div>
                </div>`,
                { eyebrow: "TOTP", muted: true }
              )}
              ${renderAdminCard(
                "otpauth URI",
                "You can paste this full URI into compatible authenticator tools.",
                `<pre class="admin-code">${escapeHtml(otpauthUri)}</pre>`,
                { eyebrow: "Advanced", muted: true }
              )}
            </div>
          </details>`,
          { eyebrow: "Setup", muted: true }
        )}
      </div>`,
    {
      subtitle: "Enter the current TOTP code from your Authenticator app. If this is your first time, expand the setup section below and add the account manually.",
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
      <button class="admin-button admin-button-secondary" type="submit">Log out</button>
    </form>`
  );

  return `<div class="admin-topbar">
    <div>
      <p>${escapeHtml(options.caption || "Signed in as")}</p>
      <p class="admin-user-email">${escapeHtml(config.email)}</p>
    </div>
    <div class="admin-inline-actions">
      ${actions.join("")}
    </div>
  </div>`;
}

function getAdminStatusBadges(signals) {
  const leadBadge = !signals.leadConnector.available
    ? renderAdminBadge("GHL Unavailable", "muted")
    : signals.leadConnector.error
      ? renderAdminBadge("GHL Invalid", "danger")
      : signals.leadConnector.configured
        ? renderAdminBadge("GHL Ready", "success")
        : renderAdminBadge("GHL Missing", "muted");

  return [
    leadBadge,
    signals.supabaseConfigured ? renderAdminBadge("Supabase Ready", "success") : renderAdminBadge("Supabase Missing", "muted"),
    signals.stripeConfigured ? renderAdminBadge("Stripe Ready", "success") : renderAdminBadge("Stripe Missing", "muted"),
    signals.quoteTokenConfigured ? renderAdminBadge("Quote Token Ready", "success") : renderAdminBadge("Quote Token Missing", "muted"),
    signals.placesConfigured ? renderAdminBadge("Places Key Ready", "success") : renderAdminBadge("Places Key Missing", "muted"),
    signals.perfProtected ? renderAdminBadge("Perf Protected", "outline") : renderAdminBadge("Perf Endpoint Off", "muted"),
  ].join("");
}

function renderDashboardPage(req, config) {
  const signals = getAdminIntegrationState();
  const runtimeBadges = getAdminStatusBadges(signals);
  const memory = getMemoryUsageSnapshot();
  const totp = adminAuth.getTotpSecretMaterial(config);
  const serverTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "full",
    timeStyle: "long",
  });

  return renderAdminLayout(
    "Admin Dashboard",
    `${renderAdminSignedInTopbar(config, {
      linkHref: QUOTE_PUBLIC_PATH,
      linkLabel: "Open Quote Form",
      linkExternal: true,
    })}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Security",
          "Current auth posture for the secured admin surface.",
          `<p class="admin-metric-value">2 layers</p>
          ${renderAdminPropertyList([
            { label: "Password check", value: "Enabled" },
            { label: "TOTP issuer", value: config.issuer },
            { label: "TOTP mode", value: totp.derived ? "Derived from server secret" : "Explicit ADMIN_TOTP_SECRET" },
            { label: "Session TTL", value: formatDurationLabel(adminAuth.SESSION_TTL_SECONDS) },
          ])}`,
          { eyebrow: "Overview" }
        )}
        ${renderAdminCard(
          "Integrations",
          "Live configuration signals for quote, payments, CRM, and places lookup.",
          `<div class="admin-badge-row">${runtimeBadges}</div>
          <p class="admin-card-copy">Use the sections below for deeper config details, quote pricing visibility, and runtime diagnostics.</p>`,
          { eyebrow: "Status", muted: true }
        )}
        ${renderAdminCard(
          "Server",
          "Key request and origin details for the active process.",
          `<p class="admin-metric-value">${escapeHtml(getRequestProtocol(req).toUpperCase())}</p>
          ${renderAdminPropertyList([
            { label: "Site origin", value: SITE_ORIGIN },
            { label: "Server time", value: serverTime },
            { label: "HTML warm mode", value: HTML_CACHE_WARM_MODE },
            { label: "Perf window", value: formatDurationLabel(PERF_WINDOW_MS / 1000) },
          ])}`,
          { eyebrow: "Runtime" }
        )}
        ${renderAdminCard(
          "Memory",
          "A quick look at current process footprint.",
          `<p class="admin-metric-value">${escapeHtml(`${memory.heap_used_mb} MB`)}</p>
          ${renderAdminPropertyList([
            { label: "RSS", value: `${memory.rss_mb} MB` },
            { label: "Heap used", value: `${memory.heap_used_mb} MB` },
            { label: "External", value: `${memory.external_mb} MB` },
            { label: "Array buffers", value: `${memory.array_buffers_mb} MB` },
          ])}`,
          { eyebrow: "Process", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Internal Sections",
          "The admin workspace now breaks the secure area into focused pages instead of a single overview.",
          `<div class="admin-link-grid">
            <a class="admin-link-tile" href="${ADMIN_QUOTE_OPS_PATH}">
              <strong>Quote Ops</strong>
              <span>Inspect canonical pricing, booking endpoints, and checkout/token readiness.</span>
            </a>
            <a class="admin-link-tile" href="${ADMIN_INTEGRATIONS_PATH}">
              <strong>Integrations</strong>
              <span>Review GHL, Stripe, Places, perf, and auth-related configuration signals.</span>
            </a>
            <a class="admin-link-tile" href="${ADMIN_RUNTIME_PATH}">
              <strong>Runtime</strong>
              <span>Check live request latency, event loop delay, thresholds, and server internals.</span>
            </a>
          </div>`,
          { eyebrow: "Workspace" }
        )}
        ${renderAdminCard(
          "Current Coverage",
          "The secured admin area remains intentionally controlled while still giving operators useful visibility.",
          `<ul class="admin-feature-list">
            <li>Safe credential + TOTP access control for every route under <code>/admin</code>.</li>
            <li>Dedicated sections for quote operations, integrations, and runtime diagnostics.</li>
            <li>Shared shadcn-style shell with sidebar navigation, cards, badges, and concise operator views.</li>
          </ul>`,
          { eyebrow: "Roadmap", muted: true }
        )}
      </div>`,
    {
      kicker: "Operations Console",
      subtitle: "This is the secured admin area. It now groups access control, quote operations, integration visibility, and runtime checks into focused pages.",
      heroMeta: runtimeBadges,
      sidebar: renderAdminAppSidebar(config, req, ADMIN_ROOT_PATH, runtimeBadges),
    }
  );
}

function renderQuoteOpsStatusBadge(status) {
  if (status === "success") return renderAdminBadge("Success", "success");
  if (status === "warning") return renderAdminBadge("Warning", "default");
  return renderAdminBadge("Error", "danger");
}

function renderQuoteOpsNotice(req) {
  const reqUrl = getRequestUrl(req);
  const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
  if (notice === "retry-success") {
    return `<div class="admin-alert admin-alert-info">CRM retry completed for the selected quote entry.</div>`;
  }
  if (notice === "retry-failed") {
    return `<div class="admin-alert admin-alert-error">CRM retry failed for the selected quote entry. Check the entry status below for the latest error.</div>`;
  }
  if (notice === "retry-missing") {
    return `<div class="admin-alert admin-alert-error">The selected quote entry could not be found in the current in-memory ledger.</div>`;
  }
  return "";
}

function renderQuoteOpsEntryCard(entry, returnTo) {
  const warningBlock = entry.warnings.length > 0
    ? `<div class="admin-alert admin-alert-info">Warnings: ${escapeHtml(entry.warnings.join(", "))}</div>`
    : "";
  const errorBlock = entry.errorMessage
    ? `<div class="admin-alert admin-alert-error">${escapeHtml(entry.errorMessage)}</div>`
    : "";

  return `<article class="admin-entry-card">
    <div class="admin-entry-head">
      <div>
        <h3 class="admin-entry-title">${escapeHtml(entry.customerName || "Unnamed customer")}</h3>
        <p class="admin-entry-copy">${escapeHtml(entry.serviceName || "Cleaning service")} at ${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</p>
      </div>
      <div class="admin-entry-meta">
        ${renderQuoteOpsStatusBadge(entry.status)}
        ${entry.retryCount > 0 ? renderAdminBadge(`Retries ${entry.retryCount}`, "outline") : ""}
      </div>
    </div>
    <div class="admin-entry-grid">
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Created</span>
        <p class="admin-mini-value">${escapeHtml(new Date(entry.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }))}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Request ID</span>
        <p class="admin-mini-value">${escapeHtml(entry.requestId || "Unknown")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Service Type</span>
        <p class="admin-mini-value">${escapeHtml(entry.serviceType || "Unknown")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Schedule</span>
        <p class="admin-mini-value">${escapeHtml([entry.selectedDate, entry.selectedTime].filter(Boolean).join(" at ") || "Not scheduled")}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">Contact</span>
        <p class="admin-mini-value">${escapeHtml(entry.customerPhone || "No phone")}${entry.customerEmail ? `<br>${escapeHtml(entry.customerEmail)}` : ""}</p>
      </div>
      <div class="admin-mini-stat">
        <span class="admin-mini-label">CRM</span>
        <p class="admin-mini-value">HTTP ${escapeHtml(String(entry.httpStatus || 0))}${entry.contactId ? `<br>Contact ${escapeHtml(entry.contactId)}` : ""}</p>
      </div>
    </div>
    ${warningBlock}
    ${errorBlock}
    <div class="admin-inline-actions">
      <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
        <button class="admin-button" type="submit">Retry CRM</button>
      </form>
      <span class="admin-action-hint">${escapeHtml(entry.fullAddress || "Address not captured")}.</span>
    </div>
  </article>`;
}

async function renderQuoteOpsPage(req, config, quoteOpsLedger) {
  const signals = getAdminIntegrationState();
  const runtimeBadges = getAdminStatusBadges(signals);
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
    "Quote Operations",
    `${renderAdminSignedInTopbar(config, {
      linkHref: QUOTE_PUBLIC_PATH,
      linkLabel: "Preview Quote Flow",
      linkExternal: true,
    })}
      ${renderQuoteOpsNotice(req)}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Latest Entries",
          "Quote submissions currently stored in the in-memory ops ledger for this process.",
          `<p class="admin-metric-value">${escapeHtml(String(totalEntries))}</p>
          <p class="admin-card-copy">Entries persist only for the lifetime of the current Node process and reset on restart or redeploy.</p>`,
          { eyebrow: "Ledger" }
        )}
        ${renderAdminCard(
          "Success",
          "Submissions that completed without CRM warnings.",
          `<p class="admin-metric-value">${escapeHtml(String(successCount))}</p>
          <p class="admin-card-copy">Healthy quote submissions with canonical pricing and CRM sync.</p>`,
          { eyebrow: "Status", muted: true }
        )}
        ${renderAdminCard(
          "Warnings",
          "Submissions that succeeded but reported partial sync issues.",
          `<p class="admin-metric-value">${escapeHtml(String(warningCount))}</p>
          <p class="admin-card-copy">Useful for cases like skipped notes or opportunity sync warnings.</p>`,
          { eyebrow: "Status", muted: true }
        )}
        ${renderAdminCard(
          "Errors",
          "Submissions that failed and may need an admin retry.",
          `<p class="admin-metric-value">${escapeHtml(String(errorCount))}</p>
          <p class="admin-card-copy">Use the retry action below to resubmit the stored canonical payload to CRM.</p>`,
          { eyebrow: "Status", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Submission Queue",
          "Filter recent quote submissions, export the current view, and retry CRM sync from the stored canonical payload.",
          `<form class="admin-form-grid admin-form-grid-two" method="get" action="${ADMIN_QUOTE_OPS_PATH}">
            <label class="admin-label">
              Search
              <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Name, phone, email, request ID">
            </label>
            <label class="admin-label">
              Status
              <select class="admin-input" name="status">
                <option value="all"${filters.status === "all" ? " selected" : ""}>All statuses</option>
                <option value="success"${filters.status === "success" ? " selected" : ""}>Success</option>
                <option value="warning"${filters.status === "warning" ? " selected" : ""}>Warning</option>
                <option value="error"${filters.status === "error" ? " selected" : ""}>Error</option>
              </select>
            </label>
            <label class="admin-label">
              Service Type
              <select class="admin-input" name="serviceType">
                <option value="all"${filters.serviceType === "all" ? " selected" : ""}>All services</option>
                <option value="regular"${filters.serviceType === "regular" ? " selected" : ""}>Regular</option>
                <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Deep</option>
                <option value="moving"${filters.serviceType === "moving" ? " selected" : ""}>Moving</option>
              </select>
            </label>
            <div class="admin-inline-actions" style="align-self:end;">
              <button class="admin-button" type="submit">Apply Filters</button>
              <a class="admin-link-button admin-button-secondary" href="${ADMIN_QUOTE_OPS_PATH}">Reset</a>
              <a class="admin-link-button admin-button-secondary" href="${exportHref}">Export CSV</a>
            </div>
          </form>
          <div class="admin-divider"></div>
          <div class="admin-entry-list">
            ${entries.length > 0
              ? entries.map((entry) => renderQuoteOpsEntryCard(entry, currentReturnTo)).join("")
              : `<div class="admin-empty-state">No quote submissions match the current filters yet. Submit a quote through <code>${QUOTE_SUBMIT_ENDPOINT}</code> or open the public <code>${QUOTE_PUBLIC_PATH}</code> flow to seed the ledger.</div>`}
          </div>`,
          { eyebrow: "Queue" }
        )}
        ${renderAdminCard(
          "Pricing Guardrails",
          "The server clamps quote inputs to the supported options from the live calculator and then computes the canonical total before storing or retrying a submission.",
          `${renderAdminPropertyList([
            { label: "Room counts", value: formatCountList(Array.from(ALLOWED_ROOM_COUNTS.values())) },
            { label: "Bathroom counts", value: formatCountList(Array.from(ALLOWED_BATHROOM_COUNTS.values())) },
            { label: "Square-foot buckets", value: formatCountList(ALLOWED_SQUARE_FEET_BUCKETS) },
            { label: "Regular base prices", value: `Weekly ${formatCurrencyAmount(PRICING.regular.basePrices.weekly)}, Biweekly ${formatCurrencyAmount(PRICING.regular.basePrices.biweekly)}, Monthly ${formatCurrencyAmount(PRICING.regular.basePrices.monthly)}` },
          ])}
          <ul class="admin-feature-list">
            <li>Deep cleaning includes <code>baseboardCleaning</code> and <code>doorsCleaning</code> by default.</li>
            <li>Moving clean presets also include <code>ovenCleaning</code> and <code>refrigeratorCleaning</code>.</li>
            <li>Retry actions reuse the stored canonical payload, not the raw browser-submitted totals.</li>
          </ul>`,
          { eyebrow: "Rules", muted: true }
        )}
        ${renderAdminCard(
          "Checkout & Tokenization",
          "Payments and CRM submission are gated by server-side readiness checks.",
          `${renderAdminPropertyList([
            { label: "Quote token secret", value: formatBooleanLabel(signals.quoteTokenConfigured, "Configured", "Missing") },
            { label: "Quote token TTL", value: formatDurationLabel(signals.quoteTokenTtlSeconds) },
            { label: "Stripe checkout", value: formatBooleanLabel(signals.stripeConfigured, "Configured", "Missing") },
            { label: "LeadConnector CRM", value: signals.leadConnector.error ? `Invalid: ${signals.leadConnector.error}` : formatBooleanLabel(signals.leadConnector.configured, "Configured", "Missing") },
            { label: "Checkout amount window", value: `${formatCurrencyAmount(STRIPE_MIN_AMOUNT_CENTS / 100)} to ${formatCurrencyAmount(STRIPE_MAX_AMOUNT_CENTS / 100)}` },
          ])}
          <div class="admin-link-grid">
            <a class="admin-link-tile" href="${QUOTE_PUBLIC_PATH}" target="_blank" rel="noreferrer">
              <strong>${QUOTE_PUBLIC_PATH}</strong>
              <span>Public quote experience where customers configure service and scheduling.</span>
            </a>
            <div class="admin-link-tile">
              <strong>${QUOTE_SUBMIT_ENDPOINT}</strong>
              <span>Primary POST endpoint that normalizes payloads and writes to CRM.</span>
            </div>
            <div class="admin-link-tile">
              <strong>${STRIPE_CHECKOUT_ENDPOINT}</strong>
              <span>POST endpoint that creates Stripe checkout sessions from canonical totals.</span>
            </div>
          </div>`,
          { eyebrow: "Payments", muted: true }
        )}
      </div>`,
    {
      kicker: "Quote Workspace",
      subtitle: "Use this page to inspect live quote submissions, filter by status, export the current queue, and retry CRM sync from stored canonical payloads.",
      heroMeta: runtimeBadges,
      sidebar: renderAdminAppSidebar(config, req, ADMIN_QUOTE_OPS_PATH, runtimeBadges),
    }
  );
}

function renderIntegrationsPage(req, config) {
  const signals = getAdminIntegrationState();
  const runtimeBadges = getAdminStatusBadges(signals);
  const leadConfig = signals.leadConnector.config;
  const authConfig = adminAuth.loadAdminConfig(process.env);

  return renderAdminLayout(
    "Integrations",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_QUOTE_OPS_PATH,
      linkLabel: "Open Quote Ops",
    })}
      <div class="admin-section-grid">
        ${renderAdminCard(
          "LeadConnector / HighLevel",
          signals.leadConnector.error
            ? "The CRM config is present but currently invalid."
            : "Current CRM wiring for quote submissions, note sync, and opportunity creation.",
          `${signals.leadConnector.error ? `<div class="admin-alert admin-alert-error">${escapeHtml(signals.leadConnector.error)}</div>` : ""}
          ${leadConfig
            ? renderAdminPropertyList([
                { label: "Configured", value: formatBooleanLabel(leadConfig.configured, "Yes", "No") },
                { label: "API base URL", value: leadConfig.apiBaseUrl },
                { label: "API version", value: leadConfig.apiVersion },
                { label: "Location ID", value: leadConfig.locationId || "Missing" },
                { label: "Contact source", value: leadConfig.source },
                { label: "Tags", value: leadConfig.tags.join(", ") || "None" },
                { label: "Request timeout", value: `${leadConfig.requestTimeoutMs} ms` },
                { label: "Notes", value: formatBooleanLabel(leadConfig.enableNotes, "Enabled", "Disabled") },
                { label: "Opportunity creation", value: formatBooleanLabel(leadConfig.createOpportunity, "Enabled", "Disabled") },
                { label: "Pipeline", value: leadConfig.pipelineId || leadConfig.pipelineName },
                { label: "Stage", value: leadConfig.pipelineStageId || leadConfig.pipelineStageName },
              ])
            : `<p class="admin-card-copy">LeadConnector config is not currently available in this process.</p>`}`,
          { eyebrow: "CRM" }
        )}
        ${renderAdminCard(
          "Payments, Tokens, and Persistence",
          "Server-side payment, quote-token, and Supabase persistence prerequisites.",
          `${renderAdminPropertyList([
            { label: "Stripe", value: formatBooleanLabel(signals.stripeConfigured, "Configured", "Missing") },
            { label: "Quote token secret", value: maskSecretPreview(getQuoteTokenSecret(process.env)) },
            { label: "Quote token TTL", value: formatDurationLabel(signals.quoteTokenTtlSeconds) },
            { label: "Supabase", value: formatBooleanLabel(signals.supabaseConfigured, "Configured", "Missing") },
            { label: "Supabase URL", value: signals.supabaseUrl || "Missing" },
            { label: "Quote ops table", value: signals.supabaseTableName || "quote_ops_entries" },
            { label: "Checkout endpoint", value: STRIPE_CHECKOUT_ENDPOINT },
            { label: "Allowed amount range", value: `${formatCurrencyAmount(STRIPE_MIN_AMOUNT_CENTS / 100)} to ${formatCurrencyAmount(STRIPE_MAX_AMOUNT_CENTS / 100)}` },
          ])}`,
          { eyebrow: "Payments", muted: true }
        )}
        ${renderAdminCard(
          "Places, Perf, and Auth",
          "Peripheral services and protected internal diagnostics.",
          `${renderAdminPropertyList([
            { label: "Google Places browser key", value: formatBooleanLabel(signals.placesConfigured, "Configured", "Missing") },
            { label: "Protected perf endpoint", value: formatBooleanLabel(signals.perfProtected, "Ready", "Off") },
            { label: "Perf endpoint enabled", value: formatBooleanLabel(signals.perfEndpointEnabled, "Yes", "No") },
            { label: "Perf token present", value: formatBooleanLabel(signals.perfTokenPresent, "Yes", "No") },
            { label: "Admin master secret", value: authConfig.masterSecret ? "Present" : "Missing" },
            { label: "Admin TOTP secret mode", value: authConfig.configuredTotpSecret ? "Explicit ADMIN_TOTP_SECRET" : "Derived from admin secret chain" },
          ])}`,
          { eyebrow: "Support", muted: true }
        )}
        ${renderAdminCard(
          "Discovery Behavior",
          "Auto-discovery lets the backend resolve missing CRM IDs and field mappings when env config is intentionally light.",
          `${leadConfig
            ? renderAdminPropertyList([
                { label: "Custom field map configured", value: formatBooleanLabel(Boolean(leadConfig.customFieldMap), "Yes", "No") },
                { label: "Custom field auto-discovery", value: formatBooleanLabel(leadConfig.enableCustomFieldAutoDiscovery, "Enabled", "Disabled") },
                { label: "Opportunity auto-discovery", value: formatBooleanLabel(leadConfig.enableOpportunityAutoDiscovery, "Enabled", "Disabled") },
                { label: "Note max length", value: `${leadConfig.noteMaxLength} chars` },
              ])
            : `<p class="admin-card-copy">LeadConnector settings are unavailable, so discovery behavior cannot be summarized yet.</p>`}
          <ul class="admin-feature-list">
            <li>API secrets are never rendered directly in this page; only status and masked previews are shown.</li>
            <li>Invalid CRM base URLs surface here before they break live quote submissions.</li>
            <li>Use this page when checking whether deployments have the right env setup.</li>
          </ul>`,
          { eyebrow: "Behavior" }
        )}
      </div>`,
    {
      kicker: "Integration Surface",
      subtitle: "Review how CRM, payments, tokenization, search, and protected diagnostics are configured in the current process.",
      heroMeta: runtimeBadges,
      sidebar: renderAdminAppSidebar(config, req, ADMIN_INTEGRATIONS_PATH, runtimeBadges),
    }
  );
}

function renderRuntimePage(req, config, adminRuntime = {}) {
  const signals = getAdminIntegrationState();
  const runtimeBadges = getAdminStatusBadges(signals);
  const requestSnapshot = adminRuntime.requestPerfWindow
    ? adminRuntime.requestPerfWindow.snapshot()
    : { window_ms: PERF_WINDOW_MS, total_requests: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0, status_5xx: 0, status_5xx_rate: 0 };
  const eventLoopSnapshot = adminRuntime.eventLoopStats
    ? adminRuntime.eventLoopStats.readSnapshot(false)
    : { min_ms: 0, mean_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0 };
  const memory = getMemoryUsageSnapshot();

  return renderAdminLayout(
    "Runtime",
    `${renderAdminSignedInTopbar(config, {
      linkHref: ADMIN_INTEGRATIONS_PATH,
      linkLabel: "Review Integrations",
    })}
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Requests in Window",
          "Rolling request snapshot captured by the in-process perf window.",
          `<p class="admin-metric-value">${escapeHtml(String(requestSnapshot.total_requests))}</p>
          ${renderAdminPropertyList([
            { label: "Window", value: formatDurationLabel(requestSnapshot.window_ms / 1000) },
            { label: "p50", value: `${requestSnapshot.p50_ms} ms` },
            { label: "p95", value: `${requestSnapshot.p95_ms} ms` },
            { label: "p99", value: `${requestSnapshot.p99_ms} ms` },
          ])}`,
          { eyebrow: "Traffic" }
        )}
        ${renderAdminCard(
          "5xx Rate",
          "Recent server error rate inside the perf window.",
          `<p class="admin-metric-value">${escapeHtml(`${(requestSnapshot.status_5xx_rate * 100).toFixed(2)}%`)}</p>
          ${renderAdminPropertyList([
            { label: "5xx responses", value: String(requestSnapshot.status_5xx) },
            { label: "Alert threshold", value: `${(ALERT_5XX_RATE * 100).toFixed(2)}%` },
          ])}`,
          { eyebrow: "Health", muted: true }
        )}
        ${renderAdminCard(
          "Event Loop p95",
          "Current event loop delay without resetting the histogram.",
          `<p class="admin-metric-value">${escapeHtml(`${eventLoopSnapshot.p95_ms} ms`)}</p>
          ${renderAdminPropertyList([
            { label: "Mean", value: `${eventLoopSnapshot.mean_ms} ms` },
            { label: "p99", value: `${eventLoopSnapshot.p99_ms} ms` },
            { label: "Max", value: `${eventLoopSnapshot.max_ms} ms` },
            { label: "Alert threshold", value: `${ALERT_EVENT_LOOP_P95_MS} ms` },
          ])}`,
          { eyebrow: "Latency" }
        )}
        ${renderAdminCard(
          "Heap Used",
          "Current memory footprint for this process.",
          `<p class="admin-metric-value">${escapeHtml(`${memory.heap_used_mb} MB`)}</p>
          ${renderAdminPropertyList([
            { label: "RSS", value: `${memory.rss_mb} MB` },
            { label: "External", value: `${memory.external_mb} MB` },
            { label: "Array buffers", value: `${memory.array_buffers_mb} MB` },
          ])}`,
          { eyebrow: "Memory", muted: true }
        )}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Perf Thresholds",
          "These are the thresholds that drive periodic perf alerts in the current process.",
          `${renderAdminPropertyList([
            { label: "Request p95 threshold", value: `${ALERT_P95_MS} ms` },
            { label: "Request p99 threshold", value: `${ALERT_P99_MS} ms` },
            { label: "5xx rate threshold", value: `${(ALERT_5XX_RATE * 100).toFixed(2)}%` },
            { label: "Event loop p95 threshold", value: `${ALERT_EVENT_LOOP_P95_MS} ms` },
            { label: "Perf summary interval", value: formatDurationLabel(PERF_SUMMARY_INTERVAL_MS / 1000) },
          ])}`,
          { eyebrow: "Thresholds" }
        )}
        ${renderAdminCard(
          "Runtime Controls",
          "Operational settings that affect request logging, trust behavior, and warmup strategy.",
          `${renderAdminPropertyList([
            { label: "HTML warm mode", value: HTML_CACHE_WARM_MODE },
            { label: "Request log buffer", value: `${REQUEST_LOG_BUFFER_LIMIT} lines` },
            { label: "Request log flush interval", value: `${REQUEST_LOG_FLUSH_INTERVAL_MS} ms` },
            { label: "Trust proxy headers", value: formatBooleanLabel(TRUST_PROXY_HEADERS, "Enabled", "Disabled") },
            { label: "Trusted proxy count", value: String(TRUSTED_PROXY_IPS.size) },
            { label: "Max perf samples", value: String(PERF_MAX_SAMPLES) },
          ])}`,
          { eyebrow: "Controls", muted: true }
        )}
        ${renderAdminCard(
          "Protected Diagnostics Endpoint",
          "The JSON perf endpoint stays private unless both the feature flag and the token are present.",
          `${renderAdminPropertyList([
            { label: "Endpoint path", value: "/__perf" },
            { label: "Enabled", value: formatBooleanLabel(signals.perfEndpointEnabled, "Yes", "No") },
            { label: "Token present", value: formatBooleanLabel(signals.perfTokenPresent, "Yes", "No") },
            { label: "Access model", value: "Requires x-perf-token header" },
          ])}
          <p class="admin-card-copy">This page uses the same in-process metrics directly, so operators can inspect runtime health without exposing the JSON endpoint publicly.</p>`,
          { eyebrow: "Diagnostics" }
        )}
      </div>`,
    {
      kicker: "Runtime Console",
      subtitle: "Inspect in-process request latency, event loop delay, memory, and alert thresholds without leaving the secured admin area.",
      heroMeta: runtimeBadges,
      sidebar: renderAdminAppSidebar(config, req, ADMIN_RUNTIME_PATH, runtimeBadges),
    }
  );
}

async function renderAdminAppPage(route, req, config, adminRuntime = {}, quoteOpsLedger = null) {
  if (route === ADMIN_ROOT_PATH) return renderDashboardPage(req, config);
  if (route === ADMIN_QUOTE_OPS_PATH) return renderQuoteOpsPage(req, config, quoteOpsLedger);
  if (route === ADMIN_INTEGRATIONS_PATH) return renderIntegrationsPage(req, config);
  if (route === ADMIN_RUNTIME_PATH) return renderRuntimePage(req, config, adminRuntime);
  return renderDashboardPage(req, config);
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
      "Too Many Attempts",
      `<div class="admin-alert admin-alert-error">${escapeHtml(errorMessage || "Too many attempts. Please wait a minute and try again.")}</div>`,
      { subtitle: "Rate limiting is active to protect admin access." }
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
  quoteOpsLedger = null
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
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">This route only accepts GET.</div>`), requestStartNs, requestContext.cacheHit);
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
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">This route only accepts POST.</div>`), requestStartNs, requestContext.cacheHit);
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
    const entryId = normalizeString(formBody.entryId, 120);
    const returnTo = buildQuoteOpsReturnPath(formBody.returnTo);

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

  if (ADMIN_APP_ROUTES.has(requestContext.route)) {
    if (req.method !== "GET") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">This route only accepts GET.</div>`), requestStartNs, requestContext.cacheHit);
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
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">This route only accepts GET and POST.</div>`), requestStartNs, requestContext.cacheHit);
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
        "Too many login attempts. Please wait a few minutes before trying again."
      )
    ) {
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const email = normalizeString(formBody.email, 320).toLowerCase();
    const password = normalizeString(formBody.password, 200);
    const validEmail = email && email === config.email;
    const validPassword = password && adminAuth.verifyPassword(password, config.passwordHash);
    if (!validEmail || !validPassword) {
      writeHtmlWithTiming(
        res,
        401,
        renderLoginPage(config, {
          error: "Wrong email or password. Please try again.",
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
      writeHtmlWithTiming(res, 200, renderTwoFactorPage(config), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (req.method !== "POST") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">This route only accepts GET and POST.</div>`), requestStartNs, requestContext.cacheHit);
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
        "Too many verification attempts. Please wait a few minutes before trying again."
      )
    ) {
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const code = normalizeString(formBody.code, 16);
    if (!adminAuth.verifyTotpCode(code, config)) {
      writeHtmlWithTiming(
        res,
        401,
        renderTwoFactorPage(config, {
          error: "That code was not valid. Check the app and try again.",
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
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">Log out must be submitted with POST.</div>`), requestStartNs, requestContext.cacheHit);
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
        }, quoteOpsLedger);
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
