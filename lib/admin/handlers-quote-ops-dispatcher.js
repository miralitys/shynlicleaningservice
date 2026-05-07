"use strict";

function createAdminQuoteOpsHandlers(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    adminSharedRenderers,
    buildAdminRedirectPath,
    buildLeadMutationPayload,
    buildOrdersRedirect,
    buildQuoteOpsReturnPath,
    buildRecurringOrderSubmission,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    ensureWorkspaceAccess,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getEntryCustomerSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getEntryOrderState,
    getFormValue,
    getLeadConnectorClient,
    isAjaxMutationRequest,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeLeadStatus,
    normalizeOrderStatus,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    resolveLeadManagerRecord,
    resolveLeadTaskAssigneeRecord,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  } = deps;

  function parseNextCleaningSchedule(value) {
    const normalized = normalizeString(value, 80);
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
    if (!match) return null;
    return {
      raw: normalized,
      selectedDate: match[1],
      selectedTime: match[2],
    };
  }

  function getOrderState(entry = {}) {
    return typeof getEntryOrderState === "function" ? getEntryOrderState(entry) : {};
  }

  async function scheduleNextCleaningFromTask(quoteOpsLedger, entry, schedule) {
    if (!quoteOpsLedger || !entry || !schedule) {
      return { notice: "next-cleaning-unavailable", nextEntryId: "" };
    }

    const currentOrder = getOrderState(entry);
    const existingNextEntryId = normalizeString(currentOrder.recurringNextEntryId, 120);
    if (existingNextEntryId && typeof quoteOpsLedger.getEntry === "function") {
      const existingNextEntry = await quoteOpsLedger.getEntry(existingNextEntryId);
      if (existingNextEntry && typeof quoteOpsLedger.updateOrderEntry === "function") {
        const updatedNextEntry = await quoteOpsLedger.updateOrderEntry(existingNextEntryId, {
          selectedDate: schedule.selectedDate,
          selectedTime: schedule.selectedTime,
          orderStatus: "new",
        });
        return {
          notice: updatedNextEntry ? "next-cleaning-scheduled" : "next-cleaning-unavailable",
          nextEntryId: updatedNextEntry ? existingNextEntryId : "",
        };
      }
    }

    if (
      typeof buildRecurringOrderSubmission !== "function" ||
      typeof quoteOpsLedger.recordSubmission !== "function"
    ) {
      return { notice: "next-cleaning-unavailable", nextEntryId: "" };
    }

    const recurringSubmission = buildRecurringOrderSubmission(entry, {
      selectedDate: schedule.selectedDate,
      selectedTime: schedule.selectedTime,
    });
    if (!recurringSubmission) {
      return { notice: "next-cleaning-unavailable", nextEntryId: "" };
    }

    const recurringEntry = await quoteOpsLedger.recordSubmission(recurringSubmission);
    if (!recurringEntry) {
      return { notice: "next-cleaning-unavailable", nextEntryId: "" };
    }

    const recurringOrder = getOrderState(recurringEntry);
    if (typeof quoteOpsLedger.updateOrderEntry === "function") {
      await quoteOpsLedger.updateOrderEntry(entry.id, {
        recurringNextEntryId: recurringEntry.id,
        recurringGeneratedAt: recurringEntry.createdAt,
        recurringSeriesId: normalizeString(recurringOrder.recurringSeriesId, 120),
      });
    }

    return { notice: "next-cleaning-scheduled", nextEntryId: recurringEntry.id };
  }

  async function markNextCleaningDeclined(quoteOpsLedger, entry) {
    if (!quoteOpsLedger || !entry) return { notice: "client-marked-one-time" };

    const currentOrder = getOrderState(entry);
    const existingNextEntryId = normalizeString(currentOrder.recurringNextEntryId, 120);
    if (existingNextEntryId && typeof quoteOpsLedger.getEntry === "function") {
      const existingNextEntry = await quoteOpsLedger.getEntry(existingNextEntryId);
      const existingNextOrder = getOrderState(existingNextEntry);
      const sourceEntryId = normalizeString(existingNextOrder.recurringSourceEntryId, 120);
      const nextStatus =
        typeof normalizeOrderStatus === "function"
          ? normalizeOrderStatus(existingNextOrder.status, "new")
          : normalizeString(existingNextOrder.status, 40).toLowerCase() || "new";
      if (existingNextEntry && sourceEntryId === normalizeString(entry.id, 120)) {
        if (nextStatus === "new" && typeof quoteOpsLedger.deleteEntry === "function") {
          await quoteOpsLedger.deleteEntry(existingNextEntryId);
        } else if (typeof quoteOpsLedger.updateOrderEntry === "function") {
          await quoteOpsLedger.updateOrderEntry(existingNextEntryId, {
            orderStatus: "canceled",
            frequency: "",
          });
        }
      }
    }

    if (typeof quoteOpsLedger.updateOrderEntry === "function") {
      await quoteOpsLedger.updateOrderEntry(entry.id, {
        frequency: "",
        recurringNextEntryId: "",
        recurringGeneratedAt: "",
      });
    }

    return { notice: "client-marked-one-time" };
  }

  async function handleQuoteOpsRoutes({
    req,
    res,
    requestStartNs,
    requestContext,
    currentUserAccess,
    challenge,
    quoteOpsLedger,
    leadConnectorClient,
    usersStore,
    staffStore,
  }) {
    if (requestContext.route === ADMIN_QUOTE_OPS_RETRY_PATH) {
      if (req.method !== "POST") {
        writeHtmlWithTiming(
          res,
          405,
          adminSharedRenderers.renderAdminLayout(
            "Метод не поддерживается",
            `<div class="admin-alert admin-alert-error">Здесь доступен только POST.</div>`
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
        return true;
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
      return true;
    }

    if (requestContext.route === ADMIN_QUOTE_OPS_PATH && req.method === "POST") {
      if (
        !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
          requireWrite: true,
        })
      ) {
        return true;
      }

      const formBody = parseFormBody(await readTextBody(req, 8 * 1024));
      const action = getFormValue(formBody, "action", 80).toLowerCase();
      const entryId = getFormValue(formBody, "entryId", 120);
      const returnTo = buildQuoteOpsReturnPath(getFormValue(formBody, "returnTo", 1000));

      if (!quoteOpsLedger || !entryId) {
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      try {
        if (action === "create-order-from-request") {
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            status: "confirmed",
          });

          redirectWithTiming(
            res,
            303,
            updatedEntry
              ? buildOrdersRedirect(ADMIN_ORDERS_PATH, "order-created", { order: entryId })
              : buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "delete-lead-entry") {
          const deleted = await quoteOpsLedger.deleteEntry(entryId);
          redirectWithTiming(
            res,
            303,
            deleted
              ? buildAdminRedirectPath(returnTo, { notice: "lead-deleted", entry: "" })
              : buildAdminRedirectPath(returnTo, { notice: "lead-missing", entry: "" }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "load-quote-sms-history") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const entry = await quoteOpsLedger.getEntry(entryId);

          if (!entry) {
            if (ajaxRequest) {
              writeAjaxMutationError(res, requestStartNs, requestContext, "lead-missing", 404);
              return true;
            }
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          const localHistoryEntries = getEntryCustomerSmsHistoryEntries(entry);
          const remoteHistoryEntries = await loadRemoteSmsHistoryEntries(leadConnectorClient, {
            contactId: normalizeString(entry.contactId, 120),
            phone: normalizeString(entry.customerPhone, 80),
            conversationIds: extractSmsConversationIds(localHistoryEntries),
          });
          const mergedHistoryEntries = mergeAdminSmsHistoryEntries(
            localHistoryEntries,
            remoteHistoryEntries
          );
          const customerHistoryEntries = getEntryCustomerSmsHistoryEntries({
            ...entry,
            payloadForRetry: {
              ...(entry.payloadForRetry || {}),
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
              "quote-sms-history-loaded",
              buildSmsHistoryAjaxPayload(customerHistoryEntries)
            );
            return true;
          }

          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "quote-sms-history-loaded", "quote", entryId),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "send-quote-sms") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
          if (!message) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "quote-sms-empty",
                400,
                {
                  ...buildSmsAjaxPayload("quote-sms-empty", "Не удалось отправить SMS по заявке.", null, {
                    draft: message,
                  }),
                }
              );
              return true;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "quote-sms-empty", "quote", entryId),
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
                "quote-sms-unavailable",
                503,
                {
                  ...buildSmsAjaxPayload("quote-sms-unavailable", "Не удалось отправить SMS по заявке.", null, {
                    draft: message,
                  }),
                }
              );
              return true;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "quote-sms-unavailable", "quote", entryId, {
                smsDraft: message,
              }),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          const entry = await quoteOpsLedger.getEntry(entryId);
          if (!entry) {
            if (ajaxRequest) {
              writeAjaxMutationError(
                res,
                requestStartNs,
                requestContext,
                "lead-missing",
                404,
                {
                  ...buildSmsAjaxPayload("quote-sms-failed", "Не удалось отправить SMS по заявке.", [], {
                    errorMessage: "Заявка больше не найдена.",
                    draft: message,
                  }),
                }
              );
              return true;
            }
            redirectWithTiming(
              res,
              303,
              buildSmsRedirectPath(returnTo, "lead-missing", "quote", entryId),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          const smsResult = await leadConnectorClient.sendSmsMessage({
            contactId: normalizeString(entry.contactId, 120),
            phone: normalizeString(entry.customerPhone, 80),
            customerName: normalizeString(entry.customerName, 160),
            customerEmail: normalizeString(entry.customerEmail, 250).toLowerCase(),
            message,
          });

          let updatedEntry = entry;
          const nextHistory = smsResult.ok
            ? [
                buildSmsHistoryRecord(smsResult, {
                  message,
                  phone: normalizeString(entry.customerPhone, 80),
                  targetType: "quote",
                  targetRef: entryId,
                  source: "manual",
                }),
                ...getEntrySmsHistoryEntries(entry),
              ]
            : null;

          if (
            smsResult.ok &&
            ((!normalizeString(entry.contactId, 120) && normalizeString(smsResult.contactId, 120)) ||
              Array.isArray(nextHistory))
          ) {
            try {
              updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
                contactId: normalizeString(smsResult.contactId || entry.contactId, 120),
                smsHistory: nextHistory,
              });
            } catch {
              // Best effort only: SMS already went out successfully.
            }
          }

          const failureNotice =
            smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
              ? "quote-sms-contact-missing"
              : smsResult.code === "NOT_CONFIGURED"
                ? "quote-sms-unavailable"
                : "quote-sms-failed";

          if (ajaxRequest) {
            const historyEntries = smsResult.ok ? getEntryCustomerSmsHistoryEntries(updatedEntry || entry) : null;
            const payload = buildSmsAjaxPayload(
              smsResult.ok ? "quote-sms-sent" : failureNotice,
              "Не удалось отправить SMS по заявке.",
              historyEntries,
              {
                errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заявке."),
                draft: message,
              }
            );
            if (smsResult.ok) {
              writeAjaxMutationSuccess(
                res,
                requestStartNs,
                requestContext,
                "quote-sms-sent",
                payload
              );
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
            return true;
          }

          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(
              returnTo,
              smsResult.ok ? "quote-sms-sent" : failureNotice,
              "quote",
              entryId,
              smsResult.ok
                ? {}
                : {
                    smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS по заявке."),
                    smsDraft: message,
                  }
            ),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "create-lead-task") {
          const taskTitle = getFormValue(formBody, "taskTitle", 240);
          const taskDueAt = getFormValue(formBody, "taskDueAt", 80);
          const selectedAssigneeId =
            getFormValue(formBody, "assigneeId", 120) ||
            getFormValue(formBody, "managerId", 120);

          const assigneeRecord = selectedAssigneeId
            ? await resolveLeadTaskAssigneeRecord(usersStore, staffStore, selectedAssigneeId)
            : null;

          if (!taskTitle || !taskDueAt || !assigneeRecord) {
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "task-invalid" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            manualTaskTitle: taskTitle,
            manualTaskDueAt: taskDueAt,
            manualTaskAssigneeId: assigneeRecord.id,
            manualTaskAssigneeName: assigneeRecord.name,
            manualTaskAssigneeEmail: assigneeRecord.email,
            manualTaskAssigneeRole: assigneeRecord.role,
          });

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: updatedEntry ? "task-created" : "lead-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "update-lead-manager") {
          const selectedManagerId = getFormValue(formBody, "managerId", 120);
          const managerRecord = selectedManagerId
            ? await resolveLeadManagerRecord(usersStore, staffStore, selectedManagerId)
            : null;
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            managerId: managerRecord ? managerRecord.id : "",
            managerName: managerRecord ? managerRecord.name : "",
            managerEmail: managerRecord ? managerRecord.email : "",
          });

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: updatedEntry ? "manager-saved" : "lead-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "update-lead-status") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const targetStatus = normalizeLeadStatus(getFormValue(formBody, "leadStatus", 40), "new");
          const hasManagerSelection = Object.prototype.hasOwnProperty.call(formBody, "managerId");
          const selectedManagerId = hasManagerSelection ? getFormValue(formBody, "managerId", 120) : "";
          const managerRecord = selectedManagerId
            ? await resolveLeadManagerRecord(usersStore, staffStore, selectedManagerId)
            : null;
          const discussionNextContactAt = getFormValue(formBody, "discussionNextContactAt", 80);
          if (targetStatus === "discussion" && !discussionNextContactAt) {
            if (ajaxRequest) {
              writeJsonWithTiming(
                res,
                400,
                {
                  ok: false,
                  notice: "discussion-contact-required",
                  error: "discussion-contact-required",
                },
                requestStartNs,
                requestContext.cacheHit
              );
              return true;
            }
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "discussion-contact-required" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            status: targetStatus,
            ...(hasManagerSelection
              ? {
                  managerId: managerRecord ? managerRecord.id : "",
                  managerName: managerRecord ? managerRecord.name : "",
                  managerEmail: managerRecord ? managerRecord.email : "",
                }
              : {}),
            discussionNextContactAt,
          });
          const notice =
            !updatedEntry
              ? "lead-missing"
              : targetStatus === "confirmed"
                ? "lead-confirmed"
                : "lead-stage-saved";

          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              updatedEntry ? 200 : 404,
              buildLeadMutationPayload(updatedEntry, notice),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "update-lead-notes") {
          const ajaxRequest = isAjaxMutationRequest(req);
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            notes: getFormValue(formBody, "notes", 2000),
          });

          if (ajaxRequest) {
            writeJsonWithTiming(
              res,
              updatedEntry ? 200 : 404,
              buildLeadMutationPayload(updatedEntry, updatedEntry ? "lead-notes-saved" : "lead-missing"),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, {
              notice: updatedEntry ? "lead-notes-saved" : "lead-missing",
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        if (action === "complete-lead-task") {
          const taskAction = getFormValue(formBody, "taskAction", 40).toLowerCase();
          const nextStatus = normalizeLeadStatus(getFormValue(formBody, "nextStatus", 40), "discussion");
          const discussionNextContactAt = getFormValue(formBody, "discussionNextContactAt", 80);
          const nextCleaningSchedule = parseNextCleaningSchedule(getFormValue(formBody, "nextCleaningAt", 80));
          if (taskAction === "contacted" && nextStatus === "discussion" && !discussionNextContactAt) {
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "discussion-contact-required" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }
          if (taskAction === "next-cleaning-agreed" && !nextCleaningSchedule) {
            redirectWithTiming(
              res,
              303,
              buildAdminRedirectPath(returnTo, { notice: "next-cleaning-required" }),
              requestStartNs,
              requestContext.cacheHit
            );
            return true;
          }
          const updatedEntry = await quoteOpsLedger.updateLeadEntry(entryId, {
            taskId: getFormValue(formBody, "taskId", 120),
            taskAction,
            nextStatus,
            discussionNextContactAt,
            nextCleaningAt: nextCleaningSchedule ? nextCleaningSchedule.raw : "",
          });
          let taskNotice = "task-saved";
          if (updatedEntry && taskAction === "next-cleaning-agreed") {
            const latestEntry =
              typeof quoteOpsLedger.getEntry === "function"
                ? (await quoteOpsLedger.getEntry(entryId)) || updatedEntry
                : updatedEntry;
            const scheduleResult = await scheduleNextCleaningFromTask(
              quoteOpsLedger,
              latestEntry,
              nextCleaningSchedule
            );
            taskNotice = scheduleResult.notice || "next-cleaning-scheduled";
          } else if (updatedEntry && taskAction === "next-cleaning-declined") {
            const latestEntry =
              typeof quoteOpsLedger.getEntry === "function"
                ? (await quoteOpsLedger.getEntry(entryId)) || updatedEntry
                : updatedEntry;
            const declineResult = await markNextCleaningDeclined(quoteOpsLedger, latestEntry);
            taskNotice = declineResult.notice || "client-marked-one-time";
          }
          const notice =
            !updatedEntry
              ? "lead-missing"
              : taskAction === "contacted" && nextStatus === "confirmed"
                ? "lead-confirmed"
                : taskNotice;

          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }

        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "lead-missing" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      } catch (error) {
        if (action === "send-quote-sms") {
          if (isAjaxMutationRequest(req)) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "quote-sms-failed",
              500,
              {
                ...buildSmsAjaxPayload("quote-sms-failed", "Не удалось отправить SMS по заявке.", null, {
                  errorMessage: normalizeString(error && error.message ? error.message : "", 240),
                }),
              }
            );
            return true;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "quote-sms-failed", "quote", entryId),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "lead-save-failed" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }
    }

    return false;
  }

  return {
    handleQuoteOpsRoutes,
  };
}

module.exports = {
  createAdminQuoteOpsHandlers,
};
