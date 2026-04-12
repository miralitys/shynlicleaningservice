"use strict";

function createRequestHelpers(deps = {}) {
  const {
    MAX_JSON_BODY_BYTES,
    TRUST_PROXY_HEADERS,
    TRUSTED_PROXY_IPS,
    normalizeString,
  } = deps;

  function parseCookies(cookieHeader) {
    const cookies = {};
    for (const pair of String(cookieHeader || "").split(";")) {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!key) continue;
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
    return cookies;
  }

  function serializeCookie(name, value, options = {}) {
    const segments = [`${name}=${encodeURIComponent(String(value || ""))}`];
    segments.push(`Path=${options.path || "/"}`);
    if (Number.isFinite(options.maxAge)) {
      segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
    }
    if (options.httpOnly !== false) segments.push("HttpOnly");
    if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
    if (options.secure) segments.push("Secure");
    return segments.join("; ");
  }

  function clearCookie(name, options = {}) {
    return serializeCookie(name, "", {
      ...options,
      maxAge: 0,
    });
  }

  function normalizeClientIp(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "::1") return "127.0.0.1";
    if (normalized.startsWith("::ffff:")) return normalized.slice(7);
    return normalized;
  }

  function shouldTrustProxyHeaders(req) {
    if (!TRUST_PROXY_HEADERS || TRUSTED_PROXY_IPS.size === 0) return false;
    const remoteAddress = normalizeClientIp(req.socket && req.socket.remoteAddress);
    return Boolean(remoteAddress) && TRUSTED_PROXY_IPS.has(remoteAddress);
  }

  function getClientAddress(req) {
    if (shouldTrustProxyHeaders(req)) {
      const forwardedForChain = String(req.headers["x-forwarded-for"] || "")
        .split(",")
        .map((value) => normalizeClientIp(value))
        .filter(Boolean);
      const forwardedFor =
        forwardedForChain.length > 0 ? forwardedForChain[forwardedForChain.length - 1] : "";
      if (forwardedFor) return forwardedFor;
    }
    return normalizeString(normalizeClientIp(req.socket && req.socket.remoteAddress), 120) || "unknown";
  }

  function getRequestProtocol(req) {
    const forwardedProto = normalizeString(
      String(req.headers["x-forwarded-proto"] || "").split(",")[0],
      16
    ).toLowerCase();
    if (forwardedProto === "https" || forwardedProto === "http") return forwardedProto;
    if (req.socket && req.socket.encrypted) return "https";
    return "http";
  }

  function shouldUseSecureCookies(req) {
    return getRequestProtocol(req) === "https";
  }

  async function readTextBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
    const body = await readBufferBody(req, maxBytes);
    return body.toString("utf8");
  }

  async function readBufferBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let settled = false;
      let payloadTooLarge = false;
      const chunks = [];

      function safeReject(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }

      function safeResolve(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      req.on("data", (chunk) => {
        if (payloadTooLarge) return;
        size += chunk.length;
        if (size > maxBytes) {
          payloadTooLarge = true;
          safeReject(new Error("Payload too large"));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (payloadTooLarge) return;
        safeResolve(Buffer.concat(chunks));
      });

      req.on("error", (err) => safeReject(err));
    });
  }

  async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
    const rawBody = await readTextBody(req, maxBytes);
    try {
      return rawBody ? JSON.parse(rawBody) : {};
    } catch {
      throw new Error("Invalid JSON");
    }
  }

  function parseFormBody(rawBody) {
    const params = new URLSearchParams(String(rawBody || ""));
    const output = {};
    for (const [key, value] of params.entries()) {
      if (!(key in output)) {
        output[key] = value;
        continue;
      }
      if (Array.isArray(output[key])) {
        output[key].push(value);
        continue;
      }
      output[key] = [output[key], value];
    }
    return output;
  }

  async function parseMultipartFormBody(rawBody, contentType = "") {
    const normalizedContentType = normalizeString(contentType, 240).toLowerCase();
    if (!normalizedContentType.startsWith("multipart/form-data")) {
      throw new Error("Invalid multipart content type");
    }

    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      body: Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || ""),
      duplex: "half",
    });
    const formData = await request.formData();
    const fields = {};
    const files = {};

    function appendValue(target, key, value) {
      if (!(key in target)) {
        target[key] = value;
        return;
      }
      if (Array.isArray(target[key])) {
        target[key].push(value);
        return;
      }
      target[key] = [target[key], value];
    }

    for (const [key, value] of formData.entries()) {
      const fieldName = normalizeString(key, 120);
      if (!fieldName) continue;
      if (typeof value === "string") {
        appendValue(fields, fieldName, value);
        continue;
      }

      const fileBuffer = Buffer.from(await value.arrayBuffer());
      const fileRecord = {
        fieldName,
        fileName: normalizeString(value.name, 180),
        contentType: normalizeString(value.type, 160),
        sizeBytes: fileBuffer.length,
        buffer: fileBuffer,
      };

      if (!(fieldName in files)) {
        files[fieldName] = [fileRecord];
        continue;
      }
      files[fieldName].push(fileRecord);
    }

    return { fields, files };
  }

  function getFormValue(formBody, key, maxLength = 500) {
    const value = formBody ? formBody[key] : "";
    if (Array.isArray(value)) {
      return normalizeString(value[value.length - 1], maxLength);
    }
    return normalizeString(value, maxLength);
  }

  function getFormValues(formBody, key, maxItems = 8, maxLength = 120) {
    const value = formBody ? formBody[key] : [];
    const items = Array.isArray(value) ? value : value ? [value] : [];
    const seen = new Set();
    const output = [];

    for (const item of items) {
      const normalized = normalizeString(item, maxLength);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push(normalized);
      if (output.length >= maxItems) break;
    }

    return output;
  }

  function getRequestUrl(req) {
    const host = normalizeString(req.headers.host || "localhost", 255) || "localhost";
    return new URL(req.url || "/", `http://${host}`);
  }

  return {
    clearCookie,
    getClientAddress,
    getFormValue,
    getFormValues,
    getRequestProtocol,
    getRequestUrl,
    parseMultipartFormBody,
    parseCookies,
    parseFormBody,
    readBufferBody,
    readJsonBody,
    readTextBody,
    serializeCookie,
    shouldTrustProxyHeaders,
    shouldUseSecureCookies,
  };
}

module.exports = {
  createRequestHelpers,
};
