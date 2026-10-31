"use strict";

const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const files = new Set(["lib/quote-ops/order-list.js", "lib/supabase-quote-ops.js", "lib/admin/pages/admin-page-renderer-registry.js"]);
const previous = Module._extensions[".js"];
Module._extensions[".js"] = function(module, filename) {
  const relative = path.relative(root, filename);
  if (process.env.ADMIN_READ_BASELINE_REF && files.has(relative)) {
    return module._compile(execFileSync("git", ["show", `${process.env.ADMIN_READ_BASELINE_REF}:${relative}`],
      { cwd: root, encoding: "utf8" }), filename);
  }
  return previous(module, filename);
};
