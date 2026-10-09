"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDashboardPageRenderer } = require("../lib/admin/pages/dashboard-page");

test("viewer and manager dashboards load the same deep task history, including standalone tasks", async () => {
  const calls = [];
  const dialogs = [];
  const oldEntries = Array.from({ length: 42 }, (_, i) => ({ id: `old-${i}` }));
  const ledger = { listEntries: async (filters) => {
    calls.push(filters);
    return filters.includeHidden ? oldEntries : [];
  } };
  const renderer = createDashboardPageRenderer({
    ADMIN_QUOTE_OPS_PATH: "/admin/quote-ops", ADMIN_ROOT_PATH: "/admin",
    DASHBOARD_NEW_REQUESTS_LIMIT: 5, DASHBOARD_QUOTE_OPS_PAGE_LIMIT: 120, QUOTE_OPS_TASK_CLIENT_LEDGER_LIMIT: 1000,
    STAFF_TEAM_CALENDAR_TIME_ZONE: "America/Chicago", buildFormattedScheduleLabel: () => "",
    buildQuoteOpsTaskRecords: (entries) => entries.map((entry) => ({ entry, id: entry.id, status: "open", dueAt: "2020-01-01T15:00:00Z",
      title: "Old task", customerName: "Client", leadStatus: "discussion", manager: {}, serviceLabel: "Standard" })),
    buildStaffPlanningContext: () => ({ orderItemsByEntryId: new Map() }), collectAdminClientRecords: () => [],
    collectNonAssignableStaffIds: () => [], collectQuoteOpsManagerOptions: async () => [],
    escapeHtml: String, escapeHtmlAttribute: String, filterStaffSnapshotByHiddenStaffIds: (snapshot) => snapshot,
    formatAdminDateTime: String, formatAdminPhoneNumber: String, formatAdminServiceLabel: String, formatCurrencyAmount: String,
    getProjectedOrderRecords: async () => [], getQuoteOpsDialogId: String,
    getWorkspaceAccessContext: (runtime) => ({ canEdit: runtime.role !== "viewer" }), isOrderCreatedEntry: () => false,
    normalizeString: (value) => String(value || ""), renderAdminAppSidebar: () => "", renderAdminBadge: String,
    renderAdminCard: (title, copy, body) => body, renderAdminLayout: (title, body, options) => {
      if (options.readOnly) assert.equal(dialogs.at(-1).canEdit, false);
      return body;
    },
    renderLeadStatusBadge: String, renderOrderManagementDialog: () => "", renderOrderTableRow: () => "",
    renderQuoteOpsDetailDialog: () => "", renderQuoteOpsStatusBadge: () => "",
    renderQuoteOpsTaskResultDialog: (task, returnTo, id, options) => { dialogs.push(options); return ""; },
    renderQuoteOpsWorkspaceStyle: () => "",
  });
  const viewer = await renderer({}, {}, ledger, { role: "viewer" });
  const manager = await renderer({}, {}, ledger, { role: "manager" });
  assert.equal((viewer.match(/data-admin-dialog-row="true"/g) || []).length, 42);
  assert.equal((manager.match(/data-admin-dialog-row="true"/g) || []).length, 42);
  assert.deepEqual(calls.filter((filters) => filters.includeHidden), [
    { limit: 1000, includeHidden: true }, { limit: 1000, includeHidden: true },
  ]);
  assert.ok(dialogs.slice(0, 42).every((options) => options.canEdit === false));
  assert.ok(dialogs.slice(42).every((options) => options.canEdit === true));
});
