"use strict";

// Isolated HTTP benchmark: generated clients only, no production credentials or requests.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("../test/admin-route-helpers");

async function benchmark() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-orders-bench-"));
  const rows = Array.from({ length: 360 }, (_, i) => {
    const order = { isCreated: true, status: "scheduled", assignedStaff: i % 2 ? "Cleaner One" : "Cleaner Two",
      paymentStatus: "unpaid", serviceDurationMinutes: 180,
      completion: { checklistItems: Array.from({ length: 12 }, (_, j) => ({ id: `item-${j}`, label: "Clean the room", completed: false })) },
      policyAcceptance: { policyAccepted: true, signatureDataUrl: `data:image/png;base64,${"x".repeat(2048)}` } };
    return { id: `order-${String(i).padStart(5, "0")}`, kind: "quote_submission", status: "success", request_id: `manual-${i}`,
      customer_name: `Test Client ${i}`, customer_phone: `630555${String(i).padStart(4, "0")}`, customer_email: `test-${i}@example.com`,
      source_route: "/admin/orders", service_type: "standard", total_price: 250 + i, selected_date: "2026-12-01", selected_time: "10:00",
      full_address: `${i + 1} Test Street`, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
      payload_for_retry: { orderState: order, adminOrder: order, calculatorData: { serviceType: "standard", bedrooms: 3, bathrooms: 2 },
        adminSms: { history: Array.from({ length: 40 }, (_, j) => ({ id: `sms-${j}`, message: "A synthetic booking message for a performance test. ".repeat(3) })) } } };
  });
  await fs.writeFile(path.join(root, "rows.json"), JSON.stringify(rows));
  const capture = path.join(root, "calls.ndjson");
  await fs.writeFile(capture, "");
  const stub = path.join(root, "fetch.cjs");
  await fs.writeFile(stub, `const fs = require('node:fs');
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root, "rows.json"))}, 'utf8'));
module.exports = async (url, options = {}) => {
  const u = new URL(url); const method = options.method || 'GET';
  if (method !== 'GET') throw new Error('Benchmark forbids external writes: ' + method + ' ' + u.pathname);
  let body = [], total = null;
  if (u.pathname.endsWith('/quote_ops_entries')) {
    body = rows.filter(row => !u.searchParams.has('id') || (u.searchParams.get('id').startsWith('gt.') ? row.id > u.searchParams.get('id').slice(3) : row.id === u.searchParams.get('id').slice(3)));
    total = body.length;
    const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || 1000);
    body = body.slice(offset, offset + limit);
    const select = u.searchParams.get('select');
    if (select && select !== '*') body = body.map(row => Object.fromEntries(select.split(',').map(field => {
      const [alias, expr] = field.includes(':') ? field.split(':') : [field, field];
      return [alias, expr.split('->').reduce((value, key) => value?.[key], row) ?? null];
    })));
  } else if (u.pathname.endsWith('/admin_staff')) body = [{ id: 'one', name: 'Cleaner One', role: 'cleaner', status: 'active' }, { id: 'two', name: 'Cleaner Two', role: 'cleaner', status: 'active' }];
  const text = JSON.stringify(body);
  fs.appendFileSync(${JSON.stringify(capture)}, JSON.stringify({ method, path: u.pathname, select: u.searchParams.get('select'), bytes: Buffer.byteLength(text) }) + '\\n');
  return { ok: true, status: 200, text: async () => text, json: async () => body,
    headers: { get: name => name === 'content-range' && options.headers?.Prefer === 'count=exact' && total !== null ? '0-' + Math.max(0, body.length - 1) + '/' + total : null } };
};`);
  const env = { ADMIN_MASTER_SECRET: "isolated_benchmark_only", SUPABASE_URL: "https://benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_benchmark_fake", SHYNLI_FETCH_STUB_ENTRY: stub,
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "9999999" };
  let started;
  try {
    started = await startServer({ env });
    const cookie = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const samples = [];
    for (let i = 0; i < 6; i++) {
      const before = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).length;
      const begin = performance.now();
      const response = await fetch(`${started.baseUrl}/admin/orders`, { headers: { cookie } });
      const headersMs = performance.now() - begin;
      const html = await response.text();
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const calls = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).slice(before).map(JSON.parse);
      samples.push({ headersMs: +headersMs.toFixed(1), totalMs: +(performance.now() - begin).toFixed(1),
        htmlBytes: Buffer.byteLength(html), externalReadBytes: calls.reduce((sum, call) => sum + call.bytes, 0), externalReads: calls.length,
        orders: (html.match(/<article\b[^>]*data-order-funnel-card="true"/g) || []).length, timing: response.headers.get("server-timing") });
    }
    const median = key => [...samples.slice(1)].sort((a, b) => a[key] - b[key])[2][key];
    console.log(JSON.stringify({ fixtureOrders: rows.length, first: samples[0], warmMedian: Object.fromEntries(
      ["headersMs", "totalMs", "htmlBytes", "externalReadBytes", "externalReads", "orders"].map(key => [key, median(key)])), samples }, null, 2));
  } finally {
    if (started) await stopServer(started.child);
    await fs.rm(root, { recursive: true, force: true });
  }
}

benchmark().catch(error => { console.error(error); process.exitCode = 1; });
