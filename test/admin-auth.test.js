"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOtpauthUri,
  createAdminChallengeToken,
  createAdminSessionToken,
  generateTotpCode,
  getTotpSecretMaterial,
  hashPassword,
  loadAdminConfig,
  verifyAdminChallengeToken,
  verifyAdminSessionToken,
  verifyPassword,
  verifyTotpCode,
} = require("../lib/admin-auth");

test("verifies passwords against the configured scrypt hash", () => {
  const hash = hashPassword("StrongPassword123!");
  assert.equal(verifyPassword("StrongPassword123!", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("generates stable TOTP codes and validates them within the expected window", () => {
  const config = loadAdminConfig({
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_EMAIL: "info@shynli.com",
  });
  const nowMs = Date.UTC(2026, 3, 2, 4, 10, 0);
  const code = generateTotpCode(config, { nowMs });

  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(code, config, { nowMs }), true);
  assert.equal(verifyTotpCode(code, config, { nowMs: nowMs + 29_000 }), true);
  assert.equal(verifyTotpCode(code, config, { nowMs: nowMs + 120_000 }), false);

  const secret = getTotpSecretMaterial(config);
  assert.match(secret.base32, /^[A-Z2-7]+$/);
  assert.match(buildOtpauthUri(config), /^otpauth:\/\/totp\//);
});

test("issues and verifies signed challenge and session tokens", () => {
  const config = loadAdminConfig({
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_EMAIL: "info@shynli.com",
  });
  const payload = {
    email: config.email,
    fingerprint: "fingerprint123",
  };

  const challengeToken = createAdminChallengeToken(config, payload, { nowSeconds: 100 });
  const sessionToken = createAdminSessionToken(config, payload, { nowSeconds: 100 });

  assert.deepEqual(verifyAdminChallengeToken(challengeToken, config, { nowSeconds: 101 }), payload);
  assert.deepEqual(verifyAdminSessionToken(sessionToken, config, { nowSeconds: 101 }), payload);
  assert.throws(() => verifyAdminChallengeToken(challengeToken, config, { nowSeconds: 800 }), /expired/i);
});
