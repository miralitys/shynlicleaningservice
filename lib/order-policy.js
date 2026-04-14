"use strict";

const crypto = require("node:crypto");
const { URL } = require("node:url");

const ORDER_POLICY_CONFIRM_PATH = "/booking/confirm";
const ORDER_POLICY_EMAIL_SUBJECT =
  "Action Required: Please Review and Accept Before Your Cleaning Appointment";
const DEFAULT_ORDER_POLICY_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

class OrderPolicyTokenError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "OrderPolicyTokenError";
    this.code = options.code || "INVALID_ORDER_POLICY_TOKEN";
    this.status = Number.isFinite(options.status) ? options.status : 400;
  }
}

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 250).toLowerCase();
}

function normalizeSecret(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function signPart(secret, encodedPayload) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function getOrderPolicyTokenSecret(env = process.env) {
  return (
    normalizeSecret(env.ORDER_POLICY_TOKEN_SECRET) ||
    normalizeSecret(env.QUOTE_SIGNING_SECRET) ||
    normalizeSecret(env.ADMIN_MASTER_SECRET) ||
    normalizeSecret(env.STRIPE_SECRET_KEY) ||
    normalizeSecret(env.GHL_API_KEY)
  );
}

function getOrderPolicyTokenTtlSeconds(env = process.env) {
  const parsed = Number.parseInt(String(env.ORDER_POLICY_TOKEN_TTL_SECONDS || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ORDER_POLICY_TOKEN_TTL_SECONDS;
  }
  return Math.min(parsed, 90 * 24 * 60 * 60);
}

function createOrderPolicyToken(payload, options = {}) {
  const env = options.env || process.env;
  const secret = getOrderPolicyTokenSecret(env);
  if (!secret) return "";

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);

  const encodedPayload = Buffer.from(
    JSON.stringify({
      iat: nowSeconds,
      exp: nowSeconds + getOrderPolicyTokenTtlSeconds(env),
      payload,
    }),
    "utf8"
  ).toString("base64url");

  return `${encodedPayload}.${signPart(secret, encodedPayload)}`;
}

function verifyOrderPolicyToken(token, options = {}) {
  const env = options.env || process.env;
  const secret = getOrderPolicyTokenSecret(env);
  if (!secret) {
    throw new OrderPolicyTokenError("Order policy confirmation is temporarily unavailable.", {
      code: "ORDER_POLICY_TOKEN_UNAVAILABLE",
      status: 503,
    });
  }

  const rawToken = String(token || "").trim();
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || rawToken.split(".").length !== 2) {
    throw new OrderPolicyTokenError("Invalid order policy token.");
  }

  const expectedSignature = signPart(secret, encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new OrderPolicyTokenError("Invalid order policy token.");
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new OrderPolicyTokenError("Invalid order policy token.");
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  if (!decoded || typeof decoded !== "object" || !decoded.payload) {
    throw new OrderPolicyTokenError("Invalid order policy token.");
  }
  if (!Number.isFinite(decoded.exp) || decoded.exp <= nowSeconds) {
    throw new OrderPolicyTokenError("This confirmation link has expired.", {
      code: "ORDER_POLICY_TOKEN_EXPIRED",
      status: 410,
    });
  }

  return decoded.payload;
}

function getEntryPayload(entry = {}) {
  return entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
}

function getEntryAdminOrderData(entry = {}) {
  const payload = getEntryPayload(entry);
  return payload.adminOrder && typeof payload.adminOrder === "object" ? payload.adminOrder : {};
}

function buildOrderPolicyEmailCopy({ clientName, confirmationUrl }) {
  const safeClientName = normalizeString(clientName, 160) || "Client";
  const safeConfirmationUrl = normalizeString(confirmationUrl, 4000);

  const text = [
    `Dear ${safeClientName},`,
    "",
    "Thank you for choosing Shynli Cleaning Service.",
    "",
    "Before we can provide your scheduled cleaning service, we kindly ask you to review and confirm your agreement to our required policies.",
    "",
    "Please read and accept the following:",
    "",
    "• I have read and agree to the Terms of Service",
    "• I agree to the Payment and Cancellation Policy",
    "",
    "For your convenience, please use the link below. It will take you to your confirmation page, where you can review both documents and check the required boxes.",
    safeConfirmationUrl,
    "",
    "You can read the policies here:",
    "",
    "Terms of Service: https://shynlicleaningservice.com/terms-of-service",
    "Payment & Cancellation Policy: https://shynlicleaningservice.com/cancellation-policy",
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
          <td style="padding:32px;">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9e435a;font-weight:700;">SHYNLI CLEANING SERVICE</div>
            <h1 style="margin:14px 0 18px;font-size:30px;line-height:1.1;">Action Required Before Your Cleaning Appointment</h1>
            <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#52525b;">Dear ${escapeHtml(safeClientName)},</p>
            <p style="margin:0 0 16px;font-size:17px;line-height:1.7;color:#52525b;">Thank you for choosing Shynli Cleaning Service.</p>
            <p style="margin:0 0 18px;font-size:17px;line-height:1.7;color:#52525b;">Before we can provide your scheduled cleaning service, we kindly ask you to review and confirm your agreement to our required policies.</p>
            <div style="padding:20px 22px;border-radius:18px;background:#faf9fb;border:1px solid #ece7eb;margin:0 0 24px;">
              <p style="margin:0 0 10px;font-size:16px;line-height:1.7;color:#18181b;">Please read and accept the following:</p>
              <p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#18181b;">• <strong>I have read and agree to the Terms of Service</strong></p>
              <p style="margin:0;font-size:16px;line-height:1.7;color:#18181b;">• <strong>I agree to the Payment and Cancellation Policy</strong></p>
            </div>
            <p style="margin:0 0 18px;font-size:17px;line-height:1.7;color:#52525b;">For your convenience, please click the button below. It will take you to your confirmation page, where you can review both documents and check the required boxes.</p>
            <p style="margin:0 0 28px;">
              <a href="${escapeHtml(safeConfirmationUrl)}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#9e435a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Review and Accept Policies</a>
            </p>
            <div style="padding:18px 20px;border-radius:18px;background:#faf9fb;border:1px solid #ece7eb;">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:700;">Policy links</p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#18181b;">Terms of Service: <a href="https://shynlicleaningservice.com/terms-of-service" style="color:#9e435a;text-decoration:none;font-weight:700;">https://shynlicleaningservice.com/terms-of-service</a></p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#18181b;">Payment &amp; Cancellation Policy: <a href="https://shynlicleaningservice.com/cancellation-policy" style="color:#9e435a;text-decoration:none;font-weight:700;">https://shynlicleaningservice.com/cancellation-policy</a></p>
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return { html, text };
}

function buildOrderPolicyConfirmationUrl(entry, options = {}) {
  const siteOrigin = normalizeString(options.siteOrigin || process.env.PUBLIC_SITE_ORIGIN || process.env.SITE_BASE_URL, 500)
    || "https://shynlicleaningservice.com";
  const token = createOrderPolicyToken(
    {
      entryId: normalizeString(entry && entry.id, 120),
      email: normalizeEmail(entry && entry.customerEmail),
    },
    { env: options.env || process.env }
  );
  if (!token) return "";
  const url = new URL(ORDER_POLICY_CONFIRM_PATH, siteOrigin);
  url.searchParams.set("token", token);
  return url.toString();
}

function renderOrderPolicyPage({
  customerName,
  serviceLabel,
  scheduleLabel,
  addressLabel,
  accepted = false,
  errorMessage = "",
  successMessage = "",
  token = "",
  termsChecked = false,
  cancellationChecked = false,
}) {
  const safeCustomerName = escapeHtml(customerName || "Cleaning appointment");
  const safeServiceLabel = escapeHtml(serviceLabel || "Cleaning service");
  const safeScheduleLabel = escapeHtml(scheduleLabel || "Schedule pending");
  const safeAddressLabel = escapeHtml(addressLabel || "Address pending");
  const safeToken = escapeHtml(token);
  const safeError = escapeHtml(errorMessage);
  const safeSuccess = escapeHtml(successMessage);

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Review and Accept Policies | SHYNLI CLEANING</title>
      <style>
        :root {
          color-scheme: light;
          --page-bg: #f6f7fb;
          --panel-bg: #ffffff;
          --panel-border: #e7e2e5;
          --accent: #9e435a;
          --text: #18181b;
          --muted: #6b7280;
          --success-bg: #ecf9f2;
          --success-text: #146a4d;
          --error-bg: #fff1f2;
          --error-text: #a11b2f;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px 16px 48px;
          background: linear-gradient(180deg, #f7f3f5 0%, var(--page-bg) 100%);
          color: var(--text);
          font-family: Montserrat, "Segoe UI", sans-serif;
        }
        .wrap {
          max-width: 760px;
          margin: 0 auto;
        }
        .panel {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          border-radius: 28px;
          padding: 30px;
          box-shadow: 0 18px 40px rgba(24, 24, 27, 0.04);
        }
        .kicker {
          margin: 0 0 14px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
        }
        h1 {
          margin: 0 0 12px;
          font-size: clamp(32px, 5vw, 44px);
          line-height: 1.05;
          font-style: italic;
        }
        .copy {
          margin: 0 0 22px;
          font-size: 17px;
          line-height: 1.7;
          color: var(--muted);
        }
        .summary {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          margin: 0 0 24px;
        }
        .summary-card {
          border: 1px solid var(--panel-border);
          border-radius: 20px;
          padding: 18px;
          background: #fbfbfc;
        }
        .summary-label {
          display: block;
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .summary-value {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.35;
        }
        .alert {
          margin: 0 0 18px;
          padding: 16px 18px;
          border-radius: 18px;
          font-size: 15px;
          line-height: 1.6;
        }
        .alert-success {
          background: var(--success-bg);
          color: var(--success-text);
        }
        .alert-error {
          background: var(--error-bg);
          color: var(--error-text);
        }
        .checklist {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 14px;
        }
        .check {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid var(--panel-border);
          background: #fbfbfc;
        }
        .check input {
          width: 22px;
          height: 22px;
          margin: 3px 0 0;
          accent-color: var(--accent);
          flex: 0 0 auto;
        }
        .check strong {
          display: block;
          font-size: 18px;
          line-height: 1.45;
        }
        .links {
          margin: 26px 0 0;
          padding: 20px;
          border-radius: 20px;
          border: 1px solid var(--panel-border);
          background: #fbfbfc;
        }
        .links p {
          margin: 0 0 10px;
          color: var(--muted);
          font-size: 15px;
          line-height: 1.6;
        }
        .links a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 700;
        }
        .actions {
          margin-top: 24px;
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          align-items: center;
        }
        .button {
          border: 0;
          border-radius: 999px;
          padding: 15px 24px;
          background: var(--accent);
          color: #fff;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        .button:disabled {
          opacity: 0.55;
          cursor: default;
        }
      </style>
    </head>
    <body>
      <main class="wrap">
        <section class="panel">
          <p class="kicker">SHYNLI CLEANING</p>
          <h1>Review and Accept Policies</h1>
          <p class="copy">Please review the required policies before your appointment. Once both agreements are accepted, your booking will be fully ready for service.</p>
          <div class="summary">
            <article class="summary-card">
              <span class="summary-label">Client</span>
              <p class="summary-value">${safeCustomerName}</p>
            </article>
            <article class="summary-card">
              <span class="summary-label">Service</span>
              <p class="summary-value">${safeServiceLabel}</p>
            </article>
            <article class="summary-card">
              <span class="summary-label">Appointment</span>
              <p class="summary-value">${safeScheduleLabel}</p>
            </article>
            <article class="summary-card">
              <span class="summary-label">Address</span>
              <p class="summary-value">${safeAddressLabel}</p>
            </article>
          </div>
          ${safeSuccess ? `<div class="alert alert-success">${safeSuccess}</div>` : ""}
          ${safeError ? `<div class="alert alert-error">${safeError}</div>` : ""}
          <form method="post" action="${escapeHtml(ORDER_POLICY_CONFIRM_PATH)}">
            <input type="hidden" name="token" value="${safeToken}">
            <div class="checklist">
              <label class="check">
                <input type="checkbox" name="acceptTerms" value="1"${termsChecked || accepted ? " checked" : ""}${accepted ? " disabled" : ""}>
                <span><strong>I have read and agree to the Terms of Service</strong></span>
              </label>
              <label class="check">
                <input type="checkbox" name="acceptCancellationPolicy" value="1"${cancellationChecked || accepted ? " checked" : ""}${accepted ? " disabled" : ""}>
                <span><strong>I agree to the Payment and Cancellation Policy</strong></span>
              </label>
            </div>
            <div class="links">
              <p>Terms of Service: <a href="https://shynlicleaningservice.com/terms-of-service" target="_blank" rel="noreferrer">https://shynlicleaningservice.com/terms-of-service</a></p>
              <p>Payment &amp; Cancellation Policy: <a href="https://shynlicleaningservice.com/cancellation-policy" target="_blank" rel="noreferrer">https://shynlicleaningservice.com/cancellation-policy</a></p>
            </div>
            <div class="actions">
              <button class="button" type="submit"${accepted ? " disabled" : ""}>${accepted ? "Policies Accepted" : "Confirm and Accept Policies"}</button>
            </div>
          </form>
        </section>
      </main>
    </body>
  </html>`;
}

function createOrderPolicyRequestHandler(deps = {}) {
  const {
    formatAdminServiceLabel = (value) => normalizeString(value, 120) || "Cleaning service",
    parseFormBody,
    readTextBody,
    writeHeadWithTiming,
  } = deps;

  function writeHtml(res, statusCode, html, requestStartNs, requestContext) {
    requestContext.cacheHit = false;
    writeHeadWithTiming(
      res,
      statusCode,
      {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end(html);
  }

  return async function handleOrderPolicyRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    quoteOpsLedger
  ) {
    if (!quoteOpsLedger) {
      writeHtml(
        res,
        503,
        renderOrderPolicyPage({
          errorMessage: "This confirmation page is temporarily unavailable.",
        }),
        requestStartNs,
        requestContext
      );
      return;
    }

    let token = "";
    let postBody = null;
    const reqUrl = new URL(req.url || ORDER_POLICY_CONFIRM_PATH, "http://localhost");

    if (req.method === "POST") {
      postBody = parseFormBody(await readTextBody(req, 16 * 1024));
      token = normalizeString(postBody.token, 8000);
    } else {
      token = normalizeString(reqUrl.searchParams.get("token"), 8000);
    }

    let tokenPayload;
    try {
      tokenPayload = verifyOrderPolicyToken(token, { env: process.env });
    } catch (error) {
      writeHtml(
        res,
        error && error.status ? error.status : 400,
        renderOrderPolicyPage({
          errorMessage:
            error && error.message
              ? error.message
              : "The confirmation link is invalid.",
        }),
        requestStartNs,
        requestContext
      );
      return;
    }

    const entryId = normalizeString(tokenPayload && tokenPayload.entryId, 120);
    const entry = await quoteOpsLedger.getEntry(entryId);
    if (!entry) {
      writeHtml(
        res,
        404,
        renderOrderPolicyPage({
          errorMessage: "We could not find this booking anymore.",
        }),
        requestStartNs,
        requestContext
      );
      return;
    }

    const entryEmail = normalizeEmail(entry.customerEmail);
    if (tokenPayload.email && entryEmail && normalizeEmail(tokenPayload.email) !== entryEmail) {
      writeHtml(
        res,
        403,
        renderOrderPolicyPage({
          errorMessage: "This confirmation link does not match the current booking contact email.",
        }),
        requestStartNs,
        requestContext
      );
      return;
    }

    const adminOrder = getEntryAdminOrderData(entry);
    const policyConfirmation =
      adminOrder.policyConfirmation && typeof adminOrder.policyConfirmation === "object"
        ? adminOrder.policyConfirmation
        : {};
    const serviceLabel = formatAdminServiceLabel(entry.serviceType || entry.service || "");
    const selectedDate = normalizeString(entry.selectedDate || adminOrder.selectedDate, 32);
    const selectedTime = normalizeString(entry.selectedTime || adminOrder.selectedTime, 32);
    const scheduleLabel =
      [selectedDate, selectedTime].filter(Boolean).join(", ") || "Schedule pending";
    const basePage = {
      customerName: normalizeString(entry.customerName, 160) || "Client",
      serviceLabel,
      scheduleLabel,
      addressLabel: normalizeString(entry.fullAddress, 320) || "Address pending",
      token,
      accepted: Boolean(policyConfirmation.acceptedAt),
    };

    if (req.method === "POST") {
      const acceptedTerms = normalizeString(postBody.acceptTerms, 8) === "1";
      const acceptedCancellation = normalizeString(postBody.acceptCancellationPolicy, 8) === "1";
      if (!acceptedTerms || !acceptedCancellation) {
        writeHtml(
          res,
          400,
          renderOrderPolicyPage({
            ...basePage,
            errorMessage: "Please check both required boxes before submitting.",
            termsChecked: acceptedTerms,
            cancellationChecked: acceptedCancellation,
          }),
          requestStartNs,
          requestContext
        );
        return;
      }

      const timestamp = new Date().toISOString();
      await quoteOpsLedger.updateOrderEntry(entryId, {
        policyAcceptedAt: timestamp,
        policyTermsAcceptedAt: timestamp,
        policyCancellationAcceptedAt: timestamp,
        policyAcceptedByEmail: entryEmail,
        policyEmailLastError: "",
      });

      writeHtml(
        res,
        200,
        renderOrderPolicyPage({
          ...basePage,
          accepted: true,
          successMessage:
            "Thank you. Your policy confirmation has been saved and your booking is fully ready for service.",
        }),
        requestStartNs,
        requestContext
      );
      return;
    }

    writeHtml(
      res,
      200,
      renderOrderPolicyPage({
        ...basePage,
        successMessage: basePage.accepted
          ? "You already completed this confirmation for your booking."
          : "",
      }),
      requestStartNs,
      requestContext
    );
  };
}

module.exports = {
  ORDER_POLICY_CONFIRM_PATH,
  ORDER_POLICY_EMAIL_SUBJECT,
  OrderPolicyTokenError,
  buildOrderPolicyConfirmationUrl,
  buildOrderPolicyEmailCopy,
  createOrderPolicyRequestHandler,
  createOrderPolicyToken,
  getOrderPolicyTokenSecret,
  getOrderPolicyTokenTtlSeconds,
  verifyOrderPolicyToken,
};
