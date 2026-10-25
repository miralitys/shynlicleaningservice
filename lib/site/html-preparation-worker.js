"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { gzipSync, gunzipSync } = require("node:zlib");
const { createSiteSanitizer } = require("./sanitize");
const { createSiteSeoHelpers } = require("./seo");

function normalizeRoute(rawPath) {
  let value = rawPath || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function escapeHtmlAttribute(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const siteSeoHelpers = createSiteSeoHelpers({ ...workerData.seoOptions, normalizeRoute, escapeHtmlAttribute });
const { sanitizeHtml } = createSiteSanitizer({ ...workerData.sanitizerOptions, normalizeRoute, siteSeoHelpers });
const cache = new Map();
let cacheBytes = 0;
let preparations = 0;
let hits = 0;

parentPort.on("message", ({ id, type, html, route, cacheable }) => {
  try {
    if (type === "inspect") {
      parentPort.postMessage({ id, result: { entries: cache.size, bytes: cacheBytes,
        maxBytes: workerData.maxCacheBytes, preparations, hits } });
      return;
    }
    if (type !== "prepare" || typeof html !== "string" || typeof route !== "string") throw new Error("Invalid job");
    const sourceHash = createHash("sha256").update(html).digest("hex");
    const cached = cacheable ? cache.get(route) : null;
    if (cached && cached.sourceHash === sourceHash) {
      cache.delete(route);
      cache.set(route, cached);
      hits++;
      parentPort.postMessage({ id, result: { html: gunzipSync(cached.body).toString("utf8"), cacheHit: true } });
      return;
    }

    const result = sanitizeHtml(html, route);
    preparations++;
    if (cacheable) {
      if (cached) { cacheBytes -= cached.bytes; cache.delete(route); }
      const body = gzipSync(result);
      const bytes = body.byteLength + Buffer.byteLength(route) + sourceHash.length + 128;
      if (bytes <= workerData.maxCacheBytes) {
        while (cache.size && cacheBytes + bytes > workerData.maxCacheBytes) {
          const key = cache.keys().next().value;
          cacheBytes -= cache.get(key).bytes;
          cache.delete(key);
        }
        cache.set(route, { sourceHash, body, bytes });
        cacheBytes += bytes;
      }
    }
    parentPort.postMessage({ id, result: { html: result, cacheHit: false } });
  } catch {
    parentPort.postMessage({ id, error: true });
  }
});
