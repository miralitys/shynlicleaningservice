"use strict";

const fsp = require("node:fs/promises");
const {
  generateStaffContractDocument,
  loadStaffContractConfig,
  resolveStaffContractDocumentAbsolutePath,
} = require("../staff-contractor-agreement");
const {
  generateStaffW9Document,
  loadStaffW9Config,
  readStoredStaffW9Document,
  resolveStaffW9DocumentAbsolutePath,
} = require("../staff-w9");
const {
  buildCleanerConfirmationUpdate,
  getStaffCleanerConfirmationStatus,
} = require("../cleaner-confirmation");
const { getEnRouteActionWindowState } = require("./assignment-action-window");
const { getEntryOrderCompletionData } = require("../admin-order-state");
const {
  calculateStaffPayrollItem,
  collectPayrollRecords,
  getEntryPayrollData,
  syncOrderPayrollSnapshot,
} = require("../payroll");

function createAccountRequestHandler(deps = {}) {
  const {
    ACCOUNT_W9_DOWNLOAD_PATH,
    ACCOUNT_CONTRACT_DOWNLOAD_PATH,
    ACCOUNT_GOOGLE_CALENDAR_CONNECT_PATH,
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_LOGOUT_PATH,
    ACCOUNT_ROOT_PATH,
    ACCOUNT_VERIFY_EMAIL_PATH,
    USER_PASSWORD_SETUP_COOKIE,
    USER_SESSION_COOKIE,
    USER_SESSION_TTL_SECONDS,
    adminAuth,
    accountAuth,
    accountRenderers,
    buildStaffPlanningContext,
    clearCookie,
    getFormValue,
    getFormValues,
    getRequestUrl,
    normalizeString,
    parseMultipartFormBody,
    parseCookies,
    parseFormBody,
    readBufferBody,
    readTextBody,
    redirectWithTiming,
    serializeCookie,
    shouldUseSecureCookies,
    writeHeadWithTiming,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  } = deps;

  function getUserCookieOptions(req) {
    return {
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
      secure: shouldUseSecureCookies(req),
    };
  }

  const ACCOUNT_W9_FOCUS_VALUE = "w9";
  const ACCOUNT_W9_SECTION_ID = "account-w9";
  const USER_EMPLOYEE_DOCUMENTS_COOKIE = "shynli_user_employee_docs";

  function getPasswordSetupCookieOptions(req) {
    return {
      path: "/account",
      httpOnly: true,
      sameSite: "Lax",
      secure: shouldUseSecureCookies(req),
    };
  }

  function getEmployeeDocumentsCookieOptions(req) {
    return {
      path: "/account",
      httpOnly: true,
      sameSite: "Lax",
      secure: shouldUseSecureCookies(req),
    };
  }

  async function resolveAccountSession(req, usersStore) {
    const config = accountAuth.loadUserAuthConfig(process.env);
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies[USER_SESSION_COOKIE];
    if (!token || !usersStore || !config.configured) {
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

  function buildAccountRedirectPath(notice = "", options = {}) {
    const reqUrl = new URL(ACCOUNT_ROOT_PATH, "http://localhost");
    if (notice) reqUrl.searchParams.set("notice", notice);
    const noticeMessage = normalizeString(options.noticeMessage || options.message, 300);
    if (noticeMessage) reqUrl.searchParams.set("message", noticeMessage);
    const focusSection = normalizeString(options.focusSection, 32).toLowerCase();
    if (focusSection === ACCOUNT_W9_FOCUS_VALUE) {
      reqUrl.searchParams.set("focus", ACCOUNT_W9_FOCUS_VALUE);
    }
    const pathWithSearch = `${reqUrl.pathname}${reqUrl.search}`;
    return focusSection === ACCOUNT_W9_FOCUS_VALUE
      ? `${pathWithSearch}#${ACCOUNT_W9_SECTION_ID}`
      : pathWithSearch;
  }

  function isAccountAsyncRequest(req) {
    const acceptHeader = normalizeString(req && req.headers ? req.headers.accept : "", 400).toLowerCase();
    const asyncHeader = normalizeString(
      req && req.headers ? req.headers["x-shynli-account-async"] : "",
      20
    ).toLowerCase();
    return asyncHeader === "1" || asyncHeader === "true" || acceptHeader.includes("application/json");
  }

  function writeAccountAsyncResponse(res, requestStartNs, requestContext, statusCode, payload = {}) {
    if (typeof writeJsonWithTiming !== "function") return false;
    writeJsonWithTiming(
      res,
      statusCode,
      payload,
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  function finishAccountMutation(req, res, requestStartNs, requestContext, notice, options = {}) {
    const redirectPath = buildAccountRedirectPath(notice, options);
    if (isAccountAsyncRequest(req) && writeAccountAsyncResponse(
      res,
      requestStartNs,
      requestContext,
      200,
      {
        ok: true,
        notice,
        refreshPath: redirectPath,
        detailId: normalizeString(options.detailId, 160),
      }
    )) {
      return;
    }

    redirectWithTiming(
      res,
      303,
      redirectPath,
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function finishAccountMutationError(req, res, requestStartNs, requestContext, notice, options = {}) {
    if (isAccountAsyncRequest(req) && writeAccountAsyncResponse(
      res,
      requestStartNs,
      requestContext,
      400,
      {
        ok: false,
        notice,
        message:
          normalizeString(options.message, 300) ||
          (notice === "assignment-error"
            ? "Не удалось обновить заказ. Проверьте этап и попробуйте ещё раз."
            : "Не удалось сохранить изменения."),
        refreshPath: buildAccountRedirectPath(notice, options),
      }
    )) {
      return;
    }

    redirectWithTiming(
      res,
      303,
      buildAccountRedirectPath(notice, options),
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function getAccountHomePath(user) {
    if (canUseAccountWorkspace(user)) {
      return ACCOUNT_ROOT_PATH;
    }
    const role = normalizeString(user && user.role, 32).toLowerCase();
    if (role === "admin" || role === "manager") {
      return "/admin";
    }
    return ACCOUNT_ROOT_PATH;
  }

  function isEmployeeLinkedUser(user) {
    if (!user || typeof user !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(user, "isEmployee")) {
      const rawValue = user.isEmployee;
      if (rawValue === true || rawValue === false) return rawValue;
      const normalized = normalizeString(rawValue, 20).toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }
    return normalizeString(user.role, 32).toLowerCase() !== "admin";
  }

  function canUseAccountWorkspace(user) {
    return isEmployeeLinkedUser(user);
  }

  function isAdminPortalOnlyUser(user) {
    return normalizeString(user && user.role, 32).toLowerCase() === "admin" && !isEmployeeLinkedUser(user);
  }

  function formatAccountOrderStatusLabel(value) {
    const normalized = normalizeAccountOrderStatus(value, "new");
    if (normalized === "scheduled") return "Запланировано";
    if (normalized === "en-route") return "В пути";
    if (normalized === "cleaning-started") return "Начать уборку";
    if (normalized === "checklist") return "Чеклист";
    if (normalized === "cleaning-complete") return "Уборка завершена";
    if (normalized === "rescheduled") return "Перенесено";
    if (normalized === "invoice-sent") return "Инвойс отправлен";
    if (normalized === "paid") return "Оплачено";
    if (normalized === "awaiting-review") return "Ждём отзыв";
    if (normalized === "completed") return "Завершено";
    if (normalized === "canceled") return "Отменено";
    return "Новая заявка";
  }

  function getAccountAssignmentErrorMessage(error) {
    const normalizedMessage = normalizeString(error && error.message, 200);
    if (!normalizedMessage) {
      return "Не удалось обновить заказ. Проверьте этап и попробуйте ещё раз.";
    }
    if (normalizedMessage === "ASSIGNMENT_ENTRY_NOT_FOUND") {
      return "Не удалось найти этот заказ. Обновите страницу и попробуйте ещё раз.";
    }
    if (normalizedMessage === "ASSIGNMENT_ACCESS_REVOKED") {
      return "Этот заказ больше не назначен на вас. Обновите страницу.";
    }
    if (normalizedMessage === "ASSIGNMENT_CONFIRMATION_REQUIRED") {
      return "Сначала подтвердите заказ, а потом меняйте этап.";
    }
    if (normalizedMessage === "ASSIGNMENT_EN_ROUTE_SCHEDULE_MISSING") {
      return "Кнопка «Я в пути» станет активной, когда у заказа будет указано время уборки.";
    }
    if (normalizedMessage === "ASSIGNMENT_EN_ROUTE_TOO_EARLY") {
      return "Кнопка «Я в пути» станет активной за 2 часа до начала уборки.";
    }
    if (normalizedMessage === "ASSIGNMENT_CHECKLIST_REQUIRED") {
      return "Сначала завершите чеклист, а потом переходите дальше.";
    }
    if (normalizedMessage.startsWith("ASSIGNMENT_STATUS_MISMATCH:")) {
      const rawStatus = normalizedMessage.slice("ASSIGNMENT_STATUS_MISMATCH:".length);
      return `Сервер видит другой этап заказа: «${formatAccountOrderStatusLabel(rawStatus)}». Обновите страницу и попробуйте ещё раз.`;
    }
    if (normalizedMessage === "ASSIGNMENT_CONFIRMATION_UNAVAILABLE") {
      return "Сейчас не удалось открыть хранилище назначений. Попробуйте ещё раз.";
    }
    return "Не удалось обновить заказ. Проверьте этап и попробуйте ещё раз.";
  }

  function shouldUseAdminWorkspace(user) {
    const role = normalizeString(user && user.role, 32).toLowerCase();
    if (role === "manager") return true;
    return isAdminPortalOnlyUser(user);
  }

  function normalizeAccountReturnPath(value, user = null) {
    const defaultPath = getAccountHomePath(user);
    const candidate = normalizeString(value, 1000);
    if (!candidate) return defaultPath;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.origin !== "http://localhost") return defaultPath;
      if (parsed.pathname !== ACCOUNT_ROOT_PATH) return defaultPath;
      if (shouldUseAdminWorkspace(user) && !canUseAccountWorkspace(user)) return defaultPath;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return defaultPath;
    }
  }

  function normalizeEmployeeDocumentsReturnPath(value, user = null) {
    const normalized = normalizeAccountReturnPath(value, user);
    if (!shouldUseAdminWorkspace(user) || !isEmployeeLinkedUser(user) || !isW9ReturnPath(value)) {
      return normalized;
    }

    const candidate = normalizeString(value, 1000);
    if (!candidate) return normalized;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.origin !== "http://localhost" || parsed.pathname !== ACCOUNT_ROOT_PATH) {
        return normalized;
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return normalized;
    }
  }

  function shouldEnableEmployeeDocumentsWorkspace(user, nextPath = "") {
    return Boolean(
      shouldUseAdminWorkspace(user) &&
        canUseAccountWorkspace(user) &&
        isW9ReturnPath(nextPath)
    );
  }

  function buildAccountLoginPath(notice = "", options = {}) {
    const reqUrl = new URL(ACCOUNT_LOGIN_PATH, "http://localhost");
    if (notice) reqUrl.searchParams.set("notice", notice);
    const nextPath = normalizeAccountReturnPath(options.nextPath);
    if (nextPath && nextPath !== ACCOUNT_ROOT_PATH) {
      reqUrl.searchParams.set("next", nextPath);
    }
    const normalizedEmail = normalizeString(options.email, 200).toLowerCase();
    if (normalizedEmail) reqUrl.searchParams.set("email", normalizedEmail);
    return `${reqUrl.pathname}${reqUrl.search}`;
  }

  function buildAccountLoginPathWithEmail(notice = "", email = "", options = {}) {
    return buildAccountLoginPath(notice, {
      ...options,
      email,
    });
  }

  function isW9ReturnPath(value) {
    const normalized = normalizeAccountReturnPath(value);
    return normalized.includes("focus=w9") || normalized.includes(`#${ACCOUNT_W9_SECTION_ID}`);
  }

  function getAccountSection(value) {
    const normalized = normalizeString(value, 32).toLowerCase();
    if (normalized === "payroll") return "payroll";
    if (normalized === "calendar") return "calendar";
    return "dashboard";
  }

  function getAccountCalendarView(value) {
    return normalizeString(value, 20).toLowerCase() === "month" ? "month" : "today";
  }

  function getLoginNoticeCopy(reqUrl) {
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "email-verified") {
      return "Email подтверждён. Теперь можно войти в кабинет.";
    }
    if (notice === "email-verified-password-setup") {
      return "Email подтверждён. Введите рабочую почту и нажмите «Войти», чтобы задать первый пароль и перейти к документам сотрудника.";
    }
    if (notice === "email-verify-error") {
      return "Ссылка подтверждения недействительна или уже устарела.";
    }
    if (notice === "password-setup-error") {
      return "Не удалось завершить первый вход. Откройте ссылку из письма ещё раз и повторите попытку.";
    }
    return "";
  }

  function normalizeAccountPhoneInput(value) {
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

  function getAccountEntryPayload(entry = {}) {
    return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
      ? entry.payloadForRetry
      : {};
  }

  function getAccountEntryAddress(entry = {}) {
    const payload = getAccountEntryPayload(entry);
    const calculatorData =
      payload.calculatorData && typeof payload.calculatorData === "object"
        ? payload.calculatorData
        : {};
    return normalizeString(
      entry.fullAddress || calculatorData.fullAddress || calculatorData.address,
      500
    );
  }

  function normalizeAccountAddressKey(value = "") {
    return normalizeString(value, 500).toLowerCase();
  }

  function normalizeAccountCleanerCommentRecord(value = {}) {
    if (!value || typeof value !== "object") return null;
    const text = normalizeString(value.text || value.comment || value.body, 1000)
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!text) return null;
    return {
      id: normalizeString(value.id, 120) || `cleaner-comment-${Date.now()}`,
      text,
      authorName: normalizeString(value.authorName || value.author || value.staffName, 120),
      authorEmail: normalizeString(value.authorEmail || value.email, 250).toLowerCase(),
      authorId: normalizeString(value.authorId || value.staffId || value.userId, 120),
      source: normalizeString(value.source, 40) || "account",
      createdAt: normalizeString(value.createdAt, 80) || new Date().toISOString(),
    };
  }

  function buildAccountCleanerCommentRecord(text, user = {}, staffRecord = null, timestamp = "") {
    const normalizedText = normalizeString(text, 1000).replace(/\r\n?/g, "\n").trim();
    if (!normalizedText) return null;
    const createdAt = normalizeString(timestamp, 80) || new Date().toISOString();
    const authorName =
      normalizeString(staffRecord && staffRecord.name, 120) ||
      normalizeString(user && user.name, 120) ||
      normalizeString(user && user.email, 120);
    return {
      id: normalizeString(
        `account-${user && user.staffId ? user.staffId : user && user.id ? user.id : "staff"}-${Date.parse(createdAt) || Date.now()}`,
        120
      ),
      text: normalizedText,
      authorName,
      authorEmail: normalizeString(user && user.email, 250).toLowerCase(),
      authorId: normalizeString((user && (user.staffId || user.id)) || "", 120),
      source: "account",
      createdAt,
    };
  }

  function normalizeAccountCleanerCommentLog(comments = []) {
    const seen = new Set();
    return (Array.isArray(comments) ? comments : [])
      .map((comment) => normalizeAccountCleanerCommentRecord(comment))
      .filter(Boolean)
      .filter((comment) => {
        const key = `${comment.id}::${comment.createdAt}::${comment.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(-80);
  }

  function buildAccountCleanerCommentSummary(comments = []) {
    const summary = normalizeAccountCleanerCommentLog(comments)
      .map((comment) => comment.text)
      .filter(Boolean)
      .join("\n\n");
    if (summary.length <= 4000) return summary;
    return summary.slice(summary.length - 4000);
  }

  function limitAccountLogText(value = "", maxLength = 4000) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;
    return text.slice(text.length - maxLength).replace(/^[^\n]*\n?/, "").trim();
  }

  function buildAccountAddressBookWithCleanerComment(entry = {}, commentRecord = null) {
    if (!commentRecord || !commentRecord.text) return null;
    const address = getAccountEntryAddress(entry);
    if (!address) return null;
    const payload = getAccountEntryPayload(entry);
    const adminClient =
      payload.adminClient && typeof payload.adminClient === "object" ? payload.adminClient : {};
    const sourceAddressBook = Array.isArray(adminClient.addressBook) ? adminClient.addressBook : [];
    const addressBook = sourceAddressBook
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ ...item }));
    const addressKey = normalizeAccountAddressKey(address);
    let addressRecord = addressBook.find((item) => normalizeAccountAddressKey(item.address) === addressKey);

    if (!addressRecord) {
      addressRecord = { address };
      addressBook.push(addressRecord);
    } else if (!normalizeString(addressRecord.address, 500)) {
      addressRecord.address = address;
    }

    const dateLabel = commentRecord.createdAt ? commentRecord.createdAt.slice(0, 10) : "";
    const authorLabel = commentRecord.authorName ? `${commentRecord.authorName}: ` : "";
    const noteLine = normalizeString(
      `${dateLabel ? `${dateLabel} — ` : ""}${authorLabel}${commentRecord.text}`,
      1200
    );
    const existingNotes = normalizeString(addressRecord.notes, 4000);
    const nextNotes = existingNotes
      ? existingNotes.includes(noteLine)
        ? existingNotes
        : `${existingNotes}\n${noteLine}`
      : noteLine;
    addressRecord.notes = limitAccountLogText(nextNotes, 4000);

    return addressBook;
  }

  function normalizeAccountOrderStatus(value, fallback = "new") {
    const normalized = normalizeString(value, 40).toLowerCase();
    const compact = normalized.replace(/[\s_-]+/g, "");
    if (!compact) return fallback;
    if (compact === "scheduled") return "scheduled";
    if (compact === "inprogress" || compact === "enroute") return "en-route";
    if (compact === "cleaningstarted" || compact === "startcleaning") return "cleaning-started";
    if (compact === "checklist") return "checklist";
    if (compact === "photo" || compact === "photos") return "cleaning-complete";
    if (compact === "cleaningcomplete" || compact === "cleaningcompleted") return "cleaning-complete";
    if (compact === "rescheduled") return "rescheduled";
    if (compact === "invoicesent") return "invoice-sent";
    if (compact === "paid") return "paid";
    if (compact === "awaitingreview" || compact === "waitingreview") return "awaiting-review";
    if (compact === "completed") return "completed";
    if (compact === "canceled" || compact === "cancelled") return "canceled";
    if (compact === "new") return "new";
    return fallback;
  }

  function normalizeAccountChecklistServiceType(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (normalized === "deep") return "deep";
    if (normalized === "moving" || normalized === "move-in-out" || normalized === "moveinout") {
      return "moving";
    }
    return "regular";
  }

  function isDeprecatedAccountChecklistItem(item = {}) {
    const label = normalizeString(item && item.label, 240).toLowerCase();
    const hint = normalizeString(item && item.hint, 240).toLowerCase();
    return (
      label === "проветрить помещения" ||
      hint === "окна открыть перед уходом" ||
      (label.includes("проветр") && hint.includes("окна"))
    );
  }

  function buildChecklistTemplateMap(settingsSnapshot = {}) {
    const templates = Array.isArray(settingsSnapshot && settingsSnapshot.templates)
      ? settingsSnapshot.templates
      : [];
    return new Map(
      templates
        .filter((template) => template && typeof template === "object")
        .map((template) => [normalizeAccountChecklistServiceType(template.serviceType), template])
    );
  }

  function buildAccountChecklistItems(template = {}, completion = {}) {
    const templateItems = Array.isArray(template && template.items)
      ? template.items.filter((item) => !isDeprecatedAccountChecklistItem(item))
      : [];
    const completionItems = Array.isArray(completion && completion.checklistItems)
      ? completion.checklistItems.filter((item) => !isDeprecatedAccountChecklistItem(item))
      : [];
    const completionById = new Map(
      completionItems
        .filter((item) => item && typeof item === "object")
        .map((item) => [normalizeString(item.id, 120), item])
        .filter(([id]) => Boolean(id))
    );

    const mergedItems = templateItems.map((item, index) => {
      const itemId = normalizeString(item && item.id, 120);
      const completionItem = completionById.get(itemId) || null;
      return {
        id: itemId,
        label: normalizeString(item && item.label, 240),
        hint: normalizeString(item && item.hint, 240),
        completed: Boolean(completionItem ? completionItem.completed : item && item.completed),
        sortOrder: Number.isFinite(Number(item && item.sortOrder)) ? Number(item.sortOrder) : index,
        updatedAt: normalizeString(
          completionItem ? completionItem.updatedAt : item && item.updatedAt,
          80
        ),
      };
    });

    if (mergedItems.length > 0) {
      return mergedItems;
    }

    return completionItems.map((item, index) => ({
      id: normalizeString(item && item.id, 120),
      label: normalizeString(item && item.label, 240),
      hint: normalizeString(item && item.hint, 240),
      completed: Boolean(item && item.completed),
      sortOrder: Number.isFinite(Number(item && item.sortOrder)) ? Number(item.sortOrder) : index,
      updatedAt: normalizeString(item && item.updatedAt, 80),
    }));
  }

  function buildW9Draft(formBody) {
    return {
      legalName: getFormValue(formBody, "w9LegalName", 120),
      businessName: getFormValue(formBody, "w9BusinessName", 120),
      federalTaxClassification: getFormValue(formBody, "w9FederalTaxClassification", 40),
      llcTaxClassification: getFormValue(formBody, "w9LlcTaxClassification", 2),
      otherClassification: getFormValue(formBody, "w9OtherClassification", 120),
      exemptPayeeCode: getFormValue(formBody, "w9ExemptPayeeCode", 32),
      fatcaCode: getFormValue(formBody, "w9FatcaCode", 32),
      addressLine1: getFormValue(formBody, "w9AddressLine1", 180),
      cityStateZip: getFormValue(formBody, "w9CityStateZip", 180),
      accountNumbers: getFormValue(formBody, "w9AccountNumbers", 120),
      line3bApplies: Boolean(getFormValue(formBody, "w9Line3bApplies", 10)),
      tinType: getFormValue(formBody, "w9TinType", 16),
      tinValue: getFormValue(formBody, "w9TinValue", 32),
      certificationConfirmed: Boolean(getFormValue(formBody, "w9CertificationConfirmed", 10)),
      signatureDataUrl: getFormValue(formBody, "w9SignatureDataUrl", 350 * 1024),
    };
  }

  function getAccountStaffEarning(entry = {}, assignment = null, staffRecord = null, staffId = "") {
    const normalizedStaffId = normalizeString(
      staffId || (staffRecord && staffRecord.id),
      120
    );
    if (!entry || !normalizedStaffId) return null;

    const existingPayrollItem = getEntryPayrollData(entry).items.find(
      (item) => normalizeString(item && item.staffId, 120) === normalizedStaffId
    );
    if (existingPayrollItem && Number(existingPayrollItem.amountCents) > 0) {
      return {
        amountCents: Math.max(0, Number(existingPayrollItem.amountCents) || 0),
        status: normalizeString(existingPayrollItem.status, 32) || "owed",
        source: "payroll",
      };
    }

    if (!staffRecord) return null;
    const teamSize =
      assignment && Array.isArray(assignment.staffIds) && assignment.staffIds.length > 0
        ? assignment.staffIds.length
        : 1;
    const calculatedItem = calculateStaffPayrollItem(entry, staffRecord, {
      teamSize,
    });
    if (!calculatedItem || Number(calculatedItem.amountCents) <= 0) return null;
    return {
      amountCents: Math.max(0, Number(calculatedItem.amountCents) || 0),
      status: "estimate",
      source: "estimate",
    };
  }

  return async function handleAccountRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger,
    runtime = {},
    quoteOpsLedger = null,
    staffStore = null,
    usersStore = null
  ) {
    void requestLogger;
    requestContext.cacheHit = false;
    const settingsStore =
      runtime && runtime.settingsStore && typeof runtime.settingsStore.getSnapshot === "function"
        ? runtime.settingsStore
        : null;
    const orderMediaStorage =
      runtime && runtime.orderMediaStorage && typeof runtime.orderMediaStorage.uploadFiles === "function"
        ? runtime.orderMediaStorage
        : null;
    const autoNotificationService =
      runtime && runtime.autoNotificationService && typeof runtime.autoNotificationService === "object"
        ? runtime.autoNotificationService
        : null;
    const googleCalendarIntegration =
      runtime && runtime.googleCalendarIntegration ? runtime.googleCalendarIntegration : null;

    const { session, user, config } = await resolveAccountSession(req, usersStore);
    const reqUrl = getRequestUrl(req);
    const cookies = parseCookies(req.headers.cookie || "");
    const passwordSetupToken = cookies[USER_PASSWORD_SETUP_COOKIE];

    function resolvePasswordSetupPayloadForUser(accountUser) {
      if (!passwordSetupToken || !accountUser) return null;
      try {
        const payload = accountAuth.verifyUserPasswordSetupToken(passwordSetupToken, config);
        if (
          normalizeString(payload && payload.userId, 120) !== normalizeString(accountUser.id, 120) ||
          normalizeString(payload && payload.email, 200).toLowerCase() !== accountUser.email
        ) {
          return null;
        }
        return payload;
      } catch {
        return null;
      }
    }

    if (!config.configured || !usersStore) {
      writeHtmlWithTiming(res, 503, accountRenderers.renderUnavailablePage(), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (requestContext.route === ACCOUNT_LOGIN_PATH) {
      const requestedNextPath = normalizeAccountReturnPath(reqUrl.searchParams.get("next"));
      if (req.method === "GET") {
        if (session && user) {
          redirectWithTiming(
            res,
            303,
            normalizeAccountReturnPath(requestedNextPath, user),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
        writeHtmlWithTiming(
          res,
          200,
          accountRenderers.renderLoginPage({
            info: getLoginNoticeCopy(reqUrl),
            email: normalizeString(reqUrl.searchParams.get("email"), 200).toLowerCase(),
            nextPath: requestedNextPath,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (req.method !== "POST") {
        writeHtmlWithTiming(
          res,
          405,
          accountRenderers.renderLoginPage({ error: "Здесь доступны только GET и POST." }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 512 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const email = getFormValue(formBody, "email", 200).toLowerCase();
      const accountUser = await usersStore.findUserByEmail(email, { includeSecret: true });
      const requestedFormNextPath = normalizeAccountReturnPath(getFormValue(formBody, "next", 1000));
      const resolvedNextPath = normalizeEmployeeDocumentsReturnPath(
        getFormValue(formBody, "next", 1000),
        accountUser
      );
      const accountWorkspaceAllowed = canUseAccountWorkspace(accountUser);
      const adminWorkspaceAllowed = shouldUseAdminWorkspace(accountUser);

      if (action === "setup-first-password") {
        const newPassword = getFormValue(formBody, "newPassword", 400);
        const confirmPassword = getFormValue(formBody, "confirmPassword", 400);
        const passwordSetupPayload = resolvePasswordSetupPayloadForUser(accountUser);

        if (
          !accountUser ||
          accountUser.status !== "active" ||
          !accountUser.emailVerifiedAt ||
          (!accountWorkspaceAllowed && !adminWorkspaceAllowed) ||
          accountUser.passwordHash ||
          !passwordSetupPayload ||
          !newPassword ||
          newPassword.length < 8 ||
          newPassword !== confirmPassword
        ) {
          writeHtmlWithTiming(
            res,
            400,
            accountRenderers.renderLoginPage({
              error: "Не удалось сохранить пароль. Проверьте совпадение нового пароля и повторите попытку.",
              email,
              setupMode: true,
              nextPath: requestedFormNextPath,
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        await usersStore.updateUser(accountUser.id, {
          passwordHash: adminAuth.hashPassword(newPassword),
          inviteEmailLastError: "",
        });
        await usersStore.recordLogin(accountUser.id);

        const token = accountAuth.createUserSessionToken(config, {
          userId: accountUser.id,
          staffId: accountUser.staffId,
          email: accountUser.email,
          role: accountUser.role,
        });
        const authCookie = serializeCookie(USER_SESSION_COOKIE, token, {
          ...getUserCookieOptions(req),
          maxAge: USER_SESSION_TTL_SECONDS,
        });

        const setCookies = [
          authCookie,
          clearCookie(USER_PASSWORD_SETUP_COOKIE, getPasswordSetupCookieOptions(req)),
        ];
        if (shouldEnableEmployeeDocumentsWorkspace(accountUser, resolvedNextPath)) {
          setCookies.push(
            serializeCookie(
              USER_EMPLOYEE_DOCUMENTS_COOKIE,
              "1",
              getEmployeeDocumentsCookieOptions(req)
            )
          );
        }

        redirectWithTiming(
          res,
          303,
          resolvedNextPath,
          requestStartNs,
          requestContext.cacheHit,
          {
            "Set-Cookie": setCookies,
          }
        );
        return;
      }

      const password = getFormValue(formBody, "password", 400);

      if (!accountUser || accountUser.status !== "active") {
        writeHtmlWithTiming(
          res,
          401,
          accountRenderers.renderLoginPage({
            error: "Неверная почта или пароль.",
            email,
            nextPath: requestedFormNextPath,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (!accountWorkspaceAllowed && !adminWorkspaceAllowed) {
        writeHtmlWithTiming(
          res,
          403,
          accountRenderers.renderLoginPage({
            error: "Для этого пользователя кабинет сотрудника отключён. Обратитесь к администратору.",
            email,
            nextPath: requestedFormNextPath,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (accountUser.emailVerificationRequired && !accountUser.emailVerifiedAt) {
        writeHtmlWithTiming(
          res,
          401,
          accountRenderers.renderLoginPage({
            error: "Подтвердите email по ссылке из письма, прежде чем входить в кабинет.",
            email,
            nextPath: requestedFormNextPath,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (!accountUser.passwordHash) {
        const passwordSetupPayload = resolvePasswordSetupPayloadForUser(accountUser);
        if (!passwordSetupPayload) {
          writeHtmlWithTiming(
            res,
            401,
            accountRenderers.renderLoginPage({
              error: "Откройте ссылку из письма ещё раз, чтобы задать первый пароль.",
              email,
              nextPath: requestedFormNextPath,
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        writeHtmlWithTiming(
          res,
          200,
          accountRenderers.renderLoginPage({
            info: "Email подтверждён. Теперь задайте свой первый пароль и завершите документы сотрудника.",
            email,
            setupMode: true,
            nextPath: requestedFormNextPath,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (!adminAuth.verifyPassword(password, accountUser.passwordHash)) {
        writeHtmlWithTiming(
          res,
          401,
          accountRenderers.renderLoginPage({
            error: "Неверная почта или пароль.",
            email,
            nextPath: requestedFormNextPath,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      await usersStore.recordLogin(accountUser.id);
      const token = accountAuth.createUserSessionToken(config, {
        userId: accountUser.id,
        staffId: accountUser.staffId,
        email: accountUser.email,
        role: accountUser.role,
      });
      const authCookie = serializeCookie(USER_SESSION_COOKIE, token, {
        ...getUserCookieOptions(req),
        maxAge: USER_SESSION_TTL_SECONDS,
      });

      const loginSetCookies = [authCookie];
      if (shouldEnableEmployeeDocumentsWorkspace(accountUser, resolvedNextPath)) {
        loginSetCookies.push(
          serializeCookie(
            USER_EMPLOYEE_DOCUMENTS_COOKIE,
            "1",
            getEmployeeDocumentsCookieOptions(req)
          )
        );
      }

      redirectWithTiming(
        res,
        303,
        resolvedNextPath,
        requestStartNs,
        requestContext.cacheHit,
        { "Set-Cookie": loginSetCookies }
      );
      return;
    }

    if (requestContext.route === ACCOUNT_VERIFY_EMAIL_PATH) {
      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          accountRenderers.renderUnavailablePage(),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const token = normalizeString(reqUrl.searchParams.get("token"), 5000);
      if (!token) {
        redirectWithTiming(res, 303, buildAccountLoginPath("email-verify-error"), requestStartNs, requestContext.cacheHit);
        return;
      }

      try {
        const payload = accountAuth.verifyUserEmailVerificationToken(token, config);
        const targetUser = await usersStore.getUserById(payload.userId, { includeSecret: true });
        const requestedNextPath = normalizeEmployeeDocumentsReturnPath(
          reqUrl.searchParams.get("next"),
          targetUser
        );
        if (!targetUser || targetUser.email !== normalizeString(payload.email, 200).toLowerCase()) {
          throw new Error("ACCOUNT_USER_NOT_FOUND");
        }

        if (targetUser.emailVerificationRequired && !targetUser.emailVerifiedAt) {
          await usersStore.updateUser(targetUser.id, {
            emailVerifiedAt: new Date().toISOString(),
            inviteEmailLastError: "",
          });
        }

        if (!targetUser.passwordHash) {
          const passwordSetupTokenValue = accountAuth.createUserPasswordSetupToken(config, {
            userId: targetUser.id,
            email: targetUser.email,
          });
          redirectWithTiming(
            res,
            303,
            buildAccountLoginPathWithEmail("email-verified-password-setup", targetUser.email, {
              nextPath: requestedNextPath,
            }),
            requestStartNs,
            requestContext.cacheHit,
            {
              "Set-Cookie": serializeCookie(
                USER_PASSWORD_SETUP_COOKIE,
                passwordSetupTokenValue,
                {
                  ...getPasswordSetupCookieOptions(req),
                  maxAge: accountAuth.USER_PASSWORD_SETUP_TTL_SECONDS,
                }
              ),
            }
          );
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildAccountLoginPath("email-verified", { nextPath: requestedNextPath }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch {
        redirectWithTiming(res, 303, buildAccountLoginPath("email-verify-error"), requestStartNs, requestContext.cacheHit);
        return;
      }
    }

    if (requestContext.route === ACCOUNT_LOGOUT_PATH) {
      if (req.method !== "POST") {
        writeHtmlWithTiming(
          res,
          405,
          accountRenderers.renderUnavailablePage(),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      redirectWithTiming(
        res,
        303,
        ACCOUNT_LOGIN_PATH,
        requestStartNs,
        requestContext.cacheHit,
        {
          "Set-Cookie": [
            clearCookie(USER_SESSION_COOKIE, getUserCookieOptions(req)),
            clearCookie(USER_EMPLOYEE_DOCUMENTS_COOKIE, getEmployeeDocumentsCookieOptions(req)),
            clearCookie(USER_PASSWORD_SETUP_COOKIE, getPasswordSetupCookieOptions(req)),
          ],
        }
      );
      return;
    }

    if (
      requestContext.route === ACCOUNT_W9_DOWNLOAD_PATH ||
      requestContext.route === ACCOUNT_CONTRACT_DOWNLOAD_PATH
    ) {
      if (!session || !user) {
        redirectWithTiming(res, 303, ACCOUNT_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

      if (!canUseAccountWorkspace(user)) {
        if (shouldUseAdminWorkspace(user)) {
          redirectWithTiming(res, 303, "/admin", requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(
          res,
          303,
          ACCOUNT_LOGIN_PATH,
          requestStartNs,
          requestContext.cacheHit,
          {
            "Set-Cookie": [
              clearCookie(USER_SESSION_COOKIE, getUserCookieOptions(req)),
              clearCookie(USER_EMPLOYEE_DOCUMENTS_COOKIE, getEmployeeDocumentsCookieOptions(req)),
              clearCookie(USER_PASSWORD_SETUP_COOKIE, getPasswordSetupCookieOptions(req)),
            ],
          }
        );
        return;
      }

      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          accountRenderers.renderUnavailablePage(),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [] };
      const staffRecord = Array.isArray(staffSnapshot.staff)
        ? staffSnapshot.staff.find((record) => record.id === user.staffId) || null
        : null;
      const isContractDownload = requestContext.route === ACCOUNT_CONTRACT_DOWNLOAD_PATH;
      const requestedDocument = isContractDownload
        ? staffRecord && staffRecord.contract && staffRecord.contract.document
          ? staffRecord.contract.document
          : null
        : staffRecord && staffRecord.w9 && staffRecord.w9.document
          ? staffRecord.w9.document
          : null;
      const errorNotice = isContractDownload ? "contract-error" : "w9-error";

      if (!requestedDocument || !requestedDocument.relativePath) {
        writeHtmlWithTiming(
          res,
          404,
          accountRenderers.renderDashboardPage(
            {
              user,
              staffRecord,
              staffSummary: null,
              assignedOrders: [],
            },
            { notice: errorNotice }
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        let body = null;
        if (isContractDownload) {
          const config = loadStaffContractConfig(process.env);
          const absolutePath = resolveStaffContractDocumentAbsolutePath(requestedDocument.relativePath, config);
          body = await fsp.readFile(absolutePath);
        } else {
          const config = loadStaffW9Config(process.env);
          body = await readStoredStaffW9Document(requestedDocument, config);
          if (
            staffStore &&
            staffRecord &&
            staffRecord.w9 &&
            staffRecord.w9.document &&
            !staffRecord.w9.document.dataBase64 &&
            Buffer.isBuffer(body) &&
            body.length > 0
          ) {
            try {
              await staffStore.updateStaff(user.staffId, {
                w9: {
                  ...staffRecord.w9,
                  document: {
                    ...staffRecord.w9.document,
                    dataBase64: body.toString("base64"),
                  },
                },
              });
            } catch {}
          }
        }
        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": requestedDocument.contentType || "application/pdf",
            "Content-Length": String(body.length),
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="${requestedDocument.fileName || (isContractDownload ? "staff-contract.pdf" : "staff-w9.pdf")}"`,
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
          accountRenderers.renderDashboardPage(
            {
              user,
              staffRecord,
              staffSummary: null,
              assignedOrders: [],
            },
            { notice: errorNotice }
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ACCOUNT_GOOGLE_CALENDAR_CONNECT_PATH) {
      if (req.method !== "GET") {
        writeHtmlWithTiming(
          res,
          405,
          accountRenderers.renderUnavailablePage(),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (!session || !user) {
        redirectWithTiming(res, 303, ACCOUNT_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

      if (!canUseAccountWorkspace(user)) {
        if (shouldUseAdminWorkspace(user)) {
          redirectWithTiming(res, 303, "/admin", requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(
          res,
          303,
          ACCOUNT_LOGIN_PATH,
          requestStartNs,
          requestContext.cacheHit,
          {
            "Set-Cookie": [
              clearCookie(USER_SESSION_COOKIE, getUserCookieOptions(req)),
              clearCookie(USER_EMPLOYEE_DOCUMENTS_COOKIE, getEmployeeDocumentsCookieOptions(req)),
              clearCookie(USER_PASSWORD_SETUP_COOKIE, getPasswordSetupCookieOptions(req)),
            ],
          }
        );
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
          buildAccountRedirectPath("calendar-unavailable"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [] };
      const staffRecord = Array.isArray(staffSnapshot.staff)
        ? staffSnapshot.staff.find((record) => record.id === user.staffId) || null
        : null;
      if (!staffRecord) {
        redirectWithTiming(
          res,
          303,
          buildAccountRedirectPath("calendar-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        const calendarConfig =
          adminAuth && typeof adminAuth.loadAdminConfig === "function"
            ? adminAuth.loadAdminConfig(process.env)
            : config;
        const connectUrl = await googleCalendarIntegration.buildConnectUrl(
          staffRecord.id,
          calendarConfig,
          staffRecord.email || user.email,
          { source: "account" }
        );
        redirectWithTiming(res, 303, connectUrl, requestStartNs, requestContext.cacheHit);
        return;
      } catch {
        redirectWithTiming(
          res,
          303,
          buildAccountRedirectPath("calendar-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route !== ACCOUNT_ROOT_PATH) {
      writeHtmlWithTiming(res, 404, accountRenderers.renderUnavailablePage(), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (!session || !user) {
      redirectWithTiming(
        res,
        303,
        buildAccountLoginPath("", {
          nextPath: `${reqUrl.pathname}${reqUrl.search}`,
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (!canUseAccountWorkspace(user)) {
      if (shouldUseAdminWorkspace(user)) {
        redirectWithTiming(res, 303, "/admin", requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(
        res,
        303,
        ACCOUNT_LOGIN_PATH,
        requestStartNs,
        requestContext.cacheHit,
        {
          "Set-Cookie": [
            clearCookie(USER_SESSION_COOKIE, getUserCookieOptions(req)),
            clearCookie(USER_EMPLOYEE_DOCUMENTS_COOKIE, getEmployeeDocumentsCookieOptions(req)),
            clearCookie(USER_PASSWORD_SETUP_COOKIE, getPasswordSetupCookieOptions(req)),
          ],
        }
      );
      return;
    }

    async function loadDashboardContext() {
      const [allEntries, staffSnapshot, settingsSnapshot, usersSnapshot] = await Promise.all([
        quoteOpsLedger ? quoteOpsLedger.listEntries({ limit: 250 }) : Promise.resolve([]),
        staffStore ? staffStore.getSnapshot() : Promise.resolve({ staff: [], assignments: [] }),
        settingsStore ? settingsStore.getSnapshot() : Promise.resolve({ templates: [] }),
        usersStore ? usersStore.getSnapshot() : Promise.resolve({ users: [] }),
      ]);
      const checklistTemplateByServiceType = buildChecklistTemplateMap(settingsSnapshot);
      const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
      const staffById = new Map(
        (Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [])
          .map((record) => [normalizeString(record && record.id, 120), record])
          .filter(([id]) => Boolean(id))
      );
      const staffRecord = Array.isArray(staffSnapshot.staff)
        ? staffSnapshot.staff.find((record) => record.id === user.staffId) || null
        : null;
      const managerContact =
        (Array.isArray(usersSnapshot.users) ? usersSnapshot.users : [])
          .map((managerUser) => {
            const role = normalizeString(managerUser && managerUser.role, 32).toLowerCase();
            const status = normalizeString(managerUser && managerUser.status, 32).toLowerCase();
            if (status !== "active" || (role !== "manager" && role !== "admin")) return null;
            const linkedStaff = staffById.get(normalizeString(managerUser && managerUser.staffId, 120)) || null;
            const phone = normalizeString(
              (linkedStaff && linkedStaff.phone) || (managerUser && managerUser.phone),
              80
            );
            if (!phone) return null;
            return {
              name:
                normalizeString(linkedStaff && linkedStaff.name, 200) ||
                normalizeString(managerUser && managerUser.email, 250) ||
                "Менеджер",
              phone,
              role,
            };
          })
          .filter(Boolean)
          .sort((left, right) => {
            if (left.role !== right.role) return left.role === "manager" ? -1 : 1;
            return left.name.localeCompare(right.name, "ru");
          })[0] || null;
      const staffSummary = Array.isArray(planning.staffSummaries)
        ? planning.staffSummaries.find((record) => record.id === user.staffId) || null
        : null;
      const calendarMeta =
        googleCalendarIntegration && typeof googleCalendarIntegration.buildCalendarMeta === "function"
          ? googleCalendarIntegration.buildCalendarMeta(staffRecord, { blocks: [] })
          : { configured: false, connected: false };
      const assignedOrders = Array.isArray(planning.orderItems)
        ? planning.orderItems.filter((item) =>
            item.assignedStaff.some((record) => record.id === user.staffId)
          ).map((item) => {
            const serviceType = normalizeAccountChecklistServiceType(
              item && item.entry ? item.entry.serviceType : ""
            );
            const checklistTemplate = checklistTemplateByServiceType.get(serviceType) || null;
            const completion = getEntryOrderCompletionData(item && item.entry ? item.entry : {});
            return {
              ...item,
              checklistServiceType: serviceType,
              checklistTemplate,
              staffEarning: getAccountStaffEarning(
                item && item.entry ? item.entry : {},
                item && item.assignment ? item.assignment : null,
                staffRecord,
                user.staffId
              ),
              completion: {
                ...completion,
                checklistItems: buildAccountChecklistItems(checklistTemplate, completion),
              },
            };
          })
        : [];

      return {
        user,
        staffRecord,
        staffSummary,
        calendarMeta,
        assignedOrders,
        managerContact,
        payrollSummary: collectPayrollRecords({
          entries: allEntries,
          staffId: normalizeString(user && user.staffId, 120),
        }),
      };
    }

    if (req.method === "POST") {
      const contentType = normalizeString(req.headers["content-type"], 240).toLowerCase();
      let formBody = {};
      let formFiles = {};
      if (contentType.startsWith("multipart/form-data")) {
        const multipartPayload = await parseMultipartFormBody(
          await readBufferBody(req, 20 * 1024 * 1024),
          req.headers["content-type"] || ""
        );
        formBody = multipartPayload.fields || {};
        formFiles = multipartPayload.files || {};
      } else {
        formBody = parseFormBody(await readTextBody(req, 512 * 1024));
      }
      const action = getFormValue(formBody, "action", 80).toLowerCase();

      try {
        if (action === "save-profile") {
          const nextEmail = getFormValue(formBody, "email", 200).toLowerCase();
          const nextPhone = normalizeAccountPhoneInput(getFormValue(formBody, "phone", 80));
          await usersStore.updateUser(user.id, {
            email: nextEmail,
            phone: nextPhone,
          });

          if (staffStore && user.staffId) {
            try {
              await staffStore.updateStaff(user.staffId, {
                email: nextEmail,
                phone: nextPhone,
              });
            } catch {}
          }

          redirectWithTiming(
            res,
            303,
            buildAccountRedirectPath("profile-saved"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "change-password") {
          const currentPassword = getFormValue(formBody, "currentPassword", 400);
          const newPassword = getFormValue(formBody, "newPassword", 400);
          const confirmPassword = getFormValue(formBody, "confirmPassword", 400);

          if (
            !currentPassword ||
            !newPassword ||
            newPassword.length < 8 ||
            newPassword !== confirmPassword ||
            !adminAuth.verifyPassword(currentPassword, user.passwordHash)
          ) {
            throw new Error("INVALID_PASSWORD_CHANGE");
          }

          await usersStore.updateUser(user.id, {
            passwordHash: adminAuth.hashPassword(newPassword),
          });

          redirectWithTiming(
            res,
            303,
            buildAccountRedirectPath("password-saved"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (
          action === "confirm-assignment" ||
          action === "decline-assignment" ||
          action === "mark-assignment-en-route" ||
          action === "mark-assignment-cleaning-started" ||
          action === "mark-assignment-checklist" ||
          action === "save-assignment-checklist" ||
          action === "complete-assignment-checklist" ||
          action === "save-assignment-note" ||
          action === "mark-assignment-cleaning-complete"
        ) {
          if (!quoteOpsLedger || !staffStore || !user.staffId) {
            throw new Error("ASSIGNMENT_CONFIRMATION_UNAVAILABLE");
          }

          const entryId = getFormValue(formBody, "entryId", 120);
          const entry = await quoteOpsLedger.getEntry(entryId);
          const staffSnapshot = await staffStore.getSnapshot();
          const assignment = Array.isArray(staffSnapshot.assignments)
            ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
            : null;
          const orderPayload =
            entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
              ? entry.payloadForRetry
              : {};
          const adminOrder =
            orderPayload.adminOrder && typeof orderPayload.adminOrder === "object"
              ? orderPayload.adminOrder
              : orderPayload.orderState && typeof orderPayload.orderState === "object"
                ? orderPayload.orderState
                : {};
          const orderStatus = normalizeAccountOrderStatus(adminOrder.status, "new");
          const cleanerConfirmationStatus = getStaffCleanerConfirmationStatus(
            entry,
            assignment,
            user.staffId
          );
          const assignmentActionConfig = {
            "confirm-assignment": {
              allowedStatuses: ["scheduled"],
              cleanerConfirmationStatus: "confirmed",
              notice: "assignment-confirmed",
            },
            "decline-assignment": {
              allowedStatuses: ["scheduled"],
              cleanerConfirmationStatus: "declined",
              notice: "assignment-declined",
            },
            "mark-assignment-en-route": {
              allowedStatuses: ["scheduled"],
              requiredCleanerConfirmationStatus: "confirmed",
              nextStatus: "en-route",
              notice: "assignment-en-route",
            },
            "mark-assignment-cleaning-started": {
              allowedStatuses: ["en-route"],
              nextStatus: "cleaning-started",
              notice: "assignment-cleaning-started",
            },
            "mark-assignment-checklist": {
              allowedStatuses: ["cleaning-started"],
              nextStatus: "checklist",
              notice: "assignment-checklist-opened",
            },
            "mark-assignment-cleaning-complete": {
              allowedStatuses: ["checklist"],
              nextStatus: "cleaning-complete",
              notice: "assignment-cleaning-complete",
              requiredChecklistProgress: true,
            },
          };
          const actionConfig = assignmentActionConfig[action];
          const isChecklistSaveAction = action === "save-assignment-checklist";
          const isChecklistCompleteAction = action === "complete-assignment-checklist";
          const isNoteSaveAction = action === "save-assignment-note";
          const isStageEditorAction =
            isChecklistSaveAction ||
            isChecklistCompleteAction ||
            isNoteSaveAction;

          if (!entry) {
            throw new Error("ASSIGNMENT_ENTRY_NOT_FOUND");
          }
          if (
            !assignment ||
            !Array.isArray(assignment.staffIds) ||
            !assignment.staffIds.includes(user.staffId)
          ) {
            throw new Error("ASSIGNMENT_ACCESS_REVOKED");
          }
          if (!isStageEditorAction && !actionConfig) {
            throw new Error("ASSIGNMENT_CONFIRMATION_INVALID");
          }
          if (!isStageEditorAction && !actionConfig.allowedStatuses.includes(orderStatus)) {
            throw new Error(`ASSIGNMENT_STATUS_MISMATCH:${orderStatus || "new"}`);
          }
          if (
            actionConfig &&
            actionConfig.requiredCleanerConfirmationStatus &&
            cleanerConfirmationStatus !== actionConfig.requiredCleanerConfirmationStatus
          ) {
            throw new Error("ASSIGNMENT_CONFIRMATION_REQUIRED");
          }
          if (action === "mark-assignment-en-route") {
            const enRouteWindowState = getEnRouteActionWindowState({
              entry,
              assignment,
              adminOrder,
            });
            if (!enRouteWindowState.allowed) {
              throw new Error(
                enRouteWindowState.reason === "missing-schedule"
                  ? "ASSIGNMENT_EN_ROUTE_SCHEDULE_MISSING"
                  : "ASSIGNMENT_EN_ROUTE_TOO_EARLY"
              );
            }
          }
          if (
            actionConfig &&
            actionConfig.requiredChecklistProgress &&
            getEntryOrderCompletionData(entry).checklistItems.filter((item) => Boolean(item && item.completed))
              .length === 0
          ) {
            throw new Error("ASSIGNMENT_CHECKLIST_REQUIRED");
          }

          if (isChecklistSaveAction || isChecklistCompleteAction) {
            const checklistTemplate = settingsStore
              ? buildChecklistTemplateMap(await settingsStore.getSnapshot()).get(
                  normalizeAccountChecklistServiceType(entry && entry.serviceType)
                ) || null
              : null;
            const checklistItems = buildAccountChecklistItems(
              checklistTemplate,
              getEntryOrderCompletionData(entry)
            );
            const selectedItemIds = new Set(getFormValues(formBody, "checklistItemId", 80, 120));
            const updatedChecklistItems = checklistItems.map((item, index) => ({
              id: normalizeString(item.id, 120),
              label: normalizeString(item.label, 240),
              hint: normalizeString(item.hint, 240),
              completed: selectedItemIds.has(normalizeString(item.id, 120)),
              sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
              updatedAt: new Date().toISOString(),
            }));

            if (
              orderStatus !== "checklist" ||
              updatedChecklistItems.length === 0 ||
              (isChecklistSaveAction && !updatedChecklistItems.some((item) => item.completed)) ||
              (isChecklistCompleteAction && !updatedChecklistItems.every((item) => item.completed))
            ) {
              throw new Error("ASSIGNMENT_CONFIRMATION_INVALID");
            }

            const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
              orderStatus: isChecklistCompleteAction ? "cleaning-complete" : "checklist",
              completionChecklistItems: updatedChecklistItems,
            });
            if (isChecklistCompleteAction) {
              await syncOrderPayrollSnapshot({
                quoteOpsLedger,
                staffStore,
                entry: updatedEntry || entry,
                entryId,
              });
              if (
                autoNotificationService &&
                typeof autoNotificationService.notifyManagerCleaningComplete === "function"
              ) {
                try {
                  await autoNotificationService.notifyManagerCleaningComplete({
                    entry: updatedEntry || entry,
                  });
                } catch {}
              }
            }

            finishAccountMutation(
              req,
              res,
              requestStartNs,
              requestContext,
              isChecklistCompleteAction ? "assignment-checklist-complete" : "assignment-checklist"
            );
            return;
          }

          if (isNoteSaveAction) {
            const cleanerCommentText = getFormValue(formBody, "cleanerComment", 1000)
              .replace(/\r\n?/g, "\n")
              .trim();
            if (!cleanerCommentText) {
              throw new Error("ASSIGNMENT_CONFIRMATION_INVALID");
            }
            const linkedStaff = Array.isArray(staffSnapshot.staff)
              ? staffSnapshot.staff.find((record) => record && record.id === user.staffId) || null
              : null;
            const existingCompletion = getEntryOrderCompletionData(entry);
            const cleanerCommentRecord = buildAccountCleanerCommentRecord(
              cleanerCommentText,
              user,
              linkedStaff,
              new Date().toISOString()
            );
            const cleanerComments = normalizeAccountCleanerCommentLog([
              ...(Array.isArray(existingCompletion.cleanerComments)
                ? existingCompletion.cleanerComments
                : []),
              cleanerCommentRecord,
            ]);
            const addressBook = buildAccountAddressBookWithCleanerComment(entry, cleanerCommentRecord);

            await quoteOpsLedger.updateOrderEntry(entryId, {
              cleanerComment: buildAccountCleanerCommentSummary(cleanerComments),
              completionCleanerComments: cleanerComments,
            });
            if (addressBook) {
              await quoteOpsLedger.updateClientEntry(entryId, {
                addressBook,
              });
            }

            finishAccountMutation(
              req,
              res,
              requestStartNs,
              requestContext,
              "assignment-note-saved"
            );
            return;
          }

          const orderEntryUpdates = {};
          if (actionConfig.cleanerConfirmationStatus) {
            const cleanerConfirmation = buildCleanerConfirmationUpdate(
              entry,
              assignment,
              user.staffId,
              actionConfig.cleanerConfirmationStatus
            );
            if (!cleanerConfirmation) {
              throw new Error("ASSIGNMENT_CONFIRMATION_INVALID");
            }
            orderEntryUpdates.cleanerConfirmation = cleanerConfirmation;
          }
          if (actionConfig.nextStatus) {
            orderEntryUpdates.orderStatus = actionConfig.nextStatus;
          }

          let updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, orderEntryUpdates);
          await syncOrderPayrollSnapshot({
            quoteOpsLedger,
            staffStore,
            entry: updatedEntry || entry,
            entryId,
          });
          if (
            actionConfig.nextStatus === "en-route" &&
            autoNotificationService &&
            typeof autoNotificationService.notifyClientEnRoute === "function"
          ) {
            try {
              const notificationResult = await autoNotificationService.notifyClientEnRoute({
                entry: updatedEntry || entry,
              });
              if (notificationResult && notificationResult.entry) {
                updatedEntry = notificationResult.entry;
              }
            } catch {}
          }
          if (
            actionConfig.nextStatus === "cleaning-complete" &&
            autoNotificationService &&
            typeof autoNotificationService.notifyManagerCleaningComplete === "function"
          ) {
            try {
              const notificationResult = await autoNotificationService.notifyManagerCleaningComplete({
                entry: updatedEntry || entry,
              });
              if (notificationResult && notificationResult.entry) {
                updatedEntry = notificationResult.entry;
              }
            } catch {}
          }

          finishAccountMutation(
            req,
            res,
            requestStartNs,
            requestContext,
            actionConfig.notice
          );
          return;
        }

        if (action === "save-w9") {
          if (normalizeString(user && user.role, 32).toLowerCase() === "admin") {
            redirectWithTiming(
              res,
              303,
              getAccountHomePath(user),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          if (!staffStore || !user.staffId) {
            throw new Error("W9_STAFF_UNAVAILABLE");
          }

          const staffSnapshot = await staffStore.getSnapshot();
          const linkedStaff = Array.isArray(staffSnapshot.staff)
            ? staffSnapshot.staff.find((record) => record.id === user.staffId) || null
            : null;
          if (!linkedStaff) {
            throw new Error("W9_STAFF_NOT_FOUND");
          }

          const generated = await generateStaffW9Document({
            staffId: user.staffId,
            staffName: linkedStaff.name || user.email,
            legalName: getFormValue(formBody, "w9LegalName", 120),
            businessName: getFormValue(formBody, "w9BusinessName", 120),
            federalTaxClassification: getFormValue(formBody, "w9FederalTaxClassification", 40),
            llcTaxClassification: getFormValue(formBody, "w9LlcTaxClassification", 2),
            otherClassification: getFormValue(formBody, "w9OtherClassification", 120),
            exemptPayeeCode: getFormValue(formBody, "w9ExemptPayeeCode", 32),
            fatcaCode: getFormValue(formBody, "w9FatcaCode", 32),
            addressLine1: getFormValue(formBody, "w9AddressLine1", 180),
            cityStateZip: getFormValue(formBody, "w9CityStateZip", 180),
            accountNumbers: getFormValue(formBody, "w9AccountNumbers", 120),
            line3bApplies: Boolean(getFormValue(formBody, "w9Line3bApplies", 10)),
            tinType: getFormValue(formBody, "w9TinType", 16),
            tinValue: getFormValue(formBody, "w9TinValue", 32),
            certificationConfirmed: Boolean(
              getFormValue(formBody, "w9CertificationConfirmed", 10)
            ),
            submittedByUserId: user.id,
            submittedByEmail: user.email,
            signatureDataUrl: getFormValue(formBody, "w9SignatureDataUrl", 350 * 1024),
          });
          const generatedContract = await generateStaffContractDocument({
            staffId: user.staffId,
            staffName: linkedStaff.name || user.email,
            contractorName: getFormValue(formBody, "w9LegalName", 160),
            contractorAddressLine1: getFormValue(formBody, "w9AddressLine1", 180),
            contractorCityStateZip: getFormValue(formBody, "w9CityStateZip", 180),
            contractorEmail: user.email,
            contractorPhone: linkedStaff.phone || user.phone,
            role: linkedStaff.role,
            compensationType: linkedStaff.compensationType,
            compensationValue: linkedStaff.compensationValue,
            submittedByUserId: user.id,
            submittedByEmail: user.email,
            signatureDataUrl: getFormValue(formBody, "w9SignatureDataUrl", 350 * 1024),
          });

          await staffStore.updateStaff(user.staffId, {
            contract: generatedContract.record,
            w9: generated.record,
          });

          redirectWithTiming(
            res,
            303,
            buildAccountRedirectPath("w9-saved", { focusSection: ACCOUNT_W9_FOCUS_VALUE }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
      } catch (error) {
        if (action === "save-w9") {
          writeHtmlWithTiming(
            res,
            422,
            accountRenderers.renderDashboardPage(await loadDashboardContext(), {
              notice: "w9-error",
              focusSection: ACCOUNT_W9_FOCUS_VALUE,
              w9Draft: buildW9Draft(formBody),
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const errorNotice =
          action === "change-password"
            ? "password-error"
            : action === "confirm-assignment" ||
                action === "decline-assignment" ||
                action === "mark-assignment-en-route" ||
                action === "mark-assignment-cleaning-started" ||
                action === "mark-assignment-checklist" ||
                action === "save-assignment-checklist" ||
                action === "complete-assignment-checklist" ||
                action === "save-assignment-note" ||
                action === "mark-assignment-cleaning-complete"
              ? "assignment-error"
              : action === "save-w9"
                ? "w9-error"
                : "profile-error";
        finishAccountMutationError(
          req,
          res,
          requestStartNs,
          requestContext,
          errorNotice,
          action === "save-w9"
            ? { focusSection: ACCOUNT_W9_FOCUS_VALUE }
            : errorNotice === "assignment-error"
              ? { message: getAccountAssignmentErrorMessage(error) }
              : {}
        );
        return;
      }

      redirectWithTiming(
        res,
        303,
        getAccountHomePath(user),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (req.method !== "GET") {
      writeHtmlWithTiming(
        res,
        405,
        accountRenderers.renderUnavailablePage(),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const activeSection = getAccountSection(reqUrl.searchParams.get("section"));
    const dashboardContext = await loadDashboardContext();
    const renderOptions = {
      notice: normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase(),
      noticeMessage: normalizeString(reqUrl.searchParams.get("message"), 300),
      focusSection: isW9ReturnPath(`${ACCOUNT_ROOT_PATH}${reqUrl.search}`) ? ACCOUNT_W9_FOCUS_VALUE : "",
      activeSection,
      calendarView: getAccountCalendarView(reqUrl.searchParams.get("view")),
      calendarDate: normalizeString(reqUrl.searchParams.get("date"), 32),
      focusedOrderId: normalizeString(
        reqUrl.searchParams.get("order") ||
          reqUrl.searchParams.get("entryId") ||
          reqUrl.searchParams.get("assignment"),
        180
      ),
    };

    writeHtmlWithTiming(
      res,
      200,
      activeSection === "payroll"
        ? accountRenderers.renderPayrollPage(dashboardContext, renderOptions)
        : activeSection === "calendar"
          ? accountRenderers.renderCalendarPage(dashboardContext, renderOptions)
          : accountRenderers.renderDashboardPage(dashboardContext, renderOptions),
      requestStartNs,
      requestContext.cacheHit
    );
  };
}

module.exports = {
  createAccountRequestHandler,
};
