"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT,
} = require("../lib/admin/render-shared-picker-multiselect-script");

function loadDefaultMeridiemSync() {
  return new Function(
    `${ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT}; return syncDefaultTimeMeridiemFromHour;`
  )();
}

function createTimePicker(hourValue, initialMeridiem = "AM") {
  const meridiemSelect = { value: initialMeridiem };
  const field = {
    querySelector(selector) {
      return selector === "[data-admin-time-meridiem]" ? meridiemSelect : null;
    },
  };
  const hourSelect = {
    value: String(hourValue),
    closest(selector) {
      return selector === "[data-admin-picker-field='time']" ? field : null;
    },
  };
  return { hourSelect, meridiemSelect };
}

test("defaults 12 PM and afternoon hours 1 through 6 to PM", () => {
  const syncDefaultTimeMeridiemFromHour = loadDefaultMeridiemSync();

  for (const hour of [12, 1, 2, 3, 4, 5, 6]) {
    const picker = createTimePicker(hour, "AM");
    syncDefaultTimeMeridiemFromHour(picker.hourSelect);
    assert.equal(picker.meridiemSelect.value, "PM", `expected ${hour} to default to PM`);
  }
});

test("defaults morning hours 7 through 11 to AM", () => {
  const syncDefaultTimeMeridiemFromHour = loadDefaultMeridiemSync();

  for (const hour of [7, 8, 9, 10, 11]) {
    const picker = createTimePicker(hour, "PM");
    syncDefaultTimeMeridiemFromHour(picker.hourSelect);
    assert.equal(picker.meridiemSelect.value, "AM", `expected ${hour} to default to AM`);
  }
});
