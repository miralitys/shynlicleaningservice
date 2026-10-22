# City Pages: Batch Four

Release edition `cities-b4-0b424de2`, based on production commit `ccbe47f7`. Actual publication date configured for the authorized release: 2026-10-22, America/Chicago. The report in this directory is the predeployment verification; production verification is recorded separately after the release is live.

## Scope

Only `/bartlett`, `/clarendonhills`, `/elmhurst`, `/hinsdale`, `/itasca`, `/streamwood`, `/villapark`, `/wayne`, `/willowbrook`, `/winfield`, and `/wooddale` receive the new editorial main content. The finite allowlist reuses the same city renderer as the preceding batches without modifying that renderer or their data.

The original production baseline contains all 300 sitemap HTML pages plus `/quote`, captured before edits in `/tmp/shynli-city-batch-four-before`. A fresh predeployment capture is in `/tmp/shynli-city-batch-four-deploy-before`. All 290 non-target HTML pages match byte for byte, including the preceding forty city pages, home, pricing, quote, service pages, and blog. robots.txt and all sitemap URLs remain unchanged. Only the eleven target lastmod dates change for publication.

On the eleven target pages, title, description, H1, canonical, robots, header, footer, runtime scripts, original styles, images, nearby-area lists, ZIP forms, and contact forms match the baseline. The same existing editorial fit styles used for the previous batches accommodate the fuller text; no new design or shared CSS was introduced. FAQPage is synchronized to the visible FAQ; other JSON-LD nodes are preserved. Existing dateModified fields, if any, will change only when the release has an actual publication date.

No database, admin, customer, order, price, team, payment, schedule, or reminder logic is changed. The unrelated existing modification in `test/admin-route-client-order-prefill.test.js` was left alone.

## Verification

- [Full report and 51x51 matrix](report.md).
- [Machine-readable verification](verification.json).
- Main content only, with header/footer/navigation excluded, city names masked, and five-word shingle Jaccard. All 1,275 distinct pairs are below 40%. Maximum across all 51 pages: 35.59%, Darien / Glen Ellyn. Maximum involving a new page: 32.99%, Willowbrook / Wood Dale.
- Word counts include main text, written review cards, and expandable FAQ answers. They exclude script/style/SVG/aria-hidden content. Range: 1,379-1,400 words.
- For every new page outside FAQ: county statement 1, supplies statement 1, parking statement 1, service-popularity claims 0, typical-home claims 0. Supplies and parking are repeated once in their specific FAQ answers, as allowed. Full-body counts are in verification.json.
- Regular, Deep, Move-In/Move-Out card order on all eleven pages. Existing service links are retained.
- All 23 written review excerpts, names, order, and rail grouping match Naperville. No new city association, stars-only entry, or banned reviewer is added. The existing Eric J. quote contains "look no further"; it remains unchanged because the instruction forbids editing review text. The phrase is absent from new editorial copy.
- The existing `5/5` rating markup is preserved exactly; the review line is `58 Google reviews`.
- No `300+`, `Fox Valley`, `typical home`, or `most booked` remains on the new pages. Wayne has no visible `Lake Michigan`, `water report`, `city water`, or hardness assertion. Hinsdale has no visible water paragraph or water FAQ.
- All target JSON-LD parses, and FAQPage matches the questions and answers in HTML. Nearby lists and forms remain unchanged.
- 139 focused tests passed, zero failures. This is the public-page/city/sitemap/schema/alt regression set, not a claim that every unrelated admin test was rerun.

## Browser Checks

All eleven pages were exercised in Chrome at actual CSS viewports 1440x1000, 390x844, and 360x800. No document-wide horizontal overflow, overlapping tested service/preparation/benefit items, clipped service/hero text, or broken loaded images was found. Pricing button gaps remain 28px on desktop and 24px on mobile.

ZIP lookup and FAQ expansion were tested on every page. Shared ZIP matches remain intact: 60521 returns Hinsdale or Oak Brook, and 60527 returns Burr Ridge or Willowbrook. Nothing in the ZIP map was changed.

Every contact form was tested with synthetic preview data and the reserved number +1 (630) 555-0100. Its existing GET action carried the data to the local `/quote` page. The online calculator opened for all eleven city entries; increasing bedrooms from 1 to 2 changed the displayed estimate from $145 to $157 in each case. No final quote submission, customer record, order, SMS, or production write was made. The preview has isolated storage, no Supabase credentials, and no GHL key.

Browser evidence: `output/playwright/city-batch-four/browser-verification.json`. Final screenshots use `.jpg` and explicit CSS-sized capture rectangles at their actual scroll positions. Example views:

- [Elmhurst desktop](../../output/playwright/city-batch-four/elmhurst-desktop.jpg).
- [Clarendon Hills mobile](../../output/playwright/city-batch-four/clarendonhills-390.jpg).
- [Wayne preparation on mobile](../../output/playwright/city-batch-four/wayne-preparation-360.jpg).

Temporary viewport overrides were reset after testing. The local preview remains available from the URL in the report.

## Facts And Sources

The city-specific source is the owner's complete batch-four brief. The named file `Карточки городов, пачка 4 2026-10-22.md` was not attached, so this report does not claim to have independently checked its linked municipal reports. Each full source line is preserved under the corresponding route in report.md and verification.json.

| Page | County fact from brief | ZIP | Water fact from brief |
| --- | --- | --- | --- |
| Bartlett | Cook, DuPage and Kane | 60103 | Lake Michigan through the DuPage Water Commission |
| Clarendon Hills | DuPage | 60514 | Lake Michigan through the DuPage Water Commission |
| Elmhurst | DuPage and Cook | 60126 | Lake Michigan through the DuPage Water Commission; city report lists hardness of about 8 grains per gallon |
| Hinsdale | DuPage and Cook | 60521 | None; no water text used |
| Itasca | DuPage | 60143 | Lake Michigan through the DuPage Water Commission |
| Streamwood | Cook | 60107 | Lake Michigan purchased from the City of Chicago |
| Villa Park | DuPage | 60181 | Lake Michigan through the DuPage Water Commission |
| Wayne | DuPage and Kane | 60184 | Most homes on private wells; the permitted practical line about marks on faucets and shower glass and attention to fixtures |
| Willowbrook | DuPage | 60527 | Lake Michigan through the DuPage Water Commission |
| Winfield | DuPage | 60190 | Lake Michigan through the DuPage Water Commission |
| Wood Dale | DuPage | 60191 | Lake Michigan through the DuPage Water Commission |

No neighborhood, landmark, school, housing-size profile, booking popularity, client count, team size, company age, response-time claim, new price, or new guarantee was introduced. Numerical hardness appears only for Elmhurst, with the brief's "about" qualifier, once in preparation and once in its water FAQ. No water is called hard or soft. Water wording is varied without changing the supplied facts.

Service-task sources are the existing site pages, fetched read-only and included in the baseline:

- [Regular cleaning](https://shynlicleaningservice.com/services/regular-cleaning): What's Included in Every Regular House Cleaning, Throughout the Home, Kitchen, Bathrooms, Bedrooms & Living Areas, Choose Your Cleaning Schedule, and Customize Your Regular House Cleaning. Sources for maintenance tasks, weekly/bi-weekly/monthly intervals, and separate optional appliance interiors, windows, baseboards, doors, wooden furniture polishing, and linens.
- [Deep cleaning](https://shynlicleaningservice.com/services/deep-cleaning): Is Deep Cleaning Right for You, What's Included in Deep Cleaning, and How Deep Cleaning Differs from Regular. Sources for detailed dusting, hand-wiped baseboards and frames, kitchen degreasing, bathroom tile and grout, and the 2-4 / 4-6 hour planning guides.
- [Moving cleaning](https://shynlicleaningservice.com/services/move-in-move-out-cleaning): What's Included in Move-In / Move-Out Cleaning, Kitchen, All Rooms, For Move-Out, and For Move-In. Sources for closets, interior doors, floors, appliance interiors, emptied cabinets/drawers, and arranging work around removal/arrival of belongings and the final walkthrough. No guarantee of a deposit refund or urgent slot was added.

The supplies, parking, entry, pets, clear-surfaces preparation, and guide-visit wording follow the Naperville model explicitly requested in this brief. Review evidence remains the existing `lib/site/naperville-reviews.json`, not a new collection or attribution.

## Changed Files

- `lib/site/city-batch-four-data.js`: eleven independent city content records and verbatim source lines.
- `lib/site/city-batch-four.js`: finite-route, idempotent rendering wrapper and date allowlist.
- `lib/site/city-batch-four-release.json`: actual publication date, 2026-10-22.
- `lib/site/sanitize.js`: connects the wrapper only for the eleven routes.
- `server.js`: adds the eleven-route publication-date override, inactive until a date is recorded.
- `scripts/audit-city-batch-four.js`: 51-page factual, similarity, isolation, review, form, and schema checks.
- `scripts/mark-city-batch-four-deployment.js`: validates the actual Chicago deployment date and writes only this batch's release metadata.
- `test/city-batch-four.test.js`: route/date isolation, water constraints, page facts, 51-page uniqueness, reviews, schemas, and forms.
- `test/server-smoke.test.js`: recognizes the eleven editorial routes in the existing city assertions.
- `test/site-sanitize-runtime.test.js`: same classification update, with the new FAQ assertions.
- `docs/city-batch-four/README.md`: this scope, source, reproduction, and browser report.
- `docs/city-batch-four/report.md`: generated full matrix, counts, source lines, and isolation results.
- `docs/city-batch-four/verification.json`: generated machine-readable counterpart.

## Reproduce And Publish

With the isolated preview running, rerun:

```sh
node scripts/audit-city-batch-four.js http://127.0.0.1:59115 /tmp/shynli-city-batch-four-deploy-before docs/city-batch-four
node --test test/city-batch-four.test.js test/city-batch-three.test.js test/city-batch-two.test.js test/city-batch-one.test.js test/server-smoke.test.js test/site-sanitize-runtime.test.js test/site-sitemap.test.js test/site-structured-data.test.js test/city-editorial.test.js test/naperville-pilot.test.js test/site-image-alts.test.js
```

Do not invent a publication date in preview. Immediately before an authorized deployment, run `node scripts/mark-city-batch-four-deployment.js YYYY-MM-DD` with the actual Chicago calendar date. It rejects a different day or a replacement date for an already published edition. For this release the date was recorded as 2026-10-22. Rerun the audit after recording that date and after publication. Only the eleven target sitemap lastmod values and any existing dateModified fields should then change; use the separate deployment report for the confirmed production result.
