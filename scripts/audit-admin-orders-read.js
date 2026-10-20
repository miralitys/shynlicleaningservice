"use strict";

// Run in the configured server shell. Client records stay in process memory;
// only aggregate results are printed, and every network write is rejected.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");

function loadSource(source, filename, overrides = {}) {
  const module = { exports: {} };
  const baseRequire = createRequire(filename);
  const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name] : baseRequire(name);
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

async function auditOrdersRead({ projectionSource, clientSource }) {
  const root = process.cwd();
  const projection = loadSource(projectionSource, path.join(root, "lib/quote-ops/order-list.js"));
  const candidate = loadSource(clientSource, path.join(root, "lib/supabase-quote-ops.js"), {
    "./quote-ops/order-list": projection,
  });
  const config = candidate.loadSupabaseQuoteOpsConfig();
  assert.equal(config.configured, true, "Database connection is not configured");
  const origin = new URL(config.url).origin;
  const readStats = { requests: 0, writes: 0, fullBytes: 0, projectedBytes: 0 };
  const readOnlyFetch = async (url, options = {}) => {
    assert.equal(options.method || "GET", "GET", "Audit forbids network writes");
    assert.equal(new URL(url).origin, origin, "Audit forbids other destinations");
    assert.ok(new URL(url).pathname.startsWith("/rest/v1/"));
    readStats.requests++;
    const response = await fetch(url, options);
    const text = await response.text();
    const bucket = new URL(url).searchParams.get("select") === projection.ORDER_LIST_SELECT
      ? "projectedBytes" : "fullBytes";
    readStats[bucket] += Buffer.byteLength(text);
    return { ok: response.ok, status: response.status, headers: response.headers, text: async () => text };
  };
  const client = candidate.createSupabaseQuoteOpsClient({ config, fetch: readOnlyFetch });
  const headers = { apikey: config.serviceRoleKey, Prefer: "count=exact" };
  if (!candidate.isOpaqueSupabaseApiKey(config.serviceRoleKey)) headers.Authorization = `Bearer ${config.serviceRoleKey}`;

  async function fullSnapshot() {
    const rows = [];
    let cursor = "";
    for (;;) {
      const query = new URLSearchParams({ select: "*", order: "id.asc", limit: "500" });
      if (cursor) query.set("id", `gt.${cursor}`);
      const response = await readOnlyFetch(`${origin}/rest/v1/${config.tableName}?${query}`, { method: "GET", headers });
      assert.equal(response.ok, true, `Read failed: HTTP ${response.status}`);
      const page = JSON.parse(await response.text());
      assert.ok(Array.isArray(page));
      for (const row of page) {
        assert.ok(typeof row.id === "string" && row.id > cursor, "Invalid full-read cursor");
        cursor = row.id;
        rows.push(row);
      }
      const match = (response.headers.get("content-range") || "").match(/\/(\d+)$/);
      if (match && page.length === Number(match[1])) break;
      if (!page.length) {
        assert.equal(match, null, "Incomplete full read");
        break;
      }
    }
    return rows;
  }

  const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const sortEntries = entries => entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
  const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
  const { filterQuoteOpsEntries } = require("../lib/quote-ops/store");
  const domain = require("../lib/admin/domain").createAdminDomainHelpers({ normalizeString });
  const ui = require("../lib/admin/pages/orders-ui-primitives").createOrdersUiPrimitives({ normalizeString });
  const funnel = require("../lib/admin/pages/orders-funnel-ui").createOrdersFunnelUi({ normalizeString, normalizeOrderStatus: domain.normalizeOrderStatus });
  const visible = entries => filterQuoteOpsEntries(sortEntries(entries), {}, normalizeString);

  const before = await fullSnapshot();
  const full = visible(before.map(candidate.mapRowToEntry));
  const projected = visible(await client.fetchOrderListEntries());
  const staffClient = require("../lib/supabase-admin-staff").createSupabaseAdminStaffClient({ fetch: readOnlyFetch });
  const staff = await staffClient.fetchSnapshot();
  const after = await fullSnapshot();
  assert.equal(hash(before), hash(after), "Database changed during audit; repeat against a stable snapshot");
  const fullHash = hash(full);
  const sameSnapshotSlim = full.map(projection.projectOrderListEntry);
  const fullPlanning = domain.buildStaffPlanningContext(full, staff);
  const slimPlanning = domain.buildStaffPlanningContext(projected, staff);
  const decorate = (entries, planning) => domain.collectAdminOrderRecords(entries)
    .map(order => ui.decorateOrderForPlanning(order, planning.orderItemsByEntryId, []));
  const originalOrders = decorate(full, fullPlanning);
  const candidateOrders = decorate(projected, slimPlanning);
  const comparable = orders => orders.map(({ entry, planningItem, policyAcceptance, ...record }) => ({
    ...record,
    policyAcceptance: Object.fromEntries(["policyAccepted", "sentAt", "firstViewedAt", "lastViewedAt", "signedAt"].map(key => [key, policyAcceptance[key]])),
    funnelStatus: funnel.getOrderFunnelStatus({ ...record, policyAcceptance }),
  })).sort((a, b) => a.id.localeCompare(b.id));
  // PostgREST returns null for absent JSON paths; null and absent roots have
  // identical fallback semantics, unlike an explicitly empty canonical object.
  const payloads = entries => entries.map(entry => ({ id: entry.id,
    payload: Object.fromEntries(Object.entries(entry.payloadForRetry).filter(([, value]) => value != null)),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const actualPayloads = payloads(projected);
  const expectedPayloads = payloads(sameSnapshotSlim);
  if (!require("node:util").isDeepStrictEqual(actualPayloads, expectedPayloads)) {
    const differences = {};
    const expectedById = new Map(expectedPayloads.map(entry => [entry.id, entry.payload]));
    for (const entry of actualPayloads) {
      const expected = expectedById.get(entry.id) || {};
      for (const key of new Set([...Object.keys(expected), ...Object.keys(entry.payload)])) {
        if (!require("node:util").isDeepStrictEqual(expected[key], entry.payload[key])) differences[key] = (differences[key] || 0) + 1;
      }
    }
    console.log("ORDERS_READ_AUDIT_DIAGNOSTIC " + JSON.stringify({ actualRows: actualPayloads.length, expectedRows: expectedPayloads.length, differingRootCounts: differences }));
  }
  assert.deepEqual(actualPayloads, expectedPayloads, "Actual projected SQL differs from the same full snapshot projection");
  assert.deepEqual(comparable(candidateOrders), comparable(originalOrders), "Displayed order fields differ");
  let filterChecks = 0;
  const filters = [{}, ...["new", "scheduled", "canceled", "completed", "cleaning-complete", "paid", "rescheduled"].map(status => ({ status })),
    ...["standard", "deep", "move-in", "move-out", "free-in-home-estimate"].map(serviceType => ({ serviceType })),
    ...["weekly", "biweekly", "every3weeks", "monthly"].map(frequency => ({ frequency })),
    ...["assigned", "unassigned"].map(assignment => ({ assignment }))];
  for (const order of originalOrders) {
    for (const q of [order.customerName, order.customerPhone, order.requestId, order.fullAddress, order.assignedStaff]) {
      if (q) filters.push({ q });
    }
  }
  for (const filter of filters) {
    const ids = orders => domain.filterAdminOrderRecords(orders, filter).map(order => order.id).sort();
    assert.deepEqual(ids(candidateOrders), ids(originalOrders), "Filter/search result sets differ");
    filterChecks++;
  }
  const lookupUi = require("../lib/admin/pages/orders-ui-primitives").createOrdersUiPrimitives({
    normalizeString, buildOrdersReturnPath: value => value,
    escapeHtmlAttribute: value => String(value), escapeHtml: value => String(value),
    renderAdminPhoneInput: () => "", renderAdminSelectOptions: () => "",
    renderAdminPickerField: () => "", renderStaffAddressField: () => "",
  });
  const lookup = entries => {
    const html = lookupUi.renderCreateManualOrderForm({ clientRecords: domain.collectAdminClientRecords(entries) });
    return JSON.parse(html.match(/data-admin-manual-client-data>([\s\S]*?)<\/script>/)[1]);
  };
  const fullLookup = lookup(full);
  assert.deepEqual(lookup(projected), fullLookup, "Client lookup parameters differ");
  const detail = originalOrders.length ? await client.fetchEntryById(originalOrders[0].id) : null;
  if (detail) assert.deepEqual(detail, full.find(entry => entry.id === detail.id), "Full card read differs");
  assert.equal(hash(full), fullHash, "Audit mutated its in-memory reference");
  const counters = {};
  for (const order of originalOrders) counters[order.orderStatus] = (counters[order.orderStatus] || 0) + 1;
  console.log("ORDERS_READ_AUDIT " + JSON.stringify({
    checkedAt: new Date().toISOString(), ledgerRows: before.length, visibleLedgerRows: full.length,
    displayedOrders: originalOrders.length, uniqueOrders: new Set(candidateOrders.map(order => order.id)).size,
    orderIdsMatch: true, amountsMatch: true, teamsMatch: true, datesStatusesPaymentsFrequencyMatch: true,
    policyFunnelMatch: true, clientParametersMatch: true, fullDetailMatch: true,
    orderDisplayFingerprint: hash(comparable(originalOrders)), clientLookupFingerprint: hash(fullLookup),
    filterChecks, clientLookupRecords: fullLookup.length, counters, databaseUnchangedDuringAudit: true, ...readStats,
  }));
}

module.exports = { auditOrdersRead };

if (require.main === module) {
  const fs = require("node:fs");
  auditOrdersRead({
    projectionSource: fs.readFileSync(path.join(__dirname, "../lib/quote-ops/order-list.js"), "utf8"),
    clientSource: fs.readFileSync(path.join(__dirname, "../lib/supabase-quote-ops.js"), "utf8"),
  }).catch(() => { console.error("ORDERS_READ_AUDIT_FAILED: verification did not complete; no writes were allowed"); process.exitCode = 1; });
}
