"use strict";

function createSlidingWindowRateLimiter(options = {}) {
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : 60_000;
  const maxRequests = Number.isFinite(options.maxRequests) ? options.maxRequests : 10;
  const store = new Map();
  let lastSweepAt = 0;

  function sweep(nowMs) {
    if (nowMs - lastSweepAt < windowMs) return;
    lastSweepAt = nowMs;

    for (const [key, timestamps] of store.entries()) {
      const fresh = timestamps.filter((timestamp) => nowMs - timestamp < windowMs);
      if (fresh.length > 0) {
        store.set(key, fresh);
      } else {
        store.delete(key);
      }
    }
  }

  function take(key, nowMs = Date.now()) {
    if (!key || windowMs <= 0 || maxRequests <= 0) {
      return {
        allowed: true,
        retryAfterMs: 0,
      };
    }

    sweep(nowMs);

    const existing = store.get(key) || [];
    const fresh = existing.filter((timestamp) => nowMs - timestamp < windowMs);

    if (fresh.length >= maxRequests) {
      const retryAfterMs = Math.max(0, windowMs - (nowMs - fresh[0]));
      store.set(key, fresh);
      return {
        allowed: false,
        retryAfterMs,
      };
    }

    fresh.push(nowMs);
    store.set(key, fresh);
    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }

  return {
    take,
  };
}

module.exports = {
  createSlidingWindowRateLimiter,
};
