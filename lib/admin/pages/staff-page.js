"use strict";

const { sanitizeStaffAvailabilityBlocks } = require("../../staff-availability");

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
    getStaffTeamCalendarView,
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
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const readOnly = accessContext.canEdit === false;
    const activeSection = readOnly ? "calendar" : getStaffSection(req);
    const calendarStartDate = getStaffTeamCalendarStartDate(reqUrl);
    const calendarView = getStaffTeamCalendarView(reqUrl);
    const googleCalendarIntegration =
      adminRuntime && adminRuntime.googleCalendarIntegration
        ? adminRuntime.googleCalendarIntegration
        : null;
    const usersStore =
      adminRuntime && adminRuntime.usersStore
        ? adminRuntime.usersStore
        : null;
    const [allEntries, staffSnapshot, usersSnapshot] = await Promise.all([
      quoteOpsLedger
        ? quoteOpsLedger.listEntries({ limit: STAFF_QUOTE_OPS_PAGE_LIMIT })
        : Promise.resolve([]),
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
    const manualAvailabilityByStaffId = new Map(
      (Array.isArray(planning.staffSummaries) ? planning.staffSummaries : []).map((record) => [
        record.id,
        sanitizeStaffAvailabilityBlocks(record.availabilityBlocks || record.manualAvailabilityBlocks),
      ])
    );
    const enrichedStaffSummaries = staffSummaries.map((record) => {
      const manualAvailabilityBlocks = manualAvailabilityByStaffId.get(record.id) || [];
      const calendarAvailabilityBlocks = Array.isArray(record.calendarAvailabilityBlocks)
        ? record.calendarAvailabilityBlocks
        : [];
      return {
        ...record,
        calendarAvailabilityBlocks: [...manualAvailabilityBlocks, ...calendarAvailabilityBlocks],
        linkedUser:
          linkedUserByStaffId.get(record.id) ||
          linkedUserByEmail.get(normalizeString(record.email, 200).toLowerCase()) ||
          null,
      };
    });
    const visiblePlanning = {
      ...planning,
      staffSummaries: enrichedStaffSummaries,
    };
    const upcomingOrders = visiblePlanning.orderItems.slice(0, 12);
    const calendarReturnUrl = new URL(reqUrl);
    calendarReturnUrl.searchParams.delete("order");
    const sectionIntro = readOnly ? "" : renderStaffSectionNav(
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
            "Планирование по клинерам: даты по строкам, команда по колонкам, цвет каждой уборки совпадает с клинером.",
            renderStaffTeamCalendarTable(visiblePlanning.staffSummaries, calendarStartDate, {
              view: calendarView, canEdit: accessContext.canEdit,
            }),
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
              "Команда и назначения",
              "Все люди, на которых можно распределять заказы: клинеры, менеджеры и админы с рабочими сменами.",
              renderStaffSummaryTable(visiblePlanning.staffSummaries, {
                req,
                canDelete: accessContext.canDelete,
                canEdit: accessContext.canEdit,
                leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
              }),
              { eyebrow: "Список", muted: true }
            );

    return renderAdminLayout(
      readOnly ? "Календарь команды" : "Сотрудники",
      `${readOnly ? "" : renderStaffNotice(req)}
        ${sectionIntro}
        ${renderStaffOverviewStrip(visiblePlanning)}
        ${sectionContent}
        ${renderStaffAssignmentDialogs(visiblePlanning.orderItems, visiblePlanning.staff, {
          canEdit: accessContext.canEdit,
          selectedEntryId: normalizeString(reqUrl.searchParams.get("order"), 120),
          closeHref: `${calendarReturnUrl.pathname}${calendarReturnUrl.search}`,
        })}`,
      {
        kicker: false,
        readOnly,
        subtitle: readOnly ? "" : "Раздел для всей команды, на которую можно распределять заказы: список, назначения, график и зарплаты.",
        sidebar: renderAdminAppSidebar(ADMIN_STAFF_PATH, {
          ...accessContext,
          staffSection: activeSection,
        }),
        bodyScripts: `${readOnly ? "" : `${renderStaffAddressAutocompleteScript()}${renderStaffTravelEstimateScript()}`}${renderStaffTeamCalendarDragScript()}`,
      }
    );
  }

  return renderStaffPage;
}

module.exports = {
  createStaffPageRenderer,
};
