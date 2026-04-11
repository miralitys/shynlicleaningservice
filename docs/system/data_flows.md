# Data Flows

## Public Page Request
1. Browser requests a pretty URL.
2. `server.js` normalizes the path and checks redirect rules.
3. Server resolves route-to-file mapping from `routes.json`.
4. File is served only if it resolves to a route target or allowlisted public asset path.
5. Request metrics are recorded into the rolling perf window.

## Diagnostics Request
1. Operator requests `GET /__perf` with `ENABLE_PERF_ENDPOINT=1` and a valid `x-perf-token`.
2. Server verifies that diagnostics are explicitly enabled and authenticated.
3. Server returns request percentile stats, 5xx rate, event-loop metrics, and alert thresholds.
4. Response is marked `no-store`.

## Quote Submission
1. User completes `/quote` and submits the final form after consent.
2. Client POSTs the normalized payload to `/api/quote/submit` or compatibility alias `/api/quote/request`.
3. Server rate-limits the request, normalizes contact fields, recalculates canonical pricing, and clamps quote inputs to UI-supported minimums/buckets before any downstream side effects.
4. Server submits the CRM write through the LeadConnector helper using that canonicalized quote snapshot and attributes the submission to public `/quote`.
5. Server returns `pricing` plus a signed `quoteToken`.
6. If CRM note/opportunity writes partially fail, the response can still succeed with `warnings`.

## Stripe Checkout Request
1. Client POSTs `quoteToken` to `/api/stripe/checkout-session`.
2. Server rate-limits the request, validates JSON size, verifies the signed token, and ignores raw client `amount` fields.
3. If `STRIPE_SECRET_KEY` is configured, server creates a Stripe checkout session from the canonical signed quote payload.
4. Server returns `{ url, id }` or a sanitized error payload.

## Deploy / Cache Invalidation
1. Render deploys the app via `npm install` and `npm start`.
2. Cloudflare sits in front of the custom domain.
3. Optional post-deploy script purges HTML URLs from Cloudflare.
