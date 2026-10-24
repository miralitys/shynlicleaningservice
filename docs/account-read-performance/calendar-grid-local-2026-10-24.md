# Narrow Monthly Calendar Read

Date: 2026-10-24. Base and live release: 86e42c57681b24da0f296e94d9806ca012e91dda.
Local working-tree changes only. Not committed, pushed or deployed. The new SQL was NOT installed in Supabase.

## Scope

- Only a compact monthly grid without a selected day/full order uses the new calendar read. Normal desktop tables, selected days, full detail fragments, history, dashboard and earnings retain their complete existing reads.
- New read-only SQL view account_calendar_entries depends on the already-installed account_order_list_entries view. It selects only the date and the state fields required by the existing order recognizer and cancellation rules. Price, payroll, customer contacts, calculator details, photos and checklists are not part of the calendar DTO.
- Legacy recognition fields remain, including completion-comment-only/photo-only orders, explicitly empty canonical roots, and separate canonical/admin status precedence. The existing calendar selector still applies assignment date overrides and cancellations. No overall ID/history limit was added.
- Cursor pagination, exact-count completeness checks, staff membership enforcement and the four-read concurrency bound remain. Missing calendar migration alone permits the complete established read; permission/outage/incomplete-response errors fail visibly, never as an empty or partial grid.
- One latest account snapshot is retained with an explicit calendarGridOnly tag. Complete snapshots may serve a grid, never the reverse. Fresh loads replace older snapshots in either direction. The existing eight-second TTL, fresh user authentication/status reads, payout revision and mutation invalidation remain unchanged.

Not changed: order writes, amounts, teams, payroll calculations/saved payouts, staff availability, authorization, rendering/CSS, calculator, reminders or series generation. The unrelated existing test/admin-route-client-order-prefill.test.js change was preserved untouched.

## Verification

Final npm test: 873 passed, 0 failed, 0 skipped; 105412.10 ms. Focused projection/context suite: 19 passed. git diff --check passed. Independent read-only review confirmed the cache freshness regression is resolved and found no further confirmed issue.

Temporary local PostgreSQL installed and reinstalled both list/calendar SQL files against 1160 synthetic rows, including all paired legacy state variants. It verified exact DTO/date/count/cancellation parity, unchanged ledger hashes, no anon/authenticated SELECT/EXECUTE, no service-role writes to the new view, and security-invoker/security-barrier options. The temporary cluster was removed afterward. This was not the configured Supabase database.

Other checks cover 1107 IDs, the tail beyond 1000, backend page caps of 23, absent count metadata, missing migrations, denied/failed/invalid/incomplete responses, unchanged full order/payroll reads, complete selected days, full cards, foreign-order rejection, empty months and every historical month. An explicit rescheduling regression uses independently cloned staff snapshots: a freshly loaded grid cannot be overwritten by an older full cache, nor can a fresh full read resurrect an older grid date.

## Current-Data Read-Only Check

An isolated process in the existing Render shell compiled only the new pure DTO mapper in memory, not on disk or into the running application. Its fetch guard allowed only Supabase REST GET requests. Existing deployed clients read 352 assigned existing orders and six staff. The new DTO and old summary produced identical calendar results across 20 months for every staff member: 120 comparisons. The original in-memory orders/staff were unchanged; no amounts entered the thin DTO. No keys, raw customer records, sessions or tokens were exported.

The live commit remained 86e42c57. This validates the new mapper on current data, not installation of the new SQL view or a live performance improvement. Actual SQL semantics were independently exercised in temporary local PostgreSQL as described above.

Aggregate proof: parent workspace output/calendar-grid-local-2026-10-24/read-only-parity.json.

## Local HTTP Comparison

Compared against 86e42c57 with eight fresh navigations per screen/version/latency condition. Synthetic fixture: 254 orders, 163 completed, two team members, fixed overrides/saved payouts, 118 retained references, 300 other-cleaner assignments and substantial unused staff SMS history. No production access in this benchmark.

Rendered HTML comparison passed for the monthly mobile section, selected day, full month and earnings. The benchmark retains its existing normalization of the compact parameter in account links; no UI code changed.

| Metric, fresh month | Before | After |
| --- | ---: | ---: |
| Database JSON bytes | 613269 | 300499 |
| Database GET count | 8 | 8 |
| No-delay server median | 14.86 ms | 11.37 ms |
| Injected 80 ms/read server median | 374.55 ms | 367.93 ms |

The fixture transfers about 51% less data for the month. Selected day and earnings data bytes remain 613269 in both versions. The request count and two-wave order chunking are not changed, so a large live latency gain is not established or promised.

Reproduce:

```sh
ACCOUNT_SECTION_BASELINE_REF=86e42c57 ACCOUNT_SECTION_COMPACT=1 ACCOUNT_SECTION_USERS_FALLBACK=1 ACCOUNT_SECTION_HEAVY_STAFF=1 ACCOUNT_SECTION_SAMPLES=8 node scripts/benchmark-account-sections.js
```

Raw benchmark and final/focused test logs: parent workspace output/calendar-grid-local-2026-10-24/.

## Files And Later Activation

Production code: lib/account/calendar-list.js, lib/account/handlers.js, lib/quote-ops/store.js, lib/supabase-quote-ops.js.
Pending SQL: supabase/account_calendar.sql, creating only a read-only function/view with service-role SELECT. It requires supabase/account_order_list.sql first, already present on the live release. Do not apply it until the user approves activation/deployment.

Tests: test/account-calendar-projection.test.js, test/account-order-list-projection.test.js, test/account-section-context.test.js and test/support/account-read-fixture.cjs.

Future rollback can redeploy 86e42c57; the unused read-only view can remain without changing business data. No order/financial restoration or recalculation is needed.
