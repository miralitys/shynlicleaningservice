"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("../test/admin-route-helpers");

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-series-traffic-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-series-traffic", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_HEAVY_STAFF: "1",
    SERIES_TRAFFIC_CAPTURE: path.join(root, "reads.ndjson"),
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/series-traffic-fetch.cjs") };
  const report = { synthetic: true, productionAccess: false, baseline: process.env.ADMIN_READ_BASELINE_REF || "HEAD", results: [] };
  const expected = new Map();
  try {
    for (const variant of ["baseline", "candidate"]) {
      await fs.writeFile(env.SERIES_TRAFFIC_CAPTURE, "");
      const app = await startServer({ env: { ...env, ADMIN_READ_BASELINE_REF: variant === "baseline" ? report.baseline : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/admin-read-baseline-loader.cjs")] });
      try {
        const cookie = await createAdminSession(app.baseUrl, loadAdminConfig(env));
        let next = "";
        for (const initiator of ["orders", "show-more", "full-card"]) {
          const route = initiator === "orders" ? "/admin/orders?status=all" : initiator === "show-more" ? next
            : "/admin/orders?fragment=order-dialog&order=order-00253";
          assert.ok(route);
          for (let pass = 0; pass < 11; pass++) {
            await fs.writeFile(env.SERIES_TRAFFIC_CAPTURE, "");
            const start = performance.now();
            const response = await fetch(app.baseUrl + route, { headers: { cookie: `shynli_admin_session=${cookie}` }, redirect: "manual" });
            const html = await response.text();
            assert.equal(response.status, 200, `${initiator}: ${html.slice(0,100)}`);
            if (initiator === "orders") {
              next = [...html.matchAll(/data-admin-list-next="true" href="([^"]+)"/g)]
                .map(match => match[1].replaceAll("&amp;", "&")).find(href => href.includes("list=orders-table")) || "";
              if (next) next += "&fragment=list";
            }
            const hash = createHash("sha256").update(html).digest("hex");
            const key = `${initiator}:${pass}`;
            if (variant === "baseline") expected.set(key, hash); else assert.equal(hash, expected.get(key), `${initiator} HTML differs`);
            const calls = (await fs.readFile(env.SERIES_TRAFFIC_CAPTURE, "utf8")).split("\n").filter(Boolean).map(JSON.parse);
            assert.ok(calls.every(call => call.method === "GET"), "Benchmark must not write data");
            report.results.push({ variant, initiator, route, pass, ms: Number((performance.now()-start).toFixed(2)),
              htmlBytes: Buffer.byteLength(html), hash, calls, requests: calls.length,
              jsonBytes: calls.reduce((n,c) => n+c.bytes,0), gzipBytes: calls.reduce((n,c) => n+c.gzipBytes,0) });
          }
        }
      } finally { await stopServer(app.child); }
    }
    if (process.env.SERIES_TRAFFIC_REPORT) await fs.writeFile(process.env.SERIES_TRAFFIC_REPORT, JSON.stringify(report,null,2));
    for (const initiator of ["orders", "show-more", "full-card"]) {
      const row = report.results.find(r => r.variant === "candidate" && r.initiator === initiator && r.pass === 10);
      console.log(JSON.stringify({ initiator, requests: row.requests, jsonBytes: row.jsonBytes, gzipBytes: row.gzipBytes, identicalHtml: true }));
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
