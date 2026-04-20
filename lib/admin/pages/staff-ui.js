"use strict";

const { createStaffViewUiHelpers } = require("./staff-view-ui");
const { createStaffScheduleUiHelpers } = require("./staff-schedule-ui");

function createStaffUiHelpers(deps = {}) {
  return {
    ...createStaffViewUiHelpers(deps),
    ...createStaffScheduleUiHelpers(deps),
  };
}

module.exports = {
  createStaffUiHelpers,
};
