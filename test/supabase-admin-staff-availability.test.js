"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapRowToStaffRecord,
  mapStaffRecordToRow,
  mapStaffRecordToQuoteOpsRow,
  mapQuoteOpsRowToStaffRecord,
} = require("../lib/supabase-admin-staff");

test("stores manual availability blocks in the staff calendar JSON payload", () => {
  const row = mapStaffRecordToRow({
    id: "staff-1",
    name: "Cleaner One",
    availabilityBlocks: [
      {
        date: "2026-07-06",
        summary: "Personal day",
      },
    ],
  });

  assert.equal(row.calendar_connection.manualAvailabilityBlocks.length, 1);
  assert.equal(row.calendar_connection.manualAvailabilityBlocks[0].date, "2026-07-06");
  assert.equal(row.calendar_connection.manualAvailabilityBlocks[0].summary, "Personal day");

  const record = mapRowToStaffRecord(row);
  assert.equal(record.availabilityBlocks.length, 1);
  assert.equal(record.availabilityBlocks[0].date, "2026-07-06");
  assert.equal(record.calendar, null);
});

test("preserves manual availability blocks through quote ops fallback rows", () => {
  const quoteOpsRow = mapStaffRecordToQuoteOpsRow({
    id: "staff-1",
    name: "Cleaner One",
    availabilityBlocks: [
      {
        date: "2026-07-06",
        summary: "Personal day",
      },
    ],
  });
  const record = mapQuoteOpsRowToStaffRecord(quoteOpsRow);

  assert.equal(record.availabilityBlocks.length, 1);
  assert.equal(record.availabilityBlocks[0].date, "2026-07-06");
  assert.equal(record.availabilityBlocks[0].summary, "Personal day");
});
