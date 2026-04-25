"use strict";

const { createOrdersUiListHelpers } = require("./orders-ui-list-helpers");
const { createOrdersUiPolicyPanel } = require("./orders-ui-policy-panel");
const { createOrdersUiPrimitives } = require("./orders-ui-primitives");
const { createOrdersUiQuoteHelpers } = require("./orders-ui-quote-helpers");

function createOrdersUiHelpers(deps = {}) {
  const primitiveHelpers = createOrdersUiPrimitives(deps);
  const quoteHelpers = createOrdersUiQuoteHelpers({ ...deps, ...primitiveHelpers });
  const policyHelpers = createOrdersUiPolicyPanel({ ...deps, ...quoteHelpers });
  const listHelpers = createOrdersUiListHelpers({
    ...deps,
    ...primitiveHelpers,
    ...quoteHelpers,
    ...policyHelpers,
  });

  return {
    ...primitiveHelpers,
    ...quoteHelpers,
    ...policyHelpers,
    ...listHelpers,
  };
}

module.exports = {
  createOrdersUiHelpers,
};
