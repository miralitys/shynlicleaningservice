# System Overview

## Purpose
`selfhosted_site` is the active deployable repo for Shynli Cleaning's public website, employee cabinet, and internal admin workspace. It serves exported HTML pages through a custom Node HTTP runtime and adds routing, sanitization, SEO/meta adjustments, cache policy, gated diagnostics, backend quote submission, signed Stripe checkout handoff, authenticated admin tooling, and protected employee W-9 document generation.

## Architecture Shape
- Presentation:
  - exported HTML pages
  - `css/`, `js/`, `images/`
- Runtime composition:
  - `server.js`
- Public-site layer:
  - `lib/site/request-handler.js`
  - `lib/site/assets.js`
  - `lib/site/sanitize.js`
  - `lib/site/seo.js`
- Shared infra layer:
  - `lib/http/request.js`
  - `lib/http/timing.js`
  - `lib/runtime/perf.js`
- Admin layer:
  - `lib/account/handlers.js`
  - `lib/account/render.js`
  - `lib/admin-auth.js`
  - `lib/admin/domain.js`
  - `lib/admin/handlers.js`
  - `lib/admin/render-pages.js`
  - `lib/admin/render-shared.js`
  - `lib/admin-settings-store.js`
  - `lib/admin-staff-store.js`
  - `lib/staff-w9.js`
- Quote / payments / persistence layer:
  - `lib/api/handlers.js`
  - `lib/quote-ops/store.js`
  - `lib/quote-pricing.js`
  - `lib/quote-token.js`
  - `lib/rate-limit.js`
  - `lib/leadconnector.js`
  - `lib/supabase-admin-staff.js`
  - `lib/supabase-quote-ops.js`

## Confirmed Runtime Capabilities
- pretty-route delivery from `routes.json`
- direct asset serving only through an explicit allowlist
- HTML cache warm-up on startup
- rolling perf metrics with token-gated `/__perf`
- backend quote submission via `/api/quote/submit` and `/api/quote/request`
- signed quote-token issuance
- server-side Stripe checkout session creation from a signed quote token
- admin password + TOTP login flow
- employee password/email-verification login flow
- admin SSR pages for clients, orders, staff, settings, and quote ops
- employee SSR dashboard with W-9 form completion
- quote-ops CSV export and retry workflow
- optional Supabase persistence for quote-ops history
- file-backed checklist store
- optional Supabase persistence for staff planning
- protected W-9 PDF generation, storage, and download routes for employees/admins

## Confirmed Risk Areas
- rate limiting is process-local in memory, so it is guardrail-level rather than distributed abuse control
- checklist persistence is still file-backed JSON unless a future backend is added
- staff persistence is split:
  - durable when Supabase is configured
  - file-backed locally when it is not
- generated W-9 PDFs are stored on the application filesystem by default, so production should use durable disk or an external document store if container filesystems are ephemeral
- quote-ops persistence is split:
  - durable when Supabase is configured
  - process-local when it is not
- proxy headers are ignored unless the request comes from an allowlisted trusted proxy IP
- Google Places still uses a browser key by design and depends on strict Google-side restrictions

## Documentation Maintenance Rule
When adding a new runtime module, endpoint, admin section, or persistence path:
- update `PROJECT_KNOWLEDGE.md`
- update `docs/system/module_catalog.md`
- update `docs/system/project_structure.md`
- update this file if the architecture shape changes
