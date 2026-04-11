# Project Structure

```text
selfhosted_site/
  server.js
  routes.json
  render.yaml
  package.json
  package-lock.json
  README-RU.md
  CLOUDFLARE_EDGE_CACHE.md
  PROJECT_KNOWLEDGE.md
  .env.example
  .gitignore
  404.html
  cancellation-policy.html
  privacy-policy.html
  terms-of-service.html
  page*.html
  css/
  js/
  images/
  lib/
    admin-auth.js
    admin-settings-store.js
    admin-staff-store.js
    supabase-admin-staff.js
    admin/
      domain.js
      handlers.js
      render-pages.js
      render-shared.js
    api/
      handlers.js
    http/
      request.js
      timing.js
    quote-ops/
      store.js
    runtime/
      perf.js
    site/
      assets.js
      request-handler.js
      sanitize.js
      seo.js
    leadconnector.js
    quote-pricing.js
    quote-token.js
    rate-limit.js
    supabase-quote-ops.js
  supabase/
    admin_staff_schema.sql
    quote_ops_schema.sql
  scripts/
    optimize-images.sh
    purge-cloudflare-html-cache.mjs
  docs/
    system/
      system_overview.md
      module_catalog.md
      data_flows.md
      project_structure.md
      decision_log.md
  test/
    admin-auth.test.js
    admin-staff-store.test.js
    admin-route.test.js
    admin-settings-store.test.js
    leadconnector.test.js
    quote-pricing.test.js
    quote-route.test.js
    quote-token.test.js
    server-hardening.test.js
    server-smoke.test.js
    server-test-helpers.js
    supabase-admin-staff.test.js
    supabase-quote-ops.test.js
  data/                         # runtime-created, gitignored
    admin-settings-store.json   # created on first settings write
    admin-staff-store.json      # created on first staff/assignment write when local mode is used
```

## Notes
- `server.js` is now a thin bootstrap/orchestration entrypoint, not the primary implementation bucket.
- Most runtime logic now lives in focused modules under `lib/`.
- `data/` is not committed; it is created at runtime if local staff/settings stores are used.
- Staff planning can now persist either locally or through Supabase, depending on env configuration.
