# Correct Yelp Profile

Correct destination: https://www.yelp.com/biz/shynli-cleaning-naperville-2

The user explicitly authorized publishing this correction together with the eight prepared service-city pages, button styling and compact spacing. The production commit and live verification are recorded in the postdeployment report, not assumed here.

## Yelp Scope

The Yelp correction itself is a literal URL substitution only. Before/after copies of every affected file are preserved outside the repository at `/tmp/shynli-yelp-link-before`, with an exact-substitution check in `change-report.json`. Fifteen files were normalized, including seven ignored local browser/report artifacts; 1,015 URL references in total. Original historical evidence is retained in that external archive. Updating report references is not presented as a rerun of those historical platform checks.

Eight tracked files contain the URL substitution:

- `lib/site/sanitize.js`: shared footer URL, with target, rel and aria-label unchanged.
- `lib/site/structured-data.js`: the existing home business sameAs Yelp entry.
- `scripts/audit-footer-profiles.js`: expected destination.
- `test/site-footer-profiles.test.js`: expected destination.
- `test/site-structured-data.test.js`: expected business sameAs destination.
- `docs/footer-profiles/report.md`: saved URL reference only.
- `docs/footer-profiles/verification.json`: saved URL references only.
- `docs/seo-schema/final-home.json`: saved sameAs reference only.

No additional sameAs entries are introduced. City and pricing pages that reference the common business by ID retain that structure. Aurora keeps its own Google Service sameAs. Where a Yelp sameAs entry already existed, its destination is corrected; the other profile URLs are untouched.

## Checks

- Whole working-repository search, including ignored output files and excluding Git history, returns zero occurrences of the obsolete Yelp slug.
- Exact-substitution verification: all fifteen affected files match their archived contents with only the authorized URL replacement.
- The new URL opened the normal Yelp business page headed Shynli Cleaning in Chrome. Fresh evidence: `output/playwright/combined-service-city-yelp/yelp-destination.json`.
- Existing footer and structured-data tests now require the corrected destination; target `_blank`, rel `noopener`, accessible label Shynli Cleaning on Yelp and absence of nofollow are preserved.
- No prices, orders, client records, staff, reminders, forms or calculator changes are part of the Yelp correction.

## Combined Release

The eight new pages and their separately authorized parent-page links are described in `docs/service-city/README.md`. Their actual publication date is October 22, 2026. The unrelated preexisting edit to `test/admin-route-client-order-prefill.test.js` and previous local deployment reports must not be included.

After Render is Live, check the public home, Naperville, Aurora and pricing pages: corrected footer destination and link attributes, JSON-LD parses, only the existing Yelp sameAs value changes, and the separate Aurora Google entry is preserved. Compare all 313 existing pages against the captured baseline after the approved Yelp-only normalization and the six explicit parent-link additions.
