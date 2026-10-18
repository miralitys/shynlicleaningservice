"use strict";

const {
  test, assert, startServer, stopServer, loadAdminConfig, createAdminSession,
} = require("./admin-route-helpers");
const { calculateQuotePricing } = require("../lib/quote-pricing");

for (const action of ["update-order-quote-fields", "update-order-with-quote-fields"]) {
  test(`${action} preserves a manual amount across all quote parameter edits`, async () => {
    const env = { ADMIN_MASTER_SECRET: "manual_amount_regression" };
    const started = await startServer({ env });
    try {
      const session = await createAdminSession(started.baseUrl, loadAdminConfig(env));
      const cookie = `shynli_admin_session=${session}`;
      async function post(fields) {
        const form = new URLSearchParams();
        for (const [name, value] of Object.entries(fields)) {
          for (const item of Array.isArray(value) ? value : [value]) form.append(name, item);
        }
        const response = await fetch(`${started.baseUrl}/admin/orders`, {
          method: "POST", redirect: "manual",
          headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
          body: form,
        });
        assert.equal(response.status, 303);
        assert.doesNotMatch(response.headers.get("location") || "", /failed|invalid|required/);
        return response;
      }
      const created = await post({
        action: "create-manual-order", customerName: "Manual Amount QA",
        customerPhone: "6305550123", serviceType: "deep", totalPrice: "250",
        fullAddress: "123 Main St, Naperville, IL 60540",
        selectedDate: "2026-11-20", selectedTime: "08:00",
      });
      const entryId = new URL(created.headers.get("location"), started.baseUrl).searchParams.get("order");
      assert.ok(entryId);
      async function read() {
        const response = await fetch(`${started.baseUrl}/admin/orders?order=${entryId}&fragment=order-dialog`, {
          headers: { cookie },
        });
        assert.equal(response.status, 200);
        return response.text();
      }
      function amount(html) {
        const match = html.match(/name="totalPrice"\s+value="([^"]*)"/);
        assert.ok(match);
        return Number(match[1]);
      }
      const fields = {
        action, entryId, quoteServiceType: "deep", quoteFrequency: "",
        quoteRooms: "", quoteBathrooms: "1", quoteSquareMeters: "",
        quoteBasementCleaning: "yes", quoteInteriorWindowsWithTracks: "2",
        quoteServices: ["ovenCleaning", "baseboardCleaning", "doorsCleaning"],
        quoteFullAddress: "123 Main St, Naperville, IL 60540",
        quoteSelectedDate: "2026-11-20", quoteSelectedTime: "08:00",
      };
      assert.equal(calculateQuotePricing({
        serviceType: "deep", rooms: "", bathrooms: "1", squareMeters: "",
        basementCleaning: "yes", services: fields.quoteServices,
        quantityServices: { interiorWindowsWithTracks: 2 },
      }).totalPrice, 345);
      assert.equal(amount(await read()), 250);
      // The quote-only form sends neither the amount nor duration fields.
      await post(fields);
      let html = await read();
      assert.equal(amount(html), 250);
      assert.match(html, /name="quoteBathrooms"[^>]*value="1"/);
      assert.match(html, /name="quoteInteriorWindowsWithTracks" value="2"/);
      assert.match(html, /value="ovenCleaning"\s+checked/);

      for (const changes of [
        { quoteRooms: "4" },
        { quoteBathrooms: "2.5" },
        { quoteSquareMeters: "1600" },
        { quoteOffice: "2", quoteSunroom: "1", quoteFamilyRoom: "1", quoteLoft: "1" },
        { quoteHasPets: "dog" },
        { quoteBasementCleaning: "no" },
        { quoteServices: ["refrigeratorCleaning", "insideCabinets"], quoteRefrigeratorCondition: "notEmptied", quoteCabinetsCondition: "notEmptied" },
        { quoteInteriorWindowsWithTracks: "3", quoteSlidingDoorBothSides: "1", quoteBedLinenChange: "2" },
        { quoteServiceType: "standard", quoteFrequency: "monthly" },
        { quoteFrequency: "weekly" },
        { quoteServiceType: "move-out" },
        { quoteServiceType: "free-in-home-estimate" },
        { quoteServiceType: "deep" },
        { quoteAdditionalDetails: "Updated cleaning instructions" },
        { quoteFullAddress: "124 Main St, Naperville, IL 60540", quoteSelectedDate: "2026-11-21", quoteSelectedTime: "10:30" },
      ]) {
        Object.assign(fields, changes);
        await post(fields);
        assert.equal(amount(await read()), 250, JSON.stringify(changes));
      }
      html = await read();
      assert.match(html, /Updated cleaning instructions/);
      assert.match(html, /124 Main St/);
      assert.match(html, /name="quoteRooms"[^>]*value="4"/);
      assert.match(html, /name="quoteBathrooms"[^>]*value="2.5"/);

      await post({ ...fields, totalPrice: "275" });
      assert.equal(amount(await read()), 275);
      Object.assign(fields, { quoteRooms: "5" });
      await post(fields);
      assert.equal(amount(await read()), 275);

      for (const changes of [
        { serviceDurationHours: "3", serviceDurationMinutes: "30" },
        { selectedDate: "2026-11-22", selectedTime: "11:00" },
        { paymentStatus: "paid", paymentMethod: "invoice" },
        { orderStatus: "scheduled" },
      ]) {
        await post({ entryId, ...changes });
        assert.equal(amount(await read()), 275);
      }
      await post({ ...fields, totalPrice: "0" });
      assert.equal(amount(await read()), 0);
      await post({ ...fields, quoteRooms: "6" });
      assert.equal(amount(await read()), 0);
    } finally {
      await stopServer(started.child);
    }
  });
}
