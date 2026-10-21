"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSiteSeoHelpers } = require("../lib/site/seo");

test("indexable ads replace inherited noindex while ad-only and quote routes stay noindex", () => {
  const noindex = ["/quote", "/quote-no-price", "/quote-no-calculator", "/cleaners-near-me/ads-lp",
    "/services/deep-cleaning/ads-lp", "/services/regular-cleaning/ads-lp", "/services/move-in-move-out-cleaning/ads-lp"];
  const helpers = createSiteSeoHelpers({
    BREADCRUMB_LABELS: new Map(), NOINDEX_ROUTES: new Set(noindex), ROUTE_META_OVERRIDES: {},
    SITE_ORIGIN: "https://shynlicleaningservice.com", normalizeRoute: value => value.replace(/\/$/, "") || "/",
    escapeHtmlAttribute: value => value,
  });
  const inherited = '<html><head><meta name="robots" content="noindex, nofollow"></head><body></body></html>';
  for (const route of ["/ads", "/ads-v2", ...["regular", "deep", "move-in-move-out"].flatMap(type =>
    [`/services/${type}-cleaning/ads`, `/services/${type}-cleaning/ads-v2`])]) {
    const seo = helpers.deriveRouteSeo(inherited, route);
    assert.equal(seo.robots, "index,follow", route);
    assert.equal(seo.canonical, `https://shynlicleaningservice.com${route}`);
    const html = helpers.setMetaContent(inherited, "robots", seo.robots);
    assert.doesNotMatch(html, /noindex|nofollow/, route);
  }
  for (const route of noindex) assert.equal(helpers.deriveRouteSeo(inherited, route).robots, "noindex,follow", route);
});

test("Tilda checks reject runtime assets and markup, not legacy image names or selector compatibility code", () => {
  const { assertNoTildaRuntime } = require("./site-markup-helpers");
  assert.doesNotThrow(() => assertNoTildaRuntime('<img src="/images/tild-photo.png"><script>document.querySelector(".t-rec")</script>'));
  for (const html of ['<div class="r t-rec"></div>', '<script src="/js/tilda-zero.min.js"></script>', '<link href="/css/tilda-grid.min.css">']) {
    assert.throws(() => assertNoTildaRuntime(html));
  }
});
