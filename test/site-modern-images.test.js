"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { applyModernImages, rewriteModernCss, originalImagePath, manifest } = require("../lib/site/modern-images");
const { inspectHtml } = require("../lib/site/structured-data");
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;

test("modern assets retain originals, aspect ratios and a measured two-times size limit", () => {
  for (const [original, image] of Object.entries(manifest.images)) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", original)), original);
    if (!image.modern) continue;
    assert.ok(image.variants.length, original);
    for (const variant of image.variants) {
      assert.ok(fs.existsSync(path.join(__dirname, "..", variant.url)), variant.url);
      assert.ok(variant.width <= image.width, original);
      if (image.displayWidth) assert.ok(variant.width <= Math.ceil(image.displayWidth * 2), original);
      assert.ok(Math.abs(variant.height - variant.width * image.height / image.width) <= 1, original);
      assert.equal(originalImagePath(variant.url), original);
    }
  }
});

test("changes only rendered image attributes and CSS URLs, not metadata, forms or tracking", () => {
  const html = '<header><img src="/images/shynli-logo-primary.png" alt="Shynli"></header>'
    + '<main><img class="hero-image" src="/images/shynli-move-cleaning-hero.png" alt="Team"></main><footer><img src="/images/shynli-footer-logo-light.png" alt="Footer"></footer>'
    + '<meta property="og:image" content="/images/shynli-og-photo.png"><link rel="icon" href="/images/shynli-icon-32.png">'
    + '<script type="application/ld+json">{"image":"/images/home-copy-team.png"}</script>'
    + '<form action="/quote"><input name="phone"><button>Submit</button></form><script id="shynli-tracking-script">dataLayer.push({event:"lead_call_click_website"})</script>';
  const after = applyModernImages(html, "/");
  const images = inspectHtml(after).nodes.filter(n => n.tagName === "img");
  for (const img of images) {
    assert.match(attr(img, "src"), /\.webp$/);
    assert.ok(Number(attr(img, "width")) > 0);
    assert.ok(Number(attr(img, "height")) > 0);
  }
  assert.equal(attr(images[0], "loading"), "eager");
  assert.equal(attr(images[1], "loading"), "eager");
  assert.equal(attr(images[2], "loading"), "lazy");
  assert.ok(after.includes(html.slice(html.indexOf("<meta"))));
  assert.equal(applyModernImages(after, "/"), after);
  assert.match(rewriteModernCss('.a{color:red;background:url("/images/shynli-move-cleaning-hero.png");padding:8px}'), /color:red;background:url\(\/images\/optimized\/.*\.webp\);padding:8px/);
});

test("preserves fixed display dimensions and updates picture sources without PNG downloads", () => {
  const html = '<picture><source type="image/png" srcset="/images/shynli-logo-primary.png 640w"><img src="/images/shynli-logo-primary.png" width="124" height="47" alt="Shynli"></picture>';
  const result = applyModernImages(html, "/");
  assert.match(result, /type="image\/webp"/);
  assert.match(result, /width="124" height="47"/);
  assert.doesNotMatch(result, /\.png/);
  assert.equal(applyModernImages(result, "/"), result);
});
