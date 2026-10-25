"use strict";

const path = require("node:path");
const { Worker } = require("node:worker_threads");

function unavailable() {
  return Object.assign(new Error("Public HTML preparation unavailable"), { code: "PUBLIC_HTML_UNAVAILABLE" });
}

function createPublicHtmlPreparer({ seoOptions, sanitizerOptions, maxCacheBytes = 16 * 1024 * 1024,
  maxPending = 32, timeoutMs = 120000 } = {}) {
  let worker = null;
  let sequence = 0;
  let closed = false;
  const pending = new Map();

  function fail(instance) {
    if (worker !== instance) return;
    worker = null;
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(unavailable());
    }
    pending.clear();
    void instance.terminate();
  }

  function getWorker() {
    if (worker) return worker;
    const instance = new Worker(path.join(__dirname, "html-preparation-worker.js"), {
      workerData: { seoOptions, sanitizerOptions, maxCacheBytes },
      // Only public rendering configuration crosses the worker boundary.
      env: {},
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
    });
    worker = instance;
    instance.on("message", (message) => {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      clearTimeout(job.timer);
      if (message.error) job.reject(unavailable());
      else job.resolve(message.result);
      if (!pending.size) instance.unref();
    });
    instance.on("error", () => fail(instance));
    instance.on("exit", () => fail(instance));
    instance.unref();
    return instance;
  }

  function request(message) {
    if (closed || pending.size >= maxPending) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      let instance;
      try { instance = getWorker(); } catch { reject(unavailable()); return; }
      const id = ++sequence;
      const timer = setTimeout(() => fail(instance), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      instance.ref();
      try { instance.postMessage({ ...message, id }); } catch { fail(instance); }
    });
  }

  return {
    prepare: (html, route, { cacheable = false } = {}) => request({ type: "prepare", html, route, cacheable }),
    inspect: () => request({ type: "inspect" }),
    async close() {
      closed = true;
      const instance = worker;
      if (instance) fail(instance);
      if (instance) await instance.terminate();
    },
  };
}

module.exports = { createPublicHtmlPreparer };
