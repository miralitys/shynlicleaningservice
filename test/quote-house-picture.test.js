"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("parse5");
const { applyQuoteHousePicture } = require("../lib/site/quote-house-picture");
const { inspectImages } = require("../lib/site/image-alts");

test("quote house picture preserves exact alt attributes and reserves the original ratio", () => {
  const input = '<div><img class="sg-quote__house" src="images/shynli-quote-house.png" alt="House in St. Charles &amp; nearby" fetchpriority="high"></div>';
  const output = applyQuoteHousePicture(input);
  assert.match(output, /alt="House in St\. Charles &amp; nearby"/);
  assert.match(output, /loading="lazy" decoding="async" width="1680" height="1244"/);
  assert.match(output, /type="image\/webp" srcset="[^"]+648w, [^"]+1296w" sizes=/);
  assert.match(output, /style="display:contents"/);
  assert.match(output, /:where\(picture\[data-quote-house\] > img\)\{height:auto;aspect-ratio:1680\/1244\}/);
  assert.doesNotMatch(output, /fetchpriority|preload/);
  assert.equal(applyQuoteHousePicture(output), output);
});

test("all existing quote image layouts use one picture builder without changing other attributes", () => {
  for (const cls of ["sg-quote__house", "contact-house", "sa-cleaner-cta__house", "quote-art"]) {
    const input = `<img class="${cls}" src="/images/shynli-quote-house.png" alt='' data-existing="keep">`;
    const output = applyQuoteHousePicture(input);
    assert.match(output, /<picture data-quote-house/);
    assert.ok(output.includes(`class="${cls}"`));
    assert.ok(output.includes("alt='' data-existing=\"keep\""));
    assert.equal((output.match(/<source /g) || []).length, 1);
    assert.doesNotThrow(() => parse(output));
  }
});

test("the legacy quote background becomes a lazy image without changing its container or accessible label", () => {
  const input = `<div class="clean-bgimg" style="background-image:url('/images/shynli-quote-house.png');" aria-label='' role="img"> </div>`;
  const output = applyQuoteHousePicture(input);
  assert.ok(output.startsWith('<div class="clean-bgimg" style="" aria-label=\'\' role="img"> '));
  assert.doesNotMatch(output, /background-image/);
  assert.match(output, /alt="" loading="lazy"/);
  assert.match(output, /width:100%;height:100%;object-fit:cover;object-position:center/);
  assert.match(output, /aria-hidden="true"/);
  assert.equal(inspectImages(output)[0].alternative.kind, "decorative");
  assert.equal(applyQuoteHousePicture(output), output);
});

test("unrelated images, text and pages are byte-for-byte unchanged", () => {
  for (const input of ['<img src="/images/other.png" alt="Other">', '<p>shynli-quote-house.png</p>', '<img src="/images/shynli-quote-house.png" class="unrelated" alt="Other">']) {
    assert.equal(applyQuoteHousePicture(input), input);
  }
});

test("new WebP variants stay below 100 KB and original PNG remains available", () => {
  const root = path.resolve(__dirname, "..", "images");
  assert.equal(fs.statSync(path.join(root, "shynli-quote-house.png")).size, 1639302);
  for (const width of [648, 1296]) {
    const image = fs.readFileSync(path.join(root, `shynli-quote-house.w${width}.webp`));
    assert.equal(image.toString("ascii", 0, 4), "RIFF");
    assert.equal(image.toString("ascii", 8, 12), "WEBP");
    assert.ok(image.length < 100000);
  }
});
