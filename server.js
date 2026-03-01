#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const SITE_DIR = __dirname;
const ROUTES_PATH = path.join(SITE_DIR, "routes.json");
const NOT_FOUND_PAGE = "page113047926.html";

const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const NEGOTIATED_IMAGE_VARY = "Accept, Sec-CH-Width, Viewport-Width, DPR";

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

function normalizeRoute(rawPath) {
  let p = rawPath || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
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

  const dpr = parseClientHintNumber(headers["dpr"]) || parseClientHintNumber(headers["sec-ch-dpr"]) || 1;
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

function sanitizeHtml(html) {
  let cleaned = html
    .replace(
      /<script src="https:\/\/neo\.tildacdn\.com\/js\/tilda-fallback-1\.0\.min\.js"[^>]*><\/script>/g,
      ""
    )
    .replace(/<!-- Tilda copyright\. Don't remove this line -->[\s\S]*?(?=<!-- Stat -->)/g, "")
    .replace(/data-tilda-export="yes"/g, 'data-export-source="tilda"')
    .replace(/<!--\s*Form export deps:[\s\S]*?-->/g, "")
    .replace(/<script[^>]+src="js\/tilda-animation-sbs-1\.0\.min\.js"[^>]*><\/script>/g, "");

  const hasForms = /data-elem-type='form'|class="t-form"|tn-atom__form/.test(cleaned);
  if (!hasForms) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-forms-1\.0\.min\.css"[^>]*>/g, "")
      .replace(/<script[^>]+src="js\/tilda-forms-1\.0\.min\.js"[^>]*><\/script>/g, "")
      .replace(/<script[^>]+src="js\/tilda-zero-forms-1\.0\.min\.js"[^>]*><\/script>/g, "");
  }

  // Ensure footer logo always leads to homepage.
  cleaned = cleaned.replace(
    /(<div class='t396__elem[^>]*data-elem-id='1475160083840'[^>]*>[\s\S]*?<a class='tn-atom') href="https:\/\/www\.google\.com"/g,
    '$1 href="/"'
  );

  // Remove footer social icon elements (Nextdoor, Thumbtack, Yelp, Facebook, Instagram).
  const footerSocialElemIds = [
    "1475160165682", // Nextdoor / home icon
    "1475160189796", // Thumbtack
    "1475160204612", // Yelp
    "1475160356604", // Facebook
    "1475160346203", // Instagram
  ];
  for (const elemId of footerSocialElemIds) {
    const blockPattern = new RegExp(
      `<div class='t396__elem[^>]*data-elem-id='${elemId}'[^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>`,
      "g"
    );
    cleaned = cleaned.replace(blockPattern, "");
  }

  // Fix relative asset paths on nested routes like /services/*.
  if (!/<base\s+href=/i.test(cleaned)) {
    cleaned = cleaned.replace(/<head>/i, '<head><base href="/" />');
  }

  return cleaned;
}

async function buildRuntimeIndex(routes) {
  const existingFiles = new Set();
  const fileMetaByPath = new Map();

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Runtime file index is for served content only.
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
  for (const [routePath, routeFile] of Object.entries(routes)) {
    const absolutePath = resolveSitePath(routeFile);
    if (existingFiles.has(absolutePath)) {
      routeFileByPath.set(routePath, absolutePath);
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
  };
}

async function warmHtmlCache(runtimeIndex) {
  const htmlCache = new Map();
  const filesToWarm = new Set([
    ...runtimeIndex.routeFileByPath.values(),
    runtimeIndex.notFoundAbsolutePath,
  ]);

  let warmedCount = 0;
  for (const absolutePath of filesToWarm) {
    if (!isSafePath(SITE_DIR, absolutePath)) continue;
    if (!runtimeIndex.existingFiles.has(absolutePath)) continue;

    try {
      const rawHtml = await fsp.readFile(absolutePath, "utf8");
      const sanitizedHtml = sanitizeHtml(rawHtml);
      htmlCache.set(
        absolutePath,
        buildHtmlCacheEntry(sanitizedHtml, runtimeIndex.fileMetaByPath.get(absolutePath))
      );
      warmedCount += 1;
    } catch {
      // Missing optional pages are ignored; route handling already has fallbacks.
    }
  }

  return { htmlCache, warmedCount };
}

async function getHtmlFromCache(absolutePath, htmlCache, fileMeta) {
  if (htmlCache.has(absolutePath)) {
    return htmlCache.get(absolutePath);
  }

  const rawHtml = await fsp.readFile(absolutePath, "utf8");
  const htmlEntry = buildHtmlCacheEntry(sanitizeHtml(rawHtml), fileMeta);
  htmlCache.set(absolutePath, htmlEntry);
  return htmlEntry;
}

async function sendFile(req, res, absolutePath, htmlCache, runtimeIndex, statusCode = 200) {
  if (!isSafePath(SITE_DIR, absolutePath)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
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
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
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
      const htmlEntry = await getHtmlFromCache(absolutePath, htmlCache, fileMeta);
      const headers = {
        ...baseHeaders,
        "Accept-CH": "Width, Viewport-Width, DPR",
        ETag: htmlEntry.etag,
        "Last-Modified": htmlEntry.lastModified,
      };

      if (statusCode === 200 && isNotModified(req.headers, htmlEntry.etag, htmlEntry.mtimeMs)) {
        res.writeHead(304, headers);
        res.end();
        return;
      }

      res.writeHead(statusCode, headers);
      res.end(htmlEntry.body);
      return;
    }

    const headers = {
      ...baseHeaders,
      ETag: fileMeta.etag,
      "Last-Modified": fileMeta.lastModified,
    };

    if (statusCode === 200 && isNotModified(req.headers, fileMeta.etag, fileMeta.mtimeMs)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    res.writeHead(statusCode, headers);
    fs.createReadStream(filePathToServe).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function loadRoutes() {
  const raw = await fsp.readFile(ROUTES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = {};
  for (const [route, file] of Object.entries(parsed)) {
    normalized[normalizeRoute(route)] = file;
  }
  return normalized;
}

async function main() {
  const routes = await loadRoutes();
  const runtimeIndex = await buildRuntimeIndex(routes);
  const { htmlCache, warmedCount } = await warmHtmlCache(runtimeIndex);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(reqUrl.pathname);
      const normalizedPath = normalizeRoute(pathname);

      const directAssetPath = resolveSitePath(pathname);
      if (
        pathname !== "/" &&
        path.extname(pathname) &&
        isSafePath(SITE_DIR, directAssetPath) &&
        runtimeIndex.existingFiles.has(directAssetPath)
      ) {
        await sendFile(req, res, directAssetPath, htmlCache, runtimeIndex);
        return;
      }

      const mappedFilePath = runtimeIndex.routeFileByPath.get(normalizedPath);
      if (mappedFilePath) {
        await sendFile(req, res, mappedFilePath, htmlCache, runtimeIndex);
        return;
      }

      if (runtimeIndex.notFoundExists) {
        await sendFile(req, res, runtimeIndex.notFoundAbsolutePath, htmlCache, runtimeIndex, 404);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Page not found");
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Server started on http://${HOST}:${PORT}`);
    console.log(`Loaded routes: ${Object.keys(routes).length}`);
    console.log(`Indexed files: ${runtimeIndex.existingFiles.size}`);
    console.log(`Indexed image variant sets: ${runtimeIndex.imageVariantsByOriginal.size}`);
    console.log(`Warmed HTML cache entries: ${warmedCount}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
