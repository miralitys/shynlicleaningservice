"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse, parseFragment } = require("parse5");
const css = require("css-tree");
const { createSiteSanitizer } = require("../lib/site/sanitize");
const { applyFirstScreenPerformance } = require("../lib/site/first-screen-performance");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "js/deep-mobile-cta.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/deep-mobile-cta.css"), "utf8");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function nodes(html) {
  const result = [];
  function visit(node) { result.push(node); (node.childNodes || []).forEach(visit); }
  visit(parse(html));
  return result;
}
const input = '<html><head><script id="tracking">unchanged()</script></head><body><div class="dc-hero__visual"></div><form action="/quote"><button>Get a quote</button></form><script id="mobile-sticky-cta">legacy()</script></body></html>';

test("only Deep replaces the legacy runtime with one server-rendered panel and inline styles", () => {
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  const elements = nodes(output);
  assert.equal(elements.filter(node => attr(node, "id") === "mobileStickyCta").length, 1);
  assert.doesNotMatch(output, /legacy\(\)/);
  assert.ok(output.includes(`<style id="deep-mobile-cta-style">${styles}</style>`));
  assert.match(output, /<script id="mobile-sticky-cta" src="\/js\/deep-mobile-cta\.js\?v=20261117-static-panel" defer><\/script>/);
  assert.equal(elements.filter(node => node.tagName === "script" && attr(node, "id") === "mobile-sticky-cta").length, 1);
  assert.ok(output.includes('<script id="tracking">unchanged()</script>'));
  assert.ok(output.includes('<form action="/quote"><button>Get a quote</button></form>'));
  assert.equal(applyFirstScreenPerformance(output, "/services/deep-cleaning"), output);
  for (const route of ["/", "/quote", "/pricing", "/naperville", "/services/deep-cleaning-copy", "/services/deep-cleaning/ads", "/services/deep-cleaning/ads-lp", "/services/deep-cleaning/ads-v2"]) {
    assert.equal(applyFirstScreenPerformance(input, route), input, route);
  }
  const withoutLegacy = applyFirstScreenPerformance(input.replace(/<script id="mobile-sticky-cta">.*?<\/script>/, ""), "/services/deep-cleaning");
  assert.doesNotMatch(withoutLegacy, /deep-mobile-cta|id="mobileStickyCta"/);
});

test("the panel keeps every legacy CSS rule and both original links and labels", () => {
  const keepHtml = html => html;
  const noSchema = () => null;
  const { sanitizeHtml } = createSiteSanitizer({
    normalizeRoute: route => route,
    siteSeoHelpers: {
      deriveRouteSeo: () => ({}), setTitleTag: keepHtml, setMetaContent: keepHtml,
      setCanonicalLink: keepHtml, upsertJsonLd: keepHtml, buildBreadcrumbSchema: noSchema,
      buildContactSchema: noSchema, buildServiceSchema: noSchema, buildFaqSchema: noSchema,
    },
  });
  const legacy = nodes(sanitizeHtml('<html><head></head><body></body></html>', "/legacy-cta-test")).find(node => attr(node, "id") === "mobile-sticky-cta");
  assert.ok(legacy);
  const appended = [];
  const classList = { toggle() {}, remove() {} };
  const document = {
    readyState: "complete", getElementById: () => null, querySelectorAll: () => [],
    createElement: tag => ({ tag, textContent: "", innerHTML: "", classList }),
    head: { appendChild(element) { appended.push(element); } },
    body: { appendChild(element) { appended.push(element); }, classList },
  };
  const window = { location: { pathname: "/services/deep-cleaning" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  class MutationObserver { observe() {} }
  vm.runInNewContext(legacy.childNodes[0].value, { document, window, MutationObserver, setTimeout() {} });
  const legacyStyle = appended.find(element => element.tag === "style").textContent;
  assert.equal(css.generate(css.parse(styles)), css.generate(css.parse(legacyStyle)));
  const markup = appended.find(element => element.id === "mobileStickyCta").innerHTML;
  const before = parseFragment(markup).childNodes.filter(node => node.tagName === "a");
  const panel = nodes(applyFirstScreenPerformance(input, "/services/deep-cleaning")).find(node => attr(node, "id") === "mobileStickyCta");
  const links = list => list.filter(node => node.tagName === "a").map(node => ({ attrs: node.attrs, text: node.childNodes[0].value }));
  assert.deepEqual(links(panel.childNodes), links(before));
});

function harness({ mobile = true, scroll = 0, height = 800 } = {}) {
  const events = new Map(), frames = [], barClasses = new Set(), bodyClasses = new Set();
  let reads = 0, writes = 0;
  const classList = classes => ({ contains: name => classes.has(name), toggle(name, force) { writes++; force ? classes.add(name) : classes.delete(name); } });
  const bar = { classList: classList(barClasses) };
  const document = { getElementById: name => name === "mobileStickyCta" ? bar : null, body: { classList: classList(bodyClasses) } };
  const media = { matches: mobile, addEventListener(name, callback) { this.change = callback; } };
  const window = {
    scrollY: scroll, matchMedia: () => media,
    get innerHeight() { reads++; return height; },
    requestAnimationFrame(callback) { frames.push(callback); },
    addEventListener(name, callback, options) { events.set(name, { callback, options }); },
  };
  vm.runInNewContext(runtime, { window, document });
  return { window, document, media, events, frames, barClasses, bodyClasses, reads: () => reads, writes: () => writes,
    fire(name) { events.get(name).callback(); }, frame() { frames.shift()(); }, height(value) { height = value; } };
}

test("the original 45-percent threshold is strict, scroll work is coalesced and unchanged states do not write", () => {
  const h = harness();
  assert.equal(h.reads(), 0, "initialization does not force layout before the first paint");
  assert.equal(h.writes(), 0);
  assert.equal(h.frames.length, 0);
  h.window.scrollY = 360;
  h.fire("scroll"); h.frame();
  assert.equal(h.reads(), 1);
  assert.equal(h.barClasses.has("is-visible"), false);
  h.window.scrollY = 361;
  h.fire("scroll"); h.fire("scroll"); h.fire("scroll");
  assert.equal(h.frames.length, 1);
  h.frame();
  assert.ok(h.barClasses.has("is-visible"));
  assert.ok(h.bodyClasses.has("has-mobile-sticky-cta"));
  const writes = h.writes();
  h.window.scrollY = 700;
  h.fire("scroll"); h.frame();
  assert.equal(h.writes(), writes);
  assert.equal(h.reads(), 1, "scroll frames do not read viewport size or element geometry");
  for (const name of ["scroll", "resize", "pageshow"]) assert.equal(h.events.get(name).options.passive, true);
});

test("resizing, desktop transitions and restored scroll positions keep the existing visibility rules", () => {
  const h = harness({ scroll: 400 });
  h.fire("pageshow"); h.frame();
  assert.ok(h.barClasses.has("is-visible"));
  h.height(1000); h.fire("resize"); h.frame();
  assert.equal(h.barClasses.has("is-visible"), false);
  assert.equal(h.bodyClasses.has("has-mobile-sticky-cta"), false);
  h.window.scrollY = 900; h.fire("pageshow"); h.frame();
  assert.ok(h.barClasses.has("is-visible"));
  h.media.matches = false; h.media.change(); h.frame();
  assert.equal(h.barClasses.has("is-visible"), false);
  h.media.matches = true; h.media.change(); h.frame();
  assert.ok(h.barClasses.has("is-visible"));
  const count = h.events.size;
  vm.runInNewContext(runtime, { window: h.window, document: h.document });
  assert.equal(h.events.size, count);
  assert.doesNotMatch(runtime, /MutationObserver|setTimeout|getComputedStyle|getBoundingClientRect|createElement/);
});
