"use strict";

const fsp = require("node:fs/promises");
const { getEntryOrderState, getPayloadOrderState, hasEntryOrderState } = require("../admin-order-state");
const {
  loadStaffContractConfig,
  resolveStaffContractDocumentAbsolutePath,
} = require("../staff-contractor-agreement");
const {
  loadStaffW9Config,
  resolveStaffW9DocumentAbsolutePath,
} = require("../staff-w9");
const { createAdminClientsHandlers } = require("./handlers-clients");
const { createAdminAuthHandlers } = require("./handlers-auth");
const { createAdminOrdersHandlers } = require("./handlers-orders");
const { createAdminQuoteOpsHandlers } = require("./handlers-quote-ops");
const { createAdminStaffHandlers } = require("./handlers-staff");

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
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHtmlWithTiming,
    writeJsonWithTiming,
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
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHeadWithTiming,
    writeJsonWithTiming,
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

  function writeForbiddenResponse(res, requestStartNs, requestContext, message) {
    writeHtmlWithTiming(
      res,
      403,
      adminSharedRenderers.renderAdminLayout(
        "Недостаточно прав",
        `<div class="admin-alert admin-alert-error">${escapeHtml(
          message || "У вас нет прав для этого действия."
        )}</div>`
      ),
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function isAjaxMutationRequest(req) {
    const acceptHeader = normalizeString(req && req.headers ? req.headers.accept : "", 400).toLowerCase();
    const ajaxHeader = normalizeString(
      req && req.headers ? req.headers["x-shynli-admin-ajax"] : "",
      20
    ).toLowerCase();
    return ajaxHeader === "1" || acceptHeader.includes("application/json");
  }

  function writeAjaxMutationSuccess(res, requestStartNs, requestContext, notice, extra = {}) {
    writeJsonWithTiming(
      res,
      200,
      {
        ok: true,
        notice,
        ...extra,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function writeAjaxMutationError(
    res,
    requestStartNs,
    requestContext,
    notice,
    statusCode = 400,
    extra = {}
  ) {
    writeJsonWithTiming(
      res,
      statusCode,
      {
        ok: false,
        notice,
        error: notice,
        ...extra,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function buildLeadMutationPayload(entry, notice) {
    if (!entry) {
      return {
        ok: false,
        notice: notice || "lead-missing",
        error: "lead-missing",
      };
    }

    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const adminLead =
      payload.adminLead && typeof payload.adminLead === "object"
        ? payload.adminLead
        : {};
    const leadStatus =
      typeof getLeadStatus === "function"
        ? getLeadStatus(entry)
        : normalizeLeadStatus(adminLead.status, hasEntryOrderState(entry) ? "confirmed" : "new");
    const openTask = typeof getEntryOpenLeadTask === "function" ? getEntryOpenLeadTask(entry) : null;
    const dueAtMs = Date.parse((openTask || {}).dueAt || "");

    return {
      ok: true,
      notice: notice || "lead-stage-saved",
      entry: {
        id: normalizeString(entry.id, 120),
        leadStatus,
        locked: leadStatus === "confirmed",
        managerLabel:
          normalizeString(adminLead.managerName, 200) ||
          normalizeString(adminLead.managerEmail, 250).toLowerCase() ||
          "Без менеджера",
        taskLabel: openTask
          ? normalizeString(openTask.title, 200)
          : leadStatus === "confirmed"
            ? "Заказ создан"
            : "Нет открытой задачи",
        hideDeadline: leadStatus === "confirmed" || leadStatus === "declined",
        dueLabel:
          openTask && typeof formatAdminDateTime === "function"
            ? formatAdminDateTime(openTask.dueAt)
            : "—",
        dueOverdue: Boolean(openTask) && Number.isFinite(dueAtMs) && dueAtMs < Date.now(),
        notes: normalizeString(adminLead.notes, 2000),
      },
    };
  }

  function buildOrderCompletionMutationPayload(entry, notice, options = {}) {
    if (!entry) {
      return {
        ok: false,
        notice: notice || "order-missing",
        error: "order-missing",
        message: "Заказ не найден.",
      };
    }

    const completionData = getEntryOrderCompletionData(entry);
    const updatedAt = normalizeString(completionData.updatedAt, 80);
    const updatedAtLabel =
      updatedAt && typeof formatAdminDateTime === "function"
        ? formatAdminDateTime(updatedAt)
        : "";

    function mapAssets(items = []) {
      return (Array.isArray(items) ? items : []).map((asset) => ({
        id: normalizeString(asset && asset.id, 180),
        fileName: normalizeString(asset && asset.fileName, 180),
        uploadedAt: normalizeString(asset && asset.uploadedAt, 80),
      }));
    }

    return {
      ok: true,
      notice: notice || "completion-saved",
      message: normalizeString(options.message, 200) || "Отчёт клинера сохранён.",
      completion: {
        cleanerComment: normalizeString(completionData.cleanerComment, 4000),
        updatedAt,
        updatedAtLabel,
        beforePhotos: mapAssets(completionData.beforePhotos),
        afterPhotos: mapAssets(completionData.afterPhotos),
      },
    };
  }

  function buildOrderStageMutationPayload(entry, notice) {
    if (!entry) {
      return {
        ok: false,
        notice: notice || "order-missing",
        error: "order-missing",
        message: "Заказ не найден.",
      };
    }

    const orderStatus = normalizeString(
      ((entry.payloadForRetry || {}).adminOrder || {}).status || "",
      40
    ).toLowerCase() || "new";
    const policyAcceptance =
      typeof getEntryOrderPolicyAcceptanceData === "function"
        ? getEntryOrderPolicyAcceptanceData(entry)
        : {};
    const hasSentPolicyInvite = Boolean(
      normalizeString(policyAcceptance.sentAt, 80) ||
        normalizeString(policyAcceptance.firstViewedAt, 80) ||
        normalizeString(policyAcceptance.lastViewedAt, 80) ||
        normalizeString(policyAcceptance.signedAt, 80)
    );
    const funnelStatus =
      orderStatus === "scheduled" && hasSentPolicyInvite && !policyAcceptance.policyAccepted
        ? "policy"
        : orderStatus;

    return {
      ok: true,
      notice: notice || "order-saved",
      order: {
        id: normalizeString(entry.id, 120),
        orderStatus,
        funnelStatus,
      },
    };
  }

  function getOrderStatusFromEntry(entry) {
    return normalizeOrderStatus(getEntryOrderState(entry).status, "new");
  }

  function ensureWorkspaceAccess(
    req,
    res,
    requestStartNs,
    requestContext,
    currentUserAccess,
    challenge,
    options = {}
  ) {
    if (!currentUserAccess || !currentUserAccess.authorized) {
      redirectUnauthorizedAdminAccess(
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge
      );
      return false;
    }

    if (options.requireWrite && currentUserAccess.canEdit === false) {
      writeForbiddenResponse(
        res,
        requestStartNs,
        requestContext,
        options.forbiddenMessage || "Эта роль может только просматривать данные."
      );
      return false;
    }

    if (options.requireDelete && currentUserAccess.canDelete === false) {
      writeForbiddenResponse(
        res,
        requestStartNs,
        requestContext,
        options.forbiddenMessage || "Удаление доступно только администратору."
      );
      return false;
    }

    return true;
  }

  function buildClientsReturnPath(value) {
    const candidate = normalizeString(value, 1000);
    if (!candidate) return ADMIN_CLIENTS_PATH;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.pathname !== ADMIN_CLIENTS_PATH) return ADMIN_CLIENTS_PATH;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return ADMIN_CLIENTS_PATH;
    }
  }

  function buildStaffReturnPath(value) {
    const candidate = normalizeString(value, 1000);
    if (!candidate) return ADMIN_STAFF_PATH;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.pathname !== ADMIN_STAFF_PATH) return ADMIN_STAFF_PATH;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return ADMIN_STAFF_PATH;
    }
  }

  function buildStaffRedirect(notice, extra = {}) {
    return buildAdminRedirectPath(ADMIN_STAFF_PATH, {
      notice,
      ...extra,
    });
  }

  function isAdminWorkspaceRole(role) {
    return normalizeString(role, 32).toLowerCase() === "admin";
  }

  function isEmployeeLinkedUser(user) {
    if (!user || typeof user !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(user, "isEmployee")) {
      const rawValue = user.isEmployee;
      if (rawValue === true || rawValue === false) return rawValue;
      const normalized = normalizeString(rawValue, 20).toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }
    return !isAdminWorkspaceRole(user.role);
  }

  function collectNonAssignableStaffIds(users = []) {
    const blockedIds = new Set();
    (Array.isArray(users) ? users : []).forEach((user) => {
      const staffId = normalizeString(user && user.staffId, 120);
      if (!staffId) return;
      if (!isEmployeeLinkedUser(user)) {
        blockedIds.add(staffId);
      }
    });
    return blockedIds;
  }

  async function resolveLinkedUser(usersStore, { userId = "", staffId = "", email = "" } = {}) {
    if (!usersStore) return null;

    const normalizedUserId = normalizeString(userId, 120);
    if (normalizedUserId && typeof usersStore.getUserById === "function") {
      const directMatch = await usersStore.getUserById(normalizedUserId, { includeSecret: true });
      if (directMatch) return directMatch;
    }

    if (typeof usersStore.getSnapshot !== "function") {
      return null;
    }

    const normalizedStaffId = normalizeString(staffId, 120);
    const normalizedEmail = normalizeString(email, 200).toLowerCase();
    const snapshot = await usersStore.getSnapshot();
    const matchedUser =
      snapshot && Array.isArray(snapshot.users)
        ? snapshot.users.find(
            (user) =>
              user &&
              ((normalizedStaffId && user.staffId === normalizedStaffId) ||
                (normalizedEmail &&
                  normalizeString(user.email, 200).toLowerCase() === normalizedEmail))
          ) || null
        : null;

    if (!matchedUser || typeof usersStore.getUserById !== "function") {
      return null;
    }

    return usersStore.getUserById(matchedUser.id, { includeSecret: true });
  }

  async function resolveLinkedStaff(staffStore, { staffId = "", email = "" } = {}) {
    if (!staffStore || typeof staffStore.getSnapshot !== "function") {
      return null;
    }

    const normalizedStaffId = normalizeString(staffId, 120);
    const normalizedEmail = normalizeString(email, 200).toLowerCase();
    const snapshot = await staffStore.getSnapshot();
    return snapshot && Array.isArray(snapshot.staff)
      ? snapshot.staff.find(
          (record) =>
            record &&
            ((normalizedStaffId && record.id === normalizedStaffId) ||
              (normalizedEmail &&
                normalizeString(record.email, 200).toLowerCase() === normalizedEmail))
        ) || null
      : null;
  }

  async function resolveAssignableStaffIdsByNames(staffStore, usersStore, selectedNames = []) {
    if (!staffStore || typeof staffStore.getSnapshot !== "function") {
      return {
        snapshot: { staff: [], assignments: [] },
        staffIds: [],
        staffNames: [],
      };
    }

    const snapshot = await staffStore.getSnapshot();
    const blockedStaffIds = new Set();
    if (usersStore && typeof usersStore.getSnapshot === "function") {
      const usersSnapshot = await usersStore.getSnapshot();
      if (usersSnapshot && Array.isArray(usersSnapshot.users)) {
        for (const staffId of collectNonAssignableStaffIds(usersSnapshot.users)) {
          blockedStaffIds.add(staffId);
        }
      }
    }

    const staffRecordByName = new Map();
    const blockedStaffByName = new Map();
    (Array.isArray(snapshot.staff) ? snapshot.staff : []).forEach((record) => {
      const staffId = normalizeString(record && record.id, 120);
      const staffName = normalizeString(record && record.name, 120);
      const key = staffName.toLowerCase();
      if (!staffId || !staffName) return;
      if (blockedStaffIds.has(staffId)) {
        if (!blockedStaffByName.has(key)) {
          blockedStaffByName.set(key, {
            id: staffId,
            name: staffName,
          });
        }
        return;
      }
      if (!staffRecordByName.has(key)) {
        staffRecordByName.set(key, {
          id: staffId,
          name: staffName,
        });
      }
    });

    const staffIds = [];
    const staffNames = [];
    const seen = new Set();
    const seenFreeformNames = new Set();
    (Array.isArray(selectedNames) ? selectedNames : []).forEach((name) => {
      const normalizedName = normalizeString(name, 120);
      const key = normalizedName.toLowerCase();
      if (!key) return;
      const staffRecord = key ? staffRecordByName.get(key) : null;
      if (staffRecord) {
        if (seen.has(staffRecord.id)) return;
        seen.add(staffRecord.id);
        staffIds.push(staffRecord.id);
        staffNames.push(staffRecord.name);
        return;
      }

      if (blockedStaffByName.has(key) || seenFreeformNames.has(key)) return;
      seenFreeformNames.add(key);
      staffNames.push(normalizedName);
    });

    return {
      snapshot,
      staffIds,
      staffNames: staffNames.filter(Boolean),
    };
  }

  async function resolveLeadManagerRecord(usersStore, staffStore, managerId) {
    const normalizedManagerId = normalizeString(managerId, 120);
    if (!normalizedManagerId || !usersStore || typeof usersStore.getSnapshot !== "function") {
      return null;
    }

    const usersSnapshot = await usersStore.getSnapshot();
    const users = Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : [];
    const matchedUser = users.find((user) => {
      if (!user || normalizeString(user.id, 120) !== normalizedManagerId) return false;
      if (normalizeString(user.status, 32).toLowerCase() !== "active") return false;
      const role = normalizeString(user.role, 32).toLowerCase();
      return role === "manager";
    });
    if (!matchedUser) return null;

    let managerName = "";
    if (staffStore && typeof staffStore.getSnapshot === "function" && matchedUser.staffId) {
      const staffSnapshot = await staffStore.getSnapshot();
      const staffRecord = (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : []).find(
        (record) => normalizeString(record && record.id, 120) === normalizeString(matchedUser.staffId, 120)
      );
      managerName = normalizeString(staffRecord && staffRecord.name, 200);
    }

    return {
      id: normalizeString(matchedUser.id, 120),
      name: managerName || normalizeString(matchedUser.email, 200),
      email: normalizeString(matchedUser.email, 250).toLowerCase(),
    };
  }

  function buildOrdersRedirect(returnTo, notice, extra = {}) {
    return buildAdminRedirectPath(returnTo, {
      notice,
      ...extra,
    });
  }

  function normalizeManualOrderServiceType(value) {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
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
    return "standard";
  }

  function normalizeManualOrderFrequency(value) {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (normalized === "weekly") return "weekly";
    if (normalized === "biweekly") return "biweekly";
    if (normalized === "monthly") return "monthly";
    return "";
  }

  function formatManualOrderServiceLabel(serviceType) {
    if (serviceType === "deep") return "Deep";
    if (serviceType === "move-in/out") return "Move-in/out";
    return "Standard";
  }

  function buildManualOrderRequestId(customerName) {
    const slug = normalizeString(customerName, 80)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = Date.now().toString(36).slice(-6);
    return normalizeString(`manual-${slug || "order"}-${suffix}`, 120);
  }

  function buildSmsRedirectPath(returnTo, notice, target, targetRef, extra = {}) {
    return buildAdminRedirectPath(returnTo, {
      notice,
      smsTarget: target,
      smsRef: targetRef,
      smsError: "",
      smsDraft: "",
      ...extra,
    });
  }

  function formatSmsErrorMessage(result, fallbackMessage) {
    const smsCode = normalizeString(result && result.code, 80).toUpperCase();
    if (smsCode === "CONTACT_LOOKUP_FAILED") {
      return "Не удалось найти контакт в Go High Level перед отправкой SMS.";
    }
    if (smsCode === "CONTACT_CREATE_FAILED") {
      return "Не удалось создать контакт в Go High Level перед отправкой SMS.";
    }
    if (smsCode === "CONTACT_UPDATE_FAILED") {
      return "Не удалось обновить контакт в Go High Level перед отправкой SMS.";
    }
    if (smsCode === "CONTACT_NOT_FOUND") {
      return "Контакт в Go High Level не найден.";
    }
    const detailSource =
      result && typeof result.details === "object" && result.details !== null
        ? result.details.message || result.details.error || result.details.details || result.details.detail || ""
        : "";
    return normalizeString(
      (result && (result.message || detailSource)) || fallbackMessage || "Не удалось отправить SMS.",
      240
    );
  }

  function getEntryAdminSmsData(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    return payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
  }

  function normalizeAdminSmsHistoryEntry(item) {
    if (!item || typeof item !== "object") return null;
    const message = normalizeString(item.message, 1000);
    if (!message) return null;
    const direction =
      normalizeString(item.direction, 20).toLowerCase() === "inbound"
        ? "inbound"
        : "outbound";
    const normalizedSource = normalizeString(item.source, 20).toLowerCase();
    return {
      id: normalizeString(item.id, 120) || `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sentAt: normalizeString(item.sentAt || item.createdAt, 80) || new Date().toISOString(),
      message,
      phone: normalizeString(item.phone, 80),
      contactId: normalizeString(item.contactId, 120),
      channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
      direction,
      source:
        normalizedSource === "automatic"
          ? "automatic"
          : normalizedSource === "client" || direction === "inbound"
            ? "client"
            : "manual",
      targetType: normalizeString(item.targetType, 40).toLowerCase(),
      targetRef: normalizeString(item.targetRef, 160),
      conversationId: normalizeString(item.conversationId, 120),
      messageId: normalizeString(item.messageId, 120),
    };
  }

  function normalizeAdminSmsHistoryEntries(entries = []) {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((item) => normalizeAdminSmsHistoryEntry(item))
      .filter(Boolean)
      .sort((left, right) => {
        const leftMs = Date.parse(left.sentAt || "");
        const rightMs = Date.parse(right.sentAt || "");
        if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
          return rightMs - leftMs;
        }
        return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
      })
      .slice(0, 50);
  }

  function buildSmsHistoryEntryKey(entry = {}) {
    const messageId = normalizeString(entry && entry.messageId, 120);
    if (messageId) return `message:${messageId}`;
    return [
      "fallback",
      normalizeString(entry && entry.conversationId, 120),
      normalizeString(entry && entry.direction, 20).toLowerCase(),
      normalizeString(entry && entry.sentAt, 80),
      normalizeString(entry && entry.phone, 80),
      normalizeString(entry && entry.message, 1000),
    ].join("|");
  }

  function mergeAdminSmsHistoryEntries(primaryEntries = [], secondaryEntries = []) {
    const seen = new Set();
    const merged = [
      ...(Array.isArray(secondaryEntries) ? secondaryEntries : []),
      ...(Array.isArray(primaryEntries) ? primaryEntries : []),
    ]
      .map((entry) => normalizeAdminSmsHistoryEntry(entry))
      .filter(Boolean)
      .filter((entry) => {
      const key = buildSmsHistoryEntryKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return normalizeAdminSmsHistoryEntries(merged);
  }

  function extractSmsConversationIds(entries = []) {
    return Array.from(
      new Set(
        normalizeAdminSmsHistoryEntries(entries)
          .map((entry) => normalizeString(entry && entry.conversationId, 120))
          .filter(Boolean)
      )
    ).slice(0, 10);
  }

  function getEntrySmsHistoryEntries(entry = {}) {
    return normalizeAdminSmsHistoryEntries(getEntryAdminSmsData(entry).history || []);
  }

  function getClientSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return normalizeAdminSmsHistoryEntries(
      client.entries.flatMap((entry) => getEntrySmsHistoryEntries(entry))
    );
  }

  function getStaffSmsHistoryEntries(staffRecord = {}) {
    return normalizeAdminSmsHistoryEntries(staffRecord && staffRecord.smsHistory);
  }

  function buildSmsHistoryRecord(result, options = {}) {
    return {
      id: `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sentAt: new Date().toISOString(),
      message: normalizeString(options.message, 1000),
      phone: normalizeString(options.phone, 80),
      contactId: normalizeString((result && result.contactId) || options.contactId, 120),
      channel: "ghl",
      direction: "outbound",
      source: normalizeString(options.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
      targetType: normalizeString(options.targetType, 40).toLowerCase(),
      targetRef: normalizeString(options.targetRef, 160),
      conversationId: normalizeString(result && result.conversationId, 120),
      messageId: normalizeString(result && result.messageId, 120),
    };
  }

  function buildStaffOnboardingReminderSmsMessage(staffName, documentsUrl) {
    const link = normalizeString(documentsUrl, 4000);
    if (!link) return "";
    const firstName = normalizeString(staffName, 120).split(/\s+/).filter(Boolean)[0] || "there";
    return `Hi ${firstName}, this is Shynli Cleaning Service. Please complete and sign your Contract and W-9 here: ${link}`;
  }

  function formatSmsHistoryCountLabel(count) {
    const numeric = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
    if (numeric === 0) return "Пока пусто";
    return `${numeric} SMS`;
  }

  function buildSmsHistoryViewModel(entries = []) {
    return normalizeAdminSmsHistoryEntries(entries).map((entry) => ({
      id: entry.id,
      message: entry.message,
      sentAt: entry.sentAt,
      sentAtLabel: typeof formatAdminDateTime === "function" ? formatAdminDateTime(entry.sentAt) : entry.sentAt,
      source: entry.source,
      sourceLabel:
        entry.source === "automatic"
          ? "Автоматически"
          : entry.source === "client"
            ? "Клиент"
            : "Вручную",
      sourceTone:
        entry.source === "automatic"
          ? "muted"
          : entry.source === "client"
            ? "outline"
            : "success",
      direction: entry.direction,
      directionLabel: entry.direction === "inbound" ? "Входящее" : "Исходящее",
      channel: entry.channel,
      channelLabel: entry.channel === "ghl" ? "Go High Level" : normalizeString(entry.channel, 40) || "SMS",
    }));
  }

  function getSmsSentNoticeMessage() {
    return "SMS отправлена через Go High Level.";
  }

  function getClientFirstName(value) {
    const parts = normalizeString(value, 160)
      .split(/\s+/)
      .map((item) => normalizeString(item, 80))
      .filter(Boolean);
    return parts[0] || "";
  }

  function buildOrderPolicyAcceptanceSmsMessage(entry, confirmationUrl) {
    const link = normalizeString(confirmationUrl, 4000);
    if (!link) return "";
    const firstName = getClientFirstName(entry && entry.customerName);
    const greeting = firstName ? `Hi ${firstName},` : "Hi,";
    return `${greeting} this is Shynli Cleaning Service. To confirm your booking, please review and accept our service policies here: ${link}`;
  }

  async function sendOrderPolicyAcceptanceInvite(
    quoteOpsLedger,
    entryId,
    entry,
    config,
    leadConnectorClient
  ) {
    let updatedEntry = entry;
    let pendingAcceptance = null;
    let emailState = "";
    let smsState = "skipped";

    if (
      !updatedEntry ||
      !orderPolicyAcceptance ||
      typeof orderPolicyAcceptance.buildPendingAcceptance !== "function"
    ) {
      return { updatedEntry, pendingAcceptance, emailState: "failed", smsState };
    }

    try {
      pendingAcceptance = await orderPolicyAcceptance.buildPendingAcceptance(updatedEntry);
      updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        policyAcceptance: pendingAcceptance.record,
      });
    } catch {
      return { updatedEntry, pendingAcceptance, emailState: "failed", smsState };
    }

    const customerEmail = normalizeString(updatedEntry && updatedEntry.customerEmail, 250).toLowerCase();
    const inviteEmailStatus =
      accountInviteEmail && typeof accountInviteEmail.getStatus === "function"
        ? await accountInviteEmail.getStatus(config)
        : { configured: false };
    const hasCustomerEmail = Boolean(customerEmail);

    if (!hasCustomerEmail) {
      emailState = "skipped";
    } else if (!inviteEmailStatus.configured) {
      const failedRecord = orderPolicyAcceptance.buildFailedSendRecord(
        pendingAcceptance.record,
        new Error("Policy confirmation email is not configured.")
      );
      updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        policyAcceptance: failedRecord,
      });
      emailState = "unavailable";
    } else if (
      accountInviteEmail &&
      typeof accountInviteEmail.sendOrderPolicyConfirmation === "function"
    ) {
      try {
        await accountInviteEmail.sendOrderPolicyConfirmation(
          pendingAcceptance.emailPayload,
          config
        );
        const sentRecord = orderPolicyAcceptance.buildSentAcceptanceRecord(
          pendingAcceptance.record
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: sentRecord,
        });
        emailState = "sent";
      } catch (error) {
        const failedRecord = orderPolicyAcceptance.buildFailedSendRecord(
          pendingAcceptance.record,
          error
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: failedRecord,
        });
        emailState = "failed";
      }
    } else {
      emailState = "unavailable";
    }

    if (
      pendingAcceptance &&
      leadConnectorClient &&
      typeof leadConnectorClient.sendSmsMessage === "function" &&
      leadConnectorClient.isConfigured()
    ) {
      const policySmsMessage = buildOrderPolicyAcceptanceSmsMessage(
        updatedEntry,
        pendingAcceptance.emailPayload && pendingAcceptance.emailPayload.confirmUrl
      );
      if (policySmsMessage) {
        try {
          const smsResult = await leadConnectorClient.sendSmsMessage({
            contactId: normalizeString(updatedEntry && updatedEntry.contactId, 120),
            phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
            customerName: normalizeString(updatedEntry && updatedEntry.customerName, 160),
            customerEmail: normalizeString(updatedEntry && updatedEntry.customerEmail, 250).toLowerCase(),
            message: policySmsMessage,
          });

          if (smsResult && smsResult.ok) {
            const nextSmsHistory = [
              buildSmsHistoryRecord(smsResult, {
                message: policySmsMessage,
                phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
                targetType: "order",
                targetRef: entryId,
                source: "automatic",
              }),
              ...getEntrySmsHistoryEntries(updatedEntry),
            ];
            updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
              contactId: normalizeString(
                (smsResult && smsResult.contactId) || (updatedEntry && updatedEntry.contactId),
                120
              ),
              smsHistory: nextSmsHistory,
            });
            smsState = "sent";
          } else {
            smsState = "failed";
          }
        } catch {
          smsState = "failed";
        }
      }
    }

    if (!hasCustomerEmail) {
      if (smsState === "sent") {
        const sentRecord = orderPolicyAcceptance.buildSentAcceptanceRecord(
          pendingAcceptance.record
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: sentRecord,
        });
        emailState = "sms-only";
      } else {
        const failedRecord = orderPolicyAcceptance.buildFailedSendRecord(
          pendingAcceptance.record,
          new Error("Recipient email is missing and SMS delivery was not completed.")
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: failedRecord,
        });
        emailState = "missing-recipient";
      }
    }

    return { updatedEntry, pendingAcceptance, emailState, smsState };
  }

  function getSmsErrorNoticeMessage(notice, fallbackMessage, errorMessage = "") {
    const normalizedNotice = normalizeString(notice, 80).toLowerCase();
    if (normalizedNotice.endsWith("-sms-empty")) {
      return "Введите текст сообщения перед отправкой.";
    }
    if (normalizedNotice.endsWith("-sms-unavailable")) {
      return "Go High Level сейчас не настроен для отправки SMS.";
    }
    if (normalizedNotice.endsWith("-sms-contact-missing")) {
      return errorMessage || "В Go High Level не найден контакт или телефон для отправки SMS.";
    }
    return errorMessage || fallbackMessage || "Не удалось отправить SMS.";
  }

  function buildSmsAjaxPayload(notice, fallbackMessage, historyEntries = [], options = {}) {
    const normalizedNotice = normalizeString(notice, 80).toLowerCase();
    const success = normalizedNotice.endsWith("-sms-sent");
    const includeHistory = Array.isArray(historyEntries);
    return {
      sms: {
        notice: normalizedNotice,
        feedbackState: success ? "success" : "error",
        feedbackMessage: success
          ? getSmsSentNoticeMessage()
          : getSmsErrorNoticeMessage(normalizedNotice, fallbackMessage, normalizeString(options.errorMessage, 240)),
        draft: success ? "" : normalizeString(options.draft, 1000),
        ...(includeHistory
          ? {
              history: buildSmsHistoryViewModel(historyEntries),
              historyCountLabel: formatSmsHistoryCountLabel(historyEntries.length),
            }
          : {}),
      },
    };
  }

  function buildSmsHistoryAjaxPayload(historyEntries = []) {
    return {
      sms: {
        history: buildSmsHistoryViewModel(historyEntries),
        historyCountLabel: formatSmsHistoryCountLabel(historyEntries.length),
      },
    };
  }

  async function loadRemoteSmsHistoryEntries(leadConnectorClient, options = {}) {
    if (
      !leadConnectorClient ||
      typeof leadConnectorClient.getSmsHistory !== "function" ||
      !leadConnectorClient.isConfigured()
    ) {
      return [];
    }

    const result = await leadConnectorClient.getSmsHistory(options);
    if (!result || result.ok !== true || !Array.isArray(result.history)) {
      return [];
    }

    return normalizeAdminSmsHistoryEntries(result.history);
  }

  function normalizeAdminPhoneInput(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";

    let digits = raw.replace(/\D+/g, "");
    if (!digits) return "";

    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }

    if (digits.length !== 10) return "";
    return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function normalizeWorkspaceRoleValue(value) {
    const normalized = normalizeString(value, 80).toLowerCase();
    if (!normalized) return "cleaner";
    if (normalized === "admin" || normalized === "админ" || normalized === "administrator") return "admin";
    if (
      normalized === "manager" ||
      normalized === "менеджер" ||
      normalized.includes("manager") ||
      normalized.includes("lead")
    ) {
      return "manager";
    }
    if (
      normalized === "cleaner" ||
      normalized === "клинер" ||
      normalized.includes("clean")
    ) {
      return "cleaner";
    }
    return "cleaner";
  }

  function formatWorkspaceRoleLabel(role) {
    if (role === "admin") return "Админ";
    if (role === "manager") return "Менеджер";
    return "Клинер";
  }

  function resolveUserEmployeeFlag(formBody, userRole) {
    if (formBody && Object.prototype.hasOwnProperty.call(formBody, "isEmployee")) {
      return getFormValue(formBody, "isEmployee", 20) === "1";
    }
    return userRole !== "admin";
  }

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
    const googleMailIntegration =
      adminRuntime && adminRuntime.googleMailIntegration
        ? adminRuntime.googleMailIntegration
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
      requestContext.route === ADMIN_STAFF_W9_DOWNLOAD_PATH ||
      requestContext.route === ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH
    ) {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge)
      ) {
        return;
      }

      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout(
            "Метод не поддерживается",
            `<div class="admin-alert admin-alert-error">Документы сотрудника доступны только через GET.</div>`
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const isContractDownload = requestContext.route === ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH;
      const reqUrl = new URL(
        req.url || (isContractDownload ? ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH : ADMIN_STAFF_W9_DOWNLOAD_PATH),
        "http://localhost"
      );
      const staffId = normalizeString(reqUrl.searchParams.get("staffId"), 120);
      const snapshot = staffStore ? await staffStore.getSnapshot() : { staff: [] };
      const staffRecord = Array.isArray(snapshot.staff)
        ? snapshot.staff.find((record) => record.id === staffId) || null
        : null;
      const requestedDocument = isContractDownload
        ? staffRecord && staffRecord.contract && staffRecord.contract.document
          ? staffRecord.contract.document
          : null
        : staffRecord && staffRecord.w9 && staffRecord.w9.document
          ? staffRecord.w9.document
          : null;

      if (!staffRecord || !requestedDocument || !requestedDocument.relativePath) {
        writeHtmlWithTiming(
          res,
          404,
          adminSharedRenderers.renderAdminLayout(
            isContractDownload ? "Contract не найден" : "W-9 не найден",
            `<div class="admin-alert admin-alert-error">Для этого сотрудника ещё нет прикреплённого ${isContractDownload ? "Contract" : "W-9"}.</div>`
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        const config = isContractDownload
          ? loadStaffContractConfig(process.env)
          : loadStaffW9Config(process.env);
        const absolutePath = isContractDownload
          ? resolveStaffContractDocumentAbsolutePath(requestedDocument.relativePath, config)
          : resolveStaffW9DocumentAbsolutePath(requestedDocument.relativePath, config);
        const body = await fsp.readFile(absolutePath);
        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": requestedDocument.contentType || "application/pdf",
            "Content-Length": String(body.length),
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="${requestedDocument.fileName || (isContractDownload ? "staff-contract.pdf" : "staff-w9.pdf")}"`,
            "Content-Security-Policy":
              "base-uri 'self'; frame-ancestors 'self'; object-src 'none'; form-action 'self' https://checkout.stripe.com https://api.stripe.com;",
            "X-Frame-Options": "SAMEORIGIN",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        res.end(body);
        return;
      } catch {
        writeHtmlWithTiming(
          res,
          404,
          adminSharedRenderers.renderAdminLayout(
            isContractDownload ? "Contract не найден" : "W-9 не найден",
            `<div class="admin-alert admin-alert-error">Файл ${isContractDownload ? "Contract" : "W-9"} не найден на сервере. Сотруднику нужно пересоздать документы.</div>`
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
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

    if (requestContext.route === ADMIN_GOOGLE_MAIL_CONNECT_PATH) {
      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout(
            "Метод не поддерживается",
            `<div class="admin-alert admin-alert-error">Подключение Gmail открывается только через GET.</div>`
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      if (
        !googleMailIntegration ||
        typeof googleMailIntegration.buildConnectUrl !== "function" ||
        !googleMailIntegration.isConfigured()
      ) {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-unavailable"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const reqUrl = new URL(req.url || ADMIN_GOOGLE_MAIL_CONNECT_PATH, "http://localhost");
      const loginHint = normalizeString(reqUrl.searchParams.get("email"), 200);

      try {
        const connectUrl = await googleMailIntegration.buildConnectUrl(config, loginHint);
        redirectWithTiming(res, 303, connectUrl, requestStartNs, requestContext.cacheHit);
        return;
      } catch {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_GOOGLE_MAIL_CALLBACK_PATH) {
      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout(
            "Метод не поддерживается",
            `<div class="admin-alert admin-alert-error">Google Mail callback принимает только GET.</div>`
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const reqUrl = new URL(req.url || ADMIN_GOOGLE_MAIL_CALLBACK_PATH, "http://localhost");
      const accessDenied = normalizeString(reqUrl.searchParams.get("error"), 120);
      const code = normalizeString(reqUrl.searchParams.get("code"), 4000);
      const state = normalizeString(reqUrl.searchParams.get("state"), 6000);

      if (accessDenied) {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connect-denied"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (
        !googleMailIntegration ||
        typeof googleMailIntegration.handleOAuthCallback !== "function" ||
        !googleMailIntegration.isConfigured() ||
        !code ||
        !state
      ) {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        await googleMailIntegration.handleOAuthCallback({
          code,
          state,
          config,
        });
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connected"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_SETTINGS_PATH && req.method === "POST") {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 16 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const serviceType = getFormValue(formBody, "serviceType", 32).toLowerCase();
      const ajaxRequest = isAjaxMutationRequest(req);
      if (
        action === "delete_user" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

      try {
        if (action === "disconnect-google-mail") {
          if (
            googleMailIntegration &&
            typeof googleMailIntegration.disconnect === "function"
          ) {
            await googleMailIntegration.disconnect(config);
          }
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsUsersRedirectPath("mail-disconnected"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "save_checklist_state") {
          if (!settingsStore) throw new Error("SETTINGS_STORE_UNAVAILABLE");
          await settingsStore.setCompletedItems(serviceType, getFormValues(formBody, "completedItemIds", 200, 120));
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsRedirectPath(serviceType, "saved"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "add_checklist_item") {
          if (!settingsStore) throw new Error("SETTINGS_STORE_UNAVAILABLE");
          await settingsStore.addChecklistItem(serviceType, getFormValue(formBody, "itemLabel", 240));
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsRedirectPath(serviceType, "added"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "save_checklist_template") {
          if (!settingsStore) throw new Error("SETTINGS_STORE_UNAVAILABLE");
          const itemIds = getFormValues(formBody, "itemId", 300, 120);
          const itemLabels = getFormValues(formBody, "itemLabel", 300, 240);
          const items = itemLabels.map((label, index) => ({
            id: itemIds[index] || "",
            label,
          }));
          await settingsStore.saveChecklistTemplate(serviceType, items);
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsRedirectPath(serviceType, "checklist-updated"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "reset_checklist_state") {
          if (!settingsStore) throw new Error("SETTINGS_STORE_UNAVAILABLE");
          await settingsStore.resetChecklist(serviceType);
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsRedirectPath(serviceType, "reset"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "create_user") {
          if (!usersStore || !staffStore) throw new Error("USERS_STORE_UNAVAILABLE");
          const email = getFormValue(formBody, "email", 200).toLowerCase();
          const phone = normalizeAdminPhoneInput(getFormValue(formBody, "phone", 80));
          const address = getFormValue(formBody, "address", 500);
          const compensationValue = getFormValue(formBody, "compensationValue", 32);
          const compensationType = getFormValue(formBody, "compensationType", 32);
          const userRole = normalizeWorkspaceRoleValue(getFormValue(formBody, "role", 32));
          const isEmployee = resolveUserEmployeeFlag(formBody, userRole);
          const staffRole = formatWorkspaceRoleLabel(userRole);
          let staffId = getFormValue(formBody, "staffId", 120);
          const password = getFormValue(formBody, "password", 400);
          const inviteEmailStatus =
            accountInviteEmail && typeof accountInviteEmail.getStatus === "function"
              ? await accountInviteEmail.getStatus(config)
              : { configured: false };
          if (!email || !phone || !address) {
            throw new Error("USER_REQUIRED_FIELDS_MISSING");
          }
          if (!password && !inviteEmailStatus.configured) {
            throw new Error("USER_PASSWORD_OR_INVITE_REQUIRED");
          }
          if (!staffId) {
            const createdStaff = await staffStore.createStaff({
              name: getFormValue(formBody, "name", 120),
              role: staffRole,
              phone,
              email,
              address,
              compensationValue,
              compensationType,
              status: getFormValue(formBody, "staffStatus", 32),
              notes: getFormValue(formBody, "notes", 800),
            });
            staffId = createdStaff.id;
          } else {
            await staffStore.updateStaff(staffId, {
              name: getFormValue(formBody, "name", 120),
              role: staffRole,
              phone,
              email,
              address,
              compensationValue,
              compensationType,
              status: getFormValue(formBody, "staffStatus", 32),
              notes: getFormValue(formBody, "notes", 800),
            });
          }
          await usersStore.createUser({
            emailVerificationRequired: false,
            emailVerifiedAt: new Date().toISOString(),
            staffId,
            email,
            phone,
            isEmployee,
            role: userRole,
            status: getFormValue(formBody, "status", 32),
            passwordHash: password ? adminAuth.hashPassword(password) : "",
          });
          const createdUser = await usersStore.findUserByEmail(email, { includeSecret: true });
          if (staffStore && staffId) {
            try {
              await staffStore.updateStaff(staffId, { email, phone });
            } catch {}
          }
          let redirectNotice = "user-created";
          if (createdUser && inviteEmailStatus.configured) {
            try {
              const verificationToken = accountAuth.createUserEmailVerificationToken(
                { masterSecret: config.masterSecret },
                {
                  userId: createdUser.id,
                  email: createdUser.email,
                }
              );
              const verificationUrl = new URL(ACCOUNT_VERIFY_EMAIL_PATH, SITE_ORIGIN);
              verificationUrl.searchParams.set("token", verificationToken);

              const loginUrl = new URL(ACCOUNT_LOGIN_PATH, SITE_ORIGIN);
              const inviteResult = await accountInviteEmail.sendInvite({
                toEmail: createdUser.email,
                staffName: getFormValue(formBody, "name", 120),
                verifyUrl: verificationUrl.toString(),
                loginUrl: loginUrl.toString(),
              }, config);
              await usersStore.updateUser(createdUser.id, {
                emailVerificationRequired: true,
                emailVerifiedAt: "",
                inviteEmailSentAt: inviteResult && inviteResult.sentAt ? inviteResult.sentAt : new Date().toISOString(),
                inviteEmailLastError: "",
              });
              redirectNotice = "user-created-email-sent";
            } catch (error) {
              await usersStore.updateUser(createdUser.id, {
                emailVerificationRequired: !password,
                emailVerifiedAt: password ? new Date().toISOString() : "",
                inviteEmailLastError: normalizeString(error && error.message ? error.message : "EMAIL_SEND_FAILED", 240),
              });
              redirectNotice = "user-created-email-failed";
            }
          } else {
            redirectNotice = "user-created-email-skipped";
          }
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsUsersRedirectPath(redirectNotice),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update_user") {
          if (!usersStore || !staffStore) throw new Error("USERS_STORE_UNAVAILABLE");
          const userId = getFormValue(formBody, "userId", 120);
          const existingUser = await usersStore.getUserById(userId, { includeSecret: true });
          if (!existingUser) throw new Error("USER_NOT_FOUND");
          const email = getFormValue(formBody, "email", 200).toLowerCase();
          const phone = normalizeAdminPhoneInput(getFormValue(formBody, "phone", 80));
          const compensationValue = getFormValue(formBody, "compensationValue", 32);
          const compensationType = getFormValue(formBody, "compensationType", 32);
          const userRole = normalizeWorkspaceRoleValue(getFormValue(formBody, "role", 32));
          const isEmployee = resolveUserEmployeeFlag(formBody, userRole);
          const staffRole = formatWorkspaceRoleLabel(userRole);
          let staffId = getFormValue(formBody, "staffId", 120) || existingUser.staffId;
          const password = getFormValue(formBody, "password", 400);
          const staffPayload = {
            name: getFormValue(formBody, "name", 120),
            role: staffRole,
            phone,
            email,
            address: getFormValue(formBody, "address", 500),
            compensationValue,
            compensationType,
            status: getFormValue(formBody, "staffStatus", 32),
            notes: getFormValue(formBody, "notes", 800),
          };
          if (staffId) {
            try {
              await staffStore.updateStaff(staffId, staffPayload);
            } catch {
              const createdStaff = await staffStore.createStaff(staffPayload);
              staffId = createdStaff.id;
            }
          } else {
            const createdStaff = await staffStore.createStaff(staffPayload);
            staffId = createdStaff.id;
          }
          const updatePayload = {
            staffId,
            email,
            phone,
            isEmployee,
            role: userRole,
            status: getFormValue(formBody, "status", 32),
          };
          if (password) {
            updatePayload.passwordHash = adminAuth.hashPassword(password);
          }
          await usersStore.updateUser(userId, updatePayload);
          if (ajaxRequest) {
            writeAjaxMutationSuccess(res, requestStartNs, requestContext, "user-updated");
            return;
          }
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsUsersRedirectPath("user-updated"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "resend_user_invite") {
          if (!usersStore) throw new Error("USERS_STORE_UNAVAILABLE");
          const userId = getFormValue(formBody, "userId", 120);
          const existingUser = await usersStore.getUserById(userId, { includeSecret: true });
          if (!existingUser) throw new Error("USER_NOT_FOUND");

          const inviteEmailStatus =
            accountInviteEmail && typeof accountInviteEmail.getStatus === "function"
              ? await accountInviteEmail.getStatus(config)
              : { configured: false };
          if (!inviteEmailStatus.configured) {
            redirectWithTiming(
              res,
              303,
              adminPageRenderers.buildSettingsUsersRedirectPath("mail-unavailable"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const staffName =
            getFormValue(formBody, "staffName", 120) ||
            (staffStore && existingUser.staffId
              ? (((await staffStore.getSnapshot()).staff || []).find((record) => record.id === existingUser.staffId) || {}).name
              : "") ||
            existingUser.email;

          try {
            const verificationToken = accountAuth.createUserEmailVerificationToken(
              { masterSecret: config.masterSecret },
              {
                userId: existingUser.id,
                email: existingUser.email,
              }
            );
            const verificationUrl = new URL(ACCOUNT_VERIFY_EMAIL_PATH, SITE_ORIGIN);
            verificationUrl.searchParams.set("token", verificationToken);

            const loginUrl = new URL(ACCOUNT_LOGIN_PATH, SITE_ORIGIN);
            const inviteResult = await accountInviteEmail.sendInvite(
              {
                toEmail: existingUser.email,
                staffName,
                verifyUrl: verificationUrl.toString(),
                loginUrl: loginUrl.toString(),
              },
              config
            );
            await usersStore.updateUser(existingUser.id, {
              emailVerificationRequired: existingUser.emailVerifiedAt
                ? existingUser.emailVerificationRequired
                : true,
              emailVerifiedAt: existingUser.emailVerifiedAt || "",
              inviteEmailSentAt: inviteResult && inviteResult.sentAt ? inviteResult.sentAt : new Date().toISOString(),
              inviteEmailLastError: "",
            });
            redirectWithTiming(
              res,
              303,
              adminPageRenderers.buildSettingsUsersRedirectPath("user-invite-sent"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          } catch (error) {
            await usersStore.updateUser(existingUser.id, {
              inviteEmailLastError: normalizeString(error && error.message ? error.message : "EMAIL_SEND_FAILED", 240),
            });
            redirectWithTiming(
              res,
              303,
              adminPageRenderers.buildSettingsUsersRedirectPath("user-invite-error"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }
        }

        if (action === "delete_user") {
          if (!usersStore) throw new Error("USERS_STORE_UNAVAILABLE");
          const existingUser = await resolveLinkedUser(usersStore, {
            userId: getFormValue(formBody, "userId", 120),
          });
          if (!existingUser) throw new Error("USER_NOT_FOUND");

          const linkedStaff = await resolveLinkedStaff(staffStore, {
            staffId: existingUser.staffId,
            email: existingUser.email,
          });

          if (linkedStaff && staffStore) {
            try {
              await staffStore.deleteStaff(linkedStaff.id);
            } catch (error) {
              if (normalizeString(error && error.message, 80) !== "STAFF_NOT_FOUND") {
                throw error;
              }
            }
          }

          await usersStore.deleteUser(existingUser.id);
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsUsersRedirectPath("user-deleted"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
      } catch (error) {
        if (ajaxRequest && action === "update_user") {
          const errorCode = normalizeString(error && error.message ? error.message : "", 80).toUpperCase();
          const notice = errorCode === "USER_NOT_FOUND" ? "user-not-found" : "user-update-failed";
          writeAjaxMutationError(
            res,
            requestStartNs,
            requestContext,
            notice,
            notice === "user-not-found" ? 404 : 500
          );
          return;
        }
      }

      redirectWithTiming(
        res,
        303,
        action.includes("user")
          ? adminPageRenderers.buildSettingsUsersRedirectPath("user-error")
          : adminPageRenderers.buildSettingsRedirectPath(serviceType, "error"),
        requestStartNs,
        requestContext.cacheHit
      );
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
