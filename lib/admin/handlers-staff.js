"use strict";

const { createAdminStaffPostHandlers } = require("./handlers-staff-post");

function createAdminStaffHandlers(deps = {}) {
  const {
    ADMIN_STAFF_PATH,
  } = deps;
  const { handleStaffPostRoute } = createAdminStaffPostHandlers(deps);

  async function handleStaffRoutes(context) {
    const route = context && context.requestContext ? context.requestContext.route : "";
    const method = context && context.req ? context.req.method : "";

    if (route === ADMIN_STAFF_PATH && method === "POST") {
      await handleStaffPostRoute(context);
      return true;
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
