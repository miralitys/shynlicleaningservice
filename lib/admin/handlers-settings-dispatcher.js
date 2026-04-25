"use strict";

function createAdminSettingsHandlers(deps = {}) {
  const {
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
  } = deps;

  async function handleSettingsRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      config,
      adminRuntime = {},
      settingsStore = null,
      usersStore = null,
      staffStore = null,
    } = context;
    const googleMailIntegration =
      adminRuntime && adminRuntime.googleMailIntegration
        ? adminRuntime.googleMailIntegration
        : null;

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
        return true;
      }

      const reqUrl = new URL(req.url || ADMIN_GOOGLE_MAIL_CONNECT_PATH, "http://localhost");
      const loginHint = normalizeString(reqUrl.searchParams.get("email"), 200);

      try {
        const connectUrl = await googleMailIntegration.buildConnectUrl(config, loginHint);
        redirectWithTiming(res, 303, connectUrl, requestStartNs, requestContext.cacheHit);
      } catch {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
      }
      return true;
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
        return true;
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
        return true;
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
        return true;
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
      } catch {
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("mail-connect-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
      }
      return true;
    }

    if (!(requestContext.route === ADMIN_SETTINGS_PATH && req.method === "POST")) {
      return false;
    }

    if (
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireWrite: true,
      })
    ) {
      return true;
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
      return true;
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
        return true;
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
        return true;
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
        return true;
      }

      if (action === "save_checklist_template") {
        if (!settingsStore) throw new Error("SETTINGS_STORE_UNAVAILABLE");
        const itemIds = getFormValues(formBody, "itemId", 300, 120);
        const itemLabels = getFormValues(formBody, "itemLabel", 300, 240);
        const itemHints = getFormValues(formBody, "itemHint", 300, 240);
        const items = itemLabels.map((label, index) => ({
          id: itemIds[index] || "",
          label,
          hint: itemHints[index] || "",
        }));
        await settingsStore.saveChecklistTemplate(serviceType, items);
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsRedirectPath(serviceType, "checklist-updated"),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
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
        return true;
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
        return true;
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
          return true;
        }
        redirectWithTiming(
          res,
          303,
          adminPageRenderers.buildSettingsUsersRedirectPath("user-updated"),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
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
          return true;
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
          return true;
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
          return true;
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
        return true;
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
        return true;
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
    return true;
  }

  return {
    handleSettingsRoute,
  };
}

module.exports = {
  createAdminSettingsHandlers,
};
