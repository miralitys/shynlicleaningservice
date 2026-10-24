"use strict";

const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
const { createFixture, createReadFetch } = require("./account-read-fixture.cjs");
function createSectionFixture(count = 254, completed = 163) {
  // Load after the optional benchmark baseline loader has been installed.
  const { mapRowToStaffRecord, mapRowToAssignmentRecord,
    mapStaffRecordToQuoteOpsRow, mapAssignmentRecordToQuoteOpsRow } = require("../../lib/supabase-admin-staff");
  const fixture = createFixture(count, completed);
  fixture.rows.push(...fixture.staff.map(row => mapStaffRecordToQuoteOpsRow(mapRowToStaffRecord(row))),
    ...fixture.assignments.map(row => mapAssignmentRecordToQuoteOpsRow(mapRowToAssignmentRecord(row))));
  return fixture;
}

function capture(record) {
  if (process.env.ACCOUNT_SECTION_CAPTURE) {
    fs.appendFileSync(process.env.ACCOUNT_SECTION_CAPTURE, JSON.stringify(record) + "\n");
  }
}

function createSectionFetch(fixture, calls = [], control = () => ({})) {
  const read = createReadFetch(fixture, [], control);
  return async (url, options = {}) => {
    const u = new URL(url);
    if (u.origin !== "https://account-benchmark.invalid") throw new Error("External network forbidden");
    const method = options.method || "GET";
    if (method !== "GET") throw new Error("Section fixture forbids writes");
    const state = control();
    const table = u.pathname.split("/").pop();
    const start = performance.now();
    if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
    let response;
    if (state.primaryError && table === "admin_staff_assignments") {
      response = { ok: false, status: state.primaryError.status,
        text: async () => JSON.stringify(state.primaryError.body) };
    } else if (state.fallbackError && table === "quote_ops_entries" && u.searchParams.has("kind")) {
      response = { ok: false, status: 503, text: async () => JSON.stringify({ message: "Fallback read unavailable" }) };
    } else {
      response = await read(url, options);
    }
    const kind = u.searchParams.get("kind") || "";
    const phase = table === "admin_users" ? "auth" : table.startsWith("admin_staff") || kind ? "staff" : "orders";
    const record = { type: "read", table, method, phase, status: response.status, start, end: performance.now() };
    calls.push(record);
    capture(record);
    return response;
  };
}

let fetch;
module.exports = async (url, options) => {
  if (!fetch) fetch = createSectionFetch(createSectionFixture(), [], () =>
    JSON.parse(fs.readFileSync(process.env.ACCOUNT_SECTION_CONTROL, "utf8")));
  return fetch(url, options);
};
module.exports.createSectionFixture = createSectionFixture;
module.exports.createSectionFetch = createSectionFetch;
module.exports.capture = capture;
