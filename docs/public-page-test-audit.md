# Public Page Test Audit

Date: 2026-10-21. Local changes only, based on commit `0613b3c1`.

All 39 previous public-page failures are resolved. Most expected superseded
markup, wording, or runtime scripts. Six functional defects were also corrected.
No production requests that save data, database migrations, or deployments were
performed. Order pricing, teams, scheduling, and submission APIs are unchanged.

## Functional Fixes

| ID | Defect | Correction |
| --- | --- | --- |
| F1 | `/ads` customization missed the new nested hero heading and the new services section. | Apply the existing advertising headline and nearby-service section to both supported homepage layouts. No price constants were changed. |
| F2 | Indexable advertising pages inherited `noindex` from their source HTML despite being included in the sitemap. | Explicit `index,follow` for `/ads`, `/ads-v2`, and service `/ads` and `/ads-v2` routes. Quote and `/ads-lp` routes remain `noindex`. |
| F3 | Refreshing homepage reviews restored a Tilda `t-rec` wrapper on the clean homepage. | Use a plain wrapper on the new layout, preserving review content and scrolling. |
| F4 | Benefit-copy deduplication ignored converted `clean-elem` markup on About Us. | Remove the two known duplicate text elements, retain their desktop counterparts, and adapt mobile positions. Verified no heading/description overlap at 320, 390, 600, and 1440 px. |
| F5 | The new homepage and city quick forms bypassed the existing `quote_start_widget` handler. | Support those forms in the existing handler, validate the phone, normalize contact prefill, and prevent the native handler from performing a second navigation. Other forms are not intercepted. |
| F6 | Shared-header `Become a Cleaner` links pointed to the customer quote form at `/#clean`. | Point public and blog headers to `/faq#clean`, opening the existing candidate application. Its submission API and fields are unchanged. Version the FAQ script to avoid stale browser caching. |

## Original Failures

Names below identify the original tests; several also contained stale assertions
after the first failure. Tests were updated to verify behavior rather than
requiring removed Tilda components. F6 was confirmed during browser validation.

| # | Original Test | Resolution |
| --- | --- | --- |
| 1 | serves the homepage ads duplicate as an indexable sitemap route | F1; retain checks for offer, popup, canonical URL, sitemap and robots. |
| 2 | serves home-like routes without zero/lazyload runtimes | Account for canonical redirect and the clean homepage runtime. |
| 3 | serves city landing pages from the clean shared city template | Absolute logo URL, current city-summary links and shared navigation. |
| 4 | serves all city pilot pages without zero/lazyload runtimes | Current summary links and shared navigation; preserve all city-content checks. |
| 5 | serves static marketing pilots without zero/lazyload runtimes | About Us is also a clean page; use current shared navigation. |
| 6 | serves the regular-cleaning main route as clean hand-coded markup | Current shared navigation instead of removed header anchors. |
| 7 | serves the service areas main route as clean hand-coded markup | Current shared navigation; exclude script text from structural markup checks. |
| 8 | serves the commercial-cleaning main route as clean hand-coded markup | Current shared navigation; distinguish runtime code from rendered classes. |
| 9 | serves the move-in move-out main route as the clean hand-coded page | Ignore compatibility selector strings in scripts, not actual Tilda markup/assets. |
| 10 | serves the deep-cleaning ads duplicate as an indexable sitemap route | Current split heading, price offer, native add-ons and `/quote-no-price` CTA. |
| 11 | serves all ads landing routes as indexable self-canonical pages without redirects | F2; keep sitemap, robots and canonical checks for every route. |
| 12 | serves all service page pilots without zero/lazyload runtimes | Current shared navigation, including corrected candidate-form link. |
| 13 | emits FAQ and Service structured data on matching page types | Parse JSON-LD instead of requiring minified JSON; check visible FAQ questions. |
| 14 | renders all what's included articles with live route structure and long-form content | The intentionally replaced safer-products article has a 1400-word floor; other articles retain 1700. Check every declared TOC section. |
| 15 | injects quote-start widget runtime wherever quick quote widgets exist | F5; use the actual current city template and homepage form. |
| 16 | builds no-calculator v2 pages with static anchor pricing | Updated cabinet condition options: emptied/not emptied, $45/$90. |
| 17 | injects cleaner application tracking without enhanced conversion data | Verify the existing legacy application form where it remains, not the removed homepage popup; retain privacy assertions. |
| 18 | strips unused menu widgeticon assets when no widgeticon nodes remain | The clean homepage requires no legacy runtime stub. |
| 19 | rebuilds shared marketing city popups and removes the temporary extra city promo | Verify current shared city dialog and Service Areas ZIP form. |
| 20 | preserves menu CTA wiring and submenu content after the menu shell replacement | Native homepage script, current navigation and F6. |
| 21 | replaces heavy zero runtimes across home-like routes | Distinguish clean homepage from retained legacy variants; F3 prevents legacy wrapper regression. |
| 22 | keeps the home copy hand-coded without Tilda runtime | Check actual DOM/runtime assets, not compatibility selector strings. |
| 23 | serves Romeoville from the clean shared city template | Current summary link and navigation; retain location-specific content checks. |
| 24 | replaces heavy zero runtimes across all city page pilots | Current summary links; retain every city fixture and its content checks. |
| 25 | replaces heavy zero runtimes across static marketing page pilots | Clean pages need no legacy scripts; current navigation. |
| 26 | strips the legacy safety intro copy from marketing pages | Do not require the previous decorative heading markup; retain removal check. |
| 27 | adds the homepage fast quote CTA before the service areas map | Current CTA and map section classes; retain relative-order check. |
| 28 | adds local-service FAQ questions to the homepage FAQ grid | Current approved supplies wording; retain question and ordering checks. |
| 29 | removes the duplicate offscreen homepage simple steps copy | Current steps section, not removed element IDs; retain single-copy check. |
| 30 | removes duplicate copy from the shared benefits block | F4; count normalized visible text across old/new markup and test mobile positioning. |
| 31 | keeps the regular-cleaning main route hand-coded without Tilda runtime | Current shared navigation. |
| 32 | keeps the pricing copy hand-coded without Tilda runtime | Current shared navigation; pricing/canonical assertions retained. |
| 33 | keeps the move-in move-out main route hand-coded without Tilda runtime | Structural checks exclude script selector strings. |
| 34 | keeps the commercial-cleaning main route hand-coded without Tilda runtime | Current navigation and structural checks. |
| 35 | replaces heavy zero runtimes across all service page pilots | Current shared navigation instead of removed page-specific header controls. |
| 36 | keeps the regular-cleaning copy hand-coded without Tilda runtime | Current shared navigation. |
| 37 | keeps the commercial-cleaning copy hand-coded without Tilda runtime | Structural checks exclude compatibility selector strings. |
| 38 | keeps the move-in move-out copy hand-coded without Tilda runtime | Structural checks exclude compatibility selector strings. |
| 39 | server-renders cleaner popup forms and strips the heavy Tilda form runtimes | Test the retained legacy form on `/home-calculator`; candidate navigation is covered separately by F6. |

## Verification

- `node --test`: 739 passed, 0 failed, including admin tests.
- Added regression checks for indexable vs ad-only routes and for structural
  detection of Tilda assets without false positives from image filenames.
- Executed the quick-form runtime in an isolated VM: one event/handler/navigation,
  valid prefill, invalid-phone rejection, and unrelated-form passthrough.
- Local browser: city dialog opens/closes; candidate link opens the correct form;
  city quote form transfers name/phone to the quote page; About Us text rectangles
  do not overlap at four widths. External tracking requests were blocked for the
  browser form check. No candidate application or final quote was submitted.
- Screenshots are local ignored artifacts under `output/playwright/`.
- No commit, push, or deployment was performed for this audit.
