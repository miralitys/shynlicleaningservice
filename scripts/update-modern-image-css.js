"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { rewriteModernCss, manifest } = require("../lib/site/modern-images");
const root = path.join(__dirname, "..");
const modified = new Set(manifest.modifiedCss || []);
for (const url of manifest.cssFiles) {
  const file = path.join(root, url);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, "utf8"), output = rewriteModernCss(source);
  if (source !== output) { fs.writeFileSync(file, output); modified.add(url); }
  if (output.includes("/images/optimized/")) modified.add(url);
}
fs.writeFileSync(path.join(root, "lib/site/modern-images-manifest.json"), JSON.stringify({ ...manifest, modifiedCss: [...modified].sort() }, null, 2) + "\n");
console.log(JSON.stringify({ cssFiles: [...modified] }));
