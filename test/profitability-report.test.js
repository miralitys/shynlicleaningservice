"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("csv-parse/sync");
const { calculateProfitability } = require("../lib/profitability");
const { COLUMNS, withCustomerHistory, aggregate, buildSummary, rowValues } = require("../lib/profitability-report");
const { startPreview } = require("../scripts/preview-profitability");

function makeRow(id, date, clientKey, options = {}) {
  const order = { id, selectedDate: date, customerName: clientKey, serviceType: "standard", serviceLabel: "Standard", frequency: "weekly",
    orderStatus: "completed", orderStatusLabel: "Завершено", totalPrice: 300, serviceDurationMinutes: 120, ...options.order };
  const data = { paidCents: 30000, payouts: [{ staffId: "a", cents: 10000 }], ...options.data };
  const team = options.team || [{ id: "a", name: "Клинер А" }];
  return { order, clientKey, record: { data, version: 1 }, team, source: options.source || "google", metrics: calculateProfitability(order, data, team,
    { configured: true, suppliesCents: 500, fuelCents: 500 }) };
}

test("report classification uses complete customer history, not the selected period or canceled attempts", () => {
  const rows = withCustomerHistory([
    makeRow("future", "2026-11-10", "same"), makeRow("canceled", "2026-09-01", "same", { order: { orderStatus: "canceled" } }),
    makeRow("first", "2026-10-01", "same"), makeRow("other", "2026-10-05", "other"),
  ]);
  assert.equal(rows.find(row => row.order.id === "first").isNewCustomer, true);
  assert.equal(rows.find(row => row.order.id === "canceled").isNewCustomer, false);
  const november = buildSummary(rows.filter(row => row.order.selectedDate >= "2026-11-01"));
  assert.equal(november.sources[0].orders, 1);
  assert.equal(november.sources[0].newClients, 0);
  assert.equal(november.sources[0].acquisitionCostCents, null);
});

test("summary totals reconcile across months and sources, exclude canceled money, and weight margins by revenue", () => {
  const rows = withCustomerHistory([
    makeRow("a", "2026-10-01", "client-a"),
    makeRow("b", "2026-11-01", "client-a", { data: { paidCents: 10000 }, source: "referral", order: { serviceDurationMinutes: 60 } }),
    makeRow("c", "2026-10-20", "client-c", { data: { paidCents: 999999 }, order: { orderStatus: "canceled" } }),
    makeRow("d", "2026-11-03", "client-d", { data: { paidCents: 10000, payouts: [] }, order: { orderStatus: "rescheduled" } }),
  ]);
  const summary = buildSummary(rows);
  assert.equal(summary.totals.allOrders, 4);
  assert.equal(summary.totals.orders, 3);
  assert.equal(summary.totals.paidCents, 50000);
  assert.equal(summary.totals.profitCents, 18000);
  assert.equal(summary.totals.marginPercent, 45);
  assert.equal(summary.totals.profitPerHourCents, 6000);
  assert.equal(summary.totals.incomplete, 1);
  assert.equal(summary.totals.canceledPercent, 25);
  assert.equal(summary.totals.rescheduledPercent, 25);
  for (const groups of [summary.months, summary.sources, summary.types, summary.regularity]) {
    assert.equal(groups.reduce((sum, group) => sum + group.paidCents, 0), summary.totals.paidCents);
    assert.equal(groups.reduce((sum, group) => sum + group.profitCents, 0), summary.totals.profitCents);
  }
  assert.equal(summary.cleaners[0].orders, 3);
  assert.equal(summary.cleaners[0].paidCents, 50000);
  assert.equal(summary.cleaners[0].minutes, 300);
  assert.equal(aggregate([]).marginPercent, null);
  assert.equal(aggregate([]).profitPerHourCents, null);
  assert.equal(aggregate(withCustomerHistory([makeRow("no-hours", "2026-10-01", "no-hours", { order: { serviceDurationMinutes: 0 } }), rows[0]])).profitPerHourCents, null);
});

test("all 34 CSV columns agree with the report and keep more than three and retired cleaner payouts", () => {
  const row = withCustomerHistory([makeRow("a", "2026-10-01", "client-a", { team: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" }],
    data: { payouts: ["a", "b", "c", "d", "retired"].map(staffId => ({ staffId, cents: 1000 })), comment: "Проверка", paidAt: "2026-10-20", tipsPassed: true } })])[0];
  assert.equal(COLUMNS.length, 34);
  const values = Object.fromEntries(COLUMNS.map(([key], index) => [key, rowValues(row)[index]]));
  assert.equal(values.payout1, 10);
  assert.equal(values.payout2, 10);
  assert.match(values.payout3, /C: 10.00; D: 10.00; Ранее в команде \(retired\): 10.00/);
  assert.equal(values.payoutTotalCents, 50);
  assert.equal(values.teamCount, 4);
  assert.equal(values.tipsPassed, "Да");
  assert.equal(values.comment, "Проверка");
  assert.equal(values.paidAt, "2026-10-20");
  const cleaners = buildSummary([row]).cleaners;
  assert.equal(cleaners.reduce((sum, item) => sum + item.payoutCents, 0), 5000);
  assert.equal(cleaners.find(item => item.id === "retired").orders, 0);
  assert.equal(cleaners.find(item => item.id === "retired").paidCents, 0);
});

test("unentered historical payments are unknown debt, never invented arrears or confirmed profit", () => {
  const rows = withCustomerHistory([makeRow("unknown", "2026-10-01", "client-a", { data: { paidCents: null } }),
    makeRow("unpaid", "2026-10-02", "client-b", { data: { paidCents: 0 } })]);
  assert.equal(rows[0].metrics.debtCents, null);
  assert.equal(rowValues(rows[0])[32], "");
  const total = aggregate(rows);
  assert.equal(total.debtCents, 30000);
  assert.equal(total.unknownDebt, 1);
  assert.equal(total.knownDebt, 1);
});

test("full financial form, filters, CSV, summaries and history work without mutating a preview order", async () => {
  const preview = await startPreview();
  const id = "10000000-0000-4000-8000-000000000001";
  const url = `${preview.url}/admin/profitability`;
  const get = query => fetch(url + query);
  const post = fields => fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(fields) });
  try {
    const before = await (await get("?status=all&format=csv")).text();
    const initialCsv = parse(before, { bom: true });
    assert.equal(initialCsv[0].length, 34);
    assert.equal(initialCsv.length, 6);
    const html = await (await get("?status=all")).text();
    assert.equal((html.match(/<th scope="col">/g) || []).length, 34);
    for (const name of ["leadCost", "addons", "discount", "paymentMethod", "paidAt", "tips", "tipsPassed", "actualHours", "comment", "cleaner", "debt", "serviceType"]) assert.ok(html.includes(`name="${name}"`), name);
    const fields = { action: "update", entryId: id, version: "1", orderUpdatedAt: "2026-10-01T12:00:00Z", source: "google_lsa", paidAmount: "200", leadCost: "15", addons: "40", discount: "15",
      paymentMethod: "invoice", paidAt: "2026-10-20", tips: "25", tipsPassed: "yes", actualHours: "2.5", comment: '<script>alert("x")</script>',
      "payout:demo-cleaner-1": "60", "payout:demo-cleaner-2": "50" };
    const updated = await post(fields);
    assert.equal(updated.status, 200);
    const result = await updated.json();
    assert.equal(result.metrics.payableCents, 32500);
    assert.equal(result.metrics.expensesCents, 14280);
    assert.equal(result.metrics.profitCents, 5720);
    assert.equal(result.metrics.marginPercent, 28.6);
    assert.equal(result.metrics.profitPerHourCents, 2288);
    assert.equal(result.metrics.debtCents, 12500);
    assert.equal((await post(fields)).status, 409);
    for (const patch of [{ actualHours: "NaN" }, { actualHours: "169" }, { discount: "9999" }, { paidAt: "2026-02-30" }, { tipsPassed: "other" }]) {
      assert.equal((await post({ ...fields, version: "2", ...patch })).status, 400);
    }
    const csv = parse(await (await get("?status=all&format=csv")).text(), { bom: true });
    const entry = csv.find(row => row[0] === id);
    assert.equal(entry[10], "300", "original order price remains unchanged");
    assert.equal(entry[13], "325");
    assert.equal(entry[15], "200");
    assert.equal(entry[23], "110");
    assert.equal(entry[29], "57.2");
    assert.equal(entry[32], "125");
    const debt = await (await get("?debt=1")).text();
    assert.equal((debt.match(/data-profit-row=/g) || []).length, 1);
    assert.ok(debt.includes(`data-profit-row="${id}"`));
    assert.equal((await (await get("?source=referral&status=all")).text()).match(/data-profit-row=/g).length, 2);
    assert.equal((await (await get("?cleaner=demo-cleaner-2&status=all")).text()).match(/data-profit-row=/g).length, 1);
    const summary = await (await get("?view=summary")).text();
    for (const section of ["По месяцам", "По источникам", "По типам уборки", "Регулярные и разовые", "По клинерам", "Отмены и переносы по источникам", "Отмены и переносы по услугам"]) assert.ok(summary.includes(section));
    assert.match(summary, /Не заполнены|не заполнены/);
    const history = await (await get(`?history=${id}`)).text();
    assert.match(history, /Факт, ч: 2.5/);
    assert.match(history, /Чаевые переданы: да/);
    assert.ok(history.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
    assert.ok(!history.includes('<script>alert("x")</script>'));
  } finally { await preview.close(); }
});
