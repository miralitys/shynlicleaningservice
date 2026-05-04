"use strict";

function defaultNormalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function createAdminMessagesDomain(deps = {}) {
  const normalizeString =
    typeof deps.normalizeString === "function" ? deps.normalizeString : defaultNormalizeString;
  const getEntrySmsHistoryEntries =
    typeof deps.getEntrySmsHistoryEntries === "function" ? deps.getEntrySmsHistoryEntries : () => [];
  const isOrderCreatedEntry =
    typeof deps.isOrderCreatedEntry === "function" ? deps.isOrderCreatedEntry : () => false;

  function getMessageReadAt(message = {}) {
    return normalizeString(message.readAt || message.seenAt || message.openedAt, 80);
  }

  function buildAdminMessageRecordKey(entryId, message = {}) {
    const normalizedEntryId = normalizeString(entryId, 120);
    const messageId = normalizeString(message.messageId || message.id, 120);
    if (messageId) return `${normalizedEntryId}:message:${messageId}`;

    return [
      normalizedEntryId,
      "fallback",
      normalizeString(message.conversationId, 120),
      normalizeString(message.sentAt || message.createdAt, 80),
      normalizeString(message.phone, 80),
      normalizeString(message.message, 1000),
    ].join("|");
  }

  function getMessageSentAtMs(message = {}) {
    const parsed = Date.parse(normalizeString(message.sentAt || message.createdAt, 80));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getMessageConversationId(message = {}) {
    return normalizeString(message.conversationId || message.threadId || message.conversation_id, 160);
  }

  function getMessagePhoneKey(value) {
    return normalizeString(value, 80).replace(/\D/g, "");
  }

  function getMessageCustomerNameKey(value) {
    const normalized = normalizeString(value, 250).toLowerCase().replace(/\s+/g, " ");
    if (!normalized || normalized === "клиент" || normalized === "client") return "";
    return normalized;
  }

  function buildAdminMessageDialogKey(record = {}) {
    const nameKey = getMessageCustomerNameKey(record.customerName);
    if (nameKey) return `name:${nameKey}`;
    const contactId = normalizeString(record.contactId, 160);
    if (contactId) return `contact:${contactId}`;
    const email = normalizeString(record.customerEmail, 250).toLowerCase();
    if (email) return `email:${email}`;
    const conversationId = normalizeString(record.conversationId, 160);
    if (conversationId) return `conversation:${conversationId}`;
    const phoneKey = getMessagePhoneKey(record.customerPhone);
    if (phoneKey) return `phone:${phoneKey}`;
    const entryId = normalizeString(record.entryId, 120);
    return entryId ? `entry:${entryId}` : "";
  }

  function collectAdminMessageRecords(entries = [], options = {}) {
    const formatAdminDateTime =
      typeof options.formatAdminDateTime === "function" ? options.formatAdminDateTime : (value) => value || "Не указано";
    return (Array.isArray(entries) ? entries : [])
      .flatMap((entry) => {
        const entryId = normalizeString(entry && entry.id, 120);
        if (!entryId) return [];
        const isOrder = isOrderCreatedEntry(entry);
        return getEntrySmsHistoryEntries(entry)
          .filter((message) => normalizeString(message && message.direction, 20).toLowerCase() === "inbound")
          .map((message) => {
            const readAt = getMessageReadAt(message);
            return {
              id: buildAdminMessageRecordKey(entryId, message),
              entryId,
              isOrder,
              customerName: normalizeString(entry && entry.customerName, 250) || "Клиент",
              customerPhone: normalizeString((message && message.phone) || (entry && entry.customerPhone), 80),
              customerEmail: normalizeString(entry && entry.customerEmail, 250).toLowerCase(),
              requestId: normalizeString(entry && entry.requestId, 160),
              contactId: normalizeString((message && message.contactId) || (entry && entry.contactId), 160),
              conversationId: getMessageConversationId(message),
              message: normalizeString(message && message.message, 1000),
              sentAt: normalizeString(message && message.sentAt, 80),
              sentAtLabel: formatAdminDateTime(message && message.sentAt),
              readAt,
              status: readAt ? "read" : "new",
              statusLabel: readAt ? "Прочитано" : "Новый",
              statusTone: readAt ? "muted" : "danger",
              sortTime: getMessageSentAtMs(message),
            };
          });
      })
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "new" ? -1 : 1;
        return right.sortTime - left.sortTime;
      });
  }

  function collectAdminMessageDialogRecords(records = []) {
    const dialogsByKey = new Map();

    for (const record of Array.isArray(records) ? records : []) {
      const dialogKey = buildAdminMessageDialogKey(record);
      if (!dialogKey) continue;
      const currentDialog = dialogsByKey.get(dialogKey) || {
        id: dialogKey,
        dialogKey,
        records: [],
      };
      currentDialog.records.push(record);
      dialogsByKey.set(dialogKey, currentDialog);
    }

    return Array.from(dialogsByKey.values())
      .map((dialog) => {
        const sortedRecords = dialog.records
          .slice()
          .sort((left, right) => (Number(right.sortTime) || 0) - (Number(left.sortTime) || 0));
        const unreadRecords = sortedRecords.filter((record) => record.status === "new");
        const latestRecord = sortedRecords[0] || {};
        const firstUnreadRecord = unreadRecords[0] || null;
        const actionRecord = firstUnreadRecord || latestRecord;
        const unreadRefs = unreadRecords
          .map((record) => ({
            entryId: normalizeString(record.entryId, 120),
            messageKey: normalizeString(record.id, 500),
          }))
          .filter((item) => item.entryId && item.messageKey);

        return {
          ...latestRecord,
          id: dialog.dialogKey,
          dialogKey: dialog.dialogKey,
          entryId: normalizeString(actionRecord.entryId, 120),
          messageKey: normalizeString(actionRecord.id, 500),
          latestEntryId: normalizeString(latestRecord.entryId, 120),
          latestMessageKey: normalizeString(latestRecord.id, 500),
          unreadCount: unreadRecords.length,
          messageCount: sortedRecords.length,
          unreadRefs,
          status: unreadRecords.length > 0 ? "new" : "read",
          statusLabel: unreadRecords.length > 0 ? `${unreadRecords.length} новых` : "Прочитано",
          statusTone: unreadRecords.length > 0 ? "danger" : "muted",
          sortTime: Number(latestRecord.sortTime) || 0,
        };
      })
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "new" ? -1 : 1;
        return (Number(right.sortTime) || 0) - (Number(left.sortTime) || 0);
      });
  }

  function buildReadSmsHistory(entries = [], entryId, messageKey) {
    const normalizedEntryId = normalizeString(entryId, 120);
    const normalizedMessageKey = normalizeString(messageKey, 500);
    if (!normalizedEntryId || !normalizedMessageKey) {
      return { changed: false, history: getEntrySmsHistoryEntries({}) };
    }

    let changed = false;
    const readAt = new Date().toISOString();
    const history = (Array.isArray(entries) ? entries : []).map((message) => {
      if (buildAdminMessageRecordKey(normalizedEntryId, message) !== normalizedMessageKey) {
        return message;
      }
      if (getMessageReadAt(message)) return message;
      changed = true;
      return {
        ...message,
        readAt,
      };
    });

    return { changed, history };
  }

  function buildReadSmsHistoryForKeys(entries = [], entryId, messageKeys = []) {
    const normalizedKeys = new Set(
      (Array.isArray(messageKeys) ? messageKeys : [])
        .map((messageKey) => normalizeString(messageKey, 500))
        .filter(Boolean)
    );
    if (normalizedKeys.size === 0) {
      return { changed: false, changedCount: 0, history: getEntrySmsHistoryEntries({}) };
    }

    let changedCount = 0;
    const readAt = new Date().toISOString();
    const history = (Array.isArray(entries) ? entries : []).map((message) => {
      const messageKey = buildAdminMessageRecordKey(entryId, message);
      if (!normalizedKeys.has(messageKey)) return message;
      if (getMessageReadAt(message)) return message;
      changedCount += 1;
      return {
        ...message,
        readAt,
      };
    });

    return { changed: changedCount > 0, changedCount, history };
  }

  return {
    buildAdminMessageRecordKey,
    buildAdminMessageDialogKey,
    buildReadSmsHistory,
    buildReadSmsHistoryForKeys,
    collectAdminMessageDialogRecords,
    collectAdminMessageRecords,
    getMessageReadAt,
  };
}

module.exports = {
  createAdminMessagesDomain,
};
