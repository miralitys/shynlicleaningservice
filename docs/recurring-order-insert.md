# Guarded Recurring Order Creation

Before deploying this change, run `supabase/recurring_order_insert.sql` in the Shynli Supabase project.
It installs a service-role-only function; installation does not modify existing orders or delete duplicates.
Do not deploy the application first: a missing function deliberately stops automatic series creation.

The function serializes inserts per raw series ID and validates the source visit,
reuses existing canonical occurrences and legacy request IDs, and rejects an occupied actual slot.
An outdated source or an ambiguous duplicate stops creation rather than falling back to memory.
The generator additionally preserves legacy canonical dates and serializes local resets with generation.
The accompanying trigger makes ordinary reschedules use the same transaction lock and rejects occupied slots.
Unchanged slots (including payment/completion edits on legacy duplicates) remain editable.

Verification: `node --test test/recurring-submission-idempotency.test.js test/recurring-postgres.test.js test/admin-recurring-order-series.test.js`.
The PostgreSQL test starts its own temporary Unix-socket-only cluster, uses synthetic data, and stops/removes it afterward.
It is skipped when local PostgreSQL binaries are unavailable. No production credentials are used.

Rollback: remove `quote_ops_recurring_slot_guard` before restoring the previous application commit;
older application versions do not reliably report rejected slot-conflict writes. The unused SQL functions can remain installed.
No backfill or automatic cleanup of existing orders is included.
