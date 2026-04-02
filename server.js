#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { monitorEventLoopDelay } = require("perf_hooks");
const { URL } = require("url");
let createLeadConnectorClient;
try {
  ({ createLeadConnectorClient } = require("./lib/leadconnector"));
} catch (error) {
  createLeadConnectorClient = () => {
    throw new Error("Lead connector module is not available in this build.");
  };
}
const { calculateQuotePricing } = require("./lib/quote-pricing");
let QuoteTokenError;
let createQuoteToken;
let verifyQuoteToken;
try {
  ({ QuoteTokenError, createQuoteToken, verifyQuoteToken } = require("./lib/quote-token"));
} catch (error) {
  QuoteTokenError = class QuoteTokenError extends Error {};
  createQuoteToken = () => {
    throw new QuoteTokenError("Quote token module is not available in this build.");
  };
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
const ADMIN_SESSION_COOKIE = "shynli_admin_session";
const ADMIN_CHALLENGE_COOKIE = "shynli_admin_challenge";
const QUOTE_PUBLIC_PATH = "/quote";
const REDIRECT_ROUTES = new Map([["/home-simple", "/"]]);
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

async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const rawBody = await readTextBody(req, maxBytes);
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error("Invalid JSON");
  }
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

function renderAdminLayout(title, content, options = {}) {
  const pageTitle = `${title} | SHYNLI Admin`;
  const subtitle = options.subtitle ? `<p class="admin-subtitle">${escapeHtml(options.subtitle)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root {
      --bg: #f7f2ed;
      --panel: #fffdfa;
      --panel-border: #eadfd3;
      --text: #2f2a27;
      --muted: #736860;
      --accent: #9e435a;
      --accent-deep: #7e3347;
      --danger: #b23a48;
      --success: #2f7d5a;
      --shadow: 0 20px 50px rgba(70, 42, 27, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Montserrat", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(158, 67, 90, 0.12), transparent 28%),
        linear-gradient(180deg, #fbf7f2 0%, var(--bg) 100%);
      padding: 32px 18px;
    }
    .admin-shell {
      max-width: 1120px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .admin-panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      box-shadow: var(--shadow);
    }
    .admin-hero {
      padding: 28px 28px 12px;
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
      font-family: "Playfair Display", Georgia, serif;
      font-size: clamp(32px, 5vw, 52px);
      line-height: 1.05;
      letter-spacing: -0.03em;
    }
    .admin-subtitle {
      margin: 12px 0 0;
      max-width: 720px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.65;
    }
    .admin-content {
      padding: 0 28px 28px;
    }
    .admin-form {
      display: grid;
      gap: 16px;
      max-width: 480px;
    }
    .admin-label {
      display: grid;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
    }
    .admin-input {
      width: 100%;
      border: 1px solid #dbcdbf;
      border-radius: 14px;
      padding: 14px 16px;
      font: inherit;
      background: #fff;
      color: var(--text);
    }
    .admin-input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.14);
    }
    .admin-button, .admin-link-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 48px;
      padding: 0 18px;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .admin-button:hover, .admin-link-button:hover {
      background: var(--accent-deep);
    }
    .admin-button-secondary {
      background: #efe4da;
      color: var(--text);
    }
    .admin-button-secondary:hover {
      background: #e4d5c6;
    }
    .admin-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .admin-alert {
      margin: 0 0 18px;
      border-radius: 16px;
      padding: 14px 16px;
      font-size: 14px;
      line-height: 1.55;
    }
    .admin-alert-error {
      background: rgba(178, 58, 72, 0.09);
      color: var(--danger);
      border: 1px solid rgba(178, 58, 72, 0.18);
    }
    .admin-alert-info {
      background: rgba(47, 125, 90, 0.08);
      color: var(--success);
      border: 1px solid rgba(47, 125, 90, 0.16);
    }
    .admin-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }
    .admin-card {
      border: 1px solid var(--panel-border);
      border-radius: 18px;
      padding: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(249,245,239,0.92));
    }
    .admin-card h3 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    .admin-card p, .admin-card li {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
    }
    .admin-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
    }
    .admin-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      background: rgba(47, 125, 90, 0.1);
      color: var(--success);
    }
    .admin-badge-muted {
      background: rgba(115, 104, 96, 0.12);
      color: var(--muted);
    }
    .admin-code {
      margin: 0;
      padding: 14px 16px;
      border-radius: 14px;
      background: #271f22;
      color: #fff4f4;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    details.admin-details {
      border: 1px dashed #d9c7ba;
      border-radius: 14px;
      padding: 14px 16px;
      background: #fffcf8;
    }
    details.admin-details summary {
      cursor: pointer;
      font-weight: 700;
    }
    .admin-topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .admin-topbar p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .admin-logout-form {
      margin: 0;
    }
    a { color: var(--accent); }
    @media (max-width: 720px) {
      body { padding: 18px 12px; }
      .admin-hero { padding: 22px 18px 8px; }
      .admin-content { padding: 0 18px 22px; }
    }
  </style>
</head>
<body>
  <main class="admin-shell">
    <section class="admin-panel">
      <div class="admin-hero">
        <p class="admin-kicker">Secure Access</p>
        <h1 class="admin-title">${escapeHtml(title)}</h1>
        ${subtitle}
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
    `<div class="admin-alert admin-alert-error">Admin access needs a server-side secret before it can be enabled. Configure <code>ADMIN_MASTER_SECRET</code>, or make sure one of <code>QUOTE_SIGNING_SECRET</code>, <code>GHL_API_KEY</code>, or <code>STRIPE_SECRET_KEY</code> is available on the server.</div>`,
    {
      subtitle: "The route is wired, but secure authentication cannot start until the server has a private signing secret.",
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
    `${errorBlock}${infoBlock}
      <form class="admin-form" method="post" action="${ADMIN_LOGIN_PATH}" autocomplete="on">
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
        </div>
      </form>`,
    {
      subtitle: "Use your admin email and password first. The second step will ask for a 6-digit code from your Authenticator app.",
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
      <form class="admin-form" method="post" action="${ADMIN_2FA_PATH}" autocomplete="off">
        <label class="admin-label">
          6-digit code
          <input class="admin-input" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" name="code" placeholder="123456" required>
        </label>
        <div class="admin-inline-actions">
          <button class="admin-button" type="submit">Verify and sign in</button>
          <a class="admin-link-button admin-button-secondary" href="${ADMIN_LOGIN_PATH}">Back</a>
        </div>
      </form>
      <details class="admin-details" style="margin-top:18px;">
        <summary>Need to set up your Authenticator app?</summary>
        <div style="display:grid; gap:12px; margin-top:12px;">
          <p class="admin-subtitle" style="margin:0;">Add a new TOTP account in Google Authenticator, Microsoft Authenticator, 1Password, or a similar app using the values below. ${escapeHtml(secretMode)}</p>
          <div class="admin-card">
            <h3>Manual setup</h3>
            <ul class="admin-list">
              <li><strong>Issuer:</strong> ${escapeHtml(config.issuer)}</li>
              <li><strong>Account:</strong> ${escapeHtml(config.email)}</li>
              <li><strong>Key:</strong> <code>${escapeHtml(secret.base32)}</code></li>
            </ul>
          </div>
          <div class="admin-card">
            <h3>otpauth URI</h3>
            <pre class="admin-code">${escapeHtml(otpauthUri)}</pre>
          </div>
        </div>
      </details>`,
    {
      subtitle: "Enter the current TOTP code from your Authenticator app. If this is your first time, expand the setup section below and add the account manually.",
    }
  );
}

function renderDashboardPage(req, config) {
  const runtimeBadges = [
    getLeadConnectorClient().isConfigured() ? '<span class="admin-badge">GHL Ready</span>' : '<span class="admin-badge admin-badge-muted">GHL Missing</span>',
    getStripeClient() ? '<span class="admin-badge">Stripe Ready</span>' : '<span class="admin-badge admin-badge-muted">Stripe Missing</span>',
    GOOGLE_PLACES_API_KEY ? '<span class="admin-badge">Places Key Ready</span>' : '<span class="admin-badge admin-badge-muted">Places Key Missing</span>',
  ].join(" ");
  const memory = getMemoryUsageSnapshot();
  const totp = adminAuth.getTotpSecretMaterial(config);
  return renderAdminLayout(
    "Admin Dashboard",
    `<div class="admin-topbar">
        <p>Signed in as <strong>${escapeHtml(config.email)}</strong></p>
        <form class="admin-logout-form" method="post" action="${ADMIN_LOGOUT_PATH}">
          <button class="admin-button admin-button-secondary" type="submit">Log out</button>
        </form>
      </div>
      <div class="admin-grid">
        <article class="admin-card">
          <h3>Security</h3>
          <ul class="admin-list">
            <li>Password check: enabled</li>
            <li>TOTP issuer: ${escapeHtml(config.issuer)}</li>
            <li>TOTP mode: ${totp.derived ? "derived from server secret" : "explicit ADMIN_TOTP_SECRET"}</li>
            <li>Cookies: HttpOnly + SameSite=Strict${shouldUseSecureCookies(req) ? " + Secure" : ""}</li>
          </ul>
        </article>
        <article class="admin-card">
          <h3>Integrations</h3>
          <p>${runtimeBadges}</p>
        </article>
        <article class="admin-card">
          <h3>Server</h3>
          <ul class="admin-list">
            <li>Site origin: ${escapeHtml(SITE_ORIGIN)}</li>
            <li>Server time: ${escapeHtml(new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "full", timeStyle: "long" }))}</li>
            <li>Protocol: ${escapeHtml(getRequestProtocol(req))}</li>
          </ul>
        </article>
        <article class="admin-card">
          <h3>Memory</h3>
          <ul class="admin-list">
            <li>RSS: ${escapeHtml(`${memory.rss_mb} MB`)}</li>
            <li>Heap used: ${escapeHtml(`${memory.heap_used_mb} MB`)}</li>
            <li>External: ${escapeHtml(`${memory.external_mb} MB`)}</li>
          </ul>
        </article>
        <article class="admin-card">
          <h3>Quick Links</h3>
          <ul class="admin-list">
            <li><a href="/" target="_blank" rel="noreferrer">Open website homepage</a></li>
            <li><a href="/quote" target="_blank" rel="noreferrer">Open quote form</a></li>
            <li><a href="/faq" target="_blank" rel="noreferrer">Open FAQ page</a></li>
          </ul>
        </article>
      </div>`,
    {
      subtitle: "This is the secured admin area. Right now it focuses on safe access control, runtime visibility, and guarded entry into future internal tools.",
    }
  );
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

async function handleAdminRequest(req, res, requestStartNs, requestContext, requestLogger) {
  requestContext.cacheHit = false;
  const adminState = getAdminAuthState(req);
  if (!adminState.config) {
    writeHtmlWithTiming(res, 503, renderAdminUnavailablePage(), requestStartNs, requestContext.cacheHit);
    return;
  }

  const { config, session, challenge, fingerprint } = adminState;

  if (requestContext.route === ADMIN_ROOT_PATH) {
    if (req.method !== "GET") {
      writeHtmlWithTiming(res, 405, renderAdminLayout("Method Not Allowed", `<div class="admin-alert admin-alert-error">This route only accepts GET.</div>`), requestStartNs, requestContext.cacheHit);
      return;
    }
    if (session) {
      writeHtmlWithTiming(res, 200, renderDashboardPage(req, config), requestStartNs, requestContext.cacheHit);
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
  requestLogger
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

  let leadConnector;
  try {
    leadConnector = getLeadConnectorClient();
  } catch (error) {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "quote_client_init_error",
      message: error && error.message ? error.message : "Unknown LeadConnector init error",
    });
    writeJsonWithTiming(
      res,
      503,
      { error: "Quote requests are temporarily unavailable." },
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

  const result = await leadConnector.submitQuoteSubmission({
    contactData,
    calculatorData: canonicalCalculatorData,
    source: body?.source || "Website Quote",
    pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
    requestId: normalizeString(req.headers["x-request-id"] || crypto.randomUUID(), 120),
    userAgent: normalizeString(req.headers["user-agent"], 180),
    submittedAt: normalizeString(body?.submittedAt || new Date().toISOString(), 64),
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

  writeJsonWithTiming(
    res,
    Number(result.status) || 200,
    {
      ok: true,
      success: true,
      contactId: result.contactId,
      usedExistingContact: Boolean(result.usedExistingContact),
      noteCreated: Boolean(result.noteCreated),
      opportunityCreated: Boolean(result.opportunityCreated),
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

      if (
        normalizedPath === ADMIN_ROOT_PATH ||
        normalizedPath === ADMIN_LOGIN_PATH ||
        normalizedPath === ADMIN_2FA_PATH ||
        normalizedPath === ADMIN_LOGOUT_PATH
      ) {
        await handleAdminRequest(req, res, requestStartNs, requestContext, requestLogger);
        return;
      }

      if (normalizedPath === STRIPE_CHECKOUT_ENDPOINT) {
        await handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger);
        return;
      }

      if (normalizedPath === QUOTE_REQUEST_ENDPOINT || normalizedPath === QUOTE_SUBMIT_ENDPOINT) {
        await handleQuoteSubmissionRequest(req, res, requestStartNs, requestContext, requestLogger);
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
