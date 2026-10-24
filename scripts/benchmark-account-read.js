"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-bench-"));
  const capture = path.join(root, "calls.ndjson");
  await fs.writeFile(capture, "");
  const baseEnv = { ADMIN_MASTER_SECRET: "isolated-account-read", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "", CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999",
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-read-fixture.cjs"),
    ACCOUNT_BENCH_CAPTURE: capture, ACCOUNT_BENCH_COUNT: "254", ACCOUNT_BENCH_COMPLETED: "163" };
  try {
    const results = {};
    for (const label of ["before", "after"]) {
      const app = await startServer({ env: { ...baseEnv, ACCOUNT_BASELINE_REF: label === "before" ? "68bd6601" : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/account-baseline-loader.cjs")] });
      try {
        const token = createUserSessionToken(loadUserAuthConfig(baseEnv), { userId: "user-a", staffId: "a", email: "a@example.test" });
        const samples = [];
        for (let i = 0; i < 4; i++) {
          const priorCalls = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).length;
          const start = performance.now();
          const response = await fetch(app.baseUrl + "/account", { headers: { cookie: `shynli_user_session=${token}` } });
          const headersMs = performance.now() - start;
          const html = await response.text();
          if (response.status !== 200) throw new Error(`Benchmark failed: ${response.status} ${html.slice(0, 120)}`);
          const calls = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).slice(priorCalls).map(JSON.parse);
          samples.push({ headersMs: +headersMs.toFixed(1), htmlBytes: Buffer.byteLength(html), reads: calls.length,
            dataBytes: calls.reduce((sum, call) => sum + call.bytes, 0),
            hiddenDetails: (html.match(/<section\b[^>]*data-account-mobile-detail-view/g) || []).length });
        }
        results[label] = samples;
      } finally { await stopServer(app.child); }
    }
    console.log(JSON.stringify({ fixture: "254 synthetic orders, 91 active, 163 completed; no real network latency or production data", results }, null, 2));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
