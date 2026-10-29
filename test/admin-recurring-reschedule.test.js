"use strict";

const { test, assert, fs, os, path, startServer, stopServer, createAdminSession, loadAdminConfig } = require("./admin-route-helpers");

for (const scenario of [
  { name: "monthly cadence", frequency: "monthly", expectedCount: 8, nextDates: ["20990424", "20990524", "20990624", "20990724", "20990824", "20990924"] },
  { name: "weekly series moved to a new weekday", frequency: "weekly", expectedCount: 28,
    nextDates: Array.from({ length: 26 }, (_, index) => new Date(Date.UTC(2099, 2, 24 + (index + 1) * 7)).toISOString().slice(0, 10).replaceAll("-", "")) },
  { name: "stop repetition", frequency: "", expectedCount: 2, nextDates: [] },
]) test(`rescheduled ${scenario.name} is applied only after confirmation, preserving prices, teams and history`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-deferred-cadence-"));
  const env = { ADMIN_MASTER_SECRET: "isolated-deferred-cadence", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    GHL_API_KEY: "", GHL_LOCATION_ID: "", PROFITABILITY_ENABLED: "0", ADMIN_STAFF_STORE_PATH: path.join(root, "staff.json") };
  await fs.writeFile(env.ADMIN_STAFF_STORE_PATH, JSON.stringify({ staff: [{ id: "a", name: "Cleaner A", role: "cleaner", status: "active" },
    { id: "b", name: "Cleaner B", role: "cleaner", status: "active" }], assignments: [] }));
  const app = await startServer({ env });
  try {
    const cookie = `shynli_admin_session=${await createAdminSession(app.baseUrl, loadAdminConfig(env))}`;
    const post = values => fetch(app.baseUrl + "/admin/orders", { method: "POST", redirect: "manual",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
    const create = async (date, price, frequency = "") => {
      const response = await post({ action: "create-manual-order", customerName: "Cadence QA", customerPhone: "6305550183", fullAddress: "100 Local Test Street",
        totalPrice: price, selectedDate: date, selectedTime: "10:00", serviceType: "standard", serviceDurationHours: "3", frequency });
      assert.equal(response.status, 303);
      const id = new URL(response.headers.get("location"), app.baseUrl).searchParams.get("order");
      assert.ok(id);
      return id;
    };
    const update = async (entryId, fields) => {
      const response = await post({ action: "update-order", entryId, ...fields });
      assert.equal(response.status, 303);
      assert.match(response.headers.get("location") || "", /notice=order-saved/);
    };
    const read = async () => {
      const response = await fetch(app.baseUrl + "/admin/orders?q=Cadence%20QA", { headers: { cookie } });
      assert.equal(response.status, 200);
      return new Map([...((await response.text()).matchAll(/<article\b[^>]*data-order-entry-id="([^"]+)"[\s\S]*?<\/article>/g))].map(match => [match[1], match[0]]));
    };
    const historyId = await create("2099-03-01", "190");
    await update(historyId, { assignedStaff: "Cleaner B", orderStatus: "cleaning-complete" });
    const id = await create("2099-03-22", "280", "weekly");
    await update(id, { orderStatus: "scheduled", assignedStaff: "Cleaner A", recurringEditScope: "future" });
    const before = await read();
    assert.equal(before.size, 28, "one historical visit plus a six-month weekly series");
    await update(id, { orderStatus: "rescheduled", selectedDate: "2099-03-24", selectedTime: "10:00", frequency: scenario.frequency, recurringEditScope: "future" });
    const paused = await read();
    assert.equal(paused.size, before.size);
    for (const [entryId, card] of before) if (entryId !== id) assert.equal(paused.get(entryId), card, "pending rescheduling does not rewrite sibling visits");
    await update(id, { orderStatus: "cleaning-complete" });
    const after = await read();
    assert.equal(after.size, scenario.expectedCount, "only the requested cadence remains, without both schedules");
    if (scenario.frequency === "weekly") assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "a date-only move keeps every existing order ID");
    assert.equal(after.get(historyId), before.get(historyId));
    for (const [entryId, card] of after) if (entryId !== historyId) {
      assert.match(card, /\$280\.00/);
      assert.match(card, /Cleaner A/);
      assert.doesNotMatch(card, /Cleaner B/);
      if (scenario.frequency !== "weekly") assert.doesNotMatch(card, /Weekly/);
    }
    for (const date of scenario.nextDates) {
      const label = `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`;
      assert.equal([...after.values()].filter(card => card.includes(label)).length, 1, `exactly one visit on ${label}`);
    }
    await update(id, { paymentStatus: "paid" });
    const paid = await read();
    assert.equal(paid.size, after.size);
    for (const [entryId, card] of after) if (entryId !== id) assert.equal(paid.get(entryId), card, "subsequent payment edits never extend or rewrite the series");
  } finally { await stopServer(app.child); await fs.rm(root, { recursive: true, force: true }); }
});
