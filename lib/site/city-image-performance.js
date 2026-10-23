"use strict";

const { parse } = require("parse5");
const css = require("css-tree");
const { manifest } = require("./modern-images");

const MAP_URL = "/images/optimized/shynli-area-map-56be8cf260.svg";
const ICONS = {
  favicon: "/images/optimized/shynli-icon-32-62e53a8426.png",
  retina: "/images/optimized/shynli-icon-64-18f943d9e3.png",
  apple: "/images/optimized/shynli-icon-180-b3e39ad8a5.png",
};
const hero = manifest.images["/images/shynli-sugargrove-cleaners.png"];
const heroUrl = width => hero.variants.find(v => v.width === width).url;
const MOBILE_HERO_STYLE = `<style id="city-mobile-hero-images">@media(max-width:479px){.sg-hero__people{background-image:image-set(url("${heroUrl(640)}") 1x,url("${heroUrl(960)}") 2x,url("${heroUrl(1680)}") 3x)}}@media(max-width:412px){.sg-hero__people{background-image:image-set(url("${heroUrl(384)}") 1x,url("${heroUrl(768)}") 2x,url("${heroUrl(1152)}") 3x)}}</style>`;
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") || "").split(/\s+/).includes(name);
const applyEdits = (source, edits) => edits.sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.value + s.slice(e.end), source);

function lazyMapCss(source) {
  const edits = [];
  css.walk(css.parse(source, { positions: true }), node => {
    if (node.type !== "Rule" || css.generate(node.prelude) !== ".sg-map::before") return;
    edits.push({ start: node.prelude.loc.start.offset, end: node.prelude.loc.end.offset, value: ".sg-map > .sg-map-image" });
    node.block.children.forEach(declaration => {
      if (declaration.type === "Declaration" && /^background(?:-image)?$/.test(declaration.property) && css.generate(declaration.value).includes("shynli-sugargrove-area-map.svg")) {
        edits.push({ start: declaration.value.loc.start.offset, end: declaration.value.loc.end.offset, value: "none" });
      }
    });
  });
  return applyEdits(source, edits);
}

function applyCityImagePerformance(html) {
  if (!/shynli-icon-32\.png|sg-map|sg-hero__people/.test(html)) return html;
  const edits = [];
  let hasHero = false;
  const hasMap = /class=["'][^"']*\bsg-map\b/.test(html);
  function visit(node) {
    const loc = node.sourceCodeLocation;
    if (loc) {
      if (node.tagName === "link" && attr(node, "href") === "/images/shynli-icon-32.png") {
        const rel = attr(node, "rel");
        if (["icon", "shortcut icon"].includes(rel)) edits.push({ start: loc.startOffset, end: loc.endOffset, value: `<link rel="icon" href="${ICONS.favicon}" sizes="32x32" type="image/png"><link rel="icon" href="${ICONS.retina}" sizes="64x64" type="image/png">` });
        if (rel === "apple-touch-icon") edits.push({ start: loc.startOffset, end: loc.endOffset, value: `<link rel="apple-touch-icon" href="${ICONS.apple}" sizes="180x180">` });
      }
      hasHero ||= hasClass(node, "sg-hero__people");
      if (hasMap && node.tagName === "style" && loc.startTag && loc.endTag) {
        const start = loc.startTag.endOffset, end = loc.endTag.startOffset;
        const original = html.slice(start, end), value = lazyMapCss(original);
        if (value !== original) edits.push({ start, end, value });
      }
      if (hasClass(node, "sg-map") && !node.childNodes?.some(child => hasClass(child, "sg-map-image"))) {
        const value = `<img class="sg-map-image" src="${MAP_URL}" alt="" aria-hidden="true" loading="lazy" decoding="async" width="916" height="644" style="height:auto;aspect-ratio:916/644;object-fit:contain;object-position:center top">`;
        edits.push({ start: loc.startTag.endOffset, end: loc.startTag.endOffset, value });
      }
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  let output = applyEdits(html, edits);
  if (hasHero && !output.includes('id="city-mobile-hero-images"')) output = output.replace(/<\/head>/i, MOBILE_HERO_STYLE + "</head>");
  return output;
}

module.exports = { applyCityImagePerformance, MAP_URL, ICONS, MOBILE_HERO_STYLE };
