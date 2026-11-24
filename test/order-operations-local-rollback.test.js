"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createAdminStaffStore } = require("../lib/admin-staff-store");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { persistLimitedOrderOperations } = require("../lib/admin/order-operations-store");

const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-operations-rollback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "staff.json");
  const staffStore = createAdminStaffStore({ filePath: file, env: {} });
  const a = await staffStore.createStaff({ name: "A", status: "active", compensationType: "fixed", compensationValue: "150" });
  const b = await staffStore.createStaff({ name: "B", status: "active", compensationType: "fixed", compensationValue: "100" });
  const ledger = createQuoteOpsStore({ ...domain, normalizeString, env: {}, QUOTE_OPS_LEDGER_LIMIT: 25 });
  const created = await ledger.recordSubmission({ ok: true, customerName: "Local rollback QA", totalPrice: 374,
    serviceType: "standard", selectedDate: "2099-12-21", selectedTime: "09:00" });
  await ledger.updateOrderEntry(created.id, { createOrder: true, orderStatus: "cleaning-complete", assignedStaff: "A",
    serviceDurationMinutes: 285, paymentStatus: "unpaid", paymentMethod: "check",
    payrollOverrides: { [a.id]: "150.00" }, payroll: { items: [{ staffId: a.id, staffName: "A", status: "paid", amountCents: 15000,
      paidAt: "2026-11-23", paidByName: "Owner", paidByEmail: "owner@example.test" }] },
    policyAcceptance: { policyAccepted: true, signedAt: "2026-11-20", certificateFile: { id: "keep-certificate" } } });
  await staffStore.setAssignment(created.id, { staffIds: [a.id], status: "confirmed", scheduleDate: "2099-12-22", scheduleTime: "11:00", notes: "Keep notes" });
  const entry = await ledger.getEntry(created.id);
  const before = structuredClone(entry);
  const beforeStaff = await staffStore.getSnapshot();
  const beforeFile = await fs.readFile(file, "utf8");
  return { root, file, staffStore, ledger, entry, before, beforeStaff, beforeFile, b };
}

for (const kind of ["live entry", "cloned entry", "status only"]) {
  test(`local operations rename failure restores work stage and scoped fields with ${kind}`, async t => {
    const context = await fixture(t);
    const rename = fs.rename;
    const failure = Object.assign(new Error("Injected assignment rename failure"), { code: "EIO" });
    t.mock.method(fs, "rename", async (from, to) => {
      if (to === context.file) throw failure;
      return rename(from, to);
    });

    await assert.rejects(persistLimitedOrderOperations({
      entry: kind === "cloned entry" ? structuredClone(context.entry) : context.entry,
      updates: { orderStatus: "photos", ...(kind === "status only" ? {} : { assignedStaff: "B" }) },
      ...(kind === "status only" ? {} : { staffIds: [context.b.id] }),
      staffStore: context.staffStore, ledger: context.ledger, env: {}, actor: { id: "eva" },
    }), error => error === failure);

    const after = await context.ledger.getEntry(context.entry.id);
    const state = getEntryOrderState(after);
    const previous = getEntryOrderState(context.before);
    assert.equal(state.status, "cleaning-complete");
    assert.equal(state.assignedStaff, "A");
    assert.deepEqual(state.payroll, previous.payroll);
    assert.deepEqual({ ...state, updatedAt: previous.updatedAt }, previous);
    for (const key of ["totalPrice", "selectedDate", "selectedTime", "serviceDurationMinutes"]) assert.equal(after[key], context.before[key]);
    assert.deepEqual(await context.staffStore.getSnapshot(), context.beforeStaff);
    assert.equal(await fs.readFile(context.file, "utf8"), context.beforeFile);
    assert.deepEqual(await fs.readdir(context.root), ["staff.json"]);
  });
}

test("local operations compensation does not overwrite a newer order mutation", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-24T12:00:00.000Z") });
  const context = await fixture(t);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (from, to) => {
    if (to !== context.file) return rename(from, to);
    t.mock.timers.tick(1);
    await context.ledger.updateOrderEntry(context.entry.id, { orderStatus: "en-route", totalPrice: 410 });
    throw Object.assign(new Error("Injected assignment rename failure"), { code: "EIO" });
  });

  await assert.rejects(persistLimitedOrderOperations({ entry: context.entry,
    updates: { orderStatus: "photos", assignedStaff: "B" }, staffIds: [context.b.id],
    staffStore: context.staffStore, ledger: context.ledger, env: {}, actor: { id: "eva" },
  }), error => error.status === 409);
  const after = await context.ledger.getEntry(context.entry.id);
  assert.equal(getEntryOrderState(after).status, "en-route");
  assert.equal(after.totalPrice, 410);
  assert.equal(await fs.readFile(context.file, "utf8"), context.beforeFile);
});
