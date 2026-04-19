"use strict";

const { createAdminSettingsHandlers } = require("./handlers-settings");

function createAdminSettingsRouteHandlers(deps = {}) {
  const { handleSettingsRoute } = createAdminSettingsHandlers(deps);

  return {
    handleSettingsRoutes: handleSettingsRoute,
  };
}

module.exports = {
  createAdminSettingsRouteHandlers,
};
