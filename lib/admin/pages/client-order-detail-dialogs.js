"use strict";

const { createClientDetailUiHelpers } = require("./client-detail-ui");
const { createOrderManagementDialogHelpers } = require("./order-management-dialog");

function createClientOrderDetailDialogs(deps = {}) {
  return {
    ...createClientDetailUiHelpers(deps),
    ...createOrderManagementDialogHelpers(deps),
  };
}

module.exports = {
  createClientOrderDetailDialogs,
};
