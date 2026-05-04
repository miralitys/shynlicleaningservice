"use strict";

function createAdminClientsHandlers(deps = {}) {
  const {
    buildAdminRedirectPath,
    buildClientsReturnPath,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    collectAdminClientRecords,
    clientMutationLedgerLimit,
    ensureWorkspaceAccess,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getClientSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getFormValue,
    getFormValues,
    isAjaxMutationRequest,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = deps;

  function collectClientSmsLookupTargets(client = {}) {
    const targets = [];
    const seen = new Set();

    const addTarget = (entry = {}) => {
      const contactId = normalizeString(entry && entry.contactId, 120);
      const phone = normalizeString(entry && (entry.customerPhone || entry.phone), 80);
      if (!contactId && !phone) return;

      const phoneKey = phone.replace(/\D+/g, "");
      const key = `${contactId}|${phoneKey || phone}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push({ contactId, phone });
    };

    if (client && Array.isArray(client.entries)) {
      client.entries.forEach((entry) => addTarget(entry));
    }

    addTarget(client);
    return targets.slice(0, 10);
  }

  async function handleAdminClientsPostRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      config,
      quoteOpsLedger,
      staffStore,
      googleCalendarIntegration,
      leadConnectorClient,
    } = context;

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
    const ajaxRequest = isAjaxMutationRequest(req);
    if (
      action === "delete-client" &&
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireDelete: true,
      })
    ) {
      return;
    }

    if (
      !["delete-client", "update-client", "send-client-sms", "load-client-sms-history"].includes(action) ||
      !quoteOpsLedger ||
      !clientKey
    ) {
      if (ajaxRequest) {
        writeAjaxMutationError(res, requestStartNs, requestContext, "client-missing", 404);
        return;
      }
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
      const allEntries = await quoteOpsLedger.listEntries({ limit: clientMutationLedgerLimit });
      const client = collectAdminClientRecords(allEntries).find((record) => record.key === clientKey);
      if (!client || client.entries.length === 0) {
        if (ajaxRequest) {
          writeAjaxMutationError(res, requestStartNs, requestContext, "client-missing", 404);
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, { notice: "client-missing", client: "" }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "update-client") {
        const addressValues = getFormValues(formBody, "addresses", 20, 500);
        const addressPropertyTypes = getFormValues(formBody, "addressPropertyTypes", 20, 40);
        const addressSquareFootages = getFormValues(formBody, "addressSquareFootages", 20, 120);
        const addressRoomCounts = getFormValues(formBody, "addressRoomCounts", 20, 120);
        const addressBathroomCounts = getFormValues(formBody, "addressBathroomCounts", 20, 120);
        const legacyAddressHomeProfiles = getFormValues(formBody, "addressHomeProfiles", 20, 250);
        const addressPets = getFormValues(formBody, "addressPets", 20, 40);
        const addressNotes = getFormValues(formBody, "addressNotes", 20, 4000);
        const submittedAddressBook = addressValues.map((address, index) => ({
          address,
          propertyType: addressPropertyTypes[index] || "",
          squareFootage: addressSquareFootages[index] || "",
          roomCount: addressRoomCounts[index] || "",
          bathroomCount: addressBathroomCounts[index] || "",
          sizeDetails: legacyAddressHomeProfiles[index] || "",
          pets: addressPets[index] || "",
          notes: addressNotes[index] || "",
        }));
        const submittedAddressKeys = new Set(
          submittedAddressBook
            .map((addressRecord) => normalizeString(addressRecord.address, 500).toLowerCase())
            .filter(Boolean)
        );
        const removedAddressKeys = Array.from(
          new Set([
            ...(Array.isArray(client.removedAddressKeys) ? client.removedAddressKeys : []),
            ...(Array.isArray(client.addresses)
              ? client.addresses
                  .map((addressRecord) =>
                    normalizeString(
                      addressRecord && (addressRecord.key || addressRecord.address),
                      500
                    ).toLowerCase()
                  )
                  .filter((key) => key && !submittedAddressKeys.has(key))
              : []),
          ])
        ).filter((key) => key && !submittedAddressKeys.has(key));
        const updates = {
          name: getFormValue(formBody, "name", 250),
          phone: getFormValue(formBody, "phone", 80),
          email: getFormValue(formBody, "email", 250),
          address: getFormValue(formBody, "address", 500),
          addresses: addressValues,
          addressBook: submittedAddressBook,
          removedAddressKeys,
        };
        if (!updates.name) {
          if (ajaxRequest) {
            writeAjaxMutationError(res, requestStartNs, requestContext, "client-save-failed", 400);
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildAdminRedirectPath(returnTo, { notice: "client-save-failed", client: clientKey }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const updatedEntryIds = [];
        for (const entry of client.entries) {
          if (!entry.id) continue;
          const updatedEntry = await quoteOpsLedger.updateClientEntry(entry.id, updates);
          if (updatedEntry && updatedEntry.id) {
            updatedEntryIds.push(updatedEntry.id);
          } else {
            updatedEntryIds.push(entry.id);
          }
        }

        const refreshedEntries = await quoteOpsLedger.listEntries({ limit: clientMutationLedgerLimit });
        const refreshedClient = collectAdminClientRecords(refreshedEntries).find((record) =>
          record.entries.some((entry) => updatedEntryIds.includes(entry.id))
        );

        if (ajaxRequest) {
          writeAjaxMutationSuccess(res, requestStartNs, requestContext, "client-saved", {
            clientKey: refreshedClient ? refreshedClient.key : clientKey,
          });
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildAdminRedirectPath(returnTo, {
            notice: "client-saved",
            client: refreshedClient ? refreshedClient.key : clientKey,
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "load-client-sms-history") {
        const ajaxRequest = isAjaxMutationRequest(req);
        const localHistoryEntries = getClientSmsHistoryEntries(client);
        const conversationIds = extractSmsConversationIds(localHistoryEntries);
        const smsLookupTargets = collectClientSmsLookupTargets(client);
        const remoteHistoryEntries = (
          await Promise.all(
            smsLookupTargets.map((target) =>
              loadRemoteSmsHistoryEntries(leadConnectorClient, {
                contactId: target.contactId,
                phone: target.phone,
                conversationIds,
              })
            )
          )
        ).flat();
        const mergedHistoryEntries = mergeAdminSmsHistoryEntries(
          localHistoryEntries,
          remoteHistoryEntries
        );

        if (ajaxRequest) {
          writeAjaxMutationSuccess(
            res,
            requestStartNs,
            requestContext,
            "client-sms-history-loaded",
            buildSmsHistoryAjaxPayload(mergedHistoryEntries)
          );
          return;
        }

        redirectWithTiming(
          res,
          303,
          buildSmsRedirectPath(returnTo, "client-sms-history-loaded", "client", clientKey),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (action === "send-client-sms") {
        const ajaxRequest = isAjaxMutationRequest(req);
        const message = getFormValue(formBody, "message", 1000).replace(/\r\n?/g, "\n").trim();
        if (!message) {
          if (ajaxRequest) {
            writeAjaxMutationError(
              res,
              requestStartNs,
              requestContext,
              "client-sms-empty",
              400,
              {
                ...buildSmsAjaxPayload("client-sms-empty", "Не удалось отправить SMS клиенту.", null, {
                  draft: message,
                }),
              }
            );
            return;
          }
          redirectWithTiming(
            res,
            303,
            buildSmsRedirectPath(returnTo, "client-sms-empty", "client", clientKey),
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
              "client-sms-unavailable",
              503,
              {
                ...buildSmsAjaxPayload(
                  "client-sms-unavailable",
                  "Не удалось отправить SMS клиенту.",
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
            buildSmsRedirectPath(returnTo, "client-sms-unavailable", "client", clientKey, {
              smsDraft: message,
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return;
        }

        const contactEntry = Array.isArray(client.entries)
          ? client.entries.find((entry) => normalizeString(entry && entry.contactId, 120))
          : null;
        const historyEntry =
          contactEntry ||
          (Array.isArray(client.entries) && client.entries.length > 0 ? client.entries[0] : null);
        const smsResult = await leadConnectorClient.sendSmsMessage({
          contactId: normalizeString(contactEntry && contactEntry.contactId, 120),
          phone: normalizeString(client.phone || (contactEntry && contactEntry.customerPhone), 80),
          customerName: normalizeString(client.name, 160),
          customerEmail: normalizeString(client.email, 250).toLowerCase(),
          message,
        });

        let updatedHistoryEntry = historyEntry;
        let clientHistoryEntries = getClientSmsHistoryEntries(client);
        const nextHistory =
          smsResult.ok && historyEntry
            ? [
                buildSmsHistoryRecord(smsResult, {
                  message,
                  phone: normalizeString(client.phone || (historyEntry && historyEntry.customerPhone), 80),
                  targetType: "client",
                  targetRef: clientKey,
                  source: "manual",
                }),
                ...getEntrySmsHistoryEntries(historyEntry),
              ]
            : null;

        if (smsResult.ok && historyEntry) {
          try {
            updatedHistoryEntry = await quoteOpsLedger.updateClientEntry(historyEntry.id, {
              contactId: normalizeString(
                smsResult.contactId || (historyEntry && historyEntry.contactId),
                120
              ),
              smsHistory: nextHistory,
            });
            clientHistoryEntries = getClientSmsHistoryEntries({
              ...client,
              entries: Array.isArray(client.entries)
                ? client.entries.map((entry) =>
                    normalizeString(entry && entry.id, 120) ===
                    normalizeString(updatedHistoryEntry && updatedHistoryEntry.id, 120)
                      ? updatedHistoryEntry
                      : entry
                  )
                : [],
            });
          } catch {
            // Best effort only: SMS already went out successfully.
          }
        }

        const failureNotice =
          smsResult.code === "CONTACT_NOT_FOUND" || smsResult.code === "INVALID_PHONE"
            ? "client-sms-contact-missing"
            : smsResult.code === "NOT_CONFIGURED"
              ? "client-sms-unavailable"
              : "client-sms-failed";

        if (ajaxRequest) {
          const payload = buildSmsAjaxPayload(
            smsResult.ok ? "client-sms-sent" : failureNotice,
            "Не удалось отправить SMS клиенту.",
            smsResult.ok ? clientHistoryEntries : null,
            {
              errorMessage: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS клиенту."),
              draft: message,
            }
          );
          if (smsResult.ok) {
            writeAjaxMutationSuccess(res, requestStartNs, requestContext, "client-sms-sent", payload);
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
            smsResult.ok ? "client-sms-sent" : failureNotice,
            "client",
            clientKey,
            smsResult.ok
              ? {}
              : {
                  smsError: formatSmsErrorMessage(smsResult, "Не удалось отправить SMS клиенту."),
                  smsDraft: message,
                }
          ),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      let deletedCount = 0;
      for (const entry of client.entries) {
        if (!entry.id) continue;
        if (
          googleCalendarIntegration &&
          typeof googleCalendarIntegration.clearAssignmentEvents === "function"
        ) {
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
    } catch (error) {
      if (ajaxRequest && action === "update-client") {
        writeAjaxMutationError(res, requestStartNs, requestContext, "client-save-failed", 500);
        return;
      }
      if (action === "send-client-sms") {
        if (isAjaxMutationRequest(req)) {
          writeAjaxMutationError(
            res,
            requestStartNs,
            requestContext,
            "client-sms-failed",
            500,
            {
              ...buildSmsAjaxPayload("client-sms-failed", "Не удалось отправить SMS клиенту.", null, {
                errorMessage: normalizeString(error && error.message ? error.message : "", 240),
              }),
            }
          );
          return;
        }
        redirectWithTiming(
          res,
          303,
          buildSmsRedirectPath(returnTo, "client-sms-failed", "client", clientKey),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(returnTo, {
          notice: action === "delete-client" ? "client-delete-failed" : "client-save-failed",
          client: action === "delete-client" ? "" : clientKey,
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }
  }

  return {
    handleAdminClientsPostRoute,
  };
}

module.exports = {
  createAdminClientsHandlers,
};
