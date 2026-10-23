# Calculator fixes, 2026-10-23

## Live check before edits

Checked /pricing and /quote in Chrome and native macOS Safari, without submitting a production order.

1. Still present: /pricing > choose Deep, rooms and extras > Order Services > enter synthetic contact details > calculate online. /quote reset to Regular, 1 bedroom, 1 bathroom, no extras. Navigation inside /quote itself retained selected extras.
2. Still present: /pricing displayed both condition selects while their checkboxes were off. /quote hid the condition selects even after selecting their services, making the $90 variants unavailable.
3. Already fixed: native numeric spin arrows were hidden. Existing spinner CSS was left unchanged. Safari accessibility still calls inputs number fields, but screenshots showed only the site's minus/plus controls.
4. Still present: Deep, 4 bedrooms, 3 bathrooms, size bucket 1 displayed $396.5 on /pricing in Chrome and Safari. Chrome /quote displayed $396.50.
5. Missing rather than duplicated: /pricing had no bottom optional-add-ons section. The sanitizer explicitly removed it. No incorrect tariff was found in the underlying add-ons list; basement was absent.

## Changes

- Transfer a normalized, allowlisted selection through the Order Services URL. It contains service, frequency, home parameters, extras, conditions and quantities, never contact details, addresses or a client-supplied total. Invalid JSON or unsupported service types are ignored.
- Restore the selection after default initialization in /quote. Previously hidden selected extras and additional rooms become visible. Clicking the already-selected service no longer resets its extras.
- Place each condition control beside its matching service. Hide and disable it when unchecked. Keep $45/$90 pricing unchanged.
- Apply final upward whole-dollar rounding to public estimates, API response, payment token and newly created website order. Keep the raw pricing function and rates unchanged for other callers. Preserve duration calculated from the unrounded result.
- Restore one existing optional-add-ons list on /pricing after the Move pricing section, adding basement $45 Regular / $65 Deep and Move. Other listed prices remain unchanged: doors $45; baseboards $22; fridge/cabinets $45/$90; windows $6/$8; blinds and linen $8; sliding door $12/$20; chandelier $65; pets $25.
- Bump browser asset query versions. No database migration or update of existing orders.

## Verification

- General test run: 809 passed, 0 failed. Additional focused run after adding the ledger assertion: 4 passed, 0 failed.
- New tests cover the three control totals, duration preservation, all service/frequency combinations, every quantity, no contact-data leakage in handoff, invalid URL data, server rounding, signed amount and all selected fields delivered to the order ledger.
- Local Chrome: Deep $397; Regular biweekly with basement/pets $307; Regular monthly $191.
- Local full-to-short-form handoff: Deep with office, fridge/cabinets not emptied, tracked window and sliding door retained the same $627 estimate, selections and quantities.
- Unchecking a $90 refrigerator hides/disables its select and subtracts exactly $90.
- Mobile widths 360 and 390 checked in Chrome, no horizontal overflow. Desktop table and mobile condition selector visually checked.
- No production test order has been submitted. Native Safari has been checked visually; final live verification is reported in chat after deployment.

## Files

- css/calculator-options.css
- js/calculator-controls.js
- js/cleaning-pricing.js
- js/pricing-calculator.js
- js/quote-simple-controls.js
- js/quote2-app.js
- lib/api/handlers.js
- lib/site/sanitize.js
- quote2.html
- test/calculator-booking.test.js
- this report

## Rollback

Baseline is commit 7efad6ce1405d4d64c9a712d3c330eaec53d9087. Revert the calculator release commit and redeploy; no SQL rollback is needed. Previously created orders are not recalculated by this release or rollback. The unrelated pre-existing change in test/admin-route-client-order-prefill.test.js is excluded from this release.
