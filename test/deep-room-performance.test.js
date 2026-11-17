"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("parse5");
const { applyFirstScreenPerformance, ROOM_SIZES } = require("../lib/site/first-screen-performance");
const rooms = require("../lib/site/deep-room-images.json");

const root = path.resolve(__dirname, "..");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function nodes(html) {
  const result = [];
  function visit(node) { result.push(node); (node.childNodes || []).forEach(visit); }
  visit(parse(html));
  return result;
}
const input = `<html><head><link rel="preload" href="/fonts/montserrat-latin-300-800.woff2" as="font" crossorigin><link rel="stylesheet" href="/css/shynli-fonts.css?v=existing"><script id="tracking">unchanged()</script></head><body><div class="dc-hero__visual"></div>${rooms.map((room, index) => `<span class="dc-area__icon"><img src="${room.legacy.at(-1)}" alt="Original room ${index}" width="${room.variants.at(-1).width}" height="${room.variants.at(-1).height}" loading="lazy" decoding="async"></span>`).join("")}<form action="/quote"><button>Get a quote</button></form></body></html>`;

test("only Deep embeds the exact existing font CSS and keeps font preloads and tracking", () => {
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  assert.ok(output.includes(`<style id="deep-local-fonts">${fs.readFileSync(path.join(root, "css/shynli-fonts.css"), "utf8")}</style>`));
  assert.doesNotMatch(output, /<link[^>]*shynli-fonts\.css/);
  assert.ok(output.includes('<link rel="preload" href="/fonts/montserrat-latin-300-800.woff2" as="font" crossorigin>'));
  assert.ok(output.includes('<script id="tracking">unchanged()</script>'));
  assert.ok(output.includes('<form action="/quote"><button>Get a quote</button></form>'));
  for (const route of ["/pricing", "/quote", "/naperville", "/services/deep-cleaning-copy", "/services/deep-cleaning/ads-lp", "/services/deep-cleaning/ads-v2"]) {
    assert.equal(applyFirstScreenPerformance(input, route), input, route);
  }
  assert.equal(applyFirstScreenPerformance(output, "/services/deep-cleaning"), output);
});

test("room pictures keep alt text, geometry and native fallbacks with correctly sized candidates", () => {
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  const before = nodes(input).filter(node => node.tagName === "img");
  const after = nodes(output).filter(node => node.tagName === "img");
  assert.equal(after.length, 4);
  after.forEach((image, index) => {
    for (const name of ["alt", "width", "height", "loading", "decoding"]) assert.equal(attr(image, name), attr(before[index], name));
    assert.equal(attr(image, "sizes"), ROOM_SIZES);
    assert.equal(attr(image, "src"), rooms[index].variants[0].url);
    assert.equal(image.parentNode.tagName, "picture");
    const placeholder = image.parentNode.childNodes.find(node => node.tagName === "source");
    assert.equal(attr(placeholder, "media"), "(scripting: enabled)");
    assert.match(attr(placeholder, "srcset"), /^data:image\/gif;base64,/);
    assert.equal(attr(placeholder, "data-deep-room-placeholder"), "");
    assert.ok(attr(image, "srcset").includes(rooms[index].variants.at(-1).url));
  });
  assert.match(output, /deep-room-media\.js\?v=20261116-nearby-rooms/);
});

test("room images reveal only near the viewport and immediately without IntersectionObserver", () => {
  const script = fs.readFileSync(path.join(root, "js/deep-room-media.js"), "utf8");
  function harness(observerAvailable) {
    const pictures = [0, 1, 2, 3].map(() => ({ revealed: false, querySelector() { return { remove: () => { this.revealed = true; } }; } }));
    let observer;
    class IntersectionObserver {
      constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observer = this; }
      observe(target) { this.targets.add(target); }
      unobserve(target) { this.targets.delete(target); }
    }
    vm.runInNewContext(script, { document: { querySelectorAll: () => pictures }, window: observerAvailable ? { IntersectionObserver } : {}, IntersectionObserver });
    return { pictures, observer };
  }
  const { pictures, observer } = harness(true);
  assert.equal(observer.options.rootMargin, "600px 0px");
  assert.ok(pictures.every(picture => !picture.revealed));
  observer.callback([{ target: pictures[0], isIntersecting: false }]);
  assert.equal(pictures[0].revealed, false);
  observer.callback([{ target: pictures[0], isIntersecting: true }]);
  assert.equal(pictures[0].revealed, true);
  assert.equal(pictures[1].revealed, false);
  assert.ok(!observer.targets.has(pictures[0]));
  assert.ok(harness(false).pictures.every(picture => picture.revealed));
});

test("new room images are smaller, content-named and preserve their aspect ratios", () => {
  for (const room of rooms) {
    const original = room.variants.at(-1);
    for (const variant of room.variants.slice(0, -1)) {
      assert.match(variant.url, new RegExp(`deep-room-${room.name}-[a-f0-9]{10}-w${variant.width}\\.webp$`));
      assert.equal(fs.statSync(path.join(root, variant.url)).size, variant.bytes);
      assert.ok(Math.abs(variant.height - variant.width * original.height / original.width) <= 1);
      assert.ok(variant.bytes < original.bytes);
    }
  }
});
