"use strict";

const path = require("node:path");

const {
  PolicyAcceptanceTokenError,
  createShortPolicyAccessCode,
  decodePolicyAcceptanceToken,
  decodeShortPolicyAcceptanceToken,
  getPolicyTokenTtlSeconds,
} = require("./order-policy/token");
const { buildPolicyAcceptanceEmailCopy: buildPolicyAcceptanceEmailCopyImpl } = require("./order-policy/email-copy");
const {
  PDF_CONTENT_TYPE,
  POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION,
  generatePolicyAcceptanceCertificate: generatePolicyAcceptanceCertificateImpl,
} = require("./order-policy/certificate");
const {
  buildPolicyAcceptancePageUrl: buildPolicyAcceptancePageUrlImpl,
  renderPolicyAcceptancePage: renderPolicyAcceptancePageImpl,
} = require("./order-policy/public-page");
const { createOrderPolicyAcceptanceAdminService } = require("./order-policy/admin-service");
const { createOrderPolicyAcceptancePublicService } = require("./order-policy/public-service");
const { createOrderPolicyAcceptanceSharedService } = require("./order-policy/shared-service");
const {
  appendPolicyEvent,
  buildAuditTrailJson,
  buildPublicPolicyPayload,
  buildPolicyCertificateFilePath,
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
} = require("./order-policy/helpers");

const POLICY_ACCEPTANCE_PAGE_PATH = "/booking/confirm";
const POLICY_ACCEPTANCE_API_BASE_PATH = "/api/policy-acceptance";
const ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH = "/api/admin/policy-acceptance";
const DEFAULT_POLICY_DOCUMENTS_DIR = path.join(process.cwd(), "data", "policy-acceptance");

function buildPolicyAcceptanceEmailCopy(options = {}) {
  return buildPolicyAcceptanceEmailCopyImpl(options, {
    normalizeString,
    escapeHtml,
    escapeHtmlAttribute,
  });
}

async function generatePolicyAcceptanceCertificate(record) {
  return generatePolicyAcceptanceCertificateImpl(record, policyCertificateHelpers);
}

function buildPolicyAcceptancePageUrl(token = "", options = {}) {
  return buildPolicyAcceptancePageUrlImpl(token, options);
}

function renderPolicyAcceptancePage(options = {}) {
  return renderPolicyAcceptancePageImpl(options);
}

function createOrderPolicyAcceptanceService(options = {}) {
  const env = options.env || process.env;
  const siteOrigin = normalizeString(options.siteOrigin, 500) || "https://shynlicleaningservice.com";
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
  const hasAdminWorkspaceAccess =
    typeof options.hasAdminWorkspaceAccess === "function"
      ? options.hasAdminWorkspaceAccess
      : async (req) => {
          const authState = getAdminAuthState(req);
          return Boolean(authState && authState.session);
        };

  function isHandledRoute(pathname) {
    return (
      pathname === POLICY_ACCEPTANCE_PAGE_PATH ||
      pathname.startsWith(`${POLICY_ACCEPTANCE_API_BASE_PATH}/`) ||
      pathname.startsWith(`${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/`)
    );
  }

  const sharedService = createOrderPolicyAcceptanceSharedService({
    env,
    documentsDir:
      normalizeString(env.POLICY_ACCEPTANCE_DOCUMENTS_DIR, 1000) || DEFAULT_POLICY_DOCUMENTS_DIR,
    pdfContentType: PDF_CONTENT_TYPE,
    certificateGeneratorVersion: POLICY_ACCEPTANCE_CERTIFICATE_GENERATOR_VERSION,
    normalizeString,
    hashString,
    sanitizePolicyAcceptanceRecord,
    getEntryPolicyAcceptanceRecord,
    decodeShortPolicyAcceptanceToken,
    decodePolicyAcceptanceToken,
    appendPolicyEvent,
    sanitizeCertificateFile,
    buildPolicyCertificateFilePath,
    resolveSafeAbsolutePath,
    generatePolicyAcceptanceCertificate,
    buildAuditTrailJson,
    PolicyAcceptanceTokenError,
  });

  const publicService = createOrderPolicyAcceptancePublicService({
    policyAcceptancePagePath: POLICY_ACCEPTANCE_PAGE_PATH,
    policyAcceptanceApiBasePath: POLICY_ACCEPTANCE_API_BASE_PATH,
    pdfContentType: PDF_CONTENT_TYPE,
    normalizeString,
    normalizeBoolean,
    appendPolicyEvent,
    updateEntryPolicyAcceptance: sharedService.updateEntryPolicyAcceptance,
    resolveTokenContext: sharedService.resolveTokenContext,
    markPageViewed: sharedService.markPageViewed,
    getRequestUrl,
    getClientAddress,
    inferLocationText,
    generatePolicyAcceptanceCertificate,
    storeCertificateFile: sharedService.storeCertificateFile,
    buildAuditTrailJson,
    renderPolicyAcceptancePage,
    buildPublicPolicyPayload,
    buildPolicyAcceptancePageUrl,
    readTextBody,
    parseFormBody,
    readJsonBody,
    writeHtmlWithTiming,
    writeJsonWithTiming,
    writeHeadWithTiming,
    ensureCurrentCertificateRecord: sharedService.ensureCurrentCertificateRecord,
    readCertificateBuffer: sharedService.readCertificateBuffer,
    PolicyAcceptanceTokenError,
  });

  const adminService = createOrderPolicyAcceptanceAdminService({
    env,
    siteOrigin,
    policyAcceptancePagePath: POLICY_ACCEPTANCE_PAGE_PATH,
    adminPolicyAcceptanceApiBasePath: ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    pdfContentType: PDF_CONTENT_TYPE,
    normalizeString,
    normalizeEmail,
    sanitizePolicyAcceptanceRecord,
    appendPolicyEvent,
    hashString,
    createShortPolicyAccessCode,
    getPolicyTokenTtlSeconds,
    loadActivePolicyDocuments,
    getEntryPolicyAcceptanceRecord,
    writeJsonWithTiming,
    writeHeadWithTiming,
    hasAdminWorkspaceAccess,
    ensureCurrentCertificateRecord: sharedService.ensureCurrentCertificateRecord,
    readCertificateBuffer: sharedService.readCertificateBuffer,
  });

  return {
    POLICY_ACCEPTANCE_PAGE_PATH,
    POLICY_ACCEPTANCE_API_BASE_PATH,
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    isHandledRoute,
    getEntryPolicyAcceptanceRecord,
    buildPendingAcceptance: adminService.buildPendingAcceptance,
    buildSentAcceptanceRecord: adminService.buildSentAcceptanceRecord,
    buildFailedSendRecord: adminService.buildFailedSendRecord,
    buildPolicyAcceptanceEmailCopy,
    buildAdminPolicyPayload: adminService.buildAdminPolicyPayload,
    buildPublicPolicyPayload,
    async handleRequest(req, res, requestStartNs, requestContext, quoteOpsLedger) {
      const pathname = normalizeString(requestContext.route, 500) || "/";
      if (pathname === POLICY_ACCEPTANCE_PAGE_PATH && req.method === "GET") {
        await publicService.handlePublicPage(req, res, requestStartNs, requestContext, quoteOpsLedger);
        return true;
      }
      if (pathname === POLICY_ACCEPTANCE_PAGE_PATH && req.method === "POST") {
        await publicService.handlePublicFormSubmit(req, res, requestStartNs, requestContext, quoteOpsLedger);
        return true;
      }
      if (pathname.startsWith(`${POLICY_ACCEPTANCE_API_BASE_PATH}/`)) {
        await publicService.handlePublicApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname);
        return true;
      }
      if (pathname.startsWith(`${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/`)) {
        await adminService.handleAdminApi(req, res, requestStartNs, requestContext, quoteOpsLedger, pathname);
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
