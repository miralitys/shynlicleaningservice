"use strict";

const crypto = require("node:crypto");

const DEFAULT_POLICY_ACCEPTANCE_PAGE_PATH = "/booking/confirm";
const DEFAULT_ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH = "/api/admin/policy-acceptance";

function fallbackNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function fallbackNormalizeEmail(value) {
  return fallbackNormalizeString(value, 320).toLowerCase();
}

function fallbackSanitizePolicyAcceptanceRecord(value = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createOrderPolicyAcceptanceAdminService(options = {}) {
  const env = options.env || process.env;
  const normalizeString =
    typeof options.normalizeString === "function" ? options.normalizeString : fallbackNormalizeString;
  const normalizeEmail =
    typeof options.normalizeEmail === "function" ? options.normalizeEmail : fallbackNormalizeEmail;
  const sanitizePolicyAcceptanceRecord =
    typeof options.sanitizePolicyAcceptanceRecord === "function"
      ? options.sanitizePolicyAcceptanceRecord
      : fallbackSanitizePolicyAcceptanceRecord;
  const appendPolicyEvent =
    typeof options.appendPolicyEvent === "function"
      ? options.appendPolicyEvent
      : (record) => sanitizePolicyAcceptanceRecord(record);
  const hashString = typeof options.hashString === "function" ? options.hashString : (value) => String(value || "");
  const createShortPolicyAccessCode =
    typeof options.createShortPolicyAccessCode === "function" ? options.createShortPolicyAccessCode : () => "";
  const getPolicyTokenTtlSeconds =
    typeof options.getPolicyTokenTtlSeconds === "function" ? options.getPolicyTokenTtlSeconds : () => 0;
  const loadActivePolicyDocuments =
    typeof options.loadActivePolicyDocuments === "function"
      ? options.loadActivePolicyDocuments
      : async () => ({
          termsDocument: {},
          paymentPolicyDocument: {},
        });
  const getEntryPolicyAcceptanceRecord =
    typeof options.getEntryPolicyAcceptanceRecord === "function"
      ? options.getEntryPolicyAcceptanceRecord
      : () => sanitizePolicyAcceptanceRecord();
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
  const hasAdminWorkspaceAccess =
    typeof options.hasAdminWorkspaceAccess === "function"
      ? options.hasAdminWorkspaceAccess
      : async () => false;
  const ensureCurrentCertificateRecord =
    typeof options.ensureCurrentCertificateRecord === "function"
      ? options.ensureCurrentCertificateRecord
      : async (quoteOpsLedger, entryId, record) => sanitizePolicyAcceptanceRecord(record);
  const readCertificateBuffer =
    typeof options.readCertificateBuffer === "function"
      ? options.readCertificateBuffer
      : async () => ({
          file: {},
          buffer: Buffer.alloc(0),
        });
  const siteOrigin = normalizeString(options.siteOrigin, 500) || "https://shynlicleaningservice.com";
  const policyAcceptancePagePath =
    normalizeString(options.policyAcceptancePagePath, 200) || DEFAULT_POLICY_ACCEPTANCE_PAGE_PATH;
  const adminPolicyAcceptanceApiBasePath =
    normalizeString(options.adminPolicyAcceptanceApiBasePath, 200) ||
    DEFAULT_ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH;
  const pdfContentType = normalizeString(options.pdfContentType, 120) || "application/pdf";

  async function buildPendingAcceptance(entry) {
    const documents = await loadActivePolicyDocuments({ env, siteOrigin });
    const bookingId = normalizeString(entry && entry.id, 120);
    const requestId = normalizeString(entry && entry.requestId, 120);
    const envelopeId = crypto.randomUUID();
    const publicToken = `${bookingId}.${createShortPolicyAccessCode()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getPolicyTokenTtlSeconds(env) * 1000).toISOString();
    const confirmationUrl = new URL(policyAcceptancePagePath, `${siteOrigin}/`);
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
      customerFullName: normalizeString(entry && entry.customerName, 180),
      customerEmail: normalizeEmail(entry && entry.customerEmail),
      customerPhone: normalizeString(entry && entry.customerPhone, 80),
      serviceAddress: normalizeString(entry && entry.fullAddress, 500),
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

  function buildAdminPolicyPayload(entry, record) {
    return {
      bookingId: normalizeString(entry && entry.id, 120),
      requestId: normalizeString(entry && entry.requestId, 120),
      customerFullName: normalizeString(entry && entry.customerName, 180),
      customerEmail: normalizeEmail(entry && entry.customerEmail),
      customerPhone: normalizeString(entry && entry.customerPhone, 80),
      serviceAddress: normalizeString(entry && entry.fullAddress, 500),
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
            downloadUrl: `${adminPolicyAcceptanceApiBasePath}/${encodeURIComponent(
              normalizeString(entry && entry.id, 120)
            )}/certificate`,
          }
        : null,
      auditTrailJson: record.auditTrailJson || null,
      events: record.events,
    };
  }

  async function handleAdminApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname) {
    const hasAccess = await hasAdminWorkspaceAccess(req);
    if (!hasAccess) {
      writeJsonWithTiming(
        res,
        401,
        { error: "Admin session required." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const suffix = pathname.slice(`${adminPolicyAcceptanceApiBasePath}/`.length);
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
          "Content-Type": certificate.file.contentType || pdfContentType,
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
    buildPendingAcceptance,
    buildSentAcceptanceRecord,
    buildFailedSendRecord,
    buildAdminPolicyPayload,
    handleAdminApi,
  };
}

module.exports = {
  createOrderPolicyAcceptanceAdminService,
};
