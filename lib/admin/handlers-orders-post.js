"use strict";

const { createAdminOrdersCompletionHandlers } = require("./handlers-orders-completion");
const { createAdminOrdersCreateHandlers } = require("./handlers-orders-create");
const { createAdminOrdersSmsHandlers } = require("./handlers-orders-sms");
const { createAdminOrdersUpdateHandlers } = require("./handlers-orders-update");

function createAdminOrdersPostHandlers(deps = {}) {
  const {
    buildOrderCompletionMutationPayload,
    buildOrderStageMutationPayload,
    buildAdminRedirectPath,
    buildOrdersRedirect,
    buildOrdersReturnPath,
    buildSmsAjaxPayload,
    buildSmsRedirectPath,
    ensureWorkspaceAccess,
    getEntryOrderState,
    getFormValue,
    getRequestUrl,
    isAjaxMutationRequest,
    normalizeString,
    parseFormBody,
    parseMultipartFormBody,
    readBufferBody,
    readJsonBody,
    readTextBody,
    redirectWithTiming,
    resolveAssignableStaffIdsByNames,
    sendOrderPolicyAcceptanceInvite,
    ADMIN_ORDERS_PATH,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeJsonWithTiming,
  } = deps;
  const { handleCreateManualOrder } = createAdminOrdersCreateHandlers(deps);
  const { handleOrderSmsAction } = createAdminOrdersSmsHandlers(deps);
  const { handleOrderCompletionAction } = createAdminOrdersCompletionHandlers(deps);
  const { handleOrderUpdateAction } = createAdminOrdersUpdateHandlers(deps);

  async function handleAdminOrdersPostRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      config,
      quoteOpsLedger,
      leadConnectorClient,
      usersStore,
      staffStore,
      orderMediaStorage,
      googleCalendarIntegration,
      autoNotificationService,
      requestLogger,
    } = context;

    if (
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireWrite: true,
      })
    ) {
      return;
    }

    const contentType = normalizeString(req.headers["content-type"], 240).toLowerCase();
    const isMultipart = contentType.startsWith("multipart/form-data");
    const isJson = contentType.startsWith("application/json");
    const multipartBody = isMultipart
      ? await parseMultipartFormBody(await readBufferBody(req, 32 * 1024 * 1024), contentType)
      : null;
    const jsonBody = !isMultipart && isJson ? await readJsonBody(req, 64 * 1024) : null;
    const formBody = multipartBody
      ? multipartBody.fields
      : jsonBody && typeof jsonBody === "object"
        ? jsonBody
        : parseFormBody(await readTextBody(req, 32 * 1024));
    const formFiles = multipartBody && multipartBody.files ? multipartBody.files : {};
    const action = getFormValue(formBody, "action", 80).toLowerCase();
    const entryId = getFormValue(formBody, "entryId", 120);
    const returnTo = buildOrdersReturnPath(getFormValue(formBody, "returnTo", 1000));
    const ajaxRequest =
      isAjaxMutationRequest(req) || normalizeString(getRequestUrl(req).searchParams.get("ajax"), 8) === "1";
    if (
      action === "delete-order" &&
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireDelete: true,
      })
    ) {
      return;
    }

    if (action === "create-manual-order") {
      await handleCreateManualOrder({
        ...context,
        res,
        requestStartNs,
        requestContext,
        quoteOpsLedger,
        formBody,
        returnTo,
      });
      return;
    }

    if (!quoteOpsLedger || !entryId) {
      if (ajaxRequest && (action === "save-order-completion" || action === "save-order-cleaner-comment")) {
        writeJsonWithTiming(
          res,
          404,
          { ok: false, notice: "order-missing", error: "order-missing", message: "Заказ не найден." },
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
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
      if (
        await handleOrderSmsAction({
          ...context,
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
        })
      ) {
        return;
      }

      const currentEntry =
        action === "save-order-cleaner-comment" ||
        action === "save-order-completion" ||
        action === "delete-order"
          ? null
          : await quoteOpsLedger.getEntry(entryId);

      if (
        await handleOrderCompletionAction({
          ...context,
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
        })
      ) {
        return;
      }

      await handleOrderUpdateAction({
        ...context,
        res,
        requestStartNs,
        requestContext,
        entryId,
        returnTo,
        ajaxRequest,
        formBody,
        currentEntry,
        quoteOpsLedger,
        staffStore,
        usersStore,
        googleCalendarIntegration,
        config,
        autoNotificationService,
        leadConnectorClient,
        requestLogger,
      });
      return;
    } catch (error) {
      if (ajaxRequest && (action === "save-order-completion" || action === "save-order-cleaner-comment")) {
        const errorMessage = normalizeString(error && error.message ? error.message : "", 200);
        writeJsonWithTiming(
          res,
          500,
          {
            ok: false,
            notice: "completion-save-failed",
            error: "completion-save-failed",
            message: errorMessage
              ? action === "save-order-cleaner-comment"
                ? `Не удалось сохранить комментарий клинера: ${errorMessage}.`
                : `Не удалось сохранить фотографии: ${errorMessage}.`
              : action === "save-order-cleaner-comment"
                ? "Не удалось сохранить комментарий клинера. Попробуйте ещё раз."
                : "Не удалось сохранить фотографии. Попробуйте ещё раз.",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
      if (action === "send-order-sms") {
        if (ajaxRequest) {
          writeAjaxMutationError(res, requestStartNs, requestContext, "order-sms-failed", 500, {
            ...buildSmsAjaxPayload("order-sms-failed", "Не удалось отправить SMS по заказу.", null, {
              errorMessage: normalizeString(error && error.message ? error.message : "", 240),
            }),
          });
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildSmsRedirectPath(returnTo, "order-sms-failed", "order", entryId, {
            smsError: normalizeString(error && error.message ? error.message : "", 240),
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
      if (ajaxRequest) {
        const errorMessage = normalizeString(error && error.message ? error.message : "", 200);
        writeAjaxMutationError(res, requestStartNs, requestContext, "order-save-failed", 500, {
          message: errorMessage
            ? `Не удалось сохранить заказ: ${errorMessage}.`
            : "Не удалось сохранить заказ. Попробуйте ещё раз.",
        });
        return;
      }
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, {
          notice:
            action === "delete-order"
              ? "order-delete-failed"
              : action === "save-order-completion" || action === "save-order-cleaner-comment"
                ? "completion-save-failed"
                : "order-save-failed",
        }),
        requestStartNs,
        requestContext.cacheHit
      );
    }
  }

  return {
    handleAdminOrdersPostRoute,
  };
}

module.exports = {
  createAdminOrdersPostHandlers,
};
