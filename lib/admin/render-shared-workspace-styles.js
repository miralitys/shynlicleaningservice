"use strict";

const { ADMIN_SHARED_WORKSPACE_CALENDAR_STYLES } = require("./render-shared-workspace-calendar-styles");
const { ADMIN_SHARED_WORKSPACE_SUMMARY_STYLES } = require("./render-shared-workspace-summary-styles");
const { ADMIN_SHARED_WORKSPACE_TABLE_STYLES } = require("./render-shared-workspace-table-styles");

const ADMIN_SHARED_WORKSPACE_STYLES = [
  ADMIN_SHARED_WORKSPACE_SUMMARY_STYLES,
  ADMIN_SHARED_WORKSPACE_TABLE_STYLES,
  ADMIN_SHARED_WORKSPACE_CALENDAR_STYLES,
].join("\n");

module.exports = {
  ADMIN_SHARED_WORKSPACE_STYLES,
};
