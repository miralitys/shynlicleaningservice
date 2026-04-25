"use strict";

const {
  test,
  assert,
  loadAdminConfig,
  startServer,
  stopServer,
  createAdminSession,
} = require("./admin-route-helpers");

test("loads Google Places autocomplete in the manual order dialog on admin orders", async () => {
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GOOGLE_PLACES_API_KEY: "places_test_key",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const ordersResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      headers: {
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
    });
    const ordersBody = await ordersResponse.text();

    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, /id="admin-manual-order-address"/);
    assert.match(ordersBody, /data-admin-address-autocomplete="true"/);
    assert.match(ordersBody, /data-admin-address-suggestions/);
    assert.match(ordersBody, /places_test_key/);
    assert.match(ordersBody, /__adminGooglePlacesReady/);
    assert.match(ordersBody, /v=beta/);
  } finally {
    await stopServer(started.child);
  }
});
