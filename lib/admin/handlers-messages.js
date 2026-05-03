"use strict";

const { createAdminMessagesDomain } = require("./messages-domain");

function createAdminMessagesHandlers(deps = {}) {
  const {
    ADMIN_MESSAGES_PATH,
    buildAdminRedirectPath,
    ensureWorkspaceAccess,
    getEntrySmsHistoryEntries,
    getFormValue,
    hasEntryOrderState,
    isOrderCreatedEntry,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
  } = deps;

  const messageDomain = createAdminMessagesDomain({
    getEntrySmsHistoryEntries,
    isOrderCreatedEntry,
    normalizeString,
  });

  async function handleAdminMessagesRoutes(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      quoteOpsLedger,
    } = context;

    if (!req || !requestContext || requestContext.route !== ADMIN_MESSAGES_PATH) {
      return false;
    }

    if (req.method !== "POST") {
      return false;
    }

    if (
      !ensureWorkspaceAccess(
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge,
        { requireWrite: true }
      )
    ) {
      return true;
    }

    const formBody = parseFormBody(await readTextBody(req, 256 * 1024));
    const action = normalizeString(getFormValue(formBody, "action", 80), 80).toLowerCase();
    if (action !== "mark-message-read") {
      return false;
    }

    const entryId = normalizeString(getFormValue(formBody, "entryId", 120), 120);
    const messageKey = normalizeString(getFormValue(formBody, "messageKey", 500), 500);
    const entry = quoteOpsLedger && entryId ? await quoteOpsLedger.getEntry(entryId) : null;
    if (!entry || !messageKey) {
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(ADMIN_MESSAGES_PATH, { notice: "message-missing" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const currentHistory = getEntrySmsHistoryEntries(entry);
    const { changed, history } = messageDomain.buildReadSmsHistory(currentHistory, entryId, messageKey);
    if (changed) {
      const isOrderEntry =
        (typeof hasEntryOrderState === "function" && hasEntryOrderState(entry)) ||
        (typeof isOrderCreatedEntry === "function" && isOrderCreatedEntry(entry));
      if (isOrderEntry && typeof quoteOpsLedger.updateOrderEntry === "function") {
        await quoteOpsLedger.updateOrderEntry(entryId, { smsHistory: history });
      } else if (typeof quoteOpsLedger.updateClientEntry === "function") {
        await quoteOpsLedger.updateClientEntry(entryId, { smsHistory: history });
      }
    }

    redirectWithTiming(
      res,
      303,
      buildAdminRedirectPath(ADMIN_MESSAGES_PATH, { notice: changed ? "message-read" : "message-already-read" }),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleAdminMessagesRoutes,
  };
}

module.exports = {
  createAdminMessagesHandlers,
};
