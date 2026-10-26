"use strict";

// Test/stand only. Synthetic data and optional paired scheduling in one process.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const { performance, monitorEventLoopDelay } = require("node:perf_hooks");

const control = () => JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL, "utf8"));
function installPairedRegistry() {
  if (!process.env.TASKS_PARALLEL_BASELINE) throw new Error("A baseline source is required for paired measurements");
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const registry = path.resolve(__dirname, "../../lib/admin/pages/admin-page-renderer-registry.js");
  const original = Module._extensions[".js"];
  Module._extensions[".js"] = (module, filename) => {
    original(module, filename);
    if (filename !== registry) return;
    const candidate = module.exports;
    const baseline = new Module(filename, module.parent);
    baseline.filename = filename;
    baseline.paths = module.paths;
    baseline._compile(fs.readFileSync(process.env.TASKS_PARALLEL_BASELINE, "utf8"), filename);
    module.exports = { ...candidate, createAdminPageRenderers(deps) {
      const oldPages = baseline.exports.createAdminPageRenderers(deps);
      const newPages = candidate.createAdminPageRenderers(deps);
      return { ...newPages, async renderAdminAppPage(...args) {
        const mode = control().mode;
        const start = performance.now();
        const cpu = process.cpuUsage();
        loop.reset();
        try { return await (mode === "baseline" ? oldPages : newPages).renderAdminAppPage(...args); }
        finally {
          const used = process.cpuUsage(cpu);
          if (process.env.TASKS_PARALLEL_METRICS) fs.appendFileSync(process.env.TASKS_PARALLEL_METRICS, JSON.stringify({
            mode, pageMs: performance.now() - start, processCpuMs: (used.user + used.system) / 1000,
            processLoopP95Ms: loop.percentile(95) / 1e6, processLoopMaxMs: loop.max / 1e6,
          }) + "\n");
        }
      } };
    } };
  };
}

let fixture;
let read;
let initialHash;
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
module.exports = async (url, options = {}) => {
  if (new URL(url).origin !== "https://account-benchmark.invalid" || (options.method || "GET") !== "GET") {
    throw new Error("Tasks stand forbids external traffic and writes");
  }
  if (!read) {
    fixture = require("./quote-ops-list-fixture.cjs").createQuoteOpsListFixture(Number(process.env.ADMIN_LIST_FIXTURE_COUNT) || 1107);
    initialHash = digest(fixture);
    read = require("./account-section-fixture.cjs").createSectionFetch(fixture, [], control);
  }
  const state = control();
  const u = new URL(url);
  const table = u.pathname.split("/").pop();
  const failed = state.failWorkspace && table === "admin_workspace_list_entries" ||
    state.failUsers && table === "admin_users" ||
    state.failStaff && table === "admin_staff";
  if (failed) return { ok: false, status: 503, text: async () => JSON.stringify({ message: "Synthetic read unavailable" }) };
  return read(url, options);
};
module.exports.installPairedRegistry = installPairedRegistry;

if (process.send) process.on("message", message => {
  if (message?.type !== "tasks-stand-snapshot") return;
  process.send({ type: "tasks-stand-snapshot", id: message.id, initialHash,
    currentHash: fixture ? digest(fixture) : null, rows: fixture?.rows.length,
    tasks: fixture?.rows.flatMap(row => row.payload_for_retry?.adminLead?.tasks || []).length,
    memory: process.memoryUsage(), maxRssKiB: process.resourceUsage().maxRSS });
});
