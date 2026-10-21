"use strict";

const vm = require("node:vm");
const { fs, os, path, test, assert, loadAdminConfig, startServer, stopServer, createAdminSession,
  getSetCookies, getCookieValue } = require("./admin-route-helpers");

function inputValue(html, name) {
  const tag = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0])
    .find(tag => tag.includes(`name="${name}"`));
  return tag?.match(/\bvalue="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") || "";
}

test("client card opens a prefilled order for the selected address without writes or stale drafts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-client-order-prefill-"));
  const env = { ADMIN_MASTER_SECRET: "client_prefill_qa", ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl"),
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
    await post("/admin/clients", admin, { action: "create-client", name: "Prefill & Client", phone: "6305550129",
      email: "prefill@example.com", address: "123 First St, Naperville, IL 60540", roomCount: "1", bathroomCount: "1", squareFootage: "900" });
    const secondAddress = "456 Second St, Aurora, IL 60504";
    const updated = await post("/admin/clients", admin, [
      ["action", "update-client"], ["clientKey", "6305550129"], ["name", "Prefill & Client"],
      ["phone", "6305550129"], ["email", "prefill@example.com"],
      ["addresses", "123 First St, Naperville, IL 60540"], ["addresses", secondAddress],
      ["addressRoomCounts", "1"], ["addressRoomCounts", "4"],
      ["addressBathroomCounts", "1"], ["addressBathroomCounts", "2.5"],
      ["addressSquareFootages", "900"], ["addressSquareFootages", "2600"],
      ["addressPets", "none"], ["addressPets", "dog"],
      ["addressNotes", "First address only"], ["addressNotes", "Second address instructions"],
    ]);
    assert.match(updated.headers.get("location"), /client-saved/);
    const before = await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8");
    const card = await get(`/admin/clients?client=6305550129&addressKey=${encodeURIComponent(secondAddress.toLowerCase())}`, admin);
    const link = card.match(/href="([^"]+)"[^>]*>Создать заказ<\/a>/)?.[1]?.replace(/&amp;/g, "&");
    assert.ok(link);
    const url = new URL(link, started.baseUrl);
    assert.equal(url.pathname, "/admin/orders");
    assert.equal(url.searchParams.get("createClientKey"), "6305550129");
    assert.equal(url.searchParams.get("createAddressKey"), secondAddress.toLowerCase());
    const page = await get(link, admin);
    const form = page.match(/<form[^>]+action="\/admin\/orders"[^>]*>[\s\S]*?value="create-manual-order"[\s\S]*?<\/form>/)?.[0];
    assert.ok(form);
    const expected = { customerName: "Prefill & Client", customerPhone: "6305550129", customerEmail: "prefill@example.com",
      fullAddress: secondAddress, selectedClientAddress: secondAddress, selectedClientAddressRoomCount: "4",
      selectedClientAddressBathroomCount: "2.5", selectedClientAddressSquareFootage: "2600",
      selectedClientAddressPets: "dog", selectedClientAddressNotes: "Second address instructions" };
    for (const [name, value] of Object.entries(expected)) assert.equal(inputValue(form, name), value, name);
    assert.equal(inputValue(form, "totalPrice"), "");
    assert.equal(inputValue(form, "selectedDate"), "");
    assert.match(form, /Спальни: 4/);
    assert.match(page, /data-admin-client-prefill="true"/);
    assert.equal(await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8"), before, "GET must not create or update anything");

    const script = page.match(/<script data-admin-manual-order-draft>([\s\S]*?)<\/script>/)[1];
    for (const prefilled of [true, false]) {
      const field = { name: "customerName", value: "Prefill & Client", dispatchEvent() {} };
      const mockForm = { elements: [field], addEventListener() {} };
      let cleared = false;
      vm.runInNewContext(script, { document: { getElementById: () => ({ querySelector: () => mockForm,
        getAttribute: () => "true", hasAttribute: () => prefilled }) }, Event: class {},
        window: { sessionStorage: { removeItem() { cleared = true; }, setItem() {},
          getItem: () => JSON.stringify({ savedAt: Date.now(), fields: [{ name: "customerName", value: "Different client's old draft" }] }) } } });
      assert.equal(field.value, prefilled ? "Prefill & Client" : "Different client's old draft");
      assert.equal(cleared, prefilled);
    }
    const invalid = await get("/admin/orders?createOrder=1&createClientKey=missing", admin);
    assert.match(invalid, /Клиент или адрес не найден/);
    url.searchParams.set("createAddressKey", "missing");
    const invalidAddress = await get(`${url.pathname}${url.search}`, admin);
    assert.match(invalidAddress, /Клиент или адрес не найден/);
    assert.equal(inputValue(invalidAddress.match(/<form[^>]+action="\/admin\/orders"[^>]*>[\s\S]*?value="create-manual-order"[\s\S]*?<\/form>/)[0], "fullAddress"), "");

    const submitted = { action: "create-manual-order", ...Object.fromEntries(Object.keys(expected).map(name => [name, inputValue(form, name)])),
      serviceType: "deep", selectedDate: "2099-10-18", selectedTime: "10:00", totalPrice: "250" };
    const order = await post("/admin/orders", admin, submitted);
    assert.match(order.headers.get("location"), /manual-order-created/);
    const detail = await get(order.headers.get("location"), admin);
    assert.match(detail, /250\.00/);
    assert.match(detail, /2600/);
    assert.match(detail, /Second address instructions/);

    await post("/admin/settings", admin, { action: "create_user", role: "viewer", email: "eva@shynli.local", name: "Eva",
      password: "PrefillTest123!", status: "active", staffStatus: "active", phone: "6305550190", address: "Test address" });
    const login = await post("/admin/login", "", { email: "eva@shynli.local", password: "PrefillTest123!" });
    const viewer = `shynli_user_session=${getCookieValue(getSetCookies(login), "shynli_user_session")}`;
    assert.doesNotMatch(await get("/admin/clients?client=6305550129", viewer), />Создать заказ<\/a>/);
    assert.doesNotMatch(await get(link, viewer), /value="create-manual-order"/);
    assert.equal((await post("/admin/orders", viewer, submitted)).status, 403);
  } finally {
    await stopServer(started.child);
    await fs.rm(root, { recursive: true, force: true });
  }
});
