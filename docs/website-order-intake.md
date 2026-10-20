# Website Order Intake

New submissions to `/api/quote/submit` and its `/api/quote/request` alias persist one
ledger entry containing the order state immediately. The initial order status is
`new`, payment is `unpaid`, and the server-calculated price and quote details are
retained. Callback requests also become New orders, without inventing a visit time
or recurrence. CRM errors remain visible as diagnostics on the New order.

Each new submission gets its own entry ID, even when its phone or CRM contact ID
matches an earlier request. There is no phone/contact-based merge into an old
order. Existing agreed amounts, schedules, and order history are not overwritten.

New website orders carry `orderState.managerConfirmationRequired = true` (also
mirrored in the legacy `adminOrder` field). Series creation waits for the existing
manager confirmation flow to set `managerConfirmedAt`. Policy signing or reminder
repair alone does not approve these orders. An unconfirmed inquiry also does not
close a previous order's next-cleaning task as if a new visit were confirmed.

Manager SMS and web-lead notifications link to `/admin/orders?order=<entryId>`.
The legacy request history and task routes remain available, and manager assignment
and contact tasks continue to use the same ledger entry. No history backfill,
database migration, order deletion, or user permission change is included.

Verification:

```sh
node --test test/website-order-intake.test.js test/quote-route.test.js test/quote-initial-admin.test.js test/admin-order-state.test.js test/order-policy-public-service.test.js test/auto-notifications.test.js test/admin-recurring-order-series.test.js test/automatic-task-policy.test.js
```

Rollback: restore the prior application version. Already received orders and the
historical ledger remain stored; do not delete their order state. No schema
rollback is needed. Keep the existing recurring duplicate-prevention SQL installed.
