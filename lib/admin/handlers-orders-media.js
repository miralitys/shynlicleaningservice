"use strict";

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
      const asset =
        completionData
          ? [...completionData.beforePhotos, ...completionData.afterPhotos].find(
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
