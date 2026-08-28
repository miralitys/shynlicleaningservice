"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldIncludeClientVisitRevenue } = require("../lib/admin/domain-client-records");

const NOW = new Date("2026-08-28T15:00:00.000Z"); // 10:00 AM in Chicago.

test("client revenue includes past visits and excludes future visits", () => {
  assert.equal(
    shouldIncludeClientVisitRevenue(
      { selectedDate: "2026-08-27", selectedTime: "03:30 PM", orderStatus: "completed" },
      { now: NOW }
    ),
    true
  );
  assert.equal(
    shouldIncludeClientVisitRevenue(
      { selectedDate: "2026-08-29", selectedTime: "09:00", orderStatus: "scheduled" },
      { now: NOW }
    ),
    false
  );
});

test("client revenue uses the appointment time for visits scheduled today", () => {
  assert.equal(
    shouldIncludeClientVisitRevenue(
      { selectedDate: "08/28/2026", selectedTime: "09:30 AM", orderStatus: "scheduled" },
      { now: NOW }
    ),
    true
  );
  assert.equal(
    shouldIncludeClientVisitRevenue(
      { selectedDate: "08/28/2026", selectedTime: "10:30 AM", orderStatus: "scheduled" },
      { now: NOW }
    ),
    false
  );
});

test("client revenue excludes canceled past visits", () => {
  assert.equal(
    shouldIncludeClientVisitRevenue(
      { selectedDate: "2026-08-01", selectedTime: "09:00", orderStatus: "canceled" },
      { now: NOW }
    ),
    false
  );
});

test("client revenue includes completed visits without a saved appointment date", () => {
  assert.equal(shouldIncludeClientVisitRevenue({ orderStatus: "paid" }, { now: NOW }), true);
  assert.equal(shouldIncludeClientVisitRevenue({ orderStatus: "scheduled" }, { now: NOW }), false);
});
