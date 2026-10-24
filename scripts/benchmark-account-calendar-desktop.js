"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { parse, serializeOuter } = require("parse5");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

const round = value => Number(value.toFixed(2));
const hash = value => createHash("sha256").update(value).digest("hex");
const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2);
};
function find(node, predicate) {
  return predicate(node) ? node : (node.childNodes || []).map(child => find(child, predicate)).find(Boolean);
}

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-desktop-calendar-"));
  const capture = path.join(root, "reads.ndjson");
  const control = path.join(root, "control.json");
  const baseline = process.env.ACCOUNT_SECTION_BASELINE_REF || "e7568d44";
  const samples = Number(process.env.ACCOUNT_SECTION_SAMPLES) || 10;
  const env = { ADMIN_MASTER_SECRET: "isolated-calendar-read", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CAPTURE: capture, ACCOUNT_SECTION_CONTROL: control,
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-section-fixture.cjs") };
  const month = "/account?section=calendar&view=month&date=2099-01-01";
  const scenarios = [{ databaseDelayMs: 0, networkRoundTripMs: 0 }, { databaseDelayMs: 80, networkRoundTripMs: 120 }];
  const results = [];
  let expectedTableHash;
  try {
    for (const scenario of scenarios) for (const label of ["before", "after"]) {
      await fs.writeFile(capture, "");
      await fs.writeFile(control, JSON.stringify({ delayMs: scenario.databaseDelayMs,
        primaryError: { status: 404, body: { code: "PGRST205", message: "Could not find the table admin_staff_assignments" } } }));
      const app = await startServer({ env: { ...env, ACCOUNT_BASELINE_REF: label === "before" ? baseline : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/account-baseline-loader.cjs")] });
      try {
        const token = createUserSessionToken(loadUserAuthConfig(env), { userId: "user-a", staffId: "a", email: "a@example.test" });
        const get = async url => {
          // Model one client/server round trip for every serial HTTP request, not just the first response.
          if (scenario.networkRoundTripMs) await new Promise(resolve => setTimeout(resolve, scenario.networkRoundTripMs));
          const response = await fetch(app.baseUrl + url, { headers: { cookie: `shynli_user_session=${token}` } });
          const html = await response.text();
          assert.equal(response.status, 200, html.slice(0, 200));
          return html;
        };
        async function measure(query) {
          await fs.writeFile(capture, "");
          const start = performance.now();
          const initialHtml = await get(query);
          const initialMs = performance.now() - start;
          const initial = parse(initialHtml);
          const source = find(initial, node => node.attrs?.some(attr => attr.name === "data-account-calendar-orders-source"));
          const tableHtml = source ? await get(source.attrs.find(attr => attr.name === "data-account-calendar-orders-source").value) : initialHtml;
          const completeMs = performance.now() - start;
          const table = find(parse(tableHtml), node => node.tagName === "table");
          assert.ok(table, "the complete desktop table must be available");
          const tableHash = hash(serializeOuter(table));
          if (!expectedTableHash) expectedTableHash = tableHash;
          assert.equal(tableHash, expectedTableHash, "all original rows, teams, amounts, payouts and actions must match");
          const reads = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse).filter(row => row.type === "read");
          assert.ok(reads.every(row => row.method === "GET"));
          return { initialMs: round(initialMs), completeMs: round(completeMs), httpRequests: source ? 2 : 1,
            databaseReads: reads.length, bytes: Buffer.byteLength(initialHtml) + (source ? Buffer.byteLength(tableHtml) : 0), tableHash };
        }
        const first = await measure(month);
        const rows = [];
        for (let i = 0; i < samples; i++) rows.push(await measure(month));
        const compactResize = label === "after" ? await measure(month + "&calendarCompact=1") : null;
        results.push({ label, ...scenario, first, summary: Object.fromEntries(
          ["initialMs", "completeMs", "httpRequests", "databaseReads", "bytes"].map(key => [key, median(rows.map(row => row[key]))])),
          rows, compactResize });
      } finally { await stopServer(app.child); }
    }
    console.log(JSON.stringify({ baseline, after: "working tree", samples, noProductionAccess: true,
      notes: "Local HTTP completion through the complete desktop table body, including serial fragment requests. Not browser paint or live latency. Synthetic GET-only database; 80 ms per database request and 120 ms per HTTP round trip are injected delays. Compact resize is an explicit compact URL opened on desktop.",
      results }, null, 2));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
