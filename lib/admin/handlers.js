"use strict";

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
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_SESSION_COOKIE,
    ADMIN_SETTINGS_PATH,
    ADMIN_STAFF_PATH,
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
    parseCookies,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    serializeCookie,
    shouldUseSecureCookies,
    writeHtmlWithTiming,
  } = deps;

  function buildAdminAuthHeaders(req, cookies = []) {
    void req;
    const headers = {};
    if (cookies.length > 0) {
      headers["Set-Cookie"] = cookies;
    }
    return headers;
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
        canDelete: role === "admin",
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
    if (challenge) return ADMIN_2FA_PATH;
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

  function buildStaffRedirect(notice, extra = {}) {
    return buildAdminRedirectPath(ADMIN_STAFF_PATH, {
      notice,
      ...extra,
    });
  }

  function buildOrdersRedirect(returnTo, notice, extra = {}) {
    return buildAdminRedirectPath(returnTo, {
      notice,
      ...extra,
    });
  }

  function normalizeAdminPhoneInput(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";

    let digits = raw.replace(/\D+/g, "");
    if (!digits) return "";

    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    const normalizedDigits = digits.slice(0, 10);

    if (!normalizedDigits) return "";
    if (normalizedDigits.length <= 3) return `+1(${normalizedDigits}`;
    if (normalizedDigits.length <= 6) return `+1(${normalizedDigits.slice(0, 3)})${normalizedDigits.slice(3)}`;
    return `+1(${normalizedDigits.slice(0, 3)})${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6, 10)}`;
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
    const usersStore =
      adminRuntime && adminRuntime.usersStore
        ? adminRuntime.usersStore
        : null;
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

    if (requestContext.route === ADMIN_ORDERS_PATH && req.method === "POST") {
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
      const returnTo = buildOrdersReturnPath(getFormValue(formBody, "returnTo", 1000));
      if (
        action === "delete-order" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

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
          if (googleCalendarIntegration && typeof googleCalendarIntegration.clearAssignmentEvents === "function") {
            try {
              await googleCalendarIntegration.clearAssignmentEvents(entryId, config);
            } catch {}
          }
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

        let notice = updatedEntry ? "order-saved" : "order-missing";
        if (updatedEntry && googleCalendarIntegration && typeof googleCalendarIntegration.syncAssignment === "function") {
          try {
            await googleCalendarIntegration.syncAssignment(entryId, config, updatedEntry);
          } catch {
            notice = "order-saved-calendar-error";
          }
        }

        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, notice),
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
      if (
        action === "delete-client" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

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
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return;
      }

      const formBody = parseFormBody(await readTextBody(req, 12 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      if (
        action === "delete-staff" &&
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireDelete: true,
        })
      ) {
        return;
      }

      if (!staffStore) {
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
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("staff-updated"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
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

          await staffStore.setAssignment(entryId, {
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
          const userRole = normalizeWorkspaceRoleValue(getFormValue(formBody, "role", 32));
          const staffRole = formatWorkspaceRoleLabel(userRole);
          let staffId = getFormValue(formBody, "staffId", 120);
          const password = getFormValue(formBody, "password", 400);
          if (!staffId) {
            const createdStaff = await staffStore.createStaff({
              name: getFormValue(formBody, "name", 120),
              role: staffRole,
              phone,
              email,
              address: getFormValue(formBody, "address", 500),
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
              address: getFormValue(formBody, "address", 500),
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
            role: userRole,
            status: getFormValue(formBody, "status", 32),
            passwordHash: adminAuth.hashPassword(password),
          });
          const createdUser = await usersStore.findUserByEmail(email, { includeSecret: true });
          if (staffStore && staffId) {
            try {
              await staffStore.updateStaff(staffId, { email, phone });
            } catch {}
          }
          let redirectNotice = "user-created";
          const inviteEmailStatus =
            accountInviteEmail && typeof accountInviteEmail.getStatus === "function"
              ? await accountInviteEmail.getStatus(config)
              : { configured: false };
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
                emailVerificationRequired: false,
                emailVerifiedAt: new Date().toISOString(),
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
          const userRole = normalizeWorkspaceRoleValue(getFormValue(formBody, "role", 32));
          const staffRole = formatWorkspaceRoleLabel(userRole);
          let staffId = getFormValue(formBody, "staffId", 120) || existingUser.staffId;
          const password = getFormValue(formBody, "password", 400);
          const staffPayload = {
            name: getFormValue(formBody, "name", 120),
            role: staffRole,
            phone,
            email,
            address: getFormValue(formBody, "address", 500),
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
            role: userRole,
            status: getFormValue(formBody, "status", 32),
          };
          if (password) {
            updatePayload.passwordHash = adminAuth.hashPassword(password);
          }
          await usersStore.updateUser(userId, updatePayload);
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
          await usersStore.deleteUser(getFormValue(formBody, "userId", 120));
          redirectWithTiming(
            res,
            303,
            adminPageRenderers.buildSettingsUsersRedirectPath("user-deleted"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }
      } catch {}

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
          requestContext.cacheHit
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
      if (currentUserAccess.authorized) {
        redirectWithTiming(res, 303, ADMIN_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }
      if (currentUserAccess.redirectToAccount) {
        redirectWithTiming(res, 303, ACCOUNT_ROOT_PATH, requestStartNs, requestContext.cacheHit);
        return;
      }

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
