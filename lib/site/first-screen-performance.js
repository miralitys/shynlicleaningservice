"use strict";

const { parse } = require("parse5");
const fs = require("node:fs");
const path = require("node:path");
const images = require("./first-screen-images.json");
const rooms = require("./deep-room-images.json");

const LOCAL_FONT_CSS = fs.readFileSync(path.join(__dirname, "../../css/shynli-fonts.css"), "utf8");
const ROOM_SIZES = "(max-width:980px) 75px, 130px";
const ROOM_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const HOME_SIZES = "(max-width:386px) 106vw, (max-width:760px) 410px, 1188px";
const REVIEW_PAUSE_CSS = ".clients-say-home[data-reviews-paused] .clients-say-home__track{animation-play-state:paused!important}";
const HOME_STYLE = `<style id="first-screen-performance">
@media(scripting:enabled){
  [data-deferred-media]:not([data-media-ready]),
  [data-deferred-media]:not([data-media-ready])::before,
  [data-deferred-media]:not([data-media-ready])::after,
  [data-deferred-media]:not([data-media-ready]) *,
  [data-deferred-media]:not([data-media-ready]) *::before,
  [data-deferred-media]:not([data-media-ready]) *::after{background-image:none!important}
}
${REVIEW_PAUSE_CSS}
</style>`;
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") || "").split(/\s+/).includes(name);
const srcset = variants => variants.map(item => `${item.url} ${item.width}w`).join(", ");
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");

function deepStyle() {
  const set = widths => `image-set(${widths.flatMap((width, index) => ["avif", "webp"].map(format => {
    const image = images.deep[format].find(item => item.width === width);
    return `url("${image.url}") ${index + 1}x type("image/${format}")`;
  })).join(",")})`;
  const fallback = images.deep.webp.at(-1).url;
  return `<style id="first-screen-performance">.dc-hero__visual{background-image:url("${fallback}");background-image:${set([1440, 1680])}}@media(max-width:980px){.dc-hero__visual{background-image:url("${images.deep.webp[0].url}");background-image:${set([480, 960, 1440])}}}${REVIEW_PAUSE_CSS}</style>`;
}

function applyFirstScreenPerformance(html, route = "/") {
  if (!["/", "/services/deep-cleaning"].includes(route) || html.includes('id="first-screen-performance"')) return html;
  const home = route === "/";
  if (home ? !/class="hero__team"/.test(html) : !/class="dc-hero__visual"/.test(html)) return html;
  const edits = [];
  let hasReviews = false;
  let hasRooms = false;
  function set(node, name, value) {
    if (attr(node, name) === value) return;
    const loc = node.sourceCodeLocation;
    const position = loc.attrs?.[name];
    const text = `${name}="${escape(value)}"`;
    const end = loc.startTag.endOffset - 1;
    edits.push(position ? { start: position.startOffset, end: position.endOffset, value: text }
      : { start: end, end, value: " " + text });
  }
  function visit(node) {
    if (node.sourceCodeLocation?.startTag) {
      if (hasClass(node, "clients-say-home")) {
        set(node, "data-reviews-paused", "");
        hasReviews = true;
      }
      if (home) {
        if (node.tagName === "section" && ["steps", "not-included", "benefits", "areas"].some(name => hasClass(node, name))) set(node, "data-deferred-media", "");
        if (node.tagName === "script" && /\/js\/home-copy-clean\.js\?/.test(attr(node, "src") || "")) set(node, "src", "/js/home-copy-clean.js?v=20261116-visible-media");
        if (node.tagName === "link" && attr(node, "as") === "image" && /home-copy-team/.test(attr(node, "href") || "")) {
          set(node, "href", images.home.avif[0].url);
          set(node, "imagesrcset", srcset(images.home.avif));
          set(node, "imagesizes", HOME_SIZES);
          set(node, "type", "image/avif");
        }
        if (node.tagName === "picture" && node.childNodes?.some(child => hasClass(child, "hero__team"))) {
          const start = node.sourceCodeLocation.startTag.endOffset;
          edits.push({ start, end: start, value: `<source type="image/avif" srcset="${srcset(images.home.avif)}" sizes="${HOME_SIZES}">` });
          for (const child of node.childNodes) {
            if (child.tagName === "source") { set(child, "srcset", srcset(images.home.webp)); set(child, "sizes", HOME_SIZES); }
            if (hasClass(child, "hero__team")) {
              set(child, "src", images.home.webp.find(item => item.width === 960).url);
              set(child, "decoding", "async");
            }
          }
        }
      } else {
        if (node.tagName === "link" && (attr(node, "rel") || "").split(/\s+/).includes("stylesheet") && /^\/?css\/shynli-fonts\.css(?:\?|$)/.test(attr(node, "href") || "")) {
          const loc = node.sourceCodeLocation;
          edits.push({ start: loc.startOffset, end: loc.endOffset, value: `<style id="deep-local-fonts">${LOCAL_FONT_CSS}</style>` });
        }
        if (node.tagName === "img" && hasClass(node.parentNode, "dc-area__icon")) {
          const room = rooms.find(item => item.original === attr(node, "src") || item.legacy.includes(attr(node, "src")));
          if (room) {
            set(node, "src", room.variants[0].url);
            set(node, "srcset", srcset(room.variants));
            set(node, "sizes", ROOM_SIZES);
            const loc = node.sourceCodeLocation;
            // The real image remains a native, lazy fallback when scripting is disabled.
            edits.push({ start: loc.startOffset, end: loc.startOffset, value: `<picture class="dc-room-media"><source media="(scripting: enabled)" srcset="${ROOM_PLACEHOLDER}" data-deep-room-placeholder>` });
            edits.push({ start: loc.endOffset, end: loc.endOffset, value: "</picture>" });
            hasRooms = true;
          }
        }
      }
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  let output = edits.sort((a, b) => b.start - a.start).reduce((source, edit) => source.slice(0, edit.start) + edit.value + source.slice(edit.end), html);
  const preload = home ? "" : [["(max-width:980px)", [480, 960, 1440]], ["(min-width:981px)", [1440, 1680]]].map(([media, widths]) => {
    const variants = widths.map(width => images.deep.avif.find(item => item.width === width));
    const candidates = variants.map((item, index) => `${item.url} ${index + 1}x`).join(", ");
    return `<link rel="preload" as="image" type="image/avif" href="${variants[0].url}" imagesrcset="${candidates}" media="${media}" fetchpriority="high">`;
  }).join("");
  const reviews = !home && hasReviews ? '<script src="/js/deep-review-visibility.js?v=20261116-visible-media" defer></script>' : "";
  const roomMedia = hasRooms ? '<style id="deep-room-media-style">.dc-area__icon>.dc-room-media{display:block;width:100%;height:100%}</style><script src="/js/deep-room-media.js?v=20261116-nearby-rooms" defer></script>' : "";
  return output.replace(/<\/head>/i, (home ? HOME_STYLE : deepStyle()) + preload + reviews + roomMedia + "</head>");
}

module.exports = { applyFirstScreenPerformance, HOME_SIZES, ROOM_SIZES };
