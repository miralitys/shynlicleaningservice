"use strict";

const { fs, os, path, test, assert, loadAdminConfig, startServer, stopServer, createAdminSession,
  getSetCookies, getCookieValue } = require("./admin-route-helpers");

test("creates a client without a request/order, and reuses it later in manual order lookup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-create-client-"));
  const env = { ADMIN_MASTER_SECRET: "create_client_qa", ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl"),
    ADMIN_USERS_STORE_PATH: path.join(root, "users.json"), ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS: "30" };
  const started = await startServer({ env });
  const post = (route, cookie, values) => fetch(`${started.baseUrl}${route}`, {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(values),
  });
  const get = async (route, cookie) => {
    const response = await fetch(`${started.baseUrl}${route}`, { redirect: "manual", headers: { cookie } });
    assert.equal(response.status, 200, route);
    return response.text();
  };
  try {
    const admin = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const page = await get("/admin/clients?createClient=1", admin);
    assert.match(page, /data-admin-dialog-open="admin-client-create-dialog"/);
    assert.match(page, /id="admin-client-create-dialog"[^>]*data-admin-dialog-autopen="true"/);
    const created = await post("/admin/clients", admin, { action: "create-client", name: "Notebook Contact QA",
      phone: "+1 (630) 555-0134", email: "notebook@example.com", address: "123 Test St, Naperville, IL 60540",
      roomCount: "3", bathroomCount: "2.5", squareFootage: "1800", notes: "Call before arrival <safe>",
      orderStatus: "scheduled", totalPrice: "999", frequency: "weekly", assignedStaff: "Fake Cleaner" });
    assert.equal(created.status, 303);
    assert.match(created.headers.get("location"), /notice=client-created/);
    const clientPage = await get(created.headers.get("location"), admin);
    assert.match(clientPage, /Notebook Contact QA/);
    assert.match(clientPage, /Без заказов/);
    assert.match(clientPage, /По этому клиенту пока нет заказов/);
    assert.match(clientPage, /Call before arrival &lt;safe&gt;/);
    assert.doesNotMatch(clientPage, /999\.00|Fake Cleaner/);

    for (const route of ["/admin/orders", "/admin/quote-ops?section=archive", "/admin/quote-ops?section=funnel"])
      assert.doesNotMatch(await get(route, admin), /data-order-entry-id="[^"]+"/);
    assert.doesNotMatch(await get("/admin/quote-ops?section=archive", admin), /Notebook Contact QA/);
    const audit = (await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const event = audit.find(event => event.action === "create" && event.entity_type === "client" && event.status === "succeeded");
    assert.ok(event);
    assert.equal(event.route, "/admin/clients");
    assert.ok(event.actor.id);
    assert.ok(event.entry_id);
    const lookup = await get("/admin/orders?fragment=create-order-dialog", admin);
    assert.match(lookup, /Notebook Contact QA/);
    assert.match(lookup, /1800/);
    assert.match(lookup, /2\.5/);
    assert.doesNotMatch(await get("/admin/quote-ops?section=tasks", admin), /data-quote-task-id=/);

    const duplicate = await post("/admin/clients", admin, { action: "create-client", name: "Wrong replacement name", phone: "6305550134" });
    assert.match(duplicate.headers.get("location"), /client-already-exists/);
    const duplicateEmail = await post("/admin/clients", admin, { action: "create-client", name: "Wrong replacement", email: "NOTEBOOK@example.com" });
    assert.match(duplicateEmail.headers.get("location"), /client-already-exists/);
    assert.doesNotMatch(await get("/admin/clients", admin), /Wrong replacement/);

    for (const values of [{ name: "" }, { name: "Invalid", phone: "123" }, { name: "Invalid", email: "bad" }]) {
      const invalid = await post("/admin/clients", admin, { action: "create-client", ...values });
      assert.match(invalid.headers.get("location"), /client-create-invalid/);
    }
    const nameOnly = await post("/admin/clients", admin, { action: "create-client", name: "Name Only Contact" });
    assert.match(nameOnly.headers.get("location"), /client-created/);
    const namePage = await get(nameOnly.headers.get("location"), admin);
    assert.match(namePage, /Name Only Contact/);
    assert.match(namePage, /Контакты пока не заполнены/);
    const missingAddress = await post("/admin/clients", admin, { action: "create-client", name: "Missing address", roomCount: "3" });
    assert.match(missingAddress.headers.get("location"), /client-address-required/);

    const order = await post("/admin/orders", admin, { action: "create-manual-order", customerName: "Notebook Contact QA",
      customerPhone: "6305550134", customerEmail: "notebook@example.com", fullAddress: "123 Test St, Naperville, IL 60540",
      selectedClientAddress: "123 Test St, Naperville, IL 60540", selectedClientAddressRoomCount: "3",
      selectedClientAddressBathroomCount: "2.5", selectedClientAddressSquareFootage: "1800",
      totalPrice: "250", serviceType: "deep", selectedDate: "2099-10-18", selectedTime: "10:00" });
    assert.match(order.headers.get("location"), /manual-order-created/);
    const updated = await get("/admin/clients?client=6305550134", admin);
    assert.match(updated, /Notebook Contact QA/);
    assert.match(updated, /1 заявка/);
    assert.doesNotMatch(updated, /2 заявки/);
    assert.match(updated, /Call before arrival &lt;safe&gt;/);
    assert.match(await get(order.headers.get("location"), admin), /250\.00/);

    for (const [role, email] of [["manager", "manager.qa@example.com"], ["viewer", "eva@shynli.local"]]) {
      assert.equal((await post("/admin/settings", admin, { action: "create_user", role, email, name: role,
        password: "ClientTest123!", status: "active", staffStatus: "active", phone: "6305550190", address: "Test address" })).status, 303);
      const login = await post("/admin/login", "", { email, password: "ClientTest123!" });
      assert.equal(login.headers.get("location"), "/admin");
      const cookie = `shynli_user_session=${getCookieValue(getSetCookies(login), "shynli_user_session")}`;
      const html = await get("/admin/clients", cookie);
      const result = await post("/admin/clients", cookie, { action: "create-client", name: `${role} contact` });
      if (role === "viewer") {
        assert.doesNotMatch(html, /data-admin-dialog-open="admin-client-create-dialog"/);
        assert.equal(result.status, 403);
      } else {
        assert.match(html, /data-admin-dialog-open="admin-client-create-dialog"/);
        assert.equal(result.status, 303);
        assert.match(result.headers.get("location"), /client-created/);
      }
    }
  } finally {
    await stopServer(started.child);
    await fs.rm(root, { recursive: true, force: true });
  }
});
