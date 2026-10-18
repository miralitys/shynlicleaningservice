"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createAdminAuditStore({ env = process.env, fetch: fetchImpl = global.fetch } = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const table = env.SUPABASE_ADMIN_AUDIT_TABLE || "admin_audit_events";
  const remote = Boolean(url && key);
  const file = env.ADMIN_AUDIT_STORE_PATH || path.resolve("data/admin-audit.jsonl");
  let queue = Promise.resolve();

  async function request(query, options = {}) {
    const headers = { apikey: key, "Content-Type": "application/json", ...options.headers };
    if (!/^sb_(secret|publishable)_/.test(key)) headers.Authorization = `Bearer ${key}`;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(new URL(`/rest/v1/${table}?${query}`, url).toString(), {
          ...options, headers, signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          const error = new Error(`Audit storage HTTP ${response.status}; check the audit schema migration`);
          if (response.status < 500 && response.status !== 429) throw Object.assign(error, { permanent: true });
          throw error;
        }
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      } catch (error) {
        lastError = error;
        if (error.permanent) break;
      }
    }
    throw lastError;
  }

  async function appendLocal(event) {
    const pending = queue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const handle = await fs.open(file, "a", 0o600);
      try { await handle.write(`${JSON.stringify(event)}\n`); await handle.sync(); }
      finally { await handle.close(); }
    });
    queue = pending;
    return pending;
  }

  return {
    mode: remote ? "supabase" : "file",
    async begin(data) {
      const event = { ...data, id: crypto.randomUUID(), occurred_at: new Date().toISOString(), status: "pending",
        after_data: null, changes: [] };
      if (remote) await request("on_conflict=id", { method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(event) });
      else await appendLocal(event);
      return event;
    },
    async finish(event, result) {
      const patch = { ...result, completed_at: new Date().toISOString() };
      if (remote) await request(`id=eq.${event.id}`, { method: "PATCH",
        headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      else await appendLocal({ ...event, ...patch });
    },
    async list(filters = {}) {
      const limit = Math.min(200, Math.max(1, Number(filters.limit) || 100));
      const offset = Math.max(0, Number(filters.offset) || 0);
      if (remote) {
        const query = new URLSearchParams({ select: "*", order: "occurred_at.desc,id.desc", limit: String(limit), offset: String(offset) });
        query.set("status", filters.status ? `eq.${filters.status}` : "neq.noop");
        for (const [name, value] of Object.entries({ entity_type: filters.entityType, action: filters.action, entity_id: filters.entityId })) {
          if (value) query.set(name, `eq.${value}`);
        }
        if (filters.actor) query.set("actor->>email", `eq.${filters.actor}`);
        if (filters.q) query.set("entity_label", `ilike.*${filters.q.replace(/[%*]/g, "") }*`);
        if (filters.start) query.append("occurred_at", `gte.${filters.start}`);
        if (filters.end) query.append("occurred_at", `lt.${filters.end}`);
        return await request(query.toString(), { method: "GET" }) || [];
      }
      await queue.catch(() => {});
      let contents;
      try { contents = await fs.readFile(file, "utf8"); }
      catch (error) { if (error.code === "ENOENT") return []; throw error; }
      const events = new Map();
      for (const line of contents.split("\n").filter(Boolean)) {
        try { const event = JSON.parse(line); events.set(event.id, event); }
        catch { throw new Error("Audit file contains an invalid record"); }
      }
      return [...events.values()].filter(event =>
        (filters.status ? event.status === filters.status : event.status !== "noop") &&
        (!filters.entityType || event.entity_type === filters.entityType) &&
        (!filters.entityId || event.entity_id === filters.entityId) &&
        (!filters.action || event.action === filters.action) &&
        (!filters.actor || event.actor.email === filters.actor) &&
        (!filters.q || event.entity_label.toLowerCase().includes(filters.q.toLowerCase())) &&
        (!filters.start || event.occurred_at >= filters.start) &&
        (!filters.end || event.occurred_at < filters.end)
      ).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id)).slice(offset, offset + limit);
    },
  };
}

module.exports = { createAdminAuditStore };
