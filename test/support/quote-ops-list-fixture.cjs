"use strict";

const fs = require("node:fs");
const { createListFixture } = require("./admin-list-fixture.cjs");
const { createSectionFetch } = require("./account-section-fixture.cjs");

function createQuoteOpsListFixture(count = 1107) {
  const fixture = createListFixture(count);
  const stamp = "2026-10-01T12:00:00.000Z";
  fixture.rows.filter(row => row.kind === "quote_submission").forEach((row, index) => {
    row.payload_for_retry.adminLead = {
      status: ["new", "no-response", "discussion", "confirmed", "completed", "declined"][index % 6],
      managerId: "manager", managerName: "Test Manager", notes: `History note ${index}`,
      tasks: [{ id: "shared-task", title: `Call test client ${index}`, kind: "contact-client", status: "open",
        dueAt: stamp, createdAt: stamp, assigneeId: index % 2 ? "eva" : "manager",
        assigneeName: index % 2 ? "Eva" : "Test Manager" },
      { id: "closed-task", title: `Previous followup ${index}`, kind: "manual", status: index % 2 ? "completed" : "canceled",
        dueAt: "2020-01-01T12:00:00.000Z", createdAt: stamp, assigneeId: "manager", assigneeName: "Test Manager" }],
    };
    if (index % 97 === 0) {
      for (const root of ["orderState", "adminOrder"]) {
        if (row.payload_for_retry[root]) row.payload_for_retry[root].managerConfirmationRequired = true;
      }
    }
  });
  const standalone = structuredClone(fixture.rows[0]);
  standalone.id = "standalone-task-entry";
  standalone.kind = "admin_standalone_task";
  standalone.customer_name = "Internal task";
  delete standalone.payload_for_retry.orderState;
  delete standalone.payload_for_retry.adminOrder;
  fixture.rows.push(standalone);
  return fixture;
}

let read;
module.exports = async (url, options) => {
  if (!read) read = createSectionFetch(createQuoteOpsListFixture(Number(process.env.ADMIN_LIST_FIXTURE_COUNT) || 1107), [], () => {
    const state = JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL, "utf8"));
    return { ...state, cap: state.cap || 123 };
  });
  const state = JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL, "utf8"));
  if (state.failWorkspace && new URL(url).pathname.endsWith("/quote_ops_entries")) {
    return { ok: false, status: 503, text: async () => JSON.stringify({ message: "Workspace unavailable" }) };
  }
  return read(url, options);
};
module.exports.createQuoteOpsListFixture = createQuoteOpsListFixture;
