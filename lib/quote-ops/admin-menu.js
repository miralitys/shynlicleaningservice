"use strict";

const { projectOrderListEntry } = require("./order-list");

const ADMIN_MENU_VIEW = "admin_menu_entries";
const ADMIN_MENU_SELECT = "id,kind,status,created_at,updated_at,code," +
  ["orderState", "adminOrder", "adminLead"].map(key => `menu_${key}:payload_for_retry->${key}`).join(",");

function projectAdminMenuEntry(entry) {
  const summary = projectOrderListEntry(entry);
  const source = summary.payloadForRetry || {};
  const lead = source.adminLead;
  return {
    id: summary.id, kind: summary.kind, status: summary.status, code: summary.code,
    createdAt: summary.createdAt, updatedAt: summary.updatedAt,
    payloadForRetry: {
      orderState: source.orderState ?? null, adminOrder: source.adminOrder ?? null,
      adminLead: lead && typeof lead === "object" && !Array.isArray(lead) ? {
        status: lead.status,
        tasks: Array.isArray(lead.tasks) ? lead.tasks.map(task => {
          if (!task || typeof task !== "object" || Array.isArray(task)) return task;
          return { id: task.id, status: task.status };
        }) : lead.tasks,
      } : lead ?? null,
    },
  };
}

function hydrateAdminMenuRow(row) {
  return { ...row, payload_for_retry: Object.fromEntries(
    ["orderState", "adminOrder", "adminLead"].map(key => [key, row[`menu_${key}`]])) };
}

module.exports = { ADMIN_MENU_VIEW, ADMIN_MENU_SELECT, projectAdminMenuEntry, hydrateAdminMenuRow };
