"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createProfitabilityStore({ env = process.env, fetch: fetchImpl = global.fetch } = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const remote = Boolean(url && key);
  const file = env.PROFITABILITY_STORE_PATH || path.resolve("data/profitability.json");
  let queue = Promise.resolve();
  async function request(resource, options = {}) {
    const headers = { apikey: key, "Content-Type": "application/json", ...options.headers };
    if (!/^sb_(secret|publishable)_/.test(key)) headers.Authorization = `Bearer ${key}`;
    const response = await fetchImpl(new URL(`/rest/v1/${resource}`, url), { ...options, headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Object.assign(new Error(response.status === 409 ? "Данные уже изменились. Обновите строку." : "Хранилище доходности недоступно."), { status: response.status === 409 ? 409 : 503 });
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function read() {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return { records: {}, events: [] }; throw error; }
  }
  async function get(id) {
    if (remote) return (await request(`profitability_records?id=eq.${encodeURIComponent(id)}&select=*`, { method: "GET" }))?.[0] || { id, version: 0, data: {} };
    await queue;
    return (await read()).records[id] || { id, version: 0, data: {} };
  }
  async function saveBatch(updates, actor) {
    if (updates.some(item => !Number.isSafeInteger(item.version) || item.version < 0)) throw Object.assign(new Error("Укажите версию записи."), { status: 400 });
    if (remote) return request("rpc/save_profitability_batch", { method: "POST", body: JSON.stringify({ p_updates: updates, p_actor: actor }) });
    const pending = queue.catch(() => {}).then(async () => {
      const state = await read();
      const records = updates.map(({ id, patch, version }) => {
        const old = state.records[id] || { id, version: 0, data: {} };
        if (old.version !== version) throw Object.assign(new Error("Данные уже изменились. Обновите строку."), { status: 409 });
        const record = { id, version: version + 1, data: { ...old.data, ...patch }, updated_at: new Date().toISOString() };
        state.records[id] = record;
        state.events.push({ id: crypto.randomUUID(), record_id: id, occurred_at: record.updated_at, actor, before: old.data, after: record.data });
        return record;
      });
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
        await fs.rename(temporary, file);
      } finally { await fs.rm(temporary, { force: true }); }
      return records;
    });
    queue = pending.then(() => {}, () => {});
    return pending;
  }
  return { get, saveBatch, async save(id, patch, version, actor) { return (await saveBatch([{ id, patch, version }], actor))[0]; },
    async listSources() {
      if (!remote) { await queue; return Object.values((await read()).records).map(record => ({ id: record.id, source: record.data.source || "" })); }
      const records = [];
      let cursor = "";
      for (;;) {
        const params = new URLSearchParams({ select: "id,source:data->>source", order: "id.asc", limit: "500" });
        if (cursor) params.set("id", `gt.${cursor}`);
        const rows = await request(`profitability_records?${params}`, { method: "GET" });
        if (!Array.isArray(rows)) throw new Error("Invalid source response");
        if (!rows.length) break;
        for (const row of rows) { if (!row.id || row.id <= cursor) throw new Error("Invalid source cursor"); cursor = row.id; records.push(row); }
      }
      return records;
    },
    async list() {
      if (!remote) { await queue; return Object.values((await read()).records); }
      const records = [];
      let cursor = "";
      for (;;) {
        const params = new URLSearchParams({ select: "*", order: "id.asc", limit: "500" });
        if (cursor) params.set("id", `gt.${cursor}`);
        const rows = await request(`profitability_records?${params}`, { method: "GET" });
        if (!Array.isArray(rows)) throw new Error("Invalid profitability response");
        if (!rows.length) break;
        for (const row of rows) {
          if (!row.id || row.id <= cursor) throw new Error("Invalid profitability cursor");
          cursor = row.id; records.push(row);
        }
      }
      return records;
    },
    async history(id) {
      if (remote) return request(`profitability_events?record_id=eq.${encodeURIComponent(id)}&order=occurred_at.desc,id.desc&limit=100`, { method: "GET" });
      await queue;
      return (await read()).events.filter(event => event.record_id === id).slice(-100).reverse();
    },
  };
}

module.exports = { createProfitabilityStore };
