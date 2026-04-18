"use strict";

const crypto = require("crypto");

function createAdminDomainAuth(deps = {}) {
  const {
    ADMIN_CHALLENGE_COOKIE,
    ADMIN_SESSION_COOKIE,
    GOOGLE_PLACES_API_KEY,
    PERF_ENDPOINT_ENABLED,
    PERF_ENDPOINT_TOKEN,
    adminAuth,
    getClientAddress,
    getQuoteTokenSecret,
    getQuoteTokenTtlSeconds,
    loadLeadConnectorConfig,
    loadSupabaseQuoteOpsConfig,
    normalizeString,
    parseCookies,
    shouldTrustProxyHeaders,
    shouldUseSecureCookies,
  } = deps;

  function getAdminConfig() {
    if (!adminAuth) return null;
    const config = adminAuth.loadAdminConfig(process.env);
    return config.configured ? config : null;
  }

  function getAdminRequestFingerprint(req) {
    const userAgent = normalizeString(req.headers["user-agent"], 240);
    const acceptLanguage = normalizeString(req.headers["accept-language"], 240);
    const clientAddress = shouldTrustProxyHeaders(req) ? getClientAddress(req) : "";
    return crypto
      .createHash("sha256")
      .update(`${clientAddress}|${userAgent}|${acceptLanguage}`)
      .digest("hex")
      .slice(0, 32);
  }

  function getAdminCookieOptions(req) {
    return {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: shouldUseSecureCookies(req),
    };
  }

  function getAdminAuthState(req) {
    const config = getAdminConfig();
    const cookies = parseCookies(req.headers.cookie);
    const fingerprint = getAdminRequestFingerprint(req);
    const state = {
      config,
      fingerprint,
      session: null,
      challenge: null,
      cookies,
    };

    if (!config) return state;

    try {
      const sessionPayload = adminAuth.verifyAdminSessionToken(cookies[ADMIN_SESSION_COOKIE], config);
      if (sessionPayload && sessionPayload.email === config.email && sessionPayload.fingerprint === fingerprint) {
        state.session = sessionPayload;
      }
    } catch {}

    try {
      const challengePayload = adminAuth.verifyAdminChallengeToken(cookies[ADMIN_CHALLENGE_COOKIE], config);
      if (challengePayload && challengePayload.email === config.email && challengePayload.fingerprint === fingerprint) {
        state.challenge = challengePayload;
      }
    } catch {}

    return state;
  }

  function getLeadConnectorAdminState() {
    if (typeof loadLeadConnectorConfig !== "function") {
      return {
        available: false,
        configured: false,
        config: null,
        error: "LeadConnector module is not available in this build.",
      };
    }

    try {
      const config = loadLeadConnectorConfig(process.env);
      return {
        available: true,
        configured: Boolean(config && config.configured),
        config,
        error: "",
      };
    } catch (error) {
      return {
        available: true,
        configured: false,
        config: null,
        error: normalizeString(
          error && error.message ? error.message : "Invalid LeadConnector configuration",
          200
        ),
      };
    }
  }

  function getAdminIntegrationState() {
    const leadConnector = getLeadConnectorAdminState();
    const stripeConfigured = Boolean(normalizeString(process.env.STRIPE_SECRET_KEY, 256));
    const quoteTokenSecret = getQuoteTokenSecret(process.env);
    const supabaseConfig =
      typeof loadSupabaseQuoteOpsConfig === "function"
        ? loadSupabaseQuoteOpsConfig(process.env)
        : { configured: false, url: "", serviceRoleKey: "", tableName: "" };
    return {
      leadConnector,
      stripeConfigured,
      placesConfigured: Boolean(GOOGLE_PLACES_API_KEY),
      supabaseConfigured: Boolean(supabaseConfig.configured),
      supabaseUrl: supabaseConfig.url,
      supabaseTableName: supabaseConfig.tableName || "",
      quoteTokenConfigured: Boolean(quoteTokenSecret),
      quoteTokenTtlSeconds: Number(getQuoteTokenTtlSeconds(process.env) || 0),
      perfEndpointEnabled: PERF_ENDPOINT_ENABLED,
      perfTokenPresent: Boolean(PERF_ENDPOINT_TOKEN),
      perfProtected: PERF_ENDPOINT_ENABLED && Boolean(PERF_ENDPOINT_TOKEN),
    };
  }

  return {
    getAdminAuthState,
    getAdminCookieOptions,
    getAdminIntegrationState,
  };
}

module.exports = {
  createAdminDomainAuth,
};
