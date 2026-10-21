"use strict";

// Local-only interactive preview. Uses synthetic orders and a temporary finance
// file, never the configured Supabase connection, users, or notification jobs.
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createProfitabilityStore } = require("../lib/profitability-store");
const { createProfitabilityHandler } = require("../lib/admin/handlers-profitability");
const { createAdminSharedRenderers } = require("../lib/admin/render-shared");
const { createRequestHelpers } = require("../lib/http/request");
const { createTimingHelpers } = require("../lib/http/timing");
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

async function startPreview({ access = { authorized: true, role: "admin", source: "admin-session", user: null } } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-profit-preview-"));
  const env = { PROFITABILITY_ENABLED: "1", PROFITABILITY_ALLOWED_USER_IDS: "preview-tonya,preview-nastya", PROFITABILITY_STORE_PATH: path.join(root, "finances.json") };
  const store = createProfitabilityStore({ env });
  const staff = [{ id: "demo-cleaner-1", name: "Клинер 1", status: "active" }, { id: "demo-cleaner-2", name: "Клинер 2", status: "active" }];
  const entries = [
    { id: "10000000-0000-4000-8000-000000000001", customerName: "Пример: разовая уборка", totalPrice: 300, serviceType: "deep", selectedDate: "2026-10-18", state: { status: "completed", serviceDurationMinutes: 180 } },
    { id: "10000000-0000-4000-8000-000000000002", customerName: "Пример: регулярная уборка", totalPrice: 250, serviceType: "standard", selectedDate: "2026-10-20", state: { status: "scheduled", frequency: "biweekly", serviceDurationMinutes: 180 } },
    { id: "10000000-0000-4000-8000-000000000003", customerName: "Пример: отменённая уборка", totalPrice: 240, serviceType: "standard", selectedDate: "2026-10-24", state: { status: "canceled", serviceDurationMinutes: 150 } },
    { id: "10000000-0000-4000-8000-000000000004", customerName: "Пример: регулярная уборка", totalPrice: 250, serviceType: "standard", selectedDate: "2026-11-03", state: { status: "scheduled", frequency: "biweekly", serviceDurationMinutes: 180 } },
    { id: "10000000-0000-4000-8000-000000000005", customerName: "Пример: перенесённая уборка", totalPrice: 320, serviceType: "deep", selectedDate: "2026-10-28", state: { status: "rescheduled", serviceDurationMinutes: 180 } },
  ].map((item, index) => ({ ...item, kind: "quote_submission", status: "success", requestId: `demo-order-${index + 1}`, createdAt: "2026-10-01T12:00:00Z",
    customerPhone: `630555010${index === 3 ? 1 : index}`, customerEmail: `demo${index === 3 ? 1 : index}@example.test`, fullAddress: "Тестовый адрес", selectedTime: "09:00",
    payloadForRetry: { orderState: { ...item.state, isCreated: true, assignedStaff: index === 0 ? "Клинер 1, Клинер 2" : "Клинер 1" }, calculatorData: {} } }));
  const snapshot = { staff, assignments: entries.map((entry, index) => ({ id: `assignment-${index}`, entryId: entry.id,
    staffIds: index === 0 ? staff.map(person => person.id) : [staff[0].id], status: index === 2 ? "canceled" : "planned", scheduleDate: entry.selectedDate, scheduleTime: "09:00" })) };
  const actor = { id: "demo", name: "Тестовые данные" };
  await store.save("settings", { suppliesCents: 500, fuelCents: 700, cardFeeBasisPoints: 290, configured: true }, 0, actor);
  await store.save(entries[0].id, { source: "google_lsa", paidCents: 30000, paymentMethod: "invoice", leadCostCents: 1000,
    payouts: [{ staffId: staff[0].id, cents: 8000 }, { staffId: staff[1].id, cents: 7000 }] }, 0, actor);
  await store.save(entries[1].id, { source: "referral", paidCents: 25000, payouts: [{ staffId: staff[0].id, cents: 10000 }] }, 0, actor);
  await store.save(entries[2].id, { source: "website", paidCents: 0, payouts: [{ staffId: staff[0].id, cents: 0 }] }, 0, actor);
  await store.save(entries[3].id, { source: "referral" }, 0, actor);
  await store.save(entries[4].id, { source: "nextdoor" }, 0, actor);
  const shared = createAdminSharedRenderers({ ADMIN_APP_NAV_ITEMS: [{ path: "/admin", label: "Дашборд" }, { path: "/admin/orders", label: "Заказы" }, { path: "/admin/clients", label: "Клиенты" }],
    ADMIN_LOGOUT_PATH: "/admin/logout", escapeHtml, escapeHtmlAttribute: escapeHtml, escapeHtmlText: escapeHtml });
  const handle = createProfitabilityHandler({ store, shared, env, escapeHtml,
    ...createRequestHelpers({ MAX_JSON_BODY_BYTES: 100000, normalizeString: (value, max = 500) => String(value || "").slice(0, max) }),
    ...createTimingHelpers() });
  const ledger = { listOrderListEntries: async () => structuredClone(entries) };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") { res.writeHead(302, { Location: "/admin/profitability?status=all" }); res.end(); return; }
    if (url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (["/js/admin-quote-pricing.js", "/js/cleaning-pricing.js", "/fonts/montserrat-latin-300-800.woff2", "/fonts/playfair-display-latin-400-900.woff2"].includes(url.pathname)) {
      res.writeHead(200, { "Content-Type": url.pathname.endsWith(".js") ? "application/javascript" : "font/woff2" });
      res.end(await fs.readFile(path.join(__dirname, "..", url.pathname))); return;
    }
    const handled = await handle({ req, res, requestStartNs: process.hrtime.bigint(),
      currentUserAccess: access, quoteOpsLedger: ledger, staffStore: { getSnapshot: async () => structuredClone(snapshot) } });
    if (!handled) { res.writeHead(404); res.end("Local preview: /admin/profitability"); }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.PROFITABILITY_PREVIEW_PORT || 0), "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Profitability preview (synthetic data only): ${url}`);
  return { url, server, async close() { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); } };
}

module.exports = { startPreview };
if (require.main === module) startPreview().then(preview => {
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await preview.close(); process.exit(0); });
}).catch(error => { console.error(error.message); process.exitCode = 1; });
