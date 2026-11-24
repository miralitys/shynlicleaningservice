"use strict";

const ORDER_OPERATIONS_PERMISSION = "orders.update_operations";
const WORK_STAGES = Object.freeze({ scheduled: "Запланировано", "en-route": "В пути", "cleaning-started": "Начать уборку",
  checklist: "Чеклист", photos: "Фото", "cleaning-complete": "Уборка завершена", "awaiting-review": "Ждем отзыв", completed: "Завершено" });

function canUpdateOrderOperations(access = {}) {
  return access.authorized === true && access.role === "viewer" && access.user?.status === "active" &&
    Boolean(access.user.id) && String(access.user.email || "").trim().toLowerCase() === "eva@shynli.local";
}

function validateOperationalRequest(body) {
  const action = body?.action;
  const common = ["action", "entryId", "returnTo", "expectedUpdatedAt"];
  const allowed = action === "update-order-operations" ? [...common, "orderStatus", "assignedStaff"] :
    action === "mark-order-paid-cash" ? common : [];
  const deny = () => { throw Object.assign(new Error("Это действие или поле недоступно для изменения."), { status: 403 }); };
  if (!allowed.length || Object.keys(body || {}).some(key => !allowed.includes(key))) deny();
  for (const key of common) if (body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 1000)) deny();
  if (!body.entryId || !body.expectedUpdatedAt || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    throw Object.assign(new Error("Обновите карточку перед сохранением."), { status: 409 });
  }
  if (body.orderStatus !== undefined && (typeof body.orderStatus !== "string" || !Object.hasOwn(WORK_STAGES, body.orderStatus))) deny();
  if (action === "update-order-operations" && body.orderStatus === undefined && body.assignedStaff === undefined) deny();
  if (body.assignedStaff !== undefined) {
    const names = Array.isArray(body.assignedStaff) ? body.assignedStaff : [body.assignedStaff];
    if (!names.length || names.length > 6 || names.some(name => typeof name !== "string" || !name.trim() || name.length > 120) ||
      new Set(names.map(name => name.trim().toLowerCase())).size !== names.length) {
      throw Object.assign(new Error("Выберите сотрудников из списка."), { status: 400 });
    }
  }
}

module.exports = { ORDER_OPERATIONS_PERMISSION, WORK_STAGES, canUpdateOrderOperations, validateOperationalRequest };
