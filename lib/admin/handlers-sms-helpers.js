"use strict";

function createAdminSmsHelpers(deps = {}) {
  const {
    accountInviteEmail,
    formatAdminDateTime,
    normalizeString,
    orderPolicyAcceptance,
  } = deps;

  function buildSmsRedirectPath(returnTo, notice, target, targetRef, extra = {}) {
    return deps.buildAdminRedirectPath(returnTo, {
      notice,
      smsTarget: target,
      smsRef: targetRef,
      smsError: "",
      smsDraft: "",
      ...extra,
    });
  }

  function formatSmsErrorMessage(result, fallbackMessage) {
    const smsCode = normalizeString(result && result.code, 80).toUpperCase();
    if (smsCode === "CONTACT_LOOKUP_FAILED") {
      return "Не удалось найти контакт в Go High Level перед отправкой SMS.";
    }
    if (smsCode === "CONTACT_CREATE_FAILED") {
      return "Не удалось создать контакт в Go High Level перед отправкой SMS.";
    }
    if (smsCode === "CONTACT_UPDATE_FAILED") {
      return "Не удалось обновить контакт в Go High Level перед отправкой SMS.";
    }
    if (smsCode === "CONTACT_NOT_FOUND") {
      return "Контакт в Go High Level не найден.";
    }
    const detailSource =
      result && typeof result.details === "object" && result.details !== null
        ? result.details.message || result.details.error || result.details.details || result.details.detail || ""
        : "";
    return normalizeString(
      (result && (result.message || detailSource)) || fallbackMessage || "Не удалось отправить SMS.",
      240
    );
  }

  function getEntryAdminSmsData(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    return payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
  }

  function normalizeAdminSmsHistoryStatus(value) {
    return normalizeString(value, 20).toLowerCase() === "failed" ? "failed" : "sent";
  }

  function normalizeAdminSmsHistoryEntry(item) {
    if (!item || typeof item !== "object") return null;
    const message = normalizeString(item.message, 1000);
    if (!message) return null;
    const direction =
      normalizeString(item.direction, 20).toLowerCase() === "inbound"
        ? "inbound"
        : "outbound";
    const normalizedSource = normalizeString(item.source, 20).toLowerCase();
    return {
      id: normalizeString(item.id, 120) || `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sentAt: normalizeString(item.sentAt || item.createdAt, 80) || new Date().toISOString(),
      message,
      phone: normalizeString(item.phone, 80),
      contactId: normalizeString(item.contactId, 120),
      channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
      direction,
      source:
        normalizedSource === "automatic"
          ? "automatic"
          : normalizedSource === "client" || direction === "inbound"
            ? "client"
            : "manual",
      targetType: normalizeString(item.targetType, 40).toLowerCase(),
      targetRef: normalizeString(item.targetRef, 160),
      conversationId: normalizeString(item.conversationId, 120),
      messageId: normalizeString(item.messageId, 120),
      status: normalizeAdminSmsHistoryStatus(item.status),
      errorCode: normalizeString(item.errorCode, 80).toUpperCase(),
      errorMessage: normalizeString(item.errorMessage, 300),
      recipientName: normalizeString(item.recipientName, 200),
      recipientRole: normalizeString(item.recipientRole, 40).toLowerCase(),
    };
  }

  function normalizeAdminSmsHistoryEntries(entries = []) {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((item) => normalizeAdminSmsHistoryEntry(item))
      .filter(Boolean)
      .sort((left, right) => {
        const leftMs = Date.parse(left.sentAt || "");
        const rightMs = Date.parse(right.sentAt || "");
        if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
          return rightMs - leftMs;
        }
        return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
      })
      .slice(0, 50);
  }

  function buildSmsHistoryEntryKey(entry = {}) {
    const messageId = normalizeString(entry && entry.messageId, 120);
    if (messageId) return `message:${messageId}`;
    return [
      "fallback",
      normalizeString(entry && entry.conversationId, 120),
      normalizeString(entry && entry.direction, 20).toLowerCase(),
      normalizeString(entry && entry.sentAt, 80),
      normalizeString(entry && entry.phone, 80),
      normalizeString(entry && entry.message, 1000),
    ].join("|");
  }

  function mergeAdminSmsHistoryEntries(primaryEntries = [], secondaryEntries = []) {
    const seen = new Set();
    const merged = [
      ...(Array.isArray(secondaryEntries) ? secondaryEntries : []),
      ...(Array.isArray(primaryEntries) ? primaryEntries : []),
    ]
      .map((entry) => normalizeAdminSmsHistoryEntry(entry))
      .filter(Boolean)
      .filter((entry) => {
        const key = buildSmsHistoryEntryKey(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return normalizeAdminSmsHistoryEntries(merged);
  }

  function extractSmsConversationIds(entries = []) {
    return Array.from(
      new Set(
        normalizeAdminSmsHistoryEntries(entries)
          .map((entry) => normalizeString(entry && entry.conversationId, 120))
          .filter(Boolean)
      )
    ).slice(0, 10);
  }

  function getEntrySmsHistoryEntries(entry = {}) {
    return normalizeAdminSmsHistoryEntries(getEntryAdminSmsData(entry).history || []);
  }

  function getClientSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return normalizeAdminSmsHistoryEntries(
      client.entries.flatMap((entry) => getEntrySmsHistoryEntries(entry))
    );
  }

  function getStaffSmsHistoryEntries(staffRecord = {}) {
    return normalizeAdminSmsHistoryEntries(staffRecord && staffRecord.smsHistory);
  }

  function buildSmsHistoryRecord(result, options = {}) {
    return {
      id: `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sentAt: new Date().toISOString(),
      message: normalizeString(options.message, 1000),
      phone: normalizeString(options.phone, 80),
      contactId: normalizeString((result && result.contactId) || options.contactId, 120),
      channel: "ghl",
      direction: "outbound",
      source: normalizeString(options.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
      targetType: normalizeString(options.targetType, 40).toLowerCase(),
      targetRef: normalizeString(options.targetRef, 160),
      conversationId: normalizeString(result && result.conversationId, 120),
      messageId: normalizeString(result && result.messageId, 120),
    };
  }

  function buildStaffOnboardingReminderSmsMessage(staffName, documentsUrl) {
    const link = normalizeString(documentsUrl, 4000);
    if (!link) return "";
    const firstName = normalizeString(staffName, 120).split(/\s+/).filter(Boolean)[0] || "there";
    return `Hi ${firstName}, this is Shynli Cleaning Service. Please complete and sign your Contract and W-9 here: ${link}`;
  }

  function formatSmsHistoryCountLabel(count) {
    const numeric = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
    if (numeric === 0) return "Пока пусто";
    return `${numeric} SMS`;
  }

  function buildSmsHistoryViewModel(entries = []) {
    return normalizeAdminSmsHistoryEntries(entries).map((entry) => ({
      id: entry.id,
      message: entry.message,
      sentAt: entry.sentAt,
      sentAtLabel: typeof formatAdminDateTime === "function" ? formatAdminDateTime(entry.sentAt) : entry.sentAt,
      source: entry.source,
      sourceLabel:
        entry.source === "automatic"
          ? "Автоматически"
          : entry.source === "client"
            ? "Клиент"
            : "Вручную",
      sourceTone:
        entry.source === "automatic"
          ? "muted"
          : entry.source === "client"
            ? "outline"
            : "success",
      direction: entry.direction,
      directionLabel: entry.direction === "inbound" ? "Входящее" : "Исходящее",
      channel: entry.channel,
      channelLabel: entry.channel === "ghl" ? "Go High Level" : normalizeString(entry.channel, 40) || "SMS",
      status: entry.status,
      statusLabel: entry.status === "failed" ? "Не доставлено" : "Отправлено",
      statusTone: entry.status === "failed" ? "error" : "success",
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
      recipientName: entry.recipientName,
      recipientRole: entry.recipientRole,
    }));
  }

  function getSmsSentNoticeMessage() {
    return "SMS отправлена через Go High Level.";
  }

  function getClientFirstName(value) {
    const parts = normalizeString(value, 160)
      .split(/\s+/)
      .map((item) => normalizeString(item, 80))
      .filter(Boolean);
    return parts[0] || "";
  }

  function buildOrderPolicyAcceptanceSmsMessage(entry, confirmationUrl) {
    const link = normalizeString(confirmationUrl, 4000);
    if (!link) return "";
    const firstName = getClientFirstName(entry && entry.customerName);
    const greeting = firstName ? `Hi ${firstName},` : "Hi,";
    return `${greeting} this is Shynli Cleaning Service. To confirm your booking, please review and accept our service policies here: ${link}`;
  }

  async function sendOrderPolicyAcceptanceInvite(
    quoteOpsLedger,
    entryId,
    entry,
    config,
    leadConnectorClient
  ) {
    let updatedEntry = entry;
    let pendingAcceptance = null;
    let emailState = "";
    let smsState = "skipped";

    if (
      !updatedEntry ||
      !orderPolicyAcceptance ||
      typeof orderPolicyAcceptance.buildPendingAcceptance !== "function"
    ) {
      return { updatedEntry, pendingAcceptance, emailState: "failed", smsState };
    }

    try {
      pendingAcceptance = await orderPolicyAcceptance.buildPendingAcceptance(updatedEntry);
      updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        policyAcceptance: pendingAcceptance.record,
      });
    } catch {
      return { updatedEntry, pendingAcceptance, emailState: "failed", smsState };
    }

    const customerEmail = normalizeString(updatedEntry && updatedEntry.customerEmail, 250).toLowerCase();
    const inviteEmailStatus =
      accountInviteEmail && typeof accountInviteEmail.getStatus === "function"
        ? await accountInviteEmail.getStatus(config)
        : { configured: false };
    const hasCustomerEmail = Boolean(customerEmail);

    if (!hasCustomerEmail) {
      emailState = "skipped";
    } else if (!inviteEmailStatus.configured) {
      const failedRecord = orderPolicyAcceptance.buildFailedSendRecord(
        pendingAcceptance.record,
        new Error("Policy confirmation email is not configured.")
      );
      updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        policyAcceptance: failedRecord,
      });
      emailState = "unavailable";
    } else if (
      accountInviteEmail &&
      typeof accountInviteEmail.sendOrderPolicyConfirmation === "function"
    ) {
      try {
        await accountInviteEmail.sendOrderPolicyConfirmation(
          pendingAcceptance.emailPayload,
          config
        );
        const sentRecord = orderPolicyAcceptance.buildSentAcceptanceRecord(
          pendingAcceptance.record
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: sentRecord,
        });
        emailState = "sent";
      } catch (error) {
        const failedRecord = orderPolicyAcceptance.buildFailedSendRecord(
          pendingAcceptance.record,
          error
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: failedRecord,
        });
        emailState = "failed";
      }
    } else {
      emailState = "unavailable";
    }

    if (
      pendingAcceptance &&
      leadConnectorClient &&
      typeof leadConnectorClient.sendSmsMessage === "function" &&
      leadConnectorClient.isConfigured()
    ) {
      const policySmsMessage = buildOrderPolicyAcceptanceSmsMessage(
        updatedEntry,
        pendingAcceptance.emailPayload && pendingAcceptance.emailPayload.confirmUrl
      );
      if (policySmsMessage) {
        try {
          const smsResult = await leadConnectorClient.sendSmsMessage({
            contactId: normalizeString(updatedEntry && updatedEntry.contactId, 120),
            phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
            customerName: normalizeString(updatedEntry && updatedEntry.customerName, 160),
            customerEmail: normalizeString(updatedEntry && updatedEntry.customerEmail, 250).toLowerCase(),
            message: policySmsMessage,
          });

          if (smsResult && smsResult.ok) {
            const nextSmsHistory = [
              buildSmsHistoryRecord(smsResult, {
                message: policySmsMessage,
                phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
                targetType: "order",
                targetRef: entryId,
                source: "automatic",
              }),
              ...getEntrySmsHistoryEntries(updatedEntry),
            ];
            updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
              contactId: normalizeString(
                (smsResult && smsResult.contactId) || (updatedEntry && updatedEntry.contactId),
                120
              ),
              smsHistory: nextSmsHistory,
            });
            smsState = "sent";
          } else {
            smsState = "failed";
          }
        } catch {
          smsState = "failed";
        }
      }
    }

    if (!hasCustomerEmail) {
      if (smsState === "sent") {
        const sentRecord = orderPolicyAcceptance.buildSentAcceptanceRecord(
          pendingAcceptance.record
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: sentRecord,
        });
        emailState = "sms-only";
      } else {
        const failedRecord = orderPolicyAcceptance.buildFailedSendRecord(
          pendingAcceptance.record,
          new Error("Recipient email is missing and SMS delivery was not completed.")
        );
        updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: failedRecord,
        });
        emailState = "missing-recipient";
      }
    }

    return { updatedEntry, pendingAcceptance, emailState, smsState };
  }

  function getSmsErrorNoticeMessage(notice, fallbackMessage, errorMessage = "") {
    const normalizedNotice = normalizeString(notice, 80).toLowerCase();
    if (normalizedNotice.endsWith("-sms-empty")) {
      return "Введите текст сообщения перед отправкой.";
    }
    if (normalizedNotice.endsWith("-sms-unavailable")) {
      return "Go High Level сейчас не настроен для отправки SMS.";
    }
    if (normalizedNotice.endsWith("-sms-contact-missing")) {
      return errorMessage || "В Go High Level не найден контакт или телефон для отправки SMS.";
    }
    return errorMessage || fallbackMessage || "Не удалось отправить SMS.";
  }

  function buildSmsAjaxPayload(notice, fallbackMessage, historyEntries = [], options = {}) {
    const normalizedNotice = normalizeString(notice, 80).toLowerCase();
    const success = normalizedNotice.endsWith("-sms-sent");
    const includeHistory = Array.isArray(historyEntries);
    return {
      sms: {
        notice: normalizedNotice,
        feedbackState: success ? "success" : "error",
        feedbackMessage: success
          ? getSmsSentNoticeMessage()
          : getSmsErrorNoticeMessage(normalizedNotice, fallbackMessage, normalizeString(options.errorMessage, 240)),
        draft: success ? "" : normalizeString(options.draft, 1000),
        ...(includeHistory
          ? {
              history: buildSmsHistoryViewModel(historyEntries),
              historyCountLabel: formatSmsHistoryCountLabel(historyEntries.length),
            }
          : {}),
      },
    };
  }

  function buildSmsHistoryAjaxPayload(historyEntries = []) {
    return {
      sms: {
        history: buildSmsHistoryViewModel(historyEntries),
        historyCountLabel: formatSmsHistoryCountLabel(historyEntries.length),
      },
    };
  }

  async function loadRemoteSmsHistoryEntries(leadConnectorClient, options = {}) {
    if (
      !leadConnectorClient ||
      typeof leadConnectorClient.getSmsHistory !== "function" ||
      !leadConnectorClient.isConfigured()
    ) {
      return [];
    }

    const result = await leadConnectorClient.getSmsHistory(options);
    if (!result || result.ok !== true || !Array.isArray(result.history)) {
      return [];
    }

    return normalizeAdminSmsHistoryEntries(result.history);
  }

  return {
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    buildStaffOnboardingReminderSmsMessage,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getClientSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getStaffSmsHistoryEntries,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    sendOrderPolicyAcceptanceInvite,
  };
}

module.exports = {
  createAdminSmsHelpers,
};
