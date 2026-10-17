"use strict";

const {
  test, assert, startServer, stopServer, loadAdminConfig, createAdminSession,
  createFetchStub, submitQuote, createOrderFromQuoteRequest,
} = require("./admin-route-helpers");

test("website series starts only after manager scheduling and duration saves keep the manual amount", async () => {
  const stub = createFetchStub([
    { method: "POST", match: "/contacts/", status: 200, body: { contact: { id: "confirmation-qa" } } },
  ]);
  const env = { ADMIN_MASTER_SECRET: "confirmation_pricing_test", GHL_API_KEY: "test", GHL_LOCATION_ID: "test", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry };
  const started = await startServer({ env });
  try {
    const session = await createAdminSession(started.baseUrl, loadAdminConfig(env));
    const cookie = `shynli_admin_session=${session}`;
    const requestId = "confirmation-pricing-test";
    const response = await submitQuote(started.baseUrl, {
      requestId, fullName: "Confirmation Pricing QA", phone: "6305550123",
      serviceType: "regular", frequency: "weekly", selectedDate: "2026-11-01",
      selectedTime: "10:00", fullAddress: "123 Main St, Naperville, IL 60540",
    });
    assert.equal(response.status, 201);
    const id = await createOrderFromQuoteRequest(started.baseUrl, session, requestId);
    async function post(fields) {
      const result = await fetch(`${started.baseUrl}/admin/orders`, {
        method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ entryId: id, ...fields }),
      });
      assert.equal(result.status, 303);
      assert.doesNotMatch(result.headers.get("location") || "", /failed|invalid/);
    }
    async function read() {
      return fetch(`${started.baseUrl}/admin/orders?order=${id}&q=Confirmation%20Pricing%20QA`, { headers: { cookie } }).then(r => r.text());
    }
    function count(html) {
      return Number((html.match(/Найдено (\d+) из \d+ заказов/) || [])[1]);
    }
    function field(html, name) {
      return (html.match(new RegExp(`name="${name}"[\\s\\S]*?value="([^"]*)"`)) || [])[1];
    }
    assert.equal(count(await read()), 1);
    await post({ totalPrice: "534" });
    // A combined save can normalize quote fields differently from the original payload.
    // Neither that nor an unchanged amount field may undo the manager's price.
    const quoteFields = {
      action: "update-order-with-quote-fields", quoteServiceType: "standard", quoteFrequency: "weekly",
      quoteRooms: "4", quoteBathrooms: "2.5", quoteSquareMeters: "1600",
      quoteSelectedDate: "2026-11-01", quoteSelectedTime: "10:00",
      quoteFullAddress: "123 Main St, Naperville, IL 60540",
    };
    for (const [index, priceFields] of [{ totalPrice: "534" }, {}].entries()) {
      await post({ ...quoteFields, ...priceFields, quoteRooms: String(4 + index),
        quoteFrequency: index ? "weekly" : "monthly", recurringEditScope: "future",
        serviceDurationHours: "5", serviceDurationMinutes: "15" });
      const html = await read();
      assert.equal(Number(field(html, "totalPrice")), 534);
      assert.equal(field(html, "serviceDurationHours"), "5");
      assert.equal(field(html, "serviceDurationMinutes"), "15");
      assert.equal(count(html), 1);
    }
    await post({ orderStatus: "scheduled" });
    const confirmed = await read();
    const seriesCount = count(confirmed);
    assert.ok(seriesCount > 20, `Expected weekly series, got ${seriesCount}`);
    await post({ orderStatus: "scheduled" });
    assert.equal(count(await read()), seriesCount);
    await post({ totalPrice: "540", serviceDurationHours: "4", serviceDurationMinutes: "45" });
    const edited = await read();
    assert.equal(Number(field(edited, "totalPrice")), 540);
    assert.equal(field(edited, "serviceDurationHours"), "4");
    assert.equal(field(edited, "serviceDurationMinutes"), "45");
  } finally {
    await stopServer(started.child);
    stub.cleanup();
  }
});
