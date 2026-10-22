# City Pages: Batch One

October 22, 2026, America/Chicago. Publication authorized for these ten routes only. Base version: `a9bf2152`. The final deployment record is kept separately after production verification.

## Results And Preview

- `report.md` contains the full 18x18 five-word shingle Jaccard matrix, visible word counts, constrained-phrase counts, the exact source line from the owner's brief for every city, and the used facts.
- `verification.json` contains the same evidence plus protected markup comparisons, review order, FAQ/schema parity, service order, dates and scope checks.
- Preview starts at http://127.0.0.1:58250/woodridge. All ten target routes are available on the same isolated server.
- Browser screenshots and interaction evidence are under `output/playwright/city-batch-one/`, including `browser-verification.json` and `forms.json`.

## Content Scope

Only `/woodridge`, `/warrenville`, `/sugargrove`, `/oakbrook`, `/stcharles`, `/geneva`, `/downersgrove`, `/romeoville`, `/lockport`, and `/cresthill` use the new data. Each retains its original title, description, H1, canonical, robots, header/footer/navigation, images, nearby-area section, ZIP form, quote form and runtime scripts.

The Naperville-style order is retained: hero, three service cards, Homes We Clean, written reviews, pricing explanation, practical preparation, original nearby areas, FAQ and original quote form. Cards always run Regular, Deep, Move-In/Move-Out. Existing typography, assets and components are used, including the existing content-fitting rules, rather than a redesigned layout.

The renderer now accepts an optional route-specific data/review/date configuration. Existing calls for the seven main city editions retain their defaults. The separate batch wrapper supplies only these ten routes, the 23 Naperville written excerpts and its own publication date. The full baseline comparison verifies that this reuse does not change any of the eight existing main city pages.

## Facts And Sources

All local claims come from the supplied brief. The report copies each city's full source line and lists what was used. No additional local geography, housing mix, home size, booking popularity, business history, staffing statistic, customer count, availability promise or guarantee was introduced.

- Woodridge retains the qualifier "mostly in DuPage County"; no second county is inferred.
- Only Warrenville describes water hardness: very hard, 24-26 grains per gallon, with the explicitly permitted attention to faucets, shower glass and fixtures. No other city's water is called hard or soft.
- Romeoville and Crest Hill describe the Lake Michigan switch as planned for 2030, not completed.
- Lockport has no water paragraph or water FAQ. It has six FAQ entries rather than the seven on pages with a water question.
- No page describes a typical home or claims a most-booked service.

The named source file, `Карточки городов, пачка 1 2026-10-22.md`, was not attached and was not found in Downloads or Desktop/Project. The factual source used here is therefore the complete city-fact list in the message, not an independently claimed reading of the underlying Census files or municipal reports. No missing local detail was filled by inference.

Service inclusions were checked against the site's existing service content:

| Source | Sections and facts used |
| --- | --- |
| [/services/regular-cleaning](https://shynlicleaningservice.com/services/regular-cleaning) | What's Included in Every Regular House Cleaning; Throughout the Home; Kitchen; Bathrooms; Bedrooms & Living Areas; Choose Your Cleaning Schedule; Customize Your Regular House Cleaning. Dusting, floors, trash, kitchen surfaces, appliance exteriors, microwave interior, bathroom fixtures, made beds, switches/handles, weekly/bi-weekly/monthly care and optional extras. |
| [/services/deep-cleaning](https://shynlicleaningservice.com/services/deep-cleaning) | Is Deep Cleaning Right for You; What's Included in Deep Cleaning; How Deep Cleaning Differs from Regular. First clean after a gap, seasonal reset, detailed dusting, hand-wiped baseboards and door frames, kitchen degreasing, bathroom tile/grout and the regular 2-4 / deep 4-6 hour guide. |
| [/services/move-in-move-out-cleaning](https://shynlicleaningservice.com/services/move-in-move-out-cleaning) | Is Move Cleaning Right for You; What's Included; For Move-Out; For Move-In. Renters, owners and property managers, closets, doors, floors, appliance interiors, empty cabinet/drawer interiors and work with belongings removed or not yet brought in. |

The practical preparation, access without staying home, supplies, parking and duration guidance follow the owner's explicit instructions and the supplied Naperville model. Clearing work areas and protecting belongings are preparation advice, not invented city attributes. Availability uses only "we check the schedule and confirm the soonest date". No urgent-service or response-time claims are imported.

## Reviews

The 23 written review excerpts match Naperville's text and order exactly, including its two-row split. There is no claim that these reviewers live in any of the ten cities. No new excerpts or local reviewer labels are added. Names retain first name and last initial, stars-only reviews are excluded, and no forbidden reviewer is used.

The exact `5/5` rating markup and `58 Google reviews` remain. As on the approved Naperville edition, "look no further" appears only inside Eric J.'s unchanged literal quotation. It is not used in the new editorial copy. Keeping that quote resolves the instruction to preserve the exact existing review list without rewriting a customer's words.

## Checks

- 120 focused public-page tests passed: batch one, existing seven-city editorial, Naperville, runtime sanitizer, structured data and public routes. This does not claim a fresh full-suite run of unrelated admin tests.
- All 153 distinct pairs among the 18 pages are below 40% Jaccard. The maximum is 32.64%, Woodridge versus Downers Grove. City names are masked and header/footer/navigation are excluded; all review cards and expandable FAQ answers count, as in the prior audits.
- All ten main word counts are within 1300-1400. Counts include every written review and expandable FAQ answer, excluding scripts, styles, navigation, SVG and decorative hidden content.
- Each county statement, supplies statement and parking statement appears once outside FAQ. Body counts including FAQ answers are also recorded in the JSON. DuPage Water Commission is a water organization name, not an additional county-location claim.
- Each page has the original nearby links and both original forms. All runtime scripts and images match the production baseline.
- JSON-LD parses. FAQPage matches the visible questions; other schema values remain unchanged apart from modification dates if present and authorized at publication.
- All 291 non-target public HTML pages match byte for byte, including all eight main city editions, `/`, `/pricing`, `/quote`, the blog and service pages. robots.txt and sitemap URLs remain unchanged. Only the ten target lastmod values change for publication.
- Each page was checked at actual CSS widths 1440, 390 and 360px. Existing 110% local browser zoom was compensated by the viewport override, not changed. There were no document-width overflows, overlapping cards/benefits/preparation items, clipped card text, overflowing tested long-text panels or broken loaded images.
- Each ZIP lookup returned the intended city; existing shared ZIPs can also name another city. That pre-existing mapping was not changed.
- Each quote form transferred dummy contact values to `/quote`, the calculator opened, and its estimate changed from $145 to $157 when bedrooms increased from one to two. The final quote was not submitted. No real customer/order records or messages were created. Test server data is isolated and production database credentials are disabled.
- All FAQ expanders tested opened the expected answer. Pricing button spacing remained 28px desktop / 24px mobile. Temporary viewport overrides were reset.

## Files Changed

- `lib/site/city-batch-one-data.js`: ten texts and literal city-fact source lines.
- `lib/site/city-batch-one.js`: finite-route wrapper and independent publication metadata.
- `lib/site/city-batch-one-release.json`: actual publication date, October 22, 2026 (America/Chicago).
- `lib/site/city-editorial.js`: optional city/review/date inputs; defaults for the existing seven editions preserved.
- `lib/site/sanitize.js`: conditional batch-one hook.
- `server.js`: optional lastmod overrides for these ten routes only.
- `scripts/audit-city-editorial.js`: optional audit configuration, extra batch checks and bounded read retries.
- `scripts/audit-city-batch-one.js`: 18-page report with ten-page isolation scope.
- `scripts/mark-city-batch-one-deployment.js`: actual-date guard for this batch only.
- `test/city-batch-one.test.js`: facts, reviews, dates, scope, FAQ and 18-page similarity regressions.
- `test/server-smoke.test.js`, `test/site-sanitize-runtime.test.js`: replace outdated generic-copy expectations for the ten pages, retaining other route checks.
- `docs/city-batch-one/README.md`, `report.md`, `verification.json`: report and evidence.

The text data and release dates of all eight existing city pages, the Naperville module, shared pricing/calculator code, customer/order logic and source HTML were not edited. Unrelated pre-existing changes in the client-order-prefill test and older deployment reports remain untouched.

## Dates And Reproduction

No deployment date is invented during a preview. After authorization, immediately before publishing, use the real Chicago date:

```sh
node scripts/mark-city-batch-one-deployment.js YYYY-MM-DD
```

This command rejects dates other than the current Chicago date and attempts to refresh a previously published edition. Only the ten target sitemap lastmod values will be overridden. Existing dateModified keys, if present, are updated on those routes only; no new schema date field is invented.

```sh
node scripts/audit-city-batch-one.js http://127.0.0.1:58250 /tmp/shynli-cities-batch1-before docs/city-batch-one
node --test --test-concurrency=1 test/city-batch-one.test.js test/city-editorial.test.js test/naperville-pilot.test.js test/site-sanitize-runtime.test.js test/site-structured-data.test.js test/server-smoke.test.js
```

Original preview baseline: `/tmp/shynli-cities-batch1-before`. Fresh predeployment baseline: `/tmp/shynli-city-batch-one-deploy-before`. Final test log: `/tmp/shynli-city-batch-one-deploy-tests.log`.
