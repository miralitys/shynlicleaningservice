"use strict";

function createTimingHelpers(options = {}) {
  const getRequestDurationMs =
    typeof options.getRequestDurationMs === "function"
      ? options.getRequestDurationMs
      : () => 0;
  const baseSecurityHeaders = options.baseSecurityHeaders || {};

  function toServerTimingHeader(startTimeNs, cacheHit) {
    const durationMs = getRequestDurationMs(startTimeNs);
    const durationToken = Math.max(0, durationMs).toFixed(2);
    const cacheToken = cacheHit ? "hit" : "miss";
    return `app;dur=${durationToken}, cache;desc="${cacheToken}"`;
  }

  function writeHeadWithTiming(res, statusCode, headers, startTimeNs, cacheHit) {
    const enrichedHeaders = {
      ...baseSecurityHeaders,
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

  function writeHtmlWithTiming(res, statusCode, html, startTimeNs, cacheHit, headers = {}) {
    writeHeadWithTiming(
      res,
      statusCode,
      {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        ...headers,
      },
      startTimeNs,
      cacheHit
    );
    res.end(html);
  }

  function redirectWithTiming(res, statusCode, location, startTimeNs, cacheHit, headers = {}) {
    writeHeadWithTiming(
      res,
      statusCode,
      {
        Location: location,
        "Cache-Control": "no-store",
        ...headers,
      },
      startTimeNs,
      cacheHit
    );
    res.end();
  }

  return {
    redirectWithTiming,
    writeHeadWithTiming,
    writeHtmlWithTiming,
    writeJsonWithTiming,
  };
}

module.exports = {
  createTimingHelpers,
};
