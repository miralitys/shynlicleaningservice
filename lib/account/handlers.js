"use strict";

function createAccountRequestHandler(deps = {}) {
  const {
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

  function buildAccountRedirectPath(notice = "") {
    const reqUrl = new URL(ACCOUNT_ROOT_PATH, "http://localhost");
    if (notice) reqUrl.searchParams.set("notice", notice);
    return `${reqUrl.pathname}${reqUrl.search}`;
  }

  function getAccountHomePath(user) {
    const role = normalizeString(user && user.role, 32).toLowerCase();
    if (role === "admin" || role === "manager") {
      return "/admin";
    }
    return ACCOUNT_ROOT_PATH;
  }

  function buildAccountLoginPath(notice = "") {
    const reqUrl = new URL(ACCOUNT_LOGIN_PATH, "http://localhost");
    if (notice) reqUrl.searchParams.set("notice", notice);
    return `${reqUrl.pathname}${reqUrl.search}`;
  }

  function buildAccountLoginPathWithEmail(notice = "", email = "") {
    const reqUrl = new URL(ACCOUNT_LOGIN_PATH, "http://localhost");
    if (notice) reqUrl.searchParams.set("notice", notice);
    const normalizedEmail = normalizeString(email, 200).toLowerCase();
    if (normalizedEmail) reqUrl.searchParams.set("email", normalizedEmail);
    return `${reqUrl.pathname}${reqUrl.search}`;
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
      if (req.method === "GET") {
        if (session && user) {
          redirectWithTiming(
            res,
            303,
            getAccountHomePath(user),
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

      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const email = getFormValue(formBody, "email", 200).toLowerCase();
      const accountUser = await usersStore.findUserByEmail(email, { includeSecret: true });

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
          getAccountHomePath(accountUser),
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
        getAccountHomePath(accountUser),
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
            buildAccountLoginPathWithEmail("email-verified-password-setup", targetUser.email),
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

        redirectWithTiming(res, 303, buildAccountLoginPath("email-verified"), requestStartNs, requestContext.cacheHit);
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

    if (requestContext.route !== ACCOUNT_ROOT_PATH) {
      writeHtmlWithTiming(res, 404, accountRenderers.renderUnavailablePage(), requestStartNs, requestContext.cacheHit);
      return;
    }

    if (!session || !user) {
      redirectWithTiming(res, 303, ACCOUNT_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    if (req.method === "POST") {
      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
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
      } catch {
        redirectWithTiming(
          res,
          303,
          buildAccountRedirectPath(action === "change-password" ? "password-error" : "profile-error"),
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
      ? planning.orderItems.filter((item) => item.assignedStaff.some((record) => record.id === user.staffId))
      : [];

    writeHtmlWithTiming(
      res,
      200,
      accountRenderers.renderDashboardPage(
        {
          user,
          staffRecord,
          staffSummary,
          assignedOrders,
        },
        {
          notice: normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase(),
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
