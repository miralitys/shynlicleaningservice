# Calendar SQL And Batch Read

Date: 2026-10-24, America/Chicago. Base/live build: 31848b15ad16f12cc9fb1971b961d3c087b66d07.
Local, uncommitted changes only. No push, deployment or production migration. No application records, amounts, assignments, payouts or history were changed.

## Findings And Read-Only SQL Measurements

Authenticated Supabase SQL Editor, role service_role inside BEGIN READ ONLY / ROLLBACK, with bounded statement timeouts. EXPLAIN ANALYZE/BUFFERS executed only SELECT queries. No production function, view, index, privilege or configuration was installed/modified.

The current account_calendar_entries view builds its output through account_order_list_entries. This repeatedly constructs/prunes broad JSON state while returning narrow rows. The first 75 requested IDs (52 existing records) took 71.596 ms execution, 0.867 ms planning. Its primary-key bitmap index lookup took about 0.109 ms; adding another ID index was not indicated.

Three paired measurements used the same 372 requested assignment references, yielding 255 existing records and 117 missing references. The candidate SQL helper was expanded into equivalent SELECT-only CTE expressions because installing it in production is not authorized. These are database execution times, not browser timings or live RPC/HTTP measurements.

| Equivalent full-set SQL | Execution samples, ms | Median, ms |
| --- | --- | ---: |
| Aggregate current nested view | 410.493, 389.665, 402.486 | 402.486 |
| Direct ledger, composed old state helpers | 331.473 (one exploratory sample) | 331.473 |
| Direct ledger, narrow state processing | 74.669, 72.399, 74.734 | 74.669 |

Narrow-state planning samples: 5.876, 2.645, 4.014 ms. Nested-view planning: 2.263, 1.503, 1.577 ms. No settings were changed to force index usage; the planner selected sequential scans for the large full-set predicate against the small ledger.

Simply combining the old view into one RPC was rejected as unnecessarily expensive. The candidate reads the ledger directly, selects only known state keys rather than enumerating unrelated large JSON values, and builds the narrow payload once. It retains the original completion-photo-only recognition and empty/null/scalar/array root behavior.

## Local Implementation

- Pending supabase/account_calendar_batch.sql adds account_calendar_batch_state(jsonb) and read_account_calendar_entries(uuid[]). Both are security invoker; the read function is STABLE and SELECT-only. Only service_role receives EXECUTE; public/anon/authenticated are revoked. Existing views/functions are not replaced.
- The read function returns one scalar JSON envelope, so PostgREST's top-level row cap does not truncate history. It includes version, requested_count, matched_count, missing_ids and rows. No overall order/history limit or date cutoff is added.
- lib/supabase-quote-ops.js uses one RPC POST for grid records. This is a SELECT-only function invocation, not an order write. The client verifies all counts, all requested IDs, duplicates/foreign rows, required payload roots, dates and missing references before returning anything. It preserves the previous per-75-ID result order without per-75-ID requests.
- Only a missing RPC migration permits the existing completely paginated view path. Permissions, network errors, internal SQL errors and malformed/incomplete replies fail visibly. Schema availability is remembered, not employee/order data. Existing custom-table configurations keep their old path.
- Only compact month grids use this method. Selected days, full cards, history, ordinary desktop month tables, earnings, authorization and cache rules are unchanged. No renderer, CSS, order mutation, pricing, payroll or team-assignment code changed.

## Integrity Checks

- Final npm test: 877 passed, 0 failed, 0 skipped; 119461.66 ms. git diff --check passed.
- A disposable local PostgreSQL cluster installed/reinstalled the pending SQL, exercised the real scalar RPC on 1284 synthetic rows, verified exact parity with the existing SQL view and unchanged ledger hashes, and checked denied public/user execution plus STABLE/security-invoker properties. The temporary cluster was removed. This was not Supabase.
- Tests retain more than 1000 records, low fake REST page caps, duplicate IDs, missing references, historical/future dates, rescheduled assignments, cancellations, empty months, legacy roots and completion-only recognition. Malformed/partial/foreign/denied/failed replies never fall back to stale or partial data.
- A handler test exercises the actual new client through a synthetic RPC and compares grids, all 1106 recognized historical orders, selected-day details, full month, full cards, foreign-order denial and earnings against complete old reads. Original fixture records, teams, prices and payouts remain unchanged.
- In production, a SELECT-only whole-ledger comparison returned source_rows=924, candidate_rows=924, differences=0, missing_count=0. It compared exact date/payload values with the existing view, not merely counts.
- A GET-only Render audit still found 924 ledger rows and 352 assigned existing orders across six staff. Financial/team/date, profitability, and every staff member's order-ID/earnings/saved-payroll hashes match the preceding live-deployment audit. Only aggregate results were retained; no customer records or secrets were exported.
- The live HTML build remained 31848b15. New production RPC/helper absence was checked separately in the catalog.

## Local HTTP Benchmark

Eight fresh navigations per screen/version/latency condition against 31848b15. Synthetic fixture: 254 orders, 163 completed, fixed overrides and saved payouts, retained/foreign references and large staff payloads. The fixture permits only GET and this specific read-only RPC POST. It does not reproduce PostgreSQL execution cost or real mobile networking.

| Fresh compact month | Before | Candidate |
| --- | ---: | ---: |
| Database requests | 8 | 4 |
| Database JSON bytes | 300499 | 304011 |
| No-delay server median, ms | 11.54 | 10.73 |
| Injected 80 ms/request server median, ms | 368.78 | 278.25 |
| Injected-delay order-read median, ms | 185.11 | 96.48 |

The small byte increase is the explicit completeness/missing-reference envelope. It replaces five grid reads in two waves with one read, while auth/staff reads stay unchanged. All selected-day, earnings and full-month HTML comparisons passed and retain eight requests/613269 bytes. Month HTML comparison also passed. No live browser speed improvement is claimed before deployment.

Reproduce:

```sh
ACCOUNT_SECTION_BASELINE_REF=31848b15 ACCOUNT_SECTION_CALENDAR_BATCH=1 ACCOUNT_SECTION_COMPACT=1 ACCOUNT_SECTION_USERS_FALLBACK=1 ACCOUNT_SECTION_HEAVY_STAFF=1 ACCOUNT_SECTION_SAMPLES=8 node scripts/benchmark-account-sections.js
```

## Files And Activation

Production: lib/account/calendar-list.js, lib/supabase-quote-ops.js. Pending SQL: supabase/account_calendar_batch.sql. Verification: scripts/benchmark-account-sections.js, test/account-calendar-projection.test.js, test/account-order-list-projection.test.js, test/account-section-context.test.js, test/support/account-read-fixture.cjs, test/support/account-section-fixture.cjs, and this report.

The unrelated pre-existing test/admin-route-client-order-prefill.test.js edits were not touched.

Evidence: parent workspace output/calendar-batch-local-2026-10-24/ (redacted SQL plans/timings, SQL parity, aggregate audit, benchmark, final test log).

Future activation requires explicit approval: apply the pending SQL after the already-installed account_order_list/account_calendar migrations, then deploy and repeat authenticated browser timings and integrity audits. Rollback would redeploy 31848b15; unused new read-only functions may remain without restoring/recalculating any order or payout. Nothing has been activated now.
