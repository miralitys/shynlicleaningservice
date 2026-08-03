"use strict";

const crypto = require("node:crypto");

const {
  getEntryOrderPolicyAcceptanceData,
  getEntryPayload,
} = require("../admin-order-state");

const {
  filterCustomerSmsHistoryEntries,
  isCustomerSmsHistoryEntry,
} = require("./sms-history-filters");

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
      readAt: normalizeString(item.readAt || item.seenAt || item.openedAt, 80),
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

  function mergeAdminSmsHistoryEntry(existingEntry, nextEntry) {
    if (!existingEntry) return nextEntry;
    if (!nextEntry) return existingEntry;
    return {
      ...nextEntry,
      ...existingEntry,
      readAt: existingEntry.readAt || nextEntry.readAt,
    };
  }

  function mergeAdminSmsHistoryEntries(primaryEntries = [], secondaryEntries = []) {
    const mergedByKey = new Map();
    const orderedEntries = [
      ...(Array.isArray(secondaryEntries) ? secondaryEntries : []),
      ...(Array.isArray(primaryEntries) ? primaryEntries : []),
    ]
      .map((entry) => normalizeAdminSmsHistoryEntry(entry))
      .filter(Boolean);

    for (const entry of orderedEntries) {
      const key = buildSmsHistoryEntryKey(entry);
      mergedByKey.set(key, mergeAdminSmsHistoryEntry(mergedByKey.get(key), entry));
    }

    return normalizeAdminSmsHistoryEntries(Array.from(mergedByKey.values()));
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

  function getEntryCustomerSmsHistoryEntries(entry = {}) {
    return filterCustomerSmsHistoryEntries(entry, getEntrySmsHistoryEntries(entry));
  }

  function getClientSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return normalizeAdminSmsHistoryEntries(
      client.entries.flatMap((entry) => getEntrySmsHistoryEntries(entry))
    );
  }

  function getClientCustomerSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return normalizeAdminSmsHistoryEntries(
      client.entries.flatMap((entry) =>
        filterCustomerSmsHistoryEntries(
          {
            ...entry,
            customerPhone: normalizeString(client.phone || (entry && entry.customerPhone), 80),
            secondaryPhone: normalizeString(client.secondaryPhone || (entry && entry.secondaryPhone), 80),
            contactId: normalizeString(entry && entry.contactId, 120),
            clientKey: normalizeString(client.key, 160),
          },
          getEntrySmsHistoryEntries(entry)
        )
      )
    );
  }

  function filterClientLookupSmsHistoryEntries(client = {}, entries = [], lookupTargets = []) {
    const targets = Array.isArray(lookupTargets) && lookupTargets.length > 0
      ? lookupTargets
      : [{ phone: client && client.phone, contactId: "" }];
    return normalizeAdminSmsHistoryEntries(entries).filter((entry) =>
      targets.some((target) =>
        isCustomerSmsHistoryEntry(
          {
            customerPhone: normalizeString(target && (target.phone || client.phone), 80),
            secondaryPhone: normalizeString(client && client.secondaryPhone, 80),
            contactId: normalizeString(target && target.contactId, 120),
            clientKey: normalizeString(client && client.key, 160),
          },
          entry
        )
      )
    );
  }

  function getStaffSmsHistoryEntries(staffRecord = {}) {
    return normalizeAdminSmsHistoryEntries(staffRecord && staffRecord.smsHistory);
  }

  function buildSmsHistoryRecord(result, options = {}) {
    const status = normalizeString(options.status, 20).toLowerCase() === "failed" ? "failed" : "sent";
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
      status,
      errorCode: normalizeString(
        options.errorCode || (status === "failed" && result && result.code),
        80
      ).toUpperCase(),
      errorMessage: normalizeString(
        options.errorMessage || (status === "failed" && result && result.message),
        300
      ),
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
      readAt: entry.readAt,
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

  function buildOrderPolicyFollowUpSmsMessage(entry) {
    const firstName = getClientFirstName(entry && entry.customerName);
    const greeting = firstName || "Hi";
    return `${greeting}, You should have received an automatic message with our Service Policy. 😊 It's nothing unusual—just our standard policy that we ask all first-time customers to review and sign before their cleaning appointment.\n\nThank you so much!`;
  }

  function hasOrderPolicyFollowUpSms(entry) {
    return getEntrySmsHistoryEntries(entry).some(
      (item) =>
        normalizeAdminSmsHistoryStatus(item && item.status) !== "failed" &&
        /received an automatic message with our service policy/i.test(
          normalizeString(item && item.message, 4000)
        )
    );
  }

  function isRetryablePolicySmsResult(result) {
    if (!result || result.ok) return false;
    if (result.retryable === true) return true;
    const status = Number(result.status || 0);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  async function waitForPolicySmsRetry(delayMs) {
    if (typeof deps.wait === "function") {
      await deps.wait(delayMs);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async function sendPolicySmsWithRetry(leadConnectorClient, input) {
    const retryDelays = Array.isArray(deps.policySmsRetryDelays)
      ? deps.policySmsRetryDelays
          .map((value) => Math.max(0, Number(value) || 0))
          .slice(0, 4)
      : [750, 2000];
    let lastResult = null;

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        lastResult = await leadConnectorClient.sendSmsMessage(input);
      } catch (error) {
        lastResult = {
          ok: false,
          status: Number(error && error.status) || 500,
          code: normalizeString(error && error.code, 80) || "LEADCONNECTOR_ERROR",
          message: normalizeString(error && error.message, 300) || "Failed to send SMS.",
          retryable: error && error.retryable !== false,
        };
      }

      if (
        (lastResult && lastResult.ok) ||
        attempt >= retryDelays.length ||
        !isRetryablePolicySmsResult(lastResult)
      ) {
        return lastResult;
      }

      await waitForPolicySmsRetry(retryDelays[attempt]);
    }

    return lastResult;
  }

  function normalizePolicyPhoneKey(value) {
    let digits = normalizeString(value, 80).replace(/\D+/g, "");
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    return digits;
  }

  function getEntrySecondaryClientPhone(entry = {}) {
    const payload = getEntryPayload(entry);
    const adminClient =
      payload && payload.adminClient && typeof payload.adminClient === "object"
        ? payload.adminClient
        : {};
    return normalizeString(
      entry.secondaryPhone ||
        adminClient.secondaryPhone ||
        adminClient.secondary_phone ||
        adminClient.alternatePhone ||
        adminClient.alternate_phone ||
        adminClient.phone2,
      80
    );
  }

  function collectPolicyClientIdentity(entry = {}, policyRecord = null) {
    const record = policyRecord && typeof policyRecord === "object" ? policyRecord : {};
    const emails = new Set(
      [
        entry && entry.customerEmail,
        record.customerEmail,
      ]
        .map((value) => normalizeString(value, 250).toLowerCase())
        .filter(Boolean)
    );
    const phones = new Set(
      [
        entry && entry.customerPhone,
        getEntrySecondaryClientPhone(entry),
        record.customerPhone,
      ]
        .map((value) => normalizePolicyPhoneKey(value))
        .filter(Boolean)
    );
    const contactIds = new Set(
      [
        entry && entry.contactId,
      ]
        .map((value) => normalizeString(value, 120))
        .filter(Boolean)
    );
    return { emails, phones, contactIds };
  }

  function policyClientIdentitiesOverlap(left, right) {
    if (!left || !right) return false;
    for (const contactId of left.contactIds || []) {
      if (right.contactIds && right.contactIds.has(contactId)) return true;
    }
    for (const email of left.emails || []) {
      if (right.emails && right.emails.has(email)) return true;
    }
    for (const phone of left.phones || []) {
      if (right.phones && right.phones.has(phone)) return true;
    }
    return false;
  }

  function clonePolicyObject(value) {
    if (!value || typeof value !== "object") return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return Array.isArray(value) ? value.slice() : { ...value };
    }
  }

  function hasPolicyCertificateFile(record = {}) {
    const file = record && record.certificateFile && typeof record.certificateFile === "object"
      ? record.certificateFile
      : null;
    return Boolean(
      file &&
        (normalizeString(file.relativePath, 500) ||
          normalizeString(file.fileName, 250) ||
          normalizeString(file.id, 120))
    );
  }

  function buildAlreadyAcceptedPolicyRecord(sourceRecord = {}, targetEntry = {}) {
    const now = new Date().toISOString();
    const signedAt = normalizeString(sourceRecord.signedAt, 80) || now;
    const sourceCertificateFile = clonePolicyObject(sourceRecord.certificateFile);
    const sourceCertificateFileId =
      normalizeString(sourceRecord.certificateFileId, 120) ||
      normalizeString(sourceCertificateFile && sourceCertificateFile.id, 120);
    return {
      ...sourceRecord,
      acceptanceId: crypto.randomUUID(),
      bookingId: normalizeString(targetEntry && targetEntry.id, 120),
      requestId: normalizeString(targetEntry && targetEntry.requestId, 120),
      status: "accepted",
      secureTokenId: "",
      envelopeId: "",
      secureTokenHash: "",
      confirmationUrl: "",
      expiresAt: "",
      createdAt: now,
      updatedAt: now,
      customerFullName:
        normalizeString(targetEntry && targetEntry.customerName, 180) ||
        normalizeString(sourceRecord.customerFullName, 180),
      customerEmail:
        normalizeString(targetEntry && targetEntry.customerEmail, 250).toLowerCase() ||
        normalizeString(sourceRecord.customerEmail, 250).toLowerCase(),
      customerPhone:
        normalizeString(targetEntry && targetEntry.customerPhone, 80) ||
        normalizeString(sourceRecord.customerPhone, 80),
      serviceAddress:
        normalizeString(targetEntry && targetEntry.fullAddress, 500) ||
        normalizeString(sourceRecord.serviceAddress, 500),
      acceptedTerms: true,
      acceptedPaymentCancellation: true,
      signedAt,
      lastError: "",
      policyAccepted: true,
      certificateFileId: sourceCertificateFileId,
      certificateFile: sourceCertificateFile,
      auditTrailJson: clonePolicyObject(sourceRecord.auditTrailJson),
    };
  }

  async function findAlreadyAcceptedPolicyForClient(quoteOpsLedger, entryId, entry) {
    const currentRecord = getEntryOrderPolicyAcceptanceData(entry);
    const currentAcceptedWithoutCertificate =
      currentRecord.policyAccepted && !hasPolicyCertificateFile(currentRecord);
    if (currentRecord.policyAccepted && !currentAcceptedWithoutCertificate) {
      return { entry, record: currentRecord, current: true };
    }
    if (!quoteOpsLedger || typeof quoteOpsLedger.listEntries !== "function") {
      return currentRecord.policyAccepted ? { entry, record: currentRecord, current: true } : null;
    }

    const targetIdentity = collectPolicyClientIdentity(entry, currentRecord);
    if (
      targetIdentity.emails.size === 0 &&
      targetIdentity.phones.size === 0 &&
      targetIdentity.contactIds.size === 0
    ) {
      return currentRecord.policyAccepted ? { entry, record: currentRecord, current: true } : null;
    }

    let entries = [];
    try {
      entries = await quoteOpsLedger.listEntries({ limit: 5000 });
    } catch {
      entries = [];
    }

    let fallbackAcceptedPolicy = null;
    for (const candidate of Array.isArray(entries) ? entries : []) {
      if (!candidate || normalizeString(candidate.id, 120) === normalizeString(entryId, 120)) {
        continue;
      }
      const policyRecord = getEntryOrderPolicyAcceptanceData(candidate);
      if (!policyRecord.policyAccepted) continue;
      if (policyClientIdentitiesOverlap(targetIdentity, collectPolicyClientIdentity(candidate, policyRecord))) {
        const matchedPolicy = { entry: candidate, record: policyRecord };
        if (hasPolicyCertificateFile(policyRecord)) {
          return matchedPolicy;
        }
        if (!currentAcceptedWithoutCertificate && !fallbackAcceptedPolicy) {
          fallbackAcceptedPolicy = matchedPolicy;
        }
      }
    }

    if (fallbackAcceptedPolicy) return fallbackAcceptedPolicy;
    return currentRecord.policyAccepted ? { entry, record: currentRecord, current: true } : null;
  }

  async function applyAlreadyAcceptedPolicyForClient(quoteOpsLedger, entryId, entry) {
    let updatedEntry = entry;
    const alreadyAcceptedPolicy = await findAlreadyAcceptedPolicyForClient(
      quoteOpsLedger,
      entryId,
      updatedEntry
    );

    if (!alreadyAcceptedPolicy || !alreadyAcceptedPolicy.record) {
      return {
        updatedEntry,
        policyAcceptance: null,
        applied: false,
        current: false,
      };
    }

    if (alreadyAcceptedPolicy.current) {
      return {
        updatedEntry,
        policyAcceptance: alreadyAcceptedPolicy.record,
        applied: true,
        current: true,
      };
    }

    const acceptedRecord = buildAlreadyAcceptedPolicyRecord(
      alreadyAcceptedPolicy.record,
      updatedEntry
    );
    if (quoteOpsLedger && typeof quoteOpsLedger.updateOrderEntry === "function") {
      updatedEntry =
        (await quoteOpsLedger.updateOrderEntry(entryId, {
          policyAcceptance: acceptedRecord,
        })) || updatedEntry;
    }

    return {
      updatedEntry,
      policyAcceptance: acceptedRecord,
      applied: true,
      current: false,
    };
  }

  async function sendOrderPolicyAcceptanceInvite(
    quoteOpsLedger,
    entryId,
    entry,
    config,
    leadConnectorClient,
    options = {}
  ) {
    let updatedEntry = entry;
    let pendingAcceptance = null;
    let emailState = "";
    let smsState = "skipped";
    let followUpSmsState = "skipped";
    const shouldSendFollowUpSms = options.sendFollowUpSms !== false;

    if (
      !updatedEntry ||
      !orderPolicyAcceptance ||
      typeof orderPolicyAcceptance.buildPendingAcceptance !== "function"
    ) {
      return { updatedEntry, pendingAcceptance, emailState: "failed", smsState, followUpSmsState };
    }

    const alreadyAcceptedPolicy = await applyAlreadyAcceptedPolicyForClient(
      quoteOpsLedger,
      entryId,
      updatedEntry
    );
    if (alreadyAcceptedPolicy && alreadyAcceptedPolicy.policyAcceptance) {
      updatedEntry = alreadyAcceptedPolicy.updatedEntry || updatedEntry;
      if (alreadyAcceptedPolicy.current) {
        return {
          updatedEntry,
          pendingAcceptance: { record: alreadyAcceptedPolicy.policyAcceptance },
          emailState: "already-signed",
          smsState,
          followUpSmsState,
        };
      }
      return {
        updatedEntry,
        pendingAcceptance: { record: alreadyAcceptedPolicy.policyAcceptance },
        emailState: "already-signed",
        smsState,
        followUpSmsState,
      };
    }

    try {
      pendingAcceptance = await orderPolicyAcceptance.buildPendingAcceptance(updatedEntry);
      updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        policyAcceptance: pendingAcceptance.record,
      });
    } catch {
      return { updatedEntry, pendingAcceptance, emailState: "failed", smsState, followUpSmsState };
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
          const smsResult = await sendPolicySmsWithRetry(leadConnectorClient, {
            contactId: normalizeString(updatedEntry && updatedEntry.contactId, 120),
            phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
            customerName: normalizeString(updatedEntry && updatedEntry.customerName, 160),
            customerEmail: normalizeString(updatedEntry && updatedEntry.customerEmail, 250).toLowerCase(),
            message: policySmsMessage,
          });

          if (smsResult && smsResult.ok) {
            const policySmsHistoryRecord = buildSmsHistoryRecord(smsResult, {
              message: policySmsMessage,
              phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
              targetType: "order",
              targetRef: entryId,
              source: "automatic",
            });
            let followUpSmsResult = null;
            let followUpSmsHistoryRecord = null;

            if (shouldSendFollowUpSms && !hasOrderPolicyFollowUpSms(updatedEntry)) {
              const followUpSmsMessage = buildOrderPolicyFollowUpSmsMessage(updatedEntry);
              followUpSmsResult = await sendPolicySmsWithRetry(leadConnectorClient, {
                contactId: normalizeString(
                  (smsResult && smsResult.contactId) || (updatedEntry && updatedEntry.contactId),
                  120
                ),
                phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
                customerName: normalizeString(updatedEntry && updatedEntry.customerName, 160),
                customerEmail: normalizeString(
                  updatedEntry && updatedEntry.customerEmail,
                  250
                ).toLowerCase(),
                message: followUpSmsMessage,
              });
              followUpSmsState = followUpSmsResult && followUpSmsResult.ok ? "sent" : "failed";
              followUpSmsHistoryRecord = buildSmsHistoryRecord(followUpSmsResult, {
                message: followUpSmsMessage,
                phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
                targetType: "order",
                targetRef: entryId,
                source: "automatic",
                status: followUpSmsState,
                errorCode: followUpSmsResult && followUpSmsResult.code,
                errorMessage:
                  followUpSmsState === "failed"
                    ? formatSmsErrorMessage(
                        followUpSmsResult,
                        "Не удалось отправить пояснение после ссылки на политику."
                      )
                    : "",
              });
            }

            const nextSmsHistory = [
              ...(followUpSmsHistoryRecord ? [followUpSmsHistoryRecord] : []),
              policySmsHistoryRecord,
              ...getEntrySmsHistoryEntries(updatedEntry),
            ];
            updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
              contactId: normalizeString(
                (followUpSmsResult && followUpSmsResult.contactId) ||
                  (smsResult && smsResult.contactId) ||
                  (updatedEntry && updatedEntry.contactId),
                120
              ),
              smsHistory: nextSmsHistory,
            });
            smsState = "sent";
          } else {
            const failedPolicySmsHistoryRecord = buildSmsHistoryRecord(smsResult, {
              message: policySmsMessage,
              phone: normalizeString(updatedEntry && updatedEntry.customerPhone, 80),
              targetType: "order",
              targetRef: entryId,
              source: "automatic",
              status: "failed",
              errorCode: smsResult && smsResult.code,
              errorMessage: formatSmsErrorMessage(
                smsResult,
                "Не удалось отправить ссылку на политику."
              ),
            });
            updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
              contactId: normalizeString(
                (smsResult && smsResult.contactId) || (updatedEntry && updatedEntry.contactId),
                120
              ),
              smsHistory: [
                failedPolicySmsHistoryRecord,
                ...getEntrySmsHistoryEntries(updatedEntry),
              ],
            });
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

    return { updatedEntry, pendingAcceptance, emailState, smsState, followUpSmsState };
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
    applyAlreadyAcceptedPolicyForClient,
    buildSmsAjaxPayload,
    buildSmsHistoryAjaxPayload,
    buildSmsHistoryRecord,
    buildSmsRedirectPath,
    buildStaffOnboardingReminderSmsMessage,
    extractSmsConversationIds,
    formatSmsErrorMessage,
    getClientSmsHistoryEntries,
    getClientCustomerSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getEntryCustomerSmsHistoryEntries,
    getStaffSmsHistoryEntries,
    filterClientLookupSmsHistoryEntries,
    loadRemoteSmsHistoryEntries,
    mergeAdminSmsHistoryEntries,
    sendOrderPolicyAcceptanceInvite,
  };
}

module.exports = {
  createAdminSmsHelpers,
};
