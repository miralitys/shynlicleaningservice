"use strict";

const fs = require("node:fs");
const { createSectionFixture, createSectionFetch } = require("./account-section-fixture.cjs");

function createListFixture(count = 1107) {
  const fixture = createSectionFixture(count, 107);
  const orders = fixture.rows.filter(row => row.kind === "quote_submission");
  orders.forEach((row, index) => {
    row.customer_phone = String(6300000000 + index);
    row.customer_email = `list-${index}@example.test`;
    // Equal dates exercise stable continuation, including legacy state roots.
    row.selected_date = index % 2 ? "2099-11-01" : "2020-11-01";
    for (const name of ["orderState", "adminOrder"]) {
      row.payload_for_retry[name].selectedDate = row.selected_date;
      if (index % 13 === 0) row.payload_for_retry[name].status = "canceled";
    }
    if (index % 3 === 0) delete row.payload_for_retry.orderState;
  });
  for (const index of [600, 1106]) {
    if (!orders[index]) continue;
    orders[index].customer_phone = orders[0].customer_phone;
    orders[index].customer_email = orders[0].customer_email;
  }
  const { mapRowToUserRecord, mapUserRecordToQuoteOpsRow } = require("../../lib/supabase-admin-users");
  for (const [id, role, email] of [["manager", "manager", "manager@example.test"], ["eva", "viewer", "eva@shynli.local"]]) {
    const user = { ...fixture.users[0], id, role, email, name: id, staff_id: `staff-${id}` };
    fixture.users.push(user);
    fixture.rows.push(mapUserRecordToQuoteOpsRow(mapRowToUserRecord(user)));
  }
  return fixture;
}

let fetch;
module.exports = async (url, options) => {
  if (!fetch) {
    const fixture = createListFixture(Number(process.env.ADMIN_LIST_FIXTURE_COUNT) || 1107);
    fetch = createSectionFetch(fixture, [], () => {
      const state = JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL, "utf8"));
      return { ...state, cap: 123 };
    });
  }
  return fetch(url, options);
};
module.exports.createListFixture = createListFixture;
