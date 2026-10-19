"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ADMIN_SHARED_RESPONSIVE_STYLES } = require("../lib/admin/render-shared-responsive-styles");

test("desktop workspace menu scrolls independently and is five percent smaller", () => {
  const desktop = ADMIN_SHARED_RESPONSIVE_STYLES.split("@media (min-width: 981px) {")[1].split("@media (max-width: 980px)")[0];
  assert.match(desktop, /\.admin-shell-with-sidebar:has\(> \.admin-sidebar > \.admin-sidebar-workspace-card\)/);
  assert.match(desktop, /grid-template-columns: 266px minmax\(0, 1fr\)/);
  assert.match(desktop, /zoom: 0\.95/);
  assert.match(desktop, /max-height: calc\(\(100dvh - 2 \* var\(--page-top-offset\)\) \/ 0\.95\)/);
  assert.match(desktop, /grid-auto-rows: max-content/);
  assert.match(desktop, /overflow-y: auto/);
  assert.match(desktop, /overscroll-behavior-y: contain/);
  assert.doesNotMatch(desktop, /\.admin-panel\s*\{|body\s*\{|transform:/);
});

test("mobile keeps the existing single-column menu without desktop sizing or scroll limits", () => {
  const mobile = ADMIN_SHARED_RESPONSIVE_STYLES.split("@media (max-width: 980px)")[1];
  assert.match(mobile, /\.admin-shell-with-sidebar\s*\{\s*grid-template-columns: 1fr/);
  assert.match(mobile, /\.admin-sidebar\s*\{\s*position: static/);
  assert.doesNotMatch(mobile, /zoom: 0\.95|max-height: calc\(\(100dvh|overscroll-behavior-y: contain/);
});
