"use strict";

function createAdminResponseHelpers(deps = {}) {
  const {
    adminSharedRenderers,
    escapeHtml,
    normalizeString,
    redirectUnauthorizedAdminAccess,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  } = deps;

  function writeForbiddenResponse(res, requestStartNs, requestContext, message) {
    writeHtmlWithTiming(
      res,
      403,
      adminSharedRenderers.renderAdminLayout(
        "Недостаточно прав",
        `<div class="admin-alert admin-alert-error">${escapeHtml(
          message || "У вас нет прав для этого действия."
        )}</div>`
      ),
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function isAjaxMutationRequest(req) {
    const acceptHeader = normalizeString(req && req.headers ? req.headers.accept : "", 400).toLowerCase();
    const ajaxHeader = normalizeString(
      req && req.headers ? req.headers["x-shynli-admin-ajax"] : "",
      20
    ).toLowerCase();
    return ajaxHeader === "1" || acceptHeader.includes("application/json");
  }

  function writeAjaxMutationSuccess(res, requestStartNs, requestContext, notice, extra = {}) {
    writeJsonWithTiming(
      res,
      200,
      {
        ok: true,
        notice,
        ...extra,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function writeAjaxMutationError(
    res,
    requestStartNs,
    requestContext,
    notice,
    statusCode = 400,
    extra = {}
  ) {
    writeJsonWithTiming(
      res,
      statusCode,
      {
        ok: false,
        notice,
        error: notice,
        ...extra,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  function ensureWorkspaceAccess(
    req,
    res,
    requestStartNs,
    requestContext,
    currentUserAccess,
    challenge,
    options = {}
  ) {
    if (!currentUserAccess || !currentUserAccess.authorized) {
      redirectUnauthorizedAdminAccess(
        req,
        res,
        requestStartNs,
        requestContext,
        currentUserAccess,
        challenge
      );
      return false;
    }

    if (options.requireWrite && currentUserAccess.canEdit === false) {
      writeForbiddenResponse(
        res,
        requestStartNs,
        requestContext,
        options.forbiddenMessage || "Эта роль может только просматривать данные."
      );
      return false;
    }

    if (options.requireDelete && currentUserAccess.canDelete === false) {
      writeForbiddenResponse(
        res,
        requestStartNs,
        requestContext,
        options.forbiddenMessage || "Удаление доступно только администратору."
      );
      return false;
    }

    return true;
  }

  return {
    ensureWorkspaceAccess,
    isAjaxMutationRequest,
    writeAjaxMutationError,
    writeAjaxMutationSuccess,
    writeForbiddenResponse,
  };
}

module.exports = {
  createAdminResponseHelpers,
};
