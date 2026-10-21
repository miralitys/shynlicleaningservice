# Profitability

The section includes all 34 columns and the Summary screen. Financial data and
history are private. Cleaner payouts share the order's per-visit payroll source;
other financial fields remain isolated from operational order data.

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

New financial fields live in `profitability_records`, with private events in
`profitability_events`. The authorized exception is per-cleaner payout: it uses
the order's `payrollOverrides` and accrued `payroll.items`, also used by cleaner
earnings and admin payroll. Paid items always take precedence and are immutable,
including zero amounts and paid staff no longer on the team. Future fixed pay
is visible immediately, but is not accrued until the normal completion stage.
Unconfirmed future percentage estimates are not treated as confirmed financial
costs. Clearing an unpaid fixed override restores the usual payroll rule.
Changing another financial field does not convert percentage payouts to fixed.

`supabase/profitability_payroll.sql` installs the service-role-only atomic payout
RPC: compare both finance version and order timestamp, lock the row, update only
the native payroll fields, save the finance patch and private before/after event
in one transaction. A conflict or audit failure rolls back everything. Reads,
schema installation and deployment never migrate or rewrite existing orders.
The financial payout array is an audit mirror, not another source of truth.
Cleaner navigation cache is invalidated after a successful payout save.
No series generation, staff reassignment, calendar sync or notifications run.
Client prices, payment states, visit dates and statuses remain untouched. The
general action journal does not read the private finance tables. The
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
For an unentered paid amount, debt is unknown, not the full price. Such records
are excluded from the debt filter and counted as missing payments in totals.
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

The active viewer account `eva@shynli.local` additionally has the narrow
`profitability.update_assistant_fields` permission, following the existing
account-specific task-permission pattern. It can view both screens, CSV and
private history, but may edit only `payouts`, `source`, `paymentMethod`, `paidAt`
and the financial `comment`. All other financial fields stay read-only; settings,
source import and deletion are forbidden on the server. Other viewers, managers,
cleaners and non-allowlisted admins remain excluded. Existing task permissions
and other sections are unchanged. No account/role/password or schema changes
are necessary, and no assistant key is enabled by this account permission.
Payment method/date/comment are the separate financial fields in this section;
they do not mark an order Paid or rewrite its operational payment state or notes.

Eva uses the existing session cookie for both UI and API requests:

- POST `/admin/profitability`: `action=update`, `entryId`, `version`, `orderUpdatedAt`, and any
  of `payout:<staffId>` (dollars), `source`, `paymentMethod`, `paidAt` (YYYY-MM-DD),
  `comment`. Settings/import/unknown fields return 403, including mixed requests.
- PATCH `/admin/profitability/api`: `{entryId, version, orderUpdatedAt, patch}` with only the
  five permitted keys above; each payout is `{staffId, cents}`. Partial payout
  patches preserve payouts not included in the request. Staff IDs must already
  belong to the team or existing historical payouts; no team edits are performed.
- Every save and audit event are atomic in the existing store, with actor user
  ID/email, permission, server timestamp, record ID, and full before/after data.
  Stale versions return 409 without changing data or writing an event.
  GET returns `orderUpdatedAt`; send that exact value back for payout changes.
  Missing/stale timestamps return 409 rather than overwrite newer native edits.

To revoke only Eva's financial access, remove the account-specific rule in
`canEditAssistantProfitabilityFields` (or revert the permission change) and
redeploy. Leave finance/history tables intact. Disabling the feature flag would
instead hide the section for everyone, so is not a per-account rollback.

Before rollout:

1. Run `supabase/profitability_schema.sql`, then `supabase/profitability_payroll.sql` in the existing Supabase project.
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
necessary for deployment because it does not backfill orders. For the unified
payout change, reverting the application keeps saved native fixed payouts and
paid history; leave the RPC and private history intact. Do not restore old order
snapshots or the old empty finance payout mirror over newer native payouts.

## Assistant API: Not Enabled

No key was created, printed or handed out. Keep
`PROFITABILITY_ASSISTANT_KEY_SHA256` empty until explicit user approval.
The separate future permission is `profitability.update_fields`.

- `GET /admin/profitability/api?entryId=...` with its dedicated Bearer key
  returns only version and source/paid amount/date/method/payout fields.
- `PATCH /admin/profitability/api`: JSON `{entryId, version, orderUpdatedAt, patch}`. Allowed
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
