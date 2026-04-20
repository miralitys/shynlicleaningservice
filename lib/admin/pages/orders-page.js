"use strict";

const { createOrdersFunnelUi } = require("./orders-funnel-ui");
const { createOrdersPageHelpers } = require("./orders-page-helpers");

function createOrdersPageRenderer(deps = {}) {
  const {
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDERS_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectNonAssignableStaffIds,
    countOrdersByStatus,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminOrderRecords,
    filterOrderAssignedStaffNames,
    filterStaffSnapshotByHiddenStaffIds,
    formatCurrencyAmount,
    getOrderAssignedLabel,
    getOrderDialogId,
    getOrdersFilters,
    getProjectedOrderRecords,
    getRequestUrl,
    getWorkspaceAccessContext,
    normalizeOrderStatus,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderCreateManualOrderDialog,
    renderOrderManagementDialog,
    renderOrderPaymentStatusBadge,
    renderOrderStatusBadge,
    renderOrderTableRow,
    renderQuoteOpsStatusBadge,
  } = deps;
  const ORDERS_PAGE_LEDGER_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 160);
  const { getOrderFunnelStatus, renderOrdersFunnelScript, renderOrdersFunnelStyle, renderOrdersLane } =
    createOrdersFunnelUi({
      ADMIN_ORDERS_PATH,
      escapeHtml,
      escapeHtmlAttribute,
      formatCurrencyAmount,
      getOrderAssignedLabel,
      getOrderDialogId,
      normalizeOrderStatus,
      normalizeString,
      renderAdminBadge,
      renderOrderStatusBadge,
    });
  const { renderOrdersNotice, renderOrdersOverviewStrip, renderOrdersUpcomingTable } =
    createOrdersPageHelpers({
      escapeHtml,
      getOrderAssignedLabel,
      getOrderDialogId,
      getRequestUrl,
      normalizeString,
      renderAdminBadge,
      renderOrderPaymentStatusBadge,
      renderOrderStatusBadge,
      renderQuoteOpsStatusBadge,
    });

  async function renderOrdersPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const { reqUrl, filters } = getOrdersFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: ORDERS_PAGE_LEDGER_LIMIT }) : [];
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    const [staffSnapshot, usersSnapshot] = await Promise.all([
      staffStore ? staffStore.getSnapshot() : Promise.resolve({ staff: [], assignments: [] }),
      usersStore ? usersStore.getSnapshot() : Promise.resolve({ users: [] }),
    ]);
    const hiddenStaffIds = collectNonAssignableStaffIds(usersSnapshot && usersSnapshot.users);
    const hiddenStaffNames = new Set(
      (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
        .filter((record) => hiddenStaffIds.has(normalizeString(record && record.id, 120)))
        .map((record) => normalizeString(record && record.name, 120).toLowerCase())
        .filter(Boolean)
    );
    const filteredStaffSnapshot = filterStaffSnapshotByHiddenStaffIds(staffSnapshot, hiddenStaffIds);
    const staffRecords = Array.isArray(filteredStaffSnapshot.staff) ? filteredStaffSnapshot.staff : [];
    const planning = buildStaffPlanningContext(allEntries, filteredStaffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const projectedOrders = await getProjectedOrderRecords(adminRuntime, allEntries);
    const allOrders = projectedOrders.map((order) => {
      const planningItem = planningByEntryId.get(order.id) || null;
      const visibleAssignedStaff = filterOrderAssignedStaffNames(order.assignedStaff, hiddenStaffNames);
      if (!planningItem) {
        return {
          ...order,
          assignedStaff: visibleAssignedStaff.join(", "),
          isAssigned: visibleAssignedStaff.length > 0,
        };
      }

      const assignedTeamLabel =
        planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
          : "";

      return {
        ...order,
        assignedStaff: assignedTeamLabel || visibleAssignedStaff.join(", "),
        isAssigned: Boolean(assignedTeamLabel || visibleAssignedStaff.length > 0),
        scheduleLabel: planningItem.scheduleLabel || order.scheduleLabel,
        hasSchedule: planningItem.hasSchedule || order.hasSchedule,
        planningItem,
      };
    });
    const orders = filterAdminOrderRecords(allOrders, filters);
    const totalOrders = allOrders.length;
    const scheduledCount = allOrders.filter((order) => order.hasSchedule).length;
    const noScheduleOpenCount = allOrders.filter(
      (order) => !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const unassignedOpenCount = allOrders.filter(
      (order) => !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const statusCounts = countOrdersByStatus(allOrders);
    const activeCount = Math.max(0, totalOrders - statusCounts.completed - statusCounts.canceled);
    const orderById = new Map(allOrders.map((order) => [order.id, order]));
    const upcomingOrders = planning.scheduledOrders.slice(0, 8)
      .map((planningItem) => {
        const order = orderById.get(planningItem.entry.id);
        if (!order) return null;
        return { order, planningItem };
      })
      .filter(Boolean);
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const selectedOrderId = normalizeString(reqUrl.searchParams.get("order"), 120);
    const autoOpenAmountEditor = normalizeString(reqUrl.searchParams.get("amountEditor"), 16) === "1";
    const autoOpenCreateOrderDialog = normalizeString(reqUrl.searchParams.get("createOrder"), 16) === "1";
    const filteredCount = orders.length;
    const hasSearchQuery = Boolean(filters.q);
    const hasActiveFilters = Boolean(
      filters.q ||
      filters.status !== "all" ||
      filters.serviceType !== "all" ||
      filters.frequency !== "all" ||
      filters.assignment !== "all"
    );
    const advancedFilterCount = [
      filters.status !== "all",
      filters.serviceType !== "all",
      filters.frequency !== "all",
      filters.assignment !== "all",
    ].filter(Boolean).length;
    const advancedResetHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: filters.q,
      status: "",
      serviceType: "",
      frequency: "",
      assignment: "",
    });
    const resetHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: "",
      status: "",
      serviceType: "",
      frequency: "",
      assignment: "",
    });
    const closeOrderHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: filters.q,
      status: filters.status !== "all" ? filters.status : "",
      serviceType: filters.serviceType !== "all" ? filters.serviceType : "",
      frequency: filters.frequency !== "all" ? filters.frequency : "",
      assignment: filters.assignment !== "all" ? filters.assignment : "",
      order: "",
    });
    const funnelStatuses = ["new", "policy", "scheduled", "in-progress", "rescheduled", "invoice-sent", "paid", "awaiting-review", "completed", "canceled"];
    const emptyStateMessage = hasActiveFilters
      ? "По текущему фильтру заказов нет. Попробуйте очистить поиск или снять часть фильтров."
      : "Пока заказов нет. Подтверждённые заявки будут появляться здесь после создания заказа.";
    const overviewItems = [
      {
        label: "В работе",
        value: activeCount,
        copy: "Открытые заказы без completed и canceled.",
        tone: "accent",
      },
      {
        label: "В графике",
        value: scheduledCount,
        copy: "Есть дата или время визита.",
        tone: "success",
      },
      {
        label: "Без даты",
        value: noScheduleOpenCount,
        copy: "Нужно назначить окно уборки.",
        tone: noScheduleOpenCount > 0 ? "danger" : "default",
      },
      {
        label: "Без команды",
        value: unassignedOpenCount,
        copy: "Требуется назначение сотрудников.",
        tone: unassignedOpenCount > 0 ? "danger" : "default",
      },
    ];
    const filterBadges = [
      hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : "",
      filters.status !== "all" ? renderAdminBadge(`Статус: ${filters.status}`, "outline") : "",
      filters.serviceType !== "all" ? renderAdminBadge(`Тип: ${filters.serviceType}`, "outline") : "",
      filters.frequency !== "all" ? renderAdminBadge(`Повтор: ${filters.frequency}`, "outline") : "",
      filters.assignment === "assigned" ? renderAdminBadge("Только назначенные", "outline") : "",
      filters.assignment === "unassigned" ? renderAdminBadge("Только без команды", "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const accessContext = getWorkspaceAccessContext(adminRuntime);

    return renderAdminLayout(
      "Заказы",
      `<div class="admin-orders-page">
        ${renderOrdersFunnelStyle()}
        ${renderOrdersNotice(req)}
        ${renderOrdersOverviewStrip(overviewItems)}
        ${renderAdminCard(
          "Все заказы",
          "Рабочая таблица заказов с поиском, фильтрами и карточкой по клику.",
          `<div class="admin-orders-workspace" id="admin-orders-workspace">
            <div class="admin-orders-toolbar-shell">
              <details class="admin-filter-disclosure admin-orders-filter-toggle"${advancedFilterCount ? " open" : ""}>
                <summary class="admin-clients-toolbar-button">
                  <span>Фильтры</span>
                  ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
                </summary>
              </details>
              <div class="admin-orders-toolbar-actions">
                <form
                  class="admin-clients-search-form"
                  method="get"
                  action="${ADMIN_ORDERS_PATH}"
                  data-admin-auto-submit="true"
                  data-admin-auto-submit-delay="600"
                  data-admin-auto-submit-min-length="2"
                  data-admin-auto-submit-restore-focus="true"
                  data-admin-auto-submit-scroll-target="#admin-orders-workspace"
                  data-admin-auto-submit-scroll-offset="18"
                >
                  ${renderAdminHiddenInput("status", filters.status !== "all" ? filters.status : "")}
                  ${renderAdminHiddenInput("serviceType", filters.serviceType !== "all" ? filters.serviceType : "")}
                  ${renderAdminHiddenInput("frequency", filters.frequency !== "all" ? filters.frequency : "")}
                  ${renderAdminHiddenInput("assignment", filters.assignment !== "all" ? filters.assignment : "")}
                  <label class="admin-clients-search-box">
                    <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
                    <input
                      class="admin-input admin-clients-search-input"
                      type="search"
                      name="q"
                      value="${escapeHtmlText(filters.q)}"
                      placeholder="Поиск по клиенту, телефону, адресу, сотруднику или номеру"
                    >
                  </label>
                  <button class="admin-sr-only" type="submit">Обновить поиск</button>
                  ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
                </form>
                ${accessContext.canEdit
                  ? `<div class="admin-dialog-launcher admin-dialog-launcher-inline">
                      <button class="admin-button" type="button" data-admin-dialog-open="${ADMIN_MANUAL_ORDER_DIALOG_ID}">Добавить заказ</button>
                    </div>`
                  : ""}
              </div>
              <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
                <form class="admin-orders-filter-bar" method="get" action="${ADMIN_ORDERS_PATH}">
                  ${renderAdminHiddenInput("q", filters.q)}
                  <label class="admin-label">
                    Статус
                    <select class="admin-input" name="status">
                      <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                      <option value="new"${filters.status === "new" ? " selected" : ""}>Новые</option>
                      <option value="scheduled"${filters.status === "scheduled" ? " selected" : ""}>Запланировано</option>
                      <option value="in-progress"${filters.status === "in-progress" ? " selected" : ""}>В работе</option>
                      <option value="rescheduled"${filters.status === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="invoice-sent"${filters.status === "invoice-sent" ? " selected" : ""}>Инвойс отправлен</option>
                      <option value="paid"${filters.status === "paid" ? " selected" : ""}>Оплачено</option>
                      <option value="awaiting-review"${filters.status === "awaiting-review" ? " selected" : ""}>Ждем отзыв</option>
                      <option value="completed"${filters.status === "completed" ? " selected" : ""}>Завершено</option>
                      <option value="canceled"${filters.status === "canceled" ? " selected" : ""}>Отменено</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Тип уборки
                    <select class="admin-input" name="serviceType">
                      <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                      <option value="standard"${filters.serviceType === "standard" ? " selected" : ""}>Standard</option>
                      <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Deep</option>
                      <option value="move-in/out"${filters.serviceType === "move-in/out" ? " selected" : ""}>Move-in/out</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Повторяемость
                    <select class="admin-input" name="frequency">
                      <option value="all"${filters.frequency === "all" ? " selected" : ""}>Все</option>
                      <option value="weekly"${filters.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                      <option value="biweekly"${filters.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                      <option value="monthly"${filters.frequency === "monthly" ? " selected" : ""}>Monthly</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Назначение
                    <select class="admin-input" name="assignment">
                      <option value="all"${filters.assignment === "all" ? " selected" : ""}>Все</option>
                      <option value="assigned"${filters.assignment === "assigned" ? " selected" : ""}>Назначен</option>
                      <option value="unassigned"${filters.assignment === "unassigned" ? " selected" : ""}>Не назначен</option>
                    </select>
                  </label>
                  <div class="admin-clients-filter-actions">
                    <button class="admin-button" type="submit">Применить</button>
                    <a class="admin-link-button admin-button-secondary" href="${advancedResetHref}">Сбросить фильтры</a>
                  </div>
                </form>
              </div>
            </div>
            ${hasActiveFilters
              ? `<div class="admin-clients-meta-row">
                  <div class="admin-clients-meta-main">
                    <p class="admin-clients-summary-copy">
                      Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalOrders))} заказов.
                      С учётом поиска и фильтров.
                    </p>
                    ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
                  </div>
                </div>`
              : ""}
            ${orders.length > 0
              ? `<div class="admin-table-wrap admin-orders-table-wrap admin-orders-table-wrap-capped">
                  <table class="admin-table admin-orders-table">
                    <colgroup>
                      <col style="width:22%">
                      <col style="width:15%">
                      <col style="width:14%">
                      <col style="width:14%">
                      <col style="width:14%">
                      <col style="width:13%">
                      <col style="width:8%">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Заказ</th>
                        <th>Контакты</th>
                        <th>Дата и время</th>
                        <th>Команда</th>
                        <th>Статус</th>
                        <th>Адрес</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${orders
                        .map((order) =>
                          renderOrderTableRow(order, currentReturnTo, {
                            planningItem: planningByEntryId.get(order.id) || null,
                          })
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
                <section class="admin-orders-funnel-section">
                  <div class="admin-subsection-head">
                    <div>
                      <h3 class="admin-subsection-title">Воронка заказов</h3>
                      <p class="admin-order-detail-copy">Текущая выборка заказов, разложенная по статусам выполнения.</p>
                    </div>
                  </div>
                  <div class="admin-order-funnel-board">
                    <form method="post" action="${ADMIN_ORDERS_PATH}" data-order-funnel-stage-form="true" hidden>
                      <input type="hidden" name="entryId" value="">
                      <input type="hidden" name="orderStatus" value="">
                      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
                    </form>
                    ${funnelStatuses
                      .map((status) =>
                        renderOrdersLane(
                          status,
                          orders.filter((order) => getOrderFunnelStatus(order) === status),
                          currentReturnTo,
                          planningByEntryId,
                          staffRecords,
                          {
                            canDelete: accessContext.canDelete,
                            canEdit: accessContext.canEdit,
                            droppable: true,
                          }
                        )
                      )
                      .join("")}
                  </div>
                </section>
                ${orders
                  .map((order) =>
                    renderOrderManagementDialog(order, currentReturnTo, {
                      req,
                      planningItem: planningByEntryId.get(order.id) || null,
                      staffRecords,
                      canDelete: accessContext.canDelete,
                      canEdit: accessContext.canEdit,
                      leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                      autoOpen: selectedOrderId === order.id,
                      autoOpenAmountEditor: selectedOrderId === order.id && autoOpenAmountEditor,
                      closeHref: selectedOrderId === order.id ? closeOrderHref : "",
                    })
                  )
                  .join("")}`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
          </div>`,
          { className: "admin-orders-card" }
        )}
        ${accessContext.canEdit ? renderCreateManualOrderDialog({ autoOpen: autoOpenCreateOrderDialog, returnTo: currentReturnTo }) : ""}
        ${renderOrdersFunnelScript(currentReturnTo, accessContext.canEdit)}
        ${renderAdminCard(
          "Ближайшие выезды",
          "Заказы с назначенной датой и временем, отсортированные по ближайшему визиту.",
          renderOrdersUpcomingTable(upcomingOrders),
          { className: "admin-orders-card" }
        )}
      </div>`,
      {
        kicker: false,
        subtitle: "Рабочая таблица заказов и ближайших выездов.",
        sidebar: renderAdminAppSidebar(ADMIN_ORDERS_PATH, accessContext),
      }
    );
  }

  return renderOrdersPage;
}

module.exports = {
  createOrdersPageRenderer,
};
