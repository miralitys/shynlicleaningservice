"use strict";

const crypto = require("node:crypto");
const { loadTelegramConfig, sendTelegramTextNotification } = require("../web-leads/telegram");

const DELIVERY_KIND = "admin_voice_ai_telegram_delivery";
const SHYNLI_LOCATION_ID = "H3JoUqRWLxub6eauiC3S";

function text(value, limit = 200) {
  return typeof value === "string" && !value.includes("{{")
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}

function normalizeEvaCall(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Invalid call payload"), { status: 400 });
  }
  const custom = body.customData || body.custom_data || body;
  const locationId = text(custom.locationId || body.location?.id || body.locationId);
  const contactId = text(custom.contactId || body.contact_id || body.contactId);
  const startedAt = text(custom.callStartedAt);
  const summary = text(custom.summary, 1800);
  if (locationId !== SHYNLI_LOCATION_ID) throw Object.assign(new Error("Location mismatch"), { status: 400 });
  if (!/^[A-Za-z0-9_-]+$/.test(contactId) || !startedAt || !summary) {
    throw Object.assign(new Error("Missing contact, call start time or summary"), { status: 400 });
  }
  const callId = text(custom.callId);
  const hash = crypto.createHash("sha256").update(JSON.stringify([locationId, contactId, callId || startedAt])).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const contactUrl = `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`;
  return { id, contactId, locationId, summary, contactUrl,
    name: text(body.full_name || body.name || body.contact?.name),
    duration: text(custom.duration, 60) };
}

function formatEvaSummary(call) {
  const lines = ["Eva: call summary"];
  if (call.name) lines.push(`Contact: ${call.name}`);
  if (call.duration) lines.push(`Duration: ${call.duration}`);
  return [...lines, "", call.summary, "", `GHL: ${call.contactUrl}`].join("\n");
}

async function deliverEvaCallSummary(body, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || global.fetch;
  const send = options.send || sendTelegramTextNotification;
  const call = normalizeEvaCall(body);
  const telegram = loadTelegramConfig({ env, fetch: fetchImpl });
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const table = env.SUPABASE_QUOTE_OPS_TABLE || "quote_ops_entries";
  if (!url || !key || !telegram.configured || !/^[A-Za-z0-9_]+$/.test(table)) {
    throw Object.assign(new Error("Persistent delivery store or Telegram is not configured"), { status: 503 });
  }
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (!/^sb_(secret|publishable)_/.test(key)) headers.Authorization = `Bearer ${key}`;
  const endpoint = new URL(`/rest/v1/${table}`, url);
  // The primary-key insert reserves this call before sending, also across deploys.
  // Never resend an uncertain Telegram delivery: sendMessage has no idempotency key.
  const claimed = await fetchImpl(endpoint, {
    method: "POST", headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ id: call.id, kind: DELIVERY_KIND, status: "warning",
      source: "eva-telegram", source_route: "/api/ghl/eva-call-summary",
      request_id: call.id, code: "DELIVERY_RESERVED", retryable: false }),
    signal: AbortSignal.timeout(10000),
  });
  if (claimed.status === 409) {
    const conflict = await claimed.json().catch(() => ({}));
    if (conflict.code === "23505") return { ok: true, duplicate: true };
  }
  if (!claimed.ok) throw Object.assign(new Error("Could not reserve call delivery"), { status: 503 });
  let result;
  try {
    result = await send(formatEvaSummary(call), { config: telegram });
    if (!result?.ok || result.skipped) throw new Error("Telegram did not confirm delivery");
  } catch {
    return { ok: false, uncertain: true, id: call.id };
  }
  endpoint.searchParams.set("id", `eq.${call.id}`);
  endpoint.searchParams.set("kind", `eq.${DELIVERY_KIND}`);
  try {
    const saved = await fetchImpl(endpoint, { method: "PATCH", headers,
      body: JSON.stringify({ status: "success", code: "TELEGRAM_SENT", updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000) });
    return { ok: true, id: call.id, receiptSaved: saved.ok };
  } catch {
    return { ok: true, id: call.id, receiptSaved: false };
  }
}

module.exports = { DELIVERY_KIND, normalizeEvaCall, formatEvaSummary, deliverEvaCallSummary };
