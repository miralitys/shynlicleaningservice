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
  const RECURRING_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  let recurringSweepPromise = null;
  let lastRecurringSweepAt = 0;

  function scheduleRecurringOrderSweep(context = {}) {
    const now = Date.now();
    if (recurringSweepPromise || now - lastRecurringSweepAt < RECURRING_SWEEP_INTERVAL_MS) return;
    lastRecurringSweepAt = now;
    recurringSweepPromise = new Promise((resolve) => setImmediate(resolve))
      .then(() =>
        ensureAllRecurringOrderSeries({
          quoteOpsLedger: context.quoteOpsLedger,
          staffStore: context.staffStore,
        })
      )
      .catch(() => [])
      .finally(() => {
        recurringSweepPromise = null;
      });
  }

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
        const reqUrl = new URL(req.url || ADMIN_ORDERS_PATH, "http://localhost");
        if (reqUrl.searchParams.get("fragment") !== "order-dialog") {
          scheduleRecurringOrderSweep(context);
        }
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
