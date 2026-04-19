"use strict";

const path = require("path");
const { URL } = require("url");

function normalizeSitemapLastmod(value) {
  if (!value && value !== 0) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const stringValue = String(value || "").trim();
  if (!stringValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return `${stringValue}T00:00:00.000Z`;
  }
  const parsed = Date.parse(stringValue);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return "";
}

function escapeSitemapXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSitemapXml(options = {}) {
  const {
    siteOrigin,
    routeFileByPath,
    fileMetaByPath,
    excludedRoutes = new Set(),
    lastmodOverrides = new Map(),
  } = options;

  const normalizedOrigin = String(siteOrigin || "").trim().replace(/\/+$/, "");
  if (!normalizedOrigin) {
    throw new Error("Sitemap origin is required.");
  }

  const excluded =
    excludedRoutes instanceof Set ? excludedRoutes : new Set(Array.isArray(excludedRoutes) ? excludedRoutes : []);
  const lastmodMap =
    lastmodOverrides instanceof Map ? lastmodOverrides : new Map(Object.entries(lastmodOverrides || {}));
  const routeEntries = [];
  const seen = new Set();

  for (const [routePath, filePath] of routeFileByPath || []) {
    const normalizedRoute = String(routePath || "").trim();
    if (!normalizedRoute || !normalizedRoute.startsWith("/")) continue;
    if (normalizedRoute.startsWith("/api/")) continue;
    if (normalizedRoute.startsWith("/admin")) continue;
    if (normalizedRoute.startsWith("/account")) continue;
    if (excluded.has(normalizedRoute)) continue;
    if (seen.has(normalizedRoute)) continue;
    seen.add(normalizedRoute);
    routeEntries.push({ routePath: normalizedRoute, filePath });
  }

  routeEntries.sort((left, right) => left.routePath.localeCompare(right.routePath));

  const body = routeEntries
    .map(({ routePath, filePath }) => {
      const loc = `${normalizedOrigin}${routePath === "/" ? "" : routePath}`;
      const overrideLastmod = normalizeSitemapLastmod(lastmodMap.get(routePath));
      const fileMeta = fileMetaByPath && filePath ? fileMetaByPath.get(filePath) : null;
      const fallbackLastmod = normalizeSitemapLastmod(fileMeta?.mtimeMs || fileMeta?.lastModified || "");
      const lastmod = overrideLastmod || fallbackLastmod;
      return `  <url>\n    <loc>${escapeSitemapXml(loc)}</loc>${
        lastmod ? `\n    <lastmod>${escapeSitemapXml(lastmod)}</lastmod>` : ""
      }\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function createSiteRequestHandler(deps = {}) {
  const {
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
    SITE_ORIGIN,
    SITEMAP_EXCLUDED_ROUTES,
    SITEMAP_LASTMOD_OVERRIDES,
    GHL_INBOUND_SMS_WEBHOOK_ENDPOINT,
    QUOTE_REQUEST_ENDPOINT,
    QUOTE_SUBMIT_ENDPOINT,
    REDIRECT_ROUTES,
    SITE_DIR,
    STRIPE_CHECKOUT_ENDPOINT,
    STRIPE_WEBHOOK_ENDPOINT,
    handleGhlInboundSmsWebhookRequest,
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
  } = deps;

  function canAccessPerfEndpoint(req) {
    if (!PERF_ENDPOINT_ENABLED || !PERF_ENDPOINT_TOKEN) return false;
    return String(req.headers["x-perf-token"] || "").trim() === PERF_ENDPOINT_TOKEN;
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

  function appendSearchToLocation(location, search) {
    const normalizedLocation = String(location || "");
    const normalizedSearch = String(search || "");
    if (!normalizedSearch) return normalizedLocation;
    if (!normalizedLocation || normalizedLocation.includes("#")) return normalizedLocation;
    return `${normalizedLocation}${normalizedLocation.includes("?") ? "&" : "?"}${normalizedSearch.replace(/^\?/, "")}`;
  }

  return async function handleSiteRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger,
    runtime = {}
  ) {
    const {
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
    } = runtime;

    let normalizedPath = requestContext.route || "/";

    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(reqUrl.pathname);
      normalizedPath = normalizeRoute(pathname);
      requestContext.route = normalizedPath;

      const redirectTarget =
        appendSearchToLocation(REDIRECT_ROUTES.get(normalizedPath), reqUrl.search) ||
        (pathname.length > 1 && pathname.endsWith("/") && runtimeIndex.routeFileByPath.has(normalizedPath)
          ? appendSearchToLocation(normalizedPath, reqUrl.search)
          : "");
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
        orderPolicyAcceptance &&
        typeof orderPolicyAcceptance.isHandledRoute === "function" &&
        orderPolicyAcceptance.isHandledRoute(normalizedPath)
      ) {
        const handled = await orderPolicyAcceptance.handleRequest(
          req,
          res,
          requestStartNs,
          requestContext,
          quoteOpsLedger
        );
        if (handled) {
          return;
        }
      }

      if (ACCOUNT_ALL_ROUTES.has(normalizedPath)) {
        await handleAccountRequest(
          req,
          res,
          requestStartNs,
          requestContext,
          requestLogger,
          {
            requestPerfWindow,
            eventLoopStats,
            usersStore,
            staffStore,
          },
          quoteOpsLedger,
          staffStore,
          usersStore
        );
        return;
      }

      if (ADMIN_ALL_ROUTES.has(normalizedPath)) {
        await handleAdminRequest(req, res, requestStartNs, requestContext, requestLogger, {
          requestPerfWindow,
          eventLoopStats,
          googleCalendarIntegration,
          googleMailIntegration,
          usersStore,
          settingsStore,
          staffStore,
          orderMediaStorage,
          accountInviteEmail,
          autoNotificationService,
        }, quoteOpsLedger, settingsStore, staffStore);
        return;
      }

      if (normalizedPath === STRIPE_CHECKOUT_ENDPOINT) {
        await handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger);
        return;
      }

      if (normalizedPath === STRIPE_WEBHOOK_ENDPOINT) {
        await handleStripeWebhookRequest(
          req,
          res,
          requestStartNs,
          requestContext,
          requestLogger,
          quoteOpsLedger
        );
        return;
      }

      if (normalizedPath === GHL_INBOUND_SMS_WEBHOOK_ENDPOINT) {
        await handleGhlInboundSmsWebhookRequest(
          req,
          res,
          requestStartNs,
          requestContext,
          requestLogger,
          quoteOpsLedger,
          staffStore
        );
        return;
      }

      if (normalizedPath === QUOTE_REQUEST_ENDPOINT || normalizedPath === QUOTE_SUBMIT_ENDPOINT) {
        await handleQuoteSubmissionRequest(req, res, requestStartNs, requestContext, requestLogger, quoteOpsLedger);
        return;
      }

      if (normalizedPath === "/sitemap.xml") {
        const sitemapXml = buildSitemapXml({
          siteOrigin: SITE_ORIGIN,
          routeFileByPath: runtimeIndex.routeFileByPath,
          fileMetaByPath: runtimeIndex.fileMetaByPath,
          excludedRoutes: SITEMAP_EXCLUDED_ROUTES,
          lastmodOverrides: SITEMAP_LASTMOD_OVERRIDES,
        });
        requestContext.cacheHit = false;
        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(sitemapXml);
        return;
      }

      const directAssetPath = siteStaticHelpers.resolveSitePath(pathname);
      if (
        pathname !== "/" &&
        isPublicDirectAssetPath(pathname) &&
        siteStaticHelpers.isSafePath(SITE_DIR, directAssetPath) &&
        runtimeIndex.existingFiles.has(directAssetPath)
      ) {
        await siteStaticHelpers.sendFile(
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
        await siteStaticHelpers.sendFile(
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
        await siteStaticHelpers.sendFile(
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
  };
}

async function loadSiteRoutes(deps = {}) {
  const { ROUTES_PATH, fsp, normalizeRoute, managedHtmlRoutes = [] } = deps;
  const raw = await fsp.readFile(ROUTES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = {};
  for (const [route, file] of Object.entries(parsed)) {
    normalized[normalizeRoute(route)] = file;
  }
  for (const [route, file] of managedHtmlRoutes) {
    if (!route || !file) continue;
    normalized[normalizeRoute(route)] = file;
  }
  return normalized;
}

module.exports = {
  buildSitemapXml,
  createSiteRequestHandler,
  loadSiteRoutes,
};
