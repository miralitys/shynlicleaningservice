# Orders read performance

## Scope

Prepared locally after `33df0747`. No deployment, schema migration, production
requests, or production data repair is needed to develop or test these changes.

- `GET /admin/orders` no longer starts recurring series maintenance.
- The application starts the same guarded maintenance routine independently:
  first run after 60 seconds, then every five minutes, with no overlapping runs
  within a process. Existing SQL slot locking/idempotency and manager-approval
  checks remain in use. Errors are logged and later runs can retry.
- `RECURRING_ORDER_MAINTENANCE_ENABLED=0` disables this worker. Tests disable it
  by default to prevent background changes in unrelated test cases.
- `listOrderListEntries()` has a dedicated read-only Supabase SELECT. It omits
  SMS/CRM retry payloads and retry history instead of fetching every column.
  Order-state roots are read intact to preserve canonical-versus-legacy object
  precedence, including empty canonical objects. Their large completion and
  signature fields are discarded before list rendering.
- Paging uses the primary-key cursor, not a date cutoff or a total-1000 limit.
  Every page requests the exact remaining count for its own cursor-filtered
  query, so a smaller database response cap and inserts between pages cannot
  hide a pre-existing tail. Without count metadata, reading continues until an
  empty page. Duplicate/nonascending IDs and failed reads are errors, never a
  partial memory snapshot.
- Display summaries never replace full entries in the shared order store.
  Both `?order=ID` and `?fragment=order-dialog&order=ID` read the full entry by ID
  before rendering the editable detail card, without a stale memory fallback.
  A missing or unavailable full record cannot become an editable summary card.
  No write path consumes a summary.
- Prices are read directly from `total_price`. Team decoration still uses the
  same staff-assignment context as the Orders page and dashboard.

## Reproduce measurements

```sh
node scripts/benchmark-admin-orders.js
```

This runs the real HTTP server against an isolated synthetic, read-only fetch
stub with 360 orders. It uses temporary files and fake credentials; all external
writes are rejected. The stub honors SELECT projections and cursor paging. It
has **no real database or network latency**, so these are comparative local
measurements, not a claim about production response time. Six sequential page
requests are made; the warm median excludes the first request.

Measured on 2026-10-20, before and after the changes on the same machine:

| Measurement | Before | After |
| --- | ---: | ---: |
| First response headers | 231.1 ms | 201.3 ms |
| Warm median response headers | 197.5 ms | 179.8 ms |
| Warm median complete response | 202.1 ms | 184.3 ms |
| Data read from stub, warm request | 5,028,546 bytes | 2,428,986 bytes |
| Data read from stub, first request | 10,056,949 bytes | 2,428,986 bytes |
| Orders rendered | 360 | 360 |
| HTML bytes | 2,169,830 | 2,169,903 |

The after column is the final verification rerun. An earlier after run measured
158.1 ms warm headers; timings vary with local load. Byte and order counts stay
the same. Production latency has not been measured for the candidate build.

The remaining HTML is deliberately not paginated or redesigned in this change.
The board and table still contain all matching orders, and the client lookup
still works without a new network dependency. Those are separate later steps.

## Verification

- The final targeted regression run passes all 116 tests, including viewer
  permissions, manual amounts, intake, recurrence, dashboard and full-card reads.
- Projection tests compare visible order records before/after, including legacy
  order state, policy stage, payment, recurrence, and original manual amounts.
- A Supabase test reads 1,257 records; another uses a server-side cap of only 100
  records per page. No IDs, amounts, or teams are dropped or altered.
- Additional regressions cover inserts between pages at exactly 1,000 records,
  missing Content-Range headers, invalid cursors, and stale detail-cache prices
  when the authoritative database record is unavailable.
- An HTTP regression renders all 1,003 synthetic orders, searches the last page,
  opens full detail by both URLs, and checks that GETs issue no writes and no
  full-table series scan.
- Existing series tests cover manager approval, duplicate protection,
  single-visit versus future-series edits, and preservation of assignments.
- Two pre-existing failures in `test/admin-route-orders.test.js` are unrelated:
  an obsolete client-comment inheritance expectation and the quote-workspace
  memory-fallback expectation. Do not change order behavior to mask them.

## Read-only production comparison

On 2026-10-20 the candidate SELECT and projection were run in memory in the
existing Render shell against the configured Supabase connection. The app was
not restarted, no candidate files were written to the server, and no deployment
or database mutation was performed. Raw client records were not saved locally.

- Full ledger: 908 rows; after existing technical-row filtering: 416 records.
- Full and lightweight readers both produce all 357 actual orders, with 357
  unique IDs. Amounts, calendar-decorated teams, dates/times, statuses, payments,
  recurrence and policy funnel stages match.
- 1,792 search/filter result sets match, including each order's name, phone,
  request code, address and team; only aggregate counts were printed.
- Manual-order client lookup contains the same 130 clients and identical
  addresses, room/bathroom counts, area, comments and notification preferences.
- State counts: completed 151, scheduled 156, canceled 46,
  cleaning-complete 3, rescheduled 1.
- Full-row hashes before/after the comparison match; the audit's fetch wrapper
  rejects all methods except GET and all other network origins.

`scripts/audit-admin-orders-read.js` repeats the comparison when run in a checkout
containing the candidate files and an already configured database connection:

```sh
node scripts/audit-admin-orders-read.js
```

Never paste or print database credentials. This script does not start the app or
its background jobs. A changed database snapshot causes the audit to fail and
request a repeat rather than claiming a valid comparison.
