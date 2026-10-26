"use strict";
const fs = require("node:fs");
const { createFixture, createReadFetch } = require("./account-read-fixture.cjs");
const fixture = createFixture(1, 0);
const row = fixture.rows[0];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
row.selected_date = today;
row.payload_for_retry.orderState.selectedDate = today;
row.payload_for_retry.adminOrder.selectedDate = today;
fixture.assignments[0].schedule_date = today;
row.payload_for_retry.orderState.assignedStaff = "";
row.payload_for_retry.adminOrder.assignedStaff = "";
const calls = [];
const read = createReadFetch(fixture, calls);
let conflicts = 0;

module.exports = async (url, options) => {
  if (url.includes("/quote_ops_entries?") && new URL(url).searchParams.get("id")?.startsWith("in.(")) {
    const mode = process.env.DASHBOARD_CONFLICT_MODE;
    if (mode === "persistent" || (mode === "once" && conflicts === 0)) {
      conflicts++;
      row.updated_at = new Date(Date.UTC(2026, 9, 25, 12, 0, conflicts)).toISOString();
      row.total_price = 534;
      row.total_price_cents = 53400;
      row.payload_for_retry.orderState.payrollOverrides = { a: "500.00" };
      row.payload_for_retry.adminLead = { status: "new", tasks: [{ id: "future", title: "New followup",
        status: "open", dueAt: "2099-01-01T12:00:00Z" }] };
    }
  }
  const result = await read(url, options);
  fs.appendFileSync(process.env.DASHBOARD_CONFLICT_CAPTURE, JSON.stringify({ url, method: options?.method || "GET", conflicts }) + "\n");
  return result;
};
