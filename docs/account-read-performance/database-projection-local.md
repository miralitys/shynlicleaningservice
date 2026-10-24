# Cleaner account database projection

Date: 2026-10-24. Local implementation only. Baseline: `2cf6d9f41002dc30b31b065bba16e989cfd4a87a`.
No deployment, push, production reads or production writes were performed.

## Change

- `supabase/account_order_list.sql` creates a live, non-materialized read-only view.
  It does not update or copy orders. There is no extra synchronization or refresh job.
- The view projects both order state roots before data leaves PostgreSQL. It excludes
  policy signatures/tokens, notifications, completion photo metadata and unrelated CRM data.
- It retains the current list fields, calculator data, complete payroll snapshots,
  fixed overrides (including zero), team fields, dates, checklist progress and policy timestamps.
- Explicit empty canonical roots retain precedence over legacy roots. Legacy order
  detection based solely on photos or other nonempty state remains intact.
- Only cleaner-account list reads use the view. Admin order reads, writes, payroll
  calculations, assignment reads and full detail reads are unchanged.
- Full details still read the original ledger and recheck the current assignment.
- The view uses `security_invoker` and is readable only by the server's `service_role`.
  No browser role receives access. The view grants no insert/update/delete privileges.

## Compatibility and Failure Behavior

The application falls back to its previous read only when PostgreSQL/PostgREST reports
that the view does not exist (`42P01` or `PGRST205`). This decision is cached for that
client's lifetime. Custom ledger table configurations keep their old read path.
An empty result, permission error, outage or incomplete page does not trigger fallback.
The existing cursor pagination, four-chunk concurrency and absence of a total-ID cap remain.
Summary records are not placed in writable full-record caches.

## Verification

Run locally:

```sh
node --test test/account-order-list-projection.test.js test/account-read-performance.test.js test/order-list-read.test.js test/account-fixed-pay.test.js test/payroll.test.js
npm test
```

The PostgreSQL test starts a disposable Unix-socket-only cluster using local binaries.
It never reads Supabase credentials. It checks exact summary parity, both employees'
calculated and recorded payroll, legacy/empty/malformed roots, null values, photo-only
orders and role restrictions. The ledger checksum must remain identical before and
after installing the migration twice and reading every record. HTTP fixture tests
also cover 1,107 orders, active pagination, complete history, full lazy details,
reassignment access revocation and database failure behavior.

The test reports serialized response bytes for the old and new database projections,
using the same fixture and IDs. These are synthetic, uncompressed bytes, not production
latency measurements. The production speed improvement requires a later release.

Results:

- PostgreSQL fixture: 621 records, including canonical/legacy root combinations.
- Successful list-response JSON: 2,285,563 bytes before, 752,938 bytes after,
  a 67.1% reduction. Full normalized summaries are identical.
- Both employees' fixed/percentage overrides and recorded paid/owed payroll match.
- HTTP regression fixture: all 1,107 orders remain reachable across active/history
  pages, including the tail beyond the old 1,000-ID boundary.
- Full `npm test`: 833 passed, 0 failed, 0 skipped. The richer SQL field-contract
  fixture was also rerun separately and passed.
- `git diff --check`: clean. No production latency claim is made.

Changed files for this task: `lib/account/order-list.js`, `lib/supabase-quote-ops.js`,
`supabase/account_order_list.sql`, `test/support/account-read-fixture.cjs`,
`test/account-order-list-projection.test.js`, and this report. The pre-existing
change to `test/admin-route-client-order-prefill.test.js` was left untouched.

## Later Deployment and Rollback

Do not apply now. After explicit deployment approval, apply
`supabase/account_order_list.sql` to the intended database using PostgreSQL 15 or later,
then restart/deploy the application. Install the view first so a running client does
not permanently cache the missing-view fallback until its next restart.

The SQL migration contains only schema/permission changes, no business-data updates.
On rollback, restore the previous application version first. The unused view may stay
in place without affecting it. To remove the new schema objects explicitly:

```sql
begin;
drop view if exists public.account_order_list_entries;
drop function if exists public.account_order_list_state(jsonb);
drop function if exists public.account_order_list_pick(jsonb, text[]);
notify pgrst, 'reload schema';
commit;
```

No order, amount, team or payroll restoration is needed because none was modified.
