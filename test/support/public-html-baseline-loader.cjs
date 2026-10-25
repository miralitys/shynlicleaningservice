"use strict";

// Read historical source in isolated test children, without changing the checkout.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const files = new Set(["server.js", "lib/site/assets.js"]);
const original = fs.readFileSync;
fs.readFileSync = function read(file, options) {
  if (process.env.PUBLIC_HTML_BASELINE_REF && typeof file === "string") {
    const relative = path.relative(root, file);
    if (files.has(relative)) {
      const source = execFileSync("git", ["show", `${process.env.PUBLIC_HTML_BASELINE_REF}:${relative}`], { cwd: root });
      return typeof options === "string" || options?.encoding ? source.toString("utf8") : source;
    }
  }
  return original.apply(this, arguments);
};

if (process.env.PUBLIC_HTML_STATS_PATH) {
  const api = require("../../lib/site/html-preparation");
  const create = api.createPublicHtmlPreparer;
  api.createPublicHtmlPreparer = options => {
    const preparer = create(options);
    const close = preparer.close;
    preparer.close = async () => {
      fs.writeFileSync(process.env.PUBLIC_HTML_STATS_PATH, JSON.stringify(await preparer.inspect()));
      await close();
    };
    return preparer;
  };
}
