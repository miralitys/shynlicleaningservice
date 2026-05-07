"use strict";

function createClientsPageRenderer(deps = {}) {
  const {
    ADMIN_CLIENTS_PATH,
    CLIENTS_QUOTE_OPS_PAGE_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminClientRecords,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatClientRequestCountLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getAdminClientsFilters,
    getWorkspaceAccessContext,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminClientAddressPreview,
    renderAdminClientDetailDialog,
    renderAdminClientStatusBadge,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderClientsNotice,
    renderStaffAddressAutocompleteScript,
  } = deps;

  async function renderClientsPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    void config;
    const { reqUrl, filters } = getAdminClientsFilters(req);
    const allEntries = quoteOpsLedger
      ? await quoteOpsLedger.listEntries({ limit: CLIENTS_QUOTE_OPS_PAGE_LIMIT })
      : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const clientRecords = collectAdminClientRecords(allEntries);
    const filteredClients = filterAdminClientRecords(clientRecords, filters);
    const clientsWithEmail = clientRecords.filter((client) => Boolean(client.email)).length;
    const repeatClients = clientRecords.filter((client) => client.requestCount > 1).length;
    const permanentClients = clientRecords.filter((client) => client.lifecycleSegment === "permanent").length;
    const oneTimeClients = clientRecords.filter((client) => client.lifecycleSegment === "one-time").length;
    const regularClients = clientRecords.filter((client) => client.serviceSegment === "regular").length;
    const nonRegularClients = clientRecords.filter((client) => client.serviceSegment === "nonregular").length;
    const mixedClients = clientRecords.filter((client) => client.serviceSegment === "mixed").length;
    const lifecycleFilter = ["permanent", "one-time"].includes(filters.lifecycle) ? filters.lifecycle : "all";
    const serviceSegmentFilter = ["regular", "nonregular", "mixed"].includes(filters.serviceSegment)
      ? filters.serviceSegment
      : "all";
    const hasSearchQuery = Boolean(filters.q);
    const hasSegmentFilters = lifecycleFilter !== "all" || serviceSegmentFilter !== "all";
    const hasAdvancedFilters = Boolean(filters.name || filters.email || filters.phone || hasSegmentFilters);
    const hasActiveFilters = hasSearchQuery || hasAdvancedFilters;
    const selectedClient = filters.client ? filteredClients.find((client) => client.key === filters.client) || null : null;
    const selectedClientKey = selectedClient ? selectedClient.key : "";
    const selectedAddressRecord =
      selectedClient && Array.isArray(selectedClient.addresses)
        ? selectedClient.addresses.find((addressRecord) => addressRecord.key === filters.addressKey) || selectedClient.addresses[0] || null
        : null;
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const resetHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
      q: "",
      name: "",
      email: "",
      phone: "",
      lifecycle: "",
      serviceSegment: "",
      client: "",
      addressKey: "",
    });
    const closeDetailHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
      q: filters.q,
      name: filters.name,
      email: filters.email,
      phone: filters.phone,
      lifecycle: lifecycleFilter !== "all" ? lifecycleFilter : "",
      serviceSegment: serviceSegmentFilter !== "all" ? serviceSegmentFilter : "",
      client: "",
      addressKey: "",
    });
    const emptyStateMessage = clientRecords.length === 0
      ? "Пока клиентов нет. Как только появятся новые заявки, этот раздел заполнится автоматически."
      : "По текущим фильтрам клиентов не найдено.";
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const lifecycleFilterLabels = {
      all: "Все клиенты",
      permanent: "Постоянные",
      "one-time": "Одноразовые",
    };
    const serviceSegmentFilterLabels = {
      all: "Все уборки",
      regular: "Регулярные",
      nonregular: "Нерегулярные",
      mixed: "Смешанные",
    };

    function normalizeClientFilterParam(value) {
      return value && value !== "all" ? value : "";
    }

    function buildClientListHref(overrides = {}) {
      const nextLifecycle = Object.prototype.hasOwnProperty.call(overrides, "lifecycle")
        ? overrides.lifecycle
        : lifecycleFilter;
      const nextServiceSegment = Object.prototype.hasOwnProperty.call(overrides, "serviceSegment")
        ? overrides.serviceSegment
        : serviceSegmentFilter;
      return buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
        q: filters.q,
        name: filters.name,
        email: filters.email,
        phone: filters.phone,
        lifecycle: normalizeClientFilterParam(nextLifecycle),
        serviceSegment: normalizeClientFilterParam(nextServiceSegment),
        client: "",
        addressKey: "",
      });
    }

    function renderClientSegmentLink(label, count, overrides = {}, active = false) {
      const className = active ? "admin-button admin-button-secondary" : "admin-link-button admin-button-secondary";
      return `<a class="${className}" href="${escapeHtmlAttribute(buildClientListHref(overrides))}">${escapeHtml(`${label}: ${count}`)}</a>`;
    }

    return renderAdminLayout(
      "Клиенты",
      `${renderClientsNotice(req)}
        <div class="admin-clients-layout">
          ${renderAdminCard(
            false,
            false,
            `<div class="admin-clients-workspace" id="admin-clients-workspace">
              <form
                class="admin-clients-search-form"
                method="get"
                action="${ADMIN_CLIENTS_PATH}"
                data-admin-auto-submit="true"
                data-admin-auto-submit-delay="600"
                data-admin-auto-submit-min-length="2"
                data-admin-auto-submit-restore-focus="true"
                data-admin-auto-submit-scroll-target="#admin-clients-workspace"
                data-admin-auto-submit-scroll-offset="18"
              >
                ${renderAdminHiddenInput("name", filters.name)}
                ${renderAdminHiddenInput("email", filters.email)}
                ${renderAdminHiddenInput("phone", filters.phone)}
                ${renderAdminHiddenInput("lifecycle", lifecycleFilter !== "all" ? lifecycleFilter : "")}
                ${renderAdminHiddenInput("serviceSegment", serviceSegmentFilter !== "all" ? serviceSegmentFilter : "")}
                <label class="admin-clients-search-box">
                  <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
                  <input
                    class="admin-input admin-clients-search-input"
                    type="search"
                    name="q"
                    value="${escapeHtmlText(filters.q)}"
                    placeholder="Поиск по имени, email или телефону"
                  >
                </label>
                <button class="admin-sr-only" type="submit">Обновить поиск</button>
                ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
              </form>
              <div class="admin-clients-segment-strip" aria-label="Разбивка клиентов">
                <div class="admin-clients-segment-group">
                  <span class="admin-action-hint">Клиенты</span>
                  ${renderClientSegmentLink("Все", clientRecords.length, { lifecycle: "all" }, lifecycleFilter === "all")}
                  ${renderClientSegmentLink("Постоянные", permanentClients, { lifecycle: "permanent" }, lifecycleFilter === "permanent")}
                  ${renderClientSegmentLink("Одноразовые", oneTimeClients, { lifecycle: "one-time" }, lifecycleFilter === "one-time")}
                </div>
                <div class="admin-clients-segment-group">
                  <span class="admin-action-hint">Уборки</span>
                  ${renderClientSegmentLink("Все", clientRecords.length, { serviceSegment: "all" }, serviceSegmentFilter === "all")}
                  ${renderClientSegmentLink("Регулярные", regularClients, { serviceSegment: "regular" }, serviceSegmentFilter === "regular")}
                  ${renderClientSegmentLink("Нерегулярные", nonRegularClients, { serviceSegment: "nonregular" }, serviceSegmentFilter === "nonregular")}
                  ${mixedClients ? renderClientSegmentLink("Смешанные", mixedClients, { serviceSegment: "mixed" }, serviceSegmentFilter === "mixed") : ""}
                </div>
              </div>
              <div class="admin-clients-meta-row">
                <div class="admin-clients-meta-main">
                  <p class="admin-clients-summary-copy">
                    Найдено ${escapeHtml(String(filteredClients.length))} из ${escapeHtml(String(clientRecords.length))} клиентов.
                    ${hasActiveFilters ? "С учётом текущего запроса." : "Показан полный список."}
                  </p>
                  <div class="admin-badge-row admin-badge-row-inline admin-clients-active-badges">
                    ${hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : ""}
                    ${filters.name ? renderAdminBadge(`Имя: ${filters.name}`, "outline") : ""}
                    ${filters.email ? renderAdminBadge(`Email: ${filters.email}`, "outline") : ""}
                    ${filters.phone ? renderAdminBadge(`Телефон: ${filters.phone}`, "outline") : ""}
                    ${lifecycleFilter !== "all" ? renderAdminBadge(`Тип клиента: ${lifecycleFilterLabels[lifecycleFilter]}`, "outline") : ""}
                    ${serviceSegmentFilter !== "all" ? renderAdminBadge(`Тип уборок: ${serviceSegmentFilterLabels[serviceSegmentFilter]}`, "outline") : ""}
                    ${renderAdminBadge(`Постоянные: ${permanentClients}`, "outline")}
                    ${renderAdminBadge(`Одноразовые: ${oneTimeClients}`, "outline")}
                    ${renderAdminBadge(`Регулярные: ${regularClients}`, "outline")}
                    ${renderAdminBadge(`Нерегулярные: ${nonRegularClients}`, "outline")}
                    ${repeatClients ? renderAdminBadge(`Повторные: ${repeatClients}`, "outline") : ""}
                    ${clientsWithEmail ? renderAdminBadge(`С email: ${clientsWithEmail}`, "outline") : ""}
                  </div>
                </div>
                <span class="admin-action-hint admin-clients-meta-hint">${selectedClient ? "Профиль открыт в отдельном окне." : "Клик по строке открывает профиль."}</span>
              </div>
            ${filteredClients.length > 0
              ? `<div class="admin-table-wrap admin-clients-table-wrap">
                  <table class="admin-table admin-clients-table">
                    <colgroup>
                      <col style="width:26%">
                      <col style="width:16%">
                      <col style="width:24%">
                      <col style="width:22%">
                      <col style="width:12%">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>Телефон</th>
                        <th>Адрес</th>
                        <th>Последняя заявка</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredClients
                        .map((client) => {
                          const rowPath = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
                            q: filters.q,
                            name: filters.name,
                            email: filters.email,
                            phone: filters.phone,
                            lifecycle: lifecycleFilter !== "all" ? lifecycleFilter : "",
                            serviceSegment: serviceSegmentFilter !== "all" ? serviceSegmentFilter : "",
                            client: client.key,
                          });
                          const rowHref = rowPath;
                          const rowClassName = [
                            "admin-table-row-clickable",
                            client.key === selectedClientKey ? "admin-table-row-active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return `<tr
                            class="${rowClassName}"
                            data-admin-row-href="${escapeHtmlAttribute(rowHref)}"
                            tabindex="0"
                            role="link"
                            aria-label="${escapeHtmlAttribute(`Открыть карточку клиента ${client.name || "Клиент"}`)}"
                          >
                            <td>
                              <div class="admin-client-table-cell">
                                <span class="admin-client-avatar ${getAdminClientAvatarToneClass(client.key)}">${escapeHtml(getAdminClientAvatarInitials(client.name || client.email || client.phone || "Клиент"))}</span>
                                <div class="admin-table-stack">
                                  <a class="admin-table-link" href="${escapeHtmlAttribute(rowHref)}">${escapeHtml(client.name || "Клиент")}</a>
                                  <span class="admin-table-muted">${escapeHtml(formatClientRequestCountLabel(client.requestCount))} • ${escapeHtml(client.lifecycleSegmentLabel)} • ${escapeHtml(client.serviceSegmentLabel)}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              ${client.phone
                                ? `<div class="admin-table-cell-stack">
                                    <span class="admin-table-strong">${escapeHtml(formatAdminPhoneNumber(client.phone) || client.phone)}</span>
                                  </div>`
                                : `<span class="admin-table-muted">Не указан</span>`}
                            </td>
                            <td>
                              ${renderAdminClientAddressPreview(client)}
                            </td>
                            <td>
                              <div class="admin-table-cell-stack">
                                <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(client.latestService))}</span>
                                <span class="admin-table-muted">${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</span>
                                <span class="admin-inline-badge-row">
                                  ${renderAdminClientStatusBadge(client.latestStatus)}
                                  ${renderAdminBadge(client.lifecycleSegmentLabel, client.lifecycleSegmentTone)}
                                  ${renderAdminBadge(client.serviceSegmentLabel, client.serviceSegmentTone)}
                                </span>
                              </div>
                            </td>
                            <td class="admin-table-number">
                              <div class="admin-table-cell-stack">
                                <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(client.totalRevenue))}</span>
                                <span class="admin-table-muted">${escapeHtml(formatClientRequestCountLabel(client.requestCount))}</span>
                              </div>
                            </td>
                          </tr>`;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
            ${selectedClient
              ? renderAdminClientDetailDialog(selectedClient, currentReturnTo, {
                  req,
                  closeHref: closeDetailHref,
                  activeAddressRecord: selectedAddressRecord,
                  planningByEntryId,
                  leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                  canEdit: accessContext.canEdit,
                })
              : ""}
            </div>`,
            { eyebrow: false, className: "admin-clients-card" }
          )}
        </div>`,
      {
        kicker: false,
        subtitle: "CRM-таблица клиентов с быстрым поиском и карточкой по клику на строку.",
        bodyScripts: renderStaffAddressAutocompleteScript(),
        sidebar: renderAdminAppSidebar(ADMIN_CLIENTS_PATH, accessContext),
      }
    );
  }

  return renderClientsPage;
}

module.exports = {
  createClientsPageRenderer,
};
