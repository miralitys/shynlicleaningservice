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
    isAjaxMutationRequest,
    isOrderCreatedEntry,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = deps;

  const messageDomain = createAdminMessagesDomain({
    getEntrySmsHistoryEntries,
    isOrderCreatedEntry,
    normalizeString,
  });

  function parseMessageRefs(value) {
    const normalized = normalizeString(value, 12000);
    if (!normalized) return [];
    try {
      const parsed = JSON.parse(normalized);
      return (Array.isArray(parsed) ? parsed : [])
        .map((item) => ({
          entryId: normalizeString(item && item.entryId, 120),
          messageKey: normalizeString(item && item.messageKey, 500),
        }))
        .filter((item) => item.entryId && item.messageKey);
    } catch {
      return [];
    }
  }

  function groupMessageRefsByEntry(refs = []) {
    const refsByEntryId = new Map();
    for (const ref of Array.isArray(refs) ? refs : []) {
      const entryId = normalizeString(ref && ref.entryId, 120);
      const messageKey = normalizeString(ref && ref.messageKey, 500);
      if (!entryId || !messageKey) continue;
      const messageKeys = refsByEntryId.get(entryId) || [];
      if (!messageKeys.includes(messageKey)) {
        messageKeys.push(messageKey);
      }
      refsByEntryId.set(entryId, messageKeys);
    }
    return refsByEntryId;
  }

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
    const messageRefs = parseMessageRefs(getFormValue(formBody, "messageRefs", 12000));
    if (messageRefs.length === 0 && entryId && messageKey) {
      messageRefs.push({ entryId, messageKey });
    }
    const refsByEntryId = groupMessageRefsByEntry(messageRefs);
    const isAjaxRequest = typeof isAjaxMutationRequest === "function" && isAjaxMutationRequest(req);
    if (!quoteOpsLedger || refsByEntryId.size === 0) {
      if (isAjaxRequest && typeof writeAjaxMutationError === "function") {
        writeAjaxMutationError(res, requestStartNs, requestContext, "message-missing", 404);
        return true;
      }
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(ADMIN_MESSAGES_PATH, { notice: "message-missing" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    let changed = false;
    let changedCount = 0;
    for (const [targetEntryId, messageKeys] of refsByEntryId.entries()) {
      const entry = await quoteOpsLedger.getEntry(targetEntryId);
      if (!entry) continue;
      const currentHistory = getEntrySmsHistoryEntries(entry);
      const readResult = messageDomain.buildReadSmsHistoryForKeys(currentHistory, targetEntryId, messageKeys);
      if (!readResult.changed) continue;

      const isOrderEntry =
        (typeof hasEntryOrderState === "function" && hasEntryOrderState(entry)) ||
        (typeof isOrderCreatedEntry === "function" && isOrderCreatedEntry(entry));
      if (isOrderEntry && typeof quoteOpsLedger.updateOrderEntry === "function") {
        await quoteOpsLedger.updateOrderEntry(targetEntryId, { smsHistory: readResult.history });
      } else if (typeof quoteOpsLedger.updateClientEntry === "function") {
        await quoteOpsLedger.updateClientEntry(targetEntryId, { smsHistory: readResult.history });
      }
      changed = true;
      changedCount += Number(readResult.changedCount) || 0;
    }

    if (isAjaxRequest && typeof writeAjaxMutationSuccess === "function") {
      writeAjaxMutationSuccess(
        res,
        requestStartNs,
        requestContext,
        changed ? "message-read" : "message-already-read",
        {
          changed,
          changedCount,
          entryId,
          messageKey,
          messageRefs,
          status: "read",
        }
      );
      return true;
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
