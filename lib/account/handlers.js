"use strict";

const fsp = require("node:fs/promises");
const {
  generateStaffW9Document,
  loadStaffW9Config,
  resolveStaffW9DocumentAbsolutePath,
} = require("../staff-w9");

function createAccountRequestHandler(deps = {}) {
  const {
    ACCOUNT_W9_DOWNLOAD_PATH,
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

  function getPasswordSetupCookieOptions(req) {
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
    const focusSection = normalizeString(options.focusSection, 32).toLowerCase();
    if (focusSection === ACCOUNT_W9_FOCUS_VALUE) {
      reqUrl.searchParams.set("focus", ACCOUNT_W9_FOCUS_VALUE);
    }
    const pathWithSearch = `${reqUrl.pathname}${reqUrl.search}`;
    return focusSection === ACCOUNT_W9_FOCUS_VALUE
      ? `${pathWithSearch}#${ACCOUNT_W9_SECTION_ID}`
      : pathWithSearch;
  }

  function getAccountHomePath(user) {
    const role = normalizeString(user && user.role, 32).toLowerCase();
    if (role === "admin" || role === "manager") {
      return "/admin";
    }
    return ACCOUNT_ROOT_PATH;
  }

  function isAdminPortalOnlyUser(user) {
    return normalizeString(user && user.role, 32).toLowerCase() === "admin";
  }

  function normalizeAccountReturnPath(value, user = null) {
    const defaultPath = getAccountHomePath(user);
    const candidate = normalizeString(value, 1000);
    if (!candidate) return defaultPath;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.origin !== "http://localhost") return defaultPath;
      if (parsed.pathname !== ACCOUNT_ROOT_PATH) return defaultPath;
      if (isAdminPortalOnlyUser(user)) return defaultPath;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return defaultPath;
    }
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

  function getLoginNoticeCopy(reqUrl) {
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "email-verified") {
      return "Email подтверждён. Теперь можно войти в кабинет.";
    }
    if (notice === "email-verified-password-setup") {
      return "Email подтверждён. Введите рабочую почту и нажмите «Войти», чтобы задать первый пароль.";
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
      const resolvedNextPath = normalizeAccountReturnPath(getFormValue(formBody, "next", 1000), accountUser);

      if (action === "setup-first-password") {
        const newPassword = getFormValue(formBody, "newPassword", 400);
        const confirmPassword = getFormValue(formBody, "confirmPassword", 400);
        const passwordSetupPayload = resolvePasswordSetupPayloadForUser(accountUser);

        if (
          !accountUser ||
          accountUser.status !== "active" ||
          !accountUser.emailVerifiedAt ||
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

        redirectWithTiming(
          res,
          303,
          resolvedNextPath,
          requestStartNs,
          requestContext.cacheHit,
          {
            "Set-Cookie": [
              authCookie,
              clearCookie(USER_PASSWORD_SETUP_COOKIE, getPasswordSetupCookieOptions(req)),
            ],
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
            info: "Email подтверждён. Теперь задайте свой первый пароль.",
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

      redirectWithTiming(
        res,
        303,
        resolvedNextPath,
        requestStartNs,
        requestContext.cacheHit,
        { "Set-Cookie": authCookie }
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
        const requestedNextPath = normalizeAccountReturnPath(reqUrl.searchParams.get("next"), targetUser);
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
          "Set-Cookie": clearCookie(USER_SESSION_COOKIE, getUserCookieOptions(req)),
        }
      );
      return;
    }

    if (requestContext.route === ACCOUNT_W9_DOWNLOAD_PATH) {
      if (!session || !user) {
        redirectWithTiming(res, 303, ACCOUNT_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
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
      const w9Document =
        staffRecord && staffRecord.w9 && staffRecord.w9.document ? staffRecord.w9.document : null;

      if (!w9Document || !w9Document.relativePath) {
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
            { notice: "w9-error" }
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        const config = loadStaffW9Config(process.env);
        const absolutePath = resolveStaffW9DocumentAbsolutePath(w9Document.relativePath, config);
        const body = await fsp.readFile(absolutePath);
        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": w9Document.contentType || "application/pdf",
            "Content-Length": String(body.length),
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="${w9Document.fileName || "staff-w9.pdf"}"`,
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
            { notice: "w9-error" }
          ),
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
      redirectWithTiming(res, 303, ACCOUNT_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    if (isAdminPortalOnlyUser(user)) {
      redirectWithTiming(res, 303, "/admin", requestStartNs, requestContext.cacheHit);
      return;
    }

    async function loadDashboardContext() {
      const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: 250 }) : [];
      const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
      const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
      const staffRecord = Array.isArray(staffSnapshot.staff)
        ? staffSnapshot.staff.find((record) => record.id === user.staffId) || null
        : null;
      const staffSummary = Array.isArray(planning.staffSummaries)
        ? planning.staffSummaries.find((record) => record.id === user.staffId) || null
        : null;
      const assignedOrders = Array.isArray(planning.orderItems)
        ? planning.orderItems.filter((item) =>
            item.assignedStaff.some((record) => record.id === user.staffId)
          )
        : [];

      return {
        user,
        staffRecord,
        staffSummary,
        assignedOrders,
      };
    }

    if (req.method === "POST") {
      const formBody = parseFormBody(await readTextBody(req, 512 * 1024));
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

          await staffStore.updateStaff(user.staffId, {
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
      } catch {
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

        redirectWithTiming(
          res,
          303,
          buildAccountRedirectPath(
            action === "change-password"
              ? "password-error"
              : action === "save-w9"
                ? "w9-error"
                : "profile-error"
            ,
            action === "save-w9" ? { focusSection: ACCOUNT_W9_FOCUS_VALUE } : {}
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      redirectWithTiming(res, 303, ACCOUNT_ROOT_PATH, requestStartNs, requestContext.cacheHit);
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

    writeHtmlWithTiming(
      res,
      200,
      accountRenderers.renderDashboardPage(
        await loadDashboardContext(),
        {
          notice: normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase(),
          focusSection: isW9ReturnPath(`${ACCOUNT_ROOT_PATH}${reqUrl.search}`) ? ACCOUNT_W9_FOCUS_VALUE : "",
        }
      ),
      requestStartNs,
      requestContext.cacheHit
    );
  };
}

module.exports = {
  createAccountRequestHandler,
};
