"use strict";

// Independent model of the SQL wire projection, not the application's DTO mapper.
function directoryRow(row) {
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const state = value => {
    if (!object(value)) return value ?? null;
    const { completion, policyAcceptance, payroll, ...result } = value;
    if (object(completion)) {
      result.completion = Object.hasOwn(completion, "cleanerComment") ? { cleanerComment: completion.cleanerComment } : {};
      for (const key of ["beforePhotos", "afterPhotos"]) {
        if (Array.isArray(completion[key]) && completion[key].length) result.completion[key] = [null];
      }
    }
    if (Object.keys(value).length && !Object.keys(result).length) result.directoryHasOrderState = true;
    return result;
  };
  const p = row.payload_for_retry || {};
  return { ...row, directory_orderState: state(p.orderState), directory_adminOrder: state(p.adminOrder),
    directory_adminLead: p.adminLead ?? null, directory_calculatorData: p.calculatorData ?? null,
    directory_adminClient: object(p.adminClient)
      ? Object.fromEntries(Object.entries(p.adminClient).filter(([key]) => key !== "photos")) : p.adminClient ?? null };
}

module.exports = { directoryRow };
