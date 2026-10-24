# Cleaner account read optimization

Date: 2026-10-24. Base version: `68bd6601`.
Status: local working-tree changes only. No deployment, push, production writes,
SQL migration, or customer/order restoration was performed.

## Changes

- Read only the current cleaner's assignments from the dedicated staff table.
  Load staff contact/rate fields for team resolution and full documents only for
  the current employee. Reuse the users snapshot from session validation.
- Use an account-specific order summary read. Omit CRM, SMS, retry history and
  customer photos from that read. Preserve prices, schedule, team, fixed-pay
  overrides, payroll history and checklist data needed by existing list actions.
- Cursor-paginate every assignment and order chunk. There is no 1,000-order cap
  in the new account reader. Read chunks of 75 with at most four in flight.
- Keep read-only summaries separate from full records and writable caches.
  Database failures return an explicit error, not a partial cached order list.
- Render no hidden detail cards on the ordinary initial page. Request one full
  card when clicked: `GET /account?fragment=order-detail&order=ID`.
- Validate the session and current assignment again on every detail request.
  A removed assignment stops opening even after the old list has been cached.
- Preserve direct order/SMS links, which preload only the requested full card.
- Add normal GET pagination for active assignments, 50 per page. Keep completed
  history available through the existing "show all history" link and calendar.
- Preserve existing note, confirmation, decline, checklist and completion forms.
  After an action, reload the active card with fresh full data.

Both canonical and legacy order-state roots are still read from the database in
full before projection. This deliberately preserves legacy precedence, including
an empty canonical root. This pass does not claim to remove every signature or
photo from database transport, and it does not introduce a schema dependency.

## Reproducible Before/After Benchmark

Command: `node scripts/benchmark-account-read.js`

The benchmark runs isolated HTTP servers against a fake Supabase transport and
254 synthetic orders: 91 active and 163 completed. The baseline loader reads the
seven changed pre-existing product modules from Git at `68bd6601`, in memory.
It does not change the checkout or call the live database.

| Metric, ordinary first page | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Uncompressed HTML bytes | 1,610,581 | 824,559 | 48.8% |
| Database response bytes | 4,374,070 | 1,875,818 | 57.1% |
| Pre-rendered hidden detail cards | 111 | 0 | 100% |
| Database GET count | 8 | 8 | unchanged |

| Isolated HTTP response-header time, ms | Before | After |
| --- | ---: | ---: |
| First run | 343.2 | 275.9 |
| Repeat 1 | 221.3 | 203.6 |
| Repeat 2 | 224.7 | 208.3 |
| Repeat 3 | 238.6 | 214.5 |

The transport has no real network latency. These are local comparisons, not a
production load-time claim. A real before/after timing requires a later authorized
deployment and live measurements.

## Verification

- `npm test`: **817 passed, 0 failed, 0 skipped**, duration about 112 seconds.
- New read-only regression tests cover 1,107 assigned orders. All 1,000 active
  orders across 20 pages and all 107 completed orders remain reachable, including
  IDs beyond the old 1,000-ID cutoff.
- Compared the full ID set, price fields, date/time, address, team, status,
  overrides and payroll snapshots before/after projection. Compared calculated
  earnings and payroll records. The underlying fixture remained byte-for-byte
  unchanged. Read-only HTTP tests issued GET requests only.
- Repeated reads with a database page cap of 23, with and without row counts.
  Repeated assignment reads with a cap of 100.
- Additional isolated legacy-table check preserved all 1,107 assignments under a
  37-row page cap, with both team members and GET requests only.
- Foreign/missing orders return 404. An unauthenticated request redirects to
  login. Removing the current cleaner's assignment revokes detail access.
  List/detail database failures return 503 instead of stale/partial records.
- Existing HTTP workflow tests still cover notes, appended notes, confirmation,
  decline, stages, checklists and completion. Expectations were moved to the
  detail response where a form is intentionally no longer pre-rendered.
- Chrome local UI: desktop 1440 px, mobile 390 px and 360 px. Checked lazy detail,
  back navigation, page 2 including the last active order, complete history and
  its oldest order, calendar detail, and earnings history. One detail exists in
  the DOM after opening; zero exist on an ordinary initial page.
- At 390 px and desktop, document width matched the viewport. At 360 px, the
  current unchanged stylesheet produced a 362 px document width. No layout/CSS
  changes were included in this request.
- `git diff --check` passed. The temporary isolated preview server was stopped.

All UI evidence uses synthetic clients and employees:

- `desktop-list.png`
- `mobile-detail-390.png`
- `mobile-detail-360.png`
- `calendar-detail-360.png`

## Changed Product Files

- `lib/account/order-list.js` (new)
- `lib/account/handlers.js`
- `lib/account/render.js`
- `lib/admin-staff-store.js`
- `lib/admin-users-store.js`
- `lib/quote-ops/store.js`
- `lib/supabase-admin-staff.js`
- `lib/supabase-quote-ops.js`

## Tests and Tooling

- `test/account-read-performance.test.js` (new)
- `test/account-dashboard-render.test.js`
- `test/admin-route-orders.test.js`
- `test/admin-route-settings.test.js`
- `test/support/account-read-fixture.cjs` (new)
- `test/support/account-baseline-loader.cjs` (new)
- `scripts/benchmark-account-read.js` (new)
- This report and the four screenshots.

The pre-existing edit to `test/admin-route-client-order-prefill.test.js` and other
unrelated local/untracked files were not changed or reverted by this task.

## Not Changed / Remaining Limits

No price, team, compensation, payout or order-write rules were changed. No stored
orders, customers, assignments or payroll records were edited. Admin pages,
reminders and public pages were not changed. No new accounts or permissions.

The shared inline CSS/JS, existing eight-second account cache and whole-dashboard
refresh after mutations remain. Opening the complete history still renders its
summary list, but no longer renders every full detail card. Legacy staff-table
fallback still reads staff payloads before filtering, while dedicated staff
tables use scoped reads. These are possible later optimization steps, not part of
this pass.

No release exists for these edits yet. No database rollback would be needed if
the code is later released and reverted to its prior version.
