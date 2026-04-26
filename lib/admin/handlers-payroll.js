"use strict";

const { getEntryPayrollData, normalizePayrollStatus, updatePayrollItemStatus } = require("../payroll");

function createAdminPayrollHandlers(deps = {}) {
  const {
    ADMIN_PAYROLL_PATH,
    buildAdminRedirectPath,
    ensureWorkspaceAccess,
    getFormValue,
    normalizeString,
    redirectWithTiming,
  } = deps;

  async function handleAdminPayrollRoutes(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      quoteOpsLedger,
    } = context;

    if (!req || !requestContext || requestContext.route !== ADMIN_PAYROLL_PATH) {
      return false;
    }

    if (req.method !== "POST") {
      return false;
    }

    if (
      !ensureWorkspaceAccess(
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge,
        { requireWrite: true }
      )
    ) {
      return true;
    }

    const formBody = context.formBody || {};
    const action = normalizeString(getFormValue(formBody, "action", 80), 80).toLowerCase();
    const entryId = getFormValue(formBody, "entryId", 120);
    const staffId = getFormValue(formBody, "staffId", 120);
    const returnTo =
      normalizeString(getFormValue(formBody, "returnTo", 1000), 1000) || ADMIN_PAYROLL_PATH;

    if (action !== "mark-payroll-paid" && action !== "mark-payroll-owed") {
      return false;
    }

    const entry = quoteOpsLedger ? await quoteOpsLedger.getEntry(entryId) : null;
    if (!entry) {
      redirectWithTiming(
        res,
        303,
        buildAdminRedirectPath(ADMIN_PAYROLL_PATH, { notice: "payroll-missing" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const currentPayroll = getEntryPayrollData(entry);
    const nextStatus = action === "mark-payroll-paid" ? "paid" : "owed";
    const updatedPayroll = updatePayrollItemStatus(currentPayroll, staffId, nextStatus, {
      paidAt: new Date().toISOString(),
      paidByName: normalizeString(
        currentUserAccess &&
          currentUserAccess.user &&
          (currentUserAccess.user.name || currentUserAccess.user.email),
        160
      ),
      paidByEmail: normalizeString(
        currentUserAccess && currentUserAccess.user && currentUserAccess.user.email,
        250
      ).toLowerCase(),
    });
    const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
      payroll: updatedPayroll,
    });

    redirectWithTiming(
      res,
      303,
      buildAdminRedirectPath(
        normalizeString(returnTo, 1000).startsWith(ADMIN_PAYROLL_PATH) ? returnTo : ADMIN_PAYROLL_PATH,
        {
          notice:
            updatedEntry && normalizePayrollStatus(nextStatus) === "paid"
              ? "payroll-paid"
              : updatedEntry
                ? "payroll-owed"
                : "payroll-missing",
        }
      ),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleAdminPayrollRoutes,
  };
}

module.exports = {
  createAdminPayrollHandlers,
};
