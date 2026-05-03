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

  return {
    buildAdminMessageRecordKey,
    buildReadSmsHistory,
    collectAdminMessageRecords,
    getMessageReadAt,
  };
}

module.exports = {
  createAdminMessagesDomain,
};
