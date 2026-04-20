"use strict";

const { createAdminOrdersMediaHandlers } = require("./handlers-orders-media");
const { createAdminOrdersPostHandlers } = require("./handlers-orders-post");

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
      return handleOrdersMediaGetRoute(context);
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
