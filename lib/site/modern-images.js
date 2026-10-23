"use strict";

const { parse } = require("parse5");
const css = require("css-tree");
const manifest = require("./modern-images-manifest.json");
const routes = require("../../routes.json");
const origin = "https://shynlicleaningservice.com";
const originalByModern = new Map(Object.entries(manifest.images).flatMap(([original, image]) => (image.variants || []).map(v => [v.url, original])));
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value;
const escape = value => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function localPath(value) {
  try { const u = new URL(value, origin); return u.origin === origin ? decodeURI(u.pathname) : null; } catch { return null; }
}
function modernUrl(value) {
  return manifest.images[localPath(value)]?.modern || value;
}
function originalImagePath(value) {
  const key = localPath(value);
  return originalByModern.get(key) || key;
}
function rewriteModernCss(source, context = "stylesheet") {
  if (!/\.(?:png|jpe?g|webp|avif)/i.test(source)) return source;
  const patches = [];
  const tree = css.parse(source, { context, positions: true });
  css.walk(tree, n => {
    if (n.type !== "Url") return;
    const url = modernUrl(n.value);
    if (url !== n.value) patches.push({ start: n.loc.start.offset, end: n.loc.end.offset, value: css.generate({ ...n, value: url }) });
  });
  return patch(source, patches);
}
function patch(source, patches) {
  return patches.sort((a, b) => b.start - a.start).reduce((s, p) => s.slice(0, p.start) + p.value + s.slice(p.end), source);
}
function modernSrcset(value) {
  return [...new Set(value.split(",").map(candidate => {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    const entry = manifest.images[localPath(url)];
    return [modernUrl(url), entry?.modern && /^\d+w$/.test(descriptor || "") ? `${entry.variants.at(-1).width}w` : descriptor].filter(Boolean).join(" ");
  }))].join(", ");
}
function sizes(entry) {
  const desktop = entry.desktop || entry.displayWidth || entry.width;
  const mobile = entry.mobile || Math.min(desktop, 390);
  return `(max-width: 600px) ${mobile}px, ${desktop}px`;
}
function eagerPaths(route) {
  if (manifest.eager[route]) return new Set(manifest.eager[route]);
  const sameTemplate = Object.keys(manifest.eager).find(p => routes[p] && routes[p] === routes[route]);
  return new Set(manifest.eager[sameTemplate] || []);
}
function applyModernImages(html, route = "/") {
  if (/^\/(?:admin|account)(?:\/|$)/.test(route)) return html;
  const patches = [], eager = eagerPaths(route);
  let needsIntrinsicStyle = false;
  function visit(n) {
    const loc = n.sourceCodeLocation;
    if (loc?.startTag) {
      const desired = {};
      if (n.tagName === "img") {
        const source = attr(n, "data-original") || attr(n, "src");
        const key = localPath(source), entry = manifest.images[key];
        if (entry) {
          if (entry.modern) {
            desired.src = entry.modern;
            if (attr(n, "data-original")) desired["data-original"] = entry.modern;
            if (!attr(n, "srcset") && !n.parentNode?.tagName?.includes("picture")) {
              desired.srcset = entry.variants.map(v => `${v.url} ${v.width}w`).join(", ");
              desired.sizes = sizes(entry);
            }
          }
          const dimension = value => /^\d+(?:\.\d+)?(?:px)?$/.test(value || "") ? parseFloat(value) : 0;
          const oldWidth = dimension(attr(n, "width")), oldHeight = dimension(attr(n, "height"));
          if (!attr(n, "width")) desired.width = String(oldHeight ? Math.round(oldHeight * entry.width / entry.height) : entry.width);
          if (!attr(n, "height")) {
            desired.height = String(oldWidth ? Math.round(oldWidth * entry.height / entry.width) : entry.height);
            desired["data-shynli-intrinsic"] = "";
            needsIntrinsicStyle = true;
          }
          let parent = n.parentNode, header = false, footer = false;
          while (parent) { header ||= parent.tagName === "header"; footer ||= parent.tagName === "footer"; parent = parent.parentNode; }
          const above = !footer && (header || eager.has(key) || /(?:^|\s)(?:hero(?:__|-)|[^\s]*hero-image)/.test(attr(n, "class") || ""));
          desired.loading = above ? "eager" : "lazy";
          if (!above && attr(n, "fetchpriority") === "high") desired.fetchpriority = "auto";
          if (above && !header && /hero/.test(attr(n, "class") || "")) desired.fetchpriority = "high";
          if (!attr(n, "decoding")) desired.decoding = "async";
        }
      }
      if (n.tagName === "source" || n.tagName === "img") {
        for (const name of ["srcset", "data-srcset"]) if (attr(n, name)) desired[name] = modernSrcset(attr(n, name));
        if (n.tagName === "source" && desired.srcset !== attr(n, "srcset") && /\.(?:webp)(?:\s|,|$)/.test(desired.srcset || "")) desired.type = "image/webp";
      }
      if (n.tagName === "image") for (const name of ["href", "xlink:href"]) if (attr(n, name)) desired[name] = modernUrl(attr(n, name));
      if (n.tagName === "link" && attr(n, "rel") === "preload" && attr(n, "as") === "image") {
        const entry = manifest.images[localPath(attr(n, "href"))];
        desired.href = modernUrl(attr(n, "href"));
        if (attr(n, "imagesrcset")) desired.imagesrcset = modernSrcset(attr(n, "imagesrcset"));
        else if (entry?.modern) { desired.imagesrcset = entry.variants.map(v => `${v.url} ${v.width}w`).join(", "); desired.imagesizes = sizes(entry); }
      }
      if (n.tagName === "link" && attr(n, "rel") === "stylesheet" && manifest.modifiedCss?.includes(localPath(attr(n, "href")))) {
        const href = attr(n, "href"), separator = href.includes("?") ? "&" : "?";
        if (!href.includes("mi=")) desired.href = href + separator + "mi=" + manifest.version;
      }
      if (attr(n, "style")?.includes("url(")) desired.style = rewriteModernCss(attr(n, "style"), "declarationList");
      const additions = [];
      for (const [name, value] of Object.entries(desired)) {
        if (value == null || value === attr(n, name)) continue;
        const text = `${name}="${escape(value)}"`, position = loc.attrs?.[name];
        if (position) patches.push({ start: position.startOffset, end: position.endOffset, value: text });
        else additions.push(text);
      }
      if (additions.length) {
        const start = loc.startTag.endOffset - (html[loc.startTag.endOffset - 2] === "/" ? 2 : 1);
        patches.push({ start, end: start, value: " " + additions.join(" ") });
      }
    }
    if (n.tagName === "style" && loc?.startTag && loc?.endTag) {
      const start = loc.startTag.endOffset, end = loc.endTag.startOffset;
      const value = rewriteModernCss(html.slice(start, end));
      if (value !== html.slice(start, end)) patches.push({ start, end, value });
    }
    for (const child of n.childNodes || []) visit(child);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  const result = patch(html, patches);
  // Keep the original automatic height when CSS changes an image's display width.
  // Zero specificity leaves deliberate component height rules in control.
  const style = '<style id="shynli-intrinsic-image-style">:where(img[data-shynli-intrinsic]){height:auto}</style>';
  return needsIntrinsicStyle && !result.includes('id="shynli-intrinsic-image-style"')
    ? result.replace(/<\/head>/i, style + "</head>") : result;
}

module.exports = { applyModernImages, rewriteModernCss, modernUrl, originalImagePath, manifest };
