"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const POLICY_ACCEPTANCE_PAGE_PATH = "/booking/confirm";
const POLICY_ACCEPTANCE_API_BASE_PATH = "/api/policy-acceptance";
const ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH = "/api/admin/policy-acceptance";
const DEFAULT_POLICY_TOKEN_TTL_SECONDS = 48 * 60 * 60;
const DEFAULT_POLICY_DOCUMENTS_DIR = path.join(process.cwd(), "data", "policy-acceptance");
const POLICY_ACCEPTANCE_CERTIFICATE_TEMPLATE_PATHS = [
  {
    kind: "png",
    absolutePath: path.join(
      __dirname,
      "..",
      "assets",
      "forms",
      "policy-acceptance-certificate-template.png"
    ),
  },
  {
    kind: "jpg",
    absolutePath: path.join(
      __dirname,
      "..",
      "assets",
      "forms",
      "policy-acceptance-certificate-template.jpg"
    ),
  },
];
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
const POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION = "2026-04-14-template-v4";
let cachedPolicyAcceptanceCertificateTemplateBytesPromise = null;
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

function getPolicyTokenTtlSeconds() {
  return DEFAULT_POLICY_TOKEN_TTL_SECONDS;
}

function signTokenPart(secret, encodedPayload) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createShortPolicyAccessCode() {
  return crypto.randomBytes(8).toString("base64url");
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

function decodeShortPolicyAcceptanceToken(token) {
  const rawToken = String(token || "").trim();
  const match = rawToken.match(/^([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{8,32})$/);
  if (!match) return null;
  return {
    bookingId: normalizeString(match[1], 120),
    publicCode: normalizeString(match[2], 64),
    rawToken,
    isShortToken: true,
  };
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
    generatorVersion: normalizeString(source.generatorVersion, 80),
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
    "By accepting, I confirm that I have read and agree to the Terms of Service, as well as the Payment and Cancellation Policy.",
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

async function loadPolicyAcceptanceCertificateTemplateBytes() {
  if (!cachedPolicyAcceptanceCertificateTemplateBytesPromise) {
    cachedPolicyAcceptanceCertificateTemplateBytesPromise = (async () => {
      let lastError = null;
      for (const candidate of POLICY_ACCEPTANCE_CERTIFICATE_TEMPLATE_PATHS) {
        try {
          return {
            kind: candidate.kind,
            bytes: await fsp.readFile(candidate.absolutePath),
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Policy certificate template was not found.");
    })().catch((error) => {
      cachedPolicyAcceptanceCertificateTemplateBytesPromise = null;
      throw error;
    });
  }
  return cachedPolicyAcceptanceCertificateTemplateBytesPromise;
}

function fitPdfText(font, text, maxWidth, preferredSize, minSize = 6) {
  let safeText = normalizeString(text, 4000) || "Not set";
  let size = preferredSize;

  while (size > minSize && font.widthOfTextAtSize(safeText, size) > maxWidth) {
    size -= 0.25;
  }

  if (font.widthOfTextAtSize(safeText, size) > maxWidth) {
    while (safeText.length > 1 && font.widthOfTextAtSize(`${safeText}...`, size) > maxWidth) {
      safeText = safeText.slice(0, -1);
    }
    safeText = safeText.length > 0 ? `${safeText}...` : "...";
  }

  return {
    text: safeText,
    size,
  };
}

function formatCertificateDisplayId(value) {
  const normalized = normalizeString(value, 120)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (normalized) return normalized.slice(0, 12);
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
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
  const dark = rgb(0.1, 0.11, 0.12);
  const muted = rgb(0.36, 0.37, 0.4);
  const slate = rgb(0.55, 0.57, 0.61);
  const border = rgb(0.77, 0.83, 0.83);
  const borderSoft = rgb(0.86, 0.89, 0.9);
  const teal = rgb(0.73, 0.83, 0.82);
  const wave = rgb(0.84, 0.9, 0.89);
  const fill = rgb(0.985, 0.986, 0.988);
  const white = rgb(1, 1, 1);
  const certificateId = sanitized.acceptanceId || crypto.randomUUID();
  const certificateDisplayId = formatCertificateDisplayId(certificateId);
  const bookingDisplayId =
    normalizeString(sanitized.requestId, 120) ||
    normalizeString(sanitized.bookingId, 120) ||
    "Not set";
  const completedAt = sanitized.signedAt || sanitized.updatedAt || new Date().toISOString();

  let templateBytes = null;
  try {
    templateBytes = await loadPolicyAcceptanceCertificateTemplateBytes();
  } catch {
    templateBytes = null;
  }

  if (templateBytes) {
    const templateCanvasWidth = 1856;
    const templateCanvasHeight = 2296;
    const scaleX = 612 / templateCanvasWidth;
    const scaleY = 792 / templateCanvasHeight;
    const templateImage =
      templateBytes.kind === "jpg"
        ? await pdfDoc.embedJpg(templateBytes.bytes)
        : await pdfDoc.embedPng(templateBytes.bytes);
    page.drawImage(templateImage, {
      x: 0,
      y: 0,
      width: 612,
      height: 792,
    });

    function toPdfX(px) {
      return px * scaleX;
    }

    function toPdfY(py) {
      return 792 - py * scaleY;
    }

    function toPdfWidth(px) {
      return px * scaleX;
    }

    function toPdfHeight(px) {
      return px * scaleY;
    }

    function clearTemplateRect(xPx, yPx, widthPx, heightPx, opacity = 1) {
      page.drawRectangle({
        x: toPdfX(xPx),
        y: 792 - (yPx + heightPx) * scaleY,
        width: toPdfWidth(widthPx),
        height: toPdfHeight(heightPx),
        color: white,
        opacity,
      });
    }

    function drawTemplateText(value, xPx, baselinePx, widthPx, options = {}) {
      const font = options.font || fontRegular;
      const color = options.color || dark;
      const align = options.align || "left";
      const preferredSize = options.size || 8.7;
      const minSize = options.minSize || 6;
      const safeValue =
        normalizeString(value, options.maxLength || 500) || options.fallback || "Not set";
      const fitted = fitPdfText(font, safeValue, toPdfWidth(widthPx), preferredSize, minSize);
      const textWidth = font.widthOfTextAtSize(fitted.text, fitted.size);
      let textX = toPdfX(xPx);
      if (align === "center") {
        textX += Math.max(0, (toPdfWidth(widthPx) - textWidth) / 2);
      } else if (align === "right") {
        textX += Math.max(0, toPdfWidth(widthPx) - textWidth);
      }
      page.drawText(fitted.text, {
        x: textX,
        y: toPdfY(baselinePx),
        size: fitted.size,
        font,
        color,
      });
    }

    function drawTemplateWrappedText(value, xPx, baselinePx, widthPx, options = {}) {
      const font = options.font || fontRegular;
      const color = options.color || dark;
      const fontSize = options.size || 8.3;
      const lineHeight = options.lineHeight || fontSize * 1.18;
      const maxLines = options.maxLines || 6;
      const safeValue = normalizeString(value, options.maxLength || 4000) || options.fallback || "Not set";
      const lines = wrapTextLines(font, safeValue, fontSize, toPdfWidth(widthPx)).slice(0, maxLines);
      let cursorY = toPdfY(baselinePx);
      for (const line of lines) {
        page.drawText(line, {
          x: toPdfX(xPx),
          y: cursorY,
          size: fontSize,
          font,
          color,
        });
        cursorY -= lineHeight;
      }
    }

    function drawTemplateLabeledValue(label, value, labelXPx, valueXPx, baselinePx, valueWidthPx, options = {}) {
      const labelText = normalizeString(label, 120);
      const labelFont = options.labelFont || fontBold;
      const labelSize = options.labelSize || 8.4;
      page.drawText(labelText, {
        x: toPdfX(labelXPx),
        y: toPdfY(baselinePx),
        size: labelSize,
        font: labelFont,
        color: options.labelColor || dark,
      });
      drawTemplateText(value, valueXPx, baselinePx, valueWidthPx, {
        size: options.size || 7.8,
        minSize: options.minSize || 6,
        maxLength: options.maxLength || 260,
        color: options.color || dark,
      });
    }

    function drawTemplateLine(x1Px, y1Px, x2Px, y2Px, thickness = 1) {
      page.drawLine({
        start: { x: toPdfX(x1Px), y: toPdfY(y1Px) },
        end: { x: toPdfX(x2Px), y: toPdfY(y2Px) },
        color: dark,
        thickness,
      });
    }

    function drawTemplateCross(xPx, yPx, sizePx = 28) {
      page.drawLine({
        start: { x: toPdfX(xPx), y: toPdfY(yPx) },
        end: { x: toPdfX(xPx + sizePx), y: toPdfY(yPx + sizePx) },
        color: dark,
        thickness: 1,
      });
      page.drawLine({
        start: { x: toPdfX(xPx), y: toPdfY(yPx + sizePx) },
        end: { x: toPdfX(xPx + sizePx), y: toPdfY(yPx) },
        color: dark,
        thickness: 1,
      });
    }

    drawTemplateText(`DOC-${certificateDisplayId}`, 560, 340, 380, {
      size: 8.9,
      minSize: 6.6,
    });
    drawTemplateText(formatChicagoDateTime(completedAt), 1332, 340, 264, {
      size: 8.9,
      minSize: 6.8,
      align: "left",
    });
    drawTemplateText(bookingDisplayId, 560, 413, 1028, {
      size: 8.7,
      minSize: 6.2,
      maxLength: 320,
    });

    drawTemplateText(sanitized.customerFullName || "Not set", 252, 658, 690, {
      size: 8.6,
      minSize: 6.4,
    });
    drawTemplateText(sanitized.customerEmail || "Not set", 252, 774, 690, {
      size: 8.6,
      minSize: 6.2,
    });
    drawTemplateText(sanitized.customerPhone || "Not set", 252, 890, 690, {
      size: 8.6,
      minSize: 6.2,
    });
    drawTemplateWrappedText(sanitized.serviceAddress || "Not set", 252, 1002, 1328, {
      size: 8.5,
      lineHeight: 10,
      maxLines: 2,
    });

    drawTemplateText(formatChicagoDateTime(sanitized.sentAt), 985, 678, 610, {
      size: 8.5,
      minSize: 6.2,
    });
    drawTemplateText(
      formatChicagoDateTime(sanitized.firstViewedAt || sanitized.lastViewedAt),
      985,
      794,
      610,
      {
        size: 8.5,
        minSize: 6.2,
      }
    );
    drawTemplateText(formatChicagoDateTime(sanitized.signedAt), 985, 910, 610, {
      size: 8.5,
      minSize: 6.2,
    });

    const acceptedDocuments = [
      sanitized.termsDocument,
      sanitized.paymentPolicyDocument,
    ];
    const documentBaselines = [
      [1156, 1218, 1291],
      [1383, 1446, 1510],
    ];
    acceptedDocuments.forEach((document, index) => {
      const [nameY, urlY, versionY] = documentBaselines[index];
      drawTemplateText(document.title || "Policy document", 692, nameY, 900, {
        size: 8.4,
        minSize: 6.2,
        maxLength: 220,
      });
      drawTemplateText(document.publicUrl || "Not set", 692, urlY, 900, {
        size: 8.1,
        minSize: 5.7,
        maxLength: 2000,
      });
      drawTemplateText(
        `${document.version || "Not set"} / ${document.effectiveDate || "Not set"}`,
        692,
        versionY,
        900,
        {
          size: 8.1,
          minSize: 5.7,
          maxLength: 220,
        }
      );
    });

    clearTemplateRect(238, 1670, 1384, 206);
    drawTemplateWrappedText(buildAcceptanceStatement(sanitized), 252, 1768, 1342, {
      size: 8,
      lineHeight: 9.2,
      maxLines: 7,
      maxLength: 2000,
    });

    if (sanitized.acceptedTerms) {
      drawTemplateCross(258, 1944, 28);
    }
    if (sanitized.acceptedPaymentCancellation) {
      drawTemplateCross(258, 2000, 28);
    }

    clearTemplateRect(242, 2049, 760, 52);
    clearTemplateRect(1008, 2049, 608, 52);
    drawTemplateLabeledValue(
      "Typed Electronic Signature:",
      sanitized.typedSignature || "Not set",
      250,
      682,
      2087,
      298,
      {
        size: 7.8,
        minSize: 6,
        maxLength: 220,
      }
    );
    drawTemplateLabeledValue(
      "IP:",
      `${sanitized.ipAddress || "Unknown"}${sanitized.locationText ? ` - ${sanitized.locationText}` : ""}`,
      1018,
      1065,
      2087,
      530,
      {
        size: 7.8,
        minSize: 6,
        maxLength: 260,
      }
    );

    return Buffer.from(await pdfDoc.save());
  }

  function drawRule(x1, x2, y, color = borderSoft, thickness = 0.8) {
    page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      color,
      thickness,
    });
  }

  function drawCenteredText(text, y, size, font = fontBold, color = dark) {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (612 - width) / 2,
      y,
      size,
      font,
      color,
    });
  }

  function drawAcceptanceCheckbox(label, x, y, checked = true) {
    page.drawRectangle({
      x,
      y: y - 1,
      width: 11,
      height: 11,
      borderColor: dark,
      borderWidth: 0.9,
    });
    if (checked) {
      page.drawLine({
        start: { x: x + 2, y: y + 8 },
        end: { x: x + 9, y: y + 1 },
        color: dark,
        thickness: 1,
      });
      page.drawLine({
        start: { x: x + 2, y: y + 1 },
        end: { x: x + 9, y: y + 8 },
        color: dark,
        thickness: 1,
      });
    }
    page.drawText(label, {
      x: x + 18,
      y,
      size: 10,
      font: fontRegular,
      color: dark,
    });
  }

  function drawLabeledValue(label, value, x, y, width, options = {}) {
    const labelSize = options.labelSize || 10;
    const valueSize = options.valueSize || 10;
    const maxLines = options.maxLines || 1;
    const valueFont = options.valueFont || fontRegular;
    const valueColor = options.valueColor || dark;
    const drawUnderline = options.drawUnderline !== false;
    const labelText = String(label || "").toUpperCase();
    const safeValue = normalizeString(value, 500) || "";
    const labelWidth = fontBold.widthOfTextAtSize(labelText, labelSize);
    page.drawText(labelText, {
      x,
      y,
      size: labelSize,
      font: fontBold,
      color: dark,
    });

    const valueX = x;
    const valueY = y - 16;
    const wrapped = wrapTextLines(valueFont, safeValue || "—", valueSize, width).slice(0, maxLines);
    let cursorY = valueY;
    for (const line of wrapped) {
      page.drawText(line, {
        x: valueX,
        y: cursorY,
        size: valueSize,
        font: valueFont,
        color: valueColor,
      });
      cursorY -= valueSize + 2;
    }

    if (drawUnderline) {
      const underlineY = valueY - (wrapped.length - 1) * (valueSize + 2) - 3;
      drawRule(x, x + width, underlineY, border, 0.7);
    }

    return cursorY - 8;
  }

  function drawHeaderMeta(label, value, x, y, width, align = "left") {
    const safeValue = normalizeString(value, 240) || "";
    const labelText = `${label}:`;
    const labelWidth = fontBold.widthOfTextAtSize(labelText, 9.5);
    const fittedValue = fitPdfText(fontRegular, safeValue, width, 9, 6.3);
    if (align === "right") {
      const blockRight = x + width;
      page.drawText(labelText, {
        x: blockRight - labelWidth,
        y,
        size: 9.5,
        font: fontBold,
        color: dark,
      });
      drawRule(x + 98, blockRight, y - 6, slate, 0.8);
      const valueWidth = fontRegular.widthOfTextAtSize(fittedValue.text, fittedValue.size);
      page.drawText(fittedValue.text, {
        x: blockRight - valueWidth,
        y: y - 18,
        size: fittedValue.size,
        font: fontRegular,
        color: dark,
      });
    } else {
      page.drawText(labelText, {
        x,
        y,
        size: 9.5,
        font: fontBold,
        color: dark,
      });
      drawRule(x + labelWidth + 6, x + width, y - 6, slate, 0.8);
      page.drawText(fittedValue.text, {
        x,
        y: y - 18,
        size: fittedValue.size,
        font: fontRegular,
        color: dark,
      });
    }
  }

  page.drawRectangle({
    x: 18,
    y: 18,
    width: 576,
    height: 756,
    borderColor: teal,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 28,
    y: 28,
    width: 556,
    height: 736,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 38,
    y: 38,
    width: 536,
    height: 716,
    borderColor: borderSoft,
    borderWidth: 1,
  });

  for (let y = 52; y <= 742; y += 14) {
    page.drawSvgPath(
      `M 48 ${y} C 112 ${y + 5}, 176 ${y - 5}, 240 ${y} S 368 ${y + 5}, 432 ${y} S 496 ${y - 5}, 560 ${y}`,
      {
        borderColor: wave,
        borderWidth: 0.45,
        opacity: 0.22,
      }
    );
  }

  drawHeaderMeta("CERTIFICATE ID", `DOC-${certificateDisplayId}`, 56, 730, 214);
  drawHeaderMeta("BOOKING ID", bookingDisplayId, 56, 702, 214);
  drawHeaderMeta("DOCUMENT COMPLETED ON", formatChicagoDateTime(completedAt), 346, 730, 190, "right");

  drawCenteredText("CERTIFICATE OF", 655, 18, fontRegular);
  drawCenteredText("POLICY ACCEPTANCE", 626, 23, fontBold);

  const customerBox = { x: 60, y: 430, width: 470, height: 158 };
  page.drawRectangle({
    x: customerBox.x,
    y: customerBox.y,
    width: customerBox.width,
    height: customerBox.height,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });
  page.drawRectangle({
    x: customerBox.x,
    y: customerBox.y + customerBox.height - 30,
    width: customerBox.width,
    height: 30,
    borderColor: border,
    borderWidth: 1,
    color: rgb(0.96, 0.97, 0.98),
  });
  page.drawLine({
    start: { x: 318, y: customerBox.y },
    end: { x: 318, y: customerBox.y + customerBox.height },
    color: border,
    thickness: 1,
  });
  page.drawText("CUSTOMER", {
    x: 68,
    y: customerBox.y + customerBox.height - 20,
    size: 10.5,
    font: fontBold,
    color: dark,
  });
  page.drawText("TIMESTAMP", {
    x: 328,
    y: customerBox.y + customerBox.height - 20,
    size: 10.5,
    font: fontBold,
    color: dark,
  });

  let customerCursorY = customerBox.y + customerBox.height - 48;
  customerCursorY = drawLabeledValue("NAME", sanitized.customerFullName || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
  });
  customerCursorY = drawLabeledValue("EMAIL", sanitized.customerEmail || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
  });
  customerCursorY = drawLabeledValue("PHONE", sanitized.customerPhone || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
  });
  drawLabeledValue("SERVICE ADDRESS", sanitized.serviceAddress || "Not set", 68, customerCursorY, 230, {
    valueSize: 9.5,
    maxLines: 2,
  });

  let timestampCursorY = customerBox.y + customerBox.height - 48;
  timestampCursorY = drawLabeledValue("SENT", formatChicagoDateTime(sanitized.sentAt), 328, timestampCursorY, 190, {
    valueSize: 9.5,
  });
  timestampCursorY = drawLabeledValue(
    "VIEWED",
    formatChicagoDateTime(sanitized.firstViewedAt || sanitized.lastViewedAt),
    328,
    timestampCursorY,
    190,
    {
      valueSize: 9.5,
    }
  );
  drawLabeledValue("ACCEPTED", formatChicagoDateTime(sanitized.signedAt), 328, timestampCursorY, 190, {
    valueSize: 9.5,
  });

  const documentsBox = { x: 60, y: 268, width: 470, height: 118 };
  page.drawText("ACCEPTED DOCUMENTS", {
    x: documentsBox.x,
    y: documentsBox.y + documentsBox.height + 14,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawRectangle({
    x: documentsBox.x,
    y: documentsBox.y,
    width: documentsBox.width,
    height: documentsBox.height,
    borderColor: border,
    borderWidth: 1,
    color: fill,
  });
  drawRule(documentsBox.x, documentsBox.x + documentsBox.width, documentsBox.y + 58, border, 0.8);

  let documentsCursorY = documentsBox.y + documentsBox.height - 18;
  const documents = [
    sanitized.termsDocument,
    sanitized.paymentPolicyDocument,
  ];
  documents.forEach((document, index) => {
    page.drawText(document.title || "Policy document", {
      x: 68,
      y: documentsCursorY,
      size: 10,
      font: fontBold,
      color: dark,
    });
    documentsCursorY = drawWrappedText(
      page,
      fontRegular,
      `URL: ${document.publicUrl}`,
      68,
      documentsCursorY - 14,
      450,
      9,
      { lineHeight: 11, color: dark }
    ) - 2;
    documentsCursorY = drawWrappedText(
      page,
      fontRegular,
      `Version / Effective Date: ${document.version} / ${document.effectiveDate}`,
      68,
      documentsCursorY - 2,
      450,
      9,
      { lineHeight: 11, color: dark }
    ) - 10;
    if (index === 0) {
      documentsCursorY -= 8;
    }
  });

  page.drawText("CUSTOMER ACCEPTANCE STATEMENT", {
    x: 60,
    y: 226,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawRectangle({
    x: 60,
    y: 58,
    width: 470,
    height: 150,
    borderColor: border,
    borderWidth: 1,
    color: rgb(0.995, 0.996, 0.997),
  });
  drawWrappedText(
    page,
    fontRegular,
    buildAcceptanceStatement(sanitized),
    68,
    188,
    454,
    10,
    { lineHeight: 12, color: dark }
  );

  drawAcceptanceCheckbox(
    "I have read and agree to the Terms of Service",
    68,
    102,
    sanitized.acceptedTerms
  );
  drawAcceptanceCheckbox(
    "I agree to the Payment and Cancellation Policy",
    68,
    84,
    sanitized.acceptedPaymentCancellation
  );
  page.drawText(`Typed electronic signature: ${sanitized.typedSignature || "Not set"}`, {
    x: 68,
    y: 66,
    size: 8.5,
    font: fontRegular,
    color: muted,
  });
  page.drawText(`IP: ${sanitized.ipAddress || "Unknown"}${sanitized.locationText ? ` - ${sanitized.locationText}` : ""}`, {
    x: 68,
    y: 52,
    size: 8.5,
    font: fontRegular,
    color: muted,
  });
  page.drawText("PAGE 1 OF 1", {
    x: 278,
    y: 40,
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

function buildPolicyAcceptancePageUrl(token = "", options = {}) {
  const safeToken = normalizeString(token, 6000);
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
  const acceptance = normalizeObject(payload && payload.acceptance);
  const isAccepted = Boolean(acceptance.policyAccepted);
  const acceptedCertificateUrl = normalizeString(acceptance.certificateUrl, 4000);
  const acceptedSignedAt = normalizeString(acceptance.signedAt, 120);
  const isJustConfirmed = successVariant === "just-confirmed";
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
  const parseFormBody = typeof options.parseFormBody === "function" ? options.parseFormBody : () => ({});
  const readJsonBody = typeof options.readJsonBody === "function" ? options.readJsonBody : async () => ({});
  const readTextBody = typeof options.readTextBody === "function" ? options.readTextBody : async () => "";
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
    const publicToken = `${bookingId}.${createShortPolicyAccessCode()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getPolicyTokenTtlSeconds(env) * 1000).toISOString();
    const confirmationUrl = new URL(POLICY_ACCEPTANCE_PAGE_PATH, `${siteOrigin}/`);
    confirmationUrl.searchParams.set("token", publicToken);

    const record = sanitizePolicyAcceptanceRecord({
      acceptanceId: crypto.randomUUID(),
      bookingId,
      requestId,
      status: "pending",
      secureTokenId: envelopeId,
      envelopeId,
      secureTokenHash: hashString(publicToken),
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
      token: publicToken,
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
    const rawToken = normalizeString(token, 6000);
    let decoded = null;
    const shortToken = decodeShortPolicyAcceptanceToken(rawToken);
    if (shortToken) {
      decoded = shortToken;
    } else {
      try {
        decoded = decodePolicyAcceptanceToken(rawToken, { env });
      } catch (error) {
        if (!(options.allowAcceptedReadOnly && error && error.code === "POLICY_TOKEN_EXPIRED")) {
          throw error;
        }
        decoded = decodePolicyAcceptanceToken(rawToken, { env, ignoreExpiry: true });
      }
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
    if (!decoded.isShortToken && (!envelopeId || envelopeId !== decoded.envelopeId)) {
      throw new PolicyAcceptanceTokenError("This confirmation link is no longer active.", {
        code: "POLICY_TOKEN_REVOKED",
        status: 410,
      });
    }

    const tokenHash = hashString(rawToken);
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

  async function storeCertificateFile(record, pdfBuffer, existingFile = null) {
    const fileInfo = buildPolicyCertificateFilePath(documentsDir, record);
    const sanitizedExistingFile = sanitizeCertificateFile(existingFile);
    await fsp.mkdir(path.dirname(fileInfo.absolutePath), { recursive: true });
    await fsp.writeFile(fileInfo.absolutePath, pdfBuffer);
    return sanitizeCertificateFile({
      id: sanitizedExistingFile && sanitizedExistingFile.id ? sanitizedExistingFile.id : crypto.randomUUID(),
      fileName:
        sanitizedExistingFile && sanitizedExistingFile.fileName
          ? sanitizedExistingFile.fileName
          : fileInfo.fileName,
      relativePath: fileInfo.relativePath,
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: pdfBuffer.length,
      generatedAt: new Date().toISOString(),
      generatorVersion: POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION,
    });
  }

  async function ensureCurrentCertificateRecord(quoteOpsLedger, entryId, record) {
    const sanitizedRecord = sanitizePolicyAcceptanceRecord(record);
    if (!sanitizedRecord.policyAccepted) {
      throw new PolicyAcceptanceTokenError("Certificate file is not available.", {
        code: "POLICY_CERTIFICATE_NOT_FOUND",
        status: 404,
      });
    }

    const currentCertificateFile = sanitizeCertificateFile(sanitizedRecord.certificateFile);
    let needsRegeneration =
      !currentCertificateFile ||
      currentCertificateFile.generatorVersion !== POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION;

    if (!needsRegeneration && currentCertificateFile) {
      try {
        const absolutePath = resolveSafeAbsolutePath(documentsDir, currentCertificateFile.relativePath);
        await fsp.access(absolutePath);
      } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
          needsRegeneration = true;
        } else {
          throw error;
        }
      }
    }

    if (!needsRegeneration) {
      return sanitizedRecord;
    }

    const regeneratedBuffer = await generatePolicyAcceptanceCertificate(sanitizedRecord);
    const nextCertificateFile = await storeCertificateFile(
      sanitizedRecord,
      regeneratedBuffer,
      currentCertificateFile
    );
    sanitizedRecord.certificateFileId = nextCertificateFile.id;
    sanitizedRecord.certificateFile = nextCertificateFile;
    sanitizedRecord.auditTrailJson = buildAuditTrailJson(sanitizedRecord);

    if (quoteOpsLedger && typeof quoteOpsLedger.updateOrderEntry === "function" && entryId) {
      await updateEntryPolicyAcceptance(quoteOpsLedger, entryId, sanitizedRecord);
    }

    return sanitizedRecord;
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
    const sanitizedRecord = sanitizePolicyAcceptanceRecord(record);
    const certificateFile =
      sanitizeCertificateFile(sanitizedRecord.certificateFile) ||
      sanitizeCertificateFile({
        ...buildPolicyCertificateFilePath(documentsDir, sanitizedRecord),
        contentType: PDF_CONTENT_TYPE,
        generatedAt: sanitizedRecord.signedAt || sanitizedRecord.updatedAt || new Date().toISOString(),
      });

    if (!sanitizedRecord.policyAccepted) {
      throw new PolicyAcceptanceTokenError("Certificate file is not available.", {
        code: "POLICY_CERTIFICATE_NOT_FOUND",
        status: 404,
      });
    }

    try {
      const absolutePath = resolveSafeAbsolutePath(documentsDir, certificateFile.relativePath);
      return {
        file: certificateFile,
        buffer: await fsp.readFile(absolutePath),
      };
    } catch (error) {
      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        const regeneratedBuffer = await generatePolicyAcceptanceCertificate(sanitizedRecord);
        return {
          file: {
            ...certificateFile,
            sizeBytes: regeneratedBuffer.length,
          },
          buffer: regeneratedBuffer,
        };
      }
      throw error;
    }
  }

  async function handlePublicPage(req, res, requestStartNs, requestContext, quoteOpsLedger) {
    const reqUrl = getRequestUrl(req);
    const token = normalizeString(reqUrl.searchParams.get("token"), 6000);
    const successVariant = reqUrl.searchParams.get("confirmed") === "1" ? "just-confirmed" : "";
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
          successVariant,
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

  async function handlePublicFormSubmit(req, res, requestStartNs, requestContext, quoteOpsLedger) {
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

    const rawBody = await readTextBody(req, 64 * 1024);
    const formBody = parseFormBody(rawBody);

    try {
      await submitAcceptance(quoteOpsLedger, token, formBody, req);
      writeHeadWithTiming(
        res,
        303,
        {
          Location: buildPolicyAcceptancePageUrl(token, { confirmed: true }),
          "Cache-Control": "no-store",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end();
    } catch (error) {
      const status = Number.isFinite(error && error.status) ? error.status : 400;
      try {
        const { entry, record } = await resolveTokenContext(quoteOpsLedger, token, {
          allowAcceptedReadOnly: true,
        });
        writeHtmlWithTiming(
          res,
          status,
          renderPolicyAcceptancePage({
            token,
            pageTitle: "Policy Acceptance",
            payload: buildPublicPolicyPayload(entry, record, { token }),
            formError: normalizeString(
              error && error.message ? error.message : "Unable to complete confirmation.",
              300
            ),
          }),
          requestStartNs,
          requestContext.cacheHit
        );
        return;
      } catch {
        writeHtmlWithTiming(
          res,
          status,
          renderPolicyAcceptancePage({
            pageTitle: "Policy Acceptance",
            errorTitle: "Confirmation unavailable",
            errorCopy: normalizeString(
              error && error.message ? error.message : "Unable to complete confirmation.",
              300
            ),
          }),
          requestStartNs,
          requestContext.cacheHit
        );
      }
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
            redirectUrl: buildPolicyAcceptancePageUrl(token, { confirmed: true }),
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
        const currentRecord = await ensureCurrentCertificateRecord(
          quoteOpsLedger,
          normalizeString(record.bookingId, 120),
          record
        );
        const certificate = await readCertificateBuffer(currentRecord);
        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": certificate.file.contentType || PDF_CONTENT_TYPE,
            "Content-Length": String(certificate.buffer.length),
            "Content-Disposition": `inline; filename="${certificate.file.fileName}"`,
            "Cache-Control": "no-store, max-age=0",
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
      const currentRecord = await ensureCurrentCertificateRecord(
        quoteOpsLedger,
        normalizeString(entry.id, 120),
        record
      );
      const certificate = await readCertificateBuffer(currentRecord);
      writeHeadWithTiming(
        res,
        200,
        {
          "Content-Type": certificate.file.contentType || PDF_CONTENT_TYPE,
          "Content-Length": String(certificate.buffer.length),
          "Content-Disposition": `inline; filename="${certificate.file.fileName}"`,
          "Cache-Control": "no-store, max-age=0",
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
      if (pathname === POLICY_ACCEPTANCE_PAGE_PATH && req.method === "POST") {
        await handlePublicFormSubmit(req, res, requestStartNs, requestContext, quoteOpsLedger);
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
