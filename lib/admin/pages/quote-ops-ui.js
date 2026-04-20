"use strict";

const { createQuoteOpsDiagnosticsUi } = require("./quote-ops-diagnostics-ui");
const { createQuoteOpsLaneUi } = require("./quote-ops-lane-ui");
const { createQuoteOpsDialogUi } = require("./quote-ops-dialog-ui");
const { createQuoteOpsFunnelUi } = require("./quote-ops-funnel-ui");
const { createQuoteOpsStyleUi } = require("./quote-ops-style-ui");

function createQuoteOpsUiHelpers(deps = {}) {
  return {
    ...createQuoteOpsDiagnosticsUi(deps),
    ...createQuoteOpsLaneUi(deps),
    ...createQuoteOpsDialogUi(deps),
    ...createQuoteOpsFunnelUi(deps),
    ...createQuoteOpsStyleUi(deps),
  };
}

module.exports = {
  createQuoteOpsUiHelpers,
};
