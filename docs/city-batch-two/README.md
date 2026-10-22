# City Pages: Batch Two

Prepared October 22, 2026 (America/Chicago). Publication authorized for these ten routes only. Base commit: `5d6100ee`. Content edition: `cities-b2-9551f962`. The production deployment record is saved separately after live verification.

## Preview And Report

- Preview: http://127.0.0.1:58250/shorewood. The ten target routes use this isolated local server.
- [Complete report](report.md): full 28x28 similarity matrix, word counts, constrained-phrase counts and literal source lines for every city.
- [Machine-readable verification](verification.json): all 28-page comparisons, protected markup, facts used, FAQ/schema parity and isolation checks.
- [Browser verification](../../output/playwright/city-batch-two/browser-verification.json): ten desktop and twenty mobile layout checks, long-text panels, ZIP lookups, FAQ and form/calculator results.
- [Form evidence](../../output/playwright/city-batch-two/forms.json).
- Screenshots: `output/playwright/city-batch-two/`, including `<slug>-desktop.png`, `<slug>-390.png`, `<slug>-360.png` and `<slug>-preparation-360.png`.

## Scope And Design

Only Shorewood, Addison, Joliet, Plano, Sandwich, West Chicago, Westmont, Willow Springs, Lisle and Wheaton receive new main text. The renderer and existing styles of the approved city editions are reused without editing their source data, dates or renderer. The new wrapper has an explicit ten-route allowlist and is idempotent.

Visual approach: keep the existing photography, typography, colors, service cards, spacing and page structure. Content follows the approved sequence: introduction, Regular/Deep/Move-In-Move-Out service cards, Homes We Clean, the general written reviews, pricing explanation, practical preparation, original nearby areas, FAQ and original contact form. Existing interactions remain: links, review rails, FAQ expanders, ZIP lookup and GET handoff to the quote calculator. No new animation, layout redesign or changes to shared form/pricing logic are introduced.

All 291 non-target public HTML pages matched the fresh production baseline byte for byte. That includes all 18 previously rewritten cities, `/`, `/pricing`, `/quote`, service pages and the blog. Sitemap URLs and robots.txt remain unchanged. Only the ten target lastmod dates change at publication. The target pages retain title, description, H1, canonical, robots metadata, header/footer/navigation, original image assets, nearby links, both forms, original styles and runtime scripts. Only their FAQPage schema is synchronized with the new questions; other schema data is unchanged apart from existing modification dates if present.

## Text And Similarity

| Page | Visible main words |
| --- | ---: |
| Shorewood | 1383 |
| Addison | 1391 |
| Joliet | 1392 |
| Plano | 1386 |
| Sandwich | 1391 |
| West Chicago | 1395 |
| Westmont | 1384 |
| Willow Springs | 1400 |
| Lisle | 1394 |
| Wheaton | 1392 |

Counts exclude header/footer/navigation, script/style/SVG and aria-hidden content. They include all 23 written reviews and the expandable FAQ answers, consistently with previous batches. The city-name-masked, five-word-shingle Jaccard matrix covers all 28 pages. All 378 distinct pairs are below 40%. The largest value is 33.37%, Westmont versus Woodridge. No old page was rewritten to achieve the threshold.

For every new page, outside FAQ: county-location statement 1, supplies statement 1, parking statement 1, booking-popularity claims 0, typical-home claims 0. The supplies and parking answers repeat the relevant fact once in FAQ, as allowed. DuPage Water Commission is an organization name, not another county-location claim. No 300+, Fox Valley, invented home sizes, local booking counts, guarantees, new prices or urgent-service promises were added. Availability uses only "we check the schedule and confirm the soonest date" once per page.

## Sources And Factual Limits

The complete literal fact line from the owner's message and the actual facts used are recorded for each city in report.md and verification.json. The named file `Карточки городов, пачка 2 2026-10-22.md` was not attached and was not found in Downloads or Desktop/Project. These pages use the supplied message, not a claimed independent review of that missing file or its underlying municipal reports.

- Shorewood: Will County, 60404, well water until the Lake Michigan change planned for 2030.
- Addison: DuPage County, 60101, Lake Michigan through the DuPage Water Commission.
- Joliet: **mostly** Will County, 60431/60432/60433/60435/60436, its own deep and shallow wells until the Lake Michigan change planned for 2030. No additional county is inferred.
- Plano: Kendall County, 60545. No water statement or water FAQ; six FAQ entries rather than seven.
- Sandwich: DeKalb and Kendall counties, 60548, well water.
- West Chicago: DuPage County, 60185, its own wells with treatment at its own plant. No Lake Michigan claim.
- Westmont: DuPage County, 60559, Lake Michigan through the DuPage Water Commission.
- Willow Springs: Cook County, 60480, Lake Michigan through the Justice-Willow Springs Water Commission.
- Lisle: DuPage County, 60532, Lake Michigan through the DuPage Water Commission.
- Wheaton: DuPage County, 60187/60189, Lake Michigan through the DuPage Water Commission.

No hardness, hard-water or soft-water claim appears on any new page. There are no invented neighborhoods, landmarks, schools, business-history facts, team-size claims, local client counts, housing-mix claims or typical homes.

Service descriptions and household details use the existing public checklists, checked on October 22:

- [Regular cleaning](https://shynlicleaningservice.com/services/regular-cleaning), sections What's Included in Every Regular House Cleaning, Throughout the Home, Kitchen, Bathrooms, Bedrooms & Living Areas, Choose Your Cleaning Schedule, and Customize Your Regular House Cleaning. The new texts paraphrase included room care, optional additions, and recurring choices without publishing additional prices.
- [Deep cleaning](https://shynlicleaningservice.com/services/deep-cleaning), sections Is Deep Cleaning Right for You, What's Included in Deep Cleaning, and How Deep Cleaning Differs from Regular. Detail work, first/seasonal cleaning and the regular 2-4 / deep 4-6 hour planning guides come from those sections.
- [Move-in/move-out cleaning](https://shynlicleaningservice.com/services/move-in-move-out-cleaning), sections Is Move Cleaning Right for You, What's Included, For Move-Out and For Move-In. These support who books it, empty storage/appliance interior work, and preparing the property before or after belongings are moved. No deposit or inspection guarantee is stated.

Preparation/access/supplies/parking follow the practical block expressly requested in the brief and the approved Naperville model. Directions to set items aside or leave replacement linen available are preparation guidance, not local characteristics or new cleaning inclusions.

## Reviews

The 23 nonempty Naperville excerpts are preserved verbatim, in exactly the same order and two-rail split. No excerpt is presented as being from one of the ten new cities. Names use the approved first name plus last initial. Stars-only entries and the prohibited reviewers are absent. The existing confirmed `5/5` and `58 Google reviews` remain.

Eric J.'s unchanged review contains "look no further". As in the approved earlier batches, this is a literal customer quotation, not new editorial copy. Changing it would conflict with the instruction to preserve the exact Naperville review list. No such expression appears outside reviews.

## Checks

- 122 focused tests passed, zero failures: batch two, batch one, main seven-city editorial, Naperville, runtime sanitizer, structured data and public-route tests. This is not a claim of a new full admin-suite run. Preview log: `/tmp/shynli-city-batch-two-tests-final.log`; predeployment rerun: `/tmp/shynli-city-batch-two-deploy-tests.log`.
- All ten pages tested at actual CSS widths 1440, 390 and 360px. Local browser zoom is 110%; viewport overrides compensated for it rather than changing the user's zoom. Overrides were reset afterward.
- No horizontal overflow, overlapping tested cards/benefits/preparation items, clipped service/hero text, overflowing tested long-text panels or broken loaded images. Pricing button gaps remain 28px desktop and 24px mobile.
- FAQ expanders and ZIP lookup worked on all ten. Existing shared ZIP results may mention another city as well; mappings were not changed.
- All ten original contact forms transferred the dummy name and reserved test phone to `/quote`; the online calculator opened and changed its estimate from $145 to $157 when bedrooms increased from one to two. Browser tooling redacts sensitive DOM phone fields, so phone handoff was verified from the GET query rather than a redacted field value. The final quote was never submitted.
- The preview server uses isolated test storage, blank production database/GHL credentials and disabled recurring-order maintenance. No real clients, orders, teams, sums, payments or messages were changed.
- Every target JSON-LD block parses, FAQPage agrees with visible FAQ, exact review parity holds, and all protected-markup comparisons passed.

## Changed Files

- `lib/site/city-batch-two-data.js`: ten city-specific texts, exact source lines and allowed facts.
- `lib/site/city-batch-two.js`: allowlisted wrapper using the existing renderer and approved general reviews.
- `lib/site/city-batch-two-release.json`: actual publication date, October 22, 2026 (America/Chicago).
- `lib/site/sanitize.js`: batch-two hook only for these ten routes.
- `server.js`: lastmod override restricted to these ten pages and their explicit publication date.
- `scripts/audit-city-batch-two.js`: 28-page matrix and ten-route isolation audit.
- `scripts/audit-city-editorial.js`: optional no-water-city audit parameter; existing batch-one default remains Lockport.
- `scripts/mark-city-batch-two-deployment.js`: actual Chicago publication-date guard for these ten pages only.
- `test/city-batch-two.test.js`: facts, review parity, dates, schemas, forms, idempotence, exclusions and all 378 distinct similarity comparisons.
- `test/server-smoke.test.js`, `test/site-sanitize-runtime.test.js`: recognize the ten new editorial editions while retaining existing checks for other cities and forms.
- `docs/city-batch-two/README.md`, `report.md`, `verification.json`: report, matrix, facts and evidence.

The pre-existing client-order-prefill test edit and older deployment reports are excluded from this release.

## Reproduction And Publication Dates

```sh
node scripts/audit-city-batch-two.js http://127.0.0.1:58250 /tmp/shynli-city-batch-two-before docs/city-batch-two
node --test --test-concurrency=1 test/city-batch-two.test.js test/city-batch-one.test.js test/city-editorial.test.js test/naperville-pilot.test.js test/site-sanitize-runtime.test.js test/site-structured-data.test.js test/server-smoke.test.js
```

The original baseline contains all 300 sitemap pages plus `/quote`, captured before edits. A fresh predeployment capture is at `/tmp/shynli-city-batch-two-deploy-before`. No date is invented during preview. Only immediately before an authorized deployment should this be run with the actual Chicago date:

```sh
node scripts/mark-city-batch-two-deployment.js YYYY-MM-DD
```

That command rejects a different calendar day and attempts to refresh an already published edition's date. It activates only these ten lastmod overrides and updates existing dateModified fields on those routes, if any. It does not add a new schema date field or change the prior 18 editions' dates. A fresh production comparison should follow publication.
