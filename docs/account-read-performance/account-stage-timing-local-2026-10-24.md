# Account Request Stage Timing

Date: 2026-10-24, America/Chicago. Live and Git baseline: `ace35b341e7d9cfa9c63392dc5dc2d73f367f4c2`.

Implementation is local and uncommitted. No push, deployment, SQL, configuration, permissions, pricing, assignments or payout changes. The live measurements below used the already deployed release, not the new diagnostic code.

## Repeated Live Measurements

Authenticated Chrome on this Mac, foreground page, verified actual width 393 px in device emulation. No intentional network or CPU throttling. This is not a physical phone or cellular test. Five measured navigations per screen, 25 total; initial setup navigations were excluded. No local test suite was running during this browser sample.

| Screen | Samples | Median app, ms | Median FCP, ms | Maximum app, ms | Maximum FCP, ms | Decoded HTML bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact month | 5 | 672.32 | 1268 | 1095.15 | 1624 | 458129 |
| Selected day in month | 5 | 601.50 | 1132 | 1089.49 | 1596 | 459847 |
| Full history, page 1 URL | 5 | 1061.68 | 1628 | 1726.91 | 2328 | 1426116 |
| Earnings | 5 | 437.11 | 1044 | 466.50 | 1128 | 509729 |
| Repeat compact month, tab=1 | 5 | 66.38 | 548 | 359.41 | 928 | 458129 |

FCP is first contentful paint, not time to full interaction readiness. History includes the existing full-history presentation; nothing was paginated, removed or hidden by this task. The live account snapshot cache still has its original eight-second TTL and single-slot policy. The last repeat sample was slower; without the new diagnostics deployed, its actual internal cache state cannot be established from `cache_hit:false`, which describes a different response-cache flag.

One actual lazy full-card fetch was verified separately: HTTP resource duration 499.80 ms, app 363.03 ms, 1613 encoded / 5556 decoded bytes. This is one network sample, not a five-sample median or a measured click-to-visible duration. The browser automation's semantic click timed out without initiating a fetch; a subsequent native click opened the card and produced the recorded network request. Automation delays were excluded from the request timing.

All 25 browser navigations were matched to Render `/account` completions using timestamp proximity and duration. This is correlation, not request-ID tracing: the current deployed logs do not include the new request ID or screen classification. All matched responses were 200. During the three captured minute summaries there were zero 5xx, but maximum event-loop delays were 767.56, 717.23 and 546.31 ms. Visible public service-page requests in the first captured minute were cache hits taking about 1-7 ms. These observations do not identify the cause of each pause or prove that all public/background CPU work is absent.

The live sample again shows substantial server variability and a heavier history screen. No four-second calendar navigation was reproduced in this sample. Exact per-stage attribution for a live slow request remains unavailable until the diagnostic code is separately deployed.

## Local Diagnostic Implementation

Production source files changed locally:

- `lib/account/request-timing.js`, new response-scoped diagnostics helper.
- `lib/account/handlers.js`, timing wrappers only around existing account work.
- `lib/http/timing.js`, append optional authenticated-account timing headers while preserving existing app/cache timing.

For authenticated, authorized GET `/account` requests only:

- A random `X-Shynli-Request-Id` response header joins the browser response to an `account_request_timing` server log line.
- Fixed screen categories: `orders`, `history`, `payroll`, `month_grid`, `month_full`, `day`, `order_detail`.
- `Server-Timing` phases: `acct_auth`, `acct_audit`, `acct_staff`, `acct_settings`, `acct_users`, `acct_orders`, `acct_snapshot_wait`, `acct_context`, `acct_selection`, `acct_planning`, `acct_render`, as applicable.
- Snapshot cache classification: `hit`, `detail`, `bypass`, `empty`, `expired`, `scope`, `revision`.
- Log fields are restricted to timestamp, event type, opaque request ID, fixed screen/cache/outcome categories, numeric phase durations, HTTP status and total handler elapsed time.
- No URL/query, account/order/staff IDs, names, phone numbers, addresses, prices, comments, cookies, credentials or error text is added to these logs. The existing unrelated request logs are unchanged.
- Unauthorized redirects, login/download/public routes and POST mutations receive no new diagnostic headers/logs. Authentication and authorization remain unchanged.
- Logging errors cannot change the response. Original sync/async values and exceptions propagate unchanged. There are no extra database reads or timers added for diagnostics.

These are elapsed wall-clock phases, including waits, not SQL execution-time or CPU profiles. `context` contains its nested data/selection/planning phases, and staff/settings/users work may overlap. Their durations must not be added together. A cache hit measures the current request's wait rather than copying the originating request's read timings. A reused user/settings snapshot can have a near-zero phase without a new network read. Time before Node enters the HTTP callback, network/proxy waiting, browser rendering and exact CPU/GC attribution are not measured by these phases.

Neither cache eligibility nor its TTL/key/invalidation, database selection, pagination, data projections, order state, full-card rendering, payout calculation or UI assets were changed.

## Verification

- Full suite: **890 passed**, zero failed/cancelled/skipped, 159929.763041 ms.
- Focused timing plus section-context run: 19 passed. Final dedicated timing run: four passed, including real HTTP logs/headers.
- `git diff --check` passed.
- `scripts/verify-account-request-timing.js` compares the baseline handler modules directly from Git with the working tree in two isolated child servers. No checkout or real database is used.
- Exact body hashes, lengths, status and Content-Type/Cache-Control/X-Robots-Tag/Location match on 15 account controls: month, repeat month, day, complete month, desktop fragment, ordinary orders, both history URLs, earnings, full-card fragment, focused order, foreign/missing/invalid detail and anonymous access.
- Both versions made the same **85 database reads**, including identical table/method/status/response-byte sequences. Zero business writes. Only GET and the existing SELECT-only calendar RPC POST are allowed by the network-guarded synthetic fixture.
- All **254 synthetic orders**, including 163 completed, remain available across history; saved payouts and fixed overrides remain represented in exact unchanged HTML. Existing tests also cover more than 1000 orders, assignments, cancellation, historical dates, teams and fixed payouts.
- The candidate emitted 14 diagnostic log records for the 14 authenticated controls and none for anonymous access. The baseline emitted zero. Request IDs matched response headers, were unique, cache reuse avoided fictitious read phases, and labels/log keys/privacy were asserted.
- The unrelated pre-existing modification to `test/admin-route-client-order-prefill.test.js` was not edited or reverted.

## Reproduction And Next Boundary

```sh
node --test test/account-request-timing.test.js test/account-section-context.test.js
node scripts/verify-account-request-timing.js
npm test
```

Optional `ACCOUNT_TIMING_OUTPUT` writes a structured local parity artifact. `ACCOUNT_TIMING_BASELINE_REF` chooses the Git baseline, default `ace35b34`.

Evidence folder: `/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/output/account-stage-timing-2026-10-24/`. It contains 25 browser samples, their screen summary, the separate card resource timing, minute-level Render rows, all 25 log matches and local HTTP parity results. No credentials or client records were exported.

Nothing was deployed. Live stage-by-stage results require a separately authorized deployment, followed by repeating the same screens and joining slow responses to their new request IDs. A future rollback of these diagnostics affects code only and needs no SQL/data restoration.
