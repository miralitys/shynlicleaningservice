"use strict";

function createQuoteOpsPageRenderer(deps = {}) {
  const {
    ADMIN_QUOTE_OPS_PATH,
    QUOTE_OPS_PAGE_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildQuoteOpsTaskRecords,
    collectQuoteOpsManagerOptions,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterQuoteOpsEntries,
    getLeadStatus,
    getQuoteOpsFilters,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsDiscussionStageDialog,
    renderQuoteOpsFunnelLane,
    renderQuoteOpsFunnelScript,
    renderQuoteOpsLane,
    renderQuoteOpsNotice,
    renderQuoteOpsOverviewStrip,
    renderQuoteOpsSectionNav,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsTaskTableRow,
    renderQuoteOpsWorkspaceStyle,
  } = deps;

  async function renderQuoteOpsPage(req, config, quoteOpsLedger, adminRuntime = {}, staffStore = null) {
    void config;
    const { reqUrl, filters } = getQuoteOpsFilters(req);
    const allEntriesRaw = quoteOpsLedger
      ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_PAGE_LEDGER_LIMIT })
      : [];
    const allEntries = filterQuoteOpsEntries(allEntriesRaw, {
      status: "all",
      serviceType: "all",
      leadStatus: "all",
      managerId: "",
      q: "",
      limit: QUOTE_OPS_PAGE_LEDGER_LIMIT,
    });
    const entries = filterQuoteOpsEntries(allEntries, filters);
    const managerOptions = await collectQuoteOpsManagerOptions(adminRuntime, staffStore);
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
      declined: "Отказ",
    };
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
    const groupedEntries = ["error", "warning", "success"]
      .map((status) => ({
        status,
        entries: entries.filter((entry) => entry.status === status),
      }))
      .filter((group) => group.entries.length > 0);
    const funnelStatuses = ["new", "no-response", "discussion", "confirmed", "declined"];
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
    const selectedEntryId = normalizeString(reqUrl.searchParams.get("entry"), 120);
    const closeEntryHref = buildAdminRedirectPath(currentReturnTo, {
      entry: "",
    });
    const sectionTitle =
      activeSection === "funnel"
        ? "Воронка заявок"
        : activeSection === "tasks"
          ? "Таски по заявкам"
          : "Лента заявок";
    const sectionSubtitle =
      activeSection === "funnel"
        ? "Перетаскивайте заявки между этапами, назначайте менеджеров и держите всю воронку перед глазами."
        : activeSection === "tasks"
          ? "Здесь собраны все открытые действия по заявкам с дедлайнами и быстрыми результатами звонка."
          : "Рабочая лента входящих заявок с быстрым поиском и полным просмотром каждой формы.";
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

    const listBody = groupedEntries.length > 0
      ? `<div class="admin-quote-lanes">
          ${groupedEntries.map((group) => renderQuoteOpsLane(group.status, group.entries, currentReturnTo)).join("")}
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
    const tasksBody = taskRecords.length > 0
      ? `<div class="admin-table-wrap admin-quote-task-table-wrap">
          <table class="admin-table admin-quote-task-table">
            <colgroup>
              <col style="width:38%">
              <col style="width:18%">
              <col style="width:14%">
              <col style="width:14%">
              <col style="width:16%">
            </colgroup>
            <thead>
              <tr>
                <th>Таск</th>
                <th>Дедлайн</th>
                <th>Этап</th>
                <th>Менеджер</th>
                <th>Заявка</th>
              </tr>
            </thead>
            <tbody>
              ${taskRecords.map((taskRecord) => renderQuoteOpsTaskTableRow(taskRecord, currentReturnTo)).join("")}
            </tbody>
          </table>
        </div>
        ${taskRecords.map((taskRecord) => renderQuoteOpsTaskResultDialog(taskRecord, currentReturnTo, `admin-quote-task-result-dialog-${normalizeString(taskRecord.id, 120)}`)).join("")}`
      : `<div class="admin-quote-task-empty">Для текущего фильтра открытых тасков нет.</div>`;

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
        ${renderQuoteOpsSectionNav(activeSection)}
        ${filtersPanel}
        ${workspaceBody}
        ${entries.map((entry) =>
          renderQuoteOpsDetailDialog(entry, currentReturnTo, managerOptions, {
            autoOpen: selectedEntryId === entry.id,
            closeHref: selectedEntryId === entry.id ? closeEntryHref : "",
            req,
            canEdit: accessContext.canEdit,
            leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
          })
        ).join("")}
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

  return renderQuoteOpsPage;
}

module.exports = {
  createQuoteOpsPageRenderer,
};
