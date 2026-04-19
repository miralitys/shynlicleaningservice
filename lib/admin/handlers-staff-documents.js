"use strict";

const fsp = require("node:fs/promises");
const {
  loadStaffContractConfig,
  resolveStaffContractDocumentAbsolutePath,
} = require("../staff-contractor-agreement");
const {
  loadStaffW9Config,
  resolveStaffW9DocumentAbsolutePath,
} = require("../staff-w9");

function createAdminStaffDocumentHandlers(deps = {}) {
  const {
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    adminSharedRenderers,
    ensureWorkspaceAccess,
    normalizeString,
    writeHeadWithTiming,
    writeHtmlWithTiming,
  } = deps;

  async function handleStaffDocumentRoutes(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      staffStore,
    } = context;

    if (
      requestContext.route !== ADMIN_STAFF_W9_DOWNLOAD_PATH &&
      requestContext.route !== ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH
    ) {
      return false;
    }

    if (
      !ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge)
    ) {
      return true;
    }

    if (req.method !== "GET") {
      writeHtmlWithTiming(
        res,
        405,
        adminSharedRenderers.renderAdminLayout(
          "Метод не поддерживается",
          `<div class="admin-alert admin-alert-error">Документы сотрудника доступны только через GET.</div>`
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    const isContractDownload = requestContext.route === ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH;
    const reqUrl = new URL(
      req.url || (isContractDownload ? ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH : ADMIN_STAFF_W9_DOWNLOAD_PATH),
      "http://localhost"
    );
    const staffId = normalizeString(reqUrl.searchParams.get("staffId"), 120);
    const snapshot = staffStore ? await staffStore.getSnapshot() : { staff: [] };
    const staffRecord = Array.isArray(snapshot.staff)
      ? snapshot.staff.find((record) => record.id === staffId) || null
      : null;
    const requestedDocument = isContractDownload
      ? staffRecord && staffRecord.contract && staffRecord.contract.document
        ? staffRecord.contract.document
        : null
      : staffRecord && staffRecord.w9 && staffRecord.w9.document
        ? staffRecord.w9.document
        : null;

    if (!staffRecord || !requestedDocument || !requestedDocument.relativePath) {
      writeHtmlWithTiming(
        res,
        404,
        adminSharedRenderers.renderAdminLayout(
          isContractDownload ? "Contract не найден" : "W-9 не найден",
          `<div class="admin-alert admin-alert-error">Для этого сотрудника ещё нет прикреплённого ${isContractDownload ? "Contract" : "W-9"}.</div>`
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }

    try {
      const config = isContractDownload
        ? loadStaffContractConfig(process.env)
        : loadStaffW9Config(process.env);
      const absolutePath = isContractDownload
        ? resolveStaffContractDocumentAbsolutePath(requestedDocument.relativePath, config)
        : resolveStaffW9DocumentAbsolutePath(requestedDocument.relativePath, config);
      const body = await fsp.readFile(absolutePath);
      writeHeadWithTiming(
        res,
        200,
        {
          "Content-Type": requestedDocument.contentType || "application/pdf",
          "Content-Length": String(body.length),
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${requestedDocument.fileName || (isContractDownload ? "staff-contract.pdf" : "staff-w9.pdf")}"`,
          "Content-Security-Policy":
            "base-uri 'self'; frame-ancestors 'self'; object-src 'none'; form-action 'self' https://checkout.stripe.com https://api.stripe.com;",
          "X-Frame-Options": "SAMEORIGIN",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end(body);
      return true;
    } catch {
      writeHtmlWithTiming(
        res,
        404,
        adminSharedRenderers.renderAdminLayout(
          isContractDownload ? "Contract не найден" : "W-9 не найден",
          `<div class="admin-alert admin-alert-error">Файл ${isContractDownload ? "Contract" : "W-9"} не найден на сервере. Сотруднику нужно пересоздать документы.</div>`
        ),
        requestStartNs,
        requestContext.cacheHit
      );
      return true;
    }
  }

  return {
    handleStaffDocumentRoutes,
  };
}

module.exports = {
  createAdminStaffDocumentHandlers,
};
