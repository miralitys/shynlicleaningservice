"use strict";

const { getEntryOrderState, setEntryOrderState } = require("../admin-order-state");
const { buildOrderPayrollSnapshot } = require("../payroll");
const { invalidateAdminReads } = require("./read-context");

async function persistLimitedOrderOperations({ entry, updates, staffIds, staffStore, ledger, actor, auditContext,
  env = process.env, fetch: fetchImpl = global.fetch }) {
  const snapshot = await staffStore.getSnapshot({ allowMemoryFallback: false });
  if (staffIds && staffIds.some(id => !(snapshot.staff || []).some(person => person.id === id && person.status !== "inactive"))) {
    throw Object.assign(new Error("Состав сотрудников изменился. Обновите карточку."), { status: 409 });
  }
  const previous = (snapshot.assignments || []).find(item => item.entryId === entry.id) || null;
  const next = structuredClone(entry), state = structuredClone(getEntryOrderState(entry));
  if (updates.orderStatus !== undefined) state.status = updates.orderStatus;
  if (updates.assignedStaff !== undefined) state.assignedStaff = updates.assignedStaff;
  if (updates.managerConfirmedAt !== undefined) state.managerConfirmedAt = updates.managerConfirmedAt;
  state.updatedAt = new Date().toISOString();
  setEntryOrderState(next, state);
  const assignmentChanged = Boolean(staffIds && (staffIds.length !== (previous?.staffIds || []).length || staffIds.some(id => !previous?.staffIds.includes(id))));
  const assignment = staffIds || (updates.orderStatus === "scheduled" && previous) ? { ...previous, entryId: entry.id, staffIds: staffIds || previous.staffIds,
    scheduleDate: previous?.scheduleDate || "", scheduleTime: previous?.scheduleTime || "",
    status: state.status === "scheduled" ? "confirmed" : previous?.status === "canceled" ? "planned" : previous?.status || "planned",
    notes: previous?.notes || "", calendarSync: previous?.calendarSync || null, travelEstimates: previous?.travelEstimates || [] } : null;
  // Status changes must not recalculate compensation. Team changes use the
  // established formula, preserving settled items and manual overrides.
  if (assignmentChanged) state.payroll = buildOrderPayrollSnapshot({ entry: next, assignment,
    staffRecords: snapshot.staff || [], existingPayroll: state.payroll || { items: [] } });
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  let saved;
  if (url && key) {
    const headers = { apikey: key, "Content-Type": "application/json" };
    if (!/^sb_(secret|publishable)_/.test(key)) headers.Authorization = `Bearer ${key}`;
    const response = await fetchImpl(new URL("/rest/v1/rpc/update_order_operations", url), { method: "POST", headers,
      signal: AbortSignal.timeout(15000), body: JSON.stringify({ p_record_id: entry.id, p_expected_updated_at: entry.updatedAt,
        p_expected_assignment_updated_at: previous?.updatedAt || null, p_order_state: state, p_assignment: assignment,
        p_actor: actor, p_audit_context: auditContext || {} }) });
    if (!response.ok) throw Object.assign(new Error(response.status === 409 ? "Заказ или команда уже изменились. Обновите карточку." : "Не удалось сохранить заказ и команду."),
      { status: response.status === 409 ? 409 : 503 });
    await response.json();
    invalidateAdminReads();
    saved = await ledger.getEntry(entry.id, { allowMemoryFallback: false });
  } else {
    if (typeof staffStore.saveOrderOperations !== "function") throw new Error("Atomic order operations unavailable");
    saved = await staffStore.saveOrderOperations(entry, { ...updates, ...(assignmentChanged ? { payroll: state.payroll } : {}) }, assignment, previous?.updatedAt || null, ledger);
  }
  return { entry: saved, assignment: assignment || previous, assignmentChanged };
}

module.exports = { persistLimitedOrderOperations };
