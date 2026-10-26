"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { startServer, stopServer } = require("./server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { createUserSessionToken } = require("../lib/account-auth");
const { createQuoteOpsListFixture } = require("./support/quote-ops-list-fixture.cjs");
const { mapRowToEntry } = require("../lib/supabase-quote-ops");
const { filterQuoteOpsEntries } = require("../lib/quote-ops/store");
const { getLegacyQuoteHistory } = require("../lib/admin/pages/quote-ops-archive");
const { taskListKey, taskListDialogId } = require("../lib/admin/pages/quote-ops-task-list");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");

const normalize = (value, length = 500) => String(value ?? "").trim().slice(0, length);
const attr = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const all = (node, predicate) => (predicate(node) ? [node] : []).concat(...(node.childNodes || []).map(child => all(child, predicate)));
const find = (node, name, value) => all(node, n => attr(n, name) !== undefined && (value === undefined || attr(n, name) === value))[0];
const text = node => all(node, n => n.nodeName === "#text").map(n => n.value.trim()).filter(Boolean).join(" ");

test("workspace complete cursor handles caps, missing counts and explicit failures without changing the legacy reader", async () => {
  const rows = Array.from({ length: 1109 }, (_, i) => ({ id: `entry-${String(i).padStart(5, "0")}`, status: "success" }));
  for (const noCount of [false, true]) {
    const calls = [];
    const client = createSupabaseQuoteOpsClient({ env: { SUPABASE_URL: "https://workspace.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" },
      fetch: async (url, options) => {
        assert.equal(options.method, "GET");
        const params = new URL(url).searchParams;
        calls.push(params);
        const cursor = params.get("id")?.slice(3) || "";
        const pending = rows.filter(row => row.id > cursor);
        return { ok: true, text: async () => JSON.stringify(pending.slice(0, 73)), headers: { get: name =>
          name === "content-range" && !noCount ? `0-72/${pending.length}` : null } };
      } });
    assert.deepEqual((await client.fetchAllEntries({ completeCursor: true })).map(row => row.id), rows.map(row => row.id));
    assert.ok(calls.length > 15);
    assert.ok(calls.every(params => !params.has("offset")));
  }
  for (const mode of ["denied", "empty", "repeated", "invalid"]) {
    let calls = 0;
    const client = createSupabaseQuoteOpsClient({ env: { SUPABASE_URL: "https://workspace.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" },
      fetch: async () => {
        calls++;
        if (mode === "denied" && calls > 1) return { ok: false, status: 403, text: async () => '{"message":"Denied"}' };
        return { ok: true, text: async () => JSON.stringify(mode === "invalid" ? {} : calls > 1 && mode === "empty" ? [] : [rows[0]]),
          headers: { get: () => "0-0/1109" } };
      } });
    await assert.rejects(client.fetchAllEntries({ completeCursor: true }), /Denied|Incomplete|Invalid/);
  }
  const legacyCalls = [];
  const legacy = createSupabaseQuoteOpsClient({ env: { SUPABASE_URL: "https://workspace.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" },
    fetch: async url => { legacyCalls.push(url); return { ok: true, text: async () => JSON.stringify(rows.slice(0, 3)) }; } });
  assert.equal((await legacy.fetchAllEntries()).length, 3);
  assert.equal(legacyCalls.length, 1);
  assert.match(legacyCalls[0], /offset=0/);
});

test("tasks and archive traverse the full history, with lazy cards and unchanged permissions", { timeout: 180000 }, async () => {
  const { parse } = await import("parse5");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-quote-pagination-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-quote-list", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", ACCOUNT_SECTION_CONTROL: path.join(root, "control.json"),
    ACCOUNT_SECTION_CAPTURE: path.join(root, "reads.ndjson"),
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "support/quote-ops-list-fixture.cjs") };
  await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, "{}");
  const fixture = createQuoteOpsListFixture();
  const untouched = JSON.stringify(fixture);
  const entries = fixture.rows.map(mapRowToEntry);
  const visible = filterQuoteOpsEntries(entries, { excludeRemovedRecurringOrders: true }, normalize).filter(e => e.kind !== "client_record");
  const legacy = getLegacyQuoteHistory(visible);
  assert.ok(legacy.length > 1000);
  const taskEntries = filterQuoteOpsEntries(entries, { includeHidden: true }, normalize)
    .filter(entry => Array.isArray(entry.payloadForRetry?.adminLead?.tasks));
  const tasks = taskEntries.flatMap(entry => entry.payloadForRetry.adminLead.tasks.map(task => ({ ...task, entry })));
  const open = tasks.filter(task => task.status === "open");
  assert.ok(open.length > 1000);
  const app = await startServer({ env });
  try {
    const owner = "shynli_admin_session=" + await createAdminSession(app.baseUrl, loadAdminConfig(env));
    const cookies = Object.fromEntries(["manager", "eva", "user-a"].map(userId => [userId,
      "shynli_user_session=" + createUserSessionToken({ masterSecret: env.ADMIN_MASTER_SECRET }, { userId })]));
    async function read(route, cookie = owner) {
      const response = await fetch(app.baseUrl + route, { headers: { cookie }, redirect: "manual" });
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("cache-control"), /no-store/);
      return response.text();
    }
    async function walk(doc, id, cookie = owner) {
      let list = find(doc, "data-admin-list-id", id);
      assert.ok(list, id);
      const total = Number(attr(list, "data-admin-list-total"));
      const rows = [];
      for (let page = 0; page < 100; page++) {
        const chunk = find(list, "data-admin-list-rows");
        const records = chunk.childNodes.filter(node => attr(node, "data-admin-list-key"));
        assert.ok(records.length <= 50);
        rows.push(...records);
        const next = find(list, "data-admin-list-next");
        if (!next) break;
        const url = new URL(attr(next, "href"), app.baseUrl);
        url.searchParams.set("fragment", "list");
        list = find(parse(await read(url.pathname + url.search, cookie)), "data-admin-list-response", id);
        assert.ok(list);
        assert.equal(attr(list, "data-admin-list-error"), undefined);
        assert.equal(Number(attr(list, "data-admin-list-start")), rows.length);
        assert.equal(Number(attr(list, "data-admin-list-total")), total);
      }
      assert.equal(rows.length, total);
      assert.equal(new Set(rows.map(row => attr(row, "data-admin-list-key"))).size, total);
      return rows;
    }
    const archiveDoc = parse(await read("/admin/quote-ops?section=archive"));
    const archiveRows = [];
    for (const lane of all(archiveDoc, n => attr(n, "data-admin-list-id"))) {
      archiveRows.push(...await walk(archiveDoc, attr(lane, "data-admin-list-id")));
    }
    assert.deepEqual(archiveRows.map(row => attr(row, "data-admin-list-key")).sort(), legacy.map(e => e.id).sort());
    for (const row of archiveRows) {
      const entry = legacy.find(e => e.id === attr(row, "data-admin-list-key"));
      assert.ok(text(row).includes(entry.fullAddress));
      assert.ok(text(row).includes("$" + entry.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })));
    }
    const funnelDoc = parse(await read("/admin/quote-ops?section=funnel&archive=1"));
    const funnelRows = [];
    for (const lane of all(funnelDoc, n => attr(n, "data-admin-list-id"))) {
      funnelRows.push(...await walk(funnelDoc, attr(lane, "data-admin-list-id")));
    }
    assert.deepEqual(funnelRows.map(row => attr(row, "data-admin-list-key")).sort(), legacy.map(e => e.id).sort());
    const initial = await read("/admin/quote-ops?section=tasks");
    assert.doesNotMatch(initial, /<dialog\b[^>]*id="admin-quote-create-task-dialog"/);
    const createUrl = attr(find(parse(initial), "data-admin-dialog-open", "admin-quote-create-task-dialog"), "data-admin-dialog-url");
    assert.ok(createUrl);
    const create = await read(createUrl);
    assert.match(create, /name="action" value="create-lead-task"/);
    assert.match(create, /data-entry-id="order-01106"/);
    assert.doesNotMatch(create, /<html|data-admin-list-id=/);
    const fallback = await read("/admin/quote-ops?section=tasks&createTask=1");
    assert.match(fallback, /<dialog open data-admin-dialog-server-open="true" data-admin-dialog-autopen="true"/);
    assert.match(fallback, /data-admin-dialog-return-url="\/admin\/quote-ops\?section=tasks"/);
    assert.doesNotMatch(initial, /<dialog\b[^>]*id="admin-quote-task-result-dialog-/);
    const taskRows = await walk(parse(initial), "quote-tasks");
    assert.deepEqual(taskRows.map(row => attr(row, "data-admin-list-key")).sort(), open.map(taskListKey).sort());
    for (const row of taskRows) {
      const task = open.find(task => taskListKey(task) === attr(row, "data-admin-list-key"));
      assert.ok(text(row).includes(task.title));
      assert.ok(text(row).includes(task.assigneeName));
    }
    const eva = parse(await read("/admin/quote-ops?section=tasks", cookies.eva));
    const evaRows = await walk(eva, "quote-tasks", cookies.eva);
    assert.deepEqual(evaRows.map(row => attr(row, "data-admin-list-key")).sort(), tasks.map(taskListKey).sort());
    for (const status of ["completed", "canceled"]) {
      const doc = parse(await read(`/admin/quote-ops?section=tasks&taskStatus=${status}`, cookies.eva));
      assert.equal(Number(attr(find(doc, "data-admin-list-id"), "data-admin-list-total")), tasks.filter(task => task.status === status).length);
    }
    const late = open.find(task => task.entry.id === "order-01106");
    const searched = parse(await read("/admin/quote-ops?section=tasks&q=manual-1106"));
    assert.equal(attr(find(searched, "data-admin-list-id"), "data-admin-list-total"), "1");
    assert.ok(find(searched, "data-admin-list-key", taskListKey(late)));
    const selected = await read(`/admin/quote-ops?section=tasks&task=${late.id}&taskEntry=${late.entry.id}`);
    assert.ok(selected.includes(`id="${taskListDialogId(late)}"`));
    assert.match(selected, /data-admin-dialog-autopen="true"/);
    const fragment = attr(taskRows.find(row => attr(row, "data-admin-list-key") === taskListKey(late)), "data-admin-dialog-url");
    const card = await read(fragment);
    assert.match(card, /Call test client 1106/);
    assert.ok(card.includes(`id="${taskListDialogId(late)}"`));
    assert.match(card, /name="returnTo" value="\/admin\/quote-ops\?section=tasks"/);
    const archivedCard = await read(`/admin/quote-ops?fragment=entry-dialog&entry=${late.entry.id}`);
    assert.match(archivedCard, /1107 Test Street/);
    assert.match(archivedCard, /History note 1106/);
    const next = new URL(attr(find(parse(initial), "data-admin-list-next"), "href"), app.baseUrl);
    next.searchParams.set("fragment", "list");
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, '{"failWorkspace":true}');
    const failure = await fetch(app.baseUrl + next.pathname + next.search, { headers: { cookie: owner } });
    assert.ok(failure.status >= 500);
    await fs.writeFile(env.ACCOUNT_SECTION_CONTROL, "{}");
    assert.equal(attr(find(parse(await read(next.pathname + next.search)), "data-admin-list-response"), "data-admin-list-start"), "50");
    next.searchParams.set("q", "manual-1106");
    assert.ok(find(parse(await read(next.pathname + next.search)), "data-admin-list-error"));
    for (const [user, allowed] of [["manager", true], ["eva", true], ["user-a", false], ["anonymous", false]]) {
      for (const route of [fragment, "/admin/quote-ops?section=archive&fragment=list&list=quote-archive-new",
        "/admin/quote-ops?section=tasks&fragment=list&list=quote-tasks", "/admin/quote-ops?section=tasks&fragment=create-task-dialog"]) {
        const response = await fetch(app.baseUrl + route, { headers: { cookie: cookies[user] || "" }, redirect: "manual" });
        assert.equal(response.status === 200, allowed, user + route);
        if (user === "eva") assert.doesNotMatch(await response.text(), /name="action" value="(?:update-lead-status|delete-lead-task|delete-entry)"|draggable="true"/);
      }
    }
    const reads = (await fs.readFile(env.ACCOUNT_SECTION_CAPTURE, "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(reads.every(row => row.method === "GET"));
    assert.equal(JSON.stringify(fixture), untouched);
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
