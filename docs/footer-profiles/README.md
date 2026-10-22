# Footer Business Profile Links

Release edition: `footer-profiles-33d9eb28`, based on production commit `18a52ece`. The reports in this directory are predeployment verification. Production verification is recorded separately after the authorized release is live. No page publication dates are changed by this footer-only release.

## Change

A small, wrapping `Find us on` group is added between the existing footer columns and copyright area. It uses visible Google, Yelp, BBB, Thumbtack, and Nextdoor text labels, the existing font and monochrome footer palette, and no logos, new colors, JavaScript, or third-party assets.

All five links have `target="_blank"`, `rel="noopener"`, and company-specific accessible labels such as `Shynli Cleaning on Google`. None has `nofollow`. Existing page-level robots directives are not changed.

The Google href is exactly `https://www.google.com/maps?cid=5408416184318024401` on `/aurora` only. Every other footer uses `https://www.google.com/maps?cid=9307087877612204108`. The other four URLs are exactly those supplied in the request.

Both the normal footer and the advertising v2 footer use the same row. Blog pages, service and city pages, legal pages, and quote variants inherit the existing shared footer. The site's existing 404 footer is covered by a regression test. No footer is introduced into admin or footerless authentication callback shells.

## Isolation

Before edits, a read-only production capture was saved in `/tmp/shynli-footer-profiles-before`: 300 sitemap pages and 13 additional noindex/quote/advertising variants, 313 pages total.

A fresh predeployment capture is saved in `/tmp/shynli-footer-profiles-deploy-before` for the authorized deployment and production comparison.

The local audit confirms all 313 pages:

- Have one existing footer and exactly one five-link profile group.
- Match the baseline byte for byte outside the footer and its scoped style block.
- Preserve the old footer byte for byte after removing only the new profile group. Existing footer navigation and copy are unchanged.
- Preserve all old footer CSS after removing only the four new profile-specific rule lines.
- Preserve every JSON-LD script byte for byte.

This includes the specifically requested `/`, `/naperville`, and `/pricing`, plus the Aurora exception. The full sitemap and robots.txt are byte-identical to production, including all dates. No header, main navigation, main content, form, calculator, price, URL, image, schema, or publication date was changed.

The existing home business JSON-LD already contains all five supplied profile URLs, and Aurora's Service already contains its own Google profile. Nothing needed adding, so `lib/site/structured-data.js` and all JSON-LD were left untouched.

## Platform Checks

All six destinations, including the separate Aurora Google listing, were opened by clicking the actual footer anchors. Each click created a separate browser tab without replacing the site page.

| Destination | HTTP Check | Normal Browser Result |
| --- | --- | --- |
| Google | 200 | Shynli Cleaning Service business card, with the company's website and phone |
| Aurora Google | 200 | Shynli Cleaning Service Aurora business card; website points to /aurora |
| Yelp | Automated request: 403 | Its standard device check completed automatically, then Shiny Naperville House Cleaning Service loaded at the supplied URL |
| BBB | 200 | Shynli Cleaning Service business profile |
| Thumbtack | 200 | Shynli Cleaning Service profile |
| Nextdoor | 200 | Shynli Cleaning Service business page |

No CAPTCHA was solved and no profile, review, account, cookie preference, or business setting was changed. The Yelp browser success is not represented as an automated HTTP 200.

## Browser And Test Results

Chrome checks covered eleven representative page variants at 1440x1000, 390x844, and 360x800: home, Naperville, Aurora, pricing, blog index, a blog article, regular-cleaning service, Service Areas, quote, legal, and advertising v2. The row is 32px tall on desktop and naturally wraps to 68px on mobile. No overlap among its children or with the existing footer sections, no out-of-row link bounds, and no horizontal document overflow was found. Link colors match existing footer links. Temporary viewport overrides were reset afterward.

All 140 focused public-page, footer, city, sitemap, structured-data, and image-alt tests passed. Test log: `/tmp/shynli-footer-profiles-full-tests.log`. No claim is made that unrelated admin tests were rerun; the existing unrelated edit in `test/admin-route-client-order-prefill.test.js` was not touched.

No contact form or quote was submitted. The preview uses isolated storage with no Supabase credentials or GHL key.

## Files

- `lib/site/sanitize.js`: shared profile row, four scoped CSS rules, and the route passed into the footer for Aurora.
- `test/site-footer-profiles.test.js`: profile URLs, accessible labels, new-tab/follow attributes, normal and v2 variants, 404, and existing sameAs coverage.
- `scripts/audit-footer-profiles.js`: structured HTML comparison across the 313-page baseline, checks of original footer/CSS and JSON-LD preservation, and unchanged sitemap/robots.
- `docs/footer-profiles/README.md`: this report.
- `docs/footer-profiles/report.md`: generated summary and requested page comparisons.
- `docs/footer-profiles/verification.json`: per-page machine-readable checks.

Browser artifacts are in `output/playwright/footer-profiles/`: `browser-verification.json`, `platform-checks.json`, and desktop/mobile screenshots for each representative variant.

## Reproduce

With the isolated preview running:

```sh
node scripts/audit-footer-profiles.js http://127.0.0.1:59630 /tmp/shynli-footer-profiles-deploy-before docs/footer-profiles
node --test test/site-footer-profiles.test.js test/city-batch-four.test.js test/city-batch-three.test.js test/city-batch-two.test.js test/city-batch-one.test.js test/server-smoke.test.js test/site-sanitize-runtime.test.js test/site-sitemap.test.js test/site-structured-data.test.js test/city-editorial.test.js test/naperville-pilot.test.js test/site-image-alts.test.js
```

Local preview: `http://127.0.0.1:59630/`. See the separate deployment report for the confirmed live result; these predeployment reports do not themselves prove publication.
