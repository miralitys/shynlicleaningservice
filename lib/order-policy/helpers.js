"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");

const { PDF_CONTENT_TYPE } = require("./certificate");
const { buildPublicPolicyPayload: buildPublicPolicyPayloadImpl } = require("./public-payload");

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
  return (
    normalizeString(value, maxLength)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength) || "policy-acceptance"
  );
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
  return buildPublicPolicyPayloadImpl(customerSummary, record, {
    token: normalizeString(options.token, 6000),
    apiBasePath: normalizeString(options.apiBasePath, 120) || "/api/policy-acceptance",
    normalizeString,
  });
}

function buildAcceptanceStatement() {
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

const policyCertificateHelpers = {
  normalizeString,
  sanitizePolicyAcceptanceRecord,
  buildAcceptanceStatement,
};

module.exports = {
  appendPolicyEvent,
  buildAcceptanceStatement,
  buildAuditTrailJson,
  buildPolicyCertificateFilePath,
  buildPublicPolicyPayload,
  escapeHtml,
  escapeHtmlAttribute,
  getEntryPolicyAcceptanceRecord,
  hashString,
  inferLocationText,
  loadActivePolicyDocuments,
  normalizeBoolean,
  normalizeEmail,
  normalizeString,
  policyCertificateHelpers,
  resolveSafeAbsolutePath,
  sanitizeCertificateFile,
  sanitizePolicyAcceptanceRecord,
};
