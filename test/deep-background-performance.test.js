"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("parse5");
const { applyFirstScreenPerformance } = require("../lib/site/first-screen-performance");

const root = path.resolve(__dirname, "..");
const input = '<html><head><script id="tracking">trackExactlyOnce()</script><style id="layout">.dc-why{height:900px;background-color:pink}</style></head><body><div class="dc-hero__visual"></div><section class="dc-section dc-why"><article><p>Existing benefits</p></article></section><section class="dc-section dc-quote"><form action="/quote"><input name="name"><button>Get a quote</button></form></section></body></html>';
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function nodes(html) {
  const result = [];
  function visit(node) { result.push(node); (node.childNodes || []).forEach(visit); }
  visit(parse(html));
  return result;
}

test("Deep hero preloads precede blocking head work without changing sources, priority or analytics", () => {
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  const head = nodes(output).find(node => node.tagName === "head");
  const children = head.childNodes.filter(node => node.tagName);
  const preloads = children.filter(node => attr(node, "rel") === "preload" && attr(node, "as") === "image");
  assert.equal(preloads.length, 2);
  assert.deepEqual(children.slice(0, 2), preloads);
  assert.equal(attr(preloads[0], "media"), "(max-width:980px)");
  assert.equal(attr(preloads[1], "media"), "(min-width:981px)");
  for (const link of preloads) {
    assert.equal(attr(link, "fetchpriority"), "high");
    assert.equal(attr(link, "type"), "image/avif");
  }
  assert.match(attr(preloads[0], "imagesrcset"), /-w480\.avif 1x, .*?-w960\.avif 2x, .*?-w1440\.avif 3x$/);
  assert.ok(output.includes('<script id="tracking">trackExactlyOnce()</script>'));
  assert.equal(applyFirstScreenPerformance(output, "/services/deep-cleaning"), output);
});

test("only the lower Deep sections are deferred and their content, styling and forms survive", () => {
  const output = applyFirstScreenPerformance(input, "/services/deep-cleaning");
  const after = nodes(output);
  const sections = after.filter(node => attr(node, "data-deep-background") !== undefined);
  assert.deepEqual(sections.map(node => attr(node, "class")), ["dc-section dc-why", "dc-section dc-quote"]);
  assert.equal(attr(after.find(node => attr(node, "class") === "dc-hero__visual"), "data-deep-background"), undefined);
  for (const tag of ["form", "input", "button", "p"]) {
    const select = html => nodes(html).filter(node => node.tagName === tag).map(node => ({ attrs: node.attrs, text: node.childNodes.filter(child => child.nodeName === "#text").map(child => child.value) }));
    assert.deepEqual(select(output), select(input));
  }
  assert.ok(output.includes('<style id="layout">.dc-why{height:900px;background-color:pink}</style>'));
  const script = after.find(node => /\/js\/deep-background-media\.js\?/.test(attr(node, "src") || ""));
  assert.ok(script);
  assert.equal(attr(script, "defer"), "");
  const style = after.find(node => attr(node, "id") === "deep-background-media-style");
  assert.ok(style);
  assert.match(style.childNodes[0].value, /@media\(scripting:enabled\)/);
  assert.doesNotMatch(style.childNodes[0].value, /(?:height|width|padding|margin|color|background-color):/);
  for (const route of ["/pricing", "/quote", "/naperville", "/services/regular-cleaning", "/services/deep-cleaning/ads-lp", "/services/deep-cleaning/ads-v2"]) {
    assert.equal(applyFirstScreenPerformance(input, route), input, route);
  }
});

test("incomplete head markup is left untouched rather than adding duplicate or unmatched preloads", () => {
  for (const html of [input.replace("<head>", ""), input.replace("</head>", "")]) {
    const output = applyFirstScreenPerformance(html, "/services/deep-cleaning");
    assert.equal(output, html);
    assert.equal(applyFirstScreenPerformance(output, "/services/deep-cleaning"), output);
  }
});

test("lower Deep backgrounds activate once only near the viewport, with an observer fallback", () => {
  const scriptPath = path.join(root, "js/deep-background-media.js");
  assert.ok(fs.existsSync(scriptPath), "Deep background loader is not implemented");
  function harness(available) {
    const sections = [0, 1].map(() => ({ ready: false, setAttribute(name) { assert.equal(name, "data-background-ready"); this.ready = true; } }));
    let observer;
    class IntersectionObserver {
      constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observer = this; }
      observe(target) { this.targets.add(target); }
      unobserve(target) { this.targets.delete(target); }
    }
    vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), {
      document: { querySelectorAll(selector) { assert.equal(selector, "[data-deep-background]"); return sections; } },
      window: available ? { IntersectionObserver } : {}, IntersectionObserver,
    });
    return { sections, observer };
  }
  const { sections, observer } = harness(true);
  assert.equal(observer.options.rootMargin, "600px 0px");
  assert.ok(sections.every(section => !section.ready));
  observer.callback([{ target: sections[0], isIntersecting: false }]);
  assert.equal(sections[0].ready, false);
  observer.callback([{ target: sections[0], isIntersecting: true }]);
  assert.equal(sections[0].ready, true);
  assert.equal(sections[1].ready, false);
  assert.ok(!observer.targets.has(sections[0]));
  assert.ok(harness(false).sections.every(section => section.ready));
});
