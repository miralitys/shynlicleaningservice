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
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ASSIGNMENT_STATUS_VALUES,
    GOOGLE_PLACES_API_KEY,
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
  const ORDER_QUOTE_SERVICE_LABELS = Object.freeze({
    ovenCleaning: "Oven Cleaning",
    refrigeratorCleaning: "Inside Refrigerator Cleaning",
    baseboardCleaning: "Baseboard Cleaning (whole house)",
    doorsCleaning: "Doors Cleaning",
    insideCabinets: "Inside Cabinets Cleaning",
    rangeHood: "Range hood",
    furniturePolishing: "Wood Furniture Polishing",
  });
  const ORDER_QUOTE_SERVICE_ALIASES = Object.freeze({
    ovencleaning: "ovenCleaning",
    insideoven: "ovenCleaning",
    insideovencleaning: "ovenCleaning",
    refrigeratorcleaning: "refrigeratorCleaning",
    insidefridge: "refrigeratorCleaning",
    insidefridgecleaning: "refrigeratorCleaning",
    fridge: "refrigeratorCleaning",
    fridgecleaning: "refrigeratorCleaning",
    baseboardcleaning: "baseboardCleaning",
    baseboards: "baseboardCleaning",
    doorscleaning: "doorsCleaning",
    doors: "doorsCleaning",
    insidecabinets: "insideCabinets",
    cabinets: "insideCabinets",
    rangehood: "rangeHood",
    furniturepolishing: "furniturePolishing",
    woodfurniturepolishing: "furniturePolishing",
  });
  const ORDER_QUOTE_QUANTITY_LABELS = Object.freeze({
    interiorWindowsCleaning: "Interior Windows Cleaning",
    blindsCleaning: "Blinds Cleaning",
    bedLinenChange: "Bed Linen / Sofa Cover Change",
  });
  const ORDER_QUOTE_SQUARE_FOOTAGE_LABELS = Object.freeze({
    0: "700 - 1,200 sq ft",
    1: "1,201 - 2,000 sq ft",
    2: "2,001 - 2,500 sq ft",
    3: "2,501 - 3,000 sq ft",
    4: "3,001 - 3,500 sq ft",
    5: "3,501 - 4,000 sq ft",
    6: "4,001 - 5,000 sq ft",
    7: "5,001+ sq ft",
    950: "700 - 1,200 sq ft",
    1600: "1,201 - 2,000 sq ft",
    2250: "2,001 - 2,500 sq ft",
    2750: "2,501 - 3,000 sq ft",
    3250: "3,001 - 3,500 sq ft",
    3750: "3,501 - 4,000 sq ft",
    4500: "4,001 - 5,000 sq ft",
    5500: "5,001+ sq ft",
    6500: "5,001+ sq ft",
  });

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

  function formatAdminPhoneNumber(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";

    const digits = raw.replace(/\D+/g, "");
    const normalizedDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

    if (normalizedDigits.length === 10) {
      return `+1(${normalizedDigits.slice(0, 3)})${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
    }

    return raw;
  }

  function renderAdminHiddenInput(name, value) {
    const normalized = normalizeString(value, 250);
    if (!normalized) return "";
    return `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(normalized)}">`;
  }

  function renderAdminDeleteIconButton(label, confirmMessage) {
    const normalizedLabel = normalizeString(label, 120) || "Удалить";
    const normalizedConfirm = normalizeString(confirmMessage, 400);
    const confirmAttrs = ` data-admin-confirm="true" data-admin-confirm-title="Точно удалить?"${normalizedConfirm ? ` data-admin-confirm-message="${escapeHtmlAttribute(normalizedConfirm)}"` : ""}`;

    return `<button
      class="admin-icon-button admin-delete-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"${confirmAttrs}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function getAdminClientAvatarInitials(value) {
    const normalized = normalizeString(value, 120);
    if (!normalized) return "?";
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }

  function getAdminClientAvatarToneClass(value) {
    const normalized = normalizeString(value, 250);
    let hash = 0;
    for (const character of normalized) {
      hash = (hash + character.charCodeAt(0)) % 5;
    }
    return `admin-client-avatar-tone-${hash + 1}`;
  }

  function renderAdminClientInfoGrid(items = [], options = {}) {
    const className = options.compact
      ? "admin-client-info-grid admin-client-info-grid-compact"
      : "admin-client-info-grid";
    return `<div class="${className}">
      ${items
        .map((item) => {
          const itemClassName = item.wide
            ? "admin-client-info-card admin-client-info-card-wide"
            : "admin-client-info-card";
          const valueMarkup = item.raw ? item.value : escapeHtml(item.value);
          return `<article class="${itemClassName}">
            <span class="admin-client-info-label">${escapeHtml(item.label)}</span>
            <p class="admin-client-info-value">${valueMarkup}</p>
            ${item.hint ? `<p class="admin-client-info-hint">${item.raw ? item.hint : escapeHtml(item.hint)}</p>` : ""}
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function getAdminClientHistoryTeamLabel(entry, planningItem = null) {
    if (planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0) {
      return planningItem.assignedStaff
        .map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
        .filter(Boolean)
        .join(", ");
    }

    const payload = entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
      ? entry.payloadForRetry
      : null;
    const adminOrder = payload && payload.adminOrder && typeof payload.adminOrder === "object"
      ? payload.adminOrder
      : null;
    const assignedFallback = normalizeString(
      adminOrder && (adminOrder.assignedStaff || adminOrder.assignee),
      160
    );

    if (assignedFallback) return assignedFallback;
    if (planningItem && planningItem.assignment && Array.isArray(planningItem.missingStaffIds) && planningItem.missingStaffIds.length > 0) {
      return "Команда назначена";
    }
    return "Команда не назначена";
  }

  function renderAdminClientHistoryItem(entry, planningItem = null) {
    const scheduledLabel = [entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Дата не указана";
    const teamLabel = getAdminClientHistoryTeamLabel(entry, planningItem);
    return `<article class="admin-history-item admin-client-history-item">
      <div class="admin-client-history-header">
        <div class="admin-client-history-copy-block">
          <h3 class="admin-history-title">${escapeHtml(formatAdminServiceLabel(entry.serviceName))}</h3>
          <p class="admin-history-copy">${escapeHtml(formatAdminDateTime(entry.createdAt))}</p>
        </div>
        <div class="admin-client-history-side">
          <span class="admin-client-history-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
          ${renderAdminClientStatusBadge(entry.status)}
        </div>
      </div>
      <div class="admin-client-history-meta-row">
        <span class="admin-history-meta-chip">${escapeHtml(entry.requestId || "Номер не указан")}</span>
        <span class="admin-history-meta-chip">${escapeHtml(`Уборка: ${scheduledLabel}`)}</span>
        <span class="admin-history-meta-chip">${escapeHtml(`Команда: ${teamLabel}`)}</span>
      </div>
      <p class="admin-client-history-address">${escapeHtml(entry.fullAddress || "Адрес не указан")}</p>
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

  function renderQuoteOpsDiagnostics(quoteOpsLedger) {
    const diagnostics =
      quoteOpsLedger && typeof quoteOpsLedger.getDiagnostics === "function"
        ? quoteOpsLedger.getDiagnostics()
        : null;
    if (!diagnostics) return "";

    const modeLabel = diagnostics.mode === "supabase" ? "Supabase" : "Память процесса";
    const remoteStatusLabel =
      diagnostics.mode !== "supabase"
        ? "Только память"
        : diagnostics.remoteStatus === "healthy"
          ? "Persistent storage active"
          : diagnostics.remoteStatus === "fallback"
            ? "Есть fallback"
            : "Ожидаем первую синхронизацию";
    const readSourceLabel =
      diagnostics.lastReadSource === "supabase"
        ? "Чтение: Supabase"
        : diagnostics.lastReadSource === "memory-fallback"
          ? "Чтение: fallback в память"
          : diagnostics.lastReadSource === "memory"
            ? "Чтение: память"
            : "Чтение ещё не выполнялось";
    const statusBadge =
      diagnostics.lastReadError
        ? renderAdminBadge("Есть ошибка чтения", "danger")
        : diagnostics.mode === "supabase"
          ? renderAdminBadge("Подключено к Supabase", "success")
          : renderAdminBadge("Временное хранилище", "muted");

    const summaryAlert =
      diagnostics.mode !== "supabase"
        ? `<div class="admin-alert admin-alert-error">Заказы сейчас хранятся только в памяти сервера. После рестарта или деплоя они исчезнут.</div>`
        : diagnostics.remoteStatus === "fallback"
          ? `<div class="admin-alert admin-alert-error">Supabase подключён, но чтение или запись заказов сейчас откатились в локальный fallback.</div>`
          : diagnostics.remoteStatus === "healthy"
            ? `<div class="admin-alert admin-alert-info">Persistent storage active: заказы должны переживать деплои и рестарты.</div>`
            : `<div class="admin-alert admin-alert-info">Supabase подключён. Ждём первой успешной синхронизации.</div>`;

    return `<div class="admin-diagnostics-strip">
      ${summaryAlert}
      <div class="admin-diagnostics-head">
        <div class="admin-badge-row admin-badge-row-inline">
          ${renderAdminBadge(modeLabel, diagnostics.mode === "supabase" ? "success" : "muted")}
          ${renderAdminBadge(remoteStatusLabel, diagnostics.remoteStatus === "fallback" ? "danger" : diagnostics.mode === "supabase" ? "success" : "muted")}
          ${renderAdminBadge(readSourceLabel, diagnostics.lastReadError ? "danger" : "outline")}
          ${statusBadge}
        </div>
        <p class="admin-action-hint">Этот раздел строится только из заявок сайта в quote ops, а не из всей CRM-базы контактов.</p>
      </div>
      <div class="admin-diagnostics-grid">
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Таблица</span>
          <p class="admin-diagnostics-value">${escapeHtml(diagnostics.tableName || "Не указана")}</p>
        </article>
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Лимит чтения</span>
          <p class="admin-diagnostics-value">${escapeHtml(String(diagnostics.limit || 0))}</p>
        </article>
        <article class="admin-diagnostics-card">
          <span class="admin-diagnostics-label">Последнее чтение</span>
          <p class="admin-diagnostics-value">${escapeHtml(diagnostics.lastReadAt || "Нет данных")}</p>
        </article>
      </div>
      ${diagnostics.lastReadError
        ? `<div class="admin-alert admin-alert-error">Ошибка чтения Supabase: ${escapeHtml(diagnostics.lastReadError)}</div>`
        : diagnostics.lastSyncError
          ? `<div class="admin-alert admin-alert-error">Последняя ошибка синхронизации: ${escapeHtml(diagnostics.lastSyncError)}</div>`
          : ""}
    </div>`;
  }

  function renderAdminClientDetailPanel(client, returnTo = ADMIN_CLIENTS_PATH, options = {}) {
    if (!client) {
      return `<div class="admin-empty-state">Выберите клиента в таблице, чтобы открыть его контакты, сводку по заявкам и историю обращений.</div>`;
    }

    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const quoteOpsHref = buildAdminRedirectPath(ADMIN_QUOTE_OPS_PATH, {
      q: client.email || client.phone || client.name,
    });
    const successfulEntries = client.entries.filter((entry) => normalizeString(entry.status, 32).toLowerCase() === "success").length;
    const issueCount = Math.max(0, client.entries.length - successfulEntries);
    const latestEntry = client.entries[0] || null;
    const lastScheduledLabel = latestEntry
      ? [latestEntry.selectedDate, latestEntry.selectedTime].filter(Boolean).join(" в ") || "Не указана"
      : "Не указана";
    const closeHref = options.closeHref || ADMIN_CLIENTS_PATH;
    const hideCloseAction = Boolean(options.hideCloseAction);
    const statusBadges = [
      renderAdminClientStatusBadge(client.latestStatus),
      renderAdminBadge(client.requestCount > 1 ? "Повторный клиент" : "Новая заявка", client.requestCount > 1 ? "outline" : "muted"),
      issueCount > 0 ? renderAdminBadge(`${issueCount} требуют внимания`, "danger") : renderAdminBadge("Без ошибок", "success"),
    ].join("");
    const contactItems = [
      { label: "Email", value: client.email || "Не указан" },
      { label: "Телефон", value: formatAdminPhoneNumber(client.phone) || client.phone || "Не указан" },
      { label: "Адрес", value: client.address || "Не указан", wide: true },
    ];
    const requestItems = [
      { label: "Последняя услуга", value: formatAdminServiceLabel(client.latestService) },
      { label: "Запланировано", value: lastScheduledLabel },
      { label: "Последнее обращение", value: formatAdminDateTime(client.latestCreatedAt) },
      { label: "Request ID", value: client.latestRequestId || "Не указан" },
    ];

    return `<div class="admin-client-dialog-body">
      <section class="admin-client-summary-panel">
        <div class="admin-client-summary-head">
          <div class="admin-client-summary-copy-block">
            <div class="admin-badge-row admin-client-badge-row">
              ${statusBadges}
            </div>
            <p class="admin-client-summary-copy">Последняя заявка: ${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</p>
          </div>
        </div>
        <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
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
      </section>
      <div class="admin-client-detail-grid">
        <section class="admin-client-section">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Контакты</h3>
            <span class="admin-action-hint">Профиль клиента</span>
          </div>
          ${renderAdminClientInfoGrid(contactItems)}
        </section>
        <section class="admin-client-section admin-client-section-side">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Сводка по заявке</h3>
            <span class="admin-action-hint">${escapeHtml(client.latestRequestId || "Номер не указан")}</span>
          </div>
          ${renderAdminClientInfoGrid(requestItems, { compact: true })}
          <div class="admin-client-actions-bar">
            <div class="admin-client-action-row">
              ${hideCloseAction ? "" : `<a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(closeHref)}">Закрыть карточку</a>`}
              <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(quoteOpsHref)}">Открыть заявки клиента</a>
            </div>
            <div class="admin-client-danger-row">
              <form class="admin-client-delete-form" method="post" action="${ADMIN_CLIENTS_PATH}">
                <input type="hidden" name="action" value="delete-client">
                <input type="hidden" name="clientKey" value="${escapeHtmlAttribute(client.key)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                ${renderAdminDeleteIconButton(
                  "Удалить клиента",
                  "Удалить клиента и все связанные заявки? Это действие очистит его заказы и записи в заявках."
                )}
              </form>
              <span class="admin-action-hint">Удаление убирает клиента из клиентов, заказов и заявок.</span>
            </div>
          </div>
        </section>
      </div>
      <section class="admin-client-section">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">История заявок</h3>
          <span class="admin-action-hint">${escapeHtml(formatClientRequestCountLabel(client.requestCount))}</span>
        </div>
        <div class="admin-history-list admin-client-history-list">
          ${client.entries.map((entry) => renderAdminClientHistoryItem(entry, planningByEntryId.get(entry.id) || null)).join("")}
        </div>
      </section>
    </div>`;
  }

  function renderAdminClientDetailDialog(client, returnTo = ADMIN_CLIENTS_PATH, options = {}) {
    if (!client) return "";
    const closeHref = options.closeHref || ADMIN_CLIENTS_PATH;
    const clientTitle = client.name || "Клиент";
    const clientMeta = [client.email || "", formatAdminPhoneNumber(client.phone) || client.phone || ""].filter(Boolean).join(" • ") || "Контакты пока не заполнены";
    return `<dialog
      class="admin-dialog admin-dialog-wide"
      id="admin-client-detail-dialog"
      data-admin-dialog-autopen="true"
      data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"
      aria-labelledby="admin-client-detail-title"
    >
      <div class="admin-dialog-panel admin-client-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block admin-client-dialog-intro">
            <div class="admin-client-dialog-title-row">
              <span class="admin-client-avatar admin-client-avatar-large ${getAdminClientAvatarToneClass(client.key)}">${escapeHtml(getAdminClientAvatarInitials(clientTitle))}</span>
              <div class="admin-client-dialog-title-block">
                <p class="admin-card-eyebrow">Клиент</p>
                <h2 class="admin-dialog-title" id="admin-client-detail-title">${escapeHtml(clientTitle)}</h2>
                <p class="admin-dialog-copy admin-client-dialog-meta">${escapeHtml(clientMeta)}</p>
              </div>
            </div>
          </div>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-client-detail-dialog">Закрыть</button>
        </div>
        ${renderAdminClientDetailPanel(client, returnTo, {
          closeHref,
          hideCloseAction: true,
          planningByEntryId: options.planningByEntryId,
        })}
      </div>
    </dialog>`;
  }

  async function renderDashboardPage(req, config, quoteOpsLedger) {
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const clientRecords = collectAdminClientRecords(allEntries);
    const scheduledCount = allEntries.filter((entry) => Boolean(entry.selectedDate || entry.selectedTime)).length;
    const attentionCount = allEntries.filter((entry) => entry.status !== "success").length;
    const overviewItems = [
      {
        label: "Клиенты",
        value: clientRecords.length,
        copy: "Все клиенты из текущих заявок.",
        tone: "accent",
      },
      {
        label: "Заказы",
        value: allEntries.length,
        copy: "Все заявки и заказы в работе.",
        tone: "default",
      },
      {
        label: "Назначена дата",
        value: scheduledCount,
        copy: "Заявки, где уже выбраны день или время.",
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
      "Обзор",
      `<div class="admin-compact-summary-strip admin-dashboard-summary-strip">
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
      </div>`,
      {
        kicker: false,
        subtitle: "Единый дашборд по текущим клиентам, заказам и входящим заявкам.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH),
      }
    );
  }

  async function renderClientsPage(req, config, quoteOpsLedger, staffStore) {
    const { reqUrl, filters } = getAdminClientsFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const clientRecords = collectAdminClientRecords(allEntries);
    const filteredClients = filterAdminClientRecords(clientRecords, filters);
    const clientsWithEmail = clientRecords.filter((client) => Boolean(client.email)).length;
    const repeatClients = clientRecords.filter((client) => client.requestCount > 1).length;
    const hasSearchQuery = Boolean(filters.q);
    const hasAdvancedFilters = Boolean(filters.name || filters.email || filters.phone);
    const hasActiveFilters = hasSearchQuery || hasAdvancedFilters;
    const selectedClient = filters.client ? filteredClients.find((client) => client.key === filters.client) || null : null;
    const selectedClientKey = selectedClient ? selectedClient.key : "";
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const resetHref = ADMIN_CLIENTS_PATH;
    const closeDetailHref = buildAdminRedirectPath(ADMIN_CLIENTS_PATH, {
      q: filters.q,
      name: filters.name,
      email: filters.email,
      phone: filters.phone,
      client: "",
    });
    const emptyStateMessage = clientRecords.length === 0
      ? "Пока клиентов нет. Как только появятся новые заявки, этот раздел заполнится автоматически."
      : "По текущим фильтрам клиентов не найдено.";

    return renderAdminLayout(
      "Клиенты",
      `${renderClientsNotice(req)}
        <div class="admin-clients-layout">
          ${renderAdminCard(
            false,
            false,
            `<div class="admin-clients-workspace">
              <form class="admin-clients-search-form" method="get" action="${ADMIN_CLIENTS_PATH}">
                ${renderAdminHiddenInput("name", filters.name)}
                ${renderAdminHiddenInput("email", filters.email)}
                ${renderAdminHiddenInput("phone", filters.phone)}
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
                <button class="admin-button admin-clients-search-submit" type="submit">Поиск</button>
                ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
              </form>
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
                                  <span class="admin-table-muted">${escapeHtml(formatClientRequestCountLabel(client.requestCount))} • ${escapeHtml(client.requestCount > 1 ? "Повторный клиент" : "Новый клиент")}</span>
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
                              ${client.address
                                ? `<div class="admin-table-cell-stack">
                                    <span class="admin-line-clamp-two">${escapeHtml(client.address)}</span>
                                  </div>`
                                : `<span class="admin-table-muted">Не указан</span>`}
                            </td>
                            <td>
                              <div class="admin-table-cell-stack">
                                <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(client.latestService))}</span>
                                <span class="admin-table-muted">${escapeHtml(formatAdminDateTime(client.latestCreatedAt))}</span>
                                <span>${renderAdminClientStatusBadge(client.latestStatus)}</span>
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
                  closeHref: closeDetailHref,
                  planningByEntryId,
                })
              : ""}
            </div>`,
            { eyebrow: false, className: "admin-clients-card" }
          )}
        </div>`,
      {
        kicker: false,
        subtitle: "CRM-таблица клиентов с быстрым поиском и карточкой по клику на строку.",
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

  function getOrderDialogId(orderId) {
    const normalized = normalizeString(orderId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-order-detail-dialog-${safeSuffix || "record"}`;
  }

  function getOrderAssignedLabel(order, planningItem) {
    const planningTeamLabel =
      planningItem && planningItem.assignedStaff.length > 0
        ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
        : "";
    return planningTeamLabel || order.assignedStaff || "Не назначен";
  }

  function getOrderQuoteData(order) {
    const payload =
      order && order.entry && order.entry.payloadForRetry && typeof order.entry.payloadForRetry === "object"
        ? order.entry.payloadForRetry
        : {};
    return payload.calculatorData && typeof payload.calculatorData === "object" ? payload.calculatorData : {};
  }

  function normalizeOrderQuoteToken(value) {
    return normalizeString(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normalizeOrderQuoteList(value) {
    const source = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];

    return source
      .map((entry) => normalizeString(entry, 120))
      .filter(Boolean);
  }

  function formatOrderQuoteText(value, emptyLabel = "Не указано", maxLength = 500) {
    const normalized = normalizeString(value, maxLength);
    return normalized || emptyLabel;
  }

  function formatOrderQuoteBoolean(value, emptyLabel = "Не указано") {
    if (value === true || value === false) return value ? "Да" : "Нет";
    const normalized = normalizeString(value, 64);
    if (!normalized) return emptyLabel;
    const compact = normalized.toLowerCase();
    if (["yes", "true", "1", "on"].includes(compact)) return "Да";
    if (["no", "false", "0", "off"].includes(compact)) return "Нет";
    return normalized;
  }

  function formatOrderQuoteServiceType(value, fallback = "Не указано") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    if (!normalized) return fallback;
    if (normalized === "regular" || normalized === "standard") return "Standard";
    if (normalized === "deep") return "Deep";
    if (["moving", "move-in/out", "move-in-out", "moveout", "moveinout"].includes(normalized)) {
      return "Move-in/out";
    }
    return normalizeString(value, 80) || fallback;
  }

  function formatOrderQuoteFrequency(value, fallback = "Not set") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (!normalized) return fallback;
    if (normalized === "weekly") return "Weekly";
    if (normalized === "monthly") return "Monthly";
    if (normalized === "biweekly") return "Bi-weekly";
    return normalizeString(value, 80) || fallback;
  }

  function formatOrderQuoteSquareFootage(value) {
    const normalized = normalizeString(value, 32);
    if (!normalized) return "Не указано";
    const numeric = Number(normalized.replace(",", "."));
    if (Number.isFinite(numeric)) {
      const mapped = ORDER_QUOTE_SQUARE_FOOTAGE_LABELS[String(Math.round(numeric))];
      if (mapped) return mapped;
      return `${Math.round(numeric)} sq ft`;
    }
    return normalized;
  }

  function getOrderQuoteSelectedServices(quoteData = {}) {
    const selected = new Set();
    for (const source of [quoteData.services, quoteData.addOns, quoteData.extras]) {
      for (const item of normalizeOrderQuoteList(source)) {
        const normalizedKey = normalizeOrderQuoteToken(item);
        const serviceKey = ORDER_QUOTE_SERVICE_ALIASES[normalizedKey] || item;
        const label = ORDER_QUOTE_SERVICE_LABELS[serviceKey];
        selected.add(label || item);
      }
    }
    return Array.from(selected);
  }

  function getOrderQuoteQuantityValue(quoteData = {}, key) {
    const quantityServices =
      quoteData && quoteData.quantityServices && typeof quoteData.quantityServices === "object"
        ? quoteData.quantityServices
        : {};
    const rawValue = quantityServices[key];
    if (rawValue === 0 || rawValue === "0") return "0";
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue >= 0) return String(Math.round(numericValue));
    return formatOrderQuoteText(rawValue, "0", 32);
  }

  function formatOrderQuoteMultiline(value, emptyLabel = "Не указано") {
    const normalized = String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!normalized) return escapeHtml(emptyLabel);
    return escapeHtml(normalized).replace(/\n/g, "<br>");
  }

  function renderOrderQuoteField(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-quote-field admin-order-quote-field-wide"
      : "admin-order-quote-field";
    const content = options.raw ? value : escapeHtml(value);

    return `<div class="${className}">
      <span class="admin-order-quote-field-label">${escapeHtml(label)}</span>
      <p class="admin-order-quote-field-value">${content}</p>
    </div>`;
  }

  function renderOrderTableRow(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const dialogId = getOrderDialogId(order.id);
    const customerPhoneLabel = formatAdminPhoneNumber(order.customerPhone);
    const contactCell = [customerPhoneLabel, order.customerEmail].filter(Boolean);
    const scheduleNote = order.hasSchedule ? "Визит назначен" : "Нужно назначить";

    return `<tr>
      <td>
        <div class="admin-client-table-cell">
          <span class="admin-client-avatar ${getAdminClientAvatarToneClass(order.customerName || order.requestId || order.id)}">${escapeHtml(getAdminClientAvatarInitials(order.customerName || order.requestId || "Заказ"))}</span>
          <div class="admin-table-stack">
            <button
              class="admin-table-link admin-table-link-button"
              type="button"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
            >${escapeHtml(order.customerName || "Клиент")}</button>
            <span class="admin-table-muted">${escapeHtml(order.requestId || "Номер не указан")} • ${escapeHtml(order.serviceLabel)}</span>
            <div class="admin-inline-badge-row">
              ${order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : ""}
              ${order.needsAttention ? renderAdminBadge("Нужно проверить", "danger") : ""}
            </div>
          </div>
        </div>
      </td>
      <td>
        ${contactCell.length > 0
          ? `<div class="admin-table-cell-stack">
              ${customerPhoneLabel ? `<span class="admin-table-strong">${escapeHtml(customerPhoneLabel)}</span>` : ""}
              ${order.customerEmail ? `<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(order.customerEmail)}</span>` : ""}
            </div>`
          : `<span class="admin-table-muted">Не указаны</span>`}
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(order.scheduleLabel)}</span>
          <span class="admin-table-muted">${escapeHtml(scheduleNote)}</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(assignedLabel)}</span>
          <span class="admin-table-muted">${escapeHtml(order.isAssigned ? "Команда назначена" : "Ожидает назначения")}</span>
        </div>
      </td>
      <td>
        <div class="admin-orders-status-stack">
          <div class="admin-inline-badge-row">
            ${renderOrderStatusBadge(order.orderStatus)}
            ${renderQuoteOpsStatusBadge(order.crmStatus)}
          </div>
          <span class="admin-table-muted">${escapeHtml(order.needsAttention ? "Есть вопрос по CRM" : "CRM без ошибок")}</span>
        </div>
      </td>
      <td>
        ${order.fullAddress
          ? `<div class="admin-table-cell-stack">
              <span class="admin-line-clamp-two">${escapeHtml(order.fullAddress)}</span>
            </div>`
          : `<span class="admin-table-muted">Не указан</span>`}
      </td>
      <td class="admin-table-number">
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(order.totalPrice))}</span>
          <span class="admin-table-muted">${escapeHtml(order.orderStatusLabel)}</span>
        </div>
      </td>
    </tr>`;
  }

  function renderOrderManagementDialog(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffPageHref = options.staffPageHref || ADMIN_STAFF_PATH;
    const dialogId = getOrderDialogId(order.id);
    const editFormId = `${dialogId}-edit-form`;
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const createdLabel = formatAdminDateTime(order.createdAt);
    const contactLabel = [formatAdminPhoneNumber(order.customerPhone) || "Телефон не указан", order.customerEmail || ""].filter(Boolean).join(" • ");
    const scheduleLabel = order.scheduleLabel || "Дата не указана";
    const crmLabel = normalizeString(order.crmStatus, 32) || "pending";
    const quoteData = getOrderQuoteData(order);
    const selectedServices = getOrderQuoteSelectedServices(quoteData);
    const quoteAddressLabel = formatOrderQuoteText(quoteData.address, "Не указан", 500);
    const quoteFullAddressLabel = formatOrderQuoteText(
      quoteData.fullAddress || order.fullAddress,
      "Не указан",
      500
    );
    const quoteCards = [
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Параметры уборки</h4>
        </div>
        <div class="admin-order-quote-fields admin-order-quote-fields-primary">
          ${renderOrderQuoteField("Тип уборки", formatOrderQuoteServiceType(quoteData.serviceType, order.serviceLabel))}
          ${renderOrderQuoteField("Повторяемость", formatOrderQuoteFrequency(quoteData.frequency, order.frequencyLabel))}
          ${renderOrderQuoteField("Дата", formatOrderQuoteText(quoteData.selectedDate || order.selectedDate, "Не указана", 32))}
          ${renderOrderQuoteField("Время", formatOrderQuoteText(quoteData.selectedTime || order.selectedTime, "Не указано", 32))}
          ${renderOrderQuoteField("Запрошенный слот", formatOrderQuoteText(quoteData.formattedDateTime, "Не указано", 120))}
          ${renderOrderQuoteField(
            "Сумма из quote",
            formatCurrencyAmount(
              quoteData.totalPrice === 0 || quoteData.totalPrice
                ? quoteData.totalPrice
                : order.totalPrice
            )
          )}
          ${renderOrderQuoteField("Согласие", formatOrderQuoteBoolean(quoteData.consent))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Дом и условия</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Спальни", formatOrderQuoteText(quoteData.rooms, "Не указано", 32))}
          ${renderOrderQuoteField("Санузлы", formatOrderQuoteText(quoteData.bathrooms, "Не указано", 32))}
          ${renderOrderQuoteField("Размер дома", formatOrderQuoteSquareFootage(quoteData.squareMeters))}
          ${renderOrderQuoteField("Питомцы", formatOrderQuoteBoolean(quoteData.hasPets))}
          ${renderOrderQuoteField("Basement cleaning", formatOrderQuoteBoolean(quoteData.basementCleaning))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Дополнительные услуги</h4>
        </div>
        <div class="admin-order-quote-fields admin-order-quote-fields-services">
          ${renderOrderQuoteField("Выбранные add-ons", selectedServices.length > 0 ? selectedServices.join(", ") : "Не выбраны", { wide: true })}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.interiorWindowsCleaning, getOrderQuoteQuantityValue(quoteData, "interiorWindowsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.blindsCleaning, getOrderQuoteQuantityValue(quoteData, "blindsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.bedLinenChange, getOrderQuoteQuantityValue(quoteData, "bedLinenChange"))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Адрес из формы</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Полный адрес", quoteFullAddressLabel, { wide: true })}
          ${renderOrderQuoteField("Короткий адрес", quoteAddressLabel)}
          ${renderOrderQuoteField("Apt / suite", formatOrderQuoteText(quoteData.addressLine2, "Не указано", 200))}
          ${renderOrderQuoteField("Город", formatOrderQuoteText(quoteData.city, "Не указано", 120))}
          ${renderOrderQuoteField("Штат", formatOrderQuoteText(quoteData.state, "Не указано", 32))}
          ${renderOrderQuoteField("ZIP", formatOrderQuoteText(quoteData.zipCode, "Не указано", 32))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Комментарий клиента</h4>
        </div>
        <p class="admin-order-quote-note">${formatOrderQuoteMultiline(quoteData.additionalDetails)}</p>
      </article>`,
    ].join("");

    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Заказ</p>
            <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(order.customerName || "Карточка заказа")}</h2>
            <p class="admin-dialog-copy">Карточка заказа, график, команда и редактирование в одном окне.</p>
          </div>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${escapeHtmlAttribute(dialogId)}">Закрыть</button>
        </div>
        <div class="admin-inline-badge-row">
          ${renderOrderStatusBadge(order.orderStatus)}
          ${renderAdminBadge(order.serviceLabel, "outline")}
          ${order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : ""}
          ${renderQuoteOpsStatusBadge(order.crmStatus)}
        </div>
        <div class="admin-client-metric-grid">
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Сумма</span>
            <p class="admin-client-metric-value">${escapeHtml(formatCurrencyAmount(order.totalPrice))}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Дата и время</span>
            <p class="admin-client-metric-value">${escapeHtml(scheduleLabel)}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Команда</span>
            <p class="admin-client-metric-value">${escapeHtml(assignedLabel)}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">CRM</span>
            <p class="admin-client-metric-value">${escapeHtml(crmLabel)}</p>
          </article>
        </div>
        <div class="admin-client-contact-grid">
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">Request ID</span>
            <p class="admin-client-contact-value">${escapeHtml(order.requestId || "Не указан")}</p>
          </article>
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">Создан</span>
            <p class="admin-client-contact-value">${escapeHtml(createdLabel)}</p>
          </article>
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">Контакты</span>
            <p class="admin-client-contact-value">${escapeHtml(contactLabel)}</p>
          </article>
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">Повторяемость</span>
            <p class="admin-client-contact-value">${escapeHtml(order.frequencyLabel)}</p>
          </article>
          <article class="admin-client-contact-card admin-client-contact-card-wide">
            <span class="admin-client-contact-label">Адрес</span>
            <p class="admin-client-contact-value">${escapeHtml(order.fullAddress || "Не указан")}</p>
          </article>
        </div>
        <section>
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Поля из формы клиента</h3>
          </div>
          <div class="admin-order-quote-grid">
            ${quoteCards}
          </div>
        </section>
        <form class="admin-form-grid" id="${escapeHtmlAttribute(editFormId)}" method="post" action="${ADMIN_ORDERS_PATH}">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <div class="admin-form-grid admin-form-grid-two">
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
              Ответственный / заметка
              <input class="admin-input" type="text" name="assignedStaff" value="${escapeHtmlText(order.assignedStaff)}" placeholder="Текстовая пометка, если нужна">
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
          </div>
        </form>
        <div class="admin-dialog-actions-row">
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit" form="${escapeHtmlAttribute(editFormId)}">Сохранить заказ</button>
            <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(staffPageHref)}">Сотрудники и график</a>
            <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${escapeHtmlAttribute(dialogId)}">Закрыть</button>
          </div>
          <form class="admin-inline-actions admin-inline-actions-end admin-order-delete-form" method="post" action="${ADMIN_ORDERS_PATH}">
            <input type="hidden" name="action" value="delete-order">
            <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
            <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
            ${renderAdminDeleteIconButton(
              "Удалить заказ",
              "Удалить этот тестовый заказ? Запись исчезнет из заказов, клиентов и заявок."
            )}
          </form>
        </div>
      </div>
    </dialog>`;
  }

  function renderOrderEntryCard(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffPageHref = options.staffPageHref || ADMIN_STAFF_PATH;
    const dialogId = getOrderDialogId(order.id);
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
          <h3 class="admin-order-title">
            <button
              class="admin-table-link admin-table-link-button"
              type="button"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
            >${escapeHtml(order.customerName || "Клиент")}</button>
          </h3>
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
        ${renderOrderSnapshot("Контакты", [formatAdminPhoneNumber(order.customerPhone) || "Телефон не указан", order.customerEmail || ""].filter(Boolean).join(" • "))}
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
            ${renderAdminDeleteIconButton(
              "Удалить заказ",
              "Удалить этот тестовый заказ? Запись исчезнет из заказов, клиентов и заявок."
            )}
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

  function renderOrdersOverviewStrip(metrics = []) {
    return `<div class="admin-compact-summary-strip">
      ${metrics
        .map(
          (item) => `<article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone || "default")}">
            <div class="admin-compact-summary-head">
              <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
              <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
            </div>
            <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
          </article>`
        )
        .join("")}
    </div>`;
  }

  function renderOrdersUpcomingTable(upcomingOrders) {
    if (!upcomingOrders.length) {
      return `<div class="admin-empty-state">Пока нет ближайших выездов с датой и временем. Как только в заказах появится график, он подтянется сюда автоматически.</div>`;
    }

    return `<div class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Адрес</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${upcomingOrders
            .map(({ order, planningItem }) => {
              const dialogId = getOrderDialogId(order.id);
              const assignedLabel = getOrderAssignedLabel(order, planningItem);

              return `<tr>
                <td>
                  <div class="admin-table-cell-stack">
                    <button
                      class="admin-table-link admin-table-link-button"
                      type="button"
                      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                    >${escapeHtml(order.customerName || "Клиент")}</button>
                    <span class="admin-table-muted">${escapeHtml(order.requestId || "Номер не указан")} • ${escapeHtml(order.serviceLabel)}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(planningItem.scheduleLabel || order.scheduleLabel)}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(assignedLabel)}</span>
                    <span class="admin-table-muted">${escapeHtml(order.isAssigned ? "Команда назначена" : "Ожидает назначения")}</span>
                  </div>
                </td>
                <td>
                  ${order.fullAddress
                    ? `<div class="admin-table-cell-stack">
                        <span class="admin-line-clamp-two">${escapeHtml(order.fullAddress)}</span>
                      </div>`
                    : `<span class="admin-table-muted">Не указан</span>`}
                </td>
                <td>
                  <div class="admin-inline-badge-row">
                    ${renderOrderStatusBadge(order.orderStatus)}
                    ${renderQuoteOpsStatusBadge(order.crmStatus)}
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
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
    const emptyStateMessage = hasActiveFilters
      ? "По текущему фильтру заказов нет. Попробуйте очистить поиск или снять часть фильтров."
      : "Пока заказов нет. Новые заявки с сайта появятся здесь автоматически.";
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

    return renderAdminLayout(
      "Заказы",
      `<div class="admin-orders-page">
        ${renderOrdersNotice(req)}
        ${renderOrdersOverviewStrip(overviewItems)}
        ${renderAdminCard(
          "Все заказы",
          "Рабочая таблица заказов с поиском, фильтрами и карточкой по клику.",
          `<div class="admin-orders-workspace">
            <div class="admin-orders-toolbar-shell">
              <details class="admin-filter-disclosure admin-orders-filter-toggle"${advancedFilterCount ? " open" : ""}>
                <summary class="admin-clients-toolbar-button">
                  <span>Фильтры</span>
                  ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
                </summary>
              </details>
              <form class="admin-clients-search-form" method="get" action="${ADMIN_ORDERS_PATH}">
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
                <button class="admin-button" type="submit">Поиск</button>
                ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
              </form>
              <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
                <form class="admin-orders-filter-bar" method="get" action="${ADMIN_ORDERS_PATH}">
                  ${renderAdminHiddenInput("q", filters.q)}
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
                  <div class="admin-clients-filter-actions">
                    <button class="admin-button" type="submit">Применить</button>
                    <a class="admin-link-button admin-button-secondary" href="${advancedResetHref}">Сбросить фильтры</a>
                  </div>
                </form>
              </div>
            </div>
            <div class="admin-clients-meta-row">
              <div class="admin-clients-meta-main">
                <p class="admin-clients-summary-copy">
                  Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalOrders))} заказов.
                  ${hasActiveFilters ? "С учётом поиска и фильтров." : "Показан общий рабочий список."}
                </p>
                ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
              </div>
              <span class="admin-action-hint">Нажмите на имя заказа, чтобы открыть карточку и редактирование.</span>
            </div>
            ${orders.length > 0
              ? `<div class="admin-table-wrap admin-orders-table-wrap">
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
                            staffPageHref: ADMIN_STAFF_PATH,
                          })
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
                ${orders
                  .map((order) =>
                    renderOrderManagementDialog(order, currentReturnTo, {
                      planningItem: planningByEntryId.get(order.id) || null,
                      staffPageHref: ADMIN_STAFF_PATH,
                    })
                  )
                  .join("")}`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
          </div>`,
          { className: "admin-orders-card" }
        )}
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

  function renderStaffOverviewStrip(planning) {
    const items = [
      {
        label: "Команда",
        value: planning.staff.length,
        copy: "Всего сотрудников в базе команды.",
        tone: "accent",
      },
      {
        label: "Активны",
        value: planning.activeStaffCount,
        copy: "Можно ставить в график прямо сейчас.",
        tone: "success",
      },
      {
        label: "Назначены",
        value: planning.assignedScheduledCount,
        copy: "Заказы уже закрыты командой.",
        tone: "default",
      },
      {
        label: "Пробелы",
        value: planning.unassignedScheduledCount,
        copy: "Смены ещё ждут назначения.",
        tone: planning.unassignedScheduledCount > 0 ? "danger" : "default",
      },
    ];

    return `<div class="admin-compact-summary-strip">
      ${items.map((item) => `
        <article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
          <div class="admin-compact-summary-head">
            <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
            <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
          </div>
          <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
        </article>
      `).join("")}
    </div>`;
  }

  function getStaffDialogId(staffId) {
    const normalized = normalizeString(staffId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-staff-edit-dialog-${safeSuffix || "record"}`;
  }

  function renderStaffAddressField(options = {}) {
    const inputId = normalizeString(options.id, 160);
    const fieldName = normalizeString(options.name, 80) || "address";
    const placeholder =
      normalizeString(options.placeholder, 200) || "215 North Elm Street, Naperville, IL";
    const value = normalizeString(options.value, 500);
    const suggestionsId = inputId ? `${inputId}-suggestions` : "";

    return `<label class="admin-label">
      Адрес
      <div class="admin-address-field" data-admin-address-field>
        <input
          class="admin-input"
          type="text"
          name="${escapeHtmlAttribute(fieldName)}"
          value="${escapeHtmlAttribute(value)}"
          placeholder="${escapeHtmlAttribute(placeholder)}"
          autocomplete="off"
          data-admin-address-autocomplete="true"
          data-admin-address-country="us"
          aria-autocomplete="list"
          aria-expanded="false"${inputId ? ` id="${escapeHtmlAttribute(inputId)}"` : ""}${suggestionsId ? ` aria-controls="${escapeHtmlAttribute(suggestionsId)}"` : ""}
        >
        <div class="admin-address-suggestions" data-admin-address-suggestions hidden role="listbox"${suggestionsId ? ` id="${escapeHtmlAttribute(suggestionsId)}"` : ""}></div>
      </div>
    </label>`;
  }

  function renderStaffAddressAutocompleteScript() {
    if (!GOOGLE_PLACES_API_KEY) return "";

    return `<script>
      (() => {
        const adminPlacesApiKey = ${JSON.stringify(GOOGLE_PLACES_API_KEY)};
        const addressInputs = Array.from(document.querySelectorAll('[data-admin-address-autocomplete="true"]'));
        if (!adminPlacesApiKey || !addressInputs.length) return;

        function escapeSuggestionHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        }

        function createPlacesApi() {
          const placesNamespace = window.google && window.google.maps && window.google.maps.places;
          if (!placesNamespace) return null;
          const host = document.createElement("div");
          host.hidden = true;
          document.body.appendChild(host);
          return {
            autocompleteService: new placesNamespace.AutocompleteService(),
            placesService: new placesNamespace.PlacesService(host),
            placesStatus: placesNamespace.PlacesServiceStatus,
            sessionTokenCtor: placesNamespace.AutocompleteSessionToken,
          };
        }

        function loadPlacesApi() {
          if (window.__adminPlacesApiPromise) return window.__adminPlacesApiPromise;
          if (window.google && window.google.maps && window.google.maps.places) {
            window.__adminPlacesApiPromise = Promise.resolve(createPlacesApi());
            return window.__adminPlacesApiPromise;
          }

          window.__adminPlacesApiPromise = new Promise((resolve, reject) => {
            window.__adminGooglePlacesReady = () => resolve(createPlacesApi());

            const existingScript = document.querySelector('script[data-admin-google-places="true"]');
            if (existingScript) return;

            const script = document.createElement("script");
            script.async = true;
            script.defer = true;
            script.setAttribute("data-admin-google-places", "true");
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(adminPlacesApiKey) + "&libraries=places&loading=async&callback=__adminGooglePlacesReady";
            script.onerror = () => reject(new Error("Failed to load Google Places"));
            document.head.appendChild(script);
          }).catch(() => null);

          return window.__adminPlacesApiPromise;
        }

        function bindAutocomplete(input, placesApi) {
          if (!input || input.dataset.adminAddressBound === "true") return;
          const field = input.closest("[data-admin-address-field]");
          const suggestions = field ? field.querySelector("[data-admin-address-suggestions]") : null;
          if (!field || !suggestions) return;

          input.dataset.adminAddressBound = "true";

          const autocompleteService = placesApi.autocompleteService;
          const placesService = placesApi.placesService;
          const placesStatus = placesApi.placesStatus;
          const SessionToken = placesApi.sessionTokenCtor;
          const country = input.getAttribute("data-admin-address-country") || "us";
          let currentPredictions = [];
          let pendingRequestId = 0;
          let inputTimer = null;
          let blurTimer = null;
          let sessionToken = typeof SessionToken === "function" ? new SessionToken() : null;

          function resetSessionToken() {
            sessionToken = typeof SessionToken === "function" ? new SessionToken() : null;
          }

          function closeSuggestions() {
            currentPredictions = [];
            suggestions.hidden = true;
            suggestions.innerHTML = "";
            input.setAttribute("aria-expanded", "false");
          }

          function openSuggestions() {
            if (!suggestions.innerHTML.trim()) return;
            suggestions.hidden = false;
            input.setAttribute("aria-expanded", "true");
          }

          function applySelectedAddress(value) {
            input.value = value || "";
            closeSuggestions();
            resetSessionToken();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }

          function renderPredictions(predictions) {
            currentPredictions = predictions.slice(0, 6);
            suggestions.innerHTML = currentPredictions
              .map((prediction, index) => {
                const formatting = prediction.structured_formatting || {};
                const mainText = formatting.main_text || prediction.description || "";
                const secondaryText = formatting.secondary_text || "";
                return '<button class="admin-address-suggestion" type="button" role="option" data-admin-address-option="' + index + '">' +
                  '<span class="admin-address-suggestion-main">' + escapeSuggestionHtml(mainText) + '</span>' +
                  (secondaryText
                    ? '<span class="admin-address-suggestion-copy">' + escapeSuggestionHtml(secondaryText) + '</span>'
                    : "") +
                '</button>';
              })
              .join("");
            openSuggestions();
          }

          function requestPredictions(query) {
            const trimmed = String(query || "").trim();
            if (trimmed.length < 3) {
              closeSuggestions();
              return;
            }

            const requestId = ++pendingRequestId;
            const request = {
              input: trimmed,
              componentRestrictions: { country },
              types: ["address"],
            };
            if (sessionToken) {
              request.sessionToken = sessionToken;
            }

            autocompleteService.getPlacePredictions(request, (predictions, status) => {
              if (requestId !== pendingRequestId) return;
              if (
                status !== placesStatus.OK ||
                !Array.isArray(predictions) ||
                predictions.length === 0
              ) {
                closeSuggestions();
                return;
              }
              renderPredictions(predictions);
            });
          }

          input.addEventListener("input", () => {
            if (blurTimer) {
              window.clearTimeout(blurTimer);
              blurTimer = null;
            }
            window.clearTimeout(inputTimer);
            inputTimer = window.setTimeout(() => requestPredictions(input.value), 120);
          });

          input.addEventListener("focus", () => {
            if (suggestions.innerHTML.trim()) {
              openSuggestions();
            } else if (input.value.trim().length >= 3) {
              requestPredictions(input.value);
            }
          });

          input.addEventListener("blur", () => {
            blurTimer = window.setTimeout(closeSuggestions, 140);
          });

          suggestions.addEventListener("mousedown", (event) => {
            const option = event.target.closest("[data-admin-address-option]");
            if (!option) return;
            event.preventDefault();
            const index = Number(option.getAttribute("data-admin-address-option"));
            const prediction = currentPredictions[index];
            if (!prediction) return;

            const fallbackAddress = prediction.description || "";
            if (!prediction.place_id) {
              applySelectedAddress(fallbackAddress);
              return;
            }

            const detailsRequest = {
              placeId: prediction.place_id,
              fields: ["formatted_address"],
            };
            if (sessionToken) {
              detailsRequest.sessionToken = sessionToken;
            }

            placesService.getDetails(detailsRequest, (place, status) => {
              const formattedAddress =
                status === placesStatus.OK && place && place.formatted_address
                  ? place.formatted_address
                  : fallbackAddress;
              applySelectedAddress(formattedAddress);
            });
          });

          document.addEventListener("click", (event) => {
            if (!field.contains(event.target)) {
              closeSuggestions();
            }
          });
        }

        loadPlacesApi().then((placesApi) => {
          if (!placesApi) return;
          addressInputs.forEach((input) => bindAutocomplete(input, placesApi));
        });
      })();
    </script>`;
  }

  function getStaffNextOrderName(staffSummary) {
    if (!staffSummary || !staffSummary.nextOrder) return "Ожидает назначения";
    return (
      staffSummary.nextOrder.entry.customerName ||
      staffSummary.nextOrder.entry.fullAddress ||
      staffSummary.nextOrder.entry.requestId ||
      "Заказ"
    );
  }

  function renderStaffEditDialog(staffSummary) {
    const nextShiftLabel = staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены";
    const contactLabel = [formatAdminPhoneNumber(staffSummary.phone), staffSummary.email].filter(Boolean).join(" • ") || "Контакты не указаны";
    const nextOrderName = getStaffNextOrderName(staffSummary);
    const dialogId = getStaffDialogId(staffSummary.id);
    const editFormId = `${dialogId}-form`;
    const headerMeta = [
      staffSummary.role || "Роль не указана",
      contactLabel !== "Контакты не указаны" ? contactLabel : "",
    ]
      .filter(Boolean)
      .join(" • ");
    const summaryBadges = [
      renderStaffStatusBadge(staffSummary.status),
      renderAdminBadge(staffSummary.role || "Без роли", staffSummary.role ? "outline" : "muted"),
      renderAdminBadge(
        staffSummary.nextOrder ? "Есть ближайшая смена" : "Свободен",
        staffSummary.nextOrder ? "default" : "muted"
      ),
    ].join("");
    const heroCopy = staffSummary.nextOrder
      ? `Ближайший выезд запланирован на ${nextShiftLabel}. Следующий заказ: ${nextOrderName}.`
      : "Сотрудник пока свободен: карточка готова для контактов, адреса и будущих назначений.";
    const contactItems = [
      { label: "Телефон", value: formatAdminPhoneNumber(staffSummary.phone) || "Не указан" },
      { label: "Email", value: staffSummary.email || "Не указан" },
      { label: "Адрес", value: staffSummary.address || "Не указан", wide: true },
    ];
    const workloadItems = [
      { label: "Следующая смена", value: nextShiftLabel },
      { label: "Следующий заказ", value: nextOrderName },
      { label: "В графике", value: formatOrderCountLabel(staffSummary.scheduledCount) },
      { label: "На 7 дней", value: formatOrderCountLabel(staffSummary.upcomingWeekCount) },
      { label: "Заметки", value: staffSummary.notes || "Пока без внутренних заметок", wide: true },
    ];

    return `<dialog class="admin-dialog" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel admin-staff-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-client-dialog-title-row">
            <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
            <div class="admin-client-dialog-title-block">
              <p class="admin-card-eyebrow">Команда</p>
              <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(staffSummary.name || "Сотрудник")}</h2>
              <p class="admin-dialog-copy admin-client-dialog-meta">${escapeHtml(headerMeta || "Карточка сотрудника, контакты и рабочая нагрузка в одном окне.")}</p>
            </div>
          </div>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${escapeHtmlAttribute(dialogId)}">Закрыть</button>
        </div>
        <div class="admin-client-dialog-body admin-staff-dialog-body">
          <section class="admin-client-summary-panel admin-staff-summary-panel">
            <div class="admin-client-summary-head">
              <div class="admin-client-summary-copy-block">
                <div class="admin-badge-row admin-client-badge-row">
                  ${summaryBadges}
                </div>
                <p class="admin-client-summary-copy">${escapeHtml(heroCopy)}</p>
              </div>
            </div>
            <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">Роль</span>
                <p class="admin-client-metric-value">${escapeHtml(staffSummary.role || "Не указана")}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">В графике</span>
                <p class="admin-client-metric-value">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">На 7 дней</span>
                <p class="admin-client-metric-value">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))}</p>
              </article>
              <article class="admin-client-metric-card">
                <span class="admin-client-metric-label">Следующая смена</span>
                <p class="admin-client-metric-value">${escapeHtml(nextShiftLabel)}</p>
              </article>
            </div>
          </section>
          <div class="admin-client-detail-grid">
            <section class="admin-client-section">
              <div class="admin-subsection-head">
                <h3 class="admin-subsection-title">Контакты и локация</h3>
                <span class="admin-action-hint">База для связи и маршрута</span>
              </div>
              ${renderAdminClientInfoGrid(contactItems)}
            </section>
            <section class="admin-client-section admin-client-section-side">
              <div class="admin-subsection-head">
                <h3 class="admin-subsection-title">Рабочая сводка</h3>
                <span class="admin-action-hint">Ближайшая загрузка и заметки</span>
              </div>
              ${renderAdminClientInfoGrid(workloadItems)}
            </section>
          </div>
          <section class="admin-client-section admin-staff-form-section">
            <div class="admin-subsection-head">
              <h3 class="admin-subsection-title">Редактирование карточки</h3>
              <span class="admin-action-hint">Контакты, адрес и внутренние заметки</span>
            </div>
            <form class="admin-form-grid" id="${escapeHtmlAttribute(editFormId)}" method="post" action="${ADMIN_STAFF_PATH}">
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
              </div>
              ${renderStaffAddressField({
                id: `${dialogId}-address`,
                value: staffSummary.address,
              })}
              <label class="admin-label">
                Статус
                <select class="admin-input" name="status">
                  ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${staffSummary.status === status ? " selected" : ""}>${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
                </select>
              </label>
              <label class="admin-label">
                Заметки
                <textarea class="admin-input" name="notes" placeholder="Районы, предпочтительные смены, ключи, транспорт">${escapeHtml(staffSummary.notes)}</textarea>
              </label>
            </form>
          </section>
        </div>
        <div class="admin-dialog-actions-row">
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit" form="${escapeHtmlAttribute(editFormId)}">Сохранить карточку</button>
            <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${escapeHtmlAttribute(dialogId)}">Отмена</button>
          </div>
          <form class="admin-inline-actions admin-inline-actions-end" method="post" action="${ADMIN_STAFF_PATH}">
            <input type="hidden" name="action" value="delete-staff">
            <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
            ${renderAdminDeleteIconButton("Удалить сотрудника")}
          </form>
        </div>
      </div>
    </dialog>`;
  }

  function renderStaffTableRow(staffSummary) {
    const contactBits = [];
    if (staffSummary.phone) {
      contactBits.push(`<span class="admin-table-strong">${escapeHtml(formatAdminPhoneNumber(staffSummary.phone) || staffSummary.phone)}</span>`);
    }
    if (staffSummary.email) {
      contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.email)}</span>`);
    }
    if (staffSummary.address) {
      contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.address)}</span>`);
    }
    const contactCell = contactBits.length
      ? `<div class="admin-table-cell-stack">${contactBits.join("")}</div>`
      : `<span class="admin-table-muted">Не указаны</span>`;
    const nextOrderName = getStaffNextOrderName(staffSummary);
    const dialogId = getStaffDialogId(staffSummary.id);

    return `<tr
      class="admin-table-row-clickable"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      aria-label="${escapeHtmlAttribute(`Открыть карточку сотрудника ${staffSummary.name || "Сотрудник"}`)}"
    >
      <td>
        <div class="admin-client-table-cell">
          <div class="admin-client-avatar ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
          <div class="admin-table-stack">
            <span class="admin-table-link">${escapeHtml(staffSummary.name || "Сотрудник")}</span>
            <span class="admin-table-muted">${escapeHtml(staffSummary.role || "Роль не указана")}</span>
            ${staffSummary.notes ? `<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.notes)}</span>` : ""}
          </div>
        </div>
      </td>
      <td>${contactCell}</td>
      <td>
        <div class="admin-table-cell-stack">
          ${renderStaffStatusBadge(staffSummary.status)}
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</span>
          <span class="admin-table-muted">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))} на 7 дней</span>
        </div>
      </td>
      <td>
        <div class="admin-table-cell-stack">
          <span class="admin-table-strong">${escapeHtml(staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены")}</span>
          <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(nextOrderName)}</span>
        </div>
      </td>
    </tr>`;
  }

  function renderStaffSummaryTable(staffSummaries) {
    if (!staffSummaries.length) {
      return `<div class="admin-empty-state">Пока сотрудников нет. Добавьте первую карточку, и сможете сразу назначать команду на заказы.</div>`;
    }

    return `<div class="admin-table-wrap admin-staff-table-wrap">
      <table class="admin-table admin-staff-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Контакты</th>
            <th>Статус</th>
            <th>Нагрузка</th>
            <th>Следующая смена</th>
          </tr>
        </thead>
        <tbody>
          ${staffSummaries.map((record) => renderStaffTableRow(record)).join("")}
        </tbody>
      </table>
      ${staffSummaries.map((record) => renderStaffEditDialog(record)).join("")}
    </div>`;
  }

  function renderCreateStaffDialog(options = {}) {
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

    return `<dialog class="admin-dialog" id="admin-staff-create-dialog"${autoOpenAttr} aria-labelledby="admin-staff-create-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Команда</p>
            <h2 class="admin-dialog-title" id="admin-staff-create-title">Новый сотрудник</h2>
            <p class="admin-dialog-copy">Заполните карточку сотрудника, и он сразу появится в команде, графике и назначениях.</p>
          </div>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-staff-create-dialog">Закрыть</button>
        </div>
        <form class="admin-form-grid" method="post" action="${ADMIN_STAFF_PATH}">
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
          </div>
          ${renderStaffAddressField({
            id: "admin-staff-create-address",
          })}
          <label class="admin-label">
            Статус
            <select class="admin-input" name="status">
              ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
            </select>
          </label>
          <label class="admin-label">
            Заметки
            <textarea class="admin-input" name="notes" placeholder="Районы, доступность, предпочтительные смены, ключи"></textarea>
          </label>
          <div class="admin-inline-actions">
            <button class="admin-button" type="submit">Добавить сотрудника</button>
            <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-staff-create-dialog">Отмена</button>
          </div>
        </form>
      </div>
    </dialog>`;
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
          <p class="admin-mini-value">${escapeHtml(formatAdminPhoneNumber(orderItem.entry.customerPhone) || orderItem.entry.customerEmail || "Контакты не указаны")}</p>
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
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const staffSnapshot = staffStore ? await staffStore.getSnapshot() : { staff: [], assignments: [] };
    const planning = buildStaffPlanningContext(allEntries, staffSnapshot);
    const upcomingOrders = planning.orderItems.slice(0, 12);
    const shiftsPreview = planning.scheduledOrders.slice(0, 6);
    const shouldAutoOpenCreateDialog = notice === "staff-failed";

    return renderAdminLayout(
      "Сотрудники",
      `${renderStaffNotice(req)}
        ${renderStaffOverviewStrip(planning)}
        <div class="admin-section-grid">
          ${renderAdminCard(
            "Команда",
            "Компактная таблица сотрудников, контактов и текущей загрузки.",
            renderStaffSummaryTable(planning.staffSummaries),
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
        </div>
        <div class="admin-section-grid">
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
        kicker: "",
        subtitle: "Рабочий инструмент для команды: компактный список сотрудников, привязка к заказам и график смен.",
        heroActions: `<div class="admin-dialog-launcher admin-dialog-launcher-inline">
          <button class="admin-button" type="button" data-admin-dialog-open="admin-staff-create-dialog">Добавить сотрудника</button>
          ${renderCreateStaffDialog({ autoOpen: shouldAutoOpenCreateDialog })}
        </div>`,
        sidebar: renderAdminAppSidebar(ADMIN_STAFF_PATH),
        bodyScripts: renderStaffAddressAutocompleteScript(),
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

  function getQuoteOpsStatusMeta(status) {
    if (status === "success") {
      return {
        label: "Успешно",
        tone: "success",
        kicker: "CRM OK",
        title: "Успешно отправленные заявки",
        copy: "Эти заявки дошли до CRM без ошибок и warning-статусов.",
      };
    }
    if (status === "warning") {
      return {
        label: "Проверить",
        tone: "default",
        kicker: "Нужна проверка",
        title: "Есть warning-статусы",
        copy: "CRM приняла заявку, но часть полей или действий требует ручной проверки.",
      };
    }
    return {
      label: "Ошибка",
      tone: "danger",
      kicker: "Сбой синхронизации",
      title: "Нужна ручная проверка",
      copy: "Эти заявки не дошли до CRM с первого раза и должны быть в приоритете.",
    };
  }

  function formatQuoteOpsEntryCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} заявка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} заявки`;
    return `${normalized} заявок`;
  }

  function renderQuoteOpsOverviewStrip(metrics) {
    const items = [
      {
        label: "Заявки",
        value: metrics.totalEntries,
        copy: "Весь поток заявок с сайта.",
        tone: "accent",
      },
      {
        label: "Успешно",
        value: metrics.successCount,
        copy: "Без ошибок и warning-статусов.",
        tone: "success",
      },
      {
        label: "Внимание",
        value: metrics.attentionCount,
        copy: "Ошибка CRM или warning после отправки.",
        tone: metrics.attentionCount > 0 ? "danger" : "default",
      },
      {
        label: "За 24 часа",
        value: metrics.recentCount,
        copy: "Новая входящая нагрузка за последние сутки.",
        tone: "default",
      },
    ];

    return `<div class="admin-compact-summary-strip admin-quote-ops-summary-strip">
      ${items.map((item) => `
        <article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
          <div class="admin-compact-summary-head">
            <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
            <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
          </div>
          <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
        </article>
      `).join("")}
    </div>`;
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

  function renderQuoteOpsInfoItem(label, value, options = {}) {
    return `<article class="admin-quote-entry-info${options.wide ? " admin-quote-entry-info-wide" : ""}">
      <span class="admin-quote-entry-info-label">${escapeHtml(label)}</span>
      <p class="admin-quote-entry-info-value">${value}</p>
    </article>`;
  }

  function renderQuoteOpsCrmItem(label, value) {
    return `<article class="admin-quote-entry-crm-item">
      <span class="admin-quote-entry-crm-label">${escapeHtml(label)}</span>
      <p class="admin-quote-entry-crm-value">${escapeHtml(value || "—")}</p>
    </article>`;
  }

  function getQuoteOpsDialogId(entryId) {
    const normalized = normalizeString(entryId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-quote-entry-detail-dialog-${safeSuffix || "record"}`;
  }

  function renderQuoteOpsEntryCard(entry, returnTo) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const scheduleLabel = [entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Не указана";
    const contactMarkup = [
      entry.customerPhone ? `<span>${escapeHtml(formatAdminPhoneNumber(entry.customerPhone) || entry.customerPhone)}</span>` : `<span>Телефон не указан</span>`,
      entry.customerEmail ? `<span>${escapeHtml(entry.customerEmail)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-quote-entry-feedback admin-quote-entry-feedback-warning">
          <strong>Нужно проверить</strong>
          <span>${escapeHtml(entry.warnings.join(" • "))}</span>
        </div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-quote-entry-feedback admin-quote-entry-feedback-error">
          <strong>Ошибка CRM</strong>
          <span>${escapeHtml(entry.errorMessage)}</span>
        </div>`
      : "";
    const stateBadges = [
      renderQuoteOpsStatusBadge(entry.status),
      entry.retryCount > 0 ? renderAdminBadge(`Retry ${entry.retryCount}`, "outline") : "",
      entry.contactId
        ? renderAdminBadge(entry.usedExistingContact ? "Контакт найден" : "Контакт создан", entry.usedExistingContact ? "outline" : "success")
        : "",
      entry.noteCreated ? renderAdminBadge("Заметка создана", "outline") : "",
      entry.opportunityCreated ? renderAdminBadge("Сделка создана", "outline") : "",
      entry.retryable ? renderAdminBadge("Можно повторить", entry.status === "error" ? "danger" : "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const retrySummary = entry.retryCount > 0
      ? `Последний retry: ${formatAdminDateTime(entry.lastRetryAt)}${entry.lastRetryMessage ? ` • ${entry.lastRetryMessage}` : ""}`
      : "Повторов ещё не было. Используйте retry только если нужно заново синхронизировать заявку с CRM.";

    return `<article class="admin-quote-entry admin-quote-entry-${escapeHtmlAttribute(entry.status || "error")}">
      <div class="admin-quote-entry-head">
        <div class="admin-quote-entry-main">
          <div class="admin-quote-entry-topline">
            <span>${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
            <span class="admin-quote-entry-separator"></span>
            <span>${escapeHtml(entry.requestId || "Номер не указан")}</span>
          </div>
          <h3 class="admin-quote-entry-title">
            <button
              class="admin-quote-entry-title-button"
              type="button"
              data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
            >${escapeHtml(entry.customerName || "Клиент")}</button>
          </h3>
          <p class="admin-quote-entry-copy">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</p>
        </div>
        <div class="admin-quote-entry-side">
          <span class="admin-quote-entry-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
          <div class="admin-quote-entry-badges">
            ${stateBadges}
          </div>
        </div>
      </div>
      <div class="admin-quote-entry-crm-grid">
        ${renderQuoteOpsCrmItem("CRM код", entry.code || "—")}
        ${renderQuoteOpsCrmItem("HTTP", entry.httpStatus ? String(entry.httpStatus) : "—")}
        ${renderQuoteOpsCrmItem("Контакт ID", entry.contactId || "—")}
        ${renderQuoteOpsCrmItem("Источник", entry.source || "site")}
      </div>
      <div class="admin-quote-entry-info-grid">
        ${renderQuoteOpsInfoItem("Дата уборки", escapeHtml(scheduleLabel))}
        ${renderQuoteOpsInfoItem("Контакты", contactMarkup)}
        ${renderQuoteOpsInfoItem("Адрес", escapeHtml(entry.fullAddress || "Не указан"), { wide: true })}
      </div>
      ${warningBlock}
      ${errorBlock}
      <div class="admin-quote-entry-footer">
        <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
          <button class="admin-button${entry.status === "success" ? " admin-button-secondary" : ""}" type="submit">Повторить отправку</button>
        </form>
        <span class="admin-action-hint">${escapeHtml(retrySummary)}</span>
      </div>
    </article>`;
  }

  function renderQuoteOpsSuccessTable(entries, returnTo) {
    return `<div class="admin-table-wrap admin-quote-table-wrap">
      <table class="admin-table admin-quote-success-table">
        <colgroup>
          <col style="width:18%">
          <col style="width:21%">
          <col style="width:15%">
          <col style="width:14%">
          <col style="width:17%">
          <col style="width:8%">
          <col style="width:7%">
        </colgroup>
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Адрес</th>
            <th>Услуга</th>
            <th>Уборка</th>
            <th>CRM</th>
            <th>Сумма</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => {
            const dialogId = getQuoteOpsDialogId(entry.id);
            const scheduleLabel = [entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Не указана";
            const clientContactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "", entry.customerEmail || ""].filter(Boolean).join(" • ") || "Контакты не указаны";
            const crmDetails = [entry.requestId || "Номер не указан", entry.contactId ? `Контакт: ${entry.contactId}` : ""]
              .filter(Boolean)
              .join(" • ");

            return `<tr>
              <td>
                <div class="admin-table-cell-stack">
                  <button
                    class="admin-table-link admin-table-link-button"
                    type="button"
                    data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                  >${escapeHtml(entry.customerName || "Клиент")}</button>
                  <span class="admin-table-muted">${escapeHtml(clientContactLabel)}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-line-clamp-two">${escapeHtml(entry.fullAddress || "Не указан")}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(entry.serviceName || entry.serviceType))}</span>
                  <span class="admin-table-muted">${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(scheduleLabel)}</span>
                  <span>${renderQuoteOpsStatusBadge(entry.status)}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(entry.code || "OK")}</span>
                  <span class="admin-table-muted">${escapeHtml(crmDetails)}</span>
                </div>
              </td>
              <td class="admin-table-number">
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
                  <span class="admin-table-muted">${escapeHtml(entry.retryCount > 0 ? `Retry ${entry.retryCount}` : "Без retry")}</span>
                </div>
              </td>
              <td class="admin-quote-table-action">
                <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button class="admin-button admin-button-secondary admin-table-action-button" type="submit">Retry</button>
                </form>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderQuoteOpsDetailDialog(entry, returnTo) {
    const dialogId = getQuoteOpsDialogId(entry.id);
    const scheduleLabel = [entry.selectedDate, entry.selectedTime].filter(Boolean).join(" в ") || "Не указана";
    const createdLabel = formatAdminDateTime(entry.createdAt);
    const contactLabel = [formatAdminPhoneNumber(entry.customerPhone) || "Телефон не указан", entry.customerEmail || ""]
      .filter(Boolean)
      .join(" • ");
    const crmLabel = normalizeString(entry.status, 32) || "pending";
    const quoteData = getOrderQuoteData({ entry });
    const selectedServices = getOrderQuoteSelectedServices(quoteData);
    const quoteAddressLabel = formatOrderQuoteText(quoteData.address, "Не указан", 500);
    const quoteFullAddressLabel = formatOrderQuoteText(quoteData.fullAddress || entry.fullAddress, "Не указан", 500);
    const warningBlock = entry.warnings.length > 0
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(entry.warnings.join(" • "))}</div>`
      : "";
    const errorBlock = entry.errorMessage
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(entry.errorMessage)}</div>`
      : "";
    const quoteCards = [
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Параметры уборки</h4>
        </div>
        <div class="admin-order-quote-fields admin-order-quote-fields-primary">
          ${renderOrderQuoteField("Тип уборки", formatOrderQuoteServiceType(quoteData.serviceType, formatAdminServiceLabel(entry.serviceName || entry.serviceType)))}
          ${renderOrderQuoteField("Повторяемость", formatOrderQuoteFrequency(quoteData.frequency, "Not set"))}
          ${renderOrderQuoteField("Дата", formatOrderQuoteText(quoteData.selectedDate || entry.selectedDate, "Не указана", 32))}
          ${renderOrderQuoteField("Время", formatOrderQuoteText(quoteData.selectedTime || entry.selectedTime, "Не указано", 32))}
          ${renderOrderQuoteField("Запрошенный слот", formatOrderQuoteText(quoteData.formattedDateTime, "Не указано", 120))}
          ${renderOrderQuoteField(
            "Сумма из quote",
            formatCurrencyAmount(
              quoteData.totalPrice === 0 || quoteData.totalPrice
                ? quoteData.totalPrice
                : entry.totalPrice
            )
          )}
          ${renderOrderQuoteField("Согласие", formatOrderQuoteBoolean(quoteData.consent))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Дом и условия</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Спальни", formatOrderQuoteText(quoteData.rooms, "Не указано", 32))}
          ${renderOrderQuoteField("Санузлы", formatOrderQuoteText(quoteData.bathrooms, "Не указано", 32))}
          ${renderOrderQuoteField("Размер дома", formatOrderQuoteSquareFootage(quoteData.squareMeters))}
          ${renderOrderQuoteField("Питомцы", formatOrderQuoteBoolean(quoteData.hasPets))}
          ${renderOrderQuoteField("Basement cleaning", formatOrderQuoteBoolean(quoteData.basementCleaning))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Дополнительные услуги</h4>
        </div>
        <div class="admin-order-quote-fields admin-order-quote-fields-services">
          ${renderOrderQuoteField("Выбранные add-ons", selectedServices.length > 0 ? selectedServices.join(", ") : "Не выбраны", { wide: true })}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.interiorWindowsCleaning, getOrderQuoteQuantityValue(quoteData, "interiorWindowsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.blindsCleaning, getOrderQuoteQuantityValue(quoteData, "blindsCleaning"))}
          ${renderOrderQuoteField(ORDER_QUOTE_QUANTITY_LABELS.bedLinenChange, getOrderQuoteQuantityValue(quoteData, "bedLinenChange"))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Адрес из формы</h4>
        </div>
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField("Полный адрес", quoteFullAddressLabel, { wide: true })}
          ${renderOrderQuoteField("Короткий адрес", quoteAddressLabel)}
          ${renderOrderQuoteField("Apt / suite", formatOrderQuoteText(quoteData.addressLine2, "Не указано", 200))}
          ${renderOrderQuoteField("Город", formatOrderQuoteText(quoteData.city, "Не указано", 120))}
          ${renderOrderQuoteField("Штат", formatOrderQuoteText(quoteData.state, "Не указано", 32))}
          ${renderOrderQuoteField("ZIP", formatOrderQuoteText(quoteData.zipCode, "Не указано", 32))}
        </div>
      </article>`,
      `<article class="admin-order-quote-card admin-order-quote-card-wide">
        <div class="admin-subsection-head">
          <h4 class="admin-subsection-title">Комментарий клиента</h4>
        </div>
        <p class="admin-order-quote-note">${formatOrderQuoteMultiline(quoteData.additionalDetails)}</p>
      </article>`,
    ].join("");

    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Заявка</p>
            <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(entry.customerName || "Карточка заявки")}</h2>
            <p class="admin-dialog-copy">Полная заявка клиента: контакты, CRM-статус и все поля из формы.</p>
          </div>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${escapeHtmlAttribute(dialogId)}">Закрыть</button>
        </div>
        <div class="admin-inline-badge-row">
          ${renderQuoteOpsStatusBadge(entry.status)}
          ${renderAdminBadge(formatAdminServiceLabel(entry.serviceName || entry.serviceType), "outline")}
          ${entry.retryCount > 0 ? renderAdminBadge(`Retry ${entry.retryCount}`, "outline") : ""}
          ${entry.requestId ? renderAdminBadge(entry.requestId, "outline") : ""}
        </div>
        ${warningBlock}
        ${errorBlock}
        <div class="admin-client-metric-grid">
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Сумма</span>
            <p class="admin-client-metric-value">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Дата и время</span>
            <p class="admin-client-metric-value">${escapeHtml(scheduleLabel)}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">Создана</span>
            <p class="admin-client-metric-value">${escapeHtml(createdLabel)}</p>
          </article>
          <article class="admin-client-metric-card">
            <span class="admin-client-metric-label">CRM</span>
            <p class="admin-client-metric-value">${escapeHtml(crmLabel)}</p>
          </article>
        </div>
        <div class="admin-client-contact-grid">
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">Контакты</span>
            <p class="admin-client-contact-value">${escapeHtml(contactLabel)}</p>
          </article>
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">CRM код</span>
            <p class="admin-client-contact-value">${escapeHtml(entry.code || "—")}</p>
          </article>
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">HTTP</span>
            <p class="admin-client-contact-value">${escapeHtml(entry.httpStatus ? String(entry.httpStatus) : "—")}</p>
          </article>
          <article class="admin-client-contact-card">
            <span class="admin-client-contact-label">Контакт ID</span>
            <p class="admin-client-contact-value">${escapeHtml(entry.contactId || "—")}</p>
          </article>
          <article class="admin-client-contact-card admin-client-contact-card-wide">
            <span class="admin-client-contact-label">Адрес</span>
            <p class="admin-client-contact-value">${escapeHtml(entry.fullAddress || "Не указан")}</p>
          </article>
        </div>
        <section>
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Поля из формы клиента</h3>
          </div>
          <div class="admin-order-quote-grid">
            ${quoteCards}
          </div>
        </section>
        <div class="admin-dialog-actions-row">
          <div class="admin-inline-actions">
            <form method="post" action="${ADMIN_QUOTE_OPS_RETRY_PATH}">
              <input type="hidden" name="entryId" value="${escapeHtmlAttribute(entry.id)}">
              <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
              <button class="admin-button${entry.status === "success" ? " admin-button-secondary" : ""}" type="submit">Повторить отправку</button>
            </form>
            <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${escapeHtmlAttribute(dialogId)}">Закрыть</button>
          </div>
        </div>
      </div>
    </dialog>`;
  }

  function renderQuoteOpsLane(status, entries, returnTo) {
    const meta = getQuoteOpsStatusMeta(status);
    return `<section class="admin-quote-lane admin-quote-lane-${escapeHtmlAttribute(status)}">
      <div class="admin-quote-lane-head">
        <div>
          <p class="admin-quote-lane-kicker">${escapeHtml(meta.kicker)}</p>
          <h2 class="admin-quote-lane-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-quote-lane-copy">${escapeHtml(meta.copy)}</p>
        </div>
        <div class="admin-quote-lane-meta">
          ${renderQuoteOpsStatusBadge(status)}
          ${renderAdminBadge(formatQuoteOpsEntryCountLabel(entries.length), "outline")}
        </div>
      </div>
      ${status === "success"
        ? renderQuoteOpsSuccessTable(entries, returnTo)
        : `<div class="admin-quote-lane-list">
            ${entries.map((entry) => renderQuoteOpsEntryCard(entry, returnTo)).join("")}
          </div>`}
    </section>`;
  }

  async function renderQuoteOpsPage(req, config, quoteOpsLedger) {
    const { reqUrl, filters } = getQuoteOpsFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const entries = filterQuoteOpsEntries(allEntries, filters);
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
    const hasActiveFilters = Boolean(filters.q || filters.status !== "all" || filters.serviceType !== "all");
    const groupedEntries = ["error", "warning", "success"]
      .map((status) => ({
        status,
        entries: entries.filter((entry) => entry.status === status),
      }))
      .filter((group) => group.entries.length > 0);
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const filtersSummary = hasActiveFilters
      ? "Активные фильтры помогают сузить поток до рабочей выборки."
      : "Сейчас открыт общий поток всех входящих заявок.";

    return renderAdminLayout(
      "Лента заявок",
      `<div class="admin-quote-ops-page">
        ${renderQuoteOpsNotice(req)}
        ${renderQuoteOpsOverviewStrip({
          totalEntries,
          successCount,
          attentionCount,
          recentCount,
        })}
        <section class="admin-orders-filters-panel admin-quote-ops-filter-shell">
          <div class="admin-orders-panel-head">
            <div>
              <p class="admin-orders-panel-kicker">Навигация</p>
              <h2 class="admin-orders-panel-title">Быстро найти нужную заявку</h2>
              <p class="admin-orders-panel-copy">Поиск по имени, телефону, email, request ID и адресу. Клик по имени клиента открывает полную заявку со всеми данными формы.</p>
            </div>
            <span class="admin-action-hint">Показано ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalEntries))} заявок.</span>
          </div>
          <form class="admin-form-grid admin-form-grid-three admin-orders-filter-form admin-quote-ops-filter-form" method="get" action="${ADMIN_QUOTE_OPS_PATH}">
            <label class="admin-label">
              Поиск
              <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Клиент, телефон, email, request ID, адрес">
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
              Тип уборки
              <select class="admin-input" name="serviceType">
                <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                <option value="regular"${filters.serviceType === "regular" ? " selected" : ""}>Регулярная</option>
                <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Генеральная</option>
                <option value="moving"${filters.serviceType === "moving" ? " selected" : ""}>Перед переездом</option>
              </select>
            </label>
            <div class="admin-inline-actions admin-form-actions">
              <button class="admin-button" type="submit">Применить</button>
              <a class="admin-link-button admin-button-secondary" href="${ADMIN_QUOTE_OPS_PATH}">Сбросить</a>
              <span class="admin-action-hint">${escapeHtml(filtersSummary)}</span>
            </div>
          </form>
        </section>
        ${groupedEntries.length > 0
          ? `<div class="admin-quote-lanes">
              ${groupedEntries.map((group) => renderQuoteOpsLane(group.status, group.entries, currentReturnTo)).join("")}
            </div>`
          : `<div class="admin-empty-state">По текущему фильтру заявок нет. Попробуйте сбросить фильтры или изменить поисковый запрос.</div>`}
        ${entries.map((entry) => renderQuoteOpsDetailDialog(entry, currentReturnTo)).join("")}
      </div>`,
      {
        kicker: false,
        subtitle: "Рабочая лента входящих заявок с быстрым поиском и полным просмотром каждой формы.",
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
        kicker: "SHYNLI CLEANING",
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
    if (route === ADMIN_CLIENTS_PATH) return renderClientsPage(req, config, quoteOpsLedger, staffStore);
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
