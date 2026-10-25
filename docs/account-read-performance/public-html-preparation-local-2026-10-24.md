# Public HTML Preparation, Local Verification

Date: 2026-10-24, America/Chicago. Baseline/live release: `ff32e7c3967ded4651d7444bfca08ccd752f4d00`.

Local, uncommitted implementation only. No push, deployment, SQL migration or production configuration/data changes. All HTTP checks below use isolated local servers and a fake read-only database, not Supabase or the live site.

## Implementation

The public static-file handler retains its existing eight-entry, 16 MiB estimated uncompressed HTML LRU. On a miss it now awaits a single worker thread, rather than running the synchronous public sanitizer in the account server's event loop. The worker uses exactly the existing sanitizer and SEO helpers with the same cloned public configuration. No page/template, text, CSS, calculator, pricing, metadata, robots or sitemap logic was edited.

The worker retains prepared PUBLIC HTML as gzip-compressed data, with a 16 MiB estimated compressed-cache budget. All 325 prepared registered HTML pages fit in the measured corpus, occupying 8499159 bytes, approximately 8.1 MiB. A miss in the small main-process LRU therefore reuses prepared content rather than parsing/sanitizing it again. The cache key includes route and a hash of source content, so cities sharing a source file stay distinct and changed source cannot reuse the wrong prepared result.

Only exact mapped public file/route pairs may enter the compressed cache. Unknown paths and arbitrary 404 URLs are not retained there. The main LRU remains bounded. Simultaneous misses for one file/route are coalesced. Both main preparation and worker pending work are bounded to 32 jobs. The worker has a 128 MiB old-generation and 16 MiB young-generation V8 limit; these are not a whole-process RSS guarantee. It receives no database credentials, session cookies or inherited process environment, only public rendering options and static HTML. It does not read order/customer/payroll data.

Worker startup is lazy and normally happens during the existing minimal startup warm-up. Idle workers are unreferenced; shutdown terminates the worker. Errors/timeouts settle pending work and allow a fresh worker on a later request. Preparation failures return a non-cacheable, retryable 503 instead of raw HTML or a synchronous main-thread fallback. Existing successful 200/304 handling, content/cache/SEO headers and Last-Modified values are unchanged.

Private account/admin routes are not routed through this cache. Their authorization, data reads, history, full-card loading, prices, staff assignments and payout logic are unchanged. No additional public warming or data maintenance jobs were added.

## Exact HTTP Parity

`scripts/benchmark-public-html.js` runs the baseline `server.js` and `lib/site/assets.js` from Git in an isolated child, without checking out or rewriting the repository. It then runs the working-tree implementation against identical synthetic data.

- 330 public paths checked, including exported routes, all managed blog articles, city-service pages, noindex/advertising routes, quote/pricing, sitemap, robots and a missing path. The 12 public stress routes were also revisited after the corpus displaced the main LRU.
- Exact HTTP body hashes and selected headers match: Content-Type, Cache-Control, CDN-Cache-Control, Cloudflare-CDN-Cache-Control, ETag, Last-Modified, Link, X-Robots-Tag and Location. Response status also matches. The intentional Server-Timing/cache-hit measurement differs and is not a content comparison.
- Six private control URLs match before and after: compact month, selected day, earnings, two full-history pages and a complete order-card fragment. These controls were checked both before and after the public sweep.
- Fake database: 254 synthetic orders, 163 completed, two team members, fixed overrides and saved payouts. Both versions made 144 allowed reads; zero business writes. The fixture permits GET and only the SELECT-only calendar RPC POST. External network access is rejected by the fixture.
- Conditional ETag requests return 304. Source HTML/CSS/JS/image files, sitemap dates and public content were not edited. Byte-identical HTML and unchanged assets preserve the desktop/mobile markup and design; this task did not perform a new physical-phone or live-browser speed test.

## Local Performance

First experiment: full 330-path parity sweep and a revisit to 12 public paths. No artificial database or CPU delays.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Repeated public HTTP median, ms | 79.56 | 3.28 |
| Main event-loop p95 delay, ms | 168.03 | 21.87 |
| Main event-loop maximum delay, ms | 251.27 | 72.81 |
| End-of-run sampled process RSS, KiB | 681008 | 410368 |

RSS is one local sample after the sweep, not peak memory or a production capacity promise. The candidate's thread and cache are included in process RSS. Compression and V8 limits bound retained work but production RSS/CPU still need observation after a separately authorized deploy.

Second experiment: 12 cold public requests, each deliberately starting 5 ms before a separate calendar request. This ensures the calendar can arrive while public-page CPU work is underway, unlike fully simultaneous requests where the small calendar response can finish first. No synthetic work or database delay is injected.

| Overlapping public/calendar requests | Baseline | Candidate |
| --- | ---: | ---: |
| Calendar HTTP median, ms | 87.92 | 12.90 |
| Repeated public HTTP median, ms | 78.77 | 3.28 |
| Main event-loop maximum delay, ms | 139.46 | 73.92 |

These are local HTTP/server timings on this Mac. They do not predict the site's live FCP, cellular latency, Render CPU quota or all sources of server contention. First-time public preparation still consumes CPU in the worker, and CPU quotas are shared at process/container level. The change removes repeated preparation and main-thread execution; it does not promise that all calendar delays disappear.

## Tests

Final `npm test`: 886 passed, zero failed/cancelled/skipped; 129207.495 ms. `git diff --check` passed.

New coverage includes byte-identical worker/direct sanitizer output, cross-route aliases, source refresh, more pages than the main LRU, compressed-cache eviction and byte limits, exclusion of unknown paths, coalesced concurrent requests, bounded pending jobs, asynchronous preparation, invalid jobs, timeout/shutdown rejection, retryable 503 without exposing source, header preservation and conditional 304. The existing full suite covers order/history availability, fixed/manual prices, teams, payouts, authorization, calendar projection completeness, forms/calculator and SEO behavior.

An earlier benchmark attempt used the wrong test-only performance-endpoint environment variable and received a 404 for that diagnostic endpoint. The harness was corrected to the existing `ENABLE_PERF_ENDPOINT` name and both final benchmark runs succeeded. This was not a site bug or production change.

## Files And Reproduction

Production edits:

- `server.js`
- `lib/site/assets.js`
- `lib/site/html-preparation.js`
- `lib/site/html-preparation-worker.js`

Verification:

- `test/site-html-cache.test.js`
- `test/public-html-preparation.test.js`
- `test/support/public-html-baseline-loader.cjs`
- `scripts/benchmark-public-html.js`
- This report.

The pre-existing `test/admin-route-client-order-prefill.test.js` edits were left untouched. No business/account handler, database, pricing, assignment or payroll module was edited.

```sh
npm test
PUBLIC_HTML_BASELINE_REF=ff32e7c3 node scripts/benchmark-public-html.js
PUBLIC_HTML_BASELINE_REF=ff32e7c3 PUBLIC_HTML_PROFILE_ONLY=1 node scripts/benchmark-public-html.js
```

Evidence: `/Users/ramisyaparov/Desktop/Project/shynlicleaningservice/output/public-html-preparation-local-2026-10-24/` contains final HTTP parity, overlap benchmark and test log. Temporary local test servers were stopped and fixture stores removed. Nothing was deployed. A future rollback would redeploy `ff32e7c3`; no SQL rollback or business-data restoration is involved.
