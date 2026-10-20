# Profitability

The section includes all 34 columns and the Summary screen. Financial data and
history are isolated from orders, customers, staff planning, and notifications.

## Included

- `/admin/profitability`: all 34 requested columns, manual payouts per cleaner,
  lead cost, extras, discounts, paid amount/date/method, tips, tip transfer,
  actual duration, source and financial comment inline. Saves preserve other
  rows' unsaved inputs, replace only the saved row and server-computed totals,
  and retain horizontal/vertical table scroll without page navigation.
  Optimistic concurrency, private history, filtered totals and 34-column CSV.
  Save and history controls stay with the pinned client column. More than three
  cleaners (including past payouts to removed cleaners) continue in column 23;
  no team members or expenses are silently dropped.
- Date/status/source/service type/cleaner/debt filters on both screens.
- `/admin/profitability?view=summary`: monthly, source, service type, regular
  versus one-off, and cleaner breakdowns; current cancellation/reschedule rates
  by source and service type. Direct Summary defaults to all statuses so canceled
  records enter rate denominators, but never financial totals. Explicit filters
  apply equally to all sections and the orders CSV.
- Shared supplies/fuel rates and Invoice percentage. They apply uniformly to
  orders; changing a rate changes the report, not the underlying orders.
- CSV source import with preview and an atomic apply, up to 500 rows:
  `ID заказа,источник` or `id,source`. Sources accept the exact Russian labels
  or IDs from `lib/profitability.js`. Unknown orders/sources, extra fields and
  duplicate IDs reject the whole import. Previously closed orders are retained.
- Required source on new manual orders, first-order source inheritance for
  repeat clients, and website attribution using existing UTM/gclid capture.
  Explicit LSA UTMs map to LSA; Google/gclid maps to Google; missing tracking
  maps to direct website, and unknown tagged campaigns to Other. No historical
  attribution is guessed or backfilled automatically.
- Company profit is not shown as complete when paid amount, any current
  cleaner payout or expense settings are unfilled. Explicit zero is distinct
  from unknown. Retired team members' historical payouts remain expenses.

## Financial Boundaries

New fields live ONLY in `profitability_records`, with private events in
`profitability_events`. No finance edit calls order/client mutations, payroll
logic, series generation, calendar sync or notifications. Existing order cards,
cleaner APIs and the general action journal never read these tables. The
finance journal is intentionally separate because managers can read the normal
action journal.

Money is stored as integer cents; input accepts at most two decimal places.
Existing order `totalPrice` remains the final payable by default. Existing
calculator extras and discounts are NOT applied again. If a later financial
breakdown explicitly supplies a base, extra or discount, payable is
`(basePriceCents ?? existingTotalCents) + addonsCents - discountCents`; that
changes only the financial report, never the agreed order price.

Expenses = lead cost + all manual payouts + supplies + fuel + card fee.
Card fee = round(paid cents * Invoice basis points / 10000).
Profit = paid - expenses; margin = profit / paid; profit per hour uses actual
minutes, defaulting to planned minutes. Debt for completed service stages is
payable - paid; negative debt is a credit/advance, not an extra charge.
Canceled orders are excluded from totals/profit even when visible by filter.
Tips are separate from both agreed price and paid cleaning revenue; no tip
allocation or cleaner share is inferred.

Existing totals are already final, so column 11 initially contains that final
amount and columns 12/13 start at zero. Those two columns represent explicit
financial adjustments, not another addition of calculator extras/discounts.
Entering an adjustment changes only this report, never the original order.
Actual hours accept decimal hours, rounded to whole minutes; an empty value
follows the current plan. Clearing payment method sets the financial method to
unspecified (without an Invoice fee), without changing order payment state.

## Summary Definitions

- Month/period uses the cleaning date from staff planning (not the payment date).
- New/repeat uses the first non-canceled visit in the complete existing client
  history, ordered by cleaning date, then creation time and ID. The classification
  is computed before filters; a returning customer does not become new merely
  because earlier visits are outside the report period.
- Revenue means explicitly entered paid cleaning amount, not the order quote or
  tips. Monthly advances/partial payments remain on the order where entered;
  the report does not allocate one receipt over other visits automatically.
- Profit totals include only financially complete non-canceled rows; incomplete
  counts stay visible. Margin is aggregate known profit divided by the paid
  revenue of those same complete rows, not an average of row percentages.
  Profit/hour uses their aggregate actual hours; missing duration yields no rate.
- Acquisition cost = lead costs / new clients in the filtered group. No new
  clients means no ratio. Average orders/client counts non-canceled records in
  the selected period, including scheduled future records, per distinct client.
- Cleaner hours are elapsed time on each assigned visit, not divided by team
  size. Each cleaner sees the full paid revenue of their assigned orders, so
  cleaner revenue/hours are not additive across multi-cleaner teams. Payouts
  remain additive, including historical payouts to removed staff.
- Cancellation/reschedule shares use all currently filtered records as the
  denominator. Reschedules count only CURRENT `rescheduled` status; there is no
  dependable historical reschedule counter in the order-list data. Do not claim
  this counts all moves of orders that later returned to Scheduled/Completed.

## Access and Rollout

`PROFITABILITY_ENABLED=0` by default. With it enabled, the shared admin session
belongs to Ramis as confirmed by the user. Any other person using that shared
login necessarily has the same access; the app cannot identify the human behind
a shared credential. Personal access requires role admin AND an immutable ID in
`PROFITABILITY_ALLOWED_USER_IDS`. Configure exactly the existing Tolkun and
Anastasiia user IDs before production rollout. The existing accounts were
verified on 2026-10-20; their IDs are kept in deployment configuration, not
hard-coded in the repository. No roles, passwords or accounts were changed.

Before rollout:

1. Run `supabase/profitability_schema.sql` in the existing Supabase project.
2. Set the two personal user IDs and `PROFITABILITY_ENABLED=1` in Render.
3. Deploy, then check the real accounts, menu, direct URL, exports and API.

The SQL was installed in the existing Shynli Supabase project on 2026-10-20.
Verification confirmed RLS and service-role-only table/RPC access. The existing
ledger fingerprint was identical before and after schema installation; the new
financial tables were empty. Render configuration enables the section for the
two verified existing personal accounts and the confirmed shared owner session.
Production expense rates are not guessed: an owner must enter them in the section
before profit is treated as complete. Historical sources and amounts are not
automatically backfilled. The assistant-key variable remains unset.

RLS is enabled; public/anon/authenticated roles have no table or RPC grants.
Only the backend service role can call the transaction. Every update and its
actor/before/after event commit together. Concurrent stale saves return 409.

Rollback: set `PROFITABILITY_ENABLED=0`, or deploy the previous app version.
Leave private tables intact so history is not lost. No order data rollback is
necessary because the feature does not rewrite existing orders.

## Assistant API: Not Enabled

No key was created, printed or handed out. Keep
`PROFITABILITY_ASSISTANT_KEY_SHA256` empty until explicit user approval.
The separate future permission is `profitability.update_fields`.

- `GET /admin/profitability/api?entryId=...` with its dedicated Bearer key
  returns only version and source/paid amount/date/method/payout fields.
- `PATCH /admin/profitability/api`: JSON `{entryId, version, patch}`. Allowed
  patch keys: `source`, `paidCents`, `paidAt`, `paymentMethod`, `payouts`.
  Each payout is `{staffId, cents}`. No role/session change for Eva is needed.
- No profit, expenses, settings, comments, discounts, deletion, creation,
  scheduling, task actions or order/customer fields are available to this key.
  Other existing admin endpoints return 403 when presented this key.
- The key is stored only as an environment SHA-256 digest. Updates log the
  actor as `assistant:eva`. Secrets are never included in history or responses.

## Verification and Preview

`test/profitability.test.js`, `test/admin-route-profitability.test.js` and
`test/profitability-report.test.js`, and `test/profitability-postgres.test.js`
cover the three financial examples, weighted rollups, full forms/CSV/filters,
private account/role access, assistant field restrictions, audit atomicity,
CSV safety, stale writes, source inheritance and isolation from Orders.
The PostgreSQL test uses a temporary local database, never production.

```sh
node scripts/preview-profitability.js
```

This opens a loopback-only server with synthetic customers/orders and a
temporary private finance file. It does not use configured Supabase or send
notifications. Preview links to other admin sections are not a production login.
