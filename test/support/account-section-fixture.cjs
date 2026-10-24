"use strict";

const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
const { createFixture, createReadFetch } = require("./account-read-fixture.cjs");
function createSectionFixture(count = 254, completed = 163) {
  // Load after the optional benchmark baseline loader has been installed.
  const { mapRowToStaffRecord, mapRowToAssignmentRecord,
    mapStaffRecordToQuoteOpsRow, mapAssignmentRecordToQuoteOpsRow } = require("../../lib/supabase-admin-staff");
  const fixture = createFixture(count, completed);
  const { mapRowToUserRecord, mapUserRecordToQuoteOpsRow } = require("../../lib/supabase-admin-users");
  fixture.rows.push(...fixture.staff.map(row => mapStaffRecordToQuoteOpsRow(mapRowToStaffRecord(row))),
    ...fixture.assignments.map(row => mapAssignmentRecordToQuoteOpsRow(mapRowToAssignmentRecord(row))),
    ...fixture.users.map(row => mapUserRecordToQuoteOpsRow(mapRowToUserRecord(row))));
  if (process.env.ACCOUNT_SECTION_HEAVY_STAFF === "1") {
    for (const row of fixture.rows.filter(row => row.kind === "admin_staff_member")) {
      row.payload_for_retry.staff.smsHistory = Array.from({ length: 50 }, (_, i) => ({
        id: `sms-${i}`, message: "synthetic message ".repeat(60), sentAt: "2026-10-01T12:00:00.000Z",
      }));
    }
    for (let i = 0; i < 300; i++) fixture.rows.push(mapAssignmentRecordToQuoteOpsRow({ entryId: `foreign-${i}`, staffIds: ["b"] }));
    for (let i = 0; i < 118; i++) fixture.rows.push(mapAssignmentRecordToQuoteOpsRow({ entryId: `retained-${i}`, staffIds: ["a", "b"] }));
  }
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
    if (method !== "GET" && !(method === "POST" && u.pathname === "/rest/v1/rpc/read_account_calendar_entries")) {
      throw new Error("Section fixture forbids writes");
    }
    const state = control();
    const table = u.pathname.split("/").pop();
    const start = performance.now();
    if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
    let response;
    if (state.usersPrimaryError && table === "admin_users") {
      response = { ok: false, status: state.usersPrimaryError.status,
        text: async () => JSON.stringify(state.usersPrimaryError.body) };
    } else if (state.primaryError && table === "admin_staff_assignments") {
      response = { ok: false, status: state.primaryError.status,
        text: async () => JSON.stringify(state.primaryError.body) };
    } else if (state.fallbackError && table === "quote_ops_entries" && u.searchParams.has("kind")) {
      response = { ok: false, status: 503, text: async () => JSON.stringify({ message: "Fallback read unavailable" }) };
    } else {
      response = await read(url, options);
    }
    const kind = u.searchParams.get("kind") || "";
    const phase = table === "admin_users" || kind === "eq.admin_user_account" ? "auth" : table.startsWith("admin_staff") || kind ? "staff" : "orders";
    const record = { type: "read", table, method, phase, status: response.status,
      bytes: Buffer.byteLength(await response.text()), start, end: performance.now() };
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
