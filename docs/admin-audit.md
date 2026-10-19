# Admin action journal

## Scope and access

`GET /admin/audit` is a server-rendered, read-only journal for administrators
and managers. Viewers and cleaners do not gain access. All writes to this URL
return 403. Existing order/client permissions are unchanged.

The page filters by Chicago calendar dates (`from`, `to`, both inclusive),
customer name (`q`), actor email (`actor`), `entityType` (`client`, `order`),
`entityId`, `action` (`create`, `update`, `delete`), and result `status`.
Pagination uses `offset`, 50 events per batch. With JavaScript, "Далее" appends
the next batch below existing rows without navigation, preserving filters,
expanded details and scroll position. `GET /admin/audit?fragment=entries`
returns just the table and pagination markup under the same access checks.
Normal pagination links remain usable without JavaScript. Loading failures
leave the current rows intact and allow retrying the same batch.

Auditing wraps the shared quote ledger used by admin, cleaner, website and
background handlers. It records customer profile and order creation, business
field updates, payments and deletion. Order amount changes contain numeric
old/new `totalPrice` values, displayed as dollars. Removing an order does not
imply deleting its customer; deleting the last customer entry records both.
Customer-profile updates across linked entries are individually recorded with
the same request correlation ID, so a partial batch failure cannot masquerade
as a wholly successful profile save. Notification delivery bookkeeping is
excluded only after a pure domain preview confirms it cannot change business
fields; unexpected price/date/team changes still produce an audit event.
Task-only updates and internal staff/user records are excluded. Explicit saves without business-field changes are
stored as `noop` and hidden from the page.

An event stores actor ID, name, email, role, UTC timestamp, source route,
request correlation ID, entity/entry IDs, before/after snapshots and differences.
Personal names are resolved from linked staff without changing user accounts.
The shared legacy admin login is deliberately named "Общий администратор":
it cannot identify the human behind a shared session. Background mutations
triggered by GET are marked as automatic, not attributed to the page visitor.
The journal starts at rollout and cannot reconstruct earlier actions.

## Install before deploying the application

1. Apply `supabase/admin_audit_schema.sql` to the same Supabase database as
   `quote_ops_entries`, using the database owner's SQL editor or a trusted
   database connection. For an already configured connection:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/admin_audit_schema.sql
   ```

2. Confirm `admin_audit_events` exists and the service role can insert, select
   and update it. RLS denies browser roles; there are no foreign keys or
   customer deletion cascades. The app exposes no edit/delete audit endpoint.
3. Deploy application code. Existing `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` select the durable remote store automatically.
   An optional `SUPABASE_ADMIN_AUDIT_TABLE` override requires an equivalent
   schema at that table name.
4. Verify one synthetic order amount edit and its journal row before asking
   managers to resume work. Never test by changing a real customer's price.

Without Supabase credentials, development uses an append-only JSONL file at
`ADMIN_AUDIT_STORE_PATH` (default `data/admin-audit.jsonl`), with mode 0600 and
fsync on writes. Tests use isolated temporary paths. A production filesystem
must be persistent if using this mode; an ephemeral Render disk is not a
durable substitute for Supabase. Include this separate table/file in backups.

## Failure and concurrency behavior

The pending event is durably stored before the business mutation. If that
cannot be written, the mutation is blocked; **deploying without the SQL table
will block audited saves**. There is no silent remote-to-local audit fallback.
Successful changes are finalized with snapshots and differences. If the
business write throws, the event is marked failed. The existing quote-store
memory fallback remains available if the audit store itself is healthy;
such writes/read snapshots are marked unconfirmed, not reported as saved.

If finalizing the event fails after the business write, the pending event
remains and `admin_audit_completion_failed` is emitted with event/request/entity
IDs. The app does not report the business save as failed or retry it solely
because audit finalization failed. Pending/unconfirmed events need investigation;
they are not evidence of a successful change.

Writes to one entry are serialized inside the server process, including
payment events, so overlapping app saves cannot log two stale old amounts.
This is not a cross-process database transaction. Direct SQL, external scripts
that bypass the wrapped ledger, multiple independently deployed writers, and
raw Supabase changes are not guaranteed by this application-level journal.

Business snapshots are whitelisted. Passwords, session cookies, policy tokens,
signatures, SMS bodies, file paths and signed URLs are not copied. Dynamic URL
segments and query strings are excluded. The journal does contain customer
contact details and order comments, so its storage and backups are private.

## Verify and roll back

```sh
node --test test/admin-audit.test.js test/admin-route-audit.test.js test/admin-audit-pagination.test.js
```

To roll back, deploy the preceding application build. Keep the audit table and
its data; do not drop it. The migration is additive and does not alter existing
customer/order tables or accounts. Rolling back stops new journal entries;
it does not erase existing history.
