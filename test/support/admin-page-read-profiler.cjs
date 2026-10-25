"use strict";

// Isolated benchmark instrumentation. Never loaded by the production server.
const fs = require("node:fs");
const Module = require("node:module");
const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
const scopes = new AsyncLocalStorage();
const wrapped = new WeakMap();
const enabled = process.env.ADMIN_READ_PROFILE === "1";
const watched = new Set(["collectAdminOrderRecords", "collectAdminClientRecords", "buildStaffPlanningContext",
  "renderOrderTableRow", "renderCreateManualOrderDialog", "renderAdminClientDetailDialog", "renderAdminLayout"]);
function measured(name, work) {
  const scope = scopes.getStore();
  if (!scope) return work();
  const start = performance.now();
  try { return work(); }
  finally {
    const metric = scope.metrics[name] ||= { calls: 0, ms: 0 };
    metric.calls++;
    metric.ms += performance.now() - start;
  }
}
const clone = global.structuredClone;
if (enabled) global.structuredClone = (...args) => measured("structuredClone", () => clone(...args));

function profilePage(fn) {
  const result = async function (...args) {
    const scope = { type: "page_profile", metrics: {} };
    return scopes.run(scope, async () => {
      try { return await fn(...args); }
      finally {
        for (const metric of Object.values(scope.metrics)) metric.ms = +metric.ms.toFixed(3);
        fs.appendFileSync(process.env.ACCOUNT_SECTION_CAPTURE, JSON.stringify(scope) + "\n");
      }
    });
  };
  Object.assign(result, fn);
  if (fn.renderDialogFragment) result.renderDialogFragment = profilePage(fn.renderDialogFragment);
  return result;
}
const load = Module._load;
if (enabled) Module._load = function (name, parent, main) {
  const exports = load(name, parent, main);
  const filename = Module._resolveFilename(name, parent, main);
  if (!/\/admin\/pages\/(orders|clients)-page\.js$/.test(filename)) return exports;
  if (!wrapped.has(exports)) {
    const factoryName = filename.endsWith("orders-page.js") ? "createOrdersPageRenderer" : "createClientsPageRenderer";
    wrapped.set(exports, { ...exports, [factoryName](deps) {
      const measuredDeps = { ...deps };
      for (const key of watched) if (typeof deps[key] === "function") {
        measuredDeps[key] = (...args) => measured(key, () => deps[key](...args));
      }
      return profilePage(exports[factoryName](measuredDeps));
    } });
  }
  return wrapped.get(exports);
};
