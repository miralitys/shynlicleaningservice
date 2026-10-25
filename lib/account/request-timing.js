"use strict";

const { randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");

const responses = new WeakMap();
const PHASES = new Set(["auth", "audit", "staff", "settings", "users", "orders", "snapshot_wait", "context", "selection", "planning", "render"]);
const VIEWS = new Set(["orders", "history", "payroll", "month_grid", "month_full", "day", "order_detail"]);
const CACHE_STATES = new Set(["hit", "detail", "bypass", "empty", "expired", "scope", "revision"]);

function createAccountRequestTiming({ res, logger, enabled = false, now = () => performance.now() }) {
  const started = enabled ? now() : 0;
  const phases = new Map();
  let active = false;
  let view = "orders";
  let cache = "bypass";
  let failed = false;
  const id = enabled ? randomUUID() : "";
  const snapshot = () => ({ request_id: id, view, snapshot_cache: cache, outcome: failed ? "error" : "ok",
    phases_ms: Object.fromEntries(Array.from(phases, ([name, duration]) => [name, Number(duration.toFixed(2))])) });

  return {
    measure(name, work) {
      if (!enabled || !PHASES.has(name)) return work();
      const start = now();
      const finish = () => phases.set(name, (phases.get(name) || 0) + Math.max(0, now() - start));
      try {
        const result = work();
        if (result && typeof result.then === "function") return result.then(value => {
          finish();
          return value;
        }, error => {
          failed = true;
          finish();
          throw error;
        });
        finish();
        return result;
      } catch (error) {
        failed = true;
        finish();
        throw error;
      }
    },
    activate() {
      if (!enabled || active) return;
      active = true;
      responses.set(res, snapshot);
      if (typeof res.once === "function") res.once("finish", () => {
        if (!logger || typeof logger.log !== "function") return;
        try {
          logger.log({ ts: new Date().toISOString(), type: "account_request_timing", ...snapshot(),
            status: res.statusCode, elapsed_ms: Number(Math.max(0, now() - started).toFixed(2)) });
        } catch { /* Diagnostic failures must not change the response. */ }
      });
    },
    setView(value) { if (VIEWS.has(value)) view = value; },
    setCache(value) { if (CACHE_STATES.has(value)) cache = value; },
    fail() { failed = true; },
  };
}

function getAccountTimingHeaders(res) {
  const snapshot = responses.get(res)?.();
  if (!snapshot) return {};
  return {
    "X-Shynli-Request-Id": snapshot.request_id,
    "Server-Timing": Object.entries(snapshot.phases_ms).map(([name, duration]) => `acct_${name};dur=${duration.toFixed(2)}`).join(", "),
  };
}

module.exports = { createAccountRequestTiming, getAccountTimingHeaders };
