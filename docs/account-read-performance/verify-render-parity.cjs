"use strict";

// Read-only local comparison against the deployed release, using synthetic data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { createFixture, createReadFetch } = require("../../test/support/account-read-fixture.cjs");

const root = path.resolve(__dirname, "../..");
const baseline = "32598bbbe8b59153f461c9e6bffb7bc12df34b1d";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalizeString = (value, limit = 0) => {
  const text = String(value ?? "").trim();
  return limit ? text.slice(0, limit) : text;
};
const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ["2026-10-24T12:00:00.000Z"])); }
  static now() { return Date.parse("2026-10-24T12:00:00.000Z"); }
}

function load(relative, old, replacements = {}) {
  const filename = path.join(root, relative);
  const source = old ? execFileSync("git", ["show", `${baseline}:${relative}`], { cwd: root, encoding: "utf8" })
    : fs.readFileSync(filename, "utf8");
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Date: FixedDate, Intl, URL, URLSearchParams,
    require: name => Object.hasOwn(replacements, name) ? replacements[name] : realRequire(name),
  }, { filename });
  return module.exports;
}

async function run() {
  const fixture = createFixture(254, 163);
  const calls = [];
  const fetch = createReadFetch(fixture, calls);
  const env = { SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake" };
  const users = await require("../../lib/supabase-admin-users").createSupabaseAdminUsersClient({ env, fetch }).fetchSnapshot();
  const user = users.users.find(record => record.id === "user-a");
  const staff = await require("../../lib/supabase-admin-staff").createSupabaseAdminStaffClient({ env, fetch }).fetchAccountSnapshot("a");
  const entries = await require("../../lib/supabase-quote-ops").createSupabaseQuoteOpsClient({ env, fetch })
    .fetchAccountEntriesByIds(staff.assignments.map(record => record.entryId));
  const before = hash({ fixture, users, staff, entries });
  const paths = { ACCOUNT_ROOT_PATH: "/account", ACCOUNT_LOGIN_PATH: "/account/login", ACCOUNT_LOGOUT_PATH: "/account/logout",
    ACCOUNT_W9_DOWNLOAD_PATH: "/account/w9", ACCOUNT_CONTRACT_DOWNLOAD_PATH: "/account/contract",
    ACCOUNT_GOOGLE_CALENDAR_CONNECT_PATH: "/account/calendar/connect" };
  const shared = require("../../lib/admin/render-shared").createAdminSharedRenderers({
    escapeHtml, escapeHtmlText: escapeHtml, escapeHtmlAttribute: escapeHtml,
  });
  const domain = require("../../lib/admin/domain").createAdminDomainHelpers({
    normalizeString, adminSharedRenderers: shared, escapeHtmlText: escapeHtml, ORDER_ASSIGNMENT_VALUES: [],
  });
  let context;
  const handler = require("../../lib/account/handlers").createAccountRequestHandler({
    ...paths, USER_SESSION_COOKIE: "session", USER_PASSWORD_SETUP_COOKIE: "setup", normalizeString,
    accountAuth: { loadUserAuthConfig: () => ({ configured: true }), verifyUserSessionToken: () => ({ userId: user.id }) },
    parseCookies: () => ({ session: "synthetic-test-only" }),
    getRequestUrl: req => new URL(req.url, "https://account-benchmark.invalid"),
    buildStaffPlanningContext: domain.buildStaffPlanningContext,
    accountRenderers: { renderDashboardPage(value) { context = value; return ""; } },
    writeHtmlWithTiming: (_res, status) => assert.equal(status, 200),
    redirectWithTiming: () => { throw new Error("Unexpected test redirect"); },
  });
  await handler({ method: "GET", url: "/account", headers: {} }, {}, 0n, { route: "/account" }, null,
    { settingsStore: { getSnapshot: async () => ({ templates: [] }) } },
    { listAccountEntriesByIds: async () => entries }, { getAccountSnapshot: async () => staff },
    { getAccountContext: async () => ({ user, usersSnapshot: users }) });
  assert.equal(context.assignedOrders.length, 254);
  const contextBefore = hash(context);
  const counters = {};
  const renderers = Object.fromEntries([true, false].map(old => {
    const label = old ? "before" : "after";
    const confirmation = load("lib/cleaner-confirmation.js", old);
    const actionWindow = load("lib/account/assignment-action-window.js", old, { "../cleaner-confirmation": confirmation });
    counters[label] = 0;
    const factory = load("lib/account/render.js", old, {
      "../cleaner-confirmation": { ...confirmation, getStaffCleanerConfirmationState(...args) {
        counters[label]++;
        return confirmation.getStaffCleanerConfirmationState(...args);
      } },
      "./assignment-action-window": actionWindow,
    }).createAccountRenderers;
    return [label, factory({ ...paths, ...domain, normalizeString, escapeHtml, escapeHtmlText: escapeHtml,
      escapeHtmlAttribute: escapeHtml, shared, GOOGLE_TAG_MANAGER_CONTAINER_ID: "GTM-5P88N7LD" })];
  }));
  const cases = [
    ["active-page-1", "renderDashboardPage", context, {}],
    ["active-page-2", "renderDashboardPage", context, { activePage: 2 }],
    ["all-history", "renderDashboardPage", context, { showAllHistory: true }],
    ["calendar-day", "renderCalendarPage", context, { calendarDate: "2099-06-14" }],
    ["calendar-month", "renderCalendarPage", context, { calendarDate: "2099-06-14", calendarView: "month", calendarShowDay: true }],
    ["payroll", "renderPayrollPage", { ...context,
      payrollSummary: require("../../lib/payroll").collectPayrollRecords({ entries, staffId: "a" }) }, {}],
    ["historical-detail", "renderOrderDetailFragment", { ...context, assignedOrders: [context.assignedOrders[0]] }, {}],
    ["future-detail", "renderOrderDetailFragment", { ...context, assignedOrders: [context.assignedOrders.at(-1)] }, {}],
  ];
  const result = [];
  for (const [name, method, data, options] of cases) {
    const measured = {};
    const samples = { before: [], after: [] };
    for (let pass = 0; pass <= 5; pass++) {
      for (const label of pass % 2 ? ["after", "before"] : ["before", "after"]) {
        counters[label] = 0;
        const start = performance.now();
        const html = renderers[label][method](data, options);
        const ms = performance.now() - start;
        if (pass) samples[label].push(ms);
        const digest = hash(html);
        if (measured[label]) assert.equal(digest, measured[label].hash);
        measured[label] = { uiStates: counters[label], bytes: Buffer.byteLength(html), hash: digest };
      }
      assert.equal(measured.after.hash, measured.before.hash, `Exact HTML parity: ${name}`);
    }
    for (const label of ["before", "after"]) {
      samples[label].sort((a, b) => a - b);
      measured[label].medianMs = +samples[label][2].toFixed(1);
    }
    result.push({ name, ...measured, identicalHtml: true });
  }
  assert.equal(hash(context), contextBefore);
  assert.equal(hash({ fixture, users, staff, entries }), before);
  assert(calls.every(call => call.method === "GET"));
  console.log(JSON.stringify({ baseline, fixture: "254 synthetic orders, 91 active, 163 historical",
    timing: "median of 5 alternating passes per case, one excluded warm-up", result,
    exactHtmlParity: true, inputAndContextUnchanged: true, network: "synthetic GET only" }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
