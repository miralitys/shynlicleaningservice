"use strict";

const { ADMIN_SHARED_DETAIL_CLIENT_STYLES } = require("./render-shared-detail-client-styles");
const { ADMIN_SHARED_DETAIL_ORDER_STYLES } = require("./render-shared-detail-order-styles");
const { ADMIN_SHARED_DETAIL_SUPPLEMENTAL_STYLES } = require("./render-shared-detail-supplemental-styles");

const ADMIN_SHARED_DETAIL_PANELS_STYLES = [
  ADMIN_SHARED_DETAIL_CLIENT_STYLES,
  ADMIN_SHARED_DETAIL_ORDER_STYLES,
  ADMIN_SHARED_DETAIL_SUPPLEMENTAL_STYLES,
].join("\n");

module.exports = {
  ADMIN_SHARED_DETAIL_PANELS_STYLES,
};
