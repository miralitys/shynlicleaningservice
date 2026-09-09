"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOrderPayrollSnapshot } = require("../lib/payroll");

test("splits percent compensation evenly across the assigned team", () => {
  const snapshot = buildOrderPayrollSnapshot({
    entry: {
      id: "entry-team-percent",
      totalPrice: "240",
    },
    assignment: {
      entryId: "entry-team-percent",
      staffIds: ["staff-a", "staff-b"],
    },
    staffRecords: [
      {
        id: "staff-a",
        name: "Anna",
        compensationType: "percent",
        compensationValue: "50",
      },
      {
        id: "staff-b",
        name: "Olga",
        compensationType: "percent",
        compensationValue: "50",
      },
    ],
  });

  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.items[0].compensationValue, "50");
  assert.equal(snapshot.items[0].appliedCompensationValue, "25");
  assert.equal(snapshot.items[0].teamSize, 2);
  assert.equal(snapshot.items[0].amountCents, 6000);
  assert.equal(snapshot.items[1].appliedCompensationValue, "25");
  assert.equal(snapshot.items[1].teamSize, 2);
  assert.equal(snapshot.items[1].amountCents, 6000);
});

test("keeps the full percent when the cleaner is assigned solo", () => {
  const snapshot = buildOrderPayrollSnapshot({
    entry: {
      id: "entry-solo-percent",
      totalPrice: "240",
    },
    assignment: {
      entryId: "entry-solo-percent",
      staffIds: ["staff-a"],
    },
    staffRecords: [
      {
        id: "staff-a",
        name: "Anna",
        compensationType: "percent",
        compensationValue: "50",
      },
    ],
  });

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].compensationValue, "50");
  assert.equal(snapshot.items[0].appliedCompensationValue, "50");
  assert.equal(snapshot.items[0].teamSize, 1);
  assert.equal(snapshot.items[0].amountCents, 12000);
});

test("uses a per-order fixed override for any assigned cleaner", () => {
  const snapshot = buildOrderPayrollSnapshot({
    entry: {
      id: "entry-fixed-override",
      totalPrice: "300",
      payloadForRetry: {
        adminOrder: {
          payrollOverrides: {
            "staff-z": "125.50",
          },
        },
      },
    },
    assignment: {
      entryId: "entry-fixed-override",
      staffIds: ["staff-z", "staff-a"],
    },
    staffRecords: [
      {
        id: "staff-z",
        name: "Zilola",
        compensationType: "percent",
        compensationValue: "55",
      },
      {
        id: "staff-a",
        name: "Anna",
        compensationType: "percent",
        compensationValue: "50",
      },
    ],
  });

  assert.equal(snapshot.items[0].compensationType, "fixed");
  assert.equal(snapshot.items[0].compensationValue, "125.50");
  assert.equal(snapshot.items[0].amountCents, 12550);
  assert.equal(snapshot.items[1].compensationType, "percent");
  assert.equal(snapshot.items[1].amountCents, 7500);
});
