"use strict";

const POLICY_ACCEPTANCE_PAGE_PATH = "/booking/confirm";
const POLICY_ACCEPTANCE_API_BASE_PATH = "/api/policy-acceptance";

function fallbackNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

const normalizeString = fallbackNormalizeString;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeJsonForScript(value) {
  return JSON.stringify(value == null ? "" : value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function formatChicagoDateTime(value) {
  const timestamp = Date.parse(fallbackNormalizeString(value, 80));
  if (!Number.isFinite(timestamp)) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function buildPolicyAcceptancePageUrl(token = "", options = {}) {
  const safeToken = fallbackNormalizeString(token, 6000);
  const query = new URLSearchParams();
  if (safeToken) {
    query.set("token", safeToken);
  }
  if (options.confirmed) {
    query.set("confirmed", "1");
  }
  const suffix = query.toString();
  return suffix ? `${POLICY_ACCEPTANCE_PAGE_PATH}?${suffix}` : POLICY_ACCEPTANCE_PAGE_PATH;
}

function renderPolicyAcceptancePage(options = {}) {
  const {
    token = "",
    pageTitle = "Policy Acceptance",
    errorTitle = "",
    errorCopy = "",
    payload = null,
    formError = "",
    successVariant = "",
  } = options;

  if (errorTitle) {
    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(pageTitle)}</title>
        <style>
          :root { color-scheme: light; }
          body { margin:0; font-family:Montserrat, "Segoe UI", sans-serif; background:#f7f7f8; color:#15161b; }
          .wrap { min-height:100vh; display:grid; place-items:center; padding:32px 20px; }
          .card { width:min(680px, 100%); background:#fff; border:1px solid #e7e5e8; border-radius:28px; padding:36px; box-shadow:0 12px 50px rgba(15,23,42,.06); }
          .eyebrow { margin:0 0 14px; font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#9e435a; }
          h1 { margin:0 0 14px; font-size:40px; line-height:1; }
          p { margin:0; font-size:18px; line-height:1.7; color:#5a5c65; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <section class="card">
            <p class="eyebrow">Shynli Cleaning Service</p>
            <h1>${escapeHtml(errorTitle)}</h1>
            <p>${escapeHtml(errorCopy)}</p>
          </section>
        </div>
      </body>
    </html>`;
  }

  const safePayload = escapeJsonForScript(payload || {});
  const safeToken = escapeJsonForScript(token);
  const booking = (payload && payload.booking) || {};
  const customer = (payload && payload.customer) || {};
  const documents = Array.isArray(payload && payload.documents) ? payload.documents : [];
  const acceptance = (payload && payload.acceptance) || {};
  const isAccepted = acceptance.policyAccepted === true || acceptance.status === "accepted";
  const isJustConfirmed = successVariant === "just-confirmed";
  const acceptedCertificateUrl = normalizeString(acceptance.certificateUrl || "", 4000);
  const acceptedSignedAt = normalizeString(acceptance.signedAt || "", 120);
  const summaryItems = [
    {
      label: "Customer",
      value: normalizeString(customer.fullName || "", 180) || "Not set",
    },
    {
      label: "Service",
      value: normalizeString(booking.serviceLabel || "", 180) || "Not set",
    },
    {
      label: "Amount Due",
      value: (() => {
        const amount = Number(booking.totalPrice);
        if (!Number.isFinite(amount) || amount <= 0) return "Not set";
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      })(),
      className: "summary-item-amount",
    },
    {
      label: "Appointment",
      value: normalizeString(booking.appointmentLabel || "", 180) || "Not set",
    },
    {
      label: "Address",
      value: normalizeString(customer.serviceAddress || "", 240) || "Not set",
      className: "summary-item-inline",
      title: normalizeString(customer.serviceAddress || "", 240) || "Not set",
    },
    {
      label: "Email",
      value: normalizeString(customer.email || "", 180) || "Not set",
    },
    {
      label: "Phone",
      value: normalizeString(customer.phone || "", 80) || "Not set",
    },
    {
      label: "Booking ID",
      value: normalizeString(booking.requestId || booking.id, 180) || "Not set",
      className: "summary-item-inline summary-item-booking",
      title: normalizeString(booking.requestId || booking.id, 180) || "Not set",
    },
  ];
  const summaryMarkup = summaryItems
    .map((item) => {
      const className = item.className ? `summary-item ${item.className}` : "summary-item";
      const title = item.title ? ` title="${escapeHtmlAttribute(item.title)}"` : "";
      return `<article class="${className}"${title}><span class="summary-label">${escapeHtml(
        item.label
      )}</span><div class="summary-value">${escapeHtml(item.value)}</div></article>`;
    })
    .join("");
  const documentMarkup = documents
    .map((doc) => {
      const title = normalizeString(doc.title, 180) || "Policy document";
      const publicUrl = normalizeString(doc.publicUrl, 4000);
      const version = normalizeString(doc.version, 120) || "Not set";
      const effectiveDate = normalizeString(doc.effectiveDate, 120) || "Not set";
      return `<a class="doc-card doc-card-link" href="${escapeHtmlAttribute(
        publicUrl
      )}" data-policy-doc-link data-policy-doc-title="${escapeHtmlAttribute(title)}">
        <div class="doc-topline">
          <p class="doc-title">${escapeHtml(title)}</p>
        </div>
        <p class="doc-url">${escapeHtml(publicUrl)}</p>
        <p class="doc-meta">Version ${escapeHtml(version)} • Effective ${escapeHtml(effectiveDate)}</p>
      </a>`;
    })
    .join("");
  const reviewSectionMarkup = isAccepted
    ? `<section class="section section-success">
          <div class="success-state">
            <p class="eyebrow success-eyebrow">${isJustConfirmed ? "Booking confirmed" : "Already signed"}</p>
            <h2>${isJustConfirmed ? "Thank you, everything is signed." : "Your documents are already signed."}</h2>
            <p class="copy">
              ${
                isJustConfirmed
                  ? "We have received your policy acceptance and attached it to your booking."
                  : "This policy acceptance link has already been completed. No further action is required from you."
              }
              ${acceptedSignedAt ? `Signed on ${escapeHtml(formatChicagoDateTime(acceptedSignedAt))}.` : ""}
            </p>
            <div class="success-actions">
              ${
                acceptedCertificateUrl
                  ? `<a class="button" href="${escapeHtmlAttribute(acceptedCertificateUrl)}" target="_blank" rel="noreferrer">Open certificate PDF</a>`
                  : ""
              }
              <span class="hint">${
                isJustConfirmed
                  ? "You are all set for your upcoming cleaning appointment."
                  : "Everything is already on file for this booking."
              }</span>
            </div>
          </div>
        </section>`
    : `<section class="section">
          <h2>Review and Sign</h2>
          <p class="copy">Both checkboxes and your typed full name are required before the confirmation can be submitted.</p>
          <div class="success-box hidden" id="policy-success-box"></div>
          <form class="form-stack" id="policy-acceptance-form" method="post" action="${escapeHtmlAttribute(
            buildPolicyAcceptancePageUrl(token)
          )}">
            <div class="checkbox-card">
              <label class="checkbox-row">
                <input type="checkbox" id="accept-terms" name="acceptedTerms" value="on">
                <span>I have read and agree to the Terms of Service</span>
              </label>
            </div>
            <div class="checkbox-card">
              <label class="checkbox-row">
                <input type="checkbox" id="accept-payment" name="acceptedPaymentCancellation" value="on">
                <span>I agree to the Payment and Cancellation Policy</span>
              </label>
            </div>
            <div>
              <label class="field-label" for="typed-signature">Type your full legal name as your electronic signature</label>
              <input class="input" id="typed-signature" name="typedSignature" type="text" autocomplete="name" placeholder="Full legal name">
            </div>
            <div class="actions">
              <button class="button" id="confirm-button" type="submit">Confirm and Sign</button>
              <span class="hint" id="policy-hint">We will attach the certificate to your booking after confirmation.</span>
            </div>
            <p class="error${formError ? "" : " hidden"}" id="policy-error">${escapeHtml(formError)}</p>
            <p class="notice hidden" id="policy-notice"></p>
          </form>
        </section>`;
  const contentSectionsMarkup = isAccepted
    ? `${reviewSectionMarkup}
            <section class="section section-summary">
              <h2>Booking Summary</h2>
              <div class="summary-grid" id="policy-summary-grid">${summaryMarkup}</div>
            </section>
            <section class="section section-documents">
              <h2>Policy Documents</h2>
              <p class="copy">Please review the latest active versions below before confirming.</p>
              <div class="doc-list" id="policy-doc-list">${documentMarkup}</div>
            </section>`
    : `<section class="section section-summary">
              <h2>Booking Summary</h2>
              <div class="summary-grid" id="policy-summary-grid">${summaryMarkup}</div>
            </section>
            <section class="section section-documents">
              <h2>Policy Documents</h2>
              <p class="copy">Please review the latest active versions below before confirming.</p>
              <div class="doc-list" id="policy-doc-list">${documentMarkup}</div>
            </section>
            ${reviewSectionMarkup}`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(pageTitle)}</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #f6f7fb;
          --card: #ffffff;
          --line: #e8e8eb;
          --ink: #17181d;
          --muted: #666975;
          --accent: #9e435a;
          --accent-soft: rgba(158, 67, 90, 0.1);
          --success: #e9f4f0;
          --success-ink: #166660;
          --danger: #b42318;
        }
        * { box-sizing:border-box; }
        body { margin:0; font-family:Montserrat, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); }
        .page { width:100%; max-width:980px; margin:0 auto; padding:28px 20px 40px; overflow-x:hidden; }
        .shell { width:100%; max-width:100%; min-width:0; background:var(--card); border:1px solid var(--line); border-radius:30px; overflow:hidden; box-shadow:0 18px 60px rgba(15,23,42,.06); }
        .hero { display:grid; grid-template-columns:minmax(0, 1fr); gap:18px; padding:36px; border-bottom:1px solid var(--line); }
        .eyebrow { margin:0; font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); }
        .hero h1 { margin:0; font-size:42px; line-height:1.02; }
        .hero p { margin:0; font-size:18px; line-height:1.7; color:var(--muted); }
        .grid { display:grid; grid-template-columns:minmax(0, 1fr); gap:18px; min-width:0; padding:24px 36px 36px; }
        .section { max-width:100%; min-width:0; border:1px solid var(--line); border-radius:24px; padding:24px; background:#fff; overflow:hidden; }
        .section h2 { margin:0 0 14px; font-size:28px; line-height:1.1; }
        .copy { margin:0 0 16px; font-size:15px; line-height:1.6; color:var(--muted); }
        .section-summary { padding:18px 20px; }
        .section-summary h2 { margin-bottom:8px; font-size:24px; }
        .section-summary .copy { margin-bottom:12px; font-size:14px; }
        .summary-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; min-width:0; max-width:100%; }
        .summary-item { min-width:0; max-width:100%; border:1px solid var(--line); border-radius:16px; padding:12px 14px; background:#fafafa; min-height:82px; overflow:hidden; }
        .summary-item-inline { grid-column:1 / -1; display:flex; align-items:center; gap:10px; min-height:auto; padding:10px 14px; }
        .summary-item-booking .summary-value { font-size:13px; letter-spacing:.01em; }
        .summary-item-amount { background:var(--accent-soft); border-color:rgba(158, 67, 90, 0.18); }
        .summary-label { display:block; margin:0 0 6px; font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#7a7d87; }
        .summary-item-amount .summary-label { color:var(--accent); }
        .summary-value { max-width:100%; font-size:14px; font-weight:700; line-height:1.3; overflow-wrap:anywhere; word-break:break-word; }
        .summary-item-amount .summary-value { font-size:18px; line-height:1.1; }
        .summary-item-inline .summary-label { margin:0; flex:0 0 auto; }
        .summary-item-inline .summary-value { min-width:0; flex:1 1 auto; font-size:14px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .summary-meta, .doc-meta { margin-top:6px; font-size:14px; line-height:1.6; color:var(--muted); }
        .section-documents { padding:18px 20px; }
        .section-documents h2 { margin-bottom:8px; font-size:24px; }
        .section-documents .copy { margin-bottom:12px; font-size:14px; }
        .doc-list { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
        .doc-card { border:1px solid var(--line); border-radius:16px; padding:12px 14px; background:#fafafa; }
        .doc-card-link { display:block; color:inherit; text-decoration:none; cursor:pointer; }
        .doc-card-link:hover, .doc-card-link:focus-visible { border-color:rgba(158, 67, 90, 0.45); box-shadow:0 0 0 3px rgba(158, 67, 90, 0.12); outline:none; }
        .doc-topline { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .doc-title { margin:0; font-size:16px; font-weight:700; line-height:1.3; }
        .doc-link { color:var(--accent); text-decoration:none; font-size:13px; font-weight:700; white-space:nowrap; flex:0 0 auto; }
        .doc-url {
          display:block;
          margin-top:4px;
          font-size:13px;
          line-height:1.45;
          color:var(--accent);
          text-decoration:none;
          word-break:break-word;
        }
        .doc-url:hover, .doc-link:hover { text-decoration:underline; }
        .policy-doc-overlay { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:20px; background:rgba(23,24,29,.62); backdrop-filter:blur(6px); }
        .policy-doc-dialog { width:min(860px, 100%); max-height:min(88vh, 940px); display:flex; flex-direction:column; overflow:hidden; background:#fff; border:1px solid rgba(255,255,255,.7); border-radius:26px; box-shadow:0 26px 80px rgba(15,23,42,.28); }
        .policy-doc-head { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:20px 22px; border-bottom:1px solid var(--line); background:#fff; }
        .policy-doc-head h2 { margin:4px 0 0; font-size:24px; line-height:1.15; }
        .policy-doc-close { width:42px; height:42px; display:inline-grid; place-items:center; flex:0 0 auto; border:1px solid var(--line); border-radius:50%; background:#fafafa; color:var(--ink); font:inherit; font-size:24px; line-height:1; cursor:pointer; }
        .policy-doc-close:hover, .policy-doc-close:focus-visible { border-color:rgba(158, 67, 90, 0.45); box-shadow:0 0 0 3px rgba(158, 67, 90, 0.12); outline:none; }
        .policy-doc-body { overflow:auto; padding:24px; -webkit-overflow-scrolling:touch; }
        .policy-doc-loading, .policy-doc-error { margin:0; color:var(--muted); font-size:15px; line-height:1.7; }
        .policy-doc-error { display:grid; gap:14px; }
        .policy-doc-content { font-size:15px; line-height:1.7; color:var(--ink); }
        .policy-doc-content .content { max-width:none; margin:0; padding:0; border:0; border-radius:0; box-shadow:none; background:transparent; }
        .policy-doc-content h1 { margin:0 0 16px; font-size:32px; line-height:1.15; }
        .policy-doc-content h2 { margin:24px 0 10px; font-size:22px; line-height:1.2; }
        .policy-doc-content p { margin:0 0 14px; }
        .policy-doc-content pre,
        .policy-doc-content .legal-text { margin:0; white-space:pre-wrap; font-family:Montserrat, "Segoe UI", sans-serif; font-size:14px; line-height:1.75; color:#30323a; }
        .policy-doc-content a { color:var(--accent); }
        .policy-doc-frame { width:100%; min-height:68vh; border:0; border-radius:18px; background:#fff; }
        .policy-doc-fallback-link { justify-self:flex-start; }
        .form-stack { display:grid; gap:16px; }
        .checkbox-card { border:1px solid var(--line); border-radius:18px; padding:14px 16px; background:#fff; }
        .checkbox-row { display:flex; align-items:flex-start; gap:12px; font-size:16px; line-height:1.6; }
        .checkbox-row input { width:20px; height:20px; margin-top:2px; accent-color:var(--accent); }
        .field-label { display:block; margin:0 0 8px; font-size:15px; font-weight:700; }
        .input { width:100%; border:1px solid #d8d8dd; border-radius:18px; padding:16px 18px; font:inherit; font-size:18px; }
        .actions { display:flex; flex-wrap:wrap; align-items:center; gap:14px; }
        .button { border:0; border-radius:999px; padding:16px 24px; background:var(--accent); color:#fff; font:inherit; font-size:16px; font-weight:700; cursor:pointer; }
        .button[href] { display:inline-flex; align-items:center; justify-content:center; text-decoration:none; }
        .button:disabled { opacity:.45; cursor:not-allowed; }
        .hint, .error, .notice { font-size:14px; line-height:1.6; }
        .hint { color:var(--muted); }
        .error { color:var(--danger); }
        .notice { color:var(--success-ink); }
        .success-box { border:1px solid rgba(22, 102, 96, 0.2); background:var(--success); color:var(--success-ink); border-radius:20px; padding:18px 20px; }
        .section-success { background:linear-gradient(180deg, #fff 0%, #fbf8fa 100%); }
        .success-state { display:grid; gap:14px; }
        .success-eyebrow { color:var(--success-ink); margin-bottom:0; }
        .success-actions { display:flex; flex-wrap:wrap; align-items:center; gap:14px; }
        .hidden { display:none !important; }
        @media (max-width: 860px) {
          .grid { padding:20px; }
          .hero { padding:28px 20px; }
          .hero h1 { font-size:34px; }
          .summary-grid { grid-template-columns:1fr; }
          .summary-item-inline { display:block; }
          .summary-item-inline .summary-label { margin:0 0 8px; }
          .summary-item-inline .summary-value { white-space:nowrap; }
          .doc-list { grid-template-columns:1fr; }
          .policy-doc-overlay { padding:12px; }
          .policy-doc-dialog { max-height:92vh; border-radius:22px; }
          .policy-doc-head { padding:16px; }
          .policy-doc-head h2 { font-size:21px; }
          .policy-doc-body { padding:18px 16px; }
          .policy-doc-frame { min-height:72vh; border-radius:16px; }
        }
        @media (max-width: 380px) {
          .page { padding:14px 10px 28px; }
          .shell { border-radius:22px; }
          .hero { padding:24px 18px; }
          .grid { padding:16px 12px 24px; }
          .section { border-radius:20px; padding:18px 14px; }
          .section-summary { padding:16px 12px; }
          .section-summary h2 { font-size:22px; }
          .summary-item { padding:11px 12px; }
          .summary-item-inline .summary-value { white-space:normal; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="shell">
          <header class="hero">
            <p class="eyebrow">Shynli Cleaning Service</p>
            <h1>Policy Acceptance</h1>
            <p>Please review the booking details, confirm both required policies, and electronically sign to complete your booking confirmation.</p>
          </header>
          <div class="grid">
            ${contentSectionsMarkup}
          </div>
        </div>
      </div>
      <div class="policy-doc-overlay hidden" id="policy-doc-overlay" aria-hidden="true">
        <section class="policy-doc-dialog" id="policy-doc-dialog" role="dialog" aria-modal="true" aria-labelledby="policy-doc-title">
          <header class="policy-doc-head">
            <div>
              <p class="eyebrow">Policy document</p>
              <h2 id="policy-doc-title">Policy document</h2>
            </div>
            <button class="policy-doc-close" id="policy-doc-close" type="button" aria-label="Close policy document">×</button>
          </header>
          <div class="policy-doc-body" id="policy-doc-body" tabindex="0"></div>
        </section>
      </div>
      <script id="policy-acceptance-payload" type="application/json">${safePayload}</script>
      <script>
        (function () {
          const initial = JSON.parse(document.getElementById("policy-acceptance-payload").textContent || "{}");
          const token = ${safeToken};
          const summaryGrid = document.getElementById("policy-summary-grid");
          const docList = document.getElementById("policy-doc-list");
          const form = document.getElementById("policy-acceptance-form");
          const successBox = document.getElementById("policy-success-box");
          const errorBox = document.getElementById("policy-error");
          const noticeBox = document.getElementById("policy-notice");
          const button = document.getElementById("confirm-button");
          const acceptTerms = document.getElementById("accept-terms");
          const acceptPayment = document.getElementById("accept-payment");
          const typedSignature = document.getElementById("typed-signature");
          const policyDocOverlay = document.getElementById("policy-doc-overlay");
          const policyDocDialog = document.getElementById("policy-doc-dialog");
          const policyDocTitle = document.getElementById("policy-doc-title");
          const policyDocBody = document.getElementById("policy-doc-body");
          const policyDocClose = document.getElementById("policy-doc-close");
          let lastPolicyDocTrigger = null;
          let previousBodyOverflow = "";

          function setText(node, value) {
            if (node) node.textContent = value || "";
          }

          function escapeClientHtml(value) {
            return String(value || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function escapeClientAttribute(value) {
            return escapeClientHtml(value).replace(new RegExp(String.fromCharCode(96), "g"), "&#96;");
          }

          function formatBookingAmount(value) {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount <= 0) return "Not set";
            return new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(amount);
          }

          function renderSummary(payload) {
            if (!summaryGrid) return;
            const booking = payload.booking || {};
            const customer = payload.customer || {};
            const items = [
              { label: "Customer", value: customer.fullName || "Not set" },
              { label: "Service", value: booking.serviceLabel || "Not set" },
              { label: "Amount Due", value: formatBookingAmount(booking.totalPrice), className: "summary-item-amount" },
              { label: "Appointment", value: booking.appointmentLabel || "Not set" },
              { label: "Address", value: customer.serviceAddress || "Not set", className: "summary-item-inline", title: customer.serviceAddress || "Not set" },
              { label: "Email", value: customer.email || "Not set" },
              { label: "Phone", value: customer.phone || "Not set" },
              { label: "Booking ID", value: booking.requestId || booking.id || "Not set", className: "summary-item-inline summary-item-booking", title: booking.requestId || booking.id || "Not set" },
            ];
            summaryGrid.innerHTML = items.map(function(item) {
              const className = item.className ? 'summary-item ' + item.className : 'summary-item';
              const title = item.title ? ' title="' + escapeClientAttribute(item.title) + '"' : "";
              return '<article class="' + escapeClientAttribute(className) + '"' + title + '><span class="summary-label">' + escapeClientHtml(item.label) + '</span><div class="summary-value">' + escapeClientHtml(item.value) + '</div></article>';
            }).join("");
          }

          function renderDocuments(payload) {
            if (!docList) return;
            const docs = Array.isArray(payload.documents) ? payload.documents : [];
            docList.innerHTML = docs.map(function(doc) {
              const title = doc.title || "Policy document";
              const publicUrl = doc.publicUrl || "";
              return '<a class="doc-card doc-card-link" href="' + escapeClientAttribute(publicUrl) + '" data-policy-doc-link data-policy-doc-title="' + escapeClientAttribute(title) + '">' +
                '<div class="doc-topline">' +
                  '<p class="doc-title">' + escapeClientHtml(title) + '</p>' +
                '</div>' +
                '<p class="doc-url">' + escapeClientHtml(publicUrl) + '</p>' +
                '<p class="doc-meta">Version ' + escapeClientHtml(doc.version || 'Not set') + ' • Effective ' + escapeClientHtml(doc.effectiveDate || 'Not set') + '</p>' +
              '</a>';
            }).join("");
          }

          function showPolicyDocumentFrame(href, title) {
            if (!policyDocBody) return;
            policyDocBody.innerHTML = '<iframe class="policy-doc-frame" src="' +
              escapeClientAttribute(href || "") +
              '" title="' +
              escapeClientAttribute(title || "Policy document") +
              '"></iframe>';
          }

          function getPolicyDocumentRequestUrl(href) {
            try {
              const url = new URL(href, window.location.href);
              const isCurrentOrigin = url.origin === window.location.origin;
              const isShynliOrigin = /(^|\\.)shynlicleaningservice\\.com$/i.test(url.hostname);
              if (isCurrentOrigin || isShynliOrigin) {
                return url.pathname + url.search;
              }
            } catch (error) {
              return "";
            }
            return "";
          }

          function openPolicyDocumentOverlay(title) {
            if (!policyDocOverlay || !policyDocBody || !policyDocTitle) return;
            setText(policyDocTitle, title || "Policy document");
            policyDocBody.innerHTML = '<p class="policy-doc-loading">Loading document...</p>';
            policyDocOverlay.classList.remove("hidden");
            policyDocOverlay.setAttribute("aria-hidden", "false");
            previousBodyOverflow = document.body.style.overflow || "";
            document.body.style.overflow = "hidden";
            window.requestAnimationFrame(function () {
              if (policyDocClose) {
                policyDocClose.focus();
              }
            });
          }

          function closePolicyDocumentOverlay() {
            if (!policyDocOverlay) return;
            policyDocOverlay.classList.add("hidden");
            policyDocOverlay.setAttribute("aria-hidden", "true");
            document.body.style.overflow = previousBodyOverflow;
            if (policyDocBody) {
              policyDocBody.innerHTML = "";
            }
            if (lastPolicyDocTrigger && typeof lastPolicyDocTrigger.focus === "function") {
              lastPolicyDocTrigger.focus();
            }
          }

          async function loadPolicyDocument(href, title) {
            openPolicyDocumentOverlay(title);
            const requestUrl = getPolicyDocumentRequestUrl(href);
            if (!requestUrl) {
              showPolicyDocumentFrame(href, title);
              return;
            }
            try {
              const response = await fetch(requestUrl, { credentials: "same-origin" });
              if (!response.ok) {
                throw new Error("Document request failed.");
              }
              const html = await response.text();
              const parsed = new DOMParser().parseFromString(html, "text/html");
              const source = parsed.querySelector("main .content") || parsed.querySelector("main") || parsed.body;
              const content = document.createElement("div");
              content.className = "policy-doc-content";
              content.innerHTML = source ? source.innerHTML : "";
              content.querySelectorAll("script, style, link, iframe, object, embed, nav, header, footer").forEach(function (node) {
                node.remove();
              });
              content.querySelectorAll('.home-link, .brand-link, a[href="/"], a[href="' + window.location.origin + '/"]').forEach(function (node) {
                node.remove();
              });
              if (!content.textContent || !content.textContent.trim()) {
                throw new Error("Document content was empty.");
              }
              policyDocBody.innerHTML = "";
              policyDocBody.appendChild(content);
              policyDocBody.focus();
            } catch (error) {
              showPolicyDocumentFrame(href, title);
            }
          }

          function openPolicyDocument(event) {
            if (!docList || !event.target || typeof event.target.closest !== "function") {
              return;
            }
            const link = event.target.closest("[data-policy-doc-link]");
            if (!link) return;
            const href = link.getAttribute("href");
            if (!href) return;
            event.preventDefault();
            lastPolicyDocTrigger = link;
            const title = link.getAttribute("data-policy-doc-title") || (link.querySelector(".doc-title") ? link.querySelector(".doc-title").textContent : "Policy document");
            loadPolicyDocument(link.href || href, title);
          }

          function isFormReady() {
            if (!form || !acceptTerms || !acceptPayment || !typedSignature) return false;
            return (
              acceptTerms.checked &&
              acceptPayment.checked &&
              typeof typedSignature.value === "string" &&
              typedSignature.value.trim().length > 0
            );
          }

          function updateButtonState() {
            if (!button) return;
            button.setAttribute("aria-disabled", isFormReady() ? "false" : "true");
          }

          function showError(message) {
            if (!errorBox) return;
            errorBox.classList.remove("hidden");
            setText(errorBox, message || "Unable to complete confirmation.");
          }

          function clearError() {
            if (!errorBox) return;
            errorBox.classList.add("hidden");
            setText(errorBox, "");
          }

          function showNotice(message) {
            if (!noticeBox) return;
            noticeBox.classList.remove("hidden");
            setText(noticeBox, message || "");
          }

          function clearNotice() {
            if (!noticeBox) return;
            noticeBox.classList.add("hidden");
            setText(noticeBox, "");
          }

          renderSummary(initial);
          renderDocuments(initial);
          if (docList) {
            docList.addEventListener("click", openPolicyDocument);
          }
          if (policyDocClose) {
            policyDocClose.addEventListener("click", closePolicyDocumentOverlay);
          }
          if (policyDocOverlay) {
            policyDocOverlay.addEventListener("click", function (event) {
              if (event.target === policyDocOverlay) {
                closePolicyDocumentOverlay();
              }
            });
          }
          document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && policyDocOverlay && !policyDocOverlay.classList.contains("hidden")) {
              closePolicyDocumentOverlay();
            }
          });
          if (policyDocDialog) {
            policyDocDialog.addEventListener("click", function (event) {
              event.stopPropagation();
            });
          }
          if (!form) {
            return;
          }

          [acceptTerms, acceptPayment, typedSignature].forEach(function (node) {
            node.addEventListener("input", updateButtonState);
            node.addEventListener("change", updateButtonState);
            node.addEventListener("keyup", updateButtonState);
          });
          form.addEventListener("input", updateButtonState);
          form.addEventListener("change", updateButtonState);
          form.addEventListener("click", function () {
            window.requestAnimationFrame(updateButtonState);
          });
          updateButtonState();
          window.requestAnimationFrame(updateButtonState);
          window.setTimeout(updateButtonState, 0);
          window.setTimeout(updateButtonState, 300);

          form.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearError();
            clearNotice();
            if (!isFormReady()) {
              showError("Please review both policies and type your full legal name before submitting.");
              updateButtonState();
              return;
            }
            button.disabled = true;
            try {
              const response = await fetch(${JSON.stringify(`${POLICY_ACCEPTANCE_API_BASE_PATH}/`)} + encodeURIComponent(token) + "/submit", {
                method: "POST",
                headers: {
                  "content-type": "application/json"
                },
                body: JSON.stringify({
                  acceptedTerms: acceptTerms.checked,
                  acceptedPaymentCancellation: acceptPayment.checked,
                  typedSignature: typedSignature.value.trim()
                })
              });
              const body = await response.json().catch(function () { return {}; });
              if (!response.ok) {
                throw new Error(body && body.error ? body.error : "Unable to complete confirmation.");
              }
              if (body && body.redirectUrl) {
                window.location.assign(body.redirectUrl);
                return;
              }
              window.location.assign(${JSON.stringify(buildPolicyAcceptancePageUrl(token, { confirmed: true }))});
            } catch (error) {
              showError(error && error.message ? error.message : "Unable to complete confirmation.");
              updateButtonState();
              return;
            }
          });
        })();
      </script>
    </body>
  </html>`;
}

module.exports = {
  buildPolicyAcceptancePageUrl,
  renderPolicyAcceptancePage,
};
