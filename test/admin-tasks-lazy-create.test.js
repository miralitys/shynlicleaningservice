"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuoteOpsPageRenderer } = require("../lib/admin/pages/quote-ops-page");
const { createQuoteOpsRuntimeScripts } = require("../lib/admin/pages/quote-ops-runtime-scripts");

const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const redirect = (path, updates) => {
  const url = new URL(path, "http://test.invalid");
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  return url.pathname + url.search;
};

function setup() {
  const calls = { archive: 0, funnel: 0, assignees: 0, candidates: 0, reads: 0 };
  const tasks = ["open", "completed", "canceled"].map((status, i) => ({ id: `task-${i}`, status,
    dueAt: "2099-01-01T12:00:00Z", title: `Title ${status}`, assigneeName: `Assignee ${i}` }));
  const entries = tasks.map((task, i) => ({ id: `entry-${i}`, kind: "quote", createdAt: "2026-01-01",
    customerName: `Client ${i}`, customerPhone: `202555000${i}`, fullAddress: `House ${i}`, task }));
  const before = structuredClone(entries);
  const ledger = { listWorkspaceListEntries: async () => { calls.reads++; return entries; } };
  const renderer = createQuoteOpsPageRenderer({
    ADMIN_QUOTE_OPS_PATH: "/admin/quote-ops", normalizeString,
    buildAdminRedirectPath: redirect,
    getQuoteOpsFilters: req => {
      const reqUrl = new URL(req.url, "http://test.invalid");
      return { reqUrl, filters: { section: reqUrl.searchParams.get("section") || "list", status: "all", serviceType: "all",
        leadStatus: "all", managerId: "", q: "", taskStatus: reqUrl.searchParams.get("taskStatus") || "" } };
    },
    getWorkspaceAccessContext: runtime => runtime.access || { canEdit: true },
    filterQuoteOpsEntries: entries => entries,
    collectQuoteOpsManagerOptions: async () => [],
    collectQuoteOpsTaskAssigneeOptions: async () => { calls.assignees++; return [{ id: "admin", name: "Owner", label: "Owner" }]; },
    buildQuoteOpsTaskRecords: entries => entries.map(entry => ({ ...entry.task, entry })),
    getLeadStatus: () => "new", getQuoteLeadManager: () => ({ id: "admin", name: "Owner" }),
    formatAdminPhoneNumber: String,
    buildFormattedScheduleLabel: () => { calls.candidates++; return ""; },
    escapeHtml: String, escapeHtmlAttribute: String, escapeHtmlText: String,
    renderAdminLayout: (title, body) => body, renderAdminAppSidebar: () => "", renderAdminBadge: () => "",
    renderAdminDialogCloseButton: () => "", renderAdminHiddenInput: () => "",
    renderQuoteOpsLeadStatusLane: () => { calls.archive++; return "archive"; },
    renderQuoteOpsFunnelLane: () => { calls.funnel++; return "funnel"; },
    renderQuoteOpsTaskTableRow: task => `<tr>${task.id} ${task.status} ${task.assigneeName}</tr>`,
    renderQuoteOpsTaskResultDialog: () => "", renderQuoteOpsDetailDialog: () => "",
    renderQuoteOpsDiscussionStageDialog: () => "", renderQuoteOpsFunnelScript: () => "",
    renderQuoteOpsWorkspaceStyle: () => "", renderQuoteOpsNotice: () => "",
    renderQuoteOpsOverviewStrip: () => "", renderQuoteOpsSectionNav: () => "",
  });
  return { calls, entries, before, ledger, renderer };
}

test("tasks never render archive/funnel lanes or build the hidden creation form", async () => {
  const { renderer, calls, ledger, entries, before } = setup();
  const html = await renderer({ url: "/admin/quote-ops?section=tasks" }, {}, ledger);
  assert.equal(calls.archive, 0);
  assert.equal(calls.funnel, 0);
  assert.equal(calls.candidates, 0);
  assert.equal(calls.assignees, 0);
  assert.match(html, /task-0 open Assignee 0/);
  assert.doesNotMatch(html, /<dialog|data-quote-task-client-result="true"/);
  assert.match(html, /fragment=create-task-dialog/);
  assert.deepEqual(entries, before);
});

test("read-only task history retains all statuses while creation requires its existing permission", async () => {
  const { renderer, calls, ledger, entries, before } = setup();
  const html = await renderer({ url: "/admin/quote-ops?section=tasks" }, {}, ledger, { access: { canEdit: false } });
  for (const [i, status] of ["open", "completed", "canceled"].entries()) assert.match(html, new RegExp(`task-${i} ${status} Assignee ${i}`));
  assert.doesNotMatch(html, /admin-quote-create-task-trigger/);
  assert.equal(await renderer.renderCreateDialogFragment({ url: "/admin/quote-ops?fragment=create-task-dialog" }, {}, ledger,
    { access: { canEdit: false } }), "");
  assert.equal(calls.reads, 1);
  assert.deepEqual(entries, before);
});

test("creation reads a fresh complete picker only on demand and preserves the original form fields", async () => {
  const { renderer, calls, ledger, entries, before } = setup();
  const req = { url: "/admin/quote-ops?section=tasks&fragment=create-task-dialog&returnTo=%2Fadmin%2Fquote-ops%3Fsection%3Dtasks%26q%3Dclient" };
  const first = await renderer.renderCreateDialogFragment(req, {}, ledger);
  assert.equal(calls.candidates, 3);
  assert.equal(calls.assignees, 1);
  for (const field of ["create-lead-task", "assigneeId", "taskTitle", "taskDueAt", "standalone"]) assert.ok(first.includes(field), field);
  assert.match(first, /name="returnTo" value="\/admin\/quote-ops\?section=tasks&q=client"/);
  entries.push({ ...entries[0], id: "new-entry", customerName: "New client", customerPhone: "9999999999" });
  const second = await renderer.renderCreateDialogFragment(req, {}, ledger);
  assert.match(second, /New client/);
  assert.equal(calls.reads, 2);
  assert.deepEqual(entries.slice(0, 3), before);
  assert.equal(calls.archive + calls.funnel, 0);
});

test("the observer creation fragment has no assignment, standalone or arbitrary-title controls", async () => {
  const { renderer, calls, ledger } = setup();
  const html = await renderer.renderCreateDialogFragment({ url: "/admin/quote-ops?fragment=create-task-dialog" }, {}, ledger,
    { access: { canEdit: false, canUpdateTaskStatus: true } });
  assert.match(html, /create-observer-task/);
  assert.match(html, /id="admin-observer-task-search"/);
  assert.doesNotMatch(html, /name="assigneeId"|name="taskTitle"|Без клиента/);
  assert.equal(calls.candidates + calls.assignees, 0);
});

test("creation bindings are available to dynamically inserted dialogs and the generated script parses", () => {
  const html = createQuoteOpsRuntimeScripts({ ADMIN_QUOTE_OPS_PATH: "/admin/quote-ops" }).renderQuoteOpsFunnelScript("tasks");
  assert.match(html, /bindManualTaskForm\(scope\)/);
  assert.match(html, /bindObserverTaskForm\(scope\)/);
  assert.doesNotThrow(() => new Function(html.replace(/^<script>|<\/script>$/g, "")));
});
