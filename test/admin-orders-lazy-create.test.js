"use strict";

const { fs, os, path, test, assert, loadAdminConfig, startServer, stopServer, createAdminSession,
  hashPassword, getSetCookies, getCookieValue } = require("./admin-route-helpers");

test("dialog links open in place while modified clicks keep the ordinary link", () => {
  const { ADMIN_SHARED_DIALOG_STATE_SCRIPT: script } = require("../lib/admin/render-shared-dialog-toggle-script");
  const start = script.indexOf('const openTrigger = event.target.closest("[data-admin-dialog-open]")');
  const end = script.indexOf('const closeTrigger =', start);
  assert.ok(start >= 0 && end > start);
  const handle = new Function("event", "openAdminDialogFromTrigger", "markAdminMessageRowRead", script.slice(start, end));
  const trigger = { matches: selector => selector === "a[href]", hasAttribute: () => false };
  for (const modifier of [null, "ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    let prevented = false;
    let opened = false;
    handle({ target: { closest: () => trigger }, ...(modifier ? { [modifier]: true } : {}),
      preventDefault: () => { prevented = true; } }, () => { opened = true; }, () => {});
    assert.equal(prevented, !modifier);
    assert.equal(opened, !modifier);
  }
});

test("orders overlap staff reads, defer creation data and load the unchanged form on demand", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-lazy-order-"));
  const control = path.join(root, "control.json");
  const capture = path.join(root, "reads.jsonl");
  await fs.writeFile(control, JSON.stringify({ delayMs: 120 }));
  const env = { ADMIN_MASTER_SECRET: "lazy_order_local_test", GOOGLE_PLACES_API_KEY: "local_places_key",
    SUPABASE_URL: "https://account-benchmark.invalid", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake",
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "support/account-section-fixture.cjs"),
    ACCOUNT_SECTION_CONTROL: control, ACCOUNT_SECTION_CAPTURE: capture,
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", GHL_API_KEY: "", GHL_LOCATION_ID: "" };
  const app = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const get = route => fetch(app.baseUrl + route, { headers: { cookie }, redirect: "manual" });
    await fs.writeFile(capture, "");
    const page = await get("/admin/orders");
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /fragment=create-order-dialog/);
    assert.match(html, /href="\/admin\/orders\?createOrder=1"/);
    assert.doesNotMatch(html, /<dialog[^>]+id="admin-manual-order-create-dialog"/);
    assert.doesNotMatch(html, /<script type="application\/json" data-admin-manual-client-data/);
    assert.match(html, /__adminBindManualOrderDialogContent/);
    const addressRuntime = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(x => x[1]).find(x => x.includes("const adminPlacesApiKey"));
    assert.ok(addressRuntime);
    assert.doesNotMatch(addressRuntime, /bindAddressInputs\(document\)/);
    const reads = (await fs.readFile(capture, "utf8")).trim().split("\n").map(JSON.parse);
    const ledger = reads.find(x => x.table === "admin_order_list_entries");
    const staff = reads.filter(x => x.table === "admin_staff" || x.table === "admin_staff_assignments");
    assert.ok(ledger && staff.length >= 2);
    assert.ok(staff.every(x => x.start < ledger.end && ledger.start < x.end), "Independent reads must overlap");

    const fragment = await get("/admin/orders?fragment=create-order-dialog&returnTo=%2Fadmin%2Forders%3Fstatus%3Dcompleted");
    assert.equal(fragment.status, 200);
    const form = await fragment.text();
    assert.match(form, /<dialog[^>]+id="admin-manual-order-create-dialog"/);
    assert.match(form, /name="action" value="create-manual-order"/);
    assert.match(form, /<script type="application\/json" data-admin-manual-client-data/);
    assert.match(form, /name="returnTo" value="\/admin\/orders\?status=completed"/);
    assert.doesNotMatch(form, /<!DOCTYPE|admin-orders-workspace|<script data-admin-manual-order-draft>/);
    const fallback = await get("/admin/orders?createOrder=1");
    assert.equal(fallback.status, 200);
    const full = await fallback.text();
    assert.match(full, /data-admin-dialog-autopen="true"/);
    assert.match(full, /<script data-admin-manual-order-draft>/);
    assert.match(full, /bindAddressInputs\(document\)/);

    await fs.writeFile(control, JSON.stringify({ failOrders: true }));
    assert.equal((await get("/admin/orders")).status, 503, "An incomplete list must not look empty");
    await fs.writeFile(control, JSON.stringify({}));
    assert.equal((await get("/admin/orders")).status, 200, "Next read must recover without a stale failure cache");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});

test("creation fragment keeps admin and manager access but denies viewer and cleaner", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-lazy-order-acl-"));
  const env = { ADMIN_MASTER_SECRET: "lazy_order_acl_test", ADMIN_USERS_STORE_PATH: path.join(root, "users.json"),
    ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json"), ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl") };
  const users = ["viewer", "manager", "cleaner"].map(role => ({ id: role, staffId: role, role,
    name: role, email: `${role}@local.test`, passwordHash: hashPassword("LocalLazyOrder123!"),
    status: "active", emailVerificationRequired: false }));
  await fs.writeFile(env.ADMIN_USERS_STORE_PATH, JSON.stringify({ version: 1, users }));
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: users.map(x => ({ id: x.id,
    name: x.name, role: x.role, email: x.email, status: "active" })), assignments: [] }));
  const before = await fs.readFile(env.ADMIN_STAFF_STORE_PATH, "utf8");
  const app = await startServer({ env });
  try {
    for (const role of ["viewer", "manager", "cleaner"]) {
      const login = await fetch(app.baseUrl + "/account/login", { method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: `${role}@local.test`, password: "LocalLazyOrder123!" }) });
      assert.equal(login.status, 303);
      const cookie = `shynli_user_session=${getCookieValue(getSetCookies(login), "shynli_user_session")}`;
      const response = await fetch(app.baseUrl + "/admin/orders?fragment=create-order-dialog", {
        headers: { cookie }, redirect: "manual" });
      if (role === "manager") {
        assert.equal(response.status, 200);
        assert.match(await response.text(), /value="create-manual-order"/);
      } else {
        assert.ok([302, 303, 403].includes(response.status));
        assert.doesNotMatch(await response.text(), /value="create-manual-order"/);
        if (role === "viewer") assert.equal(response.status, 403);
      }
    }
    const anon = await fetch(app.baseUrl + "/admin/orders?fragment=create-order-dialog", { redirect: "manual" });
    assert.ok([302, 303].includes(anon.status));
    assert.equal(await fs.readFile(env.ADMIN_STAFF_STORE_PATH, "utf8"), before);
    let events = "";
    try { events = await fs.readFile(env.ADMIN_AUDIT_STORE_PATH, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    assert.equal(events, "", "GET and login must not mutate clients or orders");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
