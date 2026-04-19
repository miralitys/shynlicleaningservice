"use strict";

const crypto = require("node:crypto");

const DEFAULT_POLICY_TOKEN_TTL_SECONDS = 48 * 60 * 60;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

class PolicyAcceptanceTokenError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "PolicyAcceptanceTokenError";
    this.code = options.code || "POLICY_TOKEN_INVALID";
    this.status = Number.isFinite(options.status) ? options.status : 400;
  }
}

function getPolicyTokenSecret(env = process.env) {
  return (
    normalizeString(env.ORDER_POLICY_TOKEN_SECRET, 4000) ||
    normalizeString(env.ADMIN_MASTER_SECRET, 4000) ||
    normalizeString(env.QUOTE_SIGNING_SECRET, 4000) ||
    normalizeString(env.GHL_API_KEY, 4000)
  );
}

function getPolicyTokenTtlSeconds() {
  return DEFAULT_POLICY_TOKEN_TTL_SECONDS;
}

function signTokenPart(secret, encodedPayload) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createShortPolicyAccessCode() {
  return crypto.randomBytes(8).toString("base64url");
}

function createPolicyAcceptanceToken(payload, options = {}) {
  const env = options.env || process.env;
  const secret = getPolicyTokenSecret(env);
  if (!secret) return "";

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);

  const encodedPayload = Buffer.from(
    JSON.stringify({
      iat: nowSeconds,
      exp: nowSeconds + getPolicyTokenTtlSeconds(env),
      payload,
    }),
    "utf8"
  ).toString("base64url");

  return `${encodedPayload}.${signTokenPart(secret, encodedPayload)}`;
}

function decodeShortPolicyAcceptanceToken(token) {
  const rawToken = String(token || "").trim();
  const match = rawToken.match(/^([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{8,32})$/);
  if (!match) return null;
  return {
    bookingId: normalizeString(match[1], 120),
    publicCode: normalizeString(match[2], 64),
    rawToken,
    isShortToken: true,
  };
}

function decodePolicyAcceptanceToken(token, options = {}) {
  const env = options.env || process.env;
  const secret = getPolicyTokenSecret(env);
  if (!secret) {
    throw new PolicyAcceptanceTokenError("Policy confirmation is temporarily unavailable.", {
      code: "POLICY_TOKEN_UNAVAILABLE",
      status: 503,
    });
  }

  const rawToken = String(token || "").trim();
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || rawToken.split(".").length !== 2) {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  const expectedSignature = signTokenPart(secret, encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  let decoded = null;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  const payload = normalizeObject(decoded.payload);
  const bookingId = normalizeString(payload.bookingId, 120);
  const envelopeId = normalizeString(payload.envelopeId, 120);
  if (!bookingId || !envelopeId) {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  const expiresAtSeconds = Number(decoded.exp || 0);

  if (!options.ignoreExpiry && (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= nowSeconds)) {
    throw new PolicyAcceptanceTokenError("This confirmation link has expired.", {
      code: "POLICY_TOKEN_EXPIRED",
      status: 410,
    });
  }

  return {
    bookingId,
    envelopeId,
    iat: Number(decoded.iat || 0),
    exp: expiresAtSeconds,
  };
}

module.exports = {
  PolicyAcceptanceTokenError,
  createPolicyAcceptanceToken,
  decodePolicyAcceptanceToken,
  decodeShortPolicyAcceptanceToken,
  createShortPolicyAccessCode,
  getPolicyTokenSecret,
  getPolicyTokenTtlSeconds,
};
