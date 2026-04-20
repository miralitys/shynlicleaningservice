"use strict";

const { createStaffViewCompensationHelpers } = require("./staff-view-compensation");
const { createStaffViewDialogHelpers } = require("./staff-view-dialogs");
const { createStaffViewNoticeNavHelpers } = require("./staff-view-notices-nav");
const { createStaffViewTableHelpers } = require("./staff-view-table");

function createStaffViewUiHelpers(deps = {}) {
  const compensation = createStaffViewCompensationHelpers(deps);
  const dialogs = createStaffViewDialogHelpers({
    ...deps,
    ...compensation,
  });
  const noticesAndNav = createStaffViewNoticeNavHelpers(deps);
  const tables = createStaffViewTableHelpers({
    ...deps,
    ...dialogs,
  });

  return {
    ...compensation,
    ...dialogs,
    ...tables,
    ...noticesAndNav,
  };
}

module.exports = {
  createStaffViewUiHelpers,
};
