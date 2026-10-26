"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("../test/admin-route-helpers");
const { createUserSessionToken } = require("../lib/account-auth");

const hash = value => createHash("sha256").update(value).digest("hex");
const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
};
const p95 = values => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const snapshot = child => new Promise((resolve, reject) => {
  const id = Math.random().toString(36);
  const timeout = setTimeout(() => { child.off("message", receive); reject(new Error("Stand snapshot timeout")); }, 5000);
  function receive(message) {
    if (message.type !== "tasks-stand-snapshot" || message.id !== id) return;
    clearTimeout(timeout); child.off("message", receive); resolve(message);
  }
  child.on("message", receive); child.send({ type: "tasks-stand-snapshot", id });
});

async function main() {
  assert.ok(process.env.TASKS_PARALLEL_BASELINE && process.env.TASKS_PARALLEL_REPORT);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-tasks-paired-"));
  const capture = path.join(root, "reads.ndjson");
  const metrics = path.join(root, "metrics.ndjson");
  const env = { ADMIN_MASTER_SECRET: "synthetic-tasks-paired", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    ACCOUNT_SECTION_CAPTURE: capture, TASKS_PARALLEL_METRICS: metrics, ADMIN_LIST_FIXTURE_COUNT: "1107",
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/tasks-parallel-stand.cjs") };
  let control = { mode: "baseline", cap: 500, delayMs: 0 };
  const set = async updates => {
    control = { ...control, ...updates };
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify(control));
  };
  await set({});
  const report = { base: "94ca808724896e95127fc5f1903fc840ce7abe16", runtime: process.version,
    synthetic: true, externalTraffic: false, schedulingOnly: true, heapCapMiB: 256,
    sameProcess: true, samples: [], summary: [], parity: [], access: [] };
  let app;
  try {
    app = await startServer({ env, ipc: true, nodeArgs: ["--max-old-space-size=256", "--require",
      path.resolve(__dirname, "../test/support/tasks-parallel-loader.cjs")] });
    report.pid = app.child.pid;
    const owner = "shynli_admin_session=" + await createAdminSession(app.baseUrl, loadAdminConfig(env));
    async function read(route, cookie = owner) {
      const response = await fetch(app.baseUrl + route, { headers: { cookie }, redirect: "manual" });
      const html = await response.text();
      return { status: response.status, html, timing: response.headers.get("server-timing") };
    }
    const route = "/admin/quote-ops?section=tasks";
    assert.equal((await read(route)).status, 200);
    const before = await snapshot(app.child);
    report.before = before;
    let htmlHash;
    for (const delayMs of [0, 80]) {
      for (const mode of ["baseline", "candidate"]) {
        await set({ mode, delayMs });
        for (let i = 0; i < 3; i++) assert.equal((await read(route)).status, 200);
      }
      for (let pair = 0; pair < 10; pair++) {
        for (const mode of pair % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
          await set({ mode, delayMs });
          await fs.writeFile(capture, "");
          await fs.writeFile(metrics, "");
          const start = performance.now();
          const result = await read(route);
          const ms = performance.now() - start;
          assert.equal(result.status, 200);
          htmlHash ||= hash(result.html);
          assert.equal(hash(result.html), htmlHash);
          const reads = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
          const profile = JSON.parse((await fs.readFile(metrics, "utf8")).trim());
          assert.ok(reads.every(row => row.method === "GET"));
          const workspace = reads.filter(row => row.table === "admin_workspace_list_entries");
          const directory = reads.filter(row => ["admin_users", "admin_staff"].includes(row.table));
          assert.equal(directory.length, 2);
          const first = Math.min(...workspace.map(row => row.start));
          const last = Math.max(...workspace.map(row => row.end));
          const overlap = directory.every(row => row.start < last);
          assert.equal(overlap, mode === "candidate");
          const memory = (await snapshot(app.child)).memory;
          assert.ok(memory.rss < 512 * 1024 * 1024);
          report.samples.push({ mode, delayMs, pair, ms, bytes: Buffer.byteLength(result.html),
            timing: result.timing, profile, rssMiB: memory.rss / 1024 / 1024, workspaceMs: last - first,
            directoryStartsAfterWorkspace: directory.map(row => row.start - last), directoryOverlap: overlap,
            reads: reads.map(({ table, method, status, bytes, start, end }) => ({ table, method, status, bytes, start, end })) });
        }
      }
      for (const mode of ["baseline", "candidate"]) {
        const samples = report.samples.filter(row => row.mode === mode && row.delayMs === delayMs);
        report.summary.push({ mode, delayMs, count: samples.length, medianMs: median(samples.map(row => row.ms)),
          p95Ms: p95(samples.map(row => row.ms)), peakRssMiB: Math.max(...samples.map(row => row.rssMiB)),
          bytes: samples[0].bytes, requests: samples[0].reads.length,
          medianProcessCpuMs: median(samples.map(row => row.profile.processCpuMs)),
          maxProcessLoopMs: Math.max(...samples.map(row => row.profile.processLoopMaxMs)),
          readBytes: samples[0].reads.reduce((sum, row) => sum + row.bytes, 0) });
      }
    }
    await set({ delayMs: 0 });
    const routes = [route, "/admin/quote-ops?section=archive", "/admin/quote-ops?section=funnel&archive=1",
      "/admin/quote-ops?section=tasks&createTask=1", "/admin/quote-ops?section=tasks&q=manual-1106",
      "/admin/quote-ops?section=tasks&task=closed-task&taskEntry=order-01106",
      "/admin/quote-ops?fragment=entry-dialog&entry=order-01106",
      "/admin/quote-ops?fragment=entry-dialog&entry=order-01106&taskDialog=1&task=closed-task",
      "/admin/quote-ops?section=tasks&fragment=create-task-dialog", "/admin", "/admin/orders", "/admin/clients",
      "/admin/payroll", "/admin/staff?section=calendar&calendarStart=2099-01-01&calendarView=month",
      "/account?tab=earnings"];
    const { parse } = await import("parse5");
    const attr = (node, name) => node?.attrs?.find(a => a.name === name)?.value;
    const all = (node, predicate) => (predicate(node) ? [node] : []).concat(...(node.childNodes || []).map(n => all(n, predicate)));
    const find = (node, name) => all(node, n => attr(n, name) !== undefined)[0];
    async function walk(cookie) {
      const initial = await read(route, cookie);
      assert.equal(initial.status, 200);
      let list = find(parse(initial.html), "data-admin-list-id");
      const total = Number(attr(list, "data-admin-list-total"));
      const keys = [];
      const hashes = [];
      while (list) {
        keys.push(...all(find(list, "data-admin-list-rows"), n => attr(n, "data-admin-list-key")).map(n => attr(n, "data-admin-list-key")));
        const next = find(list, "data-admin-list-next");
        if (!next) break;
        const url = new URL(attr(next, "href"), app.baseUrl); url.searchParams.set("fragment", "list");
        const chunk = await read(url.pathname + url.search, cookie);
        assert.equal(chunk.status, 200); hashes.push(hash(chunk.html));
        list = find(parse(chunk.html), "data-admin-list-response");
        assert.ok(list && !find(list, "data-admin-list-error"));
      }
      assert.equal(keys.length, total);
      assert.equal(new Set(keys).size, total);
      return { keys, hashes, total, initialHash: hash(initial.html) };
    }
    for (const id of ["owner", "manager", "eva", "user-a"]) {
      const cookie = id === "owner" ? owner : "shynli_user_session=" + createUserSessionToken({ masterSecret: env.ADMIN_MASTER_SECRET }, { userId: id });
      await set({ mode: "baseline" });
      const old = await read(route, cookie);
      await set({ mode: "candidate" });
      const next = await read(route, cookie);
      assert.equal(next.status, old.status); assert.equal(hash(next.html), hash(old.html));
      report.access.push({ id, status: next.status, identical: true });
      if (id === "owner" || id === "eva") {
        await set({ mode: "baseline" }); const oldList = await walk(cookie);
        await set({ mode: "candidate" }); const newList = await walk(cookie);
        assert.deepEqual(newList, oldList);
        report.parity.push({ user: id, fullTaskList: true, total: newList.total, identical: true });
      }
    }
    for (const url of routes) {
      const cookie = url.startsWith("/account") ? "shynli_user_session=" + createUserSessionToken({ masterSecret: env.ADMIN_MASTER_SECRET }, { userId: "user-a" }) : owner;
      await set({ mode: "baseline" }); const old = await read(url, cookie);
      await set({ mode: "candidate" }); const next = await read(url, cookie);
      assert.equal(next.status, old.status); assert.equal(hash(next.html), hash(old.html), url);
      report.parity.push({ route: url, status: next.status, identicalHtml: true });
    }
    for (const mode of ["baseline", "candidate"]) {
      await set({ mode, delayMs: 80 });
      const parallel = await Promise.all(Array.from({ length: 3 }, () => read(route)));
      for (const response of parallel) { assert.equal(response.status, 200); assert.equal(hash(response.html), htmlHash); }
      const memory = (await snapshot(app.child)).memory;
      assert.ok(memory.rss < 512 * 1024 * 1024);
      report.parity.push({ concurrency: 3, mode, identicalHtml: true, rssMiB: memory.rss / 1024 / 1024 });
    }
    report.after = await snapshot(app.child);
    assert.equal(report.after.currentHash, report.before.initialHash);
    report.sourceUnchanged = true;
    await fs.writeFile(process.env.TASKS_PARALLEL_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ summary: report.summary, parity: report.parity, access: report.access,
      sourceUnchanged: report.sourceUnchanged, rows: report.after.rows, tasks: report.after.tasks }, null, 2));
  } finally {
    if (app) await stopServer(app.child);
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
