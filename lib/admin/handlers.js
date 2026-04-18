"use strict";

const fsp = require("node:fs/promises");
const {
  loadStaffContractConfig,
  resolveStaffContractDocumentAbsolutePath,
} = require("../staff-contractor-agreement");
const {
  loadStaffW9Config,
  resolveStaffW9DocumentAbsolutePath,
} = require("../staff-w9");

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

  function buildAdminAuthHeaders(req, cookies = []) {
    void req;
    const headers = {};
    if (cookies.length > 0) {
      headers["Set-Cookie"] = cookies;
    }
    return headers;
  }

  function buildAdminSessionRefreshHeaders(req, adminState) {
    const sessionToken =
      adminState &&
      adminState.session &&
      adminState.cookies &&
      normalizeString(adminState.cookies[ADMIN_SESSION_COOKIE], 4096);
    if (!sessionToken) {
      return {};
    }
    return buildAdminAuthHeaders(req, [
      serializeCookie(ADMIN_SESSION_COOKIE, sessionToken, {
        ...getAdminCookieOptions(req),
        maxAge: adminAuth.SESSION_TTL_SECONDS,
      }),
    ]);
  }

  function getUserCookieOptions(req) {
    return {
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
      secure: shouldUseSecureCookies(req),
    };
  }

  async function resolvePortalUserSession(req, usersStore) {
    const config =
      accountAuth && typeof accountAuth.loadUserAuthConfig === "function"
        ? accountAuth.loadUserAuthConfig(process.env)
        : { configured: false };
    if (!config.configured || !usersStore) {
      return { config, session: null, user: null };
    }

    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies[USER_SESSION_COOKIE];
    if (!token) {
      return { config, session: null, user: null };
    }

    try {
      const session = accountAuth.verifyUserSessionToken(token, config);
      const user = await usersStore.getUserById(session.userId, { includeSecret: true });
      if (
        !user ||
        user.status !== "active" ||
        (user.emailVerificationRequired && !user.emailVerifiedAt)
      ) {
        return { config, session: null, user: null };
      }
      return { config, session, user };
    } catch {
      return { config, session: null, user: null };
    }
  }

  async function authenticateWorkspaceUser(usersStore, email, password) {
    const normalizedEmail = normalizeString(email, 200).toLowerCase();
    const rawPassword = normalizeString(password, 400);
    const config =
      accountAuth && typeof accountAuth.loadUserAuthConfig === "function"
        ? accountAuth.loadUserAuthConfig(process.env)
        : { configured: false };
    if (!config.configured || !usersStore || !normalizedEmail || !rawPassword) {
      return { config, user: null, error: "" };
    }

    const user = await usersStore.findUserByEmail(normalizedEmail, { includeSecret: true });
    const role = normalizeString(user && user.role, 32).toLowerCase();
    const canUseAdminWorkspace = role === "admin" || role === "manager";

    if (!user || user.status !== "active" || !canUseAdminWorkspace) {
      return { config, user: null, error: "" };
    }

    if (user.emailVerificationRequired && !user.emailVerifiedAt) {
      return {
        config,
        user: null,
        error: "Подтвердите email по ссылке из письма, прежде чем входить в админку.",
      };
    }

    if (!user.passwordHash) {
      return {
        config,
        user: null,
        error: "Откройте ссылку из письма ещё раз, чтобы задать первый пароль.",
      };
    }

    if (!adminAuth.verifyPassword(rawPassword, user.passwordHash)) {
      return { config, user: null, error: "" };
    }

    return { config, user, error: "" };
  }

  function buildCurrentUserAccess(session, portalState = {}) {
    if (session) {
      return {
        authorized: true,
        canEdit: true,
        canDelete: true,
        role: "admin",
        logoutPath: ADMIN_LOGOUT_PATH,
        redirectToAccount: false,
        source: "admin-session",
        user: null,
      };
    }

    const portalUser = portalState && portalState.user ? portalState.user : null;
    const role = normalizeString(portalUser && portalUser.role, 32).toLowerCase();
    if (!portalUser) {
      return {
        authorized: false,
        canEdit: false,
        canDelete: false,
        role: "",
        logoutPath: ADMIN_LOGOUT_PATH,
        redirectToAccount: false,
        source: "anonymous",
        user: null,
      };
    }

    if (role === "admin" || role === "manager") {
      return {
        authorized: true,
        canEdit: true,
        canDelete: true,
        role,
        logoutPath: ACCOUNT_LOGOUT_PATH,
        redirectToAccount: false,
        source: "user-session",
        user: portalUser,
      };
    }

    return {
      authorized: false,
      canEdit: false,
      canDelete: false,
      role: role || "cleaner",
      logoutPath: ACCOUNT_LOGOUT_PATH,
      redirectToAccount: true,
      source: "user-session",
      user: portalUser,
    };
  }

  function getUnauthorizedAdminRedirectPath(currentUserAccess, challenge) {
    if (currentUserAccess && currentUserAccess.redirectToAccount) {
      return ACCOUNT_ROOT_PATH;
    }
    void challenge;
    return ADMIN_LOGIN_PATH;
  }

  function redirectUnauthorizedAdminAccess(
    req,
    res,
    requestStartNs,
    requestContext,
    currentUserAccess,
    challenge
  ) {
    void req;
    redirectWithTiming(
      res,
      303,
      getUnauthorizedAdminRedirectPath(currentUserAccess, challenge),
      requestStartNs,
      requestContext.cacheHit
    );
  }

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
        : normalizeLeadStatus(adminLead.status, payload.adminOrder ? "confirmed" : "new");
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
    return normalizeOrderStatus(
      (((entry || {}).payloadForRetry || {}).adminOrder || {}).status,
      "new"
    );
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

  function enforceSlidingRateLimit(rateLimiter, req, res, requestStartNs, requestContext, key, errorMessage) {
    const decision = rateLimiter.take(key);
    if (decision.allowed) return false;
    requestContext.cacheHit = false;
    writeHtmlWithTiming(
      res,
      429,
      adminSharedRenderers.renderAdminLayout(
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

  function normalizeAdminSmsHistoryEntries(entries = []) {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const message = normalizeString(item.message, 1000);
        if (!message) return null;
        return {
          id: normalizeString(item.id, 120) || `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          sentAt: normalizeString(item.sentAt || item.createdAt, 80) || new Date().toISOString(),
          message,
          phone: normalizeString(item.phone, 80),
          contactId: normalizeString(item.contactId, 120),
          channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
          direction: normalizeString(item.direction, 20).toLowerCase() === "inbound" ? "inbound" : "outbound",
          source: normalizeString(item.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
          targetType: normalizeString(item.targetType, 40).toLowerCase(),
          targetRef: normalizeString(item.targetRef, 160),
          conversationId: normalizeString(item.conversationId, 120),
          messageId: normalizeString(item.messageId, 120),
        };
      })
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
      sourceLabel: entry.source === "automatic" ? "Автоматически" : "Вручную",
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

    if (requestContext.route === ADMIN_QUOTE_OPS_RETRY_PATH) {
      if (req.method !== "POST") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступен только POST.</div>`),
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

    if (requestContext.route === ADMIN_QUOTE_OPS_PATH && req.method === "POST") {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const entryId = getFormValue(formBody, "entryId", 120);
      const returnTo = buildQuoteOpsReturnPath(getFormValue(formBody, "returnTo", 1000));

      if (!quoteOpsLedger || !entryId) {
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        if (action === "create-order-from-request") {
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            status: "confirmed",
          });

          redirectWithTiming(
            res,
            303,
            updatedEntry
              ? buildOrdersRedirect(ADMIN_ORDERS_PATH, "order-created", { order: entryId })
              : buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "delete-lead-entry") {
          const deleted = await quoteOpsLedger.deleteEntry(entryId);
          redirectWithTiming(
            res,
            303,
            deleted
              ? buildAdminRedirectPath(returnTo, { notice: "lead-deleted", entry: "" })
              : buildAdminRedirectPath(returnTo, { notice: "lead-missing", entry: "" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "send-quote-sms") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
          if (!message) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "quote-sms-empty",
                400,
                {
                  ...buildSmsAjaxPayload("quote-sms-empty", "Не удалось отправить SMS по заявке.", null, {
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "quote-sms-empty", "quote", entryId),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          if (!leadConnectorClient || typeof leadConnectorClient.sendSmsMessage !== "function" || !leadConnectorClient.isConfigured()) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "quote-sms-unavailable",
                503,
                {
                  ...buildSmsAjaxPayload("quote-sms-unavailable", "Не удалось отправить SMS по заявке.", null, {
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "quote-sms-unavailable", "quote", entryId, {
                smsDraft: message,
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const entry = await quoteOpsLedger.getEntry(entryId);
          if (!entry) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "lead-missing",
                404,
                {
                  ...buildSmsAjaxPayload("quote-sms-failed", "Не удалось отправить SMS по заявке.", [], {
                    errorMessage: "Заявка больше не найдена.",
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "lead-missing", "quote", entryId),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const smsResult = await leadConnectorClient.sendSmsMessage({
            contactId: normalizeString(entry.contactId, 120),
            phone: normalizeString(entry.customerPhone, 80),
            customerName: normalizeString(entry.customerName, 160),
            customerEmail: normalizeString(entry.customerEmail, 250).toLowerCase(),
            message,
          });

          let updatedEntry = entry;
          const nextHistory = smsResult.ok
            ? [
                buildSmsHistoryRecord(smsResult, {
                  message,
                  phone: normalizeString(entry.customerPhone, 80),
                  targetType: "quote",
                  targetRef: entryId,
                  source: "manual",
                }),
                ...getEntrySmsHistoryEntries(entry),
              ]
            : null;

          if (
            smsResult.ok &&
            (!normalizeString(entry.contactId, 120) && normalizeString(smsResult.contactId, 120) || Array.isArray(nextHistory))
          ) {
            try {
              updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
                contactId: normalizeString(smsResult.contactId || entry.contactId, 120),
                smsHistory: nextHistory,
              });
            } catch {
              // Best effort only: SMS already went out successfully.
            }
          }

          const failureNotice =
            smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
              ? "quote-sms-contact-missing"
              : smsResult.code === "NOT_CONFIGURED"
                ? "quote-sms-unavailable"
                : "quote-sms-failed";

          if (ajaxRequest) {
            const historyEntries = smsResult.ok ? getEntrySmsHistoryEntries(updatedEntry || entry) : null;
            const payload = buildSmsAjaxPayload(
              smsResult.ok ? "quote-sms-sent" : failureNotice,
              "Не удалось отправить SMS по заявке.",
              historyEntries,
              {
                errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заявке."),
                draft: message,
              }
            );
            if (smsResult.ok) {
              writeAjaxMutationSuccess(
                res,
                requestStartNs,
                requestContext,
                "quote-sms-sent",
                payload
              );
            } else {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                failureNotice,
                400,
                payload
              );
            }
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(
              returnTo,
              smsResult.ok ? "quote-sms-sent" : failureNotice,
              "quote",
              entryId,
              smsResult.ok
                ? {}
                : {
                    smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заявке."),
                    smsDraft: message,
                  }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update-lead-manager") {
          const selectedManagerId = getFormValue(formBody, "managerId", 120);
          const managerRecord = selectedManagerId
            ? await resolveLeadManagerRecord(usersStore, staffStore, selectedManagerId)
            : null;
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            managerId: managerRecord ? managerRecord.id : "",
            managerName: managerRecord ? managerRecord.name : "",
            managerEmail: managerRecord ? managerRecord.email : "",
          });

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: updatedEntry ? "manager-saved" : "lead-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update-lead-status") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const targetStatus = normalizeLeadStatus(getFormValue(formBody, "leadStatus", 40), "new");
          const hasManagerSelection = Object.prototype.hasOwnProperty.call(formBody, "managerId");
          const selectedManagerId = hasManagerSelection ? getFormValue(formBody, "managerId", 120) : "";
          const managerRecord = selectedManagerId
            ? await resolveLeadManagerRecord(usersStore, staffStore, selectedManagerId)
            : null;
          const discussionNextContactAt = getFormValue(formBody, "discussionNextContactAt", 80);
          if (targetStatus === "discussion" && !discussionNextContactAt) {
            if (ajaxRequest) {
              writeJsonWithTiming(
                res,
                400,
                {
                  ok: false,
                  notice: "discussion-contact-required",
                  error: "discussion-contact-required",
                },
                requestStartNs,
                requestContext.cacheHit
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "discussion-contact-required" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            status: targetStatus,
            ...(hasManagerSelection
              ? {
                  managerId: managerRecord ? managerRecord.id : "",
                  managerName: managerRecord ? managerRecord.name : "",
                  managerEmail: managerRecord ? managerRecord.email : "",
                }
              : {}),
            discussionNextContactAt,
          });
          const notice =
            !updatedEntry
              ? "lead-missing"
              : targetStatus === "confirmed"
                ? "lead-confirmed"
                : "lead-stage-saved";

          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              updatedEntry ? 200 : 404,
              buildLeadMutationPayload(updatedEntry, notice),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update-lead-notes") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            notes: getFormValue(formBody, "notes", 2000),
          });

          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              updatedEntry ? 200 : 404,
              buildLeadMutationPayload(updatedEntry, updatedEntry ? "lead-notes-saved" : "lead-missing"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: updatedEntry ? "lead-notes-saved" : "lead-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "complete-lead-task") {
          const taskAction = getFormValue(formBody, "taskAction", 40).toLowerCase();
          const nextStatus = normalizeLeadStatus(getFormValue(formBody, "nextStatus", 40), "discussion");
          const discussionNextContactAt = getFormValue(formBody, "discussionNextContactAt", 80);
          if (taskAction === "contacted" && nextStatus === "discussion" && !discussionNextContactAt) {
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "discussion-contact-required" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            taskId: getFormValue(formBody, "taskId", 120),
            taskAction,
            nextStatus,
            discussionNextContactAt,
          });
          const notice =
            !updatedEntry
              ? "lead-missing"
              : taskAction === "contacted" && nextStatus === "confirmed"
                ? "lead-confirmed"
                : "task-saved";

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch (error) {
        if (action === "send-quote-sms") {
          if (isAjaxMutationRequest(req)) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "quote-sms-failed",
              500,
              {
                ...buildSmsAjaxPayload("quote-sms-failed", "Не удалось отправить SMS по заявке.", null, {
                  errorMessage: normalizeString(error && error.message ? error.message : "", 240),
                }),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "quote-sms-failed", "quote", entryId),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "lead-save-failed" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_ORDERS_PATH && req.method === "POST") {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      const contentType = normalizeString(req.headers["content-type"], 240).toLowerCase();
      const isMultipart = contentType.startsWith("multipart/form-data");
      const isJson = contentType.startsWith("application/json");
      const multipartBody =
        isMultipart ? await parseMultipartFormBody(await readBufferBody(req, 32 * 1024 * 1024), contentType) : null;
      const jsonBody =
        !isMultipart && isJson ? await readJsonBody(req, 64 * 1024) : null;
      const formBody = multipartBody
        ? multipartBody.fields
        : jsonBody && typeof jsonBody === "object"
          ? jsonBody
          : parseFormBody(await readTextBody(req, 32 * 1024));
      const formFiles = multipartBody && multipartBody.files ? multipartBody.files : {};
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const entryId = getFormValue(formBody, "entryId", 120);
      const returnTo = buildOrdersReturnPath(getFormValue(formBody, "returnTo", 1000));
      const ajaxRequest =
        isAjaxMutationRequest(req) ||
        normalizeString(getRequestUrl(req).searchParams.get("ajax"), 8) === "1";
      if (
        action === "delete-order" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

      if (action === "create-manual-order") {
        const customerName = getFormValue(formBody, "customerName", 250);
        const customerPhone = getFormValue(formBody, "customerPhone", 80);
        const customerEmail = getFormValue(formBody, "customerEmail", 250).toLowerCase();
        const fullAddress = getFormValue(formBody, "fullAddress", 500);
        const serviceType = normalizeManualOrderServiceType(getFormValue(formBody, "serviceType", 40));
        const serviceName = formatManualOrderServiceLabel(serviceType);
        const selectedDate = getFormValue(formBody, "selectedDate", 32);
        const selectedTime = getFormValue(formBody, "selectedTime", 32);
        const frequency = normalizeManualOrderFrequency(getFormValue(formBody, "frequency", 40));
        const totalPrice = getFormValue(formBody, "totalPrice", 64);

        if (!quoteOpsLedger || !customerName || !customerPhone || !fullAddress) {
          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, "manual-order-invalid", { createOrder: "1" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        try {
          const createdEntry = await quoteOpsLedger.recordSubmission({
            ok: true,
            requestId: buildManualOrderRequestId(customerName),
            sourceRoute: ADMIN_ORDERS_PATH,
            source: "Manual admin order",
            customerName,
            customerPhone,
            customerEmail,
            serviceType,
            serviceName,
            totalPrice: 0,
            totalPriceCents: 0,
            selectedDate: "",
            selectedTime: "",
            fullAddress,
            httpStatus: 200,
            code: "MANUAL_ORDER_CREATED",
            retryable: false,
            warnings: [],
            errorMessage: "",
            payloadForRetry: {
              calculatorData: {
                serviceType,
                frequency,
                fullAddress,
                address: fullAddress,
                selectedDate,
                selectedTime,
              },
            },
          });

          const updatedEntry = await quoteOpsLedger.updateOrderEntry(createdEntry.id, {
            createOrder: true,
            orderStatus: selectedDate || selectedTime ? "scheduled" : "new",
            selectedDate,
            selectedTime,
            frequency,
            totalPrice,
            paymentStatus: "unpaid",
          });

          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(
              ADMIN_ORDERS_PATH,
              updatedEntry ? "manual-order-created" : "order-save-failed",
              { order: (updatedEntry || createdEntry).id }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        } catch {
          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, "order-save-failed", { createOrder: "1" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
      }

      if (!quoteOpsLedger || !entryId) {
        if (ajaxRequest && (action === "save-order-completion" || action === "save-order-cleaner-comment")) {
          writeJsonWithTiming(
            res,
            404,
            {
              ok: false,
              notice: "order-missing",
              error: "order-missing",
              message: "Заказ не найден.",
            },
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
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
        if (action === "send-order-sms") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
          if (!message) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "order-sms-empty",
                400,
                {
                  ...buildSmsAjaxPayload("order-sms-empty", "Не удалось отправить SMS по заказу.", null, {
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "order-sms-empty", "order", entryId),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          if (!leadConnectorClient || typeof leadConnectorClient.sendSmsMessage !== "function" || !leadConnectorClient.isConfigured()) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "order-sms-unavailable",
                503,
                {
                  ...buildSmsAjaxPayload("order-sms-unavailable", "Не удалось отправить SMS по заказу.", null, {
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "order-sms-unavailable", "order", entryId, {
                smsDraft: message,
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const currentEntry = await quoteOpsLedger.getEntry(entryId);
          if (!currentEntry) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "order-missing",
                404,
                {
                  ...buildSmsAjaxPayload("order-sms-failed", "Не удалось отправить SMS по заказу.", [], {
                    errorMessage: "Заказ больше не найден.",
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "order-missing", "order", entryId),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const smsResult = await leadConnectorClient.sendSmsMessage({
            contactId: normalizeString(currentEntry.contactId, 120),
            phone: normalizeString(currentEntry.customerPhone, 80),
            customerName: normalizeString(currentEntry.customerName, 160),
            customerEmail: normalizeString(currentEntry.customerEmail, 250).toLowerCase(),
            message,
          });

          let updatedEntry = currentEntry;
          const nextHistory = smsResult.ok
            ? [
                buildSmsHistoryRecord(smsResult, {
                  message,
                  phone: normalizeString(currentEntry.customerPhone, 80),
                  targetType: "order",
                  targetRef: entryId,
                  source: "manual",
                }),
                ...getEntrySmsHistoryEntries(currentEntry),
              ]
            : null;

          if (smsResult.ok) {
            try {
              updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
                contactId: normalizeString(smsResult.contactId || currentEntry.contactId, 120),
                smsHistory: nextHistory,
              });
            } catch {
              // Best effort only: SMS already went out successfully.
            }
          }

          const failureNotice =
            smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
              ? "order-sms-contact-missing"
              : smsResult.code === "NOT_CONFIGURED"
                ? "order-sms-unavailable"
                : "order-sms-failed";

          if (ajaxRequest) {
            const historyEntries = smsResult.ok ? getEntrySmsHistoryEntries(updatedEntry || currentEntry) : null;
            const payload = buildSmsAjaxPayload(
              smsResult.ok ? "order-sms-sent" : failureNotice,
              "Не удалось отправить SMS по заказу.",
              historyEntries,
              {
                errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заказу."),
                draft: message,
              }
            );
            if (smsResult.ok) {
              writeAjaxMutationSuccess(
                res,
                requestStartNs,
                requestContext,
                "order-sms-sent",
                payload
              );
            } else {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                failureNotice,
                400,
                payload
              );
            }
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(
              returnTo,
              smsResult.ok ? "order-sms-sent" : failureNotice,
              "order",
              entryId,
              smsResult.ok
                ? {}
                : {
                    smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заказу."),
                    smsDraft: message,
                  }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const currentEntry =
          action === "save-order-cleaner-comment" ||
          action === "save-order-completion" ||
          action === "delete-order"
            ? null
            : await quoteOpsLedger.getEntry(entryId);

        if (action === "save-order-cleaner-comment") {
          const cleanerComment = getFormValue(formBody, "cleanerComment", 4000).replace(/\r\n?/g, "\n");
          const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
            cleanerComment,
          });

          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              updatedEntry ? 200 : 404,
              buildOrderCompletionMutationPayload(
                updatedEntry,
                updatedEntry ? "completion-saved" : "order-missing",
                { message: "Комментарий клинера сохранён." }
              ),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, updatedEntry ? "completion-saved" : "order-missing"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "save-order-completion") {
          const currentEntry = await quoteOpsLedger.getEntry(entryId);
          if (!currentEntry) {
            if (ajaxRequest) {
              writeJsonWithTiming(
                res,
                404,
                {
                  ok: false,
                  notice: "order-missing",
                  error: "order-missing",
                  message: "Заказ не найден.",
                },
                requestStartNs,
                requestContext.cacheHit
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "order-missing" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const existingCompletion = getEntryOrderCompletionData(currentEntry);
          const beforeUploads =
            orderMediaStorage && Array.isArray(formFiles.beforePhotos)
              ? await orderMediaStorage.uploadFiles(entryId, "before", formFiles.beforePhotos)
              : [];
          const afterUploads =
            orderMediaStorage && Array.isArray(formFiles.afterPhotos)
              ? await orderMediaStorage.uploadFiles(entryId, "after", formFiles.afterPhotos)
              : [];

          if (orderMediaStorage) {
            if (beforeUploads.length > 0 && existingCompletion.beforePhotos.length > 0) {
              await orderMediaStorage.deleteAssets(existingCompletion.beforePhotos);
            }
            if (afterUploads.length > 0 && existingCompletion.afterPhotos.length > 0) {
              await orderMediaStorage.deleteAssets(existingCompletion.afterPhotos);
            }
          }

          const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
            completionBeforePhotos: beforeUploads.length > 0 ? beforeUploads : existingCompletion.beforePhotos,
            completionAfterPhotos: afterUploads.length > 0 ? afterUploads : existingCompletion.afterPhotos,
          });

          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              updatedEntry ? 200 : 404,
              buildOrderCompletionMutationPayload(updatedEntry, updatedEntry ? "completion-saved" : "order-missing"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, "completion-saved"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "delete-order") {
          const existingEntry = await quoteOpsLedger.getEntry(entryId);
          if (googleCalendarIntegration && typeof googleCalendarIntegration.clearAssignmentEvents === "function") {
            try {
              await googleCalendarIntegration.clearAssignmentEvents(entryId, config);
            } catch {}
          }
          const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, { removeOrder: true });
          if (updatedEntry && orderMediaStorage && existingEntry) {
            const completionData = getEntryOrderCompletionData(existingEntry);
            await orderMediaStorage.deleteAssets([
              ...completionData.beforePhotos,
              ...completionData.afterPhotos,
            ]);
          }
          if (updatedEntry && staffStore && typeof staffStore.clearAssignment === "function") {
            try {
              await staffStore.clearAssignment(entryId);
            } catch {}
          }
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: updatedEntry ? "order-deleted" : "order-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "resend-order-policy") {
          const currentPolicyAcceptance =
            typeof getEntryOrderPolicyAcceptanceData === "function"
              ? getEntryOrderPolicyAcceptanceData(currentEntry)
              : {};

          if (currentPolicyAcceptance.policyAccepted) {
            redirectWithTiming(
              res,
              303,
              buildOrdersRedirect(returnTo, "order-policy-already-signed"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const resendResult = await sendOrderPolicyAcceptanceInvite(
            quoteOpsLedger,
            entryId,
            currentEntry,
            config,
            leadConnectorClient
          );

          let notice = "order-policy-resend-failed";
          if (resendResult.emailState === "sent") {
            notice = resendResult.smsState === "sent" ? "order-policy-resent" : "order-policy-resent-email-only";
          } else if (resendResult.emailState === "sms-only") {
            notice = "order-policy-resent-sms-only";
          } else if (resendResult.emailState === "unavailable") {
            notice = "order-policy-resend-unavailable";
          } else if (resendResult.emailState === "missing-recipient") {
            notice = "order-policy-resend-missing-recipient";
          }

          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, notice),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "reset-order-policy") {
          const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
            policyAcceptance: null,
          });

          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, updatedEntry ? "order-policy-reset" : "order-missing"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const existingAdminOrder =
          currentEntry &&
          currentEntry.payloadForRetry &&
          typeof currentEntry.payloadForRetry === "object" &&
          currentEntry.payloadForRetry.adminOrder &&
          typeof currentEntry.payloadForRetry.adminOrder === "object"
            ? currentEntry.payloadForRetry.adminOrder
            : {};
        const existingRecurringNextEntryId = normalizeString(existingAdminOrder.recurringNextEntryId, 120);

        const orderUpdates = {};
        const selectedAssignedStaffNames = Object.prototype.hasOwnProperty.call(formBody, "assignedStaff")
          ? getFormValues(formBody, "assignedStaff", 8, 120)
          : null;
        const requestedOrderStatus = getFormValue(formBody, "orderStatus", 40);
        const requestedPolicyStage = normalizeString(requestedOrderStatus, 40).toLowerCase() === "policy";
        if (Object.prototype.hasOwnProperty.call(formBody, "orderStatus")) {
          orderUpdates.orderStatus = requestedPolicyStage ? "scheduled" : requestedOrderStatus;
        }
        let resolvedAssignedStaff = null;
        if (selectedAssignedStaffNames) {
          if (staffStore && typeof staffStore.getSnapshot === "function") {
            resolvedAssignedStaff = await resolveAssignableStaffIdsByNames(
              staffStore,
              usersStore,
              selectedAssignedStaffNames
            );
            orderUpdates.assignedStaff = resolvedAssignedStaff.staffNames.join(", ");
          } else {
            orderUpdates.assignedStaff = selectedAssignedStaffNames.join(", ");
          }
        }
        if (Object.prototype.hasOwnProperty.call(formBody, "paymentStatus")) {
          orderUpdates.paymentStatus = getFormValue(formBody, "paymentStatus", 40);
        }
        if (Object.prototype.hasOwnProperty.call(formBody, "paymentMethod")) {
          orderUpdates.paymentMethod = getFormValue(formBody, "paymentMethod", 40);
        }
        if (Object.prototype.hasOwnProperty.call(formBody, "totalPrice")) {
          orderUpdates.totalPrice = getFormValue(formBody, "totalPrice", 64);
        }
        if (Object.prototype.hasOwnProperty.call(formBody, "selectedDate")) {
          orderUpdates.selectedDate = getFormValue(formBody, "selectedDate", 32);
        }
        if (Object.prototype.hasOwnProperty.call(formBody, "selectedTime")) {
          orderUpdates.selectedTime = getFormValue(formBody, "selectedTime", 32);
        }
        if (Object.prototype.hasOwnProperty.call(formBody, "frequency")) {
          orderUpdates.frequency = getFormValue(formBody, "frequency", 40);
        }

        const previousOrderStatus = getOrderStatusFromEntry(currentEntry);
        const currentPolicyAcceptance =
          typeof getEntryOrderPolicyAcceptanceData === "function"
            ? getEntryOrderPolicyAcceptanceData(currentEntry)
            : {};
        let updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, orderUpdates);
        const nextOrderStatus = getOrderStatusFromEntry(updatedEntry);
        const transitionedToScheduled =
          Boolean(updatedEntry) &&
          (requestedPolicyStage || (previousOrderStatus !== "scheduled" && nextOrderStatus === "scheduled"));
        let assignmentForNotifications = null;

        if (updatedEntry && selectedAssignedStaffNames && staffStore && typeof staffStore.setAssignment === "function") {
          const { snapshot: staffSnapshot, staffIds } =
            resolvedAssignedStaff ||
            await resolveAssignableStaffIdsByNames(
              staffStore,
              usersStore,
              selectedAssignedStaffNames
            );
          const existingAssignment =
            staffSnapshot && Array.isArray(staffSnapshot.assignments)
              ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
              : null;

          await staffStore.setAssignment(entryId, {
            staffIds,
            scheduleDate: existingAssignment
              ? existingAssignment.scheduleDate
              : normalizeString(updatedEntry && updatedEntry.selectedDate, 32),
            scheduleTime: existingAssignment
              ? existingAssignment.scheduleTime
              : normalizeString(updatedEntry && updatedEntry.selectedTime, 32),
            status:
              existingAssignment && staffIds.length > 0
                ? existingAssignment.status
                : "planned",
            notes: existingAssignment ? existingAssignment.notes : "",
            calendarSync: existingAssignment ? existingAssignment.calendarSync : null,
          });
          assignmentForNotifications =
            (staffStore && typeof staffStore.getSnapshot === "function"
              ? (((await staffStore.getSnapshot()).assignments || []).find((record) => record && record.entryId === entryId) || null)
              : null) || assignmentForNotifications;
        } else if (
          transitionedToScheduled &&
          updatedEntry &&
          staffStore &&
          typeof staffStore.getSnapshot === "function"
        ) {
          const staffSnapshot = await staffStore.getSnapshot();
          assignmentForNotifications = Array.isArray(staffSnapshot.assignments)
            ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
            : null;
        }

        if (
          updatedEntry &&
          previousOrderStatus !== "completed" &&
          normalizeOrderStatus(
            updatedEntry &&
              updatedEntry.payloadForRetry &&
              typeof updatedEntry.payloadForRetry === "object" &&
              updatedEntry.payloadForRetry.adminOrder &&
              typeof updatedEntry.payloadForRetry.adminOrder === "object"
              ? updatedEntry.payloadForRetry.adminOrder.status
              : "",
            "new"
          ) === "completed" &&
          !existingRecurringNextEntryId &&
          typeof buildRecurringOrderSubmission === "function"
        ) {
          const recurringSubmission = buildRecurringOrderSubmission(updatedEntry);
          if (recurringSubmission) {
            const recurringEntry = await quoteOpsLedger.recordSubmission(recurringSubmission);
            if (recurringEntry) {
              const recurringAdminOrder =
                recurringSubmission.payloadForRetry &&
                typeof recurringSubmission.payloadForRetry === "object" &&
                recurringSubmission.payloadForRetry.adminOrder &&
                typeof recurringSubmission.payloadForRetry.adminOrder === "object"
                  ? recurringSubmission.payloadForRetry.adminOrder
                  : {};
              await quoteOpsLedger.updateOrderEntry(entryId, {
                recurringNextEntryId: recurringEntry.id,
                recurringGeneratedAt: recurringEntry.createdAt,
                recurringSeriesId: normalizeString(recurringAdminOrder.recurringSeriesId, 120),
              });
            }
          }
        }

        let notice = updatedEntry ? "order-saved" : "order-missing";
        let calendarSyncFailed = false;
        if (updatedEntry && googleCalendarIntegration && typeof googleCalendarIntegration.syncAssignment === "function") {
          try {
            await googleCalendarIntegration.syncAssignment(entryId, config, updatedEntry);
          } catch {
            calendarSyncFailed = true;
          }
        }

        if (transitionedToScheduled) {
          const enteredScheduledStage =
            Boolean(updatedEntry) &&
            (requestedPolicyStage || (previousOrderStatus !== "scheduled" && nextOrderStatus === "scheduled")) &&
            !currentPolicyAcceptance.policyAccepted;

          let policyEmailState = "";
          if (
            enteredScheduledStage &&
            orderPolicyAcceptance &&
            typeof orderPolicyAcceptance.buildPendingAcceptance === "function"
          ) {
            const inviteResult = await sendOrderPolicyAcceptanceInvite(
              quoteOpsLedger,
              entryId,
              updatedEntry,
              config,
              leadConnectorClient
            );
            updatedEntry = inviteResult.updatedEntry;
            policyEmailState = inviteResult.emailState || "failed";
          }

          if (policyEmailState === "sent") {
            notice = calendarSyncFailed
              ? "order-saved-calendar-policy-email-sent"
              : "order-saved-policy-email-sent";
          } else if (policyEmailState === "sms-only") {
            notice = calendarSyncFailed
              ? "order-saved-calendar-policy-sms-sent"
              : "order-saved-policy-sms-sent";
          } else if (policyEmailState === "failed") {
            notice = calendarSyncFailed
              ? "order-saved-calendar-policy-email-error"
              : "order-saved-policy-email-failed";
          } else if (policyEmailState === "unavailable") {
            notice = "order-saved-policy-email-unavailable";
          } else if (policyEmailState === "missing-recipient") {
            notice = "order-saved-policy-email-missing-recipient";
          } else if (calendarSyncFailed) {
            notice = "order-saved-calendar-error";
          }
        } else if (calendarSyncFailed) {
          notice = "order-saved-calendar-error";
        }

        if (
          updatedEntry &&
          assignmentForNotifications &&
          autoNotificationService &&
          typeof autoNotificationService.notifyScheduledAssignment === "function"
        ) {
          try {
            const notificationResult = await autoNotificationService.notifyScheduledAssignment({
              entry: updatedEntry,
              assignment: assignmentForNotifications,
              leadConnectorClient,
            });
            if (notificationResult && notificationResult.entry) {
              updatedEntry = notificationResult.entry;
            }
          } catch {}
        }

        if (ajaxRequest) {
          writeJsonWithTiming(
            res,
            updatedEntry ? 200 : 404,
            buildOrderStageMutationPayload(updatedEntry, updatedEntry ? notice : "order-missing"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, notice),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch (error) {
        if (ajaxRequest && (action === "save-order-completion" || action === "save-order-cleaner-comment")) {
          const errorMessage = normalizeString(error && error.message ? error.message : "", 200);
          writeJsonWithTiming(
            res,
            500,
            {
              ok: false,
              notice: "completion-save-failed",
              error: "completion-save-failed",
              message: errorMessage
                ? action === "save-order-cleaner-comment"
                  ? `Не удалось сохранить комментарий клинера: ${errorMessage}.`
                  : `Не удалось сохранить фотографии: ${errorMessage}.`
                : action === "save-order-cleaner-comment"
                  ? "Не удалось сохранить комментарий клинера. Попробуйте ещё раз."
                  : "Не удалось сохранить фотографии. Попробуйте ещё раз.",
            },
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
        if (action === "send-order-sms") {
          if (ajaxRequest) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "order-sms-failed",
              500,
              {
                ...buildSmsAjaxPayload("order-sms-failed", "Не удалось отправить SMS по заказу.", null, {
                  errorMessage: normalizeString(error && error.message ? error.message : "", 240),
                }),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "order-sms-failed", "order", entryId, {
              smsError: normalizeString(error && error.message ? error.message : "", 240),
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
        if (ajaxRequest) {
          const errorMessage = normalizeString(error && error.message ? error.message : "", 200);
          writeAjaxMutationError(
            res,
            requestStartNs,
            requestContext,
            "order-save-failed",
            500,
            {
              message: errorMessage
                ? `Не удалось сохранить заказ: ${errorMessage}.`
                : "Не удалось сохранить заказ. Попробуйте ещё раз.",
            }
          );
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, {
            notice:
              action === "delete-order"
                ? "order-delete-failed"
                : action === "save-order-completion" || action === "save-order-cleaner-comment"
                  ? "completion-save-failed"
                  : "order-save-failed",
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_ORDERS_PATH && req.method === "GET") {
      const reqUrl = getRequestUrl(req);
      if (reqUrl.searchParams.get("media") === "1") {
        if (!ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge)) {
          return;
        }

        const entryId = normalizeString(reqUrl.searchParams.get("entryId"), 120);
        const assetId = normalizeString(reqUrl.searchParams.get("asset"), 180);
        if (!quoteOpsLedger || !orderMediaStorage || !entryId || !assetId) {
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

        try {
          const entry = await quoteOpsLedger.getEntry(entryId);
          const completionData = entry ? getEntryOrderCompletionData(entry) : null;
          const asset =
            completionData
              ? [...completionData.beforePhotos, ...completionData.afterPhotos].find(
                  (item) => normalizeString(item.id, 180) === assetId
                ) || null
              : null;
          if (!asset) {
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

          const media = await orderMediaStorage.getAsset(asset);
          writeHeadWithTiming(
            res,
            200,
            {
              "Content-Type": media.contentType || asset.contentType || "application/octet-stream",
              "Content-Length": String(media.sizeBytes || media.buffer.length),
              "Cache-Control": "private, max-age=300",
              "Content-Disposition": `inline; filename="${media.fileName || asset.fileName || "order-photo.jpg"}"`,
            },
            requestStartNs,
            requestContext.cacheHit
          );
          res.end(media.buffer);
          return;
        } catch {
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
      }
    }

    if (requestContext.route === ADMIN_CLIENTS_PATH && req.method === "POST") {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const clientKey = getFormValue(formBody, "clientKey", 250).toLowerCase();
      const returnTo = buildClientsReturnPath(getFormValue(formBody, "returnTo", 1000));
      const ajaxRequest = isAjaxMutationRequest(req);
      if (
        action === "delete-client" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

      if (!["delete-client", "update-client", "send-client-sms"].includes(action) || !quoteOpsLedger || !clientKey) {
        if (ajaxRequest) {
          writeAjaxMutationError(res, requestStartNs, requestContext, "client-missing", 404);
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "client-missing" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        const allEntries = await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT });
        const client = collectAdminClientRecords(allEntries).find((record) => record.key === clientKey);
        if (!client || client.entries.length === 0) {
          if (ajaxRequest) {
            writeAjaxMutationError(res, requestStartNs, requestContext, "client-missing", 404);
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice: "client-missing", client: "" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update-client") {
          const addressValues = getFormValues(formBody, "addresses", 20, 500);
          const addressPropertyTypes = getFormValues(formBody, "addressPropertyTypes", 20, 40);
          const addressSquareFootages = getFormValues(formBody, "addressSquareFootages", 20, 120);
          const addressRoomCounts = getFormValues(formBody, "addressRoomCounts", 20, 120);
          const legacyAddressHomeProfiles = getFormValues(formBody, "addressHomeProfiles", 20, 250);
          const addressPets = getFormValues(formBody, "addressPets", 20, 40);
          const addressNotes = getFormValues(formBody, "addressNotes", 20, 800);
          const submittedAddressBook = addressValues.map((address, index) => ({
            address,
            propertyType: addressPropertyTypes[index] || "",
            squareFootage: addressSquareFootages[index] || "",
            roomCount: addressRoomCounts[index] || "",
            sizeDetails: legacyAddressHomeProfiles[index] || "",
            pets: addressPets[index] || "",
            notes: addressNotes[index] || "",
          }));
          const submittedAddressKeys = new Set(
            submittedAddressBook
              .map((addressRecord) => normalizeString(addressRecord.address, 500).toLowerCase())
              .filter(Boolean)
          );
          const removedAddressKeys = Array.from(
            new Set([
              ...(Array.isArray(client.removedAddressKeys) ? client.removedAddressKeys : []),
              ...(Array.isArray(client.addresses)
                ? client.addresses
                  .map((addressRecord) => normalizeString(addressRecord && (addressRecord.key || addressRecord.address), 500).toLowerCase())
                  .filter((key) => key && !submittedAddressKeys.has(key))
                : []),
            ])
          ).filter((key) => key && !submittedAddressKeys.has(key));
          const updates = {
            name: getFormValue(formBody, "name", 250),
            phone: getFormValue(formBody, "phone", 80),
            email: getFormValue(formBody, "email", 250),
            address: getFormValue(formBody, "address", 500),
            addresses: addressValues,
            addressBook: submittedAddressBook,
            removedAddressKeys,
          };
          if (!updates.name) {
            if (ajaxRequest) {
              writeAjaxMutationError(res, requestStartNs, requestContext, "client-save-failed", 400);
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "client-save-failed", client: clientKey }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const updatedEntryIds = [];
          for (const entry of client.entries) {
            if (!entry.id) continue;
            const updatedEntry = await quoteOpsLedger.updateClientEntry(entry.id, updates);
            if (updatedEntry && updatedEntry.id) {
              updatedEntryIds.push(updatedEntry.id);
            } else {
              updatedEntryIds.push(entry.id);
            }
          }

          const refreshedEntries = await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT });
          const refreshedClient = collectAdminClientRecords(refreshedEntries).find((record) =>
            record.entries.some((entry) => updatedEntryIds.includes(entry.id))
          );

          if (ajaxRequest) {
            writeAjaxMutationSuccess(
              res,
              requestStartNs,
              requestContext,
              "client-saved",
              {
                clientKey: refreshedClient ? refreshedClient.key : clientKey,
              }
            );
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: "client-saved",
              client: refreshedClient ? refreshedClient.key : clientKey,
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "send-client-sms") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
          if (!message) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "client-sms-empty",
                400,
                {
                  ...buildSmsAjaxPayload("client-sms-empty", "Не удалось отправить SMS клиенту.", null, {
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "client-sms-empty", "client", clientKey),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          if (!leadConnectorClient || typeof leadConnectorClient.sendSmsMessage !== "function" || !leadConnectorClient.isConfigured()) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "client-sms-unavailable",
                503,
                {
                  ...buildSmsAjaxPayload("client-sms-unavailable", "Не удалось отправить SMS клиенту.", null, {
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "client-sms-unavailable", "client", clientKey, {
                smsDraft: message,
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const contactEntry = Array.isArray(client.entries)
            ? client.entries.find((entry) => normalizeString(entry && entry.contactId, 120))
            : null;
          const historyEntry =
            contactEntry ||
            (Array.isArray(client.entries) && client.entries.length > 0 ? client.entries[0] : null);
          const smsResult = await leadConnectorClient.sendSmsMessage({
            contactId: normalizeString(contactEntry && contactEntry.contactId, 120),
            phone: normalizeString(client.phone || (contactEntry && contactEntry.customerPhone), 80),
            customerName: normalizeString(client.name, 160),
            customerEmail: normalizeString(client.email, 250).toLowerCase(),
            message,
          });

          let updatedHistoryEntry = historyEntry;
          let clientHistoryEntries = getClientSmsHistoryEntries(client);
          const nextHistory = smsResult.ok && historyEntry
            ? [
                buildSmsHistoryRecord(smsResult, {
                  message,
                  phone: normalizeString(client.phone || (historyEntry && historyEntry.customerPhone), 80),
                  targetType: "client",
                  targetRef: clientKey,
                  source: "manual",
                }),
                ...getEntrySmsHistoryEntries(historyEntry),
              ]
            : null;

          if (smsResult.ok && historyEntry) {
            try {
              updatedHistoryEntry = await quoteOpsLedger.updateClientEntry(historyEntry.id, {
                contactId: normalizeString(smsResult.contactId || (historyEntry && historyEntry.contactId), 120),
                smsHistory: nextHistory,
              });
              clientHistoryEntries = getClientSmsHistoryEntries({
                ...client,
                entries: Array.isArray(client.entries)
                  ? client.entries.map((entry) =>
                      normalizeString(entry && entry.id, 120) === normalizeString(updatedHistoryEntry && updatedHistoryEntry.id, 120)
                        ? updatedHistoryEntry
                        : entry
                    )
                  : [],
              });
            } catch {
              // Best effort only: SMS already went out successfully.
            }
          }

          const failureNotice =
            smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
              ? "client-sms-contact-missing"
              : smsResult.code === "NOT_CONFIGURED"
                ? "client-sms-unavailable"
                : "client-sms-failed";

          if (ajaxRequest) {
            const payload = buildSmsAjaxPayload(
              smsResult.ok ? "client-sms-sent" : failureNotice,
              "Не удалось отправить SMS клиенту.",
              smsResult.ok ? clientHistoryEntries : null,
              {
                errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS клиенту."),
                draft: message,
              }
            );
            if (smsResult.ok) {
              writeAjaxMutationSuccess(
                res,
                requestStartNs,
                requestContext,
                "client-sms-sent",
                payload
              );
            } else {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                failureNotice,
                400,
                payload
              );
            }
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(
              returnTo,
              smsResult.ok ? "client-sms-sent" : failureNotice,
              "client",
              clientKey,
              smsResult.ok
                ? {}
                : {
                    smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS клиенту."),
                    smsDraft: message,
                  }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        let deletedCount = 0;
        for (const entry of client.entries) {
          if (!entry.id) continue;
          if (googleCalendarIntegration && typeof googleCalendarIntegration.clearAssignmentEvents === "function") {
            try {
              await googleCalendarIntegration.clearAssignmentEvents(entry.id, config);
            } catch {}
          }
          const deleted = await quoteOpsLedger.deleteEntry(entry.id);
          if (!deleted) continue;
          deletedCount += 1;
          if (staffStore && typeof staffStore.clearAssignment === "function") {
            try {
              await staffStore.clearAssignment(entry.id);
            } catch {}
          }
        }

        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, {
            notice: deletedCount > 0 ? "client-deleted" : "client-missing",
            client: "",
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch (error) {
        if (ajaxRequest && action === "update-client") {
          writeAjaxMutationError(res, requestStartNs, requestContext, "client-save-failed", 500);
          return;
        }
        if (action === "send-client-sms") {
          if (isAjaxMutationRequest(req)) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "client-sms-failed",
              500,
              {
                ...buildSmsAjaxPayload("client-sms-failed", "Не удалось отправить SMS клиенту.", null, {
                  errorMessage: normalizeString(error && error.message ? error.message : "", 240),
                }),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "client-sms-failed", "client", clientKey),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, {
            notice: action === "delete-client" ? "client-delete-failed" : "client-save-failed",
            client: action === "delete-client" ? "" : clientKey,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_STAFF_PATH && req.method === "POST") {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 12 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const ajaxRequest = isAjaxMutationRequest(req);
      if (
        action === "delete-staff" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

      if (!staffStore) {
        if (ajaxRequest) {
          writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 500);
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("staff-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        if (action === "disconnect-google-calendar") {
          if (
            googleCalendarIntegration &&
            typeof googleCalendarIntegration.disconnectStaffCalendar === "function"
          ) {
            await googleCalendarIntegration.disconnectStaffCalendar(
              getFormValue(formBody, "staffId", 120),
              config
            );
          } else {
            await staffStore.updateStaff(getFormValue(formBody, "staffId", 120), {
              calendar: null,
            });
          }
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("calendar-disconnected"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "create-staff") {
          const userRole = normalizeWorkspaceRoleValue(getFormValue(formBody, "role", 80));
          await staffStore.createStaff({
            name: getFormValue(formBody, "name", 120),
            role: formatWorkspaceRoleLabel(userRole),
            phone: normalizeAdminPhoneInput(getFormValue(formBody, "phone", 80)),
            email: getFormValue(formBody, "email", 200),
            address: getFormValue(formBody, "address", 500),
            compensationValue: getFormValue(formBody, "compensationValue", 32),
            compensationType: getFormValue(formBody, "compensationType", 32),
            status: getFormValue(formBody, "status", 32),
            notes: getFormValue(formBody, "notes", 800),
          });
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("staff-created"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update-staff") {
          const staffId = getFormValue(formBody, "staffId", 120);
          const userRole = normalizeWorkspaceRoleValue(
            getFormValue(formBody, "role", 80) || getFormValue(formBody, "userRole", 80)
          );
          const email = getFormValue(formBody, "email", 200).toLowerCase();
          await staffStore.updateStaff(staffId, {
            name: getFormValue(formBody, "name", 120),
            role: formatWorkspaceRoleLabel(userRole),
            phone: normalizeAdminPhoneInput(getFormValue(formBody, "phone", 80)),
            email,
            address: getFormValue(formBody, "address", 500),
            compensationValue: getFormValue(formBody, "compensationValue", 32),
            compensationType: getFormValue(formBody, "compensationType", 32),
            status: getFormValue(formBody, "status", 32),
            notes: getFormValue(formBody, "notes", 800),
          });
          if (usersStore) {
            const nextUserRole = userRole;
            let userId = getFormValue(formBody, "userId", 120);
            if (!userId && staffId) {
              try {
                const usersSnapshot = await usersStore.getSnapshot();
                const linkedUser =
                  usersSnapshot && Array.isArray(usersSnapshot.users)
                    ? usersSnapshot.users.find(
                        (user) =>
                          user &&
                          (user.staffId === staffId ||
                            (email && normalizeString(user.email, 200).toLowerCase() === email))
                      ) || null
                    : null;
                userId = linkedUser ? linkedUser.id : "";
              } catch {}
            }
            if (userId && nextUserRole) {
              await usersStore.updateUser(userId, { role: nextUserRole, staffId, email });
            }
          }
          if (ajaxRequest) {
            writeAjaxMutationSuccess(res, requestStartNs, requestContext, "staff-updated");
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("staff-updated"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "send-staff-sms") {
          const staffId = getFormValue(formBody, "staffId", 120);
          const message = getFormValue(formBody, "message", 1000);
          const returnTo = buildStaffReturnPath(getFormValue(formBody, "returnTo", 1000));

          if (!message) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "staff-sms-empty",
                400,
                {
                  ...buildSmsAjaxPayload("staff-sms-empty", "Не удалось отправить SMS сотруднику.", null, {
                    draft: "",
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "staff-sms-empty", "staff", staffId, {
                smsDraft: "",
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          if (
            !leadConnectorClient ||
            typeof leadConnectorClient.sendSmsMessage !== "function" ||
            !leadConnectorClient.isConfigured()
          ) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "staff-sms-unavailable",
                503,
                {
                  ...buildSmsAjaxPayload(
                    "staff-sms-unavailable",
                    "Не удалось отправить SMS сотруднику.",
                    null,
                    {
                      draft: message,
                    }
                  ),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "staff-sms-unavailable", "staff", staffId, {
                smsDraft: message,
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const snapshot = await staffStore.getSnapshot();
          const staffRecord = Array.isArray(snapshot.staff)
            ? snapshot.staff.find((record) => normalizeString(record && record.id, 120) === staffId) || null
            : null;

          if (!staffRecord) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "staff-sms-failed",
                404,
                {
                  ...buildSmsAjaxPayload("staff-sms-failed", "Не удалось отправить SMS сотруднику.", [], {
                    errorMessage: "Карточка сотрудника больше не найдена.",
                    draft: message,
                  }),
                }
              );
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "staff-sms-failed", "staff", staffId, {
                smsError: "Карточка сотрудника больше не найдена.",
                smsDraft: message,
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const smsResult = await leadConnectorClient.sendSmsMessage({
            phone: normalizeString(staffRecord.phone, 80),
            customerName: normalizeString(staffRecord.name, 160),
            customerEmail: normalizeString(staffRecord.email, 250).toLowerCase(),
            message,
          });

          let updatedStaff = staffRecord;
          const nextHistory = smsResult.ok
            ? [
                buildSmsHistoryRecord(smsResult, {
                  message,
                  phone: normalizeString(staffRecord.phone, 80),
                  targetType: "staff",
                  targetRef: staffId,
                  source: "manual",
                }),
                ...getStaffSmsHistoryEntries(staffRecord),
              ]
            : null;

          if (smsResult.ok) {
            try {
              updatedStaff = await staffStore.updateStaff(staffId, {
                smsHistory: nextHistory,
              });
            } catch {
              // Best effort only: SMS already went out successfully.
            }
          }

          const failureNotice =
            smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
              ? "staff-sms-contact-missing"
              : smsResult.code === "NOT_CONFIGURED"
                ? "staff-sms-unavailable"
                : "staff-sms-failed";

          if (ajaxRequest) {
            const historyEntries = smsResult.ok ? getStaffSmsHistoryEntries(updatedStaff || staffRecord) : null;
            const payload = buildSmsAjaxPayload(
              smsResult.ok ? "staff-sms-sent" : failureNotice,
              "Не удалось отправить SMS сотруднику.",
              historyEntries,
              {
                errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS сотруднику."),
                draft: message,
              }
            );
            if (smsResult.ok) {
              writeAjaxMutationSuccess(
                res,
                requestStartNs,
                requestContext,
                "staff-sms-sent",
                payload
              );
            } else {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                failureNotice,
                400,
                payload
              );
            }
            return;
          }

          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(
              returnTo,
              smsResult.ok ? "staff-sms-sent" : failureNotice,
              "staff",
              staffId,
              smsResult.ok
                ? {}
                : {
                    smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS сотруднику."),
                    smsDraft: message,
                  }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "resend-staff-w9-reminder") {
          if (!usersStore) {
            redirectWithTiming(
              res,
              303,
              buildStaffRedirect("w9-reminder-error"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const staffId = getFormValue(formBody, "staffId", 120);
          const snapshot = await staffStore.getSnapshot();
          const staffRecord = Array.isArray(snapshot.staff)
            ? snapshot.staff.find((record) => record.id === staffId) || null
            : null;
          const existingUser = await resolveLinkedUser(usersStore, {
            userId: getFormValue(formBody, "userId", 120),
            staffId,
            email: staffRecord ? staffRecord.email : "",
          });

          if (
            !staffRecord ||
            !existingUser ||
            existingUser.status !== "active" ||
            !existingUser.email ||
            (isAdminWorkspaceRole(existingUser.role) && !isEmployeeLinkedUser(existingUser))
          ) {
            redirectWithTiming(
              res,
              303,
              buildStaffRedirect(
                existingUser &&
                  isAdminWorkspaceRole(existingUser.role) &&
                  !isEmployeeLinkedUser(existingUser)
                  ? "w9-reminder-admin"
                  : "w9-reminder-error"
              ),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const inviteEmailStatus =
            accountInviteEmail && typeof accountInviteEmail.getStatus === "function"
              ? await accountInviteEmail.getStatus(config)
              : { configured: false };
          if (!inviteEmailStatus.configured) {
            redirectWithTiming(
              res,
              303,
              buildStaffRedirect("w9-reminder-unavailable"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const staffName =
            getFormValue(formBody, "staffName", 120) ||
            staffRecord.name ||
            existingUser.email;
          const verificationToken = accountAuth.createUserEmailVerificationToken(
            { masterSecret: config.masterSecret },
            {
              userId: existingUser.id,
              email: existingUser.email,
            }
          );
          const accountW9Path = "/account?focus=w9#account-w9";
          const verificationUrl = new URL(ACCOUNT_VERIFY_EMAIL_PATH, SITE_ORIGIN);
          verificationUrl.searchParams.set("token", verificationToken);
          verificationUrl.searchParams.set("next", accountW9Path);
          const loginUrl = new URL(ACCOUNT_LOGIN_PATH, SITE_ORIGIN);
          loginUrl.searchParams.set("email", existingUser.email);
          loginUrl.searchParams.set("next", accountW9Path);
          const requiresAccountSetup = Boolean(
            !existingUser.passwordHash ||
              (existingUser.emailVerificationRequired && !existingUser.emailVerifiedAt)
          );
          const primaryDocumentsUrl = requiresAccountSetup
            ? verificationUrl.toString()
            : loginUrl.toString();

          try {
            const reminderResult =
              accountInviteEmail && typeof accountInviteEmail.sendW9Reminder === "function"
                ? await accountInviteEmail.sendW9Reminder(
                    {
                      toEmail: existingUser.email,
                      staffName,
                      verifyUrl: verificationUrl.toString(),
                      loginUrl: loginUrl.toString(),
                      requiresAccountSetup,
                    },
                    config
                  )
                : await accountInviteEmail.sendInvite(
                    {
                      toEmail: existingUser.email,
                      staffName,
                      verifyUrl: verificationUrl.toString(),
                      loginUrl: loginUrl.toString(),
                    },
                    config
                  );

            await usersStore.updateUser(existingUser.id, {
              inviteEmailSentAt:
                reminderResult && reminderResult.sentAt
                  ? reminderResult.sentAt
                  : new Date().toISOString(),
              inviteEmailLastError: "",
            });

            if (
              leadConnectorClient &&
              typeof leadConnectorClient.sendSmsMessage === "function" &&
              leadConnectorClient.isConfigured()
            ) {
              const reminderSmsMessage = buildStaffOnboardingReminderSmsMessage(
                staffName,
                primaryDocumentsUrl
              );
              if (reminderSmsMessage && normalizeString(staffRecord.phone, 80)) {
                try {
                  const smsResult = await leadConnectorClient.sendSmsMessage({
                    phone: normalizeString(staffRecord.phone, 80),
                    customerName: staffName,
                    customerEmail: normalizeString(existingUser.email, 250).toLowerCase(),
                    message: reminderSmsMessage,
                  });
                  if (smsResult && smsResult.ok) {
                    await staffStore.updateStaff(staffId, {
                      smsHistory: [
                        buildSmsHistoryRecord(smsResult, {
                          message: reminderSmsMessage,
                          phone: normalizeString(staffRecord.phone, 80),
                          targetType: "staff",
                          targetRef: staffId,
                          source: "automatic",
                        }),
                        ...getStaffSmsHistoryEntries(staffRecord),
                      ],
                    });
                  }
                } catch {
                  // Best effort only: email reminder is the primary action.
                }
              }
            }

            redirectWithTiming(
              res,
              303,
              buildStaffRedirect("w9-reminder-sent"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          } catch (error) {
            await usersStore.updateUser(existingUser.id, {
              inviteEmailLastError: normalizeString(
                error && error.message ? error.message : "EMAIL_SEND_FAILED",
                240
              ),
            });
            redirectWithTiming(
              res,
              303,
              buildStaffRedirect("w9-reminder-error"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }
        }

        if (action === "delete-staff") {
          if (
            googleCalendarIntegration &&
            typeof googleCalendarIntegration.disconnectStaffCalendar === "function"
          ) {
            try {
              await googleCalendarIntegration.disconnectStaffCalendar(
                getFormValue(formBody, "staffId", 120),
                config
              );
            } catch {}
          }
          await staffStore.deleteStaff(getFormValue(formBody, "staffId", 120));
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("staff-deleted"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "save-assignment") {
          const entryId = getFormValue(formBody, "entryId", 120);
          const entry = quoteOpsLedger ? await quoteOpsLedger.getEntry(entryId) : null;
          if (!entry) {
            if (ajaxRequest) {
              writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 404);
              return;
            }
            redirectWithTiming(
              res,
              303,
              buildStaffRedirect("staff-failed"),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          const assignmentInput = {
            staffIds: getFormValues(formBody, "staffIds", 6, 120),
            scheduleDate: getFormValue(formBody, "scheduleDate", 32),
            scheduleTime: getFormValue(formBody, "scheduleTime", 32),
            status: getFormValue(formBody, "status", 32),
            notes: getFormValue(formBody, "notes", 800),
          };
          if (usersStore && assignmentInput.staffIds.length > 0) {
            const usersSnapshot =
              typeof usersStore.getSnapshot === "function"
                ? await usersStore.getSnapshot()
                : { users: [] };
            const adminStaffIds = collectNonAssignableStaffIds(usersSnapshot.users);
            assignmentInput.staffIds = assignmentInput.staffIds.filter(
              (staffId) => !adminStaffIds.has(staffId)
            );
          }

          if (
            googleCalendarIntegration &&
            typeof googleCalendarIntegration.findAssignmentConflicts === "function" &&
            assignmentInput.staffIds.length > 0
          ) {
            const conflicts = await googleCalendarIntegration.findAssignmentConflicts({
              entry,
              assignmentInput,
              config,
            });
            if (conflicts.length > 0) {
              if (ajaxRequest) {
                writeAjaxMutationError(
                  res,
                  requestStartNs,
                  requestContext,
                  "assignment-conflict",
                  409,
                  {
                    staff: conflicts.map((item) => item.name).join(", "),
                  }
                );
                return;
              }
              redirectWithTiming(
                res,
                303,
                buildStaffRedirect("assignment-conflict", {
                  staff: conflicts.map((item) => item.name).join(", "),
                }),
                requestStartNs,
                requestContext.cacheHit
              );
              return;
            }
          }

          const savedAssignment = await staffStore.setAssignment(entryId, {
            ...assignmentInput,
          });

          let notice = "assignment-saved";
          if (googleCalendarIntegration && typeof googleCalendarIntegration.syncAssignment === "function") {
            try {
              await googleCalendarIntegration.syncAssignment(entryId, config, entry);
            } catch {
              notice = "assignment-saved-calendar-error";
            }
          }
          if (
            autoNotificationService &&
            typeof autoNotificationService.notifyScheduledAssignment === "function" &&
            savedAssignment
          ) {
            try {
              await autoNotificationService.notifyScheduledAssignment({
                entry,
                assignment: savedAssignment,
                leadConnectorClient,
              });
            } catch {}
          }
          if (ajaxRequest) {
            writeAjaxMutationSuccess(res, requestStartNs, requestContext, notice);
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect(notice),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "clear-assignment") {
          if (
            googleCalendarIntegration &&
            typeof googleCalendarIntegration.clearAssignmentEvents === "function"
          ) {
            try {
              await googleCalendarIntegration.clearAssignmentEvents(
                getFormValue(formBody, "entryId", 120),
                config
              );
            } catch {}
          }
          await staffStore.clearAssignment(getFormValue(formBody, "entryId", 120));
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("assignment-cleared"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
      } catch {}

      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("staff-failed"),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (requestContext.route === ADMIN_STAFF_GOOGLE_CONNECT_PATH) {
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
        return;
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
        return;
      }

      const snapshot = staffStore ? await staffStore.getSnapshot() : { staff: [] };
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
        return;
      }

      try {
        const connectUrl = await googleCalendarIntegration.buildConnectUrl(
          staffId,
          config,
          staffRecord.email
        );
        redirectWithTiming(res, 303, connectUrl, requestStartNs, requestContext.cacheHit);
        return;
      } catch {
        if (ajaxRequest && action === "update-staff") {
          writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 500);
          return;
        }
        if (ajaxRequest && action === "save-assignment") {
          writeAjaxMutationError(res, requestStartNs, requestContext, "assignment-save-failed", 500);
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("calendar-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH) {
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
        return;
      }

      const reqUrl = new URL(req.url || ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH, "http://localhost");
      const accessDenied = normalizeString(reqUrl.searchParams.get("error"), 120);
      const code = normalizeString(reqUrl.searchParams.get("code"), 4000);
      const state = normalizeString(reqUrl.searchParams.get("state"), 6000);

      if (accessDenied) {
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("calendar-connect-denied"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
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
        return;
      }

      try {
        await googleCalendarIntegration.handleOAuthCallback({
          code,
          state,
          config,
        });
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("calendar-connected"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch {
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("calendar-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
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

    if (requestContext.route === ADMIN_LOGIN_PATH) {
      if (req.method === "GET") {
        if (currentUserAccess.authorized) {
          redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        if (currentUserAccess.redirectToAccount) {
          redirectWithTiming(res, 303, ACCOUNT_ROOT_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        writeHtmlWithTiming(res, 200, adminSharedRenderers.renderLoginPage(config), requestStartNs, requestContext.cacheHit);
        return;
      }

      if (req.method !== "POST") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Здесь доступны только GET и POST.</div>`),
          requestStartNs,
          requestContext.cacheHit
        );
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
        const workspaceUserLogin = await authenticateWorkspaceUser(usersStore, email, password);
        if (workspaceUserLogin.user) {
          await usersStore.recordLogin(workspaceUserLogin.user.id);
          const userSessionToken = accountAuth.createUserSessionToken(workspaceUserLogin.config, {
            userId: workspaceUserLogin.user.id,
            staffId: workspaceUserLogin.user.staffId,
            email: workspaceUserLogin.user.email,
            role: workspaceUserLogin.user.role,
          });
          redirectWithTiming(
            res,
            303,
            ADMIN_ROOT_PATH,
            requestStartNs,
            requestContext.cacheHit,
            buildAdminAuthHeaders(req, [
              serializeCookie(USER_SESSION_COOKIE, userSessionToken, {
                ...getUserCookieOptions(req),
                maxAge: accountAuth.USER_SESSION_TTL_SECONDS,
              }),
              clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req)),
              clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions(req)),
            ])
          );
          return;
        }

        writeHtmlWithTiming(
          res,
          401,
          adminSharedRenderers.renderLoginPage(config, {
            error:
              workspaceUserLogin.error || "Неверная почта или пароль. Попробуйте ещё раз.",
            email,
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

    if (requestContext.route === ADMIN_2FA_PATH) {
      if (currentUserAccess.authorized) {
        redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      if (currentUserAccess.redirectToAccount) {
        redirectWithTiming(res, 303, ACCOUNT_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(
        res,
        303,
        ADMIN_LOGIN_PATH,
        requestStartNs,
        requestContext.cacheHit,
        buildAdminAuthHeaders(req, [
          clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req)),
        ])
      );
      return;
    }

    if (requestContext.route === ADMIN_LOGOUT_PATH) {
      if (req.method !== "POST") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout("Метод не поддерживается", `<div class="admin-alert admin-alert-error">Выход выполняется только через POST.</div>`),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const clearCookies = [
        clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions(req)),
        clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req)),
      ];
      if (portalState && portalState.session) {
        clearCookies.push(clearCookie(USER_SESSION_COOKIE, getUserCookieOptions(req)));
      }

      redirectWithTiming(
        res,
        303,
        portalState && portalState.session && !session ? ACCOUNT_LOGIN_PATH : ADMIN_LOGIN_PATH,
        requestStartNs,
        requestContext.cacheHit,
        buildAdminAuthHeaders(req, clearCookies)
      );
    }
  };
}

module.exports = {
  createAdminRequestHandler,
};
