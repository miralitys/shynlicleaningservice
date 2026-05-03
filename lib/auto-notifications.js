"use strict";

const DEFAULT_TIME_ZONE = "America/Chicago";
const DEFAULT_REMINDER_SCAN_LIMIT = 1000;
const DEFAULT_CUSTOMER_REVIEW_URL = "https://maps.app.goo.gl/4u9s7onykNrJEEn99";
const REMINDER_WINDOWS = [
  {
    key: "sent48hAt",
    hoursBefore: 48,
    lowerBoundHours: 26,
  },
  {
    key: "sent24hAt",
    hoursBefore: 24,
    lowerBoundHours: 2,
  },
  {
    key: "sent1hAt",
    hoursBefore: 1,
    lowerBoundHours: 0,
  },
];

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cloneSerializable(value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizePhone(value) {
  return normalizeString(value, 80);
}

function getCustomerFirstName(value) {
  return normalizeString(value, 120).split(/\s+/).filter(Boolean)[0] || "";
}

function normalizeSmsHistoryStatus(value) {
  return normalizeString(value, 20).toLowerCase() === "failed" ? "failed" : "sent";
}

function extractSmsFailureMessage(result, fallback = "") {
  const details = result && typeof result.details === "object" && result.details
    ? result.details.message || result.details.error || result.details.details || result.details.detail || ""
    : "";
  return normalizeString(
    (result && (result.message || details)) || fallback,
    300
  );
}

function buildSmsHistoryRecord(result, options = {}) {
  const failed =
    normalizeSmsHistoryStatus(options.status) === "failed" ||
    Boolean(options.errorMessage) ||
    Boolean(result && result.ok === false);
  return {
    id: `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sentAt: new Date().toISOString(),
    message: normalizeString(options.message, 1000),
    phone: normalizePhone(options.phone),
    contactId: normalizeString((result && result.contactId) || options.contactId, 120),
    channel: "ghl",
    direction: "outbound",
    source: normalizeString(options.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
    targetType: normalizeString(options.targetType, 40).toLowerCase(),
    targetRef: normalizeString(options.targetRef, 160),
    conversationId: normalizeString(result && result.conversationId, 120),
    messageId: normalizeString(result && result.messageId, 120),
    status: failed ? "failed" : "sent",
    errorCode: normalizeString((result && result.code) || options.errorCode, 80).toUpperCase(),
    errorMessage: extractSmsFailureMessage(result, options.errorMessage),
    recipientName: normalizeString(options.recipientName, 200),
    recipientRole: normalizeString(options.recipientRole, 40).toLowerCase(),
  };
}

function normalizeSmsHistoryEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const message = normalizeString(item.message, 1000);
      if (!message) return null;
      return {
        id: normalizeString(item.id, 120) || `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        sentAt: normalizeString(item.sentAt || item.createdAt, 80) || new Date().toISOString(),
        message,
        phone: normalizePhone(item.phone),
        contactId: normalizeString(item.contactId, 120),
        channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
        direction: normalizeString(item.direction, 20).toLowerCase() === "inbound" ? "inbound" : "outbound",
        source: normalizeString(item.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
        targetType: normalizeString(item.targetType, 40).toLowerCase(),
        targetRef: normalizeString(item.targetRef, 160),
        conversationId: normalizeString(item.conversationId, 120),
        messageId: normalizeString(item.messageId, 120),
        status: normalizeSmsHistoryStatus(item.status),
        errorCode: normalizeString(item.errorCode, 80).toUpperCase(),
        errorMessage: normalizeString(item.errorMessage, 300),
        recipientName: normalizeString(item.recipientName, 200),
        recipientRole: normalizeString(item.recipientRole, 40).toLowerCase(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftMs = Date.parse(left.sentAt || "");
      const rightMs = Date.parse(right.sentAt || "");
      if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
        return rightMs - leftMs;
      }
      return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
    })
    .slice(0, 50);
}

function appendSmsHistory(entries = [], record = null) {
  if (!record) return normalizeSmsHistoryEntries(entries);
  return normalizeSmsHistoryEntries([record, ...(Array.isArray(entries) ? entries : [])]);
}

function getEntryPayload(entry = {}) {
  return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
}

function getEntryOrderState(entry = {}) {
  const payload = getEntryPayload(entry);
  if (payload.adminOrder && typeof payload.adminOrder === "object") {
    return payload.adminOrder;
  }
  if (payload.orderState && typeof payload.orderState === "object") {
    return payload.orderState;
  }
  return {};
}

function getEntryAdminLead(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminLead && typeof payload.adminLead === "object"
    ? payload.adminLead
    : {};
}

function getEntrySmsHistory(entry = {}) {
  const payload = getEntryPayload(entry);
  const adminSms = payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
  return normalizeSmsHistoryEntries(adminSms.history);
}

function getStaffSmsHistory(staffRecord = {}) {
  return normalizeSmsHistoryEntries(staffRecord && staffRecord.smsHistory);
}

function getOrderNotificationState(entry = {}) {
  const orderState = getEntryOrderState(entry);
  const raw = orderState && orderState.notifications && typeof orderState.notifications === "object"
    ? cloneSerializable(orderState.notifications, {})
    : {};
  return {
    assignmentSmsByStaffId:
      raw.assignmentSmsByStaffId && typeof raw.assignmentSmsByStaffId === "object"
        ? cloneSerializable(raw.assignmentSmsByStaffId, {})
        : {},
    reminderSms:
      raw.reminderSms && typeof raw.reminderSms === "object"
        ? cloneSerializable(raw.reminderSms, {})
        : {},
    reviewRequest:
      raw.reviewRequest && typeof raw.reviewRequest === "object"
        ? cloneSerializable(raw.reviewRequest, {})
        : {},
    enRouteSms:
      raw.enRouteSms && typeof raw.enRouteSms === "object"
        ? cloneSerializable(raw.enRouteSms, {})
        : {},
    cleaningCompleteSmsByManagerId:
      raw.cleaningCompleteSmsByManagerId && typeof raw.cleaningCompleteSmsByManagerId === "object"
        ? cloneSerializable(raw.cleaningCompleteSmsByManagerId, {})
        : {},
  };
}

function buildScheduleLabel(dateValue, timeValue) {
  const date = normalizeString(dateValue, 32);
  const time = normalizeString(timeValue, 32);
  if (!date && !time) return "";
  if (date && time) return `${date} at ${time}`;
  return date || time;
}

function buildRussianScheduleLabel(dateValue, timeValue) {
  const date = normalizeString(dateValue, 32);
  const time = normalizeString(timeValue, 32);
  if (!date && !time) return "";
  if (date && time) return `${date} в ${time}`;
  return date || time;
}

function buildQuoteRequestSummary(entry = {}) {
  const serviceName = normalizeString(entry.serviceName, 120) || "Cleaning Service";
  const scheduleLabel = buildScheduleLabel(entry.selectedDate, entry.selectedTime);
  const address = normalizeString(entry.fullAddress, 500);
  return {
    serviceName,
    scheduleLabel,
    address,
  };
}

function buildQuoteConfirmationSmsMessage(entry = {}) {
  const firstName = getCustomerFirstName(entry.customerName);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const summary = buildQuoteRequestSummary(entry);
  const details = [
    summary.serviceName ? `Service: ${summary.serviceName}.` : "",
    summary.scheduleLabel ? `Requested time: ${summary.scheduleLabel}.` : "",
    summary.address ? `Address: ${summary.address}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${greeting} we received your request from Shynli Cleaning Service. ${details} A manager will contact you shortly.`
    .replace(/\s+/g, " ")
    .trim();
}

function buildManagerLeadAlertSmsMessage(entry = {}, manager = {}, siteOrigin = "") {
  const managerName = getCustomerFirstName(manager.name);
  const greeting = managerName ? `Hi ${managerName},` : "Hi,";
  const summary = buildQuoteRequestSummary(entry);
  const customerName = normalizeString(entry.customerName, 160) || "New client";
  const customerPhone = normalizePhone(entry.customerPhone);
  const adminUrl = normalizeString(siteOrigin, 500) ? `${normalizeString(siteOrigin, 500)}/admin/quote-ops` : "";
  const recipientRole = normalizeString(manager && manager.role, 32).toLowerCase();
  const assignedManagerId = normalizeString(getEntryAdminLead(entry).managerId, 120);
  const recipientId = normalizeString(manager && manager.id, 120);
  const intro =
    recipientId && assignedManagerId && recipientId === assignedManagerId
      ? "a new Shynli lead was assigned to you."
      : recipientRole === "admin"
        ? "a new Shynli lead was submitted."
        : "a new Shynli lead needs attention.";
  const details = [
    `${customerName}${customerPhone ? ` (${customerPhone})` : ""}.`,
    summary.serviceName ? `Service: ${summary.serviceName}.` : "",
    summary.scheduleLabel ? `Requested time: ${summary.scheduleLabel}.` : "",
    summary.address ? `Address: ${summary.address}.` : "",
    adminUrl ? `Admin: ${adminUrl}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${greeting} ${intro} ${details}`.replace(/\s+/g, " ").trim();
}

function buildStaffAssignmentSmsMessage(entry = {}, staffRecord = {}, assignment = {}, siteOrigin = "") {
  const staffName = getCustomerFirstName(staffRecord.name);
  const greeting = staffName ? `Здравствуйте, ${staffName}!` : "Здравствуйте!";
  const scheduleDate = normalizeString(assignment.scheduleDate || entry.selectedDate, 32);
  const scheduleTime = normalizeString(assignment.scheduleTime || entry.selectedTime, 32);
  const scheduleLabel = buildRussianScheduleLabel(scheduleDate, scheduleTime);
  const summary = buildQuoteRequestSummary(entry);
  const customerName = normalizeString(entry.customerName, 160) || "Client";
  const accountUrl = normalizeString(siteOrigin, 500) ? `${normalizeString(siteOrigin, 500)}/account` : "";
  return `${greeting} На вас назначена уборка SHYNLI${customerName ? ` для клиента ${customerName}` : ""}. ${
    summary.serviceName ? `Услуга: ${summary.serviceName}. ` : ""
  }${scheduleLabel ? `Дата и время: ${scheduleLabel}. ` : ""}${
    summary.address ? `Адрес: ${summary.address}. ` : ""
  }${
    accountUrl ? `Подтвердите или отклоните заказ в кабинете сотрудника: ${accountUrl}` : ""
  }`
    .replace(/\s+/g, " ")
    .trim();
}

function canSendAssignmentSms(entry = {}) {
  const status = getEntryOrderStatus(entry);
  return status !== "completed" && status !== "canceled";
}

function buildClientVisitReminderSmsMessage(entry = {}, hoursBefore = 24) {
  const firstName = getCustomerFirstName(entry.customerName);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const summary = buildQuoteRequestSummary(entry);
  const timingLabel =
    hoursBefore === 1 ? "in 1 hour" : hoursBefore === 24 ? "in 24 hours" : `in ${hoursBefore} hours`;
  return `${greeting} this is a reminder from Shynli Cleaning Service. Your cleaning is ${timingLabel}. ${
    summary.serviceName ? `Service: ${summary.serviceName}. ` : ""
  }${summary.scheduleLabel ? `Time: ${summary.scheduleLabel}. ` : ""}${
    summary.address ? `Address: ${summary.address}.` : ""
  }`
    .replace(/\s+/g, " ")
    .trim();
}

function buildReviewRequestSmsMessage(entry = {}, reviewUrl = DEFAULT_CUSTOMER_REVIEW_URL) {
  const firstName = getCustomerFirstName(entry.customerName);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const summary = buildQuoteRequestSummary(entry);
  const safeReviewUrl = normalizeString(reviewUrl, 4000) || DEFAULT_CUSTOMER_REVIEW_URL;
  return `${greeting} thank you for choosing Shynli Cleaning Service. We'd really appreciate your feedback on your recent cleaning. Please leave us a quick review here: ${safeReviewUrl} ${
    summary.serviceName ? `Service: ${summary.serviceName}. ` : ""
  }${summary.address ? `Address: ${summary.address}.` : ""}`
    .replace(/\s+/g, " ")
    .trim();
}

function buildClientEnRouteSmsMessage() {
  return "Your SHYNLI cleaner is on the way. They will be there soon. See you soon.";
}

function buildManagerCleaningCompleteSmsMessage(entry = {}) {
  const customerName = normalizeString(entry.customerName, 160);
  if (customerName) {
    return `Уборка завершена у клиента ${customerName}. Свяжитесь с клиентом для подтверждения и получения оплаты.`;
  }
  return "Уборка завершена. Свяжитесь с клиентом для подтверждения и получения оплаты.";
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const output = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    output[part.type] = part.value;
  }
  return output;
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtcTimestamp = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtcTimestamp - date.getTime()) / 60000);
}

function localDateTimeToInstant(dateValue, timeValue, timeZone = DEFAULT_TIME_ZONE) {
  const normalizedDate = normalizeString(dateValue, 32);
  const normalizedTime = normalizeString(timeValue, 32);
  if (!normalizedDate || !normalizedTime) return null;

  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizedTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const baseUtcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let offsetMinutes = getTimeZoneOffsetMinutes(new Date(baseUtcTimestamp), timeZone);
  let utcTimestamp = baseUtcTimestamp - offsetMinutes * 60 * 1000;
  const adjustedOffsetMinutes = getTimeZoneOffsetMinutes(new Date(utcTimestamp), timeZone);
  if (adjustedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = adjustedOffsetMinutes;
    utcTimestamp = baseUtcTimestamp - offsetMinutes * 60 * 1000;
  }

  return {
    date: new Date(utcTimestamp),
    offsetMinutes,
    localDate: normalizedDate,
    localTime: normalizedTime,
  };
}

function buildReminderSignature(entry = {}) {
  return `${normalizeString(entry.selectedDate, 32)}|${normalizeString(entry.selectedTime, 32)}`;
}

function restoreReminderSmsStateFromHistory(entry = {}, signature = "") {
  const reminderSms = {
    signature: normalizeString(signature, 500),
    sent48hAt: "",
    sent24hAt: "",
    sent1hAt: "",
  };
  const history = getEntrySmsHistory(entry);
  for (const record of history) {
    if (!record || record.status === "failed") continue;
    if (normalizeString(record.targetType, 40).toLowerCase() !== "visit-reminder") continue;
    const targetRef = normalizeString(record.targetRef, 180);
    const sentAt = normalizeString(record.sentAt, 80);
    if (!targetRef || !sentAt) continue;
    for (const window of REMINDER_WINDOWS) {
      if (!reminderSms[window.key] && targetRef.endsWith(`:${window.key}`)) {
        reminderSms[window.key] = sentAt;
      }
    }
  }
  return reminderSms;
}

function hasReminderSmsSentMarker(reminderSms = {}) {
  return REMINDER_WINDOWS.some((window) => Boolean(normalizeString(reminderSms[window.key], 80)));
}

function buildAssignmentSignature(entry = {}, assignment = {}) {
  return [
    normalizeString(assignment.scheduleDate || entry.selectedDate, 32),
    normalizeString(assignment.scheduleTime || entry.selectedTime, 32),
    normalizeString(entry.fullAddress, 500),
    normalizeString(entry.serviceName, 120),
  ].join("|");
}

function getEntryOrderStatus(entry = {}) {
  return normalizeString(getEntryOrderState(entry).status, 32).toLowerCase() || "new";
}

function createAutoNotificationService(options = {}) {
  const {
    accountInviteEmail = null,
    getLeadConnectorClient = null,
    getMailConfig = null,
    listLeadManagers = null,
    listLeadAlertRecipients = null,
    resolveLeadManagerById = null,
    quoteOpsLedger = null,
    siteOrigin = "",
    reviewUrl = DEFAULT_CUSTOMER_REVIEW_URL,
    staffStore = null,
    log = () => {},
    reminderScanLimit = DEFAULT_REMINDER_SCAN_LIMIT,
    timeZone = DEFAULT_TIME_ZONE,
  } = options;

  function logEvent(type, extra = {}) {
    try {
      log({
        ts: new Date().toISOString(),
        type,
        ...extra,
      });
    } catch {}
  }

  function getLeadConnectorClientSafe(fallbackClient = null) {
    if (fallbackClient) return fallbackClient;
    try {
      return typeof getLeadConnectorClient === "function" ? getLeadConnectorClient() : null;
    } catch {
      return null;
    }
  }

  function getMailConfigSafe() {
    try {
      return typeof getMailConfig === "function" ? getMailConfig() : {};
    } catch {
      return {};
    }
  }

  function normalizeLeadAlertRecipients(recipients = []) {
    const seenIds = new Set();
    const seenPhones = new Set();
    return (Array.isArray(recipients) ? recipients : [])
      .map((recipient) => {
        if (!recipient || typeof recipient !== "object") return null;
        const id = normalizeString(recipient.id, 120);
        const phone = normalizePhone(recipient.phone);
        const email = normalizeString(recipient.email, 250).toLowerCase();
        const name = normalizeString(recipient.name, 200) || email || "Команда";
        const role = normalizeString(recipient.role, 32).toLowerCase();
        if (!id) return null;
        return { id, phone, email, name, role };
      })
      .filter((recipient) => {
        if (!recipient) return false;
        if (seenIds.has(recipient.id)) return false;
        if (recipient.phone && seenPhones.has(recipient.phone)) return false;
        seenIds.add(recipient.id);
        if (recipient.phone) seenPhones.add(recipient.phone);
        return true;
      });
  }

  async function appendLeadSmsHistory(entry, record) {
    if (!entry || !record || !quoteOpsLedger || typeof quoteOpsLedger.updateLeadEntry !== "function") {
      return entry;
    }
    return (
      await quoteOpsLedger.updateLeadEntry(entry.id, {
        smsHistory: appendSmsHistory(getEntrySmsHistory(entry), record),
      })
    ) || entry;
  }

  async function appendOrderSmsHistory(entry, record, notifications) {
    if (!entry || !quoteOpsLedger || typeof quoteOpsLedger.updateOrderEntry !== "function") {
      return entry;
    }
    const updates = {};
    if (record) {
      updates.smsHistory = appendSmsHistory(getEntrySmsHistory(entry), record);
    }
    if (notifications) {
      updates.notifications = notifications;
    }
    if (Object.keys(updates).length === 0) {
      return entry;
    }
    return (await quoteOpsLedger.updateOrderEntry(entry.id, updates)) || entry;
  }

  async function notifyQuoteSubmissionSuccess({ entry, pricing = null, leadConnectorClient = null } = {}) {
    if (!entry) {
      return {
        customerEmailSent: false,
        customerSmsSent: false,
        managerSmsSent: false,
      };
    }

    let updatedEntry = entry;
    let customerEmailSent = false;
    let customerSmsSent = false;
    let managerSmsSent = false;
    let managerSmsSentCount = 0;
    const mailConfig = getMailConfigSafe();
    const leadConnector = getLeadConnectorClientSafe(leadConnectorClient);

    const customerEmail = normalizeString(updatedEntry.customerEmail, 250).toLowerCase();
    if (
      customerEmail &&
      accountInviteEmail &&
      typeof accountInviteEmail.getStatus === "function" &&
      typeof accountInviteEmail.sendQuoteRequestConfirmation === "function"
    ) {
      try {
        const emailStatus = await accountInviteEmail.getStatus(mailConfig);
        if (emailStatus && emailStatus.configured) {
          await accountInviteEmail.sendQuoteRequestConfirmation(
            {
              toEmail: customerEmail,
              clientName: normalizeString(updatedEntry.customerName, 160),
              serviceName: normalizeString((pricing && pricing.serviceName) || updatedEntry.serviceName, 120),
              selectedDate: normalizeString(updatedEntry.selectedDate, 32),
              selectedTime: normalizeString(updatedEntry.selectedTime, 32),
              fullAddress: normalizeString(updatedEntry.fullAddress, 500),
            },
            mailConfig
          );
          customerEmailSent = true;
        }
      } catch (error) {
        logEvent("quote_customer_email_failed", {
          entryId: normalizeString(updatedEntry.id, 120),
          requestId: normalizeString(updatedEntry.requestId, 120),
          message: normalizeString(error && error.message, 300),
        });
      }
    }

    const canSendSms =
      leadConnector &&
      typeof leadConnector.sendSmsMessage === "function" &&
      typeof leadConnector.isConfigured === "function" &&
      leadConnector.isConfigured();

    if (canSendSms) {
      const customerSmsMessage = buildQuoteConfirmationSmsMessage(updatedEntry);
      if (customerSmsMessage && normalizePhone(updatedEntry.customerPhone)) {
        try {
          const smsResult = await leadConnector.sendSmsMessage({
            contactId: normalizeString(updatedEntry.contactId, 120),
            phone: normalizePhone(updatedEntry.customerPhone),
            customerName: normalizeString(updatedEntry.customerName, 160),
            customerEmail,
            message: customerSmsMessage,
          });
          if (smsResult && smsResult.ok) {
            const record = buildSmsHistoryRecord(smsResult, {
              message: customerSmsMessage,
              phone: normalizePhone(updatedEntry.customerPhone),
              targetType: "quote",
              targetRef: normalizeString(updatedEntry.id, 120),
              source: "automatic",
              recipientName: normalizeString(updatedEntry.customerName, 160),
            });
            updatedEntry = await appendLeadSmsHistory(updatedEntry, record);
            customerSmsSent = true;
          } else {
            updatedEntry = await appendLeadSmsHistory(
              updatedEntry,
              buildSmsHistoryRecord(smsResult, {
                message: customerSmsMessage,
                phone: normalizePhone(updatedEntry.customerPhone),
                targetType: "quote",
                targetRef: normalizeString(updatedEntry.id, 120),
                source: "automatic",
                status: "failed",
                errorMessage: extractSmsFailureMessage(smsResult, "Не удалось отправить SMS клиенту."),
                recipientName: normalizeString(updatedEntry.customerName, 160),
              })
            );
            logEvent("quote_customer_sms_failed", {
              entryId: normalizeString(updatedEntry.id, 120),
              requestId: normalizeString(updatedEntry.requestId, 120),
              code: normalizeString(smsResult && smsResult.code, 80),
              message: extractSmsFailureMessage(smsResult, "Failed to send quote confirmation SMS."),
            });
          }
        } catch (error) {
          updatedEntry = await appendLeadSmsHistory(
            updatedEntry,
            buildSmsHistoryRecord(null, {
              message: customerSmsMessage,
              phone: normalizePhone(updatedEntry.customerPhone),
              targetType: "quote",
              targetRef: normalizeString(updatedEntry.id, 120),
              source: "automatic",
              status: "failed",
              errorMessage: normalizeString(error && error.message, 300) || "Не удалось отправить SMS клиенту.",
              recipientName: normalizeString(updatedEntry.customerName, 160),
            })
          );
          logEvent("quote_customer_sms_failed", {
            entryId: normalizeString(updatedEntry.id, 120),
            requestId: normalizeString(updatedEntry.requestId, 120),
            message: normalizeString(error && error.message, 300),
          });
        }
      }

      if (
        typeof listLeadAlertRecipients === "function" ||
        typeof listLeadManagers === "function"
      ) {
        try {
          const adminLead = getEntryAdminLead(updatedEntry);
          const assignedManagerId = normalizeString(adminLead.managerId, 120);
          const recipients = normalizeLeadAlertRecipients(
            typeof listLeadAlertRecipients === "function"
              ? await listLeadAlertRecipients()
              : await listLeadManagers()
          ).sort((left, right) => {
            const leftAssigned = left.id === assignedManagerId ? 1 : 0;
            const rightAssigned = right.id === assignedManagerId ? 1 : 0;
            return rightAssigned - leftAssigned;
          });

          for (const recipient of recipients) {
            const managerPhone = normalizePhone(recipient.phone);
            const managerSmsMessage = buildManagerLeadAlertSmsMessage(
              updatedEntry,
              recipient,
              siteOrigin
            );
            if (!managerPhone || !managerSmsMessage) {
              updatedEntry = await appendLeadSmsHistory(
                updatedEntry,
                buildSmsHistoryRecord(null, {
                  message: managerSmsMessage || "Automatic lead alert SMS",
                  phone: managerPhone,
                  targetType: recipient.role === "admin" ? "admin" : "manager",
                  targetRef: recipient.id,
                  source: "automatic",
                  status: "failed",
                  errorCode: !managerPhone ? "MISSING_PHONE" : "SMS_MESSAGE_REQUIRED",
                  errorMessage: !managerPhone
                    ? "У получателя нет телефона для SMS-уведомления."
                    : "Не удалось собрать текст SMS-уведомления.",
                  recipientName: normalizeString(recipient.name, 160),
                  recipientRole: normalizeString(recipient.role, 40).toLowerCase(),
                })
              );
              continue;
            }
            try {
              const smsResult = await leadConnector.sendSmsMessage({
                phone: managerPhone,
                customerName: normalizeString(recipient.name, 160),
                customerEmail: normalizeString(recipient.email, 250).toLowerCase(),
                message: managerSmsMessage,
              });
              if (smsResult && smsResult.ok) {
                const record = buildSmsHistoryRecord(smsResult, {
                  message: managerSmsMessage,
                  phone: managerPhone,
                  targetType: recipient.role === "admin" ? "admin" : "manager",
                  targetRef: recipient.id,
                  source: "automatic",
                  recipientName: normalizeString(recipient.name, 160),
                  recipientRole: normalizeString(recipient.role, 40).toLowerCase(),
                });
                updatedEntry = await appendLeadSmsHistory(updatedEntry, record);
                managerSmsSent = true;
                managerSmsSentCount += 1;
              } else {
                updatedEntry = await appendLeadSmsHistory(
                  updatedEntry,
                  buildSmsHistoryRecord(smsResult, {
                    message: managerSmsMessage,
                    phone: managerPhone,
                    targetType: recipient.role === "admin" ? "admin" : "manager",
                    targetRef: recipient.id,
                    source: "automatic",
                    status: "failed",
                    errorMessage: extractSmsFailureMessage(
                      smsResult,
                      "Не удалось отправить внутреннее SMS-уведомление."
                    ),
                    recipientName: normalizeString(recipient.name, 160),
                    recipientRole: normalizeString(recipient.role, 40).toLowerCase(),
                  })
                );
                logEvent("quote_manager_sms_failed", {
                  entryId: normalizeString(updatedEntry.id, 120),
                  requestId: normalizeString(updatedEntry.requestId, 120),
                  recipientId: recipient.id,
                  recipientRole: recipient.role,
                  code: normalizeString(smsResult && smsResult.code, 80),
                  message: extractSmsFailureMessage(
                    smsResult,
                    "Failed to send internal lead alert SMS."
                  ),
                });
              }
            } catch (error) {
              updatedEntry = await appendLeadSmsHistory(
                updatedEntry,
                buildSmsHistoryRecord(null, {
                  message: managerSmsMessage,
                  phone: managerPhone,
                  targetType: recipient.role === "admin" ? "admin" : "manager",
                  targetRef: recipient.id,
                  source: "automatic",
                  status: "failed",
                  errorMessage: normalizeString(error && error.message, 300) || "Не удалось отправить внутреннее SMS-уведомление.",
                  recipientName: normalizeString(recipient.name, 160),
                  recipientRole: normalizeString(recipient.role, 40).toLowerCase(),
                })
              );
              logEvent("quote_manager_sms_failed", {
                entryId: normalizeString(updatedEntry.id, 120),
                requestId: normalizeString(updatedEntry.requestId, 120),
                recipientId: recipient.id,
                recipientRole: recipient.role,
                message: normalizeString(error && error.message, 300),
              });
            }
          }
        } catch (error) {
          updatedEntry = await appendLeadSmsHistory(
            updatedEntry,
            buildSmsHistoryRecord(null, {
              message: "Automatic lead alert SMS",
              targetType: "manager",
              targetRef: "lead-alert-recipients",
              source: "automatic",
              status: "failed",
              errorCode: "RECIPIENT_LIST_FAILED",
              errorMessage: normalizeString(error && error.message, 300) || "Не удалось собрать список получателей SMS-уведомления.",
              recipientRole: "manager",
            })
          );
          logEvent("quote_manager_sms_failed", {
            entryId: normalizeString(updatedEntry.id, 120),
            requestId: normalizeString(updatedEntry.requestId, 120),
            message: normalizeString(error && error.message, 300),
          });
        }
      }
    }

    return {
      entry: updatedEntry,
      customerEmailSent,
      customerSmsSent,
      managerSmsSent,
      managerSmsSentCount,
    };
  }

  async function notifyScheduledAssignment({ entry, assignment, leadConnectorClient = null } = {}) {
    if (
      !entry ||
      !assignment ||
      !Array.isArray(assignment.staffIds) ||
      assignment.staffIds.length === 0 ||
      !staffStore ||
      typeof staffStore.getSnapshot !== "function"
    ) {
      return { sent: 0, entry };
    }

    if (!canSendAssignmentSms(entry)) {
      return { sent: 0, entry };
    }

    const leadConnector = getLeadConnectorClientSafe(leadConnectorClient);
    if (
      !leadConnector ||
      typeof leadConnector.sendSmsMessage !== "function" ||
      typeof leadConnector.isConfigured !== "function" ||
      !leadConnector.isConfigured()
    ) {
      return { sent: 0, entry };
    }

    const snapshot = await staffStore.getSnapshot();
    const staffById = new Map(
      (Array.isArray(snapshot && snapshot.staff) ? snapshot.staff : [])
        .map((record) => [normalizeString(record && record.id, 120), record])
        .filter(([id]) => Boolean(id))
    );
    const signature = buildAssignmentSignature(entry, assignment);
    const notifications = getOrderNotificationState(entry);
    const assignmentSmsByStaffId = {
      ...notifications.assignmentSmsByStaffId,
    };
    let updatedEntry = entry;
    let sent = 0;

    for (const staffId of assignment.staffIds) {
      const normalizedStaffId = normalizeString(staffId, 120);
      if (!normalizedStaffId) continue;
      const existingRecord = assignmentSmsByStaffId[normalizedStaffId];
      if (
        existingRecord &&
        normalizeString(existingRecord.signature, 500) === signature &&
        normalizeString(existingRecord.sentAt, 80)
      ) {
        continue;
      }

      const staffRecord = staffById.get(normalizedStaffId);
      const staffPhone = normalizePhone(staffRecord && staffRecord.phone);
      if (!staffRecord || !staffPhone) continue;

      const message = buildStaffAssignmentSmsMessage(updatedEntry, staffRecord, assignment, siteOrigin);
      if (!message) continue;

      try {
        const smsInput = {
          phone: staffPhone,
          customerName: normalizeString(staffRecord.name, 160),
          customerEmail: normalizeString(staffRecord.email, 250).toLowerCase(),
          message,
        };
        let smsResult = await leadConnector.sendSmsMessage({
          ...smsInput,
          allowDirectToNumber: true,
        });
        if (!smsResult || !smsResult.ok) {
          smsResult = await leadConnector.sendSmsMessage(smsInput);
        }
        if (!smsResult || !smsResult.ok) {
          logEvent("assignment_staff_sms_failed", {
            entryId: normalizeString(updatedEntry.id, 120),
            staffId: normalizedStaffId,
            code: normalizeString(smsResult && smsResult.code, 80).toUpperCase(),
            message: extractSmsFailureMessage(smsResult, "Failed to send assignment SMS."),
          });
          continue;
        }

        const record = buildSmsHistoryRecord(smsResult, {
          message,
          phone: staffPhone,
          targetType: "staff-assignment",
          targetRef: normalizeString(updatedEntry.id, 120),
          source: "automatic",
        });

        await staffStore.updateStaff(normalizedStaffId, {
          smsHistory: appendSmsHistory(getStaffSmsHistory(staffRecord), record),
        });

        assignmentSmsByStaffId[normalizedStaffId] = {
          signature,
          sentAt: record.sentAt,
          phone: staffPhone,
        };
        updatedEntry = await appendOrderSmsHistory(updatedEntry, record, {
          ...notifications,
          assignmentSmsByStaffId,
        });
        sent += 1;
      } catch (error) {
        logEvent("assignment_staff_sms_failed", {
          entryId: normalizeString(updatedEntry.id, 120),
          staffId: normalizedStaffId,
          message: normalizeString(error && error.message, 300),
        });
      }
    }

    return {
      sent,
      entry: updatedEntry,
    };
  }

  async function notifyClientEnRoute({ entry, leadConnectorClient = null } = {}) {
    if (!entry || getEntryOrderStatus(entry) !== "en-route") {
      return {
        sent: false,
        entry,
      };
    }

    const customerPhone = normalizePhone(entry.customerPhone);
    if (!customerPhone) {
      return {
        sent: false,
        entry,
      };
    }

    const leadConnector = getLeadConnectorClientSafe(leadConnectorClient);
    if (
      !leadConnector ||
      typeof leadConnector.sendSmsMessage !== "function" ||
      typeof leadConnector.isConfigured !== "function" ||
      !leadConnector.isConfigured()
    ) {
      return {
        sent: false,
        entry,
      };
    }

    const notifications = getOrderNotificationState(entry);
    const signature = buildAssignmentSignature(entry, {
      scheduleDate: normalizeString(entry.selectedDate, 32),
      scheduleTime: normalizeString(entry.selectedTime, 32),
    });
    if (
      normalizeString(notifications.enRouteSms.signature, 500) === signature &&
      normalizeString(notifications.enRouteSms.sentAt, 80)
    ) {
      return {
        sent: false,
        entry,
      };
    }

    const message = buildClientEnRouteSmsMessage();
    let updatedEntry = entry;
    try {
      const smsResult = await leadConnector.sendSmsMessage({
        contactId: normalizeString(entry.contactId, 120),
        phone: customerPhone,
        customerName: normalizeString(entry.customerName, 160),
        customerEmail: normalizeString(entry.customerEmail, 250).toLowerCase(),
        message,
      });

      if (!smsResult || !smsResult.ok) {
        updatedEntry = await appendOrderSmsHistory(
          entry,
          buildSmsHistoryRecord(smsResult, {
            message,
            phone: customerPhone,
            targetType: "client-en-route",
            targetRef: normalizeString(entry.id, 120),
            source: "automatic",
            status: "failed",
            errorMessage: extractSmsFailureMessage(smsResult, "Не удалось отправить SMS клиенту."),
            recipientName: normalizeString(entry.customerName, 160),
          })
        );
        logEvent("client_en_route_sms_failed", {
          entryId: normalizeString(entry.id, 120),
          code: normalizeString(smsResult && smsResult.code, 80).toUpperCase(),
          message: extractSmsFailureMessage(smsResult, "Failed to send en-route SMS."),
        });
        return {
          sent: false,
          entry: updatedEntry,
        };
      }

      const record = buildSmsHistoryRecord(smsResult, {
        message,
        phone: customerPhone,
        targetType: "client-en-route",
        targetRef: normalizeString(entry.id, 120),
        source: "automatic",
        recipientName: normalizeString(entry.customerName, 160),
      });
      updatedEntry = await appendOrderSmsHistory(updatedEntry, record, {
        ...notifications,
        enRouteSms: {
          signature,
          sentAt: record.sentAt,
          phone: customerPhone,
        },
      });
      return {
        sent: true,
        entry: updatedEntry,
      };
    } catch (error) {
      updatedEntry = await appendOrderSmsHistory(
        entry,
        buildSmsHistoryRecord(null, {
          message,
          phone: customerPhone,
          targetType: "client-en-route",
          targetRef: normalizeString(entry.id, 120),
          source: "automatic",
          status: "failed",
          errorMessage: normalizeString(error && error.message, 300) || "Не удалось отправить SMS клиенту.",
          recipientName: normalizeString(entry.customerName, 160),
        })
      );
      logEvent("client_en_route_sms_failed", {
        entryId: normalizeString(entry.id, 120),
        message: normalizeString(error && error.message, 300),
      });
      return {
        sent: false,
        entry: updatedEntry,
      };
    }
  }

  async function notifyManagerCleaningComplete({ entry, leadConnectorClient = null } = {}) {
    if (!entry || getEntryOrderStatus(entry) !== "cleaning-complete") {
      return {
        sent: false,
        entry,
      };
    }

    if (typeof listLeadManagers !== "function") {
      return {
        sent: false,
        entry,
      };
    }

    const adminLead = getEntryAdminLead(entry);
    const assignedManagerId = normalizeString(adminLead.managerId, 120);
    let managerRecord = null;

    if (assignedManagerId && typeof resolveLeadManagerById === "function") {
      try {
        managerRecord = await resolveLeadManagerById(assignedManagerId);
      } catch {}
    }

    if (!managerRecord) {
      const managers = normalizeLeadAlertRecipients(await listLeadManagers());
      managerRecord =
        (assignedManagerId
          ? managers.find((record) => record && record.id === assignedManagerId) || null
          : null) ||
        managers[0] ||
        null;
    }
    const managerPhone = normalizePhone(managerRecord && managerRecord.phone);
    if (!managerRecord || !managerPhone) {
      return {
        sent: false,
        entry,
      };
    }
    const notificationManagerId = normalizeString(managerRecord.id, 120);
    if (!notificationManagerId) {
      return {
        sent: false,
        entry,
      };
    }

    const leadConnector = getLeadConnectorClientSafe(leadConnectorClient);
    if (
      !leadConnector ||
      typeof leadConnector.sendSmsMessage !== "function" ||
      typeof leadConnector.isConfigured !== "function" ||
      !leadConnector.isConfigured()
    ) {
      return {
        sent: false,
        entry,
      };
    }

    const notifications = getOrderNotificationState(entry);
    const cleaningCompleteSmsByManagerId = {
      ...notifications.cleaningCompleteSmsByManagerId,
    };
    const signature = buildAssignmentSignature(entry, {
      scheduleDate: normalizeString(entry.selectedDate, 32),
      scheduleTime: normalizeString(entry.selectedTime, 32),
    });
    const existingRecord = cleaningCompleteSmsByManagerId[notificationManagerId];
    if (
      existingRecord &&
      normalizeString(existingRecord.signature, 500) === signature &&
      normalizeString(existingRecord.sentAt, 80)
    ) {
      return {
        sent: false,
        entry,
      };
    }

    const message = buildManagerCleaningCompleteSmsMessage(entry);
    if (!message) {
      return {
        sent: false,
        entry,
      };
    }

    let updatedEntry = entry;
    try {
      const smsInput = {
        phone: managerPhone,
        customerName: normalizeString(managerRecord.name, 160),
        customerEmail: normalizeString(managerRecord.email, 250).toLowerCase(),
        message,
      };
      let smsResult = await leadConnector.sendSmsMessage({
        ...smsInput,
        allowDirectToNumber: true,
      });
      if (!smsResult || !smsResult.ok) {
        smsResult = await leadConnector.sendSmsMessage(smsInput);
      }
      if (!smsResult || !smsResult.ok) {
        updatedEntry = await appendOrderSmsHistory(
          entry,
          buildSmsHistoryRecord(smsResult, {
            message,
            phone: managerPhone,
            targetType: "manager-cleaning-complete",
            targetRef: normalizeString(entry.id, 120),
            source: "automatic",
            status: "failed",
            errorMessage: extractSmsFailureMessage(smsResult, "Не удалось отправить SMS менеджеру."),
            recipientName: normalizeString(managerRecord.name, 160),
            recipientRole: "manager",
          })
        );
        logEvent("manager_cleaning_complete_sms_failed", {
          entryId: normalizeString(entry.id, 120),
          managerId: notificationManagerId,
          code: normalizeString(smsResult && smsResult.code, 80).toUpperCase(),
          message: extractSmsFailureMessage(smsResult, "Failed to send cleaning complete SMS."),
        });
        return {
          sent: false,
          entry: updatedEntry,
        };
      }

      const record = buildSmsHistoryRecord(smsResult, {
        message,
        phone: managerPhone,
        targetType: "manager-cleaning-complete",
        targetRef: normalizeString(entry.id, 120),
        source: "automatic",
        recipientName: normalizeString(managerRecord.name, 160),
        recipientRole: "manager",
      });
      cleaningCompleteSmsByManagerId[notificationManagerId] = {
        signature,
        sentAt: record.sentAt,
        phone: managerPhone,
      };
      updatedEntry = await appendOrderSmsHistory(updatedEntry, record, {
        ...notifications,
        cleaningCompleteSmsByManagerId,
      });
      return {
        sent: true,
        entry: updatedEntry,
      };
    } catch (error) {
      updatedEntry = await appendOrderSmsHistory(
        entry,
        buildSmsHistoryRecord(null, {
          message,
          phone: managerPhone,
          targetType: "manager-cleaning-complete",
          targetRef: normalizeString(entry.id, 120),
          source: "automatic",
          status: "failed",
          errorMessage: normalizeString(error && error.message, 300) || "Не удалось отправить SMS менеджеру.",
          recipientName: normalizeString(managerRecord.name, 160),
          recipientRole: "manager",
        })
      );
      logEvent("manager_cleaning_complete_sms_failed", {
        entryId: normalizeString(entry.id, 120),
        managerId: notificationManagerId,
        message: normalizeString(error && error.message, 300),
      });
      return {
        sent: false,
        entry: updatedEntry,
      };
    }
  }

  async function notifyAwaitingReviewRequest({ entry, leadConnectorClient = null } = {}) {
    if (!entry || getEntryOrderStatus(entry) !== "awaiting-review") {
      return {
        entry,
        customerEmailSent: false,
        customerSmsSent: false,
      };
    }

    let updatedEntry = entry;
    let customerEmailSent = false;
    let customerSmsSent = false;
    const notifications = getOrderNotificationState(entry);
    const existingReviewRequest =
      notifications.reviewRequest && typeof notifications.reviewRequest === "object"
        ? { ...notifications.reviewRequest }
        : {};
    const reviewRequestState = {
      signature: `awaiting-review|${normalizeString(reviewUrl, 4000) || DEFAULT_CUSTOMER_REVIEW_URL}`,
      reviewUrl: normalizeString(reviewUrl, 4000) || DEFAULT_CUSTOMER_REVIEW_URL,
      emailSentAt: normalizeString(existingReviewRequest.emailSentAt, 80),
      smsSentAt: normalizeString(existingReviewRequest.smsSentAt, 80),
    };

    const customerEmail = normalizeString(updatedEntry.customerEmail, 250).toLowerCase();
    if (
      customerEmail &&
      !reviewRequestState.emailSentAt &&
      accountInviteEmail &&
      typeof accountInviteEmail.getStatus === "function" &&
      typeof accountInviteEmail.sendReviewRequest === "function"
    ) {
      try {
        const emailStatus = await accountInviteEmail.getStatus(getMailConfigSafe());
        if (emailStatus && emailStatus.configured) {
          await accountInviteEmail.sendReviewRequest(
            {
              toEmail: customerEmail,
              clientName: normalizeString(updatedEntry.customerName, 160),
              serviceName: normalizeString(updatedEntry.serviceName, 120),
              fullAddress: normalizeString(updatedEntry.fullAddress, 500),
              reviewUrl: reviewRequestState.reviewUrl,
            },
            getMailConfigSafe()
          );
          reviewRequestState.emailSentAt = new Date().toISOString();
          customerEmailSent = true;
        }
      } catch (error) {
        logEvent("review_request_email_failed", {
          entryId: normalizeString(updatedEntry.id, 120),
          message: normalizeString(error && error.message, 300),
        });
      }
    }

    const leadConnector = getLeadConnectorClientSafe(leadConnectorClient);
    const canSendSms =
      leadConnector &&
      typeof leadConnector.sendSmsMessage === "function" &&
      typeof leadConnector.isConfigured === "function" &&
      leadConnector.isConfigured();
    if (canSendSms && normalizePhone(updatedEntry.customerPhone) && !reviewRequestState.smsSentAt) {
      const message = buildReviewRequestSmsMessage(updatedEntry, reviewRequestState.reviewUrl);
      try {
        const smsResult = await leadConnector.sendSmsMessage({
          contactId: normalizeString(updatedEntry.contactId, 120),
          phone: normalizePhone(updatedEntry.customerPhone),
          customerName: normalizeString(updatedEntry.customerName, 160),
          customerEmail,
          message,
        });
        if (smsResult && smsResult.ok) {
          const record = buildSmsHistoryRecord(smsResult, {
            message,
            phone: normalizePhone(updatedEntry.customerPhone),
            targetType: "review-request",
            targetRef: normalizeString(updatedEntry.id, 120),
            source: "automatic",
          });
          reviewRequestState.smsSentAt = record.sentAt;
          updatedEntry = await appendOrderSmsHistory(updatedEntry, record, {
            ...notifications,
            reviewRequest: reviewRequestState,
          });
          customerSmsSent = true;
        }
      } catch (error) {
        logEvent("review_request_sms_failed", {
          entryId: normalizeString(updatedEntry.id, 120),
          message: normalizeString(error && error.message, 300),
        });
      }
    }

    if ((customerEmailSent || customerSmsSent) && !customerSmsSent) {
      updatedEntry = await appendOrderSmsHistory(updatedEntry, null, {
        ...notifications,
        reviewRequest: reviewRequestState,
      });
    }

    return {
      entry: updatedEntry,
      customerEmailSent,
      customerSmsSent,
    };
  }

  async function runClientReminderSweep({ now = new Date(), leadConnectorClient = null } = {}) {
    if (!quoteOpsLedger || typeof quoteOpsLedger.listEntries !== "function") {
      return { inspected: 0, sent: 0 };
    }

    const leadConnector = getLeadConnectorClientSafe(leadConnectorClient);
    if (
      !leadConnector ||
      typeof leadConnector.sendSmsMessage !== "function" ||
      typeof leadConnector.isConfigured !== "function" ||
      !leadConnector.isConfigured()
    ) {
      return { inspected: 0, sent: 0 };
    }

    const entries = await quoteOpsLedger.listEntries({ limit: reminderScanLimit });
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    let inspected = 0;
    let sent = 0;

    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || getEntryOrderStatus(entry) !== "scheduled") continue;
      if (!normalizePhone(entry.customerPhone)) continue;

      const schedule = localDateTimeToInstant(entry.selectedDate, entry.selectedTime, timeZone);
      if (!schedule || !schedule.date || Number.isNaN(schedule.date.getTime())) continue;
      const diffMs = schedule.date.getTime() - nowMs;
      if (!(diffMs > 0)) continue;

      inspected += 1;
      const notifications = getOrderNotificationState(entry);
      const signature = buildReminderSignature(entry);
      const hasMatchingReminderState =
        normalizeString(notifications.reminderSms.signature, 500) === signature;
      const reminderSms =
        hasMatchingReminderState
          ? { ...notifications.reminderSms }
          : restoreReminderSmsStateFromHistory(entry, signature);
      if (!hasMatchingReminderState && hasReminderSmsSentMarker(reminderSms)) {
        await appendOrderSmsHistory(entry, null, {
          ...notifications,
          reminderSms,
        });
      }

      for (const window of REMINDER_WINDOWS) {
        const upperBoundMs = window.hoursBefore * 60 * 60 * 1000;
        const lowerBoundMs = window.lowerBoundHours * 60 * 60 * 1000;
        if (normalizeString(reminderSms[window.key], 80)) continue;
        if (!(diffMs <= upperBoundMs && diffMs > lowerBoundMs)) continue;

        const message = buildClientVisitReminderSmsMessage(entry, window.hoursBefore);
        if (!message) continue;

        try {
          const smsResult = await leadConnector.sendSmsMessage({
            contactId: normalizeString(entry.contactId, 120),
            phone: normalizePhone(entry.customerPhone),
            customerName: normalizeString(entry.customerName, 160),
            customerEmail: normalizeString(entry.customerEmail, 250).toLowerCase(),
            message,
          });
          if (!smsResult || !smsResult.ok) continue;

          const record = buildSmsHistoryRecord(smsResult, {
            message,
            phone: normalizePhone(entry.customerPhone),
            targetType: "visit-reminder",
            targetRef: `${normalizeString(entry.id, 120)}:${window.key}`,
            source: "automatic",
          });

          reminderSms[window.key] = record.sentAt;
          const updatedNotifications = {
            ...notifications,
            reminderSms,
          };
          await appendOrderSmsHistory(entry, record, updatedNotifications);
          sent += 1;
        } catch (error) {
          logEvent("visit_reminder_sms_failed", {
            entryId: normalizeString(entry.id, 120),
            reminderKey: window.key,
            message: normalizeString(error && error.message, 300),
          });
        }
      }
    }

    return {
      inspected,
      sent,
    };
  }

  return {
    notifyManagerCleaningComplete,
    notifyClientEnRoute,
    notifyAwaitingReviewRequest,
    notifyQuoteSubmissionSuccess,
    notifyScheduledAssignment,
    runClientReminderSweep,
  };
}

module.exports = {
  appendSmsHistory,
  buildAssignmentSignature,
  buildClientVisitReminderSmsMessage,
  buildClientEnRouteSmsMessage,
  buildManagerCleaningCompleteSmsMessage,
  buildManagerLeadAlertSmsMessage,
  buildQuoteConfirmationSmsMessage,
  buildReviewRequestSmsMessage,
  buildScheduleLabel,
  buildSmsHistoryRecord,
  buildStaffAssignmentSmsMessage,
  createAutoNotificationService,
  getOrderNotificationState,
  localDateTimeToInstant,
  normalizeSmsHistoryEntries,
};
