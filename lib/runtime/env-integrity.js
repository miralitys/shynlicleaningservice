"use strict";

const FALLBACK_GA_MEASUREMENT_ID = "G-0MXV4JBP67";

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function isHex(value) {
  return /^[0-9a-f]+$/i.test(String(value || ""));
}

function isValidScryptHash(value) {
  const raw = String(value || "").trim();
  const [algorithm, nValue, rValue, pValue, saltHex, hashHex] = raw.split("$");
  if (algorithm !== "scrypt" || !nValue || !rValue || !pValue || !saltHex || !hashHex) return false;
  const N = Number.parseInt(nValue, 10);
  const r = Number.parseInt(rValue, 10);
  const p = Number.parseInt(pValue, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || N <= 1 || r <= 0 || p <= 0) return false;
  if (saltHex.length % 2 !== 0 || hashHex.length % 2 !== 0) return false;
  if (!isHex(saltHex) || !isHex(hashHex)) return false;
  return true;
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["warn", "gate", "fail"].includes(normalized)) return normalized;
  return "warn";
}

function evaluateStartupEnvIntegrity(env = process.env) {
  const mode = normalizeMode(env.STARTUP_ENV_MODE);
  const issues = [];

  const hasPublicSiteOrigin = hasValue(env.PUBLIC_SITE_ORIGIN) || hasValue(env.SITE_BASE_URL);
  const hasAnalyticsMeasurementId = hasValue(env.GOOGLE_ANALYTICS_MEASUREMENT_ID);
  const hasQuoteSigningSecret = hasValue(env.QUOTE_SIGNING_SECRET);
  const hasGhlApiKey = hasValue(env.GHL_API_KEY);
  const hasStripeSecretKey = hasValue(env.STRIPE_SECRET_KEY);
  const hasStripeWebhookSecret = hasValue(env.STRIPE_WEBHOOK_SECRET);
  const hasGhlInboundSmsWebhookSecret = hasValue(env.GHL_INBOUND_SMS_WEBHOOK_SECRET);
  const hasExplicitAdminMasterSecret = hasValue(env.ADMIN_MASTER_SECRET);
  const hasDerivedAdminSecretSource = hasQuoteSigningSecret || hasGhlApiKey || hasStripeSecretKey;
  const adminSecretAvailable = hasExplicitAdminMasterSecret || hasDerivedAdminSecretSource;
  const hasExplicitAdminPasswordHash = hasValue(env.ADMIN_PASSWORD_HASH);
  const hasValidExplicitAdminPasswordHash =
    !hasExplicitAdminPasswordHash || isValidScryptHash(env.ADMIN_PASSWORD_HASH);

  if (!hasPublicSiteOrigin) {
    issues.push({
      code: "PUBLIC_SITE_ORIGIN_FALLBACK",
      severity: "warn",
    });
  }

  if (!hasAnalyticsMeasurementId) {
    issues.push({
      code: "GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK",
      severity: "warn",
      fallback: FALLBACK_GA_MEASUREMENT_ID,
    });
  }

  if (adminSecretAvailable && !hasExplicitAdminPasswordHash) {
    issues.push({
      code: "DEFAULT_ADMIN_PASSWORD_HASH",
      severity: "blocking",
    });
  }

  if (adminSecretAvailable && hasExplicitAdminPasswordHash && !hasValidExplicitAdminPasswordHash) {
    issues.push({
      code: "INVALID_ADMIN_PASSWORD_HASH",
      severity: "blocking",
    });
  }

  if (!hasExplicitAdminMasterSecret && hasDerivedAdminSecretSource) {
    issues.push({
      code: "ADMIN_MASTER_SECRET_DERIVED",
      severity: "blocking",
    });
  }

  if ((hasStripeSecretKey || hasGhlApiKey) && !hasQuoteSigningSecret) {
    issues.push({
      code: "QUOTE_SIGNING_SECRET_MISSING",
      severity: "blocking",
    });
  }

  if (hasStripeSecretKey && !hasStripeWebhookSecret) {
    issues.push({
      code: "STRIPE_WEBHOOK_SECRET_MISSING",
      severity: "warn",
    });
  }

  if (hasGhlApiKey && !hasGhlInboundSmsWebhookSecret) {
    issues.push({
      code: "GHL_INBOUND_SMS_WEBHOOK_SECRET_MISSING",
      severity: "warn",
    });
  }

  const blockingIssueCodes = issues
    .filter((issue) => issue.severity === "blocking")
    .map((issue) => issue.code);
  const warningIssueCodes = issues
    .filter((issue) => issue.severity !== "blocking")
    .map((issue) => issue.code);

  return {
    mode,
    ok: blockingIssueCodes.length === 0,
    readinessOk: mode !== "gate" || blockingIssueCodes.length === 0,
    issueCodes: issues.map((issue) => issue.code),
    blockingIssueCodes,
    warningIssueCodes,
    issues,
  };
}

module.exports = {
  FALLBACK_GA_MEASUREMENT_ID,
  evaluateStartupEnvIntegrity,
  isValidScryptHash,
};
