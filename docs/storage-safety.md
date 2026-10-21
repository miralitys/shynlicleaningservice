# Recoverable Deletions and Durable Writes

Production migration installed on 2026-10-21 before the application release.
A transaction-local fingerprint verified all 912 existing ledger rows unchanged.
No existing orders/customers were edited and Venkata was not restored.

## Deployment Prerequisite

After explicit approval, install `supabase/quote_ops_storage_safety.sql` before
deploying the application. It requires the existing quote, admin audit and
recurring guard schemas. It adds tables/functions/triggers and an audit action;
it does not backfill or rewrite business records.

## Behavior

- `/admin/trash`: GET list/search and explicit POST restore, available only to
  existing admin/manager users with delete permission. Viewers, cleaners and
  assistant financial keys cannot access it. No purge endpoint exists.
- Deleting a client/request moves the complete ledger row to `quote_ops_trash`.
  The active row is removed only in the same transaction as the trash copy and
  database history insertion. Order-only deletion retains the customer row and
  archives the complete pre-deletion order. Photos and assignments are retained.
- A request containing an order cannot be deleted via `delete-lead-entry`.
  Both the HTTP handler and database RPC check; the RPC checks a locked row.
- A restore never overwrites a newer existing record. Recurring-slot guards
  also prevent restoring a conflicting visit. Restore does not send SMS.
- Inserts cannot overwrite an existing primary key. Updates use authoritative
  reads plus timestamp compare-and-set, without an upsert/memory fallback.
  Rejected writes do not update caches, invoke follow-up completion, or report
  success. Production cannot use a memory-only business store.
- `quote_ops_mutation_events` records business changes with actor, request,
  route, time and business before/after snapshots in the same DB transaction.
  Repeated SMS histories, policy secrets and notification-only bookkeeping are
  omitted from this second journal to avoid duplicating large payloads. The
  trash snapshot remains complete. Direct
  database changes are labeled with the database actor, not a guessed human.
  Existing human-readable audit remains and includes restores. Database
  snapshots and trash contain private customer data; both are RLS-protected,
  unavailable to anon/authenticated, and read-only to the service role outside
  security-definer functions. There is no expiration/automatic purge.

## Verification

`node --test test/quote-ops-storage-safety.test.js` starts a disposable local
PostgreSQL cluster through installed PostgreSQL binaries (Unix socket only,
no external connection). It verifies unchanged seed rows after migration,
trash snapshots, restores, stale-write rejection, RPC permissions, and rollback
of both updates and deletions when history insertion fails. It skips only the
PostgreSQL integration case when binaries are unavailable or running as root.
HTTP coverage is in `test/admin-route-audit.test.js`; the full suite remains
`node --test`. All fixtures are artificial.

## Rollback

Revert application code to the previous version; retain both new tables and
their data. Do not remove the history/trash trigger: it continues protecting
deletions even from the old application. Do not drop tables or automatically
restore their contents. An older application would lose the new HTTP/CAS
protections, so application rollback is not a permanent fix.
