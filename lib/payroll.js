"use strict";

const { getEntryOrderState } = require("./admin-order-state");

const PAYROLL_ELIGIBLE_STATUSES = new Set([
  "cleaning-complete",
  "invoice-sent",
  "paid",
  "awaiting-review",
  "completed",
]);

function normalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function cloneSerializable(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeCompensationType(value) {
  return normalizeString(value, 32).toLowerCase() === "percent" ? "percent" : "fixed";
}

function normalizePayrollStatus(value) {
  return normalizeString(value, 32).toLowerCase() === "paid" ? "paid" : "owed";
}

function normalizeCompensationValue(value) {
  const normalized = normalizeString(value, 32).replace(/,/g, ".");
  if (!normalized) return "";
  const cleaned = normalized.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [wholePart, ...fractionParts] = cleaned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionParts.join("").slice(0, 2);
  return fraction ? `${whole}.${fraction}` : whole;
}

function parseAmountCents(value) {
  const normalized = normalizeCompensationValue(value);
  if (!normalized) return 0;
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue * 100));
}

function getEntryOrderStatus(entry = {}) {
  const orderState = getEntryOrderState(entry);
  const compact = normalizeString(orderState && orderState.status, 40)
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (compact === "cleaningcomplete" || compact === "cleaning-completed") return "cleaning-complete";
  if (compact === "awaitingreview") return "awaiting-review";
  if (compact === "invoicesent") return "invoice-sent";
  if (compact === "cleaningstarted") return "cleaning-started";
  if (compact === "enroute") return "en-route";
  return compact || "new";
}

function isPayrollEligibleOrderStatus(value) {
  return PAYROLL_ELIGIBLE_STATUSES.has(getNormalizedOrderStatus(value));
}

function getNormalizedOrderStatus(value) {
  const compact = normalizeString(value, 40)
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (compact === "cleaningcomplete" || compact === "cleaning-completed") return "cleaning-complete";
  if (compact === "awaitingreview") return "awaiting-review";
  if (compact === "invoicesent") return "invoice-sent";
  if (compact === "cleaningstarted") return "cleaning-started";
  if (compact === "enroute") return "en-route";
  return compact;
}

function getEntryOrderTotalCents(entry = {}) {
  const directCents = Number(entry && entry.totalPriceCents);
  if (Number.isFinite(directCents) && directCents > 0) {
    return Math.max(0, Math.round(directCents));
  }
  return parseAmountCents(entry && entry.totalPrice);
}

function normalizePayrollItem(input = {}, index = 0) {
  const staffId = normalizeString(input.staffId, 120);
  const fallbackId = staffId || normalizeString(input.id, 160) || `payroll-item-${index + 1}`;
  const amountCents = Math.max(
    0,
    Number.isFinite(Number(input.amountCents)) ? Math.round(Number(input.amountCents)) : 0
  );
  return {
    id: normalizeString(input.id, 160) || fallbackId,
    staffId,
    staffName: normalizeString(input.staffName, 160) || "Сотрудник",
    compensationType: normalizeCompensationType(input.compensationType),
    compensationValue: normalizeCompensationValue(input.compensationValue),
    orderTotalCents: Math.max(
      0,
      Number.isFinite(Number(input.orderTotalCents)) ? Math.round(Number(input.orderTotalCents)) : 0
    ),
    amountCents,
    status: normalizePayrollStatus(input.status),
    paidAt: normalizeString(input.paidAt, 80),
    paidByName: normalizeString(input.paidByName, 160),
    paidByEmail: normalizeString(input.paidByEmail, 250).toLowerCase(),
    createdAt: normalizeString(input.createdAt, 80),
    updatedAt: normalizeString(input.updatedAt, 80),
  };
}

function normalizePayrollItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => normalizePayrollItem(item, index))
    .filter((item) => Boolean(item.staffId || item.staffName || item.amountCents));
}

function getEntryPayrollData(entry = {}) {
  const orderState = getEntryOrderState(entry);
  const payroll =
    orderState && orderState.payroll && typeof orderState.payroll === "object"
      ? cloneSerializable(orderState.payroll, {})
      : {};
  return {
    items: normalizePayrollItems(payroll.items),
    updatedAt: normalizeString(payroll.updatedAt, 80),
  };
}

function calculateStaffPayrollItem(entry = {}, staffRecord = {}) {
  const compensationType = normalizeCompensationType(staffRecord && staffRecord.compensationType);
  const compensationValue = normalizeCompensationValue(staffRecord && staffRecord.compensationValue);
  const compensationNumeric = Number(compensationValue || 0);
  const orderTotalCents = getEntryOrderTotalCents(entry);
  let amountCents = 0;

  if (Number.isFinite(compensationNumeric) && compensationNumeric > 0) {
    if (compensationType === "percent") {
      amountCents = Math.max(0, Math.round(orderTotalCents * (compensationNumeric / 100)));
    } else {
      amountCents = Math.max(0, Math.round(compensationNumeric * 100));
    }
  }

  return {
    id: normalizeString(staffRecord && staffRecord.id, 120) || normalizeString(staffRecord && staffRecord.email, 160),
    staffId: normalizeString(staffRecord && staffRecord.id, 120),
    staffName: normalizeString(staffRecord && staffRecord.name, 160) || "Сотрудник",
    compensationType,
    compensationValue,
    orderTotalCents,
    amountCents,
    status: "owed",
    paidAt: "",
    paidByName: "",
    paidByEmail: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildOrderPayrollSnapshot(options = {}) {
  const entry = options.entry || null;
  const assignment = options.assignment || null;
  const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
  const existingPayroll = options.existingPayroll || { items: [] };
  if (!entry || !assignment || !Array.isArray(assignment.staffIds) || assignment.staffIds.length === 0) {
    const existingItems = normalizePayrollItems(existingPayroll.items);
    return {
      items: existingItems,
      updatedAt: normalizeString(existingPayroll.updatedAt, 80) || new Date().toISOString(),
    };
  }

  const staffById = new Map(
    staffRecords
      .map((record) => [normalizeString(record && record.id, 120), record])
      .filter(([staffId]) => Boolean(staffId))
  );
  const existingByStaffId = new Map(
    normalizePayrollItems(existingPayroll.items)
      .map((item) => [normalizeString(item.staffId, 120), item])
      .filter(([staffId]) => Boolean(staffId))
  );
  const generatedItems = assignment.staffIds
    .map((staffId) => {
      const normalizedStaffId = normalizeString(staffId, 120);
      const staffRecord = staffById.get(normalizedStaffId);
      if (!staffRecord) return null;
      const nextItem = calculateStaffPayrollItem(entry, staffRecord);
      const existingItem = existingByStaffId.get(normalizedStaffId);
      if (!existingItem) return nextItem;
      if (existingItem.status === "paid") {
        return {
          ...nextItem,
          status: "paid",
          paidAt: existingItem.paidAt,
          paidByName: existingItem.paidByName,
          paidByEmail: existingItem.paidByEmail,
          createdAt: existingItem.createdAt || nextItem.createdAt,
          updatedAt: existingItem.updatedAt || nextItem.updatedAt,
          amountCents: existingItem.amountCents > 0 ? existingItem.amountCents : nextItem.amountCents,
          compensationType: existingItem.compensationType || nextItem.compensationType,
          compensationValue: existingItem.compensationValue || nextItem.compensationValue,
          orderTotalCents: existingItem.orderTotalCents > 0 ? existingItem.orderTotalCents : nextItem.orderTotalCents,
        };
      }
      return {
        ...nextItem,
        createdAt: existingItem.createdAt || nextItem.createdAt,
      };
    })
    .filter(Boolean);
  const generatedStaffIds = new Set(
    generatedItems.map((item) => normalizeString(item && item.staffId, 120)).filter(Boolean)
  );
  const preservedPaidItems = Array.from(existingByStaffId.values()).filter(
    (item) => item.status === "paid" && !generatedStaffIds.has(normalizeString(item.staffId, 120))
  );

  return {
    items: normalizePayrollItems([...generatedItems, ...preservedPaidItems]),
    updatedAt: new Date().toISOString(),
  };
}

function updatePayrollItemStatus(payroll = {}, staffId, status, meta = {}) {
  const normalizedStaffId = normalizeString(staffId, 120);
  const nextStatus = normalizePayrollStatus(status);
  const currentItems = normalizePayrollItems(payroll.items);
  if (!normalizedStaffId || currentItems.length === 0) {
    return {
      items: currentItems,
      updatedAt: new Date().toISOString(),
    };
  }

  const updatedAt = new Date().toISOString();
  return {
    items: currentItems.map((item) => {
      if (normalizeString(item.staffId, 120) !== normalizedStaffId) {
        return item;
      }
      return {
        ...item,
        status: nextStatus,
        paidAt: nextStatus === "paid" ? normalizeString(meta.paidAt, 80) || updatedAt : "",
        paidByName: nextStatus === "paid" ? normalizeString(meta.paidByName, 160) : "",
        paidByEmail: nextStatus === "paid" ? normalizeString(meta.paidByEmail, 250).toLowerCase() : "",
        updatedAt,
      };
    }),
    updatedAt,
  };
}

function collectPayrollRecords(options = {}) {
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const staffIdFilter = normalizeString(options.staffId, 120);
  const hiddenStaffIds = options.hiddenStaffIds instanceof Set ? options.hiddenStaffIds : new Set();
  const rows = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const orderStatus = getEntryOrderStatus(entry);
    if (!PAYROLL_ELIGIBLE_STATUSES.has(orderStatus)) continue;

    const payroll = getEntryPayrollData(entry);
    if (payroll.items.length === 0) continue;

    for (const item of payroll.items) {
      const rowStaffId = normalizeString(item.staffId, 120);
      if (rowStaffId && hiddenStaffIds.has(rowStaffId)) continue;
      if (staffIdFilter && rowStaffId !== staffIdFilter) continue;
      rows.push({
        id: `${normalizeString(entry.id, 120)}:${normalizeString(item.id, 160) || rowStaffId}`,
        entryId: normalizeString(entry.id, 120),
        requestId: normalizeString(entry.requestId, 120),
        customerName: normalizeString(entry.customerName || "Клиент", 250),
        customerPhone: normalizeString(entry.customerPhone, 80),
        customerEmail: normalizeString(entry.customerEmail, 250),
        fullAddress: normalizeString(entry.fullAddress, 500),
        serviceName: normalizeString(entry.serviceName || entry.serviceType, 120),
        selectedDate: normalizeString(entry.selectedDate, 32),
        selectedTime: normalizeString(entry.selectedTime, 32),
        orderStatus,
        createdAt: normalizeString(entry.createdAt, 80),
        payrollUpdatedAt: payroll.updatedAt,
        staffId: rowStaffId,
        staffName: normalizeString(item.staffName, 160) || "Сотрудник",
        compensationType: normalizeCompensationType(item.compensationType),
        compensationValue: normalizeCompensationValue(item.compensationValue),
        orderTotalCents: Math.max(0, Number(item.orderTotalCents) || 0),
        amountCents: Math.max(0, Number(item.amountCents) || 0),
        status: normalizePayrollStatus(item.status),
        paidAt: normalizeString(item.paidAt, 80),
        paidByName: normalizeString(item.paidByName, 160),
        paidByEmail: normalizeString(item.paidByEmail, 250).toLowerCase(),
      });
    }
  }

  rows.sort((left, right) => {
    const leftPaidAt = Date.parse(left.paidAt || left.selectedDate || left.createdAt || "");
    const rightPaidAt = Date.parse(right.paidAt || right.selectedDate || right.createdAt || "");
    return (Number.isFinite(rightPaidAt) ? rightPaidAt : 0) - (Number.isFinite(leftPaidAt) ? leftPaidAt : 0);
  });

  const summaryByStaff = new Map();
  let owedCents = 0;
  let paidCents = 0;

  for (const row of rows) {
    if (row.status === "paid") {
      paidCents += row.amountCents;
    } else {
      owedCents += row.amountCents;
    }

    const summary = summaryByStaff.get(row.staffId) || {
      staffId: row.staffId,
      staffName: row.staffName,
      owedCents: 0,
      paidCents: 0,
      totalCents: 0,
      rowsCount: 0,
    };
    summary.rowsCount += 1;
    summary.totalCents += row.amountCents;
    if (row.status === "paid") {
      summary.paidCents += row.amountCents;
    } else {
      summary.owedCents += row.amountCents;
    }
    summaryByStaff.set(row.staffId, summary);
  }

  const staffSummaries = Array.from(summaryByStaff.values()).sort((left, right) => {
    if (right.totalCents !== left.totalCents) return right.totalCents - left.totalCents;
    return left.staffName.localeCompare(right.staffName, "ru");
  });

  return {
    rows,
    staffSummaries,
    totals: {
      owedCents,
      paidCents,
      totalCents: owedCents + paidCents,
      rowsCount: rows.length,
      staffCount: staffSummaries.length,
      owedCount: rows.filter((row) => row.status === "owed").length,
      paidCount: rows.filter((row) => row.status === "paid").length,
    },
  };
}

async function syncOrderPayrollSnapshot(context = {}) {
  const quoteOpsLedger = context.quoteOpsLedger || null;
  const staffStore = context.staffStore || null;
  const baseEntry = context.entry || null;
  const entryId = normalizeString(context.entryId || (baseEntry && baseEntry.id), 120);
  if (
    !quoteOpsLedger ||
    typeof quoteOpsLedger.updateOrderEntry !== "function" ||
    !staffStore ||
    typeof staffStore.getSnapshot !== "function" ||
    !entryId
  ) {
    return baseEntry;
  }

  const entry =
    baseEntry ||
    (typeof quoteOpsLedger.getEntry === "function" ? await quoteOpsLedger.getEntry(entryId) : null);
  if (!entry || !isPayrollEligibleOrderStatus(getEntryOrderStatus(entry))) {
    return entry;
  }

  const staffSnapshot = await staffStore.getSnapshot();
  const assignments = Array.isArray(staffSnapshot && staffSnapshot.assignments) ? staffSnapshot.assignments : [];
  const assignment = assignments.find((record) => normalizeString(record && record.entryId, 120) === entryId) || null;
  const nextPayroll = buildOrderPayrollSnapshot({
    entry,
    assignment,
    staffRecords: Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [],
    existingPayroll: getEntryPayrollData(entry),
  });
  return quoteOpsLedger.updateOrderEntry(entryId, { payroll: nextPayroll });
}

async function syncStaffPayrollSnapshots(context = {}) {
  const quoteOpsLedger = context.quoteOpsLedger || null;
  const staffStore = context.staffStore || null;
  const staffId = normalizeString(context.staffId, 120);
  if (
    !quoteOpsLedger ||
    !staffStore ||
    !staffId ||
    typeof staffStore.getSnapshot !== "function" ||
    (typeof quoteOpsLedger.getEntry !== "function" && typeof quoteOpsLedger.listEntries !== "function")
  ) {
    return [];
  }

  const staffSnapshot = await staffStore.getSnapshot();
  const assignments = Array.isArray(staffSnapshot && staffSnapshot.assignments) ? staffSnapshot.assignments : [];
  const entryIds = Array.from(
    new Set(
      assignments
        .filter(
          (record) =>
            record &&
            Array.isArray(record.staffIds) &&
            record.staffIds.some((assignedStaffId) => normalizeString(assignedStaffId, 120) === staffId)
        )
        .map((record) => normalizeString(record && record.entryId, 120))
        .filter(Boolean)
    )
  );
  if (entryIds.length === 0) return [];

  let entriesById = new Map();
  if (typeof quoteOpsLedger.getEntry === "function") {
    const entries = await Promise.all(entryIds.map((entryId) => quoteOpsLedger.getEntry(entryId)));
    entriesById = new Map(
      entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => [normalizeString(entry.id, 120), entry])
        .filter(([entryId]) => Boolean(entryId))
    );
  } else if (typeof quoteOpsLedger.listEntries === "function") {
    const entryIdSet = new Set(entryIds);
    const entries = await quoteOpsLedger.listEntries({ limit: Math.max(entryIdSet.size * 4, 250) });
    entriesById = new Map(
      (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entryIdSet.has(normalizeString(entry.id, 120)))
        .map((entry) => [normalizeString(entry.id, 120), entry])
        .filter(([entryId]) => Boolean(entryId))
    );
  }

  const syncedEntries = [];
  for (const entryId of entryIds) {
    const entry = entriesById.get(entryId) || null;
    if (!entry) continue;
    const syncedEntry = await syncOrderPayrollSnapshot({
      quoteOpsLedger,
      staffStore,
      entry,
      entryId,
    });
    if (syncedEntry) syncedEntries.push(syncedEntry);
  }
  return syncedEntries;
}

module.exports = {
  PAYROLL_ELIGIBLE_STATUSES,
  buildOrderPayrollSnapshot,
  cloneSerializable,
  collectPayrollRecords,
  getEntryOrderStatus,
  getEntryPayrollData,
  getNormalizedOrderStatus,
  isPayrollEligibleOrderStatus,
  normalizeCompensationType,
  normalizeCompensationValue,
  normalizePayrollItems,
  normalizePayrollStatus,
  parseAmountCents,
  syncStaffPayrollSnapshots,
  syncOrderPayrollSnapshot,
  updatePayrollItemStatus,
};
