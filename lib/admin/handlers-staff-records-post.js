"use strict";

const { syncStaffPayrollSnapshots } = require("../payroll");

function createAdminStaffRecordsPostHandlers(deps = {}) {
  const {
    buildStaffRedirect,
    formatWorkspaceRoleLabel,
    getFormValue,
    normalizeAdminPhoneInput,
    normalizeString,
    normalizeWorkspaceRoleValue,
    redirectWithTiming,
    writeAjaxMutationSuccess,
  } = deps;

  async function handleStaffRecordsPostAction(context = {}) {
    const {
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
    } = context;

    if (action === "create-staff") {
      const userRole = normalizeWorkspaceRoleValue(getFormValue(formBody, "role", 80));
      await staffStore.createStaff({
        name: getFormValue(formBody, "name", 120),
        role: formatWorkspaceRoleLabel(userRole),
        phone: normalizeAdminPhoneInput(getFormValue(formBody, "phone", 80)),
        email: getFormValue(formBody, "email", 200),
        address: getFormValue(formBody, "address", 500),
        compensationValue: getFormValue(formBody, "compensationValue", 32),
        compensationType: getFormValue(formBody, "compensationType", 32),
        status: getFormValue(formBody, "status", 32),
        notes: getFormValue(formBody, "notes", 800),
      });
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("staff-created"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action === "update-staff") {
      const staffId = getFormValue(formBody, "staffId", 120);
      const userRole = normalizeWorkspaceRoleValue(
        getFormValue(formBody, "role", 80) || getFormValue(formBody, "userRole", 80)
      );
      const email = getFormValue(formBody, "email", 200).toLowerCase();
      await staffStore.updateStaff(staffId, {
        name: getFormValue(formBody, "name", 120),
        role: formatWorkspaceRoleLabel(userRole),
        phone: normalizeAdminPhoneInput(getFormValue(formBody, "phone", 80)),
        email,
        address: getFormValue(formBody, "address", 500),
        compensationValue: getFormValue(formBody, "compensationValue", 32),
        compensationType: getFormValue(formBody, "compensationType", 32),
        status: getFormValue(formBody, "status", 32),
        notes: getFormValue(formBody, "notes", 800),
      });
      await syncStaffPayrollSnapshots({
        quoteOpsLedger: context.quoteOpsLedger,
        staffStore,
        staffId,
      });
      if (usersStore) {
        const nextUserRole = userRole;
        let userId = getFormValue(formBody, "userId", 120);
        if (!userId && staffId) {
          try {
            const usersSnapshot = await usersStore.getSnapshot();
            const linkedUser =
              usersSnapshot && Array.isArray(usersSnapshot.users)
                ? usersSnapshot.users.find(
                    (user) =>
                      user &&
                      (user.staffId === staffId ||
                        (email && normalizeString(user.email, 200).toLowerCase() === email))
                  ) || null
                : null;
            userId = linkedUser ? linkedUser.id : "";
          } catch {}
        }
        if (userId && nextUserRole) {
          await usersStore.updateUser(userId, { role: nextUserRole, staffId, email });
        }
      }
      if (ajaxRequest) {
        writeAjaxMutationSuccess(res, requestStartNs, requestContext, "staff-updated");
        return true;
      }
      redirectWithTiming(
        res,
        303,
        buildStaffRedirect("staff-updated"),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    if (action !== "delete-staff") {
      return false;
    }

    if (googleCalendarIntegration && typeof googleCalendarIntegration.disconnectStaffCalendar === "function") {
      try {
        await googleCalendarIntegration.disconnectStaffCalendar(getFormValue(formBody, "staffId", 120), config);
      } catch {}
    }
    await staffStore.deleteStaff(getFormValue(formBody, "staffId", 120));
    redirectWithTiming(
      res,
      303,
      buildStaffRedirect("staff-deleted"),
      requestStartNs,
      requestContext.cacheHit
    );
    return true;
  }

  return {
    handleStaffRecordsPostAction,
  };
}

module.exports = {
  createAdminStaffRecordsPostHandlers,
};
