"use strict";

const {
  fs, os, path, test, assert, loadAdminConfig, createFetchStub, startServer, stopServer,
  createAdminSession, getSetCookies, getCookieValue, submitQuote, getQuoteOpsEntryId,
} = require("./admin-route-helpers");

test("viewer reads all quote tasks and details but every quote mutation is forbidden", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-viewer-quotes-"));
  const usersPath = path.join(tempDir, "users.json");
  const fetchStub = createFetchStub([{
    method: "POST", match: "/contacts/", status: 200, body: { contact: { id: "viewer-test-contact" } },
  }]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    ADMIN_STAFF_STORE_PATH: path.join(tempDir, "staff.json"),
    ADMIN_USERS_STORE_PATH: usersPath,
    GHL_API_KEY: "ghl_test_key", GHL_LOCATION_ID: "location-test",
    GHL_ENABLE_NOTES: "0", GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
  };
  const started = await startServer({ env });
  const post = (route, cookie, values) => fetch(`${started.baseUrl}${route}`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(values),
  });
  const get = async (route, cookie) => {
    const response = await fetch(`${started.baseUrl}${route}`, { redirect: "manual", headers: { cookie } });
    return { status: response.status, html: await response.text() };
  };
  const assertReadOnly = (html) => {
    assert.doesNotMatch(html, /<form\b[^>]*method="post"[^>]*action="\/admin\/quote-ops(?:\/retry)?"/i);
    assert.doesNotMatch(html, /Создать таск|Удалить таск|Удалить заявку|Сохранить этап|Сохранить переход|Подтвердить и создать заказ/);
    assert.doesNotMatch(html, /draggable="true"/);
  };

  try {
    const adminCookie = `shynli_admin_session=${await createAdminSession(started.baseUrl, loadAdminConfig(env))}`;
    for (const [role, email] of [["viewer", "eva@shynli.local"], ["manager", "manager@shynli.local"]]) {
      const response = await post("/admin/settings", adminCookie, {
        action: "create_user", role, email, name: role, password: "TestPass123!",
        status: "active", staffStatus: "active", phone: "3125550100", address: "Test address",
      });
      assert.equal(response.status, 303);
    }
    const login = async (email) => {
      const response = await post("/admin/login", "", { email, password: "TestPass123!" });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/admin");
      const session = getCookieValue(getSetCookies(response), "shynli_user_session");
      assert.ok(session);
      return `shynli_user_session=${session}`;
    };
    const viewerCookie = await login("eva@shynli.local");
    const managerCookie = await login("manager@shynli.local");
    const users = JSON.parse(await fs.readFile(usersPath, "utf8")).users;
    const managerId = users.find((user) => user.role === "manager").id;

    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "viewer-quote", fullName: "Future Task Client", phone: "3125550199", email: "future@example.com",
      serviceType: "deep", selectedDate: "2099-11-20", selectedTime: "09:00",
      fullAddress: "100 Test Street, Naperville, IL 60563",
    });
    assert.equal(quoteResponse.status, 201, await quoteResponse.text());
    const entryId = await getQuoteOpsEntryId(started.baseUrl, adminCookie.split("=")[1], "viewer-quote");
    assert.ok(entryId);
    await post("/admin/quote-ops", adminCookie, {
      action: "update-lead-notes", entryId, notes: "Viewer comment <safe>",
    });
    await post("/admin/quote-ops", adminCookie, {
      action: "update-lead-status", entryId, leadStatus: "discussion", discussionNextContactAt: "2099-11-19T11:30",
    });
    const futureResponse = await post("/admin/quote-ops", managerCookie, {
      action: "create-lead-task", entryId, taskTitle: "Future manual task", taskDueAt: "2099-11-20T12:30", assigneeId: managerId,
    });
    assert.equal(futureResponse.status, 303);
    assert.match(futureResponse.headers.get("location"), /notice=task-created/);
    await post("/admin/quote-ops", adminCookie, {
      action: "create-lead-task", entryId, taskTitle: "Closed manual task", taskDueAt: "2099-11-21T12:30", assigneeId: managerId,
    });
    assert.equal((await post("/admin/quote-ops", managerCookie, {
      action: "create-lead-task", entryId: "standalone", taskTitle: "Late standalone task",
      taskDueAt: "2099-11-20T23:30", assigneeId: managerId,
    })).status, 303);
    const managerTasks = await get("/admin/quote-ops?section=tasks", managerCookie);
    const taskDialogs = Array.from(managerTasks.html.matchAll(/<dialog\b[^>]*id="admin-quote-task-result-dialog-([^"]+)"[^>]*>[\s\S]*?<\/dialog>/g));
    const futureId = taskDialogs.find((match) => match[0].includes("Future manual task"))[1];
    const closedId = taskDialogs.find((match) => match[0].includes("Closed manual task"))[1];
    assert.equal((await post("/admin/quote-ops", managerCookie, {
      action: "complete-lead-task", entryId, taskId: closedId, taskAction: "complete",
    })).status, 303);

    for (const route of ["/admin/quote-ops", "/admin/quote-ops?section=funnel", "/admin/quote-ops?section=tasks"]) {
      const page = await get(route, viewerCookie);
      assert.equal(page.status, 200);
      assertReadOnly(page.html);
      assert.match(page.html, /href="\/admin\/quote-ops"/);
      assert.match(page.html, /href="\/admin\/quote-ops\?section=tasks"/);
      assert.doesNotMatch(page.html, /href="\/admin\/(staff|settings)"/);
    }
    const tasks = await get("/admin/quote-ops?section=tasks", viewerCookie);
    assert.match(tasks.html, /Future manual task/);
    assert.match(tasks.html, /Closed manual task/);
    assert.match(tasks.html, /Late standalone task/);
    assert.match(tasks.html, /Без клиента/);
    assert.match(tasks.html, /Viewer comment &lt;safe&gt;/);
    assert.match(tasks.html, /2099/);
    assert.match(tasks.html, /Future Task Client/);
    assert.match(tasks.html, /Генеральная уборка/);
    assert.match(tasks.html, /admin-quote-task-dialog-manager">manager<\/p>/);

    const filtered = await get("/admin/quote-ops?section=tasks&taskStatus=open&dueFrom=2099-11-20&dueTo=2099-11-20", viewerCookie);
    assert.match(filtered.html, /Future manual task/);
    assert.match(filtered.html, /Late standalone task/);
    assert.doesNotMatch(filtered.html, /Closed manual task/);
    assert.match(filtered.html, /name="dueFrom" value="2099-11-20"/);
    const closed = await get("/admin/quote-ops?section=tasks&taskStatus=completed", viewerCookie);
    assert.match(closed.html, /Closed manual task/);
    assert.doesNotMatch(closed.html, /Future manual task/);
    assert.doesNotMatch(closed.html, /Late standalone task/);
    const nextDay = await get("/admin/quote-ops?section=tasks&taskStatus=open&dueFrom=2099-11-21&dueTo=2099-11-21", viewerCookie);
    assert.doesNotMatch(nextDay.html, /Late standalone task/);

    for (const route of [
      `/admin/quote-ops?entry=${entryId}`,
      `/admin/quote-ops?fragment=entry-dialog&entry=${entryId}`,
      `/admin/quote-ops?section=tasks&task=${futureId}`,
    ]) {
      const detail = await get(route, viewerCookie);
      assert.equal(detail.status, 200);
      assertReadOnly(detail.html);
      assert.match(detail.html, /Viewer comment &lt;safe&gt;/);
      if (!route.includes("fragment=")) assert.match(detail.html, /<dialog\b[^>]* open data-admin-dialog-server-open="true"/);
    }

    for (const action of [
      "create-lead-task", "complete-lead-task", "delete-lead-task", "update-lead-notes",
      "update-lead-status", "update-lead-manager", "send-quote-sms", "create-order-from-request",
      "delete-lead-entry", "load-quote-sms-history", "unknown-action",
    ]) {
      assert.equal((await post("/admin/quote-ops", viewerCookie, {
        action, entryId, taskId: futureId, notes: "Forbidden change", leadStatus: "confirmed",
        message: "Do not send", taskTitle: "Do not create", taskDueAt: "2099-11-20T09:00", assigneeId: managerId,
      })).status, 403, action);
    }
    assert.equal((await post("/admin/quote-ops/retry", viewerCookie, { entryId })).status, 403);
    assert.equal((await post("/admin/orders", viewerCookie, { entryId, paymentStatus: "paid" })).status, 403);
    assert.equal((await post("/admin/clients", viewerCookie, { action: "save-client" })).status, 403);
    assert.equal((await get("/admin/orders", viewerCookie)).status, 200);
    assert.equal((await get("/admin/clients", viewerCookie)).status, 200);

    for (const cookie of [adminCookie, managerCookie]) {
      const editable = await get(`/admin/quote-ops?entry=${entryId}`, cookie);
      assert.equal(editable.status, 200);
      assert.match(editable.html, /name="action" value="update-lead-status"/);
      assert.match(editable.html, /name="action" value="delete-lead-entry"/);
      assert.match(editable.html, /name="action" value="create-order-from-request"/);
      assert.equal((await post("/admin/quote-ops", cookie, { action: "update-lead-notes", entryId, notes: "Allowed update" })).status, 303);
      const page = await get("/admin/quote-ops?section=tasks", cookie);
      assert.match(page.html, /Создать таск/);
      assert.doesNotMatch(page.html, /Closed manual task/);
    }
    const finalTasks = await get("/admin/quote-ops?section=tasks", viewerCookie);
    assert.match(finalTasks.html, /Future manual task/);
    assert.doesNotMatch(finalTasks.html, /Do not create|Forbidden change/);
  } finally {
    await stopServer(started.child);
    fetchStub.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
