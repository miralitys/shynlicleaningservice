"use strict";

const crypto = require("crypto");

function createSiteStaticHelpers(deps = {}) {
  const {
    CONTENT_TYPES,
    HTML_CACHE_WARM_MODE,
    IMAGE_EXTENSIONS,
    NEGOTIATED_IMAGE_VARY,
    NOINDEX_ROUTES,
    NOT_FOUND_PAGE,
    SITE_DIR,
    fs,
    fsp,
    path,
    sanitizeHtml,
    writeHeadWithTiming,
  } = deps;

  function resolveSitePath(relativeOrAbsolutePath) {
    const trimmed = String(relativeOrAbsolutePath || "").replace(/^\/+/, "");
    return path.resolve(SITE_DIR, trimmed);
  }

  function toWeakEtagFromStat(size, mtimeMs) {
    return `W/"${size.toString(16)}-${Math.trunc(mtimeMs).toString(16)}"`;
  }

  function toWeakEtagFromString(content) {
    const sizeHex = Buffer.byteLength(content, "utf8").toString(16);
    const hash = crypto.createHash("sha1").update(content).digest("hex").slice(0, 16);
    return `W/"${sizeHex}-${hash}"`;
  }

  function normalizeEtagToken(token) {
    return token.trim().replace(/^W\//, "");
  }

  function hasMatchingEtag(ifNoneMatchValue, currentEtag) {
    if (!ifNoneMatchValue || !currentEtag) return false;
    if (ifNoneMatchValue.trim() === "*") return true;
    const current = normalizeEtagToken(currentEtag);
    return ifNoneMatchValue
      .split(",")
      .map((token) => normalizeEtagToken(token))
      .some((token) => token === current);
  }

  function isNotModified(reqHeaders, etag, mtimeMs) {
    const ifNoneMatch = reqHeaders["if-none-match"];
    if (ifNoneMatch) {
      return hasMatchingEtag(ifNoneMatch, etag);
    }

    const ifModifiedSince = reqHeaders["if-modified-since"];
    if (!ifModifiedSince) return false;
    const since = Date.parse(ifModifiedSince);
    if (!Number.isFinite(since)) return false;
    return Math.trunc(mtimeMs / 1000) <= Math.trunc(since / 1000);
  }

  function buildHtmlCacheEntry(sanitizedHtml, fileMeta) {
    const mtimeMs = fileMeta?.mtimeMs ?? Date.now();
    return {
      body: sanitizedHtml,
      etag: toWeakEtagFromString(sanitizedHtml),
      lastModified: fileMeta?.lastModified ?? new Date(mtimeMs).toUTCString(),
      mtimeMs,
    };
  }

  function getHtmlCacheKey(absolutePath, routePath = "") {
    return `${absolutePath}::${routePath || "__file__"}`;
  }

  function isFingerprintLikeAsset(absolutePath) {
    const name = path.basename(absolutePath);
    return /(?:^|[._-])[a-f0-9]{8,}(?:[._-]|$)/i.test(name);
  }

  function getCachePolicy(absolutePath, ext) {
    if (ext === ".html") {
      return {
        browser: "public, max-age=60, stale-while-revalidate=300",
        edge: "public, s-maxage=600, stale-while-revalidate=300, stale-if-error=86400",
      };
    }

    let browserPolicy = "public, max-age=31536000";
    let edgePolicy = "public, s-maxage=31536000, stale-while-revalidate=86400, stale-if-error=604800";
    if (isFingerprintLikeAsset(absolutePath)) {
      browserPolicy += ", immutable";
      edgePolicy += ", immutable";
    }

    return {
      browser: browserPolicy,
      edge: edgePolicy,
    };
  }

  function parseClientHintNumber(rawValue) {
    if (!rawValue) return null;
    const normalized = String(rawValue).replace(/"/g, "").trim();
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function getTargetImageWidth(headers) {
    const widthHint =
      parseClientHintNumber(headers["sec-ch-width"]) ||
      parseClientHintNumber(headers["viewport-width"]);
    if (!widthHint) return null;

    const dpr = parseClientHintNumber(headers.dpr) || parseClientHintNumber(headers["sec-ch-dpr"]) || 1;
    return Math.max(1, Math.round(widthHint * dpr));
  }

  function getPreferredImageCodecs(acceptHeader) {
    const accept = String(acceptHeader || "").toLowerCase();
    const codecs = [];
    if (accept.includes("image/avif")) codecs.push("avif");
    if (accept.includes("image/webp")) codecs.push("webp");
    return codecs;
  }

  function findExistingOriginalImagePath(existingFiles, stemPath) {
    for (const ext of [".png", ".jpg", ".jpeg", ".PNG", ".JPG", ".JPEG"]) {
      const candidate = `${stemPath}${ext}`;
      if (existingFiles.has(candidate)) return candidate;
    }
    return null;
  }

  function buildImageVariantIndex(existingFiles) {
    const imageVariantsByOriginal = new Map();

    for (const absolutePath of existingFiles) {
      const codecExt = path.extname(absolutePath).toLowerCase();
      if (codecExt !== ".avif" && codecExt !== ".webp") continue;

      const withoutCodec = absolutePath.slice(0, -codecExt.length);
      let stem = withoutCodec;
      let width = null;
      const widthMatch = /\.w(\d+)$/.exec(withoutCodec);
      if (widthMatch) {
        width = Number.parseInt(widthMatch[1], 10);
        stem = withoutCodec.slice(0, widthMatch.index);
      }

      const originalPath = findExistingOriginalImagePath(existingFiles, stem);
      if (!originalPath) continue;

      let variants = imageVariantsByOriginal.get(originalPath);
      if (!variants) {
        variants = {
          avif: { full: null, widths: [] },
          webp: { full: null, widths: [] },
        };
        imageVariantsByOriginal.set(originalPath, variants);
      }

      const codec = codecExt.slice(1);
      if (width) {
        variants[codec].widths.push({ width, path: absolutePath });
      } else {
        variants[codec].full = absolutePath;
      }
    }

    for (const variants of imageVariantsByOriginal.values()) {
      variants.avif.widths.sort((a, b) => a.width - b.width);
      variants.webp.widths.sort((a, b) => a.width - b.width);
    }

    return imageVariantsByOriginal;
  }

  function selectWidthVariant(widthVariants, targetWidth) {
    if (!widthVariants.length) return null;
    for (const variant of widthVariants) {
      if (variant.width >= targetWidth) return variant.path;
    }
    return widthVariants[widthVariants.length - 1].path;
  }

  function selectNegotiatedImagePath(req, originalPath, runtimeIndex) {
    const ext = path.extname(originalPath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return null;

    const variants = runtimeIndex.imageVariantsByOriginal.get(originalPath);
    if (!variants) return null;

    const preferredCodecs = getPreferredImageCodecs(req.headers.accept);
    if (!preferredCodecs.length) return null;

    const targetWidth = getTargetImageWidth(req.headers);
    for (const codec of preferredCodecs) {
      const variantSet = variants[codec];
      if (!variantSet) continue;

      if (targetWidth) {
        const widthMatch = selectWidthVariant(variantSet.widths, targetWidth);
        if (widthMatch) return widthMatch;
      }

      if (variantSet.full) return variantSet.full;
      if (variantSet.widths.length > 0) {
        return variantSet.widths[variantSet.widths.length - 1].path;
      }
    }

    return null;
  }

  function isSafePath(baseDir, filePath) {
    const resolvedBase = path.resolve(baseDir) + path.sep;
    const resolvedPath = path.resolve(filePath);
    return resolvedPath === path.resolve(baseDir) || resolvedPath.startsWith(resolvedBase);
  }

  async function buildRuntimeIndex(routes) {
    const existingFiles = new Set();
    const fileMetaByPath = new Map();

    async function walk(dir) {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(absolutePath);
        } else if (entry.isFile()) {
          const resolvedPath = path.resolve(absolutePath);
          const stats = await fsp.stat(resolvedPath);
          existingFiles.add(resolvedPath);
          fileMetaByPath.set(resolvedPath, {
            size: stats.size,
            mtimeMs: stats.mtimeMs,
            lastModified: stats.mtime.toUTCString(),
            etag: toWeakEtagFromStat(stats.size, stats.mtimeMs),
          });
        }
      }
    }

    await walk(SITE_DIR);

    const routeFileByPath = new Map();
    const primaryRouteByFilePath = new Map();
    for (const [routePath, routeFile] of Object.entries(routes)) {
      const absolutePath = resolveSitePath(routeFile);
      if (existingFiles.has(absolutePath)) {
        routeFileByPath.set(routePath, absolutePath);
        if (!primaryRouteByFilePath.has(absolutePath)) {
          primaryRouteByFilePath.set(absolutePath, routePath);
        }
      }
    }

    const notFoundAbsolutePath = resolveSitePath(NOT_FOUND_PAGE);
    return {
      existingFiles,
      fileMetaByPath,
      imageVariantsByOriginal: buildImageVariantIndex(existingFiles),
      notFoundAbsolutePath,
      notFoundExists: existingFiles.has(notFoundAbsolutePath),
      routeFileByPath,
      primaryRouteByFilePath,
    };
  }

  async function warmHtmlCache(runtimeIndex) {
    const htmlCache = new Map();
    const filesToWarm = new Set();

    if (HTML_CACHE_WARM_MODE === "all") {
      for (const absolutePath of runtimeIndex.routeFileByPath.values()) {
        filesToWarm.add(absolutePath);
      }
    } else if (HTML_CACHE_WARM_MODE === "minimal") {
      const homeAbsolutePath = runtimeIndex.routeFileByPath.get("/");
      if (homeAbsolutePath) {
        filesToWarm.add(homeAbsolutePath);
      }
    }

    if (HTML_CACHE_WARM_MODE !== "off") {
      filesToWarm.add(runtimeIndex.notFoundAbsolutePath);
    }

    let warmedCount = 0;
    for (const absolutePath of filesToWarm) {
      if (!isSafePath(SITE_DIR, absolutePath)) continue;
      if (!runtimeIndex.existingFiles.has(absolutePath)) continue;

      try {
        const rawHtml = await fsp.readFile(absolutePath, "utf8");
        const routePath = runtimeIndex.primaryRouteByFilePath.get(absolutePath) || "/";
        const sanitizedHtml = sanitizeHtml(rawHtml, routePath);
        htmlCache.set(
          getHtmlCacheKey(absolutePath, routePath),
          buildHtmlCacheEntry(sanitizedHtml, runtimeIndex.fileMetaByPath.get(absolutePath))
        );
        warmedCount += 1;
      } catch {}
    }

    return { htmlCache, warmedCount };
  }

  async function getHtmlFromCache(absolutePath, routePath, htmlCache, fileMeta) {
    const cacheKey = getHtmlCacheKey(absolutePath, routePath);
    if (htmlCache.has(cacheKey)) {
      return {
        entry: htmlCache.get(cacheKey),
        cacheHit: true,
      };
    }

    const rawHtml = await fsp.readFile(absolutePath, "utf8");
    const htmlEntry = buildHtmlCacheEntry(sanitizeHtml(rawHtml, routePath), fileMeta);
    htmlCache.set(cacheKey, htmlEntry);
    return {
      entry: htmlEntry,
      cacheHit: false,
    };
  }

  function buildHtmlLinkHeader(absolutePath, htmlBody) {
    const body = String(htmlBody || "");
    const linkEntries = [];
    const seen = new Set();
    const isQuotePage = path.basename(absolutePath) === "quote2.html";
    const isTildaPage =
      /data-tilda-project-id=/i.test(body) ||
      /neo\.tildacdn\.com\/js\/tilda-fallback-1\.0\.min\.js/i.test(body);

    function pushLink(entry) {
      const normalizedEntry = String(entry || "").trim();
      if (!normalizedEntry || seen.has(normalizedEntry)) return;
      seen.add(normalizedEntry);
      linkEntries.push(normalizedEntry);
    }

    function pushPreload(href, asType) {
      const normalizedHref = String(href || "").trim().replace(/^\/+/, "");
      if (!normalizedHref) return;
      pushLink(`</${normalizedHref}>; rel=preload; as=${asType}`);
    }

    function pushPreconnect(url, { crossOrigin = false } = {}) {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) return;
      pushLink(
        `<${normalizedUrl}>; rel=preconnect${crossOrigin ? "; crossorigin" : ""}`
      );
    }

    function pushFirstMatch(regex, asType) {
      const match = body.match(regex);
      if (match && match[1]) {
        pushPreload(match[1], asType);
      }
    }

    if (isQuotePage) {
      pushFirstMatch(
        /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']*css\/quote2\.css[^"']*)["']/i,
        "style"
      );
      pushFirstMatch(
        /<script[^>]+src=["']([^"']*js\/quote2-app\.js[^"']*)["'][^>]*><\/script>/i,
        "script"
      );
    }

    if (isTildaPage) {
      if (/fonts\.googleapis\.com\/css2/i.test(body)) {
        pushPreconnect("https://fonts.googleapis.com");
      }
      if (/fonts\.gstatic\.com/i.test(body)) {
        pushPreconnect("https://fonts.gstatic.com", { crossOrigin: true });
      }
      if (/neo\.tildacdn\.com\/js\/tilda-fallback-1\.0\.min\.js/i.test(body)) {
        pushPreconnect("https://neo.tildacdn.com");
      }

      pushFirstMatch(
        /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']*css\/tilda-grid-3\.0\.min\.css[^"']*)["']/i,
        "style"
      );
      pushFirstMatch(
        /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']*css\/tilda-blocks-page[^"']*\.css[^"']*)["']/i,
        "style"
      );
    }

    return linkEntries.join(", ");
  }

  async function sendFile(
    req,
    res,
    absolutePath,
    htmlCache,
    runtimeIndex,
    requestContext,
    requestStartNs,
    statusCode = 200
  ) {
    if (!isSafePath(SITE_DIR, absolutePath)) {
      requestContext.cacheHit = false;
      writeHeadWithTiming(
        res,
        403,
        { "Content-Type": "text/plain; charset=utf-8" },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end("Forbidden");
      return;
    }

    let filePathToServe = absolutePath;
    if (statusCode === 200) {
      const negotiatedPath = selectNegotiatedImagePath(req, absolutePath, runtimeIndex);
      if (negotiatedPath) {
        filePathToServe = negotiatedPath;
      }
    }

    const fileMeta = runtimeIndex.fileMetaByPath.get(filePathToServe);
    if (!fileMeta) {
      requestContext.cacheHit = false;
      writeHeadWithTiming(
        res,
        404,
        { "Content-Type": "text/plain; charset=utf-8" },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end("Not found");
      return;
    }

    try {
      const ext = path.extname(filePathToServe).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
      const cachePolicy = getCachePolicy(filePathToServe, ext);
      const baseHeaders = {
        "Cache-Control": cachePolicy.browser,
        "CDN-Cache-Control": cachePolicy.edge,
        "Cloudflare-CDN-Cache-Control": cachePolicy.edge,
        "Content-Type": contentType,
      };

      if (filePathToServe !== absolutePath) {
        baseHeaders.Vary = NEGOTIATED_IMAGE_VARY;
      }

      if (ext === ".html") {
        const htmlResult = await getHtmlFromCache(
          absolutePath,
          requestContext.route,
          htmlCache,
          fileMeta
        );
        const htmlEntry = htmlResult.entry;
        requestContext.cacheHit = htmlResult.cacheHit;
        const headers = {
          ...baseHeaders,
          "Accept-CH": "Width, Viewport-Width, DPR",
          ETag: htmlEntry.etag,
          "Last-Modified": htmlEntry.lastModified,
        };
        const linkHeader = buildHtmlLinkHeader(absolutePath, htmlEntry.body);
        if (linkHeader) {
          headers.Link = linkHeader;
        }
        if (NOINDEX_ROUTES.has(requestContext.route) || statusCode === 404) {
          headers["X-Robots-Tag"] = "noindex, nofollow";
        }

        if (statusCode === 200 && isNotModified(req.headers, htmlEntry.etag, htmlEntry.mtimeMs)) {
          requestContext.cacheHit = true;
          writeHeadWithTiming(res, 304, headers, requestStartNs, requestContext.cacheHit);
          res.end();
          return;
        }

        writeHeadWithTiming(res, statusCode, headers, requestStartNs, requestContext.cacheHit);
        res.end(htmlEntry.body);
        return;
      }

      const headers = {
        ...baseHeaders,
        ETag: fileMeta.etag,
        "Last-Modified": fileMeta.lastModified,
      };

      if (statusCode === 200 && isNotModified(req.headers, fileMeta.etag, fileMeta.mtimeMs)) {
        requestContext.cacheHit = true;
        writeHeadWithTiming(res, 304, headers, requestStartNs, requestContext.cacheHit);
        res.end();
        return;
      }

      requestContext.cacheHit = false;
      writeHeadWithTiming(res, statusCode, headers, requestStartNs, requestContext.cacheHit);
      fs.createReadStream(filePathToServe).pipe(res);
    } catch {
      requestContext.cacheHit = false;
      writeHeadWithTiming(
        res,
        404,
        { "Content-Type": "text/plain; charset=utf-8" },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end("Not found");
    }
  }

  return {
    buildRuntimeIndex,
    isSafePath,
    resolveSitePath,
    sendFile,
    warmHtmlCache,
  };
}

module.exports = {
  createSiteStaticHelpers,
};
