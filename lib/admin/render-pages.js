"use strict";

const { createAdminPageRendererFactory } = require("./pages/admin-page-renderers");

function createAdminPageRenderers(deps = {}) {
  return createAdminPageRendererFactory(deps);
}

module.exports = {
  createAdminPageRenderers,
};
