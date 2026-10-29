"use strict";

const { getEntryOrderState } = require("../admin-order-state");
const { createAdminOrdersRecurringHelpers } = require("./handlers-orders-recurring");
const { createAdminDomainFormatters } = require("./domain-formatters");

async function moveSeriesSchedule(deps, context, entry, date, time) {
  const formatters = createAdminDomainFormatters({ normalizeString: deps.normalizeString });
  const normalizeDate = deps.normalizeAdminOrderDateInput || formatters.normalizeAdminOrderDateInput;
  const normalizeTime = deps.normalizeAdminOrderTimeInput || formatters.normalizeAdminOrderTimeInput;
  const { rescheduleRecurringOrderSeries } = createAdminOrdersRecurringHelpers({ getEntryOrderState, ...deps,
    normalizeAdminOrderDateInput: normalizeDate, normalizeAdminOrderTimeInput: normalizeTime });
  const value = name => deps.getFormValue(context.formBody, name, 32);
  const entries = await rescheduleRecurringOrderSeries({
    quoteOpsLedger: context.quoteOpsLedger, staffStore: context.staffStore, sourceEntry: entry,
    selectedDate: normalizeDate(date), selectedTime: normalizeTime(time),
    expectedDate: normalizeDate(value("expectedScheduleDate")), expectedTime: normalizeTime(value("expectedScheduleTime")),
  });
  let calendarSyncFailed = false;
  // External calendars are refreshed only after the complete database move has committed.
  if (typeof context.googleCalendarIntegration?.syncAssignment === "function") {
    for (const changed of entries) {
      try { await context.googleCalendarIntegration.syncAssignment(changed.id, context.config, changed); }
      catch { calendarSyncFailed = true; }
    }
  }
  return { entries, calendarSyncFailed };
}

module.exports = { moveSeriesSchedule };
