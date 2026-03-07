#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { monitorEventLoopDelay } = require("perf_hooks");
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
const REQUEST_LOG_BUFFER_LIMIT = Number(process.env.REQUEST_LOG_BUFFER_LIMIT || 4000);
const REQUEST_LOG_FLUSH_INTERVAL_MS = Number(process.env.REQUEST_LOG_FLUSH_INTERVAL_MS || 250);
const PERF_WINDOW_MS = Number(process.env.PERF_WINDOW_MS || 5 * 60 * 1000);
const PERF_SUMMARY_INTERVAL_MS = Number(process.env.PERF_SUMMARY_INTERVAL_MS || 60 * 1000);
const PERF_MAX_SAMPLES = Number(process.env.PERF_MAX_SAMPLES || 40000);
const ALERT_P95_MS = Number(process.env.ALERT_P95_MS || 500);
const ALERT_P99_MS = Number(process.env.ALERT_P99_MS || 1000);
const ALERT_5XX_RATE = Number(process.env.ALERT_5XX_RATE || 0.01);
const ALERT_EVENT_LOOP_P95_MS = Number(process.env.ALERT_EVENT_LOOP_P95_MS || 100);
const STRIPE_CHECKOUT_ENDPOINT = "/api/stripe/checkout-session";
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 64 * 1024);
const STRIPE_MIN_AMOUNT_CENTS = Number(process.env.STRIPE_MIN_AMOUNT_CENTS || 50);
const STRIPE_MAX_AMOUNT_CENTS = Number(process.env.STRIPE_MAX_AMOUNT_CENTS || 200000);

let stripeClient = null;

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (stripeClient) return stripeClient;
  // Lazy load keeps server start resilient even if Stripe is not configured yet.
  const Stripe = require("stripe");
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

function getRequestDurationMs(startTimeNs) {
  return Number(process.hrtime.bigint() - startTimeNs) / 1e6;
}

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function percentileFromSorted(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  const clamped = Math.max(0, Math.min(100, percentile));
  const index = Math.ceil((clamped / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function createBufferedLogger() {
  const queue = [];
  let droppedCount = 0;
  let flushing = false;

  function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;

    const chunk = queue.splice(0, queue.length).join("\n");
    const dropped = droppedCount;
    droppedCount = 0;
    let output = `${chunk}\n`;
    if (dropped > 0) {
      output += `${JSON.stringify({
        ts: new Date().toISOString(),
        type: "request_log_drop",
        dropped,
      })}\n`;
    }

    process.stdout.write(output, () => {
      flushing = false;
      if (queue.length > 0) {
        setImmediate(flush);
      }
    });
  }

  const flushTimer = setInterval(flush, REQUEST_LOG_FLUSH_INTERVAL_MS);
  flushTimer.unref();

  return {
    log(entry) {
      const line = typeof entry === "string" ? entry : JSON.stringify(entry);
      if (queue.length >= REQUEST_LOG_BUFFER_LIMIT) {
        droppedCount += 1;
        return;
      }
      queue.push(line);
      if (!flushing) {
        setImmediate(flush);
      }
    },
    close() {
      clearInterval(flushTimer);
      flush();
    },
  };
}

function createRequestPerfWindow() {
  const samples = [];

  function trim(nowMs) {
    while (samples.length > 0 && nowMs - samples[0].ts > PERF_WINDOW_MS) {
      samples.shift();
    }
    if (samples.length > PERF_MAX_SAMPLES) {
      samples.splice(0, samples.length - PERF_MAX_SAMPLES);
    }
  }

  return {
    record(statusCode, durationMs) {
      const nowMs = Date.now();
      samples.push({ ts: nowMs, statusCode, durationMs });
      trim(nowMs);
    },
    snapshot() {
      const nowMs = Date.now();
      trim(nowMs);

      const total = samples.length;
      if (total === 0) {
        return {
          window_ms: PERF_WINDOW_MS,
          total_requests: 0,
          p50_ms: 0,
          p95_ms: 0,
          p99_ms: 0,
          status_5xx: 0,
          status_5xx_rate: 0,
        };
      }

      const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
      let status5xx = 0;
      for (const sample of samples) {
        if (sample.statusCode >= 500) status5xx += 1;
      }

      return {
        window_ms: PERF_WINDOW_MS,
        total_requests: total,
        p50_ms: roundNumber(percentileFromSorted(durations, 50)),
        p95_ms: roundNumber(percentileFromSorted(durations, 95)),
        p99_ms: roundNumber(percentileFromSorted(durations, 99)),
        status_5xx: status5xx,
        status_5xx_rate: roundNumber(status5xx / total, 4),
      };
    },
  };
}

function createEventLoopStats() {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  function readSnapshot(reset = false) {
    if (histogram.count === 0) {
      if (reset) histogram.reset();
      return { min_ms: 0, mean_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0 };
    }

    const snapshot = {
      min_ms: roundNumber(histogram.min / 1e6),
      mean_ms: roundNumber(histogram.mean / 1e6),
      p95_ms: roundNumber(histogram.percentile(95) / 1e6),
      p99_ms: roundNumber(histogram.percentile(99) / 1e6),
      max_ms: roundNumber(histogram.max / 1e6),
    };
    if (reset) histogram.reset();
    return snapshot;
  }

  return {
    readSnapshot,
    close() {
      histogram.disable();
    },
  };
}

function getPerfAlertReasons(requestSnapshot, eventLoopSnapshot) {
  const reasons = [];
  if (requestSnapshot.total_requests > 0 && requestSnapshot.p95_ms >= ALERT_P95_MS) {
    reasons.push(`p95_ms >= ${ALERT_P95_MS}`);
  }
  if (requestSnapshot.total_requests > 0 && requestSnapshot.p99_ms >= ALERT_P99_MS) {
    reasons.push(`p99_ms >= ${ALERT_P99_MS}`);
  }
  if (requestSnapshot.total_requests > 0 && requestSnapshot.status_5xx_rate >= ALERT_5XX_RATE) {
    reasons.push(`status_5xx_rate >= ${ALERT_5XX_RATE}`);
  }
  if (eventLoopSnapshot.p95_ms >= ALERT_EVENT_LOOP_P95_MS) {
    reasons.push(`event_loop_p95_ms >= ${ALERT_EVENT_LOOP_P95_MS}`);
  }
  return reasons;
}

function toServerTimingHeader(startTimeNs, cacheHit) {
  const durationMs = getRequestDurationMs(startTimeNs);
  const durationToken = Math.max(0, durationMs).toFixed(2);
  const cacheToken = cacheHit ? "hit" : "miss";
  return `app;dur=${durationToken}, cache;desc="${cacheToken}"`;
}

function writeHeadWithTiming(res, statusCode, headers, startTimeNs, cacheHit) {
  const enrichedHeaders = {
    ...headers,
    "Server-Timing": toServerTimingHeader(startTimeNs, cacheHit),
  };
  res.writeHead(statusCode, enrichedHeaders);
}

function writeJsonWithTiming(res, statusCode, payload, startTimeNs, cacheHit) {
  writeHeadWithTiming(
    res,
    statusCode,
    {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    startTimeNs,
    cacheHit
  );
  res.end(JSON.stringify(payload));
}

function getRequestOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoRaw)
    ? forwardedProtoRaw[0]
    : String(forwardedProtoRaw || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
  return `${protocol}://${host}`;
}

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function toAmountCents(amountValue) {
  const parsed = Number(amountValue);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100);
}

async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
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
      try {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        safeResolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        safeReject(new Error("Invalid JSON"));
      }
    });

    req.on("error", (err) => safeReject(err));
  });
}

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

const FULL_CARD_CLICK_SCRIPT = `<script id="full-card-click-handler">
(() => {
  if (window.__fullCardClickHandlerBound) return;
  window.__fullCardClickHandlerBound = true;

  const interactiveSelector = "a, button, input, select, textarea, label";

  function openLink(link, event) {
    if (event && (event.metaKey || event.ctrlKey)) {
      window.open(link.href, "_blank", "noopener");
      return;
    }
    window.location.href = link.href;
  }

  function initCardLinks() {
    const groups = document.querySelectorAll(".tn-group[data-group-type-value='physical']");
    groups.forEach((group) => {
      if (group.dataset.fullCardLinkBound === "1") return;

      const cardLink = Array.from(group.querySelectorAll("a.tn-atom[href]")).find((link) => {
        const text = (link.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
        return text.includes("learn more");
      });

      if (!cardLink) return;

      group.dataset.fullCardLinkBound = "1";
      group.style.cursor = "pointer";
      group.setAttribute("role", "link");
      if (!group.hasAttribute("tabindex")) group.setAttribute("tabindex", "0");

      group.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.target.closest(interactiveSelector)) return;
        openLink(cardLink, event);
      });

      group.addEventListener("keydown", (event) => {
        if (event.target !== group) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openLink(cardLink, event);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCardLinks);
  } else {
    initCardLinks();
  }
})();
</script>`;

const MOBILE_STICKY_CTA_SCRIPT = `<script id="mobile-sticky-cta">
(() => {
  if (window.__mobileStickyCtaBound) return;
  window.__mobileStickyCtaBound = true;

  const PHONE = "+16308127077";

  function hideLegacyStickyCtas() {
    const isMobile = window.matchMedia("(max-width: 960px)").matches;
    if (!isMobile) return;

    const ourBar = document.getElementById("mobileStickyCta");
    const nodes = document.querySelectorAll("a,button");
    nodes.forEach((node) => {
      if (!node || node === ourBar || (ourBar && ourBar.contains(node))) return;
      if (!(node instanceof HTMLElement)) return;

      const text = (node.textContent || "").trim().toLowerCase();
      const href = node.getAttribute("href") || "";
      const looksLikeCta =
        text.includes("book now") ||
        text.includes("call us") ||
        href === "/quote" ||
        href === "tel:+16308127077";
      if (!looksLikeCta) return;

      const target = node.closest(".t396__elem,.t-btn,.t-btnflex,.t-rec,.t228,.tmenu-mobile") || node;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === "mobileStickyCta" || (ourBar && ourBar.contains(target))) return;

      const style = window.getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      const isFloating = style.position === "fixed" || style.position === "sticky";
      const isBottomArea = rect.top > window.innerHeight * 0.55;
      if (!isFloating || !isBottomArea) return;

      target.style.setProperty("display", "none", "important");
      target.setAttribute("data-legacy-mobile-cta-hidden", "true");
    });
  }

  function initStickyCta() {
    if (document.getElementById("mobileStickyCta")) return;

    const style = document.createElement("style");
    style.textContent = \`
      @media (max-width: 960px) {
        body { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)) !important; }
        #mobileStickyCta {
          position: fixed;
          left: 10px;
          right: 10px;
          bottom: calc(10px + env(safe-area-inset-bottom, 0px));
          z-index: 10050;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          pointer-events: auto;
        }
        #mobileStickyCta a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 48px;
          border-radius: 999px;
          text-decoration: none;
          font-family: Montserrat, Arial, sans-serif;
          font-size: 15px;
          font-weight: 600;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
        }
        #mobileStickyCta .cta-book {
          background: #9e435a;
          color: #ffffff;
        }
        #mobileStickyCta .cta-call {
          background: #faf9f6;
          color: #9e435a;
          border: 1px solid #9e435a;
        }
      }
      @media (min-width: 961px) {
        #mobileStickyCta { display: none !important; }
      }
    \`;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.id = "mobileStickyCta";
    wrap.innerHTML = \`
      <a class="cta-book" href="/quote">Book Now</a>
      <a class="cta-call" href="tel:\${PHONE}">Call Us</a>
    \`;
    document.body.appendChild(wrap);

    hideLegacyStickyCtas();
    const observer = new MutationObserver(() => hideLegacyStickyCtas());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", hideLegacyStickyCtas, { passive: true });
    window.addEventListener("scroll", hideLegacyStickyCtas, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStickyCta);
  } else {
    initStickyCta();
  }
})();
</script>`;

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

  // Make header "Call Us" tappable as a phone link across pages.
  cleaned = cleaned.replace(
    /<strong>📞<\/strong>\s*Call Us/g,
    '<a href="tel:+16308127077" style="color: inherit; text-decoration: none;"><strong>📞</strong> Call Us</a>'
  );

  const hasForms = /data-elem-type='form'|class="t-form"|tn-atom__form/.test(cleaned);
  if (!hasForms) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-forms-1\.0\.min\.css"[^>]*>/g, "")
      .replace(/<script[^>]+src="js\/tilda-forms-1\.0\.min\.js"[^>]*><\/script>/g, "")
      .replace(/<script[^>]+src="js\/tilda-zero-forms-1\.0\.min\.js"[^>]*><\/script>/g, "");
  }

  // Fix relative asset paths on nested routes like /services/*.
  if (!/<base\s+href=/i.test(cleaned)) {
    cleaned = cleaned.replace(/<head>/i, '<head><base href="/" />');
  }

  if (!/id="full-card-click-handler"/.test(cleaned) && /<body[\s>]/i.test(cleaned)) {
    cleaned = cleaned.replace(
      /<\/body>/i,
      `${FULL_CARD_CLICK_SCRIPT}${MOBILE_STICKY_CTA_SCRIPT}</body>`
    );
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
    return {
      entry: htmlCache.get(absolutePath),
      cacheHit: true,
    };
  }

  const rawHtml = await fsp.readFile(absolutePath, "utf8");
  const htmlEntry = buildHtmlCacheEntry(sanitizeHtml(rawHtml), fileMeta);
  htmlCache.set(absolutePath, htmlEntry);
  return {
    entry: htmlEntry,
    cacheHit: false,
  };
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
      const htmlResult = await getHtmlFromCache(absolutePath, htmlCache, fileMeta);
      const htmlEntry = htmlResult.entry;
      requestContext.cacheHit = htmlResult.cacheHit;
      const headers = {
        ...baseHeaders,
        "Accept-CH": "Width, Viewport-Width, DPR",
        ETag: htmlEntry.etag,
        "Last-Modified": htmlEntry.lastModified,
      };

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

async function handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger) {
  requestContext.cacheHit = false;

  if (req.method !== "POST") {
    writeHeadWithTiming(
      res,
      405,
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Allow: "POST",
      },
      requestStartNs,
      requestContext.cacheHit
    );
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const stripe = getStripeClient();
  if (!stripe) {
    writeJsonWithTiming(
      res,
      503,
      { error: "Payments are temporarily unavailable. Stripe is not configured." },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
  } catch (error) {
    const isLarge = String(error && error.message).toLowerCase().includes("payload");
    writeJsonWithTiming(
      res,
      isLarge ? 413 : 400,
      { error: isLarge ? "Request payload is too large" : "Invalid request body" },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const amountCents = toAmountCents(body.amount ?? body.totalPrice);
  if (
    !Number.isFinite(amountCents) ||
    amountCents < STRIPE_MIN_AMOUNT_CENTS ||
    amountCents > STRIPE_MAX_AMOUNT_CENTS
  ) {
    writeJsonWithTiming(
      res,
      400,
      {
        error: `Invalid amount. Allowed range is ${STRIPE_MIN_AMOUNT_CENTS / 100} to ${
          STRIPE_MAX_AMOUNT_CENTS / 100
        } USD.`,
      },
      requestStartNs,
      requestContext.cacheHit
    );
    return;
  }

  const origin = getRequestOrigin(req);
  const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/quote?payment=success`;
  const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/quote?payment=cancelled`;
  const serviceName = normalizeString(body.serviceName || "Cleaning Service", 120);
  const customerEmail = normalizeString(body.customerEmail, 320);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);

  const metadata = {
    service_type: normalizeString(body.serviceType || "", 100),
    selected_date: normalizeString(body.selectedDate || "", 100),
    selected_time: normalizeString(body.selectedTime || "", 100),
    customer_name: normalizeString(body.customerName || "", 250),
    customer_phone: normalizeString(body.customerPhone || "", 80),
    full_address: normalizeString(body.fullAddress || body.address || "", 500),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: serviceName,
              description: "Cleaning service booking",
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      ...(isValidEmail ? { customer_email: customerEmail } : {}),
    });

    writeJsonWithTiming(
      res,
      200,
      {
        url: session.url,
        id: session.id,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  } catch (error) {
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "stripe_checkout_error",
      message: error && error.message ? error.message : "Unknown Stripe error",
    });
    writeJsonWithTiming(
      res,
      502,
      { error: "Failed to create Stripe checkout session" },
      requestStartNs,
      requestContext.cacheHit
    );
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
  const requestLogger = createBufferedLogger();
  const requestPerfWindow = createRequestPerfWindow();
  const eventLoopStats = createEventLoopStats();

  const perfSummaryTimer = setInterval(() => {
    const requestSnapshot = requestPerfWindow.snapshot();
    const eventLoopSnapshot = eventLoopStats.readSnapshot(true);
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "perf_summary",
      request: requestSnapshot,
      event_loop: eventLoopSnapshot,
    });

    const reasons = getPerfAlertReasons(requestSnapshot, eventLoopSnapshot);
    if (reasons.length > 0) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "perf_alert",
        level: "warn",
        reasons,
        thresholds: {
          p95_ms: ALERT_P95_MS,
          p99_ms: ALERT_P99_MS,
          status_5xx_rate: ALERT_5XX_RATE,
          event_loop_p95_ms: ALERT_EVENT_LOOP_P95_MS,
        },
        request: requestSnapshot,
        event_loop: eventLoopSnapshot,
      });
    }
  }, PERF_SUMMARY_INTERVAL_MS);
  perfSummaryTimer.unref();

  const server = http.createServer(async (req, res) => {
    const requestStartNs = process.hrtime.bigint();
    const requestContext = {
      cacheHit: false,
      route: "/",
    };

    res.on("finish", () => {
      const durationMs = getRequestDurationMs(requestStartNs);
      requestPerfWindow.record(res.statusCode, durationMs);
      const logLine = {
        ts: new Date().toISOString(),
        route: requestContext.route,
        status: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        cache_hit: requestContext.cacheHit,
      };
      requestLogger.log(logLine);
    });

    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(reqUrl.pathname);
      const normalizedPath = normalizeRoute(pathname);
      requestContext.route = normalizedPath;

      if (normalizedPath === "/__perf") {
        requestContext.cacheHit = false;
        const perfBody = JSON.stringify(
          {
            ts: new Date().toISOString(),
            request: requestPerfWindow.snapshot(),
            event_loop: eventLoopStats.readSnapshot(false),
            thresholds: {
              p95_ms: ALERT_P95_MS,
              p99_ms: ALERT_P99_MS,
              status_5xx_rate: ALERT_5XX_RATE,
              event_loop_p95_ms: ALERT_EVENT_LOOP_P95_MS,
            },
          },
          null,
          2
        );

        writeHeadWithTiming(
          res,
          200,
          {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
          requestStartNs,
          requestContext.cacheHit
        );
        res.end(perfBody);
        return;
      }

      if (normalizedPath === STRIPE_CHECKOUT_ENDPOINT) {
        await handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger);
        return;
      }

      const directAssetPath = resolveSitePath(pathname);
      if (
        pathname !== "/" &&
        path.extname(pathname) &&
        isSafePath(SITE_DIR, directAssetPath) &&
        runtimeIndex.existingFiles.has(directAssetPath)
      ) {
        await sendFile(
          req,
          res,
          directAssetPath,
          htmlCache,
          runtimeIndex,
          requestContext,
          requestStartNs
        );
        return;
      }

      const mappedFilePath = runtimeIndex.routeFileByPath.get(normalizedPath);
      if (mappedFilePath) {
        await sendFile(
          req,
          res,
          mappedFilePath,
          htmlCache,
          runtimeIndex,
          requestContext,
          requestStartNs
        );
        return;
      }

      if (runtimeIndex.notFoundExists) {
        await sendFile(
          req,
          res,
          runtimeIndex.notFoundAbsolutePath,
          htmlCache,
          runtimeIndex,
          requestContext,
          requestStartNs,
          404
        );
        return;
      }

      requestContext.cacheHit = false;
      writeHeadWithTiming(
        res,
        404,
        { "Content-Type": "text/plain; charset=utf-8" },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end("Page not found");
    } catch {
      requestContext.cacheHit = false;
      writeHeadWithTiming(
        res,
        500,
        { "Content-Type": "text/plain; charset=utf-8" },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end("Internal server error");
    }
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(perfSummaryTimer);
    eventLoopStats.close();
    requestLogger.log({
      ts: new Date().toISOString(),
      type: "shutdown",
      signal,
    });

    server.close(() => {
      requestLogger.close();
      process.exit(0);
    });

    const forceExitTimer = setTimeout(() => {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "force_exit",
      });
      requestLogger.close();
      process.exit(1);
    }, 5000);
    forceExitTimer.unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

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
