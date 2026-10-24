# Compact Monthly Cleaner Calendar

Date: 2026-10-24. Base release: e7568d44. Local implementation only, not committed or deployed. No SQL migration or production-data changes.

## Behavior

- Mobile-only month controls explicitly add calendarCompact=1. This monthly page prepares counts by date, the unchanged global assignment count and the employee's availability. It does not run planning, routes, payroll calculation, checklist preparation or template reads for the month grid.
- Ordinary/direct monthly URLs keep the complete desktop table in the first response. No viewport detection, user-agent guesses, viewport cookies or extra requests are needed on that path.
- Selecting a day uses the existing showDay=1 GET link. Only that day's orders get their full presentation preparation. Other days' badges remain available through the month summary.
- Full mobile cards still use the existing authenticated order-detail fragment, with a fresh ownership check.
- Only for an explicitly compact URL above the existing 720 px mobile breakpoint, the original monthly desktop card/table is fetched automatically. Expanding a mobile page to desktop loads it, once. Existing action handlers are rebound after insertion.
- The fallback ordinary GET adds calendarFull=1 and renders the complete original page without relying on JavaScript. This is also the visible fallback link after a failed desktop fragment load.
- Desktop fragment errors and unexpected redirected login HTML show an error, not a misleading empty month. Authentication, assignment filtering, no-store responses and fresh fragment reads remain enforced.
- Day view, order lists, full history, earnings and all write logic remain unchanged.

## Routes

Existing full desktop URL: /account?section=calendar&view=month&date=YYYY-MM-DD

Mobile grid URL: same URL with calendarCompact=1. The mobile Month toggle, previous/next arrows and all day links opt in explicitly.

Mobile selected day: same compact URL with showDay=1.

New desktop GET fragment: same month URL with fragment=calendar-orders. Requires the calendar section and month view; invalid combinations return 400. It returns only the original desktop order card, without the full layout or scripts.

Full GET fallback: same month URL with calendarFull=1, which takes precedence even if calendarCompact=1 is also present.

No existing URL, role or stored order value was removed or rewritten.

## Verification

Initial implementation: full test suite 855 passed, 0 failed, 0 skipped. After the desktop correction: focused context tests 10 passed; complete suite 856 passed, 0 failed, 0 skipped, 116.55 seconds. One existing render test was updated only to expect calendarCompact=1 on the three mobile navigation URLs it asserts. git diff --check passed.

Safety coverage includes:
- All months across a fixture of 1107 orders, including the order beyond the former 1000-ID cap.
- Past/future months, empty months, moved assignment dates, calculator-date fallback, canceled records and precedence of the original order roots.
- Identical monthly mobile markup, date badges and availability markings versus complete preparation.
- Selected-day items deeply equal the original items, including teams, travel information and earnings.
- Desktop fragments retain all original month items and exact original table/card HTML.
- Fixed overrides, saved paid payroll and source fixtures remain unchanged.
- Foreign or removed assignments cannot be fetched through the new fragment or full-card endpoint.
- Failed database reads return errors rather than partial or cached month contents.
- No desktop fetch at mobile width; complete table in the initial ordinary desktop response; one fetch only for an explicitly compact URL on desktop/resize; failed or redirected responses preserve the full-GET fallback; existing interactions are rebound.
- Explicit compact opt-in is confined to mobile month controls. Day view and focused/full-order URLs cannot become counts-only pages. calendarFull=1 wins over calendarCompact=1.

## Browser Checks

Local isolated server, synthetic cleaner accounts and 254 synthetic orders only. No production session or real customer records used.

- Desktop: all 31 January orders, or all 30 June orders, appear in the initial ordinary monthly response, without a placeholder.
- 390 px: 31 day links, no hidden desktop rows or horizontal overflow on the default month page.
- Selecting January 1 shows its single order. Its full card opens and retains the $125.50 fixed payout.
- 360 and 390 px full cards fit; back navigation works.
- Next month has all 28 February day links and no hidden desktop rows at 360 px.
- Expanding to desktop loads all 28 February rows without a reload.
- June desktop table has all 30 rows; all 36 async forms have their existing handlers bound. No mutation action was submitted.
- Full GET fallback has the same 30 June rows with no fragment placeholder.
- No browser errors captured.

The final browser pass reported no application errors. Warnings from an unrelated Chrome extension were excluded, not attributed to the application.

Screenshots and UI results are saved outside the repository in the parent workspace: output/compact-calendar-2026-10-24/.

## Local Benchmark, Mobile Month

Compare committed e7568d44 with the final working tree. Same 254 synthetic orders, 163 completed, two cleaners, fixed overrides and saved payroll. Five uncached navigations per screen per version per delay condition in the latest section check. These are local server measurements, not live/mobile performance estimates.

| Monthly page metric | Before | After |
| --- | ---: | ---: |
| HTML before compression | 509000 bytes | 457585 bytes |
| Server median, no injected delay | 18.48 ms | 12.50 ms |
| Planning median, no injected delay | 3.39 ms | 0 ms |
| Rendering median, no injected delay | 3.80 ms | 2.36 ms |
| Server median, artificial 80 ms/database request | 285.95 ms | 275.57 ms |

The month-grid mobile markup matches across versions after normalizing only the intentional calendarCompact query parameter in mobile account links. Complete day-view, earnings and full-month HTML also match after that same narrowly scoped link normalization. Raw HTML hashes and byte counts remain recorded separately, so the intentional link differences are not hidden.

The final compact response is 51415 bytes (10.1%) smaller than the old full response. This is an uncompressed HTML reduction, not a measured mobile load-time improvement.

Reproduce:

```sh
ACCOUNT_SECTION_BASELINE_REF=e7568d44 ACCOUNT_SECTION_COMPACT=1 node scripts/benchmark-account-sections.js
```

The benchmark includes a monthFull comparison. The initial 20-sample measurements and the initial full-HTML check remain in the parent workspace's output/compact-calendar-2026-10-24/benchmark.json and full-html-check.json as historical evidence from before the explicit mobile opt-in. The final section check is sections-desktop-safe.json. Only the monthly grid is compared by its mobile section hash; full day, earnings and fallback pages are compared by complete HTML after the link normalization described above.

## Desktop Regression Found and Fixed

An end-to-end local HTTP harness follows the initial page and, if present, its serial table fragment. It verifies the identical complete desktop table hash on every sample. It includes both bodies and local HTML parsing, not browser paint. All database calls are synthetic GETs; no production access.

The initial compact-by-default implementation did regress desktop completion: with an artificial 80 ms delay per database request plus 120 ms per client/server round trip, ten-sample medians were 422.11 ms on e7568d44 versus 818.24 ms on the initial implementation. Requests doubled from one to two, database reads from seven to fourteen, and combined uncompressed bodies grew from 509000 to 511198 bytes. Measuring only the first response had missed this regression.

The correction makes compact mode explicit on mobile-only calendar controls. Ordinary desktop monthly URLs receive the original complete table in one response, with seven database reads, no automatic fragment and no additional network round trip. An explicitly compact URL expanded/opened on desktop still uses the fresh authenticated fragment; this slower exceptional path is retained for correctness and resizing, not claimed as an optimization.

Final isolated benchmark, twenty samples per version and delay condition, run separately from the test suite:

| Complete desktop table metric | e7568d44 | Corrected local version |
| --- | ---: | ---: |
| Median without injected delay | 34.40 ms | 33.53 ms |
| Median with 80 ms/database request and 120 ms/HTTP round trip | 431.62 ms | 411.45 ms |
| HTTP requests for the ordinary monthly URL | 1 | 1 |
| Database reads per ordinary monthly URL | 7 | 7 |
| Uncompressed initial desktop HTML | 509000 bytes | 509748 bytes |

The 748-byte desktop increase consists of the explicit compact parameters on mobile-only links. The complete desktop table hash is identical to the old version. Small timing differences should not be interpreted as a reliable desktop speedup; the important result is removal of the second serial request and its duplicate database reads. The exceptional explicit-compact-on-desktop check still needs two requests, measuring 783.09 ms with the same artificial delays; it is intentionally not hidden from the report.

Reproduce complete-table timing:

```sh
node scripts/benchmark-account-calendar-desktop.js
```

Raw regression measurements: desktop-before-fix.json. Final measurements: desktop-after-fix.json. These are local modeled latencies, not live measurements. Browser verification covers the initial desktop table, mobile month/day/full-card flow at 360/390 px, next month and resize to desktop. The browser also opened the last list page, all 163 saved payroll rows and the oldest history record on the 254-order fixture. No order action or financial form was submitted.

## Tradeoffs and Limits

The complete assigned summary set is still read from the database. No new date/ID limit was introduced, and no account-cache TTL was extended. This change removes presentation work, not all database or network waiting. Shared layout/styles/scripts still dominate the initial HTML.

A direct monthly URL on a phone without calendarCompact=1 intentionally uses the complete one-response fallback. Normal mobile calendar controls opt in to the smaller page. This prioritizes predictable desktop behavior and data availability without device guessing. No claim is made about live desktop latency or disappearance of four-second outliers; deployment and live measurements need separate approval.

Changed files:
- lib/account/calendar-data.js
- lib/account/handlers.js
- lib/account/render.js
- test/account-section-context.test.js
- test/account-dashboard-render.test.js
- test/account-read-performance.test.js
- test/support/account-baseline-loader.cjs
- scripts/benchmark-account-sections.js
- scripts/benchmark-account-calendar-desktop.js
- This report.

The unrelated existing edit to test/admin-route-client-order-prefill.test.js was left intact. Rollback requires only reverting these scoped local changes; no database rollback is needed.
