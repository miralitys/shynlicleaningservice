"use strict";

// Intended for the configured server shell. No credentials/customer fields are
// printed, no network writes are allowed, and no application records are saved.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

async function auditAccountProjection({ clientModule, accountModule } = {}) {
  const clientApi = clientModule || require("../lib/supabase-quote-ops");
  const accountApi = accountModule || require("../lib/account/order-list");
  const { hydrateOrderListRow } = require("../lib/quote-ops/order-list");
  const config = clientApi.loadSupabaseQuoteOpsConfig();
  assert.ok(config.configured);
  const origin = new URL(config.url).origin;
  const headers = { apikey: config.serviceRoleKey };
  if (!clientApi.isOpaqueSupabaseApiKey(config.serviceRoleKey)) headers.Authorization = `Bearer ${config.serviceRoleKey}`;
  const requests = [];
  const read = async (url, options = {}) => {
    assert.equal(options.method || "GET", "GET");
    assert.equal(new URL(url).origin, origin);
    assert.ok(new URL(url).pathname.startsWith("/rest/v1/"));
    const response = await fetch(url, options);
    const body = await response.text();
    requests.push({ table: new URL(url).pathname.split("/").pop(), bytes: Buffer.byteLength(body), status: response.status });
    return { ok: response.ok, status: response.status, headers: response.headers, text: async () => body };
  };
  const allRows = async table => {
    let cursor = "";
    const rows = [];
    for (;;) {
      const query = new URLSearchParams({ select: "*", order: "id.asc", limit: "200" });
      if (cursor) query.set("id", `gt.${cursor}`);
      const response = await read(`${origin}/rest/v1/${table}?${query}`, { method: "GET", headers });
      assert.equal(response.ok, true);
      const page = JSON.parse(await response.text());
      assert.ok(Array.isArray(page));
      if (!page.length) return rows;
      for (const row of page) { assert.ok(row.id > cursor); cursor = row.id; rows.push(row); }
    }
  };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const hash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
  const select = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key] ?? null]));
  const integrity = rows => rows.map(row => ({
    ...select(row, ["id", "kind", "total_price", "total_price_cents", "selected_date", "selected_time", "customer_name", "full_address"]),
    states: ["orderState", "adminOrder"].map(key => select(row.payload_for_retry?.[key],
      ["status", "assignedStaff", "assignee", "selectedDate", "selectedTime", "frequency", "serviceDurationMinutes", "payrollOverrides", "payroll"])),
    assignment: row.payload_for_retry?.assignment ?? null,
    staffPay: select(row.payload_for_retry?.staff, ["id", "compensationType", "compensationValue"]),
  }));
  const before = await allRows(config.tableName);
  const profitabilityBefore = await allRows("profitability_records");
  const staff = await require("../lib/supabase-admin-staff").createSupabaseAdminStaffClient({ fetch: read }).fetchSnapshot();
  const assignedIds = [...new Set(staff.assignments.map(record => record.entryId))];
  const existing = new Map(before.map(row => [row.id, row]));
  const expected = assignedIds.filter(id => existing.has(id)).map(id => {
    const row = existing.get(id);
    const selected = Object.fromEntries(accountApi.ACCOUNT_LIST_SELECT.split(",").map(field => {
      const [alias, expression = alias] = field.split(":");
      return [alias, expression.split("->").reduce((value, key) => value?.[key], row) ?? null];
    }));
    return accountApi.projectAccountListEntry(clientApi.mapRowToEntry(hydrateOrderListRow(selected)));
  }).sort((a, b) => a.id.localeCompare(b.id));
  const listStart = requests.length;
  const projected = (await clientApi.createSupabaseQuoteOpsClient({ config, fetch: read }).fetchAccountEntriesByIds(assignedIds))
    .sort((a, b) => a.id.localeCompare(b.id));
  const listRequests = requests.slice(listStart);
  if (!isDeepStrictEqual(projected, expected)) throw new Error("Account summary parity check failed");
  const { createAdminDomainHelpers } = require("../lib/admin/domain");
  const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
  const planning = createAdminDomainHelpers({ normalizeString }).buildStaffPlanningContext(projected, staff);
  const { getEntryOrderState } = require("../lib/admin-order-state");
  const { getEntryPayrollData, calculateStaffPayrollItem, collectPayrollRecords } = require("../lib/payroll");
  const staffChecks = staff.staff.map(person => {
    const orders = planning.orderItems.filter(item => item.assignedStaff.some(record => record.id === person.id));
    const earnings = orders.map(item => {
      const saved = getEntryPayrollData(item.entry).items.find(record => record.staffId === person.id);
      const override = getEntryOrderState(item.entry).payrollOverrides || {};
      const calculated = saved || calculateStaffPayrollItem(item.entry, person, {
        teamSize: item.assignment?.staffIds?.length || 1, fixedOverrideValue: override[person.id],
      });
      const amount = saved || calculated && (Number(calculated.amountCents) > 0 || Object.hasOwn(override, person.id))
        ? Math.max(0, Number(calculated.amountCents) || 0) : null;
      return [item.entry.id, amount];
    }).sort((a, b) => a[0].localeCompare(b[0]));
    return { staffId: person.id, orders: orders.length, idsHash: hash(orders.map(item => item.entry.id).sort()),
      earningsHash: hash(earnings), unknownEarnings: earnings.filter(([, amount]) => amount === null).length,
      payrollHash: hash(collectPayrollRecords({ entries: projected, staffId: person.id })) };
  });
  const after = await allRows(config.tableName);
  const profitabilityAfter = await allRows("profitability_records");
  assert.equal(hash(integrity(before)), hash(integrity(after)), "Financial/team/date fields changed during the audit");
  assert.equal(hash(profitabilityBefore), hash(profitabilityAfter));
  const result = { checkedAt: new Date().toISOString(), commit: process.env.RENDER_GIT_COMMIT,
    ledgerRows: before.length, quoteRows: before.filter(row => row.kind === "quote_submission").length,
    financialTeamDatesHash: hash(integrity(before)), profitabilityRows: profitabilityBefore.length,
    profitabilityHash: hash(profitabilityBefore), assignedExistingOrders: projected.length,
    summaryParity: true, databaseUnchangedDuringAudit: true,
    listBytes: listRequests.reduce((sum, row) => sum + row.bytes, 0),
    listRequests: listRequests.map(row => ({ table: row.table, status: row.status })), staffChecks };
  console.log("ACCOUNT_PROJECTION_AUDIT " + JSON.stringify(result));
  return result;
}

module.exports = { auditAccountProjection };
if (require.main === module) auditAccountProjection().catch(() => {
  console.error("ACCOUNT_PROJECTION_AUDIT_FAILED: read-only verification did not complete"); process.exitCode = 1;
});
