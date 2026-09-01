"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ADMIN_SHARED_CORE_DATA_ENTRY_STYLES,
} = require("../lib/admin/render-shared-core-data-entry-styles");

test("time picker selects keep readable text in Chromium native controls", () => {
  assert.match(ADMIN_SHARED_CORE_DATA_ENTRY_STYLES, /\.admin-time-picker-select\s*\{[^}]*color-scheme:\s*light/s);
  assert.match(ADMIN_SHARED_CORE_DATA_ENTRY_STYLES, /\.admin-time-picker-select\s*\{[^}]*-webkit-text-fill-color:\s*#18181b/s);
  assert.match(ADMIN_SHARED_CORE_DATA_ENTRY_STYLES, /\.admin-time-picker-select\s*\{[^}]*font-size:\s*15px/s);
  assert.match(ADMIN_SHARED_CORE_DATA_ENTRY_STYLES, /\.admin-time-picker-select option\s*\{[^}]*background:\s*#ffffff/s);
});
