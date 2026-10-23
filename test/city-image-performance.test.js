"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { applyCityImagePerformance, MAP_URL, ICONS } = require("../lib/site/city-image-performance");
const { applyModernImages, originalImagePath } = require("../lib/site/modern-images");
const { inspectImages } = require("../lib/site/image-alts");

test("city map becomes lazy without changing pin markup or positioning rules", () => {
  const css = '.sg-map{position:relative;height:600px}.sg-map::before{content:"";position:absolute;left:50%;width:916px;aspect-ratio:916/644;background:url("images/shynli-sugargrove-area-map.svg") center top/contain no-repeat}@media(max-width:479px){.sg-map::before{width:644px}}';
  const pins = '<div class="sg-map__dots"><a href="/naperville" style="left:25%;top:40%">Naperville</a></div>';
  const input = `<html><head><style>${css}</style></head><body><div class="sg-map">${pins}</div></body></html>`;
  const output = applyCityImagePerformance(input);
  assert.ok(output.includes(pins));
  assert.ok(output.includes('position:absolute;left:50%;width:916px;aspect-ratio:916/644;background:none'));
  assert.match(output, /\.sg-map > \.sg-map-image\{width:644px\}/);
  assert.doesNotMatch(output, /sg-map::before|url\("images\/shynli-sugargrove-area-map/);
  assert.ok(output.includes(`src="${MAP_URL}"`));
  assert.match(output, /alt="" aria-hidden="true" loading="lazy" decoding="async" width="916" height="644"/);
  assert.equal(inspectImages(output)[0].alternative.kind, "decorative");
  assert.equal(applyCityImagePerformance(output), output);
});

test("mobile hero is responsive in head without making it lazy or changing its box", () => {
  const markup = '<div class="sg-hero__people" role="img" aria-label="Original team"></div>';
  const output = applyCityImagePerformance(`<html><head></head><body>${markup}</body></html>`);
  assert.ok(output.includes(markup));
  assert.match(output, /w384\.webp.*1x.*w768\.webp.*2x.*w1152\.webp.*3x/);
  assert.ok(output.indexOf('id="city-mobile-hero-images"') < output.indexOf("</head>"));
  assert.doesNotMatch(output, /loading="lazy"|IntersectionObserver/);
  assert.equal(applyCityImagePerformance(output), output);
});

test("favicon and Apple touch icon are separate correctly sized assets", () => {
  const output = applyCityImagePerformance('<head><link rel="icon" href="/images/shynli-icon-32.png"><link rel="apple-touch-icon" href="/images/shynli-icon-32.png"></head>');
  for (const [key, size] of [["favicon", 32], ["retina", 64], ["apple", 180]]) {
    assert.ok(output.includes(`href="${ICONS[key]}" sizes="${size}x${size}"`));
    const data = fs.readFileSync(path.join(__dirname, "..", ICONS[key]));
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
  assert.doesNotMatch(output, /href="\/images\/shynli-icon-32\.png"/);
});

test("only city pages get a smaller desktop hero with the existing Retina and mobile variants", () => {
  const input = '<html><head></head><body><div class="sg-hero__people" role="img" aria-label="Team"></div></body></html>';
  const output = applyCityImagePerformance(input, "/naperville");
  assert.match(output, /id="city-desktop-hero-images">.*@media\(min-width:480px\)/);
  assert.match(output, /\.shynli-site-header__logo img\{aspect-ratio:320\/91\}/);
  assert.match(output, /w1280\.webp"\) 1x,url\("[^\"]*w1680\.webp"\) 2x/);
  assert.match(output, /w384\.webp.*1x.*w768\.webp.*2x.*w1152\.webp.*3x/);
  assert.equal(applyCityImagePerformance(output, "/naperville"), output);
  for (const route of ["/", "/pricing", "/quote", "/naperville/deep-cleaning"]) {
    assert.doesNotMatch(applyCityImagePerformance(input, route), /city-desktop-hero-images/);
  }
});

test("city header picture sizes match the CSS without changing its images or dimensions", () => {
  const logo = '<a class="shynli-site-header__logo" href="/"><picture><source srcset="/images/home-copy-logo-160.webp 160w, /images/home-copy-logo-320.webp 320w" type="image/webp"><img src="/images/logo.png" alt="Shynli Cleaning" width="2355" height="669"></picture></a>';
  const input = `<html><head></head><body><div class="sg-hero__people"></div>${logo}</body></html>`;
  const output = applyCityImagePerformance(input, "/plainfield");
  const sizes = ' sizes="(max-width:639px) 124px, (max-width:1080px) 110px, 96px"';
  assert.equal(output.split(sizes).length - 1, 2);
  assert.ok(output.replaceAll(sizes, "").includes(logo));
  assert.equal(applyCityImagePerformance(output, "/plainfield"), output);
  assert.ok(applyCityImagePerformance(input, "/pricing").includes(logo));
});

test("small white SVG stays vector with unchanged alt and original mapping", () => {
  const output = applyModernImages('<img src="/images/shynli-logo-icon-white.svg" alt="" aria-hidden="true">', "/naperville");
  const url = output.match(/src="([^"]+)"/)[1];
  assert.match(url, /optimized\/shynli-logo-icon-white-.*\.svg$/);
  assert.equal(originalImagePath(url), "/images/shynli-logo-icon-white.svg");
  const data = fs.readFileSync(path.join(__dirname, "..", url), "utf8");
  assert.ok(data.length < 20000);
  assert.match(data, /viewBox=/);
  assert.ok(output.includes('alt="" aria-hidden="true"'));
});

test("unrelated content and icons remain byte-for-byte unchanged", () => {
  const input = '<html><head><link rel="icon" href="/other.png"><meta name="description" content="Keep"></head><body><form action="/quote"><input name="phone"></form><script type="application/ld+json">{"image":"/images/other.png"}</script></body></html>';
  assert.equal(applyCityImagePerformance(input), input);
});
