"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  USER_SESSION_TTL_SECONDS,
  createUserSessionToken,
  loadUserAuthConfig,
  verifyUserSessionToken,
} = require("../lib/account-auth");

test("creates and verifies scoped user session tokens", () => {
  const config = loadUserAuthConfig({
    ADMIN_MASTER_SECRET: "admin_secret_test",
  });

  assert.equal(config.configured, true);

  const token = createUserSessionToken(
    config,
    {
      userId: "user-123",
      staffId: "staff-123",
      email: "alina@example.com",
    },
    { nowSeconds: 100 }
  );

  assert.deepEqual(verifyUserSessionToken(token, config, { nowSeconds: 101 }), {
    userId: "user-123",
    staffId: "staff-123",
    email: "alina@example.com",
  });

  assert.throws(
    () => verifyUserSessionToken(token, config, { nowSeconds: 100 + USER_SESSION_TTL_SECONDS + 1 }),
    /EXPIRED_USER_TOKEN/
  );
});
