"use strict";

const path = require("path");
const { URL } = require("url");

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
    QUOTE_REQUEST_ENDPOINT,
    QUOTE_SUBMIT_ENDPOINT,
    REDIRECT_ROUTES,
    SITE_DIR,
    STRIPE_CHECKOUT_ENDPOINT,
    handleAccountRequest,
    handleAdminRequest,
    handleQuoteSubmissionRequest,
    handleStripeCheckoutRequest,
    normalizeRoute,
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

  return async function handleSiteRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger,
    runtime = {}
  ) {
    const {
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
      accountInviteEmail,
    } = runtime;

    let normalizedPath = requestContext.route || "/";

    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(reqUrl.pathname);
      normalizedPath = normalizeRoute(pathname);
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
          accountInviteEmail,
        }, quoteOpsLedger, settingsStore, staffStore);
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
  const { ROUTES_PATH, fsp, normalizeRoute } = deps;
  const raw = await fsp.readFile(ROUTES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = {};
  for (const [route, file] of Object.entries(parsed)) {
    normalized[normalizeRoute(route)] = file;
  }
  return normalized;
}

module.exports = {
  createSiteRequestHandler,
  loadSiteRoutes,
};
