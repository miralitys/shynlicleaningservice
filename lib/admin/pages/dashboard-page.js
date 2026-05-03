"use strict";

function createDashboardPageRenderer(deps = {}) {
  const {
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_ROOT_PATH,
    DASHBOARD_NEW_REQUESTS_LIMIT,
    DASHBOARD_QUOTE_OPS_PAGE_LIMIT,
    STAFF_TEAM_CALENDAR_TIME_ZONE,
    buildFormattedScheduleLabel,
    buildQuoteOpsTaskRecords,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectNonAssignableStaffIds,
    collectQuoteOpsManagerOptions,
    escapeHtml,
    escapeHtmlAttribute,
    filterStaffSnapshotByHiddenStaffIds,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    getProjectedOrderRecords,
    getQuoteOpsDialogId,
    getWorkspaceAccessContext,
    isOrderCreatedEntry,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderLeadStatusBadge,
    renderOrderManagementDialog,
    renderOrderTableRow,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsStatusBadge,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsWorkspaceStyle,
  } = deps;

  async function renderDashboardPage(req, config, quoteOpsLedger, adminRuntime = {}) {
    void config;
    const allEntries = quoteOpsLedger
      ? await quoteOpsLedger.listEntries({ limit: DASHBOARD_QUOTE_OPS_PAGE_LIMIT })
      : [];
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    const [staffSnapshot, usersSnapshot] = await Promise.all([
      adminRuntime && adminRuntime.staffStore && typeof adminRuntime.staffStore.getSnapshot === "function"
        ? adminRuntime.staffStore.getSnapshot()
        : Promise.resolve({ staff: [], assignments: [] }),
      usersStore ? usersStore.getSnapshot() : Promise.resolve({ users: [] }),
    ]);
    const hiddenStaffIds = collectNonAssignableStaffIds(usersSnapshot && usersSnapshot.users);
    const filteredStaffSnapshot = filterStaffSnapshotByHiddenStaffIds(staffSnapshot, hiddenStaffIds);
    const planning = buildStaffPlanningContext(allEntries, filteredStaffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const staffRecords = Array.isArray(filteredStaffSnapshot.staff) ? filteredStaffSnapshot.staff : [];
    const clientRecords = collectAdminClientRecords(allEntries);
    const orderRecords = await getProjectedOrderRecords(adminRuntime, allEntries);
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const managerOptions = await collectQuoteOpsManagerOptions(
      adminRuntime,
      adminRuntime && adminRuntime.staffStore ? adminRuntime.staffStore : null
    );
    const scheduledCount = orderRecords.filter((order) => order.hasSchedule).length;
    const attentionCount = allEntries.filter((entry) => entry.status !== "success").length;
    const todayDateValue = getAdminDashboardTodayDateValue();
    const recentEntries = allEntries
      .filter((entry) => !isOrderCreatedEntry(entry))
      .slice()
      .sort((left, right) => getDashboardEntryCreatedAtMs(right) - getDashboardEntryCreatedAtMs(left))
      .slice(0, DASHBOARD_NEW_REQUESTS_LIMIT);
    const dashboardTaskRecords = buildQuoteOpsTaskRecords(allEntries)
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
    const overdueTaskRecords = dashboardTaskRecords.filter(
      (task) => getAdminDashboardDateValue(task.dueAt) < todayDateValue
    );
    const todayTaskRecords = dashboardTaskRecords.filter(
      (task) => getAdminDashboardDateValue(task.dueAt) === todayDateValue
    );
    const ordersWithoutTeam = orderRecords
      .filter((order) => isDashboardOrderWithoutTeam(order))
      .sort((left, right) => getDashboardOrderSortValue(left).localeCompare(getDashboardOrderSortValue(right), "en"));
    const todayOrders = orderRecords
      .filter((order) => normalizeString(order.selectedDate, 32) === todayDateValue)
      .sort((left, right) => getDashboardOrderSortValue(left).localeCompare(getDashboardOrderSortValue(right), "en"));
    const overviewItems = [
      {
        label: "Клиенты",
        value: clientRecords.length,
        copy: "Все клиенты из текущих заявок.",
        tone: "accent",
      },
      {
        label: "Заказы",
        value: orderRecords.length,
        copy: "Подтверждённые заявки, уже переведённые в заказы.",
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
        copy: "Заявки, которым требуется внимание.",
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
        "Новые заявки",
        "Последние входящие заявки с сайта. Полная история и детали доступны в разделе «Заявки».",
        renderDashboardNewRequestsTable(recentEntries, {
          req,
          managerOptions,
          returnTo: ADMIN_ROOT_PATH,
          canEdit: accessContext.canEdit,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        }),
        { eyebrow: "Дашборд", muted: true }
      )}
      ${renderAdminCard(
        "Таски на контроле",
        "Открытые таски с дедлайном на сегодня или раньше. Будущие дедлайны остаются в разделе «Заявки → Таски».",
        renderDashboardLeadTasksSection({
          overdueTaskRecords,
          todayTaskRecords,
        }),
        { eyebrow: "Дашборд", muted: true }
      )}
      <div class="admin-section-grid">
        ${renderAdminCard(
        "Заказы без команды",
        "Активные заказы, в которых ещё не назначена команда.",
        renderDashboardOrdersWithoutTeamTable(ordersWithoutTeam, {
          req,
          planningByEntryId,
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
          planningByEntryId,
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
        subtitle: "Единый дашборд по текущим клиентам, заказам и входящим заявкам.",
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

  function renderDashboardNewRequestsTable(entries = [], options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return `<div data-admin-dashboard-new-requests="true" class="admin-alert admin-alert-info">Новых заявок пока нет.</div>`;
    }

    const managerOptions = Array.isArray(options.managerOptions) ? options.managerOptions : [];
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ROOT_PATH;

    return `<div data-admin-dashboard-new-requests="true" class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-success-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Услуга</th>
            <th>Получена</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map((entry) => {
              const dialogId = getQuoteOpsDialogId(entry.id);
              const contactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "", entry.customerEmail || ""]
                .filter(Boolean)
                .join(" • ");
              const scheduleLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime);
              const serviceLabel = formatAdminServiceLabel(entry.serviceName || entry.serviceType);
              return `<tr
                class="admin-table-row-clickable"
                tabindex="0"
                data-admin-dialog-row="true"
                data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                aria-label="${escapeHtmlAttribute(`Открыть заявку ${entry.customerName || "Клиент"}`)}"
              >
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-link">${escapeHtml(entry.customerName || "Клиент")}</span>
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
                    <span>${renderQuoteOpsStatusBadge(entry.status)}</span>
                    <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(entry.fullAddress || "Адрес не указан")}</span>
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      ${entries
        .map((entry) =>
          renderQuoteOpsDetailDialog(entry, returnTo, managerOptions, {
            req: options.req,
            canEdit: options.canEdit,
            leadConnectorConfigured: options.leadConnectorConfigured,
          })
        )
        .join("")}
    </div>`;
  }

  function renderDashboardLeadTasksSection({ overdueTaskRecords = [], todayTaskRecords = [] } = {}) {
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
            <th>Заявка</th>
          </tr>
        </thead>
        <tbody>
          ${allTaskRecords.map((taskRecord) => renderDashboardLeadTaskTableRow(taskRecord, `${ADMIN_QUOTE_OPS_PATH}?section=tasks`)).join("")}
        </tbody>
      </table>
      ${allTaskRecords.map((taskRecord) => renderQuoteOpsTaskResultDialog(taskRecord, `${ADMIN_QUOTE_OPS_PATH}?section=tasks`)).join("")}
    </div>`;
  }

  function renderDashboardLeadTaskTableRow(taskRecord, returnTo) {
    void returnTo;
    const dialogId = `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`;
    const managerLabel = taskRecord.manager.name || taskRecord.manager.email || "Без исполнителя";
    const requestLabel = taskRecord.requestId || taskRecord.entry.id;
    const phoneLabel = taskRecord.entry.customerPhone
      ? formatAdminPhoneNumber(taskRecord.entry.customerPhone) || taskRecord.entry.customerPhone
      : "Телефон не указан";

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть таск ${taskRecord.title} для ${taskRecord.customerName}`)}"
    >
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(taskRecord.title)}</span>
          <span class="admin-table-muted">${escapeHtml(taskRecord.customerName)} • ${escapeHtml(taskRecord.serviceLabel)}</span>
        </div>
      </td>
      <td>
        <span class="admin-table-strong">${escapeHtml(formatAdminDateTime(taskRecord.dueAt))}</span>
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

  return renderDashboardPage;
}

module.exports = {
  createDashboardPageRenderer,
};
