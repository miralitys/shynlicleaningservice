"use strict";

const { collectPayrollRecords, normalizePayrollStatus } = require("../../payroll");

function createPayrollPageRenderer(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ADMIN_PAYROLL_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    buildAdminRedirectPath,
    collectNonAssignableStaffIds,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    getRequestUrl,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
  } = deps;

  const PAYROLL_PAGE_LEDGER_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 220);

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
      },
    };
  }

  function filterPayrollRows(rows = [], filters = {}) {
    const query = normalizeString(filters.q, 200).toLowerCase();
    const status = normalizeString(filters.status, 40).toLowerCase();
    const staffId = normalizeString(filters.staffId, 120);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (status && status !== "all" && normalizePayrollStatus(row && row.status) !== status) return false;
      if (staffId && normalizeString(row && row.staffId, 120) !== staffId) return false;
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

  function renderPayrollRowsTable(rows = [], returnTo, canEdit) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<div class="admin-empty-state">По текущему фильтру начислений нет.</div>`;
    }

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
              const orderHref = `${ADMIN_ORDERS_PATH}?order=${encodeURIComponent(row.entryId)}`;
              const scheduleLabel = [row.selectedDate, row.selectedTime].filter(Boolean).join(" • ") || "Без даты";
              const paidLabel =
                row.paidAt && typeof formatAdminDateTime === "function"
                  ? formatAdminDateTime(row.paidAt)
                  : row.paidAt || "—";
              return `<tr>
                <td>
                  <strong>${escapeHtml(row.staffName || "Сотрудник")}</strong>
                </td>
                <td>
                  <strong>${escapeHtml(row.customerName || "Клиент")}</strong><br>
                  <span class="admin-table-muted">${escapeHtml(formatAdminServiceLabel(row.serviceName || ""))}</span><br>
                  <span class="admin-table-muted">${escapeHtml(scheduleLabel)}</span><br>
                  <a class="admin-link-button" href="${escapeHtmlAttribute(orderHref)}">Открыть заказ</a>
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
    const payrollData = collectPayrollRecords({
      entries: allEntries,
      hiddenStaffIds,
    });
    const filteredRows = filterPayrollRows(payrollData.rows, filters);
    const filteredStaffSummaries = payrollData.staffSummaries.filter((summary) => {
      if (filters.staffId && summary.staffId !== filters.staffId) return false;
      const query = normalizeString(filters.q, 200).toLowerCase();
      if (!query) return true;
      return normalizeString(summary.staffName, 160).toLowerCase().includes(query);
    });
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
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const resetHref = buildAdminRedirectPath(ADMIN_PAYROLL_PATH, {
      q: "",
      status: "",
      staffId: "",
    });

    return renderAdminLayout(
      "Зарплаты",
      `<div class="admin-payroll-page">
        ${renderPayrollNotice(req)}
        ${renderPayrollSummaryCards(filteredTotals)}
        ${renderAdminCard(
          "Фильтр выплат",
          "Смотрите, что нужно выплатить и что уже закрыто по всей команде, на которую распределяются заказы.",
          `<form class="admin-orders-filter-bar" method="get" action="${ADMIN_PAYROLL_PATH}">
            <label class="admin-label">
              Поиск
              <input class="admin-input" type="search" name="q" value="${escapeHtmlText(filters.q)}" placeholder="Сотрудник, клиент, адрес или номер">
            </label>
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
            <div class="admin-clients-filter-actions">
              <button class="admin-button" type="submit">Применить</button>
              <a class="admin-link-button admin-button-secondary" href="${escapeHtmlAttribute(resetHref)}">Сбросить</a>
            </div>
          </form>`,
          { muted: true, eyebrow: "Фильтры" }
        )}
        ${renderAdminCard(
          "Сводка по сотрудникам",
          "Сразу видно, кому сколько должны и сколько уже выплачено.",
          renderPayrollStaffSummaryTable(filteredStaffSummaries),
          { eyebrow: "Сводка" }
        )}
        ${renderAdminCard(
          "История выплат",
          "Каждая строка привязана к конкретному заказу и фиксирует сумму на момент завершения уборки.",
          renderPayrollRowsTable(filteredRows, currentReturnTo, accessContext.canEdit),
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
