"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("parse5");
const { applyFirstScreenPerformance, HOME_SIZES } = require("../lib/site/first-screen-performance");
const images = require("../lib/site/first-screen-images.json");

const root = path.resolve(__dirname, "..");
const home = fs.readFileSync(path.join(root, "page108488156.html"), "utf8");
const runtime = fs.readFileSync(path.join(root, "js/home-copy-clean.js"), "utf8");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function nodes(html) {
  const result = [];
  function visit(node) { result.push(node); (node.childNodes || []).forEach(visit); }
  visit(parse(html));
  return result;
}

test("home defers only lower backgrounds and retains content, forms, metadata and image geometry", () => {
  const output = applyFirstScreenPerformance(home);
  const before = nodes(home), after = nodes(output);
  for (const tag of ["form", "input", "button", "a", "meta", "h1", "h2", "p"]) {
    const selected = list => list.filter(node => node.tagName === tag).map(node => ({ attrs: node.attrs, text: node.childNodes?.filter(child => child.nodeName === "#text").map(child => child.value) }));
    assert.deepEqual(selected(after), selected(before), tag);
  }
  assert.equal(after.filter(node => attr(node, "data-deferred-media") !== undefined).length, 4);
  assert.match(output, /@media\(scripting:enabled\)/);
  assert.match(output, /data-reviews-paused/);
  assert.match(output, /home-copy-clean\.js\?v=20261116-visible-media/);
  const hero = after.find(node => attr(node, "class") === "hero__team");
  assert.equal(attr(hero, "width"), "1680");
  assert.equal(attr(hero, "height"), "747");
  assert.equal(attr(hero, "alt"), "Shynli Cleaning team");
  assert.equal(attr(hero, "loading"), "eager");
  assert.equal(attr(hero, "fetchpriority"), "high");
  const preload = after.find(node => node.tagName === "link" && attr(node, "as") === "image");
  const source = hero.parentNode.childNodes.find(node => node.tagName === "source");
  assert.equal(attr(preload, "imagesrcset"), attr(source, "srcset"));
  assert.equal(attr(preload, "imagesizes"), HOME_SIZES);
  assert.equal(attr(source, "sizes"), HOME_SIZES);
  assert.equal(attr(preload, "type"), "image/avif");
  assert.ok(hero.parentNode.childNodes.some(node => attr(node, "type") === "image/webp"));
  assert.equal(applyFirstScreenPerformance(output), output);
});

test("Deep hero retains its markup and gets matching responsive high-priority sources", () => {
  const input = '<html><head></head><body><div class="dc-hero__visual" aria-hidden="true"></div><form action="/quote"></form></body></html>';
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  assert.ok(output.includes(input.slice(input.indexOf("<body>"))));
  assert.match(output, /@media\(max-width:980px\)/);
  for (const format of ["avif", "webp"]) for (const width of [480, 960, 1440]) {
    assert.ok(output.includes(images.deep[format].find(item => item.width === width).url));
  }
  assert.equal(nodes(output).filter(node => attr(node, "rel") === "preload" && attr(node, "fetchpriority") === "high").length, 2);
  const mobilePreload = nodes(output).find(node => node.tagName === "link" && attr(node, "media") === "(max-width:980px)");
  assert.deepEqual(attr(mobilePreload, "imagesrcset").split(", ").map(item => item.split(" ").at(-1)), ["1x", "2x", "3x"]);
  assert.equal(attr(mobilePreload, "imagesizes"), undefined);
  assert.doesNotMatch(output, /loading="lazy"|[;{](?:height|width|transform):/);
  assert.equal(applyFirstScreenPerformance(output, "/services/deep-cleaning"), output);
});

test("other routes, including advertisements and calculators, remain byte-for-byte unchanged", () => {
  for (const route of ["/pricing", "/quote", "/ads-v2", "/services/deep-cleaning/ads-v2", "/naperville", "/naperville/deep-cleaning"]) {
    assert.equal(applyFirstScreenPerformance(home, route), home, route);
  }
});

test("Deep reviews pause outside the viewport and in hidden or reduced-motion documents", () => {
  const input = '<html><head></head><body><div class="dc-hero__visual"></div><section class="clients-say-home"><p>Unchanged review</p></section></body></html>';
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  assert.match(output, /class="clients-say-home" data-reviews-paused=""/);
  assert.match(output, /deep-review-visibility\.js\?v=20261116-visible-media/);
  assert.ok(output.includes("<p>Unchanged review</p>"));
  const attrs = new Set(["data-reviews-paused"]), events = new Map();
  const section = { toggleAttribute(name, force) { force ? attrs.add(name) : attrs.delete(name); } };
  const document = { hidden: false, querySelectorAll: () => [section], addEventListener(name, callback) { events.set(name, callback); } };
  const motion = { matches: false, addEventListener(name, callback) { this.change = callback; } };
  let callback;
  class IntersectionObserver { constructor(fn) { callback = fn; } observe() {} }
  const window = { IntersectionObserver, matchMedia: () => motion };
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/deep-review-visibility.js"), "utf8"), { window, document, IntersectionObserver });
  assert.ok(attrs.has("data-reviews-paused"));
  callback([{ target: section, isIntersecting: true }]);
  assert.ok(!attrs.has("data-reviews-paused"));
  document.hidden = true; events.get("visibilitychange")();
  assert.ok(attrs.has("data-reviews-paused"));
  document.hidden = false; events.get("visibilitychange")();
  assert.ok(!attrs.has("data-reviews-paused"));
  motion.matches = true; motion.change();
  assert.ok(attrs.has("data-reviews-paused"));
  motion.matches = false; callback([{ target: section, isIntersecting: false }]);
  assert.ok(attrs.has("data-reviews-paused"));
});

test("responsive files keep original dimensions and use immutable content-based names", () => {
  for (const image of Object.values(images)) for (const [format, variants] of Object.entries(image).filter(([key]) => ["avif", "webp"].includes(key))) {
    for (const variant of variants) {
      assert.match(variant.url, new RegExp(`(?:-[a-f0-9]{10}-w${variant.width}|home-copy-team-${variant.width})\\.${format}$`));
      assert.equal(fs.statSync(path.join(root, variant.url)).size, variant.bytes);
      assert.ok(Math.abs(variant.height - variant.width * image.height / image.width) <= 1);
    }
  }
  assert.ok(images.home.avif.find(item => item.width === 1280).bytes < 60000);
});

function browserHarness({ mobile = true, observer = true } = {}) {
  const intersections = [], resizes = [], frames = new Map(), events = new Map();
  const attrs = new Set(["data-reviews-paused"]);
  const section = { toggleAttribute(name, force) { force ? attrs.add(name) : attrs.delete(name); } };
  let measurements = 0, frameId = 0;
  const rails = [0, 1].map(() => ({
    scrollLeft: 0,
    get scrollWidth() { measurements++; return 2000; },
    get clientWidth() { measurements++; return 360; },
    closest: () => section,
    querySelector: () => ({}),
    addEventListener() {},
  }));
  const deferred = [0, 1].map(() => ({ ready: false, setAttribute() { this.ready = true; } }));
  const mobileQuery = { matches: mobile, addEventListener(name, callback) { this.change = callback; } };
  const reducedQuery = { matches: false, addEventListener(name, callback) { this.change = callback; } };
  const document = {
    body: {}, hidden: false, querySelector: () => null,
    querySelectorAll(selector) { return selector === "[data-deferred-media]" ? deferred : selector === ".clients-say-home__rail" ? rails : []; },
    addEventListener(name, callback) { events.set(name, callback); },
  };
  const window = {
    matchMedia: query => query.includes("639px") ? mobileQuery : reducedQuery,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener() {},
  };
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; intersections.push(this); }
    observe(target) { this.targets.push(target); }
    unobserve(target) { this.targets = this.targets.filter(item => item !== target); }
  }
  class ResizeObserver { constructor(callback) { resizes.push(callback); } observe() {} }
  if (observer) window.IntersectionObserver = IntersectionObserver;
  window.ResizeObserver = ResizeObserver;
  vm.runInNewContext(runtime, { window, document, IntersectionObserver, ResizeObserver, performance: { now: () => 0 } });
  return { intersections, resizes, frames, attrs, rails, deferred, section, events, document, mobileQuery, reducedQuery, measurements: () => measurements,
    frame(time) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time); } };
}

test("lower backgrounds reveal once, only when approaching the section", () => {
  const h = browserHarness(), observer = h.intersections[0];
  assert.equal(observer.options.rootMargin, "600px 0px");
  assert.ok(h.deferred.every(section => !section.ready));
  observer.callback([{ target: h.deferred[0], isIntersecting: false }]);
  assert.equal(h.deferred[0].ready, false);
  observer.callback([{ target: h.deferred[0], isIntersecting: true }]);
  assert.equal(h.deferred[0].ready, true);
  assert.equal(h.deferred[1].ready, false);
  assert.ok(!observer.targets.includes(h.deferred[0]));
});

test("reviews have no offscreen frames or layout reads, and stop when hidden or reduced-motion is enabled", () => {
  const h = browserHarness(), observer = h.intersections[1];
  assert.equal(h.frames.size, 0);
  assert.equal(h.measurements(), 0);
  observer.callback([{ target: h.section, isIntersecting: true }]);
  assert.equal(h.frames.size, 1);
  assert.ok(!h.attrs.has("data-reviews-paused"));
  const reads = h.measurements();
  h.frame(100); h.frame(116); h.frame(132);
  assert.equal(h.measurements(), reads, "geometry must not be read every animation frame");
  assert.ok(h.rails[1].scrollLeft > 0);
  observer.callback([{ target: h.section, isIntersecting: false }]);
  assert.equal(h.frames.size, 0);
  assert.ok(h.attrs.has("data-reviews-paused"));
  observer.callback([{ target: h.section, isIntersecting: true }]);
  h.document.hidden = true; h.events.get("visibilitychange")();
  assert.equal(h.frames.size, 0);
  h.document.hidden = false; h.events.get("visibilitychange")();
  assert.equal(h.frames.size, 1);
  h.reducedQuery.matches = true; h.reducedQuery.change();
  assert.equal(h.frames.size, 0);
});

test("desktop uses CSS animation without a background frame loop and older browsers reveal media", () => {
  const h = browserHarness({ mobile: false });
  h.intersections[1].callback([{ target: h.section, isIntersecting: true }]);
  assert.equal(h.frames.size, 0);
  assert.ok(!h.attrs.has("data-reviews-paused"));
  const fallback = browserHarness({ observer: false });
  assert.ok(fallback.deferred.every(section => section.ready));
});
