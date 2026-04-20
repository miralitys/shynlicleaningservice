"use strict";

function createAdminOrdersCompletionHandlers(deps = {}) {
  const {
    buildAdminRedirectPath,
    buildOrderCompletionMutationPayload,
    buildOrdersRedirect,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getFormValue,
    normalizeString,
    redirectWithTiming,
    sendOrderPolicyAcceptanceInvite,
    writeJsonWithTiming,
  } = deps;

  async function handleOrderCompletionAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      action,
      entryId,
      returnTo,
      ajaxRequest,
      formBody,
      formFiles,
      quoteOpsLedger,
      currentEntry,
      orderMediaStorage,
      googleCalendarIntegration,
      config,
      staffStore,
      leadConnectorClient,
    } = context;

    if (action === "save-order-cleaner-comment") {
      const cleanerComment = getFormValue(formBody, "cleanerComment", 4000).replace(/\r\n?/g, "\n");
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, { cleanerComment });

      if (ajaxRequest) {
        writeJsonWithTiming(
          res,
          updatedEntry ? 200 : 404,
          buildOrderCompletionMutationPayload(updatedEntry, updatedEntry ? "completion-saved" : "order-missing", {
            message: "Комментарий клинера сохранён.",
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, updatedEntry ? "completion-saved" : "order-missing"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action === "save-order-completion") {
      const completionEntry = await quoteOpsLedger.getEntry(entryId);
      if (!completionEntry) {
        if (ajaxRequest) {
          writeJsonWithTiming(
            res,
            404,
            { ok: false, notice: "order-missing", error: "order-missing", message: "Заказ не найден." },
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "order-missing" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      const existingCompletion = getEntryOrderCompletionData(completionEntry);
      const beforeUploads =
        orderMediaStorage && Array.isArray(formFiles.beforePhotos)
          ? await orderMediaStorage.uploadFiles(entryId, "before", formFiles.beforePhotos)
          : [];
      const afterUploads =
        orderMediaStorage && Array.isArray(formFiles.afterPhotos)
          ? await orderMediaStorage.uploadFiles(entryId, "after", formFiles.afterPhotos)
          : [];

      if (orderMediaStorage) {
        if (beforeUploads.length > 0 && existingCompletion.beforePhotos.length > 0) {
          await orderMediaStorage.deleteAssets(existingCompletion.beforePhotos);
        }
        if (afterUploads.length > 0 && existingCompletion.afterPhotos.length > 0) {
          await orderMediaStorage.deleteAssets(existingCompletion.afterPhotos);
        }
      }

      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        completionBeforePhotos: beforeUploads.length > 0 ? beforeUploads : existingCompletion.beforePhotos,
        completionAfterPhotos: afterUploads.length > 0 ? afterUploads : existingCompletion.afterPhotos,
      });

      if (ajaxRequest) {
        writeJsonWithTiming(
          res,
          updatedEntry ? 200 : 404,
          buildOrderCompletionMutationPayload(updatedEntry, updatedEntry ? "completion-saved" : "order-missing"),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, "completion-saved"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action === "delete-order") {
      const existingEntry = await quoteOpsLedger.getEntry(entryId);
      if (googleCalendarIntegration && typeof googleCalendarIntegration.clearAssignmentEvents === "function") {
        try {
          await googleCalendarIntegration.clearAssignmentEvents(entryId, config);
        } catch {}
      }
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, { removeOrder: true });
      if (updatedEntry && orderMediaStorage && existingEntry) {
        const completionData = getEntryOrderCompletionData(existingEntry);
        await orderMediaStorage.deleteAssets([...completionData.beforePhotos, ...completionData.afterPhotos]);
      }
      if (updatedEntry && staffStore && typeof staffStore.clearAssignment === "function") {
        try {
          await staffStore.clearAssignment(entryId);
        } catch {}
      }
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, { notice: updatedEntry ? "order-deleted" : "order-missing" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action === "resend-order-policy") {
      const currentPolicyAcceptance =
        typeof getEntryOrderPolicyAcceptanceData === "function" ? getEntryOrderPolicyAcceptanceData(currentEntry) : {};

      if (currentPolicyAcceptance.policyAccepted) {
        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, "order-policy-already-signed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      const resendResult = await sendOrderPolicyAcceptanceInvite(
        quoteOpsLedger,
        entryId,
        currentEntry,
        config,
        leadConnectorClient
      );

      let notice = "order-policy-resend-failed";
      if (resendResult.emailState === "sent") {
        notice = resendResult.smsState === "sent" ? "order-policy-resent" : "order-policy-resent-email-only";
      } else if (resendResult.emailState === "sms-only") {
        notice = "order-policy-resent-sms-only";
      } else if (resendResult.emailState === "unavailable") {
        notice = "order-policy-resend-unavailable";
      } else if (resendResult.emailState === "missing-recipient") {
        notice = "order-policy-resend-missing-recipient";
      }

      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, notice),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action !== "reset-order-policy") {
      return false;
    }

    const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, { policyAcceptance: null });
    redirectWithTiming(
      res,
      303,
      buildOrdersRedirect(returnTo, updatedEntry ? "order-policy-reset" : "order-missing"),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleOrderCompletionAction,
  };
}

module.exports = {
  createAdminOrdersCompletionHandlers,
};
