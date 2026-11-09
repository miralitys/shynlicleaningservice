"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { parse } = require("parse5");

function nodes(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  for (const child of node.childNodes || []) nodes(child, predicate, result);
  return result;
}
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
const rows = html => nodes(parse(html), node => node.tagName === "tr" && attr(node, "data-admin-list-key"))
  .map(row => ({ id: attr(row, "data-admin-list-key"), cells: row.childNodes.filter(node => node.tagName === "td")
    .map(cell => text(cell).replace(/\s+/g, " ").trim()) }));

test("cancellation accepts equivalent expected schedule formats without moving the series or changing finances", { timeout: 60000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-cancel-form-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-cancel-form", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0", ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json") };
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: [
    { id: "a", name: "Cleaner A", role: "cleaner", status: "active" },
  ], assignments: [] }));
  const app = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const post = (body, ajax = false) => fetch(app.baseUrl + "/admin/orders", { method: "POST", redirect: "manual",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded", ...(ajax ? { "X-SHYNLI-ADMIN-AJAX": "1" } : {}) },
      body: new URLSearchParams(body) });
    const get = async url => { const response = await fetch(app.baseUrl + url, { headers: { cookie } });
      assert.equal(response.status, 200); return response.text(); };
    const created = await post({ action: "create-manual-order", customerName: "Cancel Form QA", customerPhone: "6305550171",
      fullAddress: "100 Isolated QA Street", serviceType: "standard", frequency: "biweekly", selectedDate: "2099-11-01",
      selectedTime: "10:00", serviceDurationHours: "2", serviceDurationMinutes: "30", totalPrice: "217" });
    assert.equal(created.status, 303);
    const rootId = new URL(created.headers.get("location"), app.baseUrl).searchParams.get("order");
    assert.equal((await post({ action: "update-order", entryId: rootId, orderStatus: "scheduled", assignedStaff: "Cleaner A",
      recurringEditScope: "future" })).status, 303);
    let before = rows(await get("/admin/orders?q=Cancel%20Form%20QA"));
    assert.equal(before.length, 13);
    const first = before.find(row => row.cells[2].includes("11/15/2099"));
    const next = before.find(row => row.cells[2].includes("11/29/2099"));
    assert(first && next);
    assert.equal((await post({ entryId: rootId, orderStatus: "completed", paymentStatus: "paid", recurringEditScope: "current" })).status, 303);
    // Leave a one-visit cancellation in the middle of the series as existing history.
    assert.equal((await post({ entryId: first.id, orderStatus: "canceled", cancelScope: "current", recurringEditScope: "current",
      selectedDate: "11/15/2099", selectedTime: "10:00 AM", expectedScheduleDate: "11/15/2099", expectedScheduleTime: "10:00 AM" })).status, 303);
    before = rows(await get("/admin/orders?q=Cancel%20Form%20QA"));
    assert.match(before.find(row => row.id === rootId).cells[4], /Завершено/);
    assert.match(before.find(row => row.id === first.id).cells[4], /Отменено/);
    assert.match(before.find(row => row.id === next.id).cells[4], /Запланировано/);
    const card = parse(await get(`/admin/orders?order=${next.id}`));
    const form = nodes(card, node => node.tagName === "form" && attr(node, "id") === `admin-order-detail-dialog-${next.id}-edit-form`)[0];
    assert(form);
    const body = Object.fromEntries(nodes(form, node => node.tagName === "input" && attr(node, "name"))
      .map(node => [attr(node, "name"), attr(node, "value") || ""]));
    Object.assign(body, { entryId: next.id, orderStatus: "canceled", cancelScope: "future", recurringEditScope: "future",
      selectedDate: "11/29/2099", selectedTime: "10:00 AM", expectedScheduleDate: "11/29/2099", expectedScheduleTime: "10:00 AM" });
    // Real date changes and stale snapshots must still be rejected before any write.
    for (const changes of [{ selectedDate: "11/30/2099" }, { expectedScheduleTime: "11:00 AM" }]) {
      const denied = await post({ ...body, ...changes }, true);
      assert.equal(denied.status, 409, JSON.stringify(changes) + ": " + await denied.text());
      assert.deepEqual(rows(await get("/admin/orders?q=Cancel%20Form%20QA")), before);
    }
    const canceled = await post(body, true);
    assert.equal(canceled.status, 200, await canceled.text());
    const after = rows(await get("/admin/orders?q=Cancel%20Form%20QA"));
    assert.deepEqual(after.map(row => row.id).sort(), before.map(row => row.id).sort());
    for (const row of before) {
      const actual = after.find(item => item.id === row.id);
      assert.deepEqual(actual.cells.filter((_, i) => i !== 4), row.cells.filter((_, i) => i !== 4));
      if (row.id === rootId || row.id === first.id) assert.deepEqual(actual, row);
      else assert.match(actual.cells[4], /Отменено/);
    }
    const assignments = JSON.parse(await fs.readFile(env.ADMIN_STAFF_STORE_PATH, "utf8")).assignments;
    assert(assignments.every(item => item.staffIds.length === 1 && item.staffIds[0] === "a"));
    for (const row of after.filter(row => row.id !== rootId)) assert.equal(assignments.find(item => item.entryId === row.id).status, "canceled");
    const audit = await get(`/admin/audit?entityId=${next.id}`);
    assert.match(audit, /Cancel Form QA/);
    assert.deepEqual(rows(await get("/admin/orders?q=Cancel%20Form%20QA")), after);
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
