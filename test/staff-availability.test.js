"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_STAFF_UNAVAILABLE_SUMMARY,
  findStaffAvailabilityConflicts,
  removeStaffAvailabilityBlock,
  sanitizeStaffAvailabilityBlocks,
  upsertStaffAvailabilityBlock,
} = require("../lib/staff-availability");

test("sanitizes and upserts manual staff unavailable days", () => {
  const first = upsertStaffAvailabilityBlock([], {
    date: "2026-07-06",
    summary: "Vacation",
  });

  assert.equal(first.length, 1);
  assert.equal(first[0].date, "2026-07-06");
  assert.equal(first[0].summary, "Vacation");
  assert.equal(first[0].source, "manual");
  assert.equal(first[0].allDay, true);
  assert.equal(first[0].endDate, "2026-07-07");

  const updated = upsertStaffAvailabilityBlock(first, {
    date: "2026-07-06",
    summary: "",
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].summary, DEFAULT_STAFF_UNAVAILABLE_SUMMARY);

  const removed = removeStaffAvailabilityBlock(updated, "2026-07-06");
  assert.deepEqual(removed, []);
});

test("finds staff assignment conflicts for manual unavailable days", () => {
  const conflicts = findStaffAvailabilityConflicts(
    [
      {
        id: "ramis",
        name: "Ramis",
        availabilityBlocks: sanitizeStaffAvailabilityBlocks([
          {
            date: "2026-07-06",
            summary: "Doctor",
          },
        ]),
      },
      {
        id: "tolkun",
        name: "Tolkun",
        availabilityBlocks: [],
      },
    ],
    ["ramis", "tolkun"],
    "2026-07-06"
  );

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].staffId, "ramis");
  assert.equal(conflicts[0].name, "Ramis");
  assert.equal(conflicts[0].label, "Doctor");
});
