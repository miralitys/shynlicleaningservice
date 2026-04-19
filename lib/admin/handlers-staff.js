"use strict";

function createAdminStaffHandlers(deps = {}) {
  const {
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_VERIFY_EMAIL_PATH,
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_STAFF_PATH,
    SITE_ORIGIN,
    accountAuth,
    accountInviteEmail,
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
  } = deps;

  async function handleStaffPostRoute(context) {
    const {
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
    } = context;

    if (
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireWrite: true,
      })
    ) {
      return true;
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
      return true;
    }

    if (!staffStore) {
      if (ajaxRequest) {
        writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 500);
        return true;
      }
      redirectWithTiming(res, 303, buildStaffRedirect("staff-failed"), requestStartNs, requestContext.cacheHit);
      return true;
    }

    try {
      if (action === "disconnect-google-calendar") {
        if (googleCalendarIntegration && typeof googleCalendarIntegration.disconnectStaffCalendar === "function") {
          await googleCalendarIntegration.disconnectStaffCalendar(getFormValue(formBody, "staffId", 120), config);
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
        return true;
      }

      if (action === "load-staff-sms-history") {
        const staffId = getFormValue(formBody, "staffId", 120);
        const snapshot = await staffStore.getSnapshot();
        const staffRecord = Array.isArray(snapshot.staff)
          ? snapshot.staff.find((record) => normalizeString(record && record.id, 120) === staffId) || null
          : null;

        if (!staffRecord) {
          if (ajaxRequest) {
            writeAjaxMutationError(res, requestStartNs, requestContext, "staff-missing", 404);
            return true;
          }
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("staff-missing"),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        const localHistoryEntries = getStaffSmsHistoryEntries(staffRecord);
        const remoteHistoryEntries = await loadRemoteSmsHistoryEntries(leadConnectorClient, {
          phone: normalizeString(staffRecord.phone, 80),
          conversationIds: extractSmsConversationIds(localHistoryEntries),
        });
        const mergedHistoryEntries = mergeAdminSmsHistoryEntries(localHistoryEntries, remoteHistoryEntries);

        if (ajaxRequest) {
          writeAjaxMutationSuccess(
            res,
            requestStartNs,
            requestContext,
            "staff-sms-history-loaded",
            buildSmsHistoryAjaxPayload(mergedHistoryEntries)
          );
          return true;
        }

        redirectWithTiming(
          res,
          303,
          buildSmsRedirectPath(
            buildStaffReturnPath(getFormValue(formBody, "returnTo", 1000)),
            "staff-sms-history-loaded",
            "staff",
            staffId
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
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
        return true;
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
          return true;
        }
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("staff-updated"),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
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
            return true;
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
          return true;
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
            return true;
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
          return true;
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
            return true;
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
          return true;
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
            writeAjaxMutationSuccess(res, requestStartNs, requestContext, "staff-sms-sent", payload);
          } else {
            writeAjaxMutationError(res, requestStartNs, requestContext, failureNotice, 400, payload);
          }
          return true;
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
        return true;
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
          return true;
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
          return true;
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
          return true;
        }

        const staffName = getFormValue(formBody, "staffName", 120) || staffRecord.name || existingUser.email;
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
        const primaryDocumentsUrl = requiresAccountSetup ? verificationUrl.toString() : loginUrl.toString();

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
            inviteEmailSentAt: reminderResult && reminderResult.sentAt ? reminderResult.sentAt : new Date().toISOString(),
            inviteEmailLastError: "",
          });

          if (
            leadConnectorClient &&
            typeof leadConnectorClient.sendSmsMessage === "function" &&
            leadConnectorClient.isConfigured()
          ) {
            const reminderSmsMessage = buildStaffOnboardingReminderSmsMessage(staffName, primaryDocumentsUrl);
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
          return true;
        } catch (error) {
          await usersStore.updateUser(existingUser.id, {
            inviteEmailLastError: normalizeString(error && error.message ? error.message : "EMAIL_SEND_FAILED", 240),
          });
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("w9-reminder-error"),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }
      }

      if (action === "delete-staff") {
        if (googleCalendarIntegration && typeof googleCalendarIntegration.disconnectStaffCalendar === "function") {
          try {
            await googleCalendarIntegration.disconnectStaffCalendar(getFormValue(formBody, "staffId", 120), config);
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
        return true;
      }

      if (action === "save-assignment") {
        const entryId = getFormValue(formBody, "entryId", 120);
        const entry = quoteOpsLedger ? await quoteOpsLedger.getEntry(entryId) : null;
        if (!entry) {
          if (ajaxRequest) {
            writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 404);
            return true;
          }
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("staff-failed"),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
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
            typeof usersStore.getSnapshot === "function" ? await usersStore.getSnapshot() : { users: [] };
          const adminStaffIds = collectNonAssignableStaffIds(usersSnapshot.users);
          assignmentInput.staffIds = assignmentInput.staffIds.filter((staffId) => !adminStaffIds.has(staffId));
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
              writeAjaxMutationError(res, requestStartNs, requestContext, "assignment-conflict", 409, {
                staff: conflicts.map((item) => item.name).join(", "),
              });
              return true;
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
            return true;
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
          return true;
        }
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect(notice),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      if (action === "clear-assignment") {
        if (googleCalendarIntegration && typeof googleCalendarIntegration.clearAssignmentEvents === "function") {
          try {
            await googleCalendarIntegration.clearAssignmentEvents(getFormValue(formBody, "entryId", 120), config);
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
        return true;
      }
    } catch {}

    redirectWithTiming(
      res,
      303,
      buildStaffRedirect("staff-failed"),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  async function handleStaffConnectRoute(context) {
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

    const snapshot = staffStore && typeof staffStore.getSnapshot === "function" ? await staffStore.getSnapshot() : { staff: [] };
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
      const connectUrl = await googleCalendarIntegration.buildConnectUrl(staffId, config, staffRecord.email);
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

  async function handleStaffCallbackRoute(context) {
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
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("calendar-connect-denied"),
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

  async function handleStaffRoutes(context) {
    const route = context && context.requestContext ? context.requestContext.route : "";
    const method = context && context.req ? context.req.method : "";

    if (route === ADMIN_STAFF_PATH && method === "POST") {
      await handleStaffPostRoute(context);
      return true;
    }

    if (route === ADMIN_STAFF_GOOGLE_CONNECT_PATH) {
      await handleStaffConnectRoute(context);
      return true;
    }

    if (route === ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH) {
      await handleStaffCallbackRoute(context);
      return true;
    }

    return false;
  }

  return {
    handleStaffRoutes,
  };
}

module.exports = {
  createAdminStaffHandlers,
};
