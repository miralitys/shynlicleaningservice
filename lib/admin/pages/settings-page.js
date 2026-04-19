"use strict";

function createSettingsPageRenderer(deps = {}) {
  const {
    ADMIN_SETTINGS_PATH,
    SETTINGS_QUOTE_OPS_PAGE_LIMIT,
    buildStaffPlanningContext,
    getRequestUrl,
    getSettingsSection,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminCard,
    renderAdminLayout,
    renderInviteEmailStatusCard,
    renderSettingsChecklistsTable,
    renderSettingsChecklistEditorScript,
    renderSettingsNotice,
    renderSettingsSectionNav,
    renderSettingsUsersSection,
    renderStaffAddressAutocompleteScript,
  } = deps;

  async function renderSettingsPage(req, config, settingsStore, usersStore, staffStore, quoteOpsLedger, adminRuntime = {}) {
    const snapshot = settingsStore ? await settingsStore.getSnapshot() : { templates: [] };
    const templates = Array.isArray(snapshot.templates) ? snapshot.templates : [];
    const usersSnapshot = usersStore ? await usersStore.getSnapshot() : { users: [] };
    const users = Array.isArray(usersSnapshot.users) ? usersSnapshot.users : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const staffRecords = Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff : [];
    const allEntries = quoteOpsLedger
      ? await quoteOpsLedger.listEntries({ limit: SETTINGS_QUOTE_OPS_PAGE_LIMIT })
      : [];
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const staffSummaryById = new Map((planning.staffSummaries || []).map((record) => [record.id, record]));
    const activeSection = getSettingsSection(req);
    const activeUsersCount = users.filter((user) => user.status === "active").length;
    const usersWithLoginCount = users.filter((user) => Boolean(user.lastLoginAt)).length;
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const reqUrl = getRequestUrl(req);
    const currentNotice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    const inviteEmailStatus =
      adminRuntime &&
      adminRuntime.accountInviteEmail &&
      typeof adminRuntime.accountInviteEmail.getStatus === "function"
        ? await adminRuntime.accountInviteEmail.getStatus(config)
        : { configured: false };
    const inviteEmailConfigured = Boolean(inviteEmailStatus && inviteEmailStatus.configured);

    const sectionIntro = renderSettingsSectionNav(
      activeSection,
      {
        checklistCount: templates.length,
        userCount: users.length,
      },
      {
        actions:
          activeSection === "users"
            ? `<div class="admin-dialog-launcher admin-dialog-launcher-inline">
                <button class="admin-button" type="button" data-admin-dialog-open="admin-user-create-dialog">Добавить сотрудника</button>
              </div>`
            : "",
      }
    );

    const checklistsContent = `
      <div class="admin-settings-section-stack">
        ${renderAdminCard(
          "Шаблоны чек-листов",
          "Открывайте шаблон, просматривайте состав и редактируйте пункты только при необходимости.",
          renderSettingsChecklistsTable(templates),
          { eyebrow: "Настройки" }
        )}
      </div>`;

    const usersContent = `
      <div class="admin-stats-grid">
        ${renderAdminCard(
          "Пользователи",
          "Все личные кабинеты сотрудников.",
          `<p class="admin-metric-value">${String(users.length)}</p>`,
          { eyebrow: "Настройки" }
        )}
        ${renderAdminCard(
          "Активные",
          "Пользователи, которые могут войти.",
          `<p class="admin-metric-value">${String(activeUsersCount)}</p>`,
          { eyebrow: "Настройки", muted: true }
        )}
        ${renderAdminCard(
          "Заходили",
          "Пользователи с хотя бы одним успешным входом.",
          `<p class="admin-metric-value">${String(usersWithLoginCount)}</p>`,
          { eyebrow: "Настройки", muted: true }
        )}
      </div>
      <div class="admin-settings-section-stack">
        ${renderAdminCard(
          "Пользователи",
          "Создавайте личные кабинеты, привязывайте их к сотрудникам и управляйте доступом.",
          renderSettingsUsersSection(users, staffRecords, staffSummaryById, {
            canDelete: accessContext.canDelete,
            autoOpen: currentNotice === "user-error",
            inviteEmailConfigured,
            inviteEmailStatus,
          }),
          { eyebrow: "Настройки", muted: true }
        )}
        ${accessContext.canEdit ? renderInviteEmailStatusCard(inviteEmailStatus) : ""}
      </div>`;

    return renderAdminLayout(
      activeSection === "users" ? "Пользователи" : "Чек-листы",
      `${renderSettingsNotice(req)}
        ${sectionIntro}
        ${activeSection === "users" ? usersContent : checklistsContent}`,
      {
        kicker: "Настройки",
        subtitle:
          activeSection === "users"
            ? "Личные кабинеты сотрудников и управление доступом."
            : "Шаблоны чек-листов для разных типов уборки.",
        bodyScripts:
          activeSection === "users"
            ? renderStaffAddressAutocompleteScript()
            : renderSettingsChecklistEditorScript(),
        sidebar: renderAdminAppSidebar(ADMIN_SETTINGS_PATH, accessContext),
      }
    );
  }

  return renderSettingsPage;
}

module.exports = {
  createSettingsPageRenderer,
};
