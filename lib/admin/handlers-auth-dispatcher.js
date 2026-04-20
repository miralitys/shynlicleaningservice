"use strict";

function createAdminAuthHandlers(deps = {}) {
  const {
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
  } = deps;

  function isAdminSecondFactorRequired(config) {
    return Boolean(config && normalizeString(config.configuredTotpSecret, 256));
  }

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
    return challenge ? ADMIN_2FA_PATH : ADMIN_LOGIN_PATH;
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

  function enforceSlidingRateLimit(
    rateLimiter,
    req,
    res,
    requestStartNs,
    requestContext,
    key,
    errorMessage
  ) {
    const decision = rateLimiter.take(key);
    if (decision.allowed) return false;
    requestContext.cacheHit = false;
    writeHtmlWithTiming(
      res,
      429,
      adminSharedRenderers.renderAdminLayout(
        "Слишком много попыток",
        `<div class="admin-alert admin-alert-error">${escapeHtml(
          errorMessage || "Слишком много попыток. Подождите немного и попробуйте снова."
        )}</div>`,
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

  async function handleAdminLoginRoute(context) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      config,
      challenge,
      fingerprint,
      currentUserAccess,
      usersStore,
    } = context;

    if (req.method === "GET") {
      if (currentUserAccess.authorized) {
        redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      if (currentUserAccess.redirectToAccount) {
        redirectWithTiming(res, 303, ACCOUNT_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      if (challenge && isAdminSecondFactorRequired(config)) {
        redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      writeHtmlWithTiming(
        res,
        200,
        adminSharedRenderers.renderLoginPage(config, {
          requireSecondFactor: isAdminSecondFactorRequired(config),
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
        adminSharedRenderers.renderAdminLayout(
          "Метод не поддерживается",
          `<div class="admin-alert admin-alert-error">Здесь доступны только GET и POST.</div>`
        ),
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
          error: workspaceUserLogin.error || "Неверная почта или пароль. Попробуйте ещё раз.",
          email,
          requireSecondFactor: isAdminSecondFactorRequired(config),
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (isAdminSecondFactorRequired(config)) {
      const challengeToken = adminAuth.createAdminChallengeToken(config, {
        email: config.email,
        fingerprint,
      });
      redirectWithTiming(
        res,
        303,
        ADMIN_2FA_PATH,
        requestStartNs,
        requestContext.cacheHit,
        buildAdminAuthHeaders(req, [
          serializeCookie(ADMIN_CHALLENGE_COOKIE, challengeToken, {
            ...getAdminCookieOptions(req),
            maxAge: adminAuth.CHALLENGE_TTL_SECONDS,
          }),
          clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions(req)),
        ])
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
  }

  async function handleAdminTwoFactorRoute(context) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      config,
      challenge,
      fingerprint,
      currentUserAccess,
    } = context;

    if (currentUserAccess.authorized) {
      redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }
    if (currentUserAccess.redirectToAccount) {
      redirectWithTiming(res, 303, ACCOUNT_ROOT_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }
    const requiresSecondFactor = isAdminSecondFactorRequired(config);
    if (!requiresSecondFactor || !challenge) {
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

    if (req.method === "GET") {
      const qrMarkup =
        typeof buildAdminQrMarkup === "function" && typeof adminAuth.buildOtpauthUri === "function"
          ? await buildAdminQrMarkup(adminAuth.buildOtpauthUri(config))
          : "";
      writeHtmlWithTiming(
        res,
        200,
        adminSharedRenderers.renderTwoFactorPage(config, {
          qrMarkup,
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
        adminSharedRenderers.renderAdminLayout(
          "Метод не поддерживается",
          `<div class="admin-alert admin-alert-error">Здесь доступны только GET и POST.</div>`
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (
      enforceSlidingRateLimit(
        adminTwoFactorRateLimiter,
        req,
        res,
        requestStartNs,
        requestContext,
        `${getClientAddress(req)}:2fa`,
        "Слишком много попыток подтверждения. Подождите несколько минут и попробуйте снова."
      )
    ) {
      return;
    }

    const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
    const code = getFormValue(formBody, "code", 20).replace(/\D+/g, "");
    if (!adminAuth.verifyTotpCode(code, config)) {
      const qrMarkup =
        typeof buildAdminQrMarkup === "function" && typeof adminAuth.buildOtpauthUri === "function"
          ? await buildAdminQrMarkup(adminAuth.buildOtpauthUri(config))
          : "";
      writeHtmlWithTiming(
        res,
        401,
        adminSharedRenderers.renderTwoFactorPage(config, {
          error: "Неверный код подтверждения. Попробуйте ещё раз.",
          qrMarkup,
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const sessionToken = adminAuth.createAdminSessionToken(config, {
      email: config.email,
      fingerprint: challenge.fingerprint || fingerprint,
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
  }

  function handleAdminLogoutRoute(context) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      session,
      portalState,
    } = context;

    if (req.method !== "POST") {
      writeHtmlWithTiming(
        res,
        405,
        adminSharedRenderers.renderAdminLayout(
          "Метод не поддерживается",
          `<div class="admin-alert admin-alert-error">Выход выполняется только через POST.</div>`
        ),
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

  async function handleAuthRoute(context) {
    const route = context && context.requestContext ? context.requestContext.route : "";
    if (route === ADMIN_LOGIN_PATH) {
      await handleAdminLoginRoute(context);
      return true;
    }
    if (route === ADMIN_2FA_PATH) {
      await handleAdminTwoFactorRoute(context);
      return true;
    }
    if (route === ADMIN_LOGOUT_PATH) {
      handleAdminLogoutRoute(context);
      return true;
    }
    return false;
  }

  return {
    buildAdminSessionRefreshHeaders,
    buildCurrentUserAccess,
    handleAuthRoute,
    redirectUnauthorizedAdminAccess,
    resolvePortalUserSession,
  };
}

module.exports = {
  createAdminAuthHandlers,
};
