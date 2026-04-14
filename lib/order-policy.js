"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const POLICY_ACCEPTANCE_PAGE_PATH = "/booking/confirm";
const POLICY_ACCEPTANCE_API_BASE_PATH = "/api/policy-acceptance";
const ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH = "/api/admin/policy-acceptance";
const DEFAULT_POLICY_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_POLICY_DOCUMENTS_DIR = path.join(process.cwd(), "data", "policy-acceptance");
const PDF_CONTENT_TYPE = "application/pdf";
const POLICY_EVENT_TYPES = Object.freeze([
  "LINK_SENT",
  "PAGE_VIEWED",
  "CHECKBOX_SELECTED",
  "SIGN_SUBMITTED",
  "PDF_GENERATED",
]);
const POLICY_EVENT_TYPE_SET = new Set(POLICY_EVENT_TYPES);
const TERMS_DOCUMENT_TYPE = "TERMS_OF_SERVICE";
const PAYMENT_DOCUMENT_TYPE = "PAYMENT_CANCELLATION_POLICY";
const CUSTOMER_SERVICE_LABEL_MAP = Object.freeze({
  regular: "Regular Cleaning",
  "regular cleaning": "Regular Cleaning",
  "standard cleaning": "Regular Cleaning",
  "регулярная уборка": "Regular Cleaning",
  deep: "Deep Cleaning",
  "deep cleaning": "Deep Cleaning",
  "генеральная уборка": "Deep Cleaning",
  moving: "Move In / Move Out Cleaning",
  "move-in/out": "Move In / Move Out Cleaning",
  "move in / move out cleaning": "Move In / Move Out Cleaning",
  "move in/move out cleaning": "Move In / Move Out Cleaning",
  "move in move out cleaning": "Move In / Move Out Cleaning",
  "move-in/move-out cleaning": "Move In / Move Out Cleaning",
  "move in": "Move In / Move Out Cleaning",
  "move out": "Move In / Move Out Cleaning",
  "уборка перед переездом": "Move In / Move Out Cleaning",
  airbnb: "Airbnb Cleaning",
  "airbnb cleaning": "Airbnb Cleaning",
  commercial: "Commercial Cleaning",
  "commercial cleaning": "Commercial Cleaning",
});

class PolicyAcceptanceTokenError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "PolicyAcceptanceTokenError";
    this.code = options.code || "POLICY_TOKEN_INVALID";
    this.status = Number.isFinite(options.status) ? options.status : 400;
  }
}

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

function normalizeIsoTimestamp(value) {
  const raw = normalizeString(value, 80);
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function normalizeDateValue(value) {
  const raw = normalizeString(value, 32);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

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

function stripHtmlToText(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function safeSlug(value, maxLength = 80) {
  return normalizeString(value, maxLength)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "policy-acceptance";
}

function formatChicagoDate(value) {
  const timestamp = Date.parse(normalizeString(value, 80));
  if (!Number.isFinite(timestamp)) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function formatChicagoDateTime(value) {
  const timestamp = Date.parse(normalizeString(value, 80));
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

function formatChicagoTime(value) {
  const timestamp = Date.parse(normalizeString(value, 80));
  if (!Number.isFinite(timestamp)) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function formatCustomerServiceLabel(value) {
  const raw = normalizeString(value, 120);
  if (!raw) return "Cleaning Service";
  const normalized = raw.toLowerCase();
  return CUSTOMER_SERVICE_LABEL_MAP[normalized] || raw;
}

function formatBookingDate(value) {
  const raw = normalizeString(value, 32);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw || "Not set";
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

function formatBookingTime(value) {
  const raw = normalizeString(value, 32);
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw || "Not set";
  const hours24 = Number.parseInt(match[1], 10);
  const minutes = match[2];
  if (!Number.isFinite(hours24)) return raw || "Not set";
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${suffix}`;
}

function formatBookingAppointment(dateValue, timeValue) {
  const dateLabel = formatBookingDate(dateValue);
  const timeLabel = formatBookingTime(timeValue);
  if (dateLabel !== "Not set" && timeLabel !== "Not set") {
    return `${dateLabel}, ${timeLabel}`;
  }
  if (dateLabel !== "Not set") return dateLabel;
  if (timeLabel !== "Not set") return timeLabel;
  return "Not set";
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

function getPolicyTokenSecret(env = process.env) {
  return (
    normalizeString(env.ORDER_POLICY_TOKEN_SECRET, 4000) ||
    normalizeString(env.ADMIN_MASTER_SECRET, 4000) ||
    normalizeString(env.QUOTE_SIGNING_SECRET, 4000) ||
    normalizeString(env.GHL_API_KEY, 4000)
  );
}

function getPolicyTokenTtlSeconds(env = process.env) {
  const parsed = Number.parseInt(String(env.ORDER_POLICY_TOKEN_TTL_SECONDS || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POLICY_TOKEN_TTL_SECONDS;
  return Math.min(parsed, 30 * 24 * 60 * 60);
}

function signTokenPart(secret, encodedPayload) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createPolicyAcceptanceToken(payload, options = {}) {
  const env = options.env || process.env;
  const secret = getPolicyTokenSecret(env);
  if (!secret) return "";

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);

  const encodedPayload = Buffer.from(
    JSON.stringify({
      iat: nowSeconds,
      exp: nowSeconds + getPolicyTokenTtlSeconds(env),
      payload,
    }),
    "utf8"
  ).toString("base64url");

  return `${encodedPayload}.${signTokenPart(secret, encodedPayload)}`;
}

function decodePolicyAcceptanceToken(token, options = {}) {
  const env = options.env || process.env;
  const secret = getPolicyTokenSecret(env);
  if (!secret) {
    throw new PolicyAcceptanceTokenError("Policy confirmation is temporarily unavailable.", {
      code: "POLICY_TOKEN_UNAVAILABLE",
      status: 503,
    });
  }

  const rawToken = String(token || "").trim();
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || rawToken.split(".").length !== 2) {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  const expectedSignature = signTokenPart(secret, encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  let decoded = null;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  const payload = normalizeObject(decoded.payload);
  const bookingId = normalizeString(payload.bookingId, 120);
  const envelopeId = normalizeString(payload.envelopeId, 120);
  if (!bookingId || !envelopeId) {
    throw new PolicyAcceptanceTokenError("Invalid confirmation link.", {
      code: "POLICY_TOKEN_INVALID",
      status: 404,
    });
  }

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  const expiresAtSeconds = Number(decoded.exp || 0);

  if (!options.ignoreExpiry && (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= nowSeconds)) {
    throw new PolicyAcceptanceTokenError("This confirmation link has expired.", {
      code: "POLICY_TOKEN_EXPIRED",
      status: 410,
    });
  }

  return {
    bookingId,
    envelopeId,
    iat: Number(decoded.iat || 0),
    exp: expiresAtSeconds,
  };
}

function sanitizePolicyDocument(input = {}) {
  const source = normalizeObject(input);
  return {
    id: normalizeString(source.id, 120),
    documentType: normalizeString(source.documentType, 80),
    title: normalizeString(source.title, 180),
    publicUrl: normalizeString(source.publicUrl, 4000),
    version: normalizeString(source.version, 120),
    effectiveDate: normalizeDateValue(source.effectiveDate),
    contentHash: normalizeString(source.contentHash, 160),
    isActive: source.isActive !== false,
  };
}

function sanitizePolicyEvent(input = {}) {
  const source = normalizeObject(input);
  const eventType = normalizeString(source.eventType, 80);
  if (!POLICY_EVENT_TYPE_SET.has(eventType)) return null;
  return {
    id: normalizeString(source.id, 120) || crypto.randomUUID(),
    eventType,
    occurredAt: normalizeIsoTimestamp(source.occurredAt) || new Date().toISOString(),
    metadataJson: normalizeObject(source.metadataJson),
  };
}

function sanitizeCertificateFile(input = {}) {
  const source = normalizeObject(input);
  const relativePath = normalizeString(source.relativePath, 300).replace(/^\/+/, "");
  if (!relativePath) return null;
  return {
    id: normalizeString(source.id, 120) || crypto.randomUUID(),
    fileName: normalizeString(source.fileName, 180) || "policy-acceptance-certificate.pdf",
    relativePath,
    contentType: normalizeString(source.contentType, 120) || PDF_CONTENT_TYPE,
    sizeBytes: Math.max(0, Number(source.sizeBytes) || 0),
    generatedAt: normalizeIsoTimestamp(source.generatedAt) || new Date().toISOString(),
  };
}

function sanitizePolicyAcceptanceRecord(input = {}) {
  const source = normalizeObject(input);
  const events = Array.isArray(source.events)
    ? source.events.map((event) => sanitizePolicyEvent(event)).filter(Boolean)
    : [];
  return {
    acceptanceId: normalizeString(source.acceptanceId, 120),
    bookingId: normalizeString(source.bookingId, 120),
    requestId: normalizeString(source.requestId, 120),
    status: normalizeString(source.status, 40),
    secureTokenId: normalizeString(source.secureTokenId || source.envelopeId, 120),
    envelopeId: normalizeString(source.envelopeId || source.secureTokenId, 120),
    secureTokenHash: normalizeString(source.secureTokenHash, 160),
    confirmationUrl: normalizeString(source.confirmationUrl, 4000),
    sentAt: normalizeIsoTimestamp(source.sentAt),
    firstViewedAt: normalizeIsoTimestamp(source.firstViewedAt),
    lastViewedAt: normalizeIsoTimestamp(source.lastViewedAt),
    signedAt: normalizeIsoTimestamp(source.signedAt),
    expiresAt: normalizeIsoTimestamp(source.expiresAt),
    revokedAt: normalizeIsoTimestamp(source.revokedAt),
    createdAt: normalizeIsoTimestamp(source.createdAt),
    updatedAt: normalizeIsoTimestamp(source.updatedAt),
    customerFullName: normalizeString(source.customerFullName, 180),
    customerEmail: normalizeEmail(source.customerEmail),
    customerPhone: normalizeString(source.customerPhone, 80),
    serviceAddress: normalizeString(source.serviceAddress, 500),
    acceptedTerms: normalizeBoolean(source.acceptedTerms),
    acceptedPaymentCancellation: normalizeBoolean(source.acceptedPaymentCancellation),
    typedSignature: normalizeString(source.typedSignature, 180),
    ipAddress: normalizeString(source.ipAddress, 120),
    userAgent: normalizeString(source.userAgent, 500),
    locationText: normalizeString(source.locationText, 200),
    termsDocumentId: normalizeString(source.termsDocumentId, 120),
    paymentPolicyDocumentId: normalizeString(source.paymentPolicyDocumentId, 120),
    termsDocument: sanitizePolicyDocument(source.termsDocument),
    paymentPolicyDocument: sanitizePolicyDocument(source.paymentPolicyDocument),
    certificateFileId: normalizeString(source.certificateFileId, 120),
    certificateFile: sanitizeCertificateFile(source.certificateFile),
    auditTrailJson: normalizeObject(source.auditTrailJson),
    lastError: normalizeString(source.lastError, 500),
    policyAccepted: normalizeBoolean(source.policyAccepted),
    events,
  };
}

function getEntryPolicyAcceptanceRecord(entry = {}) {
  const payload =
    entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
      ? entry.payloadForRetry
      : {};
  const adminOrder =
    payload.adminOrder && typeof payload.adminOrder === "object" ? payload.adminOrder : {};
  return sanitizePolicyAcceptanceRecord(adminOrder.policyAcceptance);
}

function buildPolicyEvent(eventType, metadataJson = {}) {
  return sanitizePolicyEvent({
    id: crypto.randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    metadataJson,
  });
}

function appendPolicyEvent(record, eventType, metadataJson = {}) {
  const nextRecord = sanitizePolicyAcceptanceRecord(record);
  const event = buildPolicyEvent(eventType, metadataJson);
  nextRecord.events = [...nextRecord.events, event];
  nextRecord.updatedAt = event.occurredAt;
  return nextRecord;
}

function buildPolicyCertificateFilePath(documentsDir, record) {
  const acceptanceId = safeSlug(record.acceptanceId || record.envelopeId || crypto.randomUUID(), 80);
  const bookingId = safeSlug(record.bookingId || "booking", 80);
  const fileName = `policy-acceptance-${acceptanceId}.pdf`;
  const relativePath = path.join(bookingId, fileName);
  return {
    fileName,
    relativePath,
    absolutePath: path.join(documentsDir, relativePath),
  };
}

function resolveSafeAbsolutePath(rootDir, relativePath) {
  const targetPath = path.resolve(rootDir, relativePath);
  const rootPath = path.resolve(rootDir);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Unsafe file path");
  }
  return targetPath;
}

function inferLocationText(req) {
  const city = normalizeString(
    req.headers["x-vercel-ip-city"] ||
      req.headers["cf-ipcity"] ||
      req.headers["x-appengine-city"] ||
      "",
    120
  );
  const region = normalizeString(
    req.headers["x-vercel-ip-country-region"] ||
      req.headers["x-appengine-region"] ||
      req.headers["cf-region-code"] ||
      "",
    80
  );
  const country = normalizeString(
    req.headers["x-vercel-ip-country"] ||
      req.headers["cf-ipcountry"] ||
      req.headers["x-appengine-country"] ||
      "",
    80
  );
  return [city, region, country].filter(Boolean).join(", ");
}

async function loadPolicyDocumentFile(options = {}) {
  const {
    env = process.env,
    siteOrigin,
    absolutePath,
    documentType,
    title,
    publicPath,
    versionEnvKey,
    effectiveDateEnvKey,
  } = options;
  const rawHtml = await fsp.readFile(absolutePath, "utf8");
  const stats = await fsp.stat(absolutePath);
  const contentHash = hashString(rawHtml);
  const effectiveDate =
    normalizeDateValue(env[effectiveDateEnvKey]) || new Date(stats.mtimeMs).toISOString().slice(0, 10);
  const version =
    normalizeString(env[versionEnvKey], 120) || `sha256:${contentHash.slice(0, 12)}`;

  return {
    id: `${documentType.toLowerCase()}-${contentHash.slice(0, 16)}`,
    documentType,
    title,
    publicUrl: new URL(publicPath, `${siteOrigin}/`).toString(),
    version,
    effectiveDate,
    contentHash,
    isActive: true,
    contentPreview: stripHtmlToText(rawHtml).slice(0, 4000),
  };
}

async function loadActivePolicyDocuments({ env = process.env, siteOrigin }) {
  const termsDocument = await loadPolicyDocumentFile({
    env,
    siteOrigin,
    absolutePath: path.join(process.cwd(), "terms-of-service.html"),
    documentType: TERMS_DOCUMENT_TYPE,
    title: "Terms of Service",
    publicPath: "/terms-of-service",
    versionEnvKey: "TERMS_OF_SERVICE_VERSION",
    effectiveDateEnvKey: "TERMS_OF_SERVICE_EFFECTIVE_DATE",
  });
  const paymentPolicyDocument = await loadPolicyDocumentFile({
    env,
    siteOrigin,
    absolutePath: path.join(process.cwd(), "cancellation-policy.html"),
    documentType: PAYMENT_DOCUMENT_TYPE,
    title: "Payment and Cancellation Policy",
    publicPath: "/cancellation-policy",
    versionEnvKey: "PAYMENT_CANCELLATION_POLICY_VERSION",
    effectiveDateEnvKey: "PAYMENT_CANCELLATION_POLICY_EFFECTIVE_DATE",
  });

  return {
    termsDocument,
    paymentPolicyDocument,
  };
}

function buildCustomerSummary(entry = {}) {
  const selectedDate = normalizeString(entry.selectedDate, 32);
  const selectedTime = normalizeString(entry.selectedTime, 32);
  return {
    bookingId: normalizeString(entry.id, 120),
    requestId: normalizeString(entry.requestId, 120),
    customerFullName: normalizeString(entry.customerName, 180),
    customerEmail: normalizeEmail(entry.customerEmail),
    customerPhone: normalizeString(entry.customerPhone, 80),
    serviceAddress: normalizeString(entry.fullAddress, 500),
    serviceLabel: formatCustomerServiceLabel(entry.serviceLabel || entry.serviceType),
    selectedDate,
    selectedTime,
    selectedDateLabel: formatBookingDate(selectedDate),
    selectedTimeLabel: formatBookingTime(selectedTime),
    appointmentLabel: formatBookingAppointment(selectedDate, selectedTime),
    totalPrice: Number(entry.totalPrice || 0),
  };
}

function buildPublicPolicyPayload(entry, record, options = {}) {
  const customerSummary = buildCustomerSummary(entry);
  const token = normalizeString(options.token, 6000);
  return {
    booking: {
      id: customerSummary.bookingId,
      requestId: customerSummary.requestId,
      serviceLabel: customerSummary.serviceLabel,
      selectedDate: customerSummary.selectedDate,
      selectedTime: customerSummary.selectedTime,
      selectedDateLabel: customerSummary.selectedDateLabel,
      selectedTimeLabel: customerSummary.selectedTimeLabel,
      appointmentLabel: customerSummary.appointmentLabel,
      totalPrice: customerSummary.totalPrice,
    },
    customer: {
      fullName: customerSummary.customerFullName,
      email: customerSummary.customerEmail,
      phone: customerSummary.customerPhone,
      serviceAddress: customerSummary.serviceAddress,
    },
    documents: [
      {
        id: record.termsDocument.id,
        documentType: record.termsDocument.documentType,
        title: record.termsDocument.title,
        publicUrl: record.termsDocument.publicUrl,
        version: record.termsDocument.version,
        effectiveDate: record.termsDocument.effectiveDate,
      },
      {
        id: record.paymentPolicyDocument.id,
        documentType: record.paymentPolicyDocument.documentType,
        title: record.paymentPolicyDocument.title,
        publicUrl: record.paymentPolicyDocument.publicUrl,
        version: record.paymentPolicyDocument.version,
        effectiveDate: record.paymentPolicyDocument.effectiveDate,
      },
    ],
    acceptance: {
      status: record.status || "pending",
      acceptedTerms: record.acceptedTerms,
      acceptedPaymentCancellation: record.acceptedPaymentCancellation,
      policyAccepted: record.policyAccepted,
      signedAt: record.signedAt,
      certificateUrl:
        record.certificateFile && token
          ? `${POLICY_ACCEPTANCE_API_BASE_PATH}/${encodeURIComponent(token)}/certificate`
          : "",
    },
  };
}

function buildAdminPolicyPayload(entry, record) {
  return {
    bookingId: normalizeString(entry.id, 120),
    requestId: normalizeString(entry.requestId, 120),
    customerFullName: normalizeString(entry.customerName, 180),
    customerEmail: normalizeEmail(entry.customerEmail),
    customerPhone: normalizeString(entry.customerPhone, 80),
    serviceAddress: normalizeString(entry.fullAddress, 500),
    policyAccepted: record.policyAccepted,
    status: record.status || "pending",
    signedAt: record.signedAt,
    sentAt: record.sentAt,
    firstViewedAt: record.firstViewedAt,
    lastViewedAt: record.lastViewedAt,
    expiresAt: record.expiresAt,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    locationText: record.locationText || null,
    typedSignature: record.typedSignature,
    acceptedTerms: record.acceptedTerms,
    acceptedPaymentCancellation: record.acceptedPaymentCancellation,
    termsDocument: record.termsDocument,
    paymentPolicyDocument: record.paymentPolicyDocument,
    certificateFile: record.certificateFile
      ? {
          ...record.certificateFile,
          downloadUrl: `${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/${encodeURIComponent(
            normalizeString(entry.id, 120)
          )}/certificate`,
        }
      : null,
    auditTrailJson: record.auditTrailJson || null,
    events: record.events,
  };
}

function buildAcceptanceStatement(record) {
  return [
    "This certificate confirms that the customer identified above electronically reviewed and accepted the referenced Terms of Service and Payment and Cancellation Policy in connection with the listed booking.",
    "By checking the required consent boxes and clicking the confirmation button, the customer electronically signed and agreed to these policies.",
    "",
    record.acceptedTerms ? "Accepted: I have read and agree to the Terms of Service" : "",
    record.acceptedPaymentCancellation
      ? "Accepted: I agree to the Payment and Cancellation Policy"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildAuditTrailJson(record) {
  const sanitized = sanitizePolicyAcceptanceRecord(record);
  return {
    acceptanceId: sanitized.acceptanceId,
    bookingId: sanitized.bookingId,
    requestId: sanitized.requestId,
    envelopeId: sanitized.envelopeId,
    sentAt: sanitized.sentAt,
    viewedAt: sanitized.firstViewedAt,
    lastViewedAt: sanitized.lastViewedAt,
    signedAt: sanitized.signedAt,
    ipAddress: sanitized.ipAddress,
    userAgent: sanitized.userAgent,
    locationText: sanitized.locationText || null,
    typedSignature: sanitized.typedSignature,
    acceptedTerms: sanitized.acceptedTerms,
    acceptedPaymentCancellation: sanitized.acceptedPaymentCancellation,
    acceptanceStatement: buildAcceptanceStatement(sanitized),
    documents: {
      termsOfService: sanitized.termsDocument,
      paymentAndCancellationPolicy: sanitized.paymentPolicyDocument,
    },
    certificateFile: sanitized.certificateFile,
    events: sanitized.events,
  };
}

function wrapTextLines(font, text, fontSize, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let currentLine = words.shift() || "";

  for (const word of words) {
    const candidate = `${currentLine} ${word}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }

  lines.push(currentLine);
  return lines;
}

function drawWrappedText(page, font, text, x, y, maxWidth, fontSize, options = {}) {
  const lines = wrapTextLines(font, text, fontSize, maxWidth);
  const lineHeight = Number(options.lineHeight) || fontSize * 1.3;
  const color = options.color || rgb(0.15, 0.15, 0.17);
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size: fontSize,
      font,
      color,
    });
    cursorY -= lineHeight;
  }
  return cursorY;
}

async function generatePolicyAcceptanceCertificate(record) {
  const sanitized = sanitizePolicyAcceptanceRecord(record);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.11, 0.11, 0.14);
  const muted = rgb(0.38, 0.39, 0.43);
  const border = rgb(0.82, 0.85, 0.86);
  const fill = rgb(0.97, 0.98, 0.99);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: 564,
    height: 744,
    borderColor: border,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 36,
    y: 36,
    width: 540,
    height: 720,
    borderColor: border,
    borderWidth: 1,
  });

  const certificateId = sanitizePolicyAcceptanceRecord(record).acceptanceId || crypto.randomUUID();
  const completedAt = sanitized.signedAt || sanitized.updatedAt || new Date().toISOString();

  page.drawText(`CERTIFICATE ID: ${certificateId}`, {
    x: 52,
    y: 724,
    size: 10,
    font: fontBold,
    color: dark,
  });
  page.drawText(`BOOKING ID: ${sanitized.bookingId}`, {
    x: 52,
    y: 710,
    size: 10,
    font: fontBold,
    color: dark,
  });
  page.drawText("DOCUMENT COMPLETED ON", {
    x: 385,
    y: 724,
    size: 10,
    font: fontBold,
    color: dark,
  });
  page.drawText(formatChicagoDateTime(completedAt), {
    x: 385,
    y: 710,
    size: 10,
    font: fontRegular,
    color: dark,
  });

  page.drawText("CERTIFICATE OF", {
    x: 204,
    y: 648,
    size: 18,
    font: fontRegular,
    color: dark,
  });
  page.drawText("POLICY ACCEPTANCE AND ELECTRONIC SIGNATURE", {
    x: 92,
    y: 620,
    size: 23,
    font: fontBold,
    color: dark,
  });

  page.drawRectangle({
    x: 52,
    y: 454,
    width: 250,
    height: 132,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });
  page.drawRectangle({
    x: 302,
    y: 454,
    width: 258,
    height: 132,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });

  page.drawText("CUSTOMER", {
    x: 60,
    y: 566,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawText("TIMESTAMP", {
    x: 310,
    y: 566,
    size: 11,
    font: fontBold,
    color: dark,
  });

  let customerCursorY = 542;
  const customerFields = [
    ["FULL NAME", sanitized.customerFullName],
    ["EMAIL", sanitized.customerEmail],
    ["PHONE", sanitized.customerPhone],
    ["SERVICE ADDRESS", sanitized.serviceAddress],
  ];
  for (const [label, value] of customerFields) {
    page.drawText(label, {
      x: 60,
      y: customerCursorY,
      size: 10,
      font: fontBold,
      color: muted,
    });
    customerCursorY = drawWrappedText(page, fontRegular, value || "Not set", 60, customerCursorY - 16, 228, 10, {
      lineHeight: 12,
      color: dark,
    }) - 10;
  }

  let timestampCursorY = 542;
  const timestampFields = [
    ["SENT", sanitized.sentAt],
    ["VIEWED", sanitized.firstViewedAt || sanitized.lastViewedAt],
    ["ACCEPTED", sanitized.signedAt],
  ];
  for (const [label, value] of timestampFields) {
    page.drawText(label, {
      x: 310,
      y: timestampCursorY,
      size: 10,
      font: fontBold,
      color: muted,
    });
    page.drawText(formatChicagoDateTime(value), {
      x: 310,
      y: timestampCursorY - 16,
      size: 10,
      font: fontRegular,
      color: dark,
    });
    timestampCursorY -= 34;
  }

  page.drawRectangle({
    x: 52,
    y: 306,
    width: 508,
    height: 118,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });
  page.drawText("ACCEPTED DOCUMENTS", {
    x: 60,
    y: 404,
    size: 11,
    font: fontBold,
    color: dark,
  });

  let documentsCursorY = 382;
  const documents = [
    sanitized.termsDocument,
    sanitized.paymentPolicyDocument,
  ];
  for (const document of documents) {
    page.drawText(document.title || "Policy document", {
      x: 60,
      y: documentsCursorY,
      size: 10,
      font: fontBold,
      color: dark,
    });
    documentsCursorY = drawWrappedText(
      page,
      fontRegular,
      `URL: ${document.publicUrl}`,
      60,
      documentsCursorY - 14,
      488,
      9,
      { lineHeight: 11, color: dark }
    ) - 2;
    documentsCursorY = drawWrappedText(
      page,
      fontRegular,
      `Version / Effective Date: ${document.version} / ${document.effectiveDate}`,
      60,
      documentsCursorY - 2,
      488,
      9,
      { lineHeight: 11, color: dark }
    ) - 10;
  }

  page.drawText("CUSTOMER ACCEPTANCE STATEMENT", {
    x: 60,
    y: 270,
    size: 11,
    font: fontBold,
    color: dark,
  });
  drawWrappedText(
    page,
    fontRegular,
    buildAcceptanceStatement(sanitized),
    60,
    248,
    488,
    10,
    { lineHeight: 12, color: dark }
  );

  page.drawText("[X] I have read and agree to the Terms of Service", {
    x: 60,
    y: 110,
    size: 10,
    font: fontRegular,
    color: dark,
  });
  page.drawText("[X] I agree to the Payment and Cancellation Policy", {
    x: 60,
    y: 92,
    size: 10,
    font: fontRegular,
    color: dark,
  });
  page.drawText(`Typed electronic signature: ${sanitized.typedSignature || "Not set"}`, {
    x: 60,
    y: 72,
    size: 9,
    font: fontRegular,
    color: muted,
  });
  page.drawText(`IP: ${sanitized.ipAddress || "Unknown"}${sanitized.locationText ? ` - ${sanitized.locationText}` : ""}`, {
    x: 60,
    y: 56,
    size: 9,
    font: fontRegular,
    color: muted,
  });
  page.drawText("PAGE 1 OF 1", {
    x: 278,
    y: 34,
    size: 10,
    font: fontBold,
    color: dark,
  });

  return Buffer.from(await pdfDoc.save());
}

function buildPolicyAcceptanceEmailCopy(options = {}) {
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

function renderPolicyAcceptancePage(options = {}) {
  const {
    token = "",
    pageTitle = "Policy Acceptance",
    errorTitle = "",
    errorCopy = "",
    payload = null,
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
          <article class="card">
            <p class="eyebrow">Shynli Cleaning Service</p>
            <h1>${escapeHtml(errorTitle)}</h1>
            <p>${escapeHtml(errorCopy)}</p>
          </article>
        </div>
      </body>
    </html>`;
  }

  const safePayload = JSON.stringify(payload || {});
  const booking = normalizeObject(payload && payload.booking);
  const customer = normalizeObject(payload && payload.customer);
  const documents = Array.isArray(payload && payload.documents) ? payload.documents : [];
  const summaryItems = [
    { label: "Customer", value: normalizeString(customer.fullName, 180) || "Not set" },
    { label: "Service", value: normalizeString(booking.serviceLabel, 180) || "Not set" },
    {
      label: "Amount Due",
      value: formatBookingAmount(booking.totalPrice),
      className: "summary-item-amount",
    },
    { label: "Appointment", value: normalizeString(booking.appointmentLabel, 180) || "Not set" },
    {
      label: "Address",
      value: normalizeString(customer.serviceAddress, 500) || "Not set",
      className: "summary-item-inline",
      title: normalizeString(customer.serviceAddress, 500) || "Not set",
    },
    { label: "Email", value: normalizeString(customer.email, 200) || "Not set" },
    { label: "Phone", value: normalizeString(customer.phone, 80) || "Not set" },
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
      return `<article class="doc-card">
        <div class="doc-topline">
          <p class="doc-title">${escapeHtml(title)}</p>
        </div>
        <a class="doc-url" href="${escapeHtmlAttribute(publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
          publicUrl
        )}</a>
        <p class="doc-meta">Version ${escapeHtml(version)} • Effective ${escapeHtml(effectiveDate)}</p>
      </article>`;
    })
    .join("");

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
        .page { max-width:980px; margin:0 auto; padding:28px 20px 40px; }
        .shell { background:var(--card); border:1px solid var(--line); border-radius:30px; overflow:hidden; box-shadow:0 18px 60px rgba(15,23,42,.06); }
        .hero { display:grid; grid-template-columns:minmax(0, 1fr); gap:18px; padding:36px; border-bottom:1px solid var(--line); }
        .eyebrow { margin:0; font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); }
        .hero h1 { margin:0; font-size:42px; line-height:1.02; }
        .hero p { margin:0; font-size:18px; line-height:1.7; color:var(--muted); }
        .grid { display:grid; grid-template-columns:minmax(0, 1fr); gap:18px; padding:24px 36px 36px; }
        .section { border:1px solid var(--line); border-radius:24px; padding:24px; background:#fff; }
        .section h2 { margin:0 0 14px; font-size:28px; line-height:1.1; }
        .copy { margin:0 0 16px; font-size:15px; line-height:1.6; color:var(--muted); }
        .section-summary { padding:18px 20px; }
        .section-summary h2 { margin-bottom:8px; font-size:24px; }
        .section-summary .copy { margin-bottom:12px; font-size:14px; }
        .summary-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; }
        .summary-item { border:1px solid var(--line); border-radius:16px; padding:12px 14px; background:#fafafa; min-height:82px; }
        .summary-item-inline { grid-column:1 / -1; display:flex; align-items:center; gap:10px; min-height:auto; padding:10px 14px; }
        .summary-item-booking .summary-value { font-size:13px; letter-spacing:.01em; }
        .summary-item-amount { background:var(--accent-soft); border-color:rgba(158, 67, 90, 0.18); }
        .summary-label { display:block; margin:0 0 6px; font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#7a7d87; }
        .summary-item-amount .summary-label { color:var(--accent); }
        .summary-value { font-size:14px; font-weight:700; line-height:1.3; }
        .summary-item-amount .summary-value { font-size:18px; line-height:1.1; }
        .summary-item-inline .summary-label { margin:0; flex:0 0 auto; }
        .summary-item-inline .summary-value { min-width:0; flex:1 1 auto; font-size:14px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .summary-meta, .doc-meta { margin-top:6px; font-size:14px; line-height:1.6; color:var(--muted); }
        .section-documents { padding:18px 20px; }
        .section-documents h2 { margin-bottom:8px; font-size:24px; }
        .section-documents .copy { margin-bottom:12px; font-size:14px; }
        .doc-list { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
        .doc-card { border:1px solid var(--line); border-radius:16px; padding:12px 14px; background:#fafafa; }
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
        .form-stack { display:grid; gap:16px; }
        .checkbox-card { border:1px solid var(--line); border-radius:18px; padding:14px 16px; background:#fff; }
        .checkbox-row { display:flex; align-items:flex-start; gap:12px; font-size:16px; line-height:1.6; }
        .checkbox-row input { width:20px; height:20px; margin-top:2px; accent-color:var(--accent); }
        .field-label { display:block; margin:0 0 8px; font-size:15px; font-weight:700; }
        .input { width:100%; border:1px solid #d8d8dd; border-radius:18px; padding:16px 18px; font:inherit; font-size:18px; }
        .actions { display:flex; flex-wrap:wrap; align-items:center; gap:14px; }
        .button { border:0; border-radius:999px; padding:16px 24px; background:var(--accent); color:#fff; font:inherit; font-size:16px; font-weight:700; cursor:pointer; }
        .button:disabled { opacity:.45; cursor:not-allowed; }
        .hint, .error, .notice { font-size:14px; line-height:1.6; }
        .hint { color:var(--muted); }
        .error { color:var(--danger); }
        .notice { color:var(--success-ink); }
        .success-box { border:1px solid rgba(22, 102, 96, 0.2); background:var(--success); color:var(--success-ink); border-radius:20px; padding:18px 20px; }
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
            <section class="section section-summary">
              <h2>Booking Summary</h2>
              <div class="summary-grid" id="policy-summary-grid">${summaryMarkup}</div>
            </section>
            <section class="section section-documents">
              <h2>Policy Documents</h2>
              <p class="copy">Please review the latest active versions below before confirming.</p>
              <div class="doc-list" id="policy-doc-list">${documentMarkup}</div>
            </section>
            <section class="section">
              <h2>Review and Sign</h2>
              <p class="copy">Both checkboxes and your typed full name are required before the confirmation can be submitted.</p>
              <div class="success-box hidden" id="policy-success-box"></div>
              <form class="form-stack" id="policy-acceptance-form">
                <div class="checkbox-card">
                  <label class="checkbox-row">
                    <input type="checkbox" id="accept-terms">
                    <span>I have read and agree to the Terms of Service</span>
                  </label>
                </div>
                <div class="checkbox-card">
                  <label class="checkbox-row">
                    <input type="checkbox" id="accept-payment">
                    <span>I agree to the Payment and Cancellation Policy</span>
                  </label>
                </div>
                <div>
                  <label class="field-label" for="typed-signature">Type your full legal name as your electronic signature</label>
                  <input class="input" id="typed-signature" name="typedSignature" type="text" autocomplete="name" placeholder="Full legal name">
                </div>
                <div class="actions">
                  <button class="button" id="confirm-button" type="submit" disabled>Confirm and Sign</button>
                  <span class="hint" id="policy-hint">We will attach the certificate to your booking after confirmation.</span>
                </div>
                <p class="error hidden" id="policy-error"></p>
                <p class="notice hidden" id="policy-notice"></p>
              </form>
            </section>
          </div>
        </div>
      </div>
      <script id="policy-acceptance-payload" type="application/json">${escapeHtml(safePayload)}</script>
      <script>
        (function () {
          const initial = JSON.parse(document.getElementById("policy-acceptance-payload").textContent || "{}");
          const token = ${JSON.stringify(token)};
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

          function setText(node, value) {
            if (node) node.textContent = value || "";
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
              const title = item.title ? ' title="' + item.title + '"' : "";
              return '<article class="' + className + '"' + title + '><span class="summary-label">' + item.label + '</span><div class="summary-value">' + item.value + '</div></article>';
            }).join("");
          }

          function renderDocuments(payload) {
            const docs = Array.isArray(payload.documents) ? payload.documents : [];
            docList.innerHTML = docs.map(function(doc) {
              return '<article class="doc-card">' +
                '<div class="doc-topline">' +
                  '<p class="doc-title">' + doc.title + '</p>' +
                '</div>' +
                '<a class="doc-url" href="' + doc.publicUrl + '" target="_blank" rel="noreferrer">' + doc.publicUrl + '</a>' +
                '<p class="doc-meta">Version ' + (doc.version || 'Not set') + ' • Effective ' + (doc.effectiveDate || 'Not set') + '</p>' +
              '</article>';
            }).join("");
          }

          function updateButtonState() {
            const hasSignature =
              typeof typedSignature.value === "string" && typedSignature.value.trim().length > 0;
            button.disabled = !(acceptTerms.checked && acceptPayment.checked && hasSignature);
          }

          function showSuccess(payload) {
            const acceptance = payload.acceptance || {};
            const certificateUrl = acceptance.certificateUrl || "";
            successBox.classList.remove("hidden");
            successBox.innerHTML = '<strong>Policies confirmed.</strong><br>' +
              'Your electronic signature has been saved.' +
              (certificateUrl ? ' <a class="doc-link" href="' + certificateUrl + '" target="_blank" rel="noreferrer">View certificate PDF</a>' : '');
            form.classList.add("hidden");
          }

          function showError(message) {
            errorBox.classList.remove("hidden");
            setText(errorBox, message || "Unable to complete confirmation.");
          }

          function clearError() {
            errorBox.classList.add("hidden");
            setText(errorBox, "");
          }

          function showNotice(message) {
            noticeBox.classList.remove("hidden");
            setText(noticeBox, message || "");
          }

          function clearNotice() {
            noticeBox.classList.add("hidden");
            setText(noticeBox, "");
          }

          renderSummary(initial);
          renderDocuments(initial);
          if (initial.acceptance && initial.acceptance.policyAccepted) {
            showSuccess(initial);
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
              showNotice("Saved successfully.");
              showSuccess(body);
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

function createOrderPolicyAcceptanceService(options = {}) {
  const env = options.env || process.env;
  const siteOrigin = normalizeString(options.siteOrigin, 500) || "https://shynlicleaningservice.com";
  const documentsDir = path.resolve(
    normalizeString(env.POLICY_ACCEPTANCE_DOCUMENTS_DIR, 1000) || DEFAULT_POLICY_DOCUMENTS_DIR
  );
  const getRequestUrl =
    typeof options.getRequestUrl === "function"
      ? options.getRequestUrl
      : (req) => new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const getClientAddress = typeof options.getClientAddress === "function" ? options.getClientAddress : () => "unknown";
  const readJsonBody = typeof options.readJsonBody === "function" ? options.readJsonBody : async () => ({});
  const writeHtmlWithTiming =
    typeof options.writeHtmlWithTiming === "function"
      ? options.writeHtmlWithTiming
      : (res, statusCode, html) => {
          res.writeHead(statusCode, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(html);
        };
  const writeJsonWithTiming =
    typeof options.writeJsonWithTiming === "function"
      ? options.writeJsonWithTiming
      : (res, statusCode, payload) => {
          res.writeHead(statusCode, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(payload));
        };
  const writeHeadWithTiming =
    typeof options.writeHeadWithTiming === "function"
      ? options.writeHeadWithTiming
      : (res, statusCode, headers) => {
          res.writeHead(statusCode, headers);
        };
  const getAdminAuthState = typeof options.getAdminAuthState === "function" ? options.getAdminAuthState : () => ({});

  function isHandledRoute(pathname) {
    return (
      pathname === POLICY_ACCEPTANCE_PAGE_PATH ||
      pathname.startsWith(`${POLICY_ACCEPTANCE_API_BASE_PATH}/`) ||
      pathname.startsWith(`${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/`)
    );
  }

  async function buildPendingAcceptance(entry) {
    const documents = await loadActivePolicyDocuments({ env, siteOrigin });
    const bookingId = normalizeString(entry && entry.id, 120);
    const requestId = normalizeString(entry && entry.requestId, 120);
    const envelopeId = crypto.randomUUID();
    const token = createPolicyAcceptanceToken(
      {
        bookingId,
        envelopeId,
      },
      { env }
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getPolicyTokenTtlSeconds(env) * 1000).toISOString();
    const confirmationUrl = new URL(POLICY_ACCEPTANCE_PAGE_PATH, `${siteOrigin}/`);
    confirmationUrl.searchParams.set("token", token);

    const record = sanitizePolicyAcceptanceRecord({
      acceptanceId: crypto.randomUUID(),
      bookingId,
      requestId,
      status: "pending",
      secureTokenId: envelopeId,
      envelopeId,
      secureTokenHash: hashString(token),
      confirmationUrl: confirmationUrl.toString(),
      sentAt: "",
      firstViewedAt: "",
      lastViewedAt: "",
      signedAt: "",
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      customerFullName: normalizeString(entry.customerName, 180),
      customerEmail: normalizeEmail(entry.customerEmail),
      customerPhone: normalizeString(entry.customerPhone, 80),
      serviceAddress: normalizeString(entry.fullAddress, 500),
      acceptedTerms: false,
      acceptedPaymentCancellation: false,
      typedSignature: "",
      ipAddress: "",
      userAgent: "",
      locationText: "",
      termsDocumentId: documents.termsDocument.id,
      paymentPolicyDocumentId: documents.paymentPolicyDocument.id,
      termsDocument: documents.termsDocument,
      paymentPolicyDocument: documents.paymentPolicyDocument,
      certificateFileId: "",
      certificateFile: null,
      auditTrailJson: null,
      policyAccepted: false,
      events: [],
    });

    return {
      token,
      record,
      emailPayload: {
        toEmail: record.customerEmail,
        clientName: record.customerFullName,
        confirmUrl: record.confirmationUrl,
        termsUrl: record.termsDocument.publicUrl,
        paymentPolicyUrl: record.paymentPolicyDocument.publicUrl,
        termsVersion: record.termsDocument.version,
        termsEffectiveDate: record.termsDocument.effectiveDate,
        paymentVersion: record.paymentPolicyDocument.version,
        paymentEffectiveDate: record.paymentPolicyDocument.effectiveDate,
      },
    };
  }

  function buildSentAcceptanceRecord(record) {
    const sanitized = sanitizePolicyAcceptanceRecord(record);
    sanitized.status = "sent";
    sanitized.sentAt = new Date().toISOString();
    sanitized.lastError = "";
    return appendPolicyEvent(sanitized, "LINK_SENT", {
      confirmationUrl: sanitized.confirmationUrl,
      expiresAt: sanitized.expiresAt,
    });
  }

  function buildFailedSendRecord(record, error) {
    const sanitized = sanitizePolicyAcceptanceRecord(record);
    sanitized.status = "pending";
    sanitized.lastError = normalizeString(error && error.message ? error.message : "Policy email failed.", 500);
    sanitized.updatedAt = new Date().toISOString();
    return sanitized;
  }

  async function updateEntryPolicyAcceptance(quoteOpsLedger, entryId, nextRecord) {
    if (!quoteOpsLedger || typeof quoteOpsLedger.updateOrderEntry !== "function") {
      throw new Error("QUOTE_OPS_LEDGER_UNAVAILABLE");
    }
    return quoteOpsLedger.updateOrderEntry(entryId, {
      policyAcceptance: sanitizePolicyAcceptanceRecord(nextRecord),
    });
  }

  async function resolveTokenContext(quoteOpsLedger, token, options = {}) {
    let decoded;
    try {
      decoded = decodePolicyAcceptanceToken(token, { env });
    } catch (error) {
      if (!(options.allowAcceptedReadOnly && error && error.code === "POLICY_TOKEN_EXPIRED")) {
        throw error;
      }
      decoded = decodePolicyAcceptanceToken(token, { env, ignoreExpiry: true });
    }

    if (!quoteOpsLedger || typeof quoteOpsLedger.getEntry !== "function") {
      throw new PolicyAcceptanceTokenError("Policy confirmation is temporarily unavailable.", {
        code: "POLICY_LEDGER_UNAVAILABLE",
        status: 503,
      });
    }

    const entry = await quoteOpsLedger.getEntry(decoded.bookingId);
    if (!entry) {
      throw new PolicyAcceptanceTokenError("Booking was not found.", {
        code: "POLICY_BOOKING_NOT_FOUND",
        status: 404,
      });
    }

    const record = getEntryPolicyAcceptanceRecord(entry);
    const envelopeId = normalizeString(record.envelopeId || record.secureTokenId, 120);
    if (!envelopeId || envelopeId !== decoded.envelopeId) {
      throw new PolicyAcceptanceTokenError("This confirmation link is no longer active.", {
        code: "POLICY_TOKEN_REVOKED",
        status: 410,
      });
    }

    const tokenHash = hashString(token);
    if (!record.secureTokenHash || record.secureTokenHash !== tokenHash) {
      throw new PolicyAcceptanceTokenError("This confirmation link is no longer active.", {
        code: "POLICY_TOKEN_REVOKED",
        status: 410,
      });
    }

    if (!options.allowAcceptedReadOnly && record.policyAccepted) {
      throw new PolicyAcceptanceTokenError("Policies have already been accepted for this booking.", {
        code: "POLICY_ALREADY_ACCEPTED",
        status: 409,
      });
    }

    if (!record.policyAccepted && record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
      throw new PolicyAcceptanceTokenError("This confirmation link has expired.", {
        code: "POLICY_TOKEN_EXPIRED",
        status: 410,
      });
    }

    return { entry, record, decoded };
  }

  async function markPageViewed(quoteOpsLedger, entry, record, requestMeta = {}) {
    const nextRecord = sanitizePolicyAcceptanceRecord(record);
    const viewedAt = new Date().toISOString();
    if (!nextRecord.firstViewedAt) {
      nextRecord.firstViewedAt = viewedAt;
    }
    nextRecord.lastViewedAt = viewedAt;
    const eventMetadata = {
      ipAddress: normalizeString(requestMeta.ipAddress, 120),
      userAgent: normalizeString(requestMeta.userAgent, 500),
    };
    const updatedRecord = appendPolicyEvent(nextRecord, "PAGE_VIEWED", eventMetadata);
    await updateEntryPolicyAcceptance(quoteOpsLedger, normalizeString(entry.id, 120), updatedRecord);
    return updatedRecord;
  }

  async function storeCertificateFile(record, pdfBuffer) {
    const fileInfo = buildPolicyCertificateFilePath(documentsDir, record);
    await fsp.mkdir(path.dirname(fileInfo.absolutePath), { recursive: true });
    await fsp.writeFile(fileInfo.absolutePath, pdfBuffer);
    return sanitizeCertificateFile({
      id: crypto.randomUUID(),
      fileName: fileInfo.fileName,
      relativePath: fileInfo.relativePath,
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: pdfBuffer.length,
      generatedAt: new Date().toISOString(),
    });
  }

  async function submitAcceptance(quoteOpsLedger, token, payload, req) {
    const { entry, record } = await resolveTokenContext(quoteOpsLedger, token, {
      allowAcceptedReadOnly: false,
    });

    const acceptedTerms = normalizeBoolean(payload.acceptedTerms);
    const acceptedPaymentCancellation = normalizeBoolean(payload.acceptedPaymentCancellation);
    const typedSignature = normalizeString(payload.typedSignature, 180);

    let pendingRecord = appendPolicyEvent(record, "CHECKBOX_SELECTED", {
      acceptedTerms,
      acceptedPaymentCancellation,
    });
    await updateEntryPolicyAcceptance(quoteOpsLedger, normalizeString(entry.id, 120), pendingRecord);

    if (!acceptedTerms || !acceptedPaymentCancellation) {
      throw new PolicyAcceptanceTokenError("Both required policy checkboxes must be accepted.", {
        code: "POLICY_CHECKBOX_REQUIRED",
        status: 422,
      });
    }

    if (!typedSignature) {
      throw new PolicyAcceptanceTokenError("Please enter your full legal name as your electronic signature.", {
        code: "POLICY_SIGNATURE_REQUIRED",
        status: 422,
      });
    }

    const signedAt = new Date().toISOString();
    pendingRecord.acceptedTerms = true;
    pendingRecord.acceptedPaymentCancellation = true;
    pendingRecord.typedSignature = typedSignature;
    pendingRecord.ipAddress = normalizeString(getClientAddress(req), 120);
    pendingRecord.userAgent = normalizeString(req.headers["user-agent"], 500);
    pendingRecord.locationText = inferLocationText(req);
    pendingRecord.signedAt = signedAt;
    pendingRecord.policyAccepted = true;
    pendingRecord.status = "accepted";
    pendingRecord.updatedAt = signedAt;
    pendingRecord = appendPolicyEvent(pendingRecord, "SIGN_SUBMITTED", {
      ipAddress: pendingRecord.ipAddress,
      locationText: pendingRecord.locationText,
      typedSignature,
    });

    const pdfBuffer = await generatePolicyAcceptanceCertificate(pendingRecord);
    const certificateFile = await storeCertificateFile(pendingRecord, pdfBuffer);
    pendingRecord.certificateFileId = certificateFile.id;
    pendingRecord.certificateFile = certificateFile;
    pendingRecord = appendPolicyEvent(pendingRecord, "PDF_GENERATED", {
      fileName: certificateFile.fileName,
      relativePath: certificateFile.relativePath,
      sizeBytes: certificateFile.sizeBytes,
    });
    pendingRecord.auditTrailJson = buildAuditTrailJson(pendingRecord);

    await updateEntryPolicyAcceptance(quoteOpsLedger, normalizeString(entry.id, 120), pendingRecord);
    return {
      entry,
      record: pendingRecord,
      certificateUrl: `${POLICY_ACCEPTANCE_API_BASE_PATH}/${encodeURIComponent(token)}/certificate`,
    };
  }

  async function readCertificateBuffer(record) {
    const certificateFile = sanitizeCertificateFile(record.certificateFile);
    if (!certificateFile) {
      throw new PolicyAcceptanceTokenError("Certificate file is not available.", {
        code: "POLICY_CERTIFICATE_NOT_FOUND",
        status: 404,
      });
    }
    const absolutePath = resolveSafeAbsolutePath(documentsDir, certificateFile.relativePath);
    return {
      file: certificateFile,
      buffer: await fsp.readFile(absolutePath),
    };
  }

  async function handlePublicPage(req, res, requestStartNs, requestContext, quoteOpsLedger) {
    const reqUrl = getRequestUrl(req);
    const token = normalizeString(reqUrl.searchParams.get("token"), 6000);
    if (!token) {
      writeHtmlWithTiming(
        res,
        400,
        renderPolicyAcceptancePage({
          pageTitle: "Policy Acceptance",
          errorTitle: "Confirmation link missing",
          errorCopy: "Open the full link from your email and try again.",
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    try {
      const { entry, record } = await resolveTokenContext(quoteOpsLedger, token, {
        allowAcceptedReadOnly: true,
      });
      const viewedRecord = await markPageViewed(quoteOpsLedger, entry, record, {
        ipAddress: getClientAddress(req),
        userAgent: req.headers["user-agent"],
      });
      writeHtmlWithTiming(
        res,
        200,
        renderPolicyAcceptancePage({
          token,
          pageTitle: "Policy Acceptance",
          payload: buildPublicPolicyPayload(entry, viewedRecord, { token }),
        }),
        requestStartNs,
        requestContext.cacheHit
      );
    } catch (error) {
      const status = Number.isFinite(error && error.status) ? error.status : 400;
      const title =
        status === 410
          ? "Confirmation link expired"
          : status === 409
            ? "Policies already accepted"
            : "Confirmation link unavailable";
      writeHtmlWithTiming(
        res,
        status,
        renderPolicyAcceptancePage({
          pageTitle: "Policy Acceptance",
          errorTitle: title,
          errorCopy: normalizeString(error && error.message ? error.message : "Unable to open this confirmation page.", 300),
        }),
        requestStartNs,
        requestContext.cacheHit
      );
    }
  }

  async function handlePublicApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname) {
    const suffix = pathname.slice(`${POLICY_ACCEPTANCE_API_BASE_PATH}/`.length);
    const segments = suffix.split("/").filter(Boolean).map((value) => decodeURIComponent(value));
    const token = normalizeString(segments[0], 6000);
    if (!token) {
      writeJsonWithTiming(
        res,
        400,
        { error: "Confirmation token is required." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    try {
      if (segments.length === 1 && req.method === "GET") {
        const { entry, record } = await resolveTokenContext(quoteOpsLedger, token, {
          allowAcceptedReadOnly: true,
        });
        const viewedRecord = await markPageViewed(quoteOpsLedger, entry, record, {
          ipAddress: getClientAddress(req),
          userAgent: req.headers["user-agent"],
        });
        writeJsonWithTiming(
          res,
          200,
          buildPublicPolicyPayload(entry, viewedRecord, { token }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (segments.length === 2 && segments[1] === "submit" && req.method === "POST") {
        const body = await readJsonBody(req, 64 * 1024);
        const result = await submitAcceptance(quoteOpsLedger, token, body, req);
        writeJsonWithTiming(
          res,
          200,
          {
            ok: true,
            certificateUrl: result.certificateUrl,
            acceptance: {
              status: result.record.status,
              policyAccepted: result.record.policyAccepted,
              signedAt: result.record.signedAt,
              certificateUrl: result.certificateUrl,
            },
          },
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      }

      if (segments.length === 2 && segments[1] === "certificate" && req.method === "GET") {
        const { record } = await resolveTokenContext(quoteOpsLedger, token, {
          allowAcceptedReadOnly: true,
        });
        const certificate = await readCertificateBuffer(record);
        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": certificate.file.contentType || PDF_CONTENT_TYPE,
            "Content-Length": String(certificate.buffer.length),
            "Content-Disposition": `inline; filename="${certificate.file.fileName}"`,
            "Cache-Control": "private, max-age=300",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        res.end(certificate.buffer);
        return;
      }

      writeJsonWithTiming(
        res,
        404,
        { error: "Not found." },
        requestStartNs,
        requestContext.cacheHit
      );
    } catch (error) {
      writeJsonWithTiming(
        res,
        Number.isFinite(error && error.status) ? error.status : 500,
        {
          error: normalizeString(
            error && error.message ? error.message : "Unable to complete policy confirmation.",
            300
          ),
          code: normalizeString(error && error.code ? error.code : "POLICY_ACCEPTANCE_ERROR", 80),
        },
        requestStartNs,
        requestContext.cacheHit
      );
    }
  }

  async function handleAdminApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname) {
    const authState = getAdminAuthState(req);
    if (!authState || !authState.session) {
      writeJsonWithTiming(
        res,
        401,
        { error: "Admin session required." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const suffix = pathname.slice(`${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/`.length);
    const segments = suffix.split("/").filter(Boolean).map((value) => decodeURIComponent(value));
    const bookingId = normalizeString(segments[0], 120);
    if (!bookingId) {
      writeJsonWithTiming(
        res,
        400,
        { error: "Booking ID is required." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const entry = quoteOpsLedger && typeof quoteOpsLedger.getEntry === "function" ? await quoteOpsLedger.getEntry(bookingId) : null;
    if (!entry) {
      writeJsonWithTiming(
        res,
        404,
        { error: "Booking not found." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const record = getEntryPolicyAcceptanceRecord(entry);
    if (!record.acceptanceId) {
      writeJsonWithTiming(
        res,
        404,
        { error: "Policy acceptance not found for this booking." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (segments.length === 2 && segments[1] === "certificate" && req.method === "GET") {
      const certificate = await readCertificateBuffer(record);
      writeHeadWithTiming(
        res,
        200,
        {
          "Content-Type": certificate.file.contentType || PDF_CONTENT_TYPE,
          "Content-Length": String(certificate.buffer.length),
          "Content-Disposition": `inline; filename="${certificate.file.fileName}"`,
          "Cache-Control": "private, max-age=300",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end(certificate.buffer);
      return;
    }

    if (segments.length === 1 && req.method === "GET") {
      writeJsonWithTiming(
        res,
        200,
        buildAdminPolicyPayload(entry, record),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    writeJsonWithTiming(
      res,
      404,
      { error: "Not found." },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  return {
    POLICY_ACCEPTANCE_PAGE_PATH,
    POLICY_ACCEPTANCE_API_BASE_PATH,
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    isHandledRoute,
    getEntryPolicyAcceptanceRecord,
    buildPendingAcceptance,
    buildSentAcceptanceRecord,
    buildFailedSendRecord,
    buildPolicyAcceptanceEmailCopy,
    buildAdminPolicyPayload,
    buildPublicPolicyPayload,
    async handleRequest(req, res, requestStartNs, requestContext, quoteOpsLedger) {
      const pathname = normalizeString(requestContext.route, 500) || "/";
      if (pathname === POLICY_ACCEPTANCE_PAGE_PATH && req.method === "GET") {
        await handlePublicPage(req, res, requestStartNs, requestContext, quoteOpsLedger);
        return true;
      }
      if (pathname.startsWith(`${POLICY_ACCEPTANCE_API_BASE_PATH}/`)) {
        await handlePublicApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname);
        return true;
      }
      if (pathname.startsWith(`${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/`)) {
        await handleAdminApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname);
        return true;
      }
      return false;
    },
  };
}

module.exports = {
  ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
  POLICY_ACCEPTANCE_API_BASE_PATH,
  POLICY_ACCEPTANCE_PAGE_PATH,
  PolicyAcceptanceTokenError,
  buildPolicyAcceptanceEmailCopy,
  createOrderPolicyAcceptanceService,
};
