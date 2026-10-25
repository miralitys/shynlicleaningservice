"use strict";

const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const files = new Set(["lib/admin/handlers-request-dispatcher.js", "lib/admin/pages/admin-page-renderer-registry.js",
  "lib/http/timing.js", "lib/admin/read-context.js", "lib/admin/pages/orders-page.js",
  "lib/admin/pages/clients-page.js", "lib/quote-ops/store.js", "lib/quote-ops/order-list.js",
  "lib/admin/domain-formatters.js", "lib/admin/domain-orders.js", "lib/admin/domain-client-records.js",
  "lib/supabase-admin-staff.js", "lib/supabase-admin-users.js", "lib/supabase-quote-ops.js"]);
const previous = Module._extensions[".js"];
Module._extensions[".js"] = function load(module, filename) {
  const relative = path.relative(root, filename);
  if (process.env.ADMIN_READ_BASELINE_REF && files.has(relative)) {
    const source = execFileSync("git", ["show", `${process.env.ADMIN_READ_BASELINE_REF}:${relative}`], { cwd: root, encoding: "utf8" });
    return module._compile(source, filename);
  }
  return previous(module, filename);
};
