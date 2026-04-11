# PROJECT_KNOWLEDGE

## 1. What This Project Is
- Name: `shynli-selfhosted-site`
- Type: self-hosted Shynli Cleaning website with a custom Node runtime, server-backed quote flow, and an authenticated admin workspace.
- Primary goal:
  - serve a Tilda-exported public site behind custom routing, safe static-file rules, SEO/meta adjustments, cache-friendly behavior, and backend quote/payment logic;
  - provide admins with a protected workspace for clients, orders, staff planning, checklist templates, and quote-ops review.
- Primary users:
  - prospective cleaning customers browsing the public site and requesting quotes;
  - internal operators using `/admin`;
  - maintainers deploying and extending the runtime.
- Responsibility boundary:
  - owns public HTML delivery, route mapping, runtime sanitization, SEO/meta injection, quote repricing, CRM submission, signed quote tokens, Stripe checkout session creation, admin auth, admin SSR pages, quote-ops history, and lightweight internal stores;
  - does not use Express, a frontend framework, or a general-purpose database layer for all admin data;
  - only quote-ops history can optionally persist to Supabase; staff/settings stores are file-backed JSON.

## 2. What The Project Does
- Serves `58` pretty public routes from `routes.json`.
- Serves only allowlisted direct assets from `css/`, `js/`, `images/`, and a few safe top-level files.
- Adds security headers globally and keeps `/__perf` disabled unless explicitly enabled with `ENABLE_PERF_ENDPOINT=1` and `PERF_ENDPOINT_TOKEN`.
- Exposes:
  - `POST /api/quote/submit`
  - `POST /api/quote/request` as a compatibility alias
  - `POST /api/stripe/checkout-session`
- Hosts the customer quote flow at `/quote`, with backend-authoritative pricing and signed quote-token handoff to Stripe.
- Hosts an admin workspace with:
  - `/admin`
  - `/admin/login`
  - `/admin/2fa`
  - `/admin/clients`
  - `/admin/orders`
  - `/admin/staff`
  - `/admin/settings`
  - `/admin/quote-ops`
- Supports admin CSV export and retry actions for quote ops.
- Optionally persists quote-ops history to Supabase via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Persists checklist templates and staff/assignment planning to local JSON files under runtime `data/`.

## 3. How The Project Is Structured
- Thin entrypoint: `server.js`
- Route map: `routes.json`
- Public-site runtime modules:
  - `lib/site/request-handler.js`
  - `lib/site/assets.js`
  - `lib/site/sanitize.js`
  - `lib/site/seo.js`
- Shared request/response/runtime modules:
  - `lib/http/request.js`
  - `lib/http/timing.js`
  - `lib/runtime/perf.js`
- Admin modules:
  - `lib/admin-auth.js`
  - `lib/admin/domain.js`
  - `lib/admin/handlers.js`
  - `lib/admin/render-pages.js`
  - `lib/admin/render-shared.js`
  - `lib/admin-settings-store.js`
  - `lib/admin-staff-store.js`
- Quote / payments / persistence modules:
  - `lib/api/handlers.js`
  - `lib/quote-ops/store.js`
  - `lib/quote-pricing.js`
  - `lib/quote-token.js`
  - `lib/rate-limit.js`
  - `lib/leadconnector.js`
  - `lib/supabase-quote-ops.js`
- Ops and schema:
  - `render.yaml`
  - `CLOUDFLARE_EDGE_CACHE.md`
  - `supabase/quote_ops_schema.sql`
  - `scripts/optimize-images.sh`
  - `scripts/purge-cloudflare-html-cache.mjs`
- Documentation:
  - `PROJECT_KNOWLEDGE.md`
  - `docs/system/*`
- Tests:
  - `test/admin-auth.test.js`
  - `test/admin-route.test.js`
  - `test/admin-settings-store.test.js`
  - `test/leadconnector.test.js`
  - `test/quote-pricing.test.js`
  - `test/quote-route.test.js`
  - `test/quote-token.test.js`
  - `test/server-hardening.test.js`
  - `test/server-smoke.test.js`
  - `test/supabase-quote-ops.test.js`
  - `test/server-test-helpers.js`

## 4. Core Logic
### Main request flow
1. `server.js` boots the app, loads `routes.json`, builds the runtime index, and warms the HTML cache.
2. `lib/site/request-handler.js` becomes the top-level HTTP router.
3. For each request:
   - redirect rules are checked first;
   - `/__perf` is gated behind token auth;
   - admin routes are delegated to `lib/admin/handlers.js`;
   - quote and Stripe endpoints are delegated to `lib/api/handlers.js`;
   - allowlisted assets and route-mapped HTML are served through `lib/site/assets.js`;
   - if nothing matches, the configured 404 page is served.

### Admin auth flow
1. User visits `/admin/login`.
2. Email + password are checked against server-side admin config.
3. On success, a short-lived challenge cookie is issued.
4. User submits a TOTP code at `/admin/2fa`.
5. On success, the server issues a signed admin session cookie and redirects to `/admin`.

### Admin workspace flow
1. `lib/admin/render-pages.js` renders SSR HTML for clients, orders, staff, settings, and quote ops.
2. `lib/admin/domain.js` builds filters, summaries, labels, redirect URLs, and view models from quote-op entries and local staff/settings state.
3. `lib/admin-settings-store.js` persists checklist templates and completion state to a JSON file.
4. `lib/admin-staff-store.js` persists staff records and order assignments to a JSON file.

### Quote / CRM flow
1. `/quote` handles the customer UI in the browser.
2. Final submit goes to `/api/quote/submit` or legacy alias `/api/quote/request`.
3. Server rate-limits the request, normalizes the payload, recalculates canonical pricing, and clamps unsupported inputs.
4. Server writes CRM side effects through `lib/leadconnector.js`.
5. Server records the quote-op result and returns canonical `pricing` plus a signed `quoteToken`.

### Quote-ops persistence flow
1. `lib/quote-ops/store.js` keeps the operational ledger interface.
2. If Supabase env is configured, entries are read/written through `lib/supabase-quote-ops.js`.
3. If Supabase is not configured, quote ops fall back to in-memory storage for the running process.
4. Admin quote-ops pages, CSV export, and retry actions all consume this same store abstraction.

### Stripe flow
1. Client POSTs `quoteToken` to `/api/stripe/checkout-session`.
2. Server rate-limits the request, validates body size/shape, and verifies the signed token.
3. Server ignores raw browser totals and creates a Stripe Checkout session from the canonical signed quote payload.
4. Success and cancel URLs resolve against the configured canonical site origin unless env overrides are present.

## 5. Data And Entities
- `routes.json`
  - maps a public route like `/services/regular-cleaning` to an exported HTML file.
- runtime index
  - route-to-file map
  - file existence set
  - image variant map
  - not-found fallback file
- quote token
  - signed payload carrying canonical quote/contact metadata for checkout authorization.
- quote-ops entry
  - request metadata, contact info, service info, pricing, CRM status, retry metadata, and payload-for-retry.
- Supabase quote-ops row
  - the `quote_ops_entries` row shape mirrored by `lib/supabase-quote-ops.js`.
- staff record
  - internal cleaner/operator data: name, role, phone, email, status, notes.
- assignment record
  - links a quote-op entry to staff IDs, scheduled date/time, assignment status, and notes.
- checklist template
  - service-type-specific checklist with ordered items and completion state.

## 6. Interfaces And Integrations
- Public HTTP:
  - `GET /`
  - pretty public routes from `routes.json`
  - `GET /__perf` when explicitly enabled and token-authenticated
  - `POST /api/quote/submit`
  - `POST /api/quote/request`
  - `POST /api/stripe/checkout-session`
- Admin HTTP:
  - `GET/POST /admin/login`
  - `GET/POST /admin/2fa`
  - `POST /admin/logout`
  - `GET /admin`
  - `GET /admin/clients`
  - `GET/POST /admin/orders`
  - `GET/POST /admin/staff`
  - `GET/POST /admin/settings`
  - `GET /admin/quote-ops`
  - `GET /admin/quote-ops/export.csv`
  - `POST /admin/quote-ops/retry`
- External services:
  - Stripe via `STRIPE_SECRET_KEY`
  - LeadConnector / GHL via `GHL_*`
  - Supabase via `SUPABASE_*` for optional quote-ops persistence
  - Google Places browser autocomplete via runtime-injected `GOOGLE_PLACES_API_KEY`
  - Cloudflare purge API via `scripts/purge-cloudflare-html-cache.mjs`
- Deployment:
  - Render web service via `render.yaml`
  - Cloudflare in front of the production domain

## 7. How To Run
- Requirements:
  - Node.js `20.x`
  - `npm install`
- Local run:
  - `npm start`
- Local tests:
  - `npm test`
  - current status: `66/66` green
- Important env:
  - `HOST`, `PORT`, `PUBLIC_SITE_ORIGIN`
  - `STRIPE_SECRET_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`
  - `GOOGLE_PLACES_API_KEY`
  - `QUOTE_SIGNING_SECRET`, `QUOTE_TOKEN_TTL_SECONDS`
  - `GHL_*`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_QUOTE_OPS_TABLE`
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_MASTER_SECRET`, `ADMIN_TOTP_SECRET`
  - `ADMIN_SETTINGS_STORE_PATH`, `ADMIN_STAFF_STORE_PATH`
  - `POST_RATE_LIMIT_WINDOW_MS`, `POST_RATE_LIMIT_MAX_REQUESTS`
  - `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`
  - `ENABLE_PERF_ENDPOINT`, `PERF_ENDPOINT_TOKEN`

## 8. Key Components
### `server.js`
- Thin bootstrap/composition layer.
- Loads routes, creates helpers/stores, warms runtime caches, starts `http.createServer`, and wires handlers together.

### `lib/site/request-handler.js`
- Top-level HTTP router for public pages, admin routes, API routes, assets, `/__perf`, redirects, and fallbacks.

### `lib/site/assets.js`
- Runtime index building, file resolution, cache headers, negotiated image handling, and HTML cache warm-up.

### `lib/site/sanitize.js`
- HTML sanitization and runtime injection for the public site.

### `lib/site/seo.js`
- Route-level title/meta/canonical/JSON-LD helpers.

### `lib/admin/handlers.js`
- Admin request controller for login, 2FA, logout, settings actions, staff updates, quote-ops export, and retry flow.

### `lib/admin/render-pages.js` and `lib/admin/render-shared.js`
- Server-rendered admin UI layout and page HTML.

### `lib/admin-settings-store.js` and `lib/admin-staff-store.js`
- File-backed JSON stores created under runtime `data/` by default.

### `lib/api/handlers.js`
- Public API controller for quote submission and Stripe checkout session creation.

### `lib/quote-ops/store.js`
- Quote-ops ledger abstraction with list, export, retry, and persistence coordination.

## 9. Important Hidden Knowledge
- The runtime is custom Node `http`, not Express.
- Admin pages are server-rendered string templates, not React/Vue pages.
- `server.js` is no longer the main behavior monolith; most runtime logic now lives in focused modules under `lib/`.
- Quote-ops persistence is conditional:
  - with Supabase env: persistent operational history;
  - without Supabase env: process-local in-memory history.
- Staff and checklist state are file-backed by default and create `data/admin-staff-store.json` and `data/admin-settings-store.json` at runtime unless env overrides are set.
- POST throttling remains in-memory and process-local.
- `X-Forwarded-For` is ignored unless proxy trust is enabled and the socket remote address is allowlisted.
- Admin session signing falls back through `ADMIN_MASTER_SECRET`, then other server-side secrets if needed.
- `/admin/integrations` and `/admin/runtime` are intentionally redirected away from the visible admin UI.

## 10. Confirmed Facts, Interpretations, And Unknowns
### Confirmed
- `npm start` runs `node server.js`.
- The app serves `58` public routes from `routes.json`.
- The admin workspace is live and protected by password + TOTP.
- Quote checkout is server-authoritative through signed quote tokens.
- Quote-ops can persist to Supabase through the existing adapter and schema file.
- Current full test status is `66/66` passing.

### Interpreted
- The project is best understood as a hybrid of:
  - static-export public pages,
  - custom Node runtime orchestration,
  - lightweight internal admin tooling.

### Unknown / Needs Later Study
- Whether staff/settings stores should remain file-backed long-term or move to Supabase as well.
- Whether every exported HTML page in the repo is still actively used in production.
- Whether production secret rotation was completed after earlier browser/runtime exposure issues.
