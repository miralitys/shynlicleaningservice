"use strict";

function createAdminStaffCalendarPostHandlers(deps = {}) {
  const {
    buildStaffRedirect,
    getFormValue,
    redirectWithTiming,
  } = deps;

  async function handleStaffCalendarPostAction(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      action,
      formBody,
      staffStore,
      googleCalendarIntegration,
      config,
    } = context;

    if (action !== "disconnect-google-calendar") {
      return false;
    }

    if (googleCalendarIntegration && typeof googleCalendarIntegration.disconnectStaffCalendar === "function") {
      await googleCalendarIntegration.disconnectStaffCalendar(getFormValue(formBody, "staffId", 120), config);
    } else {
      await staffStore.updateStaff(getFormValue(formBody, "staffId", 120), {
        calendar: null,
      });
    }
    redirectWithTiming(
      res,
      303,
      buildStaffRedirect("calendar-disconnected"),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleStaffCalendarPostAction,
  };
}

module.exports = {
  createAdminStaffCalendarPostHandlers,
};
