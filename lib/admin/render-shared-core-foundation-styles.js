"use strict";

const { ADMIN_SHARED_CORE_DATA_ENTRY_STYLES } = require("./render-shared-core-data-entry-styles");
const { ADMIN_SHARED_CORE_SHELL_STYLES } = require("./render-shared-core-shell-styles");

const ADMIN_SHARED_CORE_FOUNDATION_STYLES = [
  ADMIN_SHARED_CORE_SHELL_STYLES,
  ADMIN_SHARED_CORE_DATA_ENTRY_STYLES,
].join("\n");

module.exports = {
  ADMIN_SHARED_CORE_FOUNDATION_STYLES,
};
