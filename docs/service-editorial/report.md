# Three Service Pages: Local Review

Status: prepared locally, not deployed. Baseline: `8e0f3dfd`.
Edition: `three-services-20261022`.
Source fingerprint: `eab6ea8d4714409e489cc710345cae8a62d386286855822888d83a737970c4d8`.

## Design Correction

The benefits grid, FAQ and closing form reuse the actual homepage markup from `page108488156.html`. Their component CSS was mechanically copied from `home-copy-clean.css` and scoped to these three services. Homepage files are unchanged. Reviews reuse the homepage's two-row component, desktop animation and mobile horizontal scrolling. Six existing written review excerpts are preserved, without inventing text for stars-only reviews. Offscreen carousel copies are inert and excluded from the accessibility tree and editorial count.

The old Commercial template applied a generic grid layout to forms. This made the longer form overlap the contact copy on mobile. The editorial form now explicitly uses the homepage's block layout. All three forms were tested again in the browser after this correction.

## Word Counts

| Page | Before | After | After without reviews |
| --- | ---: | ---: | ---: |
| Airbnb | 403 | 860 | 750 |
| Commercial | 438 | 815 | 705 |
| Post-construction | 218 | 908 | 798 |

Count includes main content, all FAQ answers and six distinct written reviews. It excludes header, footer, navigation, scripts, styles, SVG and decorative carousel copies. Post-construction had no main element before, so its previous count uses body content with those exclusions. This counting method differs from the initial estimates in the brief. No padding was added to reach the target.

## Similarity

Main text, lowercase Unicode words, sets of five-word shingles, Jaccard percentage. Every comparison involving a rewritten page is below 40%.

| New page vs | Airbnb | Commercial | Deep | Move-in/out | Post-construction | Regular |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Airbnb | self | 32.08 | 0.87 | 0.96 | 28.84 | 1.04 |
| Commercial | 32.08 | self | 0.90 | 0.93 | 29.37 | 0.96 |
| Post-construction | 28.84 | 29.37 | 1.09 | 0.98 | self | 0.91 |

The complete six-by-six matrix is in `audit.json`. Some pairs between unchanged older services exceed 40%; those pages were not edited.

## Facts And Sources

All three pages use these supplied common facts, each in the body once, with relevant FAQ answers allowed to repeat:

- C1: locally owned residential/commercial company; local team, not contractors.
- C2: insurance up to $1 million.
- C3: professional supplies/equipment, family/pet-safe products, safer options on request, customer products allowed.
- C4: calls/texts daily 9 AM to 7 PM Central; the supplied phone and email.
- C5: no deposit, payment after cleaning.
- C6: 48-hour, 24-hour and 1-hour reminders.
- C7: report missed work within 24 hours and it is fixed.
- C8: the four cancellation windows and charges exactly as supplied.
- C9: vacuuming only, no shampoo/steam, exterior windows or biohazards; garage only after photos and approval.
- C10: supplied optional add-ons, walls after photos, prices linked rather than new numbers.
- C11: service-area link and individual manager quotes.

Airbnb uses the brief's turnover definition and room checklist (A1-A2); window spot-cleaning versus full glass/track washing (A3); address, beds/baths and guest-change frequency for quotes (A4). Ramis's confirmed facts provide same-day turnovers, smart-lock/lockbox access without the host, and photos on request (R_A).

Commercial uses offices, retail and small businesses (B1); the existing four room groups and customer-supplied paper products (B2); weekend visits and one-time, weekly or several-times-weekly scheduling (R_B); address, size, restrooms and frequency for the quote (B4). The closing CTA now addresses a workspace, not hundreds of families.

Post-construction uses heavier-than-Deep scope (P1), photos and area size for an individual quote (P2), the current Deep Cleaning room checklist (DEEP), and Ramis's confirmed construction dust inside cabinets/drawers/air vents, paint/sticker residue, tracks and no heavy-trash/debris hauling (R_P). The placeholder is removed and a real main element is present.

Reviews come from existing written excerpts in `lib/site/naperville-reviews.json`: Amy K., Erika B., Mariana S., Judy V., Suzana D. and Suganya S. Their quoted text is unchanged. Full provenance strings per page are in `audit.json`.

No COI claims, invented client identities/cities, job counts, service prices or response-time promises were added.

## Checks

- All three routes return 200 with one main element, self canonical and unique metadata.
- Each has Service, BreadcrumbList and FAQPage JSON-LD; all parse and match the five visible FAQ questions and answers. No aggregateRating or offers added.
- Google Rich Results Test in Code mode on the prepared Commercial page reported one valid breadcrumb item and no errors. Result: https://search.google.com/test/rich-results/result?id=IqQwDAgvlb9OVANHFR_PyQ . Service/FAQ are locally validated, not a claim of Google rich-result eligibility. The subsequent design correction did not change this page's JSON-LD. Live validation awaits deployment.
- All three checked at actual browser widths 1440, 390 and 360 pixels: no horizontal page overflow, clipped benefit text, broken images or overlapping form/contact blocks. FAQ expands at all nine layouts.
- All three forms transfer the reserved test name/phone to the existing quote page by GET. No quote/order was submitted and no customer data was changed. Unit tests also exercise phone normalization and invalid-phone rejection.
- 130 targeted tests pass, zero failures.
- Of 328 captured public routes, only the requested three differ; 325 remain byte-identical, including home, pricing, city pages, blog, header and footer.
- Sitemap URLs and dates remain unchanged locally. `deployedAt` is deliberately null. At deployment, run `node scripts/mark-service-editorial-deployment.js YYYY-MM-DD` with that day's Chicago date to update only these three lastmod values.

## Changed Source Files

- `lib/site/service-editorial-data.js`: copy and fact provenance.
- `lib/site/service-editorial.js`: isolated rendering and schema.
- `lib/site/service-editorial-release.json`: pending deployment date.
- `css/service-editorial-home.css`: scoped homepage component styles.
- `css/service-editorial.css`: service-only layout and legacy-form conflict fix.
- `js/service-editorial.js`: the homepage-style FAQ interaction, scoped to the three pages.
- `lib/site/sanitize.js`: apply the new renderer only to these routes.
- `routes.json`: Post-construction uses the clean service shell instead of the placeholder.
- `server.js`: metadata and the three pending lastmod overrides.
- `scripts/audit-service-editorial.js`: counts, similarities, provenance and site isolation checks.
- `scripts/mark-service-editorial-deployment.js`: real-date release marker.
- `test/service-editorial.test.js`: content, homepage components, schema and form regression tests.
- `test/site-sanitize-runtime.test.js`, `test/server-smoke.test.js`: clean Post-construction shell expectations.

The pre-existing change to `test/admin-route-client-order-prefill.test.js` is unrelated and was not edited for this task.

Screenshots and machine-readable checks are alongside this report. Current preview: http://127.0.0.1:56667/services/airbnb-cleaning .
