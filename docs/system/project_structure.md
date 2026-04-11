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
    leadconnector.js
    quote-pricing.js
    quote-token.js
    rate-limit.js
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
    server-smoke.test.js
    server-hardening.test.js
    quote-route.test.js
    quote-pricing.test.js
    quote-token.test.js
    leadconnector.test.js
    server-test-helpers.js
```

## Notes
- The parent folder `shynlicleaningservice/` is not the active managed repo for agent work.
- The nested repo `selfhosted_site/` should be used as `repo_path` in Orhitertor.
