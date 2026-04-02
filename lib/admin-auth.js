"use strict";

const crypto = require("node:crypto");

const DEFAULT_ADMIN_EMAIL = "info@shynli.com";
const DEFAULT_ADMIN_PASSWORD_HASH =
  "scrypt$16384$8$1$121ae6b487ec71168d083c5e0094a3b1$322130562c8f8e012372d90c7858eee6a1e6a5b7f3de4fcf5308d59c630d65620371d9c7ad234cc214035da492f924f79cb6bb83f0b72f77f0b0f0da1a9acbdf";
const DEFAULT_TOTP_ISSUER = "SHYNLI Admin";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

class AdminAuthError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AdminAuthError";
    this.code = options.code || "ADMIN_AUTH_ERROR";
    this.status = Number.isFinite(options.status) ? options.status : 500;
  }
}

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 320).toLowerCase();
}

function normalizeBase32Secret(value) {
  return normalizeString(value, 256)
    .replace(/\s+/g, "")
    .replace(/=+$/g, "")
    .toUpperCase();
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseScryptHash(value) {
  const raw = normalizeString(value, 2048);
  const [algorithm, nValue, rValue, pValue, saltHex, hashHex] = raw.split("$");
  if (algorithm !== "scrypt" || !nValue || !rValue || !pValue || !saltHex || !hashHex) {
    throw new AdminAuthError("Invalid admin password hash format", {
      code: "INVALID_ADMIN_PASSWORD_HASH",
      status: 500,
    });
  }

  const N = Number.parseInt(nValue, 10);
  const r = Number.parseInt(rValue, 10);
  const p = Number.parseInt(pValue, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || N <= 1 || r <= 0 || p <= 0) {
    throw new AdminAuthError("Invalid admin password hash parameters", {
      code: "INVALID_ADMIN_PASSWORD_HASH",
      status: 500,
    });
  }

  return {
    N,
    r,
    p,
    salt: Buffer.from(saltHex, "hex"),
    hash: Buffer.from(hashHex, "hex"),
  };
}

function hashPassword(password, options = {}) {
  const N = Number.isFinite(options.N) ? options.N : 16384;
  const r = Number.isFinite(options.r) ? options.r : 8;
  const p = Number.isFinite(options.p) ? options.p : 1;
  const keyLength = Number.isFinite(options.keyLength) ? options.keyLength : 64;
  const salt = options.salt
    ? Buffer.isBuffer(options.salt)
      ? options.salt
      : Buffer.from(String(options.salt), "hex")
    : crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password || ""), salt, keyLength, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(password, passwordHash) {
  const parsed = parseScryptHash(passwordHash);
  const derived = crypto.scryptSync(String(password || ""), parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: 64 * 1024 * 1024,
  });
  if (derived.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(derived, parsed.hash);
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(value) {
  const normalized = normalizeBase32Secret(value);
  if (!normalized) return Buffer.alloc(0);

  let bits = 0;
  let current = 0;
  const bytes = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new AdminAuthError("Invalid TOTP secret format", {
        code: "INVALID_ADMIN_TOTP_SECRET",
        status: 500,
      });
    }
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function deriveMasterSecret(env = process.env) {
  return normalizeString(
    env.ADMIN_MASTER_SECRET || env.QUOTE_SIGNING_SECRET || env.GHL_API_KEY || env.STRIPE_SECRET_KEY,
    2048
  );
}

function loadAdminConfig(env = process.env) {
  const email = normalizeEmail(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  const passwordHash = normalizeString(env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_PASSWORD_HASH, 2048);
  const issuer = normalizeString(env.ADMIN_TOTP_ISSUER || DEFAULT_TOTP_ISSUER, 120) || DEFAULT_TOTP_ISSUER;
  const masterSecret = deriveMasterSecret(env);
  const configuredTotpSecret = normalizeBase32Secret(env.ADMIN_TOTP_SECRET);

  return {
    configured: Boolean(email && passwordHash && masterSecret),
    email,
    passwordHash,
    issuer,
    masterSecret,
    configuredTotpSecret,
  };
}

function deriveScopedSecret(config, scope) {
  return crypto
    .createHmac("sha256", config.masterSecret)
    .update(`admin:${scope}`)
    .digest();
}

function getTotpSecretMaterial(config) {
  if (!config || !config.masterSecret) {
    throw new AdminAuthError("Admin authentication is not configured", {
      code: "ADMIN_NOT_CONFIGURED",
      status: 503,
    });
  }

  if (config.configuredTotpSecret) {
    return {
      base32: config.configuredTotpSecret,
      raw: base32Decode(config.configuredTotpSecret),
      derived: false,
    };
  }

  const raw = crypto
    .createHmac("sha256", config.masterSecret)
    .update(`admin:totp:${config.email}:${config.passwordHash}`)
    .digest()
    .subarray(0, 20);
  return {
    base32: base32Encode(raw),
    raw,
    derived: true,
  };
}

function getTotpCounter(nowMs = Date.now()) {
  return Math.floor(Math.max(0, nowMs) / 1000 / TOTP_PERIOD_SECONDS);
}

function generateHotp(rawSecret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", rawSecret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function generateTotpCode(config, options = {}) {
  const secret = getTotpSecretMaterial(config);
  return generateHotp(secret.raw, getTotpCounter(options.nowMs));
}

function verifyTotpCode(code, config, options = {}) {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  if (normalizedCode.length !== TOTP_DIGITS) return false;

  const secret = getTotpSecretMaterial(config);
  const counter = getTotpCounter(options.nowMs);
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    const candidate = generateHotp(secret.raw, counter + offset);
    if (timingSafeEqualString(candidate, normalizedCode)) return true;
  }
  return false;
}

function buildOtpauthUri(config) {
  const secret = getTotpSecretMaterial(config);
  const label = `${config.issuer}:${config.email}`;
  const params = new URLSearchParams({
    secret: secret.base32,
    issuer: config.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function createSignedToken(payload, config, scope, ttlSeconds, options = {}) {
  if (!config || !config.masterSecret) {
    throw new AdminAuthError("Admin authentication is not configured", {
      code: "ADMIN_NOT_CONFIGURED",
      status: 503,
    });
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
    throw new AdminAuthError("Admin authentication is not configured", {
      code: "ADMIN_NOT_CONFIGURED",
      status: 503,
    });
  }

  const rawToken = normalizeString(token, 5000);
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || rawToken.split(".").length !== 2) {
    throw new AdminAuthError("Invalid authentication token", {
      code: "INVALID_ADMIN_TOKEN",
      status: 401,
    });
  }

  const expected = crypto
    .createHmac("sha256", deriveScopedSecret(config, `token:${scope}`))
    .update(encodedPayload)
    .digest("base64url");
  if (!timingSafeEqualString(expected, signature)) {
    throw new AdminAuthError("Invalid authentication token", {
      code: "INVALID_ADMIN_TOKEN",
      status: 401,
    });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new AdminAuthError("Invalid authentication token", {
      code: "INVALID_ADMIN_TOKEN",
      status: 401,
    });
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  if (!payload || payload.scope !== scope || !payload.payload || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
    throw new AdminAuthError("Authentication token expired", {
      code: "EXPIRED_ADMIN_TOKEN",
      status: 401,
    });
  }

  return payload.payload;
}

function createAdminChallengeToken(config, payload, options = {}) {
  return createSignedToken(payload, config, "challenge", CHALLENGE_TTL_SECONDS, options);
}

function verifyAdminChallengeToken(token, config, options = {}) {
  return verifySignedToken(token, config, "challenge", options);
}

function createAdminSessionToken(config, payload, options = {}) {
  return createSignedToken(payload, config, "session", SESSION_TTL_SECONDS, options);
}

function verifyAdminSessionToken(token, config, options = {}) {
  return verifySignedToken(token, config, "session", options);
}

module.exports = {
  AdminAuthError,
  CHALLENGE_TTL_SECONDS,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD_HASH,
  DEFAULT_TOTP_ISSUER,
  SESSION_TTL_SECONDS,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
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
};
