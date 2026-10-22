# City Pages: Batch Three

Prepared October 22, 2026, America/Chicago. Publication authorized for these twelve routes only. Base commit: `884285c4`. Content edition: `cities-b3-74e07b4d`. The final production deployment record is saved separately after live verification.

## Preview And Evidence

- Preview: http://127.0.0.1:58250/bigrock. The other eleven target routes are available on this isolated local server.
- [Full report](report.md): complete 40x40 similarity matrix, visible word counts, constrained-phrase counts and the literal source line for every location.
- [Machine-readable verification](verification.json): facts used, all comparisons, protected markup, reviews, FAQ/schema parity, dates and isolation checks.
- [Browser verification](../../output/playwright/city-batch-three/browser-verification.json): twelve desktop and twenty-four mobile layout checks, long-text panels, forms, ZIP and FAQ interactions.
- [Contact/calculator evidence](../../output/playwright/city-batch-three/forms.json).
- Screenshots are under `output/playwright/city-batch-three/`: `<slug>-desktop.png`, `<slug>-390.png`, `<slug>-360.png`, and `<slug>-preparation-360.png`.

## Scope And Existing Design

Only `/bigrock`, `/carolstream`, `/montgomery`, `/northaurora`, `/minooka`, `/channahon`, `/homerglen`, `/lemont`, `/bristol`, `/darien`, `/burrridge`, and `/glenellyn` receive new main copy. The existing spelling `/burrridge` is preserved. No URL is added, renamed or redirected.

Visual approach: retain the established photography, colors, typography, spacing and components. Content follows the approved city structure: introduction, Regular/Deep/Move-In-Move-Out cards, Homes We Clean, general written reviews, pricing explanation, practical preparation, original nearby areas, FAQ and original contact form. Existing links, review rails, FAQ expansion, ZIP lookup and quote/calculator flow remain; no new motion or visual redesign is introduced.

The wrapper has a finite twelve-route allowlist, reuses the existing renderer without editing it, and is idempotent. Data, release dates and source modules of the prior 28 editions are untouched. All 289 non-target public HTML pages match the fresh production baseline byte for byte, including the prior 28 cities, `/`, `/pricing`, `/quote`, service pages and blog. robots.txt and sitemap URLs remain unchanged. Only the twelve target lastmod dates change at publication.

The target pages preserve title, description, H1, canonical, robots metadata, header/footer/navigation, original images, nearby-area links, ZIP and contact forms, runtime scripts and original styles. FAQPage is synchronized with the new visible questions. Existing non-FAQ schemas, including the site's generic location classification, remain unchanged; this is a main-content rewrite rather than a global schema-catalogue revision.

## Counts And Similarity

| Page | Visible main words |
| --- | ---: |
| Big Rock | 1383 |
| Carol Stream | 1397 |
| Montgomery | 1390 |
| North Aurora | 1395 |
| Minooka | 1391 |
| Channahon | 1397 |
| Homer Glen | 1393 |
| Lemont | 1384 |
| Bristol | 1388 |
| Darien | 1399 |
| Burr Ridge | 1400 |
| Glen Ellyn | 1400 |

The method is unchanged from earlier batches: main text excludes header/footer/navigation, scripts, styles, SVG and aria-hidden content, and includes all 23 written review cards and expandable FAQ answers. City/place names are masked before five-word shingle Jaccard comparison. All 780 distinct pairs among the 40 pages are below 40%. Maximum: 35.59%, Darien versus Glen Ellyn. No old page was rewritten to lower similarity.

For each new page outside FAQ: county-location statement 1, supplies statement 1, parking statement 1, booking-popularity claims 0, typical-home claims 0. The supplies and parking facts repeat once in the relevant FAQ answer, as permitted. Full body counts are in verification.json. A reference to the DuPage Water Commission is an organization name, not another county-location statement. No invented neighborhoods, landmarks, schools, home sizes, housing mix, years in business, staffing numbers, local client counts, prices, availability promises or guarantees are introduced.

No 300+, Fox Valley, typical-home or most-booked claim appears on the twelve pages. Availability uses only "we check the schedule and confirm the soonest date", once per page. The regular 2-4 / deep 4-6 hour figures are the explicitly requested planning guides from the service page, not a promised appointment finish time.

## Local Facts And Source Lines

Each full source line from the owner's message and the facts actually used are recorded in report.md and verification.json. The referenced file `Карточки городов, пачка 3 2026-10-22.md` was not attached and was not found in Downloads or Desktop/Project. The factual source used here is the complete brief supplied in the message, not a claimed independent reading of that missing file or its underlying municipal reports.

| Location | Facts used from the brief |
| --- | --- |
| Big Rock | Kane County; 60511; no water statement or water FAQ. |
| Carol Stream | DuPage County; 60188; Lake Michigan through the DuPage Water Commission. |
| Montgomery | Kane and Kendall counties; 60538; no water statement or water FAQ. |
| North Aurora | Kane County; 60542; well water; village report hardness of exactly 16 grains per gallon; permitted extra attention to faucets, shower glass and fixtures. |
| Minooka | Where Grundy, Kendall and Will counties meet; 60447; well water until a Lake Michigan switch planned for 2030. No different county-location assertion is substituted. |
| Channahon | Will and Grundy counties; 60410; village's own wells; hardness of exactly 18-20 grains per gallon; Lake Michigan change planned for 2030; permitted attention to faucets, shower glass and fixtures. |
| Homer Glen | Will and Cook counties; 60491; **public** supply is Lake Michigan water delivered by Illinois American Water. Both paragraph and FAQ explicitly avoid a claim about every home's source. |
| Lemont | Cook, DuPage and Will counties; 60439; village wells. |
| Bristol | Kendall County; 60512; unincorporated community. Visible copy says Bristol or the Bristol area, never village/town/city of Bristol. No water statement or water FAQ. |
| Darien | DuPage County; 60561; Lake Michigan water purchased from the City of Chicago. |
| Burr Ridge | DuPage and Cook counties; 60527; Lake Michigan water through the Village of Bedford Park. |
| Glen Ellyn | DuPage County; 60137; Lake Michigan through the DuPage Water Commission. |

Only North Aurora and Channahon contain hardness numbers. The exact number appears once in the practical paragraph and once in its directly related FAQ answer. No water is described as hard or soft. Big Rock, Montgomery and Bristol have six FAQ entries, while the nine locations with water facts have seven. The other local question concerns choosing a one-time visit versus recurring care, without invented housing-mix claims.

## Service Sources

Existing service content was used rather than invented inclusions:

- [Regular cleaning](https://shynlicleaningservice.com/services/regular-cleaning): What's Included in Every Regular House Cleaning, Throughout the Home, Kitchen, Bathrooms, Bedrooms & Living Areas, Choose Your Cleaning Schedule, and Customize Your Regular House Cleaning. Room care, separate optional interiors, linens and ongoing frequency choices are paraphrased without adding prices. The current page was captured in the fresh HTTP baseline even though the web-reading tool timed out on it.
- [Deep cleaning](https://shynlicleaningservice.com/services/deep-cleaning): Is Deep Cleaning Right for You, What's Included in Deep Cleaning, and How Deep Cleaning Differs from Regular. These support first/seasonal cleaning, detailed dusting, baseboards, frames, kitchen degreasing, bathroom tile/grout and the planning duration guide.
- [Move-in/move-out cleaning](https://shynlicleaningservice.com/services/move-in-move-out-cleaning): Is Move Cleaning Right for You, What's Included, For Move-Out, and For Move-In. These support who books the service, closet/door/floor/appliance and empty-storage work, and arranging cleaning before or after belongings move. No deposit, inspection, or completion guarantee is stated.

Practical preparation, entry without remaining home, supplies and parking follow the owner's explicit brief and the approved Naperville model. Suggestions to set items aside or leave replacement sheets available are access/preparation guidance, not new local attributes or additional cleaning inclusions.

## Reviews

The exact 23 written Naperville excerpts, names, order and two-rail split are preserved. No review is newly linked to one of these twelve locations. Stars-only entries and prohibited reviewers are absent. The confirmed `5/5` and `58 Google reviews` remain.

As in the approved earlier editions, Eric J.'s unedited customer quotation contains "look no further". It is not used in the new editorial text. Rewriting that quotation would conflict with the instruction to preserve the exact Naperville list. No long dash or prohibited marketing phrase is introduced outside customer quotes.

## Verification

- 125 focused tests passed, zero failures: third, second and first batches, main seven-city editorial, Naperville, runtime sanitizer, public structured data and public routes. This does not claim a fresh full admin-suite run. Preview log: `/tmp/shynli-city-batch-three-tests-final.log`; publication rerun: `/tmp/shynli-city-batch-three-deploy-tests.log`.
- All 12 pages checked at actual CSS widths 1440, 390 and 360px. Existing 110% local browser zoom was compensated by viewport overrides, not changed. Overrides were reset afterward.
- No horizontal document overflow, overlapping tested service/preparation/benefit items, clipped service/hero text, overflowing tested long-text panels or broken loaded images. Pricing button gaps remain 28px desktop and 24px mobile.
- Every ZIP lookup returned the intended location. Existing shared ZIP results can name an additional area; those mappings were not changed.
- FAQ expansion worked on all 12 pages. All original contact forms transferred the reserved dummy phone and test name to `/quote`, with name prefill confirmed. The browser tool redacts phone field values, so the phone handoff was verified using the exact expected GET URL after navigation.
- The calculator opened from every form and changed the estimate from $145 to $157 when bedrooms increased from one to two. The final quote was never submitted. No real customer/order/message data was created or changed.
- The preview runs with isolated test storage, blank production database and GHL credentials, and recurring-order maintenance disabled.
- Every target JSON-LD block parses. FAQPage matches visible FAQ; other schemas and all protected blocks match the original apart from existing modification dates if present. All 289 non-target HTML pages, sitemap URLs and robots.txt match the fresh production baseline. Only these twelve dates change at publication.

## Changed Files

- `lib/site/city-batch-three-data.js`: twelve texts and literal local-fact source lines.
- `lib/site/city-batch-three.js`: finite-route wrapper using the unchanged renderer and review evidence.
- `lib/site/city-batch-three-release.json`: actual publication date, October 22, 2026 (America/Chicago).
- `lib/site/sanitize.js`: conditional third-batch hook for the twelve paths only.
- `server.js`: third-batch lastmod overrides restricted to the twelve routes and their explicit release date.
- `scripts/audit-city-batch-three.js`: 40-page matrix, exact water-claim validation and twelve-route scope.
- `scripts/audit-city-editorial.js`: optional water validator and multiple no-water routes; old-batch defaults preserved.
- `scripts/mark-city-batch-three-deployment.js`: actual Chicago publication-date guard restricted to twelve routes.
- `test/city-batch-three.test.js`: exclusions, dates, facts, unsupported-water checks, Bristol wording, reviews, FAQ, forms and all 780 distinct similarity pairs.
- `test/server-smoke.test.js`, `test/site-sanitize-runtime.test.js`: replace only outdated generic-copy expectations for the new editions, retaining other routes and form checks.
- `docs/city-batch-three/README.md`, `report.md`, `verification.json`: report, full matrix and evidence.

The pre-existing client-order-prefill test edit and old deployment reports are excluded from this release. No existing client, order, amount, payment, team, schedule or reminder is modified.

## Reproduction And Dates

```sh
node scripts/audit-city-batch-three.js http://127.0.0.1:58250 /tmp/shynli-city-batch-three-before docs/city-batch-three
node --test --test-concurrency=1 test/city-batch-three.test.js test/city-batch-two.test.js test/city-batch-one.test.js test/city-editorial.test.js test/naperville-pilot.test.js test/site-sanitize-runtime.test.js test/site-structured-data.test.js test/server-smoke.test.js
```

The original baseline contains all 300 sitemap pages plus `/quote`, captured before edits. A fresh predeployment capture is at `/tmp/shynli-city-batch-three-deploy-before`. Do not invent a publication date during preview. Immediately before an authorized deployment, use the actual Chicago date:

```sh
node scripts/mark-city-batch-three-deployment.js YYYY-MM-DD
```

This rejects another calendar date and attempts to refresh an already published edition. It activates only these twelve sitemap lastmod overrides and updates existing dateModified keys on those routes if present, without adding a new schema date field or changing the prior 28 editions' dates. A fresh production comparison should follow deployment.
