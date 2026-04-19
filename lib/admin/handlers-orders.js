"use strict";

function createAdminOrdersHandlers(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    buildAdminRedirectPath,
    buildManualOrderRequestId,
    buildOrderCompletionMutationPayload,
    buildOrderStageMutationPayload,
    buildOrdersRedirect,
    buildOrdersReturnPath,
    buildRecurringOrderSubmission,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    ensureWorkspaceAccess,
    extractSmsConversationIds,
    formatManualOrderServiceLabel,
    formatSmsErrorMessage,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getEntryOrderState,
    getEntrySmsHistoryEntries,
    getFormValue,
    getFormValues,
    getOrderStatusFromEntry,
    getRequestUrl,
    isAjaxMutationRequest,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeManualOrderFrequency,
    normalizeManualOrderServiceType,
    normalizeOrderStatus,
    normalizeString,
    orderPolicyAcceptance,
    parseFormBody,
    parseMultipartFormBody,
    readBufferBody,
    readJsonBody,
    readTextBody,
    redirectWithTiming,
    resolveAssignableStaffIdsByNames,
    sendOrderPolicyAcceptanceInvite,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHeadWithTiming,
    writeJsonWithTiming,
  } = deps;

  function writePlainNotFound(res, requestStartNs, requestContext) {
    writeHeadWithTiming(
      res,
      404,
      {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end("Not found");
  }

  async function handleOrdersMediaGetRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      quoteOpsLedger,
      orderMediaStorage,
    } = context;

    const reqUrl = getRequestUrl(req);
    if (reqUrl.searchParams.get("media") !== "1") {
      return false;
    }

    if (!ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge)) {
      return true;
    }

    const entryId = normalizeString(reqUrl.searchParams.get("entryId"), 120);
    const assetId = normalizeString(reqUrl.searchParams.get("asset"), 180);
    if (!quoteOpsLedger || !orderMediaStorage || !entryId || !assetId) {
      writePlainNotFound(res, requestStartNs, requestContext);
      return true;
    }

    try {
      const entry = await quoteOpsLedger.getEntry(entryId);
      const completionData = entry ? getEntryOrderCompletionData(entry) : null;
      const asset =
        completionData
          ? [...completionData.beforePhotos, ...completionData.afterPhotos].find(
              (item) => normalizeString(item.id, 180) === assetId
            ) || null
          : null;
      if (!asset) {
        writePlainNotFound(res, requestStartNs, requestContext);
        return true;
      }

      const media = await orderMediaStorage.getAsset(asset);
      writeHeadWithTiming(
        res,
        200,
        {
          "Content-Type": media.contentType || asset.contentType || "application/octet-stream",
          "Content-Length": String(media.sizeBytes || media.buffer.length),
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${media.fileName || asset.fileName || "order-photo.jpg"}"`,
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end(media.buffer);
      return true;
    } catch {
      writePlainNotFound(res, requestStartNs, requestContext);
      return true;
    }
  }

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
      const customerName = getFormValue(formBody, "customerName", 250);
      const customerPhone = getFormValue(formBody, "customerPhone", 80);
      const customerEmail = getFormValue(formBody, "customerEmail", 250).toLowerCase();
      const fullAddress = getFormValue(formBody, "fullAddress", 500);
      const serviceType = normalizeManualOrderServiceType(getFormValue(formBody, "serviceType", 40));
      const serviceName = formatManualOrderServiceLabel(serviceType);
      const selectedDate = getFormValue(formBody, "selectedDate", 32);
      const selectedTime = getFormValue(formBody, "selectedTime", 32);
      const frequency = normalizeManualOrderFrequency(getFormValue(formBody, "frequency", 40));
      const totalPrice = getFormValue(formBody, "totalPrice", 64);

      if (!quoteOpsLedger || !customerName || !customerPhone || !fullAddress) {
        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, "manual-order-invalid", { createOrder: "1" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      try {
        const createdEntry = await quoteOpsLedger.recordSubmission({
          ok: true,
          requestId: buildManualOrderRequestId(customerName),
          sourceRoute: ADMIN_ORDERS_PATH,
          source: "Manual admin order",
          customerName,
          customerPhone,
          customerEmail,
          serviceType,
          serviceName,
          totalPrice: 0,
          totalPriceCents: 0,
          selectedDate: "",
          selectedTime: "",
          fullAddress,
          httpStatus: 200,
          code: "MANUAL_ORDER_CREATED",
          retryable: false,
          warnings: [],
          errorMessage: "",
          payloadForRetry: {
            calculatorData: {
              serviceType,
              frequency,
              fullAddress,
              address: fullAddress,
              selectedDate,
              selectedTime,
            },
          },
        });

        const updatedEntry = await quoteOpsLedger.updateOrderEntry(createdEntry.id, {
          createOrder: true,
          orderStatus: selectedDate || selectedTime ? "scheduled" : "new",
          selectedDate,
          selectedTime,
          frequency,
          totalPrice,
          paymentStatus: "unpaid",
        });

        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(
            ADMIN_ORDERS_PATH,
            updatedEntry ? "manual-order-created" : "order-save-failed",
            { order: (updatedEntry || createdEntry).id }
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch {
        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, "order-save-failed", { createOrder: "1" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
    }

    if (!quoteOpsLedger || !entryId) {
      if (ajaxRequest && (action === "save-order-completion" || action === "save-order-cleaner-comment")) {
        writeJsonWithTiming(
          res,
          404,
          {
            ok: false,
            notice: "order-missing",
            error: "order-missing",
            message: "Заказ не найден.",
          },
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
      if (action === "load-order-sms-history") {
        const ajaxRequest = isAjaxMutationRequest(req);
        const currentEntry = await quoteOpsLedger.getEntry(entryId);

        if (!currentEntry) {
          if (ajaxRequest) {
            writeAjaxMutationError(res, requestStartNs, requestContext, "order-missing", 404);
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

        const localHistoryEntries = getEntrySmsHistoryEntries(currentEntry);
        const remoteHistoryEntries = await loadRemoteSmsHistoryEntries(leadConnectorClient, {
          contactId: normalizeString(currentEntry.contactId, 120),
          phone: normalizeString(currentEntry.customerPhone, 80),
          conversationIds: extractSmsConversationIds(localHistoryEntries),
        });
        const mergedHistoryEntries = mergeAdminSmsHistoryEntries(
          localHistoryEntries,
          remoteHistoryEntries
        );

        if (ajaxRequest) {
          writeAjaxMutationSuccess(
            res,
            requestStartNs,
            requestContext,
            "order-sms-history-loaded",
            buildSmsHistoryAjaxPayload(mergedHistoryEntries)
          );
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildSmsRedirectPath(returnTo, "order-sms-history-loaded", "order", entryId),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "send-order-sms") {
        const ajaxRequest = isAjaxMutationRequest(req);
        const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
        if (!message) {
          if (ajaxRequest) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "order-sms-empty",
              400,
              {
                ...buildSmsAjaxPayload("order-sms-empty", "Не удалось отправить SMS по заказу.", null, {
                  draft: message,
                }),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "order-sms-empty", "order", entryId),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
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
              "order-sms-unavailable",
              503,
              {
                ...buildSmsAjaxPayload(
                  "order-sms-unavailable",
                  "Не удалось отправить SMS по заказу.",
                  null,
                  {
                    draft: message,
                  }
                ),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "order-sms-unavailable", "order", entryId, {
              smsDraft: message,
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const currentEntry = await quoteOpsLedger.getEntry(entryId);
        if (!currentEntry) {
          if (ajaxRequest) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "order-missing",
              404,
              {
                ...buildSmsAjaxPayload("order-sms-failed", "Не удалось отправить SMS по заказу.", [], {
                  errorMessage: "Заказ больше не найден.",
                  draft: message,
                }),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "order-missing", "order", entryId),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
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
          } catch {
            // Best effort only: SMS already went out successfully.
          }
        }

        const failureNotice =
          smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
            ? "order-sms-contact-missing"
            : smsResult.code === "NOT_CONFIGURED"
              ? "order-sms-unavailable"
              : "order-sms-failed";

        if (ajaxRequest) {
          const historyEntries = smsResult.ok ? getEntrySmsHistoryEntries(updatedEntry || currentEntry) : null;
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
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              failureNotice,
              400,
              payload
            );
          }
          return;
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
        return;
      }

      const currentEntry =
        action === "save-order-cleaner-comment" ||
        action === "save-order-completion" ||
        action === "delete-order"
          ? null
          : await quoteOpsLedger.getEntry(entryId);

      if (action === "save-order-cleaner-comment") {
        const cleanerComment = getFormValue(formBody, "cleanerComment", 4000).replace(/\r\n?/g, "\n");
        const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          cleanerComment,
        });

        if (ajaxRequest) {
          writeJsonWithTiming(
            res,
            updatedEntry ? 200 : 404,
            buildOrderCompletionMutationPayload(
              updatedEntry,
              updatedEntry ? "completion-saved" : "order-missing",
              { message: "Комментарий клинера сохранён." }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, updatedEntry ? "completion-saved" : "order-missing"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "save-order-completion") {
        const currentEntry = await quoteOpsLedger.getEntry(entryId);
        if (!currentEntry) {
          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              404,
              {
                ok: false,
                notice: "order-missing",
                error: "order-missing",
                message: "Заказ не найден.",
              },
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

        const existingCompletion = getEntryOrderCompletionData(currentEntry);
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
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, "completion-saved"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
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
          await orderMediaStorage.deleteAssets([
            ...completionData.beforePhotos,
            ...completionData.afterPhotos,
          ]);
        }
        if (updatedEntry && staffStore && typeof staffStore.clearAssignment === "function") {
          try {
            await staffStore.clearAssignment(entryId);
          } catch {}
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, {
            notice: updatedEntry ? "order-deleted" : "order-missing",
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "resend-order-policy") {
        const currentPolicyAcceptance =
          typeof getEntryOrderPolicyAcceptanceData === "function"
            ? getEntryOrderPolicyAcceptanceData(currentEntry)
            : {};

        if (currentPolicyAcceptance.policyAccepted) {
          redirectWithTiming(
            res,
            303,
            buildOrdersRedirect(returnTo, "order-policy-already-signed"),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
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
        return;
      }

      if (action === "reset-order-policy") {
        const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: null,
        });

        redirectWithTiming(
          res,
          303,
          buildOrdersRedirect(returnTo, updatedEntry ? "order-policy-reset" : "order-missing"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      const existingAdminOrder = getEntryOrderState(currentEntry);
      const existingRecurringNextEntryId = normalizeString(existingAdminOrder.recurringNextEntryId, 120);

      const orderUpdates = {};
      const selectedAssignedStaffNames = Object.prototype.hasOwnProperty.call(formBody, "assignedStaff")
        ? getFormValues(formBody, "assignedStaff", 8, 120)
        : null;
      const requestedOrderStatus = getFormValue(formBody, "orderStatus", 40);
      const requestedPolicyStage = normalizeString(requestedOrderStatus, 40).toLowerCase() === "policy";
      if (Object.prototype.hasOwnProperty.call(formBody, "orderStatus")) {
        orderUpdates.orderStatus = requestedPolicyStage ? "scheduled" : requestedOrderStatus;
      }
      let resolvedAssignedStaff = null;
      if (selectedAssignedStaffNames) {
        if (staffStore && typeof staffStore.getSnapshot === "function") {
          resolvedAssignedStaff = await resolveAssignableStaffIdsByNames(
            staffStore,
            usersStore,
            selectedAssignedStaffNames
          );
          orderUpdates.assignedStaff = resolvedAssignedStaff.staffNames.join(", ");
        } else {
          orderUpdates.assignedStaff = selectedAssignedStaffNames.join(", ");
        }
      }
      if (Object.prototype.hasOwnProperty.call(formBody, "paymentStatus")) {
        orderUpdates.paymentStatus = getFormValue(formBody, "paymentStatus", 40);
      }
      if (Object.prototype.hasOwnProperty.call(formBody, "paymentMethod")) {
        orderUpdates.paymentMethod = getFormValue(formBody, "paymentMethod", 40);
      }
      if (Object.prototype.hasOwnProperty.call(formBody, "totalPrice")) {
        orderUpdates.totalPrice = getFormValue(formBody, "totalPrice", 64);
      }
      if (Object.prototype.hasOwnProperty.call(formBody, "selectedDate")) {
        orderUpdates.selectedDate = getFormValue(formBody, "selectedDate", 32);
      }
      if (Object.prototype.hasOwnProperty.call(formBody, "selectedTime")) {
        orderUpdates.selectedTime = getFormValue(formBody, "selectedTime", 32);
      }
      if (Object.prototype.hasOwnProperty.call(formBody, "frequency")) {
        orderUpdates.frequency = getFormValue(formBody, "frequency", 40);
      }

      const previousOrderStatus = getOrderStatusFromEntry(currentEntry);
      const currentPolicyAcceptance =
        typeof getEntryOrderPolicyAcceptanceData === "function"
          ? getEntryOrderPolicyAcceptanceData(currentEntry)
          : {};
      let updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, orderUpdates);
      const nextOrderStatus = getOrderStatusFromEntry(updatedEntry);
      const transitionedToScheduled =
        Boolean(updatedEntry) &&
        (requestedPolicyStage || (previousOrderStatus !== "scheduled" && nextOrderStatus === "scheduled"));
      const transitionedToAwaitingReview =
        Boolean(updatedEntry) &&
        previousOrderStatus !== "awaiting-review" &&
        nextOrderStatus === "awaiting-review";
      let assignmentForNotifications = null;

      if (updatedEntry && selectedAssignedStaffNames && staffStore && typeof staffStore.setAssignment === "function") {
        const { snapshot: staffSnapshot, staffIds } =
          resolvedAssignedStaff ||
          await resolveAssignableStaffIdsByNames(
            staffStore,
            usersStore,
            selectedAssignedStaffNames
          );
        const existingAssignment =
          staffSnapshot && Array.isArray(staffSnapshot.assignments)
            ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
            : null;

        await staffStore.setAssignment(entryId, {
          staffIds,
          scheduleDate: existingAssignment
            ? existingAssignment.scheduleDate
            : normalizeString(updatedEntry && updatedEntry.selectedDate, 32),
          scheduleTime: existingAssignment
            ? existingAssignment.scheduleTime
            : normalizeString(updatedEntry && updatedEntry.selectedTime, 32),
          status:
            existingAssignment && staffIds.length > 0
              ? existingAssignment.status
              : "planned",
          notes: existingAssignment ? existingAssignment.notes : "",
          calendarSync: existingAssignment ? existingAssignment.calendarSync : null,
        });
        assignmentForNotifications =
          (staffStore && typeof staffStore.getSnapshot === "function"
            ? (((await staffStore.getSnapshot()).assignments || []).find((record) => record && record.entryId === entryId) || null)
            : null) || assignmentForNotifications;
      } else if (
        transitionedToScheduled &&
        updatedEntry &&
        staffStore &&
        typeof staffStore.getSnapshot === "function"
      ) {
        const staffSnapshot = await staffStore.getSnapshot();
        assignmentForNotifications = Array.isArray(staffSnapshot.assignments)
          ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
          : null;
      }

      if (
        updatedEntry &&
        previousOrderStatus !== "completed" &&
        normalizeOrderStatus(getEntryOrderState(updatedEntry).status, "new") === "completed" &&
        !existingRecurringNextEntryId &&
        typeof buildRecurringOrderSubmission === "function"
      ) {
        const recurringSubmission = buildRecurringOrderSubmission(updatedEntry);
        if (recurringSubmission) {
          const recurringEntry = await quoteOpsLedger.recordSubmission(recurringSubmission);
          if (recurringEntry) {
            const recurringAdminOrder = getEntryOrderState(recurringSubmission.payloadForRetry);
            await quoteOpsLedger.updateOrderEntry(entryId, {
              recurringNextEntryId: recurringEntry.id,
              recurringGeneratedAt: recurringEntry.createdAt,
              recurringSeriesId: normalizeString(recurringAdminOrder.recurringSeriesId, 120),
            });
          }
        }
      }

      let notice = updatedEntry ? "order-saved" : "order-missing";
      let calendarSyncFailed = false;
      if (updatedEntry && googleCalendarIntegration && typeof googleCalendarIntegration.syncAssignment === "function") {
        try {
          await googleCalendarIntegration.syncAssignment(entryId, config, updatedEntry);
        } catch {
          calendarSyncFailed = true;
        }
      }

      if (transitionedToScheduled) {
        const enteredScheduledStage =
          Boolean(updatedEntry) &&
          (requestedPolicyStage || (previousOrderStatus !== "scheduled" && nextOrderStatus === "scheduled")) &&
          !currentPolicyAcceptance.policyAccepted;

        let policyEmailState = "";
        if (
          enteredScheduledStage &&
          orderPolicyAcceptance &&
          typeof orderPolicyAcceptance.buildPendingAcceptance === "function"
        ) {
          const inviteResult = await sendOrderPolicyAcceptanceInvite(
            quoteOpsLedger,
            entryId,
            updatedEntry,
            config,
            leadConnectorClient
          );
          updatedEntry = inviteResult.updatedEntry;
          policyEmailState = inviteResult.emailState || "failed";
        }

        if (policyEmailState === "sent") {
          notice = calendarSyncFailed
            ? "order-saved-calendar-policy-email-sent"
            : "order-saved-policy-email-sent";
        } else if (policyEmailState === "sms-only") {
          notice = calendarSyncFailed
            ? "order-saved-calendar-policy-sms-sent"
            : "order-saved-policy-sms-sent";
        } else if (policyEmailState === "failed") {
          notice = calendarSyncFailed
            ? "order-saved-calendar-policy-email-error"
            : "order-saved-policy-email-failed";
        } else if (policyEmailState === "unavailable") {
          notice = "order-saved-policy-email-unavailable";
        } else if (policyEmailState === "missing-recipient") {
          notice = "order-saved-policy-email-missing-recipient";
        } else if (calendarSyncFailed) {
          notice = "order-saved-calendar-error";
        }
      } else if (calendarSyncFailed) {
        notice = "order-saved-calendar-error";
      }

      if (
        updatedEntry &&
        assignmentForNotifications &&
        autoNotificationService &&
        typeof autoNotificationService.notifyScheduledAssignment === "function"
      ) {
        try {
          const notificationResult = await autoNotificationService.notifyScheduledAssignment({
            entry: updatedEntry,
            assignment: assignmentForNotifications,
            leadConnectorClient,
          });
          if (notificationResult && notificationResult.entry) {
            updatedEntry = notificationResult.entry;
          }
        } catch {}
      }

      if (
        updatedEntry &&
        transitionedToAwaitingReview &&
        autoNotificationService &&
        typeof autoNotificationService.notifyAwaitingReviewRequest === "function"
      ) {
        try {
          const reviewNotificationResult = await autoNotificationService.notifyAwaitingReviewRequest({
            entry: updatedEntry,
            leadConnectorClient,
          });
          if (reviewNotificationResult && reviewNotificationResult.entry) {
            updatedEntry = reviewNotificationResult.entry;
          }
        } catch (error) {
          try {
            requestLogger.log({
              ts: new Date().toISOString(),
              type: "review_request_notification_failed",
              entryId,
              message: normalizeString(error && error.message, 300),
            });
          } catch {}
        }
      }

      if (ajaxRequest) {
        writeJsonWithTiming(
          res,
          updatedEntry ? 200 : 404,
          buildOrderStageMutationPayload(updatedEntry, updatedEntry ? notice : "order-missing"),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, notice),
        requestStartNs,
        requestContext.cacheHit
      );
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
          writeAjaxMutationError(
            res,
            requestStartNs,
            requestContext,
            "order-sms-failed",
            500,
            {
              ...buildSmsAjaxPayload("order-sms-failed", "Не удалось отправить SMS по заказу.", null, {
                errorMessage: normalizeString(error && error.message ? error.message : "", 240),
              }),
            }
          );
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
        writeAjaxMutationError(
          res,
          requestStartNs,
          requestContext,
          "order-save-failed",
          500,
          {
            message: errorMessage
              ? `Не удалось сохранить заказ: ${errorMessage}.`
              : "Не удалось сохранить заказ. Попробуйте ещё раз.",
          }
        );
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
      return;
    }
  }

  async function handleAdminOrdersRoutes(context = {}) {
    const { req, requestContext } = context;
    if (!req || !requestContext || requestContext.route !== ADMIN_ORDERS_PATH) {
      return false;
    }

    if (req.method === "POST") {
      await handleAdminOrdersPostRoute(context);
      return true;
    }

    if (req.method === "GET") {
      return handleOrdersMediaGetRoute(context);
    }

    return false;
  }

  return {
    handleAdminOrdersRoutes,
  };
}

module.exports = {
  createAdminOrdersHandlers,
};
