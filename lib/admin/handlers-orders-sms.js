"use strict";

function createAdminOrdersSmsHandlers(deps = {}) {
  const {
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getEntryCustomerSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getFormValue,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeString,
    redirectWithTiming,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = deps;

  async function handleOrderSmsAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      action,
      entryId,
      returnTo,
      ajaxRequest,
      formBody,
      quoteOpsLedger,
      leadConnectorClient,
    } = context;

    if (action === "load-order-sms-history") {
      const currentEntry = await quoteOpsLedger.getEntry(entryId);
      if (!currentEntry) {
        if (ajaxRequest) {
          writeAjaxMutationError(res, requestStartNs, requestContext, "order-missing", 404);
          return true;
        }
        redirectWithTiming(
          res,
          303,
          buildSmsRedirectPath(returnTo, "order-missing", "order", entryId),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      const localHistoryEntries = getEntryCustomerSmsHistoryEntries(currentEntry);
      const remoteHistoryEntries = await loadRemoteSmsHistoryEntries(leadConnectorClient, {
        contactId: normalizeString(currentEntry.contactId, 120),
        phone: normalizeString(currentEntry.customerPhone, 80),
        conversationIds: extractSmsConversationIds(localHistoryEntries),
      });
      const mergedHistoryEntries = mergeAdminSmsHistoryEntries(localHistoryEntries, remoteHistoryEntries);
      const customerHistoryEntries = getEntryCustomerSmsHistoryEntries({
        ...currentEntry,
        payloadForRetry: {
          ...(currentEntry.payloadForRetry || {}),
          adminSms: {
            history: mergedHistoryEntries,
          },
        },
      });

      if (ajaxRequest) {
        writeAjaxMutationSuccess(
          res,
          requestStartNs,
          requestContext,
          "order-sms-history-loaded",
          buildSmsHistoryAjaxPayload(customerHistoryEntries)
        );
        return true;
      }

      redirectWithTiming(
        res,
        303,
        buildSmsRedirectPath(returnTo, "order-sms-history-loaded", "order", entryId),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action !== "send-order-sms") {
      return false;
    }

    const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
    if (!message) {
      if (ajaxRequest) {
        writeAjaxMutationError(res, requestStartNs, requestContext, "order-sms-empty", 400, {
          ...buildSmsAjaxPayload("order-sms-empty", "Не удалось отправить SMS по заказу.", null, {
            draft: message,
          }),
        });
        return true;
      }
      redirectWithTiming(
        res,
        303,
        buildSmsRedirectPath(returnTo, "order-sms-empty", "order", entryId),
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
        writeAjaxMutationError(res, requestStartNs, requestContext, "order-sms-unavailable", 503, {
          ...buildSmsAjaxPayload("order-sms-unavailable", "Не удалось отправить SMS по заказу.", null, {
            draft: message,
          }),
        });
        return true;
      }
      redirectWithTiming(
        res,
        303,
        buildSmsRedirectPath(returnTo, "order-sms-unavailable", "order", entryId, { smsDraft: message }),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const currentEntry = await quoteOpsLedger.getEntry(entryId);
    if (!currentEntry) {
      if (ajaxRequest) {
        writeAjaxMutationError(res, requestStartNs, requestContext, "order-missing", 404, {
          ...buildSmsAjaxPayload("order-sms-failed", "Не удалось отправить SMS по заказу.", [], {
            errorMessage: "Заказ больше не найден.",
            draft: message,
          }),
        });
        return true;
      }
      redirectWithTiming(
        res,
        303,
        buildSmsRedirectPath(returnTo, "order-missing", "order", entryId),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const smsResult = await leadConnectorClient.sendSmsMessage({
      contactId: normalizeString(currentEntry.contactId, 120),
      phone: normalizeString(currentEntry.customerPhone, 80),
      customerName: normalizeString(currentEntry.customerName, 160),
      customerEmail: normalizeString(currentEntry.customerEmail, 250).toLowerCase(),
      message,
    });

    let updatedEntry = currentEntry;
    const nextHistory = smsResult.ok
      ? [
          buildSmsHistoryRecord(smsResult, {
            message,
            phone: normalizeString(currentEntry.customerPhone, 80),
            targetType: "order",
            targetRef: entryId,
            source: "manual",
          }),
          ...getEntrySmsHistoryEntries(currentEntry),
        ]
      : null;

    if (smsResult.ok) {
      try {
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          contactId: normalizeString(smsResult.contactId || currentEntry.contactId, 120),
          smsHistory: nextHistory,
        });
      } catch {}
    }

    const failureNotice =
      smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
        ? "order-sms-contact-missing"
        : smsResult.code === "NOT_CONFIGURED"
          ? "order-sms-unavailable"
          : "order-sms-failed";

    if (ajaxRequest) {
      const historyEntries = smsResult.ok ? getEntryCustomerSmsHistoryEntries(updatedEntry || currentEntry) : null;
      const payload = buildSmsAjaxPayload(
        smsResult.ok ? "order-sms-sent" : failureNotice,
        "Не удалось отправить SMS по заказу.",
        historyEntries,
        {
          errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заказу."),
          draft: message,
        }
      );
      if (smsResult.ok) {
        writeAjaxMutationSuccess(res, requestStartNs, requestContext, "order-sms-sent", payload);
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
        smsResult.ok ? "order-sms-sent" : failureNotice,
        "order",
        entryId,
        smsResult.ok
          ? {}
          : {
              smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заказу."),
              smsDraft: message,
            }
      ),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleOrderSmsAction,
  };
}

module.exports = {
  createAdminOrdersSmsHandlers,
};
