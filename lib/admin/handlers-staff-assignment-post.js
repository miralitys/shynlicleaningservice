"use strict";

function createAdminStaffAssignmentPostHandlers(deps = {}) {
  const {
    buildStaffRedirect,
    collectNonAssignableStaffIds,
    getFormValue,
    getFormValues,
    normalizeString,
    redirectWithTiming,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
  } = deps;

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

      const savedAssignment = await staffStore.setAssignment(entryId, {
        ...assignmentInput,
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
