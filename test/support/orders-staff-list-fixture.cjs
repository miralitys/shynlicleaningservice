"use strict";

const fs = require("node:fs");
const { createListFixture } = require("./admin-list-fixture.cjs");
const { createSectionFetch } = require("./account-section-fixture.cjs");
const { readOrderStaffView } = require("./orders-staff-view.cjs");
let fixture,read;

module.exports = async (url,options) => {
  if (!fixture) {
    fixture = createListFixture();
    read = createSectionFetch(fixture, [], () => ({
      ...JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL,"utf8")),cap:123,
      primaryError:{ status:404,body:{ code:"PGRST205",message:"Could not find the table admin_staff_assignments" } },
    }));
  }
  const u = new URL(url);
  if (!u.pathname.endsWith("/admin_order_staff_list_entries")) return read(url,options);
  if (u.origin !== "https://account-benchmark.invalid" || options.method !== "GET") throw new Error("Only isolated reads are allowed");
  const response = readOrderStaffView(fixture.rows,u,123);
  fs.appendFileSync(process.env.ACCOUNT_SECTION_CAPTURE,JSON.stringify({ table:"admin_order_staff_list_entries",method:"GET" })+"\n");
  return response;
};
