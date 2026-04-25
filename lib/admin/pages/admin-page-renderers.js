"use strict";

const { createAdminPageRenderers } = require("./admin-page-renderer-builders");

function createAdminPageRendererFactory(deps = {}) {
  return createAdminPageRenderers(deps);
}

module.exports = {
  createAdminPageRendererFactory,
};
