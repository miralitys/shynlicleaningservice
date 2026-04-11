# System Overview

## Purpose
`selfhosted_site` is the active deployable repo for Shynli Cleaning's public website. It serves exported HTML pages through a custom Node HTTP server and adds routing, SEO/meta adjustments, cache policy, gated runtime diagnostics, backend CRM quote submission, and server-authoritative Stripe checkout creation.

## Architecture Shape
- Presentation: exported HTML pages, CSS, JS, images
- Application/runtime orchestration: `server.js`
- Infrastructure:
  - Node `http` server
  - filesystem-backed route/file resolution
  - local helper modules under `lib/`
  - optional Stripe SDK
  - backend LeadConnector / GHL integration
  - Render deployment
  - Cloudflare edge caching

## Confirmed Runtime Capabilities
- pretty-route delivery from `routes.json`
- direct asset serving only through an explicit allowlist
- rolling perf metrics with token-gated `/__perf`
- global baseline security headers on every response path
- backend quote submission via `/api/quote/submit` and `/api/quote/request`
- signed quote-token issuance
- server-side Stripe checkout session creation from a signed quote token
- canonical CRM side effects built from the same repriced quote snapshot used for checkout
- HTML cache warm-up on startup

## Confirmed Risk Areas
- no backend abstraction layer yet; `server.js` still owns most runtime behavior
- rate limiting is process-local in memory, so it is guardrail-level rather than distributed abuse control
- proxy headers are ignored unless the request comes from an allowlisted trusted proxy IP
- external operational step still remains for rotating the previously exposed GHL token in real deployments
- CRM attribution is intentionally pinned to public `/quote`, not the backend submit endpoint
