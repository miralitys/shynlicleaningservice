# User and Staff Read Optimization

Date: 2026-10-24. Base/live release: e1d76c841da993bd74623db5169a4fa52645d300.
Local working-tree changes only. Not committed, pushed or deployed. No SQL migration or application-data writes.

## Changes

- The users client remembers whether the dedicated users table exists. A known missing table is not probed on every later read. Concurrent first reads share only schema discovery, never a users snapshot. Status, role, password hash and verification state are still fetched fresh on each successful client read.
- HTTP 403/503 and network errors do not select a different users backend. Failed fallback reads still reject. User writes retain their original primary/fallback routing. This does not alter the users store's pre-existing error/cache policy or the account-cache TTL.
- The quote-ops staff read used by cleaner accounts selects mapper-required fields instead of entire rows. It omits only unused staff SMS history. Pay rates, addresses, contact details, calendar connection, availability and Contract/W-9 fields remain present. Complete admin reads and staff write caches remain unchanged.
- Quote-ops assignments use a projected row and a conservative server-side candidate filter. Full teams, date/time overrides, status, notes, calendar synchronization and travel estimates remain intact. The original mapper and final staff-ID membership check still decide visibility.
- The candidate filter deliberately includes legacy scalar/whitespace IDs and falsy payloads that fall back to root warnings. Unusual staff IDs use the complete compatible read rather than interpolating an unsafe filter. There is no new total order/assignment limit, and cursor pagination still reads every page.

Not changed: order-summary queries, monthly-calendar routing, order detail/history, earnings formulas, amounts, teams, payouts, permissions, settings or schema. The later plan items for calendar-specific order reads and cache reuse are not implemented here.

## Tests

Full npm test: 866 passed, 0 failed, 0 skipped, 109.50 seconds. Focused existing tests: 34 passed. Ten additional tests cover users discovery/freshness/errors/concurrency/write routing and staff projection/legacy membership/pagination.

Safety coverage includes 1107 own assignments, the last ID beyond 1000, both team members, 300 unrelated assignments, page caps of 23 and missing count metadata; current status/role/password changes and user deletion; Contract/W-9 and unavailability preservation; unchanged complete admin reads; failed reads rejecting rather than producing partial cleaner lists. Fixture source data remains unchanged.

The complete calendar/day/earnings/fallback HTML comparison also passes against e1d76c84 using the same synthetic inputs, including substantial staff SMS history and retained non-order assignment references. No UI or rendering code changed.

## Real Supabase Read-Only Compatibility Check

An isolated node process in the existing server shell evaluated the two local client modules in memory alongside the deployed clients. It did not replace files, install modules, restart the app or change the running service. A fetch guard allowed only GET requests to the configured Supabase origin. No keys, contact details or customer rows were exported.

The deployed commit remained e1d76c84. Actual PostgREST projection and candidate-filter syntax succeeded:
- All 372 assignment references matched exactly.
- All 255 existing cleaner orders were retained, with all six staff records available for team resolution.
- Financial, team, schedule and calculated/saved payout results matched.
- Staff parity excludes only the deliberately omitted unused SMS history and generated availability createdAt/updatedAt fields. Profile, document, pay and availability values otherwise match.

| Warm users + staff/assignment read | Deployed clients | Local clients, isolated process |
| --- | ---: | ---: |
| GET requests | 4 | 3 |
| Missing-table responses | 1 | 0 |
| Users + staff/assignment JSON | 1047018 bytes | 563854 bytes |
| Staff/assignment JSON alone | 1036696 bytes | 553709 bytes |
| First interleaved sample | 199 ms | 200 ms |
| Second interleaved sample | 195 ms | 119 ms |

Staff/assignment JSON is 46.6% smaller. These two samples verify real query compatibility and reduced transfer, not a stable live browser speedup. The five order-summary requests remain unchanged; the complete fresh account read should therefore remove one request in this current dataset, not eliminate all server waiting.

## Isolated HTTP Benchmark

Eight fresh navigations per screen/version/delay condition. Synthetic fixture: 254 orders, 163 completed, two cleaners, 118 retained references and 300 other-cleaner assignments; large unused staff SMS history. No production access. Full rendered HTML matches the baseline (the benchmark normalizes only its existing compact-link parameter).

With artificial 80 ms delay per database request, monthly server median: 533.78 ms before, 361.42 ms after. Fake database reads: 10 to 8; JSON: 960085 to 613269 bytes. Unlike the real dataset, this fixture also avoids an additional assignment page after filtering, so its request savings must not be presented as the production count. Without injected delay the monthly medians were 15.84 and 15.14 ms.

Reproduce:

```sh
ACCOUNT_SECTION_BASELINE_REF=e1d76c84 ACCOUNT_SECTION_COMPACT=1 ACCOUNT_SECTION_USERS_FALLBACK=1 ACCOUNT_SECTION_HEAVY_STAFF=1 ACCOUNT_SECTION_SAMPLES=8 node scripts/benchmark-account-sections.js
```

Aggregate compatibility proof, benchmark JSON and test log: parent workspace output/user-staff-read-check-2026-10-24/. No claim is made about live phone speed before a separately approved deployment.

## Files and Rollback

Production files: lib/supabase-admin-users.js and lib/supabase-admin-staff.js.

Checks/support: test/account-users-read-fallback.test.js, test/account-staff-projection.test.js, test/support/account-read-fixture.cjs, test/support/account-section-fixture.cjs, test/support/account-baseline-loader.cjs, scripts/benchmark-account-sections.js, and this report.

The unrelated existing test/admin-route-client-order-prefill.test.js edit was left intact. Rollback needs only reverting these scoped local changes; no database rollback is required.
