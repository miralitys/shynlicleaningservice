"use strict";

const path = require("node:path");

function createAdminOrdersMediaHandlers(deps = {}) {
  const {
    ensureWorkspaceAccess,
    getEntryOrderCompletionData,
    getRequestUrl,
    normalizeString,
    writeHeadWithTiming,
  } = deps;

  function writePlainNotFound(res, requestStartNs, requestContext) {
    writeHeadWithTiming(
      res,
      404,
      {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end("Not found");
  }

  function normalizeMediaAsset(asset = {}, fallbackKind = "before") {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) return null;
    const pathValue = normalizeString(asset.path, 500);
    if (!pathValue) return null;
    const kind = normalizeString(asset.kind, 40).toLowerCase();
    return {
      id:
        normalizeString(asset.id || path.basename(pathValue, path.extname(pathValue)), 180) ||
        path.basename(pathValue),
      kind: kind === "client" ? "client" : kind === "after" ? "after" : fallbackKind,
      path: pathValue,
      fileName:
        normalizeString(asset.fileName || path.basename(pathValue), 180) ||
        path.basename(pathValue) ||
        "photo.jpg",
      contentType: normalizeString(asset.contentType, 160) || "image/jpeg",
      sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
      uploadedAt: normalizeString(asset.uploadedAt, 80),
    };
  }

  function getEntryAdminClientPhotoAssets(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const adminClient =
      payload.adminClient && typeof payload.adminClient === "object" ? payload.adminClient : {};
    const items = Array.isArray(adminClient.photos) ? adminClient.photos : [];
    return items.map((asset) => normalizeMediaAsset(asset, "client")).filter(Boolean);
  }

  async function handleOrdersMediaGetRoute(context = {}) {
    const {
      req,
      res,
      requestStartNs,
      requestContext,
      currentUserAccess,
      challenge,
      quoteOpsLedger,
      orderMediaStorage,
    } = context;

    const reqUrl = getRequestUrl(req);
    if (reqUrl.searchParams.get("media") !== "1") {
      return false;
    }

    if (!ensureWorkspaceAccess(req, res, requestStartNs, requestContext, currentUserAccess, challenge)) {
      return true;
    }

    const entryId = normalizeString(reqUrl.searchParams.get("entryId"), 120);
    const assetId = normalizeString(reqUrl.searchParams.get("asset"), 180);
    if (!quoteOpsLedger || !orderMediaStorage || !entryId || !assetId) {
      writePlainNotFound(res, requestStartNs, requestContext);
      return true;
    }

    try {
      const entry = await quoteOpsLedger.getEntry(entryId);
      const completionData = entry ? getEntryOrderCompletionData(entry) : null;
      const clientPhotos = entry ? getEntryAdminClientPhotoAssets(entry) : [];
      const asset =
        completionData
          ? [...completionData.beforePhotos, ...completionData.afterPhotos, ...clientPhotos].find(
              (item) => normalizeString(item.id, 180) === assetId
            ) || null
          : null;
      if (!asset) {
        writePlainNotFound(res, requestStartNs, requestContext);
        return true;
      }

      const media = await orderMediaStorage.getAsset(asset);
      writeHeadWithTiming(
        res,
        200,
        {
          "Content-Type": media.contentType || asset.contentType || "application/octet-stream",
          "Content-Length": String(media.sizeBytes || media.buffer.length),
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${media.fileName || asset.fileName || "order-photo.jpg"}"`,
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end(media.buffer);
      return true;
    } catch {
      writePlainNotFound(res, requestStartNs, requestContext);
      return true;
    }
  }

  return {
    handleOrdersMediaGetRoute,
  };
}

module.exports = {
  createAdminOrdersMediaHandlers,
};
