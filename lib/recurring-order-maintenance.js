"use strict";

function startRecurringOrderMaintenance({ runSweep, log = () => {}, intervalMs = 5 * 60 * 1000,
  startupDelayMs = 60 * 1000, setIntervalFn = setInterval, setTimeoutFn = setTimeout,
  clearIntervalFn = clearInterval, clearTimeoutFn = clearTimeout } = {}) {
  let pending = null;
  let stopped = false;
  function run() {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(runSweep).catch(error => {
      log({ ts: new Date().toISOString(), type: "recurring_order_maintenance_error", message: String(error.message || error).slice(0, 300) });
    }).finally(() => { pending = null; });
    return pending;
  }
  const interval = setIntervalFn(run, intervalMs);
  const startup = setTimeoutFn(run, startupDelayMs);
  interval.unref?.();
  startup.unref?.();
  return { run, stop() { stopped = true; clearIntervalFn(interval); clearTimeoutFn(startup); } };
}

module.exports = { startRecurringOrderMaintenance };
