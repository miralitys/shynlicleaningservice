"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

const cases = [
  ["month", "?section=calendar&view=month&date=2099-01-01&calendarCompact=1"],
  ["month-repeat", "?section=calendar&view=month&date=2099-01-01&calendarCompact=1&tab=1"],
  ["day", "?section=calendar&view=month&date=2099-01-01&calendarCompact=1&showDay=1"],
  ["month-full", "?section=calendar&view=month&date=2099-01-01&calendarFull=1"],
  ["month-fragment", "?section=calendar&view=month&date=2099-01-01&fragment=calendar-orders"],
  ["orders", "?page=1"], ["history-1", "?history=all&page=1"], ["history-2", "?history=all&page=2"],
  ["payroll", "?section=payroll"], ["detail", "?fragment=order-detail&order=order-00253"],
  ["focused", "?order=order-00000"], ["forbidden", "?fragment=order-detail&order=other-order"],
  ["missing", "?fragment=order-detail&order=missing"], ["invalid", "?fragment=order-detail"],
  ["anonymous", "?section=calendar", false],
];

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-timing-parity-"));
  const baseline = process.env.ACCOUNT_TIMING_BASELINE_REF || "ace35b34";
  const expected = new Map();
  const results = [];
  const env = { ADMIN_MASTER_SECRET: "isolated-timing-parity", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CAPTURE: path.join(root, "reads.ndjson"),
    ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-section-fixture.cjs") };
  const token = createUserSessionToken(loadUserAuthConfig(env), { userId: "user-a", staffId: "a", email: "a@example.test" });
  try {
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify({ calendarBatch: true }));
    for (const label of ["baseline", "candidate"]) {
      await fs.writeFile(env.ACCOUNT_SECTION_CAPTURE, "");
      let stdout = "";
      const app = await startServer({ env: { ...env, ACCOUNT_BASELINE_REF: label === "baseline" ? baseline : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/account-baseline-loader.cjs")] });
      app.child.stdout.on("data", chunk => { stdout += chunk.toString("utf8"); });
      const rows = [];
      const orderIds = new Set();
      try {
        for (const [screen, query, authenticated = true] of cases) {
          const response = await fetch(app.baseUrl + "/account" + query, { redirect: "manual",
            headers: authenticated ? { cookie: `shynli_user_session=${token}` } : {} });
          const body = await response.text();
          const snapshot = { status: response.status, bytes: Buffer.byteLength(body),
            hash: createHash("sha256").update(body).digest("hex"),
            headers: Object.fromEntries(["content-type", "cache-control", "x-robots-tag", "location"].map(key => [key, response.headers.get(key)])) };
          if (label === "baseline") expected.set(screen, snapshot);
          else assert.deepEqual(snapshot, expected.get(screen), `Business HTTP output changed: ${screen}`);
          if (screen.startsWith("history")) for (const match of body.matchAll(/<article\b[^>]*data-account-mobile-order-card[^>]*data-account-entry-id="([^"]+)"/g)) orderIds.add(match[1]);
          rows.push({ screen, ...snapshot, timing: response.headers.get("server-timing"), requestId: response.headers.get("x-shynli-request-id") });
        }
      } finally { await stopServer(app.child); }
      const reads = (await fs.readFile(env.ACCOUNT_SECTION_CAPTURE, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
      assert.ok(reads.every(row => row.method === "GET" || row.method === "POST" && row.table === "read_account_calendar_entries"));
      const logs = stdout.split("\n").flatMap(line => {
        try { const row = JSON.parse(line); return row.type === "account_request_timing" ? [row] : []; }
        catch { return []; }
      });
      const readShape = reads.map(({ method, table, bytes, status }) => ({ method, table, bytes, status }));
      if (label === "baseline") expected.set("readShape", readShape);
      else assert.deepEqual(readShape, expected.get("readShape"), "Instrumentation changed database reads");
      assert.equal(orderIds.size, 254, "All synthetic orders and history remain available");
      results.push({ label, rows, reads: reads.length, writes: 0, uniqueOrders: orderIds.size, logs });
    }
    const result = { baseline, candidate: "working tree, not deployed", noProductionAccess: true,
      fixture: "254 synthetic orders, 163 completed, two staff, saved payouts and fixed overrides; network writes forbidden",
      comparison: "Exact body/status/content/cache/robots/location equality on 15 account controls; identical database read sequence and bytes",
      results };
    if (process.env.ACCOUNT_TIMING_OUTPUT) await fs.writeFile(process.env.ACCOUNT_TIMING_OUTPUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ baseline, controls: cases.length, parity: true, results: results.map(({ label, reads, writes, uniqueOrders, logs }) => ({ label, reads, writes, uniqueOrders, diagnosticLogs: logs.length })) }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
