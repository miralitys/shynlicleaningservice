"use strict";

const { createAdminOrdersRecurringHelpers } = require("./handlers-orders-recurring");
const { createAdminStaffPostHandlers } = require("./handlers-staff-post");

function createAdminStaffHandlers(deps = {}) {
  const {
    ADMIN_STAFF_PATH,
  } = deps;
  const { handleStaffPostRoute } = createAdminStaffPostHandlers(deps);
  const { ensureAllRecurringOrderSeries } = createAdminOrdersRecurringHelpers(deps);

  async function handleStaffRoutes(context) {
    const route = context && context.requestContext ? context.requestContext.route : "";
    const method = context && context.req ? context.req.method : "";

    if (route === ADMIN_STAFF_PATH && method === "POST") {
      await handleStaffPostRoute(context);
      return true;
    }

    if (
      route === ADMIN_STAFF_PATH &&
      method === "GET" &&
      context.currentUserAccess &&
      context.currentUserAccess.authorized
    ) {
      const reqUrl = new URL(context.req.url || ADMIN_STAFF_PATH, "https://admin.local");
      if (reqUrl.searchParams.get("section") === "calendar") {
        await ensureAllRecurringOrderSeries({
          quoteOpsLedger: context.quoteOpsLedger,
          staffStore: context.staffStore,
        });
      }
    }

    return false;
  }

  return {
    handleStaffRoutes,
  };
}

module.exports = {
  createAdminStaffHandlers,
};
