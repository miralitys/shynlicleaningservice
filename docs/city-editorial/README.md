# Seven City Pages

Implementation, October 22, 2026, Chicago. Deployment authorized by the owner; the publication date for these seven routes is 2026-10-22. Production verification is recorded separately after deployment. The reference is Naperville edition `860290dd`; Naperville itself is unchanged.

## Deliverables

- `report.md`: content version, full 8x8 similarity matrix, word counts, repetition counts, local facts with the corresponding source line from the owner's brief, and scope comparison.
- `verification.json`: machine-readable values, exact protected-block checks, review order, FAQ/schema parity, service order, keyword counts and rating equality with Naperville.
- Preview: http://127.0.0.1:58250/plainfield. The other six target routes are available on the same isolated local server.
- Browser evidence: `output/playwright/city-editorial/`, including desktop, 390px and 360px screenshots, `mobile-layout.json`, `desktop-layout.json`, `detail-layout.json`, and `forms.json`.

## Scope And Content

The seven finite routes are `/plainfield`, `/aurora`, `/bolingbrook`, `/yorkville`, `/oswego`, `/lombard`, and `/batavia`. A route-gated editorial pass runs after existing SEO normalization and before image-alt normalization. Other routes return the original HTML. Existing source HTML, city routing, shared templates, pricing code, calculator, blog, service pages, navigation, orders and database code were not rewritten.

The page order follows Naperville: hero, service cards, Homes We Clean, written reviews, pricing explanation, practical preparation, original nearby areas and ZIP form, seven-question FAQ, and original quote form. Existing classes, assets, typography and components are retained. Layout-fitting rules are scoped to `main[data-city-editorial]` and the inserted review block, following Naperville's fixes for natural card height, centered pricing text, button spacing and preparation-icon alignment.

The entire nearby-area section and quote section are copied unchanged from each page. The original runtime scripts, images, header, footer, title, description, H1, canonical and robots match the production snapshots. FAQPage is synchronized with the seven visible questions. Aurora's Service retains its own Google profile and the common business provider.

## Fact Provenance

Local facts are limited to the owner's city-specific brief. Each used local fact and its verbatim source bullet are in `report.md` and the data module's `facts` field. No additional county was inferred for Aurora. No water paragraph was added to Bolingbrook or Batavia. No typical home was assigned to Batavia. No neighborhood, landmark, school, customer count, team size, tenure, availability promise or cleaning guarantee was introduced.

Service facts were checked against the existing live/local service pages:

| Source | Sections used | Claims supported |
| --- | --- | --- |
| [/services/regular-cleaning](https://shynlicleaningservice.com/services/regular-cleaning) | What's Included in Every Regular House Cleaning; Throughout the Home; Kitchen; Bathrooms; Bedrooms & Living Areas; Choose Your Cleaning Schedule; Customize Your Regular House Cleaning | Light dusting, vacuuming, mopping, trash, kitchen surfaces, appliance exteriors, microwave interior, bathroom fixtures, made beds, switches/handles, weekly/bi-weekly/monthly care and separately selected extras |
| [/services/deep-cleaning](https://shynlicleaningservice.com/services/deep-cleaning) | Is Deep Cleaning Right for You; What's Included in Deep Cleaning; How Deep Cleaning Differs from Regular; Time Required | First clean after months, seasonal reset, detailed dusting, hand-wiped baseboards and door frames, kitchen degreasing, bathroom tile/grout, and guide durations regular 2-4 / deep 4-6 hours |
| [/services/move-in-move-out-cleaning](https://shynlicleaningservice.com/services/move-in-move-out-cleaning) | Is Move Cleaning Right for You; What's Included; For Move-Out; For Move-In | Renters, owners and property managers, closets, doors, floors, appliance interiors, empty cabinet/drawer interiors, cleaning after belongings leave or before arrival, and the existing 1-2-day move-in preparation recommendation |

The owner's instructions explicitly request practical preparation, access without being home, supplies, parking and the guide duration used on Naperville. These are operational advice and the supplied model, not invented local attributes. Actual availability is stated only as checking the schedule and confirming the soonest date. No urgent-service claims from the service pages were imported.

Water-source references supplied in the brief are recorded without adding new claims:

- Plainfield: https://plainfieldil.gov/departments/public-works/water-division
- Aurora: 2023 water quality report, as identified in the brief.
- Yorkville: 2022 Annual Drinking Water Quality Report, as identified in the brief.
- Oswego: https://oswegoil.org/water
- Lombard: Village of Lombard 2024 Water Quality Report, as identified in the brief.

The external Plainfield/Oswego links did not open in the research tool. Water statements therefore use the facts explicitly supplied by the owner, not an independently claimed new verification or extra local research.

## Reviews

Each page shows 25 written excerpts: the 23 written entries already used on Naperville plus Mona A. and Siddique A. supplied in this brief. Existing excerpts are not paraphrased. Mona and Siddique use exactly the supplied excerpt text, without completing the omitted wording. All names follow the existing first-name/last-initial format. No disallowed reviewer is included.

- Plainfield: Mona A., Suganya S., then the general list.
- Aurora: Judy V., Tyshone J., then the general list. No household attribution is added.
- Bolingbrook: Siddique A., then the general list.
- Yorkville and Oswego: the general list.
- Lombard: Suzana D., then the general list.
- Batavia: the general list. The owner confirmed that Ina S. has a stars-only entry, so no quote or card is fabricated.

MaryLouise O. is also excluded because her entry has no text. The original Naperville review file is unchanged. The confirmed 58 Google reviews and exact `5/5` display remain. Eric J.'s existing literal excerpt contains "look no further"; it is retained only inside the unchanged review quotation, not introduced into editorial prose, consistent with the Naperville rule against editing reviews.

## Verification

- 118 focused tests passed: city editorial, Naperville, public routes, runtime sanitization, and structured data.
- 294 non-target public HTML pages matched the production baseline byte for byte, including `/naperville`, `/`, `/pricing`, `/quote`, and `/joliet`.
- Baseline: `/tmp/shynli-seven-cities-before`, 301 HTML snapshots plus robots.txt and sitemap.xml.
- Sitemap URLs and robots.txt stay unchanged. Only the seven target lastmod values change to the actual publication date, 2026-10-22.
- Every distinct page pair is below 40% five-word shingle Jaccard, with city names masked and header/footer/navigation excluded. All written reviews are included, as on the Naperville audit.
- Main word counts include all written review cards and expandable FAQ answers; exclude header/footer/navigation/scripts/styles/SVG/decorative content. This is the same method used for Naperville.
- Each constrained fact occurs at most once outside FAQ. The JSON report additionally counts FAQ question and answer text, so a question and its answer may both match a phrase there.
- All seven pages were tested at actual CSS widths 390 and 360px and desktop 1440px. Chrome's existing 110% zoom was compensated by the viewport override, not changed. No horizontal overflow, tested panel overflow, overlapping cards/benefits/preparation items, clipped card text or broken loaded images was found.
- Pricing buttons retain 28px desktop / 24px mobile spacing. Long preparation paragraphs were also checked at 360px.
- On all seven, the existing ZIP form returned the expected city. Dummy contact inputs transferred to `/quote`, where the calculator opened and changed from $145 to $157 when the bedroom count increased from one to two. No final quote was submitted and no real orders or SMS were created.
- Full-suite green status is not claimed; the focused public-page regression set is the scope of this pass.

## Changed Files

- `lib/site/city-editorial-data.js`: seven city texts, local fact provenance, per-city card/review ordering and FAQ.
- `lib/site/city-editorial.js`: finite route-gated rendering, review excerpts, FAQPage and scoped content-fitting styles.
- `lib/site/city-editorial-release.json`: publication date 2026-10-22 for these seven pages only.
- `lib/site/sanitize.js`: conditional hook for the seven target routes only.
- `server.js`: optional lastmod overrides for those seven routes, empty until publication is recorded.
- `scripts/audit-city-editorial.js`: report and baseline checks.
- `scripts/mark-city-editorial-deployment.js`: actual-date publication guard.
- `test/city-editorial.test.js`: content, scope, schema, review and form regressions.
- `test/server-smoke.test.js`, `test/site-sanitize-runtime.test.js`: replace old generic-copy expectations only for these seven pages.
- `docs/city-editorial/README.md`, `report.md`, `verification.json`: documentation and evidence.

Unrelated local changes to the client-order-prefill test and earlier deployment reports are not part of this work.

## Publication Date And Reproduction

No deploy date was assigned during the preview. Following authorization, the actual Chicago date was recorded immediately before publishing:

```sh
node scripts/mark-city-editorial-deployment.js YYYY-MM-DD
```

The command rejects dates other than the current Chicago date, impossible calendar dates, and attempts to refresh an already published edition. Only these seven sitemap lastmod values are then overridden. Existing dateModified keys, if present in their JSON-LD, are updated to that date; no new date fields or global timestamps are introduced.

```sh
node scripts/audit-city-editorial.js http://127.0.0.1:58250 /tmp/shynli-seven-cities-before docs/city-editorial
node --test --test-concurrency=1 test/city-editorial.test.js test/naperville-pilot.test.js test/site-sanitize-runtime.test.js test/site-structured-data.test.js test/server-smoke.test.js
```
