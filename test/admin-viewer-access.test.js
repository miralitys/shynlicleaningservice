"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminAuthHandlers } = require("../lib/admin/handlers-auth-dispatcher");

function normalizeString(value, maxLength = 0) {
  const normalized = String(value || "").trim();
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

test("viewer can open the admin workspace but cannot mutate it", () => {
  const handlers = createAdminAuthHandlers({
    ACCOUNT_LOGOUT_PATH: "/account/logout",
    ACCOUNT_ROOT_PATH: "/account",
    ADMIN_LOGOUT_PATH: "/admin/logout",
    normalizeString,
  });

  const access = handlers.buildCurrentUserAccess(null, {
    user: {
      id: "eva-viewer",
      email: "eva@shynli.local",
      role: "viewer",
      status: "active",
      isEmployee: false,
    },
  });

  assert.equal(access.authorized, true);
  assert.equal(access.canEdit, false);
  assert.equal(access.canDelete, false);
  assert.equal(access.redirectToAccount, false);
  assert.equal(access.role, "viewer");
});
