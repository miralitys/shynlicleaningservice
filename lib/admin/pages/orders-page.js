"use strict";
const { enabled: profitabilityEnabled, defaultSource } = require("../../profitability");

const { createOrdersFunnelUi } = require("./orders-funnel-ui");
const { createOrdersPageHelpers } = require("./orders-page-helpers");
const { measureAdminRead } = require("../read-context");
const { paginateAdminList, listReturnUrl, renderAdminListPager, renderAdminListFragment } = require("../list-pagination");
const { ADMIN_LIST_PAGINATION_SCRIPT } = require("../list-pagination-script");

function createOrdersPageRenderer(deps = {}) {
  const {
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDERS_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectAdminOrderRecords,
    collectNonAssignableStaffIds,
    countOrdersByStatus,
    decorateOrderForPlanning,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminOrderRecords,
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
    renderManualOrderRuntimeScript,
    renderOrderManagementDialog,
    renderOrderPaymentStatusBadge,
    renderOrderStatusBadge,
    renderOrderTableRow,
    renderQuoteOpsStatusBadge,
    renderStaffAddressAutocompleteScript,
  } = deps;
  const ORDERS_PAGE_LEDGER_LIMIT = Math.max(Number(QUOTE_OPS_LEDGER_LIMIT) || 250, 1000);
  const { getOrderFunnelStatus, renderOrdersFunnelScript, renderOrdersFunnelStyle, renderOrdersLane, renderOrderFunnelCard } =
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

  function toOrderScheduleTimestamp(dateValue, timeValue) {
    const normalizedDate = normalizeString(dateValue, 32);
    const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return Number.POSITIVE_INFINITY;

    const [, year, month, day] = dateMatch;
    const timeMatch = normalizeString(timeValue, 32).match(/^(\d{1,2}):(\d{2})/);
    const hours = timeMatch ? Number(timeMatch[1]) : 12;
    const minutes = timeMatch ? Number(timeMatch[2]) : 0;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, 0);
  }

  function getOrderScheduleTimestamp(order) {
    const planningItem = order && order.planningItem ? order.planningItem : null;
    const planningTimestamp = Number(planningItem && planningItem.scheduleTimestamp);
    if (Number.isFinite(planningTimestamp)) return planningTimestamp;
    return toOrderScheduleTimestamp(order && order.selectedDate, order && order.selectedTime);
  }

  function compareOrdersByScheduledVisit(left, right) {
    const leftTimestamp = getOrderScheduleTimestamp(left);
    const rightTimestamp = getOrderScheduleTimestamp(right);
    if (leftTimestamp !== rightTimestamp) return leftTimestamp < rightTimestamp ? -1 : 1;

    const leftCreatedAt = Date.parse((left && left.createdAt) || "");
    const rightCreatedAt = Date.parse((right && right.createdAt) || "");
    if (Number.isFinite(leftCreatedAt) || Number.isFinite(rightCreatedAt)) {
      return (
        (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) -
        (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0)
      );
    }

    return normalizeString((left && left.id) || "", 120).localeCompare(
      normalizeString((right && right.id) || "", 120),
      "en"
    );
  }

  function compareOrdersByNewestScheduledVisit(left, right) {
    const leftTimestamp = getOrderScheduleTimestamp(left);
    const rightTimestamp = getOrderScheduleTimestamp(right);
    const leftHasSchedule = Number.isFinite(leftTimestamp);
    const rightHasSchedule = Number.isFinite(rightTimestamp);
    if (leftHasSchedule && rightHasSchedule && leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }
    if (leftHasSchedule !== rightHasSchedule) return leftHasSchedule ? -1 : 1;

    const leftCreatedAt = Date.parse((left && left.createdAt) || "");
    const rightCreatedAt = Date.parse((right && right.createdAt) || "");
    if (Number.isFinite(leftCreatedAt) || Number.isFinite(rightCreatedAt)) {
      return (
        (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) -
        (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0)
      );
    }

    return normalizeString((left && left.id) || "", 120).localeCompare(
      normalizeString((right && right.id) || "", 120),
      "en"
    );
  }

  function groupOrdersByFunnelStatus(orders) {
    const lanes = new Map();
    for (const order of orders) {
      const status = getOrderFunnelStatus(order);
      if (!lanes.has(status)) lanes.set(status, []);
      lanes.get(status).push(order);
    }
    lanes.get("scheduled")?.sort(compareOrdersByScheduledVisit);
    return lanes;
  }

  async function getOrdersStaffContext(staffStore, usersStore) {
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
    return {
      filteredStaffSnapshot,
      hiddenStaffNames,
      staffRecords: Array.isArray(filteredStaffSnapshot.staff) ? filteredStaffSnapshot.staff : [],
    };
  }

  async function renderOrderDialogFragment(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const reqUrl = getRequestUrl(req);
    const orderId = normalizeString(reqUrl.searchParams.get("order"), 120);
    if (!orderId || !quoteOpsLedger || typeof quoteOpsLedger.getEntry !== "function") {
      return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;
    }

    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    const [entry, staffContext] = await Promise.all([
      quoteOpsLedger.getEntry(orderId, { allowMemoryFallback: false }),
      measureAdminRead("orders_staff_context", () => getOrdersStaffContext(staffStore, usersStore)),
    ]);
    if (!entry) return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;

    const projectedOrders = measureAdminRead("orders_projection", () => collectAdminOrderRecords ? collectAdminOrderRecords([entry]) : []);
    const planning = measureAdminRead("orders_planning", () =>
      buildStaffPlanningContext([entry], staffContext.filteredStaffSnapshot, projectedOrders));
    const projectedOrder = projectedOrders.find((order) => order.id === orderId) || null;
    if (!projectedOrder) return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;

    const order = decorateOrderForPlanning(
      projectedOrder,
      planning.orderItemsByEntryId,
      staffContext.hiddenStaffNames
    );
    const requestedReturnTo = normalizeString(reqUrl.searchParams.get("returnTo"), 1000) || ADMIN_ORDERS_PATH;
    const returnTo = buildAdminRedirectPath(requestedReturnTo, {
      fragment: "",
      order: "",
      amountEditor: "",
    });
    const accessContext = getWorkspaceAccessContext(adminRuntime);

    return measureAdminRead("orders_dialog", () => renderOrderManagementDialog(order, returnTo, {
      req,
      planningItem: planning.orderItemsByEntryId.get(order.id) || null,
      staffRecords: staffContext.staffRecords,
      canDelete: accessContext.canDelete,
      canEdit: accessContext.canEdit,
      leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
      deferSmsHistory: true,
    }));
  }

  async function renderManualOrderDialog(req, quoteOpsLedger, adminRuntime = {}, entries = null, returnTo = "") {
    const reqUrl = getRequestUrl(req);
    if (getWorkspaceAccessContext(adminRuntime).canEdit === false) return "";
    const allEntries = entries || (typeof quoteOpsLedger?.listOrderListEntries === "function"
      ? await quoteOpsLedger.listOrderListEntries()
      : await quoteOpsLedger.listEntries({ limit: ORDERS_PAGE_LEDGER_LIMIT }));
    const clientRecords = measureAdminRead("orders_clients", () => collectAdminClientRecords(allEntries));
    if (profitabilityEnabled()) {
      let sources = null;
      try { sources = await measureAdminRead("orders_sources", async () =>
        new Map((await adminRuntime.profitabilityStore.listSources()).map(item => [item.id, item.source]))); }
      catch { /* A private finance-store outage must not hide ordinary orders. */ }
      const orderIds = new Set(collectAdminOrderRecords(allEntries).map(order => order.id));
      for (const client of clientRecords) {
        const first = client.entries.filter(entry => orderIds.has(entry.id)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))[0];
        client.acquisitionSource = sources ? sources.get(first?.id) || defaultSource(first) : "";
      }
    }
    const createClientKey = normalizeString(reqUrl.searchParams.get("createClientKey"), 250);
    const createAddressKey = normalizeString(reqUrl.searchParams.get("createAddressKey"), 500);
    const createClient = createClientKey ? clientRecords.find(client => client.key === createClientKey) || null : null;
    const missingClient = Boolean(createClientKey && (!createClient ||
      (createAddressKey && !createClient.addresses.some(address => address.key === createAddressKey))));
    return (missingClient ? '<div class="admin-alert admin-alert-error">Клиент или адрес не найден. Выберите клиента заново.</div>' : "") +
      measureAdminRead("orders_create_form", () => renderCreateManualOrderDialog({
        autoOpen: reqUrl.searchParams.get("createOrder") === "1", includeRuntime: false,
        returnTo: returnTo || buildAdminRedirectPath(normalizeString(reqUrl.searchParams.get("returnTo"), 1000) || ADMIN_ORDERS_PATH, { fragment: "" }),
        clientRecords, selectedClient: createClient, selectedAddressKey: createAddressKey,
        clientPrefillRequested: Boolean(createClientKey),
      }));
  }

  async function renderOrdersPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}, staffContextResult = null) {
    const { reqUrl, filters } = getOrdersFilters(req);
    const selectedOrderId = normalizeString(reqUrl.searchParams.get("order"), 120);
    let selectedOrderUnavailable = false;
    const cachedEntries = Array.isArray(adminRuntime && adminRuntime.orderPageEntries)
      ? adminRuntime.orderPageEntries
      : null;
    const allEntries = cachedEntries
      ? cachedEntries.slice()
      : quoteOpsLedger
        ? await quoteOpsLedger.listEntries({ limit: ORDERS_PAGE_LEDGER_LIMIT })
        : [];
    if (
      selectedOrderId &&
      quoteOpsLedger &&
      typeof quoteOpsLedger.getEntry === "function" &&
      (adminRuntime.orderPageEntriesAreSummaries ||
        !allEntries.some((entry) => normalizeString(entry && entry.id, 120) === selectedOrderId))
    ) {
      const selectedEntry = await quoteOpsLedger.getEntry(selectedOrderId, { allowMemoryFallback: false });
      if (!selectedEntry && adminRuntime.orderPageEntriesAreSummaries) selectedOrderUnavailable = true;
      if (selectedEntry) {
        const index = allEntries.findIndex(entry => entry.id === selectedOrderId);
        if (index < 0) allEntries.push(selectedEntry);
        else allEntries[index] = selectedEntry;
      }
    }
    const listFragment = reqUrl.searchParams.get("fragment") === "list";
    const summaryOrders = adminRuntime.orderPageEntriesAreSummaries
      ? measureAdminRead("orders_projection", () => collectAdminOrderRecords(allEntries)) : null;
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    const preparedStaff = staffContextResult ? await staffContextResult : null;
    if (preparedStaff?.error) throw preparedStaff.error;
    const staffContext = preparedStaff ? preparedStaff.value
      : await measureAdminRead("orders_staff_context", () => getOrdersStaffContext(staffStore, usersStore));
    const { filteredStaffSnapshot, hiddenStaffNames, staffRecords } = staffContext;
    const planning = measureAdminRead("orders_planning", () =>
      buildStaffPlanningContext(allEntries, filteredStaffSnapshot, summaryOrders || []));
    const planningByEntryId = planning.orderItemsByEntryId;
    // Summaries are display-only and must never replace the full shared order store.
    const projectedOrders = summaryOrders || await measureAdminRead("orders_projection", () => getProjectedOrderRecords(adminRuntime, allEntries));
    const allOrders = measureAdminRead("orders_projection", () => projectedOrders.map((order) =>
      decorateOrderForPlanning(order, planningByEntryId, hiddenStaffNames)
    ));
    const orders = measureAdminRead("orders_filter", () => filterAdminOrderRecords(allOrders, filters).slice().sort(compareOrdersByNewestScheduledVisit));
    const totalOrders = allOrders.length;
    const scheduledCount = allOrders.filter((order) => order.hasSchedule).length;
    const noScheduleOpenCount = allOrders.filter(
      (order) => !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const unassignedOpenCount = allOrders.filter(
      (order) => !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const statusCounts = measureAdminRead("orders_counts", () => countOrdersByStatus(allOrders));
    const funnelLanes = measureAdminRead("orders_counts", () => groupOrdersByFunnelStatus(orders));
    const activeCount = Math.max(0, totalOrders - statusCounts.completed - statusCounts.canceled);
    const orderById = new Map(allOrders.map((order) => [order.id, order]));
    const upcomingOrders = planning.scheduledOrders.slice(0, 8)
      .map((planningItem) => {
        const order = orderById.get(planningItem.entry.id);
        if (!order) return null;
        return { order, planningItem };
      })
      .filter(Boolean);
    const currentReturnTo = listReturnUrl(reqUrl);
    const autoOpenAmountEditor = normalizeString(reqUrl.searchParams.get("amountEditor"), 16) === "1";
    const autoOpenCreateOrderDialog = normalizeString(reqUrl.searchParams.get("createOrder"), 16) === "1";
    const createDialog = !listFragment && autoOpenCreateOrderDialog && getWorkspaceAccessContext(adminRuntime).canEdit
      ? await renderManualOrderDialog(req, quoteOpsLedger, adminRuntime, allEntries, currentReturnTo) : "";
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
    const funnelStatuses = [
      "new",
      "policy",
      "scheduled",
      "en-route",
      "rescheduled",
      "cleaning-started",
      "checklist",
      "photos",
      "cleaning-complete",
      "invoice-sent",
      "paid",
      "awaiting-review",
      "completed",
      "canceled",
    ];
    const emptyStateMessage = hasActiveFilters
      ? "По текущему фильтру заказов нет. Попробуйте очистить поиск или снять часть фильтров."
      : "Пока заказов нет. Подтверждённые заявки будут появляться здесь после создания заказа.";
    const overviewItems = [
      {
        label: "Активные",
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
    const getDialogUrl = (order) =>
      buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
        fragment: "order-dialog",
        order: order.id,
        returnTo: currentReturnTo,
      });
    const getDialogFallbackUrl = (order) =>
      buildAdminRedirectPath(currentReturnTo, {
        order: order.id,
      });
    const selectedOrder = selectedOrderId && !selectedOrderUnavailable ? orderById.get(selectedOrderId) || null : null;
    const tablePage = paginateAdminList(orders, { id: "orders-table", filters, url: reqUrl, key: order => order.id });
    const lanePages = new Map(funnelStatuses.map(status => [status, paginateAdminList(funnelLanes.get(status) || [], {
      id: `orders-${status}`, filters, url: reqUrl, key: order => order.id,
    })]));
    const renderTableRows = page => page.rows.map(order => renderOrderTableRow(order, currentReturnTo, {
      planningItem: planningByEntryId.get(order.id) || null,
      dialogUrl: getDialogUrl(order), dialogFallbackUrl: getDialogFallbackUrl(order), listKey: order.id,
    })).join("");
    if (reqUrl.searchParams.get("fragment") === "list") {
      const listId = reqUrl.searchParams.get("list");
      if (listId === tablePage.id) return renderAdminListFragment(tablePage, renderTableRows(tablePage), { table: true });
      const page = [...lanePages.values()].find(page => page.id === listId);
      if (!page) return renderAdminListFragment({ ...tablePage, error: true }, "", { table: true });
      return renderAdminListFragment(page, page.rows.map(order => renderOrderFunnelCard(order, currentReturnTo, {
        planningItem: planningByEntryId.get(order.id) || null, canEdit: accessContext.canEdit,
        dialogUrl: getDialogUrl(order), dialogFallbackUrl: getDialogFallbackUrl(order), listKey: order.id,
      })).join(""));
    }

    return measureAdminRead("orders_html", () => renderAdminLayout(
      "Заказы",
      `<div class="admin-orders-page">
        ${selectedOrderUnavailable ? `<div class="admin-alert admin-alert-error">Не удалось загрузить полную карточку заказа. Обновите страницу.</div>` : ""}
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
                      <a class="admin-button" href="${escapeHtmlAttribute(buildAdminRedirectPath(currentReturnTo, { createOrder: "1" }))}" data-admin-dialog-open="${ADMIN_MANUAL_ORDER_DIALOG_ID}" data-admin-dialog-url="${escapeHtmlAttribute(buildAdminRedirectPath(ADMIN_ORDERS_PATH, { fragment: "create-order-dialog", returnTo: currentReturnTo }))}" data-admin-dialog-fallback-url="${escapeHtmlAttribute(buildAdminRedirectPath(currentReturnTo, { createOrder: "1" }))}">Добавить заказ</a>
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
                      <option value="en-route"${filters.status === "en-route" ? " selected" : ""}>В пути</option>
                      <option value="rescheduled"${filters.status === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="cleaning-started"${filters.status === "cleaning-started" ? " selected" : ""}>Начать уборку</option>
                      <option value="checklist"${filters.status === "checklist" ? " selected" : ""}>Чеклист</option>
                      <option value="photos"${filters.status === "photos" ? " selected" : ""}>Фото</option>
                      <option value="cleaning-complete"${filters.status === "cleaning-complete" ? " selected" : ""}>Уборка завершена</option>
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
                      <option value="move-in"${filters.serviceType === "move-in" ? " selected" : ""}>Move-in</option>
                      <option value="move-out"${filters.serviceType === "move-out" ? " selected" : ""}>Move-out</option>
                      <option value="move-in/out"${filters.serviceType === "move-in/out" ? " selected" : ""}>Move-in/out (нужно уточнить)</option>
                      <option value="free-in-home-estimate"${filters.serviceType === "free-in-home-estimate" ? " selected" : ""}>Free in-home estimate</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Повторяемость
                    <select class="admin-input" name="frequency">
                      <option value="all"${filters.frequency === "all" ? " selected" : ""}>Все</option>
                      <option value="weekly"${filters.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                      <option value="biweekly"${filters.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                      <option value="every3weeks"${filters.frequency === "every3weeks" ? " selected" : ""}>Every 3 weeks</option>
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
              ? `<section class="admin-orders-funnel-section">
                  <div class="admin-subsection-head">
                    <div>
                      <h3 class="admin-subsection-title">Статус заказов</h3>
                      <p class="admin-order-detail-copy">Текущая выборка заказов, разложенная по статусам выполнения.</p>
                    </div>
                  </div>
                  <div class="admin-order-funnel-board">
                    <form method="post" action="${ADMIN_ORDERS_PATH}" data-order-funnel-stage-form="true" hidden>
                      <input type="hidden" name="entryId" value="">
                      <input type="hidden" name="orderStatus" value="">
                      <input type="hidden" name="cancelScope" value="current">
                      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
                    </form>
                    ${measureAdminRead("orders_funnel", () => funnelStatuses
                      .map((status) =>
                        renderOrdersLane(
                          status,
                          lanePages.get(status).rows,
                          currentReturnTo,
                          planningByEntryId,
                          staffRecords,
                          {
                            canDelete: accessContext.canDelete,
                            canEdit: accessContext.canEdit,
                            droppable: true,
                            getDialogUrl,
                            getDialogFallbackUrl,
                            page: lanePages.get(status),
                          }
                        )
                      )
                      .join(""))}
                  </div>
                </section>
                <div style="min-width:0" data-admin-list-id="orders-table" data-admin-list-total="${tablePage.total}" data-admin-list-start="${tablePage.start}">
                <div class="admin-table-wrap admin-orders-table-wrap admin-orders-table-wrap-capped">
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
                    <tbody data-admin-list-rows="true">
                      ${measureAdminRead("orders_table", () => renderTableRows(tablePage))}
                    </tbody>
                  </table>
                </div>
                ${renderAdminListPager(tablePage)}</div>
                <div data-admin-order-dialog-host="true">
                  ${selectedOrder
                    ? measureAdminRead("orders_dialog", () => renderOrderManagementDialog(selectedOrder, currentReturnTo, {
                      req,
                      planningItem: planningByEntryId.get(selectedOrder.id) || null,
                      staffRecords,
                      canDelete: accessContext.canDelete,
                      canEdit: accessContext.canEdit,
                      leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                      autoOpen: true,
                      autoOpenAmountEditor,
                      closeHref: closeOrderHref,
                      deferSmsHistory: true,
                    }))
                    : ""}
                </div>`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
          </div>`,
          { className: "admin-orders-card" }
        )}
        <div data-admin-manual-order-dialog-host="true">${createDialog}</div>
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
        bodyScripts: (renderStaffAddressAutocompleteScript ? renderStaffAddressAutocompleteScript({ deferInitial: !selectedOrder && !createDialog }) : "") +
          (accessContext.canEdit && renderManualOrderRuntimeScript ? renderManualOrderRuntimeScript() : "") + ADMIN_LIST_PAGINATION_SCRIPT,
      }
    ));
  }

  renderOrdersPage.renderDialogFragment = renderOrderDialogFragment;
  renderOrdersPage.renderCreateDialogFragment = renderManualOrderDialog;
  renderOrdersPage.prepareStaffContext = (staffStore, usersStore) =>
    measureAdminRead("orders_staff_context", () => getOrdersStaffContext(staffStore, usersStore));
  return renderOrdersPage;
}

module.exports = {
  createOrdersPageRenderer,
};
