"use strict";

const { sanitizeStaffAvailabilityBlocks, normalizeStaffAvailabilityDate } = require("../../staff-availability");
const { chicagoDateTime } = require("../../quote-ops/task-policy");

async function renderStaffAvailabilityPage(reqUrl, staffStore, accessContext, renderers) {
  const { escapeHtml, escapeHtmlAttribute, renderAdminLayout, renderAdminAppSidebar } = renderers;
  const path = "/admin/quote-ops?section=availability";
  const from = normalizeStaffAvailabilityDate(reqUrl.searchParams.get("dateFrom")) || chicagoDateTime().slice(0, 10);
  const to = normalizeStaffAvailabilityDate(reqUrl.searchParams.get("dateTo"));
  const snapshot = staffStore ? await staffStore.getSnapshot() : { staff: [] };
  const rows = (snapshot.staff || []).flatMap((staff) =>
    sanitizeStaffAvailabilityBlocks(staff.availabilityBlocks || staff.manualAvailabilityBlocks)
      .filter((block) => block.endDate > from && (!to || block.date <= to))
      .map((block) => ({ ...block, name: staff.name || staff.fullName || "Сотрудник" }))
  ).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return renderAdminLayout("Занятость клинеров", `
    <form method="get" action="/admin/quote-ops" class="admin-form-grid">
      <input type="hidden" name="section" value="availability">
      <label>С даты<input class="admin-input" type="date" name="dateFrom" value="${escapeHtmlAttribute(from)}"></label>
      <label>По дату<input class="admin-input" type="date" name="dateTo" value="${escapeHtmlAttribute(to)}"></label>
      <button class="admin-button" type="submit">Показать</button>
    </form>
    <div class="admin-table-wrap"><table class="admin-table" data-admin-staff-availability="true">
      <thead><tr><th>Сотрудник</th><th>Дата</th><th>С</th><th>До</th><th>Комментарий</th></tr></thead>
      <tbody>${rows.map((block) => `<tr><td>${escapeHtml(block.name)}</td>
        <td>${escapeHtml(block.date)}${block.allDay ? " (весь день)" : ""}</td>
        <td>${escapeHtml(block.startTime || "00:00")}</td><td>${escapeHtml(block.endTime || "24:00")}</td>
        <td>${escapeHtml([block.summary, block.notes].filter(Boolean).join(". "))}</td></tr>`).join("") ||
        '<tr><td colspan="5">За выбранные даты занятость не отмечена.</td></tr>'}</tbody>
    </table></div>`, {
    kicker: false, readOnly: true, sidebar: renderAdminAppSidebar(path, accessContext),
  });
}

module.exports = { renderStaffAvailabilityPage };
