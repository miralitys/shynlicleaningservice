"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateStartupEnvIntegrity,
  isValidScryptHash,
} = require("../lib/runtime/env-integrity");

test("accepts the current scrypt admin password hash format", () => {
  assert.equal(
    isValidScryptHash(
      "scrypt$16384$8$1$121ae6b487ec71168d083c5e0094a3b1$322130562c8f8e012372d90c7858eee6a1e6a5b7f3de4fcf5308d59c630d65620371d9c7ad234cc214035da492f924f79cb6bb83f0b72f77f0b0f0da1a9acbdf"
    ),
    true
  );
  assert.equal(isValidScryptHash("not-a-hash"), false);
});

test("flags invalid explicit admin password hashes when admin secrets are available", () => {
  const result = evaluateStartupEnvIntegrity({
    STARTUP_ENV_MODE: "gate",
    QUOTE_SIGNING_SECRET: "quote-secret",
    ADMIN_PASSWORD_HASH: "not-a-hash",
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockingIssueCodes.includes("INVALID_ADMIN_PASSWORD_HASH"));
});

test("warn mode keeps the site ready when only fallback warnings are present", () => {
  const result = evaluateStartupEnvIntegrity({
    STARTUP_ENV_MODE: "warn",
  });

  assert.equal(result.ok, true);
  assert.equal(result.readinessOk, true);
  assert.ok(result.warningIssueCodes.includes("PUBLIC_SITE_ORIGIN_FALLBACK"));
  assert.ok(result.warningIssueCodes.includes("GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK"));
});
