"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parse } = require("parse5");
const css = require("css-tree");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const baseline = process.argv[2];
if (!baseline) throw new Error("Pass a directory containing the captured production manifest.json");
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value;
const refs = new Set(), cssFiles = new Set();
const responsiveGroups = [];
const previousPath = path.join(root, "lib/site/modern-images-manifest.json");
const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, "utf8")) : { images: {} };
const originalByModern = new Map(Object.entries(previous.images).flatMap(([original, image]) => (image.variants || []).map(v => [v.url, original])));
const measurements = new Map();
const geometry = JSON.parse(fs.readFileSync(path.join(root, "docs/site-lightening/before/image-geometry.json"), "utf8"));
function imagePath(value) {
  try {
    const url = new URL(value, "https://shynlicleaningservice.com/");
    return url.hostname === "shynlicleaningservice.com" && url.pathname.startsWith("/images/") ? decodeURI(url.pathname) : null;
  } catch { return null; }
}
function add(value) {
  const raw = imagePath(value), p = originalByModern.get(raw) || raw;
  if (p && /\.(?:png|jpe?g|webp|avif|svg)$/i.test(p) && fs.existsSync(path.join(root, p))) refs.add(p);
}
function collectCss(source, context = "stylesheet") {
  try { css.walk(css.parse(source, { context }), n => { if (n.type === "Url") add(n.value); }); } catch (error) { throw new Error(`Cannot safely parse image CSS: ${error.message}`); }
}
for (const row of geometry) {
  for (const item of [...row.images, ...row.backgrounds]) {
    for (const source of [item.src, item.currentSrc].filter(Boolean)) {
      const p = imagePath(source);
      if (!p || !item.width) continue;
      const m = measurements.get(p) || { desktop: 0, mobile: 0 };
      const key = row.width <= 600 ? "mobile" : "desktop";
      m[key] = Math.max(m[key], item.width);
      measurements.set(p, m);
    }
  }
}
function visit(n) {
  if (n.tagName === "picture" || n.tagName === "img" && attr(n, "srcset")) {
    const group = new Set();
    function collect(current) {
      if (["img", "source"].includes(current.tagName)) {
        for (const name of ["src", "data-original"]) if (attr(current, name)) group.add(imagePath(attr(current, name)));
        for (const name of ["srcset", "data-srcset"]) for (const part of (attr(current, name) || "").split(",")) group.add(imagePath(part.trim().split(/\s+/)[0]));
      }
      for (const child of current.childNodes || []) collect(child);
    }
    collect(n);
    responsiveGroups.push([...group].filter(Boolean));
  }
  if (n.tagName === "img" || n.tagName === "source" || n.tagName === "image") {
    for (const name of ["src", "data-original", "href", "xlink:href"]) if (attr(n, name)) add(attr(n, name));
    for (const name of ["srcset", "data-srcset"]) for (const part of (attr(n, name) || "").split(",")) add(part.trim().split(/\s+/)[0]);
  }
  if (n.tagName === "link" && attr(n, "rel") === "preload" && attr(n, "as") === "image") {
    add(attr(n, "href"));
    for (const part of (attr(n, "imagesrcset") || "").split(",")) add(part.trim().split(/\s+/)[0]);
  }
  if (n.tagName === "link" && attr(n, "rel") === "stylesheet") {
    const u = new URL(attr(n, "href"), "https://shynlicleaningservice.com/");
    if (u.hostname === "shynlicleaningservice.com") cssFiles.add(u.pathname);
  }
  if (attr(n, "style")?.includes("url(")) collectCss(attr(n, "style"), "declarationList");
  if (n.tagName === "style") collectCss(n.childNodes.map(c => c.value || "").join(""));
  for (const child of n.childNodes || []) visit(child);
}
for (const entry of JSON.parse(fs.readFileSync(path.join(baseline, "manifest.json"))).results) {
  visit(parse(fs.readFileSync(path.join(baseline, entry.file), "utf8")));
}
for (const file of cssFiles) if (fs.existsSync(path.join(root, file))) collectCss(fs.readFileSync(path.join(root, file), "utf8"));
// Every candidate in a picture occupies the same box, including candidates not
// selected on the measured device. Cap high-DPR fallback variants as well.
for (const group of responsiveGroups) {
  const measured = group.map(p => measurements.get(originalByModern.get(p) || p)).filter(Boolean);
  if (!measured.length) continue;
  const desktop = Math.max(...measured.map(m => m.desktop)), mobile = Math.max(...measured.map(m => m.mobile));
  for (const p of group) measurements.set(originalByModern.get(p) || p, { desktop, mobile });
}
const exempt = p => /(?:favicon|(?:^|[-_])icon[-_.]|og-photo)/i.test(path.basename(p));
const manifest = { version: "modern-images-20261022", images: {}, eager: {}, cssFiles: [...cssFiles].sort(), modifiedCss: previous.modifiedCss || [] };
for (const row of geometry) {
  const set = new Set(manifest.eager[row.route] || []);
  for (const item of row.images.filter(i => i.aboveFold)) for (const p of [imagePath(item.src), imagePath(item.currentSrc)]) if (p) set.add(p);
  manifest.eager[row.route] = [...set];
}
async function build() {
  const report = [];
  fs.mkdirSync(path.join(root, "images/optimized"), { recursive: true });
  for (const p of [...refs].sort()) {
    const input = path.join(root, p), data = fs.readFileSync(input), meta = await sharp(data).metadata();
    if (!meta.width || !meta.height) throw new Error(`Missing dimensions: ${p}`);
    const measured = measurements.get(p), displayWidth = Math.ceil(Math.max(measured?.desktop || 0, measured?.mobile || 0));
    const cap = Math.min(meta.width, displayWidth ? displayWidth * 2 : 1920);
    const raster = /\.(?:png|jpe?g)$/i.test(p), oversizedModern = /\.(?:webp|avif)$/i.test(p) && displayWidth && meta.width > cap;
    const entry = { width: meta.width, height: meta.height, displayWidth: displayWidth || null, desktop: Math.ceil(measured?.desktop || 0), mobile: Math.ceil(measured?.mobile || 0), bytes: data.length };
    if (!exempt(p) && (raster || oversizedModern)) {
      const hash = crypto.createHash("sha256").update(data).update(String(cap)).update("webp-q80-v1").digest("hex").slice(0, 10);
      const stem = path.basename(p, path.extname(p));
      const widths = [...new Set([320, 640, 960, cap].filter(w => w <= cap))].sort((a, b) => a - b);
      entry.variants = [];
      for (const width of widths) {
        const url = `/images/optimized/${stem}-${hash}-w${width}.webp`, output = path.join(root, url);
        if (!fs.existsSync(output)) await sharp(data).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 6, ...( /logo/i.test(p) ? { lossless: true } : {} ) }).toFile(output);
        const outMeta = await sharp(output).metadata();
        entry.variants.push({ url, width: outMeta.width, height: outMeta.height, bytes: fs.statSync(output).size });
      }
      const largest = entry.variants.at(-1);
      entry.modern = largest.url;
      report.push({ oldFile: p, oldKB: +(data.length / 1024).toFixed(2), newFile: largest.url, newKB: +(largest.bytes / 1024).toFixed(2), format: "WebP", originalWidth: meta.width, newWidth: largest.width, maxObservedDisplayWidth: displayWidth || "unmeasured; conservative 1920px cap" });
    }
    manifest.images[p] = entry;
  }
  fs.writeFileSync(path.join(root, "lib/site/modern-images-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "docs/site-lightening/images.json"), JSON.stringify(report, null, 2) + "\n");
  const headers = Object.keys(report[0]);
  fs.writeFileSync(path.join(root, "docs/site-lightening/images.csv"), [headers.join(","), ...report.map(row => headers.map(k => JSON.stringify(row[k])).join(","))].join("\n") + "\n");
  console.log(JSON.stringify({ imageRefs: refs.size, converted: report.length, oldKB: report.reduce((n, r) => n + r.oldKB, 0), newLargestKB: report.reduce((n, r) => n + r.newKB, 0) }));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
