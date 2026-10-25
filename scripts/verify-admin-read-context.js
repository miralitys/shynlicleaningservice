"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("../test/admin-route-helpers");

const hash = value => createHash("sha256").update(value).digest("hex");
const readCapture = async filename => (await fs.readFile(filename, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-admin-reads-"));
  const baseline = process.env.ADMIN_READ_BASELINE_REF || "c39d1bc0";
  const expected = new Map();
  const results = [];
  const repeats = Math.max(3, Math.min(20, Number(process.env.ADMIN_READ_REPEATS) || 3));
  const delayMs = Number(process.env.ADMIN_READ_DELAY_MS ?? 25);
  const env = { ADMIN_MASTER_SECRET: "isolated-admin-read-audit", PROFITABILITY_ENABLED: "1",
    SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake",
    GHL_API_KEY: "", GHL_LOCATION_ID: "", GOOGLE_CALENDAR_CLIENT_ID: "", GOOGLE_OAUTH_CLIENT_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CAPTURE: path.join(root, "reads.ndjson"),
    ACCOUNT_SECTION_ORDER_PADDING_BYTES: process.env.ADMIN_READ_HEAVY_BYTES || "0",
    ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-section-fixture.cjs") };
  const routes = process.env.ADMIN_READ_ROUTES ? JSON.parse(process.env.ADMIN_READ_ROUTES) : ["/admin", "/admin/orders", "/admin/orders?status=completed", "/admin/orders?q=Test+Client+253",
    "/admin/orders?fragment=order-dialog&order=order-00253", "/admin/clients", "/admin/payroll",
    "/admin/quote-ops?section=tasks", "/admin/quote-ops?section=archive", "/admin/settings?section=checklists",
    "/admin/settings?section=users", "/admin/staff?section=calendar&calendarStart=2099-01-01&calendarView=month",
    "/admin/profitability?status=all", "/admin/profitability?view=summary&status=all", "/admin/audit"];
  try {
    // Artificial network latency makes removed round trips measurable, not a live-site prediction.
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify({ delayMs, calendarBatch: true }));
    for (const label of ["baseline", "candidate"]) {
      await fs.writeFile(env.ACCOUNT_SECTION_CAPTURE, "");
      const app = await startServer({ env: { ...env, ADMIN_READ_BASELINE_REF: label === "baseline" ? baseline : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/admin-read-baseline-loader.cjs"),
          ...(process.env.ADMIN_READ_PROFILE === "1" ? ["--require", path.resolve(__dirname, "../test/support/admin-page-read-profiler.cjs")] : [])] });
      try {
        const cookie = await createAdminSession(app.baseUrl, loadAdminConfig(env));
        for (const route of routes) {
          for (let repeat = 0; repeat < repeats; repeat++) {
            await fs.writeFile(env.ACCOUNT_SECTION_CAPTURE, "");
            const started = performance.now();
            const response = await fetch(app.baseUrl + route, { redirect: "manual", headers: { cookie: `shynli_admin_session=${cookie}` } });
            const html = await response.text();
            const ms = Math.round(performance.now() - started);
            assert.equal(response.status, 200, `${label} ${route}: ${html.slice(0, 300)}`);
            const fingerprint = { hash: hash(html), status: response.status,
              headers: Object.fromEntries(["content-type", "cache-control", "x-robots-tag"].map(key => [key, response.headers.get(key)])) };
            const key = `${route}:${repeat}`;
            if (label === "baseline") expected.set(key, fingerprint);
            else assert.deepEqual(fingerprint, expected.get(key), `Visible or hidden page content changed: ${route}`);
            const captured = await readCapture(env.ACCOUNT_SECTION_CAPTURE);
            assert.ok(captured.every(row => ["read", "page_profile"].includes(row.type)), "Unexpected benchmark record");
            const calls = captured.filter(row => row.type === "read");
            assert.ok(calls.every(call => call.method === "GET"), "Audit must not write application data");
            const result = { label, route, repeat, ms, bytes: Buffer.byteLength(html), hash: fingerprint.hash,
              reads: calls.length, readBytes: calls.reduce((sum, call) => sum + call.bytes, 0),
              serverTiming: response.headers.get("server-timing"), profiles: captured.filter(row => row.type === "page_profile") };
            results.push(result);
            console.log(JSON.stringify(result));
          }
        }
      } finally { await stopServer(app.child); }
    }
    for (const route of routes) {
      const old = results.find(row => row.label === "baseline" && row.route === route && row.repeat === repeats - 1);
      const current = results.find(row => row.label === "candidate" && row.route === route && row.repeat === repeats - 1);
      assert.ok(current.reads <= old.reads, `Extra reads on ${route}`);
      if (process.env.ADMIN_READ_PROFILE === "1" && route.startsWith("/admin/orders") && !route.includes("fragment=")) {
        assert.equal(current.profiles[0].metrics.collectAdminOrderRecords.calls, 1, "Order summaries must be prepared once");
      }
    }
    const report = { baseline, noProductionAccess: true, businessWrites: 0, controls: routes.length,
      repeats, simulatedLatencyMs: delayMs, syntheticPaddingBytesPerOrder: Number(env.ACCOUNT_SECTION_ORDER_PADDING_BYTES), results };
    if (process.env.ADMIN_READ_REPORT_PATH) await fs.writeFile(process.env.ADMIN_READ_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log("ADMIN_READ_VERIFICATION " + JSON.stringify({ baseline, controls: routes.length, identicalHtml: true, businessWrites: 0 }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
