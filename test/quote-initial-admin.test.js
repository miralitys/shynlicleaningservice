"use strict";
const { test, assert, startServer, stopServer, loadAdminConfig, createAdminSession } = require("./admin-route-helpers");
const { createFetchStub } = require("./server-test-helpers");
const { calculateQuotePricing } = require("../lib/quote-pricing");

test("initial metadata and dishwasher survive submission and admin editing without price or duration drift", async () => {
  const stub = createFetchStub([{ method: "POST", match: "/contacts/", status: 200, body: { contact: { id: "qa" } } }]);
  const env = { ADMIN_MASTER_SECRET: "initial_admin_test", GHL_API_KEY: "test", GHL_LOCATION_ID: "test", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const started = await startServer({ env });
  try {
    const cookie = "shynli_admin_session=" + await createAdminSession(started.baseUrl, loadAdminConfig(env));
    const pricing = calculateQuotePricing({ serviceType: "deep", rooms: 2, bathrooms: 2.5, services: ["doorsCleaning", "dishwasherCleaning"] });
    const response = await fetch(started.baseUrl + "/api/quote/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact: { fullName: "Initial Metadata QA", phone: "6305550123" }, quote: { ...pricing, initialCleaning: true, requestedFrequency: "every3weeks", selectedDate: "2026-11-01", selectedTime: "09:00", fullAddress: "123 Main St, Naperville, IL 60540", zipCode: "60540", consent: true } }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).pricing.totalPrice, pricing.totalPrice);
    const list = await fetch(started.baseUrl + "/admin/quote-ops", { headers: { cookie } }).then(r => r.text());
    const id = list.match(/data-quote-entry-id="([^"]+)"/)[1];
    async function post(path, fields) {
      return fetch(started.baseUrl + path, { method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
    }
    await post("/admin/quote-ops", { action: "create-order-from-request", entryId: id });
    async function read() { return fetch(started.baseUrl + "/admin/orders?order=" + id, { headers: { cookie } }).then(r => r.text()); }
    function verify(html) {
      assert.match(html, /value="dishwasherCleaning"\s+checked/);
      assert.match(html, /Initial Cleaning[\s\S]*?Yes/);
      assert.match(html, /Частота, выбранная клиентом[\s\S]*?Every 3 weeks/);
      assert.match(html, new RegExp('name="totalPrice"\\s+value="' + pricing.totalPrice + '(?:\\.00)?"'));
      const hours = html.match(/name="serviceDurationHours"[\s\S]*?value="([^"]*)"/)[1];
      const minutes = html.match(/name="serviceDurationMinutes"[\s\S]*?value="([^"]*)"/)[1];
      assert.equal(Number(hours) * 60 + Number(minutes), pricing.serviceDurationMinutes);
    }
    verify(await read());
    const fields = new URLSearchParams({ action: "update-order-quote-fields", entryId: id, quoteServiceType: "deep", quoteRooms: "2", quoteBathrooms: "2.5", quoteSquareMeters: "0", quoteHasPets: "no", quoteBasementCleaning: "no", quoteFullAddress: "123 Main St, Naperville, IL 60540", quoteSelectedDate: "2026-11-01", quoteSelectedTime: "09:00" });
    for (const service of pricing.services) fields.append("quoteServices", service);
    assert.equal((await post("/admin/orders", fields)).status, 303);
    verify(await read());
  } finally {
    await stopServer(started.child);
    stub.cleanup();
  }
});
