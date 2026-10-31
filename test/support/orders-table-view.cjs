"use strict";

// Independent model of the additional SQL projection, applied after the old order view.
function tablePayload(payload = {}) {
  const pick = (value, fields) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : value;
  const { adminClient, ...result } = payload;
  result.calculatorData = pick(payload.calculatorData,
    ["selectedDate", "selectedTime", "serviceType", "serviceDurationMinutes", "frequency"]);
  result.adminLead = pick(payload.adminLead, ["status", "tasks", "updatedAt", "managerId", "managerName", "managerEmail"]);
  return result;
}

function tableRow(row) {
  const { payload_for_retry, ...base } = row;
  return { ...base, ...Object.fromEntries(Object.entries(tablePayload(payload_for_retry)).map(([key, value]) => [`list_${key}`, value])) };
}

module.exports = { tablePayload, tableRow };
