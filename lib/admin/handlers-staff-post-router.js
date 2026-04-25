"use strict";

const { createAdminStaffAssignmentPostHandlers } = require("./handlers-staff-assignment-post");
const { createAdminStaffCalendarPostHandlers } = require("./handlers-staff-calendar-post");
const { createAdminStaffOnboardingPostHandlers } = require("./handlers-staff-onboarding-post");
const { createAdminStaffRecordsPostHandlers } = require("./handlers-staff-records-post");
const { createAdminStaffSmsPostHandlers } = require("./handlers-staff-sms-post");

function createAdminStaffPostHandlers(deps = {}) {
  const {
    buildStaffRedirect,
    collectNonAssignableStaffIds,
    ensureWorkspaceAccess,
    getFormValue,
    isAjaxMutationRequest,
    normalizeString,
    parseFormBody,
    readTextBody,
    redirectWithTiming,
    writeAjaxMutationError,
  } = deps;
  const { handleStaffCalendarPostAction } = createAdminStaffCalendarPostHandlers(deps);
  const { handleStaffSmsPostAction } = createAdminStaffSmsPostHandlers(deps);
  const { handleStaffRecordsPostAction } = createAdminStaffRecordsPostHandlers({
    ...deps,
    writeAjaxMutationSuccess: deps.writeAjaxMutationSuccess,
  });
  const { handleStaffOnboardingPostAction } = createAdminStaffOnboardingPostHandlers(deps);
  const { handleStaffAssignmentPostAction } = createAdminStaffAssignmentPostHandlers(deps);

  async function handleStaffPostRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      config,
      currentUserAccess,
      challenge,
      staffStore,
      usersStore,
      quoteOpsLedger,
      leadConnectorClient,
      autoNotificationService,
      googleCalendarIntegration,
    } = context;

    if (
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireWrite: true,
      })
    ) {
      return true;
    }

    const formBody = parseFormBody(await readTextBody(req, 12 * 1024));
    const action = getFormValue(formBody, "action", 80).toLowerCase();
    const ajaxRequest = isAjaxMutationRequest(req);
    if (
      action === "delete-staff" &&
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge, {
        requireDelete: true,
      })
    ) {
      return true;
    }

    if (!staffStore) {
      if (ajaxRequest) {
        writeAjaxMutationError(res, requestStartNs, requestContext, "staff-failed", 500);
        return true;
      }
      redirectWithTiming(res, 303, buildStaffRedirect("staff-failed"), requestStartNs, requestContext.cacheHit);
      return true;
    }

    try {
      if (
        await handleStaffCalendarPostAction({
          ...context,
          res,
          requestStartNs,
          requestContext,
          action,
          formBody,
          staffStore,
          googleCalendarIntegration,
          config,
        })
      ) {
        return true;
      }

      if (
        await handleStaffSmsPostAction({
          ...context,
          res,
          requestStartNs,
          requestContext,
          action,
          formBody,
          ajaxRequest,
          staffStore,
          leadConnectorClient,
        })
      ) {
        return true;
      }

      if (
        await handleStaffRecordsPostAction({
          ...context,
          res,
          requestStartNs,
          requestContext,
          action,
          formBody,
          ajaxRequest,
          staffStore,
          usersStore,
          googleCalendarIntegration,
          config,
        })
      ) {
        return true;
      }

      if (
        await handleStaffOnboardingPostAction({
          ...context,
          res,
          requestStartNs,
          requestContext,
          action,
          formBody,
          config,
          staffStore,
          usersStore,
          leadConnectorClient,
        })
      ) {
        return true;
      }

      if (
        await handleStaffAssignmentPostAction({
          ...context,
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
        })
      ) {
        return true;
      }
    } catch {}

    redirectWithTiming(
      res,
      303,
      buildStaffRedirect("staff-failed"),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleStaffPostRoute,
  };
}

module.exports = {
  createAdminStaffPostHandlers,
};
