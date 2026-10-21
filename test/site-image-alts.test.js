"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyImageAlts, inspectImages, rules } = require("../lib/site/image-alts");
const { startServer, stopServer } = require("./server-test-helpers");

const attr = (node, name) => node.attrs.find((item) => item.name === name)?.value;

test("decorative images have empty alt and aria-hidden without changes to adjacent text, CSS, or JSON-LD", () => {
  const html = `<html><head><style>.phone { width: 20px; }</style><script type="application/ld+json">{"name":"Example"}</script></head><body>
    <a href="tel:+16308127077"><img class='phone' src='images/shynli-phone-cream.svg'>Call us</a>
    <img src="/images/shynli-area-star.svg" alt="Star" aria-hidden="false" />
    <div style="background-image: url('/images/shynli-phone-cream.svg')">Contact</div>
    <script>const example = '<img src="/images/shynli-area-star.svg">';</script>
  </body></html>`;
  const expected = html.replace("class='phone' src='images/shynli-phone-cream.svg'>", "class='phone' src='images/shynli-phone-cream.svg' alt=\"\" aria-hidden=\"true\">")
    .replace('alt="Star" aria-hidden="false"', 'alt="" aria-hidden="true"');
  assert.equal(applyImageAlts(html, "/contacts"), expected);
  assert.equal(applyImageAlts(expected, "/contacts"), expected);
});

test("content room illustrations get distinct descriptions, while existing good alts remain byte-for-byte", () => {
  const html = `<img src="images/shynli-move-area-kitchen.png" alt=""><img src="/images/shynli-move-area-bedroom.png">
    <img src="/images/home-copy-team-960.webp" alt='Our local team &amp; cleaners'>`;
  const output = applyImageAlts(html, "/services/move-in-move-out-cleaning");
  const images = inspectImages(output);
  assert.equal(attr(images[0].node, "alt"), "Kitchen illustration with an island, cabinets, and breakfast stools");
  assert.equal(attr(images[1].node, "alt"), "Bedroom illustration with a double bed and bedside tables");
  assert.notEqual(attr(images[0].node, "alt"), attr(images[1].node, "alt"));
  assert.equal(attr(images[0].node, "aria-hidden"), undefined);
  assert.ok(output.endsWith("<img src=\"/images/home-copy-team-960.webp\" alt='Our local team &amp; cleaners'>"));
});

test("brand links are named and a logo next to the written brand is decorative", () => {
  const html = '<a href="/"><img src="/images/shynli-logo-primary.png" alt="Shynli Cleaning"></a><a href="/"><img src="/images/shynli-footer-logo-light.png">Shynli Cleaning</a>';
  const images = inspectImages(applyImageAlts(html, "/"));
  assert.equal(attr(images[0].node, "alt"), "Shynli Cleaning Service");
  assert.equal(attr(images[1].node, "alt"), "");
  assert.equal(attr(images[1].node, "aria-hidden"), "true");
});

test("image-only links describe their action instead of hiding their only accessible name", () => {
  const html = '<a href="/quote"><img src="/images/shynli-quote-house.png"></a><a href="tel:+16308127077"><img src="/images/shynli-phone-cream.svg"></a>';
  const images = inspectImages(applyImageAlts(html, "/contacts"));
  assert.equal(attr(images[0].node, "alt"), "Get a free quote");
  assert.equal(attr(images[1].node, "alt"), "Call Shynli Cleaning Service");
  assert.equal(attr(images[0].node, "aria-hidden"), undefined);
  assert.equal(attr(images[1].node, "aria-hidden"), undefined);
});

test("city quote illustrations use their own city once and do not invent cities on other pages", () => {
  const html = '<img src="images/shynli-quote-house.png" alt="">';
  for (const [route, city] of [["/naperville", "Naperville"], ["/aurora", "Aurora"], ["/northaurora", "North Aurora"]]) {
    const value = attr(inspectImages(applyImageAlts(html, route))[0].node, "alt");
    assert.equal(value, `House with red porch chairs for a quote in ${city}`);
    assert.equal(value.split(city).length, 2);
  }
  assert.equal(attr(inspectImages(applyImageAlts(html, "/contacts"))[0].node, "alt"), "Small house with red porch chairs and potted plants");
});

test("text badges retain their exact visible wording and unknown or blog images are left untouched", () => {
  const html = '<img src="/images/about-copy-asset-010.png" alt=""><img src="/images/unknown.png" alt="Known description">';
  assert.equal(attr(inspectImages(applyImageAlts(html, "/about-us"))[0].node, "alt"), "Local team");
  assert.ok(applyImageAlts(html, "/about-us").includes('<img src="/images/unknown.png" alt="Known description">'));
  for (const route of ["/blog", "/blog/airbnb", "/blog/checklists/weekly-cleaning-checklist-for-a-3-bedroom-house"]) {
    assert.equal(applyImageAlts(html, route), html);
  }
});

test("lazy originals, HTML escaping, and self-closing tags are handled without reserializing HTML", () => {
  const html = '<img data-original="/images/shynli-quote-house.png" src="data:image/gif;base64,AAAA" />';
  const output = applyImageAlts(html, "/naperville");
  assert.equal(output, '<img data-original="/images/shynli-quote-house.png" src="data:image/gif;base64,AAAA" alt="House with red porch chairs for a quote in Naperville" />');
  assert.equal(applyImageAlts(output, "/naperville"), output);
});

test("every reviewed image rule describes a known role without client information or invented SEO keywords", () => {
  for (const [path, rule] of Object.entries(rules)) {
    assert.match(path, /^\/images\//);
    assert.ok(["logo", "content", "badge", "decorative"].includes(rule.kind), path);
    assert.ok(rule.description, path);
    if (rule.kind === "decorative") assert.equal(rule.alt, "", path);
    else assert.ok(rule.alt, path);
    assert.doesNotMatch(rule.alt, /image of|picture of|best cleaning|\d{3}[) -]?\d{3}[ -]?\d{4}|\b\d+\s+\w+\s+(?:St|Ln|Rd)\b/i, path);
  }
});

test("all sitemap images have alt, and every empty alt is a reviewed decoration hidden from assistive technology", async () => {
  const app = await startServer();
  try {
    const sitemap = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    let count = 0;
    let blogCount = 0;
    for (const route of paths) {
      const response = await fetch(app.baseUrl + route);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      const images = inspectImages(html, route);
      count += images.length;
      if (route === "/blog" || route.startsWith("/blog/")) blogCount += images.length;
      for (const { node, path, alternative } of images) {
        const alt = attr(node, "alt");
        assert.notEqual(alt, undefined, `${route}: ${path}`);
        if (!alt.trim()) {
          assert.equal(attr(node, "aria-hidden"), "true", `${route}: ${path}`);
          assert.equal(alternative?.kind, "decorative", `${route}: ${path}`);
        }
      }
    }
    assert.ok(count >= 818);
    assert.ok(blogCount >= 466);
  } finally {
    await stopServer(app.child);
  }
});
