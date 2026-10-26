"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createQuoteOpsHelpers } = require("../lib/admin/pages/quote-ops-helpers");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function createHelpers(overrides = {}) {
  return createQuoteOpsHelpers({
    ADMIN_QUOTE_OPS_PATH: "/admin/quote-ops",
    escapeHtml: normalizeString,
    escapeHtmlAttribute: normalizeString,
    formatAdminServiceLabel: normalizeString,
    getEntryAdminLeadData(entry) {
      return entry.adminLead || {};
    },
    getEntryLeadTasks(entry) {
      return entry.tasks || [];
    },
    getEntryOrderState(entry) {
      return entry.order || {};
    },
    getLeadStatus() {
      return "completed";
    },
    getRequestUrl() {
      return new URL("https://example.com/admin/quote-ops");
    },
    isOrderCreatedEntry(entry) {
      return Boolean(entry.order);
    },
    normalizeLeadStatus: normalizeString,
    normalizeString,
    renderAdminBadge: normalizeString,
    ...overrides,
  });
}

test("renders persisted task status without hiding records before approved cleanup", () => {
  const helpers = createHelpers();
  const customerPhone = "+1 (630) 555-0100";
  const completedEntry = {
    id: "completed-order",
    customerName: "Mona",
    customerPhone,
    tasks: [{ id: "follow-up", kind: "post-completion-followup", status: "open" }],
  };
  const futureEntry = {
    id: "future-order",
    customerName: "Mona",
    customerPhone,
    selectedDate: "2099-08-20",
    order: { status: "scheduled", assignedStaff: "Anastasiia Iaparova" },
  };

  assert.equal(helpers.buildQuoteOpsTaskRecords([completedEntry, futureEntry])[0].status, "open");
  completedEntry.tasks[0].status = "completed";
  assert.equal(helpers.buildQuoteOpsTaskRecords([completedEntry, futureEntry])[0].status, "completed");
});

test("shows next-cleaning task when no future assigned visit remains", () => {
  const helpers = createHelpers();
  const completedEntry = {
    id: "completed-order",
    customerName: "Mona",
    customerPhone: "+1 (630) 555-0100",
    tasks: [{ id: "follow-up", kind: "post-completion-followup", status: "open" }],
  };

  const records = helpers.buildQuoteOpsTaskRecords([completedEntry]);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "follow-up");
});

test("one request prepares each entry once while menu and table keep independent selections", () => {
  let prepared = 0;
  const helpers = createHelpers({
    getLeadStatus: entry => entry.adminLead.status,
    getEntryLeadTasks: entry => { prepared++; return entry.tasks; },
  });
  const entries = [
    { id: "new", adminLead: { status: "new", managerId: "manager", managerName: "Manager" },
      tasks: [{ id: "same-id", status: "open" }, { id: "done", status: "completed" }] },
    { id: "confirmed", adminLead: { status: "confirmed" },
      tasks: [{ id: "same-id", status: "open", assigneeId: "eva", assigneeName: "Eva" }, { id: "old", status: "canceled" }] },
    { id: "empty", adminLead: { status: "new" }, tasks: [] },
  ];
  const before = structuredClone(entries);
  const context = new WeakMap();
  const menuTasks = helpers.buildQuoteOpsTaskRecords(entries, context);
  assert.equal(menuTasks.filter(task => task.status === "open" && task.leadStatus === "new").length, 1);
  const filteredTable = helpers.buildQuoteOpsTaskRecords([entries[1]], context);
  assert.deepEqual(filteredTable.map(task => [task.entry.id, task.id, task.status]), [
    ["confirmed", "same-id", "open"], ["confirmed", "old", "canceled"],
  ]);
  assert.equal(filteredTable[0].manager.name, "Eva");
  assert.equal(menuTasks[0].manager.name, "Manager");
  assert.deepEqual(helpers.buildQuoteOpsTaskRecords([entries[2]], context), []);
  assert.equal(prepared, 3, "empty task lists are reusable too");
  filteredTable.reverse();
  assert.deepEqual(helpers.buildQuoteOpsTaskRecords(entries, context), menuTasks);
  assert.deepEqual(entries, before);
});

test("a full card with the same entry ID is prepared from its fresh object", () => {
  let prepared = 0;
  const helpers = createHelpers({ getEntryLeadTasks: entry => { prepared++; return entry.tasks; } });
  const summary = { id: "entry", isWorkspaceListSummary: true, tasks: [{ id: "task", status: "open", assigneeName: "Before" }] };
  const full = { ...summary, isWorkspaceListSummary: false,
    tasks: [{ id: "task", status: "completed", assigneeName: "After", comment: "Complete history" }] };
  const context = new WeakMap();
  helpers.buildQuoteOpsTaskRecords([summary], context);
  const [task] = helpers.buildQuoteOpsTaskRecords([full], context);
  assert.equal(prepared, 2);
  assert.equal(task.entry, full);
  assert.equal(task.status, "completed");
  assert.equal(task.manager.name, "After");
  assert.equal(task.comment, "Complete history");
});

test("the next request sees saved state and a failed preparation is not cached", () => {
  let prepared = 0;
  let fail = false;
  const helpers = createHelpers({ getEntryLeadTasks: entry => {
    prepared++;
    if (fail) throw new Error("Prepare failed");
    return entry.tasks;
  } });
  const entry = { id: "entry", tasks: [{ id: "task", status: "open" }] };
  helpers.buildQuoteOpsTaskRecords([entry], new WeakMap());
  entry.tasks[0].status = "completed";
  const nextRequest = new WeakMap();
  assert.equal(helpers.buildQuoteOpsTaskRecords([entry], nextRequest)[0].status, "completed");
  assert.equal(prepared, 2);
  const retryContext = new WeakMap();
  fail = true;
  assert.throws(() => helpers.buildQuoteOpsTaskRecords([entry], retryContext), /Prepare failed/);
  assert.equal(retryContext.has(entry), false);
  fail = false;
  assert.equal(helpers.buildQuoteOpsTaskRecords([entry], retryContext)[0].status, "completed");
  assert.equal(prepared, 4);
});

test("request-local preparation preserves all entries, task states and equal task IDs beyond 1000 rows", () => {
  let prepared = 0;
  const helpers = createHelpers({ getEntryLeadTasks: entry => { prepared++; return entry.tasks; } });
  const entries = Array.from({ length: 1207 }, (_, i) => ({ id: `entry-${i}`, customerName: `Client ${i}`,
    fullAddress: `House ${i}`, totalPrice: 400 + i, payloadForRetry: { payrollOverrides: { cleaner: "125.50" } },
    tasks: ["open", "completed", "canceled"].map(status => ({ id: status, status, assigneeName: `Assignee ${i}` })) }));
  const before = JSON.stringify(entries);
  const expected = createHelpers().buildQuoteOpsTaskRecords(entries);
  const context = new WeakMap();
  assert.deepEqual(helpers.buildQuoteOpsTaskRecords(entries, context), expected);
  for (let start = 0; start < entries.length; start += 50) {
    assert.deepEqual(helpers.buildQuoteOpsTaskRecords(entries.slice(start, start + 50), context), expected.slice(start * 3, (start + 50) * 3));
  }
  assert.equal(prepared, entries.length);
  assert.equal(JSON.stringify(entries), before);
});
