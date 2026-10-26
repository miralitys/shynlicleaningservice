"use strict";

// Isolated stand only: compare old/new callers and count actual task preparation.
if (process.env.TASKS_REUSE_BASELINE) {
  const fs = require("node:fs");
  const path = require("node:path");
  const Module = require("node:module");
  const { AsyncLocalStorage } = require("node:async_hooks");
  const { performance, monitorEventLoopDelay } = require("node:perf_hooks");
  const scopes = new AsyncLocalStorage();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const root = path.resolve(__dirname, "../..");
  const original = Module._extensions[".js"];
  Module._extensions[".js"] = (module, filename) => {
    original(module, filename);
    const relative = path.relative(root, filename);
    if (relative === "lib/admin/pages/quote-ops-helpers.js") {
      const helpers = module.exports;
      module.exports = { ...helpers, createQuoteOpsHelpers(deps) {
        const instance = helpers.createQuoteOpsHelpers({ ...deps, getEntryLeadTasks(entry) {
          const scope = scopes.getStore();
          if (scope) {
            scope.preparations++;
            if (scope.seen.has(entry)) scope.repeatPreparations++;
            else { scope.seen.add(entry); scope.uniqueEntries++; }
          }
          return deps.getEntryLeadTasks(entry);
        } });
        const build = instance.buildQuoteOpsTaskRecords;
        instance.buildQuoteOpsTaskRecords = (...args) => {
          const scope = scopes.getStore();
          if (!scope) return build(...args);
          scope.buildCalls++;
          const start = performance.now();
          try { return build(...args); }
          finally { scope.preparationMs += performance.now() - start; }
        };
        return instance;
      } };
    }
    if (relative !== "lib/admin/pages/admin-page-renderer-registry.js") return;
    const candidate = module.exports;
    const baseline = new Module(filename, module.parent);
    baseline.filename = filename;
    baseline.paths = module.paths;
    baseline._compile(fs.readFileSync(process.env.TASKS_REUSE_BASELINE, "utf8"), filename);
    module.exports = { ...candidate, createAdminPageRenderers(deps) {
      const oldPages = baseline.exports.createAdminPageRenderers(deps);
      const newPages = candidate.createAdminPageRenderers(deps);
      return { ...newPages, renderAdminAppPage(...args) {
        const mode = JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL, "utf8")).mode;
        const scope = { preparations: 0, repeatPreparations: 0, uniqueEntries: 0,
          buildCalls: 0, preparationMs: 0, seen: new WeakSet() };
        return scopes.run(scope, async () => {
          const start = performance.now();
          const cpu = process.cpuUsage();
          loop.reset();
          try { return await (mode === "baseline" ? oldPages : newPages).renderAdminAppPage(...args); }
          finally {
            const used = process.cpuUsage(cpu);
            fs.appendFileSync(process.env.TASKS_REUSE_METRICS, JSON.stringify({
              mode, pageMs: performance.now() - start, processCpuMs: (used.user + used.system) / 1000,
              preparations: scope.preparations, repeatPreparations: scope.repeatPreparations,
              uniqueEntries: scope.uniqueEntries, buildCalls: scope.buildCalls, preparationMs: scope.preparationMs,
              processLoopP95Ms: loop.percentile(95) / 1e6, processLoopMaxMs: loop.max / 1e6,
            }) + "\n");
          }
        });
      } };
    } };
  };
}
