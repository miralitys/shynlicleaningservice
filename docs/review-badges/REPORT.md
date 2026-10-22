# Review Badge Correction

- Prepared: October 22, 2026.
- Version: `review-badges-827010ea8de2` (SHA-256 prefix of the two runtime source files).
- Base commit: `a5d283b1fb2dc264ce1fee6a5acd9873bb8f9c24`.
- Status: prepared locally, NOT deployed or pushed.
- Preview: http://127.0.0.1:63757/services/deep-cleaning

## Primary Pages

The old wording below was read from live HTML. The replacement is verified in local server-rendered HTML and the browser. The live site still has the old wording until deployment.

| Page | Live HTML before | Preview after |
| --- | --- | --- |
| `/` | 300+ Customer Reviews | 58 Google reviews |
| `/services/deep-cleaning` | 300+ Customer Reviews | 58 Google reviews |
| `/services/airbnb-cleaning` | 300+ Customer Reviews | 58 Google reviews |
| `/services/regular-cleaning` | Customer Reviews 300+ | 58 Google reviews |
| `/services/move-in-move-out-cleaning` | Customer Reviews 300+ | 58 Google reviews |

The count and label now share one non-wrapping badge, including the exported layouts that previously positioned them separately. The city badge's `sg-review-stack` classes, serif number treatment, small label, colors and existing adjacent review icons are reused. Other hero elements are untouched. The rating remains 5/5. Naperville's badge is not a link, and neither were the affected badges, so no new link was introduced.

## All Affected Routes

In addition to the five primary pages, the user approved correcting the same badge on `/about-us`, `/pricing`, `/services/commercial-cleaning` and `/home-simple`.

Advertising copies with the old badge were also corrected:

- `/ads`
- `/pricing-v2`
- `/services/deep-cleaning/ads`
- `/services/deep-cleaning/ads-v2`
- `/services/regular-cleaning/ads`
- `/services/regular-cleaning/ads-v2`
- `/services/move-in-move-out-cleaning/ads`
- `/services/move-in-move-out-cleaning/ads-v2`

Total: 17 changed routes. `/ads-v2`, `/service-areas-v2`, `/cleaners-near-me`, the four `/ads-lp` routes and the other checked routes had no legacy review badge and remain unchanged.

## Verification

- Captured all 308 sitemap pages plus every additional route in `routes.json`: 329 unique addresses, all HTTP 200 after normal redirects.
- All 329 local baseline HTML responses matched the live site byte for byte before edits.
- Compared every updated local response to its live baseline. The only allowed transformations were the identified badge text/count nodes, their accessible label, the exported badge anchor width and badge-scoped CSS. All other HTML was preserved exactly.
- 17 responses changed only as described. The other 312 responses are byte-identical.
- Zero old review-count phrases remain in updated rendered HTML, including split/reversed labels and a second search including scripts and styles with tags removed.
- All JSON-LD scripts are byte-identical and parse successfully. No `aggregateRating` or `reviewCount` properties were found in the 329 live HTML responses. No schema was added or changed.
- All 24 occurrences of `300+ cleanings completed` on the same 19 routes remain unchanged. See `audit.json` for the route/count inventory. Other cleaning-count claims remain untouched as part of the exact HTML comparison.
- Titles, descriptions, other copy, forms, scripts, prices, canonical links, robots directives and sitemap are untouched.
- Browser: all 17 changed routes checked at desktop 1440 px, mobile 390 px and mobile 360 px. Every visible badge stays on one line and inside the viewport, with no overlap with forms, inputs, buttons or quote links. The existing hidden hero badges on the two Deep advertising copies remain hidden; only their HTML wording changed.
- 80 focused and regression tests passed, including sanitizer runtime, structured data, sitemap, robots, image alts, advertising landing pages, cache and footer profiles.
- `git diff --check` passed. The pre-existing change in `test/admin-route-client-order-prefill.test.js` was not touched.

## Files

- `lib/site/review-badges.js`: narrow, idempotent legacy badge normalization using source-offset patches rather than document reserialization.
- `lib/site/sanitize.js`: apply badge correction after structured-data generation, preserving schema.
- `scripts/audit-review-badges.js`: live/local capture, whole-site wording and schema inventory, exact comparison report.
- `test/site-review-badges.test.js`: legacy variants, protected cleaning counts, schema preservation, idempotence and served routes.
- `docs/review-badges/REPORT.md`, `audit.json`, `browser-checks.json`, `preview-desktop.jpg`, `preview-mobile-360.jpg`: report and proof.

## Recheck

```sh
node scripts/audit-review-badges.js https://shynlicleaningservice.com /tmp/review-badges-before
node scripts/audit-review-badges.js http://127.0.0.1:63757 /tmp/review-badges-after
node scripts/audit-review-badges.js --compare /tmp/review-badges-before /tmp/review-badges-after docs/review-badges/audit.json
node --test test/site-review-badges.test.js test/site-footer-profiles.test.js test/site-sanitize-runtime.test.js test/site-structured-data.test.js test/site-sitemap.test.js test/site-seo-robots.test.js test/site-image-alts.test.js test/site-ads-lp-v3.test.js test/site-html-cache.test.js
```

Baseline captures used for this report remain outside the repository in `/tmp/shynli-review-badges-live-before`, `/tmp/shynli-review-badges-local-before` and `/tmp/shynli-review-badges-local-after`. No private customer data or credentials are included in the report.
