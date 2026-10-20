# Tasks And Legacy Request Archive

The main admin navigation has a standalone Tasks item at
`/admin/quote-ops?section=tasks`, including its existing task count. The Requests
parent item, its status submenu, and the new-request badge are no longer in the
main menu. A separate link below the menu opens the legacy archive at
`/admin/quote-ops?section=archive`.

The archive filters out the new website-order workflow (identified by the
persisted `managerConfirmationRequired` field) and its explicitly linked recurring
descendants. Matching client names or phone numbers never hides older requests.
This is a read-time filter, not a database move or deletion. Search and filter
forms preserve archive mode. Tasks continue to read the complete ledger, including
both legacy requests and new orders. Existing direct request links remain valid.

No account permissions, POST routes, task operations, or order-creation logic are
changed. Eva retains her narrowly scoped task permissions, and other viewers
remain read-only. No schema migration or data backfill is required.

Verification:

```sh
node --test test/admin-task-archive-navigation.test.js test/admin-sidebar-styles.test.js test/admin-route-quote-ops-full-history.test.js test/admin-route-viewer-quote-ops.test.js test/admin-task-status-permission.test.js test/admin-route-quote-ops.test.js test/website-order-intake.test.js
```

Rollback: restore the prior application version; no data or SQL rollback is needed.
