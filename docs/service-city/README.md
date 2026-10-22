# Eight Service-in-City Pages

Current working edition: `service-city-b0d6aa0c`. The eight-page batch is published in `dc85e179`; the full-card navigation follow-up below is prepared locally and not yet deployed.

## Preview and URLs

Preview server: `http://127.0.0.1:61423`.

| Page | Main words |
| --- | --- |
| /naperville/deep-cleaning | 1022 |
| /aurora/deep-cleaning | 1064 |
| /plainfield/deep-cleaning | 1071 |
| /bolingbrook/deep-cleaning | 1071 |
| /naperville/move-out-cleaning | 1061 |
| /aurora/move-out-cleaning | 1096 |
| /plainfield/move-out-cleaning | 1099 |
| /bolingbrook/move-out-cleaning | 1084 |

Main-text counts include the complete existing written reviews and FAQ. Header, navigation, footer and scripts are excluded. The parent city's review content and order are preserved without rewriting excerpts or adding stars-only entries. Both Aurora pages retain the Aurora Google footer destination and the Service node's Aurora sameAs.

## Implementation

The existing nested URL convention is used with a city prefix. New managed routes reuse the city template and existing assets, header, footer, 5/5 rating, reviews and GET quote form. Only the new pages receive their service-specific content and responsive layout rules. Their title, description, canonical, Service, BreadcrumbList and FAQPage are generated explicitly.

On the four parent city pages, each complete Deep and Move-In/Move-Out card is a native anchor to the matching city-specific page. The duplicate city/service labels are removed; the original Learn more span, body copy, CSS and service order are retained. No nested anchors or JavaScript navigation are introduced. Regular Cleaning is unchanged. The two parent service pages keep their Popular areas paragraph with four links.

### Changed Production Files

- `lib/site/service-city-data.js`: eight separately written page texts, local facts and source references.
- `lib/site/service-city.js`: narrow route renderer, links, schemas and date allowlist.
- `lib/site/service-city-release.json`: actual Chicago publication date recorded for this release, October 22, 2026.
- `lib/site/sanitize.js`: opt-in rendering for eight new routes and links on six parent routes only.
- `server.js`: registers managed routes and only their sitemap date overrides.

### Supporting Files

- `scripts/audit-service-city.js`: word counts, complete 8-by-14 similarity table, facts, schemas, forms, reviews, existing-page and sitemap isolation.
- `scripts/mark-service-city-deployment.js`: records the actual Chicago deployment date for these eight pages only.
- `test/service-city.test.js`: new routes, canonical, schemas, forms, review parity, profile destinations, links, dates and similarity.
- `test/city-editorial.test.js`: checks the original word-count bounds directly, with no duplicate anchor text to subtract.
- `test/naperville-pilot.test.js`: retains the three-card and service-order assertions and checks the local Deep and Move destinations.
- `docs/service-city/README.md`, `report.md`, `verification.json`: this summary and detailed evidence.

Unrelated preexisting edit to `test/admin-route-client-order-prefill.test.js` was not touched. No client, order, price, team, availability, notification or database changes were made.

## Verification

- 142 focused tests passed, zero failures. This is not a claim about all repository tests. Logs: `/tmp/shynli-service-city-tests.log` (20) and `/tmp/shynli-service-city-regression-tests.log` (122).
- 313 existing public pages compared against a freshly captured production baseline. The user subsequently authorized publishing the Yelp correction with this batch. Baseline `/tmp/shynli-combined-release-baseline` normalizes only that approved URL replacement; the unmodified capture remains at `/tmp/shynli-service-city-baseline`. Against that normalized baseline, six parent pages contain exactly the intended link additions; every other existing page is byte-identical, including home, pricing, the other cities and blog.
- All previous sitemap URL entries and dates are byte-identical. Exactly eight new URLs are added. Robots is byte-identical.
- Main-content similarity masks city and service names and uses 5-word shingle Jaccard, including shared reviews. Maximum required comparison: 31.91%, below 40%. Full table and per-page facts: [report.md](report.md).
- 24 browser layout checks on all eight pages: desktop 1440 px, mobile 390 and 360 px. No horizontal page overflow, escaped text or broken non-lazy images.
- 18 additional parent-page link layout checks: all six parents at the same three widths; both local card links and the four Popular areas links fit their containers.
- All eight quote forms tested with synthetic data on the isolated local server. They navigate to local `/quote` with the expected name and formatted phone; no final quote submission and no production writes.
- Google Rich Results Test in code mode for `/naperville/deep-cleaning`: one valid BreadcrumbList item, no errors. [Google result](https://search.google.com/test/rich-results/result?id=W54CtsV0HZlNT1ov36QA6w). This was a code test before publication, not a live URL crawl. Service and matching FAQPage JSON also parse on all eight pages; Google does not report all Schema.org types as eligible rich results.
- Browser screenshots and machine-readable checks: `output/playwright/service-city/`.
- Follow-up styling: related city/service links on all eight new pages are now matching filled and outline buttons. Desktop uses two equal columns; mobile uses a single column with wrapping labels. URLs and visible wording are unchanged. Twenty-four additional layout checks passed at 1440, 390 and 360 px, including the longest moving-service label. Nine focused tests passed after this change. Evidence: `output/playwright/service-city/buttons/`; test log: `/tmp/shynli-service-city-buttons-tests.log`. The 313-page isolation audit was rerun successfully for this edition.
- Compact-spacing follow-up: scoped CSS only on the eight new pages. Desktop text-section padding is now 32 px per side instead of 72; mobile is 22 instead of 58. Reduced the hero's trailing padding, paragraph/checklist spacing, FAQ heading/panel spacing, quote transitions and final navigation spacing. Content and typography are unchanged. Twenty-four before/after browser checks at 1440, 390 and 360 px passed with no overlaps, escaped text or font-size changes. Naperville Deep is 642 px shorter on desktop and 521 px shorter at both mobile widths, entirely from spacing. Nine focused tests passed again. The 313-page isolation audit still passes. Evidence: `output/playwright/service-city/spacing/verification.json`; test log: `/tmp/shynli-service-city-spacing-tests.log`.
- Pending full-card navigation follow-up: all eight actual card clicks reached the matching city/service page. Twelve layout checks passed across the four cities at 1440, 390 and 360 px. Eighteen focused tests passed. A 321-page before/after comparison changed only the expected card wrappers, destinations and duplicate labels on `/naperville`, `/aurora`, `/plainfield` and `/bolingbrook`. The other 317 pages, sitemap, robots and all JSON-LD are byte-identical. Evidence: `output/playwright/service-city/card-navigation/`; test log: `/tmp/shynli-city-card-tests.log`. No publication dates were changed for this UI-only follow-up.

## Source Discrepancy

The existing move-service checklist describes empty cabinet and drawer interiors, but `/pricing` presents inside cabinets as an additional selection. New copy preserves the empty condition and asks customers to select and confirm that work in the quote. It does not promise it for free or invent a price. Deep appliance exteriors are distinguished from optional oven and refrigerator interiors. Existing prices and calculator logic remain unchanged.

## Before Publishing

1. Record the real date at deployment, not at preview time:

```sh
node scripts/mark-service-city-deployment.js YYYY-MM-DD
```

2. Restart the preview and rerun the focused tests and isolation audit with the recorded date:

```sh
node scripts/audit-service-city.js http://127.0.0.1:61423 /tmp/shynli-combined-release-baseline docs/service-city
```

3. Deploy only this scoped change, excluding unrelated edits. After Render is Live, rerun the audit against the public origin and repeat browser checks. The preview is not a substitute for production verification.

The publication date has now been recorded as October 22, 2026, the actual Chicago deployment day. Only the eight new sitemap entries receive this override; all existing entries remain untouched. The release is combined with the authorized Yelp-only URL correction. See `docs/yelp-link/README.md` for that separately scoped change.
