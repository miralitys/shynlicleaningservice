"use strict";

const crypto = require("node:crypto");
const adminAuth = require("./admin-auth");

const USER_SESSION_TTL_SECONDS = 12 * 60 * 60;
const USER_EMAIL_VERIFICATION_TTL_SECONDS = 7 * 24 * 60 * 60;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function loadUserAuthConfig(env = process.env) {
  const adminConfig = adminAuth.loadAdminConfig(env);
  return {
    configured: Boolean(adminConfig.masterSecret),
    masterSecret: adminConfig.masterSecret,
  };
}

function deriveScopedSecret(config, scope) {
  return crypto
    .createHmac("sha256", config.masterSecret)
    .update(`account:${scope}`)
    .digest();
}

function createSignedToken(payload, config, scope, ttlSeconds, options = {}) {
  if (!config || !config.masterSecret) {
    throw new Error("USER_AUTH_NOT_CONFIGURED");
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  const envelope = {
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    scope,
    payload,
  };
  const encodedPayload = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", deriveScopedSecret(config, `token:${scope}`))
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySignedToken(token, config, scope, options = {}) {
  if (!config || !config.masterSecret) {
    throw new Error("USER_AUTH_NOT_CONFIGURED");
  }

  const rawToken = normalizeString(token, 5000);
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || rawToken.split(".").length !== 2) {
    throw new Error("INVALID_USER_TOKEN");
  }

  const expected = crypto
    .createHmac("sha256", deriveScopedSecret(config, `token:${scope}`))
    .update(encodedPayload)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error("INVALID_USER_TOKEN");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("INVALID_USER_TOKEN");
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  if (!payload || payload.scope !== scope || !payload.payload || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
    throw new Error("EXPIRED_USER_TOKEN");
  }

  return payload.payload;
}

function createUserSessionToken(config, payload, options = {}) {
  return createSignedToken(payload, config, "session", USER_SESSION_TTL_SECONDS, options);
}

function verifyUserSessionToken(token, config, options = {}) {
  return verifySignedToken(token, config, "session", options);
}

function createUserEmailVerificationToken(config, payload, options = {}) {
  return createSignedToken(payload, config, "email-verify", USER_EMAIL_VERIFICATION_TTL_SECONDS, options);
}

function verifyUserEmailVerificationToken(token, config, options = {}) {
  return verifySignedToken(token, config, "email-verify", options);
}

module.exports = {
  USER_EMAIL_VERIFICATION_TTL_SECONDS,
  USER_SESSION_TTL_SECONDS,
  createUserEmailVerificationToken,
  createUserSessionToken,
  loadUserAuthConfig,
  verifyUserEmailVerificationToken,
  verifyUserSessionToken,
};
