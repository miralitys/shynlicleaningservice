#!/usr/bin/env node
"use strict";

const http = require("http");
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

function normalizeRoute(rawPath) {
  let p = rawPath || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
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
    .replace(/data-tilda-export="yes"/g, 'data-export-source="tilda"');

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

async function sendFile(res, absolutePath, statusCode = 200) {
  if (!isSafePath(SITE_DIR, absolutePath)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const stats = await fsp.stat(absolutePath);
    if (!stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const baseHeaders = {
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=604800",
      "Content-Type": contentType,
    };

    if (ext === ".html") {
      const rawHtml = await fsp.readFile(absolutePath, "utf8");
      const cleanedHtml = sanitizeHtml(rawHtml);
      res.writeHead(statusCode, baseHeaders);
      res.end(cleanedHtml);
      return;
    }

    res.writeHead(statusCode, baseHeaders);
    fs.createReadStream(absolutePath).pipe(res);
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

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(reqUrl.pathname);
      const normalizedPath = normalizeRoute(pathname);

      const directAssetPath = path.join(SITE_DIR, pathname);
      if (
        pathname !== "/" &&
        path.extname(pathname) &&
        isSafePath(SITE_DIR, directAssetPath) &&
        fs.existsSync(directAssetPath)
      ) {
        await sendFile(res, directAssetPath);
        return;
      }

      const mappedFile = routes[normalizedPath];
      if (mappedFile) {
        await sendFile(res, path.join(SITE_DIR, mappedFile));
        return;
      }

      const notFoundPath = path.join(SITE_DIR, NOT_FOUND_PAGE);
      if (fs.existsSync(notFoundPath)) {
        await sendFile(res, notFoundPath, 404);
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
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
