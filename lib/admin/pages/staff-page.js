"use strict";

function createStaffPageRenderer(deps = {}) {
  const {
    ADMIN_STAFF_PATH,
    STAFF_QUOTE_OPS_PAGE_LIMIT,
    buildStaffPlanningContext,
    collectNonAssignableStaffIds,
    filterStaffSnapshotByHiddenStaffIds,
    getRequestUrl,
    getStaffSection,
    getStaffTeamCalendarStartDate,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminCard,
    renderAdminLayout,
    renderStaffAddressAutocompleteScript,
    renderStaffAssignmentDialogs,
    renderStaffAssignmentsTable,
    renderStaffNotice,
    renderStaffOverviewStrip,
    renderStaffSectionNav,
    renderStaffSummaryTable,
    renderStaffTeamCalendarDragScript,
    renderStaffTeamCalendarTable,
    renderStaffTravelEstimateScript,
  } = deps;

  async function renderStaffPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const reqUrl = getRequestUrl(req);
    const allEntries = quoteOpsLedger
      ? await quoteOpsLedger.listEntries({ limit: STAFF_QUOTE_OPS_PAGE_LIMIT })
      : [];
    const activeSection = getStaffSection(req);
    const calendarStartDate = getStaffTeamCalendarStartDate(reqUrl);
    const googleCalendarIntegration =
      adminRuntime && adminRuntime.googleCalendarIntegration
        ? adminRuntime.googleCalendarIntegration
        : null;
    const usersStore =
      adminRuntime && adminRuntime.usersStore
        ? adminRuntime.usersStore
        : null;
    const [staffSnapshot, usersSnapshot] = await Promise.all([
      staffStore ? staffStore.getSnapshot() : Promise.resolve({ staff: [], assignments: [] }),
      usersStore ? usersStore.getSnapshot() : Promise.resolve({ users: [] }),
    ]);
    const hiddenStaffIds = collectNonAssignableStaffIds(usersSnapshot && usersSnapshot.users);
    const filteredStaffSnapshot = filterStaffSnapshotByHiddenStaffIds(staffSnapshot, hiddenStaffIds);
    const planning = buildStaffPlanningContext(allEntries, filteredStaffSnapshot);
    const linkedUserByEmail = new Map(
      Array.isArray(usersSnapshot.users)
        ? usersSnapshot.users
            .filter((user) => user && user.email)
            .map((user) => [normalizeString(user.email, 200).toLowerCase(), user])
        : []
    );
    const linkedUserByStaffId = new Map(
      Array.isArray(usersSnapshot.users)
        ? usersSnapshot.users
            .filter((user) => user && user.staffId)
            .map((user) => [user.staffId, user])
        : []
    );
    const staffSummaries =
      googleCalendarIntegration &&
      typeof googleCalendarIntegration.loadStaffCalendarStates === "function"
        ? await googleCalendarIntegration.loadStaffCalendarStates(planning.staffSummaries, config)
        : planning.staffSummaries.map((record) => ({
            ...record,
            calendarMeta: {
              configured: Boolean(
                googleCalendarIntegration &&
                  typeof googleCalendarIntegration.isConfigured === "function" &&
                  googleCalendarIntegration.isConfigured()
              ),
              connected: false,
            },
            calendarAvailabilityBlocks: [],
          }));
    const enrichedStaffSummaries = staffSummaries.map((record) => ({
      ...record,
      linkedUser:
        linkedUserByStaffId.get(record.id) ||
        linkedUserByEmail.get(normalizeString(record.email, 200).toLowerCase()) ||
        null,
    }));
    const visiblePlanning = {
      ...planning,
      staffSummaries: enrichedStaffSummaries,
    };
    const upcomingOrders = visiblePlanning.orderItems.slice(0, 12);
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const sectionIntro = renderStaffSectionNav(
      activeSection,
      {
        staffCount: visiblePlanning.staffSummaries.length,
        activeStaffCount: visiblePlanning.activeStaffCount,
        scheduledOrdersCount: visiblePlanning.scheduledOrders.length,
      },
      calendarStartDate
    );
    const sectionContent =
      activeSection === "calendar"
        ? renderAdminCard(
            "Календарь команды",
            "Недельный календарь по всем сотрудникам: смены, подтверждённые заказы и day off.",
            renderStaffTeamCalendarTable(visiblePlanning.staffSummaries, calendarStartDate),
            { eyebrow: "Календарь", muted: true }
          )
        : activeSection === "assignments"
          ? renderAdminCard(
              "Назначения и график",
              "Свяжите сотрудников с заказами и зафиксируйте смены.",
              renderStaffAssignmentsTable(upcomingOrders),
              { eyebrow: "График" }
            )
          : renderAdminCard(
              "Команда",
              "Компактная таблица сотрудников, контактов и текущей загрузки.",
              renderStaffSummaryTable(visiblePlanning.staffSummaries, {
                req,
                canDelete: accessContext.canDelete,
                canEdit: accessContext.canEdit,
                leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
              }),
              { eyebrow: "Список", muted: true }
            );

    return renderAdminLayout(
      "Сотрудники",
      `${renderStaffNotice(req)}
        ${sectionIntro}
        ${renderStaffOverviewStrip(visiblePlanning)}
        ${sectionContent}
        ${renderStaffAssignmentDialogs(visiblePlanning.orderItems, visiblePlanning.staff)}`,
      {
        kicker: false,
        subtitle: "Рабочий инструмент для команды: компактный список сотрудников, привязка к заказам и график смен.",
        sidebar: renderAdminAppSidebar(ADMIN_STAFF_PATH, {
          ...accessContext,
          staffSection: activeSection,
        }),
        bodyScripts: `${renderStaffAddressAutocompleteScript()}${renderStaffTravelEstimateScript()}${renderStaffTeamCalendarDragScript()}`,
      }
    );
  }

  return renderStaffPage;
}

module.exports = {
  createStaffPageRenderer,
};
