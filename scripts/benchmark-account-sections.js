"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { parse, serialize, serializeOuter } = require("parse5");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
};
const round = value => Number(value.toFixed(2));
const hash = value => createHash("sha256").update(value).digest("hex");
const queries = {
  month: "?section=calendar&view=month&date=2099-01-01",
  day: "?section=calendar&date=2099-01-01",
  payroll: "?section=payroll",
};
async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-section-bench-"));
  const capture = path.join(root, "reads.ndjson");
  const control = path.join(root, "control.json");
  const results = [];
  const outputHashes = new Map();
  const samples = Number(process.env.ACCOUNT_SECTION_SAMPLES) || 20;
  const labels = (process.env.ACCOUNT_SECTION_LABELS || "before,after").split(",");
  const baseline = process.env.ACCOUNT_SECTION_BASELINE_REF || "5de94cb7";
  const afterRef = process.env.ACCOUNT_SECTION_AFTER_REF || "";
  const missingTables = process.env.ACCOUNT_SECTION_DEDICATED !== "1";
  const compactComparison = process.env.ACCOUNT_SECTION_COMPACT === "1";
  if (compactComparison) {
    queries.monthFull = queries.month + "&calendarFull=1";
    queries.month += "&calendarCompact=1";
  }
  const baseEnv = { ADMIN_MASTER_SECRET: "isolated-section-read", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CAPTURE: capture, ACCOUNT_SECTION_CONTROL: control,
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-section-fixture.cjs") };
  try {
    for (const delayMs of [0, 80]) for (const label of labels) {
      await fs.writeFile(capture, "");
      await fs.writeFile(control, JSON.stringify({ delayMs,
        usersPrimaryError: process.env.ACCOUNT_SECTION_USERS_FALLBACK === "1"
          ? { status: 404, body: { code: "PGRST205", message: "Could not find the table admin_users" } } : null,
        primaryError: missingTables ? { status: 404, body: { code: "PGRST205", message: "Could not find the table admin_staff_assignments" } } : null }));
      const app = await startServer({ env: { ...baseEnv, ACCOUNT_BASELINE_REF: label === "before" ? baseline : afterRef },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/account-baseline-loader.cjs"),
          "--require", path.resolve(__dirname, "../test/support/account-section-profiler.cjs")] });
      try {
        const token = createUserSessionToken(loadUserAuthConfig(baseEnv), { userId: "user-a", staffId: "a", email: "a@example.test" });
        const get = async (screen, query, cache) => {
          await fs.writeFile(capture, "");
          const start = performance.now();
          const response = await fetch(app.baseUrl + "/account" + query, { headers: { cookie: `shynli_user_session=${token}` } });
          const headersMs = performance.now() - start;
          const html = await response.text();
          assert.equal(response.status, 200, html.slice(0, 200));
          const records = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
          const reads = records.filter(row => row.type === "read");
          assert.ok(reads.every(row => row.method === "GET"));
          // Relative links and current time do not vary for these fixed-date fixtures.
          let comparable = html;
          if (compactComparison) {
            const document = parse(html);
            // The only intentional mobile navigation difference is the explicit compact opt-in.
            const normalizeLinks = node => {
              const href = node.tagName === "a" && node.attrs?.find(attr => attr.name === "href");
              if (href && href.value.startsWith("/account?")) {
                const url = new URL(href.value, "http://localhost");
                if (url.searchParams.has("calendarCompact")) {
                  url.searchParams.delete("calendarCompact");
                  href.value = url.pathname + url.search;
                }
              }
              (node.childNodes || []).forEach(normalizeLinks);
            };
            normalizeLinks(document);
            const find = node => node.attrs?.some(attr => attr.name === "data-account-mobile-calendar")
              ? node : (node.childNodes || []).map(find).find(Boolean);
            comparable = screen === "month" ? serializeOuter(find(document)) : serialize(document);
          }
          const digest = hash(comparable);
          const key = screen + query;
          if (!outputHashes.has(key)) outputHashes.set(key, digest);
          else assert.equal(digest, outputHashes.get(key), `HTML changed for ${key}`);
          const phase = name => {
            const items = records.filter(row => row.phase === name);
            return items.length ? round(name === "render" || name === "planning"
              ? items.reduce((sum, row) => sum + row.end - row.start, 0)
              : Math.max(...items.map(row => row.end)) - Math.min(...items.map(row => row.start))) : 0;
          };
          return { screen, cache, headersMs: round(headersMs), appMs: Number(response.headers.get("server-timing").match(/app;dur=([\d.]+)/)[1]),
            htmlBytes: Buffer.byteLength(html), htmlHash: hash(html), comparisonHash: digest, reads: reads.length,
            readBytes: reads.reduce((sum, row) => sum + row.bytes, 0),
            missingTableReads: reads.filter(row => row.status === 404).length,
            authMs: phase("auth"), staffMs: phase("staff"), ordersMs: phase("orders"),
            planningMs: phase("planning"), renderMs: phase("render") };
        };
        const first = await get("month", queries.month, "process-cold");
        const rows = [];
        for (let i = 0; i < samples; i++) for (const screen of Object.keys(queries)) {
          rows.push(await get(screen, queries[screen], "snapshot-bypass"));
        }
        // Exercise real tab navigation with the same 8-second cache policy in both versions.
        const tabs = [];
        for (let i = 0; i < 3; i++) for (const screen of Object.keys(queries)) {
          tabs.push(await get(screen, queries[screen] + "&tab=1", "tab-eligible"));
        }
        const summary = {};
        for (const screen of Object.keys(queries)) {
          const selected = rows.filter(row => row.screen === screen);
          summary[screen] = Object.fromEntries(["appMs", "headersMs", "authMs", "staffMs", "ordersMs", "planningMs", "renderMs", "reads", "readBytes", "missingTableReads"]
            .map(key => [key, round(median(selected.map(row => row[key])))]));
        }
        results.push({ label, simulatedRoundTripMs: delayMs, first, summary, rows, tabs });
      } finally { await stopServer(app.child); }
    }
    console.log(JSON.stringify({ fixture: "254 synthetic orders, 163 completed, both team members, fixed overrides and saved payouts",
      baseline, after: afterRef || "working tree", missingTables, compactComparison, samplesPerScreen: samples, noProductionAccess: true,
      notes: "Local HTTP server, no browser paint or mobile network measurement. 80 ms is an injected delay per fake database request, not observed Supabase latency. All requests GET. Compact mode normalizes only the new calendarCompact parameter in account links and compares the monthly mobile section, otherwise full HTML. Raw HTML hashes and bytes are retained.", results }, null, 2));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
