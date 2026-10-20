"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startRecurringOrderMaintenance } = require("../lib/recurring-order-maintenance");

function timers() {
  const scheduled = [], cleared = [];
  const schedule = (fn, ms) => { const timer = { fn, ms, unref() {} }; scheduled.push(timer); return timer; };
  return { scheduled, cleared, setIntervalFn: schedule, setTimeoutFn: schedule,
    clearIntervalFn: timer => cleared.push(timer), clearTimeoutFn: timer => cleared.push(timer) };
}

test("recurring maintenance runs from startup/interval timers without any page request and never overlaps", async () => {
  const clock = timers();
  let count = 0, release;
  const worker = startRecurringOrderMaintenance({ ...clock, runSweep: () => { count++; return new Promise(resolve => { release = resolve; }); } });
  assert.deepEqual(clock.scheduled.map(timer => timer.ms), [300000, 60000]);
  const startup = clock.scheduled[1].fn();
  await Promise.resolve();
  const interval = clock.scheduled[0].fn();
  assert.equal(startup, interval);
  assert.equal(count, 1);
  release();
  await startup;
  const next = worker.run();
  await Promise.resolve();
  assert.equal(count, 2);
  release();
  await next;
  worker.stop();
  await worker.run();
  assert.equal(count, 2);
  assert.equal(clock.cleared.length, 2);
});

test("maintenance logs failures and retries on the next tick instead of dying or rejecting unhandled", async () => {
  let attempts = 0;
  const logs = [];
  const worker = startRecurringOrderMaintenance({ ...timers(), log: value => logs.push(value), runSweep: async () => {
    if (++attempts === 1) throw new Error("Read failed");
  } });
  await worker.run();
  await worker.run();
  assert.equal(attempts, 2);
  assert.equal(logs[0].type, "recurring_order_maintenance_error");
  worker.stop();
});
