"use strict";

const { parseFragment, serialize } = require("parse5");
const { WORK_STAGES } = require("../order-operation-permissions");

function renderOrderOperationsPanel(order, returnTo, staffRecords, assignedNames, escapeHtml) {
  if (["completed", "canceled"].includes(order.orderStatus)) return "";
  const hidden = (name, value) => `<input type="hidden" name="${name}" value="${escapeHtml(String(value || ""))}">`;
  const base = hidden("entryId", order.id) + hidden("returnTo", returnTo) + hidden("expectedUpdatedAt", order.entry.updatedAt);
  const form = (action, content) => `<form method="post" action="/admin/orders" class="admin-form-grid" data-admin-save-confirm="true" data-eva-order-operation="true">${hidden("action", action)}${base}${content}</form>`;
  return `<section class="admin-order-section-card"><h3 class="admin-subsection-title">Управление заказом</h3>
    ${form("update-order-operations", `<label class="admin-label">Статус заказа<select class="admin-input" name="orderStatus" required>
      ${Object.hasOwn(WORK_STAGES, order.orderStatus) ? "" : '<option value="" selected disabled>Выберите статус</option>'}
      ${Object.entries(WORK_STAGES).map(([value, label]) => `<option value="${value}"${order.orderStatus === value ? " selected" : ""}>${label}</option>`).join("")}
      </select></label><button type="submit" class="admin-button">Сохранить статус</button>`)}
    <h3 class="admin-subsection-title">Команда</h3>
    ${form("update-order-operations", `<div class="admin-form-grid">${staffRecords.filter(person => person.status !== "inactive").map(person =>
      `<label class="admin-checkbox"><input type="checkbox" name="assignedStaff" value="${escapeHtml(person.name)}"${assignedNames.includes(person.name) ? " checked" : ""}><span>${escapeHtml(person.name)}</span></label>`).join("")}</div>
      <button type="submit" class="admin-button">Сохранить команду</button>`)}
    <h3 class="admin-subsection-title">Оплата</h3>
    ${form("mark-order-paid-cash", '<button type="submit" class="admin-button">Оплачено полностью · Cash</button>')}
  </section>`;
}

function limitOrderDialog(html, panel) {
  const fragment = parseFragment(html);
  const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
  function walk(node, allowedForm = false) {
    const allowed = allowedForm || attr(node, "data-eva-order-operation") !== undefined;
    if (node.childNodes) node.childNodes = node.childNodes.filter(child => {
      if (child.tagName === "form" && attr(child, "data-eva-order-operation") === undefined) return false;
      if (["input", "select", "textarea"].includes(child.tagName) && !allowed) return false;
      if (child.tagName === "button" && !allowed && attr(child, "data-admin-dialog-close") === undefined) return false;
      if (child.tagName === "section" && String(attr(child, "class")).split(" ").includes("admin-order-side-card")) return false;
      walk(child, allowed);
      return true;
    });
    if (node.tagName === "aside" && String(attr(node, "class")).split(" ").includes("admin-order-dialog-side")) {
      const children = parseFragment(panel).childNodes;
      children.forEach(child => { child.parentNode = node; });
      node.childNodes.unshift(...children);
    }
  }
  walk(fragment);
  return serialize(fragment);
}

module.exports = { renderOrderOperationsPanel, limitOrderDialog };
