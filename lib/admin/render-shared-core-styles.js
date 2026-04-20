"use strict";

const {
  ADMIN_SHARED_CORE_COMPONENT_STYLES,
} = require("./render-shared-core-components-styles");
const {
  ADMIN_SHARED_CORE_FOUNDATION_STYLES,
} = require("./render-shared-core-foundation-styles");

const ADMIN_SHARED_CORE_STYLES = [
  ADMIN_SHARED_CORE_FOUNDATION_STYLES,
  ADMIN_SHARED_CORE_COMPONENT_STYLES,
].join("\n");

module.exports = {
  ADMIN_SHARED_CORE_STYLES,
};
