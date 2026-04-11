"use strict";

const { monitorEventLoopDelay } = require("perf_hooks");

function percentileFromSorted(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  const clamped = Math.max(0, Math.min(100, percentile));
  const index = Math.ceil((clamped / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function createBufferedLogger(options = {}) {
  const bufferLimit = Number.isFinite(options.bufferLimit) ? options.bufferLimit : 4000;
  const flushIntervalMs = Number.isFinite(options.flushIntervalMs) ? options.flushIntervalMs : 250;
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

  const flushTimer = setInterval(flush, flushIntervalMs);
  flushTimer.unref();

  return {
    log(entry) {
      const line = typeof entry === "string" ? entry : JSON.stringify(entry);
      if (queue.length >= bufferLimit) {
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

function getMemoryUsageSnapshot(roundNumber) {
  const toMb = (bytes) => roundNumber(bytes / (1024 * 1024));
  const usage = process.memoryUsage();
  return {
    rss_mb: toMb(usage.rss),
    heap_total_mb: toMb(usage.heapTotal),
    heap_used_mb: toMb(usage.heapUsed),
    external_mb: toMb(usage.external),
    array_buffers_mb: toMb(usage.arrayBuffers),
  };
}

function createRequestPerfWindow(options = {}) {
  const perfWindowMs = Number.isFinite(options.perfWindowMs) ? options.perfWindowMs : 5 * 60 * 1000;
  const maxSamples = Number.isFinite(options.maxSamples) ? options.maxSamples : 40000;
  const roundNumber = typeof options.roundNumber === "function" ? options.roundNumber : (value) => value;
  const samples = [];

  function trim(nowMs) {
    while (samples.length > 0 && nowMs - samples[0].ts > perfWindowMs) {
      samples.shift();
    }
    if (samples.length > maxSamples) {
      samples.splice(0, samples.length - maxSamples);
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
          window_ms: perfWindowMs,
          total_requests: 0,
          p50_ms: 0,
          p95_ms: 0,
          p99_ms: 0,
          status_5xx: 0,
          status_5xx_rate: 0,
        };
      }

      const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
      let status5xx = 0;
      for (const sample of samples) {
        if (sample.statusCode >= 500) status5xx += 1;
      }

      return {
        window_ms: perfWindowMs,
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

function createEventLoopStats(options = {}) {
  const roundNumber = typeof options.roundNumber === "function" ? options.roundNumber : (value) => value;
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

function getPerfAlertReasons(requestSnapshot, eventLoopSnapshot, thresholds = {}) {
  const alertP95Ms = Number.isFinite(thresholds.alertP95Ms) ? thresholds.alertP95Ms : 500;
  const alertP99Ms = Number.isFinite(thresholds.alertP99Ms) ? thresholds.alertP99Ms : 1000;
  const alert5xxRate = Number.isFinite(thresholds.alert5xxRate) ? thresholds.alert5xxRate : 0.01;
  const alertEventLoopP95Ms = Number.isFinite(thresholds.alertEventLoopP95Ms)
    ? thresholds.alertEventLoopP95Ms
    : 100;
  const reasons = [];

  if (requestSnapshot.total_requests > 0 && requestSnapshot.p95_ms >= alertP95Ms) {
    reasons.push(`p95_ms >= ${alertP95Ms}`);
  }
  if (requestSnapshot.total_requests > 0 && requestSnapshot.p99_ms >= alertP99Ms) {
    reasons.push(`p99_ms >= ${alertP99Ms}`);
  }
  if (requestSnapshot.total_requests > 0 && requestSnapshot.status_5xx_rate >= alert5xxRate) {
    reasons.push(`status_5xx_rate >= ${alert5xxRate}`);
  }
  if (eventLoopSnapshot.p95_ms >= alertEventLoopP95Ms) {
    reasons.push(`event_loop_p95_ms >= ${alertEventLoopP95Ms}`);
  }

  return reasons;
}

module.exports = {
  createBufferedLogger,
  createEventLoopStats,
  createRequestPerfWindow,
  getMemoryUsageSnapshot,
  getPerfAlertReasons,
};
