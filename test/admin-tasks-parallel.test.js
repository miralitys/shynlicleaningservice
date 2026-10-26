"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createQuoteOpsPageRenderer } = require("../lib/admin/pages/quote-ops-page");
const { startServer, stopServer } = require("./server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { createUserSessionToken } = require("../lib/account-auth");

test("early manager context starts immediately, stays request-local and settles failures", async () => {
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const renderer = createQuoteOpsPageRenderer({ collectQuoteOpsManagerOptions: () => { calls++; return pending; } });
  const context = renderer.prepareManagerContext({}, null);
  assert.equal(calls, 1);
  const managers = [{ id: "manager", name: "Manager" }];
  release(managers);
  assert.deepEqual(await context, { value: managers });
  await renderer.prepareManagerContext({}, null);
  assert.equal(calls, 2);
  for (const failure of [new Error("Unavailable"), null]) {
    const failing = createQuoteOpsPageRenderer({ collectQuoteOpsManagerOptions: async () => { throw failure; } });
    const settled = await failing.prepareManagerContext({}, null);
    assert.ok(Object.hasOwn(settled, "error"));
    assert.equal(settled.error, failure);
  }
});

test("a rejected early context is rethrown rather than replaced by an empty manager list", async () => {
  const failure = new Error("Directory failed");
  let reads = 0;
  const renderer = createQuoteOpsPageRenderer({
    getQuoteOpsFilters: () => ({ reqUrl: new URL("http://test.invalid/?section=tasks"), filters: { section: "tasks" } }),
    getWorkspaceAccessContext: () => ({ canEdit: true }), normalizeString: value => String(value || ""),
    filterQuoteOpsEntries: entries => entries,
    collectQuoteOpsManagerOptions: async () => { reads++; throw failure; },
  });
  const context = renderer.prepareManagerContext({}, null);
  await assert.rejects(renderer({ url: "/?section=tasks" }, {}, null, { quoteOpsPageEntries: [] }, null, context), error => error === failure);
  assert.equal(reads, 1);
});

test("tasks overlap directory reads without changing permissions or hiding read failures", { timeout: 60000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-tasks-parallel-"));
  const capture = path.join(root, "reads.ndjson");
  const config = { mode: "candidate", cap: 500, delayMs: 35 };
  const env = { ADMIN_MASTER_SECRET: "synthetic-tasks-parallel", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    ACCOUNT_SECTION_CAPTURE: capture, ADMIN_LIST_FIXTURE_COUNT: "25",
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "support/tasks-parallel-stand.cjs") };
  await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify(config));
  const app = await startServer({ env });
  try {
    const owner = "shynli_admin_session=" + await createAdminSession(app.baseUrl, loadAdminConfig(env));
    const route = "/admin/quote-ops?section=tasks";
    const read = (url, cookie = owner) => fetch(app.baseUrl + url, { headers: { cookie }, redirect: "manual" });
    await fs.writeFile(capture, "");
    const response = await read(route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Call test client 24/);
    const reads = (await fs.readFile(capture, "utf8")).trim().split("\n").map(JSON.parse);
    const workspace = reads.find(row => row.table === "admin_workspace_list_entries");
    for (const table of ["admin_users", "admin_staff"]) {
      const directory = reads.filter(row => row.table === table);
      assert.equal(directory.length, 1, table);
      assert.ok(directory[0].start < workspace.end, `${table} must start before workspace finishes`);
    }
    assert.ok(reads.every(row => row.method === "GET"));
    const second = await read(route);
    assert.equal(await second.text(), html);
    for (const id of ["manager", "eva", "user-a"]) {
      const cookie = "shynli_user_session=" + createUserSessionToken({ masterSecret: env.ADMIN_MASTER_SECRET }, { userId: id });
      const result = await read(route, cookie);
      if (id === "user-a") assert.notEqual(result.status, 200);
      else {
        assert.equal(result.status, 200);
        const body = await result.text();
        assert.match(body, /Call test client 24/);
        if (id === "eva") assert.match(body, /Previous followup 24/);
      }
    }
    for (const failed of ["failUsers", "failStaff", "failWorkspace"]) {
      await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify({ ...config, [failed]: true }));
      const result = await read(route);
      // Existing directory stores retain their last successful snapshot on API failure.
      // Scheduling must not change that established behavior or mask ledger failures.
      if (failed === "failWorkspace") {
        assert.ok(result.status >= 500, failed);
        assert.doesNotMatch(await result.text(), /Для текущего фильтра открытых тасков нет/);
      } else {
        assert.equal(result.status, 200, failed);
        assert.equal(await result.text(), html);
      }
      await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, JSON.stringify(config));
      const retry = await read(route);
      assert.equal(retry.status, 200);
      assert.equal(await retry.text(), html);
    }
  } finally {
    await stopServer(app.child);
    await fs.rm(root, { recursive: true, force: true });
  }
});
