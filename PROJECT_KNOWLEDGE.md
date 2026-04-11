# PROJECT_KNOWLEDGE

## 1. What This Project Is
- Name: `shynli-selfhosted-site`
- Type: self-hosted marketing site and quote flow for Shynli Cleaning.
- Primary goal: serve a Tilda-exported website behind custom routing, edge-friendly caching, gated diagnostics, backend CRM submission, and server-authoritative Stripe checkout creation.
- Primary users:
  - prospective cleaning customers browsing the public site;
  - admins/operators who deploy the site and can opt into `/__perf` with an explicit token;
  - internal maintainers working with exported pages, route mappings, and quote/runtime contracts.
- Responsibility boundary:
  - owns HTML delivery, route mapping, metadata/SEO injection, cache headers, runtime perf telemetry, quote CRM submission, quote pricing normalization, and Stripe checkout session creation;
  - does not persist quotes in a database; quote authorization is currently stateless via signed tokens.

## 2. What The Project Does
- Serves 58 friendly routes from `routes.json` to exported HTML files.
- Resolves only allowlisted direct assets from `css/`, `js/`, `images/`, plus a few safe top-level files.
- Adds response caching and cache-friendly headers for origin plus CDN/Cloudflare.
- Adds baseline security headers globally: `Content-Security-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`.
- Exposes `GET /__perf` only when `ENABLE_PERF_ENDPOINT=1` and a valid `x-perf-token` is present.
- Exposes `POST /api/quote/submit` and compatibility alias `POST /api/quote/request` for backend CRM submission plus signed quote-token issuance.
- Exposes `POST /api/stripe/checkout-session` for creating a Stripe Checkout session only from a server-signed quote token when `STRIPE_SECRET_KEY` is configured.
- Hosts a quote flow at `/quote` with client-side preview calculation, backend CRM submission, and optional payment handoff.

## 3. How The Project Is Structured
- Entry point: [server.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/server.js)
- Route map: [routes.json](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/routes.json)
- Deployment descriptor: [render.yaml](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/render.yaml)
- Runtime/cache ops notes: [CLOUDFLARE_EDGE_CACHE.md](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/CLOUDFLARE_EDGE_CACHE.md)
- Static/exported pages: root `page*.html`, policy pages, and route-linked HTML.
- Frontend assets: `css/`, `js/`, `images/`
- Backend helper modules: `lib/leadconnector.js`, `lib/quote-pricing.js`, `lib/quote-token.js`, `lib/rate-limit.js`
- Ops utilities: `scripts/optimize-images.sh`, `scripts/purge-cloudflare-html-cache.mjs`
- Tests: `test/server-smoke.test.js`, `test/server-hardening.test.js`, `test/quote-route.test.js`, `test/quote-pricing.test.js`, `test/quote-token.test.js`, `test/leadconnector.test.js`
  - current regression coverage includes signed quote-token handoff, proxy-trust boundary behavior, canonical CRM repricing, and absence of a hardcoded live Google Places key in `/quote`

## 4. Core Logic
### Main request flow
1. Node `http` server starts and loads `routes.json`.
2. Runtime index is built for files, route-to-file lookups, and image variants.
3. Minimal HTML cache warm-up runs.
4. On each request:
   - redirects are applied first;
   - `/__perf` returns JSON diagnostics only if explicitly enabled and authenticated;
   - `/api/quote/submit` and `/api/quote/request` handle backend quote submission;
   - `/api/stripe/checkout-session` handles checkout creation;
   - direct assets are served only if the path is in the explicit allowlist;
   - otherwise a pretty route from `routes.json` is resolved to an HTML file;
   - if nothing matches, the configured 404 page is served.

### Quote / CRM flow
1. `/quote` keeps calculator and UI behavior in the browser.
2. Final submit goes to `/api/quote/submit` only after consent.
3. Server rate-limits the request, recalculates canonical pricing from the submitted quote inputs, and clamps values to UI-supported minimums/buckets before any downstream side effects.
4. Server submits CRM writes through the LeadConnector helper using that canonicalized quote snapshot, pins CRM page attribution to public `/quote`, then returns `pricing` plus a signed `quoteToken`.
5. If CRM note/opportunity writes partially fail, the response can still succeed with `warnings`.

### Stripe flow
1. Client POSTs `quoteToken` to `/api/stripe/checkout-session`.
2. Server rate-limits the request, validates JSON size/body, verifies the signed token, and ignores raw client `amount` fields.
3. Server lazily initializes Stripe from `STRIPE_SECRET_KEY`.
4. Server creates a Checkout session with metadata taken from the signed quote payload.
5. Success and cancel URLs default to `/quote?...` on the configured canonical origin unless overridden by env.

## 5. Data And Entities
- `routes.json`:
  - key: public path like `/services/regular-cleaning`
  - value: exported file like `page109653016.html`
- runtime index:
  - route-to-file map
  - file existence set
  - image variant index
- perf window:
  - rolling request samples for p50/p95/p99 and 5xx rate
- quote pricing payload:
  - service type, frequency, room/bathroom counts, size bucket, add-ons, quantities
  - normalized into canonical `pricing.totalPrice` and `pricing.totalPriceCents`
- quote token:
  - signed payload that carries canonical pricing plus quote/contact metadata for checkout
- Stripe checkout request body:
  - `quoteToken`
  - optional `customerEmail`

## 6. Interfaces And Integrations
- Public HTTP:
  - `GET /`
  - `GET /__perf` when enabled + token-authenticated
  - `POST /api/quote/submit`
  - `POST /api/quote/request`
  - `POST /api/stripe/checkout-session`
  - many route-mapped pretty URLs from `routes.json`
- External services:
  - Stripe from backend via `STRIPE_SECRET_KEY`
  - GoHighLevel / LeadConnector from backend via `GHL_*`
  - Google Places browser autocomplete via runtime-injected `GOOGLE_PLACES_API_KEY`
  - Cloudflare purge API via `scripts/purge-cloudflare-html-cache.mjs`
- Deployment:
  - Render web service defined in `render.yaml`
  - Cloudflare edge cache rules documented separately

## 7. How To Run
- Requirements:
  - Node.js 20.x
  - `npm install`
- Local run:
  - `npm start`
- Local tests:
  - `npm test`
  - current remediation status: `48/48` green
- Useful env:
  - `HOST`, `PORT`
  - `STRIPE_SECRET_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`
  - `GOOGLE_PLACES_API_KEY`
  - `QUOTE_SIGNING_SECRET`, `QUOTE_TOKEN_TTL_SECONDS`
  - `GHL_*`
  - `POST_RATE_LIMIT_WINDOW_MS`, `POST_RATE_LIMIT_MAX_REQUESTS`, `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`
  - `ENABLE_PERF_ENDPOINT`, `PERF_ENDPOINT_TOKEN`
  - perf tuning envs listed in `.env.example`
- Observability:
  - `GET /__perf` only when explicitly enabled and authenticated
  - structured request/perf logs to stdout

## 8. Key Components
### `server.js`
- Location: project root
- Responsibility:
  - boot server, load routes, build runtime index, warm cache, serve files/routes, emit perf logs, enforce public-asset allowlist, rate-limit public POSTs, handle quote + Stripe endpoints
- Inputs:
  - request path, headers, env vars, `routes.json`, static/exported files
- Outputs:
  - HTML, safe assets, gated perf JSON, quote submission JSON, Stripe checkout JSON, structured logs
- Dependencies:
  - Node core modules
  - optional `stripe`
  - local `lib/*` helpers

### `page111975906.html` (`/quote`)
- Responsibility:
  - quote calculator UI, backend submission, and payment initiation from a signed quote token
- Important caveat:
  - browser still computes preview totals for UX, but backend pricing is authoritative for checkout

### `lib/leadconnector.js`
- Responsibility:
  - backend CRM submission helper for quote normalization, contact upsert, note/opportunity flow, and upstream error mapping

### `lib/quote-pricing.js`
- Responsibility:
  - canonical quote pricing rules mirrored from the browser calculator
  - clamps tampered values back to supported room/bathroom/size choices

### `lib/quote-token.js`
- Responsibility:
  - signs and verifies stateless quote tokens for checkout authorization

### `lib/rate-limit.js`
- Responsibility:
  - sliding-window in-memory throttling for public POST endpoints

## 9. Important Hidden Knowledge
- The real source of truth for onboarding is the nested git repo [selfhosted_site](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site), not the parent folder [shynlicleaningservice](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice).
- The parent directory currently treats `selfhosted_site/` as an untracked folder, so orchestrator integration should target the nested repo path directly.
- There was no `.gitignore`, `.env.example`, or stable test entrypoint before onboarding.
- The runtime is not Express-based; most behavior lives in one large `server.js`, so future architectural tasks should treat it as a custom Node HTTP app.
- POST throttling is intentionally in-memory and process-local; it is a guardrail, not a distributed abuse-control system.
- `X-Forwarded-For` is ignored unless proxy trust is enabled and the socket remote address belongs to `TRUSTED_PROXY_IPS`.
- Quote tokens are stateless and signed; if a dedicated `QUOTE_SIGNING_SECRET` is absent, the server falls back to an existing server-side secret (`STRIPE_SECRET_KEY` or `GHL_API_KEY`).
- Google Places autocomplete still uses a browser key by design, but the key is now injected from env instead of being hardcoded in the repo; production still depends on strict referrer/API restrictions in Google Cloud.
- CRM attribution is intentionally pinned to public `/quote`, not the backend submit endpoint.

## 10. Confirmed Facts, Interpretations, And Unknowns
### Confirmed
- `selfhosted_site` is a standalone git repo with a GitHub origin.
- `npm start` runs `node server.js`.
- `render.yaml` deploys the site on Render with Node 20.
- `/__perf`, `/api/quote/submit`, `/api/quote/request`, and `/api/stripe/checkout-session` are real backend endpoints.
- `/quote` no longer contains direct browser-side GHL credential usage.
- Stripe checkout now requires a signed quote token instead of a raw client amount.

### Interpreted
- `exported_site/` in the parent folder looks like archival/export material, not the active managed repo.
- This project is best categorized as a self-hosted static-export site with selective dynamic backend endpoints.

### Unknown / Needs Later Study
- Whether the previously exposed browser-side GHL credentials have already been rotated in the real deployment environment.
- Whether all route HTML files are actively maintained or some are legacy export remnants.
- Whether Render plus Cloudflare is the only production path or one of several deployment targets.
