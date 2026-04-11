"use strict";

const RESEND_API_URL = "https://api.resend.com/emails";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 320).toLowerCase();
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
  const resendApiKey = normalizeString(env.RESEND_API_KEY, 4000);
  const fromEmail = normalizeString(env.ACCOUNT_INVITE_EMAIL_FROM, 320) || normalizeString(env.RESEND_FROM_EMAIL, 320);
  const replyToEmail =
    normalizeString(env.ACCOUNT_INVITE_EMAIL_REPLY_TO, 320) || normalizeString(env.RESEND_REPLY_TO_EMAIL, 320);

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
    "After confirmation, you can sign in here:",
    safeLoginUrl,
    "",
    "Use the temporary password shared with you by your manager.",
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
              Confirm your email first, then sign in with the temporary password shared by your manager.
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

async function sendAccountInviteEmail(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const config = loadAccountInviteEmailConfig(options.env || process.env);
  if (!config.configured) {
    throw new Error("ACCOUNT_INVITE_EMAIL_NOT_CONFIGURED");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("ACCOUNT_INVITE_EMAIL_FETCH_UNAVAILABLE");
  }

  const toEmail = normalizeEmail(options.toEmail);
  if (!toEmail) {
    throw new Error("ACCOUNT_INVITE_EMAIL_RECIPIENT_REQUIRED");
  }

  const { html, text } = buildInviteEmailCopy({
    staffName: options.staffName,
    verifyUrl: options.verifyUrl,
    loginUrl: options.loginUrl,
  });

  const payload = {
    from: config.fromEmail,
    to: [toEmail],
    subject: "Confirm your SHYNLI employee email",
    html,
    text,
    ...(config.replyToEmail ? { reply_to: config.replyToEmail } : {}),
  };

  const response = await fetchImpl(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

module.exports = {
  buildInviteEmailCopy,
  loadAccountInviteEmailConfig,
  sendAccountInviteEmail,
};
