# Decision Log

## 2026-03-21 — Use `selfhosted_site` as the managed repo
- Reason:
  - it is the actual deployable repo for the application runtime
  - parent wrapper folders may contain exports or archives, but not the active deployment contract
- Impact:
  - automation, testing, and future refactors should target the repo that contains `server.js`, `routes.json`, and `render.yaml`

## 2026-03-21 — Add onboarding hygiene without changing business logic
- Added:
  - `.gitignore`
  - `.env.example`
  - `PROJECT_KNOWLEDGE.md`
  - `docs/system/*`
  - `node:test` coverage
- Reason:
  - make the project maintainable for future coding, review, and ops work

## 2026-03-21 — Move quote CRM submission to backend and close public runtime leaks
- Confirmed:
  - `/quote` previously exposed browser-side GHL logic
  - runtime previously served repo internals and exposed `/__perf` publicly
- Decision:
  - move quote CRM submission behind `POST /api/quote/submit`
  - keep compatibility alias `POST /api/quote/request`
  - restrict public direct-asset serving to an explicit allowlist
  - keep `/__perf` disabled by default and require `ENABLE_PERF_ENDPOINT=1` plus `PERF_ENDPOINT_TOKEN`
- Impact:
  - GHL credentials now live on the server only
  - source/tests/docs are no longer part of the public web surface
  - Stripe redirect URLs are pinned to the configured canonical origin

## 2026-03-21 — Make checkout server-authoritative with signed quote tokens
- Confirmed:
  - raw client `amount` in `/api/stripe/checkout-session` was a payment-tampering path
  - quote hardening also needed minimal abuse throttling on public POST endpoints
- Decision:
  - add `lib/quote-pricing.js` to mirror browser pricing rules on the server
  - issue a signed `quoteToken` from `/api/quote/submit`
  - require that token for `/api/stripe/checkout-session`
  - clamp quote inputs to UI-supported minimums/buckets before canonical pricing
  - rate-limit public POST endpoints, trusting proxy headers only when `TRUST_PROXY_HEADERS=1`
- Impact:
  - checkout no longer accepts raw browser totals
  - quote-to-payment handoff is tied to a server-signed payload
  - abuse guardrails exist even without external middleware, though they remain process-local

## 2026-03-21 — Keep CRM writes on the same canonical quote snapshot
- Confirmed:
  - checkout was already canonical, but CRM note/opportunity/custom-field writes could still persist raw browser quote values
- Decision:
  - compute canonical pricing before CRM submission
  - pass canonicalized room/bathroom/size/service/price fields into the LeadConnector helper
  - add regression coverage proving CRM side effects no longer store tampered values
- Impact:
  - CRM and checkout now agree on the authoritative quote state

## 2026-03-21 — Tighten browser/runtime config boundaries
- Confirmed:
  - the quote page still carried a hardcoded Google Places browser key
  - proxy-header trust needed an explicit trusted-proxy boundary, not just a boolean flag
- Decision:
  - inject `GOOGLE_PLACES_API_KEY` at runtime from server config instead of committing a live key in HTML
  - only honor `X-Forwarded-For` when both `TRUST_PROXY_HEADERS=1` and the socket remote address is present in `TRUSTED_PROXY_IPS`
- Impact:
  - the repo no longer contains a live Google Places key
  - forwarded-header rate limiting is now tied to an explicit trusted proxy allowlist

## 2026-04-11 — Add an internal admin workspace with server-rendered pages
- Decision:
  - implement password + TOTP admin auth
  - add SSR admin sections for dashboard, clients, orders, staff, settings, and quote ops
  - keep the UI server-rendered and framework-free to match the existing runtime style
- Impact:
  - internal operators can manage quote history, assignments, and checklist templates without introducing a frontend app build step

## 2026-04-11 — Use lightweight persistence by data type
- Decision:
  - keep checklist templates and staff planning in local file-backed JSON stores
  - support optional Supabase persistence for quote-ops history through a dedicated adapter and schema file
- Impact:
  - internal state is durable enough for current operations without requiring a full database migration
  - quote-ops can be made durable in production when Supabase is configured
  - persistence remains heterogeneous and should be revisited if multi-instance coordination becomes necessary

## 2026-04-11 — Refactor `server.js` into modular runtime layers
- Confirmed:
  - `server.js` had become a large mixed-responsibility file covering public-site delivery, admin UI, API flows, perf, and rendering concerns
- Decision:
  - keep `server.js` as a thin composition/bootstrap entrypoint
  - move public-site logic into `lib/site/*`
  - move request parsing into `lib/http/request.js`
  - move admin domain logic into `lib/admin/domain.js`
  - keep API, perf, and quote-ops logic in focused modules
- Impact:
  - runtime behavior is easier to reason about and update safely
  - documentation can now refer to stable module boundaries instead of a single monolith
