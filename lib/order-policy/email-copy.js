"use strict";

function fallbackNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function fallbackEscapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fallbackEscapeHtmlAttribute(value) {
  return fallbackEscapeHtml(value).replace(/`/g, "&#96;");
}

function buildPolicyAcceptanceEmailCopy(options = {}, helpers = {}) {
  const normalizeString =
    typeof helpers.normalizeString === "function" ? helpers.normalizeString : fallbackNormalizeString;
  const escapeHtml = typeof helpers.escapeHtml === "function" ? helpers.escapeHtml : fallbackEscapeHtml;
  const escapeHtmlAttribute =
    typeof helpers.escapeHtmlAttribute === "function"
      ? helpers.escapeHtmlAttribute
      : fallbackEscapeHtmlAttribute;

  const clientName = normalizeString(options.clientName, 180) || "Customer";
  const confirmUrl = normalizeString(options.confirmUrl, 4000);
  const termsUrl = normalizeString(options.termsUrl, 4000);
  const paymentPolicyUrl = normalizeString(options.paymentPolicyUrl, 4000);
  const termsVersion = normalizeString(options.termsVersion, 120);
  const termsEffectiveDate = normalizeString(options.termsEffectiveDate, 32);
  const paymentVersion = normalizeString(options.paymentVersion, 120);
  const paymentEffectiveDate = normalizeString(options.paymentEffectiveDate, 32);

  const text = [
    `Dear ${clientName},`,
    "",
    "Thank you for choosing Shynli Cleaning Service.",
    "",
    "Before we can provide your scheduled cleaning service, we kindly ask you to review and confirm your agreement to our required policies.",
    "",
    "Please read and accept the following:",
    "• I have read and agree to the Terms of Service",
    "• I agree to the Payment and Cancellation Policy",
    "",
    "Review and accept policies here:",
    confirmUrl,
    "",
    "You can read the policies here:",
    `Terms of Service: ${termsUrl} (Version: ${termsVersion} • Effective: ${termsEffectiveDate})`,
    `Payment & Cancellation Policy: ${paymentPolicyUrl} (Version: ${paymentVersion} • Effective: ${paymentEffectiveDate})`,
    "",
    "Once your confirmation is completed, your booking will be fully ready for service.",
    "",
    "If you have any questions, please reply to this email and we will be happy to help.",
    "",
    "Best regards,",
    "Shynli Cleaning Service",
  ].join("\n");

  const html = `<!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:24px;background:#f6f7fb;font-family:Montserrat,'Segoe UI',sans-serif;color:#18181b;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:24px;overflow:hidden;">
        <tr>
          <td style="padding:36px 36px 28px;">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9e435a;font-weight:700;">SHYNLI CLEANING SERVICE</div>
            <h1 style="margin:16px 0 14px;font-size:30px;line-height:1.1;">Action Required: Please Review and Accept Before Your Cleaning Appointment</h1>
            <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#52525b;">Dear ${escapeHtml(clientName)},</p>
            <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#52525b;">Thank you for choosing Shynli Cleaning Service.</p>
            <p style="margin:0 0 20px;font-size:17px;line-height:1.7;color:#52525b;">Before we can provide your scheduled cleaning service, we kindly ask you to review and confirm your agreement to our required policies.</p>
            <div style="padding:18px 20px;border-radius:20px;background:#faf9fb;border:1px solid #ece7eb;margin-bottom:24px;">
              <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#18181b;font-weight:700;">Please read and accept the following:</p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#18181b;">• <strong>I have read and agree to the Terms of Service</strong></p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#18181b;">• <strong>I agree to the Payment and Cancellation Policy</strong></p>
            </div>
            <p style="margin:0 0 28px;">
              <a href="${escapeHtmlAttribute(confirmUrl)}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#9e435a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Review and Accept Policies</a>
            </p>
            <div style="padding:18px 20px;border-radius:20px;background:#ffffff;border:1px solid #ece7eb;">
              <p style="margin:0 0 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:700;">Policy documents</p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#18181b;"><strong>Terms of Service</strong><br><a href="${escapeHtmlAttribute(termsUrl)}" style="color:#9e435a;text-decoration:none;">${escapeHtml(termsUrl)}</a><br><span style="color:#71717a;">Version ${escapeHtml(termsVersion)} • Effective ${escapeHtml(termsEffectiveDate)}</span></p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#18181b;"><strong>Payment and Cancellation Policy</strong><br><a href="${escapeHtmlAttribute(paymentPolicyUrl)}" style="color:#9e435a;text-decoration:none;">${escapeHtml(paymentPolicyUrl)}</a><br><span style="color:#71717a;">Version ${escapeHtml(paymentVersion)} • Effective ${escapeHtml(paymentEffectiveDate)}</span></p>
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return { html, text };
}

module.exports = {
  buildPolicyAcceptanceEmailCopy,
};
