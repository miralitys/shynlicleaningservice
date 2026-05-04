"use strict";

const path = require("path");
const { normalizeOrderServiceDurationMinutes } = require("../order-service-duration");

function createAdminOrderMutationDomain(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    cloneSerializable,
    formatAdminScheduleLabel,
    getEntryAdminOrderData,
    getEntryAdminSmsData,
    getEntryCalculatorData,
    getEntryPayload,
    getEntryPaymentData,
    getEntrySmsHistory,
    getOrderFrequency,
    getOrderSelectedDate,
    getOrderSelectedTime,
    getOrderServiceType,
    getOrderServiceDurationMinutes,
    getOrderStatus,
    getPersistedOrderCompletionData,
    isOrderCreatedEntry,
    normalizeAdminOrderDateInput,
    normalizeAdminOrderPriceInput,
    normalizeAdminOrderTimeInput,
    normalizeAdminSmsHistoryEntries,
    normalizeOrderFrequency,
    normalizeOrderPaymentMethod,
    normalizeOrderPaymentStatus,
    normalizeOrderStatus,
    normalizeString,
    setEntryOrderState,
    setEntryPaymentState,
  } = deps;

  function addRecurringScheduleDate(dateValue, frequency) {
    const normalizedDate = normalizeAdminOrderDateInput(dateValue);
    const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";

    const [, year, month, day] = match;
    const nextDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (Number.isNaN(nextDate.getTime())) return "";

    if (frequency === "weekly") {
      nextDate.setUTCDate(nextDate.getUTCDate() + 7);
    } else if (frequency === "biweekly") {
      nextDate.setUTCDate(nextDate.getUTCDate() + 14);
    } else if (frequency === "monthly") {
      nextDate.setUTCMonth(nextDate.getUTCMonth() + 2);
    } else {
      return "";
    }

    const nextYear = String(nextDate.getUTCFullYear());
    const nextMonth = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
    const nextDay = String(nextDate.getUTCDate()).padStart(2, "0");
    return `${nextYear}-${nextMonth}-${nextDay}`;
  }

  function buildRecurringOrderRequestId(seriesId, nextDate) {
    const base = normalizeString(seriesId, 90)
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const dateToken = normalizeString(nextDate, 32).replace(/[^0-9]/g, "");
    const safeBase = base || "recurring-order";
    const safeDateToken = dateToken || Date.now().toString().slice(-8);
    return normalizeString(`${safeBase}-next-${safeDateToken}`, 120);
  }

  function canRepeatOrderService(entry = {}) {
    const normalizedServiceType = normalizeString(getOrderServiceType(entry), 40)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
    return normalizedServiceType === "regular" || normalizedServiceType === "standard";
  }

  function normalizeOrderCompletionAssets(value = [], fallbackKind = "before") {
    const items = Array.isArray(value) ? value : [];
    const normalizedAssets = [];
    const seen = new Set();

    for (const asset of items) {
      if (!asset || typeof asset !== "object") continue;
      const pathValue = normalizeString(asset.path, 500);
      if (!pathValue || seen.has(pathValue)) continue;
      seen.add(pathValue);
      normalizedAssets.push({
        id: normalizeString(asset.id || path.basename(pathValue), 160) || path.basename(pathValue),
        kind: normalizeString(asset.kind, 32).toLowerCase() === "after" ? "after" : fallbackKind,
        path: pathValue,
        fileName:
          normalizeString(asset.fileName || path.basename(pathValue), 180) || path.basename(pathValue),
        contentType: normalizeString(asset.contentType, 160) || "image/jpeg",
        sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
        uploadedAt: normalizeString(asset.uploadedAt, 80),
      });
      if (normalizedAssets.length >= 40) break;
    }

    return normalizedAssets;
  }

  function normalizeOrderChecklistItems(value = []) {
    const items = Array.isArray(value) ? value : [];
    const normalizedItems = [];
    const seen = new Set();

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = normalizeString(item.id, 120);
      const label = normalizeString(item.label, 240);
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      normalizedItems.push({
        id,
        label,
        hint: normalizeString(item.hint, 240),
        completed: Boolean(item.completed),
        updatedAt: normalizeString(item.updatedAt, 80),
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : normalizedItems.length,
      });
      if (normalizedItems.length >= 80) break;
    }

    return normalizedItems.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.id.localeCompare(right.id);
    });
  }

  function normalizeOrderCleanerComments(value = [], fallbackComment = "") {
    const items = Array.isArray(value) ? value : [];
    const normalizedComments = [];
    const seen = new Set();

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const text = normalizeString(item.text || item.comment || item.body, 1000);
      if (!text) continue;
      const createdAt = normalizeString(item.createdAt || item.updatedAt, 80);
      const id =
        normalizeString(item.id, 120) ||
        normalizeString(`${createdAt || "comment"}-${text.slice(0, 32)}`, 120) ||
        `cleaner-comment-${normalizedComments.length + 1}`;
      const key = `${id}::${createdAt}::${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalizedComments.push({
        id,
        text,
        authorName: normalizeString(item.authorName || item.author || item.staffName, 120),
        authorEmail: normalizeString(item.authorEmail || item.email, 250).toLowerCase(),
        authorId: normalizeString(item.authorId || item.staffId || item.userId, 120),
        source: normalizeString(item.source, 40),
        createdAt,
      });
      if (normalizedComments.length >= 80) break;
    }

    if (normalizedComments.length === 0) {
      const legacyText = normalizeString(fallbackComment, 1000);
      if (legacyText) {
        normalizedComments.push({
          id: "legacy-cleaner-comment",
          text: legacyText,
          authorName: "",
          authorEmail: "",
          authorId: "",
          source: "legacy",
          createdAt: "",
        });
      }
    }

    return normalizedComments;
  }

  function buildCleanerCommentSummary(comments = []) {
    const text = (Array.isArray(comments) ? comments : [])
      .map((comment) => normalizeString(comment && comment.text, 1000))
      .filter(Boolean)
      .join("\n\n");
    if (text.length <= 4000) return text;
    return text.slice(text.length - 4000);
  }

  function normalizeOrderNotifications(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return cloneSerializable(value, {});
  }

  function getEntryOrderCompletionData(entry = {}) {
    const completion = getPersistedOrderCompletionData(entry);
    const cleanerComment = normalizeString(completion.cleanerComment, 4000);
    return {
      cleanerComment,
      cleanerComments: normalizeOrderCleanerComments(completion.cleanerComments, cleanerComment),
      checklistItems: normalizeOrderChecklistItems(completion.checklistItems),
      beforePhotos: normalizeOrderCompletionAssets(completion.beforePhotos, "before"),
      afterPhotos: normalizeOrderCompletionAssets(completion.afterPhotos, "after"),
      photosSkipped: Boolean(completion.photosSkipped),
      photosSkippedAt: normalizeString(completion.photosSkippedAt, 80),
      updatedAt: normalizeString(completion.updatedAt, 80),
    };
  }

  function applyOrderEntryUpdates(entry, updates = {}) {
    if (!entry || typeof entry !== "object") return null;

    const payload = {
      ...getEntryPayload(entry),
    };
    const calculatorData = {
      ...getEntryCalculatorData(entry),
    };
    const currentAdminOrder = getEntryAdminOrderData(entry);
    const adminOrder = {
      ...currentAdminOrder,
    };
    const currentCompletion = getEntryOrderCompletionData(entry);
    const currentPayment = getEntryPaymentData(entry);
    const timestamp = new Date().toISOString();
    const removeOrder = Boolean(updates.removeOrder);
    const hasExplicitOrderUpdates = Object.keys(updates).some(
      (key) => key !== "removeOrder" && key !== "createOrder"
    );
    const shouldCreateOrder =
      Boolean(updates.createOrder) || hasExplicitOrderUpdates || isOrderCreatedEntry(entry);

    if (removeOrder) {
      entry.updatedAt = timestamp;
      entry.payloadForRetry = payload;
      setEntryOrderState(entry, null);
      return entry;
    }

    const hasSelectedDate = Object.prototype.hasOwnProperty.call(updates, "selectedDate");
    const hasSelectedTime = Object.prototype.hasOwnProperty.call(updates, "selectedTime");
    const hasFrequency = Object.prototype.hasOwnProperty.call(updates, "frequency");
    const hasAssignedStaff = Object.prototype.hasOwnProperty.call(updates, "assignedStaff");
    const hasPaymentStatus = Object.prototype.hasOwnProperty.call(updates, "paymentStatus");
    const hasPaymentMethod = Object.prototype.hasOwnProperty.call(updates, "paymentMethod");
    const hasTotalPrice = Object.prototype.hasOwnProperty.call(updates, "totalPrice");
    const hasServiceDurationMinutes = Object.prototype.hasOwnProperty.call(updates, "serviceDurationMinutes");
    const hasCleanerComment = Object.prototype.hasOwnProperty.call(updates, "cleanerComment");
    const hasCleanerComments =
      Object.prototype.hasOwnProperty.call(updates, "cleanerComments") ||
      Object.prototype.hasOwnProperty.call(updates, "completionCleanerComments");
    const hasChecklistItems = Object.prototype.hasOwnProperty.call(updates, "completionChecklistItems");
    const hasBeforePhotos = Object.prototype.hasOwnProperty.call(updates, "completionBeforePhotos");
    const hasAfterPhotos = Object.prototype.hasOwnProperty.call(updates, "completionAfterPhotos");
    const hasPhotosSkipped = Object.prototype.hasOwnProperty.call(updates, "completionPhotosSkipped");
    const hasPolicyAcceptance = Object.prototype.hasOwnProperty.call(updates, "policyAcceptance");
    const hasContactId = Object.prototype.hasOwnProperty.call(updates, "contactId");
    const hasSmsHistory = Object.prototype.hasOwnProperty.call(updates, "smsHistory");
    const hasRecurringNextEntryId = Object.prototype.hasOwnProperty.call(updates, "recurringNextEntryId");
    const hasRecurringGeneratedAt = Object.prototype.hasOwnProperty.call(updates, "recurringGeneratedAt");
    const hasRecurringSeriesId = Object.prototype.hasOwnProperty.call(updates, "recurringSeriesId");
    const hasCleanerConfirmation = Object.prototype.hasOwnProperty.call(updates, "cleanerConfirmation");
    const hasPayroll = Object.prototype.hasOwnProperty.call(updates, "payroll");
    const hasNotifications = Object.prototype.hasOwnProperty.call(updates, "notifications");

    const selectedDate = hasSelectedDate
      ? normalizeAdminOrderDateInput(updates.selectedDate)
      : normalizeAdminOrderDateInput(adminOrder.selectedDate || entry.selectedDate || calculatorData.selectedDate);
    const selectedTime = hasSelectedTime
      ? normalizeAdminOrderTimeInput(updates.selectedTime)
      : normalizeAdminOrderTimeInput(adminOrder.selectedTime || entry.selectedTime || calculatorData.selectedTime);
    const requestedFrequency = hasFrequency
      ? normalizeOrderFrequency(updates.frequency, "")
      : normalizeOrderFrequency(adminOrder.frequency || calculatorData.frequency, "");
    const frequency = canRepeatOrderService(entry) ? requestedFrequency : "";
    const assignedStaff = hasAssignedStaff
      ? normalizeString(updates.assignedStaff, 500)
      : normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 500);
    const paymentStatus = hasPaymentStatus
      ? normalizeOrderPaymentStatus(updates.paymentStatus, "unpaid")
      : normalizeOrderPaymentStatus(adminOrder.paymentStatus || currentPayment.status, "unpaid");
    const paymentMethod = hasPaymentMethod
      ? normalizeOrderPaymentMethod(updates.paymentMethod, "")
      : normalizeOrderPaymentMethod(adminOrder.paymentMethod || currentPayment.method, "");
    const currentTotalPrice = normalizeAdminOrderPriceInput(
      calculatorData.totalPrice === 0 || calculatorData.totalPrice ? calculatorData.totalPrice : entry.totalPrice,
      Number.isFinite(Number(entry.totalPrice)) ? Number(entry.totalPrice) : 0
    );
    const totalPrice = hasTotalPrice
      ? normalizeAdminOrderPriceInput(updates.totalPrice, currentTotalPrice)
      : currentTotalPrice;
    const totalPriceCents = Math.round(Number(totalPrice || 0) * 100);
    const serviceDurationMinutes = hasServiceDurationMinutes
      ? normalizeOrderServiceDurationMinutes(updates.serviceDurationMinutes, getOrderServiceDurationMinutes(entry))
      : normalizeOrderServiceDurationMinutes(getOrderServiceDurationMinutes(entry), 0);
    const orderStatus = normalizeOrderStatus(
      updates.orderStatus,
      normalizeOrderStatus(adminOrder.status, "") || (shouldCreateOrder ? getOrderStatus(entry) : "new")
    );
    const requestedCleanerComment = hasCleanerComment
      ? normalizeString(updates.cleanerComment, 4000)
      : currentCompletion.cleanerComment;
    const cleanerComments = hasCleanerComments
      ? normalizeOrderCleanerComments(updates.completionCleanerComments || updates.cleanerComments, requestedCleanerComment)
      : hasCleanerComment
        ? normalizeOrderCleanerComments(
            requestedCleanerComment
              ? [
                  {
                    id: `admin-cleaner-comment-${Date.now()}`,
                    text: requestedCleanerComment,
                    source: "admin",
                    createdAt: timestamp,
                  },
                ]
              : [],
            ""
          )
        : normalizeOrderCleanerComments(currentCompletion.cleanerComments, requestedCleanerComment);
    const cleanerComment = requestedCleanerComment || buildCleanerCommentSummary(cleanerComments);
    const checklistItems = hasChecklistItems
      ? normalizeOrderChecklistItems(updates.completionChecklistItems)
      : currentCompletion.checklistItems;
    const beforePhotos = hasBeforePhotos
      ? normalizeOrderCompletionAssets(updates.completionBeforePhotos, "before")
      : currentCompletion.beforePhotos;
    const afterPhotos = hasAfterPhotos
      ? normalizeOrderCompletionAssets(updates.completionAfterPhotos, "after")
      : currentCompletion.afterPhotos;
    const photosSkipped = hasPhotosSkipped
      ? Boolean(updates.completionPhotosSkipped)
      : currentCompletion.photosSkipped;
    const photosSkippedAt = photosSkipped
      ? normalizeString(updates.completionPhotosSkippedAt || currentCompletion.photosSkippedAt || timestamp, 80)
      : "";
    const currentPolicyAcceptance =
      adminOrder.policyAcceptance && typeof adminOrder.policyAcceptance === "object"
        ? adminOrder.policyAcceptance
        : {};
    const currentCleanerConfirmation =
      adminOrder.cleanerConfirmation && typeof adminOrder.cleanerConfirmation === "object"
        ? adminOrder.cleanerConfirmation
        : {};

    entry.selectedDate = selectedDate;
    entry.selectedTime = selectedTime;
    entry.totalPrice = Number(totalPrice || 0);
    entry.totalPriceCents = totalPriceCents;
    entry.serviceDurationMinutes = serviceDurationMinutes;
    entry.updatedAt = timestamp;
    if (hasContactId) {
      entry.contactId = normalizeString(updates.contactId, 120);
    }

    calculatorData.selectedDate = selectedDate;
    calculatorData.selectedTime = selectedTime;
    calculatorData.totalPrice = Number(totalPrice || 0);
    calculatorData.totalPriceCents = totalPriceCents;
    calculatorData.serviceDurationMinutes = serviceDurationMinutes;
    if (frequency) {
      calculatorData.frequency = frequency;
    } else {
      delete calculatorData.frequency;
    }

    adminOrder.status = orderStatus;
    adminOrder.isCreated = Boolean(shouldCreateOrder);
    adminOrder.frequency = frequency;
    adminOrder.assignedStaff = assignedStaff;
    adminOrder.paymentStatus = paymentStatus;
    if (paymentMethod) {
      adminOrder.paymentMethod = paymentMethod;
    } else {
      delete adminOrder.paymentMethod;
    }
    adminOrder.totalPrice = Number(totalPrice || 0);
    adminOrder.selectedDate = selectedDate;
    adminOrder.selectedTime = selectedTime;
    adminOrder.serviceDurationMinutes = serviceDurationMinutes;
    adminOrder.updatedAt = timestamp;
    if (!adminOrder.createdAt) adminOrder.createdAt = timestamp;
    if (hasRecurringNextEntryId) {
      const recurringNextEntryId = normalizeString(updates.recurringNextEntryId, 120);
      if (recurringNextEntryId) {
        adminOrder.recurringNextEntryId = recurringNextEntryId;
      } else {
        delete adminOrder.recurringNextEntryId;
      }
    }
    if (hasRecurringGeneratedAt) {
      const recurringGeneratedAt = normalizeString(updates.recurringGeneratedAt, 80);
      if (recurringGeneratedAt) {
        adminOrder.recurringGeneratedAt = recurringGeneratedAt;
      } else {
        delete adminOrder.recurringGeneratedAt;
      }
    }
    if (hasRecurringSeriesId) {
      const recurringSeriesId = normalizeString(updates.recurringSeriesId, 120);
      if (recurringSeriesId) {
        adminOrder.recurringSeriesId = recurringSeriesId;
      } else {
        delete adminOrder.recurringSeriesId;
      }
    }

    if (
      cleanerComment ||
      cleanerComments.length > 0 ||
      checklistItems.length > 0 ||
      beforePhotos.length > 0 ||
      afterPhotos.length > 0 ||
      photosSkipped
    ) {
      adminOrder.completion = {
        cleanerComment,
        cleanerComments,
        checklistItems,
        beforePhotos,
        afterPhotos,
        photosSkipped,
        photosSkippedAt,
        updatedAt: timestamp,
      };
    } else {
      delete adminOrder.completion;
    }

    if (hasPolicyAcceptance) {
      if (updates.policyAcceptance && typeof updates.policyAcceptance === "object") {
        adminOrder.policyAcceptance = { ...updates.policyAcceptance };
        adminOrder.policyAccepted = Boolean(updates.policyAcceptance.policyAccepted);
      } else {
        delete adminOrder.policyAcceptance;
        delete adminOrder.policyAccepted;
      }
    } else if (Object.keys(currentPolicyAcceptance).length > 0) {
      adminOrder.policyAcceptance = { ...currentPolicyAcceptance };
      adminOrder.policyAccepted = Boolean(
        adminOrder.policyAccepted || currentPolicyAcceptance.policyAccepted
      );
    } else {
      delete adminOrder.policyAcceptance;
      delete adminOrder.policyAccepted;
    }

    if (hasCleanerConfirmation) {
      if (updates.cleanerConfirmation && typeof updates.cleanerConfirmation === "object") {
        adminOrder.cleanerConfirmation = cloneSerializable(updates.cleanerConfirmation, {});
      } else {
        delete adminOrder.cleanerConfirmation;
      }
    } else if (Object.keys(currentCleanerConfirmation).length > 0) {
      adminOrder.cleanerConfirmation = cloneSerializable(currentCleanerConfirmation, {});
    } else {
      delete adminOrder.cleanerConfirmation;
    }

    if (hasPayroll) {
      if (updates.payroll && typeof updates.payroll === "object") {
        adminOrder.payroll = cloneSerializable(updates.payroll, {});
      } else {
        delete adminOrder.payroll;
      }
    }

    if (hasNotifications) {
      const nextNotifications = normalizeOrderNotifications(updates.notifications);
      if (Object.keys(nextNotifications).length > 0) {
        adminOrder.notifications = nextNotifications;
      } else {
        delete adminOrder.notifications;
      }
    }

    payload.calculatorData = calculatorData;
    const smsHistory = hasSmsHistory
      ? normalizeAdminSmsHistoryEntries(updates.smsHistory, timestamp)
      : getEntrySmsHistory(entry);
    if (smsHistory.length > 0) {
      payload.adminSms = {
        ...getEntryAdminSmsData(entry),
        history: smsHistory,
        updatedAt: timestamp,
      };
    } else {
      delete payload.adminSms;
    }
    entry.payloadForRetry = payload;
    setEntryOrderState(entry, adminOrder);

    return entry;
  }

  function applyPaymentEntryUpdates(entry, updates = {}) {
    if (!entry || typeof entry !== "object") return null;

    const payload = {
      ...getEntryPayload(entry),
    };
    const currentPayment = getEntryPaymentData(entry);
    const payment = {
      ...currentPayment,
    };
    const currentAdminOrder = getEntryAdminOrderData(entry);
    const hasAdminOrder =
      currentAdminOrder &&
      typeof currentAdminOrder === "object" &&
      Object.keys(currentAdminOrder).length > 0;
    const adminOrder = hasAdminOrder ? { ...currentAdminOrder } : null;
    const timestamp = new Date().toISOString();
    const paymentStatus = normalizeOrderPaymentStatus(
      updates.paymentStatus || updates.status || payment.status,
      normalizeOrderPaymentStatus(payment.status, "unpaid")
    );
    const paymentMethod = normalizeOrderPaymentMethod(
      updates.paymentMethod || updates.method || payment.method,
      normalizeOrderPaymentMethod(payment.method, "")
    );
    const provider = normalizeString(updates.provider || payment.provider, 40).toLowerCase();
    const sessionId = normalizeString(
      updates.stripeSessionId || updates.sessionId || payment.stripeSessionId || payment.sessionId,
      160
    );
    const paymentIntentId = normalizeString(
      updates.stripePaymentIntentId ||
        updates.paymentIntentId ||
        payment.stripePaymentIntentId ||
        payment.paymentIntentId,
      160
    );
    const customerEmail = normalizeString(updates.customerEmail || payment.customerEmail, 250).toLowerCase();
    const currency = normalizeString(updates.currency || payment.currency, 12).toLowerCase();
    const eventId = normalizeString(updates.eventId || payment.eventId, 160);
    const eventType = normalizeString(updates.eventType || payment.eventType, 120);
    const rawPaymentStatus = normalizeString(
      updates.rawPaymentStatus || payment.rawPaymentStatus,
      40
    ).toLowerCase();
    const receivedAt = normalizeString(updates.receivedAt || payment.receivedAt, 80) || timestamp;
    const amountTotalCents = Number.isFinite(Number(updates.amountTotalCents))
      ? Number(updates.amountTotalCents)
      : Number.isFinite(Number(payment.amountTotalCents))
        ? Number(payment.amountTotalCents)
        : 0;

    payment.status = paymentStatus;
    if (paymentMethod) {
      payment.method = paymentMethod;
    } else {
      delete payment.method;
    }
    if (provider) {
      payment.provider = provider;
    } else {
      delete payment.provider;
    }
    if (sessionId) {
      payment.stripeSessionId = sessionId;
    } else {
      delete payment.stripeSessionId;
    }
    if (paymentIntentId) {
      payment.stripePaymentIntentId = paymentIntentId;
    } else {
      delete payment.stripePaymentIntentId;
    }
    if (customerEmail) {
      payment.customerEmail = customerEmail;
    } else {
      delete payment.customerEmail;
    }
    if (currency) {
      payment.currency = currency;
    } else {
      delete payment.currency;
    }
    if (eventId) {
      payment.eventId = eventId;
    } else {
      delete payment.eventId;
    }
    if (eventType) {
      payment.eventType = eventType;
    } else {
      delete payment.eventType;
    }
    if (rawPaymentStatus) {
      payment.rawPaymentStatus = rawPaymentStatus;
    } else {
      delete payment.rawPaymentStatus;
    }
    if (amountTotalCents > 0) {
      payment.amountTotalCents = amountTotalCents;
      payment.amountTotal = Number((amountTotalCents / 100).toFixed(2));
    } else {
      delete payment.amountTotalCents;
      delete payment.amountTotal;
    }
    payment.receivedAt = receivedAt;
    payment.updatedAt = timestamp;

    if (adminOrder) {
      adminOrder.paymentStatus = paymentStatus;
      if (paymentMethod) {
        adminOrder.paymentMethod = paymentMethod;
      } else {
        delete adminOrder.paymentMethod;
      }
      adminOrder.updatedAt = timestamp;
    }

    entry.updatedAt = timestamp;
    entry.payloadForRetry = payload;
    setEntryPaymentState(entry, payment);
    if (adminOrder) {
      setEntryOrderState(entry, adminOrder);
    }
    return entry;
  }

  function buildRecurringOrderSubmission(entry = {}) {
    if (!entry || typeof entry !== "object") return null;

    const frequency = getOrderFrequency(entry);
    if (!frequency) return null;

    const selectedDate = getOrderSelectedDate(entry);
    const nextSelectedDate = addRecurringScheduleDate(selectedDate, frequency);
    if (!nextSelectedDate) return null;

    const selectedTime = normalizeAdminOrderTimeInput(getOrderSelectedTime(entry));
    const payload = cloneSerializable(getEntryPayload(entry), {});
    const calculatorData =
      payload && payload.calculatorData && typeof payload.calculatorData === "object"
        ? payload.calculatorData
        : {};
    const currentAdminOrder = getEntryAdminOrderData(entry);
    const timestamp = new Date().toISOString();
    const recurringSeriesId = normalizeString(
      currentAdminOrder.recurringSeriesId || currentAdminOrder.recurringSourceRequestId || entry.requestId || entry.id,
      120
    );
    const totalPrice = normalizeAdminOrderPriceInput(entry.totalPrice, 0) || 0;
    const totalPriceCents = Math.round(totalPrice * 100);
    const serviceDurationMinutes = normalizeOrderServiceDurationMinutes(
      getOrderServiceDurationMinutes(entry),
      0
    );

    delete payload.adminLead;
    calculatorData.selectedDate = nextSelectedDate;
    calculatorData.selectedTime = selectedTime;
    calculatorData.formattedDateTime = formatAdminScheduleLabel(nextSelectedDate, selectedTime);
    calculatorData.totalPrice = totalPrice;
    calculatorData.totalPriceCents = totalPriceCents;
    calculatorData.serviceDurationMinutes = serviceDurationMinutes;
    if (frequency) {
      calculatorData.frequency = frequency;
    } else {
      delete calculatorData.frequency;
    }
    payload.calculatorData = calculatorData;
    const nextOrderState = {
      isCreated: true,
      status: "new",
      frequency,
      assignedStaff: "",
      paymentStatus: "unpaid",
      totalPrice,
      selectedDate: nextSelectedDate,
      selectedTime,
      serviceDurationMinutes,
      createdAt: timestamp,
      updatedAt: timestamp,
      recurringSeriesId,
      recurringSourceEntryId: normalizeString(entry.id, 120),
      recurringSourceRequestId: normalizeString(entry.requestId, 120),
    };
    payload.orderState = cloneSerializable(nextOrderState, {});
    payload.adminOrder = cloneSerializable(nextOrderState, {});

    return {
      ok: true,
      requestId: buildRecurringOrderRequestId(recurringSeriesId, nextSelectedDate),
      sourceRoute: ADMIN_ORDERS_PATH,
      source: "Recurring order automation",
      customerName: normalizeString(entry.customerName, 250),
      customerPhone: normalizeString(entry.customerPhone, 80),
      customerEmail: normalizeString(entry.customerEmail, 250),
      serviceType: getOrderServiceType(entry),
      serviceName: normalizeString(entry.serviceName, 120),
      totalPrice,
      totalPriceCents,
      selectedDate: nextSelectedDate,
      selectedTime,
      fullAddress: normalizeString(entry.fullAddress || calculatorData.fullAddress || calculatorData.address, 500),
      httpStatus: 200,
      code: "RECURRING_ORDER_CREATED",
      retryable: false,
      warnings: [],
      errorMessage: "",
      contactId: normalizeString(entry.contactId, 120),
      noteCreated: Boolean(entry.noteCreated),
      opportunityCreated: Boolean(entry.opportunityCreated),
      customFieldsUpdated: Boolean(entry.customFieldsUpdated),
      usedExistingContact: Boolean(entry.usedExistingContact || entry.contactId),
      payloadForRetry: payload,
    };
  }

  return {
    applyOrderEntryUpdates,
    applyPaymentEntryUpdates,
    buildRecurringOrderSubmission,
    getEntryOrderCompletionData,
  };
}

module.exports = {
  createAdminOrderMutationDomain,
};
