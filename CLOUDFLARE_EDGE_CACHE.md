# Cloudflare Edge Cache Setup

This project now sends edge-friendly cache headers from origin:

- HTML:
  - `Cache-Control: public, max-age=60, stale-while-revalidate=300`
  - `CDN-Cache-Control: public, s-maxage=600, stale-while-revalidate=300, stale-if-error=86400`
- Static:
  - `Cache-Control: public, max-age=31536000`
  - `CDN-Cache-Control: public, s-maxage=31536000, stale-while-revalidate=86400, stale-if-error=604800`
  - fingerprinted files also include `immutable`

## 1) Prerequisites

1. Domain is proxied through Cloudflare (orange cloud).
2. DNS points to Render custom domain endpoint.
3. Use custom domain (`shynlicleaningservice.com`) for traffic. `onrender.com` is not cached by Cloudflare.

## 2) Recommended Cache Rules (Cloudflare Dashboard)

Order matters: keep rules in this order.

1. Bypass non-GET requests
   - Expression: request method is not `GET` and not `HEAD`
   - Action: `Bypass cache`

2. Cache static assets aggressively
   - Expression example:
     - host equals `shynlicleaningservice.com`
     - and URI path matches `\.(?:avif|webp|png|jpe?g|gif|svg|css|js|woff2?|ico|map)$`
   - Actions:
     - Cache eligibility: `Eligible for cache`
     - Origin cache control: `On` (respect `CDN-Cache-Control`)
     - Cache key: ignore query string (recommended for this static export)

3. Cache HTML at edge (safe mode)
   - Expression example:
     - host equals `shynlicleaningservice.com`
     - and method is `GET` or `HEAD`
     - and URI path does not match static extension regex above
   - Actions:
     - Cache eligibility: `Eligible for cache`
     - Origin cache control: `On`
     - Cache key: standard or ignore query string (if you do not serve query-dependent HTML)

4. Optional bypass for admin/preview paths
   - If needed, add explicit bypass for any private paths.

## 3) Release Invalidation

Run this script after deploy to purge HTML URLs from Cloudflare:

```bash
cd /Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site
CF_API_TOKEN=... \
CF_ZONE_ID=... \
SITE_BASE_URL=https://shynlicleaningservice.com \
node scripts/purge-cloudflare-html-cache.mjs
```

Emergency full purge (use only if necessary):

```bash
CF_API_TOKEN=... CF_ZONE_ID=... CF_PURGE_EVERYTHING=1 node scripts/purge-cloudflare-html-cache.mjs
```

## 4) Verification

Run twice (first request may be MISS, second should be HIT):

```bash
curl -I https://shynlicleaningservice.com/ | grep -iE 'cf-cache-status|age|cache-control|cdn-cache-control'
curl -I https://shynlicleaningservice.com/images/tild6365-6434-4463-b538-666261306635__8c5dd66b-07e6-442b-a.png | grep -iE 'cf-cache-status|age|content-type|cache-control'
```

Expected:

- `CF-Cache-Status: HIT` on repeated requests
- lower `TTFB` for cached responses
- lower origin RPS and origin egress
