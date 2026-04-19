"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");

const DEFAULT_POLICY_ACCEPTANCE_DOCUMENTS_DIR = path.join(process.cwd(), "data", "policy-acceptance");
const DEFAULT_PDF_CONTENT_TYPE = "application/pdf";

function fallbackNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function fallbackSanitizePolicyAcceptanceRecord(value = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createFallbackPolicyAcceptanceTokenError() {
  return class FallbackPolicyAcceptanceTokenError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "FallbackPolicyAcceptanceTokenError";
      this.code = fallbackNormalizeString(details.code, 80);
      this.status = Number.isFinite(details.status) ? details.status : 400;
    }
  };
}

function createOrderPolicyAcceptanceSharedService(options = {}) {
  const env = options.env || process.env;
  const normalizeString =
    typeof options.normalizeString === "function" ? options.normalizeString : fallbackNormalizeString;
  const hashString = typeof options.hashString === "function" ? options.hashString : (value) => String(value || "");
  const sanitizePolicyAcceptanceRecord =
    typeof options.sanitizePolicyAcceptanceRecord === "function"
      ? options.sanitizePolicyAcceptanceRecord
      : fallbackSanitizePolicyAcceptanceRecord;
  const getEntryPolicyAcceptanceRecord =
    typeof options.getEntryPolicyAcceptanceRecord === "function"
      ? options.getEntryPolicyAcceptanceRecord
      : () => sanitizePolicyAcceptanceRecord();
  const decodeShortPolicyAcceptanceToken =
    typeof options.decodeShortPolicyAcceptanceToken === "function"
      ? options.decodeShortPolicyAcceptanceToken
      : () => null;
  const decodePolicyAcceptanceToken =
    typeof options.decodePolicyAcceptanceToken === "function"
      ? options.decodePolicyAcceptanceToken
      : () => {
          throw new Error("POLICY_TOKEN_DECODER_UNAVAILABLE");
        };
  const appendPolicyEvent =
    typeof options.appendPolicyEvent === "function"
      ? options.appendPolicyEvent
      : (record) => sanitizePolicyAcceptanceRecord(record);
  const sanitizeCertificateFile =
    typeof options.sanitizeCertificateFile === "function" ? options.sanitizeCertificateFile : () => null;
  const buildPolicyCertificateFilePath =
    typeof options.buildPolicyCertificateFilePath === "function"
      ? options.buildPolicyCertificateFilePath
      : () => ({
          fileName: "policy-acceptance-certificate.pdf",
          relativePath: "policy-acceptance-certificate.pdf",
          absolutePath: path.join(DEFAULT_POLICY_ACCEPTANCE_DOCUMENTS_DIR, "policy-acceptance-certificate.pdf"),
        });
  const resolveSafeAbsolutePath =
    typeof options.resolveSafeAbsolutePath === "function" ? options.resolveSafeAbsolutePath : path.resolve;
  const generatePolicyAcceptanceCertificate =
    typeof options.generatePolicyAcceptanceCertificate === "function"
      ? options.generatePolicyAcceptanceCertificate
      : async () => Buffer.alloc(0);
  const buildAuditTrailJson =
    typeof options.buildAuditTrailJson === "function" ? options.buildAuditTrailJson : () => ({});
  const PolicyAcceptanceTokenError =
    typeof options.PolicyAcceptanceTokenError === "function"
      ? options.PolicyAcceptanceTokenError
      : createFallbackPolicyAcceptanceTokenError();
  const documentsDir = path.resolve(
    normalizeString(options.documentsDir, 1000) || DEFAULT_POLICY_ACCEPTANCE_DOCUMENTS_DIR
  );
  const pdfContentType = normalizeString(options.pdfContentType, 120) || DEFAULT_PDF_CONTENT_TYPE;
  const certificateGeneratorVersion = normalizeString(options.certificateGeneratorVersion, 120);

  async function updateEntryPolicyAcceptance(quoteOpsLedger, entryId, nextRecord) {
    if (!quoteOpsLedger || typeof quoteOpsLedger.updateOrderEntry !== "function") {
      throw new Error("QUOTE_OPS_LEDGER_UNAVAILABLE");
    }
    return quoteOpsLedger.updateOrderEntry(entryId, {
      policyAcceptance: sanitizePolicyAcceptanceRecord(nextRecord),
    });
  }

  async function resolveTokenContext(quoteOpsLedger, token, resolveOptions = {}) {
    const rawToken = normalizeString(token, 6000);
    let decoded = null;
    const shortToken = decodeShortPolicyAcceptanceToken(rawToken);
    if (shortToken) {
      decoded = shortToken;
    } else {
      try {
        decoded = decodePolicyAcceptanceToken(rawToken, { env });
      } catch (error) {
        if (!(resolveOptions.allowAcceptedReadOnly && error && error.code === "POLICY_TOKEN_EXPIRED")) {
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

    if (!resolveOptions.allowAcceptedReadOnly && record.policyAccepted) {
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
      contentType: pdfContentType,
      sizeBytes: pdfBuffer.length,
      generatedAt: new Date().toISOString(),
      generatorVersion: certificateGeneratorVersion,
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
      currentCertificateFile.generatorVersion !== certificateGeneratorVersion;

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

  async function readCertificateBuffer(record) {
    const sanitizedRecord = sanitizePolicyAcceptanceRecord(record);
    const certificateFile =
      sanitizeCertificateFile(sanitizedRecord.certificateFile) ||
      sanitizeCertificateFile({
        ...buildPolicyCertificateFilePath(documentsDir, sanitizedRecord),
        contentType: pdfContentType,
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

  return {
    updateEntryPolicyAcceptance,
    resolveTokenContext,
    markPageViewed,
    storeCertificateFile,
    ensureCurrentCertificateRecord,
    readCertificateBuffer,
  };
}

module.exports = {
  createOrderPolicyAcceptanceSharedService,
};
