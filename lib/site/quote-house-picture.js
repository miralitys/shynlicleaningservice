"use strict";

const { parse } = require("parse5");

const IMAGE_PATH = "/images/shynli-quote-house.png";
const SRCSET = "/images/shynli-quote-house.w648.webp 648w, /images/shynli-quote-house.w1296.webp 1296w";
const SIZES = {
  "sg-quote__house": "(min-width: 960px) 474px, (min-width: 640px) 646px, (min-width: 480px) calc(100vw + 6px), calc(100vw - 2px)",
  "contact-house": "(min-width: 1200px) 474px, (min-width: 640px) 408px, (min-width: 480px) 352px, 271px",
  "sa-cleaner-cta__house": "(min-width: 1200px) 474px, (min-width: 480px) 408px, 320px",
  "quote-art": "(min-width: 960px) 474px, (min-width: 480px) 430px, 320px",
};

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

function picture(img, sizes) {
  return `<picture data-quote-house style="display:contents"><source type="image/webp" srcset="${SRCSET}" sizes="${sizes}">${img}</picture>`;
}

function applyQuoteHousePicture(html) {
  if (!html.includes("shynli-quote-house.png")) return html;
  const edits = [];
  let needsAutoHeight = false;
  function visit(node) {
    const location = node.sourceCodeLocation;
    const src = attr(node, "src");
    if (node.tagName === "img" && src && `/${src.replace(/^\//, "")}` === IMAGE_PATH && !attr(node.parentNode, "data-quote-house")) {
      if (node.parentNode?.tagName === "picture") return;
      const cls = attr(node, "class");
      const sizes = SIZES[cls];
      if (!sizes || !location) return;
      let img = html.slice(location.startOffset, location.endOffset);
      // Keep every existing attribute, especially each city's exact alt text.
      const attributeEdits = ["loading", "decoding", "width", "height", "fetchpriority"].map(name => location.attrs?.[name]).filter(Boolean);
      for (const item of attributeEdits.sort((a, b) => b.startOffset - a.startOffset)) {
        img = img.slice(0, item.startOffset - location.startOffset) + img.slice(item.endOffset - location.startOffset);
      }
      img = img.replace(/\s*\/?>$/, ' loading="lazy" decoding="async" width="1680" height="1244">');
      needsAutoHeight ||= ["sg-quote__house", "quote-art"].includes(cls);
      edits.push({ start: location.startOffset, end: location.endOffset, value: picture(img, sizes) });
    } else if (node.tagName === "div" && location && /background-image\s*:\s*url\(['"]?\/?images\/shynli-quote-house\.png['"]?\)\s*;?/.test(attr(node, "style") || "")) {
      const original = html.slice(location.startOffset, location.endOffset);
      const withoutBackground = original.replace(/background-image\s*:\s*url\(['"]?\/?images\/shynli-quote-house\.png['"]?\)\s*;?/, "");
      const img = `<img src="${IMAGE_PATH}" alt="" loading="lazy" decoding="async" width="1680" height="1244" data-quote-house-background aria-hidden="true" style="position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center">`;
      edits.push({ start: location.startOffset, end: location.endOffset, value: withoutBackground.replace(/<\/div>\s*$/, `${picture(img, SIZES["sa-cleaner-cta__house"])}</div>`) });
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
  // Zero specificity preserves all existing fixed-height mobile crop rules.
  if (needsAutoHeight) html = html.replace("<picture data-quote-house", '<style data-quote-house-size>:where(picture[data-quote-house] > img){height:auto;aspect-ratio:1680/1244}</style><picture data-quote-house');
  return html;
}

module.exports = { applyQuoteHousePicture, SRCSET, SIZES };
