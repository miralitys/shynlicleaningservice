"use strict";

const {
  DEFAULT_STAFF_UNAVAILABLE_SUMMARY,
  normalizeStaffAvailabilityDate,
  removeStaffAvailabilityBlock,
  upsertStaffAvailabilityBlock,
} = require("../staff-availability");

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

    if (action === "save-staff-unavailable-day" || action === "clear-staff-unavailable-day") {
      const staffId = getFormValue(formBody, "staffId", 120);
      const availabilityDate = normalizeStaffAvailabilityDate(
        getFormValue(formBody, "availabilityDate", 32)
      );
      if (!staffId || !availabilityDate) {
        throw new Error("STAFF_AVAILABILITY_REQUIRED");
      }

      const snapshot =
        staffStore && typeof staffStore.getSnapshot === "function"
          ? await staffStore.getSnapshot()
          : { staff: [] };
      const staffRecord = Array.isArray(snapshot.staff)
        ? snapshot.staff.find((record) => record && record.id === staffId)
        : null;
      if (!staffRecord) {
        throw new Error("STAFF_NOT_FOUND");
      }

      const nextAvailabilityBlocks =
        action === "clear-staff-unavailable-day"
          ? removeStaffAvailabilityBlock(staffRecord.availabilityBlocks, availabilityDate)
          : upsertStaffAvailabilityBlock(staffRecord.availabilityBlocks, {
              date: availabilityDate,
              summary:
                getFormValue(formBody, "availabilityReason", 180) ||
                DEFAULT_STAFF_UNAVAILABLE_SUMMARY,
              notes: getFormValue(formBody, "availabilityNotes", 500),
            });

      await staffStore.updateStaff(staffId, {
        availabilityBlocks: nextAvailabilityBlocks,
      });

      redirectWithTiming(
        res,
        303,
        buildStaffRedirect(
          action === "clear-staff-unavailable-day"
            ? "staff-unavailable-cleared"
            : "staff-unavailable-saved",
          {
            section: "calendar",
            calendarStart:
              normalizeStaffAvailabilityDate(getFormValue(formBody, "calendarStart", 32)) ||
              availabilityDate,
            calendarView: getFormValue(formBody, "calendarView", 32) || "week",
          }
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

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
