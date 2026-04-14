"use strict";

const nodemailer = require("nodemailer");
const {
  ORDER_POLICY_EMAIL_SUBJECT,
  buildOrderPolicyEmailCopy,
} = require("./order-policy");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_SMTP_PORT = 587;
const GOOGLE_SMTP_RELAY_HOST = "smtp-relay.gmail.com";
const GOOGLE_SMTP_AUTH_HOST = "smtp.gmail.com";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 320).toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = normalizeString(value, 16).toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizePort(value, fallback = DEFAULT_SMTP_PORT) {
  const numeric = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function parseUrlHostname(value) {
  const raw = normalizeString(value, 500);
  if (!raw) return "";
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
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

function deriveSmtpName(env, fromEmail) {
  const siteHostname =
    parseUrlHostname(env.PUBLIC_SITE_ORIGIN) || parseUrlHostname(env.SITE_BASE_URL);
  if (siteHostname) return siteHostname;

  const address = extractEmailAddress(fromEmail);
  const atIndex = address.lastIndexOf("@");
  if (atIndex > 0 && atIndex < address.length - 1) {
    return address.slice(atIndex + 1);
  }

  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadAccountInviteEmailConfig(env = process.env) {
  const fromEmail = normalizeString(env.ACCOUNT_INVITE_EMAIL_FROM, 320) || normalizeString(env.RESEND_FROM_EMAIL, 320);
  const replyToEmail =
    normalizeString(env.ACCOUNT_INVITE_EMAIL_REPLY_TO, 320) || normalizeString(env.RESEND_REPLY_TO_EMAIL, 320);
  const smtpHost = normalizeString(env.ACCOUNT_INVITE_SMTP_HOST, 240);
  const smtpPort = normalizePort(env.ACCOUNT_INVITE_SMTP_PORT, DEFAULT_SMTP_PORT);
  const smtpSecure = normalizeBoolean(env.ACCOUNT_INVITE_SMTP_SECURE, false);
  const smtpRequireTls = normalizeBoolean(env.ACCOUNT_INVITE_SMTP_REQUIRE_TLS, true);
  const smtpUser = normalizeString(env.ACCOUNT_INVITE_SMTP_USER, 320);
  const smtpPassword = normalizeString(env.ACCOUNT_INVITE_SMTP_PASSWORD, 1000);
  const smtpName =
    normalizeString(env.ACCOUNT_INVITE_SMTP_NAME, 240) ||
    deriveSmtpName(env, fromEmail);
  const smtpAuthConfigured = Boolean(smtpUser && smtpPassword);
  const smtpAuthIncomplete = Boolean((smtpUser || smtpPassword) && !smtpAuthConfigured);

  if (smtpHost) {
    return {
      configured: Boolean(fromEmail && !smtpAuthIncomplete),
      provider: "smtp",
      fromEmail,
      replyToEmail,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpRequireTls,
      smtpUser,
      smtpPassword,
      smtpName,
      smtpAuthConfigured,
      smtpAuthIncomplete,
    };
  }

  const resendApiKey = normalizeString(env.RESEND_API_KEY, 4000);
  return {
    configured: Boolean(resendApiKey && fromEmail),
    provider: "resend",
    resendApiKey,
    fromEmail,
    replyToEmail,
  };
}

function buildInviteEmailCopy({ staffName, verifyUrl, loginUrl }) {
  const safeName = normalizeString(staffName, 120) || "there";
  const safeVerifyUrl = normalizeString(verifyUrl, 4000);
  const safeLoginUrl = normalizeString(loginUrl, 4000);

  const text = [
    `Hello ${safeName},`,
    "",
    "A new SHYNLI employee account has been created for you.",
    "Please confirm your email address before signing in:",
    safeVerifyUrl,
    "",
    "After confirmation, open the employee login page, enter your work email, set your password, and complete your onboarding documents (Contract + W-9):",
    safeLoginUrl,
    "",
    "If you did not expect this message, please ignore it.",
    "",
    "SHYNLI CLEANING",
  ].join("\n");

  const html = `<!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:24px;background:#f6f7fb;font-family:Montserrat,'Segoe UI',sans-serif;color:#18181b;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:24px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 16px;">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9e435a;font-weight:700;">SHYNLI CLEANING</div>
            <h1 style="margin:14px 0 10px;font-size:30px;line-height:1.1;">Confirm your employee email</h1>
            <p style="margin:0 0 14px;font-size:17px;line-height:1.6;color:#52525b;">
              Hello ${escapeHtml(safeName)}, a new employee account has been created for you.
            </p>
            <p style="margin:0 0 24px;font-size:17px;line-height:1.6;color:#52525b;">
              Confirm your email first. After that, enter your work email on the login page, create your own password, and complete your onboarding documents.
            </p>
            <p style="margin:0 0 28px;">
              <a href="${escapeHtml(safeVerifyUrl)}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#9e435a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Confirm email</a>
            </p>
            <div style="padding:18px 20px;border-radius:18px;background:#faf9fb;border:1px solid #ece7eb;">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:700;">Next step</p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#18181b;">After confirmation, sign in here:</p>
              <p style="margin:0;"><a href="${escapeHtml(safeLoginUrl)}" style="color:#9e435a;text-decoration:none;font-weight:700;">${escapeHtml(safeLoginUrl)}</a></p>
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return { html, text };
}

function buildW9ReminderEmailCopy({
  staffName,
  verifyUrl,
  loginUrl,
  requiresAccountSetup = false,
} = {}) {
  const safeName = normalizeString(staffName, 120) || "there";
  const safeVerifyUrl = normalizeString(verifyUrl, 4000);
  const safeLoginUrl = normalizeString(loginUrl, 4000);
  const needsSetup = Boolean(requiresAccountSetup && safeVerifyUrl);
  const primaryUrl = needsSetup ? safeVerifyUrl || safeLoginUrl : safeLoginUrl;

  const text = [
    `Hello ${safeName},`,
    "",
    "Please complete your SHYNLI onboarding documents in your employee account.",
    "Use the main button to continue directly into the Contract + W-9 flow.",
    needsSetup
      ? "If the system still needs email confirmation or first-password setup, it will guide you through that first:"
      : "Sign in here and the system will open the documents section:",
    primaryUrl,
    needsSetup
      ? [
          "",
          "If you need the direct employee login page separately, use this link:",
          safeLoginUrl,
        ].join("\n")
      : "",
    "",
    "The form will automatically generate both PDFs and attach them to your employee profile.",
    "",
    "If you did not expect this message, please ignore it.",
    "",
    "SHYNLI CLEANING",
  ]
    .filter(Boolean)
    .join("\n");

  const setupBlock = needsSetup
    ? `<div style="padding:18px 20px;border-radius:18px;background:#faf9fb;border:1px solid #ece7eb;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:700;">Need account access?</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#18181b;">Open this secure link first if the system still asks you to confirm email or create your password:</p>
        <p style="margin:0;"><a href="${escapeHtml(safeVerifyUrl)}" style="color:#9e435a;text-decoration:none;font-weight:700;">${escapeHtml(safeVerifyUrl)}</a></p>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:24px;background:#f6f7fb;font-family:Montserrat,'Segoe UI',sans-serif;color:#18181b;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:24px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 16px;">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9e435a;font-weight:700;">SHYNLI CLEANING</div>
            <h1 style="margin:14px 0 10px;font-size:30px;line-height:1.1;">Complete your onboarding documents</h1>
            <p style="margin:0 0 14px;font-size:17px;line-height:1.6;color:#52525b;">
              Hello ${escapeHtml(safeName)}, use the button below and the system will take you straight into the Contract + W-9 flow.
            </p>
            <p style="margin:0 0 24px;font-size:17px;line-height:1.6;color:#52525b;">
              Once submitted, SHYNLI will generate both PDFs automatically and attach them to your employee profile.
            </p>
            <p style="margin:0 0 28px;">
              <a href="${escapeHtml(primaryUrl)}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#9e435a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Open documents</a>
            </p>
            ${setupBlock}
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return { html, text };
}

function createEmailPayload(options = {}, copy = {}, subject = "") {
  const config = loadAccountInviteEmailConfig(options.env || process.env);
  if (!config.configured) {
    throw new Error("ACCOUNT_INVITE_EMAIL_NOT_CONFIGURED");
  }

  const toEmail = normalizeEmail(options.toEmail);
  if (!toEmail) {
    throw new Error("ACCOUNT_INVITE_EMAIL_RECIPIENT_REQUIRED");
  }

  return {
    config,
    payload: {
      from: config.fromEmail,
      to: toEmail,
      subject: normalizeString(subject, 240),
      html: copy.html,
      text: copy.text,
      ...(config.replyToEmail ? { replyTo: config.replyToEmail } : {}),
    },
  };
}

async function sendViaSmtp(config, payload, options = {}) {
  if (config.smtpAuthIncomplete) {
    throw new Error("ACCOUNT_INVITE_SMTP_AUTH_INCOMPLETE");
  }

  const createTransport = options.createTransport || nodemailer.createTransport;
  const createTransportConfig = (host) => ({
    host,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: config.smtpRequireTls,
    ...(config.smtpAuthConfigured
      ? {
          auth: {
            user: config.smtpUser,
            pass: config.smtpPassword,
          },
        }
      : {}),
    ...(config.smtpName ? { name: config.smtpName } : {}),
  });

  async function performSend(host) {
    const transport = createTransport(createTransportConfig(host));
    try {
      const response = await transport.sendMail(payload);
      return {
        id: normalizeString(response && (response.messageId || response.response), 240),
        sentAt: new Date().toISOString(),
      };
    } finally {
      if (transport && typeof transport.close === "function") {
        transport.close();
      }
    }
  }

  function shouldRetryWithGmailHost(error) {
    if (!config.smtpAuthConfigured) return false;
    if (normalizeString(config.smtpHost, 240).toLowerCase() !== GOOGLE_SMTP_RELAY_HOST) return false;
    const message = normalizeString(error && error.message ? error.message : "", 400).toLowerCase();
    return message.includes("421") && message.includes("ehlo");
  }

  try {
    return await performSend(config.smtpHost);
  } catch (error) {
    if (shouldRetryWithGmailHost(error)) {
      try {
        return await performSend(GOOGLE_SMTP_AUTH_HOST);
      } catch (fallbackError) {
        throw new Error(
          `ACCOUNT_INVITE_EMAIL_SEND_FAILED:${normalizeString(
            fallbackError && fallbackError.message ? fallbackError.message : "SMTP_SEND_FAILED",
            240
          )}`
        );
      }
    }

    throw new Error(
      `ACCOUNT_INVITE_EMAIL_SEND_FAILED:${normalizeString(
        error && error.message ? error.message : "SMTP_SEND_FAILED",
        240
      )}`
    );
  }
}

async function sendViaResend(config, payload, options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("ACCOUNT_INVITE_EMAIL_FETCH_UNAVAILABLE");
  }

  const response = await fetchImpl(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
    }),
  });

  let responseBody = "";
  try {
    responseBody = await response.text();
  } catch {}

  if (!response.ok) {
    throw new Error(`ACCOUNT_INVITE_EMAIL_SEND_FAILED:${response.status}:${normalizeString(responseBody, 240)}`);
  }

  let parsed = null;
  try {
    parsed = responseBody ? JSON.parse(responseBody) : null;
  } catch {}

  return {
    id: parsed && parsed.id ? normalizeString(parsed.id, 200) : "",
    sentAt: new Date().toISOString(),
  };
}

async function sendAccountInviteEmail(options = {}) {
  const copy = buildInviteEmailCopy({
    staffName: options.staffName,
    verifyUrl: options.verifyUrl,
    loginUrl: options.loginUrl,
  });
  const { config, payload } = createEmailPayload(
    options,
    copy,
    "Confirm your SHYNLI employee email"
  );

  if (config.provider === "smtp") {
    return sendViaSmtp(config, payload, options);
  }

  return sendViaResend(config, payload, options);
}

async function sendStaffW9ReminderEmail(options = {}) {
  const copy = buildW9ReminderEmailCopy({
    staffName: options.staffName,
    verifyUrl: options.verifyUrl,
    loginUrl: options.loginUrl,
    requiresAccountSetup: options.requiresAccountSetup,
  });
  const { config, payload } = createEmailPayload(
    options,
    copy,
    "Complete your SHYNLI onboarding documents"
  );

  if (config.provider === "smtp") {
    return sendViaSmtp(config, payload, options);
  }

  return sendViaResend(config, payload, options);
}

async function sendOrderPolicyConfirmationEmail(options = {}) {
  const copy = buildOrderPolicyEmailCopy({
    clientName: options.clientName,
    confirmationUrl: options.confirmationUrl,
  });
  const { config, payload } = createEmailPayload(
    options,
    copy,
    ORDER_POLICY_EMAIL_SUBJECT
  );

  if (config.provider === "smtp") {
    return sendViaSmtp(config, payload, options);
  }

  return sendViaResend(config, payload, options);
}

module.exports = {
  buildInviteEmailCopy,
  buildOrderPolicyEmailCopy,
  buildW9ReminderEmailCopy,
  loadAccountInviteEmailConfig,
  sendAccountInviteEmail,
  sendOrderPolicyConfirmationEmail,
  sendStaffW9ReminderEmail,
};
