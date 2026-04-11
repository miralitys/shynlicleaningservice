# Decision Log

## 2026-03-21 — Use `selfhosted_site` as the managed repo
- Reason:
  - it is the actual nested git repository with a real origin
  - the parent folder only wraps exported assets and archives
- Impact:
  - Orhitertor registration should target `.../shynlicleaningservice/selfhosted_site`

## 2026-03-21 — Add onboarding hygiene without changing business logic
- Added:
  - `.gitignore`
  - `.env.example`
  - `PROJECT_KNOWLEDGE.md`
  - `docs/system/*`
  - `node:test` smoke coverage
- Reason:
  - make the project agent-ready for future reviewer/tester/security/developer work

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
  - raw client `amount` in `/api/stripe/checkout-session` was still a payment-tampering path
  - quote hardening also needed minimal abuse throttling on public POST endpoints
- Decision:
  - add `lib/quote-pricing.js` to mirror browser pricing rules on the server
  - issue a signed `quoteToken` from `/api/quote/submit`
  - require that token for `/api/stripe/checkout-session`
  - clamp quote inputs to UI-supported minimums/buckets before canonical pricing
  - rate-limit public POST endpoints, trusting proxy headers only when `TRUST_PROXY_HEADERS=1`
- Impact:
  - checkout no longer accepts raw browser totals
  - quote-to-payment handoff is now tied to a server-signed payload
  - abuse guardrails exist even without external middleware, though they remain process-local

## 2026-03-21 — Keep CRM writes on the same canonical quote snapshot
- Confirmed:
  - checkout was already canonical, but CRM note/opportunity/custom-field writes could still persist raw browser quote values
- Decision:
  - compute canonical pricing before `submitQuoteSubmission()`
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

## 2026-03-21 — Reduce mobile sticky CTA runtime cost
- Confirmed:
  - the injected mobile CTA cleanup script was scanning large Tilda DOMs on scroll/resize/mutation
- Decision:
  - narrow legacy CTA candidate selection
  - include Tilda `t943` wrappers in the legacy CTA hide path
  - move cleanup off the hot scroll path and schedule it separately
- Impact:
  - duplicate sticky CTA risk is closed for the known Tilda wrapper
  - mobile scroll path is materially lighter
