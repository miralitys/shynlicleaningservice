#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const accountAuth = require("./lib/account-auth");
const {
  loadAccountInviteEmailConfig,
  sendAccountInviteEmail,
  sendOrderPolicyConfirmationEmail,
  sendQuoteRequestConfirmationEmail,
  sendStaffW9ReminderEmail,
} = require("./lib/account-invite-email");
const { createAutoNotificationService } = require("./lib/auto-notifications");
const { createAdminMailStore } = require("./lib/admin-mail-store");
const {
  createAdminGoogleMailClient,
  createAdminGoogleMailIntegration,
} = require("./lib/admin-google-mail");
const { createAccountRequestHandler } = require("./lib/account/handlers");
const { createAccountRenderers } = require("./lib/account/render");
const { createApiHandlers } = require("./lib/api/handlers");
const { createAdminDomainHelpers } = require("./lib/admin/domain");
const { createAdminRequestHandler } = require("./lib/admin/handlers");
const { createAdminPageRenderers } = require("./lib/admin/render-pages");
const { createAdminSharedRenderers } = require("./lib/admin/render-shared");
const {
  createAdminGoogleCalendarClient,
  createAdminGoogleCalendarIntegration,
} = require("./lib/admin-google-calendar");
const { createRequestHelpers } = require("./lib/http/request");
const { createTimingHelpers } = require("./lib/http/timing");
const { createSiteStaticHelpers } = require("./lib/site/assets");
const { BLOG_ARTICLES } = require("./lib/site/blog-articles");
const { createSiteRequestHandler, loadSiteRoutes } = require("./lib/site/request-handler");
const { createSiteSanitizer } = require("./lib/site/sanitize");
const { createSiteSeoHelpers } = require("./lib/site/seo");
const {
  ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
  createOrderPolicyAcceptanceService,
} = require("./lib/order-policy");
const {
  createQuoteOpsStore: createQuoteOpsStoreModule,
  filterQuoteOpsEntries: filterQuoteOpsEntriesModule,
} = require("./lib/quote-ops/store");
const {
  createBufferedLogger,
  createEventLoopStats,
  createRequestPerfWindow,
  getMemoryUsageSnapshot,
  getPerfAlertReasons,
} = require("./lib/runtime/perf");
const { createAdminOrderMediaStorage } = require("./lib/admin-order-media-storage");
let createSupabaseQuoteOpsClient;
let loadSupabaseQuoteOpsConfig;
try {
  ({ createSupabaseQuoteOpsClient, loadSupabaseQuoteOpsConfig } = require("./lib/supabase-quote-ops"));
} catch (error) {
  createSupabaseQuoteOpsClient = null;
  loadSupabaseQuoteOpsConfig = null;
}
let createSupabaseAdminStaffClient;
try {
  ({ createSupabaseAdminStaffClient } = require("./lib/supabase-admin-staff"));
} catch (error) {
  createSupabaseAdminStaffClient = null;
}
let createSupabaseAdminUsersClient;
try {
  ({ createSupabaseAdminUsersClient } = require("./lib/supabase-admin-users"));
} catch (error) {
  createSupabaseAdminUsersClient = null;
}
let createSupabaseAdminMailClient;
try {
  ({ createSupabaseAdminMailClient } = require("./lib/supabase-admin-mail"));
} catch (error) {
  createSupabaseAdminMailClient = null;
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
const { USER_ROLE_VALUES, USER_STATUS_VALUES, createAdminUsersStore } = require("./lib/admin-users-store");
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
const ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH = "/admin/staff/contract";
const ADMIN_STAFF_W9_DOWNLOAD_PATH = "/admin/staff/w9";
const ADMIN_STAFF_GOOGLE_CONNECT_PATH = "/admin/staff/google/connect";
const ADMIN_GOOGLE_MAIL_CONNECT_PATH = "/admin/google-mail/connect";
const ADMIN_SETTINGS_PATH = "/admin/settings";
const ADMIN_QUOTE_OPS_PATH = "/admin/quote-ops";
const ADMIN_QUOTE_OPS_RETRY_PATH = "/admin/quote-ops/retry";
const ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH = "/admin/google-calendar/callback";
const ADMIN_GOOGLE_MAIL_CALLBACK_PATH = "/admin/google-mail/callback";
const ADMIN_INTEGRATIONS_PATH = "/admin/integrations";
const ADMIN_RUNTIME_PATH = "/admin/runtime";
const ADMIN_SESSION_COOKIE = "shynli_admin_session";
const ADMIN_CHALLENGE_COOKIE = "shynli_admin_challenge";
const ACCOUNT_ROOT_PATH = "/account";
const ACCOUNT_CONTRACT_DOWNLOAD_PATH = "/account/contract";
const ACCOUNT_W9_DOWNLOAD_PATH = "/account/w9";
const ACCOUNT_LOGIN_PATH = "/account/login";
const ACCOUNT_LOGOUT_PATH = "/account/logout";
const ACCOUNT_VERIFY_EMAIL_PATH = "/account/verify-email";
const USER_PASSWORD_SETUP_COOKIE = "shynli_user_password_setup";
const USER_SESSION_COOKIE = "shynli_user_session";
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
  ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
  ADMIN_STAFF_W9_DOWNLOAD_PATH,
  ADMIN_STAFF_GOOGLE_CONNECT_PATH,
  ADMIN_GOOGLE_MAIL_CONNECT_PATH,
  ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
  ADMIN_GOOGLE_MAIL_CALLBACK_PATH,
  ADMIN_QUOTE_OPS_RETRY_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_2FA_PATH,
  ADMIN_LOGOUT_PATH,
]);
const ACCOUNT_ALL_ROUTES = new Set([
  ACCOUNT_ROOT_PATH,
  ACCOUNT_CONTRACT_DOWNLOAD_PATH,
  ACCOUNT_W9_DOWNLOAD_PATH,
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_LOGOUT_PATH,
  ACCOUNT_VERIFY_EMAIL_PATH,
]);
const ADMIN_APP_NAV_ITEMS = Object.freeze([
  {
    path: ADMIN_ROOT_PATH,
    label: "Обзор",
  },
  {
    path: ADMIN_QUOTE_OPS_PATH,
    label: "Заявки",
  },
  {
    path: ADMIN_ORDERS_PATH,
    label: "Заказы",
  },
  {
    path: ADMIN_CLIENTS_PATH,
    label: "Клиенты",
  },
  {
    path: ADMIN_STAFF_PATH,
    label: "Сотрудники",
  },
  {
    path: ADMIN_SETTINGS_PATH,
    label: "Настройки",
  },
]);
const ORDER_STATUS_VALUES = new Set(["new", "scheduled", "in-progress", "completed", "canceled", "rescheduled"]);
const ORDER_FREQUENCY_VALUES = new Set(["weekly", "biweekly", "monthly"]);
const ORDER_ASSIGNMENT_VALUES = new Set(["all", "assigned", "unassigned"]);
const QUOTE_PUBLIC_PATH = "/quote";
const QUOTE_V2_PUBLIC_PATH = "/quote2";
const QUOTE_PUBLIC_PATHS = new Set([QUOTE_PUBLIC_PATH, QUOTE_V2_PUBLIC_PATH]);
const REDIRECT_ROUTES = new Map([
  ["/home-simple", "/"],
  ["/действуй", "/quote"],
  [QUOTE_V2_PUBLIC_PATH, QUOTE_PUBLIC_PATH],
  ["/admin/setup", ADMIN_ROOT_PATH],
  ["/admin/users", ADMIN_ROOT_PATH],
  [ADMIN_INTEGRATIONS_PATH, ADMIN_ROOT_PATH],
  [ADMIN_RUNTIME_PATH, ADMIN_ROOT_PATH],
]);
const SITE_ORIGIN = normalizeConfiguredOrigin(
  process.env.PUBLIC_SITE_ORIGIN || process.env.SITE_BASE_URL || "https://shynlicleaningservice.com"
);
const BLOG_CATEGORY_PAGES = Object.freeze([
  {
    path: "/blog/checklists",
    label: "Checklists",
    title: "Home Cleaning Checklists & Room-by-Room Guides | SHYNLI Blog",
    description:
      "Practical home cleaning checklists for kitchens, bathrooms, recurring resets, move-out prep, and seasonal routines.",
    ogTitle: "Home Cleaning Checklists & Room-by-Room Guides | SHYNLI Blog",
    ogDescription:
      "Practical home cleaning checklists for kitchens, bathrooms, recurring resets, move-out prep, and seasonal routines.",
  },
  {
    path: "/blog/whats-included",
    label: "What's Included",
    title: "What’s Included in House Cleaning? | SHYNLI Blog",
    description:
      "Clear guides on what is included in regular cleaning, deep cleaning, move-out cleaning, and turnover service.",
    ogTitle: "What’s Included in House Cleaning? | SHYNLI Blog",
    ogDescription:
      "Clear guides on what is included in regular cleaning, deep cleaning, move-out cleaning, and turnover service.",
  },
  {
    path: "/blog/services",
    label: "Services",
    title: "House Cleaning Services Explained | SHYNLI Blog",
    description:
      "Compare house cleaning services, understand when each one fits best, and choose the right service for your home.",
    ogTitle: "House Cleaning Services Explained | SHYNLI Blog",
    ogDescription:
      "Compare house cleaning services, understand when each one fits best, and choose the right service for your home.",
  },
  {
    path: "/blog/bathroom",
    label: "Bathroom",
    title: "Bathroom Cleaning Guides, Tips & Checklists | SHYNLI Blog",
    description:
      "Bathroom cleaning guides for soap scum, mirrors, grout, fixtures, weekly upkeep, and deep-clean bathroom resets.",
    ogTitle: "Bathroom Cleaning Guides, Tips & Checklists | SHYNLI Blog",
    ogDescription:
      "Bathroom cleaning guides for soap scum, mirrors, grout, fixtures, weekly upkeep, and deep-clean bathroom resets.",
  },
  {
    path: "/blog/kitchen",
    label: "Kitchen",
    title: "Kitchen Cleaning Guides, Tips & Checklists | SHYNLI Blog",
    description:
      "Kitchen cleaning guides for counters, sinks, cabinets, appliances, grease buildup, and routine kitchen maintenance.",
    ogTitle: "Kitchen Cleaning Guides, Tips & Checklists | SHYNLI Blog",
    ogDescription:
      "Kitchen cleaning guides for counters, sinks, cabinets, appliances, grease buildup, and routine kitchen maintenance.",
  },
  {
    path: "/blog/floors",
    label: "Floors",
    title: "Floor Cleaning Guides for Hardwood, Tile & More | SHYNLI Blog",
    description:
      "Floor cleaning advice for hardwood, tile, vinyl, dust buildup, mopping frequency, and home traffic patterns.",
    ogTitle: "Floor Cleaning Guides for Hardwood, Tile & More | SHYNLI Blog",
    ogDescription:
      "Floor cleaning advice for hardwood, tile, vinyl, dust buildup, mopping frequency, and home traffic patterns.",
  },
  {
    path: "/blog/dust",
    label: "Dust",
    title: "Dusting Guides, Routines & Cleaning Tips | SHYNLI Blog",
    description:
      "Dusting guides for shelves, baseboards, blinds, vents, high surfaces, and routines that keep homes feeling cleaner.",
    ogTitle: "Dusting Guides, Routines & Cleaning Tips | SHYNLI Blog",
    ogDescription:
      "Dusting guides for shelves, baseboards, blinds, vents, high surfaces, and routines that keep homes feeling cleaner.",
  },
  {
    path: "/blog/pet-hair",
    label: "Pet Hair",
    title: "Pet Hair Cleaning Tips & Home Maintenance Guides | SHYNLI Blog",
    description:
      "Pet hair cleaning tips for floors, furniture, corners, recurring upkeep, and keeping a home guest-ready.",
    ogTitle: "Pet Hair Cleaning Tips & Home Maintenance Guides | SHYNLI Blog",
    ogDescription:
      "Pet hair cleaning tips for floors, furniture, corners, recurring upkeep, and keeping a home guest-ready.",
  },
  {
    path: "/blog/move-in-move-out",
    label: "Move-in / Move-out",
    title: "Move-In & Move-Out Cleaning Guides | SHYNLI Blog",
    description:
      "Move-in and move-out cleaning guides for empty homes, landlord expectations, deposits, turnovers, and final walkthrough prep.",
    ogTitle: "Move-In & Move-Out Cleaning Guides | SHYNLI Blog",
    ogDescription:
      "Move-in and move-out cleaning guides for empty homes, landlord expectations, deposits, turnovers, and final walkthrough prep.",
  },
  {
    path: "/blog/airbnb",
    label: "Airbnb",
    title: "Airbnb Cleaning Guides & Turnover Tips | SHYNLI Blog",
    description:
      "Airbnb cleaning guides for turnover speed, guest-ready presentation, restocking rhythm, and short-term rental upkeep.",
    ogTitle: "Airbnb Cleaning Guides & Turnover Tips | SHYNLI Blog",
    ogDescription:
      "Airbnb cleaning guides for turnover speed, guest-ready presentation, restocking rhythm, and short-term rental upkeep.",
  },
  {
    path: "/blog/seasonal",
    label: "Seasonal",
    title: "Seasonal Cleaning Guides for Spring, Holidays & More | SHYNLI Blog",
    description:
      "Seasonal cleaning guides for spring resets, holiday prep, weather changes, and deeper home maintenance moments.",
    ogTitle: "Seasonal Cleaning Guides for Spring, Holidays & More | SHYNLI Blog",
    ogDescription:
      "Seasonal cleaning guides for spring resets, holiday prep, weather changes, and deeper home maintenance moments.",
  },
  {
    path: "/blog/cleaning-hacks",
    label: "Cleaning Hacks",
    title: "Cleaning Hacks, Time-Saving Tips & Shortcuts | SHYNLI Blog",
    description:
      "Cleaning hacks and practical shortcuts for busy homes that need faster resets, better routines, and less backtracking.",
    ogTitle: "Cleaning Hacks, Time-Saving Tips & Shortcuts | SHYNLI Blog",
    ogDescription:
      "Cleaning hacks and practical shortcuts for busy homes that need faster resets, better routines, and less backtracking.",
  },
]);
const BLOG_ARTICLE_PAGES = Object.freeze(
  BLOG_ARTICLES.map((article) => ({
    path: article.path,
    label: article.title,
    title: article.metaTitle || article.title,
    description: article.description || article.excerpt || "",
    ogTitle: article.ogTitle || article.metaTitle || article.title,
    ogDescription: article.ogDescription || article.description || article.excerpt || "",
  }))
);
const BLOG_ROUTE_HTML_FILE = "page108872586.html";
const MANAGED_BLOG_HTML_ROUTES = Object.freeze([
  ["/blog", BLOG_ROUTE_HTML_FILE],
  ...BLOG_CATEGORY_PAGES.map((page) => [page.path, BLOG_ROUTE_HTML_FILE]),
  ...BLOG_ARTICLE_PAGES.map((page) => [page.path, BLOG_ROUTE_HTML_FILE]),
]);
const NOINDEX_ROUTES = new Set([
  "/home-calculator",
  "/oauth/callback",
  "/quote",
  "/quote2",
  ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
  ADMIN_GOOGLE_MAIL_CALLBACK_PATH,
]);
const BREADCRUMB_LABELS = new Map([
  ["/about-us", "About Us"],
  ["/blog", "Blog"],
  ...BLOG_CATEGORY_PAGES.map((page) => [page.path, page.label]),
  ...BLOG_ARTICLE_PAGES.map((page) => [page.path, page.label]),
  ["/cancellation-policy", "Cancellation Policy"],
  ["/contacts", "Contact Us"],
  ["/faq", "FAQ"],
  ["/home-calculator", "Home Calculator"],
  ["/oauth/callback", "OAuth Callback"],
  ["/pricing", "Pricing"],
  ["/privacy-policy", "Privacy Policy"],
  ["/quote", "Quote"],
  ["/quote2", "Quote"],
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
    title: "Request a Quote | Shynli Cleaning",
    description:
      "Get an instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning.",
    ogTitle: "Request a Quote | Shynli Cleaning",
    ogDescription:
      "Instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning.",
    canonical: `${SITE_ORIGIN}/quote`,
    robots: "noindex,nofollow",
  },
  "/quote2": {
    title: "Request a Quote | Shynli Cleaning",
    description:
      "Get an instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning.",
    ogTitle: "Request a Quote | Shynli Cleaning",
    ogDescription:
      "Instant cleaning quote with live pricing, scheduling, and secure checkout from Shynli Cleaning.",
    canonical: `${SITE_ORIGIN}/quote`,
    robots: "noindex,nofollow",
  },
  ...Object.fromEntries(
    BLOG_CATEGORY_PAGES.map((page) => [
      page.path,
      {
        title: page.title,
        description: page.description,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        canonical: `${SITE_ORIGIN}${page.path}`,
      },
    ])
  ),
  ...Object.fromEntries(
    BLOG_ARTICLE_PAGES.map((page) => [
      page.path,
      {
        title: page.title,
        description: page.description,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        canonical: `${SITE_ORIGIN}${page.path}`,
      },
    ])
  ),
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
const STRIPE_WEBHOOK_ENDPOINT = "/api/stripe/webhook";
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

const {
  redirectWithTiming,
  writeHeadWithTiming,
  writeHtmlWithTiming,
  writeJsonWithTiming,
} = createTimingHelpers({
  baseSecurityHeaders: BASE_SECURITY_HEADERS,
  getRequestDurationMs,
});

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function normalizeConfiguredOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getStripeReturnOrigin() {
  return SITE_ORIGIN;
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

const {
  clearCookie,
  getClientAddress,
  getFormValue,
  getFormValues,
  getRequestUrl,
  parseMultipartFormBody,
  parseCookies,
  parseFormBody,
  readBufferBody,
  readJsonBody,
  readTextBody,
  serializeCookie,
  shouldTrustProxyHeaders,
  shouldUseSecureCookies,
} = createRequestHelpers({
  MAX_JSON_BODY_BYTES,
  TRUST_PROXY_HEADERS,
  TRUSTED_PROXY_IPS,
  normalizeString,
});

const adminSharedRenderers = createAdminSharedRenderers({
  adminAuth,
  ADMIN_APP_NAV_ITEMS,
  ADMIN_LOGIN_PATH,
  ADMIN_2FA_PATH,
  ADMIN_LOGOUT_PATH,
  QUOTE_PUBLIC_PATH,
  escapeHtml,
  escapeHtmlAttribute,
  escapeHtmlText,
});

const {
  applyLeadEntryUpdates,
  applyClientEntryUpdates,
  applyOrderEntryUpdates,
  applyPaymentEntryUpdates,
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
  getEntryAdminLeadData,
  getEntryLeadTasks,
  getEntryOpenLeadTask,
  getEntryAdminOrderData,
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
} = createAdminDomainHelpers({
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
});

let usersStore = null;
let leadManagersStaffStore = null;
let autoNotificationService = null;

async function listLeadManagers() {
  if (!usersStore || typeof usersStore.getSnapshot !== "function") {
    return [];
  }

  const [usersSnapshot, staffSnapshot] = await Promise.all([
    usersStore.getSnapshot(),
    leadManagersStaffStore && typeof leadManagersStaffStore.getSnapshot === "function"
      ? leadManagersStaffStore.getSnapshot()
      : Promise.resolve({ staff: [] }),
  ]);

  const staffMetaById = new Map(
    (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
      .map((record) => [
        normalizeString(record && record.id, 120),
        {
          name: normalizeString(record && record.name, 200),
          phone: normalizeString(record && record.phone, 80),
        },
      ])
      .filter(([id]) => Boolean(id))
  );

  return (Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : [])
    .filter((user) => {
      const role = normalizeString(user && user.role, 32).toLowerCase();
      const status = normalizeString(user && user.status, 32).toLowerCase();
      return status === "active" && role === "manager";
    })
    .map((user) => {
      const id = normalizeString(user && user.id, 120);
      const email = normalizeString(user && user.email, 250).toLowerCase();
      const staffMeta = staffMetaById.get(normalizeString(user && user.staffId, 120)) || {};
      return {
        id,
        email,
        phone: normalizeString(staffMeta.phone || user.phone, 80),
        name: normalizeString(staffMeta.name, 200) || email || "Менеджер",
      };
    })
    .filter((manager) => Boolean(manager.id))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

const orderPolicyAcceptance = createOrderPolicyAcceptanceService({
  env: process.env,
  siteOrigin: SITE_ORIGIN,
  getAdminAuthState,
  hasAdminWorkspaceAccess: async (req) => {
    const adminState = getAdminAuthState(req);
    if (adminState && adminState.session) return true;
    if (!accountAuth || !usersStore) return false;

    const userAuthConfig =
      typeof accountAuth.loadUserAuthConfig === "function"
        ? accountAuth.loadUserAuthConfig(process.env)
        : { configured: false };
    if (!userAuthConfig || !userAuthConfig.configured) return false;

    const cookies = parseCookies(req && req.headers ? req.headers.cookie : "");
    const token = cookies[USER_SESSION_COOKIE];
    if (!token) return false;

    try {
      const session = accountAuth.verifyUserSessionToken(token, userAuthConfig);
      const user = await usersStore.getUserById(session.userId, { includeSecret: true });
      const role = normalizeString(user && user.role, 32).toLowerCase();
      return Boolean(
        user &&
        user.status === "active" &&
        (!user.emailVerificationRequired || user.emailVerifiedAt) &&
        (role === "admin" || role === "manager")
      );
    } catch {
      return false;
    }
  },
  getClientAddress,
  getRequestUrl,
  parseFormBody,
  readJsonBody,
  readTextBody,
  writeHeadWithTiming,
  writeHtmlWithTiming,
  writeJsonWithTiming,
});

const adminPageRenderers = createAdminPageRenderers({
  ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
  ADMIN_CLIENTS_PATH,
  ADMIN_INTEGRATIONS_PATH,
  ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
  ADMIN_GOOGLE_MAIL_CONNECT_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_ROOT_PATH,
  ADMIN_RUNTIME_PATH,
  ADMIN_SETTINGS_PATH,
  ADMIN_STAFF_PATH,
  ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
  ADMIN_STAFF_W9_DOWNLOAD_PATH,
  ADMIN_STAFF_GOOGLE_CONNECT_PATH,
  ADMIN_QUOTE_OPS_PATH,
  ADMIN_QUOTE_OPS_RETRY_PATH,
  ASSIGNMENT_STATUS_VALUES,
  GOOGLE_PLACES_API_KEY,
  QUOTE_OPS_LEDGER_LIMIT,
  QUOTE_PUBLIC_PATH,
  STAFF_STATUS_VALUES,
  USER_ROLE_VALUES,
  USER_STATUS_VALUES,
  buildAdminRedirectPath,
  buildOrdersReturnPath,
  buildQuoteOpsReturnPath,
  buildStaffPlanningContext,
  collectAdminClientRecords,
  collectAdminOrderRecords,
  countOrdersByStatus,
  escapeHtml,
  escapeHtmlAttribute,
  escapeHtmlText,
  filterAdminClientRecords,
  filterAdminOrderRecords,
  filterQuoteOpsEntries: (entries, filters) => filterQuoteOpsEntriesModule(entries, filters, normalizeString),
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
  getAdminClientsFilters,
  getEntryAdminLeadData,
  getEntryLeadTasks,
  getEntryOpenLeadTask,
  getOrdersFilters,
  getQuoteOpsFilters,
  getLeadStatus,
  isOrderCreatedEntry,
  getRequestUrl,
  normalizeLeadStatus,
  normalizeOrderStatus,
  normalizeString,
  renderAssignmentStatusBadge,
  renderStaffStatusBadge,
  shared: adminSharedRenderers,
});

const accountInviteEmail = {
  async getStatus() {
    return {
      configured: false,
      activeProvider: "",
      legacyConfigured: false,
      legacyProvider: "",
      legacyFromEmail: "",
      legacyReplyToEmail: "",
      googleConfigured: false,
      googleConnected: false,
      googleAccountEmail: "",
      googleLastError: "",
    };
  },
  async sendInvite() {
    throw new Error("ACCOUNT_INVITE_EMAIL_NOT_CONFIGURED");
  },
  async sendW9Reminder() {
    throw new Error("ACCOUNT_INVITE_EMAIL_NOT_CONFIGURED");
  },
  async sendOrderPolicyConfirmation() {
    throw new Error("ACCOUNT_INVITE_EMAIL_NOT_CONFIGURED");
  },
};

const handleAdminRequest = createAdminRequestHandler({
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_VERIFY_EMAIL_PATH,
  ADMIN_2FA_PATH,
  ADMIN_APP_ROUTES,
  ADMIN_CHALLENGE_COOKIE,
  ADMIN_CLIENTS_PATH,
  ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
  ADMIN_GOOGLE_MAIL_CALLBACK_PATH,
  ADMIN_GOOGLE_MAIL_CONNECT_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_LOGOUT_PATH,
  ACCOUNT_LOGOUT_PATH,
  ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_QUOTE_OPS_PATH,
  ADMIN_QUOTE_OPS_RETRY_PATH,
  ADMIN_ROOT_PATH,
  ADMIN_SESSION_COOKIE,
  ADMIN_SETTINGS_PATH,
  ADMIN_STAFF_PATH,
  ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
  ADMIN_STAFF_W9_DOWNLOAD_PATH,
  ADMIN_STAFF_GOOGLE_CONNECT_PATH,
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_ROOT_PATH,
  QUOTE_OPS_LEDGER_LIMIT,
  USER_SESSION_COOKIE,
  SITE_ORIGIN,
  adminAuth,
  accountAuth,
  adminLoginRateLimiter,
  accountInviteEmail,
  adminPageRenderers,
  adminSharedRenderers,
  adminTwoFactorRateLimiter,
  buildRecurringOrderSubmission,
  buildAdminQrMarkup,
  buildAdminRedirectPath,
  buildOrdersReturnPath,
  buildQuoteOpsReturnPath,
  clearCookie,
  collectAdminClientRecords,
  escapeHtml,
  filterQuoteOpsEntries: (entries, filters) => filterQuoteOpsEntriesModule(entries, filters, normalizeString),
  getAdminAuthState,
  getAdminCookieOptions,
  getClientAddress,
  getFormValue,
  getFormValues,
  getLeadConnectorClient,
  getRequestUrl,
  getEntryAdminOrderData,
  getEntryOpenLeadTask,
  getEntryOrderCompletionData,
  getEntryOrderPolicyAcceptanceData,
  getQuoteOpsFilters,
  getLeadStatus,
  getOrderStatus,
  formatAdminDateTime,
  normalizeLeadStatus,
  normalizeOrderStatus,
  normalizeString,
  orderPolicyAcceptance,
  parseMultipartFormBody,
  parseCookies,
  parseFormBody,
  readBufferBody,
  readJsonBody,
  readTextBody,
  redirectWithTiming,
  serializeCookie,
  shouldUseSecureCookies,
  writeHeadWithTiming,
  writeHtmlWithTiming,
  writeJsonWithTiming,
});

const accountRenderers = createAccountRenderers({
  ACCOUNT_CONTRACT_DOWNLOAD_PATH,
  ACCOUNT_W9_DOWNLOAD_PATH,
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_LOGOUT_PATH,
  ACCOUNT_ROOT_PATH,
  escapeHtml,
  escapeHtmlAttribute,
  escapeHtmlText,
  formatAdminDateTime,
  formatAdminServiceLabel,
  formatCurrencyAmount,
  formatOrderCountLabel,
  renderAssignmentStatusBadge,
  renderStaffStatusBadge,
  shared: adminSharedRenderers,
});

const handleAccountRequest = createAccountRequestHandler({
  ACCOUNT_CONTRACT_DOWNLOAD_PATH,
  ACCOUNT_W9_DOWNLOAD_PATH,
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_LOGOUT_PATH,
  ACCOUNT_ROOT_PATH,
  ACCOUNT_VERIFY_EMAIL_PATH,
  USER_PASSWORD_SETUP_COOKIE,
  USER_SESSION_COOKIE,
  USER_SESSION_TTL_SECONDS: accountAuth.USER_SESSION_TTL_SECONDS,
  adminAuth,
  accountAuth,
  accountRenderers,
  buildStaffPlanningContext,
  clearCookie,
  getFormValue,
  getRequestUrl,
  normalizeString,
  parseCookies,
  parseFormBody,
  readTextBody,
  redirectWithTiming,
  serializeCookie,
  shouldUseSecureCookies,
  writeHeadWithTiming,
  writeHtmlWithTiming,
});

const { handleQuoteSubmissionRequest, handleStripeCheckoutRequest, handleStripeWebhookRequest } = createApiHandlers({
  MAX_JSON_BODY_BYTES,
  QUOTE_PUBLIC_PATH,
  QUOTE_PUBLIC_PATHS,
  QUOTE_SUBMIT_ENDPOINT,
  SITE_ORIGIN,
  STRIPE_CHECKOUT_ENDPOINT,
  STRIPE_WEBHOOK_ENDPOINT,
  STRIPE_MAX_AMOUNT_CENTS,
  STRIPE_MIN_AMOUNT_CENTS,
  QuoteTokenError,
  calculateQuotePricing,
  createQuoteToken,
  enforcePostRateLimit,
  getAutoNotificationService: () => autoNotificationService,
  getLeadConnectorClient,
  listLeadManagers,
  getStripeClient,
  getStripeReturnOrigin,
  normalizeString,
  readBufferBody,
  readJsonBody,
  verifyQuoteToken,
  writeHeadWithTiming,
  writeJsonWithTiming,
});

function normalizeRoute(rawPath) {
  let value = rawPath || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const siteSeoHelpers = createSiteSeoHelpers({
  BREADCRUMB_LABELS,
  NOINDEX_ROUTES,
  ROUTE_META_OVERRIDES,
  SITE_ORIGIN,
  escapeHtmlAttribute,
  normalizeRoute,
});

const { sanitizeHtml } = createSiteSanitizer({
  GOOGLE_PLACES_API_KEY,
  normalizeRoute,
  siteSeoHelpers,
});

const siteStaticHelpers = createSiteStaticHelpers({
  CONTENT_TYPES,
  HTML_CACHE_WARM_MODE,
  IMAGE_EXTENSIONS,
  NEGOTIATED_IMAGE_VARY,
  NOINDEX_ROUTES,
  NOT_FOUND_PAGE,
  SITE_DIR,
  fs,
  fsp,
  path,
  sanitizeHtml,
  writeHeadWithTiming,
});

const handleSiteRequest = createSiteRequestHandler({
  ACCOUNT_ALL_ROUTES,
  ADMIN_ALL_ROUTES,
  ALERT_5XX_RATE,
  ALERT_EVENT_LOOP_P95_MS,
  ALERT_P95_MS,
  ALERT_P99_MS,
  PERF_ENDPOINT_ENABLED,
  PERF_ENDPOINT_TOKEN,
  PUBLIC_ASSET_DIRECTORIES,
  PUBLIC_ASSET_FILES,
  QUOTE_REQUEST_ENDPOINT,
  QUOTE_SUBMIT_ENDPOINT,
  REDIRECT_ROUTES,
  SITE_DIR,
  STRIPE_CHECKOUT_ENDPOINT,
  STRIPE_WEBHOOK_ENDPOINT,
  handleAccountRequest,
  handleAdminRequest,
  handleQuoteSubmissionRequest,
  handleStripeCheckoutRequest,
  handleStripeWebhookRequest,
  normalizeRoute,
  orderPolicyAcceptance,
  siteStaticHelpers,
  writeHeadWithTiming,
  writeJsonWithTiming,
});

async function main() {
  const requestLogger = createBufferedLogger({
    bufferLimit: REQUEST_LOG_BUFFER_LIMIT,
    flushIntervalMs: REQUEST_LOG_FLUSH_INTERVAL_MS,
  });
  const routes = await loadSiteRoutes({
    ROUTES_PATH,
    fsp,
    managedHtmlRoutes: MANAGED_BLOG_HTML_ROUTES,
    normalizeRoute,
  });
  const runtimeIndex = await siteStaticHelpers.buildRuntimeIndex(routes);
  requestLogger.log({
    ts: new Date().toISOString(),
    type: "startup_index_built",
    routes_count: Object.keys(routes).length,
    indexed_files: runtimeIndex.existingFiles.size,
    indexed_image_variant_sets: runtimeIndex.imageVariantsByOriginal.size,
    memory: getMemoryUsageSnapshot(roundNumber),
  });

  const { htmlCache, warmedCount } = await siteStaticHelpers.warmHtmlCache(runtimeIndex);
  requestLogger.log({
    ts: new Date().toISOString(),
    type: "startup_cache_warmed",
    warm_mode: HTML_CACHE_WARM_MODE,
    warmed_html_cache_entries: warmedCount,
    memory: getMemoryUsageSnapshot(roundNumber),
  });

  const requestPerfWindow = createRequestPerfWindow({
    maxSamples: PERF_MAX_SAMPLES,
    perfWindowMs: PERF_WINDOW_MS,
    roundNumber,
  });
  const eventLoopStats = createEventLoopStats({ roundNumber });
  const quoteOpsLedger = createQuoteOpsStoreModule({
    QUOTE_OPS_LEDGER_LIMIT,
    applyLeadEntryUpdates,
    applyClientEntryUpdates,
    applyOrderEntryUpdates,
    applyPaymentEntryUpdates,
    createSupabaseQuoteOpsClient,
    normalizeString,
  });
  const settingsStore = createAdminSettingsStore();
  usersStore = createAdminUsersStore({
    createSupabaseAdminUsersClient,
    env: process.env,
    fetch: global.fetch,
  });
  const mailStore = createAdminMailStore({
    createSupabaseAdminMailClient,
    env: process.env,
    fetch: global.fetch,
  });
  const staffStore = createAdminStaffStore({
    createSupabaseAdminStaffClient,
    env: process.env,
    fetch: global.fetch,
  });
  leadManagersStaffStore = staffStore;
  const orderMediaStorage = createAdminOrderMediaStorage({
    env: process.env,
    fetch: global.fetch,
  });
  const googleCalendarClient = createAdminGoogleCalendarClient({
    env: process.env,
    fetch: global.fetch,
    siteOrigin: SITE_ORIGIN,
  });
  const googleCalendarIntegration = createAdminGoogleCalendarIntegration({
    client: googleCalendarClient,
    quoteOpsLedger,
    staffStore,
    usersStore,
  });
  const googleMailClient = createAdminGoogleMailClient({
    env: process.env,
    fetch: global.fetch,
    siteOrigin: SITE_ORIGIN,
  });
  const googleMailIntegration = createAdminGoogleMailIntegration({
    client: googleMailClient,
    mailStore,
  });

  accountInviteEmail.getStatus = async function getStatus(config = {}) {
    const legacyConfig = loadAccountInviteEmailConfig(process.env);
    const googleStatus =
      googleMailIntegration && typeof googleMailIntegration.getStatus === "function"
        ? await googleMailIntegration.getStatus(config)
        : {
            configured: false,
            connected: false,
            provider: "",
            accountEmail: "",
            lastError: "",
            connection: null,
          };

    return {
      configured: Boolean(
        legacyConfig.configured || (googleStatus && googleStatus.connected)
      ),
      activeProvider: googleStatus && googleStatus.connected ? "google-mail" : legacyConfig.provider,
      legacyConfigured: legacyConfig.configured,
      legacyProvider: legacyConfig.provider,
      legacyFromEmail: legacyConfig.fromEmail || "",
      legacyReplyToEmail: legacyConfig.replyToEmail || "",
      googleConfigured: Boolean(googleStatus && googleStatus.configured),
      googleConnected: Boolean(googleStatus && googleStatus.connected),
      googleAccountEmail: googleStatus && googleStatus.accountEmail ? googleStatus.accountEmail : "",
      googleLastError: googleStatus && googleStatus.lastError ? googleStatus.lastError : "",
    };
  };

  accountInviteEmail.sendInvite = async function sendInvite(payload, config = {}) {
    const legacyConfig = loadAccountInviteEmailConfig(process.env);
    const googleStatus =
      googleMailIntegration && typeof googleMailIntegration.getStatus === "function"
        ? await googleMailIntegration.getStatus(config)
        : null;

    if (googleStatus && googleStatus.connected) {
      return googleMailIntegration.sendInviteEmail(payload, config, {
        fromEmail: legacyConfig.fromEmail || googleStatus.accountEmail,
        replyToEmail: legacyConfig.replyToEmail || "",
      });
    }

    return sendAccountInviteEmail({
      ...payload,
      env: process.env,
      fetch: global.fetch,
    });
  };

  accountInviteEmail.sendW9Reminder = async function sendW9Reminder(payload, config = {}) {
    const legacyConfig = loadAccountInviteEmailConfig(process.env);
    const googleStatus =
      googleMailIntegration && typeof googleMailIntegration.getStatus === "function"
        ? await googleMailIntegration.getStatus(config)
        : null;

    if (googleStatus && googleStatus.connected) {
      return googleMailIntegration.sendW9ReminderEmail(payload, config, {
        fromEmail: legacyConfig.fromEmail || googleStatus.accountEmail,
        replyToEmail: legacyConfig.replyToEmail || "",
      });
    }

    return sendStaffW9ReminderEmail({
      ...payload,
      env: process.env,
      fetch: global.fetch,
    });
  };

  accountInviteEmail.sendQuoteRequestConfirmation = async function sendQuoteRequestConfirmation(
    payload,
    config = {}
  ) {
    const legacyConfig = loadAccountInviteEmailConfig(process.env);
    const googleStatus =
      googleMailIntegration && typeof googleMailIntegration.getStatus === "function"
        ? await googleMailIntegration.getStatus(config)
        : null;

    if (googleStatus && googleStatus.connected) {
      return googleMailIntegration.sendQuoteRequestConfirmationEmail(payload, config, {
        fromEmail: legacyConfig.fromEmail || googleStatus.accountEmail,
        replyToEmail: legacyConfig.replyToEmail || "",
      });
    }

    return sendQuoteRequestConfirmationEmail({
      ...payload,
      env: process.env,
      fetch: global.fetch,
    });
  };

  accountInviteEmail.sendOrderPolicyConfirmation = async function sendOrderPolicyConfirmation(
    payload,
    config = {}
  ) {
    const legacyConfig = loadAccountInviteEmailConfig(process.env);
    const googleStatus =
      googleMailIntegration && typeof googleMailIntegration.getStatus === "function"
        ? await googleMailIntegration.getStatus(config)
        : null;

    if (googleStatus && googleStatus.connected) {
      return googleMailIntegration.sendOrderPolicyConfirmationEmail(payload, config, {
        fromEmail: legacyConfig.fromEmail || googleStatus.accountEmail,
        replyToEmail: legacyConfig.replyToEmail || "",
      });
    }

    return sendOrderPolicyConfirmationEmail({
      ...payload,
      env: process.env,
      fetch: global.fetch,
    });
  };

  autoNotificationService = createAutoNotificationService({
    accountInviteEmail,
    getLeadConnectorClient,
    getMailConfig: () =>
      adminAuth && typeof adminAuth.loadAdminConfig === "function"
        ? adminAuth.loadAdminConfig(process.env)
        : {},
    listLeadManagers,
    quoteOpsLedger,
    siteOrigin: SITE_ORIGIN,
    staffStore,
    log: (entry) => requestLogger.log(entry),
  });

  const autoNotificationSweepTimer = setInterval(() => {
    if (!autoNotificationService || typeof autoNotificationService.runClientReminderSweep !== "function") {
      return;
    }
    autoNotificationService.runClientReminderSweep().catch((error) => {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "auto_notification_sweep_error",
        message: normalizeString(error && error.message ? error.message : "Auto notification sweep failed.", 300),
      });
    });
  }, 5 * 60 * 1000);
  autoNotificationSweepTimer.unref();
  autoNotificationService.runClientReminderSweep().catch((error) => {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "auto_notification_bootstrap_error",
      message: normalizeString(error && error.message ? error.message : "Initial auto notification sweep failed.", 300),
    });
  });

  const perfSummaryTimer = setInterval(() => {
    const requestSnapshot = requestPerfWindow.snapshot();
    const eventLoopSnapshot = eventLoopStats.readSnapshot(true);
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "perf_summary",
      request: requestSnapshot,
      event_loop: eventLoopSnapshot,
    });

    const reasons = getPerfAlertReasons(requestSnapshot, eventLoopSnapshot, {
      alert5xxRate: ALERT_5XX_RATE,
      alertEventLoopP95Ms: ALERT_EVENT_LOOP_P95_MS,
      alertP95Ms: ALERT_P95_MS,
      alertP99Ms: ALERT_P99_MS,
    });
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

    await handleSiteRequest(req, res, requestStartNs, requestContext, requestLogger, {
      autoNotificationService,
      eventLoopStats,
      googleMailIntegration,
      htmlCache,
      googleCalendarIntegration,
      quoteOpsLedger,
      requestPerfWindow,
      runtimeIndex,
      usersStore,
      settingsStore,
      staffStore,
      orderMediaStorage,
      accountInviteEmail,
    });
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(autoNotificationSweepTimer);
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
      memory: getMemoryUsageSnapshot(roundNumber),
    });
  });
  process.on("uncaughtException", (error) => {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "uncaught_exception",
      error: error && error.stack ? error.stack : String(error),
      memory: getMemoryUsageSnapshot(roundNumber),
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
      memory: getMemoryUsageSnapshot(roundNumber),
    });
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
