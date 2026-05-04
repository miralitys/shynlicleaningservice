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
  const PAYROLL_CLIENT_WEEK_PARAM = "clientWeek";
  const PAYROLL_MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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

  function parsePayrollDateValue(value) {
    const normalized = normalizeFilterDateValue(value);
    if (!normalized) return null;
    const [year, month, day] = normalized.split("-").map((part) => Number.parseInt(part, 10));
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return null;
    }
    return parsedDate;
  }

  function formatPayrollDateValue(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate()
    ).padStart(2, "0")}`;
  }

  function getPayrollTodayDateValue() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
  }

  function addPayrollDays(dateValue, days) {
    const parsedDate = parsePayrollDateValue(dateValue);
    if (!parsedDate) return "";
    const nextDate = new Date(parsedDate.getTime());
    nextDate.setUTCDate(nextDate.getUTCDate() + Number(days || 0));
    return formatPayrollDateValue(nextDate);
  }

  function getPayrollIsoWeekInfo(dateValue) {
    const sourceDate = parsePayrollDateValue(dateValue) || parsePayrollDateValue(getPayrollTodayDateValue());
    const normalizedDate = sourceDate || new Date();
    const dayNumber = normalizedDate.getUTCDay() || 7;
    const monday = new Date(normalizedDate.getTime());
    monday.setUTCDate(normalizedDate.getUTCDate() - dayNumber + 1);

    const thursday = new Date(normalizedDate.getTime());
    thursday.setUTCDate(normalizedDate.getUTCDate() + 4 - dayNumber);
    const year = thursday.getUTCFullYear();

    const firstThursday = new Date(Date.UTC(year, 0, 4));
    const firstThursdayDayNumber = firstThursday.getUTCDay() || 7;
    const firstMonday = new Date(firstThursday.getTime());
    firstMonday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNumber + 1);

    const week = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * PAYROLL_MILLISECONDS_PER_DAY)) + 1;
    const sunday = new Date(monday.getTime());
    sunday.setUTCDate(monday.getUTCDate() + 6);

    return {
      year,
      week,
      key: `${year}-W${String(week).padStart(2, "0")}`,
      startDate: formatPayrollDateValue(monday),
      endDate: formatPayrollDateValue(sunday),
    };
  }

  function getPayrollIsoWeeksInYear(year) {
    const normalizedYear = Number.parseInt(String(year || ""), 10);
    if (!Number.isFinite(normalizedYear) || normalizedYear < 1900 || normalizedYear > 3000) return 52;
    return getPayrollIsoWeekInfo(`${normalizedYear}-12-28`).week;
  }

  function getPayrollIsoWeekInfoFromYearWeek(year, week) {
    const normalizedYear = Number.parseInt(String(year || ""), 10);
    const normalizedWeek = Number.parseInt(String(week || ""), 10);
    const weekCount = getPayrollIsoWeeksInYear(normalizedYear);
    if (
      !Number.isFinite(normalizedYear) ||
      !Number.isFinite(normalizedWeek) ||
      normalizedWeek < 1 ||
      normalizedWeek > weekCount
    ) {
      return getPayrollIsoWeekInfo(getPayrollTodayDateValue());
    }

    const firstThursday = new Date(Date.UTC(normalizedYear, 0, 4));
    const firstThursdayDayNumber = firstThursday.getUTCDay() || 7;
    const firstMonday = new Date(firstThursday.getTime());
    firstMonday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNumber + 1);
    const monday = new Date(firstMonday.getTime() + (normalizedWeek - 1) * 7 * PAYROLL_MILLISECONDS_PER_DAY);
    return getPayrollIsoWeekInfo(formatPayrollDateValue(monday));
  }

  function normalizePayrollWeekKey(value) {
    const normalized = normalizeString(value, 24);
    const weekMatch = normalized.match(/^(\d{4})-W(\d{1,2})$/i);
    if (!weekMatch) return "";
    const year = Number.parseInt(weekMatch[1], 10);
    const week = Number.parseInt(weekMatch[2], 10);
    if (week < 1 || week > getPayrollIsoWeeksInYear(year)) return "";
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  function getPayrollWeekSelection(reqUrl) {
    const requestedWeekKey = normalizePayrollWeekKey(reqUrl.searchParams.get(PAYROLL_CLIENT_WEEK_PARAM));
    if (requestedWeekKey) {
      const [, year, week] = requestedWeekKey.match(/^(\d{4})-W(\d{2})$/) || [];
      return getPayrollIsoWeekInfoFromYearWeek(year, week);
    }
    return getPayrollIsoWeekInfo(getPayrollTodayDateValue());
  }

  function formatPayrollWeekRangeLabel(weekInfo = {}) {
    const startLabel = formatFilterDateLabel(weekInfo.startDate);
    const endLabel = formatFilterDateLabel(weekInfo.endDate);
    return [startLabel, endLabel].filter(Boolean).join(" - ");
  }

  function formatPayrollWeekLabel(weekInfo = {}) {
    const weekNumber = Math.max(1, Number(weekInfo.week) || 1);
    return `${weekNumber}-я неделя - ${formatPayrollWeekRangeLabel(weekInfo)}`;
  }

  function buildPayrollWeekOptions(selectedWeekInfo = {}) {
    const year = Number(selectedWeekInfo.year) || getPayrollIsoWeekInfo(getPayrollTodayDateValue()).year;
    const weekCount = getPayrollIsoWeeksInYear(year);
    return Array.from({ length: weekCount }, (_, index) => getPayrollIsoWeekInfoFromYearWeek(year, index + 1));
  }

  function buildPayrollClientHistoryPath(reqUrl, weekKey) {
    const normalizedWeekKey = normalizePayrollWeekKey(weekKey);
    const params = new URLSearchParams(reqUrl.searchParams);
    params.delete("notice");
    if (normalizedWeekKey) {
      params.set(PAYROLL_CLIENT_WEEK_PARAM, normalizedWeekKey);
    } else {
      params.delete(PAYROLL_CLIENT_WEEK_PARAM);
    }
    const queryString = params.toString();
    return `${ADMIN_PAYROLL_PATH}${queryString ? `?${queryString}` : ""}#admin-payroll-client-history`;
  }

  function renderPayrollClientHistoryHiddenInputs(reqUrl) {
    const skippedNames = new Set([PAYROLL_CLIENT_WEEK_PARAM, "notice"]);
    return Array.from(reqUrl.searchParams.entries())
      .filter(([name]) => !skippedNames.has(name))
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(value)}">`
      )
      .join("");
  }

  function getPayrollOrderTotalCents(entry = {}) {
    const directCents = Number(entry && entry.totalPriceCents);
    if (Number.isFinite(directCents) && directCents > 0) {
      return Math.max(0, Math.round(directCents));
    }
    const numericValue = Number(entry && entry.totalPrice);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.max(0, Math.round(numericValue * 100));
    }
    const cleaned = normalizeString(entry && entry.totalPrice, 80)
      .replace(/,/g, ".")
      .replace(/[^0-9.]/g, "");
    const parsedValue = Number(cleaned);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return 0;
    return Math.max(0, Math.round(parsedValue * 100));
  }

  function getPayrollClientHistoryKey(entry = {}) {
    const emailKey = normalizeString(entry.customerEmail, 250).toLowerCase();
    if (emailKey) return `email:${emailKey}`;
    const phoneKey = normalizeString(entry.customerPhone, 80).replace(/\D/g, "");
    if (phoneKey) return `phone:${phoneKey}`;
    const nameKey = normalizeString(entry.customerName, 250).toLowerCase();
    const addressKey = normalizeString(entry.fullAddress, 500).toLowerCase();
    return `${nameKey || "client"}:${addressKey || normalizeString(entry.id, 120)}`;
  }

  function collectPayrollClientHistoryRows(orderItems = [], weekInfo = {}, orderRecordsById = new Map()) {
    const rowsByClient = new Map();
    const startDate = normalizeFilterDateValue(weekInfo.startDate);
    const endDate = normalizeFilterDateValue(weekInfo.endDate);
    if (!startDate || !endDate) return [];

    for (const orderItem of Array.isArray(orderItems) ? orderItems : []) {
      const entry = orderItem && orderItem.entry ? orderItem.entry : {};
      const scheduleDate = normalizeFilterDateValue(orderItem && orderItem.scheduleDate) || normalizeFilterDateValue(entry.selectedDate);
      if (!scheduleDate || scheduleDate < startDate || scheduleDate > endDate) continue;

      const orderRecord = orderRecordsById instanceof Map ? orderRecordsById.get(normalizeString(entry.id, 120)) : null;
      if (orderRecord && orderRecord.orderStatus === "canceled") continue;

      const clientKey = getPayrollClientHistoryKey(entry);
      const currentRow = rowsByClient.get(clientKey) || {
        clientName: normalizeString(entry.customerName, 250) || "Клиент",
        customerPhone: normalizeString(entry.customerPhone, 80),
        customerEmail: normalizeString(entry.customerEmail, 250),
        addresses: new Set(),
        cleanerNames: new Set(),
        services: new Set(),
        orderDates: new Set(),
        orderCount: 0,
        totalCents: 0,
        firstDate: scheduleDate,
      };

      const fullAddress = normalizeString(entry.fullAddress, 500);
      if (fullAddress) currentRow.addresses.add(fullAddress);
      const serviceLabel = formatAdminServiceLabel(entry.serviceName || entry.serviceType || (orderRecord && orderRecord.serviceType));
      if (serviceLabel) currentRow.services.add(serviceLabel);
      const scheduleLabel = [formatFilterDateLabel(scheduleDate), normalizeString(orderItem && orderItem.scheduleTime, 32)].filter(Boolean).join(" • ");
      if (scheduleLabel) currentRow.orderDates.add(scheduleLabel);
      currentRow.orderCount += 1;
      currentRow.totalCents += getPayrollOrderTotalCents(entry);
      if (scheduleDate < currentRow.firstDate) currentRow.firstDate = scheduleDate;

      const assignedStaff = Array.isArray(orderItem && orderItem.assignedStaff) ? orderItem.assignedStaff : [];
      for (const staffRecord of assignedStaff) {
        const staffName =
          normalizeString(staffRecord && staffRecord.name, 160) ||
          normalizeString(staffRecord && staffRecord.email, 250) ||
          normalizeString(staffRecord && staffRecord.id, 120);
        if (staffName) currentRow.cleanerNames.add(staffName);
      }
      if (currentRow.cleanerNames.size === 0 && orderRecord && orderRecord.assignedStaff) {
        currentRow.cleanerNames.add(orderRecord.assignedStaff);
      }

      rowsByClient.set(clientKey, currentRow);
    }

    return Array.from(rowsByClient.values())
      .map((row) => ({
        ...row,
        addresses: Array.from(row.addresses),
        cleanerNames: Array.from(row.cleanerNames),
        services: Array.from(row.services),
        orderDates: Array.from(row.orderDates),
      }))
      .sort((left, right) => {
        if (left.firstDate !== right.firstDate) return left.firstDate.localeCompare(right.firstDate);
        return normalizeString(left.clientName, 250).localeCompare(normalizeString(right.clientName, 250), "ru");
      });
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
    const appliedCompensationValue =
      normalizeString(row && row.appliedCompensationValue, 32) || compensationValue;
    const teamSize = Math.max(1, Number(row && row.teamSize) || 1);
    if (!compensationValue) return "Не указана";
    if (normalizeString(row && row.compensationType, 32).toLowerCase() === "percent") {
      if (teamSize > 1) {
        return `${escapeHtml(compensationValue)}% база<br><span class="admin-table-muted">${escapeHtml(
          appliedCompensationValue
        )}% на человека • команда ${escapeHtml(String(teamSize))}</span>`;
      }
      return `${escapeHtml(compensationValue)}% база<br><span class="admin-table-muted">Один сотрудник</span>`;
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

  function renderPayrollClientHistoryControls(reqUrl, selectedWeekInfo = {}) {
    const weekOptions = buildPayrollWeekOptions(selectedWeekInfo);
    const currentWeekInfo = getPayrollIsoWeekInfo(getPayrollTodayDateValue());
    const previousWeekInfo = getPayrollIsoWeekInfo(addPayrollDays(currentWeekInfo.startDate, -7));
    const twoWeeksAgoInfo = getPayrollIsoWeekInfo(addPayrollDays(currentWeekInfo.startDate, -14));
    const quickLinks = [
      { label: "Текущая", weekInfo: currentWeekInfo },
      { label: "Прошлая", weekInfo: previousWeekInfo },
      { label: "Позапрошлая", weekInfo: twoWeeksAgoInfo },
    ];

    return `<div class="admin-orders-toolbar-shell" style="grid-template-columns:minmax(0, 1fr);">
      <form class="admin-orders-filter-bar" method="get" action="${ADMIN_PAYROLL_PATH}">
        ${renderPayrollClientHistoryHiddenInputs(reqUrl)}
        <label class="admin-label">
          Неделя
          <select class="admin-input" name="${escapeHtmlAttribute(PAYROLL_CLIENT_WEEK_PARAM)}">
            ${weekOptions
              .map(
                (weekInfo) =>
                  `<option value="${escapeHtmlAttribute(weekInfo.key)}"${weekInfo.key === selectedWeekInfo.key ? " selected" : ""}>${escapeHtml(formatPayrollWeekLabel(weekInfo))}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="admin-clients-filter-actions">
          <button class="admin-button" type="submit">Показать</button>
        </div>
      </form>
      <div class="admin-inline-badge-row">
        ${quickLinks
          .map((item) => {
            const isActive = item.weekInfo.key === selectedWeekInfo.key;
            const className = isActive
              ? "admin-button admin-button-secondary"
              : "admin-link-button admin-button-secondary";
            return `<a class="${className}" href="${escapeHtmlAttribute(
              buildPayrollClientHistoryPath(reqUrl, item.weekInfo.key)
            )}">${escapeHtml(item.label)}</a>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  function renderPayrollClientHistoryTable(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<div class="admin-empty-state">За выбранную неделю клиентов пока нет.</div>`;
    }

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Даты и заказы</th>
            <th>Сумма клиента</th>
            <th>Клинеры</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const addresses = Array.isArray(row.addresses) ? row.addresses : [];
              const services = Array.isArray(row.services) ? row.services : [];
              const cleanerNames = Array.isArray(row.cleanerNames) && row.cleanerNames.length > 0
                ? row.cleanerNames
                : ["Не назначен"];
              const orderDates = Array.isArray(row.orderDates) ? row.orderDates : [];
              const contactItems = [row.customerPhone, row.customerEmail].filter(Boolean);
              return `<tr data-admin-payroll-client-history-row="true">
                <td>
                  <strong>${escapeHtml(row.clientName || "Клиент")}</strong>
                  ${contactItems.length
                    ? `<br><span class="admin-table-muted">${escapeHtml(contactItems.join(" • "))}</span>`
                    : ""}
                  ${addresses.length
                    ? `<br><span class="admin-table-muted admin-line-clamp-two">${escapeHtml(addresses.join(" • "))}</span>`
                    : ""}
                </td>
                <td>
                  <strong>${escapeHtml(String(Number(row.orderCount) || 0))} заказ(ов)</strong>
                  ${orderDates.length
                    ? `<br><span class="admin-table-muted">${escapeHtml(orderDates.join(" • "))}</span>`
                    : ""}
                  ${services.length
                    ? `<br><span class="admin-table-muted">${escapeHtml(services.join(" • "))}</span>`
                    : ""}
                </td>
                <td><strong>${escapeHtml(formatCurrencyAmount((Number(row.totalCents) || 0) / 100))}</strong></td>
                <td>
                  <div class="admin-inline-badge-row">
                    ${cleanerNames.map((name) => renderAdminBadge(name, "outline")).join("")}
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderPayrollClientHistorySection(reqUrl, selectedWeekInfo = {}, rows = []) {
    return `<div id="admin-payroll-client-history">
      ${renderPayrollClientHistoryControls(reqUrl, selectedWeekInfo)}
      <div class="admin-clients-meta-row">
        <div class="admin-clients-meta-main">
          <p class="admin-clients-summary-copy">
            ${escapeHtml(formatPayrollWeekLabel(selectedWeekInfo))}: ${escapeHtml(String(rows.length))} клиент(ов), ${escapeHtml(
              formatCurrencyAmount(rows.reduce((total, row) => total + (Number(row.totalCents) || 0), 0) / 100)
            )} общая сумма.
          </p>
        </div>
      </div>
      ${renderPayrollClientHistoryTable(rows)}
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
    const selectedClientWeekInfo = getPayrollWeekSelection(reqUrl);
    const clientHistoryRows = collectPayrollClientHistoryRows(
      planningContext && Array.isArray(planningContext.orderItems) ? planningContext.orderItems : [],
      selectedClientWeekInfo,
      orderRecordsById
    );
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
        ${renderAdminCard(
          "История клиентов",
          "Клиенты за выбранную неделю, сумма заказа и клинеры, которые были назначены на выезд.",
          renderPayrollClientHistorySection(reqUrl, selectedClientWeekInfo, clientHistoryRows),
          { eyebrow: "Недели" }
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
