"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");

let isOpaqueSupabaseApiKey = () => false;
try {
  ({ isOpaqueSupabaseApiKey } = require("./supabase-quote-ops"));
} catch {}

const DEFAULT_BUCKET_NAME = "order_completion_media";
const DEFAULT_LOCAL_DIR = path.join(process.cwd(), "data", "order-media");

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeUrl(value) {
  const raw = normalizeString(value, 500);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function sanitizeSegment(value, maxLength = 120, fallback = "asset") {
  const normalized = normalizeString(value, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function sanitizeFileName(value) {
  const normalized = normalizeString(value, 180);
  if (!normalized) return "image.jpg";
  const ext = path.extname(normalized).slice(0, 12).toLowerCase();
  const base = normalized.slice(0, ext ? -ext.length : normalized.length);
  const safeBase = sanitizeSegment(base, 140, "image");
  const safeExt = ext && /^[.][a-z0-9]+$/.test(ext) ? ext : "";
  return `${safeBase}${safeExt || ".jpg"}`;
}

function normalizeContentType(value, fileName) {
  const normalized = normalizeString(value, 160).toLowerCase();
  if (normalized.startsWith("image/")) return normalized;
  const ext = path.extname(normalizeString(fileName, 180)).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
}

function normalizeMediaKind(value) {
  return normalizeString(value, 40).toLowerCase() === "after" ? "after" : "before";
}

function buildObjectPath(entryId, kind, fileName) {
  return [
    "orders",
    sanitizeSegment(entryId, 120, "entry"),
    normalizeMediaKind(kind),
    `${crypto.randomUUID()}-${sanitizeFileName(fileName)}`,
  ].join("/");
}

function encodeObjectPath(objectPath) {
  return String(objectPath || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeAssetRecord(asset = {}, fallbackKind = "before") {
  const pathValue = normalizeString(asset.path, 500);
  return {
    id:
      sanitizeSegment(asset.id || path.basename(pathValue, path.extname(pathValue)), 160, "asset"),
    kind: normalizeMediaKind(asset.kind || fallbackKind),
    path: pathValue,
    fileName: sanitizeFileName(asset.fileName || path.basename(pathValue)),
    contentType: normalizeContentType(asset.contentType, asset.fileName || path.basename(pathValue)),
    sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
    uploadedAt: normalizeString(asset.uploadedAt, 80),
  };
}

function loadAdminOrderMediaStorageConfig(env = process.env) {
  const url = normalizeUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY, 4096);
  const bucketName = sanitizeSegment(
    env.SUPABASE_ORDER_MEDIA_BUCKET || DEFAULT_BUCKET_NAME,
    120,
    DEFAULT_BUCKET_NAME
  );
  const localDir = path.resolve(normalizeString(env.ADMIN_ORDER_MEDIA_STORAGE_DIR, 500) || DEFAULT_LOCAL_DIR);

  return {
    configured: Boolean(url && serviceRoleKey),
    url,
    serviceRoleKey,
    bucketName,
    localDir,
  };
}

function createAdminOrderMediaStorage(options = {}) {
  const config = options.config || loadAdminOrderMediaStorageConfig(options.env || process.env);
  const fetchImpl = options.fetch || global.fetch;
  let bucketReady = false;
  let bucketPromise = null;

  async function storageRequest(pathname, requestOptions = {}) {
    const url = new URL(`/storage/v1${pathname}`, `${config.url}/`);
    const normalizedKey = normalizeString(config.serviceRoleKey, 4096);
    const headers = {
      apikey: normalizedKey,
      ...(requestOptions.headers || {}),
    };

    if (!isOpaqueSupabaseApiKey(normalizedKey)) {
      headers.Authorization = `Bearer ${normalizedKey}`;
    }

    const response = await fetchImpl(url.toString(), {
      ...requestOptions,
      headers,
    });

    if (requestOptions.responseType === "buffer") {
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          normalizeString(errorText || `Supabase storage request failed with status ${response.status}`, 300)
        );
      }
      return response;
    }

    const text = await response.text();
    let body = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {}
    }

    if (!response.ok) {
      const message =
        body && typeof body === "object" && body.message
          ? body.message
          : text || `Supabase storage request failed with status ${response.status}`;
      throw new Error(normalizeString(message, 300));
    }

    return body;
  }

  async function ensureBucket() {
    if (!config.configured) return;
    if (bucketReady) return;
    if (bucketPromise) {
      await bucketPromise;
      return;
    }

    bucketPromise = (async () => {
      try {
        await storageRequest("/bucket/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: config.bucketName,
            name: config.bucketName,
            public: false,
          }),
        });
      } catch (error) {
        const message = normalizeString(error && error.message, 300).toLowerCase();
        if (!message.includes("exists") && !message.includes("duplicate") && !message.includes("already")) {
          throw error;
        }
      }
      bucketReady = true;
    })();

    try {
      await bucketPromise;
    } finally {
      bucketPromise = null;
    }
  }

  return {
    mode: config.configured ? "supabase" : "local",
    config,
    async uploadFiles(entryId, kind, files = []) {
      const normalizedEntryId = normalizeString(entryId, 120);
      const normalizedKind = normalizeMediaKind(kind);
      const validFiles = Array.isArray(files)
        ? files.filter(
            (file) =>
              file &&
              Buffer.isBuffer(file.buffer) &&
              file.buffer.length > 0
          )
        : [];
      if (!normalizedEntryId || validFiles.length === 0) return [];

      if (config.configured) {
        await ensureBucket();
      } else {
        await fsp.mkdir(config.localDir, { recursive: true });
      }

      const uploadedAssets = [];

      for (const file of validFiles.slice(0, 40)) {
        const fileName = sanitizeFileName(file.fileName);
        const contentType = normalizeContentType(file.contentType, fileName);
        const objectPath = buildObjectPath(normalizedEntryId, normalizedKind, fileName);

        if (config.configured) {
          await storageRequest(`/object/${encodeURIComponent(config.bucketName)}/${encodeObjectPath(objectPath)}`, {
            method: "POST",
            headers: {
              "Content-Type": contentType,
              "x-upsert": "true",
            },
            body: file.buffer,
          });
        } else {
          const targetPath = path.join(config.localDir, objectPath);
          await fsp.mkdir(path.dirname(targetPath), { recursive: true });
          await fsp.writeFile(targetPath, file.buffer);
        }

        uploadedAssets.push(
          normalizeAssetRecord({
            id: path.basename(objectPath, path.extname(objectPath)),
            kind: normalizedKind,
            path: objectPath,
            fileName,
            contentType,
            sizeBytes: file.buffer.length,
            uploadedAt: new Date().toISOString(),
          }, normalizedKind)
        );
      }

      return uploadedAssets;
    },
    async getAsset(asset = {}) {
      const normalizedAsset = normalizeAssetRecord(asset, asset.kind);
      if (!normalizedAsset.path) {
        throw new Error("Order media asset is missing a storage path.");
      }

      if (config.configured) {
        const response = await storageRequest(
          `/object/authenticated/${encodeURIComponent(config.bucketName)}/${encodeObjectPath(normalizedAsset.path)}`,
          {
            method: "GET",
            responseType: "buffer",
          }
        );
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
          buffer,
          contentType: normalizeString(response.headers.get("content-type"), 160) || normalizedAsset.contentType,
          sizeBytes: Number(response.headers.get("content-length")) || buffer.length,
          fileName: normalizedAsset.fileName,
        };
      }

      const targetPath = path.join(config.localDir, normalizedAsset.path);
      const buffer = await fsp.readFile(targetPath);
      return {
        buffer,
        contentType: normalizedAsset.contentType,
        sizeBytes: buffer.length,
        fileName: normalizedAsset.fileName,
      };
    },
    async deleteAssets(assets = []) {
      const normalizedAssets = Array.isArray(assets)
        ? assets
            .map((asset) => normalizeAssetRecord(asset, asset && asset.kind))
            .filter((asset) => asset.path)
        : [];
      if (normalizedAssets.length === 0) return;

      if (config.configured) {
        await ensureBucket();
        await Promise.allSettled(
          normalizedAssets.map((asset) =>
            storageRequest(`/object/${encodeURIComponent(config.bucketName)}/${encodeObjectPath(asset.path)}`, {
              method: "DELETE",
            })
          )
        );
        return;
      }

      await Promise.allSettled(
        normalizedAssets.map((asset) => fsp.rm(path.join(config.localDir, asset.path), { force: true }))
      );
    },
  };
}

module.exports = {
  createAdminOrderMediaStorage,
  loadAdminOrderMediaStorageConfig,
};
