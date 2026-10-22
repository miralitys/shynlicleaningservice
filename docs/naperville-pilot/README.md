# Naperville Pilot Release

Prepared on October 21, 2026 (Chicago). Base commit: `1bfb0d9c`.
Deployment authorized after local review. Live verification is recorded separately in the deployment report.

## Final Direction

The first draft rearranged the page too much and used overly short labels. The user rejected it and clarified that they wanted **more substantial copy, not larger fonts**.

The revised version keeps the original Naperville hero artwork, review counters and icons, two-column services header, three service cards and their links, numbered benefits, team icons, FAQ layout, nearby-area block, quote form, header, footer, fonts, colors and spacing rules. Service cards can grow to fit the expanded copy. The five pricing explanation cards are replaced with the short pricing paragraph and existing buttons as requested in the brief.

Reviews use the existing site review-card design, not the first draft's plain tiles. Both rows can be scrolled; automatic drifting is disabled on this page so the local reviews remain first. Existing styles are preserved; only Naperville-specific content fitting and the copied review component styles are added.

Following the preview feedback, the hero rating uses `5/5`, benefit 03 describes cleaning options instead of repeating ZIP codes, and the pricing header and paragraph are centered. Pricing buttons have a 28px top gap on desktop and 24px on mobile. The three team-icon benefits use a Naperville-only responsive grid instead of the original absolute coordinates, preventing longer labels from overlapping. Fonts and icons are unchanged. Two questions from the existing home FAQ were added: one-time cleaning and recurring cleaning; FAQPage was synchronized.

Local preview: http://127.0.0.1:58250/naperville

## Content And Sources

The line numbers refer to the supplied file `Промпт_агенту_сайта,_уникальный_текст_Naperville_пилот_2026_10.txt`.

| Fact or content | Brief source |
| --- | --- |
| Naperville and nearby communities in DuPage and Will counties | Lines 15, 29 |
| ZIP codes 60540, 60563, 60564, 60565 | Lines 29, 36 |
| Condos, apartments and five-bedroom houses | Lines 31, 35 |
| Typical home: three bedrooms and 2.5 bathrooms | Line 31 |
| Service booking order: deep, regular, move-in/move-out | Line 30 |
| Deep cleaning and move-in/move-out available before or after moving | Line 37 |
| Lake Michigan water supplied through the DuPage Water Commission | Lines 32-33 |
| All cleaning supplies and equipment brought by the cleaners | Line 39 |
| Parking discussed before the first cleaning | Line 40 |
| 58 Google reviews | Line 14; independently checked on the public Google listing |
| Google rating displayed as 5/5 | Line 14 permits a verified rating; the public listing showed 5.0 and 58 reviews |
| Local review order: Amy K., Erika B., Eric J., MaryLouise O. | Line 42 |
| Reviewer exclusions and original public review wording | Lines 45-46 |
| Short pricing explanation, link to existing pricing page, no new amounts | Line 23 |
| Unchanged nearby links and quote form | Line 25 |
| One-time and recurring cleaning FAQ | Existing homepage FAQ in `page108488156.html`; explicitly requested by the user after preview |

Google source: https://www.google.com/maps?cid=9307087877612204108 (checked in Chrome on October 21, 2026).

The water URL provided in the brief now opens the city's redesign 404 page in a live browser. The indexed official page still confirms the same water-supply fact:
https://www.naperville.il.us/services/water-utility/your-water-service/water-supply/
No broken outbound link was added. No hardness/softness claim or other water facts were added.

No neighborhoods, landmarks, schools, company history, cleaning/client counts, team-size claims, response-time promises, new prices or guarantees were introduced. Existing contact details and neighboring-city links remain unchanged.

## Reviews

The site previously reused 24 review entries. The disallowed Mobile Legends Jek entry is excluded; Eric J., explicitly requested by the brief, is included. The resulting block has 24 unique reviews: all 23 allowed previously reused reviews plus Eric J.

Names are first name and last initial only. Excerpts are literal portions of the public originals, at most 25 words per author, with a Google source link. These are labeled as excerpts, not paraphrases or complete reviews. MaryLouise O. has no written review in Google: her card explicitly says "5-star Google rating. No written comment." and "Google rating only" instead of presenting an empty card or inventing a quote. No addresses, contact information, reviewer profiles or client metadata are shown.

## Similarity

Main content only; header/footer/navigation/scripts/styles excluded. City names are replaced with a common token; five-word shingles use lowercase Unicode words/numbers; similarity is set Jaccard, not a claim about Google's ranking algorithm.

| Comparison | Full main content | Without reviews |
| --- | ---: | ---: |
| Plainfield | 5.60% | 7.51% |
| Aurora | 5.61% | 7.53% |
| Bolingbrook | 5.62% | 7.53% |
| Yorkville | 5.61% | 7.53% |
| Oswego | 5.61% | 7.52% |
| Lombard | 5.63% | 7.54% |
| Batavia | 5.63% | 7.56% |

All seven comparisons are below 40%, including when the new reviews are excluded. Main editorial copy is approximately 678 words; including all review text and review labels, the HTML main content is approximately 1,115 words. The fuller copy follows the user's subsequent clarification.

## Verification

- Release suite: 777 passed, zero failed or skipped. Five regression tests were added, including preservation of existing published dates across hosting rebuilds; old city-template expectations were updated for Naperville only.
- All 300 other snapshot routes, including the 299 other sitemap pages and `/quote`, were byte-identical in the local comparison.
- `/plainfield`, `/aurora`, `/`, `/pricing`, the blog and service pages were unchanged.
- Naperville header, footer, nearby-area block, complete quote section, images, existing stylesheets/styles, runtime JavaScript, robots/canonical and all non-FAQ JSON-LD were unchanged.
- FAQPage now matches the seven visible questions. This extra JSON-LD change was explicitly approved by the user.
- No aggregateRating was added; the original page did not contain one.
- `300+` and `Fox Valley` are absent from Naperville.
- ZIP 60540 lookup worked in Chrome. FAQ opened correctly. The form's name/phone fields validated; its visible quote button opened `/quote`.
- The unchanged `/pricing` calculator responded to changing service and home parameters. No test order or real client was submitted.
- The original and revised service sections were visually compared in Chrome; the service-card text fits without clipping. The pricing section and icon benefits were inspected on desktop and in an iPhone-sized Chrome viewport (357px CSS width at the existing 110% zoom). The mobile document width matches its viewport; the icon labels stack without overlaps and pricing text is centered. The two new FAQ entries are present and the recurring-cleaning answer opens correctly.
- Desktop DOM measurements: pricing paragraph-to-buttons gap 28px; icon-benefit rectangles do not intersect. Mobile computed button top margin: 24px. Temporary viewport settings were reset after verification.
- Screenshots: `output/playwright/naperville-pilot/services-desktop.png`, `pricing-centered-desktop.png`, `benefits-desktop.png`, `pricing-mobile.png`, `benefits-mobile.png`.
- Machine-readable comparison: `verification.json`.
- Release test output: `/tmp/shynli-naperville-deploy-tests.log`.

## Dates And Deployment

The release day is October 21, 2026 in Chicago, recorded explicitly in `naperville-release.json` for the authorized deployment. The existing page has no `dateModified` field to update, so none was added.

When deployment is authorized, record its actual Chicago day using:

```sh
node scripts/mark-naperville-deployment.js YYYY-MM-DD
```

That prepares a lastmod override for Naperville only. `sitemap-preserved-lastmod.json` retains the exact predeployment public timestamps for untouched non-blog pages, avoiding the host's asset-mtime fallback changing those dates during a rebuild. Blog dates retain their existing editorial overrides. Only Naperville receives a new lastmod.

The public predeployment snapshot and postdeployment comparison are reproducible with `scripts/verify-naperville-deployment.js before|after BASELINE_DIRECTORY`. The baseline includes all 300 sitemap pages plus `/quote`, robots.txt, and sitemap.xml. No admin or client data is fetched.

To rerun the local full-page comparison while the original snapshot exists:

```sh
node scripts/audit-naperville-pilot.js http://127.0.0.1:58250 /tmp/shynli-naperville-before
```

## Changed Files

- `lib/site/naperville-pilot.js`: route-only content rewrite retaining the original design.
- `lib/site/naperville-reviews.json`: verified public review excerpts and initials.
- `lib/site/naperville-release.json`: explicit, currently unset deployment date.
- `lib/site/sanitize.js`: invokes the rewrite only for Naperville; other pages retain their rendering path.
- `server.js`: optional Naperville-only sitemap date override.
- `lib/site/sitemap-preserved-lastmod.json`: existing published dates for untouched non-blog pages, not new editorial dates.
- `scripts/audit-naperville-pilot.js`: reproducible similarity and protected-content comparison.
- `scripts/mark-naperville-deployment.js`: validates the real deployment day.
- `scripts/verify-naperville-deployment.js`: fresh public baseline capture and complete live comparison.
- `test/naperville-pilot.test.js`: content, isolation, design structure, reviews, dates and similarity regressions.
- `test/site-sanitize-runtime.test.js`, `test/server-smoke.test.js`: Naperville-specific assertions; other city assertions retained.
- `docs/naperville-pilot/README.md`, `docs/naperville-pilot/verification.json`: report and evidence.

Unrelated pre-existing changes were not reverted or included. No production data or settings were changed.
