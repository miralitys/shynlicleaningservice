"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createQuoteOpsHelpers } = require("../lib/admin/pages/quote-ops-helpers");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function createHelpers() {
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
  });
}

test("hides next-cleaning task while the client has a future assigned visit", () => {
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

  assert.deepEqual(helpers.buildQuoteOpsTaskRecords([completedEntry, futureEntry]), []);
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
