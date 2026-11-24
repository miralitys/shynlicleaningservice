"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createProfitabilityStore } = require("../lib/profitability-store");
const { createQuoteOpsStore } = require("../lib/quote-ops/store");
const { createAdminDomainHelpers } = require("../lib/admin/domain");

const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });
const actor = { id: "eva", permission: "orders.update_operations" };

async function fixture(t, existingFinance) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-cash-rollback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "finance.json");
  const ledger = createQuoteOpsStore({ ...domain, normalizeString, env: {}, QUOTE_OPS_LEDGER_LIMIT: 25 });
  const created = await ledger.recordSubmission({ ok: true, customerName: "Local Cash QA", totalPrice: 374 });
  await ledger.updateOrderEntry(created.id, { createOrder: true, orderStatus: "scheduled", paymentStatus: "unpaid", paymentMethod: "check" });
  const entry = structuredClone(await ledger.getEntry(created.id));
  let previousFile;
  if (existingFinance) {
    previousFile = JSON.stringify({ records: {
      [entry.id]: { id: entry.id, version: 2, data: { basePriceCents: 37400, paidCents: 10000, paymentMethod: "check", comment: "Keep" } },
      settings: { id: "settings", version: 1, data: { configured: true } },
    }, events: [{ id: "previous-event", record_id: entry.id, actor: { id: "owner" } }] }, null, 2);
    await fs.writeFile(file, previousFile, { mode: 0o600 });
  }
  const store = createProfitabilityStore({ env: { PROFITABILITY_STORE_PATH: file } });
  const save = () => store.saveCashPayment(entry, existingFinance ? 2 : 0, actor, "2026-11-24", ledger, {});
  const unchangedFinance = async () => {
    if (existingFinance) assert.equal(await fs.readFile(file, "utf8"), previousFile);
    else await assert.rejects(fs.stat(file), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(root), existingFinance ? ["finance.json"] : []);
  };
  return { root, file, ledger, entry, store, save, unchangedFinance, previousFile };
}

for (const existingFinance of [false, true]) {
  test(`local Cash finance rename failure preserves order and ${existingFinance ? "existing" : "absent"} finance`, async t => {
    const context = await fixture(t, existingFinance);
    const rename = fs.rename;
    const failure = Object.assign(new Error("Injected finance rename failure"), { code: "EIO" });
    const mock = t.mock.method(fs, "rename", async (from, to) => {
      if (to === context.file) throw failure;
      return rename(from, to);
    });

    await assert.rejects(context.save(), error => error === failure);
    assert.deepEqual(await context.ledger.getEntry(context.entry.id), context.entry);
    await context.unchangedFinance();
    mock.mock.restore();

    const saved = await context.save();
    assert.equal(saved.version, existingFinance ? 3 : 1);
    assert.equal(saved.data.paidCents, 37400);
    assert.equal(saved.data.paymentMethod, "cash");
    const finance = JSON.parse(await fs.readFile(context.file, "utf8"));
    assert.equal(finance.events.length, existingFinance ? 2 : 1);
    assert.equal(finance.events.at(-1).actor.id, "eva");
  });

  test(`local Cash order rejection restores ${existingFinance ? "existing finance and journal" : "absence of finance"}`, async t => {
    const context = await fixture(t, existingFinance);
    const failure = Object.assign(new Error("Injected order conflict"), { code: "40001", status: 409 });
    t.mock.method(context.ledger, "updateOrderEntry", async () => { throw failure; });

    await assert.rejects(context.save(), error => error === failure);
    assert.deepEqual(await context.ledger.getEntry(context.entry.id), context.entry);
    await context.unchangedFinance();
    assert.equal((await context.store.get(context.entry.id)).version, existingFinance ? 2 : 0);
  });
}

test("local Cash null order result restores the previous finance file", async t => {
  const context = await fixture(t, true);
  t.mock.method(context.ledger, "updateOrderEntry", async () => null);

  await assert.rejects(context.save(), /Order was not saved/);
  assert.deepEqual(await context.ledger.getEntry(context.entry.id), context.entry);
  await context.unchangedFinance();
});

test("local Cash rollback failure reports both errors and retains its recovery snapshot", async t => {
  const context = await fixture(t, true);
  const orderFailure = new Error("Injected order rejection");
  const rollbackFailure = Object.assign(new Error("Injected rollback failure"), { code: "EIO" });
  const rename = fs.rename;
  t.mock.method(context.ledger, "updateOrderEntry", async () => { throw orderFailure; });
  t.mock.method(fs, "rename", async (from, to) => {
    if (from.endsWith(".rollback")) throw rollbackFailure;
    return rename(from, to);
  });

  await assert.rejects(context.save(), error => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [orderFailure, rollbackFailure]);
    return true;
  });
  assert.deepEqual(await context.ledger.getEntry(context.entry.id), context.entry);
  const files = await fs.readdir(context.root);
  const recovery = files.find(name => name.endsWith(".rollback"));
  assert(recovery, "failed compensation must retain the previous file for recovery");
  assert.equal(await fs.readFile(path.join(context.root, recovery), "utf8"), context.previousFile);
  assert.equal(files.length, 2);
});
