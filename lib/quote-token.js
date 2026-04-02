"use strict";

const crypto = require("node:crypto");

const DEFAULT_QUOTE_TOKEN_TTL_SECONDS = 15 * 60;

class QuoteTokenError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "QuoteTokenError";
    this.code = options.code || "INVALID_QUOTE_TOKEN";
    this.status = Number.isFinite(options.status) ? options.status : 400;
  }
}

function normalizeSecret(value) {
  return String(value || "").trim();
}

function getQuoteTokenSecret(env = process.env) {
  return (
    normalizeSecret(env.QUOTE_SIGNING_SECRET) ||
    normalizeSecret(env.STRIPE_SECRET_KEY) ||
    normalizeSecret(env.GHL_API_KEY)
  );
}

function getQuoteTokenTtlSeconds(env = process.env) {
  const parsed = Number.parseInt(String(env.QUOTE_TOKEN_TTL_SECONDS || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_QUOTE_TOKEN_TTL_SECONDS;
  return Math.min(parsed, 24 * 60 * 60);
}

function signPart(secret, encodedPayload) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createQuoteToken(payload, options = {}) {
  const env = options.env || process.env;
  const secret = getQuoteTokenSecret(env);
  if (!secret) return "";

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);

  const encodedPayload = Buffer.from(
    JSON.stringify({
      iat: nowSeconds,
      exp: nowSeconds + getQuoteTokenTtlSeconds(env),
      payload,
    }),
    "utf8"
  ).toString("base64url");

  return `${encodedPayload}.${signPart(secret, encodedPayload)}`;
}

function verifyQuoteToken(token, options = {}) {
  const env = options.env || process.env;
  const secret = getQuoteTokenSecret(env);
  if (!secret) {
    throw new QuoteTokenError("Payments are temporarily unavailable.", {
      code: "QUOTE_TOKEN_UNAVAILABLE",
      status: 503,
    });
  }

  const rawToken = String(token || "").trim();
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || rawToken.split(".").length !== 2) {
    throw new QuoteTokenError("Invalid quote token.");
  }

  const expectedSignature = signPart(secret, encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new QuoteTokenError("Invalid quote token.");
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new QuoteTokenError("Invalid quote token.");
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);

  if (!decoded || typeof decoded !== "object" || !decoded.payload) {
    throw new QuoteTokenError("Invalid quote token.");
  }

  if (!Number.isFinite(decoded.exp) || decoded.exp <= nowSeconds) {
    throw new QuoteTokenError("Quote token expired. Please submit the quote again.", {
      code: "QUOTE_TOKEN_EXPIRED",
      status: 410,
    });
  }

  return decoded.payload;
}

module.exports = {
  QuoteTokenError,
  createQuoteToken,
  getQuoteTokenSecret,
  getQuoteTokenTtlSeconds,
  verifyQuoteToken,
};
