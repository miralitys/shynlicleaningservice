"use strict";

const { syncOrderPayrollSnapshot } = require("../payroll");

function createAdminStaffAssignmentPostHandlers(deps = {}) {
  const {
    buildStaffRedirect,
    collectNonAssignableStaffIds,
    getFormValue,
    getFormValues,
    getEntryCalculatorData,
    getOrderSelectedDate,
    getOrderSelectedTime,
    normalizeAdminOrderDateInput,
    normalizeAdminOrderTimeInput,
    normalizeString,
    redirectWithTiming,
    staffTravelEstimateService,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = deps;

  async function buildTravelEstimatesForAssignment(entry, assignmentInput, staffStore, scheduleFallback = {}) {
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
          scheduleDate: assignmentInput.scheduleDate || scheduleFallback.scheduleDate,
          scheduleTime: assignmentInput.scheduleTime || scheduleFallback.scheduleTime,
        },
        staffRecords: Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [],
        scheduleDate: scheduleFallback.scheduleDate,
        scheduleTime: scheduleFallback.scheduleTime,
      });
    } catch {
      return [];
    }
  }

  async function handleStaffAssignmentPostAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      action,
      formBody,
      ajaxRequest,
      config,
      staffStore,
      usersStore,
      quoteOpsLedger,
      leadConnectorClient,
      autoNotificationService,
      googleCalendarIntegration,
    } = context;

    if (action === "save-assignment") {
      const entryId = getFormValue(formBody, "entryId", 120);
      const entry = quoteOpsLedger ? await quoteOpsLedger.getEntry(entryId) : null;
      if (!entry) {
        if (ajaxRequest) {
          writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 404);
          return true;
        }
        redirectWithTiming(
          res,
          303,
          buildStaffRedirect("staff-failed"),
          requestStartNs,
          requestContext.cacheHit
        );
        return true;
      }

      const assignmentInput = {
        staffIds: getFormValues(formBody, "staffIds", 6, 120),
        scheduleDate: getFormValue(formBody, "scheduleDate", 32),
        scheduleTime: getFormValue(formBody, "scheduleTime", 32),
        status: getFormValue(formBody, "status", 32),
        notes: getFormValue(formBody, "notes", 800),
      };
      const normalizeScheduleDateValue =
        typeof normalizeAdminOrderDateInput === "function"
          ? normalizeAdminOrderDateInput
          : (value) => normalizeString(value, 32);
      const normalizeScheduleTimeValue =
        typeof normalizeAdminOrderTimeInput === "function"
          ? normalizeAdminOrderTimeInput
          : (value) => normalizeString(value, 32);
      const orderScheduleDate = normalizeScheduleDateValue(
        typeof getOrderSelectedDate === "function"
          ? getOrderSelectedDate(entry)
          : entry && entry.selectedDate
            ? entry.selectedDate
            : typeof getEntryCalculatorData === "function"
              ? getEntryCalculatorData(entry).selectedDate
              : ""
      );
      const orderScheduleTime = normalizeScheduleTimeValue(
        typeof getOrderSelectedTime === "function"
          ? getOrderSelectedTime(entry)
          : entry && entry.selectedTime
            ? entry.selectedTime
            : typeof getEntryCalculatorData === "function"
              ? getEntryCalculatorData(entry).selectedTime
              : ""
      );
      assignmentInput.scheduleDate = normalizeScheduleDateValue(assignmentInput.scheduleDate);
      assignmentInput.scheduleTime = normalizeScheduleTimeValue(assignmentInput.scheduleTime);
      if (assignmentInput.scheduleDate && assignmentInput.scheduleDate === orderScheduleDate) {
        assignmentInput.scheduleDate = "";
      }
      if (assignmentInput.scheduleTime && assignmentInput.scheduleTime === orderScheduleTime) {
        assignmentInput.scheduleTime = "";
      }
      if (usersStore && assignmentInput.staffIds.length > 0) {
        const usersSnapshot =
          typeof usersStore.getSnapshot === "function" ? await usersStore.getSnapshot() : { users: [] };
        const adminStaffIds = collectNonAssignableStaffIds(usersSnapshot.users);
        assignmentInput.staffIds = assignmentInput.staffIds.filter((staffId) => !adminStaffIds.has(staffId));
      }

      if (
        googleCalendarIntegration &&
        typeof googleCalendarIntegration.findAssignmentConflicts === "function" &&
        assignmentInput.staffIds.length > 0
      ) {
        const conflicts = await googleCalendarIntegration.findAssignmentConflicts({
          entry,
          assignmentInput,
          config,
        });
        if (conflicts.length > 0) {
          if (ajaxRequest) {
            writeAjaxMutationError(res, requestStartNs, requestContext, "assignment-conflict", 409, {
              staff: conflicts.map((item) => item.name).join(", "),
            });
            return true;
          }
          redirectWithTiming(
            res,
            303,
            buildStaffRedirect("assignment-conflict", {
              staff: conflicts.map((item) => item.name).join(", "),
            }),
            requestStartNs,
            requestContext.cacheHit
          );
          return true;
        }
      }

      const travelEstimates = await buildTravelEstimatesForAssignment(
        entry,
        assignmentInput,
        staffStore,
        {
          scheduleDate: orderScheduleDate,
          scheduleTime: orderScheduleTime,
        }
      );

      const savedAssignment = await staffStore.setAssignment(entryId, {
        ...assignmentInput,
        travelEstimates,
      });
      await syncOrderPayrollSnapshot({
        quoteOpsLedger,
        staffStore,
        entry,
        entryId,
      });

      let notice = "assignment-saved";
      if (googleCalendarIntegration && typeof googleCalendarIntegration.syncAssignment === "function") {
        try {
          await googleCalendarIntegration.syncAssignment(entryId, config, entry);
        } catch {
          notice = "assignment-saved-calendar-error";
        }
      }
      if (
        autoNotificationService &&
        typeof autoNotificationService.notifyScheduledAssignment === "function" &&
        savedAssignment
      ) {
        try {
          await autoNotificationService.notifyScheduledAssignment({
            entry,
            assignment: savedAssignment,
            leadConnectorClient,
          });
        } catch {}
      }
      if (ajaxRequest) {
        writeAjaxMutationSuccess(res, requestStartNs, requestContext, notice);
        return true;
      }
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect(notice),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action !== "clear-assignment") {
      return false;
    }

    if (googleCalendarIntegration && typeof googleCalendarIntegration.clearAssignmentEvents === "function") {
      try {
        await googleCalendarIntegration.clearAssignmentEvents(getFormValue(formBody, "entryId", 120), config);
      } catch {}
    }
    await staffStore.clearAssignment(getFormValue(formBody, "entryId", 120));
    redirectWithTiming(
      res,
      303,
      buildStaffRedirect("assignment-cleared"),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleStaffAssignmentPostAction,
  };
}

module.exports = {
  createAdminStaffAssignmentPostHandlers,
};
