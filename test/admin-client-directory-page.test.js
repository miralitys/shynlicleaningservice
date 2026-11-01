"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { startServer, stopServer } = require("./server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { createUserSessionToken } = require("../lib/account-auth");

test("client pages, continuation, complete cards and read permissions retain identical HTML", { timeout: 120000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-client-page-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-client-directory-qa", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", PROFITABILITY_ENABLED: "0", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    GOOGLE_CALENDAR_CLIENT_ID: "", GOOGLE_OAUTH_CLIENT_ID: "", CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999",
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "support/client-directory-page-fixture.cjs") };
  const expected = new Map(), actualKeys = [];
  const hash = value => createHash("sha256").update(value).digest("hex");
  try {
    for (const baseline of [true, false]) {
      const app = await startServer({ env: { ...env, CLIENT_DIRECTORY_BASELINE: baseline ? "1" : "0" } });
      try {
        const admin = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
        const read = async (route, cookie = admin) => {
          const response = await fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie } });
          return { status: response.status, body: await response.text(), location: response.headers.get("location") };
        };
        const compare = (label, result) => {
          const summary = { status: result.status, hash: hash(result.body), location: result.location };
          if (baseline) expected.set(label, summary);
          else assert.deepEqual(summary, expected.get(label), label);
        };
        let route = "/admin/clients", page = 0;
        do {
          const result = await read(route);
          assert.equal(result.status, 200);
          compare(`clients-page-${page}`, result);
          const keys = [...result.body.matchAll(/data-admin-list-key="([^"]+)"/g)].map(match => match[1]);
          if (!baseline) actualKeys.push(...keys);
          const next = result.body.match(/href="([^"]+)"[^>]*data-admin-list-next/)
            || result.body.match(/data-admin-list-next[^>]*href="([^"]+)"/);
          route = next ? next[1].replaceAll("&amp;", "&") : "";
          if (route) {
            const url = new URL(route, app.baseUrl); url.searchParams.set("fragment", "list");
            route = url.pathname + url.search;
          }
          assert(++page <= 10);
        } while (route);
        assert(page > 1, "Continuation must actually be exercised");
        for (const route of ["/admin/clients?q=Test", "/admin/clients?serviceSegment=nonregular",
          "/admin/clients?client=6300000000", "/admin/clients?client=6300000153", "/admin/orders", "/admin/payroll"]) {
          const result = await read(route);
          assert.equal(result.status, 200, route); compare(route, result);
        }
        for (const userId of ["manager", "eva", "user-a"]) {
          const cookie = "shynli_user_session=" + createUserSessionToken({ masterSecret: env.ADMIN_MASTER_SECRET }, { userId });
          const result = await read("/admin/clients", cookie);
          compare(`role-${userId}`, result);
          if (userId !== "user-a") assert.equal(result.status, 200);
          else assert.notEqual(result.status, 200, "Cleaner cannot open the admin client directory");
        }
        compare("anonymous", await read("/admin/clients", ""));
      } finally { await stopServer(app.child); }
    }
    assert(actualKeys.length > 150);
    assert.equal(new Set(actualKeys).size, actualKeys.length, "No client is repeated during continuation");
    t.diagnostic(JSON.stringify({ comparedResponses: expected.size, clientsTraversed: actualKeys.length,
      htmlUnchanged: true, managerViewerAndCleanerPermissionsUnchanged: true, productionAccess: false }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
