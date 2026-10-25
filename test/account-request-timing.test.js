"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createAccountRequestTiming, getAccountTimingHeaders } = require("../lib/account/request-timing");
const { createTimingHelpers } = require("../lib/http/timing");
const { startServer, stopServer } = require("./server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

test("account diagnostics are response-scoped, monotonic, bounded and contain only allowlisted metadata", async () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  const logs = [];
  let clock = 10;
  const timing = createAccountRequestTiming({ res, enabled: true, logger: { log: row => logs.push(row) }, now: () => clock });
  assert.deepEqual(getAccountTimingHeaders(res), {}, "unapproved responses expose no diagnostics");
  assert.equal(await timing.measure("auth", async () => { clock += 4; return "value"; }), "value");
  timing.activate();
  timing.activate();
  timing.setView("month_grid");
  timing.setView("secret@example.test");
  timing.setCache("hit");
  timing.setCache("customer address");
  timing.measure("private-key", () => { clock += 1; });
  timing.measure("render", () => { clock += 3; });
  const headers = getAccountTimingHeaders(res);
  assert.match(headers["X-Shynli-Request-Id"], /^[a-f\d-]{36}$/);
  assert.equal(headers["Server-Timing"], "acct_auth;dur=4.00, acct_render;dur=3.00");
  res.emit("finish");
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0].phases_ms, { auth: 4, render: 3 });
  assert.equal(logs[0].view, "month_grid");
  assert.equal(logs[0].snapshot_cache, "hit");
  assert.equal(logs[0].elapsed_ms, 8);
  assert.equal(logs[0].request_id, headers["X-Shynli-Request-Id"]);
  assert.doesNotMatch(JSON.stringify(logs), /secret@|private-key|customer address/);
  const other = {};
  const disabled = createAccountRequestTiming({ res: other });
  disabled.activate();
  disabled.measure("render", () => 1);
  assert.deepEqual(getAccountTimingHeaders(other), {});
  assert.notEqual(createId(), headers["X-Shynli-Request-Id"]);
  function createId() {
    const r = {};
    createAccountRequestTiming({ res: r, enabled: true }).activate();
    return getAccountTimingHeaders(r)["X-Shynli-Request-Id"];
  }
});

test("diagnostics preserve sync/async errors and cannot break responses when logging fails", async () => {
  const res = new EventEmitter();
  let clock = 0;
  const rows = [];
  const timing = createAccountRequestTiming({ res, enabled: true, now: () => clock, logger: { log: row => rows.push(row) } });
  timing.activate();
  const error = new Error("private client data");
  assert.throws(() => timing.measure("render", () => { clock += 2; throw error; }), e => e === error);
  await assert.rejects(timing.measure("orders", async () => { clock += 5; throw error; }), e => e === error);
  res.emit("finish");
  assert.equal(rows[0].outcome, "error");
  assert.deepEqual(rows[0].phases_ms, { render: 2, orders: 5 });
  assert.doesNotMatch(JSON.stringify(rows), /private client data/);
  const broken = new EventEmitter();
  createAccountRequestTiming({ res: broken, enabled: true, logger: { log() { throw error; } } }).activate();
  assert.doesNotThrow(() => broken.emit("finish"));
});

test("timing helper preserves public headers and appends private request metrics without changing the body", () => {
  const helper = createTimingHelpers({ getRequestDurationMs: () => 12.34, baseSecurityHeaders: { "X-Content-Type-Options": "nosniff" } });
  const response = () => ({ writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } });
  const plain = response();
  helper.writeHtmlWithTiming(plain, 200, "unchanged", 0, false);
  assert.equal(plain.headers["Server-Timing"], "app;dur=12.34, cache;desc=\"miss\"");
  assert.equal(plain.headers["X-Shynli-Request-Id"], undefined);
  const account = response();
  let clock = 0;
  const timing = createAccountRequestTiming({ res: account, enabled: true, now: () => clock });
  timing.activate();
  timing.measure("auth", () => { clock = 3; });
  helper.writeHtmlWithTiming(account, 200, "unchanged", 0, false);
  assert.equal(account.body, plain.body);
  assert.equal(account.headers["Server-Timing"], plain.headers["Server-Timing"] + ", acct_auth;dur=3.00");
  for (const name of ["Content-Type", "Cache-Control", "X-Robots-Tag", "X-Content-Type-Options"]) assert.equal(account.headers[name], plain.headers[name]);
});

test("real HTTP diagnostics distinguish views and cache hits without extra database requests or business writes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-account-timing-"));
  const control = path.join(root, "control.json");
  const capture = path.join(root, "calls.ndjson");
  await fs.writeFile(control, JSON.stringify({ calendarBatch: true }));
  await fs.writeFile(capture, "");
  const env = { ADMIN_MASTER_SECRET: "isolated-account-timing", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CAPTURE: capture, ACCOUNT_SECTION_CONTROL: control,
    SHYNLI_FETCH_STUB_ENTRY: path.join(__dirname, "support/account-section-fixture.cjs") };
  let app;
  let output = "";
  try {
    app = await startServer({ env });
    app.child.stdout.on("data", chunk => { output += chunk.toString("utf8"); });
    const token = createUserSessionToken(loadUserAuthConfig(env), { userId: "user-a", staffId: "a", email: "a@example.test" });
    const requests = [];
    async function get(query, authenticated = true) {
      const response = await fetch(app.baseUrl + "/account" + query, { redirect: "manual", headers: authenticated ? { cookie: `shynli_user_session=${token}` } : {} });
      const body = await response.text();
      requests.push({ response, body });
      return response;
    }
    const query = "?section=calendar&view=month&date=2099-01-01&calendarCompact=1";
    const grid = await get(query);
    assert.equal(grid.status, 200);
    assert.match(grid.headers.get("server-timing"), /acct_auth;dur=.*acct_staff;dur=.*acct_orders;dur=.*acct_selection;dur=.*acct_context;dur=.*acct_render;dur=/);
    const repeated = await get(query + "&tab=1");
    assert.match(repeated.headers.get("server-timing"), /acct_snapshot_wait;dur=/);
    assert.doesNotMatch(repeated.headers.get("server-timing"), /acct_staff;|acct_orders;/);
    for (const suffix of ["&showDay=1", "&fragment=calendar-orders", "&calendarFull=1"]) assert.equal((await get(query + suffix)).status, 200);
    assert.equal((await get("?history=all")).status, 200);
    assert.equal((await get("?section=payroll")).status, 200);
    assert.equal((await get("?fragment=order-detail&order=order-00253")).status, 200);
    assert.equal((await get("?fragment=order-detail&order=other-order")).status, 404);
    const anonymous = await get(query, false);
    assert.equal(anonymous.status, 303);
    assert.equal(anonymous.headers.get("X-Shynli-Request-Id"), null);
    const publicResponse = await fetch(app.baseUrl + "/");
    await publicResponse.text();
    assert.equal(publicResponse.headers.get("X-Shynli-Request-Id"), null);
    const calls = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.ok(calls.filter(row => row.type === "read").every(row => row.method === "GET" || (row.method === "POST" && row.table === "read_account_calendar_entries")));
    const ids = requests.filter(row => row.response.status !== 303).map(row => row.response.headers.get("X-Shynli-Request-Id"));
    assert.ok(ids.every(Boolean));
    assert.equal(new Set(ids).size, ids.length);
    await stopServer(app.child);
    const records = output.split("\n").flatMap(line => {
      try { const row = JSON.parse(line); return row.type === "account_request_timing" ? [row] : []; }
      catch { return []; }
    });
    assert.equal(records.length, ids.length);
    assert.deepEqual(records.map(row => row.request_id), ids);
    assert.deepEqual(records.map(row => row.view), ["month_grid", "month_grid", "day", "month_full", "month_full", "history", "payroll", "order_detail", "order_detail"]);
    assert.equal(records[0].snapshot_cache, "bypass");
    assert.equal(records[1].snapshot_cache, "hit");
    assert.equal(records.at(-1).outcome, "error");
    assert.ok(records.every(row => Object.keys(row).sort().join(",") === "elapsed_ms,outcome,phases_ms,request_id,snapshot_cache,status,ts,type,view"));
    assert.doesNotMatch(JSON.stringify(records), /user-a|staffId|order-00253|other-order|example\.test|cookie|secret|Test Client/);
  } finally {
    if (app) await stopServer(app.child);
    await fs.rm(root, { recursive: true, force: true });
  }
});
