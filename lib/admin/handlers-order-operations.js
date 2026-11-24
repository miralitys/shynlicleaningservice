"use strict";

const { canUpdateOrderOperations, validateOperationalRequest, ORDER_OPERATIONS_PERMISSION } = require("./order-operation-permissions");
const { createAdminDomainHelpers } = require("./domain");
const { getEntryOrderState } = require("../admin-order-state");
const { getAuditMetadata } = require("../admin-audit");
const { invalidateAdminReads } = require("./read-context");
const { persistLimitedOrderOperations } = require("./order-operations-store");
const normalizeString = (value, max = 500) => String(value || "").trim().slice(0, max);
const domain = createAdminDomainHelpers({ normalizeString });

function createOrderOperationsHandler(deps, handleOrderUpdateAction) {
  return async function handle(context, body, isJson) {
    const { req, res, currentUserAccess: access, quoteOpsLedger: ledger, profitabilityStore, requestStartNs, requestContext } = context;
    const json = (status, data) => { res.setHeader("Cache-Control", "no-store"); deps.writeJsonWithTiming(res, status, data, requestStartNs, false); };
    try {
      if (!canUpdateOrderOperations(access) || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) {
        throw Object.assign(new Error("Доступ запрещён."), { status: 403 });
      }
      validateOperationalRequest(body);
      const currentEntry = await ledger.getEntry(body.entryId, { allowMemoryFallback: false });
      if (!currentEntry || !domain.isOrderCreatedEntry(currentEntry) || currentEntry.payloadForRetry?.orderTrash) {
        throw Object.assign(new Error("Заказ не найден."), { status: 404 });
      }
      if (["completed", "canceled"].includes(domain.getOrderStatus(currentEntry))) {
        throw Object.assign(new Error("Закрытый заказ недоступен для изменения."), { status: 403 });
      }
      if (currentEntry.updatedAt !== body.expectedUpdatedAt) throw Object.assign(new Error("Заказ уже изменился. Обновите карточку."), { status: 409 });
      const returnTo = deps.buildOrdersReturnPath(body.returnTo || "/admin/orders");
      if (body.action === "mark-order-paid-cash") {
        if (!profitabilityStore?.saveCashPayment) throw new Error("Payment storage unavailable");
        const old = await profitabilityStore.get(body.entryId);
        const { actor, ...metadata } = getAuditMetadata();
        const paidAt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const result = await profitabilityStore.saveCashPayment(currentEntry, old.version, { ...actor, permission: ORDER_OPERATIONS_PERMISSION }, paidAt, ledger, metadata);
        invalidateAdminReads();
        if (isJson || String(req.headers.accept || "").includes("application/json")) {
          json(200, { ok: true, entryId: body.entryId, paidCents: result.data.paidCents, paymentMethod: "cash", orderUpdatedAt: result.orderUpdatedAt });
        } else deps.redirectWithTiming(res, 303, deps.buildOrdersRedirect(returnTo, "order-saved", { order: body.entryId }), requestStartNs, false);
        return;
      }
      let staffIds;
      if (body.assignedStaff !== undefined) {
        const names = Array.isArray(body.assignedStaff) ? body.assignedStaff : [body.assignedStaff];
        const resolved = await deps.resolveAssignableStaffIdsByNames(context.staffStore, context.usersStore, names);
        const activeIds = new Set((resolved.snapshot?.staff || []).filter(person => person.status !== "inactive").map(person => person.id));
        if (resolved.staffIds.length !== names.length || resolved.staffIds.some(id => !activeIds.has(id))) {
          throw Object.assign(new Error("Выберите действующих сотрудников из списка."), { status: 400 });
        }
        staffIds = resolved.staffIds;
      }
      await handleOrderUpdateAction({ ...context, action: "update-order", formBody: body, entryId: body.entryId, returnTo,
        currentEntry, limitedOrderOperations: true, ajaxRequest: isJson || deps.isAjaxMutationRequest(req),
        persistLimitedOrderOperations: updates => {
          const { actor, ...auditContext } = getAuditMetadata();
          return persistLimitedOrderOperations({ entry: currentEntry, updates, staffIds, staffStore: context.staffStore, ledger,
            actor: { ...actor, permission: ORDER_OPERATIONS_PERMISSION }, auditContext });
        } });
    } catch (error) {
      json(error.status || 503, { ok: false, message: error.status ? error.message : "Не удалось сохранить изменения. Обновите карточку и повторите попытку." });
    }
  };
}

module.exports = { createOrderOperationsHandler };
