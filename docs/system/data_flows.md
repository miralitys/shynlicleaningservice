# Data Flows

## Public Page Request
1. Browser requests a pretty URL or a public asset.
2. `server.js` forwards the request into `lib/site/request-handler.js`.
3. Redirect rules are checked first.
4. If the request is a public asset, `lib/site/assets.js` resolves and serves it only if the path is explicitly allowlisted and safe.
5. If the request is a route-mapped page, the runtime index resolves the HTML file and serves the sanitized/cached version.
6. Request metrics are recorded into the rolling perf window.

## Diagnostics Request
1. Operator requests `GET /__perf`.
2. The request is only accepted when `ENABLE_PERF_ENDPOINT=1` and `x-perf-token` matches `PERF_ENDPOINT_TOKEN`.
3. Server returns request percentile stats, 5xx rate, event-loop metrics, and alert thresholds.
4. Response is marked `no-store`.

## Admin Login And Session Flow
1. User opens `/admin/login`.
2. Email and password are verified against configured admin credentials.
3. Server issues a short-lived challenge cookie.
4. User opens `/admin/2fa` and submits a TOTP code from the authenticator app.
5. Server verifies the TOTP and challenge token, then issues a signed admin session cookie.
6. Authenticated requests can now reach `/admin` and the protected admin sections.

## Admin Checklist Flow
1. User opens `/admin/settings`.
2. Server reads checklist templates from `lib/admin-settings-store.js`.
3. User submits checklist completion updates, adds an item, or resets a template.
4. Store writes the updated JSON snapshot to `data/admin-settings-store.json` unless an override path is configured.
5. Page redirects back to the selected settings view with a notice flag.

## Staff Planning Flow
1. User opens `/admin/staff`.
2. Server combines quote-op entries with the staff snapshot from `lib/admin-staff-store.js`.
3. Domain helpers derive planning cards, assignment state, schedule labels, and upcoming workload.
4. Staff edits and assignment changes are persisted through `lib/admin-staff-store.js`.
5. If Supabase staff env is configured, the store reads/writes through `lib/supabase-admin-staff.js`.
6. If Supabase staff env is not configured, the store falls back to `data/admin-staff-store.json` unless an override path is configured.

## Quote Submission
1. User completes `/quote` and submits the final form after consent.
2. Client POSTs the normalized payload to `/api/quote/submit` or compatibility alias `/api/quote/request`.
3. Server rate-limits the request, normalizes contact fields, recalculates canonical pricing, and clamps quote inputs to UI-supported minimums/buckets before side effects.
4. Server submits the CRM write through the LeadConnector helper using that canonicalized quote snapshot and attributes the submission to public `/quote`.
5. Server records a quote-op ledger entry.
6. Server returns `pricing` plus a signed `quoteToken`.
7. If CRM note/opportunity writes partially fail, the response can still succeed with `warnings`.

## Quote-Ops Persistence
1. `lib/quote-ops/store.js` receives the new or updated quote-op entry.
2. If Supabase is configured, the entry is upserted through `lib/supabase-quote-ops.js`.
3. If Supabase is not configured, the entry remains in the in-memory ledger for the running process.
4. Admin quote-ops pages, CSV export, and retry flow all read from the same store abstraction.

## Stripe Checkout Request
1. Client POSTs `quoteToken` to `/api/stripe/checkout-session`.
2. Server rate-limits the request, validates JSON size/body, verifies the signed token, and ignores raw client totals.
3. If `STRIPE_SECRET_KEY` is configured, server creates a Stripe checkout session from the canonical signed quote payload.
4. Server returns `{ url, id }` or a sanitized error payload.

## Deploy / Cache Invalidation
1. Render deploys the app via `npm install` and `npm start`.
2. Startup builds the runtime index and warms the HTML cache.
3. Cloudflare sits in front of the custom domain.
4. Optional post-deploy tooling can purge HTML URLs from Cloudflare.
