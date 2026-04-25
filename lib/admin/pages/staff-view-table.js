"use strict";

function createStaffViewTableHelpers(deps = {}) {
  const {
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminPhoneNumber,
    formatOrderCountLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getStaffDialogId,
    getStaffNextOrderName,
    renderStaffEditDialog,
    renderStaffStatusBadge,
  } = deps;

  function renderStaffTableRow(staffSummary) {
    const contactBits = [];
    const formattedPhone = formatAdminPhoneNumber(staffSummary.phone);
    if (formattedPhone) {
      contactBits.push(`<span class="admin-table-strong">${escapeHtml(formattedPhone)}</span>`);
    }
    if (staffSummary.email) {
      contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.email)}</span>`);
    }
    if (staffSummary.address) {
      contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.address)}</span>`);
    }
    const contactCell = contactBits.length
      ? `<div class="admin-table-cell-stack">${contactBits.join("")}</div>`
      : `<span class="admin-table-muted">Не указаны</span>`;
    const nextOrderName = getStaffNextOrderName(staffSummary);
    const dialogId = getStaffDialogId(staffSummary.id);

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть карточку сотрудника ${staffSummary.name || "Сотрудник"}`)}"
    >
      <td>
        <div class="admin-client-table-cell">
          <div class="admin-client-avatar ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
          <div class="admin-table-stack">
            <span class="admin-table-link">${escapeHtml(staffSummary.name || "Сотрудник")}</span>
            <span class="admin-table-muted">${escapeHtml(staffSummary.role || "Роль не указана")}</span>
            ${staffSummary.notes ? `<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.notes)}</span>` : ""}
          </div>
        </div>
      </td>
      <td>${contactCell}</td>
      <td>
        <div class="admin-table-cell-stack">
          ${renderStaffStatusBadge(staffSummary.status)}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</span>
          <span class="admin-table-muted">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))} на 7 дней</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены")}</span>
          <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(nextOrderName)}</span>
        </div>
      </td>
    </tr>`;
  }

  function renderStaffSummaryTable(staffSummaries, options = {}) {
    if (!staffSummaries.length) {
      return `<div class="admin-empty-state">Пока сотрудников нет. Создайте первого сотрудника в разделе "Настройки → Пользователи", и он сразу появится в команде и назначениях.</div>`;
    }

    return `<div class="admin-table-wrap admin-staff-table-wrap">
      <table class="admin-table admin-staff-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Контакты</th>
            <th>Статус</th>
            <th>Нагрузка</th>
            <th>Следующая смена</th>
          </tr>
        </thead>
        <tbody>
          ${staffSummaries.map((record) => renderStaffTableRow(record)).join("")}
        </tbody>
      </table>
      ${staffSummaries.map((record) => renderStaffEditDialog(record, options)).join("")}
    </div>`;
  }

  return {
    renderStaffTableRow,
    renderStaffSummaryTable,
  };
}

module.exports = {
  createStaffViewTableHelpers,
};
