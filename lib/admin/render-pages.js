"use strict";

function createAdminPageRenderers(deps = {}) {
  const {
    ADMIN_CLIENTS_PATH,
    ADMIN_INTEGRATIONS_PATH,
    ADMIN_ORDERS_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_RUNTIME_PATH,
    ADMIN_SETTINGS_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_QUOTE_OPS_EXPORT_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ASSIGNMENT_STATUS_VALUES,
    QUOTE_OPS_LEDGER_LIMIT,
    QUOTE_PUBLIC_PATH,
    STAFF_STATUS_VALUES,
    buildAdminRedirectPath,
    buildOrdersReturnPath,
    buildQuoteOpsReturnPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectAdminOrderRecords,
    countOrdersByStatus,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminClientRecords,
    filterAdminOrderRecords,
    filterQuoteOpsEntries,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatCurrencyAmount,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    getAdminClientsFilters,
    getOrdersFilters,
    getQuoteOpsFilters,
    getRequestUrl,
    normalizeOrderStatus,
    normalizeString,
    renderAssignmentStatusBadge,
    renderStaffStatusBadge,
    shared,
  } = deps;
  const {
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
  } = shared;

  function renderAdminClientStatusBadge(status) {
    const normalized = normalizeString(status, 32).toLowerCase();
    if (!normalized) return renderAdminBadge("Без статуса", "muted");
    return renderQuoteOpsStatusBadge(normalized);
  }

  function formatClientRequestCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} заявка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} заявки`;
    return `${normalized} заявок`;
  }

  function renderAdminClientHistoryItem(entry) {
    const scheduledLabel = [entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Дата не указана";
    return `<article class="admin-history-item admin-client-history-item">
      <div class="admin-client-history-header">
        <div>
          <h3 class="admin-history-title">${escapeHtml(formatAdminServiceLabel(entry.serviceName))}</h3>
          <p class="admin-history-copy">${escapeHtml(formatAdminDateTime(entry.createdAt))} • ${escapeHtml(entry.requestId || "Номер не указан")}</p>
        </div>
        <div class="admin-client-history-side">
          <span class="admin-client-history-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
          ${renderAdminClientStatusBadge(entry.status)}
        </div>
      </div>
      <div class="admin-history-meta">
        <span>${escapeHtml(`Дата уборки: ${scheduledLabel}`)}</span>
        <span>${escapeHtml(`Адрес: ${entry.fullAddress || "не указан"}`)}</span>
      </div>
    </article>`;
  }

  function renderClientsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "client-deleted") {
      return `<div class="admin-alert admin-alert-info">Клиент и его заявки удалены.</div>`;
    }
    if (notice === "client-missing") {
      return `<div class="admin-alert admin-alert-error">Клиент не найден.</div>`;
    }
    if (notice === "client-delete-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось удалить клиента. Попробуйте ещё раз.</div>`;
    }
    return "";
  }

  function renderAdminClientDetailCard(client, returnTo = ADMIN_CLIENTS_PATH) {
    if (!client) {
      return renderAdminCard(
        "Карточка клиента",
        "Выберите клиента в таблице слева, чтобы открыть быстрый обзор и историю заявок.",
        `<div class="admin-empty-state">Когда вы выберете клиента, здесь появятся контакты, сумма заказов, последний статус и вся история обращений.</div>`,
        { eyebrow: "Клиент", muted: true }
      );
    }

    const quoteOpsHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
      q: client.email || client.phone || client.name,
    });
    const successfulEntries = client.entries.filter((entry) => normalizeString(entry.status, 32).toLowerCase() === "success").length;
    const issueCount = Math.max(0, client.entries.length - successfulEntries);
    const latestEntry = client.entries[0] || null;
    const lastScheduledLabel = latestEntry
      ? [latestEntry.selectedDate, latestEntry.selectedTime].filter(Boolean).join(" в ") || "Не указана"
      : "Не указана";
    const statusBadges = [
      renderAdminClientStatusBadge(client.latestStatus),
      renderAdminBadge(client.requestCount > 1 ? "Повторный клиент" : "Новая заявка", client.requestCount > 1 ? "outline" : "muted"),
      issueCount > 0 ? renderAdminBadge(`${issueCount} требуют внимания`, "danger") : renderAdminBadge("Без ошибок", "success"),
    ].join("");

    return renderAdminCard(
      "Карточка клиента",
      "Быстрый обзор клиента, контактов и истории обращений.",
      `<div class="admin-client-panel-head">
        <div class="admin-client-title-block">
          <h3 class="admin-client-title">${escapeHtml(client.name || "Клиент")}</h3>
          <p class="admin-card-copy">Последняя заявка: ${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</p>
        </div>
        <div class="admin-badge-row">
          ${statusBadges}
        </div>
      </div>
      <div class="admin-client-metric-grid">
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Последний статус</span>
          <div class="admin-client-metric-value">${renderAdminClientStatusBadge(client.latestStatus)}</div>
        </article>
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Всего заявок</span>
          <p class="admin-client-metric-value">${escapeHtml(String(client.requestCount))}</p>
        </article>
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Сумма заказов</span>
          <p class="admin-client-metric-value">${escapeHtml(formatCurrencyAmount(client.totalRevenue))}</p>
        </article>
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Успешно / с ошибкой</span>
          <p class="admin-client-metric-value">${escapeHtml(`${successfulEntries} / ${issueCount}`)}</p>
        </article>
      </div>
      <div class="admin-client-contact-grid">
        <article class="admin-client-contact-card">
          <span class="admin-client-contact-label">Email</span>
          <p class="admin-client-contact-value">${escapeHtml(client.email || "Не указан")}</p>
        </article>
        <article class="admin-client-contact-card">
          <span class="admin-client-contact-label">Телефон</span>
          <p class="admin-client-contact-value">${escapeHtml(client.phone || "Не указан")}</p>
        </article>
        <article class="admin-client-contact-card">
          <span class="admin-client-contact-label">Последняя услуга</span>
          <p class="admin-client-contact-value">${escapeHtml(formatAdminServiceLabel(client.latestService))}</p>
        </article>
        <article class="admin-client-contact-card">
          <span class="admin-client-contact-label">Запланировано</span>
          <p class="admin-client-contact-value">${escapeHtml(lastScheduledLabel)}</p>
        </article>
        <article class="admin-client-contact-card admin-client-contact-card-wide">
          <span class="admin-client-contact-label">Адрес</span>
          <p class="admin-client-contact-value">${escapeHtml(client.address || "Не указан")}</p>
        </article>
      </div>
      <div class="admin-client-action-stack">
        <div class="admin-client-action-row">
          <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(quoteOpsHref)}">Открыть заявки клиента</a>
          <form class="admin-client-delete-form" method="post" action="${ADMIN_CLIENTS_PATH}">
          <input type="hidden" name="action" value="delete-client">
          <input type="hidden" name="clientKey" value="${escapeHtmlAttribute(client.key)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <button
            class="admin-button admin-button-danger"
            type="submit"
            onclick="return confirm('Удалить клиента и все связанные заявки? Это действие очистит его заказы и записи в заявках.');"
          >Удалить клиента</button>
        </form>
        </div>
        <span class="admin-action-hint">Удаление убирает клиента из клиентов, заказов и заявок.</span>
      </div>
      <div class="admin-divider"></div>
      <div class="admin-subsection-head">
        <h3 class="admin-subsection-title">История заявок</h3>
        <span class="admin-action-hint">${escapeHtml(formatClientRequestCountLabel(client.requestCount))}</span>
      </div>
      <div class="admin-history-list admin-client-history-list">
        ${client.entries.map((entry) => renderAdminClientHistoryItem(entry)).join("")}
      </div>`,
      { eyebrow: "Клиент", muted: true }
    );
  }

  async function renderDashboardPage(req, config, quoteOpsLedger) {
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const clientRecords = collectAdminClientRecords(allEntries);
    const scheduledCount = allEntries.filter((entry) => Boolean(entry.selectedDate || entry.selectedTime)).length;
    const attentionCount = allEntries.filter((entry) => entry.status !== "success").length;

    return renderAdminLayout(
      "Обзор",
      `<div class="admin-stats-grid">
          ${renderAdminCard(
            "Клиенты",
            "Все клиенты из текущих заявок.",
            `<p class="admin-metric-value">${escapeHtml(String(clientRecords.length))}</p>`,
            { eyebrow: "Обзор" }
          )}
          ${renderAdminCard(
            "Заказы",
            "Все заявки и заказы в работе.",
            `<p class="admin-metric-value">${escapeHtml(String(allEntries.length))}</p>`,
            { eyebrow: "Обзор", muted: true }
          )}
          ${renderAdminCard(
            "Назначена дата",
            "Заявки, где уже выбраны день или время.",
            `<p class="admin-metric-value">${escapeHtml(String(scheduledCount))}</p>`,
            { eyebrow: "Обзор", muted: true }
          )}
          ${renderAdminCard(
            "Нужно проверить",
            "Заявки, которым требуется внимание.",
            `<p class="admin-metric-value">${escapeHtml(String(attentionCount))}</p>`,
            { eyebrow: "Обзор", muted: true }
          )}
        </div>`,
      {
        kicker: "SHYNLI",
        subtitle: "Рабочая панель для клиентов, заказов, сотрудников и заявок.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH),
      }
    );
  }

  async function renderClientsPage(req, config, quoteOpsLedger) {
    const { reqUrl, filters } = getAdminClientsFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const clientRecords = collectAdminClientRecords(allEntries);
    const filteredClients = filterAdminClientRecords(clientRecords, filters);
    const clientsWithEmail = clientRecords.filter((client) => Boolean(client.email)).length;
    const repeatClients = clientRecords.filter((client) => client.requestCount > 1).length;
    const selectedClient = filteredClients.find((client) => client.key === filters.client) || filteredClients[0] || null;
    const selectedClientKey = selectedClient ? selectedClient.key : "";
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const hasActiveFilters = Boolean(filters.name || filters.email || filters.phone);
    const resetHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, selectedClientKey ? { client: selectedClientKey } : {});
    const emptyStateMessage = clientRecords.length === 0
      ? "Пока клиентов нет. Как только появятся новые заявки, этот раздел заполнится автоматически."
      : "По текущим фильтрам клиентов не найдено.";

    return renderAdminLayout(
      "Клиенты",
      `${renderClientsNotice(req)}
        <div class="admin-clients-layout">
          ${renderAdminCard(
            "База клиентов",
            "Полный список клиентов с поиском по имени, email и телефону.",
            `<div class="admin-overview-strip">
              <article class="admin-overview-tile">
                <span class="admin-overview-label">Всего клиентов</span>
                <p class="admin-overview-value">${escapeHtml(String(clientRecords.length))}</p>
                <p class="admin-overview-copy">Все уникальные клиенты по текущим заявкам.</p>
              </article>
              <article class="admin-overview-tile">
                <span class="admin-overview-label">Найдено сейчас</span>
                <p class="admin-overview-value">${escapeHtml(String(filteredClients.length))}</p>
                <p class="admin-overview-copy">${hasActiveFilters ? "С учётом активных фильтров." : "Без ограничений по поиску."}</p>
              </article>
              <article class="admin-overview-tile">
                <span class="admin-overview-label">Повторные</span>
                <p class="admin-overview-value">${escapeHtml(String(repeatClients))}</p>
                <p class="admin-overview-copy">Клиенты с двумя и более обращениями.</p>
              </article>
              <article class="admin-overview-tile">
                <span class="admin-overview-label">С email</span>
                <p class="admin-overview-value">${escapeHtml(String(clientsWithEmail))}</p>
                <p class="admin-overview-copy">Контакты, которым можно написать.</p>
              </article>
            </div>
            <form class="admin-clients-filter-bar" method="get" action="${ADMIN_CLIENTS_PATH}">
              <label class="admin-label">
                Имя
                <input class="admin-input" type="search" name="name" value="${escapeHtmlText(filters.name)}" placeholder="Например, Jane">
              </label>
              <label class="admin-label">
                Email
                <input class="admin-input" type="search" name="email" value="${escapeHtmlText(filters.email)}" placeholder="name@example.com">
              </label>
              <label class="admin-label">
                Телефон
                <input class="admin-input" type="search" name="phone" value="${escapeHtmlText(filters.phone)}" placeholder="3125550100">
              </label>
              <div class="admin-clients-filter-actions">
                <button class="admin-button" type="submit">Применить</button>
                <a class="admin-link-button admin-button-secondary" href="${resetHref}">Сбросить</a>
              </div>
            </form>
            <div class="admin-toolbar admin-toolbar-soft">
              <span class="admin-action-hint">Найдено ${escapeHtml(String(filteredClients.length))} из ${escapeHtml(String(clientRecords.length))} клиентов.</span>
              <span class="admin-action-hint">${selectedClient ? `Открыта карточка: ${escapeHtml(selectedClient.name || "Клиент")}` : "Выберите клиента из списка, чтобы посмотреть историю."}</span>
            </div>
            ${filteredClients.length > 0
              ? `<div class="admin-table-wrap">
                  <table class="admin-table">
                    <colgroup>
                      <col style="width:28%">
                      <col style="width:24%">
                      <col style="width:30%">
                      <col style="width:9%">
                      <col style="width:9%">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>Контакты</th>
                        <th>Последняя заявка</th>
                        <th>Заявок</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredClients
                        .map((client) => {
                          const rowHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
                            name: filters.name,
                            email: filters.email,
                            phone: filters.phone,
                            client: client.key,
                          });
                          return `<tr class="${client.key === selectedClientKey ? "admin-table-row-active" : ""}">
                            <td>
                              <div class="admin-table-stack">
                                <a class="admin-table-link" href="${escapeHtmlAttribute(rowHref)}">${escapeHtml(client.name || "Клиент")}</a>
                                <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(client.address || "Адрес не указан")}</span>
                              </div>
                            </td>
                            <td>
                              ${client.email || client.phone
                                ? `<div class="admin-table-stack">
                                    ${client.email ? `<span>${escapeHtml(client.email)}</span>` : ""}
                                    ${client.phone ? `<span>${escapeHtml(client.phone)}</span>` : ""}
                                  </div>`
                                : `<span class="admin-table-muted">Контакты не указаны</span>`}
                            </td>
                            <td>
                              <div class="admin-table-stack">
                                <span>${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</span>
                                <span class="admin-table-muted">${escapeHtml(formatAdminServiceLabel(client.latestService))}</span>
                                <span>${renderAdminClientStatusBadge(client.latestStatus)}</span>
                                <span class="admin-table-muted">${escapeHtml(client.latestRequestId || "Номер не указан")}</span>
                              </div>
                            </td>
                            <td class="admin-table-number">${escapeHtml(String(client.requestCount))}</td>
                            <td class="admin-table-number">${escapeHtml(formatCurrencyAmount(client.totalRevenue))}</td>
                          </tr>`;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}`,
            { eyebrow: "Клиенты" }
          )}
          <div class="admin-sticky-card">
            ${renderAdminClientDetailCard(selectedClient, currentReturnTo)}
          </div>
        </div>`,
      {
        kicker: "Клиенты",
        subtitle: "Поиск по клиентам, быстрый список и детальная карточка справа.",
        sidebar: renderAdminAppSidebar(ADMIN_CLIENTS_PATH),
      }
    );
  }

  function renderOrderStatusBadge(status) {
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "completed") return renderAdminBadge("Completed", "success");
    if (normalized === "canceled") return renderAdminBadge("Canceled", "danger");
    if (normalized === "rescheduled") return renderAdminBadge("Rescheduled", "outline");
    if (normalized === "in-progress") return renderAdminBadge("In progress", "default");
    if (normalized === "scheduled") return renderAdminBadge("Scheduled", "outline");
    return renderAdminBadge("New", "muted");
  }

  function getOrderLaneMeta(status) {
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "scheduled") {
      return {
        kicker: "Ближайшие выезды",
        title: "Scheduled",
        description: "Подтверждённые заказы с назначенным окном визита.",
      };
    }
    if (normalized === "in-progress") {
      return {
        kicker: "Активно сейчас",
        title: "In progress",
        description: "Заказы, которые уже выполняются и требуют оперативного контроля.",
      };
    }
    if (normalized === "completed") {
      return {
        kicker: "Закрыто",
        title: "Completed",
        description: "Выполненные заказы, которые уже можно не держать в фокусе.",
      };
    }
    if (normalized === "canceled") {
      return {
        kicker: "Снято с графика",
        title: "Canceled",
        description: "Отменённые заказы, оставленные для истории.",
      };
    }
    if (normalized === "rescheduled") {
      return {
        kicker: "Нужно переподтвердить",
        title: "Rescheduled",
        description: "Заказы, где дата или время уже менялись и нужен повторный контроль.",
      };
    }
    return {
      kicker: "Новый поток",
      title: "New",
      description: "Новые обращения, которые нужно быстро разобрать и назначить.",
    };
  }

  function renderOrdersMetric(label, value, copy, options = {}) {
    const className = options.emphasis
      ? "admin-orders-metric admin-orders-metric-emphasis"
      : "admin-orders-metric";

    return `<article class="${className}">
      <span class="admin-orders-metric-label">${escapeHtml(label)}</span>
      <strong class="admin-orders-metric-value">${escapeHtml(String(value))}</strong>
      <p class="admin-orders-metric-copy">${escapeHtml(copy)}</p>
    </article>`;
  }

  function renderOrderSnapshot(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-snapshot admin-order-snapshot-wide"
      : "admin-order-snapshot";

    return `<div class="${className}">
      <span class="admin-order-snapshot-label">${escapeHtml(label)}</span>
      <p class="admin-order-snapshot-value">${escapeHtml(value)}</p>
    </div>`;
  }

  function renderOrdersNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "order-saved") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён.</div>`;
    }
    if (notice === "order-deleted") {
      return `<div class="admin-alert admin-alert-info">Заказ удалён.</div>`;
    }
    if (notice === "order-missing") {
      return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;
    }
    if (notice === "order-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить заказ. Попробуйте ещё раз.</div>`;
    }
    if (notice === "order-delete-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось удалить заказ. Попробуйте ещё раз.</div>`;
    }
    return "";
  }

  function renderOrderEntryCard(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffPageHref = options.staffPageHref || ADMIN_STAFF_PATH;
    const planningTeamLabel =
      planningItem && planningItem.assignedStaff.length > 0
        ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
        : "";
    const assignedLabel = planningTeamLabel || order.assignedStaff || "Не назначен";
    const createdLabel = formatAdminDateTime(order.createdAt);
    const focusBadges = [];
    if (!order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled") {
      focusBadges.push(renderAdminBadge("Нужно назначить дату", "outline"));
    }
    if (!order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled") {
      focusBadges.push(renderAdminBadge("Нет команды", "outline"));
    }
    if (order.needsAttention) {
      focusBadges.push(renderAdminBadge("CRM требует внимания", "danger"));
    }

    return `<article class="admin-order-card admin-order-card-${escapeHtmlAttribute(order.orderStatus)}${order.needsAttention ? " admin-order-card-attention" : ""}">
      <div class="admin-order-card-head">
        <div class="admin-order-title-block">
          <p class="admin-order-request">Request ${escapeHtml(order.requestId || "не указан")}</p>
          <h3 class="admin-order-title">${escapeHtml(order.customerName || "Клиент")}</h3>
          <p class="admin-order-caption">${escapeHtml(order.serviceLabel)} • ${escapeHtml(formatCurrencyAmount(order.totalPrice))} • создан ${escapeHtml(createdLabel)}</p>
        </div>
        <div class="admin-entry-meta">
          ${planningItem ? renderAssignmentStatusBadge(planningItem.assignmentStatus) : ""}
          ${renderOrderStatusBadge(order.orderStatus)}
          ${renderAdminBadge(order.serviceLabel, "outline")}
          ${order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : ""}
          ${renderQuoteOpsStatusBadge(order.crmStatus)}
        </div>
      </div>
      <div class="admin-order-focus">
        ${focusBadges.length > 0
          ? focusBadges.join("")
          : `<span class="admin-order-focus-copy">Заказ читается как готовый к работе: дата, команда и CRM-статус уже на месте.</span>`}
      </div>
      <div class="admin-order-snapshot-grid">
        ${renderOrderSnapshot("Дата и время", order.scheduleLabel)}
        ${renderOrderSnapshot("Команда", assignedLabel)}
        ${renderOrderSnapshot("Повторяемость", order.frequencyLabel)}
        ${renderOrderSnapshot("Контакты", [order.customerPhone || "Телефон не указан", order.customerEmail || ""].filter(Boolean).join(" • "))}
        ${renderOrderSnapshot("Адрес", order.fullAddress || "Не указан", { wide: true })}
      </div>
      <details class="admin-details admin-order-editor">
        <summary>Изменить заказ</summary>
        <div class="admin-order-editor-body">
          <form class="admin-form-grid admin-form-grid-two admin-order-form" method="post" action="${ADMIN_ORDERS_PATH}">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
            <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
            <label class="admin-label">
              Статус заказа
              <select class="admin-input" name="orderStatus">
                <option value="new"${order.orderStatus === "new" ? " selected" : ""}>New</option>
                <option value="scheduled"${order.orderStatus === "scheduled" ? " selected" : ""}>Scheduled</option>
                <option value="in-progress"${order.orderStatus === "in-progress" ? " selected" : ""}>In progress</option>
                <option value="completed"${order.orderStatus === "completed" ? " selected" : ""}>Completed</option>
                <option value="canceled"${order.orderStatus === "canceled" ? " selected" : ""}>Canceled</option>
                <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Rescheduled</option>
              </select>
            </label>
            <label class="admin-label">
              Дата уборки
              <input class="admin-input" type="date" name="selectedDate" value="${escapeHtmlAttribute(order.selectedDate)}">
            </label>
            <label class="admin-label">
              Время уборки
              <input class="admin-input" type="time" name="selectedTime" value="${escapeHtmlAttribute(order.selectedTime)}">
            </label>
            <label class="admin-label">
              Повторяемость
              <select class="admin-input" name="frequency">
                <option value=""${!order.frequency ? " selected" : ""}>Not set</option>
                <option value="weekly"${order.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                <option value="biweekly"${order.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                <option value="monthly"${order.frequency === "monthly" ? " selected" : ""}>Monthly</option>
              </select>
            </label>
            <label class="admin-label">
              Ответственный / заметка
              <input class="admin-input" type="text" name="assignedStaff" value="${escapeHtmlText(order.assignedStaff)}" placeholder="Текстовая пометка, если нужна">
            </label>
            <div class="admin-inline-actions admin-form-actions">
              <button class="admin-button" type="submit">Сохранить заказ</button>
              <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(staffPageHref)}">Сотрудники и график</a>
              <span class="admin-action-hint">Точную команду и статусы смен удобнее вести в разделе «Сотрудники».</span>
            </div>
          </form>
          <form class="admin-inline-actions admin-order-delete-form" method="post" action="${ADMIN_ORDERS_PATH}">
            <input type="hidden" name="action" value="delete-order">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
            <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
            <button
              class="admin-button admin-button-secondary"
              type="submit"
              onclick="return confirm('Удалить этот тестовый заказ? Запись исчезнет из заказов, клиентов и заявок.');"
            >Удалить заказ</button>
            <span class="admin-action-hint">Удаление убирает запись из рабочих разделов админки.</span>
          </form>
        </div>
      </details>
    </article>`;
  }

  function renderOrdersLane(status, laneOrders, returnTo, planningByEntryId, staffPageHref) {
    const meta = getOrderLaneMeta(status);
    return `<section class="admin-orders-lane admin-orders-lane-${escapeHtmlAttribute(status)}">
      <div class="admin-orders-lane-head">
        <div>
          <p class="admin-orders-lane-kicker">${escapeHtml(meta.kicker)}</p>
          <h2 class="admin-orders-lane-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-orders-lane-copy">${escapeHtml(meta.description)}</p>
        </div>
        <div class="admin-orders-lane-meta">
          <span class="admin-orders-lane-count">${escapeHtml(String(laneOrders.length))}</span>
          <span class="admin-action-hint">${escapeHtml(formatOrderCountLabel(laneOrders.length))}</span>
        </div>
      </div>
      <div class="admin-order-stack">
        ${laneOrders
          .map((order) =>
            renderOrderEntryCard(order, returnTo, {
              planningItem: planningByEntryId.get(order.id) || null,
              staffPageHref,
            })
          )
          .join("")}
      </div>
    </section>`;
  }

  async function renderOrdersPage(req, config, quoteOpsLedger, staffStore) {
    const { reqUrl, filters } = getOrdersFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const allOrders = collectAdminOrderRecords(allEntries).map((order) => {
      const planningItem = planningByEntryId.get(order.id) || null;
      if (!planningItem) return order;

      const assignedTeamLabel =
        planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
          : "";

      return {
        ...order,
        assignedStaff: assignedTeamLabel || order.assignedStaff,
        isAssigned: Boolean(assignedTeamLabel || order.assignedStaff),
        scheduleLabel: planningItem.scheduleLabel || order.scheduleLabel,
        hasSchedule: planningItem.hasSchedule || order.hasSchedule,
        planningItem,
      };
    });
    const orders = filterAdminOrderRecords(allOrders, filters);
    const totalOrders = allOrders.length;
    const scheduledCount = allOrders.filter((order) => order.hasSchedule).length;
    const recurringCount = allOrders.filter((order) => order.isRecurring).length;
    const assignedCount = allOrders.filter((order) => order.isAssigned).length;
    const attentionCount = allOrders.filter((order) => order.needsAttention).length;
    const unassignedOpenCount = allOrders.filter(
      (order) => !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const unscheduledCount = allOrders.filter(
      (order) => !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const revenuePipeline = allOrders.reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
    const statusCounts = countOrdersByStatus(allOrders);
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const filteredCount = orders.length;
    const hasActiveFilters = Boolean(
      filters.q ||
      filters.status !== "all" ||
      filters.serviceType !== "all" ||
      filters.frequency !== "all" ||
      filters.assignment !== "all"
    );
    const laneOrder = ["new", "scheduled", "in-progress", "rescheduled", "completed", "canceled"];
    const visibleLaneStatuses = laneOrder.filter((status) => orders.some((order) => order.orderStatus === status));

    return renderAdminLayout(
      "Заказы",
      `<div class="admin-orders-page">
        ${renderOrdersNotice(req)}
        <section class="admin-orders-hero">
          <div class="admin-orders-hero-main">
            <p class="admin-orders-kicker">Операционный обзор</p>
            <h2 class="admin-orders-total">${escapeHtml(String(totalOrders))} заказов в работе</h2>
            <p class="admin-orders-copy">Экран теперь построен как рабочая доска: сначала видны дата, команда и ближайшее действие, а редактирование скрыто внутри карточки.</p>
          </div>
          <div class="admin-orders-metrics">
            ${renderOrdersMetric("В графике", scheduledCount, "Есть дата или время визита.", { emphasis: true })}
            ${renderOrdersMetric("Без даты", unscheduledCount, "Нужно назначить окно уборки.")}
            ${renderOrdersMetric("Без команды", unassignedOpenCount, "Требуется назначение сотрудников.")}
            ${renderOrdersMetric("CRM внимание", attentionCount, "Есть ошибки или warning-статусы.")}
            ${renderOrdersMetric("Recurring", recurringCount, "Weekly, bi-weekly и monthly заказы.")}
            ${renderOrdersMetric("Pipeline", formatCurrencyAmount(revenuePipeline), "Сумма всех заказов в ленте.")}
          </div>
        </section>
        <div class="admin-orders-layout">
          <section class="admin-orders-filters-panel">
            <div class="admin-orders-panel-head">
              <div>
                <p class="admin-orders-panel-kicker">Навигация</p>
                <h2 class="admin-orders-panel-title">Быстро найти нужный заказ</h2>
                <p class="admin-orders-panel-copy">Фильтры сверху оставляют экран коротким, а карточки внутри статусных секций легче сканировать.</p>
              </div>
              <span class="admin-action-hint">Показано ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalOrders))} заказов.</span>
            </div>
            <form class="admin-form-grid admin-form-grid-three admin-orders-filter-form" method="get" action="${ADMIN_ORDERS_PATH}">
              <label class="admin-label">
                Поиск
                <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Клиент, телефон, адрес, сотрудник, номер">
              </label>
              <label class="admin-label">
                Статус
                <select class="admin-input" name="status">
                  <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                  <option value="new"${filters.status === "new" ? " selected" : ""}>New</option>
                  <option value="scheduled"${filters.status === "scheduled" ? " selected" : ""}>Scheduled</option>
                  <option value="in-progress"${filters.status === "in-progress" ? " selected" : ""}>In progress</option>
                  <option value="completed"${filters.status === "completed" ? " selected" : ""}>Completed</option>
                  <option value="canceled"${filters.status === "canceled" ? " selected" : ""}>Canceled</option>
                  <option value="rescheduled"${filters.status === "rescheduled" ? " selected" : ""}>Rescheduled</option>
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
              <div class="admin-inline-actions admin-form-actions">
                <button class="admin-button" type="submit">Применить</button>
                <a class="admin-link-button admin-button-secondary" href="${ADMIN_ORDERS_PATH}">Сбросить</a>
                <span class="admin-action-hint">${hasActiveFilters ? "Активные фильтры помогают сузить список до рабочей выборки." : "Сейчас открыт общий поток всех заказов."}</span>
              </div>
            </form>
          </section>
          <aside class="admin-orders-side-panel">
            <div class="admin-orders-side-block">
              <p class="admin-orders-panel-kicker">Очередь</p>
              <h2 class="admin-orders-panel-title">Сводка по статусам</h2>
              ${renderAdminPropertyList([
                { label: "New", value: String(statusCounts.new) },
                { label: "Scheduled", value: String(statusCounts.scheduled) },
                { label: "In progress", value: String(statusCounts["in-progress"]) },
                { label: "Completed", value: String(statusCounts.completed) },
                { label: "Canceled", value: String(statusCounts.canceled) },
                { label: "Rescheduled", value: String(statusCounts.rescheduled) },
                { label: "Есть команда", value: String(assignedCount) },
                { label: "Recurring", value: String(recurringCount) },
              ])}
            </div>
          </aside>
        </div>
        ${orders.length > 0
          ? `<div class="admin-orders-lanes">
              ${visibleLaneStatuses
                .map((status) =>
                  renderOrdersLane(
                    status,
                    orders.filter((order) => order.orderStatus === status),
                    currentReturnTo,
                    planningByEntryId,
                    ADMIN_STAFF_PATH
                  )
                )
                .join("")}
            </div>`
          : `<div class="admin-empty-state">По текущему фильтру заказов нет. Попробуйте сбросить фильтры или изменить поиск.</div>`}
      </div>`,
      {
        kicker: "Заказы",
        subtitle: "Рабочая доска заказов: сначала обзор и статус, затем компактные карточки с деталями и редактированием по требованию.",
        sidebar: renderAdminAppSidebar(ADMIN_ORDERS_PATH),
      }
    );
  }

  function renderStaffNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "staff-created") {
      return `<div class="admin-alert admin-alert-info">Сотрудник добавлен в команду.</div>`;
    }
    if (notice === "staff-updated") {
      return `<div class="admin-alert admin-alert-info">Карточка сотрудника обновлена.</div>`;
    }
    if (notice === "staff-deleted") {
      return `<div class="admin-alert admin-alert-info">Сотрудник удалён, его назначения очищены.</div>`;
    }
    if (notice === "assignment-saved") {
      return `<div class="admin-alert admin-alert-info">Назначение и график сохранены.</div>`;
    }
    if (notice === "assignment-cleared") {
      return `<div class="admin-alert admin-alert-info">Назначение очищено.</div>`;
    }
    if (notice === "staff-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Проверьте форму и попробуйте снова.</div>`;
    }
    return "";
  }

  function renderStaffMemberCard(staffSummary) {
    const contactLabel = [staffSummary.phone, staffSummary.email].filter(Boolean).join(" • ") || "Контакты не указаны";
    const nextShiftLabel = staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены";
    const workloadLabel = staffSummary.scheduledCount > 0
      ? `${formatOrderCountLabel(staffSummary.scheduledCount)} в графике`
      : "Пока без заказов";

    return `<article class="admin-entry-card">
      <div class="admin-entry-head">
        <div>
          <h3 class="admin-entry-title">${escapeHtml(staffSummary.name)}</h3>
          <p class="admin-entry-copy">${escapeHtml(staffSummary.role || "Роль не указана")}</p>
        </div>
        <div class="admin-entry-meta">
          ${renderStaffStatusBadge(staffSummary.status)}
        </div>
      </div>
      <div class="admin-entry-grid">
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Контакты</span>
          <p class="admin-mini-value">${escapeHtml(contactLabel)}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Нагрузка</span>
          <p class="admin-mini-value">${escapeHtml(workloadLabel)}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">На 7 дней</span>
          <p class="admin-mini-value">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Следующая смена</span>
          <p class="admin-mini-value">${escapeHtml(nextShiftLabel)}</p>
        </div>
      </div>
      ${staffSummary.notes ? `<p class="admin-card-copy">${escapeHtml(staffSummary.notes)}</p>` : ""}
      <details class="admin-details">
        <summary>Изменить карточку</summary>
        <form class="admin-form-grid" method="post" action="${ADMIN_STAFF_PATH}" style="margin-top:14px;">
          <input type="hidden" name="action" value="update-staff">
          <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
          <div class="admin-form-grid admin-form-grid-two">
            <label class="admin-label">
              Имя
              <input class="admin-input" type="text" name="name" value="${escapeHtmlText(staffSummary.name)}" required>
            </label>
            <label class="admin-label">
              Роль
              <input class="admin-input" type="text" name="role" value="${escapeHtmlText(staffSummary.role)}" placeholder="Cleaner, Team Lead, Driver">
            </label>
            <label class="admin-label">
              Телефон
              <input class="admin-input" type="tel" name="phone" value="${escapeHtmlText(staffSummary.phone)}" placeholder="+1 (630) ...">
            </label>
            <label class="admin-label">
              Email
              <input class="admin-input" type="email" name="email" value="${escapeHtmlText(staffSummary.email)}" placeholder="team@shynli.com">
            </label>
            <label class="admin-label">
              Статус
              <select class="admin-input" name="status">
                ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${staffSummary.status === status ? " selected" : ""}>${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="admin-label">
            Заметки
            <textarea class="admin-input" name="notes" placeholder="Районы, предпочтительные смены, ключи, транспорт">${escapeHtml(staffSummary.notes)}</textarea>
          </label>
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit">Сохранить карточку</button>
          </div>
        </form>
        <form class="admin-inline-actions" method="post" action="${ADMIN_STAFF_PATH}" style="margin-top:12px;">
          <input type="hidden" name="action" value="delete-staff">
          <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
          <button class="admin-button admin-button-secondary" type="submit">Удалить сотрудника</button>
          <span class="admin-action-hint">Удаление очистит его назначения в графике.</span>
        </form>
      </details>
    </article>`;
  }

  function renderStaffAssignmentCard(orderItem, staffRecords) {
    const selectableStaff = staffRecords.filter((record) => record.status === "active" || orderItem.assignedStaff.some((item) => item.id === record.id));
    const assignedIds = orderItem.assignment ? orderItem.assignment.staffIds : [];
    const currentTeamMarkup =
      orderItem.assignedStaff.length > 0
        ? orderItem.assignedStaff.map((record) => renderAdminBadge(record.name, "outline")).join("")
        : renderAdminBadge("Команда не назначена", "muted");
    const assignmentNotes = orderItem.assignment && orderItem.assignment.notes
      ? `<p class="admin-card-copy">${escapeHtml(orderItem.assignment.notes)}</p>`
      : "";
    const missingStaffBlock = orderItem.missingStaffIds.length > 0
      ? `<div class="admin-alert admin-alert-error">В назначении есть сотрудник, которого уже нет в команде. Сохраните карточку заказа заново.</div>`
      : "";

    return `<article class="admin-entry-card">
      <div class="admin-entry-head">
        <div>
          <h3 class="admin-entry-title">${escapeHtml(orderItem.entry.customerName || "Клиент")}</h3>
          <p class="admin-entry-copy">${escapeHtml(formatAdminServiceLabel(orderItem.entry.serviceName || orderItem.entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(orderItem.entry.totalPrice))}</p>
        </div>
        <div class="admin-entry-meta">
          ${renderAssignmentStatusBadge(orderItem.assignmentStatus)}
          ${renderQuoteOpsStatusBadge(orderItem.entry.status)}
        </div>
      </div>
      <div class="admin-badge-row">
        ${currentTeamMarkup}
      </div>
      <div class="admin-entry-grid">
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Дата и время</span>
          <p class="admin-mini-value">${escapeHtml(orderItem.scheduleLabel)}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Адрес</span>
          <p class="admin-mini-value">${escapeHtml(orderItem.entry.fullAddress || "Адрес не указан")}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Контакты</span>
          <p class="admin-mini-value">${escapeHtml(orderItem.entry.customerPhone || orderItem.entry.customerEmail || "Контакты не указаны")}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Заявка</span>
          <p class="admin-mini-value">${escapeHtml(orderItem.entry.requestId || orderItem.entry.id)}</p>
        </div>
      </div>
      ${missingStaffBlock}
      ${assignmentNotes}
      <details class="admin-details">
        <summary>Назначить команду и смену</summary>
        <form class="admin-form-grid" method="post" action="${ADMIN_STAFF_PATH}" style="margin-top:14px;">
          <input type="hidden" name="action" value="save-assignment">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(orderItem.entry.id)}">
          <div>
            <p class="admin-field-note" style="margin-bottom:10px;">Оставьте дату и время пустыми, если нужно использовать график из самого заказа.</p>
            ${selectableStaff.length > 0
              ? `<div class="admin-checkbox-grid">
                  ${selectableStaff
                    .map(
                      (record) => `<label class="admin-checkbox">
                        <input type="checkbox" name="staffIds" value="${escapeHtmlAttribute(record.id)}"${assignedIds.includes(record.id) ? " checked" : ""}>
                        <span>
                          <strong>${escapeHtml(record.name)}</strong>
                          <small>${escapeHtml([record.role, formatStaffStatusLabel(record.status)].filter(Boolean).join(" • "))}</small>
                        </span>
                      </label>`
                    )
                    .join("")}
                </div>`
              : `<div class="admin-empty-state">Сначала добавьте хотя бы одного сотрудника в команду.</div>`}
          </div>
          <div class="admin-form-grid admin-form-grid-two">
            <label class="admin-label">
              Дата смены
              <input class="admin-input" type="date" name="scheduleDate" value="${escapeHtmlAttribute(orderItem.assignment ? orderItem.assignment.scheduleDate : "")}">
            </label>
            <label class="admin-label">
              Время смены
              <input class="admin-input" type="time" name="scheduleTime" value="${escapeHtmlAttribute(orderItem.assignment ? orderItem.assignment.scheduleTime : "")}">
            </label>
            <label class="admin-label">
              Статус
              <select class="admin-input" name="status">
                ${ASSIGNMENT_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${orderItem.assignmentStatus === status ? " selected" : ""}>${escapeHtml(formatAssignmentStatusLabel(status))}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="admin-label">
            Комментарий
            <textarea class="admin-input" name="notes" placeholder="Ключи, инструкции по доступу, комментарий для команды">${escapeHtml(orderItem.assignment ? orderItem.assignment.notes : "")}</textarea>
          </label>
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit">Сохранить назначение</button>
          </div>
        </form>
        ${orderItem.assignment
          ? `<form class="admin-inline-actions" method="post" action="${ADMIN_STAFF_PATH}" style="margin-top:12px;">
              <input type="hidden" name="action" value="clear-assignment">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(orderItem.entry.id)}">
              <button class="admin-button admin-button-secondary" type="submit">Очистить назначение</button>
              <span class="admin-action-hint">Уберёт команду, статус и комментарий по этой смене.</span>
            </form>`
          : ""}
      </details>
    </article>`;
  }

  async function renderStaffPage(req, config, quoteOpsLedger, staffStore) {
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const upcomingOrders = planning.orderItems.slice(0, 12);
    const shiftsPreview = planning.scheduledOrders.slice(0, 6);

    return renderAdminLayout(
      "Сотрудники",
      `${renderStaffNotice(req)}
        <div class="admin-stats-grid">
          ${renderAdminCard(
            "Сотрудники",
            "Все сотрудники, которые есть в команде.",
            `<p class="admin-metric-value">${escapeHtml(String(planning.staff.length))}</p>`,
            { eyebrow: "Команда" }
          )}
          ${renderAdminCard(
            "Активны",
            "Сотрудники, которых можно ставить в график.",
            `<p class="admin-metric-value">${escapeHtml(String(planning.activeStaffCount))}</p>`,
            { eyebrow: "Статус", muted: true }
          )}
          ${renderAdminCard(
            "Назначены",
            "Заказы, где уже есть команда.",
            `<p class="admin-metric-value">${escapeHtml(String(planning.assignedScheduledCount))}</p>`,
            { eyebrow: "График", muted: true }
          )}
          ${renderAdminCard(
            "Без команды",
            "Запланированные заказы, которые ещё ждут назначения.",
            `<p class="admin-metric-value">${escapeHtml(String(planning.unassignedScheduledCount))}</p>`,
            { eyebrow: "Пробелы", muted: true }
          )}
        </div>
        <div class="admin-section-grid">
          ${renderAdminCard(
            "Добавить сотрудника",
            "Создайте карточку сотрудника, чтобы он появился в графике и назначениях.",
            `<form class="admin-form-grid" method="post" action="${ADMIN_STAFF_PATH}">
              <input type="hidden" name="action" value="create-staff">
              <div class="admin-form-grid admin-form-grid-two">
                <label class="admin-label">
                  Имя
                  <input class="admin-input" type="text" name="name" placeholder="Anna Petrova" required>
                </label>
                <label class="admin-label">
                  Роль
                  <input class="admin-input" type="text" name="role" placeholder="Cleaner, Team Lead">
                </label>
                <label class="admin-label">
                  Телефон
                  <input class="admin-input" type="tel" name="phone" placeholder="+1 (630) ...">
                </label>
                <label class="admin-label">
                  Email
                  <input class="admin-input" type="email" name="email" placeholder="team@shynli.com">
                </label>
                <label class="admin-label">
                  Статус
                  <select class="admin-input" name="status">
                    ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
                  </select>
                </label>
              </div>
              <label class="admin-label">
                Заметки
                <textarea class="admin-input" name="notes" placeholder="Районы, доступность, предпочтительные смены, ключи"></textarea>
              </label>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Добавить сотрудника</button>
              </div>
            </form>`,
            { eyebrow: "Команда" }
          )}
          ${renderAdminCard(
            "Команда",
            "Карточки сотрудников, контакты и текущая нагрузка.",
            planning.staffSummaries.length > 0
              ? `<div class="admin-entry-list">
                  ${planning.staffSummaries.map((record) => renderStaffMemberCard(record)).join("")}
                </div>`
              : `<div class="admin-empty-state">Пока сотрудников нет. Добавьте первую карточку, и сможете сразу назначать команду на заказы.</div>`,
            { eyebrow: "Список", muted: true }
          )}
        </div>
        <div class="admin-section-grid">
          ${renderAdminCard(
            "Назначения и график",
            "Свяжите сотрудников с заказами и зафиксируйте смены.",
            upcomingOrders.length > 0
              ? `<div class="admin-entry-list">
                  ${upcomingOrders.map((item) => renderStaffAssignmentCard(item, planning.staff)).join("")}
                </div>`
              : `<div class="admin-empty-state">Пока заказов нет. Как только появятся заявки, здесь можно будет назначать команду и вести график.</div>`,
            { eyebrow: "График" }
          )}
          ${renderAdminCard(
            "Ближайшая загрузка",
            "Короткая сводка по сменам и состоянию команды.",
            `${renderAdminPropertyList([
              { label: "Всего сотрудников", value: formatStaffCountLabel(planning.staff.length) },
              { label: "Активны", value: formatStaffCountLabel(planning.activeStaffCount) },
              { label: "Заказы в графике", value: formatOrderCountLabel(planning.scheduledOrders.length) },
              { label: "Без команды", value: formatOrderCountLabel(planning.unassignedScheduledCount) },
            ])}
            ${shiftsPreview.length > 0
              ? `<div class="admin-link-grid">
                  ${shiftsPreview
                    .map(
                      (item) => `<div class="admin-link-tile">
                        <strong>${escapeHtml(item.entry.customerName || "Клиент")}</strong>
                        <span>${escapeHtml(item.scheduleLabel)}</span>
                        <span>${escapeHtml(item.assignedStaff.length > 0 ? item.assignedStaff.map((record) => record.name).join(", ") : "Команда не назначена")}</span>
                      </div>`
                    )
                    .join("")}
                </div>`
              : `<div class="admin-empty-state">Пока нет смен с датой и временем. Они подтянутся из заказов автоматически.</div>`}
            <ul class="admin-feature-list">
              <li>Назначения привязаны к конкретным заказам, а не к отдельным заметкам.</li>
              <li>Если дату и время не указывать вручную, раздел использует график из заказа.</li>
              <li>Статус смены помогает видеть, что подтверждено, завершено или требует внимания.</li>
            </ul>`,
            { eyebrow: "Сводка", muted: true }
          )}
        </div>`,
      {
        kicker: "Сотрудники",
        subtitle: "Рабочий инструмент для команды: карточки сотрудников, привязка к заказам и график смен.",
        sidebar: renderAdminAppSidebar(ADMIN_STAFF_PATH),
      }
    );
  }

  function renderSettingsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "saved") {
      return `<div class="admin-alert admin-alert-info">Отметки чек-листа сохранены.</div>`;
    }
    if (notice === "added") {
      return `<div class="admin-alert admin-alert-info">Новый пункт добавлен в шаблон.</div>`;
    }
    if (notice === "reset") {
      return `<div class="admin-alert admin-alert-info">Все отметки по этому шаблону сброшены.</div>`;
    }
    if (notice === "error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Попробуйте ещё раз.</div>`;
    }
    return "";
  }

  function buildSettingsRedirectPath(serviceType, notice = "") {
    const normalizedServiceType = normalizeString(serviceType, 32).toLowerCase();
    const pathWithQuery = buildAdminRedirectPath(ADMIN_SETTINGS_PATH, {
      notice,
      serviceType: normalizedServiceType,
    });
    return normalizedServiceType ? `${pathWithQuery}#settings-${normalizedServiceType}` : pathWithQuery;
  }

  function renderSettingsTemplateCard(template) {
    const completedCount = template.items.filter((item) => item.completed).length;

    return renderAdminCard(
      template.title,
      template.description,
      `<div id="settings-${escapeHtmlAttribute(template.serviceType)}"></div>
      <p class="admin-checklist-summary">Выполнено ${escapeHtml(String(completedCount))} из ${escapeHtml(String(template.items.length))}</p>
      <form class="admin-form" method="post" action="${ADMIN_SETTINGS_PATH}">
        <input type="hidden" name="action" value="save_checklist_state">
        <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
        <div class="admin-checklist-list">
          ${template.items.length > 0
            ? template.items
                .map(
                  (item) => `<label class="admin-checklist-row">
                    <input type="checkbox" name="completedItemIds" value="${escapeHtmlAttribute(item.id)}"${item.completed ? " checked" : ""}>
                    <span class="admin-checklist-copy">
                      <strong>${escapeHtml(item.label)}</strong>
                      <span>${item.completed ? "Отмечено как выполненное" : "Пока не отмечено"}</span>
                    </span>
                  </label>`
                )
                .join("")
            : `<div class="admin-empty-state">В этом шаблоне пока нет пунктов.</div>`}
        </div>
        <div class="admin-inline-actions" style="margin-top:14px;">
          <button class="admin-button" type="submit">Сохранить отметки</button>
        </div>
      </form>
      <div class="admin-divider"></div>
      <form class="admin-form-grid admin-form-grid-two" method="post" action="${ADMIN_SETTINGS_PATH}">
        <input type="hidden" name="action" value="add_checklist_item">
        <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
        <label class="admin-label">
          Новый пункт
          <input class="admin-input" type="text" name="itemLabel" maxlength="240" placeholder="Например: проверить зеркала" required>
        </label>
        <div class="admin-inline-actions" style="align-self:end;">
          <button class="admin-button admin-button-secondary" type="submit">Добавить пункт</button>
        </div>
      </form>
      <div class="admin-inline-actions" style="margin-top:12px;">
        <form method="post" action="${ADMIN_SETTINGS_PATH}">
          <input type="hidden" name="action" value="reset_checklist_state">
          <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
          <button class="admin-button admin-button-secondary" type="submit">Сбросить отметки</button>
        </form>
      </div>`,
      {
        eyebrow: "Чек-лист",
        muted: true,
      }
    );
  }

  async function renderSettingsPage(req, config, settingsStore) {
    const snapshot = settingsStore ? await settingsStore.getSnapshot() : { templates: [] };
    const templates = Array.isArray(snapshot.templates) ? snapshot.templates : [];
    const totalItems = templates.reduce((sum, template) => sum + template.items.length, 0);
    const completedItems = templates.reduce(
      (sum, template) => sum + template.items.filter((item) => item.completed).length,
      0
    );

    return renderAdminLayout(
      "Settings",
      `${renderSettingsNotice(req)}
        <div class="admin-stats-grid">
          ${renderAdminCard(
            "Шаблоны",
            "Все типы уборки в одном месте.",
            `<p class="admin-metric-value">${escapeHtml(String(templates.length))}</p>`,
            { eyebrow: "Settings" }
          )}
          ${renderAdminCard(
            "Пункты",
            "Общее количество задач в шаблонах.",
            `<p class="admin-metric-value">${escapeHtml(String(totalItems))}</p>`,
            { eyebrow: "Settings", muted: true }
          )}
          ${renderAdminCard(
            "Отмечено",
            "Уже выполненные пункты.",
            `<p class="admin-metric-value">${escapeHtml(String(completedItems))}</p>`,
            { eyebrow: "Settings", muted: true }
          )}
        </div>
        <div class="admin-section-grid">
          ${renderAdminCard(
            "Шаблоны чек-листов",
            "Отмечайте выполненное и дополняйте шаблоны новыми пунктами.",
            templates.length > 0
              ? templates.map((template) => renderSettingsTemplateCard(template)).join("")
              : `<div class="admin-empty-state">Шаблоны пока не подготовлены.</div>`,
            { eyebrow: "Settings" }
          )}
          ${renderAdminCard(
            "Для чего этот раздел",
            "Здесь можно хранить рабочие шаблоны и небольшие внутренние базы.",
            `<ul class="admin-feature-list">
              <li>Шаблоны под каждый тип уборки.</li>
              <li>Отметки выполненных пунктов.</li>
              <li>Новые небольшие внутренние списки можно добавлять сюда позже.</li>
            </ul>`,
            { eyebrow: "Settings", muted: true }
          )}
        </div>`,
      {
        kicker: "Settings",
        subtitle: "Шаблоны чек-листов и внутренние рабочие списки.",
        sidebar: renderAdminAppSidebar(ADMIN_SETTINGS_PATH),
      }
    );
  }

  function renderQuoteOpsStatusBadge(status) {
    if (status === "success") return renderAdminBadge("Успешно", "success");
    if (status === "warning") return renderAdminBadge("Проверить", "default");
    return renderAdminBadge("Ошибка", "danger");
  }

  function renderQuoteOpsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "retry-success") {
      return `<div class="admin-alert admin-alert-info">Повторная отправка выполнена.</div>`;
    }
    if (notice === "retry-failed") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не удалась. Проверьте заявку ниже.</div>`;
    }
    if (notice === "retry-missing") {
      return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
    }
    return "";
  }

  function renderQuoteOpsEntryCard(entry, returnTo) {
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-alert admin-alert-info">Нужно проверить: ${escapeHtml(entry.warnings.join(", "))}</div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(entry.errorMessage)}</div>`
      : "";

    return `<article class="admin-entry-card">
      <div class="admin-entry-head">
        <div>
          <h3 class="admin-entry-title">${escapeHtml(entry.customerName || "Клиент")}</h3>
          <p class="admin-entry-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))} • ${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</p>
        </div>
        <div class="admin-entry-meta">
          ${renderQuoteOpsStatusBadge(entry.status)}
          ${entry.retryCount > 0 ? renderAdminBadge(`Повтор ${entry.retryCount}`, "outline") : ""}
        </div>
      </div>
      <div class="admin-entry-grid">
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Дата</span>
          <p class="admin-mini-value">${escapeHtml(new Date(entry.createdAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }))}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Номер</span>
          <p class="admin-mini-value">${escapeHtml(entry.requestId || "Не указан")}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Услуга</span>
          <p class="admin-mini-value">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Дата уборки</span>
          <p class="admin-mini-value">${escapeHtml([entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Не указана")}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Контакты</span>
          <p class="admin-mini-value">${escapeHtml(entry.customerPhone || "Телефон не указан")}${entry.customerEmail ? `<br>${escapeHtml(entry.customerEmail)}` : ""}</p>
        </div>
        <div class="admin-mini-stat">
          <span class="admin-mini-label">Адрес</span>
          <p class="admin-mini-value">${escapeHtml(entry.fullAddress || "Не указан")}</p>
        </div>
      </div>
      ${warningBlock}
      ${errorBlock}
      <div class="admin-inline-actions">
        <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <button class="admin-button" type="submit">Повторить отправку</button>
        </form>
        <span class="admin-action-hint">Если нужно, отправьте заявку повторно.</span>
      </div>
    </article>`;
  }

  async function renderQuoteOpsPage(req, config, quoteOpsLedger) {
    const { reqUrl, filters } = getQuoteOpsFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const entries = filterQuoteOpsEntries(allEntries, filters);
    const totalEntries = allEntries.length;
    const successCount = allEntries.filter((entry) => entry.status === "success").length;
    const warningCount = allEntries.filter((entry) => entry.status === "warning").length;
    const errorCount = allEntries.filter((entry) => entry.status === "error").length;
    const exportHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_EXPORT_PATH, {
      status: filters.status !== "all" ? filters.status : "",
      serviceType: filters.serviceType !== "all" ? filters.serviceType : "",
      q: filters.q,
    });
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;

    return renderAdminLayout(
      "Заявки",
      `${renderQuoteOpsNotice(req)}
        <div class="admin-stats-grid">
          ${renderAdminCard(
            "Всего заявок",
            "Все заявки с сайта.",
            `<p class="admin-metric-value">${escapeHtml(String(totalEntries))}</p>`,
            { eyebrow: "Заявки" }
          )}
          ${renderAdminCard(
            "Успешно",
            "Заявки без ошибок.",
            `<p class="admin-metric-value">${escapeHtml(String(successCount))}</p>`,
            { eyebrow: "Статус", muted: true }
          )}
          ${renderAdminCard(
            "Проверить",
            "Заявки, которые нужно перепроверить.",
            `<p class="admin-metric-value">${escapeHtml(String(warningCount))}</p>`,
            { eyebrow: "Статус", muted: true }
          )}
          ${renderAdminCard(
            "Ошибки",
            "Заявки, которые не дошли с первого раза.",
            `<p class="admin-metric-value">${escapeHtml(String(errorCount))}</p>`,
            { eyebrow: "Статус", muted: true }
          )}
        </div>
        <div class="admin-section-grid">
          ${renderAdminCard(
            "Список заявок",
            "Поиск, фильтр и повторная отправка.",
            `<form class="admin-form-grid admin-form-grid-two" method="get" action="${ADMIN_QUOTE_OPS_PATH}">
              <label class="admin-label">
                Поиск
                <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Имя, телефон, email, номер">
              </label>
              <label class="admin-label">
                Статус
                <select class="admin-input" name="status">
                  <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                  <option value="success"${filters.status === "success" ? " selected" : ""}>Успешно</option>
                  <option value="warning"${filters.status === "warning" ? " selected" : ""}>Проверить</option>
                  <option value="error"${filters.status === "error" ? " selected" : ""}>Ошибка</option>
                </select>
              </label>
              <label class="admin-label">
                Услуга
                <select class="admin-input" name="serviceType">
                  <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                  <option value="regular"${filters.serviceType === "regular" ? " selected" : ""}>Регулярная</option>
                  <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Генеральная</option>
                  <option value="moving"${filters.serviceType === "moving" ? " selected" : ""}>Перед переездом</option>
                </select>
              </label>
              <div class="admin-inline-actions" style="align-self:end;">
                <button class="admin-button" type="submit">Применить</button>
                <a class="admin-link-button admin-button-secondary" href="${ADMIN_QUOTE_OPS_PATH}">Сбросить</a>
                <a class="admin-link-button admin-button-secondary" href="${exportHref}">Скачать CSV</a>
              </div>
            </form>
            <div class="admin-divider"></div>
            <div class="admin-entry-list">
              ${entries.length > 0
                ? entries.map((entry) => renderQuoteOpsEntryCard(entry, currentReturnTo)).join("")
                : `<div class="admin-empty-state">По текущему фильтру заявок нет.</div>`}
            </div>`,
            { eyebrow: "Заявки" }
          )}
          ${renderAdminCard(
            "Что можно сделать",
            "Основные действия в этом разделе.",
            `<ul class="admin-feature-list">
              <li>Найти нужную заявку по имени, телефону или email.</li>
              <li>Скачать список заявок в CSV.</li>
              <li>Повторить отправку, если заявка требует проверки.</li>
            </ul>`,
            { eyebrow: "Действия", muted: true }
          )}
        </div>`,
      {
        kicker: "Заявки",
        subtitle: "Все заявки с сайта в одном месте.",
        sidebar: renderAdminAppSidebar(ADMIN_QUOTE_OPS_PATH),
      }
    );
  }

  function renderIntegrationsPage(req, config) {
    return renderAdminLayout(
      "Раздел скрыт",
      `${renderAdminCard(
          "Раздел скрыт",
          "Этот технический раздел скрыт из интерфейса.",
          `<div class="admin-alert admin-alert-info">Вернитесь в основные рабочие разделы админки.</div>`,
          { eyebrow: "Инфо", muted: true }
        )}`,
      {
        kicker: "SHYNLI",
        subtitle: "Технические разделы скрыты.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH),
      }
    );
  }

  function renderRuntimePage(req, config, adminRuntime = {}) {
    return renderIntegrationsPage(req, config, adminRuntime);
  }

  async function renderAdminAppPage(route, req, config, adminRuntime = {}, quoteOpsLedger = null, staffStore = null) {
    if (route === ADMIN_ROOT_PATH) return renderDashboardPage(req, config, quoteOpsLedger);
    if (route === ADMIN_CLIENTS_PATH) return renderClientsPage(req, config, quoteOpsLedger);
    if (route === ADMIN_ORDERS_PATH) return renderOrdersPage(req, config, quoteOpsLedger, staffStore);
    if (route === ADMIN_STAFF_PATH) return renderStaffPage(req, config, quoteOpsLedger, staffStore);
    if (route === ADMIN_SETTINGS_PATH) return renderSettingsPage(req, config, adminRuntime.settingsStore);
    if (route === ADMIN_QUOTE_OPS_PATH) return renderQuoteOpsPage(req, config, quoteOpsLedger);
    if (route === ADMIN_INTEGRATIONS_PATH) return renderDashboardPage(req, config, quoteOpsLedger);
    if (route === ADMIN_RUNTIME_PATH) return renderDashboardPage(req, config, quoteOpsLedger);
    return renderDashboardPage(req, config, quoteOpsLedger);
  }

  return {
    buildSettingsRedirectPath,
    renderAdminAppPage,
    renderDashboardPage,
    renderIntegrationsPage,
    renderLoginPage: shared.renderLoginPage,
    renderOrdersPage,
    renderQuoteOpsPage,
    renderRuntimePage,
    renderSettingsPage,
    renderStaffPage,
    renderTwoFactorPage: shared.renderTwoFactorPage,
    renderAdminLayout,
    renderAdminUnavailablePage: shared.renderAdminUnavailablePage,
  };
}

module.exports = {
  createAdminPageRenderers,
};
