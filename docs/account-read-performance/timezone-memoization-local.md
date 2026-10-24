# Cleaner account: formatter reuse and per-render order state

Date: 2026-10-24, America/Chicago.
Baseline: `32598bbbe8b59153f461c9e6bffb7bc12df34b1d`.
Status: local changes only. No deploy, push, SQL migration or production data write.

## Application changes

- `lib/cleaner-confirmation.js`: reuse `Intl.DateTimeFormat` instances by time
  zone. Cache is limited to 16 formatters, stores no orders, and does not cache
  dates or conversion results. Conversion arithmetic and all action windows are
  unchanged. Invalid zones still throw; non-string mutable arguments are not
  cached.
- `lib/account/render.js`: one ephemeral render context with a fixed current-time
  reference and a WeakMap keyed by order-item object, then by staff ID. Reuse UI
  state in sorting and desktop/mobile views. Every exported workspace render
  starts a fresh context and restores the prior one in `finally`. The renderer
  remains synchronous. No state survives to a subsequent request or failure.

No changes to database reads, list limits, order creation/update logic, payroll,
money calculations, assignments, prices, assets, CSS or page structure.
POST authorization and action-window checks remain fresh server checks.

## Verification

Focused command:

```sh
node --test test/cleaner-confirmation.test.js test/account-dashboard-render.test.js test/account-read-performance.test.js test/account-fixed-pay.test.js test/payroll.test.js
```

Result: 34 passed, 0 failed.

Full command: `npm test`.
Result: **831 passed, 0 failed, 0 skipped**, 116.35 seconds.
Full local output: `/tmp/shynli-account-timezone-tests.log`.
`git diff --check`: clean.

Checks include:

- Exact 24-hour auto-confirmation and two-hour en-route boundaries at minus one
  millisecond, exactly on the boundary, and plus one millisecond.
- Chicago spring and autumn daylight-saving transitions, with unchanged
  conversion of the repeated autumn hour.
- One UI-state calculation per item/staff per render, consistent current time
  even when a controlled clock advances during rendering.
- A new render of the same objects observes time changes, explicit decline,
  changes to assigned staff and a different viewer. Failed renders do not retain
  the render context.
- The existing 1,107-order fixture: all active pages and complete history remain
  reachable, including the tail beyond 1,000 records and small database page caps.
- Unchanged prices, teams, payroll overrides, stored paid payroll and derived
  percentage/fixed earnings. Independent fixed-pay integration coverage includes
  per-cleaner isolation and order/calendar display.
- Fresh detail access checks after reassignment, visible failures on unavailable
  reads, and GET-only traffic in the read fixtures.

## Exact rendering parity and local timings

Reproduce:

```sh
node docs/account-read-performance/verify-render-parity.cjs
```

The script loads the baseline modules from Git and compares them with the local
modules. Both receive identical synthetic data and the same controlled clock.
Fixture: 254 orders, 91 active and 163 historical. It compares full HTML hashes,
not just selected text. Fixture, entries, staff/users and render-context digests
are checked before/after. No real network access or production credentials.

Timings below are local renderer medians of five alternating measured passes,
with one excluded warm-up for each screen. They do not include HTTP, Supabase,
browser rendering or mobile networking and are not production speed claims.

| Screen | Before ms | After ms | UI calculations before / after | HTML identical |
| --- | ---: | ---: | --- | --- |
| Active page 1 | 121.9 | 10.7 | 733 / 111 | Yes |
| Active page 2 | 118.3 | 10.1 | 715 / 111 | Yes |
| Complete history | 154.7 | 22.3 | 1,019 / 254 | Yes |
| Calendar day | 3.0 | 2.8 | 2 / 1 | Yes |
| Calendar month | 8.4 | 4.5 | 31 / 30 | Yes |
| Payroll | 10.7 | 12.1 | 0 / 0 | Yes |
| Historical detail | 0.3 | 0.2 | 1 / 1 | Yes |
| Future detail | 0.3 | 0.2 | 1 / 1 | Yes |

The payroll screen has no assignment UI-state calculations and is not a speed
target of this change. Small-screen timings include runtime/GC noise; no claim
is made that every screen is faster. Exact HTML parity passed for every measured
iteration, including payroll.

Application files changed: two listed above.
Regression tests updated: `test/cleaner-confirmation.test.js` and
`test/account-dashboard-render.test.js`.
Added local diagnostic: `docs/account-read-performance/verify-render-parity.cjs`.
This report is also local. Pre-existing unrelated working-tree edits, including
`test/admin-route-client-order-prefill.test.js`, were left untouched.

Production orders, history, prices, teams and payouts were not accessed or
modified in this implementation turn. Live latency must be measured separately
after an explicitly authorized deployment.
