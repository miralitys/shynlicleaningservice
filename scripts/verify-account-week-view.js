"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { parse, serializeOuter } = require("parse5");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

const hash = value => createHash("sha256").update(value).digest("hex");
function cards(html) {
  const found = new Map();
  function walk(node) {
    if (node.attrs?.some(a => a.name === "data-account-mobile-order-card")) {
      found.set(node.attrs.find(a => a.name === "data-account-entry-id").value, serializeOuter(node));
    }
    (node.childNodes || []).forEach(walk);
  }
  walk(parse(html));
  return found;
}

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-week-view-"));
  const baseline = process.env.ACCOUNT_WEEK_BASELINE_REF || "e2072425";
  const expected = new Map();
  const results = [];
  const env = { ADMIN_MASTER_SECRET: "isolated-week-view", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CAPTURE: path.join(root, "reads.ndjson"),
    ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-section-fixture.cjs") };
  const token = createUserSessionToken(loadUserAuthConfig(env), { userId: "user-a", staffId: "a", email: "a@example.test" });
  try {
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify({ calendarBatch: true }));
    for (const label of ["baseline", "candidate"]) {
      await fs.writeFile(env.ACCOUNT_SECTION_CAPTURE, "");
      const app = await startServer({ env: { ...env, ACCOUNT_BASELINE_REF: label === "baseline" ? baseline : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/account-baseline-loader.cjs")] });
      try {
        async function get(query) {
          const response = await fetch(app.baseUrl + "/account" + query, { headers: { cookie: `shynli_user_session=${token}` } });
          const body = await response.text();
          assert.equal(response.status, 200);
          return { body, snapshot: { status: response.status, hash: hash(body),
            headers: Object.fromEntries(["content-type", "cache-control", "x-robots-tag"].map(key => [key, response.headers.get(key)])) } };
        }
        const controls = ["?section=calendar&view=month&date=2099-01-01&calendarCompact=1",
          "?section=calendar&view=month&date=2099-01-01&calendarFull=1",
          "?section=calendar&date=2099-01-01", "?section=calendar&view=month&date=2099-01-01&showDay=1&calendarCompact=1",
          "?section=calendar&view=month&date=2099-01-01&fragment=calendar-orders",
          "?section=payroll", "?fragment=order-detail&order=order-00253"];
        for (const query of controls) {
          const { snapshot } = await get(query);
          if (label === "baseline") expected.set(query, snapshot);
          else assert.deepEqual(snapshot, expected.get(query), `Unrelated screen changed: ${query}`);
        }
        const initial = await get("");
        if (label === "candidate") {
          assert.equal(cards(initial.body).size, 0, "2099 fixture jobs are outside the current seven-day window");
          assert.match(initial.body, /Все заказы и история/);
        }
        const all = new Map();
        for (const page of [1, 2]) for (const [id, html] of cards((await get(`?history=all&page=${page}`)).body)) all.set(id, html);
        assert.equal(all.size, 254);
        const cardHash = hash(JSON.stringify([...all].sort(([a], [b]) => a.localeCompare(b))));
        if (label === "baseline") expected.set("cards", cardHash);
        else assert.equal(cardHash, expected.get("cards"), "An order card, amount, team or earnings value changed");
        const calls = (await fs.readFile(env.ACCOUNT_SECTION_CAPTURE, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
        assert.ok(calls.every(row => row.method === "GET" || row.method === "POST" && row.table === "read_account_calendar_entries"));
        results.push({ label, unchangedControls: controls.length, allOrders: all.size, cardHash, reads: calls.length, businessWrites: 0 });
      } finally { await stopServer(app.child); }
    }
    assert.equal(results[0].reads, results[1].reads);
    console.log(JSON.stringify({ baseline, noProductionAccess: true, fixture: "254 synthetic orders, 163 completed, two staff, fixed and saved payouts", results }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
