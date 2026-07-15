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
  const amOption = { disabled: false };
  const meridiemSelect = {
    value: initialMeridiem,
    querySelector(selector) {
      return selector === "option[value='AM']" ? amOption : null;
    },
  };
  const field = {
    querySelector(selector) {
      if (selector === "[data-admin-time-hour]") return hourSelect;
      return selector === "[data-admin-time-meridiem]" ? meridiemSelect : null;
    },
  };
  const hourSelect = {
    value: String(hourValue),
    closest(selector) {
      return selector === "[data-admin-picker-field='time']" ? field : null;
    },
  };
  return { amOption, field, hourSelect, meridiemSelect };
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

test("keeps 12 locked to PM", () => {
  const { enforceNoonMeridiem } = new Function(
    `${ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT}; return { enforceNoonMeridiem };`
  )();
  const picker = createTimePicker(12, "AM");

  enforceNoonMeridiem(picker.field);

  assert.equal(picker.meridiemSelect.value, "PM");
  assert.equal(picker.amOption.disabled, true);

  picker.hourSelect.value = "11";
  enforceNoonMeridiem(picker.field);
  assert.equal(picker.amOption.disabled, false);
});

test("converts a panel initialized from midnight to 12 PM", () => {
  const { syncTimePanelFromValue } = new Function(
    `${ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT}; return { syncTimePanelFromValue };`
  )();
  const picker = createTimePicker(1, "AM");
  const minuteSelect = { value: "30" };
  const originalQuerySelector = picker.field.querySelector.bind(picker.field);
  picker.field.querySelector = (selector) =>
    selector === "[data-admin-time-minute]" ? minuteSelect : originalQuerySelector(selector);

  syncTimePanelFromValue(picker.field, "00:00");

  assert.equal(picker.hourSelect.value, "12");
  assert.equal(minuteSelect.value, "00");
  assert.equal(picker.meridiemSelect.value, "PM");
  assert.equal(picker.amOption.disabled, true);
});
