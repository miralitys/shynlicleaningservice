"use strict";

function createDashboardPageRenderer(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_ROOT_PATH,
    DASHBOARD_NEW_ORDERS_LIMIT,
    DASHBOARD_QUOTE_OPS_PAGE_LIMIT,
    QUOTE_OPS_TASK_CLIENT_LEDGER_LIMIT = 1000,
    STAFF_TEAM_CALENDAR_TIME_ZONE,
    buildFormattedScheduleLabel,
    buildQuoteOpsTaskRecords,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectAdminOrderRecords,
    collectNonAssignableStaffIds,
    decorateOrderForPlanning,
    escapeHtml,
    escapeHtmlAttribute,
    filterStaffSnapshotByHiddenStaffIds,
    filterQuoteOpsEntries,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    getProjectedOrderRecords,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderLeadStatusBadge,
    renderOrderManagementDialog,
    renderOrderTableRow,
    renderOrderStatusBadge,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsWorkspaceStyle,
  } = deps;

  async function prepareContext(quoteOpsLedger, adminRuntime = {}) {
    const summarized = typeof quoteOpsLedger?.listDashboardEntries === "function";
    const entries = summarized ? quoteOpsLedger.listDashboardEntries().then(taskEntries => ({
      taskEntries, allEntries: filterQuoteOpsEntries(taskEntries, {}), summarized,
    })) : Promise.all([
      quoteOpsLedger ? quoteOpsLedger.listEntries({ limit: DASHBOARD_QUOTE_OPS_PAGE_LIMIT }) : [],
      quoteOpsLedger ? quoteOpsLedger.listEntries({ limit: QUOTE_OPS_TASK_CLIENT_LEDGER_LIMIT, includeHidden: true }) : [],
    ]).then(([allEntries, taskEntries]) => ({ allEntries, taskEntries, summarized }));
    const [data, staffSnapshot, usersSnapshot] = await Promise.all([
      entries,
      adminRuntime.staffStore?.getSnapshot?.() || { staff: [], assignments: [] },
      adminRuntime.usersStore?.getSnapshot?.() || { users: [] },
    ]);
    return { ...data, staffSnapshot, usersSnapshot };
  }

  async function renderDashboardPage(req, config, quoteOpsLedger, adminRuntime = {}, prepared = null) {
    void config;
    const { allEntries, taskEntries, staffSnapshot, usersSnapshot, summarized } = prepared ||
      await prepareContext(quoteOpsLedger, adminRuntime);
    const hiddenStaffIds = collectNonAssignableStaffIds(usersSnapshot && usersSnapshot.users);
    const hiddenStaffNames = new Set(
      (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
        .filter((record) => hiddenStaffIds.has(normalizeString(record && record.id, 120)))
        .map((record) => normalizeString(record && record.name, 120).toLowerCase())
        .filter(Boolean)
    );
    const filteredStaffSnapshot = filterStaffSnapshotByHiddenStaffIds(staffSnapshot, hiddenStaffIds);
    const planning = buildStaffPlanningContext(allEntries, filteredStaffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const staffRecords = Array.isArray(filteredStaffSnapshot.staff) ? filteredStaffSnapshot.staff : [];
    const clientRecords = collectAdminClientRecords(allEntries);
    const projectedOrders = summarized ? collectAdminOrderRecords(allEntries) :
      await getProjectedOrderRecords(adminRuntime, allEntries);
    const orderRecords = projectedOrders.map((order) =>
      decorateOrderForPlanning(order, planningByEntryId, hiddenStaffNames)
    );
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const scheduledCount = orderRecords.filter((order) => order.hasSchedule).length;
    const attentionCount = orderRecords.filter((order) => order.needsAttention).length;
    const todayDateValue = getAdminDashboardTodayDateValue();
    const newOrders = orderRecords
      .filter((order) => order.orderStatus === "new")
      .slice()
      .sort((left, right) => getDashboardEntryCreatedAtMs(right) - getDashboardEntryCreatedAtMs(left))
      .slice(0, DASHBOARD_NEW_ORDERS_LIMIT);
    const dashboardTaskRecords = buildQuoteOpsTaskRecords(taskEntries)
      .filter((task) => task.status === "open")
      .filter((task) => {
        const taskDateValue = getAdminDashboardDateValue(task.dueAt);
        return Boolean(taskDateValue) && taskDateValue <= todayDateValue;
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left.dueAt || "");
        const rightTime = Date.parse(right.dueAt || "");
        if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
        if (!Number.isFinite(leftTime)) return 1;
        if (!Number.isFinite(rightTime)) return -1;
        return leftTime - rightTime;
      });
    let overdueTaskRecords = dashboardTaskRecords.filter(
      (task) => getAdminDashboardDateValue(task.dueAt) < todayDateValue
    );
    let todayTaskRecords = dashboardTaskRecords.filter(
      (task) => getAdminDashboardDateValue(task.dueAt) === todayDateValue
    );
    let ordersWithoutTeam = orderRecords
      .filter((order) => isDashboardOrderWithoutTeam(order))
      .sort((left, right) => getDashboardOrderSortValue(left).localeCompare(getDashboardOrderSortValue(right), "en"));
    let todayOrders = orderRecords
      .filter((order) => normalizeString(order.selectedDate, 32) === todayDateValue)
      .sort((left, right) => getDashboardOrderSortValue(left).localeCompare(getDashboardOrderSortValue(right), "en"));
    let dialogPlanningByEntryId = planningByEntryId;
    if (summarized) {
      const selectedOrders = [...ordersWithoutTeam, ...todayOrders];
      const ids = [...new Set([...selectedOrders.map(order => order.id),
        ...dashboardTaskRecords.map(task => task.entry.id)])];
      const details = ids.length ? await quoteOpsLedger.listDashboardDetailEntries(ids) : [];
      const fullEntries = new Map(details.map(entry => [entry.id, entry]));
      const summaries = new Map(taskEntries.map(entry => [entry.id, entry]));
      for (const id of ids) {
        if (!fullEntries.has(id) || fullEntries.get(id).updatedAt !== summaries.get(id)?.updatedAt) {
          const error = new Error("Dashboard records changed while loading; reload the page.");
          error.code = fullEntries.has(id) ? "DASHBOARD_READ_CONFLICT" : "DASHBOARD_DETAILS_MISSING";
          throw error;
        }
      }
      dialogPlanningByEntryId = new Map([...planningByEntryId].map(([id, item]) =>
        [id, fullEntries.has(id) ? { ...item, entry: fullEntries.get(id) } : item]));
      const fullOrders = new Map(collectAdminOrderRecords(details).map(order => [order.id, order]));
      const hydrateOrder = order => {
        const full = fullOrders.get(order.id);
        if (!full) throw new Error("Dashboard order details unavailable.");
        return decorateOrderForPlanning({ ...full, isRecurring: order.isRecurring }, dialogPlanningByEntryId, hiddenStaffNames);
      };
      ordersWithoutTeam = ordersWithoutTeam.map(hydrateOrder);
      todayOrders = todayOrders.map(hydrateOrder);
      const taskKey = task => JSON.stringify([task.entry.id, task.id]);
      const fullTasks = new Map(buildQuoteOpsTaskRecords(details).map(task => [taskKey(task), task]));
      const hydrateTask = task => {
        const full = fullTasks.get(taskKey(task));
        if (!full) throw new Error("Dashboard task details unavailable.");
        return full;
      };
      overdueTaskRecords = overdueTaskRecords.map(hydrateTask);
      todayTaskRecords = todayTaskRecords.map(hydrateTask);
    }
    const overviewItems = [
      {
        label: "Клиенты",
        value: clientRecords.length,
        copy: "Все клиенты в рабочей базе.",
        tone: "accent",
      },
      {
        label: "Заказы",
        value: orderRecords.length,
        copy: "Все заказы, включая новые обращения с сайта.",
        tone: "default",
      },
      {
        label: "Назначена дата",
        value: scheduledCount,
        copy: "Заказы, где уже выбраны день или время.",
        tone: "success",
      },
      {
        label: "Нужно проверить",
        value: attentionCount,
        copy: "Заказы, которым требуется внимание.",
        tone: attentionCount > 0 ? "danger" : "default",
      },
    ];

    return renderAdminLayout(
      "Дашборд",
      `${renderQuoteOpsWorkspaceStyle()}
      <div class="admin-compact-summary-strip admin-dashboard-summary-strip">
        ${overviewItems
          .map(
            (item) => `<article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
              <div class="admin-compact-summary-head">
                <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
                <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
              </div>
              <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
            </article>`
          )
          .join("")}
      </div>
      ${renderAdminCard(
        "Новые заказы",
        "Последние заказы из колонки «Новые»: обращения с сайта и созданные вручную.",
        renderDashboardNewOrdersTable(newOrders),
        { eyebrow: "Дашборд", muted: true }
      )}
      ${renderAdminCard(
        "Таски на контроле",
        "Открытые таски с дедлайном на сегодня или раньше. Будущие дедлайны остаются в разделе «Таски».",
        renderDashboardLeadTasksSection({
          overdueTaskRecords,
          todayTaskRecords,
          canEdit: accessContext.canEdit,
        }),
        { eyebrow: "Дашборд", muted: true }
      )}
      <div class="admin-section-grid">
        ${renderAdminCard(
        "Заказы без команды",
        "Активные заказы, в которых ещё не назначена команда.",
        renderDashboardOrdersWithoutTeamTable(ordersWithoutTeam, {
          req,
          planningByEntryId: dialogPlanningByEntryId,
          staffRecords,
          returnTo: ADMIN_ROOT_PATH,
          canDelete: accessContext.canDelete,
          canEdit: accessContext.canEdit,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        }),
        { eyebrow: "Дашборд", muted: true }
      )}
      ${renderAdminCard(
        "Заказы на сегодня",
        "Все заказы, запланированные на сегодня по рабочему календарю.",
        renderDashboardTodayOrdersTable(todayOrders, {
          req,
          planningByEntryId: dialogPlanningByEntryId,
          staffRecords,
          returnTo: ADMIN_ROOT_PATH,
          canDelete: accessContext.canDelete,
          canEdit: accessContext.canEdit,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        }),
        { eyebrow: "Дашборд", muted: true }
      )}
      </div>`,
      {
        kicker: false,
        readOnly: accessContext.canEdit === false,
        subtitle: "Единый дашборд по клиентам, заказам и таскам.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH, accessContext),
      }
    );
  }

  function getDashboardEntryCreatedAtMs(entry) {
    const createdAtMs = Date.parse((entry && entry.createdAt) || "");
    return Number.isFinite(createdAtMs) ? createdAtMs : 0;
  }

  function getAdminDashboardDateValue(value) {
    const date = value instanceof Date ? value : new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: STAFF_TEAM_CALENDAR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const values = {};
    for (const part of parts) {
      if (part.type === "literal") continue;
      values[part.type] = part.value;
    }
    return `${values.year}-${values.month}-${values.day}`;
  }

  function getAdminDashboardTodayDateValue() {
    return getAdminDashboardDateValue(new Date());
  }

  function getDashboardOrderSortValue(order) {
    const selectedDate = normalizeString(order && order.selectedDate, 32);
    const selectedTime = normalizeString(order && order.selectedTime, 32);
    const createdAt = normalizeString(order && order.createdAt, 80);
    return [
      selectedDate || "9999-99-99",
      selectedTime || "99:99",
      createdAt || "9999-99-99T99:99:99.999Z",
    ].join("|");
  }

  function renderDashboardNewOrdersTable(orders = []) {
    if (!Array.isArray(orders) || orders.length === 0) {
      return `<div data-admin-dashboard-new-orders="true" class="admin-alert admin-alert-info">Новых заказов пока нет.</div>`;
    }

    return `<div data-admin-dashboard-new-orders="true" class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-success-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Услуга</th>
            <th>Создан</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${orders
            .map((entry) => {
              const orderUrl = `${ADMIN_ORDERS_PATH}?order=${encodeURIComponent(entry.id)}`;
              const contactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "", entry.customerEmail || ""]
                .filter(Boolean)
                .join(" • ");
              const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime);
              const serviceLabel = entry.serviceLabel;
              return `<tr>
                <td>
                  <div class="admin-table-cell-stack">
                    <a class="admin-table-link" href="${escapeHtmlAttribute(orderUrl)}">${escapeHtml(entry.customerName || "Клиент")}</a>
                    <span class="admin-table-muted">${escapeHtml(entry.requestId || "Номер не указан")}</span>
                  </div>
                </td>
                <td>
                  ${contactLabel
                    ? `<div class="admin-table-cell-stack">
                        <span class="admin-line-clamp-two">${escapeHtml(contactLabel)}</span>
                      </div>`
                    : `<span class="admin-table-muted">Не указаны</span>`}
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(serviceLabel)}</span>
                    <span class="admin-table-muted">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
                    <span class="admin-table-muted">${escapeHtml(scheduleLabel || "Дата уборки не назначена")}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span>${renderOrderStatusBadge(entry.orderStatus)}</span>
                    <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(entry.fullAddress || "Адрес не указан")}</span>
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderDashboardLeadTasksSection({ overdueTaskRecords = [], todayTaskRecords = [], canEdit = true } = {}) {
    const allTaskRecords = [...overdueTaskRecords, ...todayTaskRecords];
    if (allTaskRecords.length === 0) {
      return `<div data-admin-dashboard-tasks="true" class="admin-alert admin-alert-info">Тасков на сегодня и просроченных задач пока нет.</div>`;
    }

    return `<div data-admin-dashboard-tasks="true" class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-task-table admin-dashboard-task-table">
        <thead>
          <tr>
            <th>Таск</th>
            <th>Дедлайн</th>
            <th>Этап</th>
            <th>Исполнитель</th>
            <th>Клиент / заказ</th>
          </tr>
        </thead>
        <tbody>
          ${allTaskRecords.map((taskRecord) => renderDashboardLeadTaskTableRow(taskRecord, `${ADMIN_QUOTE_OPS_PATH}?section=tasks`)).join("")}
        </tbody>
      </table>
      ${allTaskRecords.map((taskRecord) => renderQuoteOpsTaskResultDialog(taskRecord, `${ADMIN_QUOTE_OPS_PATH}?section=tasks`, "", { canEdit })).join("")}
    </div>`;
  }

  function renderDashboardLeadTaskTableRow(taskRecord, returnTo) {
    void returnTo;
    const dialogId = `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const dueAtMs = Date.parse(taskRecord.dueAt || "");
    const isOverdue = taskRecord.status === "open" && Number.isFinite(dueAtMs) && dueAtMs < Date.now();
    const managerLabel = taskRecord.manager.name || taskRecord.manager.email || "Без исполнителя";
    const requestLabel = taskRecord.requestId || taskRecord.entry.id;
    const phoneLabel = taskRecord.entry.customerPhone
      ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone
      : "Телефон не указан";

    return `<tr
      class="admin-table-row-clickable${isOverdue ? " admin-quote-task-row-overdue" : ""}"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть таск ${taskRecord.title} для ${taskRecord.customerName}`)}"
    >
      <td>
        <div class="admin-table-cell-stack">
          <a class="admin-table-strong" href="${ADMIN_QUOTE_OPS_PATH}?section=tasks&amp;task=${escapeHtmlAttribute(taskRecord.id)}">${escapeHtml(taskRecord.title)}</a>
          <span class="admin-table-muted">${escapeHtml(taskRecord.customerName)} • ${escapeHtml(taskRecord.serviceLabel)}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack admin-dashboard-task-deadline-stack">
          <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</span>
          ${isOverdue ? `<span class="admin-dashboard-task-overdue-badge">${renderAdminBadge("Просрочено", "danger")}</span>` : ""}
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${renderLeadStatusBadge(taskRecord.leadStatus)}
        </div>
      </td>
      <td>
        <div class="admin-quote-task-pill-row">
          ${managerLabel ? renderAdminBadge(managerLabel, managerLabel === "Без менеджера" ? "muted" : "outline") : ""}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(requestLabel)}</span>
          <span class="admin-table-muted">${escapeHtml(phoneLabel)}</span>
        </div>
      </td>
    </tr>`;
  }

  function isDashboardOrderWithoutTeam(order) {
    const status = normalizeString(order && order.orderStatus, 40).toLowerCase();
    return Boolean(order && !order.isAssigned && status !== "completed" && status !== "canceled");
  }

  function renderDashboardOrdersWithoutTeamTable(orderRecords = [], options = {}) {
    if (!Array.isArray(orderRecords) || orderRecords.length === 0) {
      return `<div data-admin-dashboard-unassigned-orders="true" class="admin-alert admin-alert-info">Сейчас нет активных заказов без команды.</div>`;
    }

    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ROOT_PATH;
    const canDelete = options.canDelete !== false;

    return `<div data-admin-dashboard-unassigned-orders="true" class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${orderRecords
            .map((order) =>
              renderOrderTableRow(order, returnTo, {
                planningItem: planningByEntryId.get(order.id) || null,
              })
            )
            .join("")}
        </tbody>
      </table>
      ${orderRecords
        .map((order) =>
          renderOrderManagementDialog(order, returnTo, {
            req: options.req,
            planningItem: planningByEntryId.get(order.id) || null,
            staffRecords,
            canDelete,
            canEdit: options.canEdit,
            leadConnectorConfigured: options.leadConnectorConfigured,
          })
        )
        .join("")}
    </div>`;
  }

  function renderDashboardTodayOrdersTable(orderRecords = [], options = {}) {
    if (!Array.isArray(orderRecords) || orderRecords.length === 0) {
      return `<div data-admin-dashboard-today-orders="true" class="admin-alert admin-alert-info">На сегодня заказов пока нет.</div>`;
    }

    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ROOT_PATH;
    const canDelete = options.canDelete !== false;

    return `<div data-admin-dashboard-today-orders="true" class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${orderRecords
            .map((order) =>
              renderOrderTableRow(order, returnTo, {
                planningItem: planningByEntryId.get(order.id) || null,
              })
            )
            .join("")}
        </tbody>
      </table>
      ${orderRecords
        .map((order) =>
          renderOrderManagementDialog(order, returnTo, {
            req: options.req,
            planningItem: planningByEntryId.get(order.id) || null,
            staffRecords,
            canDelete,
            canEdit: options.canEdit,
            leadConnectorConfigured: options.leadConnectorConfigured,
          })
        )
        .join("")}
    </div>`;
  }

  renderDashboardPage.prepareContext = prepareContext;
  return renderDashboardPage;
}

module.exports = {
  createDashboardPageRenderer,
};
