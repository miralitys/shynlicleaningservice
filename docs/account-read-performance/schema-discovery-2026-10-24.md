# Staff Read Backend Discovery

Date: 2026-10-24. Base release: `5de94cb7`. Local changes only, no deployment or SQL migration.

## Change

`lib/supabase-admin-staff.js` now remembers the read backend after the existing missing-table/schema checks select the quote-ops fallback. The choice is private to each client instance. A fresh client, including after a normal server restart, discovers the schema again.

The initial discovery is shared by simultaneous reads, but employee snapshots are not shared or cached. Once schema availability is known, waiting readers perform their own reads. The discovery gate releases before fallback data loading, so another employee does not wait for the first employee's full snapshot.

Both account-scoped and general snapshot readers use the choice. The primary read filters, fallback queries, pagination, mappers and response shapes are unchanged. Write operations still use their original routing. No prices, payroll formulas, assignments, order statuses or business records are changed.

Permission errors, network failures and HTTP 503 do not select a fallback backend. A failed fallback read fails visibly rather than returning old records. No account cache TTL was increased and no shared personal HTML cache was added.

## Measurements

### Production Baseline, No Patch Deployed

Chrome iPhone 16 emulation, width 393 px, no CPU/network throttling, four requests per screen. The natural navigation/cache behavior was retained. This is not a physical-phone or controlled network test.

| Screen | FCP median | FCP range | Server app median |
| --- | ---: | ---: | ---: |
| Calendar month | 1.580 s | 1.360-2.536 s | 0.774 s |
| Calendar day | 0.848 s | 0.636-2.620 s | 0.151 s |
| Earnings | 0.710 s | 0.624-1.520 s | 0.145 s |

No four-second sample occurred in this short series. This does not establish that such spikes have disappeared. The earlier 4.188-second earnings sample had 3.837 seconds to first byte and 1.892 seconds of server app time; the remaining pre-byte delay cannot be assigned precisely to network, proxy or scheduling from these metrics.

Raw metrics, with no customer data, are in the local workspace output folder `output/account-schema-discovery-2026-10-24/live-baseline.json` outside this repository.

### Controlled Preparation Comparison

Isolated local HTTP server, 254 synthetic orders, 163 completed, two cleaners, saved payroll and fixed overrides. Compare committed `ef1b5127` with committed `5de94cb7` on the same data, with dedicated tables available. Twenty requests per screen per version per delay condition. Fresh data reads bypass the account snapshot cache. Full HTML SHA-256 hashes match across both versions for each route, including day, month, earnings and tab-navigation routes.

Without injected network delay:

| Screen | Old server median | Separated preparation median | Old planning median | New planning median |
| --- | ---: | ---: | ---: | ---: |
| Calendar month | 49.80 ms | 18.94 ms | 28.59 ms | 3.80 ms |
| Calendar day | 47.99 ms | 17.30 ms | 28.48 ms | 3.92 ms |
| Earnings | 57.57 ms | 21.86 ms | 28.80 ms | 0 ms |

The separated preparation is not slower in this controlled fixture. This does not prove its cost for every production employee or dataset.

### Missing-Table Fix Comparison

Same local fixture, compare committed `5de94cb7` against the working tree. The assignment table returns the observed missing-schema response, and the existing quote-ops fallback supplies the same data. Twenty uncached requests per screen per version per delay condition. Additional first-process and cache-eligible tab samples are recorded separately.

With an artificial 80 ms delay per database request:

| Screen | Before server median | After server median | Before staff read window | After staff read window |
| --- | ---: | ---: | ---: | ---: |
| Calendar month | 362.89 ms | 282.76 ms | 165.03 ms | 82.34 ms |
| Calendar day | 363.38 ms | 280.23 ms | 164.82 ms | 82.72 ms |
| Earnings | 368.14 ms | 285.83 ms | 165.06 ms | 82.76 ms |

Repeated uncached requests fall from 10 database requests to 7. Missing-table responses fall from 1 to 0. Three primary staff requests run concurrently before the fallback, so removing them saves about one database round trip, not three sequential round trips. The first process read still discovers the missing schema.

With no injected network delay, month medians are 18.34 ms before and 19.08 ms after, normal small timing variation rather than a meaningful CPU speedup. The benefit is removal of unnecessary network waits. These numbers are not predicted production load times.

Full HTML hashes match across all compared routes. Requests remain GET-only. Auth, staff and order request windows, planning and rendering times are captured by test-only instrumentation, not added to public server headers or production logs. Parallel database request durations are reported as a phase window, not summed as sequential work.

Reproduce:

```sh
node scripts/benchmark-account-sections.js
env ACCOUNT_SECTION_BASELINE_REF=ef1b5127 ACCOUNT_SECTION_AFTER_REF=5de94cb7 ACCOUNT_SECTION_DEDICATED=1 node scripts/benchmark-account-sections.js
```

Raw output: `output/account-schema-discovery-2026-10-24/fallback-ab.json` and `preparation-ab.json` in the parent workspace. The benchmark uses only fake credentials, synthetic records and an isolated local server. It rejects external fetches and database mutations.

## Data Safety Checks

Validation: full `npm test` run passed 850 tests, 0 failed, 0 skipped (122.47 seconds). The focused final account/staff/payroll group passed 23 tests. `git diff --check` passed.

- Fallback reads retain all 1107 synthetic assignments with a database page cap of 23, including the final order beyond the former 1000-ID limit.
- Both team members remain present; each employee receives only their own assignments.
- Reassignment is visible on the next read, including removal from the previous employee.
- Concurrent discovery does not share one employee's snapshot with another.
- Network, permission and fallback outages do not return partial or stale data.
- HTTP order/history, calendar, detail and payroll coverage remains in `test/account-read-performance.test.js` and `test/account-section-context.test.js`.
- Fixed overrides, saved paid payroll, customer amounts and team fields retain their existing behavior; input fixture records and rendered HTML are unchanged by the read optimization.
- Existing write routing is checked separately and was not edited.

Changed source/support files:
- `lib/supabase-admin-staff.js`
- `test/account-staff-read-fallback.test.js`
- `test/support/account-section-fixture.cjs`
- `test/support/account-section-profiler.cjs`
- `scripts/benchmark-account-sections.js`
- This report.

## Remaining Limits

This does not remove the first schema discovery, cache expiry, authentication reads, the full assigned order-summary read, shared HTML weight or network/proxy variability. It does not implement the proposed compact monthly calendar. No claim is made that this alone eliminates the four-second tail.

Rollback: revert the local read-backend change and remove the new test/benchmark/report files. No database rollback is required.
