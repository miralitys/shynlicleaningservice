"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEvaCall, formatEvaSummary, deliverEvaCallSummary } = require("../lib/api/eva-call-summary");
const { HIDDEN_ENTRY_KINDS } = require("../lib/quote-ops/entry-kinds");
const body = { contact_id: "qa-contact", full_name: "TEST Eva", location: { id: "H3JoUqRWLxub6eauiC3S" },
  customData: { summary: "Customer requested deep cleaning. Manager callback needed.", callStartedAt: "2026-11-11T12:00:00Z", duration: "120" } };
const env = { SUPABASE_URL: "https://store.example", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEB_LEADS_TELEGRAM_BOT_TOKEN: "test-token", WEB_LEADS_TELEGRAM_CHAT_ID: "test-chat" };

test("stable per-call reservation; different calls remain independent", () => {
  const call = normalizeEvaCall(body);
  assert.equal(call.id, normalizeEvaCall(structuredClone(body)).id);
  assert.notEqual(call.id, normalizeEvaCall({ ...body, customData: { ...body.customData, callStartedAt: "2026-11-11T13:00:00Z" } }).id);
  assert.match(call.contactUrl, /contacts\/detail\/qa-contact$/);
  assert.ok(HIDDEN_ENTRY_KINDS.includes("admin_voice_ai_telegram_delivery"));
  assert.match(formatEvaSummary(call), /Manager callback needed/);
});

test("rejects missing and unresolved per-call data and another location", () => {
  for (const changed of [ { ...body, contact_id: "" }, { ...body, customData: { ...body.customData, callStartedAt: "{{phoneCall.startTime}}" } },
    { ...body, location: { id: "another-location" } }, { ...body, customData: { ...body.customData, summary: "" } } ]) {
    assert.throws(() => normalizeEvaCall(changed));
  }
});

test("concurrent retries send once, with no summary or phone stored in delivery metadata", async () => {
  let sends = 0;
  const records = new Map();
  const fetch = async (url, options) => {
    const row = JSON.parse(options.body);
    if (options.method === "PATCH") return { ok: true };
    assert.equal(row.kind, "admin_voice_ai_telegram_delivery");
    assert.equal(row.customer_phone, undefined);
    assert.equal(row.summary, undefined);
    if (records.has(row.id)) return { ok: false, status: 409, json: async () => ({ code: "23505" }) };
    records.set(row.id, row);
    return { ok: true, status: 201 };
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => deliverEvaCallSummary(body, {
    env, fetch, send: async text => { sends++; assert.match(text, /GHL: https:/); return { ok: true }; } })));
  assert.equal(sends, 1);
  assert.equal(results.filter(r => r.duplicate).length, 4);
});

test("uncertain delivery is reserved and never automatically resent", async () => {
  let claimed = false;
  let sends = 0;
  const fetch = async () => {
    if (claimed) return { ok: false, status: 409, json: async () => ({ code: "23505" }) };
    claimed = true;
    return { ok: true };
  };
  const options = { env, fetch, send: async () => { sends++; throw new Error("timeout"); } };
  assert.equal((await deliverEvaCallSummary(body, options)).uncertain, true);
  assert.equal((await deliverEvaCallSummary(body, options)).duplicate, true);
  assert.equal(sends, 1);
});

test("no send without durable reservation, configuration or after non-unique conflict", async () => {
  for (const options of [{ env: {} }, { env, fetch: async () => ({ ok: false, status: 503 }) },
    { env, fetch: async () => ({ ok: false, status: 409, json: async () => ({ code: "other" }) }) }]) {
    await assert.rejects(deliverEvaCallSummary(body, { ...options, send: async () => assert.fail("must not send") }));
  }
});

test("HTTP handler fails closed without a configured secret or with invalid authorization", async () => {
  const { createApiHandlers } = require("../lib/api/handlers");
  const previous = process.env.GHL_INBOUND_SMS_WEBHOOK_SECRET;
  let status;
  const api = createApiHandlers({ normalizeString: (v, n) => String(v || "").trim().slice(0, n),
    writeJsonWithTiming: (res, code) => { status = code; },
    readBufferBody: async () => Buffer.from("invalid json"), MAX_JSON_BODY_BYTES: 1000 });
  const invoke = req => api.handleEvaCallSummaryRequest(req, {}, 0n, {}, { log() {} });
  try {
    delete process.env.GHL_INBOUND_SMS_WEBHOOK_SECRET;
    await invoke({ method: "POST", headers: {} }); assert.equal(status, 401);
    process.env.GHL_INBOUND_SMS_WEBHOOK_SECRET = "qa-test-only";
    await invoke({ method: "POST", url: "/api/ghl/eva-call-summary", headers: {} }); assert.equal(status, 401);
    await invoke({ method: "GET", headers: {} }); assert.equal(status, 405);
    await invoke({ method: "POST", url: "/api/ghl/eva-call-summary", headers: { "x-ghl-webhook-secret": "qa-test-only" } });
    assert.equal(status, 400);
  } finally {
    if (previous === undefined) delete process.env.GHL_INBOUND_SMS_WEBHOOK_SECRET;
    else process.env.GHL_INBOUND_SMS_WEBHOOK_SECRET = previous;
  }
});
