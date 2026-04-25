"use strict";

function createAdminStaffOnboardingPostHandlers(deps = {}) {
  const {
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_VERIFY_EMAIL_PATH,
    SITE_ORIGIN,
    accountAuth,
    accountInviteEmail,
    buildSmsHistoryRecord,
    buildStaffOnboardingReminderSmsMessage,
    buildStaffRedirect,
    getFormValue,
    getStaffSmsHistoryEntries,
    isAdminWorkspaceRole,
    isEmployeeLinkedUser,
    normalizeString,
    redirectWithTiming,
    resolveLinkedUser,
  } = deps;

  async function handleStaffOnboardingPostAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      action,
      formBody,
      config,
      staffStore,
      usersStore,
      leadConnectorClient,
    } = context;

    if (action !== "resend-staff-w9-reminder") {
      return false;
    }

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
          } catch {}
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

  return {
    handleStaffOnboardingPostAction,
  };
}

module.exports = {
  createAdminStaffOnboardingPostHandlers,
};
