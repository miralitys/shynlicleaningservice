"use strict";

// Isolated benchmark instrumentation, never loaded by the production server.
const Module = require("node:module");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { capture } = require("./account-section-fixture.cjs");
const root = path.resolve(__dirname, "../..");
const previous = Module._extensions[".js"];
function timed(fn, phase) {
  return function (...args) {
    const start = performance.now();
    try { return fn.apply(this, args); }
    finally { capture({ type: "compute", phase, start, end: performance.now() }); }
  };
}
Module._extensions[".js"] = function (module, filename) {
  const result = previous(module, filename);
  const relative = path.relative(root, filename);
  if (relative === "lib/account/render.js") {
    const create = module.exports.createAccountRenderers;
    module.exports.createAccountRenderers = deps => Object.fromEntries(Object.entries(create(deps))
      .map(([key, value]) => [key, typeof value === "function" ? timed(value, "render") : value]));
  } else if (relative === "lib/account/handlers.js") {
    const create = module.exports.createAccountRequestHandler;
    module.exports.createAccountRequestHandler = deps => create({ ...deps,
      buildStaffPlanningContext: timed(deps.buildStaffPlanningContext, "planning") });
  }
  return result;
};
