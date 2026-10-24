"use strict";

// Used only in isolated benchmark child processes. No checkout or files are changed.
const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const files = new Set(["lib/account/handlers.js", "lib/account/render.js", "lib/account/calendar-data.js", "lib/admin-staff-store.js",
  "lib/admin-users-store.js", "lib/quote-ops/store.js", "lib/supabase-admin-staff.js", "lib/supabase-quote-ops.js"]);
const previous = Module._extensions[".js"];
Module._extensions[".js"] = function load(module, filename) {
  const relative = path.relative(root, filename);
  if (process.env.ACCOUNT_BASELINE_REF && files.has(relative)) {
    const source = execFileSync("git", ["show", `${process.env.ACCOUNT_BASELINE_REF}:${relative}`], { cwd: root, encoding: "utf8" });
    return module._compile(source, filename);
  }
  return previous(module, filename);
};
