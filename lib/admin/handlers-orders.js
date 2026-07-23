"use strict";

const { createAdminOrdersMediaHandlers } = require("./handlers-orders-media");
const { createAdminOrdersPostHandlers } = require("./handlers-orders-post");
const { createAdminOrdersRecurringHelpers } = require("./handlers-orders-recurring");

function createAdminOrdersHandlers(deps = {}) {
  const { ADMIN_ORDERS_PATH } = deps;
  const { handleOrdersMediaGetRoute } = createAdminOrdersMediaHandlers({
    ensureWorkspaceAccess: deps.ensureWorkspaceAccess,
    getEntryOrderCompletionData: deps.getEntryOrderCompletionData,
    getRequestUrl: deps.getRequestUrl,
    normalizeString: deps.normalizeString,
    writeHeadWithTiming: deps.writeHeadWithTiming,
  });
  const { handleAdminOrdersPostRoute } = createAdminOrdersPostHandlers(deps);
  const { ensureAllRecurringOrderSeries } = createAdminOrdersRecurringHelpers(deps);

  async function handleAdminOrdersRoutes(context = {}) {
    const { req, requestContext } = context;
    if (!req || !requestContext || requestContext.route !== ADMIN_ORDERS_PATH) {
      return false;
    }

    if (req.method === "POST") {
      await handleAdminOrdersPostRoute(context);
      return true;
    }

    if (req.method === "GET") {
      const handledMedia = await handleOrdersMediaGetRoute(context);
      if (handledMedia) return true;
      if (context.currentUserAccess && context.currentUserAccess.authorized) {
        await ensureAllRecurringOrderSeries({
          quoteOpsLedger: context.quoteOpsLedger,
          staffStore: context.staffStore,
        });
      }
      return false;
    }

    return false;
  }

  return {
    handleAdminOrdersRoutes,
  };
}

module.exports = {
  createAdminOrdersHandlers,
};
