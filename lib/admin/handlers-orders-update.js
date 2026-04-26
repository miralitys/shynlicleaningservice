"use strict";

const { syncOrderPayrollSnapshot } = require("../payroll");

const {
  getCleanerConfirmationDisplay,
} = require("../cleaner-confirmation");

function createAdminOrdersUpdateHandlers(deps = {}) {
  const {
    buildOrderStageMutationPayload,
    buildOrdersRedirect,
    buildRecurringOrderSubmission,
    getEntryOrderPolicyAcceptanceData,
    getEntryOrderState,
    getFormValue,
    getFormValues,
    getOrderStatusFromEntry,
    normalizeOrderStatus,
    normalizeString,
    orderPolicyAcceptance,
    redirectWithTiming,
    resolveAssignableStaffIdsByNames,
    sendOrderPolicyAcceptanceInvite,
    staffTravelEstimateService,
    writeJsonWithTiming,
  } = deps;

  async function buildTravelEstimatesForAssignment(entry, assignmentInput, staffStore) {
    if (
      !staffTravelEstimateService ||
      typeof staffTravelEstimateService.buildAssignmentTravelEstimates !== "function" ||
      !staffStore ||
      typeof staffStore.getSnapshot !== "function" ||
      !assignmentInput ||
      !Array.isArray(assignmentInput.staffIds) ||
      assignmentInput.staffIds.length === 0
    ) {
      return [];
    }

    try {
      const staffSnapshot = await staffStore.getSnapshot();
      return await staffTravelEstimateService.buildAssignmentTravelEstimates({
        entry,
        assignment: {
          ...assignmentInput,
          scheduleDate: assignmentInput.scheduleDate || normalizeString(entry && entry.selectedDate, 32),
          scheduleTime: assignmentInput.scheduleTime || normalizeString(entry && entry.selectedTime, 32),
        },
        staffRecords: Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [],
        scheduleDate: normalizeString(entry && entry.selectedDate, 32),
        scheduleTime: normalizeString(entry && entry.selectedTime, 32),
      });
    } catch {
      return [];
    }
  }

  async function handleOrderUpdateAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      entryId,
      returnTo,
      ajaxRequest,
      formBody,
      currentEntry,
      quoteOpsLedger,
      staffStore,
      usersStore,
      googleCalendarIntegration,
      config,
      autoNotificationService,
      leadConnectorClient,
      requestLogger,
    } = context;

    const existingAdminOrder = getEntryOrderState(currentEntry);
    const existingRecurringNextEntryId = normalizeString(existingAdminOrder.recurringNextEntryId, 120);

    const orderUpdates = {};
    const selectedAssignedStaffNames = Object.prototype.hasOwnProperty.call(formBody, "assignedStaff")
      ? getFormValues(formBody, "assignedStaff", 8, 120)
      : null;
    const requestedOrderStatus = getFormValue(formBody, "orderStatus", 40);
    const requestedPolicyStage = normalizeString(requestedOrderStatus, 40).toLowerCase() === "policy";
    if (Object.prototype.hasOwnProperty.call(formBody, "orderStatus")) {
      orderUpdates.orderStatus = requestedPolicyStage ? "scheduled" : requestedOrderStatus;
    }
    let resolvedAssignedStaff = null;
    if (selectedAssignedStaffNames) {
      if (staffStore && typeof staffStore.getSnapshot === "function") {
        resolvedAssignedStaff = await resolveAssignableStaffIdsByNames(
          staffStore,
          usersStore,
          selectedAssignedStaffNames
        );
        orderUpdates.assignedStaff = resolvedAssignedStaff.staffNames.join(", ");
      } else {
        orderUpdates.assignedStaff = selectedAssignedStaffNames.join(", ");
      }
    }
    if (Object.prototype.hasOwnProperty.call(formBody, "paymentStatus")) {
      orderUpdates.paymentStatus = getFormValue(formBody, "paymentStatus", 40);
    }
    if (Object.prototype.hasOwnProperty.call(formBody, "paymentMethod")) {
      orderUpdates.paymentMethod = getFormValue(formBody, "paymentMethod", 40);
    }
    if (Object.prototype.hasOwnProperty.call(formBody, "totalPrice")) {
      orderUpdates.totalPrice = getFormValue(formBody, "totalPrice", 64);
    }
    if (Object.prototype.hasOwnProperty.call(formBody, "selectedDate")) {
      orderUpdates.selectedDate = getFormValue(formBody, "selectedDate", 32);
    }
    if (Object.prototype.hasOwnProperty.call(formBody, "selectedTime")) {
      orderUpdates.selectedTime = getFormValue(formBody, "selectedTime", 32);
    }
    if (Object.prototype.hasOwnProperty.call(formBody, "frequency")) {
      orderUpdates.frequency = getFormValue(formBody, "frequency", 40);
    }

    const previousOrderStatus = getOrderStatusFromEntry(currentEntry);
    const currentPolicyAcceptance =
      typeof getEntryOrderPolicyAcceptanceData === "function" ? getEntryOrderPolicyAcceptanceData(currentEntry) : {};
    let updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, orderUpdates);
    const nextOrderStatus = getOrderStatusFromEntry(updatedEntry);
    const transitionedToScheduled =
      Boolean(updatedEntry) &&
      (requestedPolicyStage || (previousOrderStatus !== "scheduled" && nextOrderStatus === "scheduled"));
    const transitionedToAwaitingReview =
      Boolean(updatedEntry) &&
      previousOrderStatus !== "awaiting-review" &&
      nextOrderStatus === "awaiting-review";
    let assignmentForNotifications = null;

    if (updatedEntry && selectedAssignedStaffNames && staffStore && typeof staffStore.setAssignment === "function") {
      const { snapshot: staffSnapshot, staffIds } =
        resolvedAssignedStaff ||
        (await resolveAssignableStaffIdsByNames(staffStore, usersStore, selectedAssignedStaffNames));
      const existingAssignment =
        staffSnapshot && Array.isArray(staffSnapshot.assignments)
          ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
          : null;

      const assignmentInput = {
        staffIds,
        scheduleDate: existingAssignment
          ? existingAssignment.scheduleDate
          : normalizeString(updatedEntry && updatedEntry.selectedDate, 32),
        scheduleTime: existingAssignment
          ? existingAssignment.scheduleTime
          : normalizeString(updatedEntry && updatedEntry.selectedTime, 32),
        status: existingAssignment && staffIds.length > 0 ? existingAssignment.status : "planned",
        notes: existingAssignment ? existingAssignment.notes : "",
        calendarSync: existingAssignment ? existingAssignment.calendarSync : null,
      };
      const travelEstimates = await buildTravelEstimatesForAssignment(
        updatedEntry,
        assignmentInput,
        staffStore
      );
      await staffStore.setAssignment(entryId, {
        ...assignmentInput,
        travelEstimates,
      });
      assignmentForNotifications =
        (staffStore && typeof staffStore.getSnapshot === "function"
          ? (((await staffStore.getSnapshot()).assignments || []).find((record) => record && record.entryId === entryId) || null)
          : null) || assignmentForNotifications;
    } else if (
      transitionedToScheduled &&
      updatedEntry &&
      staffStore &&
      typeof staffStore.getSnapshot === "function"
    ) {
      const staffSnapshot = await staffStore.getSnapshot();
      assignmentForNotifications = Array.isArray(staffSnapshot.assignments)
        ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
        : null;
    }

    const scheduleChanged =
      Object.prototype.hasOwnProperty.call(formBody, "selectedDate") ||
      Object.prototype.hasOwnProperty.call(formBody, "selectedTime");
    if (
      updatedEntry &&
      !selectedAssignedStaffNames &&
      scheduleChanged &&
      staffStore &&
      typeof staffStore.setAssignment === "function" &&
      assignmentForNotifications &&
      Array.isArray(assignmentForNotifications.staffIds) &&
      assignmentForNotifications.staffIds.length > 0
    ) {
      const travelEstimates = await buildTravelEstimatesForAssignment(
        updatedEntry,
        assignmentForNotifications,
        staffStore
      );
      assignmentForNotifications = await staffStore.setAssignment(entryId, {
        ...assignmentForNotifications,
        travelEstimates,
      });
    }

    if (
      updatedEntry &&
      previousOrderStatus !== "completed" &&
      normalizeOrderStatus(getEntryOrderState(updatedEntry).status, "new") === "completed" &&
      !existingRecurringNextEntryId &&
      typeof buildRecurringOrderSubmission === "function"
    ) {
      const recurringSubmission = buildRecurringOrderSubmission(updatedEntry);
      if (recurringSubmission) {
        const recurringEntry = await quoteOpsLedger.recordSubmission(recurringSubmission);
        if (recurringEntry) {
          const recurringAdminOrder = getEntryOrderState(recurringSubmission.payloadForRetry);
          await quoteOpsLedger.updateOrderEntry(entryId, {
            recurringNextEntryId: recurringEntry.id,
            recurringGeneratedAt: recurringEntry.createdAt,
            recurringSeriesId: normalizeString(recurringAdminOrder.recurringSeriesId, 120),
          });
        }
      }
    }

    if (updatedEntry) {
      updatedEntry = await syncOrderPayrollSnapshot({
        quoteOpsLedger,
        staffStore,
        entry: updatedEntry,
        entryId,
      });
    }

    let notice = updatedEntry ? "order-saved" : "order-missing";
    let calendarSyncFailed = false;
    if (updatedEntry && googleCalendarIntegration && typeof googleCalendarIntegration.syncAssignment === "function") {
      try {
        await googleCalendarIntegration.syncAssignment(entryId, config, updatedEntry);
      } catch {
        calendarSyncFailed = true;
      }
    }

    if (transitionedToScheduled) {
      const enteredScheduledStage =
        Boolean(updatedEntry) &&
        (requestedPolicyStage || (previousOrderStatus !== "scheduled" && nextOrderStatus === "scheduled")) &&
        !currentPolicyAcceptance.policyAccepted;

      let policyEmailState = "";
      if (
        enteredScheduledStage &&
        orderPolicyAcceptance &&
        typeof orderPolicyAcceptance.buildPendingAcceptance === "function"
      ) {
        const inviteResult = await sendOrderPolicyAcceptanceInvite(
          quoteOpsLedger,
          entryId,
          updatedEntry,
          config,
          leadConnectorClient
        );
        updatedEntry = inviteResult.updatedEntry;
        policyEmailState = inviteResult.emailState || "failed";
      }

      if (policyEmailState === "sent") {
        notice = calendarSyncFailed
          ? "order-saved-calendar-policy-email-sent"
          : "order-saved-policy-email-sent";
      } else if (policyEmailState === "sms-only") {
        notice = calendarSyncFailed
          ? "order-saved-calendar-policy-sms-sent"
          : "order-saved-policy-sms-sent";
      } else if (policyEmailState === "failed") {
        notice = calendarSyncFailed
          ? "order-saved-calendar-policy-email-error"
          : "order-saved-policy-email-failed";
      } else if (policyEmailState === "unavailable") {
        notice = "order-saved-policy-email-unavailable";
      } else if (policyEmailState === "missing-recipient") {
        notice = "order-saved-policy-email-missing-recipient";
      } else if (calendarSyncFailed) {
        notice = "order-saved-calendar-error";
      }
    } else if (calendarSyncFailed) {
      notice = "order-saved-calendar-error";
    }

    if (
      updatedEntry &&
      assignmentForNotifications &&
      autoNotificationService &&
      typeof autoNotificationService.notifyScheduledAssignment === "function"
    ) {
      try {
        const notificationResult = await autoNotificationService.notifyScheduledAssignment({
          entry: updatedEntry,
          assignment: assignmentForNotifications,
          leadConnectorClient,
        });
        if (notificationResult && notificationResult.entry) {
          updatedEntry = notificationResult.entry;
        }
      } catch {}
    }

    if (
      updatedEntry &&
      transitionedToAwaitingReview &&
      autoNotificationService &&
      typeof autoNotificationService.notifyAwaitingReviewRequest === "function"
    ) {
      try {
        const reviewNotificationResult = await autoNotificationService.notifyAwaitingReviewRequest({
          entry: updatedEntry,
          leadConnectorClient,
        });
        if (reviewNotificationResult && reviewNotificationResult.entry) {
          updatedEntry = reviewNotificationResult.entry;
        }
      } catch (error) {
        try {
          requestLogger.log({
            ts: new Date().toISOString(),
            type: "review_request_notification_failed",
            entryId,
            message: normalizeString(error && error.message, 300),
          });
        } catch {}
      }
    }

    if (ajaxRequest) {
      const responsePayload = buildOrderStageMutationPayload(updatedEntry, updatedEntry ? notice : "order-missing");
      if (updatedEntry && responsePayload && responsePayload.order) {
        let assignmentForPayload = assignmentForNotifications;
        if (!assignmentForPayload && staffStore && typeof staffStore.getSnapshot === "function") {
          const staffSnapshot = await staffStore.getSnapshot();
          assignmentForPayload = Array.isArray(staffSnapshot.assignments)
            ? staffSnapshot.assignments.find((record) => record && record.entryId === entryId) || null
            : null;
        }
        const cleanerConfirmation =
          assignmentForPayload &&
          normalizeString(responsePayload.order.funnelStatus || responsePayload.order.orderStatus, 40).toLowerCase() === "scheduled"
            ? getCleanerConfirmationDisplay(updatedEntry, assignmentForPayload)
            : null;
        responsePayload.order.cleanerConfirmationLabel = cleanerConfirmation ? cleanerConfirmation.label : "";
        responsePayload.order.cleanerConfirmationTone = cleanerConfirmation ? cleanerConfirmation.tone : "";
        responsePayload.order.showCleanerConfirmation = Boolean(cleanerConfirmation);
      }
      writeJsonWithTiming(
        res,
        updatedEntry ? 200 : 404,
        responsePayload,
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    redirectWithTiming(
      res,
      303,
      buildOrdersRedirect(returnTo, notice),
      requestStartNs,
      requestContext.cacheHit
    );
  }

  return {
    handleOrderUpdateAction,
  };
}

module.exports = {
  createAdminOrdersUpdateHandlers,
};
