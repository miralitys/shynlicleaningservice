"use strict";

function createAdminStaffSmsPostHandlers(deps = {}) {
  const {
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    buildStaffReturnPath,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getFormValue,
    getStaffSmsHistoryEntries,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeString,
    redirectWithTiming,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = deps;

  async function handleStaffSmsPostAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      action,
      formBody,
      ajaxRequest,
      staffStore,
      leadConnectorClient,
    } = context;

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

    if (action !== "send-staff-sms") {
      return false;
    }

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
      } catch {}
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

  return {
    handleStaffSmsPostAction,
  };
}

module.exports = {
  createAdminStaffSmsPostHandlers,
};
