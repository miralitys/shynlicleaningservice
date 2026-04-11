"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  USER_EMAIL_VERIFICATION_TTL_SECONDS,
  USER_SESSION_TTL_SECONDS,
  createUserEmailVerificationToken,
  createUserSessionToken,
  loadUserAuthConfig,
  verifyUserEmailVerificationToken,
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

test("creates and verifies user email confirmation tokens", () => {
  const config = loadUserAuthConfig({
    ADMIN_MASTER_SECRET: "admin_secret_test",
  });

  const token = createUserEmailVerificationToken(
    config,
    {
      userId: "user-456",
      email: "cleaner@example.com",
    },
    { nowSeconds: 500 }
  );

  assert.deepEqual(verifyUserEmailVerificationToken(token, config, { nowSeconds: 501 }), {
    userId: "user-456",
    email: "cleaner@example.com",
  });

  assert.throws(
    () => verifyUserEmailVerificationToken(token, config, { nowSeconds: 500 + USER_EMAIL_VERIFICATION_TTL_SECONDS + 1 }),
    /EXPIRED_USER_TOKEN/
  );
});
