"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAutoNotificationService,
  getOrderNotificationState,
  localDateTimeToInstant,
} = require("../lib/auto-notifications");

function createLeadEntry(overrides = {}) {
  return {
    id: "entry-1",
    customerName: "Jane Doe",
    customerPhone: "3125550100",
    customerEmail: "jane@example.com",
    serviceName: "Deep Cleaning",
    selectedDate: "2026-04-20",
    selectedTime: "09:00",
    fullAddress: "123 Main St, Chicago, IL 60601",
    contactId: "contact-123",
    payloadForRetry: {
      adminLead: {
        managerId: "manager-1",
        managerName: "Mila Rivers",
        managerEmail: "mila@example.com",
      },
    },
    ...overrides,
  };
}

function createOrderEntry(overrides = {}) {
  return {
    id: "order-1",
    customerName: "Jane Doe",
    customerPhone: "3125550100",
    customerEmail: "jane@example.com",
    serviceName: "Standard Cleaning",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
    fullAddress: "123 Main St, Chicago, IL 60601",
    contactId: "contact-123",
    payloadForRetry: {
      orderState: {
        status: "scheduled",
      },
      adminOrder: {
        status: "scheduled",
      },
    },
    ...overrides,
  };
}

function createMutableLedger(entry) {
  const store = new Map([[entry.id, entry]]);

  function cloneOrderState(currentEntry) {
    const payload = currentEntry.payloadForRetry || {};
    if (payload.orderState && typeof payload.orderState === "object") {
      return JSON.parse(JSON.stringify(payload.orderState));
    }
    if (payload.adminOrder && typeof payload.adminOrder === "object") {
      return JSON.parse(JSON.stringify(payload.adminOrder));
    }
    return {};
  }

  return {
    async listEntries() {
      return Array.from(store.values());
    },
    async updateLeadEntry(entryId, updates = {}) {
      const currentEntry = store.get(entryId);
      const payload = currentEntry.payloadForRetry || {};
      if (updates.smsHistory) {
        payload.adminSms = {
          ...(payload.adminSms || {}),
          history: updates.smsHistory,
        };
      }
      currentEntry.payloadForRetry = payload;
      store.set(entryId, currentEntry);
      return currentEntry;
    },
    async updateOrderEntry(entryId, updates = {}) {
      const currentEntry = store.get(entryId);
      const payload = currentEntry.payloadForRetry || {};
      if (updates.smsHistory) {
        payload.adminSms = {
          ...(payload.adminSms || {}),
          history: updates.smsHistory,
        };
      }
      if (Object.prototype.hasOwnProperty.call(updates, "notifications")) {
        const orderState = cloneOrderState(currentEntry);
        orderState.notifications = updates.notifications;
        payload.orderState = JSON.parse(JSON.stringify(orderState));
        payload.adminOrder = JSON.parse(JSON.stringify(orderState));
      }
      currentEntry.payloadForRetry = payload;
      store.set(entryId, currentEntry);
      return currentEntry;
    },
  };
}

function createLeadConnectorStub() {
  const calls = [];
  return {
    calls,
    isConfigured() {
      return true;
    },
    async sendSmsMessage(input = {}) {
      calls.push(input);
      return {
        ok: true,
        contactId: input.contactId || "",
        conversationId: `conversation-${calls.length}`,
        messageId: `message-${calls.length}`,
      };
    },
  };
}

function createLeadConnectorSequenceStub(results = []) {
  const calls = [];
  return {
    calls,
    isConfigured() {
      return true;
    },
    async sendSmsMessage(input = {}) {
      calls.push(input);
      const next = results[calls.length - 1] || { ok: true };
      return {
        ok: next.ok !== false,
        code: next.code || (next.ok === false ? "SMS_SEND_FAILED" : "OK"),
        message: next.message || "",
        details: next.details || null,
        contactId: next.contactId || input.contactId || "",
        conversationId: next.ok === false ? "" : `conversation-${calls.length}`,
        messageId: next.ok === false ? "" : `message-${calls.length}`,
      };
    },
  };
}

test("sends customer and manager notifications after a successful quote submission", async () => {
  const entry = createLeadEntry();
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const emailCalls = [];
  const service = createAutoNotificationService({
    accountInviteEmail: {
      async getStatus() {
        return { configured: true };
      },
      async sendQuoteRequestConfirmation(payload) {
        emailCalls.push(payload);
        return { sentAt: new Date().toISOString() };
      },
    },
    listLeadManagers: async () => [
      {
        id: "manager-1",
        name: "Mila Rivers",
        email: "mila@example.com",
        phone: "3125550199",
      },
    ],
    quoteOpsLedger: ledger,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const result = await service.notifyQuoteSubmissionSuccess({
    entry,
    pricing: { serviceName: "Deep Cleaning" },
    leadConnectorClient,
  });

  assert.equal(result.customerEmailSent, true);
  assert.equal(result.customerSmsSent, true);
  assert.equal(result.managerSmsSent, true);
  assert.equal(result.managerSmsSentCount, 1);
  assert.equal(emailCalls.length, 1);
  assert.equal(leadConnectorClient.calls.length, 2);
  assert.match(leadConnectorClient.calls[0].message, /received your request/i);
  assert.match(leadConnectorClient.calls[1].message, /assigned to you/i);
  assert.equal((result.entry.payloadForRetry.adminSms.history || []).length, 2);
});

test("sends new lead SMS alerts to active managers and admins", async () => {
  const entry = createLeadEntry({
    customerPhone: "3125550101",
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const service = createAutoNotificationService({
    listLeadManagers: async () => [
      {
        id: "manager-1",
        name: "Mila Rivers",
        email: "mila@example.com",
        phone: "3125550199",
        role: "manager",
      },
    ],
    listLeadAlertRecipients: async () => [
      {
        id: "manager-1",
        name: "Mila Rivers",
        email: "mila@example.com",
        phone: "3125550199",
        role: "manager",
      },
      {
        id: "admin-1",
        name: "Ramis Admin",
        email: "ramis@example.com",
        phone: "3125550177",
        role: "admin",
      },
    ],
    quoteOpsLedger: ledger,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const result = await service.notifyQuoteSubmissionSuccess({
    entry,
    pricing: { serviceName: "Deep Cleaning" },
    leadConnectorClient,
  });

  assert.equal(result.customerSmsSent, true);
  assert.equal(result.managerSmsSent, true);
  assert.equal(result.managerSmsSentCount, 2);
  assert.equal(leadConnectorClient.calls.length, 3);
  assert.equal(Boolean(leadConnectorClient.calls[1].allowDirectToNumber), true);
  assert.equal(Boolean(leadConnectorClient.calls[2].allowDirectToNumber), true);
  assert.match(leadConnectorClient.calls[1].message, /assigned to you/i);
  assert.match(leadConnectorClient.calls[2].message, /was submitted|needs attention/i);
  assert.equal((result.entry.payloadForRetry.adminSms.history || []).length, 3);
});

test("falls back to contact SMS for internal lead alerts when direct send is blocked", async () => {
  const entry = createLeadEntry({
    customerPhone: "3125550101",
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorSequenceStub([
    { ok: true },
    { ok: false, code: "SMS_SEND_FAILED", message: "Direct send blocked." },
    { ok: true },
  ]);
  const service = createAutoNotificationService({
    listLeadAlertRecipients: async () => [
      {
        id: "manager-1",
        name: "Mila Rivers",
        email: "mila@example.com",
        phone: "3125550199",
        role: "manager",
      },
    ],
    quoteOpsLedger: ledger,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const result = await service.notifyQuoteSubmissionSuccess({
    entry,
    pricing: { serviceName: "Deep Cleaning" },
    leadConnectorClient,
  });

  assert.equal(result.customerSmsSent, true);
  assert.equal(result.managerSmsSent, true);
  assert.equal(result.managerSmsSentCount, 1);
  assert.equal(leadConnectorClient.calls.length, 3);
  assert.equal(Boolean(leadConnectorClient.calls[1].allowDirectToNumber), true);
  assert.equal(Boolean(leadConnectorClient.calls[2].allowDirectToNumber), false);
  assert.equal((result.entry.payloadForRetry.adminSms.history || []).length, 2);
});

test("records failed internal lead alert SMS attempts with recipient diagnostics", async () => {
  const entry = createLeadEntry({
    customerPhone: "3125550101",
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorSequenceStub([
    { ok: true },
    { ok: true },
    { ok: false, code: "SMS_SEND_FAILED", message: "Direct send blocked." },
    { ok: false, code: "SMS_SEND_FAILED", message: "Recipient has opted out." },
  ]);
  const service = createAutoNotificationService({
    listLeadAlertRecipients: async () => [
      {
        id: "manager-1",
        name: "Mila Rivers",
        email: "mila@example.com",
        phone: "3125550199",
        role: "manager",
      },
      {
        id: "admin-1",
        name: "Anastasiia Iaparova",
        email: "anastasiia@example.com",
        phone: "3125550177",
        role: "admin",
      },
    ],
    quoteOpsLedger: ledger,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const result = await service.notifyQuoteSubmissionSuccess({
    entry,
    pricing: { serviceName: "Deep Cleaning" },
    leadConnectorClient,
  });

  assert.equal(result.customerSmsSent, true);
  assert.equal(result.managerSmsSent, true);
  assert.equal(result.managerSmsSentCount, 1);
  const history = result.entry.payloadForRetry.adminSms.history || [];
  assert.equal(history.length, 3);
  const failedRecord = history.find((item) => item && item.status === "failed");
  assert.ok(failedRecord);
  assert.equal(failedRecord.targetType, "admin");
  assert.equal(failedRecord.recipientName, "Anastasiia Iaparova");
  assert.equal(failedRecord.recipientRole, "admin");
  assert.match(failedRecord.errorMessage, /opted out/i);
});

test("sends assignment SMS once per schedule signature for scheduled orders", async () => {
  const entry = createOrderEntry();
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const staffUpdateCalls = [];
  const staffStore = {
    async getSnapshot() {
      return {
        staff: [
          {
            id: "staff-1",
            name: "Olga Stone",
            phone: "3125550222",
            email: "olga@example.com",
            smsHistory: [],
          },
        ],
      };
    },
    async updateStaff(staffId, updates = {}) {
      staffUpdateCalls.push({ staffId, updates });
      return { id: staffId, ...updates };
    },
  };

  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    staffStore,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const firstResult = await service.notifyScheduledAssignment({
    entry,
    assignment: {
      staffIds: ["staff-1"],
      scheduleDate: "2026-04-20",
      scheduleTime: "10:00",
      status: "planned",
      notes: "",
    },
    leadConnectorClient,
  });

  assert.equal(firstResult.sent, 1);
  assert.equal(leadConnectorClient.calls.length, 1);
  assert.equal(staffUpdateCalls.length, 1);
  assert.equal(Boolean(leadConnectorClient.calls[0].allowDirectToNumber), true);
  assert.match(leadConnectorClient.calls[0].message, /На вас назначена уборка SHYNLI/i);
  assert.match(leadConnectorClient.calls[0].message, /Подтвердите или отклоните заказ/i);
  assert.match(leadConnectorClient.calls[0].message, /shynlicleaningservice\.com\/account/i);
  const notificationState = getOrderNotificationState(firstResult.entry);
  assert.equal(
    notificationState.assignmentSmsByStaffId["staff-1"].signature,
    "2026-04-20|10:00|123 Main St, Chicago, IL 60601|Standard Cleaning"
  );

  const secondResult = await service.notifyScheduledAssignment({
    entry: firstResult.entry,
    assignment: {
      staffIds: ["staff-1"],
      scheduleDate: "2026-04-20",
      scheduleTime: "10:00",
      status: "planned",
      notes: "",
    },
    leadConnectorClient,
  });

  assert.equal(secondResult.sent, 0);
  assert.equal(leadConnectorClient.calls.length, 1);
});

test("sends assignment SMS for rescheduled orders when staff is assigned", async () => {
  const entry = createOrderEntry({
    id: "order-rescheduled-1",
    payloadForRetry: {
      orderState: {
        status: "rescheduled",
      },
      adminOrder: {
        status: "rescheduled",
      },
    },
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const staffStore = {
    async getSnapshot() {
      return {
        staff: [
          {
            id: "staff-1",
            name: "Olga Stone",
            phone: "3125550222",
            email: "olga@example.com",
            smsHistory: [],
          },
        ],
      };
    },
    async updateStaff() {
      return null;
    },
  };

  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    staffStore,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const result = await service.notifyScheduledAssignment({
    entry,
    assignment: {
      staffIds: ["staff-1"],
      scheduleDate: "2026-04-21",
      scheduleTime: "12:30",
      status: "planned",
      notes: "",
    },
    leadConnectorClient,
  });

  assert.equal(result.sent, 1);
  assert.equal(leadConnectorClient.calls.length, 1);
  assert.match(leadConnectorClient.calls[0].message, /На вас назначена уборка SHYNLI/i);
  assert.match(leadConnectorClient.calls[0].message, /Дата и время: 2026-04-21 в 12:30/i);
});

test("falls back to contact-based assignment SMS when direct send is rejected", async () => {
  const entry = createOrderEntry({
    id: "order-assignment-fallback-1",
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorSequenceStub([
    { ok: false, code: "SMS_SEND_FAILED", message: "Direct send blocked." },
    { ok: true, contactId: "staff-contact-1" },
  ]);
  const staffUpdateCalls = [];
  const staffStore = {
    async getSnapshot() {
      return {
        staff: [
          {
            id: "staff-1",
            name: "Olga Stone",
            phone: "3125550222",
            email: "olga@example.com",
            smsHistory: [],
          },
        ],
      };
    },
    async updateStaff(staffId, updates = {}) {
      staffUpdateCalls.push({ staffId, updates });
      return { id: staffId, ...updates };
    },
  };

  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    staffStore,
    siteOrigin: "https://shynlicleaningservice.com",
  });

  const result = await service.notifyScheduledAssignment({
    entry,
    assignment: {
      staffIds: ["staff-1"],
      scheduleDate: "2026-04-20",
      scheduleTime: "10:00",
      status: "planned",
      notes: "",
    },
    leadConnectorClient,
  });

  assert.equal(result.sent, 1);
  assert.equal(leadConnectorClient.calls.length, 2);
  assert.equal(Boolean(leadConnectorClient.calls[0].allowDirectToNumber), true);
  assert.equal(Boolean(leadConnectorClient.calls[1].allowDirectToNumber), false);
  assert.equal(staffUpdateCalls.length, 1);
});

test("logs assignment SMS failures when both assignment send attempts are rejected", async () => {
  const entry = createOrderEntry({
    id: "order-assignment-failure-1",
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorSequenceStub([
    { ok: false, code: "SMS_SEND_FAILED", message: "Direct send blocked." },
    { ok: false, code: "CONTACT_NOT_FOUND", message: "Recipient not reachable." },
  ]);
  const loggedEvents = [];
  const staffStore = {
    async getSnapshot() {
      return {
        staff: [
          {
            id: "staff-1",
            name: "Olga Stone",
            phone: "3125550222",
            email: "olga@example.com",
            smsHistory: [],
          },
        ],
      };
    },
    async updateStaff() {
      return null;
    },
  };

  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    staffStore,
    siteOrigin: "https://shynlicleaningservice.com",
    log(entry) {
      loggedEvents.push(entry);
    },
  });

  const result = await service.notifyScheduledAssignment({
    entry,
    assignment: {
      staffIds: ["staff-1"],
      scheduleDate: "2026-04-20",
      scheduleTime: "10:00",
      status: "planned",
      notes: "",
    },
    leadConnectorClient,
  });

  assert.equal(result.sent, 0);
  assert.equal(leadConnectorClient.calls.length, 2);
  assert.equal(loggedEvents.length, 1);
  assert.equal(loggedEvents[0].type, "assignment_staff_sms_failed");
  assert.equal(loggedEvents[0].code, "CONTACT_NOT_FOUND");
  assert.match(loggedEvents[0].message, /Recipient not reachable/i);
});

test("sends client en-route SMS once when an order moves to en-route", async () => {
  const entry = createOrderEntry({
    id: "order-en-route-1",
    payloadForRetry: {
      orderState: {
        status: "en-route",
      },
      adminOrder: {
        status: "en-route",
      },
    },
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
  });

  const firstResult = await service.notifyClientEnRoute({
    entry,
    leadConnectorClient,
  });

  assert.equal(firstResult.sent, true);
  assert.equal(leadConnectorClient.calls.length, 1);
  assert.equal(
    leadConnectorClient.calls[0].message,
    "Your SHYNLI cleaner is on the way. They will be there soon. See you soon."
  );
  assert.equal((firstResult.entry.payloadForRetry.adminSms.history || []).length, 1);
  assert.equal(firstResult.entry.payloadForRetry.adminSms.history[0].targetType, "client-en-route");
  const notificationState = getOrderNotificationState(firstResult.entry);
  assert.equal(
    notificationState.enRouteSms.signature,
    "2026-04-20|10:00|123 Main St, Chicago, IL 60601|Standard Cleaning"
  );
  assert.ok(notificationState.enRouteSms.sentAt);

  const secondResult = await service.notifyClientEnRoute({
    entry: firstResult.entry,
    leadConnectorClient,
  });

  assert.equal(secondResult.sent, false);
  assert.equal(leadConnectorClient.calls.length, 1);
});

test("sends manager cleaning-complete SMS once to the assigned manager", async () => {
  const entry = createOrderEntry({
    id: "order-cleaning-complete-1",
    customerName: "Ramis",
    payloadForRetry: {
      orderState: {
        status: "cleaning-complete",
      },
      adminOrder: {
        status: "cleaning-complete",
      },
      adminLead: {
        managerId: "manager-1",
        managerName: "Mila Rivers",
      },
    },
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    listLeadManagers: async () => [
      {
        id: "manager-1",
        name: "Mila Rivers",
        email: "mila@example.com",
        phone: "3125550199",
        role: "manager",
      },
    ],
  });

  const firstResult = await service.notifyManagerCleaningComplete({
    entry,
    leadConnectorClient,
  });

  assert.equal(firstResult.sent, true);
  assert.equal(leadConnectorClient.calls.length, 1);
  assert.equal(
    leadConnectorClient.calls[0].message,
    "Уборка завершена у клиента Ramis. Свяжитесь с клиентом для подтверждения и получения оплаты."
  );
  assert.equal(leadConnectorClient.calls[0].phone, "3125550199");
  assert.equal((firstResult.entry.payloadForRetry.adminSms.history || []).length, 1);
  assert.equal(
    firstResult.entry.payloadForRetry.adminSms.history[0].targetType,
    "manager-cleaning-complete"
  );
  const notificationState = getOrderNotificationState(firstResult.entry);
  assert.equal(
    notificationState.cleaningCompleteSmsByManagerId["manager-1"].signature,
    "2026-04-20|10:00|123 Main St, Chicago, IL 60601|Standard Cleaning"
  );
  assert.ok(notificationState.cleaningCompleteSmsByManagerId["manager-1"].sentAt);

  const secondResult = await service.notifyManagerCleaningComplete({
    entry: firstResult.entry,
    leadConnectorClient,
  });

  assert.equal(secondResult.sent, false);
  assert.equal(leadConnectorClient.calls.length, 1);
});

test("sends client reminder SMS at 48h, 24h and 1h without duplicates", async () => {
  const entry = createOrderEntry({
    id: "order-reminder-1",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
  });

  const schedule = localDateTimeToInstant("2026-04-20", "10:00");
  assert.ok(schedule && schedule.date);

  const fortySevenHoursBefore = new Date(schedule.date.getTime() - 47 * 60 * 60 * 1000);
  const firstSweep = await service.runClientReminderSweep({
    now: fortySevenHoursBefore,
    leadConnectorClient,
  });
  assert.equal(firstSweep.sent, 1);

  const duplicateSweep = await service.runClientReminderSweep({
    now: fortySevenHoursBefore,
    leadConnectorClient,
  });
  assert.equal(duplicateSweep.sent, 0);

  const twentyThreeHoursBefore = new Date(schedule.date.getTime() - 23 * 60 * 60 * 1000);
  const secondSweep = await service.runClientReminderSweep({
    now: twentyThreeHoursBefore,
    leadConnectorClient,
  });
  assert.equal(secondSweep.sent, 1);

  const thirtyMinutesBefore = new Date(schedule.date.getTime() - 30 * 60 * 1000);
  const thirdSweep = await service.runClientReminderSweep({
    now: thirtyMinutesBefore,
    leadConnectorClient,
  });
  assert.equal(thirdSweep.sent, 1);
  assert.equal(leadConnectorClient.calls.length, 3);
});

test("does not resend client reminders already present in SMS history", async () => {
  const entry = createOrderEntry({
    id: "order-reminder-history-1",
    selectedDate: "2026-04-20",
    selectedTime: "10:00",
    payloadForRetry: {
      orderState: {
        status: "scheduled",
      },
      adminOrder: {
        status: "scheduled",
      },
      adminSms: {
        history: [
          {
            id: "sms-existing-24h-reminder",
            sentAt: "2026-04-19T10:30:00.000Z",
            message: "Existing 24h reminder.",
            phone: "3125550100",
            channel: "ghl",
            direction: "outbound",
            source: "automatic",
            targetType: "visit-reminder",
            targetRef: "order-reminder-history-1:sent24hAt",
            status: "sent",
          },
        ],
      },
    },
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
  });

  const schedule = localDateTimeToInstant("2026-04-20", "10:00");
  const twentyThreeHoursBefore = new Date(schedule.date.getTime() - 23 * 60 * 60 * 1000);
  const sweep = await service.runClientReminderSweep({
    now: twentyThreeHoursBefore,
    leadConnectorClient,
  });

  assert.equal(sweep.sent, 0);
  assert.equal(leadConnectorClient.calls.length, 0);
});

test("sends review request email and SMS once when an order enters awaiting-review", async () => {
  const entry = createOrderEntry({
    id: "order-review-1",
    payloadForRetry: {
      orderState: {
        status: "awaiting-review",
      },
      adminOrder: {
        status: "awaiting-review",
      },
    },
  });
  const ledger = createMutableLedger(entry);
  const leadConnectorClient = createLeadConnectorStub();
  const emailCalls = [];
  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    reviewUrl: "https://maps.app.goo.gl/4u9s7onykNrJEEn99",
    accountInviteEmail: {
      async getStatus() {
        return { configured: true };
      },
      async sendReviewRequest(payload) {
        emailCalls.push(payload);
        return { sentAt: new Date().toISOString() };
      },
    },
  });

  const firstResult = await service.notifyAwaitingReviewRequest({
    entry,
    leadConnectorClient,
  });

  assert.equal(firstResult.customerEmailSent, true);
  assert.equal(firstResult.customerSmsSent, true);
  assert.equal(emailCalls.length, 1);
  assert.equal(leadConnectorClient.calls.length, 1);
  assert.match(leadConnectorClient.calls[0].message, /quick review/i);
  assert.match(leadConnectorClient.calls[0].message, /maps\.app\.goo\.gl\/4u9s7onykNrJEEn99/);
  assert.equal((firstResult.entry.payloadForRetry.adminSms.history || []).length, 1);
  const firstNotificationState = getOrderNotificationState(firstResult.entry);
  assert.ok(firstNotificationState.reviewRequest.emailSentAt);
  assert.ok(firstNotificationState.reviewRequest.smsSentAt);

  const secondResult = await service.notifyAwaitingReviewRequest({
    entry: firstResult.entry,
    leadConnectorClient,
  });
  assert.equal(secondResult.customerEmailSent, false);
  assert.equal(secondResult.customerSmsSent, false);
  assert.equal(emailCalls.length, 1);
  assert.equal(leadConnectorClient.calls.length, 1);
});

test("uses the configured reminder scan limit during reminder sweeps", async () => {
  const scannedLimits = [];
  const ledger = {
    async listEntries(filters = {}) {
      scannedLimits.push(filters.limit);
      return [];
    },
  };
  const leadConnectorClient = createLeadConnectorStub();
  const service = createAutoNotificationService({
    quoteOpsLedger: ledger,
    leadConnectorClient: () => leadConnectorClient,
    reminderScanLimit: 37,
  });

  const result = await service.runClientReminderSweep({
    now: new Date("2026-04-20T10:00:00.000Z"),
    leadConnectorClient,
  });

  assert.deepEqual(scannedLimits, [37]);
  assert.equal(result.inspected, 0);
  assert.equal(result.sent, 0);
});
