"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApiHandlers } = require("../lib/api/handlers");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { createAdminOrdersRecurringHelpers } = require("../lib/admin/handlers-orders-recurring");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { calculateQuotePricing } = require("../lib/quote-pricing");
const { getEntryOrderState, hasEntryOrderState } = require("../lib/admin-order-state");
const { createFetchStub, startServer, stopServer } = require("./server-test-helpers");
const { loadAdminConfig, createAdminSession, getQuoteOpsEntryId, getOrderFunnelLaneSlice } = require("./admin-route-helpers");

const normalizeString = (value, max = 500) => String(value ?? "").trim().slice(0, max);

function createIntake({ crmFailure = false, initFailure = false } = {}) {
  const domain = createAdminDomainHelpers({
    normalizeString, ADMIN_ORDERS_PATH: "/admin/orders", ORDER_ASSIGNMENT_VALUES: [],
    getRequestUrl: () => new URL("https://example.com/admin/orders"),
  });
  const inserted = [];
  const ledger = createQuoteOpsStore({
    QUOTE_OPS_LEDGER_LIMIT: 1000, env: {}, normalizeString,
    ...domain,
    orderStore: { async upsertEntry(entry) { inserted.push(structuredClone(entry)); } },
  });
  const handlers = createApiHandlers({
    QUOTE_PUBLIC_PATH: "/quote2", QUOTE_PUBLIC_PATHS: ["/quote2"],
    SITE_ORIGIN: "https://example.com", QUOTE_SUBMIT_ENDPOINT: "/api/quote/submit",
    normalizeString, calculateQuotePricing, applyOrderEntryUpdates: domain.applyOrderEntryUpdates,
    enforcePostRateLimit: () => false, readJsonBody: async req => req.body,
    createQuoteToken: () => "test-quote-token",
    listLeadManagers: async () => [{ id: "ramina", name: "Ramina", email: "manager@example.com" }],
    getLeadConnectorClient() {
      if (initFailure) throw new Error("Test CRM not configured");
      return { async submitQuoteSubmission() {
        return crmFailure ? { ok: false, status: 502, code: "CRM_UNAVAILABLE", retryable: true }
          : { ok: true, status: 201, contactId: "same-client", usedExistingContact: true };
      } };
    },
    writeJsonWithTiming(res, status, body) { res.status = status; res.body = body; },
  });
  async function submit({ requestId = "website-request", quote = {}, body = {} } = {}) {
    const req = { method: "POST", headers: { "x-request-id": requestId }, body: {
      contact: { fullName: "Website Client", phone: "6305550100", email: "client@example.com" },
      quote: { serviceType: "regular", rooms: 4, bathrooms: 2.5, squareMeters: 2600,
        frequency: "weekly", selectedDate: "2099-11-01", selectedTime: "09:00",
        fullAddress: "123 Main St, Naperville, IL 60540", zipCode: "60540",
        services: ["ovenCleaning"], quantityServices: { interiorWindowsCleaning: 3 },
        additionalDetails: "Call on arrival", consent: true, ...quote },
      ...body,
    } };
    const res = {};
    await handlers.handleQuoteSubmissionRequest(req, res, 0n, {}, { log() {} }, ledger);
    return res;
  }
  return { domain, ledger, inserted, submit };
}

test("website submissions persist a complete New order immediately, with manager and contact task", async () => {
  const { submit, ledger, inserted } = createIntake();
  const response = await submit();
  assert.equal(response.status, 201);
  const [entry] = await ledger.listEntries();
  const order = getEntryOrderState(entry);
  assert.equal(hasEntryOrderState(entry), true);
  assert.equal(order.status, "new");
  assert.equal(order.isCreated, true);
  assert.equal(order.paymentStatus, "unpaid");
  assert.equal(order.managerConfirmationRequired, true);
  assert.equal(order.managerConfirmedAt, undefined);
  assert.equal(order.frequency, "weekly");
  assert.equal(order.recurringNextEntryId, undefined);
  assert.equal(entry.totalPrice, response.body.pricing.totalPrice);
  assert.equal(order.totalPrice, response.body.pricing.totalPrice);
  assert.equal(entry.selectedDate, "2099-11-01");
  assert.equal(entry.selectedTime, "09:00");
  const calculator = entry.payloadForRetry.calculatorData;
  assert.equal(calculator.rooms, 4);
  assert.equal(calculator.bathrooms, 2.5);
  assert.equal(calculator.squareMeters, calculateQuotePricing({ squareMeters: 2600 }).squareMeters);
  assert.equal(calculator.quantityServices.interiorWindowsCleaning, 3);
  assert.equal(calculator.additionalDetails, "Call on arrival");
  assert.ok(calculator.services.includes("ovenCleaning"));
  assert.equal(entry.payloadForRetry.adminLead.managerId, "ramina");
  assert.ok(entry.payloadForRetry.adminLead.tasks.some(task => task.kind === "contact-client" && task.status === "open"));
  assert.equal(getEntryOrderState(inserted[0]).status, "new", "first persistence already contains the order");
});

test("another submission from the same client cannot overwrite a confirmed or manually priced order or old history", async () => {
  const { submit, ledger } = createIntake();
  const oldLead = await ledger.recordSubmission({ ok: true, requestId: "old-history", customerPhone: "6305550100",
    totalPrice: 534, payloadForRetry: { adminLead: { status: "declined", notes: "Historic request" } } });
  await submit({ requestId: "first" });
  const first = (await ledger.listEntries()).find(entry => entry.requestId === "first");
  await ledger.updateOrderEntry(first.id, { totalPrice: 534, orderStatus: "scheduled",
    managerConfirmedAt: "2026-10-20T20:00:00.000Z", assignedStaff: "Zilola" });
  const before = structuredClone(await ledger.getEntry(first.id));
  const oldBefore = structuredClone(oldLead);
  const response = await submit({ requestId: "second", quote: { rooms: 2, frequency: "monthly", selectedDate: "2099-12-02" } });
  assert.equal(response.status, 201);
  const entries = await ledger.listEntries();
  const second = entries.find(entry => entry.requestId === "second");
  assert.notEqual(first.id, second.id);
  assert.equal(getEntryOrderState(second).status, "new");
  assert.equal(getEntryOrderState(second).frequency, "monthly");
  assert.equal(second.totalPrice, response.body.pricing.totalPrice);
  assert.notEqual(second.totalPrice, 534);
  assert.deepEqual(await ledger.getEntry(first.id), before);
  assert.deepEqual(await ledger.getEntry(oldLead.id), oldBefore);
  assert.equal(entries.length, 3);
});

test("an unconfirmed repeat request does not close tasks on an existing order", async () => {
  const { submit, ledger } = createIntake();
  const prior = await ledger.recordSubmission({ ok: true, requestId: "completed-order", customerPhone: "6305550100",
    payloadForRetry: { orderState: { status: "completed" }, adminLead: { status: "completed", tasks: [{
      id: "next-cleaning", kind: "post-completion-followup", status: "open", title: "Next cleaning",
      dueAt: "2026-10-21T15:00:00.000Z",
    }] } } });
  const before = structuredClone(prior);
  await submit();
  assert.deepEqual(await ledger.getEntry(prior.id), before);
});

test("callback requests also create New orders without inventing a schedule or recurring series", async () => {
  const { submit, ledger } = createIntake();
  const response = await submit({ body: { requestType: "call_me", quote: { requestType: "call_me", frequency: "weekly" } } });
  assert.equal(response.status, 201);
  const [entry] = await ledger.listEntries();
  assert.equal(hasEntryOrderState(entry), true);
  assert.equal(getEntryOrderState(entry).status, "new");
  assert.equal(getEntryOrderState(entry).frequency, "");
  assert.equal(getEntryOrderState(entry).serviceDurationMinutes, 0);
  assert.equal(entry.serviceName, "Callback Request");
  assert.equal(entry.totalPrice, 0);
  assert.equal(entry.selectedDate, "");
  assert.equal(entry.selectedTime, "");
});

for (const mode of ["crmFailure", "initFailure"]) {
  test(`a ${mode} keeps the website order in New for the manager`, async () => {
    const { submit, ledger } = createIntake({ [mode]: true });
    const response = await submit();
    assert.equal(response.status, mode === "initFailure" ? 503 : 502);
    const [entry] = await ledger.listEntries();
    assert.equal(entry.status, "error");
    assert.equal(getEntryOrderState(entry).status, "new");
    assert.equal(getEntryOrderState(entry).managerConfirmationRequired, true);
  });
}

for (const frequency of ["weekly", "biweekly", "every3weeks", "monthly"]) {
  test(`${frequency} website orders generate a series only after manager confirmation`, async () => {
    const { submit, ledger, domain } = createIntake();
    await submit({ quote: { frequency } });
    const [source] = await ledger.listEntries();
    const helpers = createAdminOrdersRecurringHelpers({ ...domain, getEntryOrderState, normalizeString });
    const staffStore = { async getSnapshot() { return { assignments: [] }; } };
    assert.deepEqual(await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: source, staffStore }), []);
    assert.equal((await ledger.listEntries()).length, 1);
    await ledger.updateOrderEntry(source.id, { orderStatus: "scheduled" });
    assert.deepEqual(await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: source, staffStore }), []);
    assert.equal((await ledger.listEntries()).length, 1, "scheduled alone is not manager approval");
    await ledger.updateOrderEntry(source.id, { managerConfirmedAt: "2026-10-20T20:00:00.000Z" });
    const created = await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: source, staffStore });
    assert.ok(created.length > 0);
    const count = (await ledger.listEntries()).length;
    await helpers.ensureRecurringOrderSeries({ quoteOpsLedger: ledger, sourceEntry: source, staffStore });
    assert.equal((await ledger.listEntries()).length, count);
    assert.equal((await ledger.getEntry(source.id)).totalPrice, source.totalPrice);
  });
}

test("HTTP intake goes straight to New orders; repeat requests preserve the original price and manager approval starts the series", async () => {
  const stub = createFetchStub([
    { method: "GET", match: "/contacts/", status: 200, body: { contacts: [] } },
    { method: "POST", match: "/contacts/", status: 200, body: { contact: { id: "same-client-http" } } },
  ]);
  const env = { ADMIN_MASTER_SECRET: "website_order_http_test", GHL_API_KEY: "test", GHL_LOCATION_ID: "test",
    GHL_ENABLE_NOTES: "0", GHL_CREATE_OPPORTUNITY: "0", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const started = await startServer({ env });
  try {
    const session = await createAdminSession(started.baseUrl, loadAdminConfig(env));
    const cookie = `shynli_admin_session=${session}`;
    const headers = { cookie };
    async function submit(requestId, rooms, endpoint = "/api/quote/submit") {
      const response = await fetch(started.baseUrl + endpoint, {
        method: "POST", headers: { "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ contact: { fullName: "Website HTTP Client", phone: "6305550188" },
          quote: { serviceType: "regular", frequency: "biweekly", rooms, bathrooms: 2, squareMeters: 2,
            selectedDate: "2099-11-01", selectedTime: "09:00", fullAddress: "123 Main St, Naperville, IL 60540",
            zipCode: "60540", consent: true } }),
      });
      assert.equal(response.status, 201);
      return response.json();
    }
    const firstPrice = (await submit("http-first", 4)).pricing.totalPrice;
    const id = await getQuoteOpsEntryId(started.baseUrl, session, "http-first");
    const readOrders = async (query = "", orderId = "") => {
      const response = await fetch(`${started.baseUrl}/admin/orders?q=${encodeURIComponent(query)}&order=${encodeURIComponent(orderId)}`, { headers });
      assert.equal(response.status, 200);
      return response.text();
    };
    const firstPage = await readOrders("http-first", id);
    assert.ok(getOrderFunnelLaneSlice(firstPage, "new", "policy").includes(id));
    assert.match(firstPage, new RegExp(`name="totalPrice"\\s+value="${firstPrice.toFixed(2)}"`));
    const post = async fields => fetch(started.baseUrl + "/admin/orders", {
      method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ entryId: id, ...fields }),
    });
    assert.equal((await post({ totalPrice: "534" })).status, 303);
    const secondPrice = (await submit("http-second", 2, "/api/quote/request")).pricing.totalPrice;
    const secondId = await getQuoteOpsEntryId(started.baseUrl, session, "http-second");
    assert.notEqual(secondId, id);
    const originalPage = await readOrders("http-first", id);
    assert.match(originalPage, /name="totalPrice"\s+value="534\.00"/);
    assert.ok(getOrderFunnelLaneSlice(originalPage, "new", "policy").includes(id));
    const repeatPage = await readOrders("http-second", secondId);
    assert.ok(getOrderFunnelLaneSlice(repeatPage, "new", "policy").includes(secondId));
    assert.match(repeatPage, new RegExp(`name="totalPrice"\\s+value="${secondPrice.toFixed(2)}"`));
    const beforeConfirm = await readOrders("Website HTTP Client");
    assert.equal(new Set([...beforeConfirm.matchAll(/data-order-entry-id="([^"]+)"/g)].map(match => match[1])).size, 2);
    assert.equal((await post({ orderStatus: "scheduled" })).status, 303);
    const afterConfirm = await readOrders("Website HTTP Client");
    assert.ok(new Set([...afterConfirm.matchAll(/data-order-entry-id="([^"]+)"/g)].map(match => match[1])).size > 2);
    const repeatAfterConfirm = await readOrders("http-second");
    assert.ok(getOrderFunnelLaneSlice(repeatAfterConfirm, "new", "policy").includes(secondId));
  } finally {
    await stopServer(started.child);
    stub.cleanup();
  }
});
