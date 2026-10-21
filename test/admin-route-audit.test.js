"use strict";

const { fs, os, path, test, assert, loadAdminConfig, startServer, stopServer, createAdminSession,
  getSetCookies, getCookieValue } = require("./admin-route-helpers");
const { createAdminAuditStore } = require("../lib/admin-audit-store");

test("audit page logs real admin order/client mutations, personal actors, and denies viewer/cleaner access", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-route-audit-"));
  const env = { ADMIN_MASTER_SECRET: "audit_route_test", ADMIN_AUDIT_STORE_PATH: path.join(root, "audit.jsonl"),
    ADMIN_USERS_STORE_PATH: path.join(root, "users.json"), ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS: "30" };
  const started = await startServer({ env });
  const post = (route, cookie, values) => fetch(`${started.baseUrl}${route}`, {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(values),
  });
  const get = (route, cookie = "") => fetch(`${started.baseUrl}${route}`, { redirect: "manual", headers: { cookie } });
  try {
    const admin = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    const unauthorized = await get("/admin/audit");
    assert.equal(unauthorized.status, 303);
    assert.equal(unauthorized.headers.get("location"), "/admin/login");
    const created = await post("/admin/orders", admin, { action: "create-manual-order", customerName: "Audit Client QA",
      customerPhone: "6305550188", totalPrice: "250", serviceType: "deep", selectedDate: "2099-10-18", selectedTime: "10:00",
      fullAddress: "123 Test St, Naperville, IL 60540" });
    assert.equal(created.status, 303);
    assert.match(created.headers.get("location"), /manual-order-created/);
    const entryId = new URL(created.headers.get("location"), started.baseUrl).searchParams.get("order");
    assert.ok(entryId);
    for (const [role, email, name] of [["manager", "audit.manager@example.com", "Audit Manager"],
      ["viewer", "audit.viewer@example.com", "Audit Viewer"], ["cleaner", "audit.cleaner@example.com", "Audit Cleaner"]]) {
      const response = await post("/admin/settings", admin, { action: "create_user", role, email, name,
        password: "AuditTest123!", status: "active", staffStatus: "active", phone: "6305550100", address: "Test address" });
      assert.equal(response.status, 303);
    }
    const login = async email => {
      const response = await post("/admin/login", "", { email, password: "AuditTest123!" });
      assert.equal(response.status, 303);
      const session = getCookieValue(getSetCookies(response), "shynli_user_session");
      assert.ok(session);
      return `shynli_user_session=${session}`;
    };
    const manager = await login("audit.manager@example.com");
    const viewer = await login("audit.viewer@example.com");
    const cleaner = await login("audit.cleaner@example.com");
    assert.equal((await get("/admin/trash", viewer)).status, 403);
    assert.equal((await get("/admin/trash", cleaner)).status, 303);
    assert.equal((await get("/admin/trash", manager)).status, 200);
    assert.equal((await post("/admin/trash", viewer, { action: "restore", trashId: entryId })).status, 403);
    const blockedLeadDelete = await post("/admin/quote-ops", manager, { action: "delete-lead-entry", entryId });
    assert.equal(blockedLeadDelete.status, 409);
    assert.match(await blockedLeadDelete.text(), /order-exists/);
    assert.match(await (await get("/admin/orders", manager)).text(), new RegExp(entryId));
    const changed = await post("/admin/orders", manager, { entryId, totalPrice: "534" });
    assert.equal(changed.status, 303);
    assert.match(changed.headers.get("location"), /notice=order-saved/);
    const clientChange = await post("/admin/clients", manager, { action: "update-client", clientKey: "6305550188",
      name: "Audit Client Renamed", phone: "6305550188", email: "audit.client@example.com", address: "123 Test St, Naperville, IL 60540" });
    assert.equal(clientChange.status, 303);
    assert.match(clientChange.headers.get("location"), /client-saved/);
    const auditPage = await get("/admin/audit", manager);
    const html = await auditPage.text();
    assert.equal(auditPage.status, 200);
    assert.match(html, /Журнал действий/);
    assert.match(html, /Сумма: \$250.00 → \$534.00/);
    assert.match(html, /Audit Manager/);
    assert.match(html, /audit.manager@example.com/);
    assert.match(html, /Общий администратор/);
    assert.match(html, /<form method="get" action="\/admin\/audit"/);
    assert.doesNotMatch(html, /<form[^>]*method="post"[^>]*action="\/admin\/audit"/);
    assert.equal((await get("/admin/audit", viewer)).status, 403);
    assert.equal((await get("/admin/audit?fragment=entries&offset=50", viewer)).status, 403);
    assert.equal((await get("/admin/audit?fragment=entries")).status, 303);
    const fragment = await get("/admin/audit?fragment=entries", manager);
    assert.equal(fragment.status, 200);
    const fragmentHtml = await fragment.text();
    assert.match(fragmentHtml, /data-audit-entries/);
    assert.match(fragmentHtml, /Сумма: \$250.00 → \$534.00/);
    assert.doesNotMatch(fragmentHtml, /<html|<script/);
    assert.equal((await get("/admin/audit", cleaner)).status, 303);
    for (const cookie of [admin, manager, viewer]) assert.equal((await post("/admin/audit", cookie, {})).status, 403);
    assert.doesNotMatch(await (await get("/admin", viewer)).text(), /href="\/admin\/audit"/);
    const filtered = await get(`/admin/audit?entityType=order&action=update&entityId=${entryId}&actor=audit.manager%40example.com`, admin);
    assert.equal(filtered.status, 200);
    const filteredHtml = await filtered.text();
    assert.match(filteredHtml, /Сумма: \$250.00 → \$534.00/);
    assert.doesNotMatch(filteredHtml, /Общий администратор/);
    const absent = await get("/admin/audit?from=2000-01-01&to=2000-01-02", admin);
    assert.match(await absent.text(), /Записей пока нет/);
    const deletion = await post("/admin/clients", admin, { action: "delete-client", clientKey: "6305550188" });
    assert.equal(deletion.status, 303);
    assert.match(deletion.headers.get("location"), /client-deleted/);
    const records = await createAdminAuditStore({ env }).list();
    assert.equal(records.filter(event => event.action === "delete" && event.entity_type === "order").length, 1);
    assert.equal(records.filter(event => event.action === "delete" && event.entity_type === "client").length, 1);
    assert.ok(records.some(event => event.actor.email === "audit.manager@example.com" && event.changes.some(change => change.field === "totalPrice" && change.old === 250 && change.new === 534)));
    const trashHtml = await (await get("/admin/trash", manager)).text();
    assert.match(trashHtml, /Audit Client Renamed/);
    const trashId = trashHtml.match(/name="trashId" value="([^"]+)"/)?.[1];
    assert.ok(trashId);
    assert.equal((await post("/admin/trash", manager, { action: "restore", trashId })).status, 303);
    const restoredOrders = await (await get(`/admin/orders?order=${entryId}`, manager)).text();
    assert.match(restoredOrders, /\$534\.00/);
    assert.match(restoredOrders, new RegExp(entryId));
    const restoredEvent = (await createAdminAuditStore({ env }).list()).find(event => event.action === "restore");
    assert.equal(restoredEvent.actor.email, "audit.manager@example.com");
    assert.equal(restoredEvent.entry_id, entryId);
  } finally {
    await stopServer(started.child);
    await fs.rm(root, { recursive: true, force: true });
  }
});
