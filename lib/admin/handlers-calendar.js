"use strict";

function createAdminCalendarHandlers(deps = {}) {
  const {
    ACCOUNT_ROOT_PATH,
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    adminSharedRenderers,
    buildStaffRedirect,
    ensureWorkspaceAccess,
    normalizeString,
    redirectWithTiming,
    writeHtmlWithTiming,
  } = deps;

  function buildAccountRedirect(notice = "") {
    const reqUrl = new URL(ACCOUNT_ROOT_PATH || "/account", "http://localhost");
    if (notice) reqUrl.searchParams.set("notice", notice);
    return `${reqUrl.pathname}${reqUrl.search}`;
  }

  async function handleCalendarConnectRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      config,
      currentUserAccess,
      challenge,
      staffStore,
      googleCalendarIntegration,
    } = context;

    if (req.method !== "GET") {
      writeHtmlWithTiming(
        res,
        405,
        adminSharedRenderers.renderAdminLayout(
          "Метод не поддерживается",
          `<div class="admin-alert admin-alert-error">Подключение Google Calendar открывается только через GET.</div>`
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireWrite: true,
      })
    ) {
      return true;
    }

    if (
      !googleCalendarIntegration ||
      typeof googleCalendarIntegration.buildConnectUrl !== "function" ||
      !googleCalendarIntegration.isConfigured()
    ) {
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-unavailable"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const reqUrl = new URL(req.url || ADMIN_STAFF_GOOGLE_CONNECT_PATH, "http://localhost");
    const staffId = normalizeString(reqUrl.searchParams.get("staffId"), 120);
    if (!staffId) {
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-connect-failed"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const snapshot =
      staffStore && typeof staffStore.getSnapshot === "function"
        ? await staffStore.getSnapshot()
        : { staff: [] };
    const staffRecord = Array.isArray(snapshot.staff)
      ? snapshot.staff.find((record) => record.id === staffId)
      : null;
    if (!staffRecord) {
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-connect-failed"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    try {
      const connectUrl = await googleCalendarIntegration.buildConnectUrl(
        staffId,
        config,
        staffRecord.email
      );
      redirectWithTiming(res, 303, connectUrl, requestStartNs, requestContext.cacheHit);
      return true;
    } catch {
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-connect-failed"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }
  }

  async function handleCalendarCallbackRoute(context = {}) {
    const { req, res, requestStartNs, requestContext, config, googleCalendarIntegration } = context;

    if (req.method !== "GET") {
      writeHtmlWithTiming(
        res,
        405,
        adminSharedRenderers.renderAdminLayout(
          "Метод не поддерживается",
          `<div class="admin-alert admin-alert-error">Google Calendar callback принимает только GET.</div>`
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const reqUrl = new URL(req.url || ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH, "http://localhost");
    const accessDenied = normalizeString(reqUrl.searchParams.get("error"), 120);
    const code = normalizeString(reqUrl.searchParams.get("code"), 4000);
    const state = normalizeString(reqUrl.searchParams.get("state"), 6000);

    if (accessDenied) {
      let deniedSource = "admin";
      if (googleCalendarIntegration && typeof googleCalendarIntegration.readOAuthStateSource === "function" && state) {
        try {
          deniedSource = await googleCalendarIntegration.readOAuthStateSource({ state, config });
        } catch {}
      }
      redirectWithTiming(
        res,
        303,
        deniedSource === "account"
          ? buildAccountRedirect("calendar-connect-denied")
          : buildStaffRedirect("calendar-connect-denied"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (
      !googleCalendarIntegration ||
      typeof googleCalendarIntegration.handleOAuthCallback !== "function" ||
      !googleCalendarIntegration.isConfigured() ||
      !code ||
      !state
    ) {
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-connect-failed"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    try {
      const callbackResult = await googleCalendarIntegration.handleOAuthCallback({
        code,
        state,
        config,
      });
      const callbackSource =
        callbackResult && callbackResult.source === "account" ? "account" : "admin";
      redirectWithTiming(
        res,
        303,
        callbackSource === "account"
          ? buildAccountRedirect("calendar-connected")
          : buildStaffRedirect("calendar-connected"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    } catch {
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-connect-failed"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }
  }

  async function handleCalendarRoutes(context = {}) {
    const route = context && context.requestContext ? context.requestContext.route : "";

    if (route === ADMIN_STAFF_GOOGLE_CONNECT_PATH) {
      return handleCalendarConnectRoute(context);
    }

    if (route === ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH) {
      return handleCalendarCallbackRoute(context);
    }

    return false;
  }

  return {
    handleCalendarRoutes,
  };
}

module.exports = {
  createAdminCalendarHandlers,
};
