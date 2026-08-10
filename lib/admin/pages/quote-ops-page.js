"use strict";

function createQuoteOpsPageRenderer(deps = {}) {
  const {
    ADMIN_QUOTE_OPS_PATH,
    QUOTE_OPS_PAGE_LEDGER_LIMIT,
    QUOTE_OPS_TASK_CLIENT_LEDGER_LIMIT = QUOTE_OPS_PAGE_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildQuoteOpsTaskRecords,
    collectQuoteOpsManagerOptions,
    collectQuoteOpsTaskAssigneeOptions,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterQuoteOpsEntries,
    formatAdminPhoneNumber,
    getLeadStatus,
    getQuoteOpsFilters,
    getQuoteLeadManager,
    getWorkspaceAccessContext,
    buildFormattedScheduleLabel,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminDialogCloseButton,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsDiscussionStageDialog,
    renderQuoteOpsFunnelLane,
    renderQuoteOpsFunnelScript,
    renderQuoteOpsLeadStatusLane,
    renderQuoteOpsNotice,
    renderQuoteOpsOverviewStrip,
    renderQuoteOpsSectionNav,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsTaskTableRow,
    renderQuoteOpsWorkspaceStyle,
  } = deps;

  const listLeadStatusGroups = [
    {
      id: "new",
      badgeStatus: "new",
      statuses: ["new", "no-response", "discussion"],
      kicker: "Входящий поток",
      title: "Новые заявки",
      copy: "Новые заявки и рабочие статусы до подтверждения. Внутри блока сначала ближайшие даты уборки.",
    },
    {
      id: "confirmed",
      badgeStatus: "confirmed",
      statuses: ["confirmed"],
      kicker: "Запланировано",
      title: "Подтверждено",
      copy: "Уборки, которые уже подтверждены и ожидают выполнения. Сортировка по дате уборки.",
    },
    {
      id: "completed",
      badgeStatus: "completed",
      statuses: ["completed"],
      kicker: "Закрыто",
      title: "Выполнено",
      copy: "Завершённые заявки, отсортированные по дате уборки.",
    },
    {
      id: "declined",
      badgeStatus: "declined",
      statuses: ["declined"],
      kicker: "Закрыто",
      title: "Отказ",
      copy: "Заявки, по которым клиент отказался или работа не продолжается. Сортировка по дате уборки.",
    },
  ];

  function toQuoteOpsScheduleTimestamp(entry) {
    const normalizedDate = normalizeString(entry && entry.selectedDate, 32);
    const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return Number.POSITIVE_INFINITY;

    const [, year, month, day] = dateMatch;
    const timeMatch = normalizeString(entry && entry.selectedTime, 32).match(/^(\d{1,2}):(\d{2})/);
    const hours = timeMatch ? Number(timeMatch[1]) : 12;
    const minutes = timeMatch ? Number(timeMatch[2]) : 0;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, 0);
  }

  function compareQuoteOpsEntriesByCleaningDate(left, right) {
    const leftTimestamp = toQuoteOpsScheduleTimestamp(left);
    const rightTimestamp = toQuoteOpsScheduleTimestamp(right);
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

  async function renderQuoteOpsPage(req, config, quoteOpsLedger, adminRuntime = {}, staffStore = null) {
    void config;
    const { reqUrl, filters } = getQuoteOpsFilters(req);
    const selectedEntryId = normalizeString(reqUrl.searchParams.get("entry"), 120);
    const pageLedgerLimit = filters.section === "tasks"
      ? QUOTE_OPS_TASK_CLIENT_LEDGER_LIMIT
      : QUOTE_OPS_PAGE_LEDGER_LIMIT;
    const cachedEntries = Array.isArray(adminRuntime && adminRuntime.quoteOpsPageEntries)
      ? adminRuntime.quoteOpsPageEntries
      : null;
    const allEntriesRaw = cachedEntries
      ? cachedEntries.slice(0, pageLedgerLimit)
      : quoteOpsLedger
        ? await quoteOpsLedger.listEntries({ limit: pageLedgerLimit })
        : [];
    if (
      selectedEntryId &&
      quoteOpsLedger &&
      typeof quoteOpsLedger.getEntry === "function" &&
      !allEntriesRaw.some((entry) => normalizeString(entry && entry.id, 120) === selectedEntryId)
    ) {
      const selectedEntry = await quoteOpsLedger.getEntry(selectedEntryId);
      if (selectedEntry) allEntriesRaw.push(selectedEntry);
    }
    const allEntries = filterQuoteOpsEntries(allEntriesRaw, {
      status: "all",
      serviceType: "all",
      leadStatus: "all",
      managerId: "",
      q: "",
      limit: pageLedgerLimit,
    });
    const entries = filterQuoteOpsEntries(allEntries, filters);
    const managerOptions = await collectQuoteOpsManagerOptions(adminRuntime, staffStore);
    const taskAssigneeOptions =
      typeof collectQuoteOpsTaskAssigneeOptions === "function"
        ? await collectQuoteOpsTaskAssigneeOptions(adminRuntime, staffStore)
        : managerOptions.map((manager) => ({
            ...manager,
            role: "manager",
            label: manager.name,
          }));
    const activeSection = filters.section || "list";
    const totalEntries = allEntries.length;
    const successCount = allEntries.filter((entry) => entry.status === "success").length;
    const warningCount = allEntries.filter((entry) => entry.status === "warning").length;
    const errorCount = allEntries.filter((entry) => entry.status === "error").length;
    const attentionCount = warningCount + errorCount;
    const last24HoursThreshold = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = allEntries.filter((entry) => {
      const createdAtMs = Date.parse(entry.createdAt);
      return Number.isFinite(createdAtMs) && createdAtMs >= last24HoursThreshold;
    }).length;
    const filteredCount = entries.length;
    const hasSearchQuery = Boolean(filters.q);
    const hasActiveFilters = Boolean(
      filters.q ||
      filters.status !== "all" ||
      filters.serviceType !== "all" ||
      filters.leadStatus !== "all" ||
      filters.managerId
    );
    const advancedFilterCount = [
      filters.status !== "all",
      filters.serviceType !== "all",
      filters.leadStatus !== "all",
      Boolean(filters.managerId),
    ].filter(Boolean).length;
    const managerOptionById = new Map(managerOptions.map((manager) => [manager.id, manager]));
    const crmFilterLabels = {
      success: "Успешно",
      warning: "Проверить",
      error: "Ошибка",
    };
    const leadFilterLabels = {
      new: "New",
      "no-response": "Без ответа",
      discussion: "Обсуждение",
      confirmed: "Подтверждено",
      completed: "Выполнено",
      declined: "Отказ",
    };
    const taskClientGroups = new Map();
    allEntries.forEach((entry) => {
      const name = normalizeString(entry && entry.customerName, 200) || "Клиент";
      const phone = normalizeString(entry && entry.customerPhone, 80);
      const phoneDigits = phone.replace(/\D+/g, "");
      const email = normalizeString(entry && entry.customerEmail, 250).toLowerCase();
      const address = normalizeString(
        (entry &&
          (entry.customerAddress ||
            entry.fullAddress ||
            entry.address ||
            entry.serviceAddress)) ||
          "",
        500
      );
      const identityKey =
        (phoneDigits.length >= 7 && `phone:${phoneDigits}`) ||
        (email && `email:${email}`) ||
        `name:${name.toLowerCase()}|address:${address.toLowerCase()}`;
      const group = taskClientGroups.get(identityKey) || [];
      group.push(entry);
      taskClientGroups.set(identityKey, group);
    });
    const activeTaskEntryStatuses = new Set(["new", "no-response", "discussion", "confirmed"]);
    const taskClientCandidates = Array.from(taskClientGroups.values())
      .map((groupEntries) => {
        const sortedEntries = groupEntries.slice().sort((left, right) => {
          const leftStatus = getLeadStatus(left);
          const rightStatus = getLeadStatus(right);
          const activeDifference =
            Number(activeTaskEntryStatuses.has(rightStatus)) -
            Number(activeTaskEntryStatuses.has(leftStatus));
          if (activeDifference !== 0) return activeDifference;

          const leftCreatedAt = Date.parse((left && (left.updatedAt || left.createdAt)) || "");
          const rightCreatedAt = Date.parse((right && (right.updatedAt || right.createdAt)) || "");
          return (
            (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) -
            (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0)
          );
        });
        const entry = sortedEntries[0];
        const leadStatus = getLeadStatus(entry);
        const manager = typeof getQuoteLeadManager === "function"
          ? getQuoteLeadManager(entry)
          : { id: "", name: "" };
        const name = normalizeString(entry && entry.customerName, 200) || "Клиент";
        const phone = normalizeString(entry && entry.customerPhone, 80);
        const email = normalizeString(entry && entry.customerEmail, 250).toLowerCase();
        const address = normalizeString(
          (entry &&
            (entry.customerAddress ||
              entry.fullAddress ||
              entry.address ||
              entry.serviceAddress)) ||
            "",
          500
        );
        const scheduleLabel =
          typeof buildFormattedScheduleLabel === "function"
            ? buildFormattedScheduleLabel(entry && entry.selectedDate, entry && entry.selectedTime)
            : "";
        const createdAt = Date.parse((entry && entry.createdAt) || "");
        return {
          entry,
          name,
          phone,
          phoneLabel:
            (typeof formatAdminPhoneNumber === "function" && formatAdminPhoneNumber(phone)) || phone,
          email,
          address,
          scheduleLabel,
          leadStatus,
          leadLabel: leadFilterLabels[leadStatus] || leadStatus || "New",
          managerId: normalizeString(manager && manager.id, 120),
          managerName: normalizeString(manager && manager.name, 200),
          requestCount: groupEntries.length,
          createdAt: Number.isFinite(createdAt) ? createdAt : 0,
        };
      })
      .sort((left, right) => right.createdAt - left.createdAt);
    const currentPortalUserId = normalizeString(
      adminRuntime &&
        adminRuntime.currentUserAccess &&
        adminRuntime.currentUserAccess.user &&
        adminRuntime.currentUserAccess.user.id,
      120
    );
    const defaultTaskAssigneeId =
      taskAssigneeOptions.some((assignee) => assignee.id === currentPortalUserId)
        ? currentPortalUserId
        : normalizeString(taskAssigneeOptions[0] && taskAssigneeOptions[0].id, 120);
    const serviceFilterLabels = {
      regular: "Регулярная",
      deep: "Генеральная",
      moving: "Перед переездом",
    };
    const advancedResetHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
      section: activeSection !== "list" ? activeSection : "",
      q: filters.q,
      status: "",
      serviceType: "",
      leadStatus: "",
      managerId: "",
    });
    const resetHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
      section: activeSection !== "list" ? activeSection : "",
      q: "",
      status: "",
      serviceType: "",
      leadStatus: "",
      managerId: "",
    });
    const listLeadStatusLanes = listLeadStatusGroups
      .map((group) => {
        const statusSet = new Set(group.statuses);
        return {
          ...group,
          entries: entries
            .filter((entry) => statusSet.has(getLeadStatus(entry)))
            .slice()
            .sort(compareQuoteOpsEntriesByCleaningDate),
        };
      })
      .filter((group) => group.entries.length > 0);
    const funnelStatuses = ["new", "no-response", "discussion", "confirmed", "completed", "declined"];
    const taskRecords = buildQuoteOpsTaskRecords(entries)
      .filter((task) => task.status === "open")
      .sort((left, right) => {
        const leftTime = Date.parse(left.dueAt || "");
        const rightTime = Date.parse(right.dueAt || "");
        if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
        if (!Number.isFinite(leftTime)) return 1;
        if (!Number.isFinite(rightTime)) return -1;
        return leftTime - rightTime;
      });
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const selectedTaskId = normalizeString(reqUrl.searchParams.get("task"), 120);
    const closeEntryHref = buildAdminRedirectPath(currentReturnTo, {
      entry: "",
    });
    const closeTaskHref = buildAdminRedirectPath(currentReturnTo, {
      task: "",
    });
    const sectionTitle =
      activeSection === "funnel"
        ? "Статус заявок"
        : activeSection === "tasks"
          ? "Таски по заявкам"
          : "Лента заявок";
    const sectionSubtitle =
      activeSection === "funnel"
        ? "Перетаскивайте заявки между этапами, назначайте менеджеров и держите всю воронку перед глазами."
        : activeSection === "tasks"
          ? "Здесь собраны все открытые действия по заявкам с дедлайнами и быстрыми результатами звонка."
          : "Рабочая лента заявок: новые, подтверждённые, выполненные и отказанные. Внутри каждого статуса заявки идут по дате уборки.";
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const filterBadges = [
      hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : "",
      filters.status !== "all" ? renderAdminBadge(`CRM: ${crmFilterLabels[filters.status] || filters.status}`, "outline") : "",
      filters.leadStatus !== "all" ? renderAdminBadge(`Этап: ${leadFilterLabels[filters.leadStatus] || filters.leadStatus}`, "outline") : "",
      filters.serviceType !== "all" ? renderAdminBadge(`Тип: ${serviceFilterLabels[filters.serviceType] || filters.serviceType}`, "outline") : "",
      filters.managerId
        ? renderAdminBadge(`Менеджер: ${(managerOptionById.get(filters.managerId) || {}).name || "Выбран"}`, "outline")
        : "",
    ]
      .filter(Boolean)
      .join("");
    const filtersPanel = `<section class="admin-orders-filters-panel admin-quote-ops-filter-shell" id="admin-quote-ops-filters">
      <div class="admin-orders-panel-head">
        <div>
          <p class="admin-orders-panel-kicker">Навигация</p>
          <h2 class="admin-orders-panel-title">Быстро найти нужную заявку</h2>
          <p class="admin-orders-panel-copy">Поиск по имени, телефону, email, request ID и адресу. Фильтры одинаково работают для ленты, воронки и тасков.</p>
        </div>
        <span class="admin-action-hint">Показано ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalEntries))} заявок.</span>
      </div>
      <div class="admin-orders-toolbar-shell">
        <details class="admin-filter-disclosure admin-orders-filter-toggle"${advancedFilterCount ? " open" : ""}>
          <summary class="admin-clients-toolbar-button">
            <span>Фильтры</span>
            ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
          </summary>
        </details>
        <form
          class="admin-clients-search-form"
          method="get"
          action="${ADMIN_QUOTE_OPS_PATH}"
          data-admin-auto-submit="true"
          data-admin-auto-submit-delay="600"
          data-admin-auto-submit-min-length="2"
          data-admin-auto-submit-restore-focus="true"
          data-admin-auto-submit-scroll-target="#admin-quote-ops-filters"
          data-admin-auto-submit-scroll-offset="18"
        >
          ${renderAdminHiddenInput("section", activeSection !== "list" ? activeSection : "")}
          ${renderAdminHiddenInput("status", filters.status !== "all" ? filters.status : "")}
          ${renderAdminHiddenInput("serviceType", filters.serviceType !== "all" ? filters.serviceType : "")}
          ${renderAdminHiddenInput("leadStatus", filters.leadStatus !== "all" ? filters.leadStatus : "")}
          ${renderAdminHiddenInput("managerId", filters.managerId)}
          <label class="admin-clients-search-box">
            <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
            <input
              class="admin-input admin-clients-search-input"
              type="search"
              name="q"
              value="${escapeHtmlText(filters.q)}"
              placeholder="Поиск по клиенту, телефону, адресу, заявке или менеджеру"
            >
          </label>
          <button class="admin-sr-only" type="submit">Обновить поиск</button>
          ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
        </form>
        <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
          <form class="admin-orders-filter-bar" method="get" action="${ADMIN_QUOTE_OPS_PATH}">
            ${renderAdminHiddenInput("section", activeSection !== "list" ? activeSection : "")}
            ${renderAdminHiddenInput("q", filters.q)}
            <label class="admin-label">
              CRM
              <select class="admin-input" name="status">
                <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                <option value="success"${filters.status === "success" ? " selected" : ""}>Успешно</option>
                <option value="warning"${filters.status === "warning" ? " selected" : ""}>Проверить</option>
                <option value="error"${filters.status === "error" ? " selected" : ""}>Ошибка</option>
              </select>
            </label>
            <label class="admin-label">
              Этап
              <select class="admin-input" name="leadStatus">
                <option value="all"${filters.leadStatus === "all" ? " selected" : ""}>Все</option>
                <option value="new"${filters.leadStatus === "new" ? " selected" : ""}>New</option>
                <option value="no-response"${filters.leadStatus === "no-response" ? " selected" : ""}>Без ответа</option>
                <option value="discussion"${filters.leadStatus === "discussion" ? " selected" : ""}>Обсуждение</option>
                <option value="confirmed"${filters.leadStatus === "confirmed" ? " selected" : ""}>Подтверждено</option>
                <option value="completed"${filters.leadStatus === "completed" ? " selected" : ""}>Выполнено</option>
                <option value="declined"${filters.leadStatus === "declined" ? " selected" : ""}>Отказ</option>
              </select>
            </label>
            <label class="admin-label">
              Менеджер
              <select class="admin-input" name="managerId">
                <option value="">Все</option>
                ${managerOptions.map((manager) => `
                  <option value="${escapeHtmlAttribute(manager.id)}"${manager.id === filters.managerId ? " selected" : ""}>${escapeHtml(manager.name)}</option>
                `).join("")}
              </select>
            </label>
            <label class="admin-label">
              Тип уборки
              <select class="admin-input" name="serviceType">
                <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                <option value="regular"${filters.serviceType === "regular" ? " selected" : ""}>Регулярная</option>
                <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Генеральная</option>
                <option value="moving"${filters.serviceType === "moving" ? " selected" : ""}>Перед переездом</option>
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
                Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalEntries))} заявок.
                С учётом поиска и фильтров.
              </p>
              ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
            </div>
          </div>`
        : ""}
    </section>`;

    const listBody = listLeadStatusLanes.length > 0
      ? `<div class="admin-quote-lanes">
          ${listLeadStatusLanes.map((group) => renderQuoteOpsLeadStatusLane(group, group.entries, currentReturnTo)).join("")}
        </div>`
      : `<div class="admin-empty-state">По текущему фильтру заявок нет. Попробуйте сбросить фильтры или изменить поисковый запрос.</div>`;
    const funnelBody = `<div class="admin-quote-funnel-board">
      ${funnelStatuses.map((status) => renderQuoteOpsFunnelLane(status, entries.filter((entry) => getLeadStatus(entry) === status), currentReturnTo)).join("")}
    </div>
    <form method="post" action="${ADMIN_QUOTE_OPS_PATH}" data-quote-funnel-stage-form="true" hidden>
      <input type="hidden" name="action" value="update-lead-status">
      <input type="hidden" name="entryId" value="">
      <input type="hidden" name="leadStatus" value="">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
    </form>
    ${renderQuoteOpsDiscussionStageDialog(currentReturnTo)}`;
    const createTaskDialogId = "admin-quote-create-task-dialog";
    const createTaskDialog = `<dialog class="admin-dialog admin-quote-manual-task-dialog" id="${createTaskDialogId}" aria-labelledby="${createTaskDialogId}-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-orders-panel-kicker">Ручной контроль</p>
            <h2 class="admin-dialog-title" id="${createTaskDialogId}-title">Создать таск</h2>
            <p class="admin-dialog-copy">Найдите клиента, выберите действие и срок. Ответственный менеджер подставится автоматически.</p>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions">
            ${renderAdminDialogCloseButton(createTaskDialogId, "Закрыть окно создания таска")}
          </div>
        </div>
        ${taskAssigneeOptions.length === 0
          ? `<div class="admin-alert admin-alert-error">Нет активных админов или менеджеров, которым можно назначить таск.</div>`
          : ""}
        <form class="admin-form admin-form-grid admin-form-grid-two admin-quote-manual-task-form" method="post" action="${ADMIN_QUOTE_OPS_PATH}">
        <input type="hidden" name="action" value="create-lead-task">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
        <div class="admin-label admin-quote-task-client-picker" data-quote-task-client-picker="true">
          <span>Клиент или заявка</span>
          <input type="hidden" name="entryId" value="" data-quote-task-entry-id="true">
          <div class="admin-quote-task-client-search-shell">
            <span class="admin-quote-task-client-search-icon" aria-hidden="true">⌕</span>
            <input
              class="admin-input admin-quote-task-client-search"
              type="search"
              autocomplete="off"
              placeholder="Имя, телефон, email или адрес"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="admin-quote-task-client-results"
              data-quote-task-client-search="true"
            >
          </div>
          <div class="admin-quote-task-client-results" id="admin-quote-task-client-results" role="listbox" hidden data-quote-task-client-results="true">
            ${taskClientCandidates.map((candidate) => {
              const searchText = [
                candidate.name,
                candidate.phone,
                candidate.phone.replace(/\D+/g, ""),
                candidate.email,
                candidate.address,
              ].filter(Boolean).join(" ");
              const requestSummary = candidate.requestCount > 1
                ? `${candidate.requestCount} заявок · выбрана последняя активная`
                : "Последняя активная заявка";
              return `<button
                class="admin-quote-task-client-result"
                type="button"
                role="option"
                data-quote-task-client-result="true"
                data-entry-id="${escapeHtmlAttribute(candidate.entry.id)}"
                data-client-name="${escapeHtmlAttribute(candidate.name)}"
                data-client-phone="${escapeHtmlAttribute(candidate.phoneLabel)}"
                data-client-email="${escapeHtmlAttribute(candidate.email)}"
                data-client-address="${escapeHtmlAttribute(candidate.address)}"
                data-client-stage="${escapeHtmlAttribute(candidate.leadLabel)}"
                data-client-schedule="${escapeHtmlAttribute(candidate.scheduleLabel)}"
                data-client-request-summary="${escapeHtmlAttribute(requestSummary)}"
                data-manager-id="${escapeHtmlAttribute(candidate.managerId)}"
                data-search="${escapeHtmlAttribute(searchText)}"
              >
                <span class="admin-quote-task-client-result-head">
                  <strong>${escapeHtml(candidate.name)}</strong>
                  <span class="admin-badge admin-badge-outline">${escapeHtml(candidate.leadLabel)}</span>
                </span>
                <span class="admin-quote-task-client-result-meta">
                  ${escapeHtml([candidate.phoneLabel, candidate.email].filter(Boolean).join(" · ") || "Контакты не указаны")}
                </span>
                ${candidate.address ? `<span class="admin-quote-task-client-result-meta">${escapeHtml(candidate.address)}</span>` : ""}
                <span class="admin-quote-task-client-result-foot">
                  <span>${escapeHtml(candidate.scheduleLabel || "Дата уборки не назначена")}</span>
                  <span>${escapeHtml(requestSummary)}</span>
                </span>
              </button>`;
            }).join("")}
            <p class="admin-quote-task-client-empty" hidden data-quote-task-client-empty="true">Клиент не найден. Проверьте имя, телефон, email или адрес.</p>
          </div>
          <article class="admin-quote-task-client-selection" hidden data-quote-task-client-selection="true">
            <div class="admin-quote-task-client-selection-main">
              <div>
                <strong data-quote-task-selected-name="true">Клиент</strong>
                <p data-quote-task-selected-contacts="true"></p>
              </div>
              <button class="admin-button admin-button-secondary admin-quote-task-client-change" type="button" data-quote-task-client-change="true">Изменить</button>
            </div>
            <p data-quote-task-selected-address="true"></p>
            <div class="admin-quote-task-client-selection-foot">
              <span data-quote-task-selected-stage="true"></span>
              <span data-quote-task-selected-schedule="true"></span>
              <span data-quote-task-selected-summary="true"></span>
            </div>
          </article>
          <p class="admin-quote-task-field-error" hidden data-quote-task-client-error="true">Сначала выберите клиента из результатов поиска.</p>
        </div>
        <label class="admin-label admin-quote-task-title-field">
          Что нужно сделать
          <div class="admin-quote-task-preset-row" aria-label="Готовые действия">
            ${[
              "Позвонить клиенту",
              "Уточнить детали уборки",
              "Подтвердить дату",
              "Уточнить адрес",
              "Договориться о следующей уборке",
            ].map((title) => `<button class="admin-quote-task-preset" type="button" data-quote-task-title-preset="${escapeHtmlAttribute(title)}">${escapeHtml(title)}</button>`).join("")}
          </div>
          <input class="admin-input" type="text" name="taskTitle" maxlength="240" placeholder="Или напишите своё действие" required data-quote-task-title-input="true">
        </label>
        <label class="admin-label admin-quote-task-due-field">
          Когда напомнить
          <div class="admin-quote-task-preset-row" aria-label="Быстрый выбор срока">
            <button class="admin-quote-task-preset" type="button" data-quote-task-due-preset="today">Сегодня</button>
            <button class="admin-quote-task-preset" type="button" data-quote-task-due-preset="tomorrow">Завтра</button>
            <button class="admin-quote-task-preset" type="button" data-quote-task-due-preset="three-hours">Через 3 часа</button>
            <button class="admin-quote-task-preset" type="button" data-quote-task-due-preset="week">Через неделю</button>
          </div>
          <input class="admin-input" type="datetime-local" name="taskDueAt" required data-quote-task-due-input="true">
        </label>
        <label class="admin-label">
          Исполнитель
          <select class="admin-input" name="assigneeId" required>
            <option value="">Выберите админа или менеджера</option>
            ${taskAssigneeOptions.map((assignee) => `
              <option value="${escapeHtmlAttribute(assignee.id)}"${assignee.id === defaultTaskAssigneeId ? " selected" : ""}>${escapeHtml(assignee.label || assignee.name)}</option>
            `).join("")}
          </select>
          <span class="admin-field-help">После выбора клиента подставится ответственный менеджер его заявки. При необходимости исполнителя можно изменить.</span>
        </label>
        <div class="admin-inline-actions admin-form-grid-span-2">
          <button class="admin-button" type="submit"${allEntries.length === 0 || taskAssigneeOptions.length === 0 ? " disabled" : ""}>Создать таск</button>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${createTaskDialogId}">Отмена</button>
        </div>
      </form>
      </div>
    </dialog>`;
    const taskListBody = taskRecords.length > 0
      ? `<div class="admin-table-wrap admin-quote-task-table-wrap">
          <table class="admin-table admin-quote-task-table">
            <colgroup>
              <col style="width:30%">
              <col style="width:18%">
              <col style="width:12%">
              <col style="width:18%">
              <col style="width:22%">
            </colgroup>
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
              ${taskRecords.map((taskRecord) => renderQuoteOpsTaskTableRow(taskRecord, currentReturnTo)).join("")}
            </tbody>
          </table>
        </div>
        ${taskRecords.map((taskRecord) => {
          const isSelectedTask = selectedTaskId === taskRecord.id;
          const taskDialogReturnTo = isSelectedTask ? closeTaskHref : currentReturnTo;
          return renderQuoteOpsTaskResultDialog(
            taskRecord,
            taskDialogReturnTo,
            `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`,
            {
              autoOpen: isSelectedTask,
              closeHref: isSelectedTask ? closeTaskHref : "",
            }
          );
        }).join("")}`
      : `<div class="admin-quote-task-empty">Для текущего фильтра открытых тасков нет.</div>`;
    const tasksBody = `${taskListBody}${createTaskDialog}`;
    const sectionNav = activeSection === "tasks"
      ? `<div class="admin-quote-section-nav-row">
          ${renderQuoteOpsSectionNav(activeSection)}
          <button class="admin-button admin-quote-create-task-trigger" type="button" data-admin-dialog-open="${createTaskDialogId}">Создать таск</button>
        </div>`
      : renderQuoteOpsSectionNav(activeSection);

    const workspaceBody =
      activeSection === "funnel"
        ? funnelBody
        : activeSection === "tasks"
          ? tasksBody
          : listBody;

    return renderAdminLayout(
      sectionTitle,
      `<div class="admin-quote-ops-page">
        ${renderQuoteOpsWorkspaceStyle()}
        ${renderQuoteOpsNotice(req)}
        ${activeSection === "list"
          ? renderQuoteOpsOverviewStrip({
              totalEntries,
              successCount,
              attentionCount,
              recentCount,
            })
          : ""}
        ${sectionNav}
        ${filtersPanel}
        ${workspaceBody}
        ${selectedEntryId
          ? allEntries
              .filter((entry) => normalizeString(entry && entry.id, 120) === selectedEntryId)
              .map((entry) =>
                renderQuoteOpsDetailDialog(entry, closeEntryHref, managerOptions, {
                  autoOpen: true,
                  closeHref: closeEntryHref,
                  req,
                  canEdit: accessContext.canEdit,
                  leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                  deferSmsHistory: true,
                })
              )
              .join("")
          : ""}
        <div data-admin-dialog-host="true"></div>
      </div>`,
      {
        kicker: false,
        subtitle: sectionSubtitle,
        sidebar: renderAdminAppSidebar(ADMIN_QUOTE_OPS_PATH, {
          ...accessContext,
          quoteOpsSection: activeSection,
        }),
        bodyScripts: renderQuoteOpsFunnelScript(activeSection),
      }
    );
  }

  async function renderQuoteOpsDialogFragment(req, config, quoteOpsLedger, adminRuntime = {}, staffStore = null) {
    void config;
    const { reqUrl } = getQuoteOpsFilters(req);
    const entryId = normalizeString(reqUrl.searchParams.get("entry"), 120);
    if (!entryId || !quoteOpsLedger || typeof quoteOpsLedger.getEntry !== "function") {
      return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
    }

    const entry = await quoteOpsLedger.getEntry(entryId);
    if (!entry) return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;

    const managerOptions = await collectQuoteOpsManagerOptions(adminRuntime, staffStore);
    const requestedReturnTo = normalizeString(reqUrl.searchParams.get("returnTo"), 1000) || ADMIN_QUOTE_OPS_PATH;
    const returnTo = buildAdminRedirectPath(requestedReturnTo, {
      fragment: "",
      entry: "",
      returnTo: "",
    });
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    return renderQuoteOpsDetailDialog(entry, returnTo, managerOptions, {
      req,
      canEdit: accessContext.canEdit,
      leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
      deferSmsHistory: true,
    });
  }

  renderQuoteOpsPage.renderDialogFragment = renderQuoteOpsDialogFragment;

  return renderQuoteOpsPage;
}

module.exports = {
  createQuoteOpsPageRenderer,
};
