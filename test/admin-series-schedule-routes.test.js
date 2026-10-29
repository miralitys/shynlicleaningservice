"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");
const { parse } = require("parse5");

function findNodes(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  for (const child of node.childNodes || []) findNodes(child, predicate, result);
  return result;
}
const attr = (node, key) => node.attrs?.find(attr => attr.name === key)?.value;
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
function rows(html) {
  return findNodes(parse(html), node => node.tagName === "tr" && attr(node, "data-admin-list-key"))
    .map(row => ({ id: attr(row, "data-admin-list-key"), cells: row.childNodes.filter(node => node.tagName === "td")
      .map(cell => text(cell).replace(/\s+/g, " ").trim()) }));
}

test("card and calendar whole-series transfers preserve IDs and financial/team rows, while current-only transfers stay isolated", { timeout: 60000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-series-routes-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-series-routes", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0", ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json") };
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: [
    { id: "a", name: "Cleaner A", role: "cleaner", status: "active" },
    { id: "b", name: "Cleaner B", role: "cleaner", status: "active" },
  ], assignments: [] }));
  const app = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const post = (route, values) => fetch(app.baseUrl + route, { method: "POST", redirect: "manual",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
    const get = async route => {
      const response = await fetch(app.baseUrl + route, { headers: { cookie } });
      assert.equal(response.status, 200); return response.text();
    };
    const response = await post("/admin/orders", { action: "create-manual-order", customerName: "Series Route QA", customerPhone: "6305550186",
      fullAddress: "100 Isolated QA Street", serviceType: "standard", frequency: "biweekly", selectedDate: "2099-11-01",
      selectedTime: "10:00", serviceDurationHours: "2", serviceDurationMinutes: "30", totalPrice: "380" });
    assert.equal(response.status, 303);
    const id = new URL(response.headers.get("location"), app.baseUrl).searchParams.get("order");
    assert.ok(id);
    const teamFields = new URLSearchParams({ action: "update-order", entryId: id, orderStatus: "scheduled",
      assignedStaff: "Cleaner A", recurringEditScope: "future" });
    teamFields.append("assignedStaff", "Cleaner B");
    assert.equal((await post("/admin/orders", teamFields)).status, 303);
    const initial = rows(await get("/admin/orders?q=Series%20Route%20QA"));
    assert.equal(initial.length, 13);
    const exceptionalId = initial[3].id;
    await post("/admin/orders", { action: "update-order", entryId: exceptionalId, totalPrice: "395", assignedStaff: "Cleaner B",
      payrollOverrideStaffId: "b", payrollOverrideAmount: "130", recurringEditScope: "current" });
    const before = rows(await get("/admin/orders?q=Series%20Route%20QA"));
    const teamBefore = JSON.parse(await fs.readFile(env.ADMIN_STAFF_STORE_PATH, "utf8")).assignments;
    const card = await get(`/admin/orders?order=${id}`);
    const scheduleForm = findNodes(parse(card), node => node.tagName === "form" && attr(node, "id")?.endsWith("-schedule-form"))[0];
    assert.equal(attr(scheduleForm, "data-admin-recurring-edit-confirm"), "true");
    assert.ok(findNodes(scheduleForm, node => attr(node, "name") === "recurringEditScope").length);
    const moved = await post("/admin/orders", { entryId: id, selectedDate: "11/08/2099", selectedTime: "10:00 AM",
      expectedScheduleDate: "2099-11-01", expectedScheduleTime: "10:00", recurringEditScope: "future" });
    assert.equal(moved.status, 303, await moved.text());
    const afterCard = rows(await get("/admin/orders?q=Series%20Route%20QA"));
    assert.deepEqual(afterCard.map(row => row.id).sort(), before.map(row => row.id).sort());
    const compare = (left, right) => {
      for (const a of left) {
        const b = right.find(row => row.id === a.id);
        assert.ok(b); assert.deepEqual(a.cells.filter((_, i) => i !== 2), b.cells.filter((_, i) => i !== 2));
      }
    };
    compare(before, afterCard);
    assert.deepEqual(JSON.parse(await fs.readFile(env.ADMIN_STAFF_STORE_PATH, "utf8")).assignments, teamBefore);
    const repeated = await post("/admin/orders", { entryId: id, selectedDate: "2099-11-08", selectedTime: "10:00",
      expectedScheduleDate: "2099-11-01", expectedScheduleTime: "10:00", recurringEditScope: "future" });
    assert.equal(repeated.status, 303);
    assert.deepEqual(rows(await get("/admin/orders?q=Series%20Route%20QA")), afterCard);
    const sorted = [...afterCard].sort((a, b) => Date.parse(a.cells[2].slice(0, 10)) - Date.parse(b.cells[2].slice(0, 10)));
    assert.match(sorted[0].cells[2], /11\/08\/2099/); assert.match(sorted[1].cells[2], /11\/22\/2099/);
    assert.match(sorted[2].cells[2], /12\/06\/2099/); assert.match(sorted[3].cells[2], /12\/20\/2099/);
    const assignment = teamBefore.find(item => item.entryId === id);
    assert.deepEqual(assignment.staffIds.sort(), ["a", "b"]);
    const calendar = await get("/admin/staff?section=calendar&calendarStart=2099-11-01&calendarView=month");
    assert.match(calendar, /data-admin-recurring-schedule-confirm="true"/);
    const calendarMove = { action: "save-assignment", entryId: id, staffIds: assignment.staffIds,
      status: assignment.status, notes: assignment.notes || "", scheduleDate: "2099-11-15", scheduleTime: "11:00",
      expectedScheduleDate: "2099-11-08", expectedScheduleTime: "10:00", recurringEditScope: "future" };
    // URLSearchParams arrays stringify with commas, use repeated staff fields as the actual form does.
    const calendarBody = new URLSearchParams({ ...calendarMove, staffIds: assignment.staffIds[0] });
    calendarBody.set("calendarView", "month");
    for (const staffId of assignment.staffIds.slice(1)) calendarBody.append("staffIds", staffId);
    const calendarResponse = await fetch(app.baseUrl + "/admin/staff", { method: "POST", headers: {
      cookie, "content-type": "application/x-www-form-urlencoded", "X-SHYNLI-ADMIN-AJAX": "1",
    }, body: calendarBody });
    assert.equal(calendarResponse.status, 200);
    const calendarResult = await calendarResponse.json();
    assert.equal(calendarResult.notice, "assignment-saved");
    const refreshedCalendarUrl = new URL(calendarResult.redirectUrl, app.baseUrl);
    assert.equal(refreshedCalendarUrl.pathname, "/admin/staff");
    assert.equal(refreshedCalendarUrl.searchParams.get("section"), "calendar");
    assert.equal(refreshedCalendarUrl.searchParams.get("calendarStart"), "2099-11-15");
    assert.equal(refreshedCalendarUrl.searchParams.get("calendarView"), "month");
    const afterCalendar = rows(await get("/admin/orders?q=Series%20Route%20QA"));
    compare(afterCard, afterCalendar);
    assert.deepEqual(afterCalendar.map(row => row.id).sort(), before.map(row => row.id).sort());
    assert.ok(afterCalendar.every(row => /11:00 AM/.test(row.cells[2])));
    assert.match(afterCalendar.find(row => row.id === id).cells[2], /11\/15\/2099/);
    const repeatedCalendar = await post("/admin/staff", calendarBody);
    assert.equal(repeatedCalendar.status, 303);
    assert.deepEqual(rows(await get("/admin/orders?q=Series%20Route%20QA")), afterCalendar);
    assert.deepEqual(JSON.parse(await fs.readFile(env.ADMIN_STAFF_STORE_PATH, "utf8")).assignments, teamBefore);
    const stale = await post("/admin/orders", { entryId: id, selectedDate: "2099-11-17", selectedTime: "10:00",
      expectedScheduleDate: "2099-11-08", expectedScheduleTime: "10:00", recurringEditScope: "future" });
    assert.equal(stale.status, 409);
    assert.deepEqual(rows(await get("/admin/orders?q=Series%20Route%20QA")), afterCalendar);
    await post("/admin/orders", { entryId: id, selectedDate: "2099-11-16", selectedTime: "11:00", recurringEditScope: "current" });
    const currentOnly = rows(await get("/admin/orders?q=Series%20Route%20QA"));
    for (const row of afterCalendar) if (row.id !== id) assert.deepEqual(currentOnly.find(item => item.id === row.id), row);
    const audit = await get(`/admin/audit?entityId=${id}`);
    assert.match(audit, /Series Route QA/);
    assert.match(audit, /Общий администратор/);
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
