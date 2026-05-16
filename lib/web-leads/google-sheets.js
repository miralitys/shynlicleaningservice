"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";
const DEFAULT_TIMEOUT_MS = 1800;

let tokenCache = null;

function cleanConfigValue(value) {
  return String(value || "").trim();
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function loadServiceAccount(env = process.env) {
  const rawJson = cleanConfigValue(env.WEB_LEADS_GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const credentialsPath = cleanConfigValue(env.WEB_LEADS_GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_APPLICATION_CREDENTIALS);
  if (credentialsPath) {
    return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  }

  return null;
}

async function getAccessToken(config) {
  if (config.accessToken) return config.accessToken;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > nowSeconds + 60 && tokenCache.cacheKey === config.clientEmail) {
    return tokenCache.accessToken;
  }

  if (!config.serviceAccount || !config.serviceAccount.client_email || !config.serviceAccount.private_key) {
    throw new Error("Web Leads Google service account is not configured.");
  }

  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claim = {
    iss: config.serviceAccount.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsignedJwt = `${base64UrlJson(header)}.${base64UrlJson(claim)}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedJwt)
    .end()
    .sign(config.serviceAccount.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await config.fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Web Leads token request failed with status ${response.status || 0}`);
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: nowSeconds + Number(payload.expires_in || 3600),
    cacheKey: config.clientEmail,
  };
  return payload.access_token;
}

function loadGoogleSheetsConfig(options = {}) {
  const env = options.env || process.env;
  const sheetId = cleanConfigValue(env.WEB_LEADS_SHEET_ID || env.GOOGLE_SHEETS_WEB_LEADS_SHEET_ID);
  const tabName = cleanConfigValue(env.WEB_LEADS_TAB_NAME) || "Web Leads";
  const accessToken = cleanConfigValue(env.WEB_LEADS_GOOGLE_ACCESS_TOKEN);
  const serviceAccount = accessToken ? null : loadServiceAccount(env);
  const configured = Boolean(sheetId && (accessToken || serviceAccount));
  return {
    configured,
    sheetId,
    tabName,
    accessToken,
    serviceAccount,
    clientEmail: serviceAccount && serviceAccount.client_email ? serviceAccount.client_email : "",
    fetch: options.fetch || global.fetch,
    timeoutMs: Number.parseInt(env.WEB_LEADS_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS,
  };
}

async function appendWebLeadRow(row, options = {}) {
  const config = options.config || loadGoogleSheetsConfig(options);
  if (!config.configured) {
    return {
      ok: true,
      skipped: true,
      reason: "web_leads_sheets_not_configured",
    };
  }
  if (typeof config.fetch !== "function") {
    throw new Error("A fetch implementation is required for Web Leads Sheets.");
  }

  const token = await getAccessToken(config);
  const range = encodeURIComponent(`${config.tabName}!A:T`);
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}` +
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(500, config.timeoutMs))
    : null;

  try {
    const response = await config.fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Web Leads Sheets append failed with status ${response.status || 0}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return {
      ok: true,
      status: response.status,
      payload,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  appendWebLeadRow,
  loadGoogleSheetsConfig,
};
