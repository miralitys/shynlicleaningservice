"use strict";

function createAdminRequestHandler(deps = {}) {
  const {
    ADMIN_2FA_PATH,
    ADMIN_APP_ROUTES,
    ADMIN_CHALLENGE_COOKIE,
    ADMIN_CLIENTS_PATH,
    ADMIN_LOGIN_PATH,
    ADMIN_LOGOUT_PATH,
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_SESSION_COOKIE,
    ADMIN_SETTINGS_PATH,
    ADMIN_STAFF_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    adminAuth,
    adminLoginRateLimiter,
    adminPageRenderers,
    adminSharedRenderers,
    adminTwoFactorRateLimiter,
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
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    serializeCookie,
    writeHtmlWithTiming,
  } = deps;

  function buildAdminAuthHeaders(req, cookies = []) {
    const headers = {};
    if (cookies.length > 0) {
      headers["Set-Cookie"] = cookies;
    }
    return headers;
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
    if (!adminState.config) {
      writeHtmlWithTiming(res, 503, adminSharedRenderers.renderAdminUnavailablePage(), requestStartNs, requestContext.cacheHit);
      return;
    }

    const { config, session, challenge, fingerprint } = adminState;

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
      if (!session) {
        if (challenge) {
          redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
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

    if (requestContext.route === ADMIN_ORDERS_PATH && req.method === "POST") {
      if (!session) {
        if (challenge) {
          redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const entryId = getFormValue(formBody, "entryId", 120);
      const returnTo = buildOrdersReturnPath(getFormValue(formBody, "returnTo", 1000));

      if (!quoteOpsLedger || !entryId) {
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
        if (action === "delete-order") {
          const deleted = await quoteOpsLedger.deleteEntry(entryId);
          if (deleted && staffStore && typeof staffStore.clearAssignment === "function") {
            try {
              await staffStore.clearAssignment(entryId);
            } catch {}
          }
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: deleted ? "order-deleted" : "order-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          orderStatus: getFormValue(formBody, "orderStatus", 40),
          assignedStaff: getFormValue(formBody, "assignedStaff", 120),
          selectedDate: getFormValue(formBody, "selectedDate", 32),
          selectedTime: getFormValue(formBody, "selectedTime", 32),
          frequency: getFormValue(formBody, "frequency", 40),
        });

        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, {
            notice: updatedEntry ? "order-saved" : "order-missing",
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch {
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: action === "delete-order" ? "order-delete-failed" : "order-save-failed" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_CLIENTS_PATH && req.method === "POST") {
      if (!session) {
        if (challenge) {
          redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const clientKey = getFormValue(formBody, "clientKey", 250).toLowerCase();
      const returnTo = buildClientsReturnPath(getFormValue(formBody, "returnTo", 1000));

      if (action !== "delete-client" || !quoteOpsLedger || !clientKey) {
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
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice: "client-missing", client: "" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        let deletedCount = 0;
        for (const entry of client.entries) {
          if (!entry.id) continue;
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
      } catch {
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "client-delete-failed", client: "" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (requestContext.route === ADMIN_STAFF_PATH && req.method === "POST") {
      if (!session) {
        if (challenge) {
          redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 12 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();

      if (!staffStore) {
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "staff-failed" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        if (action === "create-staff") {
          await staffStore.createStaff({
            name: getFormValue(formBody, "name", 120),
            role: getFormValue(formBody, "role", 80),
            phone: getFormValue(formBody, "phone", 80),
            email: getFormValue(formBody, "email", 200),
            address: getFormValue(formBody, "address", 500),
            status: getFormValue(formBody, "status", 32),
            notes: getFormValue(formBody, "notes", 800),
          });
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "staff-created" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "update-staff") {
          await staffStore.updateStaff(getFormValue(formBody, "staffId", 120), {
            name: getFormValue(formBody, "name", 120),
            role: getFormValue(formBody, "role", 80),
            phone: getFormValue(formBody, "phone", 80),
            email: getFormValue(formBody, "email", 200),
            address: getFormValue(formBody, "address", 500),
            status: getFormValue(formBody, "status", 32),
            notes: getFormValue(formBody, "notes", 800),
          });
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "staff-updated" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "delete-staff") {
          await staffStore.deleteStaff(getFormValue(formBody, "staffId", 120));
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "staff-deleted" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "save-assignment") {
          const entryId = getFormValue(formBody, "entryId", 120);
          const entry = quoteOpsLedger ? await quoteOpsLedger.getEntry(entryId) : null;
          if (!entry) {
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "staff-failed" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return;
          }

          await staffStore.setAssignment(entryId, {
            staffIds: getFormValues(formBody, "staffIds", 6, 120),
            scheduleDate: getFormValue(formBody, "scheduleDate", 32),
            scheduleTime: getFormValue(formBody, "scheduleTime", 32),
            status: getFormValue(formBody, "status", 32),
            notes: getFormValue(formBody, "notes", 800),
          });
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "assignment-saved" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        if (action === "clear-assignment") {
          await staffStore.clearAssignment(getFormValue(formBody, "entryId", 120));
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "assignment-cleared" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
      } catch {}

      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(ADMIN_STAFF_PATH, { notice: "staff-failed" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (requestContext.route === ADMIN_SETTINGS_PATH && req.method === "POST") {
      if (!session) {
        if (challenge) {
          redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
          return;
        }
        redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 16 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const serviceType = getFormValue(formBody, "serviceType", 32).toLowerCase();

      if (!settingsStore) {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsRedirectPath(serviceType, "error"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        if (action === "save_checklist_state") {
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

        if (action === "reset_checklist_state") {
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
      } catch {}

      redirectWithTiming(
        res,
        303,
        adminPageRenderers.buildSettingsRedirectPath(serviceType, "error"),
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
      if (session) {
        writeHtmlWithTiming(
          res,
          200,
          await adminPageRenderers.renderAdminAppPage(requestContext.route, req, config, adminRuntime, quoteOpsLedger, staffStore),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
      if (challenge) {
        redirectWithTiming(res, 303, ADMIN_2FA_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      redirectWithTiming(res, 303, ADMIN_LOGIN_PATH, requestStartNs, requestContext.cacheHit);
      return;
    }

    if (requestContext.route === ADMIN_LOGIN_PATH) {
      if (req.method === "GET") {
        if (session) {
          redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
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
        writeHtmlWithTiming(
          res,
          401,
          adminSharedRenderers.renderLoginPage(config, {
            error: "Неверная почта или пароль. Попробуйте ещё раз.",
            email,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

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

    if (requestContext.route === ADMIN_2FA_PATH) {
      if (!challenge) {
        redirectWithTiming(
          res,
          303,
          ADMIN_LOGIN_PATH,
          requestStartNs,
          requestContext.cacheHit,
          buildAdminAuthHeaders(req, [clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req))])
        );
        return;
      }

      if (req.method === "GET") {
        const secret = adminAuth.getTotpSecretMaterial(config);
        const otpauthUri = adminAuth.buildOtpauthUri(config);
        const qrMarkup = await buildAdminQrMarkup(otpauthUri);
        writeHtmlWithTiming(
          res,
          200,
          adminSharedRenderers.renderTwoFactorPage(config, { secret, otpauthUri, qrMarkup }),
          requestStartNs,
          requestContext.cacheHit
        );
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
      const code = getFormValue(formBody, "code", 16);
      if (!adminAuth.verifyTotpCode(code, config)) {
        const secret = adminAuth.getTotpSecretMaterial(config);
        const otpauthUri = adminAuth.buildOtpauthUri(config);
        const qrMarkup = await buildAdminQrMarkup(otpauthUri);
        writeHtmlWithTiming(
          res,
          401,
          adminSharedRenderers.renderTwoFactorPage(config, {
            secret,
            otpauthUri,
            qrMarkup,
            error: "Неверный код. Проверьте приложение и попробуйте снова.",
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
      redirectWithTiming(
        res,
        303,
        ADMIN_LOGIN_PATH,
        requestStartNs,
        requestContext.cacheHit,
        buildAdminAuthHeaders(req, [
          clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions(req)),
          clearCookie(ADMIN_CHALLENGE_COOKIE, getAdminCookieOptions(req)),
        ])
      );
    }
  };
}

module.exports = {
  createAdminRequestHandler,
};
