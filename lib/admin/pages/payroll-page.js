"use strict";

const { collectPayrollRecords, normalizePayrollStatus } = require("../../payroll");

function createPayrollPageRenderer(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ADMIN_PAYROLL_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectAdminOrderRecords,
    collectNonAssignableStaffIds,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    getRequestUrl,
    getWorkspaceAccessContext,
    getOrderDialogId,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderOrderManagementDialog,
  } = deps;

  const PAYROLL_PAGE_LEDGER_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 220);

  function normalizeFilterDateValue(value) {
    const normalized = normalizeString(value, 40);
    if (!normalized) return "";

    const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
    }

    const parsedDate = new Date(normalized);
    if (Number.isNaN(parsedDate.getTime())) return "";
    return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(
      parsedDate.getDate()
    ).padStart(2, "0")}`;
  }

  function formatFilterDateLabel(value) {
    const normalized = normalizeFilterDateValue(value);
    if (!normalized) return "";
    const [year, month, day] = normalized.split("-");
    return `${month}/${day}/${year}`;
  }

  function getPayrollRowFilterDate(row = {}) {
    const normalizedStatus = normalizePayrollStatus(row && row.status);
    if (normalizedStatus === "paid") {
      return (
        normalizeFilterDateValue(row && row.paidAt) ||
        normalizeFilterDateValue(row && row.selectedDate) ||
        normalizeFilterDateValue(row && row.createdAt)
      );
    }
    return normalizeFilterDateValue(row && row.selectedDate) || normalizeFilterDateValue(row && row.createdAt);
  }

  function renderHiddenFilterInput(name, value) {
    const normalized = normalizeString(value, 120);
    return normalized
      ? `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(normalized)}">`
      : "";
  }

  function getPayrollFilters(req) {
    const reqUrl = getRequestUrl(req);
    const rawStatus = normalizePayrollStatus(reqUrl.searchParams.get("status"));
    return {
      reqUrl,
      filters: {
        q: normalizeString(reqUrl.searchParams.get("q"), 200),
        status:
          normalizeString(reqUrl.searchParams.get("status"), 40).toLowerCase() === "all"
            ? "all"
            : rawStatus,
        staffId: normalizeString(reqUrl.searchParams.get("staffId"), 120),
        dateFrom: normalizeFilterDateValue(reqUrl.searchParams.get("dateFrom")),
        dateTo: normalizeFilterDateValue(reqUrl.searchParams.get("dateTo")),
      },
    };
  }

  function filterPayrollRows(rows = [], filters = {}) {
    const query = normalizeString(filters.q, 200).toLowerCase();
    const status = normalizeString(filters.status, 40).toLowerCase();
    const staffId = normalizeString(filters.staffId, 120);
    const dateFrom = normalizeFilterDateValue(filters.dateFrom);
    const dateTo = normalizeFilterDateValue(filters.dateTo);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (status && status !== "all" && normalizePayrollStatus(row && row.status) !== status) return false;
      if (staffId && normalizeString(row && row.staffId, 120) !== staffId) return false;
      const rowDate = getPayrollRowFilterDate(row);
      if (dateFrom && (!rowDate || rowDate < dateFrom)) return false;
      if (dateTo && (!rowDate || rowDate > dateTo)) return false;
      if (!query) return true;
      return [
        row.staffName,
        row.customerName,
        row.fullAddress,
        row.requestId,
        row.serviceName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  function buildPayrollStaffSummaries(rows = []) {
    const summaryByStaff = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
      const staffId = normalizeString(row && row.staffId, 120);
      const summary = summaryByStaff.get(staffId) || {
        staffId,
        staffName: normalizeString(row && row.staffName, 160) || "Сотрудник",
        owedCents: 0,
        paidCents: 0,
        totalCents: 0,
        rowsCount: 0,
      };
      summary.rowsCount += 1;
      summary.totalCents += Math.max(0, Number(row && row.amountCents) || 0);
      if (normalizePayrollStatus(row && row.status) === "paid") {
        summary.paidCents += Math.max(0, Number(row && row.amountCents) || 0);
      } else {
        summary.owedCents += Math.max(0, Number(row && row.amountCents) || 0);
      }
      summaryByStaff.set(staffId, summary);
    }

    return Array.from(summaryByStaff.values()).sort((left, right) => {
      if (right.totalCents !== left.totalCents) return right.totalCents - left.totalCents;
      return normalizeString(left.staffName, 160).localeCompare(normalizeString(right.staffName, 160), "ru");
    });
  }

  function getAdvancedFilterCount(filters = {}) {
    let count = 0;
    if (normalizeString(filters.status, 40).toLowerCase() && normalizeString(filters.status, 40).toLowerCase() !== "all") {
      count += 1;
    }
    if (normalizeString(filters.staffId, 120)) count += 1;
    if (normalizeFilterDateValue(filters.dateFrom)) count += 1;
    if (normalizeFilterDateValue(filters.dateTo)) count += 1;
    return count;
  }

  function buildPayrollFilterBadges(filters = {}, staffLabel = "") {
    const badges = [];
    if (normalizeString(filters.q, 200)) {
      badges.push(renderAdminBadge(`Поиск: ${normalizeString(filters.q, 200)}`, "outline"));
    }
    if (normalizeString(filters.status, 40).toLowerCase() === "paid") {
      badges.push(renderAdminBadge("Статус: Выплачено", "outline"));
    } else if (normalizeString(filters.status, 40).toLowerCase() === "owed") {
      badges.push(renderAdminBadge("Статус: К выплате", "outline"));
    }
    if (staffLabel) {
      badges.push(renderAdminBadge(`Сотрудник: ${staffLabel}`, "outline"));
    }
    if (normalizeFilterDateValue(filters.dateFrom)) {
      badges.push(renderAdminBadge(`С: ${formatFilterDateLabel(filters.dateFrom)}`, "outline"));
    }
    if (normalizeFilterDateValue(filters.dateTo)) {
      badges.push(renderAdminBadge(`По: ${formatFilterDateLabel(filters.dateTo)}`, "outline"));
    }
    return badges.join("");
  }

  function renderPayrollStatusBadge(status) {
    const normalized = normalizePayrollStatus(status);
    if (normalized === "paid") return renderAdminBadge("Выплачено", "success");
    return renderAdminBadge("К выплате", "outline");
  }

  function renderPayrollNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "payroll-paid") {
      return `<div class="admin-alert admin-alert-success">Строка зарплаты отмечена как выплаченная.</div>`;
    }
    if (notice === "payroll-owed") {
      return `<div class="admin-alert admin-alert-info">Строка зарплаты возвращена в список к выплате.</div>`;
    }
    if (notice === "payroll-missing") {
      return `<div class="admin-alert admin-alert-error">Не удалось найти строку зарплаты или сам заказ.</div>`;
    }
    return "";
  }

  function renderPayrollCompensationLabel(row) {
    const compensationValue = normalizeString(row && row.compensationValue, 32);
    if (!compensationValue) return "Не указана";
    if (normalizeString(row && row.compensationType, 32).toLowerCase() === "percent") {
      return `${escapeHtml(compensationValue)}%`;
    }
    return `Фикс: ${escapeHtml(formatCurrencyAmount(Number(compensationValue) || 0))}`;
  }

  function renderPayrollSummaryCards(totals = {}) {
    const summaryItems = [
      {
        label: "К выплате",
        value: formatCurrencyAmount((Number(totals.owedCents) || 0) / 100),
        copy: `${escapeHtml(String(Number(totals.owedCount) || 0))} строк ещё не закрыты.`,
      },
      {
        label: "Уже выплачено",
        value: formatCurrencyAmount((Number(totals.paidCents) || 0) / 100),
        copy: `${escapeHtml(String(Number(totals.paidCount) || 0))} строк отмечены как выплаченные.`,
      },
      {
        label: "В команде",
        value: escapeHtml(String(Number(totals.staffCount) || 0)),
        copy: "Люди из команды, попавшие в payroll по завершённым заказам.",
      },
      {
        label: "Всего начислено",
        value: formatCurrencyAmount((Number(totals.totalCents) || 0) / 100),
        copy: `${escapeHtml(String(Number(totals.rowsCount) || 0))} выплатных строк в истории.`,
      },
    ];

    return `<div class="admin-overview-strip">
      ${summaryItems
        .map(
          (item) => `<article class="admin-overview-card">
            <p class="admin-overview-label">${escapeHtml(item.label)}</p>
            <strong class="admin-overview-value">${item.value}</strong>
            <p class="admin-overview-copy">${item.copy}</p>
          </article>`
        )
        .join("")}
    </div>`;
  }

  function renderPayrollStaffSummaryTable(staffSummaries = []) {
    if (!Array.isArray(staffSummaries) || staffSummaries.length === 0) {
      return `<div class="admin-empty-state">Пока нет участников команды с начислениями.</div>`;
    }

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>К выплате</th>
            <th>Выплачено</th>
            <th>Всего</th>
            <th>Строк</th>
          </tr>
        </thead>
        <tbody>
          ${staffSummaries
            .map(
              (summary) => `<tr>
                <td><strong>${escapeHtml(summary.staffName || "Сотрудник")}</strong></td>
                <td>${escapeHtml(formatCurrencyAmount((Number(summary.owedCents) || 0) / 100))}</td>
                <td>${escapeHtml(formatCurrencyAmount((Number(summary.paidCents) || 0) / 100))}</td>
                <td>${escapeHtml(formatCurrencyAmount((Number(summary.totalCents) || 0) / 100))}</td>
                <td>${escapeHtml(String(Number(summary.rowsCount) || 0))}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderPayrollActionCell(row, returnTo, canEdit) {
    if (!canEdit) return "—";
    const nextAction = normalizePayrollStatus(row && row.status) === "paid" ? "mark-payroll-owed" : "mark-payroll-paid";
    const nextLabel = nextAction === "mark-payroll-paid" ? "Отметить выплачено" : "Вернуть в долг";
    const buttonClass =
      nextAction === "mark-payroll-paid"
        ? "admin-button admin-button-secondary"
        : "admin-link-button admin-button-secondary";
    return `<form method="post" action="${ADMIN_PAYROLL_PATH}">
      <input type="hidden" name="action" value="${escapeHtmlAttribute(nextAction)}">
      <input type="hidden" name="entryId" value="${escapeHtmlAttribute(row.entryId)}">
      <input type="hidden" name="staffId" value="${escapeHtmlAttribute(row.staffId)}">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
      <button class="${buttonClass}" type="submit">${escapeHtml(nextLabel)}</button>
    </form>`;
  }

  function renderPayrollRowsTable(rows = [], returnTo, canEdit, options = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<div class="admin-empty-state">По текущему фильтру начислений нет.</div>`;
    }

    const orderRecordsById = options.orderRecordsById instanceof Map ? options.orderRecordsById : new Map();
    const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const dialogOrderIds = new Set();

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Заказ</th>
            <th>Модель</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>Выплачено</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const order = orderRecordsById.get(row.entryId) || null;
              const dialogId =
                order && typeof options.getOrderDialogId === "function" ? options.getOrderDialogId(order.id) : "";
              if (order && dialogId) {
                dialogOrderIds.add(order.id);
              }
              const scheduleLabel = [row.selectedDate, row.selectedTime].filter(Boolean).join(" • ") || "Без даты";
              const paidLabel =
                row.paidAt && typeof formatAdminDateTime === "function"
                  ? formatAdminDateTime(row.paidAt)
                  : row.paidAt || "—";
              const rowOpenAttributes = dialogId
                ? ` class="admin-table-row-clickable" tabindex="0" data-admin-dialog-row="true" data-admin-dialog-open="${escapeHtmlAttribute(
                    dialogId
                  )}" aria-label="${escapeHtmlAttribute(`Открыть карточку заказа ${row.customerName || "Клиент"}`)}"`
                : "";
              return `<tr${rowOpenAttributes}>
                <td>
                  <strong>${escapeHtml(row.staffName || "Сотрудник")}</strong>
                </td>
                <td>
                  <strong>${escapeHtml(row.customerName || "Клиент")}</strong><br>
                  <span class="admin-table-muted">${escapeHtml(formatAdminServiceLabel(row.serviceName || ""))}</span><br>
                  <span class="admin-table-muted">${escapeHtml(scheduleLabel)}</span>
                </td>
                <td>${renderPayrollCompensationLabel(row)}</td>
                <td><strong>${escapeHtml(formatCurrencyAmount((Number(row.amountCents) || 0) / 100))}</strong></td>
                <td>${renderPayrollStatusBadge(row.status)}</td>
                <td>${escapeHtml(paidLabel)}</td>
                <td>${renderPayrollActionCell(row, returnTo, canEdit)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      ${typeof renderOrderManagementDialog === "function"
        ? Array.from(dialogOrderIds)
            .map((orderId) => {
              const order = orderRecordsById.get(orderId);
              if (!order) return "";
              return renderOrderManagementDialog(order, returnTo, {
                req: options.req,
                planningItem: planningByEntryId.get(order.id) || null,
                staffRecords,
                canDelete: options.canDelete,
                canEdit,
                leadConnectorConfigured: options.leadConnectorConfigured,
              });
            })
            .join("")
        : ""}
    </div>`;
  }

  async function renderPayrollPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    void config;
    const { reqUrl, filters } = getPayrollFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: PAYROLL_PAGE_LEDGER_LIMIT }) : [];
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    const [staffSnapshot, usersSnapshot] = await Promise.all([
      staffStore ? staffStore.getSnapshot() : Promise.resolve({ staff: [], assignments: [] }),
      usersStore ? usersStore.getSnapshot() : Promise.resolve({ users: [] }),
    ]);
    const hiddenStaffIds = collectNonAssignableStaffIds(usersSnapshot && usersSnapshot.users);
    const staffRecords = Array.isArray(staffSnapshot && staffSnapshot.staff)
      ? staffSnapshot.staff.filter((record) => !hiddenStaffIds.has(normalizeString(record && record.id, 120)))
      : [];
    const planningContext =
      typeof buildStaffPlanningContext === "function"
        ? buildStaffPlanningContext(allEntries, { ...staffSnapshot, staff: staffRecords })
        : {};
    const planningByEntryId =
      planningContext && planningContext.orderItemsByEntryId instanceof Map
        ? planningContext.orderItemsByEntryId
        : new Map();
    const orderRecords =
      typeof collectAdminOrderRecords === "function" ? collectAdminOrderRecords(allEntries) : [];
    const orderRecordsById = new Map(orderRecords.map((order) => [order.id, order]));
    const payrollData = collectPayrollRecords({
      entries: allEntries,
      hiddenStaffIds,
    });
    const filteredRows = filterPayrollRows(payrollData.rows, filters);
    const filteredStaffSummaries = buildPayrollStaffSummaries(filteredRows);
    const filteredTotals = filteredRows.reduce(
      (accumulator, row) => {
        accumulator.rowsCount += 1;
        if (normalizePayrollStatus(row.status) === "paid") {
          accumulator.paidCents += row.amountCents;
          accumulator.paidCount += 1;
        } else {
          accumulator.owedCents += row.amountCents;
          accumulator.owedCount += 1;
        }
        return accumulator;
      },
      {
        owedCents: 0,
        paidCents: 0,
        totalCents: 0,
        rowsCount: 0,
        staffCount: filteredStaffSummaries.length,
        owedCount: 0,
        paidCount: 0,
      }
    );
    filteredTotals.totalCents = filteredTotals.owedCents + filteredTotals.paidCents;

    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const staffOptions = [
      { value: "", label: "Все сотрудники" },
      ...payrollData.staffSummaries.map((summary) => ({
        value: summary.staffId,
        label: summary.staffName,
      })),
    ];
    const staffLabel =
      staffOptions.find((option) => option.value === filters.staffId)?.label || "";
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const resetHref = buildAdminRedirectPath(ADMIN_PAYROLL_PATH, {
      q: "",
      status: "",
      staffId: "",
      dateFrom: "",
      dateTo: "",
    });
    const advancedFilterCount = getAdvancedFilterCount(filters);
    const hasActiveFilters = Boolean(normalizeString(filters.q, 200) || advancedFilterCount);
    const filterBadges = buildPayrollFilterBadges(filters, staffLabel);
    const filteredCount = filteredRows.length;
    const totalRows = payrollData.rows.length;

    return renderAdminLayout(
      "Зарплаты",
      `<div class="admin-payroll-page">
        ${renderPayrollNotice(req)}
        ${renderPayrollSummaryCards(filteredTotals)}
        ${renderAdminCard(
          "Сводка по сотрудникам",
          "Сразу видно, кому сколько должны и сколько уже выплачено.",
          renderPayrollStaffSummaryTable(filteredStaffSummaries),
          { eyebrow: "Сводка" }
        )}
        ${renderAdminCard(
          "Фильтр выплат",
          "Смотрите, что нужно выплатить и что уже закрыто по всей команде, на которую распределяются заказы.",
          `<div class="admin-orders-toolbar-shell" id="admin-payroll-workspace" style="grid-template-columns:auto minmax(0, 1fr);">
            <details class="admin-filter-disclosure admin-orders-filter-toggle">
              <summary class="admin-clients-toolbar-button">
                <span>Фильтры</span>
                ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
              </summary>
            </details>
            <div class="admin-orders-toolbar-actions" style="grid-template-columns:minmax(560px, 1fr) auto;">
              <form
                class="admin-clients-search-form"
                style="max-width:none; width:100%;"
                method="get"
                action="${ADMIN_PAYROLL_PATH}"
                data-admin-auto-submit="true"
                data-admin-auto-submit-delay="600"
                data-admin-auto-submit-min-length="2"
                data-admin-auto-submit-restore-focus="true"
                data-admin-auto-submit-scroll-target="#admin-payroll-workspace"
                data-admin-auto-submit-scroll-offset="18"
              >
                ${renderHiddenFilterInput("status", filters.status !== "all" ? filters.status : "")}
                ${renderHiddenFilterInput("staffId", filters.staffId)}
                ${renderHiddenFilterInput("dateFrom", filters.dateFrom)}
                ${renderHiddenFilterInput("dateTo", filters.dateTo)}
                <label class="admin-clients-search-box">
                  <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
                  <input
                    class="admin-input admin-clients-search-input"
                    type="search"
                    name="q"
                    value="${escapeHtmlText(filters.q)}"
                    placeholder="Сотрудник, клиент, адрес или номер заказа"
                  >
                </label>
                <button class="admin-sr-only" type="submit">Обновить поиск</button>
                ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${escapeHtmlAttribute(resetHref)}">Очистить</a>` : ""}
              </form>
            </div>
            <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
              <form class="admin-orders-filter-bar" method="get" action="${ADMIN_PAYROLL_PATH}">
                ${renderHiddenFilterInput("q", filters.q)}
                <label class="admin-label">
                  Статус
                  <select class="admin-input" name="status">
                    <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                    <option value="owed"${filters.status === "owed" ? " selected" : ""}>К выплате</option>
                    <option value="paid"${filters.status === "paid" ? " selected" : ""}>Выплачено</option>
                  </select>
                </label>
                <label class="admin-label">
                  Сотрудник
                  <select class="admin-input" name="staffId">
                    ${staffOptions
                      .map(
                        (option) =>
                          `<option value="${escapeHtmlAttribute(option.value)}"${option.value === filters.staffId ? " selected" : ""}>${escapeHtml(option.label)}</option>`
                      )
                      .join("")}
                  </select>
                </label>
                <label class="admin-label">
                  С даты
                  <input class="admin-input" type="date" name="dateFrom" value="${escapeHtmlAttribute(filters.dateFrom)}">
                </label>
                <label class="admin-label">
                  По дату
                  <input class="admin-input" type="date" name="dateTo" value="${escapeHtmlAttribute(filters.dateTo)}">
                </label>
                <div class="admin-clients-filter-actions">
                  <button class="admin-button" type="submit">Применить</button>
                  <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(resetHref)}">Сбросить фильтры</a>
                </div>
              </form>
            </div>
            ${hasActiveFilters
              ? `<div class="admin-clients-meta-row">
                  <div class="admin-clients-meta-main">
                    <p class="admin-clients-summary-copy">
                      Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalRows))} выплатных строк.
                      Для выплаченных строк период смотрит на дату выплаты, для остальных — на дату уборки.
                    </p>
                    ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
                  </div>
                </div>`
              : ""}
          </div>`,
          { muted: true, eyebrow: "Фильтры" }
        )}
        ${renderAdminCard(
          "История выплат",
          "Каждая строка привязана к конкретному заказу и фиксирует сумму на момент завершения уборки.",
          renderPayrollRowsTable(filteredRows, currentReturnTo, accessContext.canEdit, {
            req,
            orderRecordsById,
            planningByEntryId,
            staffRecords,
            canDelete: accessContext.canDelete,
            getOrderDialogId,
            leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
          }),
          { eyebrow: "История" }
        )}
      </div>`,
      {
        kicker: false,
        subtitle: "Подраздел команды: начисления по всем людям, на которых распределяются завершённые заказы.",
        sidebar: renderAdminAppSidebar(ADMIN_PAYROLL_PATH, accessContext),
      }
    );
  }

  return renderPayrollPage;
}

module.exports = {
  createPayrollPageRenderer,
};
