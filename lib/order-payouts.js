"use strict";

const { getEntryOrderState, setEntryOrderState } = require("./admin-order-state");
const { getEntryPayrollData, buildOrderPayrollSnapshot, getEntryOrderStatus, isPayrollEligibleOrderStatus, parseAmountCents } = require("./payroll");

function orderPayouts(entry, team = []) {
  const overrides = getEntryOrderState(entry).payrollOverrides || {};
  const items = getEntryPayrollData(entry).items;
  const ids = [...new Set([...team.map(person => person.id), ...items.map(item => item.staffId)])];
  return ids.map(staffId => {
    const item = items.find(item => item.staffId === staffId);
    // Settled payroll is immutable, including an explicitly paid zero amount.
    const value = item?.status === "paid" ? item.amountCents :
      Object.hasOwn(overrides, staffId) && String(overrides[staffId]).trim() !== "" ? parseAmountCents(overrides[staffId]) :
        item?.amountCents ?? null;
    return { staffId, cents: value };
  });
}

function prepareOrderPayouts(entry, payouts, team, staffRecords) {
  const before = orderPayouts(entry, team);
  const state = getEntryOrderState(entry);
  const overrides = { ...(state.payrollOverrides || {}) };
  const payroll = getEntryPayrollData(entry);
  let changed = false;
  for (const payout of payouts) {
    if (before.find(item => item.staffId === payout.staffId)?.cents === payout.cents) continue;
    if (payroll.items.some(item => item.staffId === payout.staffId && item.status === "paid")) {
      throw Object.assign(new Error("Выплата уже выдана. Изменять её сумму нельзя."), { status: 409 });
    }
    if (!team.some(person => person.id === payout.staffId)) {
      throw Object.assign(new Error("Нельзя менять выплату сотруднику вне команды заказа."), { status: 403 });
    }
    changed = true;
    if (payout.cents === null) delete overrides[payout.staffId];
    else overrides[payout.staffId] = (payout.cents / 100).toFixed(2);
  }
  if (!changed) return { changed: false, before, after: before };
  const next = structuredClone(entry);
  const nextState = { ...getEntryOrderState(next), payrollOverrides: overrides };
  setEntryOrderState(next, nextState);
  if (isPayrollEligibleOrderStatus(getEntryOrderStatus(next))) {
    nextState.payroll = buildOrderPayrollSnapshot({ entry: next, assignment: { staffIds: team.map(person => person.id) }, staffRecords, existingPayroll: payroll });
    const settled = new Map((state.payroll?.items || []).filter(item => item.status === "paid").map(item => [item.staffId, item]));
    nextState.payroll.items = nextState.payroll.items.map(item => settled.get(item.staffId) || item);
  }
  setEntryOrderState(next, nextState);
  return { changed: true, before, after: orderPayouts(next, team), overrides, payroll: nextState.payroll ?? null, expectedUpdatedAt: entry.updatedAt };
}

const revisions = new WeakMap();
function payoutRevision(ledger) { return revisions.get(ledger) || 0; }
function invalidatePayoutCache(ledger) { revisions.set(ledger, payoutRevision(ledger) + 1); }

module.exports = { orderPayouts, prepareOrderPayouts, payoutRevision, invalidatePayoutCache };
