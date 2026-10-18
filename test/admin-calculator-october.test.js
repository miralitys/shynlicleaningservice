"use strict";
const {
  test,
  assert,
  startServer,
  stopServer,
  loadAdminConfig,
  createAdminSession,
} = require("./admin-route-helpers");

test("admin updates estimates for changed rooms and extras without replacing agreed amounts", async () => {
  const env = { ADMIN_MASTER_SECRET: "calculator_test_secret" };
  const started = await startServer({ env });
  try {
    const cookie =
      "shynli_admin_session=" +
      (await createAdminSession(started.baseUrl, loadAdminConfig(env)));
    async function post(fields) {
      return fetch(started.baseUrl + "/admin/orders", {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        body: new URLSearchParams(fields),
      });
    }
    const created = await post({
      action: "create-manual-order",
      customerName: "Calculator Customer",
      customerPhone: "6305550123",
      fullAddress: "123 Main St, Naperville, IL 60540",
      serviceType: "standard",
      selectedDate: "2026-11-01",
      selectedTime: "09:00",
      frequency: "biweekly",
      totalPrice: "200",
    });
    assert.equal(created.status, 303);
    const id = new URL(
      created.headers.get("location"),
      started.baseUrl,
    ).searchParams.get("order");
    assert.ok(id);
    const fields = {
      action: "update-order-quote-fields",
      entryId: id,
      returnTo: "/admin/orders?order=" + id,
      quoteServiceType: "standard",
      quoteFrequency: "biweekly",
      quoteRooms: "2",
      quoteBathrooms: "1",
      quoteSquareMeters: "0",
      quoteHasPets: "dog",
      quoteBasementCleaning: "no",
      quoteOffice: "2",
      quoteRefrigeratorCondition: "notEmptied",
      quoteServices: "refrigeratorCleaning",
      quoteInteriorWindowsWithTracks: "2",
      quoteSlidingDoorBothSides: "1",
      quoteChandelierCleaning: "1",
      quoteFullAddress: "123 Main St, Naperville, IL 60540",
      quoteSelectedDate: "2026-11-01",
      quoteSelectedTime: "09:00",
    };
    assert.equal((await post(fields)).status, 303);
    async function html() {
      return (
        await fetch(started.baseUrl + "/admin/orders?order=" + id, {
          headers: { cookie },
        })
      ).text();
    }
    let page = await html();
    assert.match(page, /name="totalPrice"\s+value="200(?:\.00)?"/);
    assert.match(page, /name="serviceDurationHours"[\s\S]*?value="5"/);
    assert.match(page, /name="quoteOffice" value="2"/);
    assert.match(page, /name="quoteInteriorWindowsWithTracks" value="2"/);
    assert.match(
      page,
      /name="quoteRefrigeratorCondition"[\s\S]*?value="notEmptied" selected/,
    );
    assert.equal(
      (await post({ ...fields, quoteRooms: "3", totalPrice: "333" })).status,
      303,
    );
    page = await html();
    assert.match(page, /name="totalPrice"\s+value="333(?:\.00)?"/);
    // The manual payment amount must not shorten the undiscounted estimate ($409).
    assert.match(page, /name="serviceDurationHours"[\s\S]*?value="5"/);
    assert.equal(
      (
        await post({
          ...fields,
          quoteRooms: "3",
          quoteFullAddress: "124 Main St, Naperville, IL 60540",
        })
      ).status,
      303,
    );
    page = await html();
    assert.match(page, /name="totalPrice"\s+value="333(?:\.00)?"/);
    assert.equal((await post({ ...fields, quoteRooms: "4", quoteServices: "doorsCleaning" })).status, 303);
    page = await html();
    assert.match(page, /name="totalPrice"\s+value="333(?:\.00)?"/);
  } finally {
    await stopServer(started.child);
  }
});
