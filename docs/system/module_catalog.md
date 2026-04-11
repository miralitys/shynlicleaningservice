# Module Catalog

## Entry And Composition
- `server.js`
  - bootstraps env/config
  - creates stores, rate limiters, runtime helpers, and request handlers
  - starts the Node `http` server

## Public-Site Runtime
- `lib/site/request-handler.js`
  - top-level request router for redirects, `/__perf`, admin, API, public assets, and route-mapped HTML
- `lib/site/assets.js`
  - route/file runtime index
  - HTML cache warm-up
  - static file delivery
  - negotiated image handling
- `lib/site/sanitize.js`
  - HTML sanitization and runtime script/style injection for exported pages
- `lib/site/seo.js`
  - title/meta/canonical/JSON-LD helpers

## Shared Infra
- `lib/http/request.js`
  - cookies
  - body parsing
  - form parsing
  - client IP and request URL helpers
- `lib/http/timing.js`
  - response helpers with request timing and security headers
- `lib/runtime/perf.js`
  - rolling perf window
  - event-loop tracking
  - structured buffered logging helpers

## Admin Workspace
- `lib/admin-auth.js`
  - password verification
  - TOTP generation/verification
  - admin session/challenge token signing
- `lib/admin/domain.js`
  - admin auth state
  - orders/clients/staff view-model shaping
  - filters, labels, redirect helpers, QR rendering
- `lib/admin/handlers.js`
  - admin login, 2FA, logout
  - settings/staff/order mutations
  - quote-ops export and retry actions
- `lib/admin/render-pages.js`
  - SSR HTML for dashboard, clients, orders, staff, settings, and quote ops
- `lib/admin/render-shared.js`
  - shared admin layout, cards, sidebar, auth pages, and common UI helpers
- `lib/admin-settings-store.js`
  - file-backed checklist templates and completion state
- `lib/admin-staff-store.js`
  - file-backed staff records and assignment planning state

## Quote, CRM, Payments, And Persistence
- `lib/api/handlers.js`
  - public quote submit and Stripe checkout endpoint handlers
- `lib/quote-ops/store.js`
  - quote-ops ledger abstraction
  - entry listing/filtering/export/retry support
  - persistence coordination
- `lib/leadconnector.js`
  - CRM submission helper
  - contact/note/opportunity/custom-field flow
- `lib/quote-pricing.js`
  - canonical quote repricing rules mirrored from the calculator
- `lib/quote-token.js`
  - signed quote-token creation and verification
- `lib/rate-limit.js`
  - sliding-window in-memory throttling
- `lib/supabase-quote-ops.js`
  - Supabase REST adapter for quote-ops rows
  - support for both legacy JWT `service_role` keys and new opaque `sb_secret_*` keys
- `supabase/quote_ops_schema.sql`
  - schema for `quote_ops_entries`

## Static Content And Assets
- `routes.json`
  - pretty route to exported HTML file map
- root `page*.html`
  - exported public pages
- `css/`, `js/`, `images/`
  - public frontend assets

## Operations
- `render.yaml`
  - Render deployment contract
- `CLOUDFLARE_EDGE_CACHE.md`
  - Cloudflare caching and purge notes
- `scripts/optimize-images.sh`
  - image optimization/variant generation
- `scripts/purge-cloudflare-html-cache.mjs`
  - HTML cache purge helper

## Tests And Knowledge
- `PROJECT_KNOWLEDGE.md`
- `docs/system/*`
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
