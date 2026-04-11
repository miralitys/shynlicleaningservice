# Module Catalog

## Runtime Modules
- [server.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/server.js)
  - custom Node HTTP server
  - route normalization, allowlisted file serving, HTML cache, perf telemetry, quote + Stripe endpoints, POST throttling
  - runtime config injection for browser integrations, canonical CRM repricing, and optimized mobile sticky CTA handling

- [lib/leadconnector.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/lib/leadconnector.js)
  - backend CRM submission helper
  - quote normalization, contact upsert, note/opportunity flow, upstream error mapping

- [lib/quote-pricing.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/lib/quote-pricing.js)
  - canonical quote pricing rules mirrored from the browser calculator
  - clamps tampered values back to supported room/bathroom/size choices

- [lib/quote-token.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/lib/quote-token.js)
  - signs and verifies stateless quote tokens for checkout authorization

- [lib/rate-limit.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/lib/rate-limit.js)
  - sliding-window in-memory throttling for public POST endpoints

- [routes.json](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/routes.json)
  - public route to HTML file map

## Static Content
- root `page*.html`
  - Tilda-exported pages used by pretty routes
- policy pages
  - `privacy-policy.html`
  - `terms-of-service.html`
  - `cancellation-policy.html`
- asset directories
  - `css/`
  - `js/`
  - `images/`

## Operations
- [render.yaml](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/render.yaml)
  - Render deployment contract
- [CLOUDFLARE_EDGE_CACHE.md](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/CLOUDFLARE_EDGE_CACHE.md)
  - edge cache guidance and purge workflow
- `scripts/optimize-images.sh`
  - generates AVIF/WebP variants
- `scripts/purge-cloudflare-html-cache.mjs`
  - invalidates cached HTML URLs in Cloudflare

## Tests And Knowledge
- [PROJECT_KNOWLEDGE.md](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/PROJECT_KNOWLEDGE.md)
- [test/server-smoke.test.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/test/server-smoke.test.js)
- [test/server-hardening.test.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/test/server-hardening.test.js)
- [test/quote-route.test.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/test/quote-route.test.js)
  - quote submit behavior, quote-token handoff, canonical CRM repricing assertions, and trusted-proxy boundary coverage
- [test/quote-pricing.test.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/test/quote-pricing.test.js)
- [test/quote-token.test.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/test/quote-token.test.js)
- [test/leadconnector.test.js](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/test/leadconnector.test.js)
- [.env.example](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/.env.example)
- [.gitignore](/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site/.gitignore)
