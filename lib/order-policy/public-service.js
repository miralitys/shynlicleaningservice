"use strict";

const DEFAULT_POLICY_ACCEPTANCE_PAGE_PATH = "/booking/confirm";
const DEFAULT_POLICY_ACCEPTANCE_API_BASE_PATH = "/api/policy-acceptance";
const DEFAULT_PDF_CONTENT_TYPE = "application/pdf";

function fallbackNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function fallbackNormalizeBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = fallbackNormalizeString(value, 16).toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

function createOrderPolicyAcceptancePublicService(options = {}) {
  const normalizeString =
    typeof options.normalizeString === "function" ? options.normalizeString : fallbackNormalizeString;
  const normalizeBoolean =
    typeof options.normalizeBoolean === "function" ? options.normalizeBoolean : fallbackNormalizeBoolean;
  const appendPolicyEvent =
    typeof options.appendPolicyEvent === "function" ? options.appendPolicyEvent : (record) => record;
  const updateEntryPolicyAcceptance =
    typeof options.updateEntryPolicyAcceptance === "function"
      ? options.updateEntryPolicyAcceptance
      : async (quoteOpsLedger, entryId, nextRecord) => nextRecord;
  const resolveTokenContext =
    typeof options.resolveTokenContext === "function"
      ? options.resolveTokenContext
      : async () => ({ entry: {}, record: {} });
  const markPageViewed =
    typeof options.markPageViewed === "function"
      ? options.markPageViewed
      : async (quoteOpsLedger, entry, record) => record;
  const getRequestUrl =
    typeof options.getRequestUrl === "function"
      ? options.getRequestUrl
      : (req) => new URL(req.url || "/", `http://${(req && req.headers && req.headers.host) || "localhost"}`);
  const getClientAddress = typeof options.getClientAddress === "function" ? options.getClientAddress : () => "unknown";
  const inferLocationText =
    typeof options.inferLocationText === "function" ? options.inferLocationText : () => "";
  const generatePolicyAcceptanceCertificate =
    typeof options.generatePolicyAcceptanceCertificate === "function"
      ? options.generatePolicyAcceptanceCertificate
      : async () => Buffer.alloc(0);
  const storeCertificateFile =
    typeof options.storeCertificateFile === "function"
      ? options.storeCertificateFile
      : async (record) => ({
          id: normalizeString(record && record.certificateFileId, 120),
          fileName: "policy-acceptance-certificate.pdf",
          relativePath: "",
          contentType: DEFAULT_PDF_CONTENT_TYPE,
          sizeBytes: 0,
        });
  const buildAuditTrailJson =
    typeof options.buildAuditTrailJson === "function" ? options.buildAuditTrailJson : () => ({});
  const renderPolicyAcceptancePage =
    typeof options.renderPolicyAcceptancePage === "function"
      ? options.renderPolicyAcceptancePage
      : () => "<!doctype html><title>Policy Acceptance</title>";
  const buildPublicPolicyPayload =
    typeof options.buildPublicPolicyPayload === "function"
      ? options.buildPublicPolicyPayload
      : () => ({});
  const buildPolicyAcceptancePageUrl =
    typeof options.buildPolicyAcceptancePageUrl === "function"
      ? options.buildPolicyAcceptancePageUrl
      : () => DEFAULT_POLICY_ACCEPTANCE_PAGE_PATH;
  const readTextBody =
    typeof options.readTextBody === "function" ? options.readTextBody : async () => "";
  const parseFormBody =
    typeof options.parseFormBody === "function" ? options.parseFormBody : () => ({});
  const readJsonBody =
    typeof options.readJsonBody === "function" ? options.readJsonBody : async () => ({});
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
  const ensureCurrentCertificateRecord =
    typeof options.ensureCurrentCertificateRecord === "function"
      ? options.ensureCurrentCertificateRecord
      : async (quoteOpsLedger, entryId, record) => record;
  const readCertificateBuffer =
    typeof options.readCertificateBuffer === "function"
      ? options.readCertificateBuffer
      : async () => ({
          file: { fileName: "policy-acceptance-certificate.pdf", contentType: DEFAULT_PDF_CONTENT_TYPE },
          buffer: Buffer.alloc(0),
        });
  const PolicyAcceptanceTokenError =
    typeof options.PolicyAcceptanceTokenError === "function"
      ? options.PolicyAcceptanceTokenError
      : createFallbackPolicyAcceptanceTokenError();
  const policyAcceptancePagePath =
    normalizeString(options.policyAcceptancePagePath, 200) || DEFAULT_POLICY_ACCEPTANCE_PAGE_PATH;
  const policyAcceptanceApiBasePath =
    normalizeString(options.policyAcceptanceApiBasePath, 200) || DEFAULT_POLICY_ACCEPTANCE_API_BASE_PATH;
  const pdfContentType = normalizeString(options.pdfContentType, 120) || DEFAULT_PDF_CONTENT_TYPE;

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
    pendingRecord.userAgent = normalizeString(req && req.headers ? req.headers["user-agent"] : "", 500);
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
      certificateUrl: `${policyAcceptanceApiBasePath}/${encodeURIComponent(token)}/certificate`,
    };
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
        userAgent: req && req.headers ? req.headers["user-agent"] : "",
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
    const suffix = pathname.slice(`${policyAcceptanceApiBasePath}/`.length);
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
          userAgent: req && req.headers ? req.headers["user-agent"] : "",
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

  return {
    handlePublicPage,
    handlePublicFormSubmit,
    handlePublicApi,
    submitAcceptance,
  };
}

module.exports = {
  createOrderPolicyAcceptancePublicService,
};
