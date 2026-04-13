"use strict";

const crypto = require("node:crypto");

const {
  buildInviteEmailCopy,
  buildW9ReminderEmailCopy,
} = require("./account-invite-email");
const { sanitizeMailConnection } = require("./admin-mail-store");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/";
const GOOGLE_MAIL_SCOPE = "openid email https://www.googleapis.com/auth/gmail.send";
const GOOGLE_STATE_MAX_AGE_MS = 15 * 60 * 1000;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizeOrigin(value) {
  const raw = normalizeString(value, 500);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function deriveScopedSecret(secret, scope) {
  return crypto
    .createHmac("sha256", String(secret || ""))
    .update(`admin-google-mail:${scope}`)
    .digest("hex");
}

function signState(payload, secret) {
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", deriveScopedSecret(secret, "state"))
    .update(body)
    .digest("hex");
  return `${body}.${signature}`;
}

function verifyState(token, secret) {
  const raw = normalizeString(token, 6000);
  const [body, signature] = raw.split(".");
  if (!body || !signature) {
    throw new Error("GOOGLE_STATE_INVALID");
  }

  const expectedSignature = crypto
    .createHmac("sha256", deriveScopedSecret(secret, "state"))
    .update(body)
    .digest("hex");

  if (
    expectedSignature.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedSignature, "utf8"), Buffer.from(signature, "utf8"))
  ) {
    throw new Error("GOOGLE_STATE_INVALID");
  }

  const payload = JSON.parse(decodeBase64Url(body).toString("utf8"));
  const issuedAt = Number(payload && payload.iat);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > GOOGLE_STATE_MAX_AGE_MS) {
    throw new Error("GOOGLE_STATE_EXPIRED");
  }
  return payload;
}

function encryptTokenPayload(payload, secret) {
  if (!isObject(payload)) return null;
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(deriveScopedSecret(secret, "token-encryption"), salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: ciphertext.toString("base64"),
  };
}

function decryptTokenPayload(payload, secret) {
  const version = Number(payload && payload.version);
  const salt = normalizeString(payload && payload.salt, 128);
  const iv = normalizeString(payload && payload.iv, 128);
  const tag = normalizeString(payload && payload.tag, 128);
  const data = normalizeString(payload && payload.data, 12000);
  if (version !== 1 || !salt || !iv || !tag || !data) {
    throw new Error("GOOGLE_MAIL_TOKEN_PAYLOAD_INVALID");
  }

  const key = crypto.scryptSync(
    deriveScopedSecret(secret, "token-encryption"),
    Buffer.from(salt, "hex"),
    32
  );
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function extractEmailAddress(value) {
  const raw = normalizeString(value, 320);
  if (!raw) return "";
  const bracketMatch = raw.match(/<([^>]+)>/);
  if (bracketMatch && bracketMatch[1]) {
    return normalizeEmail(bracketMatch[1]);
  }
  return normalizeEmail(raw);
}

function buildMimeMessage({ from, to, replyTo = "", subject, html, text }) {
  const boundary = `shynli_${crypto.randomUUID()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${normalizeString(subject, 240)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    String(text || ""),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    String(html || ""),
    "",
    `--${boundary}--`,
    "",
  ];

  return encodeBase64Url(lines.join("\r\n"));
}

function parseJsonResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadAdminGoogleMailConfig(env = process.env, options = {}) {
  const siteOrigin = normalizeOrigin(
    options.siteOrigin || env.PUBLIC_SITE_ORIGIN || env.SITE_BASE_URL || "https://shynlicleaningservice.com"
  );
  const clientId = normalizeString(
    env.GOOGLE_MAIL_CLIENT_ID || env.GOOGLE_CALENDAR_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID,
    400
  );
  const clientSecret = normalizeString(
    env.GOOGLE_MAIL_CLIENT_SECRET || env.GOOGLE_CALENDAR_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET,
    400
  );
  const redirectPath =
    normalizeString(env.GOOGLE_MAIL_REDIRECT_PATH, 160) || "/admin/google-mail/callback";
  const redirectUri = siteOrigin ? new URL(redirectPath, `${siteOrigin}/`).toString() : "";
  const scope = normalizeString(env.GOOGLE_MAIL_SCOPE, 500) || GOOGLE_MAIL_SCOPE;

  return {
    configured: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectPath,
    redirectUri,
    scope,
    siteOrigin,
  };
}

function sanitizeGoogleMailConnection(input = {}) {
  return sanitizeMailConnection(input);
}

function createAdminGoogleMailClient(options = {}) {
  const config =
    options.config || loadAdminGoogleMailConfig(options.env || process.env, options);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Google Mail.");
  }

  async function requestJson(url, requestOptions = {}) {
    const headers = {
      ...(requestOptions.headers || {}),
    };

    const response = await fetchImpl(String(url), {
      ...requestOptions,
      headers,
    });
    const text = await response.text();
    const body = parseJsonResponse(text);
    if (!response.ok) {
      const error = new Error(
        body && typeof body === "object"
          ? normalizeString(
              body.error_description ||
                (body.error && body.error.message) ||
                body.message ||
                body.error,
              500
            )
          : `Google Mail request failed with status ${response.status}`
      );
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  async function requestGoogleApi(pathname, accessToken, requestOptions = {}) {
    const url = new URL(pathname, GOOGLE_GMAIL_API_BASE_URL);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
      ...(requestOptions.headers || {}),
    };
    return requestJson(url.toString(), {
      ...requestOptions,
      headers,
    });
  }

  async function exchangeAuthorizationCode(code) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: normalizeString(code, 4000),
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });
    return requestJson(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  async function refreshAccessToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: normalizeString(refreshToken, 4000),
      grant_type: "refresh_token",
    });
    return requestJson(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  async function getUserInfo(accessToken) {
    return requestJson(GOOGLE_USERINFO_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async function getAuthorizedConnection(connection, secret) {
    const normalizedConnection = sanitizeGoogleMailConnection(connection);
    if (!normalizedConnection) {
      throw new Error("GOOGLE_MAIL_CONNECTION_MISSING");
    }

    const tokens = decryptTokenPayload(normalizedConnection.tokenCipher, secret);
    const accessToken = normalizeString(tokens.accessToken, 4000);
    const refreshTokenValue = normalizeString(tokens.refreshToken, 4000);
    const tokenExpiresAt = normalizeString(
      tokens.tokenExpiresAt || normalizedConnection.tokenExpiresAt,
      80
    );
    const expiresAtMs = Date.parse(tokenExpiresAt);
    const expiresSoon = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60 * 1000;

    if (accessToken && !expiresSoon) {
      return {
        accessToken,
        connection: normalizedConnection,
        changed: false,
      };
    }

    if (!refreshTokenValue) {
      throw new Error("GOOGLE_MAIL_REFRESH_TOKEN_MISSING");
    }

    const refreshed = await refreshAccessToken(refreshTokenValue);
    const nextTokens = {
      accessToken: normalizeString(refreshed.access_token, 4000),
      refreshToken: normalizeString(refreshed.refresh_token, 4000) || refreshTokenValue,
      tokenExpiresAt: new Date(
        Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000
      ).toISOString(),
    };
    const nextConnection = sanitizeGoogleMailConnection({
      ...normalizedConnection,
      tokenCipher: encryptTokenPayload(nextTokens, secret),
      tokenExpiresAt: nextTokens.tokenExpiresAt,
      updatedAt: new Date().toISOString(),
      lastError: "",
    });

    return {
      accessToken: nextTokens.accessToken,
      connection: nextConnection,
      changed: true,
    };
  }

  return {
    config,
    isConfigured() {
      return Boolean(config.configured);
    },
    buildConnectUrl({ secret, loginHint = "" } = {}) {
      if (!config.configured) {
        throw new Error("GOOGLE_MAIL_NOT_CONFIGURED");
      }
      const state = signState({ iat: Date.now() }, secret);
      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", config.scope);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      if (loginHint) {
        url.searchParams.set("login_hint", normalizeEmail(loginHint));
      }
      return url.toString();
    },
    async exchangeCode({ code, state, secret }) {
      if (!config.configured) {
        throw new Error("GOOGLE_MAIL_NOT_CONFIGURED");
      }
      verifyState(state, secret);
      const tokens = await exchangeAuthorizationCode(code);
      const accessToken = normalizeString(tokens.access_token, 4000);
      const refreshTokenValue = normalizeString(tokens.refresh_token, 4000);
      if (!accessToken || !refreshTokenValue) {
        throw new Error("GOOGLE_MAIL_TOKEN_RESPONSE_INVALID");
      }

      const userInfo = await getUserInfo(accessToken);
      const accountEmail = normalizeEmail(userInfo && userInfo.email);
      if (!accountEmail) {
        throw new Error("GOOGLE_MAIL_ACCOUNT_EMAIL_MISSING");
      }

      const tokenExpiresAt = new Date(
        Date.now() + Math.max(60, Number(tokens.expires_in || 3600)) * 1000
      ).toISOString();

      return {
        connection: sanitizeGoogleMailConnection({
          id: "invite-email",
          provider: "google-mail",
          status: "connected",
          accountEmail,
          scope: config.scope,
          tokenCipher: encryptTokenPayload(
            {
              accessToken,
              refreshToken: refreshTokenValue,
              tokenExpiresAt,
            },
            secret
          ),
          tokenExpiresAt,
          connectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: "",
        }),
      };
    },
    async sendMailMessage({
      connection,
      secret,
      fromEmail,
      replyToEmail = "",
      toEmail,
      subject,
      html,
      text,
    } = {}) {
      const auth = await getAuthorizedConnection(connection, secret);
      const normalizedToEmail = normalizeEmail(toEmail);
      if (!normalizedToEmail) {
        throw new Error("ACCOUNT_INVITE_EMAIL_RECIPIENT_REQUIRED");
      }

      const senderAddress = extractEmailAddress(fromEmail) || auth.connection.accountEmail;
      const senderHeader = normalizeString(fromEmail, 320) || senderAddress;
      const raw = buildMimeMessage({
        from: senderHeader,
        to: normalizedToEmail,
        replyTo: normalizeString(replyToEmail, 320),
        subject,
        html,
        text,
      });

      try {
        const response = await requestGoogleApi("users/me/messages/send", auth.accessToken, {
          method: "POST",
          body: JSON.stringify({ raw }),
        });
        const nextConnection = sanitizeGoogleMailConnection({
          ...auth.connection,
          updatedAt: new Date().toISOString(),
          lastError: "",
        });
        return {
          id: normalizeString(response && response.id, 240),
          sentAt: new Date().toISOString(),
          connection: nextConnection,
        };
      } catch (error) {
        error.connection = sanitizeGoogleMailConnection({
          ...auth.connection,
          status: "attention",
          updatedAt: new Date().toISOString(),
          lastError: normalizeString(error && error.message ? error.message : "GOOGLE_MAIL_SEND_FAILED", 400),
        });
        throw error;
      }
    },
  };
}

function createAdminGoogleMailIntegration(options = {}) {
  const client = options.client;
  const mailStore = options.mailStore;

  async function getConnection() {
    if (!mailStore || typeof mailStore.getConnection !== "function") {
      return null;
    }
    return sanitizeGoogleMailConnection(await mailStore.getConnection());
  }

  async function sendTemplatedEmail(payload = {}, config, transportConfig = {}, template = {}) {
    if (!client || !mailStore || typeof client.sendMailMessage !== "function") {
      throw new Error("ACCOUNT_INVITE_EMAIL_NOT_CONFIGURED");
    }
    const connection = await getConnection();
    if (!connection) {
      throw new Error("GOOGLE_MAIL_CONNECTION_MISSING");
    }

    const copy =
      template && typeof template.buildCopy === "function"
        ? template.buildCopy(payload)
        : { html: "", text: "" };

    try {
      const result = await client.sendMailMessage({
        connection,
        secret: config.masterSecret,
        fromEmail: transportConfig.fromEmail || connection.accountEmail,
        replyToEmail: transportConfig.replyToEmail,
        toEmail: payload.toEmail,
        subject: normalizeString(template.subject, 240),
        html: copy.html,
        text: copy.text,
      });
      if (result.connection) {
        await mailStore.setConnection(result.connection);
      }
      return {
        id: result.id,
        sentAt: result.sentAt,
      };
    } catch (error) {
      if (error && error.connection) {
        try {
          await mailStore.setConnection(error.connection);
        } catch {}
      }
      throw new Error(
        `ACCOUNT_INVITE_EMAIL_SEND_FAILED:${normalizeString(
          error && error.message ? error.message : "GOOGLE_MAIL_SEND_FAILED",
          240
        )}`
      );
    }
  }

  return {
    isConfigured() {
      return Boolean(client && typeof client.isConfigured === "function" && client.isConfigured());
    },
    async getStatus() {
      let connection = null;
      let lastError = "";
      try {
        connection = await getConnection();
      } catch (error) {
        lastError = normalizeString(
          error && error.message ? error.message : "GOOGLE_MAIL_STATUS_UNAVAILABLE",
          400
        );
      }
      return {
        configured: Boolean(client && typeof client.isConfigured === "function" && client.isConfigured()),
        connected: Boolean(connection),
        provider: connection ? connection.provider : "",
        accountEmail: connection ? connection.accountEmail : "",
        lastError: connection ? connection.lastError : lastError,
        connection,
      };
    },
    async buildConnectUrl(config, loginHint = "") {
      if (!client || typeof client.buildConnectUrl !== "function") {
        throw new Error("GOOGLE_MAIL_NOT_AVAILABLE");
      }
      return client.buildConnectUrl({
        secret: config.masterSecret,
        loginHint,
      });
    },
    async handleOAuthCallback({ code, state, config }) {
      if (!client || typeof client.exchangeCode !== "function" || !mailStore) {
        throw new Error("GOOGLE_MAIL_NOT_AVAILABLE");
      }
      const result = await client.exchangeCode({
        code,
        state,
        secret: config.masterSecret,
      });
      await mailStore.setConnection(result.connection);
      return result.connection;
    },
    async disconnect() {
      if (!mailStore || typeof mailStore.clearConnection !== "function") {
        return null;
      }
      return mailStore.clearConnection();
    },
    async sendInviteEmail(payload = {}, config, transportConfig = {}) {
      return sendTemplatedEmail(payload, config, transportConfig, {
        subject: "Confirm your SHYNLI employee email",
        buildCopy: (messagePayload) =>
          buildInviteEmailCopy({
            staffName: messagePayload.staffName,
            verifyUrl: messagePayload.verifyUrl,
            loginUrl: messagePayload.loginUrl,
          }),
      });
    },
    async sendW9ReminderEmail(payload = {}, config, transportConfig = {}) {
      return sendTemplatedEmail(payload, config, transportConfig, {
        subject: "Complete your SHYNLI onboarding documents",
        buildCopy: (messagePayload) =>
          buildW9ReminderEmailCopy({
            staffName: messagePayload.staffName,
            verifyUrl: messagePayload.verifyUrl,
            loginUrl: messagePayload.loginUrl,
            requiresAccountSetup: messagePayload.requiresAccountSetup,
          }),
      });
    },
  };
}

module.exports = {
  createAdminGoogleMailClient,
  createAdminGoogleMailIntegration,
  loadAdminGoogleMailConfig,
  sanitizeGoogleMailConnection,
};
