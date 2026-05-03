"use strict";

const { getEntryOrderState, hasEntryOrderState } = require("../admin-order-state");
const { createAdminClientsHandlers } = require("./handlers-clients");
const { createAdminAuthHandlers } = require("./handlers-auth");
const { createAdminCalendarHandlers } = require("./handlers-calendar");
const { createAdminMessagesHandlers } = require("./handlers-messages");
const { createAdminOrdersHandlers } = require("./handlers-orders");
const { createAdminPayrollHandlers } = require("./handlers-payroll");
const { createAdminQuoteOpsHandlers } = require("./handlers-quote-ops");
const { createAdminResponseHelpers } = require("./handlers-response-helpers");
const { createAdminSettingsRouteHandlers } = require("./handlers-settings-routes");
const { createAdminSmsHelpers } = require("./handlers-sms-helpers");
const { createAdminStaffDocumentHandlers } = require("./handlers-staff-documents");
const { createAdminStaffHandlers } = require("./handlers-staff");
const { createAdminWorkspaceHelpers } = require("./handlers-workspace-helpers");

function createAdminRequestHandler(deps = {}) {
  const {
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_LOGOUT_PATH,
    ACCOUNT_ROOT_PATH,
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
    ADMIN_MESSAGES_PATH,
    ADMIN_ORDERS_PATH,
    ADMIN_PAYROLL_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_SESSION_COOKIE,
    ADMIN_SETTINGS_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    USER_SESSION_COOKIE,
    SITE_ORIGIN,
    adminAuth,
    accountAuth,
    accountInviteEmail,
    adminLoginRateLimiter,
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
    getAdminAuthState,
    getAdminCookieOptions,
    getClientAddress,
    getFormValue,
    getFormValues,
    getLeadConnectorClient,
    getRequestUrl,
    getEntryOpenLeadTask,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getLeadStatus,
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
    staffTravelEstimateService,
    writeHeadWithTiming,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  } = deps;
  const CLIENT_MUTATION_LEDGER_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 160);

  const {
    buildAdminSessionRefreshHeaders,
    buildCurrentUserAccess,
    handleAuthRoute,
    redirectUnauthorizedAdminAccess,
    resolvePortalUserSession,
  } = createAdminAuthHandlers({
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_LOGOUT_PATH,
    ACCOUNT_ROOT_PATH,
    ADMIN_2FA_PATH,
    ADMIN_CHALLENGE_COOKIE,
    ADMIN_LOGIN_PATH,
    ADMIN_LOGOUT_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_SESSION_COOKIE,
    USER_SESSION_COOKIE,
    accountAuth,
    adminAuth,
    adminLoginRateLimiter,
    adminSharedRenderers,
    adminTwoFactorRateLimiter,
    buildAdminQrMarkup,
    clearCookie,
    escapeHtml,
    getAdminCookieOptions,
    getClientAddress,
    getFormValue,
    normalizeString,
    parseCookies,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    serializeCookie,
    shouldUseSecureCookies,
    writeHtmlWithTiming,
  });

  const {
    ensureWorkspaceAccess,
    isAjaxMutationRequest,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = createAdminResponseHelpers({
    adminSharedRenderers,
    escapeHtml,
    normalizeString,
    redirectUnauthorizedAdminAccess,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  });

  const {
    buildClientsReturnPath,
    buildLeadMutationPayload,
    buildManualOrderRequestId,
    buildOrderCompletionMutationPayload,
    buildOrdersRedirect,
    buildOrderStageMutationPayload,
    buildStaffRedirect,
    buildStaffReturnPath,
    collectNonAssignableStaffIds,
    formatManualOrderServiceLabel,
    formatWorkspaceRoleLabel,
    getOrderStatusFromEntry,
    isAdminWorkspaceRole,
    isEmployeeLinkedUser,
    normalizeAdminPhoneInput,
    normalizeManualOrderFrequency,
    normalizeManualOrderServiceType,
    normalizeWorkspaceRoleValue,
    resolveAssignableStaffIdsByNames,
    resolveLeadManagerRecord,
    resolveLeadTaskAssigneeRecord,
    resolveLinkedStaff,
    resolveLinkedUser,
    resolveUserEmployeeFlag,
  } = createAdminWorkspaceHelpers({
    ADMIN_CLIENTS_PATH,
    ADMIN_STAFF_PATH,
    buildAdminRedirectPath,
    formatAdminDateTime,
    getEntryOpenLeadTask,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getEntryOrderState,
    getFormValue,
    getLeadStatus,
    hasEntryOrderState,
    normalizeLeadStatus,
    normalizeOrderStatus,
    normalizeString,
  });

  const {
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    buildStaffOnboardingReminderSmsMessage,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getClientSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getStaffSmsHistoryEntries,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    sendOrderPolicyAcceptanceInvite,
  } = createAdminSmsHelpers({
    accountInviteEmail,
    buildAdminRedirectPath,
    formatAdminDateTime,
    normalizeString,
    orderPolicyAcceptance,
  });

  const { handleQuoteOpsRoutes } = createAdminQuoteOpsHandlers({
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    adminSharedRenderers,
    buildAdminRedirectPath,
    buildLeadMutationPayload,
    buildOrdersRedirect,
    buildQuoteOpsReturnPath,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    ensureWorkspaceAccess,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getEntrySmsHistoryEntries,
    getFormValue,
    getLeadConnectorClient,
    isAjaxMutationRequest,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeLeadStatus,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    resolveLeadManagerRecord,
    resolveLeadTaskAssigneeRecord,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  });
  const { handleAdminMessagesRoutes } = createAdminMessagesHandlers({
    ADMIN_MESSAGES_PATH,
    buildAdminRedirectPath,
    ensureWorkspaceAccess,
    getEntrySmsHistoryEntries,
    getFormValue,
    hasEntryOrderState,
    isOrderCreatedEntry: hasEntryOrderState,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
  });
  const { handleAdminOrdersRoutes } = createAdminOrdersHandlers({
    ADMIN_ORDERS_PATH,
    buildAdminRedirectPath,
    buildManualOrderRequestId,
    buildOrderCompletionMutationPayload,
    buildOrderStageMutationPayload,
    buildOrdersRedirect,
    buildOrdersReturnPath,
    buildRecurringOrderSubmission,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    ensureWorkspaceAccess,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    formatManualOrderServiceLabel,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getEntryOrderState,
    getEntrySmsHistoryEntries,
    getFormValue,
    getFormValues,
    getOrderStatusFromEntry,
    getRequestUrl,
    isAjaxMutationRequest,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeManualOrderFrequency,
    normalizeManualOrderServiceType,
    normalizeOrderStatus,
    normalizeString,
    orderPolicyAcceptance,
    parseFormBody,
    parseMultipartFormBody,
    readBufferBody,
    readJsonBody,
    readTextBody,
    redirectWithTiming,
    resolveAssignableStaffIdsByNames,
    sendOrderPolicyAcceptanceInvite,
    staffTravelEstimateService,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHeadWithTiming,
    writeJsonWithTiming,
  });
  const { handleAdminPayrollRoutes } = createAdminPayrollHandlers({
    ADMIN_PAYROLL_PATH,
    buildAdminRedirectPath,
    ensureWorkspaceAccess,
    getFormValue,
    normalizeString,
    redirectWithTiming,
  });
  const { handleCalendarRoutes } = createAdminCalendarHandlers({
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    adminSharedRenderers,
    buildStaffRedirect,
    ensureWorkspaceAccess,
    normalizeString,
    redirectWithTiming,
    writeHtmlWithTiming,
  });
  const { handleStaffDocumentRoutes } = createAdminStaffDocumentHandlers({
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    adminSharedRenderers,
    ensureWorkspaceAccess,
    normalizeString,
    writeHeadWithTiming,
    writeHtmlWithTiming,
  });
  const { handleStaffRoutes } = createAdminStaffHandlers({
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_VERIFY_EMAIL_PATH,
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_STAFF_PATH,
    SITE_ORIGIN,
    accountAuth,
    accountInviteEmail,
    adminPageRenderers,
    adminSharedRenderers,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    buildStaffReturnPath,
    buildStaffOnboardingReminderSmsMessage,
    buildStaffRedirect,
    collectNonAssignableStaffIds,
    ensureWorkspaceAccess,
    escapeHtml,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    formatWorkspaceRoleLabel,
    getFormValue,
    getFormValues,
    getStaffSmsHistoryEntries,
    isAjaxMutationRequest,
    isAdminWorkspaceRole,
    isEmployeeLinkedUser,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeAdminPhoneInput,
    normalizeString,
    normalizeWorkspaceRoleValue,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    resolveLinkedUser,
    staffTravelEstimateService,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHtmlWithTiming,
  });
  const { handleSettingsRoutes } = createAdminSettingsRouteHandlers({
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_VERIFY_EMAIL_PATH,
    ADMIN_GOOGLE_MAIL_CALLBACK_PATH,
    ADMIN_GOOGLE_MAIL_CONNECT_PATH,
    ADMIN_SETTINGS_PATH,
    SITE_ORIGIN,
    accountAuth,
    accountInviteEmail,
    adminAuth,
    adminPageRenderers,
    adminSharedRenderers,
    ensureWorkspaceAccess,
    formatWorkspaceRoleLabel,
    getFormValue,
    getFormValues,
    isAjaxMutationRequest,
    normalizeAdminPhoneInput,
    normalizeString,
    normalizeWorkspaceRoleValue,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    resolveLinkedStaff,
    resolveLinkedUser,
    resolveUserEmployeeFlag,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHtmlWithTiming,
  });
  const { handleAdminClientsPostRoute } = createAdminClientsHandlers({
    buildAdminRedirectPath,
    buildClientsReturnPath,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    collectAdminClientRecords,
    clientMutationLedgerLimit: CLIENT_MUTATION_LEDGER_LIMIT,
    ensureWorkspaceAccess,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getClientSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getFormValue,
    getFormValues,
    isAjaxMutationRequest,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  });

  return async function handleAdminRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger,
    adminRuntime = {},
    quoteOpsLedger = null,
    settingsStore = null,
    staffStore = null
  ) {
    void requestLogger;
    requestContext.cacheHit = false;
    const adminState = getAdminAuthState(req);
    const googleCalendarIntegration =
      adminRuntime && adminRuntime.googleCalendarIntegration
        ? adminRuntime.googleCalendarIntegration
        : null;
    const orderMediaStorage =
      adminRuntime && adminRuntime.orderMediaStorage
        ? adminRuntime.orderMediaStorage
        : null;
    const usersStore =
      adminRuntime && adminRuntime.usersStore
        ? adminRuntime.usersStore
        : null;
    const autoNotificationService =
      adminRuntime && adminRuntime.autoNotificationService
        ? adminRuntime.autoNotificationService
        : null;
    let leadConnectorClient = null;
    try {
      leadConnectorClient = typeof getLeadConnectorClient === "function" ? getLeadConnectorClient() : null;
    } catch {
      leadConnectorClient = null;
    }
    if (adminRuntime && typeof adminRuntime === "object") {
      adminRuntime.leadConnectorConfigured = Boolean(
        leadConnectorClient &&
        typeof leadConnectorClient.isConfigured === "function" &&
        leadConnectorClient.isConfigured()
      );
    }
    if (!adminState.config) {
      writeHtmlWithTiming(res, 503, adminSharedRenderers.renderAdminUnavailablePage(), requestStartNs, requestContext.cacheHit);
      return;
    }

    const { config, session, challenge, fingerprint } = adminState;
    const portalState = await resolvePortalUserSession(req, usersStore);
    const currentUserAccess = buildCurrentUserAccess(session, portalState);
    if (adminRuntime && typeof adminRuntime === "object") {
      adminRuntime.currentUserAccess = currentUserAccess;
    }

    if (
      await handleStaffDocumentRoutes({
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge,
        staffStore,
      })
    ) {
      return;
    }

    if (await handleQuoteOpsRoutes({
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      quoteOpsLedger,
      leadConnectorClient,
      usersStore,
      staffStore,
    })) {
      return;
    }

    if (await handleAdminOrdersRoutes({
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      config,
      quoteOpsLedger,
      leadConnectorClient,
      usersStore,
      staffStore,
      orderMediaStorage,
      googleCalendarIntegration,
      autoNotificationService,
      requestLogger,
    })) {
      return;
    }

    if (await handleAdminMessagesRoutes({
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      quoteOpsLedger,
    })) {
      return;
    }

    if (requestContext.route === ADMIN_CLIENTS_PATH && req.method === "POST") {
      await handleAdminClientsPostRoute({
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge,
        config,
        quoteOpsLedger,
        staffStore,
        googleCalendarIntegration,
        leadConnectorClient,
      });
      return;
    }

    if (
      await handleAdminPayrollRoutes({
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge,
        quoteOpsLedger,
        formBody:
          requestContext.route === ADMIN_PAYROLL_PATH && req.method === "POST"
            ? parseFormBody(await readTextBody(req, 256 * 1024))
            : {},
      })
    ) {
      return;
    }

    if (
      await handleCalendarRoutes({
        req,
        res,
        requestStartNs,
        requestContext,
        config,
        currentUserAccess,
        challenge,
        staffStore,
        googleCalendarIntegration,
      })
    ) {
      return;
    }

    if (
      await handleStaffRoutes({
        req,
        res,
        requestStartNs,
        requestContext,
        config,
        currentUserAccess,
        challenge,
        staffStore,
        usersStore,
        quoteOpsLedger,
        leadConnectorClient,
        autoNotificationService,
        googleCalendarIntegration,
      })
    ) {
      return;
    }

    if (
      await handleSettingsRoutes({
        req,
        res,
        requestStartNs,
        requestContext,
        config,
        currentUserAccess,
        challenge,
        adminRuntime,
        quoteOpsLedger,
        settingsStore,
        usersStore,
        staffStore,
      })
    ) {
      return;
    }

    if (ADMIN_APP_ROUTES.has(requestContext.route)) {
      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступен только GET.</div>`),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
      if (currentUserAccess.authorized) {
        writeHtmlWithTiming(
          res,
          200,
          await adminPageRenderers.renderAdminAppPage(requestContext.route, req, config, adminRuntime, quoteOpsLedger, staffStore),
          requestStartNs,
          requestContext.cacheHit,
          buildAdminSessionRefreshHeaders(req, adminState)
        );
        return;
      }
      redirectUnauthorizedAdminAccess(
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge
      );
      return;
    }

    if (
      await handleAuthRoute({
        req,
        res,
        requestStartNs,
        requestContext,
        config,
        session,
        challenge,
        fingerprint,
        portalState,
        currentUserAccess,
        usersStore,
      })
    ) {
      return;
    }
  };
}

module.exports = {
  createAdminRequestHandler,
};
