# Move-in/out cabinet default, 2026-10-23

## Live check before editing

Baseline release: d3c24a0f. Checked the live /pricing and /quote through Chrome.
Move-in/out, 3 bedrooms, 2 bathrooms, 1,201-2,000 sq ft displayed $464.
Oven, refrigerator, baseboards and doors were selected; inside cabinets were not.
The refrigerator condition selector was visible and the cabinets selector hidden.
No production quote was submitted.

## Scope

- Add insideCabinets only to PRICING.moving.defaultSelectedServices in the shared
  browser/server engine. Cabinets remain removable, not a mandatory included service.
- Update the engine cache version in quote2.html and lib/site/sanitize.js.
- Existing condition controls automatically show Emptied $45 / Not emptied $90
  beside the selected checkbox. Their code and styling are unchanged.
- Keep all /quote fields, rounding, handoff logic, rates and calculation formulas.
- No SQL, data updates, order changes or changes to Regular/Deep defaults.

## Verification

- Focused pricing/booking tests cover $509 selected, $464 deselected, $554 with
  cabinets not emptied, and explicit empty services without re-adding cabinets.
- Browser-engine VM and server engine return identical pricing objects.
- Isolated HTTP submission tests check the response and signed payment amount.
- Isolated production API-handler tests check calculatorData and the order-ledger
  amount for both $509 and $464. External CRM calls and order storage are stubbed.
- Local /pricing UI confirms the automatic checkbox, immediately visible selector,
  $509 total and decrease to $464 after unchecking it.
- A read-only comparison against d3c24a0f checked 4,800 combinations: Regular and
  Deep results identical; Moving defaults exactly $45 higher; explicit selections
  have identical pricing and duration (excluding changed default-list metadata).

Production verification and final test counts are recorded in the release report.

## Rollback

Revert the release commit and redeploy. The previous engine and cache URLs remain
in Git. No database rollback is needed.
